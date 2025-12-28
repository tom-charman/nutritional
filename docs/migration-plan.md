# Nutritional Tracker Migration Plan: Google Sheets → Database

## Current System Overview

### Existing Google Sheets Structure

1. **Nutrients Tab** - Reference database of food items
   - Columns: Item, Energy kcal, Fat, Saturated Fat, Carbohydrates, Sugar, Protein, Fibre, Salt, Calcium
   - Each row = nutritional values per 100g of an item
   - Acts as a master food database

2. **Day Tab** - Daily food tracking
   - Dropdown selectors linked to Nutrients tab
   - Weight column (grams consumed)
   - Auto-calculated nutrient columns using VLOOKUP formulas
   - Calculates: `(nutrient_per_100g * weight) / 100`

3. **History Tab** - Long-term food log
   - Manual copy-paste of completed Day entries
   - Full meal-by-meal historical record

4. **Daily Tab** - Daily totals summary *(currently consumed by the app)*
   - Manual entry of daily totals from Day tab
   - Columns: Date, Energy kcal, Fat, Saturated Fat, Carbohydrates, Sugar, Protein, Fibre, Salt, Calcium, Morning Weight, Evening Weight

### Current App Architecture

- **Data Layer**: [google_sheets.py](../nutritional/data/google_sheets.py), [loaders.py](../nutritional/data/loaders.py)
- **Visualization**: Plotly Dash with Bootstrap UI
- **Data Format**: NumPy arrays for efficient time-series processing
- **Features**: Date filtering, rolling averages, calorie/macro tracking, nutrient monitoring

---

## Migration Strategy: 3-Phase Approach

### Phase 1: File-Based Data Entry System
**Goal**: Build data entry interface without database dependency

#### 1.1 Data Model (JSON/CSV Storage)

```
nutritional_data/
├── food_database.json          # Nutrients tab equivalent
├── daily_entries/              # One file per day
│   ├── 2024-01-15.json
│   ├── 2024-01-16.json
│   └── ...
├── daily_summaries.csv         # Replaces Daily tab (current app data source)
└── history.jsonl               # Complete meal history (JSONL for append efficiency)
```

**File Formats**:

**food_database.json**:
```json
{
  "items": [
    {
      "id": "uuid-1234",
      "name": "Chicken Breast",
      "unit_type": "per_100g",
      "serving_size_g": null,
      "energy_kcal": 165,
      "fat_g": 3.6,
      "saturated_fat_g": 1.0,
      "carbohydrates_g": 0,
      "sugar_g": 0,
      "protein_g": 31,
      "fibre_g": 0,
      "salt_g": 0.1,
      "calcium_mg": 15,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": "uuid-5678",
      "name": "Medium Banana",
      "unit_type": "per_item",
      "serving_size_g": 118,
      "energy_kcal": 105,
      "fat_g": 0.4,
      "saturated_fat_g": 0.1,
      "carbohydrates_g": 27,
      "sugar_g": 14,
      "protein_g": 1.3,
      "fibre_g": 3.1,
      "salt_g": 0,
      "calcium_mg": 6,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**daily_entries/2024-01-15.json**:
```json
{
  "date": "2024-01-15",
  "entries": [
    {
      "entry_id": "uuid-entry-1",
      "timestamp": "2024-01-15T08:30:00",
      "food_id": "uuid-1234",
      "food_name": "Chicken Breast",
      "weight_g": 150,
      "quantity": null,
      "nutrients": {
        "energy_kcal": 247.5,
        "fat_g": 5.4,
        "saturated_fat_g": 1.5,
        "carbohydrates_g": 0,
        "sugar_g": 0,
        "protein_g": 46.5,
        "fibre_g": 0,
        "salt_g": 0.15,
        "calcium_mg": 22.5
      }
    },
    {
      "entry_id": "uuid-entry-2",
      "timestamp": "2024-01-15T12:45:00",
      "food_id": "uuid-5678",
      "food_name": "Medium Banana",
      "weight_g": null,
      "quantity": 1.5,
      "nutrients": {
        "energy_kcal": 157.5,
        "fat_g": 0.6,
        "saturated_fat_g": 0.15,
        "carbohydrates_g": 40.5,
        "sugar_g": 21,
        "protein_g": 1.95,
        "fibre_g": 4.65,
        "salt_g": 0,
        "calcium_mg": 9
      }
    }
  ],
  "measurements": {
    "morning_weight_kg": 75.2,
    "evening_weight_kg": 75.8
  },
  "totals": {
    "energy_kcal": 2100,
    "fat_g": 70,
    "saturated_fat_g": 20,
    "carbohydrates_g": 250,
    "sugar_g": 50,
    "protein_g": 150,
    "fibre_g": 30,
    "salt_g": 5,
    "calcium_mg": 800
  }
}
```

**history.jsonl** (JSON Lines - one entry per line):
```jsonl
{"date":"2024-01-15","entry_id":"uuid-entry-1","timestamp":"2024-01-15T08:30:00","food_id":"uuid-1234","food_name":"Chicken Breast","weight_g":150,"quantity":null,"nutrients":{"energy_kcal":247.5}}
{"date":"2024-01-15","entry_id":"uuid-entry-2","timestamp":"2024-01-15T12:45:00","food_id":"uuid-5678","food_name":"Brown Rice","weight_g":200,"quantity":null,"nutrients":{"energy_kcal":220}}
```

**daily_summaries.csv** (maintains compatibility with existing app):
```csv
Date,Energy kcal,Fat g,Saturated Fat g,Carbohydrates g,Sugar g,Protein g,Fibre g,Salt g,Calcium mg,Morning Weight kg,Evening Weight kg
2024-01-15,2100,70,20,250,50,150,30,5,800,75.2,75.8
```

#### 1.2 New Data Entry Module

Create `nutritional/data_entry/` module:

```
nutritional/data_entry/
├── __init__.py
├── models.py              # Pydantic models for validation
├── storage.py             # File I/O operations
├── calculator.py          # Nutrient calculation logic
├── app.py                 # Dash app for data entry
└── layout.py              # UI components
```

**Key Components**:

**models.py** - Data validation using Pydantic:
```python
from pydantic import BaseModel, Field, field_validator
from datetime import date, datetime
from typing import Optional, Literal
from enum import Enum

