-- Create database and user for nutritional tracker
-- Run as postgres superuser: sudo -u postgres psql -f create_db.sql

-- SECURITY: Set a secure password!
-- Generate one with: openssl rand -base64 32
-- DO NOT use the example below in production!
\prompt 'Enter password for nutritional_user: ' user_password
CREATE USER nutritional_user WITH PASSWORD :'user_password';

-- Create database
CREATE DATABASE nutritional_db
    WITH
    OWNER = nutritional_user
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE nutritional_db TO nutritional_user;

-- Connect to the database to set up extensions
\c nutritional_db

-- Enable UUID extension (needed for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant usage on extensions
GRANT ALL ON SCHEMA public TO nutritional_user;

-- Display confirmation
\echo '========================================='
\echo 'Database Setup Complete!'
\echo '========================================='
\echo 'Database: nutritional_db'
\echo 'User: nutritional_user'
\echo 'Password: (set securely - save it!)'
\echo ''
\echo 'Next step: Run init.sql to create tables'
\echo 'sudo -u postgres psql -d nutritional_db -f init.sql'
\echo ''
\echo 'Update .env with your password:'
\echo 'DATABASE_URL=postgresql://nutritional_user:YOUR_PASSWORD@localhost:5432/nutritional_db'
\echo '========================================='
