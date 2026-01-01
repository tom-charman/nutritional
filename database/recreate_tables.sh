#!/bin/bash
# Recreate database tables with updated schema
# Usage: sudo ./recreate_tables.sh
# This drops all tables and recreates them - USE WITH CAUTION

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${YELLOW}=========================================${NC}"
echo -e "${YELLOW}Recreate Database Tables${NC}"
echo -e "${YELLOW}=========================================${NC}"
echo ""
echo -e "${RED}⚠️  WARNING: This will DELETE ALL DATA!${NC}"
echo ""
echo "This script will:"
echo "  1. Drop all existing tables"
echo "  2. Recreate schema from init.sql"
echo ""
read -p "Are you SURE you want to continue? (type 'yes' to confirm): " -r
echo

if [[ $REPLY != "yes" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo -e "${GREEN}Dropping existing tables...${NC}"

# Drop all tables (CASCADE will drop dependent objects)
sudo -u postgres psql -d nutritional_db <<EOF
DROP TABLE IF EXISTS daily_targets CASCADE;
DROP TABLE IF EXISTS daily_summaries CASCADE;
DROP TABLE IF EXISTS food_entries CASCADE;
DROP TABLE IF EXISTS food_items CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
EOF

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to drop tables${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Tables dropped${NC}"
echo ""
echo -e "${GREEN}Creating new schema from init.sql...${NC}"

# Recreate schema
sudo -u postgres psql -d nutritional_db -f "$SCRIPT_DIR/init.sql"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to create schema${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Schema created${NC}"
echo ""

# Verify tables exist
echo -e "${GREEN}Verifying tables...${NC}"
TABLE_COUNT=$(sudo -u postgres psql -d nutritional_db -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

echo "Tables created: $TABLE_COUNT"

if [ "$TABLE_COUNT" -ge 4 ]; then
    echo -e "${GREEN}✓ All tables created successfully${NC}"
else
    echo -e "${RED}✗ Expected at least 4 tables, found $TABLE_COUNT${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Tables Recreated Successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Tables in database:"
sudo -u postgres psql -d nutritional_db -c "\dt"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Run migration script to populate from Google Sheets:"
echo "   uv run python scripts/migrate_from_sheets.py"
echo ""