class UnitType(str, Enum):
    PER_100G = "per_100g"
    PER_ITEM = "per_item"

class FoodItem(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    unit_type: UnitType = UnitType.PER_100G
    serving_size_g: Optional[float] = None  # Required when unit_type is per_item
    energy_kcal: float
    fat_g: float
    saturated_fat_g: float
    carbohydrates_g: float
    sugar_g: float
    protein_g: float
    fibre_g: float
    salt_g: float
    calcium_mg: float

    @field_validator('serving_size_g')
    def validate_serving_size(cls, v, info):
        if info.data.get('unit_type') == UnitType.PER_ITEM and v is None:
            raise ValueError('serving_size_g is required when unit_type is per_item')
        return v

class FoodEntry(BaseModel):
    entry_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime
    food_id: str
    food_name: str
    weight_g: Optional[float] = None  # For per_100g items
    quantity: Optional[float] = None  # For per_item items
    nutrients: dict  # Auto-calculated
```

**calculator.py** - Nutrient calculation:
```python
def calculate_nutrients(food_item: FoodItem, weight_g: float, quantity: float = 1.0) -> dict:
    """Calculate nutrients based on unit type.

    Args:
        food_item: The food item with nutrient data
        weight_g: Weight in grams (for per_100g items) or ignored (for per_item)
        quantity: Number of items (for per_item items) or ignored (for per_100g)

    Returns:
        Dict of calculated nutrients
    """
    if food_item.unit_type == UnitType.PER_100G:
        # Traditional calculation: nutrients * (weight / 100)
        multiplier = weight_g / 100.0
    else:  # PER_ITEM
        # For per-item: nutrients already represent one item, multiply by quantity
        multiplier = quantity

    return {
        "energy_kcal": food_item.energy_kcal * multiplier,
        "fat_g": food_item.fat_g * multiplier,
        "saturated_fat_g": food_item.saturated_fat_g * multiplier,
        "carbohydrates_g": food_item.carbohydrates_g * multiplier,
        "sugar_g": food_item.sugar_g * multiplier,
        "protein_g": food_item.protein_g * multiplier,
        "fibre_g": food_item.fibre_g * multiplier,
        "salt_g": food_item.salt_g * multiplier,
        "calcium_mg": food_item.calcium_mg * multiplier,
    }

def calculate_daily_totals(entries: list[FoodEntry]) -> dict:
    """Sum all food entry nutrients for the day"""
    totals = {
        "energy_kcal": 0,
        "fat_g": 0,
        "saturated_fat_g": 0,
        "carbohydrates_g": 0,
        "sugar_g": 0,
        "protein_g": 0,
        "fibre_g": 0,
        "salt_g": 0,
        "calcium_mg": 0,
    }

    for entry in entries:
        for nutrient in totals:
            totals[nutrient] += entry.nutrients.get(nutrient, 0)

    return totals
```

**storage.py** - File operations:
```python
class FileStorage:
    def __init__(self, base_path: str = "nutritional_data"):
        self.base_path = Path(base_path)

    def load_food_database(self) -> list[FoodItem]:
        """Load food database from JSON"""

    def save_food_item(self, item: FoodItem):
        """Add/update food item in database"""

    def load_daily_entry(self, date: date) -> dict:
        """Load daily entry for specific date"""

    def save_daily_entry(self, date: date, data: dict):
        """Save daily entry and auto-update summaries"""
        # 1. Save to daily_entries/{date}.json
        # 2. Append entries to history.jsonl
        # 3. Update daily_summaries.csv

    def get_food_items(self) -> list[FoodItem]:
        """Get all food items for dropdown"""
```

#### 1.3 Data Entry UI

**Main Views**:

1. **Food Database Manager**
   - Add/edit/delete food items
   - Search and filter
   - Import from CSV (for bulk addition)

2. **Daily Entry Form** (replicates "Day" tab)
   - Date selector (defaults to today)
   - Add food entries:
     - Food item dropdown (searchable) - shows unit type in label
     - **Smart input field**:
       - For `per_100g` items: "Weight (g)" input field
       - For `per_item` items: "Quantity" input field with serving size hint
         - Example: "Quantity" with helper text "(1 item = 118g)"
     - Auto-show calculated nutrients
     - Timestamp (defaults to now)
   - Delete/edit food entries
   - Morning/evening weight inputs
   - Real-time daily totals display
   - Visual indicators for RDI goals
   - **"Save Day" button** - Triggers automatic:
     - Save to daily_entries/
     - Append to history.jsonl
     - Update daily_summaries.csv

   **UI Example for food selection**:
   ```
   [Dropdown: Chicken Breast (per 100g)     ▼]
   [Weight (g): 150                         ]

   [Dropdown: Medium Banana (per item, ~118g) ▼]
   [Quantity: 1.5                           ]
   ```

3. **History Viewer**
   - Browse past days
   - Edit previous entries
   - Search entries by food item
   - Date range filtering

**UI Layout** (Dash Bootstrap):
```python
# Split-panel layout
dbc.Container([
    dbc.Row([
        dbc.Col([
            # Food selector and weight/quantity input
            # Food entry list with delete buttons
        ], width=6),
        dbc.Col([
            # Real-time daily totals
            # Progress bars for RDI
            # Measurements input
        ], width=6),
    ])
])
```

#### 1.4 Integration with Existing Visualization App

**Two deployment options**:

**Option A: Separate Apps** (Recommended for Phase 1)
- Data entry app: `python -m nutritional.data_entry.app` (port 8051)
- Visualization app: `python -m nutritional` (port 8050)
- Both read from same `nutritional_data/` directory
- Add "Open Data Entry" link in viz app

**Option B: Multi-Page Dash App**
- Use `dash.page_registry` for routing
- `/` - Visualization dashboard (existing)
- `/entry` - Data entry interface
- `/foods` - Food database manager
- `/history` - History browser

#### 1.5 Implementation Checklist

- [ ] Create data models with Pydantic
- [ ] Implement FileStorage class
- [ ] Create calculator module
- [ ] Build food database manager UI
- [ ] Build daily entry form UI
- [ ] Add real-time totals calculation
- [ ] Implement auto-save workflow
- [ ] Add history viewer
- [ ] Update loaders.py to support file-based storage
- [ ] Add migration script: Google Sheets → File storage
- [ ] Testing: Unit tests for all calculations
- [ ] Testing: Integration tests for save workflow

---

### Phase 2: PostgreSQL Database Integration
**Goal**: Replace file storage with robust database

#### 2.1 Database Schema

```sql
-- Food items reference table
CREATE TABLE food_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    unit_type VARCHAR(20) NOT NULL DEFAULT 'per_100g' CHECK (unit_type IN ('per_100g', 'per_item')),
    serving_size_g DECIMAL(8,2),  -- Required when unit_type = 'per_item', represents weight of one item
    energy_kcal DECIMAL(8,2) NOT NULL,
    fat_g DECIMAL(8,2) NOT NULL,
    saturated_fat_g DECIMAL(8,2) NOT NULL,
    carbohydrates_g DECIMAL(8,2) NOT NULL,
    sugar_g DECIMAL(8,2) NOT NULL,
    protein_g DECIMAL(8,2) NOT NULL,
    fibre_g DECIMAL(8,2) NOT NULL,
    salt_g DECIMAL(8,2) NOT NULL,
    calcium_mg DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_serving_size CHECK (
        (unit_type = 'per_item' AND serving_size_g IS NOT NULL) OR
        (unit_type = 'per_100g' AND serving_size_g IS NULL)
    )
);

