# Nutritional Tracker Migration Plan: Google Sheets → Database

**Status Update (December 2025):** ✅ **Phase 1 Complete** - File-based data entry system with full UI, daily targets/limits tracking, and comprehensive testing. Phase 2 (Database) and Phase 3 (Migration) remain planned.

---

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

### Phase 1: File-Based Data Entry System ✅ COMPLETE
**Goal**: Build data entry interface without database dependency
**Status**: Fully implemented with multi-page Dash application, auto-save functionality, and daily targets tracking
**Implementation Date**: December 2025

#### 1.1 Data Model (JSON/CSV Storage) ✅

**Implemented Structure:**
```
nutritional_data/
├── food_database.json          # All food items with nutritional data
├── daily_entries/              # One JSON file per day
│   ├── 2025-12-28.json
│   ├── 2025-12-29.json
│   └── ...
├── daily_summaries.csv         # Daily totals (app data source)
├── daily_targets.json          # Per-day nutritional targets/limits
└── history.jsonl               # Append-only meal history log
```

**Implemented Pydantic Models (models.py):**

**Core Enums:**
```python
class UnitType(str, Enum):
    PER_100G = "per_100g"    # Weight-based (nutrients per 100g)
    PER_ITEM = "per_item"     # Quantity-based (nutrients per whole item)

class TargetMode(str, Enum):
    TARGET = "target"         # Goal to reach (e.g., protein)
    LIMIT = "limit"           # Maximum to stay under (e.g., sugar)
```

**Nutrients Model:**
```python
class Nutrients(BaseModel):
    energy_kcal: float = 0.0
    protein_g: float = 0.0
    carbohydrates_g: float = 0.0
    fat_g: float = 0.0
    sugar_g: float = 0.0
    saturated_fat_g: float = 0.0
    fibre_g: float = 0.0
    salt_g: float = 0.0
    calcium_mg: float = 0.0
```

**FoodItem Model:**
```python
class FoodItem(BaseModel):
    id: Optional[str] = None  # UUID generated on save
    name: str
    unit_type: UnitType = UnitType.PER_100G
    serving_size_g: Optional[float] = None  # Required for PER_100G
    nutrients: Nutrients = Field(default_factory=Nutrients)

    @field_validator('serving_size_g')
    def validate_serving_size(cls, v, info):
        if info.data.get('unit_type') == UnitType.PER_100G and v is None:
            raise ValueError("serving_size_g required for per_100g items")
        return v
```

**FoodEntry Model:**
```python
class FoodEntry(BaseModel):
    timestamp: datetime
    food_id: str
    food_name: str  # Cached for display
    weight_g: Optional[float] = None      # For PER_100G foods
    quantity: Optional[float] = None      # For PER_ITEM foods
    nutrients: Nutrients = Field(default_factory=Nutrients)

    @field_validator('nutrients')
    def validate_amount(cls, v, info):
        weight = info.data.get('weight_g')
        quantity = info.data.get('quantity')
        if not weight and not quantity:
            raise ValueError("Either weight_g or quantity required")
        return v
```

**Measurements Model:**
```python
class Measurements(BaseModel):
    morning_weight_kg: Optional[float] = None
    evening_weight_kg: Optional[float] = None
```

**DailyData Model:**
```python
class DailyData(BaseModel):
    date: date
    entries: list[FoodEntry] = Field(default_factory=list)
    measurements: Measurements = Field(default_factory=Measurements)
```

**DailyTargets Model:**
```python
class DailyTargets(BaseModel):
    date: date
    default_mode: TargetMode = TargetMode.TARGET

    # Target values for all 9 nutrients
    energy_kcal: float = 2000
    protein_g: float = 150
    carbohydrates_g: float = 225
    fat_g: float = 67
    sugar_g: float = 90
    saturated_fat_g: float = 20
    fibre_g: float = 30
    salt_g: float = 6
    calcium_mg: float = 700

    # Per-nutrient mode overrides
    energy_mode: Optional[TargetMode] = None
    protein_mode: Optional[TargetMode] = None
    carbohydrates_mode: Optional[TargetMode] = None
    fat_mode: Optional[TargetMode] = None
    sugar_mode: Optional[TargetMode] = TargetMode.LIMIT
    saturated_fat_mode: Optional[TargetMode] = TargetMode.LIMIT
    fibre_mode: Optional[TargetMode] = None
    salt_mode: Optional[TargetMode] = TargetMode.LIMIT
    calcium_mode: Optional[TargetMode] = None

    def get_nutrient_mode(self, nutrient: str) -> TargetMode:
        """Get mode for specific nutrient with fallback to default"""
        mode_attr = f"{nutrient}_mode"
        return getattr(self, mode_attr) or self.default_mode

    @classmethod
    def get_default_targets(cls, target_date: date) -> "DailyTargets":
        """Factory method with sensible defaults"""
        return cls(date=target_date)
```

