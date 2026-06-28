#!/usr/bin/env bash
#
# Create a throwaway clone of the golden prod snapshot for destructive local
# testing. The clone gets the CURRENT code's schema applied on top (init.sql),
# so this also rehearses the production migration against real data.
#
# Usage:
#   scripts/db/clone-ephemeral.sh [db-name]      # default: nutritional_ephemeral
#
# Prints the DATABASE_URL to run the dev server against. Tear down with
# scripts/db/drop-ephemeral.sh when the session ends.
set -euo pipefail

GOLDEN="nutritional_prod_snapshot"
EPH="${1:-nutritional_ephemeral}"
CONTAINER="nutritional_db"

if ! docker exec "$CONTAINER" psql -U nutritional_user -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$GOLDEN'" | grep -q 1; then
  echo "✗ golden DB '$GOLDEN' not found — run scripts/db/snapshot-prod.sh <ssh-host> first" >&2
  exit 1
fi

echo "▶ Cloning '$GOLDEN' → ephemeral '$EPH'"
docker exec "$CONTAINER" psql -U nutritional_user -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $EPH WITH (FORCE);" \
  -c "CREATE DATABASE $EPH TEMPLATE $GOLDEN;" >/dev/null

echo "▶ Applying current schema (init.sql) — rehearses the prod migration"
docker exec -i "$CONTAINER" psql -U nutritional_user -d "$EPH" -q -v ON_ERROR_STOP=1 < database/init.sql >/dev/null

echo "  ✓ ephemeral clone '$EPH' ready (prod data + current schema)"
echo
echo "  Run the app against it:"
echo "    AUTH_DISABLED=true AUTHORIZED_EMAILS=dev@example.com TEST_USER_EMAIL=dev@example.com \\"
echo "      DATABASE_URL=postgresql://nutritional_user:dev_password@127.0.0.1:5432/$EPH \\"
echo "      npx next dev -p 3300"
echo
echo "  Tear down when done:  scripts/db/drop-ephemeral.sh $EPH"
