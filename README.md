# AutoSmart Parts

A modern e-commerce platform for automotive parts with AI-powered customer support and intelligent product recommendations.

## Overview

AutoSmart Parts is a full-stack web application built with React and Node.js, featuring:
- AI-powered product recommendations and customer support
- Comprehensive order management system
- Support ticket system with AI assistance
- Real-time inventory tracking
- Shopping cart and checkout functionality
- User authentication and authorization
- Analytics and reporting

## Tech Stack

### Frontend
- React 18.2
- React Router DOM 6.20
- Vite 7.2 (Build tool)

### Backend
- Node.js with Express 4.18
- PostgreSQL database
- JWT authentication
- OpenAI API integration

### Key Dependencies
- `pg` - PostgreSQL client
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `openai` - AI integration
- `multer` - File upload handling
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variable management

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn package manager

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd autoparts
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

#### Create PostgreSQL Database

Open PostgreSQL command line or use a GUI tool like pgAdmin:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create the database
CREATE DATABASE autosmart_db;

# Connect to the database
\c autosmart_db
```

#### Run Schema Script

Execute the schema file to create all tables:

```bash
# Option 1: Using psql command line
psql -U postgres -d autosmart_db -f schema.sql

# Option 2: Using PostgreSQL interactive shell
\i /path/to/schema.sql
```

#### (Optional) Load Seed Data

If you want to populate the database with sample data:

```bash
psql -U postgres -d autosmart_db -f seed_data.sql
```

#### Verify Database Setup

```sql
-- List all tables
\dt

-- Check if tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';
```

### 4. Environment Configuration

Create a `.env` file in the root directory (or update the existing one):

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=autosmart_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# Security
JWT_SECRET=your_jwt_secret_here
ADMIN_TOKEN=your_admin_token_here
```

**Important:** Replace the placeholder values with your actual credentials:
- Get an OpenAI API key from https://platform.openai.com/api-keys
- Set a secure JWT_SECRET (random string, at least 32 characters)
- Set your PostgreSQL password
- Set a secure ADMIN_TOKEN for admin operations

### 5. Verify Database Connection

Test the database connection:

```bash
node server/db/config.js
```

## Running the Application

### Development Mode

Run both frontend and backend concurrently:

```bash
# Terminal 1 - Start the backend server
npm run server

# Terminal 2 - Start the frontend dev server
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Production Build

Build the frontend for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Database Schema

The database includes the following main tables:
- `users` - User accounts and authentication
- `products` - Product catalog
- `orders` - Order management
- `order_items` - Order line items
- `support_tickets` - Customer support tickets
- `ai_interactions` - AI conversation logs
- `shopping_carts` - Shopping cart data
- `cart_items` - Cart line items
- `analytics_events` - User analytics
- `notifications` - User notifications
- `audit_logs` - System audit trail

See [schema.sql](schema.sql) for complete schema details.

## Project Structure

```
autoparts/
├── src/                    # Frontend React application
├── server/                 # Backend Node.js application
│   ├── server.js          # Main server file
│   ├── db/                # Database configuration and models
│   ├── analytics.js       # Analytics functionality
│   └── uploads/           # File upload directory
├── public/                # Static assets
├── schema.sql            # Database schema
├── seed_data.sql         # Sample data
├── .env                  # Environment variables
├── package.json          # Dependencies and scripts
└── vite.config.js       # Vite configuration
```

## API Endpoints

The backend server provides RESTful API endpoints for:
- User authentication and management
- Product catalog operations
- Order processing
- Shopping cart operations
- Support ticket management
- AI-powered features

## Troubleshooting

### Database Connection Issues

If you encounter database connection errors:
1. Verify PostgreSQL is running: `pg_isready`
2. Check database credentials in `.env`
3. Ensure the database exists: `psql -U postgres -l`
4. Check PostgreSQL is listening on port 5432

### Port Already in Use

If port 3001 or 5173 is already in use:
1. Change the PORT in `.env` for backend
2. Update vite.config.js for frontend port

### Module Not Found Errors

```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Development

### Available Scripts

- `npm run dev` - Start Vite development server
- `npm run server` - Start backend server