#!/usr/bin/env bash
#
# Pull a fresh snapshot of the PRODUCTION database and load it into a local
# "golden" database that destructive test clones are spun off from.
#
# Usage:
#   scripts/db/snapshot-prod.sh <ssh-host>
#     <ssh-host> is the ssh-resolvable VM alias (no user@), same as deploy.sh.
#
# What it does:
#   1. ssh + `sudo -u postgres pg_dump` on the VM, gzipped, streamed to the
#      KNOWN local location  database/snapshots/prod-latest.sql.gz  (gitignored).
#   2. (re)creates the local golden DB `nutritional_prod_snapshot` from that dump.
#
# The golden DB is PRISTINE prod (prod's schema). It is never run against
# directly — clone-ephemeral.sh makes a throwaway copy and applies the current
# code's schema to it. Re-run any time to refresh from prod.
set -euo pipefail

VM="${1:?usage: snapshot-prod.sh <ssh-host>  (no user@ prefix — see deploy/README.md)}"
PROD_DB="nutritional_db"
CONTAINER="nutritional_db"
GOLDEN="nutritional_prod_snapshot"
SNAP_DIR="database/snapshots"
SNAP="$SNAP_DIR/prod-latest.sql.gz"

mkdir -p "$SNAP_DIR"

echo "▶ Dumping prod ($VM:$PROD_DB) → $SNAP"
ssh -o BatchMode=yes "$VM" "sudo -n -u postgres pg_dump --no-owner --no-privileges $PROD_DB | gzip" > "$SNAP"
echo "  ✓ snapshot saved ($(du -h "$SNAP" | cut -f1))"

echo "▶ Loading snapshot → local golden DB '$GOLDEN' (drop + recreate)"
docker exec "$CONTAINER" psql -U nutritional_user -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS $GOLDEN WITH (FORCE);" \
  -c "CREATE DATABASE $GOLDEN;" >/dev/null
gunzip -c "$SNAP" | docker exec -i "$CONTAINER" psql -U nutritional_user -d "$GOLDEN" -q -v ON_ERROR_STOP=1
echo "  ✓ golden DB ready:"
docker exec "$CONTAINER" psql -U nutritional_user -d "$GOLDEN" -tAc \
  "SELECT '    users=' || count(*) || '  food_entries=' || (SELECT count(*) FROM food_entries) FROM users"

echo "Done. Spin up a throwaway test DB with: scripts/db/clone-ephemeral.sh"
