#!/usr/bin/env bash
# Nightly backup of nutritional_db. Replaces the old root-crontab one-liner,
# which ran pg_dump as root (peer-auth failure) and gzip happily wrote a
# valid-but-empty archive — the && only guarded the chown.
#
# Install (as root on the VM):
#   cp deploy/nutritional-backup.sh /usr/local/bin/nutritional-backup.sh
#   chmod 755 /usr/local/bin/nutritional-backup.sh
#   crontab line: 0 2 * * * /usr/local/bin/nutritional-backup.sh >> /var/log/nutritional/backup.log 2>&1
set -euo pipefail

DIR=/home/rltc323/backups
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$DIR/nutritional_nightly_${STAMP}.sql.gz"
TMP="$OUT.partial"

mkdir -p "$DIR"
sudo -u postgres pg_dump nutritional_db | gzip > "$TMP"

# A failed/empty dump must never be mistaken for a good one:
# real dumps are >100KB and end with pg_dump's completion trailer.
SIZE="$(stat -c%s "$TMP")"
if [ "$SIZE" -lt 10240 ]; then
  echo "BACKUP FAILED ${STAMP}: only ${SIZE} bytes" >&2
  exit 1
fi
if ! gunzip -c "$TMP" | tail -10 | grep -q "PostgreSQL database dump complete"; then
  echo "BACKUP FAILED ${STAMP}: missing pg_dump completion trailer" >&2
  exit 1
fi

mv "$TMP" "$OUT"
chown rltc323:rltc323 "$OUT"
echo "BACKUP OK ${STAMP}: ${OUT} (${SIZE} bytes)"

# keep the 14 most recent nightlies
ls -t "$DIR"/nutritional_nightly_*.sql.gz | tail -n +15 | xargs -r rm
