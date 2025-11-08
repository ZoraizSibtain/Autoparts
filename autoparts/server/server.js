import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from "multer";
import fs from 'fs';
import path from 'path';
import os from 'os';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

// ==================== DATABASE SETUP ====================

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'autosmart_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Database query helper
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
};

// JWT helpers
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
function generateToken(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function authenticate(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return next();
  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // load fresh user from DB
    const r = await query('SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1', [decoded.id]);
    if (r && r.rows && r.rows[0]) {
      req.user = r.rows[0];
    }
  } catch (err) {
    // invalid token - ignore and continue as unauthenticated
    console.warn('Invalid auth token:', err.message || err);
  }
  return next();
}

// Storage helper: uploads to S3 if configured, otherwise stores to local temp directory
async function saveBufferToStorage(buffer, safeName, mimeType) {
  const filename = `${Date.now()}_${safeName}`;

  if (process.env.USE_S3 === '1') {
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const region = process.env.S3_REGION || 'us-east-1';
      const bucket = process.env.S3_BUCKET;
      if (!bucket) throw new Error('S3_BUCKET not set');

      const client = new S3Client({ region });
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream'
      }));

      // Return public URL (assumes public bucket)
      return `https://${bucket}.s3.${region}.amazonaws.com/${filename}`;
    } catch (err) {
      console.error('S3 upload failed, falling back to local disk:', err);
      // fall through to local storage
    }
  }

  // Local storage in temp dir
  const uploadsDir = path.join(os.tmpdir(), 'autoparts_uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const absPath = path.join(uploadsDir, filename);
  fs.writeFileSync(absPath, buffer);
  return `/uploads/${filename}`;
}

// Database health check
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

// ==================== PRODUCTS MODEL ====================