-- Individual food entries (history)
CREATE TABLE food_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    food_id UUID REFERENCES food_items(id),
    weight_g DECIMAL(8,2),  -- For per_100g items
    quantity DECIMAL(8,2),  -- For per_item items (e.g., 1.5 bananas)
    energy_kcal DECIMAL(8,2) NOT NULL,
    fat_g DECIMAL(8,2) NOT NULL,
    saturated_fat_g DECIMAL(8,2) NOT NULL,
    carbohydrates_g DECIMAL(8,2) NOT NULL,
    sugar_g DECIMAL(8,2) NOT NULL,
    protein_g DECIMAL(8,2) NOT NULL,
    fibre_g DECIMAL(8,2) NOT NULL,
    salt_g DECIMAL(8,2) NOT NULL,
    calcium_mg DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily summaries (main app data source)
CREATE TABLE daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    energy_kcal DECIMAL(8,2),
    fat_g DECIMAL(8,2),
    saturated_fat_g DECIMAL(8,2),
    carbohydrates_g DECIMAL(8,2),
    sugar_g DECIMAL(8,2),
    protein_g DECIMAL(8,2),
    fibre_g DECIMAL(8,2),
    salt_g DECIMAL(8,2),
    calcium_mg DECIMAL(8,2),
    morning_weight_kg DECIMAL(5,2),
    evening_weight_kg DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_food_entries_date ON food_entries(date);
