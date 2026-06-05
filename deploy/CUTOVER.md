# Cutover Runbook: Python/Dash → Next.js

The database schema is unchanged — the new app connects to the same postgres.
Rollback at every step is: stop the node unit, start the python unit.

## 0. Prerequisites (do these before cutover day)

- [ ] **Google OAuth redirect URI**: add `https://<your-domain>/api/auth/callback/google`
      to the OAuth client in Google Cloud Console. (The old dash-auth URI can stay
      until the python app is retired.) Logins break without this.
- [ ] **Node 22 LTS on the VM**:
      `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs`
- [ ] **App dirs + env**:
      ```bash
      mkdir -p ~/apps/nutritional/{releases,shared}
      cp .env.example ~/apps/nutritional/shared/.env   # fill in real values
      chmod 600 ~/apps/nutritional/shared/.env
      sudo mkdir -p /var/log/nutritional && sudo chown $USER /var/log/nutritional
      ```
      Env mapping from the old app:
      | old | new |
      |---|---|
      | `DATABASE_URL` | `DATABASE_URL` (unchanged) |
      | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` |
      | `OIDC_SECRET_KEY` | `AUTH_SECRET` (regenerate: `openssl rand -base64 33`) |
      | `AUTHORIZED_USERS_FILE` | `AUTHORIZED_EMAILS` (comma-separated) |
      | — | `AUTH_URL=https://<your-domain>`, `AUTH_TRUST_HOST=true` |
- [ ] **Systemd unit**: edit `deploy/nutritional-next.service` (YOUR_USER), then
      `sudo cp` to `/etc/systemd/system/`, `sudo systemctl daemon-reload`.
- [ ] **Parity verified locally** against a restored prod dump:
      ```bash
      # on VM:  cd database && ./db.sh backup
      # local:  scp vm:~/backups/<dump>.sql.gz . && docker compose up -d
      gunzip -c <dump>.sql.gz | docker exec -i nutritional_db psql -U nutritional_user nutritional_db
      npx tsx scripts/parity/daily-summary.ts
      npx tsx scripts/parity/write-cycle.ts
      ```

## 1. Backup (cutover day)

```bash
cd ~/apps/nutritional-python/database      # wherever the old repo lives
./db.sh backup                             # timestamped .sql.gz
# copy it OFF the VM:
#   (local) scp vm:~/backups/<dump>.sql.gz ./prod-backup-pre-cutover.sql.gz
npx tsx scripts/parity/row-counts.ts       # record the counts (or psql equivalents)
```
Optionally take a GCP disk snapshot of the VM.

## 2. Deploy the node app (not yet serving)

Either trigger the **Deploy** GitHub Actions workflow, or locally:
```bash
./scripts/deploy.sh user@vm-host
```
This builds off-VM, rsyncs to `releases/<sha>`, repoints `current`, and
restarts `nutritional-next`. The unit will fail the first time if the python
app still holds port 8050 — that's expected; proceed to step 3.

## 3. Swap services (same port 8050 → nginx untouched)

```bash
sudo systemctl stop nutritional          # old python unit
sudo systemctl disable nutritional
sudo systemctl start nutritional-next
sudo systemctl status nutritional-next
```

## 4. Smoke test

- [ ] Sign in with Google through the public URL
- [ ] Dashboard renders all three charts with historical data
- [ ] Add a test food entry on today's date; edit its amount inline; delete it
- [ ] Enter a morning weight; verify in psql:
      `SELECT * FROM daily_summaries ORDER BY summary_date DESC LIMIT 1;`
- [ ] Re-run row counts — must match step 1 plus exactly the test deltas
- [ ] `free -m` — steady state should be well under 1GB:
      `systemctl status nutritional-next postgresql nginx | grep -i memory`

## 5. Rollback (if anything is wrong)

```bash
sudo systemctl stop nutritional-next
sudo systemctl enable --now nutritional   # python app, untouched on disk
```
The DB was never migrated, so rollback is purely a service swap.
Keep the python venv + repo on the VM for ~2 weeks after a clean cutover.

## 6. After 2 stable weeks

- Remove the python app dir + venv from the VM
- Remove the old `nutritional.service` unit
- Remove the old dash-auth redirect URI from Google Cloud Console
