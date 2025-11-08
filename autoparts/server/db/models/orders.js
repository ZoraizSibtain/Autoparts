// ================================================
// Orders Model
// Database operations for orders and order_items tables
// ================================================

const db = require('../index');

class OrdersModel {
  // ==================== CREATE ====================
  
  async create(orderData, items) {
    return await db.transaction(async (client) => {
      // Insert order
      // Calculate shipping and arrival dates
      const today = new Date();
      const shipDate = new Date(today);
      shipDate.setDate(today.getDate() + 3);
      const arrivalDate = new Date(today);
      arrivalDate.setDate(today.getDate() + 10);

      const orderQuery = `
        INSERT INTO orders (
          order_number, user_id, customer_email, customer_name, customer_phone,
          subtotal, tax_amount, shipping_cost, discount_amount, total_amount,
          shipping_address_line1, shipping_address_line2, shipping_city,
          shipping_state, shipping_zip, shipping_country,
          payment_method, payment_status, last_4_digits, status,
          estimated_ship_date, estimated_arrival_date
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
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
        orderData.status || 'pending',
        shipDate.toISOString().split('T')[0],
        arrivalDate.toISOString().split('T')[0]
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
      
      return {
        ...order,
        items: orderItems
      };
    });
  }
  
  // ==================== READ ====================
  
  async findById(id) {
    const query = `
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
            'discount_amount', oi.discount_amount,
            'total', oi.total,
            'fulfillment_status', oi.fulfillment_status
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.id = $1
      GROUP BY o.id
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  async findByOrderNumber(orderNumber) {
    const query = `
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
            'discount_amount', oi.discount_amount,
            'total', oi.total,
            'fulfillment_status', oi.fulfillment_status
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.order_number = $1
      GROUP BY o.id
    `;
    
    const result = await db.query(query, [orderNumber]);
    return result.rows[0];
  }
  
  async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'total', oi.total
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }
  
  async findByEmail(email, limit = 50) {
    const query = `
      SELECT o.*, 
        json_agg(
          json_build_object(
            'id', oi.id,
            'product_id', oi.product_id,
            'product_name', oi.product_name,
            'quantity', oi.quantity,
            'total', oi.total
          )
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.customer_email = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [email, limit]);
    return result.rows;
  }
  
  async findAll(options = {}) {
    const {
      status,
      payment_status,
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDir = 'DESC'
    } = options;
    
    let query = 'SELECT * FROM orders WHERE 1=1';
    const values = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      values.push(status);
    }
    
    if (payment_status) {
      paramCount++;
      query += ` AND payment_status = $${paramCount}`;
      values.push(payment_status);
    }
    
    query += ` ORDER BY ${orderBy} ${orderDir}`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);
    
    const result = await db.query(query, values);
    return result.rows;
  }
  
  async getRecentOrders(limit = 10) {
    const query = `
      SELECT * FROM orders 
      ORDER BY created_at DESC 
      LIMIT $1
    `;
    const result = await db.query(query, [limit]);
    return result.rows;
  }
  
  // ==================== UPDATE ====================
  
  async updateStatus(id, status) {
    const query = `
      UPDATE orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [status, id]);
    return result.rows[0];
  }
  
  async updatePaymentStatus(id, paymentStatus, transactionId = null) {
    const query = `
      UPDATE orders 
      SET payment_status = $1, transaction_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [paymentStatus, transactionId, id]);
    return result.rows[0];
  }
  
  async updateShipping(id, trackingNumber, carrier) {
    const query = `
      UPDATE orders 
      SET tracking_number = $1, carrier = $2, shipped_at = CURRENT_TIMESTAMP,
          status = 'shipped', updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [trackingNumber, carrier, id]);
    return result.rows[0];
  }
  
  async markAsDelivered(id) {
    const query = `
      UPDATE orders 
      SET delivered_at = CURRENT_TIMESTAMP, status = 'delivered',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  async cancel(id, reason = null) {
    const query = `
      UPDATE orders 
      SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
          internal_notes = COALESCE(internal_notes, '') || $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const notes = reason ? `\nCancellation reason: ${reason}` : '';
    const result = await db.query(query, [id, notes]);
    return result.rows[0];
  }
  
  // ==================== ANALYTICS ====================
  
  async getTotalRevenue(startDate = null, endDate = null) {
    let query = `
      SELECT 
        COUNT(*) as order_count,
        SUM(total_amount) as total_revenue,
        AVG(total_amount) as avg_order_value
      FROM orders 
      WHERE payment_status = 'completed'
    `;
    
    const values = [];
    if (startDate && endDate) {
      query += ' AND created_at BETWEEN $1 AND $2';
      values.push(startDate, endDate);
    }
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  async getOrdersByStatus() {
    const query = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_amount
      FROM orders 
      GROUP BY status
      ORDER BY count DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  async getOrdersByDate(days = 30) {
    const query = `
      SELECT 
        DATE(created_at) as order_date,
        COUNT(*) as order_count,
        SUM(total_amount) as revenue
      FROM orders 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY order_date DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  async getTopProducts(limit = 10) {
    const query = `
      SELECT 
        oi.product_id,
        oi.product_name,
        SUM(oi.quantity) as total_quantity,
        SUM(oi.total) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.payment_status = 'completed'
      GROUP BY oi.product_id, oi.product_name
      ORDER BY total_quantity DESC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  }
}

module.exports = new OrdersModel();