CREATE INDEX idx_food_entries_food_id ON food_entries(food_id);
CREATE INDEX idx_daily_summaries_date ON daily_summaries(date);
CREATE INDEX idx_food_items_name ON food_items(name);
```

#### 2.2 Database Module

Create `nutritional/database/`:

```
nutritional/database/
├── __init__.py
├── connection.py          # Database connection pooling
├── models.py              # SQLAlchemy ORM models
├── migrations/            # Alembic migrations
│   └── versions/
├── repositories.py        # Data access layer
└── init_db.py            # Database initialization script
```

**Technology Stack**:
- **ORM**: SQLAlchemy 2.0
- **Migrations**: Alembic
- **Connection Pooling**: psycopg2-binary or asyncpg

**repositories.py** - Abstraction layer:
```python
class FoodRepository:
    def get_all(self) -> list[FoodItem]: ...
    def get_by_id(self, id: str) -> FoodItem: ...
    def create(self, item: FoodItem) -> FoodItem: ...
    def update(self, item: FoodItem) -> FoodItem: ...
    def delete(self, id: str): ...
    def search(self, query: str) -> list[FoodItem]: ...

class FoodEntryRepository:
    def get_by_date(self, date: date) -> list[FoodEntry]: ...
    def create(self, entry: FoodEntry) -> FoodEntry: ...
    def bulk_create(self, entries: list[FoodEntry]): ...

class DailySummaryRepository:
    def get_by_date_range(self, start: date, end: date) -> list[DailySummary]: ...
    def upsert(self, summary: DailySummary): ...
```

#### 2.3 Auto-Aggregation with Database Triggers

**Option 1: Database Trigger** (Recommended for data consistency)
```sql
-- Trigger to auto-update daily_summaries when food_entries change
CREATE OR REPLACE FUNCTION update_daily_summary()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO daily_summaries (date, energy_kcal, fat_g, ...)
    SELECT
        date,
        SUM(energy_kcal),
        SUM(fat_g),
        ...
    FROM food_entries
    WHERE date = NEW.date
    GROUP BY date
    ON CONFLICT (date) DO UPDATE
    SET energy_kcal = EXCLUDED.energy_kcal,
        fat_g = EXCLUDED.fat_g,
        ...
        updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER food_entry_summary_trigger
