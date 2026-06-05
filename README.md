# nutritional

[![CI](https://github.com/tom-charman/nutritional/actions/workflows/ci.yml/badge.svg)](https://github.com/tom-charman/nutritional/actions/workflows/ci.yml)

Personal nutrition tracker — Next.js + Drizzle + d3 over PostgreSQL, sized to
run (app + postgres + nginx) inside a 1 GB GCP e2-micro.

## Features

- **Dashboard** — three d3 charts over `daily_summaries`: calories vs weight
  (dual axis, 30-day rolling average, morning/evening weight band), macro
  breakdown (stacked kcal: protein / other carbs / sugar / other fat /
  saturated fat), and nutrients normalized to % of RDI.
- **Daily Entry** — searchable food + meal selector with live nutrient
  preview, inline-editable log entries, collapsible meal entries, calories
  remaining, 8 macro progress bars vs per-nutrient target/limit modes,
  sticky daily targets, and independent morning/evening weight tracking.
- **Food Database** — master-detail CRUD with per-100g / per-item unit types.
- **Auth** — Google sign-in (Auth.js, JWT sessions) with an email allowlist.

## Stack

- **Next.js** (App Router, standalone output) + **TypeScript**
- **Drizzle ORM** + **postgres.js** (pool max 4 — tuned for the 1 GB VM)
- **d3** submodules only (`d3-scale`, `d3-shape`, `d3-array`)
- **vitest** + **PGlite** (data-layer tests run against the real schema)
- **PostgreSQL 15** — schema in `database/init.sql` (unchanged from v1;
  `updated_at` is trigger-maintained, never set by the app)

## Development

```bash
# 1. local postgres (applies database/init.sql on first run)
docker compose up -d

# 2. env
cp .env.example .env   # fill in Google OAuth credentials + allowlist

# 3. run
npm install
npm run dev            # http://localhost:3000
```

Tests and checks:

```bash
npm test               # vitest: domain logic + PGlite data layer
npm run typecheck
npm run build          # standalone production build
```

## Data-layer invariants

These mirror the original Python app and are guarded by tests in
`tests/data/storage.test.ts` and the parity scripts in `scripts/parity/`:

1. An empty day writes **NULL** nutrients to `daily_summaries`, never 0.
2. `saveDailyEntry` never touches the weight columns; weights are written
   only by `updateMeasurements`.
3. Saving a day is delete-all-for-date + reinsert; meal entries are
   `food_entries` rows sharing a `meal_id`.
4. Daily targets are sticky: existing row → most recent earlier row →
   defaults.

## Deployment

Production is a GCP e2-micro (1 GB RAM) running postgres + nginx + the app.
`next build` never runs on the VM — CI (or `scripts/deploy.sh`) builds the
standalone output and rsyncs it to `~/apps/nutritional/releases/<sha>`,
then repoints the `current` symlink and restarts the systemd unit
(`deploy/nutritional-next.service`, memory-capped at 448 MB).

- Runbook: [`deploy/CUTOVER.md`](deploy/CUTOVER.md)
- DB ops (backup/restore/tuning): [`database/`](database/) — `db.sh`,
  `DEPLOYMENT.md`, `postgresql.conf.template`
