// ================================================
// Support Tickets Model
// Database operations for support_tickets table
// ================================================

const db = require('../index');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Store uploads outside the project tree to avoid triggering frontend dev server reloads
const uploadsDir = path.join(os.tmpdir(), 'autoparts_uploads');
try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  // ignore
}

class SupportTicketsModel {
  // ==================== CREATE ====================
  
  async create(ticketData) {
    const {
      ticket_number, user_id, order_id, customer_name, customer_email,
      issue_type, subject, description, status, priority,
      ai_recommendation, ai_analysis, ai_confidence
    } = ticketData;
    
    const query = `
      INSERT INTO support_tickets (
        ticket_number, user_id, order_id, customer_name, customer_email,
        issue_type, subject, description, status, priority,
        ai_recommendation, ai_analysis, ai_confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      ticket_number,
      user_id || null,
      order_id || null,
      customer_name,
      customer_email,
      issue_type,
      subject || null,
      description,
      status || 'open',
      priority || 'medium',
      ai_recommendation || null,
      ai_analysis ? JSON.stringify(ai_analysis) : null,
      ai_confidence || null
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  // ==================== READ ====================
  
  async findById(id) {
    const query = `
      SELECT 
        st.*,
        json_agg(
          json_build_object(
            'id', tm.id,
            'sender_name', tm.sender_name,
            'sender_type', tm.sender_type,
            'message', tm.message,
            'created_at', tm.created_at
          ) ORDER BY tm.created_at ASC
        ) FILTER (WHERE tm.id IS NOT NULL) as messages,
        (
          SELECT json_agg(
            json_build_object(
              'id', ta.id,
              'file_name', ta.file_name,
              'file_path', ta.file_path,
              'file_type', ta.file_type,
              'created_at', ta.created_at
            )
          )
          FROM ticket_attachments ta
          WHERE ta.ticket_id = st.id
        ) as attachments
      FROM support_tickets st
      LEFT JOIN ticket_messages tm ON st.id = tm.ticket_id
      WHERE st.id = $1
      GROUP BY st.id
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  async findByTicketNumber(ticketNumber) {
    const query = `
      SELECT 
        st.*,
        json_agg(
          json_build_object(
            'id', tm.id,
            'sender_name', tm.sender_name,
            'sender_type', tm.sender_type,
            'message', tm.message,
            'created_at', tm.created_at
          ) ORDER BY tm.created_at ASC
        ) FILTER (WHERE tm.id IS NOT NULL) as messages
      FROM support_tickets st
      LEFT JOIN ticket_messages tm ON st.id = tm.ticket_id
      WHERE st.ticket_number = $1
      GROUP BY st.id
    `;
    
    const result = await db.query(query, [ticketNumber]);
    return result.rows[0];
  }
  
  async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM support_tickets 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }
  