AFTER INSERT OR UPDATE OR DELETE ON food_entries
FOR EACH ROW EXECUTE FUNCTION update_daily_summary();
```

**Option 2: Materialized View** (Better for read-heavy workloads)
```sql
CREATE MATERIALIZED VIEW daily_summaries AS
SELECT
    date,
    SUM(energy_kcal) as energy_kcal,
    SUM(fat_g) as fat_g,
    ...
FROM food_entries
GROUP BY date;

-- Refresh on save
REFRESH MATERIALIZED VIEW daily_summaries;
```

#### 2.4 Update Data Entry Module

**Modify storage layer**:
```python
# nutritional/data_entry/storage.py
class DatabaseStorage:  # Replaces FileStorage
    def __init__(self, connection_string: str):
        self.engine = create_engine(connection_string)
        self.food_repo = FoodRepository(self.engine)
        self.entry_repo = FoodEntryRepository(self.engine)
        self.summary_repo = DailySummaryRepository(self.engine)

    def save_daily_entry(self, date: date, entries: list[FoodEntry], measurements: dict):
        with self.engine.begin() as conn:
            # Save food entries
            self.entry_repo.bulk_create(entries)

            # Update measurements (manual part of daily summary)
            summary = self.summary_repo.get_by_date(date)
            summary.morning_weight_kg = measurements.get('morning_weight_kg')
            summary.evening_weight_kg = measurements.get('evening_weight_kg')
            self.summary_repo.upsert(summary)
```

**Update loaders.py**:
```python
def get_data_source() -> dict:
    """Load data from configured source"""
    if os.getenv("DATABASE_URL"):
        return load_from_database()
    elif os.getenv("GOOGLE_SHEETS_ID"):
        return load_from_google_sheets()
    elif os.getenv("LOCAL_CSV_PATH"):
        return load_from_csv()
    elif Path("nutritional_data/daily_summaries.csv").exists():
        return load_from_csv("nutritional_data/daily_summaries.csv")
    else:
        raise ValueError("No data source configured")
```

#### 2.5 Database Setup & Configuration

**Environment variables** (.env):
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/nutritional_db

# Or separate components
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nutritional_db
DB_USER=nutritional_user
DB_PASSWORD=secure_password
```

**Docker Compose for local development**:
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: nutritional_db
      POSTGRES_USER: nutritional_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

#### 2.6 Implementation Checklist

- [ ] Set up PostgreSQL (Docker or local)
- [ ] Create SQLAlchemy models
- [ ] Set up Alembic migrations
- [ ] Write database initialization script
- [ ] Implement repository pattern
- [ ] Create database triggers/views for aggregation
- [ ] Update storage layer to use database
- [ ] Update loaders.py for database support
- [ ] Add connection pooling configuration
- [ ] Write database backup scripts
- [ ] Testing: Database operations
- [ ] Testing: Trigger/aggregation logic
- [ ] Performance testing with realistic data volume

---

### Phase 3: Google Sheets to Database Migration
**Goal**: One-time data import from existing Google Sheets

#### 3.1 Migration Script Architecture

Create `scripts/migrate_from_sheets.py`:

```python
"""
One-time migration script: Google Sheets → PostgreSQL

Migrates:
1. Nutrients tab → food_items table
2. History tab → food_entries table
3. Daily tab → daily_summaries table
"""

from nutritional.data.google_sheets import GoogleSheetsClient
from nutritional.database.repositories import (
    FoodRepository,
    FoodEntryRepository,
    DailySummaryRepository
)
from nutritional.database.connection import get_engine
import logging

def migrate_food_database(sheets_client, food_repo):
    """Migrate Nutrients tab to food_items table"""
    # Read Nutrients tab
    data = sheets_client.get_spreadsheet_data(
        spreadsheet_id=SHEETS_ID,
        range_name="Nutrients!A:J"
    )

    # Parse headers
    headers = data[0]

    # Create food items
    for row in data[1:]:
        if not row:  # Skip empty rows
            continue

        item = FoodItem(
            name=row[0],
            energy_kcal=float(row[1]),
            fat_g=float(row[2]),
            # ... map all fields
        )

        food_repo.create(item)
        logging.info(f"Migrated food item: {item.name}")

def migrate_history(sheets_client, entry_repo, food_repo):
    """Migrate History tab to food_entries table"""
    data = sheets_client.get_spreadsheet_data(
        spreadsheet_id=SHEETS_ID,
        range_name="History!A:Z"
    )

    # Parse and create food entries
    # Need to match food names to food_ids from food_repo

def migrate_daily_summaries(sheets_client, summary_repo):
    """Migrate Daily tab to daily_summaries table"""
    data = sheets_client.get_spreadsheet_data(
        spreadsheet_id=SHEETS_ID,
        range_name="Daily!A:Z"
    )

    # This is what the current app already consumes
    # Should be straightforward 1:1 mapping

def main():
    # Initialize connections
    sheets_client = GoogleSheetsClient()
    engine = get_engine()

    food_repo = FoodRepository(engine)
    entry_repo = FoodEntryRepository(engine)
    summary_repo = DailySummaryRepository(engine)

    logging.info("Starting migration...")

    # Migration order matters (foreign keys)
    migrate_food_database(sheets_client, food_repo)
    migrate_history(sheets_client, entry_repo, food_repo)
    migrate_daily_summaries(sheets_client, summary_repo)

    logging.info("Migration complete!")
```

