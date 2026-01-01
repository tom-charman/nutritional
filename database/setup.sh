#!/bin/bash
# PostgreSQL Setup Script for Debian 12 (Bookworm)
# Optimized for 1GB RAM (Google Cloud E2-micro)
# Usage: sudo ./setup.sh <password> [--force]
# Run as root: sudo ./setup.sh "MySecurePassword123!"
# Force recreate: sudo ./setup.sh "MySecurePassword123!" --force

set -e  # Exit on error

# Check if password argument is provided
if [ $# -lt 1 ]; then
    echo -e "${RED}Error: Password argument required${NC}"
    echo "Usage: sudo ./setup.sh <password> [--force]"
    echo "Example: sudo ./setup.sh 'MySecurePassword123!'"
    echo "Force recreate: sudo ./setup.sh 'MySecurePassword123!' --force"
    exit 1
fi

DB_PASSWORD="$1"
FORCE_RECREATE="no"

# Check for --force flag
if [ "$2" = "--force" ]; then
    FORCE_RECREATE="yes"
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}PostgreSQL Setup for Nutritional Tracker${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Detect PostgreSQL version
PG_VERSION=$(ls /etc/postgresql/ 2>/dev/null | head -n1)
if [ -z "$PG_VERSION" ]; then
    echo -e "${RED}Error: PostgreSQL is not installed${NC}"
    echo "Install with: sudo apt install -y postgresql-15 postgresql-contrib-15"
    exit 1
fi

echo -e "${GREEN}✓ Found PostgreSQL version: $PG_VERSION${NC}"

# Set paths
PG_CONF_DIR="/etc/postgresql/$PG_VERSION/main"
PG_DATA_DIR="/var/lib/postgresql/$PG_VERSION/main"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if database or user already exists
DB_EXISTS=$(sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw nutritional_db && echo "yes" || echo "no")
USER_EXISTS=$(sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='nutritional_user';" | grep -q "1 row" && echo "yes" || echo "no")

if [ "$DB_EXISTS" = "yes" ]; then
    echo -e "${YELLOW}⚠ Database 'nutritional_db' already exists${NC}"
    if [ "$FORCE_RECREATE" = "yes" ]; then
        echo "Force flag detected. Recreating database..."
        REPLY="yes"
    else
        read -p "Do you want to recreate it? This will DELETE ALL DATA! (yes/no): " -r
        echo
    fi
    if [[ $REPLY == "yes" ]]; then
        echo "Dropping existing database and user..."
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS nutritional_db;"
        sudo -u postgres psql -c "DROP USER IF EXISTS nutritional_user;"
    else
        echo "Keeping existing database. Skipping database creation."
        SKIP_DB_CREATE=1
    fi
elif [ "$USER_EXISTS" = "yes" ]; then
    echo -e "${YELLOW}⚠ User 'nutritional_user' exists but database 'nutritional_db' does not${NC}"
    if [ "$FORCE_RECREATE" = "yes" ]; then
        echo "Force flag detected. Recreating user..."
        REPLY="yes"
    else
        read -p "Do you want to recreate the user and database? (yes/no): " -r
        echo
    fi
    if [[ $REPLY == "yes" ]]; then
        echo "Dropping existing user..."
        sudo -u postgres psql -c "DROP USER IF EXISTS nutritional_user;"
    else
        echo "Keeping existing user. Skipping database creation."
        SKIP_DB_CREATE=1
    fi
fi

# Create database and user
if [ -z "$SKIP_DB_CREATE" ]; then
    echo ""
    echo -e "${GREEN}Step 1: Creating database and user${NC}"
    echo -e "${BLUE}=========================================${NC}"
    echo -e "${GREEN}Using provided password${NC}"
    echo ""

    # Create user and database with the provided password
    echo "Creating user and database..."
    sudo -u postgres psql <<EOF
-- Create user with secure password
CREATE USER nutritional_user WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE nutritional_db
    WITH
    OWNER = nutritional_user
    ENCODING = 'UTF8'
    LC_COLLATE = 'C.UTF-8'
    LC_CTYPE = 'C.UTF-8'
    TEMPLATE = template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE nutritional_db TO nutritional_user;
EOF

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to create user or database${NC}"
        exit 1
    fi

    # Connect to the database to set up extensions
    echo "Setting up database extensions..."
    sudo -u postgres psql -d nutritional_db <<EOF
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant usage on extensions
GRANT ALL ON SCHEMA public TO nutritional_user;
EOF

    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Failed to set up database extensions${NC}"
        exit 1
    fi

    # Save password to a secure file
    echo "$DB_PASSWORD" > "$SCRIPT_DIR/.db_password"
    chmod 600 "$SCRIPT_DIR/.db_password"
    echo ""
    echo -e "${YELLOW}Password saved to: $SCRIPT_DIR/.db_password${NC}"
    echo -e "${YELLOW}Add to your .env file, then DELETE this file!${NC}"
fi

    echo -e "${GREEN}✓ Database and user created${NC}"

# Create tables
echo ""
echo -e "${GREEN}Step 2: Creating database schema${NC}"
sudo -u postgres psql -d nutritional_db -f "$SCRIPT_DIR/init.sql"
echo -e "${GREEN}✓ Schema created successfully${NC}"

# Apply optimized configuration
echo ""
echo -e "${GREEN}Step 3: Applying optimized PostgreSQL configuration${NC}"

# Create conf.d directory if it doesn't exist
mkdir -p "$PG_CONF_DIR/conf.d"

# Copy configuration
cp "$SCRIPT_DIR/postgresql.conf.template" "$PG_CONF_DIR/conf.d/nutritional.conf"
chown postgres:postgres "$PG_CONF_DIR/conf.d/nutritional.conf"
echo -e "${GREEN}✓ Configuration applied${NC}"

# Update main postgresql.conf to include conf.d
if ! grep -q "^include_dir = 'conf.d'" "$PG_CONF_DIR/postgresql.conf"; then
    echo "" >> "$PG_CONF_DIR/postgresql.conf"
    echo "# Include custom configurations" >> "$PG_CONF_DIR/postgresql.conf"
    echo "include_dir = 'conf.d'" >> "$PG_CONF_DIR/postgresql.conf"
    echo -e "${GREEN}✓ Enabled conf.d directory${NC}"
fi

# Apply local-only security configuration
echo ""
echo -e "${GREEN}Step 4: Configuring local-only database access${NC}"
echo -e "${YELLOW}⚠ This restricts PostgreSQL to localhost connections only${NC}"

# Backup original pg_hba.conf
if [ ! -f "$PG_CONF_DIR/pg_hba.conf.backup" ]; then
    cp "$PG_CONF_DIR/pg_hba.conf" "$PG_CONF_DIR/pg_hba.conf.backup"
    echo -e "${GREEN}✓ Backed up original pg_hba.conf${NC}"
fi

# Apply local-only configuration
cp "$SCRIPT_DIR/pg_hba.conf.local" "$PG_CONF_DIR/pg_hba.conf"
chown postgres:postgres "$PG_CONF_DIR/pg_hba.conf"
chmod 640 "$PG_CONF_DIR/pg_hba.conf"
echo -e "${GREEN}✓ Applied local-only access rules${NC}"

# Ensure PostgreSQL only listens on localhost
if ! grep -q "^listen_addresses = 'localhost'" "$PG_CONF_DIR/postgresql.conf"; then
    # Comment out any existing listen_addresses
    sed -i "s/^listen_addresses/#listen_addresses/" "$PG_CONF_DIR/postgresql.conf"
    # Add our localhost-only setting
    echo "" >> "$PG_CONF_DIR/postgresql.conf"
    echo "# Security: Only listen on localhost" >> "$PG_CONF_DIR/postgresql.conf"
    echo "listen_addresses = 'localhost'" >> "$PG_CONF_DIR/postgresql.conf"
    echo -e "${GREEN}✓ Configured to listen on localhost only${NC}"
fi
systemctl restart postgresql
sleep 2

# Verify it's running
if systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
else
    echo -e "${RED}✗ PostgreSQL failed to start${NC}"
    echo "Check logs: sudo tail -f /var/log/postgresql/postgresql-$PG_VERSION-main.log"
    exit 1
fi

# Restart PostgreSQL
echo ""
echo -e "${GREEN}Step 5: Restarting PostgreSQL${NC}"
systemctl restart postgresql
sleep 2

# Verify it's running
if systemctl is-active --quiet postgresql; then
    echo -e "${GREEN}✓ PostgreSQL is running${NC}"
else
    echo -e "${RED}✗ PostgreSQL failed to start${NC}"
    echo "Check logs: sudo tail -f /var/log/postgresql/postgresql-$PG_VERSION-main.log"
    exit 1
fi

# Test connection
echo ""
echo -e "${GREEN}Step 6: Testing connection${NC}"
if sudo -u postgres psql -d nutritional_db -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
else
    echo -e "${RED}✗ Database connection failed${NC}"
    exit 1
fi

# Display summary
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Database Details:"
echo "  Host: localhost (127.0.0.1)"
echo "  Port: 5432"
echo "  Database: nutritional_db"
echo "  User: nutritional_user"
if [ -f "$SCRIPT_DIR/.db_password" ]; then
    echo "  Password: (saved in .db_password)"
fi
echo ""
echo -e "${YELLOW}⚠ SECURITY CONFIGURATION APPLIED:${NC}"
echo "  ✓ Using provided password"
echo "  ✓ PostgreSQL listens on localhost ONLY"
echo "  ✓ Remote connections BLOCKED"
echo "  ✓ Only same-server access allowed"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "1. Copy password from: $SCRIPT_DIR/.db_password"
echo "2. Update your .env file:"
echo "   DATABASE_URL=postgresql://nutritional_user:PASSWORD@localhost:5432/nutritional_db"
echo "3. DELETE the password file: rm $SCRIPT_DIR/.db_password"
echo ""
echo "Memory-optimized settings applied for 1GB RAM:"
echo "  - shared_buffers: 128MB"
echo "  - work_mem: 4MB"
echo "  - maintenance_work_mem: 32MB"
echo "  - max_connections: 20"
echo ""
echo -e "${GREEN}=========================================${NC}"