  async findByEmail(email, limit = 50) {
    const query = `
      SELECT * FROM support_tickets 
      WHERE customer_email = $1 
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [email, limit]);
    return result.rows;
  }
  
  async findByOrderId(orderId) {
    const query = `
      SELECT * FROM support_tickets 
      WHERE order_id = $1 
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query, [orderId]);
    return result.rows;
  }
  
  async findAll(options = {}) {
    const {
      status,
      issue_type,
      priority,
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'DESC'
    } = options;
    
    let query = 'SELECT * FROM support_tickets WHERE 1=1';
    const values = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(status);
    }
    
    if (issue_type) {
      paramCount++;
      query += ` AND issue_type = $${paramCount}`;
      values.push(issue_type);
    }
    
    if (priority) {
      paramCount++;
      query += ` AND priority = $${paramCount}`;
      values.push(priority);
    }
    
    query += ` ORDER BY ${orderBy} ${orderDir}`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);
    
    const result = await db.query(query, values);
    return result.rows;
  }
  
  async getOpenTickets(limit = 50) {
    const query = `
      SELECT * FROM support_tickets 
      WHERE status IN ('open', 'in_progress') 
      ORDER BY priority DESC, created_at ASC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  }
  
  // ==================== UPDATE ====================
  
  async updateStatus(id, status) {
    const query = `
      UPDATE support_tickets 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [status, id]);
    return result.rows[0];
  }
  
  async updatePriority(id, priority) {
    const query = `
      UPDATE support_tickets 
      SET priority = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [priority, id]);
    return result.rows[0];
  }
  
  async resolve(id, resolution, resolvedBy) {
    const query = `
      UPDATE support_tickets 
      SET status = 'resolved', 
          resolution = $1, 
          resolved_by = $2,
          resolved_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [resolution, resolvedBy, id]);
    return result.rows[0];
  }
  
  async escalate(id, escalatedTo, reason) {
    const query = `
      UPDATE support_tickets 
      SET status = 'escalated',
          escalated_to = $1,
          escalation_reason = $2,
          escalated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [escalatedTo, reason, id]);
    return result.rows[0];
  }
  
  async close(id) {
    const query = `
      UPDATE support_tickets 
      SET status = 'closed',
          closed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  // ==================== MESSAGES ====================
  
  async addMessage(ticketId, messageData) {
    const {
      user_id, sender_name, sender_email, sender_type, message, is_internal
    } = messageData;
    
    const query = `
      INSERT INTO ticket_messages (
        ticket_id, user_id, sender_name, sender_email, sender_type, message, is_internal
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      ticketId,
      user_id || null,
      sender_name,
      sender_email || null,
      sender_type,
      message,
      is_internal || false
    ];
    
    const result = await db.query(query, values);
    
    // Update ticket's updated_at
    await db.query('UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [ticketId]);
    
    return result.rows[0];
  }
  
  async getMessages(ticketId) {
    const query = `
      SELECT * FROM ticket_messages 
      WHERE ticket_id = $1 
      ORDER BY created_at ASC
    `;
    
    const result = await db.query(query, [ticketId]);
    return result.rows;
  }
  
  // ==================== ATTACHMENTS ====================
  
  async addAttachment(ticketId, attachmentData) {
    const {
      file_name, file_path, file_type, file_size, mime_type, uploaded_by
    } = attachmentData;
    let storedFilePath = file_path;

    // If the file_path contains a long base64 data URL, persist the binary to disk and store a short path
    if (storedFilePath && typeof storedFilePath === 'string' && storedFilePath.startsWith('data:')) {
      try {
        // data:[<mediatype>][;base64],<data>
        const commaIndex = storedFilePath.indexOf(',');
        const meta = storedFilePath.substring(5, commaIndex); // after 'data:'
        const base64Data = storedFilePath.substring(commaIndex + 1);
        const buffer = Buffer.from(base64Data, 'base64');

        // Safely derive extension from mime_type if available, else fallback to jpg
        let ext = 'jpg';
        if (mime_type) {
          const mimeParts = mime_type.split('/');
          if (mimeParts[1]) ext = mimeParts[1];
        } else if (meta && meta.includes('/')) {
          const m = meta.split(';')[0];
          const mp = m.split('/');
          if (mp[1]) ext = mp[1];
        }

        const safeName = (file_name || `attachment.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filename = `${Date.now()}_${safeName}`;
  const absPath = path.join(uploadsDir, filename);
  fs.writeFileSync(absPath, buffer);

  // store a relative path that the server will expose via /uploads/<file>
  storedFilePath = `/uploads/${filename}`;
      } catch (err) {
        console.error('Failed to persist attachment to disk:', err);
        // fallback: truncate to null so DB insert won't fail
        storedFilePath = null;
      }
    }

    const query = `
      INSERT INTO ticket_attachments (
        ticket_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      ticketId,
      file_name,
      storedFilePath,
      file_type || null,
      file_size || null,
      mime_type || null,
      uploaded_by || null
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  async getAttachments(ticketId) {
    const query = `
      SELECT * FROM ticket_attachments 
      WHERE ticket_id = $1 
      ORDER BY created_at ASC
    `;
    
    const result = await db.query(query, [ticketId]);
    return result.rows;
  }
  
  // ==================== ANALYTICS ====================
  
  async getTicketStats() {
    const query = `
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_tickets,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_tickets,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_tickets,
        COUNT(*) FILTER (WHERE status = 'escalated') as escalated_tickets,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) 
          FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time_hours
      FROM support_tickets
    `;
    
    const result = await db.query(query);
    return result.rows[0];
  }
  
  async getTicketsByIssueType() {
    const query = `
      SELECT 
        issue_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) 
          FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time_hours
      FROM support_tickets 
      GROUP BY issue_type
      ORDER BY count DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  async getAIRecommendationStats() {
    const query = `
      SELECT 
        ai_recommendation,
        COUNT(*) as count,
        AVG(ai_confidence) as avg_confidence,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count
      FROM support_tickets 
      WHERE ai_recommendation IS NOT NULL
      GROUP BY ai_recommendation
      ORDER BY count DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = new SupportTicketsModel();