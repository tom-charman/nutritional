#!/usr/bin/env bash
# Build the Next.js standalone output locally and deploy it to the VM.
# The VM never runs `next build` (1GB RAM). GitHub Actions runs the same
# steps via .github/workflows/deploy.yml; this script is the manual fallback.
#
# Usage: ./scripts/deploy.sh <ssh-host> [app_dir]
#   <ssh-host> is an `ssh`-resolvable target — typically the gcloud alias from
#   `gcloud compute config-ssh`. Do NOT prefix a `user@`; the alias/ssh-config
#   already carries the login user and a `user@` override breaks the connection.
set -euo pipefail

VM="${1:?usage: deploy.sh <ssh-host> [app_dir]  (no user@ prefix — see deploy/README.md)}"
APP_DIR="${2:-apps/nutritional}"
SHA="$(git rev-parse --short HEAD)"
RELEASE_DIR="$APP_DIR/releases/$SHA"

echo "==> Building standalone output ($SHA)"
npm ci
npm run build

echo "==> Assembling artifact"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R .next/standalone/. "$STAGE/"
# Easy-to-miss: static assets and public/ are NOT inside standalone
mkdir -p "$STAGE/.next"
cp -R .next/static "$STAGE/.next/static"
cp -R public "$STAGE/public"

echo "==> Uploading to $VM:$RELEASE_DIR"
ssh "$VM" "mkdir -p $RELEASE_DIR"
rsync -az --delete "$STAGE/" "$VM:$RELEASE_DIR/"

echo "==> Activating release and restarting"
ssh "$VM" "
  set -e
  ln -sfn \$HOME/$RELEASE_DIR \$HOME/$APP_DIR/current
  sudo systemctl restart nutritional-next
  sleep 3
  curl -sf -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8050/api/auth/providers || {
    echo 'SMOKE CHECK FAILED'; exit 1;
  }
  # keep the 3 most recent releases
  ls -dt \$HOME/$APP_DIR/releases/*/ | tail -n +4 | xargs -r rm -rf
"

echo "==> Deployed $SHA"
