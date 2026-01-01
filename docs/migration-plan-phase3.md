# Nutritional Tracker Migration Plan: Phase 3 (Final Consolidation)

**Status Update (January 2026):**
- ✅ **Phase 1 Complete:** File-based data entry system.
- ✅ **Phase 2 Complete:** PostgreSQL database integration for data entry.
- ✅ **Auth Implemented:** OIDC (Google) authentication with user authorization.
- 🔄 **Phase 3 In Progress:** Full migration of historical data from Google Sheets and visualization switchover.

---

## 1. Current System State

The system currently operates in a **hybrid mode**:
- **Data Entry (Write):** Writes directly to **PostgreSQL** via `SQLModelStorage`.
- **Visualization (Read):** Reads from **Google Sheets** via `loaders.py`.
- **Historical Data:** The "master" record of history and food items currently resides in **Google Sheets**.

### Architecture Overview

| Component | Implementation | Status |
|-----------|----------------|--------|
| **Database** | PostgreSQL 15+ | ✅ Active (Data Entry) |
| **ORM** | SQLModel (SQLAlchemy + Pydantic) | ✅ Active |
| **Data Entry** | Dash UI -> `SQLModelStorage` -> DB | ✅ Active |
| **Visualization** | Dash UI <- `loaders.py` <- Google Sheets | ⚠️ Legacy (To be migrated) |
| **Auth** | OIDC (Google) + `auth_utils.py` | ✅ Active |

---

## 2. Phase 3 Plan: Full Migration & Consolidation

**Goal:** Migrate all historical data (Food Database, History, Daily Summaries) from Google Sheets to PostgreSQL and switch the visualization layer to read from the database.

### Step 3.1: Data Migration (Google Sheets -> PostgreSQL) 🔄
Create a migration script (`scripts/migrate_from_sheets.py`) to pull data from the Google Sheets API and populate the PostgreSQL database.

1.  **Food Database Migration:**
    -   **Source:** Google Sheets "Nutrients" tab.
    -   **Target:** `food_items` table.
    -   **Logic:**
        -   Read all rows from "Nutrients".
        -   Map columns (Energy, Fat, etc.) to `FoodItemModel` fields.
        -   Generate UUIDs for items.
        -   Upsert based on Name to avoid duplicates.

2.  **History Migration:**
    -   **Source:** Google Sheets "History" tab.
    -   **Target:** `food_entries` table.
    -   **Logic:**
        -   Read all rows from "History".
        -   Match food names to `food_items` table to get UUIDs.
        -   Parse dates and weights/quantities.
        -   Insert into `FoodEntryModel`.
        -   *Note:* Handle cases where historical food names might not match the current "Nutrients" tab exactly (fuzzy match or log errors).

3.  **Daily Summaries/Weight Migration:**
    -   **Source:** Google Sheets "Daily" tab.
    -   **Target:** `daily_summaries` table.
    -   **Logic:**
        -   Read "Date", "Morning Weight", "Evening Weight".
        -   Insert/Update `DailySummaryModel`.

### Step 3.2: Visualization Layer Refactor 🛠️
Update the data loading pipeline to fetch data from the database instead of Google Sheets.

1.  **Update `nutritional/data/loaders.py`:**
    -   Create `load_from_db()` function using `SQLModel` queries.
    -   Ensure it returns data structures compatible with existing plotting functions (Pandas DataFrames).
    -   Switch `get_data_source()` to call `load_from_db()` by default.

2.  **Update Plotting Modules:**
    -   Verify `nutritional/plotting/` functions work with the DB-sourced data.
    -   The DB loader should likely return a dictionary of DataFrames similar to what `load_from_google_sheets` returns (`df_history`, `df_daily`, `df_nutrients`).

### Step 3.3: Cleanup & Decommission 🧹
Once the database is the single source of truth:

1.  **Remove Legacy Code:**
    -   Delete `nutritional/data/google_sheets.py`.
    -   Remove `google-api-python-client`, `google-auth`, `gspread` dependencies.
    -   Remove Google Sheets credentials from environment variables.

2.  **Archive:**
    -   The Google Sheet can be archived/made read-only.

### Step 3.4: Deployment & Operations 🚀
1.  **Backup Strategy:** Ensure `pg_dump` backups are running.
2.  **Environment:** Update `.env` to remove `GOOGLE_SHEETS_ID` and `GOOGLE_CREDENTIALS_PATH`.

---

## 3. Execution Checklist

- [ ] Create `scripts/migrate_from_sheets.py`
    - [ ] Implement `fetch_sheet_data` (using existing `GoogleSheetsClient`)
    - [ ] Implement `migrate_foods`
    - [ ] Implement `migrate_history`
    - [ ] Implement `migrate_daily_summaries`
- [ ] Run migration script on production DB
- [ ] Refactor `loaders.py` to query PostgreSQL
- [ ] Verify Dashboard plots match historical data
- [ ] Remove Google Sheets dependencies from `pyproject.toml`
- [ ] Delete `nutritional/data/google_sheets.py`
- [ ] Update documentation (README)