#### 3.2 Data Validation & Reconciliation

**Pre-migration checks**:
```python
def validate_migration_readiness():
    """Check data quality before migration"""
    # 1. Check for duplicate food names
    # 2. Verify all History entries reference valid food items
    # 3. Check date formats
    # 4. Validate numeric fields
    # 5. Identify missing data
```

**Post-migration validation**:
```python
def validate_migration_success(sheets_client, repos):
    """Verify data integrity after migration"""
    # 1. Row counts match
    # 2. Sample data comparison
    # 3. Daily totals reconciliation
    # 4. Date range coverage

    report = {
        "food_items": {
            "sheets_count": len(sheets_food_data),
            "db_count": food_repo.count(),
            "match": sheets_count == db_count
        },
        # ... similar for other tables
    }

    return report
```

#### 3.3 Handling Edge Cases

**Common issues to handle**:

1. **Duplicate food names**: Merge or rename with suffix
2. **Missing nutrients**: Use 0 or NULL (define policy)
3. **Invalid dates**: Log and skip or attempt parsing
4. **Orphan history entries**: Food item no longer in database
5. **Formula cells**: Ensure VLOOKUP results are values, not formulas
6. **Detecting per-item vs per-100g**:
   - Heuristic: If historical entries consistently use weight of ~100g, likely recorded as per-item
   - Manual review: Flag items for user to confirm unit type during migration
   - Migration script should prompt: "Is 'Medium Banana' per 100g or per item? (weight history: 100, 100, 100)"
   - Default to `per_100g` for ambiguous cases, can be corrected later in UI

**Dry-run mode**:
```python
# Run migration without committing
python scripts/migrate_from_sheets.py --dry-run

# Review changes, then commit
python scripts/migrate_from_sheets.py --commit
```

#### 3.4 Rollback Strategy

**Database backup before migration**:
```bash
# Backup
pg_dump nutritional_db > backup_pre_migration.sql

# Rollback if needed
psql nutritional_db < backup_pre_migration.sql
```

#### 3.5 Implementation Checklist

- [ ] Write migration script structure
- [ ] Implement food database migration
- [ ] Implement history migration with FK resolution
- [ ] Implement daily summaries migration
- [ ] Add pre-migration validation
- [ ] Add post-migration validation
- [ ] Create dry-run mode
- [ ] Test migration with copy of production data
- [ ] Document rollback procedure
- [ ] Create migration runbook
- [ ] Backup production Google Sheet
- [ ] Run migration on production
- [ ] Validate production migration
- [ ] Monitor for issues first week

---

## Technical Considerations

### Data Integrity

1. **Atomic Operations**: All daily saves must be transactional
2. **Validation**: Pydantic models enforce data quality
3. **Constraints**: Database enforces referential integrity
4. **Backups**: Automated daily backups (pg_dump + S3)

### Performance

1. **Indexing**: Date-based queries are primary access pattern
2. **Caching**: Food database can be cached (rarely changes)
3. **Batch Operations**: Bulk insert for history data
4. **Connection Pooling**: Reuse database connections

### User Experience

1. **Autocomplete**: Fast food search with fuzzy matching
2. **Mobile Responsive**: Bootstrap ensures mobile compatibility
3. **Keyboard Shortcuts**: Quick data entry (Enter to add, Tab navigation)
4. **Recent Items**: Show frequently used foods first
5. **Undo Support**: Allow reverting recent entries