**File Format Examples:**

**food_database.json:**
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

**calculator.py** - Nutrient calculation (IMPLEMENTED):
```python
def calculate_nutrients(
    food_item: FoodItem,
    weight_g: Optional[float] = None,
    quantity: Optional[float] = None
) -> Nutrients:
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

**storage.py** - File operations (IMPLEMENTED):
```python
class FileStorage:
    def __init__(self, base_path: str = "nutritional_data"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)
        (self.base_path / "daily_entries").mkdir(exist_ok=True)

    # Food Database Operations
    def get_all_food_items(self) -> list[FoodItem]:
        """Load all food items from JSON"""

    def get_food_item(self, food_id: str) -> Optional[FoodItem]:
        """Get single food item by ID"""

    def save_food_item(self, food_item: FoodItem) -> FoodItem:
        """Add/update food item, auto-generates UUID if needed"""

    def delete_food_item(self, food_id: str) -> bool:
        """Remove food item from database"""

    # Daily Entry Operations
    def load_daily_entry(self, entry_date: date) -> DailyData:
        """Load daily entry for specific date"""

    def save_daily_entry(self, daily_data: DailyData) -> None:
        """Save daily entry and auto-update summaries"""
        # 1. Save to daily_entries/YYYY-MM-DD.json
        # 2. Append to history.jsonl
        # 3. Update daily_summaries.csv
        # 1. Save to daily_entries/{date}.json
        # 2. Append entries to history.jsonl
        # 3. Update daily_summaries.csv

    def get_food_items(self) -> list[FoodItem]:
        """Get all food items for dropdown"""

    # Daily Targets Operations
    def save_daily_targets(self, targets: DailyTargets) -> None:
        """Save daily targets to JSON"""

    def load_daily_targets(self, target_date: date) -> Optional[DailyTargets]:
        """Load targets for specific date"""

    def get_previous_day_targets(self, target_date: date) -> Optional[DailyTargets]:
        """Get targets from previous day for copying"""

    def get_or_create_daily_targets(self, target_date: date) -> DailyTargets:
        """Smart fallback: today → yesterday → defaults"""
