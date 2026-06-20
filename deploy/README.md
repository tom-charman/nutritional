# Deploy & operate

How a release reaches production and how the running app is operated. Production
is a single GCP e2-micro (1 GB RAM, Debian 12) running PostgreSQL + nginx + the
Next.js app.

> **First time on a fresh VM?** None of the steps below apply until the box is
> provisioned. See [`SETUP.md`](SETUP.md) for one-time setup (instance, Postgres,
> nginx, SSL, service, backups). After that, deploying is just the few steps in
> [Ship a release](#ship-a-release).

## Ship a release

Deploys run **locally** from a clone with SSH access to the VM. The VM never
runs `next build` (1 GB RAM) — the standalone build is produced on your machine
and rsync'd over.

```bash
./scripts/deploy.sh <ssh-host>
```

`<ssh-host>` is whatever resolves the VM for plain `ssh` — typically the
gcloud-generated alias from `gcloud compute config-ssh` (e.g.
`instance-…-<zone>.<project>`). **Do not prefix a `user@`** — the alias (and
`~/.ssh/config`) already carry the login user; adding one overrides it and the
connection fails.

This does: `npm ci && npm run build`, assemble the standalone output (plus
`.next/static` and `public/`, which live outside it), rsync to `releases/<sha>`,
repoint the `current` symlink, `sudo systemctl restart nutritional-next`,
smoke-check `http://127.0.0.1:8050/api/auth/providers`, and prune to the 3
newest releases.

> ⚠️ **`deploy.sh` is a code swap only — it never migrates the database.** If the
> release adds or changes a table/column, you MUST apply the schema FIRST or the new
> code 500s against the old DB. The smoke check (`/api/auth/providers`) and an
> unauthenticated `curl /` (which 307-redirects to signin *before* the page's server
> component runs) both pass even when the authed pages are broken — so they won't
> catch a missing migration. See **Schema changes** below.

## Schema changes (migrations)

There is no ORM migration tool — `database/init.sql` is the single source of truth and
is **idempotent** (`CREATE TABLE IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`,
`DROP TRIGGER IF EXISTS`+`CREATE TRIGGER`, and a guarded `GRANT … TO nutritional_user`).
For any release that changes the schema, **before `deploy.sh`**:

```bash
# on the VM, from the cloned repo's database/ dir (git pull first so init.sql is current)
./db.sh backup           # safety net (nightly backups also exist)
./db.sh migrate          # applies init.sql idempotently + re-grants the app role, then
                         # verifies nutritional_user can read the new tables
```

**Ownership/grants gotcha (the reason `migrate` re-grants):** the VM applies `init.sql`
as the `postgres` superuser, so every table it creates is owned by `postgres` and is
invisible to the app role `nutritional_user` until granted — a missing grant on a new
table 500s the whole app with `permission denied for table …`. `init.sql` now re-grants
`ALL` on all tables/sequences to `nutritional_user` (and sets DEFAULT PRIVILEGES) on
every apply, so new tables are covered automatically. (Locally, docker runs `init.sql`
as `nutritional_user`, so ownership already covers it and the grant is a no-op.) Verify
after migrating: `sudo -u postgres psql -d nutritional_db -c "SET ROLE nutritional_user; SELECT 1 FROM <new_table>;"`.

## Layout on the VM

```
~/apps/nutritional/
├── releases/<sha>/      # each deploy lands here (standalone build)
├── current -> releases/<sha>   # symlink the service runs from
└── shared/.env          # secrets, chmod 600 (set up once, see SETUP.md)
```

The app listens on `127.0.0.1:8050`; nginx reverse-proxies to it. The systemd
unit is `nutritional-next` ([`nutritional-next.service`](nutritional-next.service)).

## Service management

```bash
sudo systemctl status nutritional-next
sudo systemctl restart nutritional-next
journalctl -u nutritional-next -f
```

Logs also go to `/var/log/nutritional/app.log` and `error.log`. The unit caps
memory (`NODE_OPTIONS=--max-old-space-size=192`, `MemoryHigh=320M`,
`MemoryMax=448M`) so a Node leak is killed before it can OOM PostgreSQL.

To change the unit, edit [`nutritional-next.service`](nutritional-next.service),
`sudo cp` it to `/etc/systemd/system/`, then `daemon-reload` and restart.

## Rollback

Releases are immutable, so rolling back is repointing the symlink to the previous
SHA:

```bash
PREV=$(ls -dt ~/apps/nutritional/releases/*/ | sed -n 2p)   # 2nd-newest
ln -sfn "$PREV" ~/apps/nutritional/current
sudo systemctl restart nutritional-next
```

The database is never touched by a deploy, so this is a pure code swap.

## Backups

Nightly `pg_dump` runs via [`nutritional-backup.sh`](nutritional-backup.sh)
(cron `0 2 * * *`, installed in [SETUP.md](SETUP.md#8-nightly-backups)). It
validates each dump (size + pg_dump completion trailer — an empty/failed dump
never overwrites a good one) and keeps the 14 most recent in `~/backups`.

Restore a dump with `database/db.sh restore <dump>.sql.gz`.

## Operations

```bash
# Resource usage
free -h && df -h
ps aux | grep postgres | awk '{sum+=$6} END {print "PostgreSQL: " sum/1024 " MB"}'

# DB maintenance (from the cloned repo's database/ dir)
./db.sh size      # database size + record counts
./db.sh vacuum    # run periodically
```

**App won't start** — `journalctl -u nutritional-next -n 50` and
`/var/log/nutritional/error.log`; check the `current` symlink resolves and
`shared/.env` is present.

**Out of memory** — confirm swap is active (`swapon -s`); if needed lower
PostgreSQL `max_connections` in `/etc/postgresql/15/main/conf.d/nutritional.conf`
and `sudo systemctl restart postgresql`.

**DB connection errors** — `sudo systemctl status postgresql`, check
`/var/log/postgresql/postgresql-15-main.log`, and
`sudo -u postgres psql -d nutritional_db -c "SELECT count(*) FROM pg_stat_activity;"`.

## Smoke test a deploy

- [ ] Sign in with Google through the public URL
- [ ] Dashboard renders all three charts with historical data
- [ ] Add a test food entry on today's date; edit its amount inline; delete it
- [ ] Enter a morning weight; verify in psql:
      `SELECT * FROM daily_summaries ORDER BY summary_date DESC LIMIT 1;`
- [ ] `free -m` — steady state well under 1 GB:
      `systemctl status nutritional-next postgresql nginx | grep -i memory`
