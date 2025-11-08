// ================================================
// Database Connection Pool
// ================================================

const { Pool } = require('pg');
const { config, environment } = require('./config');

// Create connection pool
const pool = new Pool(config);

// Event handlers for pool
pool.on('connect', (client) => {
  console.log(`✅ New database connection established (${environment})`);
});

pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle database client:', err);
  process.exit(-1);
});

pool.on('remove', (client) => {
  console.log('🔌 Database client connection removed from pool');
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`⚡ Executed query in ${duration}ms:`, {
      text: text.substring(0, 100),
      rows: result.rowCount
    });
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  }
};

// Helper function to get a client from the pool (for transactions)
const getClient = async () => {
  const client = await pool.connect();
  
  // Add query method to client
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  
  // Set a timeout to prevent client being held forever
  const timeout = setTimeout(() => {
    console.error('⚠️ Client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Override release to clear timeout
  client.release = () => {
    clearTimeout(timeout);
    client.query = originalQuery;
    client.release = originalRelease;
    return originalRelease();
  };
  
  return client;
};

// Helper function for transactions
const transaction = async (callback) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Health check function
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as current_time, version() as pg_version');
    return {
      status: 'healthy',
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version,
      poolTotal: pool.totalCount,
      poolIdle: pool.idleCount,
      poolWaiting: pool.waitingCount
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

// Graceful shutdown
const shutdown = async () => {
  try {
    await pool.end();
    console.log('🔌 Database pool has ended');
  } catch (error) {
    console.error('❌ Error during pool shutdown:', error);
  }
};

// Handle process termination
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = {
  pool,
  query,
  getClient,
  transaction,
  healthCheck,
  shutdown
};