```

#### 1.3 Multi-Page Application UI ✅

**Architecture**: Dash pages plugin (`use_pages=True`) with shared navigation

**Implemented Pages:**

**1. Home (`/`)** - Dashboard
   - Existing visualization components
   - Date filtering
   - Rolling averages
   - Calorie/macro tracking
   - Nutrient monitoring charts

**2. Food Database Manager (`/foods`)**
   - ✅ Add new food items with full nutritional data
   - ✅ Edit existing food items (populates form)
   - ✅ Delete food items with confirmation
   - ✅ Search/filter food list (real-time)
   - ✅ Supports both PER_100G and PER_ITEM unit types
   - ✅ Pattern-matching callbacks for dynamic edit/delete buttons
   - ✅ Validation with user-friendly error messages

**3. Daily Entry Form (`/entry`)** - Today's tracking
   - ✅ Food selector dropdown (searchable, shows unit type)
   - ✅ Dynamic amount input:
     - **Smart input field**:
       - For `per_100g` items: "Weight (g)" input field
       - For `per_item` items: "Quantity" input field with serving size hint
         - Example: "Quantity" with helper text "(1 item = 118g)"
     - Auto-show calculated nutrients
     - For PER_100G: "Weight (g)" input
     - For PER_ITEM: "Quantity" input with serving size hint
   - ✅ Auto-save on every action (no explicit save button)
   - ✅ Delete/edit food entries with pattern-matching callbacks
   - ✅ Morning/evening weight inputs (persistent across sessions)
   - ✅ Real-time daily totals display (all 9 nutrients)
   - ✅ **Daily Targets & Progress Tracking**:
     - Progress bars for all 9 nutrients (2-column layout)
     - Color-coded by nutrient type
     - Visual indicators:
       - Green ✓ when target met
       - Yellow ⚠️ when limit approaching (100-110%)
       - Red ⚠️ when limit exceeded (>110%)
     - "Edit Targets" button opens modal
   - ✅ **Target Editor Modal**:
     - Edit target values for all 9 nutrients
     - Per-nutrient TARGET/LIMIT mode selector
     - "Copy from Previous Day" functionality
     - Save/Cancel actions
   - ✅ **Auto-save behavior** - Every action triggers:
     - Save to daily_entries/YYYY-MM-DD.json
     - Append to history.jsonl
     - Update daily_summaries.csv

   **UI Example:**
   ```
   Food Selection:
   [Dropdown: Chicken Breast (per 100g)     ▼]
   [Weight (g): 150                         ]
   [Add Entry]

   [Dropdown: Medium Banana (per item, ~118g) ▼]
   [Quantity: 1.5                           ]
   [Add Entry]

   Progress (Today: 2025-12-29):
   Calories  [████████░░] 1847 / 2000 kcal ✓
   Protein   [██████████] 156 / 150 g     ✓
   ...
   [Edit Targets]
   ```

**4. History Viewer (`/history`)**
   - ✅ Date picker to select any past date
   - ✅ Display all entries for selected date
   - ✅ Show daily totals and measurements
   - ⚠️ View-only (editing past days planned for future)

**Implemented UI Layout** (Dash Bootstrap Components):
```python
# Multi-page navigation
dbc.NavbarSimple(
    children=[
        dbc.NavItem(dbc.NavLink("Home", href="/")),
        dbc.NavItem(dbc.NavLink("Foods", href="/foods")),
        dbc.NavItem(dbc.NavLink("Entry", href="/entry")),
        dbc.NavItem(dbc.NavLink("History", href="/history")),
    ],
    brand="Nutritional Tracker",
)

