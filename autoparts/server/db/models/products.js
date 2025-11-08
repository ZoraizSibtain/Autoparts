// ================================================
// Products Model
// Database operations for products table
// ================================================

const db = require('./index');

class ProductsModel {
  // ==================== CREATE ====================
  
  async create(productData) {
    const {
      name, slug, description, category, price, cost, image_url,
      sku, stock_quantity, low_stock_threshold, weight,
      dimensions, manufacturer, warranty_months
    } = productData;
    
    const query = `
      INSERT INTO products (
        name, slug, description, category, price, cost, image_url,
        sku, stock_quantity, low_stock_threshold, weight,
        dimensions, manufacturer, warranty_months
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;
    
    const values = [
      name, slug, description, category, price, cost, image_url,
      sku, stock_quantity || 0, low_stock_threshold || 10, weight,
      dimensions, manufacturer, warranty_months
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  // ==================== READ ====================
  
  async findById(id) {
    const query = 'SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  async findBySlug(slug) {
    const query = 'SELECT * FROM products WHERE slug = $1 AND deleted_at IS NULL';
    const result = await db.query(query, [slug]);
    return result.rows[0];
  }
  
  async findBySku(sku) {
    const query = 'SELECT * FROM products WHERE sku = $1 AND deleted_at IS NULL';
    const result = await db.query(query, [sku]);
    return result.rows[0];
  }
  
  async findAll(options = {}) {
    const { 
      category, 
      isActive = true, 
      limit = 100, 
      offset = 0,
      orderBy = 'name',
      orderDir = 'ASC'
    } = options;
    
    let query = 'SELECT * FROM products WHERE deleted_at IS NULL';
    const values = [];
    let paramCount = 0;
    
    if (category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      values.push(category);
    }
    
    if (isActive !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      values.push(isActive);
    }
    
    query += ` ORDER BY ${orderBy} ${orderDir}`;
    query += ` LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    values.push(limit, offset);
    
    const result = await db.query(query, values);
    return result.rows;
  }
  
  async findByCategory(category, limit = 100) {
    const query = `
      SELECT * FROM products 
      WHERE category = $1 AND is_active = true AND deleted_at IS NULL
      ORDER BY name ASC
      LIMIT $2
    `;
    const result = await db.query(query, [category, limit]);
    return result.rows;
  }
  
  async search(searchTerm, limit = 20) {
    const query = `
      SELECT * FROM products
      WHERE (
        name ILIKE $1 OR 
        description ILIKE $1 OR 
        category ILIKE $1 OR
        sku ILIKE $1
      )
      AND is_active = true 
      AND deleted_at IS NULL
      ORDER BY name ASC
      LIMIT $2
    `;
    const result = await db.query(query, [`%${searchTerm}%`, limit]);
    return result.rows;
  }
  
  async getCategories() {
    const query = `
      SELECT DISTINCT category 
      FROM products 
      WHERE is_active = true AND deleted_at IS NULL
      ORDER BY category ASC
    `;
    const result = await db.query(query);
    return result.rows.map(row => row.category);
  }
  
  async getLowStockProducts() {
    const query = `
      SELECT * FROM products 
      WHERE stock_quantity <= low_stock_threshold 
      AND is_active = true 
      AND deleted_at IS NULL
      ORDER BY stock_quantity ASC
    `;
    const result = await db.query(query);
    return result.rows;
  }
  
  // ==================== UPDATE ====================
  
  async update(id, updateData) {
    const allowedFields = [
      'name', 'slug', 'description', 'category', 'price', 'cost',
      'image_url', 'sku', 'stock_quantity', 'low_stock_threshold',
      'is_active', 'weight', 'dimensions', 'manufacturer', 'warranty_months'
    ];
    
    const updates = [];
    const values = [];
    let paramCount = 0;
    
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        paramCount++;
        updates.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
      }
    });
    
    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }
    
    paramCount++;
    values.push(id);
    
    const query = `
      UPDATE products 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  async updateStock(id, newQuantity, transaction = null) {
    // Use transaction if provided, otherwise use regular query
    const queryFn = transaction ? transaction.query.bind(transaction) : db.query;
    
    const query = `
      UPDATE products 
      SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await queryFn(query, [newQuantity, id]);
    return result.rows[0];
  }
  
  async incrementStock(id, amount) {
    const query = `
      UPDATE products 
      SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await db.query(query, [amount, id]);
    return result.rows[0];
  }
  
  async decrementStock(id, amount) {
    const query = `
      UPDATE products 
      SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND deleted_at IS NULL AND stock_quantity >= $1
      RETURNING *
    `;
    
    const result = await db.query(query, [amount, id]);
    
    if (result.rows.length === 0) {
      throw new Error('Insufficient stock or product not found');
    }
    
    return result.rows[0];
  }
  
  // ==================== DELETE ====================
  
  async softDelete(id) {
    const query = `
      UPDATE products 
      SET deleted_at = CURRENT_TIMESTAMP, is_active = false
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  async hardDelete(id) {
    const query = 'DELETE FROM products WHERE id = $1 RETURNING *';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  // ==================== ANALYTICS ====================
  
  async getStockValue() {
    const query = `
      SELECT 
        SUM(stock_quantity * cost) as total_cost,
        SUM(stock_quantity * price) as total_value,
        COUNT(*) as product_count
      FROM products 
      WHERE is_active = true AND deleted_at IS NULL
    `;
    
    const result = await db.query(query);
    return result.rows[0];
  }
  
  async getCategoryStats() {
    const query = `
      SELECT 
        category,
        COUNT(*) as product_count,
        SUM(stock_quantity) as total_stock,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM products 
      WHERE is_active = true AND deleted_at IS NULL
      GROUP BY category
      ORDER BY category
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = new ProductsModel();
