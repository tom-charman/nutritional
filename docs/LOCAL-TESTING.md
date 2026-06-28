# Local Testing with a Prod Snapshot

Realistic local testing without ever touching the live database. The flow:
**snapshot prod once → clone it per session → test destructively on the clone →
drop the clone.** The snapshot is stored locally and reused; only throwaway
clones are written to.

Prod currently holds a single user's own data, so a snapshot is safe to use
locally. Re-snapshot whenever you want fresh data.

## One-time / occasional: snapshot prod

```bash
scripts/db/snapshot-prod.sh <ssh-host>
```

- `<ssh-host>` is the ssh-resolvable VM alias (no `user@`), same as `deploy.sh`.
- Streams `sudo -u postgres pg_dump` from the VM, gzipped, to the **known
  location** `database/snapshots/prod-latest.sql.gz` (gitignored).
- Loads it into the local **golden** DB `nutritional_prod_snapshot` — pristine
  prod, never run against directly.

## Each dev session: clone, test, drop

```bash
# 1. throwaway clone of the golden DB, with the CURRENT code schema applied
#    (this also rehearses the production migration against real data)
scripts/db/clone-ephemeral.sh                 # creates nutritional_ephemeral

# 2. run the app against the clone (acting as a fresh authorised dev user)
AUTH_DISABLED=true AUTHORIZED_EMAILS=dev@example.com TEST_USER_EMAIL=dev@example.com \
  DATABASE_URL=postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_ephemeral \
  npx next dev -p 3300

# 3. when done — delete the ephemeral clone
scripts/db/drop-ephemeral.sh
```

The golden DB is pristine prod; the ephemeral clone is where destructive testing
(deletion, edits, the GDPR erasure script) happens. Dropping it after each
session means no prod-derived data lingers in a writable DB.

> Note: clones are made with `CREATE DATABASE … TEMPLATE`, which requires no
> open connections to the golden DB — that's why nothing ever connects to it
> directly.
