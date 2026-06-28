#!/usr/bin/env bash
#
# Drop a throwaway test clone created by clone-ephemeral.sh. Run at the end of
# each dev testing session so no prod-derived data lingers locally.
#
# Usage:
#   scripts/db/drop-ephemeral.sh [db-name]       # default: nutritional_ephemeral
set -euo pipefail

EPH="${1:-nutritional_ephemeral}"
CONTAINER="nutritional_db"

docker exec "$CONTAINER" psql -U nutritional_user -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $EPH WITH (FORCE);" >/dev/null
echo "✓ dropped ephemeral DB '$EPH'"
