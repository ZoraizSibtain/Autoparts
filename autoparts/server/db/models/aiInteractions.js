// ================================================
// AI Interactions Model
// Database operations for ai_interactions table
// ================================================

const db = require('../index');

class AIInteractionsModel {
  // ==================== CREATE ====================
  
  async create(interactionData) {
    const {
      session_id, user_id, agent_type, user_query, ai_response,
      product_ids, order_id, ticket_id, response_time_ms, token_count,
      confidence_score, user_action, resulted_in_purchase
    } = interactionData;
    
    const query = `
      INSERT INTO ai_interactions (
        session_id, user_id, agent_type, user_query, ai_response,
        product_ids, order_id, ticket_id, response_time_ms, token_count,
        confidence_score, user_action, resulted_in_purchase
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const values = [
      session_id || null,
      user_id || null,
      agent_type,
      user_query,
      ai_response,
      product_ids || null,
      order_id || null,
      ticket_id || null,
      response_time_ms || null,
      token_count || null,
      confidence_score || null,
      user_action || null,
      resulted_in_purchase || false
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }
  
  // ==================== READ ====================
  
  async findById(id) {
    const query = 'SELECT * FROM ai_interactions WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  async findBySessionId(sessionId, limit = 50) {
    const query = `
      SELECT * FROM ai_interactions 
      WHERE session_id = $1 
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [sessionId, limit]);
    return result.rows;
  }
  
  async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM ai_interactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows;
  }
  
  async findByAgentType(agentType, limit = 100) {
    const query = `
      SELECT * FROM ai_interactions 
      WHERE agent_type = $1 
      ORDER BY created_at DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [agentType, limit]);
    return result.rows;
  }
  
  async getRecent(limit = 100) {
    const query = `
      SELECT * FROM ai_interactions 
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  }
  
  // ==================== UPDATE ====================
  
  async updateUserFeedback(id, rating, feedback) {
    const query = `
      UPDATE ai_interactions 
      SET user_rating = $1, user_feedback = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [rating, feedback, id]);
    return result.rows[0];
  }
  
  async updateUserAction(id, userAction, wasHelpful = null) {
    const query = `
      UPDATE ai_interactions 
      SET user_action = $1, was_helpful = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [userAction, wasHelpful, id]);
    return result.rows[0];
  }
  
  async markAsPurchased(id) {
    const query = `
      UPDATE ai_interactions 
      SET resulted_in_purchase = true
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }
  
  // ==================== ANALYTICS ====================
  
  async getAgentStats() {
    const query = `
      SELECT 
        agent_type,
        COUNT(*) as total_interactions,
        AVG(response_time_ms) as avg_response_time_ms,
        AVG(confidence_score) as avg_confidence,
        COUNT(*) FILTER (WHERE user_action IS NOT NULL) as actions_taken,
        COUNT(*) FILTER (WHERE resulted_in_purchase = true) as purchases,
        COUNT(*) FILTER (WHERE was_helpful = true) as helpful_count,
        COUNT(*) FILTER (WHERE was_helpful = false) as not_helpful_count,
        AVG(user_rating) FILTER (WHERE user_rating IS NOT NULL) as avg_rating
      FROM ai_interactions 
      GROUP BY agent_type
      ORDER BY total_interactions DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  async getConversionRate() {
    const query = `
      SELECT 
        agent_type,
        COUNT(*) as total_interactions,
        COUNT(*) FILTER (WHERE resulted_in_purchase = true) as purchases,
        ROUND(
          (COUNT(*) FILTER (WHERE resulted_in_purchase = true)::DECIMAL / 
           NULLIF(COUNT(*), 0) * 100),
          2
        ) as conversion_rate_percent
      FROM ai_interactions 
      WHERE agent_type = 'product_recommendation'
      GROUP BY agent_type
    `;
    
    const result = await db.query(query);
    return result.rows[0];
  }
  
  async getPerformanceByDate(days = 30) {
    const query = `
      SELECT 
        DATE(created_at) as interaction_date,
        COUNT(*) as total_interactions,
        AVG(response_time_ms) as avg_response_time_ms,
        COUNT(*) FILTER (WHERE resulted_in_purchase = true) as purchases
      FROM ai_interactions 
      WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY interaction_date DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
  
  async getTopRecommendedProducts(limit = 10) {
    const query = `
      SELECT 
        UNNEST(product_ids) as product_id,
        COUNT(*) as recommendation_count
      FROM ai_interactions 
      WHERE product_ids IS NOT NULL
      GROUP BY product_id
      ORDER BY recommendation_count DESC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  }
  
  async getUserSatisfaction() {
    const query = `
      SELECT 
        AVG(user_rating) FILTER (WHERE user_rating IS NOT NULL) as avg_rating,
        COUNT(*) FILTER (WHERE user_rating >= 4) as positive_ratings,
        COUNT(*) FILTER (WHERE user_rating <= 2) as negative_ratings,
        COUNT(*) FILTER (WHERE was_helpful = true) as helpful_count,
        COUNT(*) FILTER (WHERE was_helpful = false) as not_helpful_count
      FROM ai_interactions
    `;
    
    const result = await db.query(query);
    return result.rows[0];
  }
}

module.exports = new AIInteractionsModel();
