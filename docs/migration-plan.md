# Nutritional Tracker Migration Plan: Phase 3 (Final Consolidation)

**Status Update (January 2026):**
- ✅ **Phase 1 Complete:** File-based data entry system.
- ✅ **Phase 2 Complete:** PostgreSQL database integration for data entry.
- ✅ **Auth Implemented:** OIDC (Google) authentication with user authorization.
- 🔄 **Phase 3 In Progress:** Full migration of visualization and historical data to database.

---

## 1. Current System State

The system currently operates in a **hybrid mode**:
- **Data Entry (Write):** Writes directly to **PostgreSQL** via `SQLModelStorage`.
- **Visualization (Read):** Reads from **Google Sheets** or local CSVs via `loaders.py`.
- **Authentication:** Secured via `dash-auth` (OIDC) and an authorized users allowlist.

### Architecture Overview

| Component | Implementation | Status |
|-----------|----------------|--------|
| **Database** | PostgreSQL 15+ | ✅ Active |
| **ORM** | SQLModel (SQLAlchemy + Pydantic) | ✅ Active |
| **Data Entry** | Dash UI -> `SQLModelStorage` -> DB | ✅ Active |
| **Visualization** | Dash UI <- `loaders.py` <- Google Sheets | ⚠️ Legacy (To be migrated) |
| **Auth** | OIDC (Google) + `auth_utils.py` | ✅ Active |
| **Hosting** | Docker / Local | ✅ Active |

### Implemented Features (Phase 1 & 2)

#### Database Layer (`nutritional/database/`)
- **Schema:** Fully defined in `models.py` using SQLModel.
  - `FoodItemModel`: Master food database.
  - `FoodEntryModel`: Daily food logs.
  - `DailySummaryModel`: Daily weight and totals.
  - `DailyTargetsModel`: Configurable daily nutrient targets.
- **Infrastructure:** `setup.sh` and `init.sql` for PostgreSQL provisioning.
- **Connection:** `connection.py` handles engine creation and session management.

#### Application Layer (`nutritional/`)
- **Storage Factory:** `storage_factory.py` deleted, use`SQLModelStorage`.
- **Authentication:** `auth_utils.py` manages access control based on email allowlist.
- **UI:** Multi-page Dash application (`pages/`) with:
  - **Dashboard:** Overview of progress (currently reading legacy data).
  - **Daily Entry:** Database-backed food logging.
  - **Food Database:** Database-backed CRUD for food items.
  - **History:** Historical view.

---

## 2. Phase 3 Plan: Full Migration & Consolidation

**Goal:** Eliminate the dependency on Google Sheets and JSON/CSV files. The application will read and write exclusively to PostgreSQL.

### Step 3.1: Data Migration (One-off) 🔄
Create scripts to migrate existing data from the file-based system to PostgreSQL.

1.  **Food Database Migration:**
    -   Source: `nutritional_data/food_database.json`
    -   Target: `food_items` table
    -   Action: Upsert based on food name.

2.  **History & Entries Migration:**
    -   Source: `nutritional_data/history.jsonl` and `nutritional_data/daily_entries/*.json`
    -   Target: `food_entries` table
    -   Action: Parse dates and food IDs, insert records.

3.  **Daily Targets Migration:**
    -   Source: `nutritional_data/daily_targets.json`
    -   Target: `daily_targets` table

4.  **Weight/Summary Migration:**
    -   Source: `nutritional_data/daily_summaries.csv` (or Google Sheets)
    -   Target: `daily_summaries` table (for weight logs)

### Step 3.2: Visualization Layer Refactor 🛠️
Update the data loading pipeline to fetch data from the database instead of Google Sheets.

1.  **Update `nutritional/data/loaders.py`:**
    -   Replace `load_from_google_sheets` calls with database queries.
    -   Implement `load_from_db` function that returns data in the format expected by the plotting functions (likely Pandas DataFrames or structured dictionaries).
    -   Ensure `get_data_source` defaults to DB.

2.  **Update Plotting Modules:**
    -   Verify `nutritional/plotting/` functions work with the data types returned by the new DB loader.
    -   Adjust column names if necessary to match DB schema (or alias them in the loader).

### Step 3.3: Cleanup & Decommission 🧹
Once visualization is confirmed working with DB data:

1.  **Remove Legacy Code:**
    -   Delete `nutritional/data/google_sheets.py`.
    -   Remove Google Sheets credentials and `gspread` dependency.
    -   Remove `nutritional_data/` JSON/CSV handling code from `loaders.py`.

2.  **Remove Legacy Data:**
    -   Archive `nutritional_data/` folder.
    -   Remove `daily_entries/` JSON files.

### Step 3.4: Deployment & Operations 🚀
1.  **Backup Strategy:** Implement `pg_dump` automation (already partially in `database/db.sh`).
2.  **Environment:** Update `.env.example` to remove Google Sheets variables.
3.  **Docker:** Finalize `docker-compose.yml` for a self-contained App + DB deployment.

---

## 3. Execution Checklist

- [ ] Create `scripts/migrate_foods.py`
- [ ] Create `scripts/migrate_history.py`
- [ ] Run migration scripts on production DB
- [ ] Refactor `loaders.py` to query PostgreSQL
- [ ] Verify Dashboard plots match historical data
- [ ] Remove `google-api-python-client` and `gspread` from `pyproject.toml`
- [ ] Delete `nutritional/data/google_sheets.py`
- [ ] Update documentation (README)
