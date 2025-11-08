// ================================================
// Database Configuration
// ================================================

require('dotenv').config();

const config = {
  development: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'autosmart_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    
    // Connection pool settings
    max: 20, // maximum number of clients in the pool
    idleTimeoutMillis: 30000, // close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // return error after 2 seconds if no connection available
    
    // SSL settings (disable for local development)
    ssl: false
  },
  
  production: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    
    // Connection pool settings
    max: 50, // more connections for production
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    
    // SSL settings (enable for production)
    ssl: {
      rejectUnauthorized: false // set to true with proper certificates
    }
  },
  
  test: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME_TEST || 'autosmart_test_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: false
  }
};

// Get the appropriate configuration based on NODE_ENV
const environment = process.env.NODE_ENV || 'development';
const dbConfig = config[environment];

module.exports = {
  config: dbConfig,
  environment
};