const ProductsModel = {
  async findAll(options = {}) {
    const { category, isActive = true, limit = 100, offset = 0 } = options;
    
    let queryText = 'SELECT * FROM products WHERE deleted_at IS NULL';
    const values = [];
    let paramCount = 0;
    
    if (category) {
      paramCount++;
      queryText += ` AND category = $${paramCount}`;
      values.push(category);
    }
    
    if (isActive !== undefined) {
      paramCount++;
      queryText += ` AND is_active = $${paramCount}`;
      values.push(isActive);
    }
    
    queryText += ` ORDER BY name ASC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);
    
    const result = await query(queryText, values);
    return result.rows;
  },

  async findById(id) {
    const result = await query('SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL', [id]);
    return result.rows[0];
  },

  async findByCategory(category, limit = 100) {
    const result = await query(
      'SELECT * FROM products WHERE category = $1 AND is_active = true AND deleted_at IS NULL ORDER BY name ASC LIMIT $2',
      [category, limit]
    );
    return result.rows;
  },

  async search(searchTerm, limit = 20) {
    const result = await query(
      `SELECT * FROM products 
       WHERE (name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1 OR sku ILIKE $1)
       AND is_active = true AND deleted_at IS NULL
       ORDER BY name ASC LIMIT $2`,
      [`%${searchTerm}%`, limit]
    );
    return result.rows;
  },

  async getCategories() {
    const result = await query(
      'SELECT DISTINCT category FROM products WHERE is_active = true AND deleted_at IS NULL ORDER BY category ASC'
    );
    return result.rows.map(row => row.category);
  }
};

// ==================== ORDERS MODEL ====================

const OrdersModel = {
  async findById(id) {
    console.log('Finding order with ID:', id);
    const result = await query('SELECT * FROM orders WHERE id = $1', [parseInt(id, 10)]);
    return result.rows[0];
  },

  async create(orderData, items) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Insert order
      const orderQuery = `
        INSERT INTO orders (
          order_number, user_id, customer_email, customer_name, customer_phone,
          subtotal, tax_amount, shipping_cost, discount_amount, total_amount,
          shipping_address_line1, shipping_address_line2, shipping_city,
          shipping_state, shipping_zip, shipping_country,
          payment_method, payment_status, last_4_digits, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `;
      
      const orderValues = [
        orderData.order_number,
        orderData.user_id || null,
        orderData.customer_email,
        orderData.customer_name,
        orderData.customer_phone || null,
        orderData.subtotal,
        orderData.tax_amount || 0,
        orderData.shipping_cost || 0,
        orderData.discount_amount || 0,
        orderData.total_amount,
        orderData.shipping_address_line1,
        orderData.shipping_address_line2 || null,
        orderData.shipping_city,
        orderData.shipping_state,
        orderData.shipping_zip,
        orderData.shipping_country || 'USA',
        orderData.payment_method || 'credit_card',
        orderData.payment_status || 'completed',
        orderData.last_4_digits || null,
        orderData.status || 'pending'
      ];
      
      const orderResult = await client.query(orderQuery, orderValues);
      const order = orderResult.rows[0];
      
      // Insert order items
      const itemsQuery = `
        INSERT INTO order_items (
          order_id, product_id, product_name, product_sku, product_image_url,
          unit_price, quantity, subtotal, discount_amount, total
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      
      const orderItems = [];
      for (const item of items) {
        const itemValues = [
          order.id,
          item.product_id || item.id,
          item.product_name || item.name,
          item.product_sku || item.sku,
          item.product_image_url || item.image_url || item.image,
          item.unit_price || item.price,
          item.quantity,
          item.subtotal || (item.price * item.quantity),
          item.discount_amount || 0,
          item.total || (item.price * item.quantity)
        ];
        
        const itemResult = await client.query(itemsQuery, itemValues);
        orderItems.push(itemResult.rows[0]);
      }
      
      await client.query('COMMIT');
      
      return {
        ...order,
        items: orderItems
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findByOrderNumber(orderNumber) {
    const result = await query(
      `SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_sku', oi.product_sku,
            'product_image_url', oi.product_image_url,
            'unit_price', oi.unit_price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal,
            'total', oi.total
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.order_number = $1
       GROUP BY o.id`,
      [orderNumber]
    );
    return result.rows[0];
  },

  async findByUserId(userId, limit = 100, offset = 0) {
    const result = await query(
      `SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_sku', oi.product_sku,
            'product_image_url', oi.product_image_url,
            'unit_price', oi.unit_price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal,
            'total', oi.total
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.user_id = $1
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  },

  async findAll(options = {}) {
    const { status, limit = 100, offset = 0 } = options;
    
    let queryText = 'SELECT * FROM orders WHERE 1=1';
    const values = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      queryText += ` AND status = $${paramCount}`;
      values.push(status);
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);
    
    const result = await query(queryText, values);
    return result.rows;
  }
};

// ==================== SUPPORT TICKETS MODEL ====================

const SupportTicketsModel = {
  async create(ticketData) {
    const queryText = `
      INSERT INTO support_tickets (
        ticket_number, user_id, order_id, customer_name, customer_email,
        issue_type, subject, description, status, priority,
        ai_recommendation, ai_analysis, ai_confidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      ticketData.ticket_number,
      ticketData.user_id || null,
      ticketData.order_id || null,
      ticketData.customer_name,
      ticketData.customer_email,
      ticketData.issue_type,
      ticketData.subject || null,
      ticketData.description,
      ticketData.status || 'open',
      ticketData.priority || 'medium',
      ticketData.ai_recommendation || null,
      ticketData.ai_analysis ? JSON.stringify(ticketData.ai_analysis) : null,
      ticketData.ai_confidence || null
    ];
    
    const result = await query(queryText, values);
    return result.rows[0];
  },

  async addAttachment(ticketId, attachmentData) {
    // Persist base64 data URIs to disk to avoid exceeding VARCHAR(500) limits
    let storedFilePath = attachmentData.file_path;

    try {
  // store uploads outside the project tree to avoid triggering frontend dev server reloads
  const uploadsDir = path.join(os.tmpdir(), 'autoparts_uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });

      if (storedFilePath && typeof storedFilePath === 'string' && storedFilePath.startsWith('data:')) {
        const commaIndex = storedFilePath.indexOf(',');
        const meta = storedFilePath.substring(5, commaIndex);
        const base64Data = storedFilePath.substring(commaIndex + 1);
        const buffer = Buffer.from(base64Data, 'base64');

        let ext = 'jpg';
        if (attachmentData.mime_type) {
          const mimeParts = attachmentData.mime_type.split('/');
          if (mimeParts[1]) ext = mimeParts[1];
        } else if (meta && meta.includes('/')) {
          const m = meta.split(';')[0];
          const mp = m.split('/');
          if (mp[1]) ext = mp[1];
        }

        const safeName = (attachmentData.file_name || `attachment.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        try {
          const storedPath = await saveBufferToStorage(buffer, safeName, attachmentData.mime_type);
          storedFilePath = storedPath;
        } catch (err) {
          console.error('Failed to save attachment to storage:', err);
          storedFilePath = null;
        }
      }
    } catch (err) {
      console.error('Failed to persist attachment to disk:', err);
      // fallback to keep original path (may still fail) or null
      if (storedFilePath && storedFilePath.length > 500) storedFilePath = null;
    }

    const queryText = `
      INSERT INTO ticket_attachments (
        ticket_id, file_name, file_path, file_type, file_size, mime_type, uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      ticketId,
      attachmentData.file_name,
      storedFilePath,
      attachmentData.file_type || null,
      attachmentData.file_size || null,
      attachmentData.mime_type || null,
      attachmentData.uploaded_by || null
    ];

    const result = await query(queryText, values);
    return result.rows[0];
  },

  async getAttachments(ticketId) {
    const result = await query(
      'SELECT * FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC',
      [ticketId]
    );
    return result.rows;
  },

  async addMessage(ticketId, messageData) {
    const queryText = `
      INSERT INTO ticket_messages (
        ticket_id, user_id, sender_name, sender_email, sender_type, message, is_internal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `;
    const values = [
      ticketId,
      messageData.user_id || null,
      messageData.sender_name || null,
      messageData.sender_email || null,
      messageData.sender_type || 'customer',
      messageData.message || '',
      messageData.is_internal ? true : false
    ];
    const result = await query(queryText, values);
    return result.rows[0];
  },

  async findByUserId(userId, limit = 100, offset = 0) {
    const result = await query(
      'SELECT * FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset]
    );
    return result.rows;
  },

  async findByTicketNumber(ticketNumber) {
    const result = await query(
      'SELECT * FROM support_tickets WHERE ticket_number = $1',
      [ticketNumber]
    );
    return result.rows[0];
  },

  async findAll(options = {}) {
    const { status, issue_type, limit = 100, offset = 0 } = options;
    
    let queryText = 'SELECT * FROM support_tickets WHERE 1=1';
    const values = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      queryText += ` AND status = $${paramCount}`;
      values.push(status);
    }
    
    if (issue_type) {
      paramCount++;
      queryText += ` AND issue_type = $${paramCount}`;
      values.push(issue_type);
    }
    
    queryText += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);
    
    const result = await query(queryText, values);
    return result.rows;
  },

  async getTicketStats() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(*) FILTER (WHERE status = 'open') as open_tickets,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_tickets,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) 
          FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_time_hours
      FROM support_tickets
    `);
    return result.rows[0];
  },

  async getAIRecommendationStats() {
    const result = await query(`
      SELECT 
        ai_recommendation,
        COUNT(*) as count,
        AVG(ai_confidence) as avg_confidence
      FROM support_tickets 
      WHERE ai_recommendation IS NOT NULL
      GROUP BY ai_recommendation
    `);
    return result.rows;
  }
};

// ==================== AI INTERACTIONS MODEL ====================

const AIInteractionsModel = {
  async create(interactionData) {
    const queryText = `
      INSERT INTO ai_interactions (
        session_id, user_id, agent_type, user_query, ai_response,
        product_ids, order_id, ticket_id, response_time_ms,
        confidence_score, resulted_in_purchase
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      interactionData.session_id || null,
      interactionData.user_id || null,
      interactionData.agent_type,
      interactionData.user_query,
      interactionData.ai_response,
      interactionData.product_ids || null,
      interactionData.order_id || null,
      interactionData.ticket_id || null,
      interactionData.response_time_ms || null,
      interactionData.confidence_score || null,
      interactionData.resulted_in_purchase || false
    ];
    
    const result = await query(queryText, values);
    return result.rows[0];
  },

  async getAgentStats() {
    const result = await query(`
      SELECT 
        agent_type,
        COUNT(*) as total_interactions,
        AVG(response_time_ms) as avg_response_time_ms,
        COUNT(*) FILTER (WHERE resulted_in_purchase = true) as purchases
      FROM ai_interactions 
      GROUP BY agent_type
    `);
    return result.rows;
  },

  async getConversionRate() {
    const result = await query(`
      SELECT 
        COUNT(*) as total_interactions,
        COUNT(*) FILTER (WHERE resulted_in_purchase = true) as purchases,
        ROUND(
          (COUNT(*) FILTER (WHERE resulted_in_purchase = true)::DECIMAL / 
           NULLIF(COUNT(*), 0) * 100), 2
        ) as conversion_rate_percent
      FROM ai_interactions 
      WHERE agent_type = 'product_recommendation'
    `);
    return result.rows[0];
  },

  async getRecent(limit = 100) {
    const result = await query(
      'SELECT * FROM ai_interactions ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }
};

// ==================== EXPRESS APP ====================

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Attach authentication (if provided) to incoming requests
app.use(authenticate);

// Serve uploaded files from the temp uploads directory
const uploadsStaticDir = path.join(os.tmpdir(), 'autoparts_uploads');
app.use('/uploads', express.static(uploadsStaticDir));

// One-time migration: convert existing ticket_attachments.file_path data URIs into files
async function migrateDataUriAttachments() {
  try {
    console.log('Checking for legacy data-URI attachments to migrate...');
    const res = await query("SELECT id, file_path, file_name, mime_type FROM ticket_attachments WHERE file_path LIKE 'data:%'");
    if (!res || !res.rows || res.rows.length === 0) {
      console.log('No legacy data-URI attachments found.');
      return;
    }

    for (const row of res.rows) {
      try {
        const { id, file_path, file_name, mime_type } = row;
        const commaIndex = file_path.indexOf(',');
        if (commaIndex === -1) continue;
        const base64Data = file_path.substring(commaIndex + 1);
        const buffer = Buffer.from(base64Data, 'base64');

        // derive extension
        let ext = 'jpg';
        if (mime_type && mime_type.includes('/')) ext = mime_type.split('/')[1];

        const safeName = (file_name || `attachment.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        try {
          const storedPath = await saveBufferToStorage(buffer, safeName, mime_type);
          await query('UPDATE ticket_attachments SET file_path = $1 WHERE id = $2', [storedPath, id]);
          console.log(`Migrated attachment ${id} -> ${storedPath}`);
        } catch (err) {
          console.error('Failed to migrate attachment', id, err);
        }
      } catch (err) {
        console.error('Failed to migrate attachment row', row.id, err);
      }
    }
  } catch (err) {
    console.error('Migration error:', err);
  }
}

// Run migration at startup
migrateDataUriAttachments().catch(err => console.error(err));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ==================== HEALTH CHECK ====================

app.get("/health", async (req, res) => {
  const dbHealth = await healthCheck();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbHealth
  });
});

// ==================== AUTHENTICATION ====================

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'email and password required' });

    const hashed = bcrypt.hashSync(password, 10);
    const insert = `INSERT INTO users (email, password_hash, first_name, last_name, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, role, is_active, created_at`;
    try {
      const r = await query(insert, [email.toLowerCase(), hashed, first_name || null, last_name || null, phone || null]);
      const user = r.rows[0];
      const token = generateToken(user);
      return res.json({ success: true, user, token });
    } catch (err) {
      if (err && err.code === '23505') return res.status(400).json({ success: false, error: 'User already exists' });
      throw err;
    }
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, error: err.message || 'Signup failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'email and password required' });

    const r = await query('SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = r && r.rows && r.rows[0] ? r.rows[0] : null;
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password_hash || user.password || '');
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = generateToken(user);
    // remove sensitive fields
    delete user.password_hash;
    res.json({ success: true, user, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: err.message || 'Login failed' });
  }
});

// Get current user
app.get('/api/auth/me', authenticate, async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Not authenticated' });
  res.json({ success: true, user: req.user });
});

// ==================== PRODUCTS ====================

app.get("/api/products", async (req, res) => {
  try {
    const { category, search, limit, offset } = req.query;
    
    let products;
    if (search) {
      products = await ProductsModel.search(search, limit || 20);
    } else if (category && category !== 'All') {
      products = await ProductsModel.findByCategory(category, limit || 100);
    } else {
      products = await ProductsModel.findAll({ 
        limit: limit || 100, 
        offset: offset || 0 
      });
    }
    
    res.json({ success: true, products });
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await ProductsModel.findById(req.params.id);
    if (product) {
      res.json({ success: true, product });
    } else {
      res.status(404).json({ success: false, error: "Product not found" });
    }
  } catch (error) {
    console.error("Get product error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ORDERS ====================

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await OrdersModel.findAll();
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/orders/my", authenticate, async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }
    
    let queryText = `
      SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'product_sku', oi.product_sku,
            'product_image_url', oi.product_image_url,
            'unit_price', oi.unit_price,
            'quantity', oi.quantity,
            'subtotal', oi.subtotal,
            'total', oi.total
          )
        ) FILTER (WHERE oi.id IS NOT NULL) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;
    
    const result = await query(queryText, [req.user.id]);
    const orders = result.rows;
    
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Get user orders error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await ProductsModel.getCategories();
    res.json({ success: true, categories });
  } catch (error) {
    console.error("Get categories error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CHAT / PRODUCT RECOMMENDATIONS ====================

app.post("/chat", authenticate, async (req, res) => {
  const userMsg = req.body.message || "";
  const sessionId = req.body.sessionId || "unknown";
  const startTime = Date.now();
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const products = await ProductsModel.findAll({ isActive: true });
    
    const productList = products
      .map(p =>
        `${p.id} | ${p.name} - $${p.price} | Category: ${p.category} | ${p.description} | Image: ${p.image_url}`
      )
      .join("\n");

    // If the request is authenticated, load recent orders for the user
    let userOrdersText = "";
    if (req.user && req.user.id) {
      try {
        const ordersRes = await query(`
          SELECT o.id, o.order_number, o.status, o.created_at, o.total_amount,
            json_agg(json_build_object('id', oi.id, 'product_name', oi.product_name, 'quantity', oi.quantity)) FILTER (WHERE oi.id IS NOT NULL) as items
          FROM orders o
          LEFT JOIN order_items oi ON o.id = oi.order_id
          WHERE o.user_id = $1
          GROUP BY o.id
          ORDER BY o.created_at DESC
          LIMIT 10
        `, [req.user.id]);

        const rows = ordersRes.rows || [];
        if (rows.length > 0) {
          userOrdersText = rows.map(r => {
            const items = (r.items || []).map(i => `${i.product_name} x${i.quantity}`).join(', ');
            const placed = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'unknown';
            return `Order ${r.order_number} (status: ${r.status}, placed: ${placed}, total: $${r.total_amount}): ${items}`;
          }).join('\n');
        }
      } catch (err) {
        console.warn('Failed to load user orders for chat prompt:', err.message || err);
      }
    }
    // Prefer a client-provided order summary (if present) so front-end can opt-in to provide context.
    const promptUserOrders = (req.body && req.body.orderSummary) ? `UserOrders:\n${req.body.orderSummary}` : (req.user && userOrdersText ? `UserOrders:\n${userOrdersText}` : '');

    let fullResponse = "";
    let recommendedProducts = [];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
      messages: [
        {
          role: "system",
          content: `
          You are AutoSmart, a friendly AI assistant for an auto parts store.

          **For Product Recommendations:**
          Only recommend products from the following inventory:
          ${productList}

          Respond using this HTML for each product:
          <div class='product-card'>
            <img src='PRODUCT_IMAGE' alt='PRODUCT_NAME' />
            <div class='product-card-details'>
              <h4>PRODUCT_NAME</h4>
              <p><b>Price:</b> $PRICE</p>
              <p><b>Category:</b> CATEGORY</p>
              <p>DESCRIPTION</p>
              <div class='product-actions'>
                <button class='add-to-cart-btn' data-id='PRODUCT_ID'>✓ Accept</button>
                <button class='decline-btn' data-id='PRODUCT_ID'>✗ Decline</button>
              </div>
            </div>
          </div>

          **For Order Status Queries:**
          When users ask about orders, shipping, delivery, or tracking:
          1. Check the UserOrders context provided below
          2. Calculate shipping and delivery estimates:
             - Estimated Shipping: 2 business days from order placement
             - Estimated Delivery: 5-7 business days from order placement
             - For orders with status "confirmed": Order is being prepared for shipment
             - For orders with status "shipped": Order is on the way to delivery address
             - For orders with status "delivered": Order has been delivered
          3. Format order information using this HTML structure for EACH order:
             <div class='order-info'>
               <h4>📦 Order #ORDER_NUMBER</h4>
               <p><b>Status:</b> STATUS</p>
               <p><b>Items:</b> ITEM_LIST</p>
               <p><b>Total:</b> $AMOUNT</p>
               <p><b>🚚 Estimated Shipping:</b> DATE</p>
               <p><b>📅 Estimated Delivery:</b> DATE_RANGE</p>
             </div>
          4. Separate multiple orders with line breaks for clarity
          5. Be helpful and provide actionable information

          Keep it conversational, short, and professional.
          Never use Markdown; use only HTML with proper line breaks.

          IMPORTANT: Extract product IDs from your response and include them at the end as:
          <!-- PRODUCT_IDS: 1,2,3 -->
          `,
        },
        {
          role: 'system',
          content: promptUserOrders
        },
        { role: "user", content: userMsg },
      ],
    });

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(content);
      }
    }

    const productIdMatch = fullResponse.match(/<!-- PRODUCT_IDS: ([\d,]+) -->/);
    if (productIdMatch) {
      const productIds = productIdMatch[1].split(',').map(id => parseInt(id.trim()));
      recommendedProducts = products.filter(p => productIds.includes(p.id));
    }

    const responseTime = Date.now() - startTime;
    await AIInteractionsModel.create({
      session_id: sessionId,
      agent_type: 'product_recommendation',
      user_query: userMsg,
      ai_response: fullResponse,
      product_ids: recommendedProducts.map(p => p.id),
      response_time_ms: responseTime
    });

    res.end();
  } catch (err) {
    console.error("AI stream error:", err);
    res.write("âš ï¸ AutoSmart AI service error. Please try again later.");
    res.end();
  }
});

// ==================== ORDERS ====================

app.post("/api/orders", async (req, res) => {
  try {
    // Require login to checkout
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required to place orders' });

    const { cartItems, customerInfo } = req.body;
    
    const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const taxAmount = subtotal * 0.08;
    const shippingCost = subtotal > 75 ? 0 : 9.99;
    const totalAmount = subtotal + taxAmount + shippingCost;
    
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const orderData = {
      order_number: orderNumber,
      user_id: req.user.id,
      customer_email: customerInfo.email,
      customer_name: customerInfo.name,
      customer_phone: customerInfo.phone,
      subtotal,
      tax_amount: taxAmount,
      shipping_cost: shippingCost,
      total_amount: totalAmount,
      shipping_address_line1: customerInfo.address,
      shipping_city: customerInfo.city,
      shipping_state: customerInfo.state || 'NY',
      shipping_zip: customerInfo.zipCode,
      payment_method: 'credit_card',
      payment_status: 'completed',
      last_4_digits: customerInfo.cardNumber ? customerInfo.cardNumber.slice(-4) : null,
      status: 'confirmed'
    };
    
    const items = cartItems.map(item => ({
      product_id: item.id,
      product_name: item.name,
      product_sku: item.sku,
      product_image_url: item.image || item.image_url,
      unit_price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity,
      total: item.price * item.quantity
    }));
    
    const order = await OrdersModel.create(orderData, items);
    
    for (const item of cartItems) {
      await AIInteractionsModel.create({
        agent_type: 'product_recommendation',
        user_query: `Purchase from checkout: ${item.name}`,
        ai_response: `Order ${orderNumber} placed`,
        product_ids: [item.id],
        order_id: order.id,
        resulted_in_purchase: true
      });
    }
    
    res.json({ 
      success: true, 
      orderNumber: order.order_number,
      order: order
    });
  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/orders/:orderId", async (req, res) => {
  try {
    const order = await OrdersModel.findByOrderNumber(req.params.orderId);
    if (order) {
      res.json({ success: true, order });
    } else {
      res.status(404).json({ success: false, error: "Order not found" });
    }
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const orders = await OrdersModel.findAll({ 
      status, 
      limit: parseInt(limit) || 100, 
      offset: parseInt(offset) || 0 
    });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Post a message / inquiry about an order (creates a support ticket linked to the user's account)
app.post('/api/orders/:orderId/message', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
    const orderIdParam = req.params.orderId;
    const { message, subject } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: 'message is required' });

    // try to resolve order by id or order_number
    let order = null;
    const asNum = parseInt(orderIdParam, 10);
    if (!Number.isNaN(asNum)) {
      const r = await query('SELECT * FROM orders WHERE id = $1', [asNum]);
      order = r && r.rows && r.rows[0] ? r.rows[0] : null;
    }
    if (!order) {
      const r2 = await query('SELECT * FROM orders WHERE order_number = $1', [orderIdParam]);
      order = r2 && r2.rows && r2.rows[0] ? r2.rows[0] : null;
    }
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const ticketNumber = `TICKET-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const ticket = await SupportTicketsModel.create({
      ticket_number: ticketNumber,
      user_id: req.user.id,
      order_id: order.id,
      customer_name: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email,
      customer_email: req.user.email,
      issue_type: 'order_inquiry',
      subject: subject || `Inquiry about ${order.order_number}`,
      description: message,
      status: 'open',
      priority: 'medium'
    });

    // add initial message record
    const msg = await SupportTicketsModel.addMessage(ticket.id, {
      user_id: req.user.id,
      sender_name: req.user.first_name ? `${req.user.first_name} ${req.user.last_name || ''}`.trim() : req.user.email,
      sender_email: req.user.email,
      sender_type: 'customer',
      message,
      is_internal: false
    });

    res.json({ success: true, ticket, message: msg });
  } catch (err) {
    console.error('Order inquiry error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create order inquiry' });
  }
});

// Get current user's orders
app.get('/api/orders/my', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
    const limit = parseInt(req.query.limit) || 50;
    const orders = await OrdersModel.findByUserId(req.user.id, limit, 0);
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Get my orders error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to load orders' });
  }
});

// ==================== SUPPORT TICKETS ====================

async function analyzeImageWithAI(imageBase64, issueType, orderDetails) {
  try {
    // Build a system prompt that asks the AI to analyze the image, the ticket description,
    // and the associated order (if provided). The AI should check whether the customer's
    // written description matches the order contents (e.g., "I ordered oil but got brake pads")
    // and factor that into the recommended action. The response must be JSON.
    let systemPrompt = `You are an AI agent for an e-commerce support system. You will analyze a provided image and the customer's textual description and check that description against the order contents (if available). Produce a JSON object with the following keys (pick keys appropriate to the issue type):

  - recommendedAction: one of REFUND, REPLACE, ESCALATE, DECLINE (preferred canonical tokens)
  - confidence: numeric confidence (0-100)
  - reasoning: a short explanation of why you chose the action
  - description: a textual description of what you observe in the image
  - severity: categorical severity (low/medium/high or minor/moderate/severe) where relevant
  - order_match: boolean true/false indicating whether the customer's description is consistent with the order contents
  - order_discrepancy_reason: optional string explaining mismatch (if order_match is false)

Be concise and return ONLY valid JSON (no markdown fences). If you include examples or extra commentary, do NOT wrap them in code fences; however callers may return fenced content, so the service will strip fences before parsing.
`;

    // Include the ticket description and order summary in the user message so the assistant can
    // verify the description against the order and then analyze the image.
    const orderSummary = orderDetails && orderDetails.order ? (
      `OrderNumber: ${orderDetails.order.order_number || ''}\nItems: ${((orderDetails.order.items || []).map(i => i.product_name || i.name || i.product_name).join(', ') || 'N/A')}`
    ) : `OrderId: ${orderDetails && orderDetails.orderId ? orderDetails.orderId : 'N/A'}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Order details:\n${orderSummary}\n\nCustomer description: ${orderDetails && orderDetails.description ? orderDetails.description : ''}\n\nIssue Type: ${issueType}\n\nPlease analyze the image and indicate whether the description matches the order and what action you recommend.`
            },
            {
              type: "image_url",
              image_url: { url: imageBase64 }
            }
          ]
        }
      ],
      max_tokens: 1000
    });

    // AI responses sometimes include markdown/code fences. Normalize and extract JSON.
    const raw = response?.choices?.[0]?.message?.content || response?.choices?.[0]?.text || '';
    let cleaned = String(raw).trim();
    cleaned = cleaned.replace(/```\w*\n?/g, '').replace(/```$/g, '').trim();
    const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
    const jsonText = jsonMatch ? jsonMatch[1] : cleaned;
    try {
      const analysis = JSON.parse(jsonText);
      return analysis;
    } catch (parseErr) {
      console.error('Failed to parse AI response as JSON. Raw response:', cleaned);
      throw parseErr;
    }
    
  } catch (error) {
    console.error("AI Vision Analysis Error:", error);
    throw new Error("Failed to analyze image");
  }
}

// Apply AI decision to ticket: may update ticket status and optionally act on order
async function applyAiDecision(ticketRow, aiAnalysis, orderObj = null) {
  try {
    if (!aiAnalysis || !ticketRow) return null;

    const rawRec = aiAnalysis.recommendedAction || aiAnalysis.recommended_action || aiAnalysis.recommendation || null;
    let action = rawRec ? String(rawRec).trim().toUpperCase() : null;
    if (action && !['REFUND','REPLACE','ESCALATE','DECLINE'].includes(action)) action = null;

    const orderMatch = aiAnalysis.order_match === true;
    const reason = aiAnalysis.order_discrepancy_reason || aiAnalysis.reasoning || null;
    const confidence = aiAnalysis.confidence ?? aiAnalysis.confidence_score ?? aiAnalysis.confidencePercent ?? null;

    // If the AI detected a mismatch between description and order, cancel/close the ticket
    if (orderMatch === false) {
      const resolution = `Cancelled by AI: ${reason || 'description does not match order'}`;
      const update = `UPDATE support_tickets SET status = $1, resolution = $2, updated_at = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`;
      const updated = await query(update, ['closed', resolution, ticketRow.id]);

      // Optionally act on the order (refund) if AI recommended REFUND
      if (orderObj && action === 'REFUND') {
        try {
          await OrdersModel.cancel(orderObj.id, `Refund triggered by AI for ticket ${ticketRow.id}: ${reason || ''}`);
        } catch (err) {
          console.warn('Failed to cancel order for AI decision:', err.message || err);
        }
      }

      // record ai interaction for audit
      try {
        await AIInteractionsModel.create({
          agent_type: 'ai_decision',
          user_query: `AI decision for ticket ${ticketRow.id}`,
          ai_response: JSON.stringify(aiAnalysis),
          ticket_id: ticketRow.id,
          order_id: orderObj ? orderObj.id : ticketRow.order_id,
          confidence_score: confidence
        });
      } catch (err) {
        console.warn('Failed to persist ai interaction for decision', err.message || err);
      }

      return updated.rows && updated.rows[0] ? updated.rows[0] : null;
    }

    // If AI provided a clear recommendation, act accordingly
    if (action === 'REFUND') {
      const resolution = `AI recommended REFUND. Reason: ${reason || 'see analysis'}`;
      // mark ticket resolved and attempt to cancel/refund order
      const updated = await query(`UPDATE support_tickets SET status = $1, resolution = $2, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`, ['resolved', resolution, ticketRow.id]);
      if (orderObj) {
        try {
          await OrdersModel.cancel(orderObj.id, `Refund requested by AI for ticket ${ticketRow.id}: ${reason || ''}`);
        } catch (err) {
          console.warn('Failed to cancel order for refund action', err.message || err);
        }
      }
      try {
        await AIInteractionsModel.create({ agent_type: 'ai_decision', user_query: `AI REFUND for ticket ${ticketRow.id}`, ai_response: JSON.stringify(aiAnalysis), ticket_id: ticketRow.id, order_id: orderObj ? orderObj.id : ticketRow.order_id, confidence_score: confidence });
      } catch (err) {}
      return updated.rows && updated.rows[0] ? updated.rows[0] : null;
    }

    if (action === 'REPLACE') {
      // For replace, mark ticket as in_progress and add an internal note in resolution
      const resolution = `AI recommended REPLACE. Reason: ${reason || 'see analysis'}`;
      const updated = await query(`UPDATE support_tickets SET status = $1, resolution = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`, ['in_progress', resolution, ticketRow.id]);
      try { await AIInteractionsModel.create({ agent_type: 'ai_decision', user_query: `AI REPLACE for ticket ${ticketRow.id}`, ai_response: JSON.stringify(aiAnalysis), ticket_id: ticketRow.id, order_id: orderObj ? orderObj.id : ticketRow.order_id, confidence_score: confidence }); } catch (e) {}
      return updated.rows && updated.rows[0] ? updated.rows[0] : null;
    }

    if (action === 'ESCALATE') {
      const reasonText = reason || 'Escalated to human agent by AI recommendation';
      const updated = await query(`UPDATE support_tickets SET status = $1, escalation_reason = $2, escalated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`, ['escalated', reasonText, ticketRow.id]);
      try { await AIInteractionsModel.create({ agent_type: 'ai_decision', user_query: `AI ESCALATE for ticket ${ticketRow.id}`, ai_response: JSON.stringify(aiAnalysis), ticket_id: ticketRow.id, order_id: orderObj ? orderObj.id : ticketRow.order_id, confidence_score: confidence }); } catch (e) {}
      return updated.rows && updated.rows[0] ? updated.rows[0] : null;
    }

    // No action applied
    return null;
  } catch (err) {
    console.error('applyAiDecision error:', err);
    return null;
  }
}

app.post("/api/support/ticket", upload.single('image'), async (req, res) => {
  try {
    const { orderId, issueType, customerName, customerEmail, description } = req.body;

    if (!orderId || !issueType || !customerName || !customerEmail) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }

    // Ensure orderId is treated as a number
    const orderIdNum = parseInt(orderId, 10);

    // Query returns a result object; extract the first row
    let order = null;

    if (!Number.isNaN(orderIdNum)) {
      const orderResult = await query('SELECT * FROM orders WHERE id = $1', [orderIdNum]);
      order = orderResult && orderResult.rows ? orderResult.rows[0] : null;
    }

    // If not found by numeric id, try matching by order_number (client may send order number)
    if (!order) {
      const orderResultByNumber = await query('SELECT * FROM orders WHERE order_number = $1', [orderId]);
      order = orderResultByNumber && orderResultByNumber.rows ? orderResultByNumber.rows[0] : null;
    }

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: "Order not found" 
      });
    }

    // Load order items so AI can compare the customer's complaint against what was ordered
    try {
      const itemsRes = await query('SELECT id, product_id, product_name, product_sku, product_image_url, unit_price, quantity, subtotal, total FROM order_items WHERE order_id = $1', [order.id]);
      order.items = itemsRes && itemsRes.rows ? itemsRes.rows : [];
    } catch (err) {
      console.warn('Failed to load order items for ticket creation:', err.message || err);
      order.items = order.items || [];
    }

    let imageBase64 = null;
    let aiAnalysis = null;

    if (req.file) {
      imageBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      
      // Attempt AI analysis but do not fail ticket creation if AI call errors
      try {
        aiAnalysis = await analyzeImageWithAI(imageBase64, issueType, {
          order: order,
          orderId: order.id,
          customerName,
          issueType,
          description
        });
      } catch (aiError) {
        console.error('AI analysis failed, continuing without AI result:', aiError.message || aiError);
        aiAnalysis = null;
      }
    }

    const ticketNumber = `TICKET-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Sanitize AI recommendation/confidence before persisting to avoid DB type errors
    let aiRec = null;
    let aiConf = null;
    if (aiAnalysis) {
      const rawRec = aiAnalysis.recommendedAction || aiAnalysis.recommended_action || aiAnalysis.recommendation || null;
      if (rawRec) {
        aiRec = String(rawRec).trim();
        const match = aiRec.match(/\b(REFUND|REPLACE|ESCALATE|DECLINE)\b/i);
        if (match) aiRec = match[1].toUpperCase();
        if (aiRec.length > 50) aiRec = aiRec.slice(0, 50);
      }

      const rawConf = aiAnalysis.confidence ?? aiAnalysis.confidence_score ?? aiAnalysis.confidencePercent ?? null;
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

    const ticket = await SupportTicketsModel.create({
      ticket_number: ticketNumber,
      user_id: req.user ? req.user.id : null,
      order_id: order.id,
      customer_name: customerName,
      customer_email: customerEmail,
      issue_type: issueType,
      description,
      ai_recommendation: aiRec || 'ESCALATE',
      ai_analysis: aiAnalysis,
      ai_confidence: aiConf,
      status: 'open'
    });

    if (req.file && imageBase64) {
      await SupportTicketsModel.addAttachment(ticket.id, {
        file_name: req.file.originalname,
        file_path: imageBase64,
        file_type: req.file.mimetype,
        file_size: req.file.size,
        mime_type: req.file.mimetype
      });
    }

    await AIInteractionsModel.create({
      agent_type: issueType === 'fraud' ? 'fraud_detection' : 
                  issueType === 'damaged' ? 'damage_assessment' : 'defect_detection',
      user_query: description,
      ai_response: JSON.stringify(aiAnalysis),
      ticket_id: ticket.id,
      order_id: order.id,
      confidence_score: aiConf
    });

    // Let the AI decision helper take final actions (refund/replace/escalate/close) if it recommended one
    let postDecisionTicket = null;
    try {
      postDecisionTicket = await applyAiDecision(ticket, aiAnalysis, order);
    } catch (err) {
      console.warn('applyAiDecision failed after ticket create:', err.message || err);
    }

    res.json({
      success: true,
      ticket: postDecisionTicket || { ...ticket, ai_analysis: aiAnalysis },
      message: `Ticket created successfully. AI Recommendation: ${ticket.ai_recommendation}`
    });

  } catch (error) {
    console.error("Support ticket creation error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to create support ticket" 
    });
  }
});

app.get("/api/support/tickets", async (req, res) => {
  try {
    const { status, issue_type, limit, offset } = req.query;
    const tickets = await SupportTicketsModel.findAll({ 
      status, 
      issue_type,
      limit: parseInt(limit) || 100, 
      offset: parseInt(offset) || 0 
    });

    // Get attachments for each ticket
    for (let ticket of tickets) {
      const attachments = await SupportTicketsModel.getAttachments(ticket.id);
      if (attachments && attachments.length > 0) {
        ticket.image_url = attachments[0].file_path; // Use first attachment as image
      }
      // Normalize ai_analysis: parse JSON strings into objects so frontend can render
      if (ticket.ai_analysis && typeof ticket.ai_analysis === 'string') {
        try {
          ticket.ai_analysis = JSON.parse(ticket.ai_analysis);
        } catch (err) {
          // if parsing fails, leave as string but avoid crashing frontend
          console.warn('Failed to parse ai_analysis for ticket', ticket.id);
        }
      }
      // Coerce ai_confidence to number when possible
      if (ticket.ai_confidence != null && typeof ticket.ai_confidence === 'string') {
        const n = Number(ticket.ai_confidence);
        ticket.ai_confidence = Number.isFinite(n) ? n : ticket.ai_confidence;
      }
    }

    res.json({ success: true, tickets });
  } catch (error) {
    console.error("Get tickets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get tickets for current authenticated user
app.get('/api/support/my', async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
    const tickets = await SupportTicketsModel.findByUserId(req.user.id, 100, 0);
    // attach attachments and parse ai_analysis similar to generic endpoint
    for (let t of tickets) {
      const attachments = await SupportTicketsModel.getAttachments(t.id);
      if (attachments && attachments.length > 0) t.image_url = attachments[0].file_path;
      if (t.ai_analysis && typeof t.ai_analysis === 'string') {
        try { t.ai_analysis = JSON.parse(t.ai_analysis); } catch (e) {}
      }
    }
    res.json({ success: true, tickets });
  } catch (err) {
    console.error('Get my tickets error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to load tickets' });
  }
});

// Admin: reprocess AI analysis for tickets missing ai_analysis
app.post('/admin/reprocess-ai', async (req, res) => {
  try {
    const adminToken = process.env.ADMIN_TOKEN;
    const provided = req.headers['x-admin-token'] || req.body.adminToken;
    if (!adminToken) {
      return res.status(403).json({ success: false, error: 'Admin reprocess endpoint disabled (ADMIN_TOKEN not set)' });
    }
    if (!provided || provided !== adminToken) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { dryRun = true, limit = 20, ticketIds } = req.body || {};

    // Build query: tickets that have NULL ai_analysis but have at least one attachment
    let queryText = `
      SELECT st.*, ta.file_path, ta.file_name, ta.mime_type
      FROM support_tickets st
      JOIN ticket_attachments ta ON ta.ticket_id = st.id
      WHERE st.ai_analysis IS NULL AND ta.file_path IS NOT NULL
      ORDER BY st.created_at DESC
      LIMIT $1
    `;
    const params = [parseInt(limit, 10) || 20];

    if (Array.isArray(ticketIds) && ticketIds.length > 0) {
      // If specific tickets provided, filter by them
      queryText = `
        SELECT st.*, ta.file_path, ta.file_name, ta.mime_type
        FROM support_tickets st
        JOIN ticket_attachments ta ON ta.ticket_id = st.id
        WHERE st.id = ANY($1::int[])
        ORDER BY st.created_at DESC
        LIMIT $2
      `;
      params.splice(0, params.length, ticketIds, parseInt(limit, 10) || 20);
    }

    const rows = await query(queryText, params);
    if (!rows || rows.length === 0) {
      return res.json({ success: true, message: 'No tickets found for reprocessing', count: 0 });
    }

    const uploadsDir = path.join(os.tmpdir(), 'autoparts_uploads');
    const results = [];

    for (const row of rows) {
      const ticketId = row.id;
      const filePath = row.file_path;
      const fileName = row.file_name || '';
      const mimeType = row.mime_type || 'image/jpeg';

      // Determine how to get a data URI for analysis
      let dataUri = null;

      try {
        if (!filePath) {
          results.push({ ticketId, ok: false, reason: 'no_attachment' });
          continue;
        }

        if (filePath.startsWith('data:')) {
          dataUri = filePath;
        } else if (filePath.startsWith('/uploads/')) {
          // read from local uploads dir
          const fname = path.basename(filePath);
          const abs = path.join(uploadsDir, fname);
          if (!fs.existsSync(abs)) {
            results.push({ ticketId, ok: false, reason: 'file_not_found', file: abs });
            continue;
          }
          const buffer = fs.readFileSync(abs);
          dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
        } else if (/^https?:\/\//.test(filePath)) {
          // Try to download remote file (S3/public URL)
          try {
            if (typeof fetch === 'function') {
              const resp = await fetch(filePath);
              if (!resp.ok) throw new Error(`Failed to download: ${resp.status}`);
              const arrayBuffer = await resp.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              // Try to infer mime from headers
              const mt = resp.headers.get('content-type') || mimeType;
              dataUri = `data:${mt};base64,${buffer.toString('base64')}`;
            } else {
              results.push({ ticketId, ok: false, reason: 'no_fetch_available' });
              continue;
            }
          } catch (err) {
            console.error('Failed to download remote attachment for ticket', ticketId, err.message || err);
            results.push({ ticketId, ok: false, reason: 'download_failed', error: err.message });
            continue;
          }
        } else {
          // Unknown path format; skip
          results.push({ ticketId, ok: false, reason: 'unsupported_path', path: filePath });
          continue;
        }
      } catch (err) {
        console.error('Failed preparing data URI for ticket', ticketId, err);
        results.push({ ticketId, ok: false, reason: 'prepare_failed', error: err.message || err });
        continue;
      }

      if (dryRun) {
        results.push({ ticketId, ok: true, dryRun: true, filePath });
        continue;
      }

      // Call AI analysis
      try {
        // Load order details so the AI can verify the customer's description against the order
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

        const analysis = await analyzeImageWithAI(dataUri, row.issue_type || 'defect', {
          order: orderObj,
          orderId: row.order_id,
          customerName: row.customer_name,
          description: row.description
        });

        // Sanitize ai_recommendation and ai_confidence
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

        // Persist analysis into support_tickets
        const updateText = `UPDATE support_tickets SET ai_analysis = $1, ai_recommendation = $2, ai_confidence = $3 WHERE id = $4 RETURNING *`;
        const updateVals = [aiAnalysisStr, aiRec, aiConf, ticketId];
        const updated = await query(updateText, updateVals);

        // Optionally record an AI interaction
        try {
          await AIInteractionsModel.create({
            agent_type: 'reprocess_ai',
            user_query: `Reprocessed ticket ${ticketId}`,
            ai_response: aiAnalysisStr,
            ticket_id: ticketId,
            order_id: row.order_id,
            confidence_score: aiConf
          });
        } catch (aiIntErr) {
          console.warn('Failed to persist AI interaction for ticket', ticketId, aiIntErr.message || aiIntErr);
        }

        // Apply AI decision to the ticket (may change status/resolution and act on order)
        try {
          const updatedTicket = updated.rows && updated.rows[0] ? updated.rows[0] : null;
          await applyAiDecision(updatedTicket, analysis, orderObj);
        } catch (err) {
          console.warn('applyAiDecision failed during admin reprocess for', ticketId, err.message || err);
        }

        results.push({ ticketId, ok: true, updated: updated.rows && updated.rows[0] ? updated.rows[0] : null });
      } catch (err) {
        console.error('AI analysis failed for ticket', ticketId, err.message || err);
        results.push({ ticketId, ok: false, reason: 'ai_failed', error: err.message || String(err) });
      }
    }

    return res.json({ success: true, dryRun: !!dryRun, count: rows.length, results });
  } catch (err) {
    console.error('Admin reprocess error:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

app.get("/api/support/ticket/:ticketId", async (req, res) => {
  try {
    const ticket = await SupportTicketsModel.findByTicketNumber(req.params.ticketId);
    if (ticket) {
      res.json({ success: true, ticket });
    } else {
      res.status(404).json({ success: false, error: "Ticket not found" });
    }
  } catch (error) {
    console.error("Get ticket error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reprocess AI for a single ticket (public endpoint used by UI). Will attempt analysis only if an attachment exists.
app.post('/api/support/ticket/:ticketId/reprocess', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.ticketId, 10);
    if (Number.isNaN(ticketId)) return res.status(400).json({ success: false, error: 'Invalid ticket id' });

    const ticketResult = await query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
    const ticket = ticketResult && ticketResult.rows ? ticketResult.rows[0] : null;
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const attRes = await query('SELECT * FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC LIMIT 1', [ticketId]);
    const attachment = attRes && attRes.rows ? attRes.rows[0] : null;
    if (!attachment || !attachment.file_path) return res.status(400).json({ success: false, error: 'No attachment found for ticket' });

    // prepare data URI
    const uploadsDir = path.join(os.tmpdir(), 'autoparts_uploads');
    let dataUri = null;
    const fp = attachment.file_path;
    if (fp.startsWith('data:')) {
      dataUri = fp;
    } else if (fp.startsWith('/uploads/')) {
      const fname = path.basename(fp);
      const abs = path.join(uploadsDir, fname);
      if (!fs.existsSync(abs)) return res.status(500).json({ success: false, error: 'Attachment file missing on server' });
      const buffer = fs.readFileSync(abs);
      dataUri = `data:${attachment.mime_type || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    } else if (/^https?:\/\//.test(fp)) {
      if (typeof fetch !== 'function') return res.status(500).json({ success: false, error: 'Server cannot download remote attachments (no fetch)' });
      try {
        const resp = await fetch(fp);
        if (!resp.ok) throw new Error(`download failed ${resp.status}`);
        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const mt = resp.headers.get('content-type') || attachment.mime_type || 'image/jpeg';
        dataUri = `data:${mt};base64,${buffer.toString('base64')}`;
      } catch (err) {
        console.error('Failed to download remote attachment', err);
        return res.status(500).json({ success: false, error: 'Failed to download remote attachment' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported attachment path' });
    }

    // fetch order details if present
    let orderObj = null;
    if (ticket.order_id) {
      try {
        const o = await query('SELECT * FROM orders WHERE id = $1', [ticket.order_id]);
        orderObj = o && o.rows && o.rows[0] ? o.rows[0] : null;
        if (orderObj) {
          const itemsRes = await query('SELECT product_name FROM order_items WHERE order_id = $1', [ticket.order_id]);
          orderObj.items = itemsRes.rows || [];
        }
      } catch (err) {
        console.warn('Failed to load order for ticket reprocess', ticketId, err.message || err);
      }
    }

    // run analysis
    let analysis = null;
    try {
      analysis = await analyzeImageWithAI(dataUri, ticket.issue_type || 'defect', {
        order: orderObj,
        orderId: ticket.order_id,
        customerName: ticket.customer_name,
        description: ticket.description
      });
    } catch (err) {
      console.error('Reprocess AI failed for ticket', ticketId, err.message || err);
      return res.status(500).json({ success: false, error: 'AI analysis failed' });
    }

    // sanitize and persist similar to admin flow
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

    try {
      await AIInteractionsModel.create({
        agent_type: 'ad-hoc-reprocess',
        user_query: `User triggered reprocess for ticket ${ticketId}`,
        ai_response: aiAnalysisStr,
        ticket_id: ticketId,
        order_id: ticket.order_id,
        confidence_score: aiConf
      });
    } catch (e) {
      console.warn('Failed to persist AI interaction for reprocess', e.message || e);
    }

    // Apply AI decision (may update ticket/order)
    try {
      const updatedTicket = updated.rows && updated.rows[0] ? updated.rows[0] : null;
      await applyAiDecision(updatedTicket, analysis, orderObj);
    } catch (err) {
      console.warn('applyAiDecision failed during single-ticket reprocess for', ticketId, err.message || err);
    }

    // attach image_url for response
    const att = attachment;
    const imageUrl = att.file_path;
    const updatedTicket = updated.rows && updated.rows[0] ? updated.rows[0] : null;
    if (updatedTicket) updatedTicket.image_url = imageUrl;

    res.json({ success: true, ticket: updatedTicket });
  } catch (err) {
    console.error('Reprocess endpoint error:', err);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// ==================== ORDERS API ====================

app.post("/api/orders", async (req, res) => {
  try {
    const { orderNumber, customerName, customerEmail, customerPhone, address, paymentMethod, cardDetails, items, total } = req.body;
    
    // Validate required fields
    if (!orderNumber || !customerName || !address || !items || items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }

    // Parse address (simple parsing - assumes format like "123 Main St, City, State ZIP")
    const addressParts = address.split(',').map(part => part.trim());
    let addressLine1 = addressParts[0] || address;
    let city = addressParts[1] || '';
    let stateZip = addressParts[2] || '';
    let state = '';
    let zip = '';
    
    // Try to extract state and zip from last part
    if (stateZip) {
      const stateZipMatch = stateZip.match(/^([A-Za-z\s]+)\s+(\d{5}(-\d{4})?)$/);
      if (stateZipMatch) {
        state = stateZipMatch[1].trim();
        zip = stateZipMatch[2];
      } else {
        // If format doesn't match, put everything in state
        state = stateZip;
      }
    }

    // Prepare order data
    const orderData = {
      order_number: orderNumber,
      user_id: null, // Guest checkout
      customer_email: customerEmail || '',
      customer_name: customerName,
      customer_phone: customerPhone || null,
      subtotal: total,
      tax_amount: 0,
      shipping_cost: 0,
      discount_amount: 0,
      total_amount: total,
      shipping_address_line1: addressLine1,
      shipping_address_line2: null,
      shipping_city: city,
      shipping_state: state,
      shipping_zip: zip,
      shipping_country: 'USA',
      payment_method: paymentMethod === 'card' ? 'credit_card' : 'cash_on_delivery',
      payment_status: paymentMethod === 'cod' ? 'pending' : 'completed',
      last_4_digits: cardDetails?.number ? cardDetails.number.slice(-4) : null,
      status: 'pending'
    };

    // Create the order
    const order = await OrdersModel.create(orderData, items);

    res.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total_amount: order.total_amount,
        status: order.status,
        created_at: order.created_at
      },
      message: "Order created successfully"
    });

  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to create order" 
    });
  }
});

app.get("/api/orders/:orderNumber", async (req, res) => {
  try {
    const order = await OrdersModel.findByOrderNumber(req.params.orderNumber);
    if (order) {
      res.json({ success: true, order });
    } else {
      res.status(404).json({ success: false, error: "Order not found" });
    }
  } catch (error) {
    console.error("Get order error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    const orders = await OrdersModel.findAll({ 
      status,
      limit: parseInt(limit) || 100, 
      offset: parseInt(offset) || 0 
    });
    res.json({ success: true, orders });
  } catch (error) {
    console.error("Get orders error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ANALYTICS ====================

app.get("/analytics/report", async (req, res) => {
  try {
    const agentStats = await AIInteractionsModel.getAgentStats();
    const conversionRate = await AIInteractionsModel.getConversionRate();
    const ticketStats = await SupportTicketsModel.getTicketStats();
    const aiRecommendationStats = await SupportTicketsModel.getAIRecommendationStats();

    // Get open tickets sorted by AI-analysis severity (ai_confidence descending)
    const openTicketsQuery = `
      SELECT
        id, ticket_number, customer_name, customer_email, issue_type,
        subject, description, status, priority, created_at,
        ai_recommendation, ai_confidence, ai_analysis
      FROM support_tickets
      WHERE status IN ('open', 'in_progress')
      ORDER BY
        CASE
          WHEN ai_confidence >= 80 THEN 1
          WHEN ai_confidence >= 50 THEN 2
          ELSE 3
        END,
        ai_confidence DESC NULLS LAST,
        created_at DESC
      LIMIT 50
    `;
    const openTicketsResult = await query(openTicketsQuery);
    const openTickets = openTicketsResult.rows || [];

    // Parse ai_analysis JSON strings
    openTickets.forEach(ticket => {
      if (ticket.ai_analysis && typeof ticket.ai_analysis === 'string') {
        try {
          ticket.ai_analysis = JSON.parse(ticket.ai_analysis);
        } catch (err) {
          console.warn('Failed to parse ai_analysis for ticket', ticket.id);
        }
      }
      // Ensure ai_confidence is a number
      if (ticket.ai_confidence != null && typeof ticket.ai_confidence === 'string') {
        const n = Number(ticket.ai_confidence);
        ticket.ai_confidence = Number.isFinite(n) ? n : null;
      }
    });

    res.json({
      success: true,
      summary: {
        totalInteractions: agentStats.reduce((sum, stat) => sum + parseInt(stat.total_interactions), 0),
        purchaseRate: conversionRate ? `${conversionRate.conversion_rate_percent}%` : '0%',
        totalTickets: ticketStats.total_tickets || 0,
        openTickets: ticketStats.open_tickets || 0,
        avgResolutionTime: ticketStats.avg_resolution_time_hours ?
          `${ticketStats.avg_resolution_time_hours.toFixed(1)} hours` : 'N/A'
      },
      agentStats,
      ticketStats,
      aiRecommendationStats,
      openTickets
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/analytics/export", async (req, res) => {
  try {
    const interactions = await AIInteractionsModel.getRecent(1000);
    res.json({ success: true, data: interactions });
  } catch (error) {
    console.error("Export error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3001;

app.listen(PORT, async () => {
  console.log(`AutoSmart AI Database Server running on http://localhost:${PORT}`);
  
  const dbHealth = await healthCheck();
  if (dbHealth.status === 'healthy') {
    console.log(` Database connected successfully`);
    console.log(` PostgreSQL version: ${dbHealth.version.split(',')[0]}`);
  } else {
    console.error(`❌ Database connection failed:`, dbHealth.error);
    console.error(`   Make sure PostgreSQL is running and configured in .env`);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing connections');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing connections');
  await pool.end();
  process.exit(0);
});