### Security

1. **Input Validation**: Prevent SQL injection via ORM
2. **Authentication**: Add user login if multi-user (future)
3. **Encrypted Credentials**: Store database password securely
4. **Audit Logging**: Track who changed what (future)

### Deployment

**Phase 1 (File-based)**:
- Simple: Just run Python app locally
- Data in `nutritional_data/` directory
- Version control: Git for code, manual backup for data

**Phase 2+ (Database)**:
- Local development: Docker Compose
- Production options:
  - Self-hosted: VPS + PostgreSQL + systemd service
  - Cloud: Heroku, Railway, Render (easy PostgreSQL)
  - Advanced: AWS/GCP with RDS/Cloud SQL

---

## Timeline Estimates

### Phase 1: File-Based System
- **Data models & storage**: 2-3 days
- **Food database UI**: 2 days
- **Daily entry UI**: 3-4 days
- **Integration with viz app**: 1 day
- **Testing & refinement**: 2-3 days
- **Total**: ~2 weeks

### Phase 2: Database Integration
- **Database setup & models**: 1-2 days
- **Repository layer**: 2 days
- **Update application code**: 1-2 days
- **Testing & optimization**: 2 days
- **Total**: ~1 week

### Phase 3: Migration
- **Migration script**: 2-3 days
- **Testing with data copies**: 1 day
- **Production migration**: 1 day
- **Validation & monitoring**: 1 week
- **Total**: ~2 weeks

**Overall**: 5-6 weeks for complete migration

---

## Success Metrics

1. **Data Entry Speed**: <30 seconds to log a meal
2. **Data Accuracy**: 100% calculation correctness (tested)
3. **Zero Data Loss**: During migration and daily use
4. **Uptime**: 99%+ for database system
5. **User Satisfaction**: Easier than Google Sheets workflow

---

## Future Enhancements (Post-Migration)

1. **Mobile App**: React Native or PWA
2. **Barcode Scanner**: Auto-fill from product barcodes
3. **Meal Templates**: Save common meals
4. **Recipe Calculator**: Calculate nutrients for recipes
5. **Multi-User**: Family/team nutrition tracking
6. **AI Suggestions**: Meal recommendations based on goals
7. **Export Reports**: PDF weekly summaries
8. **API**: RESTful API for third-party integrations

---

## Appendix: Key Files to Create/Modify

### New Files (Phase 1)
- `nutritional/data_entry/__init__.py`
- `nutritional/data_entry/models.py`
- `nutritional/data_entry/storage.py`
- `nutritional/data_entry/calculator.py`
- `nutritional/data_entry/app.py`
- `nutritional/data_entry/layout.py`

### New Files (Phase 2)
- `nutritional/database/__init__.py`
- `nutritional/database/connection.py`
- `nutritional/database/models.py`
- `nutritional/database/repositories.py`
- `nutritional/database/init_db.py`
- `nutritional/database/migrations/` (Alembic)

### New Files (Phase 3)
- `scripts/migrate_from_sheets.py`
- `scripts/validate_migration.py`
- `scripts/backup_database.sh`

### Files to Modify
- `nutritional/data/loaders.py` - Add database support
- `nutritional/settings.py` - Add database config
- `pyproject.toml` - Add new dependencies (SQLAlchemy, Alembic, psycopg2)
- `README.md` - Update setup instructions

### New Dependencies
```toml
[tool.poetry.dependencies]
pydantic = "^2.5.0"
sqlalchemy = "^2.0.0"
alembic = "^1.13.0"
psycopg2-binary = "^2.9.0"  # or asyncpg for async
python-dotenv = "^1.0.0"  # Already present
```

---

## Questions to Consider

1. **Deployment**: Self-hosted vs. cloud-hosted database?
2. **Multi-user**: Will others use this system? (affects auth requirements)
3. **Data retention**: How long to keep meal history? (affects storage)
4. **Backup frequency**: Daily automated backups sufficient?
5. **Mobile access**: Priority for mobile-optimized UI?

---

## Conclusion

This migration plan provides a safe, incremental path from Google Sheets to a modern database-backed system. The three-phase approach minimizes risk by:

1. Building and testing the UI without database complexity
2. Adding database only after UI is proven
3. Migrating data as the final step with validation

Each phase is independently useful and can be stopped at any point if needs change.
