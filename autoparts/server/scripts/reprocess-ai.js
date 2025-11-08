#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import OpenAI from 'openai';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'autosmart_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 5,
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`Query executed in ${duration}ms`);
  return res;
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeImageWithAI(imageBase64, issueType, orderDetails) {
  try {
    // Build system prompt asking the AI to analyze image + description + order information
    let systemPrompt = `You are an AI agent for an e-commerce support system. Analyze the provided image together with the customer's textual description and the order contents (if provided). Return ONLY valid JSON containing at minimum: recommendedAction (REFUND/REPLACE/ESCALATE/DECLINE), confidence (0-100), reasoning, description (what you see), severity (where applicable), order_match (boolean), and order_discrepancy_reason (optional).
`;

    const orderSummary = orderDetails && orderDetails.order ? (
      `OrderNumber: ${orderDetails.order.order_number || ''}\nItems: ${((orderDetails.order.items || []).map(i => i.product_name || i.name).join(', ') || 'N/A')}`
    ) : `OrderId: ${orderDetails && orderDetails.orderId ? orderDetails.orderId : 'N/A'}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: 'text', text: `Order details:\n${orderSummary}\n\nCustomer description: ${orderDetails && orderDetails.description ? orderDetails.description : ''}\n\nIssue Type: ${issueType}` },
          { type: 'image_url', image_url: { url: imageBase64 } }
        ] }
      ],
      max_tokens: 1000
    });
    // Guard: AI may return wrapped code fences or extra text. Extract JSON object from content.
    const raw = response?.choices?.[0]?.message?.content || response?.choices?.[0]?.text || '';
    let cleaned = String(raw).trim();
    // remove triple backticks and language markers
    cleaned = cleaned.replace(/```\w*\n?/g, '').replace(/```$/g, '').trim();

    // try to extract a JSON object substring
    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    const jsonText = jsonMatch ? jsonMatch[1] : cleaned;

    try {
      const analysis = JSON.parse(jsonText);
      return analysis;
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON. Raw response:', cleaned);
      throw parseErr;
    }
  } catch (err) {
    console.error('AI analysis error:', err.message || err);
    throw err;
  }
}

function parseArgs() {
  const raw = process.argv.slice(2);
  const out = { dryRun: true, limit: 20, ticketIds: null };
  for (const a of raw) {
    if (a === '--no-dry-run' || a === '--run') out.dryRun = false;
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.split('=')[1], 10) || out.limit;
    else if (a.startsWith('--ticket-ids=')) {
      out.ticketIds = a.split('=')[1].split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: node reprocess-ai.js [--no-dry-run|--run] [--limit=10] [--ticket-ids=1,2,3]');
      process.exit(0);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  console.log('Starting reprocess-ai with', args);

  const uploadsDir = path.join(os.tmpdir(), 'autoparts_uploads');

  let queryText = `
    SELECT st.*, ta.file_path, ta.file_name, ta.mime_type
    FROM support_tickets st
    JOIN ticket_attachments ta ON ta.ticket_id = st.id
    WHERE st.ai_analysis IS NULL AND ta.file_path IS NOT NULL
    ORDER BY st.created_at DESC
    LIMIT $1
  `;
  let params = [args.limit || 20];

  if (Array.isArray(args.ticketIds) && args.ticketIds.length > 0) {
    queryText = `
      SELECT st.*, ta.file_path, ta.file_name, ta.mime_type
      FROM support_tickets st
      JOIN ticket_attachments ta ON ta.ticket_id = st.id
      WHERE st.id = ANY($1::int[])
      ORDER BY st.created_at DESC
      LIMIT $2
    `;
    params = [args.ticketIds, args.limit || 20];
  }

  const res = await query(queryText, params);
  const rows = res.rows;
  console.log(`Found ${rows.length} candidate attachments to process`);

  const results = [];

  for (const row of rows) {
    const ticketId = row.id;
    const filePath = row.file_path;
    const mimeType = row.mime_type || 'image/jpeg';
    let dataUri = null;

    try {
      if (!filePath) {
        results.push({ ticketId, ok: false, reason: 'no_attachment' });
        continue;
      }

      if (filePath.startsWith('data:')) {
        dataUri = filePath;
      } else if (filePath.startsWith('/uploads/')) {
        const fname = path.basename(filePath);
        const abs = path.join(uploadsDir, fname);
        if (!fs.existsSync(abs)) {
          results.push({ ticketId, ok: false, reason: 'file_not_found', file: abs });
          continue;
        }
        const buffer = fs.readFileSync(abs);
        dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
      } else if (/^https?:\/\//.test(filePath)) {
        // attempt to download
        if (typeof fetch !== 'function') {
          results.push({ ticketId, ok: false, reason: 'no_fetch_available' });
          continue;
        }
        try {
          const resp = await fetch(filePath);
          if (!resp.ok) throw new Error(`download failed ${resp.status}`);
          const arrayBuffer = await resp.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const mt = resp.headers.get('content-type') || mimeType;
          dataUri = `data:${mt};base64,${buffer.toString('base64')}`;
        } catch (err) {
          console.error('Failed to download', filePath, err.message || err);
          results.push({ ticketId, ok: false, reason: 'download_failed', error: err.message });
          continue;
        }
      } else {
        results.push({ ticketId, ok: false, reason: 'unsupported_path', path: filePath });
        continue;
      }
    } catch (err) {
      console.error('prepare data uri err', err);
      results.push({ ticketId, ok: false, reason: 'prepare_failed', error: err.message || String(err) });
      continue;
    }

    if (args.dryRun) {
      console.log(`[dry-run] ticket ${ticketId} -> ${filePath}`);
      results.push({ ticketId, ok: true, dryRun: true, filePath });
      continue;
    }

    try {
      // fetch order details when available so analysis can compare description vs order
      let orderObj = null;
      if (row.order_id) {
        try {
          const o = await query('SELECT * FROM orders WHERE id = $1', [row.order_id]);
          orderObj = o && o.rows && o.rows[0] ? o.rows[0] : null;
          if (orderObj) {
            const itemsRes = await query('SELECT product_name FROM order_items WHERE order_id = $1', [row.order_id]);
            orderObj.items = itemsRes.rows || [];
          }
        } catch (err) {
          console.warn('Failed to load order for ticket', ticketId, err.message || err);
          orderObj = null;
        }
      }

      const analysis = await analyzeImageWithAI(dataUri, row.issue_type || 'defect', { order: orderObj, orderId: row.order_id, customerName: row.customer_name, description: row.description });

      // Sanitize ai_recommendation and ai_confidence to avoid DB type errors
      const aiAnalysisStr = analysis ? JSON.stringify(analysis) : null;
      let aiRec = null;
      let aiConf = null;
      if (analysis) {
        const rawRec = analysis.recommendedAction || analysis.recommended_action || analysis.recommendation || null;
        if (rawRec) {
          aiRec = String(rawRec).trim();
          const match = aiRec.match(/\b(REFUND|REPLACE|ESCALATE|DECLINE)\b/i);
          if (match) aiRec = match[1].toUpperCase();
          if (aiRec.length > 50) aiRec = aiRec.slice(0, 50);
        }

        const rawConf = analysis.confidence ?? analysis.confidence_score ?? analysis.confidencePercent ?? null;
        if (rawConf != null) {
          if (typeof rawConf === 'number') aiConf = rawConf;
          else {
            let s = String(rawConf).trim();
            if (s.endsWith('%')) s = s.slice(0, -1);
            const n = parseFloat(s);
            if (!Number.isNaN(n)) aiConf = n;
            else {
              const sev = s.toLowerCase();
              if (sev === 'high') aiConf = 90;
              else if (sev === 'medium' || sev === 'moderate') aiConf = 60;
              else if (sev === 'low' || sev === 'minor') aiConf = 30;
              else aiConf = null;
            }
          }
        }
      }

      const updateText = `UPDATE support_tickets SET ai_analysis = $1, ai_recommendation = $2, ai_confidence = $3 WHERE id = $4 RETURNING *`;
      const updateVals = [aiAnalysisStr, aiRec, aiConf, ticketId];
      const updated = await query(updateText, updateVals);

      // insert ai_interactions
      try {
        await query(`INSERT INTO ai_interactions (agent_type, user_query, ai_response, ticket_id, order_id, confidence_score) VALUES ($1,$2,$3,$4,$5,$6)`, [
          'reprocess_ai', `Reprocessed ticket ${ticketId}`, aiAnalysisStr, ticketId, row.order_id, aiConf
        ]);
      } catch (e) {
        console.warn('Failed to insert ai_interaction', e.message || e);
      }

      console.log(`Updated ticket ${ticketId} with AI analysis`);
      results.push({ ticketId, ok: true, updated: updated.rows[0] });
    } catch (err) {
      console.error('AI analysis failed for ticket', ticketId, err.message || err);
      results.push({ ticketId, ok: false, reason: 'ai_failed', error: err.message || String(err) });
    }
  }

  console.log('Finished. Summary:');
  const okCount = results.filter(r => r.ok).length;
  console.log(`Total: ${results.length}, OK: ${okCount}, Failed: ${results.length - okCount}`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal error', err);
  process.exit(1);
});