# Entry page layout
dbc.Container([
    dbc.Row([  # Food entry form
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

#### 1.4 State Management & Integration ✅

**Implemented Solution: Multi-Page Dash App** (Option B)
- ✅ Single app with `dash.page_registry` routing
- ✅ `/` - Visualization dashboard (home.py wrapper)
- ✅ `/entry` - Data entry interface
- ✅ `/foods` - Food database manager
- ✅ `/history` - History browser

**Session State Management:**

**Persistent Stores (dcc.Store with storage_type='session'):**
```python
# In entry.py layout
dcc.Store(id="persistent-entries", storage_type="session")
dcc.Store(id="persistent-morning-weight", storage_type="session")
dcc.Store(id="persistent-evening-weight", storage_type="session")
```

**Key Patterns:**

1. **Page Load Pattern** - Load data on page visit:
```python
@callback(
    Output("entries-store", "data"),
    [Input("persistent-entries", "data"),
     Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def load_data_on_page_visit(stored_data, _):
    if stored_data:
        return stored_data
    # Load from file if not in store
    daily_data = storage.load_daily_entry(date.today())
    return [entry.model_dump() for entry in daily_data.entries]
```

2. **Auto-Save Pattern** - Save immediately on changes:
```python
@callback(
    Output("persistent-entries", "data"),
    Input("add-entry-btn", "n_clicks"),
    State("persistent-entries", "data"),
    prevent_initial_call=True,
)
def add_and_save(n_clicks, entries):
    # Modify entries
    new_entry = create_entry(...)
    entries.append(new_entry)

    # Save to file immediately
    daily_data = DailyData(date=date.today(), entries=entries)
    storage.save_daily_entry(daily_data)

    return entries  # Update persistent store
```

3. **Pattern-Matching for Dynamic Components**:
```python
@callback(
    Output("entries-container", "children"),
    Input({"type": "remove-entry", "index": dash.ALL}, "n_clicks"),
    State("persistent-entries", "data"),
)
def handle_dynamic_buttons(n_clicks, entries):
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    # Extract which button was clicked
    button_id = eval(ctx.triggered[0]["prop_id"].split(".")[0])
    index = button_id["index"]

    # Remove entry and save
    entries.pop(index)
    storage.save_daily_entry(DailyData(date=date.today(), entries=entries))
    return entries
```

**Why Auto-Save Instead of Explicit Save Button:**
- ✅ Reduced cognitive load (users don't forget to save)
- ✅ No data loss on accidental navigation
- ✅ Simpler mental model ("what you see is saved")
- ✅ Better mobile UX (fewer taps required)
- ✅ Persistent stores bridge multi-page navigation

#### 1.5 Implementation Checklist ✅ COMPLETE

- [x] Create data models with Pydantic (models.py)
- [x] Implement FileStorage class (storage.py)
- [x] Create calculator module (calculator.py)
- [x] Build food database manager UI (/foods page)
- [x] Build daily entry form UI (/entry page)
- [x] Add real-time totals calculation
- [x] Implement auto-save workflow with persistent stores
- [x] Add history viewer (/history page)
- [x] Add daily targets/limits tracking system
- [x] Add visual progress indicators (color-coded bars)
- [x] Add target editor modal with copy-from-previous
- [x] Add CSS styling for progress bars and indicators
- [x] Update loaders.py to support file-based storage
- [ ] Add migration script: Google Sheets → File storage (deferred to Phase 3)
- [x] Testing: Unit tests for models, calculator, storage (294 tests passing)
- [x] Testing: Pattern-matching callbacks
- [x] Testing: Daily targets storage and fallback logic

**Test Coverage:**
- ✅ 294 tests passing
- ✅ 18 tests for daily targets feature
- ✅ Model validation tests
- ✅ Calculator tests (both unit types)
- ✅ Storage operations tests
- ✅ Edge case handling tests

---

### Phase 1.5: Daily Targets & Limits Tracking ✅ COMPLETE

**Goal**: Add comprehensive nutrient tracking with customizable targets/limits and visual feedback
**Implementation Date**: December 2025

#### Feature Overview

Added a complete daily targets system that allows users to set nutritional goals (targets to reach) or limits (maximums to stay under) for all 9 tracked nutrients, with real-time visual feedback on progress.

#### Data Model

**TargetMode Enum:**
```python
class TargetMode(str, Enum):
    TARGET = "target"  # Goal to reach (e.g., protein, fibre)
    LIMIT = "limit"    # Maximum to stay under (e.g., sugar, salt)
```

**DailyTargets Model:**
- Date-specific targets for all 9 nutrients
- Global default mode with per-nutrient overrides
- Smart fallback logic: today → yesterday → defaults
- Factory method for sensible defaults

**Default Values:**
- Energy: 2000 kcal (TARGET)
- Protein: 150 g (TARGET)
- Carbohydrates: 225 g (TARGET)
- Fat: 67 g (TARGET)
- Sugar: 90 g (LIMIT)
- Saturated Fat: 20 g (LIMIT)
- Fibre: 30 g (TARGET)
- Salt: 6 g (LIMIT)
- Calcium: 700 mg (TARGET)

#### Storage Implementation

Added to FileStorage class:
```python
def save_daily_targets(self, targets: DailyTargets) -> None:
    """Save to daily_targets.json with date as key"""

def load_daily_targets(self, target_date: date) -> Optional[DailyTargets]:
    """Load targets for specific date"""

def get_previous_day_targets(self, target_date: date) -> Optional[DailyTargets]:
    """Get targets from previous day for copying"""

def get_or_create_daily_targets(self, target_date: date) -> DailyTargets:
    """Smart fallback: today → yesterday → defaults"""
```

#### UI Implementation

**Progress Bars (All 9 Nutrients):**
- Two-column responsive layout
- Left column: Calories, Protein, Carbs, Fat, Fibre
- Right column: Sugar, Saturated Fat, Salt, Calcium
- Color-coded by nutrient type:
  - Calories: Royal blue
  - Protein: Sky blue
  - Carbs: Amber
  - Fat: Pink
  - Fibre: Emerald
  - Sugar: Red
  - Saturated Fat: Orange
  - Salt: Violet
  - Calcium: Cyan

**Visual Feedback System:**
- **Target Mode**: Green ✓ when value ≥ target
- **Limit Mode**:
  - Yellow ⚠️ when 100-110% of limit
  - Red ⚠️ when >110% of limit

**Target Editor Modal:**
```python
# Components
- Input fields for all 9 nutrient values
- Dropdown for TARGET/LIMIT mode per nutrient
- "Copy from Previous Day" button
- Save/Cancel buttons

# Callbacks
@callback(...)  # Open/close modal
@callback(...)  # Load targets into form
@callback(...)  # Copy from previous day
@callback(...)  # Save changes and refresh display
```

#### CSS Styling (style.css)

Added classes:
```css
/* Progress bar colors for each nutrient */
.progress-calories { background: linear-gradient(to right, #3b82f6, #2563eb); }
.progress-protein { background: linear-gradient(to right, #0ea5e9, #0284c7); }
.progress-carbs { background: linear-gradient(to right, #f59e0b, #d97706); }
.progress-fat { background: linear-gradient(to right, #ec4899, #db2777); }
.progress-fibre { background: linear-gradient(to right, #10b981, #059669); }
.progress-sugar { background: linear-gradient(to right, #ef4444, #dc2626); }
.progress-saturated-fat { background: linear-gradient(to right, #f97316, #ea580c); }
.progress-salt { background: linear-gradient(to right, #8b5cf6, #7c3aed); }
.progress-calcium { background: linear-gradient(to right, #06b6d4, #0891b2); }

/* Visual indicators */
.target-met { color: #10b981; }      /* Green checkmark */
.target-warning { color: #f59e0b; }   /* Yellow warning */
.target-exceeded { color: #ef4444; }  /* Red warning */

/* Progress display */
.progress-header { font-weight: 600; margin-bottom: 0.5rem; }
.progress-label { font-size: 0.875rem; color: #6b7280; }
.progress-value { font-size: 0.875rem; font-weight: 500; }
```

#### User Experience Flow

1. User visits `/entry` page
2. System loads targets (today → yesterday → defaults)
3. Progress bars display all 9 nutrients with current vs target
4. Visual indicators show status:
   - Green ✓ for met targets
   - Yellow ⚠️ for approaching limits
   - Red ⚠️ for exceeded limits
5. User adds food entries → progress updates in real-time
6. User clicks "Edit Targets" → modal opens
7. User adjusts values or copies from previous day
8. Changes save → progress bars update immediately

#### Testing

Added test file: `tests/test_daily_targets.py` (18 tests)
- Model creation and validation
- Default values and modes
- Nutrient mode resolution (override vs default)
- Storage save/load operations
- Previous day fallback logic
- Multi-date scenarios
- Edge cases (missing files, invalid data)

**Results**: All 294 tests passing ✅

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

### Implemented Files (Phase 1) ✅
- ✅ `nutritional/data_entry/__init__.py` - Module exports
- ✅ `nutritional/data_entry/models.py` - Pydantic models (UnitType, TargetMode, Nutrients, FoodItem, FoodEntry, Measurements, DailyData, DailyTargets)
- ✅ `nutritional/data_entry/storage.py` - FileStorage class with food, entry, and targets operations
- ✅ `nutritional/data_entry/calculator.py` - Nutrient calculation logic
- ✅ `nutritional/pages/__init__.py` - Pages module
- ✅ `nutritional/pages/home.py` - Dashboard wrapper for existing visualizations
- ✅ `nutritional/pages/foods.py` - Food database CRUD interface
- ✅ `nutritional/pages/entry.py` - Daily entry form with targets/progress
- ✅ `nutritional/pages/history.py` - Historical data viewer
- ✅ `nutritional/assets/style.css` - Added progress bar styles and indicators
- ✅ `tests/test_data_entry_models.py` - Model validation tests
- ✅ `tests/test_calculator.py` - Calculation tests
- ✅ `tests/test_storage.py` - Storage operation tests
- ✅ `tests/test_daily_targets.py` - Daily targets feature tests (18 tests)

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

### Dependencies

**Phase 1 (Implemented):**
```toml
[project.dependencies]
dash = ">=3.3.0"
dash-bootstrap-components = ">=2.0.4"
pandas = ">=2.2.3"
plotly = ">=5.24.1"
pydantic = ">=2.0.0"  # ✅ Added for Phase 1
python-dotenv = ">=1.0.0"  # ✅ Already present
```

**Phase 2 (Planned):**
```toml
sqlalchemy = "^2.0.0"
alembic = "^1.13.0"
psycopg2-binary = "^2.9.0"  # or asyncpg for async
```

---

## Current Project Structure (Phase 1)

```
nutritional/
├── __init__.py
├── __main__.py                      # App entry point
├── app.py                           # Main Dash app setup (multi-page)
├── callbacks.py                     # Legacy callbacks for home page
├── layout.py                        # Legacy layout for home page
├── settings.py                      # Configuration
├── assets/
│   └── style.css                    # ✅ Updated with progress bar styles
├── data/
│   ├── __init__.py
│   ├── google_sheets.py             # Original Google Sheets integration
│   ├── loaders.py                   # Data loading for visualizations
│   ├── preprocessing.py             # Data transformations
│   └── validators.py                # Data validation
├── data_entry/                      # ✅ NEW Phase 1 module
│   ├── __init__.py
│   ├── models.py                    # Pydantic models
│   ├── calculator.py                # Nutrient calculations
│   └── storage.py                   # File I/O operations
├── pages/                           # ✅ NEW Phase 1 multi-page structure
│   ├── __init__.py
│   ├── home.py                      # Dashboard (existing viz)
│   ├── foods.py                     # Food database manager
│   ├── entry.py                     # Daily entry + targets
│   └── history.py                   # Historical viewer
└── plotting/
    ├── __init__.py
    ├── calories_weight.py
    ├── macros.py
    ├── nutrients.py
    ├── transforms.py
    └── utils.py

nutritional_data/                    # ✅ NEW Phase 1 storage
├── food_database.json               # All food items
├── daily_summaries.csv              # Daily totals (viz data source)
├── daily_targets.json               # ✅ Per-day targets/limits
├── history.jsonl                    # Append-only meal log
└── daily_entries/                   # Individual day files
    ├── 2025-12-28.json
    ├── 2025-12-29.json
    └── ...

tests/
├── __init__.py
├── conftest.py                      # Pytest fixtures
├── test_calculator.py               # ✅ NEW Phase 1
├── test_callbacks.py
├── test_data_entry_models.py        # ✅ NEW Phase 1
├── test_data_loaders.py
├── test_daily_targets.py            # ✅ NEW Phase 1.5 (18 tests)
├── test_edge_cases.py
├── test_google_sheets.py
├── test_layout.py
├── test_loader_coverage.py
├── test_plotting_functions.py
├── test_preprocessing.py
├── test_storage.py                  # ✅ NEW Phase 1
├── test_transforms.py
└── test_validators.py

docs/
├── migration-plan.md                # This document
├── phase1-implementation.md         # ⚠️ Can be deleted (consolidated here)
└── limits-and-target-tracking-implemntation.md  # ⚠️ Can be deleted (consolidated here)
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

1. ✅ **Phase 1 Complete**: Building and testing the UI without database complexity
2. **Phase 2 Planned**: Adding database only after UI is proven
3. **Phase 3 Planned**: Migrating data as the final step with validation

Each phase is independently useful and can be stopped at any point if needs change.

### Phase 1 Achievements

**Delivered Features:**
- ✅ Multi-page Dash application with intuitive navigation
- ✅ Complete food database CRUD interface
- ✅ Today-focused daily entry form with auto-save
- ✅ Historical data viewer
- ✅ Daily targets/limits system with visual feedback
- ✅ All 9 nutrients tracked with progress bars
- ✅ Customizable per-nutrient targets and limits
- ✅ Smart target fallback (today → yesterday → defaults)
- ✅ Comprehensive testing (294 tests passing)
- ✅ Type-safe Pydantic models
- ✅ Persistent session state management
- ✅ Pattern-matching callbacks for dynamic UI

**Technical Foundation:**
- Clean separation of concerns (models, storage, calculator, UI)
- Ready for database migration (storage layer abstraction)
- Extensible architecture for future features
- Production-ready error handling and validation

**User Experience Wins:**
- No data loss (auto-save on every action)
- Reduced cognitive load (no explicit save button)
- Real-time feedback (progress bars update immediately)
- Cross-page state persistence (session stores)
- Mobile-responsive Bootstrap layout
- Clear visual indicators (colors + icons)

### Next Steps

**Phase 2 Prerequisites:**
- Decide on database: PostgreSQL vs SQLite
- Set up local database environment (Docker recommended)
- Create SQLAlchemy models matching Pydantic models
- Write Alembic migrations
- Implement DatabaseStorage class
- Add connection pooling configuration

**Phase 3 Prerequisites:**
- Backup production Google Sheet
- Test migration script with sheet copy
- Validate data quality in source sheet
- Create rollback procedure
- Schedule migration window

The file-based Phase 1 system is fully functional and can be used in production while Phase 2 and 3 are planned and executed.
