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

### Phase 2: PostgreSQL Database Integration 🔄 IN PROGRESS
**Goal**: Replace file storage with robust database while maintaining Google Sheets for visualization
**Status**: Planning stage
**Target**: Q1 2026

**Key Requirements:**
- ✅ Easy switching between local dev DB and cloud production DB
- ✅ Local PostgreSQL for development and testing
- ✅ Dual data sources: Database for entry system, Google Sheets for visualization (until Phase 3)
- ✅ Test all CRUD operations with local DB
- ✅ Clean local DB setup for Phase 3 migration
- ⚠️ Production cloud DB deployment deferred (app not deployed yet)

#### 2.0 Environment Setup & Configuration

**2.0.1 Environment Variables (.env)**

Create `.env` file in project root (gitignored):
```bash
# Application Mode
ENV=development  # development | production

# Database Configuration
DATABASE_URL=postgresql://nutritional_user:dev_password@localhost:5432/nutritional_db

# Or separate components (alternative)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nutritional_db
DB_USER=nutritional_user
DB_PASSWORD=dev_password

# Data Source Selection (Phase 2 dual-source period)
ENTRY_DATA_SOURCE=database    # database | file
VIZ_DATA_SOURCE=google_sheets  # google_sheets | database

# Google Sheets (keep for visualization during Phase 2)
GOOGLE_SHEETS_CREDENTIALS=credentials/nutritional-479017-22cd3962ee25.json
GOOGLE_SHEET_ID=your_sheet_id_here
```

**2.0.2 Production Environment (.env.production)**
```bash
# Production configuration (future use)
ENV=production
DATABASE_URL=postgresql://user:password@cloud-db-host:5432/nutritional_prod
# Or use cloud provider connection strings:
# DATABASE_URL=postgresql://user:pass@db.region.provider.com:5432/nutritional
```

**2.0.3 Docker Compose for Local Development**

Create `docker-compose.yml` in project root:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: nutritional_db
    environment:
      POSTGRES_USER: nutritional_user
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: nutritional_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init_db.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nutritional_user -d nutritional_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Optional: pgAdmin for database management
  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: nutritional_pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@nutritional.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      - postgres

volumes:
  postgres_data:
    driver: local
```

**2.0.4 Database Management Scripts**

Create `scripts/db_management.ps1`:
```powershell
# Database management helper script

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('start', 'stop', 'restart', 'reset', 'clean', 'backup', 'restore')]
    [string]$Command,
    [string]$BackupFile
)

switch ($Command) {
    'start' {
        Write-Host "Starting PostgreSQL container..."
        docker-compose up -d postgres
        Write-Host "Waiting for database to be ready..."
        Start-Sleep -Seconds 5
        docker-compose exec postgres pg_isready -U nutritional_user
    }
    'stop' {
        Write-Host "Stopping PostgreSQL container..."
        docker-compose stop postgres
    }
    'restart' {
        Write-Host "Restarting PostgreSQL container..."
        docker-compose restart postgres
    }
    'reset' {
        Write-Host "Resetting database (drops and recreates)..."
        docker-compose exec postgres psql -U nutritional_user -d nutritional_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
        Write-Host "Running migrations..."
        & .venv\Scripts\alembic upgrade head
    }
    'clean' {
        Write-Host "WARNING: This will delete ALL database data and the Docker volume!"
        $confirmation = Read-Host "Type 'yes' to confirm"
        if ($confirmation -eq 'yes') {
            docker-compose down -v
            Write-Host "Database cleaned. Run 'start' to create fresh database."
        }
    }
    'backup' {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backupFile = "backups/nutritional_db_$timestamp.sql"
        New-Item -ItemType Directory -Force -Path backups | Out-Null
        Write-Host "Backing up database to $backupFile..."
        docker-compose exec -T postgres pg_dump -U nutritional_user nutritional_db > $backupFile
        Write-Host "Backup complete!"
    }
    'restore' {
        if (-not $BackupFile) {
            Write-Host "ERROR: -BackupFile parameter required for restore"
            exit 1
        }
        Write-Host "Restoring database from $BackupFile..."
        Get-Content $BackupFile | docker-compose exec -T postgres psql -U nutritional_user -d nutritional_db
        Write-Host "Restore complete!"
    }
}
```

**Usage:**
```powershell
# Start database
.\scripts\db_management.ps1 -Command start

# Stop database
.\scripts\db_management.ps1 -Command stop

# Reset database (clean slate for testing)
.\scripts\db_management.ps1 -Command reset

# Clean everything (delete volume)
.\scripts\db_management.ps1 -Command clean

# Backup database
.\scripts\db_management.ps1 -Command backup

# Restore from backup
.\scripts\db_management.ps1 -Command restore -BackupFile backups\backup.sql
```

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

-- Daily targets (nutritional goals/limits)
CREATE TABLE daily_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL UNIQUE,
    default_mode VARCHAR(10) NOT NULL DEFAULT 'target' CHECK (default_mode IN ('target', 'limit')),
    -- Target values
    energy_kcal DECIMAL(8,2) NOT NULL DEFAULT 2000,
    protein_g DECIMAL(8,2) NOT NULL DEFAULT 150,
    carbohydrates_g DECIMAL(8,2) NOT NULL DEFAULT 225,
    fat_g DECIMAL(8,2) NOT NULL DEFAULT 67,
    sugar_g DECIMAL(8,2) NOT NULL DEFAULT 90,
    saturated_fat_g DECIMAL(8,2) NOT NULL DEFAULT 20,
    fibre_g DECIMAL(8,2) NOT NULL DEFAULT 30,
    salt_g DECIMAL(8,2) NOT NULL DEFAULT 6,
    calcium_mg DECIMAL(8,2) NOT NULL DEFAULT 700,
    -- Per-nutrient mode overrides (NULL = use default_mode)
    energy_mode VARCHAR(10) CHECK (energy_mode IN ('target', 'limit')),
    protein_mode VARCHAR(10) CHECK (protein_mode IN ('target', 'limit')),
    carbohydrates_mode VARCHAR(10) CHECK (carbohydrates_mode IN ('target', 'limit')),
    fat_mode VARCHAR(10) CHECK (fat_mode IN ('target', 'limit')),
    sugar_mode VARCHAR(10) CHECK (sugar_mode IN ('target', 'limit')) DEFAULT 'limit',
    saturated_fat_mode VARCHAR(10) CHECK (saturated_fat_mode IN ('target', 'limit')) DEFAULT 'limit',
    fibre_mode VARCHAR(10) CHECK (fibre_mode IN ('target', 'limit')),
    salt_mode VARCHAR(10) CHECK (salt_mode IN ('target', 'limit')) DEFAULT 'limit',
    calcium_mode VARCHAR(10) CHECK (calcium_mode IN ('target', 'limit')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_food_entries_date ON food_entries(date);
CREATE INDEX idx_food_entries_food_id ON food_entries(food_id);
CREATE INDEX idx_daily_summaries_date ON daily_summaries(date);
CREATE INDEX idx_daily_targets_date ON daily_targets(date);
CREATE INDEX idx_food_items_name ON food_items(name);
```

#### 2.2 Database Module Implementation

Create `nutritional/database/` module:

```
nutritional/database/
├── __init__.py           # Module exports and get_storage() factory
├── connection.py         # Database connection pooling
├── models.py             # SQLAlchemy ORM models
├── repositories.py       # Data access layer (repository pattern)
├── storage.py            # DatabaseStorage class (mirrors FileStorage API)
└── migrations/           # Alembic migrations
    ├── env.py
    ├── script.py.mako
    ├── alembic.ini
    └── versions/
```

**Technology Stack**:
- **ORM**: SQLModel 0.0.14+ (combines SQLAlchemy 2.0 + Pydantic)
- **Migrations**: Alembic 1.13+ (works with SQLModel)
- **Driver**: psycopg2-binary (sync) or asyncpg (async - future)
- **Connection Pooling**: SQLAlchemy's built-in pool
- **Benefits**: Single model definition for both DB and validation, better type hints

**2.2.1 connection.py - Database Connection Management**

```python
"""Database connection and session management."""
from sqlmodel import create_engine, Session, SQLModel
from contextlib import contextmanager
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_file = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_file)

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Fallback: construct from separate components
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "nutritional_db")
    DB_USER = os.getenv("DB_USER", "nutritional_user")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "dev_password")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create engine (SQLModel uses SQLAlchemy underneath)
engine = create_engine(
    DATABASE_URL,
    echo=os.getenv("ENV") == "development",  # SQL logging in dev
    pool_pre_ping=True,  # Verify connections before using
    pool_size=5,  # Connection pool size
    max_overflow=10,  # Max connections beyond pool_size
)

@contextmanager
def get_db_session():
    """Context manager for database sessions.

    Usage:
        with get_db_session() as session:
            food_items = session.query(FoodItemModel).all()
            # Or SQLModel style:
            food_items = session.exec(select(FoodItemModel)).all()
    """
    session = Session(engine)
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

def get_engine():
    """Get the database engine (for testing, migrations)."""
    return engine

def create_db_and_tables():
    """Create all tables (for testing/initial setup).

    In production, use Alembic migrations instead.
    """
    SQLModel.metadata.create_all(engine)
```

**2.2.2 models.py - SQLModel ORM Models**

```python
"""SQLModel database models - combines SQLAlchemy + Pydantic."""
from sqlmodel import SQLModel, Field, Relationship, CheckConstraint
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID, uuid4

class FoodItemModel(SQLModel, table=True):
    """Food item with nutritional information.

    SQLModel provides:
    - Database ORM functionality (via SQLAlchemy)
    - Pydantic validation (automatic type checking)
    - Single source of truth (no duplicate Pydantic model needed)
    """
    __tablename__ = "food_items"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
    unit_type: str = Field(default="per_100g", max_length=20)
    serving_size_g: Optional[float] = None

    # Nutrients (all required for creation)
    energy_kcal: float
    protein_g: float
    carbohydrates_g: float
    fat_g: float
    sugar_g: float
    saturated_fat_g: float
    fibre_g: float
    salt_g: float
    calcium_mg: float

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    entries: List["FoodEntryModel"] = Relationship(back_populates="food_item")

    __table_args__ = (
        CheckConstraint(
            "unit_type IN ('per_100g', 'per_item')",
            name="check_unit_type"
        ),
        CheckConstraint(
            "(unit_type = 'per_item' AND serving_size_g IS NOT NULL) OR "
            "(unit_type = 'per_100g')",
            name="check_serving_size"
        ),
    )

class FoodEntryModel(SQLModel, table=True):
    """Individual food entry for a specific date/time."""
    __tablename__ = "food_entries"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    date: date = Field(index=True)
    timestamp: datetime
    food_id: UUID = Field(foreign_key="food_items.id")

    # Amount consumed
    weight_g: Optional[float] = None  # For per_100g items
    quantity: Optional[float] = None  # For per_item items

    # Calculated nutrients (denormalized for performance)
    energy_kcal: float
    protein_g: float
    carbohydrates_g: float
    fat_g: float
    sugar_g: float
    saturated_fat_g: float
    fibre_g: float
    salt_g: float
    calcium_mg: float

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    food_item: Optional[FoodItemModel] = Relationship(back_populates="entries")

class DailySummaryModel(SQLModel, table=True):
    """Daily aggregated nutritional totals and measurements."""
    __tablename__ = "daily_summaries"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    date: date = Field(unique=True, index=True)

    # Nutrient totals (optional - calculated from entries)
    energy_kcal: Optional[float] = None
    protein_g: Optional[float] = None
    carbohydrates_g: Optional[float] = None
    fat_g: Optional[float] = None
    sugar_g: Optional[float] = None
    saturated_fat_g: Optional[float] = None
    fibre_g: Optional[float] = None
    salt_g: Optional[float] = None
    calcium_mg: Optional[float] = None

    # Body measurements
    morning_weight_kg: Optional[float] = None
    evening_weight_kg: Optional[float] = None

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DailyTargetsModel(SQLModel, table=True):
    """Daily nutritional targets and limits."""
    __tablename__ = "daily_targets"

    id: Optional[UUID] = Field(default_factory=uuid4, primary_key=True)
    date: date = Field(unique=True, index=True)
    default_mode: str = Field(default="target", max_length=10)

    # Target values
    energy_kcal: float = 2000
    protein_g: float = 150
    carbohydrates_g: float = 225
    fat_g: float = 67
    sugar_g: float = 90
    saturated_fat_g: float = 20
    fibre_g: float = 30
    salt_g: float = 6
    calcium_mg: float = 700

    # Per-nutrient mode overrides (None = use default_mode)
    energy_mode: Optional[str] = Field(default=None, max_length=10)
    protein_mode: Optional[str] = Field(default=None, max_length=10)
    carbohydrates_mode: Optional[str] = Field(default=None, max_length=10)
    fat_mode: Optional[str] = Field(default=None, max_length=10)
    sugar_mode: Optional[str] = Field(default="limit", max_length=10)
    saturated_fat_mode: Optional[str] = Field(default="limit", max_length=10)
    fibre_mode: Optional[str] = Field(default=None, max_length=10)
    salt_mode: Optional[str] = Field(default="limit", max_length=10)
    calcium_mode: Optional[str] = Field(default=None, max_length=10)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    __table_args__ = (
        CheckConstraint(
            "default_mode IN ('target', 'limit')",
            name="check_default_mode"
        ),
    )
```

**Key Benefits of SQLModel:**

1. **Single Definition**: Models serve as both database tables AND Pydantic models
2. **Type Safety**: Full IDE autocomplete and type checking
3. **Validation**: Automatic validation when creating/updating records
4. **Less Boilerplate**: No need to convert between Pydantic and SQLAlchemy models
5. **FastAPI Ready**: If we add an API later, these models work directly with FastAPI

**2.2.3 repositories.py - Data Access Layer**

```python
"""Repository pattern for data access."""
from typing import Optional, List
from datetime import date
from sqlmodel import Session, select
from uuid import UUID

from nutritional.data_entry.models import (
    FoodItem, FoodEntry, DailyData, DailyTargets, Nutrients
)
from nutritional.database.models import (
    FoodItemModel, FoodEntryModel, DailySummaryModel, DailyTargetsModel
)

class FoodRepository:
    """Repository for food items.

    With SQLModel, conversion is simpler since models have Pydantic validation.
    """

    def __init__(self, session: Session):
        self.session = session

    def get_all(self) -> List[FoodItem]:
        """Get all food items."""
        statement = select(FoodItemModel)
        models = self.session.exec(statement).all()
        return [self._to_pydantic(m) for m in models]

    def get_by_id(self, food_id: UUID) -> Optional[FoodItem]:
        """Get food item by ID."""
        model = self.session.get(FoodItemModel, food_id)
        return self._to_pydantic(model) if model else None

    def create(self, item: FoodItem) -> FoodItem:
        """Create new food item."""
        # Convert Pydantic model to SQLModel (simpler than SQLAlchemy)
        model = FoodItemModel(
            name=item.name,
            unit_type=item.unit_type.value,
            serving_size_g=item.serving_size_g,
            energy_kcal=item.nutrients.energy_kcal,
            protein_g=item.nutrients.protein_g,
            carbohydrates_g=item.nutrients.carbohydrates_g,
            fat_g=item.nutrients.fat_g,
            sugar_g=item.nutrients.sugar_g,
            saturated_fat_g=item.nutrients.saturated_fat_g,
            fibre_g=item.nutrients.fibre_g,
            salt_g=item.nutrients.salt_g,
            calcium_mg=item.nutrients.calcium_mg,
        )
        self.session.add(model)
        self.session.flush()  # Get generated ID
        return self._to_pydantic(model)

    def update(self, item: FoodItem) -> FoodItem:
        """Update existing food item."""
        model = self.session.get(FoodItemModel, item.id)
        if not model:
            raise ValueError(f"Food item {item.id} not found")

        # Update fields (SQLModel makes this cleaner)
        model.name = item.name
        model.unit_type = item.unit_type.value
        model.serving_size_g = item.serving_size_g
        model.energy_kcal = item.nutrients.energy_kcal
        model.protein_g = item.nutrients.protein_g
        model.carbohydrates_g = item.nutrients.carbohydrates_g
        model.fat_g = item.nutrients.fat_g
        model.sugar_g = item.nutrients.sugar_g
        model.saturated_fat_g = item.nutrients.saturated_fat_g
        model.fibre_g = item.nutrients.fibre_g
        model.salt_g = item.nutrients.salt_g
        model.calcium_mg = item.nutrients.calcium_mg

        self.session.add(model)
        self.session.flush()
        return self._to_pydantic(model)

    def delete(self, food_id: UUID) -> bool:
        """Delete food item."""
        model = self.session.get(FoodItemModel, food_id)
        if model:
            self.session.delete(model)
            return True
        return False

    def search(self, query: str) -> List[FoodItem]:
        """Search food items by name."""
        statement = select(FoodItemModel).where(
            FoodItemModel.name.ilike(f"%{query}%")
        )
        models = self.session.exec(statement).all()
        return [self._to_pydantic(m) for m in models]

    @staticmethod
    def _to_pydantic(model: FoodItemModel) -> FoodItem:
        """Convert SQLModel to our Pydantic data_entry model.

        Note: With SQLModel, we could potentially unify these models,
        but keeping them separate maintains clean architecture.
        """
        return FoodItem(
            id=str(model.id),
            name=model.name,
            unit_type=model.unit_type,
            serving_size_g=model.serving_size_g,
            nutrients=Nutrients(
                energy_kcal=model.energy_kcal,
                protein_g=model.protein_g,
                carbohydrates_g=model.carbohydrates_g,
                fat_g=model.fat_g,
                sugar_g=model.sugar_g,
                saturated_fat_g=model.saturated_fat_g,
                fibre_g=model.fibre_g,
                salt_g=model.salt_g,
                calcium_mg=model.calcium_mg,
            )
        )

# Similar implementations for:
# - FoodEntryRepository (simpler with SQLModel)
# - DailySummaryRepository (simpler with SQLModel)
# - DailyTargetsRepository (simpler with SQLModel)
```

**2.2.4 storage.py - DatabaseStorage Class**

```python
"""Database storage implementation matching FileStorage API."""
from typing import Optional, List
from datetime import date, timedelta

from nutritional.data_entry.models import FoodItem, DailyData, DailyTargets
from nutritional.database.connection import get_db_session
from nutritional.database.repositories import (
    FoodRepository, FoodEntryRepository,
    DailySummaryRepository, DailyTargetsRepository
)

class DatabaseStorage:
    """Database storage with same interface as FileStorage."""

    # Food Database Operations
    def get_all_food_items(self) -> List[FoodItem]:
        """Get all food items."""
        with get_db_session() as session:
            repo = FoodRepository(session)
            return repo.get_all()

    def get_food_item(self, food_id: str) -> Optional[FoodItem]:
        """Get single food item."""
        with get_db_session() as session:
            repo = FoodRepository(session)
            return repo.get_by_id(food_id)

    def save_food_item(self, food_item: FoodItem) -> FoodItem:
        """Save food item (create or update)."""
        with get_db_session() as session:
            repo = FoodRepository(session)
            if food_item.id:
                return repo.update(food_item)
            else:
                return repo.create(food_item)

    def delete_food_item(self, food_id: str) -> bool:
        """Delete food item."""
        with get_db_session() as session:
            repo = FoodRepository(session)
            return repo.delete(food_id)

    # Daily Entry Operations
    def load_daily_entry(self, entry_date: date) -> DailyData:
        """Load daily entry."""
        with get_db_session() as session:
            repo = FoodEntryRepository(session)
            entries = repo.get_by_date(entry_date)

            summary_repo = DailySummaryRepository(session)
            summary = summary_repo.get_by_date(entry_date)

            return DailyData(
                date=entry_date,
                entries=entries,
                measurements=Measurements(
                    morning_weight_kg=summary.morning_weight_kg if summary else None,
                    evening_weight_kg=summary.evening_weight_kg if summary else None,
                )
            )

    def save_daily_entry(self, daily_data: DailyData) -> None:
        """Save daily entry and update summary."""
        with get_db_session() as session:
            # Save entries
            entry_repo = FoodEntryRepository(session)
            entry_repo.replace_for_date(daily_data.date, daily_data.entries)

            # Update summary
            summary_repo = DailySummaryRepository(session)
            summary_repo.upsert_from_daily_data(daily_data)

    # Daily Targets Operations
    def save_daily_targets(self, targets: DailyTargets) -> None:
        """Save daily targets."""
        with get_db_session() as session:
            repo = DailyTargetsRepository(session)
            repo.upsert(targets)

    def load_daily_targets(self, target_date: date) -> Optional[DailyTargets]:
        """Load targets for date."""
        with get_db_session() as session:
            repo = DailyTargetsRepository(session)
            return repo.get_by_date(target_date)

    def get_previous_day_targets(self, target_date: date) -> Optional[DailyTargets]:
        """Get targets from previous day."""
        prev_date = target_date - timedelta(days=1)
        return self.load_daily_targets(prev_date)

    def get_or_create_daily_targets(self, target_date: date) -> DailyTargets:
        """Smart fallback: today → yesterday → defaults."""
        targets = self.load_daily_targets(target_date)
        if targets:
            return targets

        prev_targets = self.get_previous_day_targets(target_date)
        if prev_targets:
            prev_targets.date = target_date
            return prev_targets

        return DailyTargets.get_default_targets(target_date)
```

**2.2.5 __init__.py - Storage Factory**

```python
"""Database module exports and storage factory."""
import os
from nutritional.data_entry.storage import FileStorage
from nutritional.database.storage import DatabaseStorage

def get_storage():
    """Factory function to get appropriate storage based on environment."""
    data_source = os.getenv("ENTRY_DATA_SOURCE", "file")

    if data_source == "database":
        return DatabaseStorage()
    else:
        return FileStorage()

__all__ = ["get_storage", "DatabaseStorage"]

#### 2.3 Alembic Migrations Setup

**Note:** SQLModel works seamlessly with Alembic since it's built on SQLAlchemy. Alembic can autogenerate migrations from SQLModel models just like it does with SQLAlchemy models.

**2.3.1 Initialize Alembic**

```powershell
# In project root with venv activated
alembic init nutritional/database/migrations
```

**2.3.2 Configure alembic.ini**

Edit `alembic.ini`:
```ini
[alembic]
script_location = nutritional/database/migrations
prepend_sys_path = .
version_path_separator = os

# Database URL - read from environment
# sqlalchemy.url = (set in env.py dynamically)

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

**2.3.3 Configure env.py**

Edit `nutritional/database/migrations/env.py`:
```python
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment
env_file = Path(__file__).parent.parent.parent.parent / ".env"
load_dotenv(env_file)

# Import SQLModel base and all models for autogenerate
from sqlmodel import SQLModel
from nutritional.database.models import (
    FoodItemModel, FoodEntryModel, DailySummaryModel, DailyTargetsModel
)

# Alembic Config object
config = context.config

# Set SQLAlchemy URL from environment
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL"))

# Interpret the config file for Python logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

**2.3.4 Create Initial Migration**

```powershell
# Generate migration from models
alembic revision --autogenerate -m "initial_schema"

# Review the generated migration in nutritional/database/migrations/versions/

# Apply migration
alembic upgrade head

# Check current version
alembic current

# View migration history
alembic history
```

**Common Alembic Commands:**
```powershell
# Create new migration
alembic revision --autogenerate -m "description"

# Upgrade to latest
alembic upgrade head

# Downgrade one version
alembic downgrade -1

# Downgrade to specific version
alembic downgrade <revision_id>

# Show current version
alembic current

# Show SQL without executing
alembic upgrade head --sql
```

#### 2.4 Dual Data Source Implementation (Phase 2 Transition)

**Goal**: Keep visualization fed from Google Sheets while entry system uses database

**2.4.1 Update settings.py**

```python
"""Application settings and configuration."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment
env_file = Path(__file__).parent.parent / ".env"
load_dotenv(env_file)

class Settings:
    # Environment
    ENV = os.getenv("ENV", "development")

    # Data source configuration
    ENTRY_DATA_SOURCE = os.getenv("ENTRY_DATA_SOURCE", "file")  # file | database
    VIZ_DATA_SOURCE = os.getenv("VIZ_DATA_SOURCE", "google_sheets")  # google_sheets | database

    # Database
    DATABASE_URL = os.getenv("DATABASE_URL")

    # Google Sheets
    GOOGLE_SHEETS_CREDENTIALS = os.getenv(
        "GOOGLE_SHEETS_CREDENTIALS",
        "credentials/nutritional-479017-22cd3962ee25.json"
    )
    GOOGLE_SHEET_ID = os.getenv("GOOGLE_SHEET_ID")

    # File storage
    DATA_DIR = Path(os.getenv("DATA_DIR", "nutritional_data"))

    @property
    def is_development(self) -> bool:
        return self.ENV == "development"

    @property
    def is_production(self) -> bool:
        return self.ENV == "production"

settings = Settings()
```

**2.4.2 Update pages to use storage factory**

Modify `nutritional/pages/entry.py`, `foods.py`, `history.py`:

```python
# OLD: Direct import
# from nutritional.data_entry.storage import FileStorage
# storage = FileStorage()

# NEW: Factory pattern
from nutritional.database import get_storage
storage = get_storage()  # Returns FileStorage or DatabaseStorage based on ENV
```

**2.4.3 Keep loaders.py using Google Sheets**

`nutritional/data/loaders.py` remains unchanged during Phase 2:
```python
# Still loads from Google Sheets for visualization
def load_daily_data():
    """Load data for visualization (from Google Sheets during Phase 2)."""
    client = GoogleSheetsClient()
    return client.get_daily_summaries()
```

**Data Flow During Phase 2:**
```
User Entry (/entry, /foods, /history)
    ↓
  DatabaseStorage
    ↓
  PostgreSQL

Visualization (/home)
    ↓
  loaders.py
    ↓
  Google Sheets (unchanged)
```

**Rationale:**
- Entry system can be fully tested with database
- Visualization continues working with existing data
- No data loss risk during development
- Phase 3 migration can be planned carefully
- Easy rollback if issues arise

#### 2.5 Testing Workflow

**2.5.1 Setup Test Database**

Create `.env.test`:
```bash
ENV=test
DATABASE_URL=postgresql://nutritional_user:dev_password@localhost:5432/nutritional_test
ENTRY_DATA_SOURCE=database
VIZ_DATA_SOURCE=google_sheets
```

**2.5.2 Test Database Fixtures**

Update `tests/conftest.py`:
```python
import pytest
from sqlmodel import create_engine, Session, SQLModel
from nutritional.database.storage import DatabaseStorage
import os

@pytest.fixture(scope="session")
def test_engine():
    """Create test database engine."""
    # Use in-memory SQLite for fast tests, or PostgreSQL for integration tests
    if os.getenv("USE_POSTGRES_TESTS"):
        engine = create_engine(os.getenv("DATABASE_URL"))
    else:
        engine = create_engine("sqlite:///:memory:")

    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)

@pytest.fixture
def db_session(test_engine):
    """Create test database session."""
    session = Session(test_engine)
    yield session
    session.rollback()
    session.close()

@pytest.fixture
def db_storage(db_session, monkeypatch):
    """Create DatabaseStorage for testing."""
    storage = DatabaseStorage()
    # Monkey-patch to use test session
    monkeypatch.setattr(
        "nutritional.database.storage.get_db_session",
        lambda: db_session
    )
    return storage
```

**2.5.3 Testing Checklist**

**Unit Tests:**
- [  ] Test SQLAlchemy model creation and validation
- [  ] Test repository CRUD operations
- [  ] Test Pydantic ↔ SQLAlchemy conversions
- [  ] Test database constraints (unique, foreign keys, checks)

**Integration Tests:**
- [  ] Test DatabaseStorage matches FileStorage API
- [  ] Test food item CRUD through UI
- [  ] Test daily entry save/load
- [  ] Test daily targets save/load
- [  ] Test search functionality
- [  ] Test transaction rollback on errors

**Manual Testing Workflow:**
```powershell
# 1. Start clean database
.\scripts\db_management.ps1 -Command clean
.\scripts\db_management.ps1 -Command start

# 2. Run migrations
alembic upgrade head

# 3. Set environment to use database
# Edit .env: ENTRY_DATA_SOURCE=database

# 4. Start app
python -m nutritional

# 5. Test food database page (/foods)
# - Add food items (both per_100g and per_item)
# - Edit food items
# - Delete food items
# - Search food items

# 6. Test daily entry page (/entry)
# - Add entries with different foods
# - Remove entries
# - Edit weights/quantities
# - Set morning/evening weights
# - Verify auto-save
# - Edit daily targets

# 7. Test history page (/history)
# - View past dates
# - Verify entries display correctly
# - Check totals calculation

# 8. Verify database contents
docker-compose exec postgres psql -U nutritional_user -d nutritional_db
# Run queries:
SELECT * FROM food_items;
SELECT * FROM food_entries WHERE date = '2025-12-29';
SELECT * FROM daily_summaries ORDER BY date DESC LIMIT 5;
SELECT * FROM daily_targets ORDER BY date DESC LIMIT 5;

# 9. Test persistence
# - Stop and restart app
# - Verify data persists

# 10. Clean for Phase 3
.\scripts\db_management.ps1 -Command clean
# This ensures Phase 3 migration starts with clean database
```

#### 2.6 Implementation Checklist

- [  ] Create .env file with database configuration
- [  ] Create docker-compose.yml for PostgreSQL
- [  ] Create db_management.ps1 script
- [  ] Install dependencies (sqlalchemy, alembic, psycopg2-binary)
- [  ] Update pyproject.toml with new dependencies
- [  ] Create database/connection.py
- [  ] Create database/models.py (4 tables)
- [  ] Initialize Alembic
- [  ] Configure Alembic env.py
- [  ] Generate initial migration
- [  ] Create database/repositories.py (4 repositories)
- [  ] Create database/storage.py (DatabaseStorage class)
- [  ] Create database/__init__.py (get_storage factory)
- [  ] Update settings.py with dual data source config
- [  ] Update pages to use get_storage() factory
- [  ] Create test fixtures for database testing
- [  ] Write unit tests for models and repositories
- [  ] Write integration tests for DatabaseStorage
- [  ] Manual testing: Start database
- [  ] Manual testing: Run migrations
- [  ] Manual testing: Test food CRUD
- [  ] Manual testing: Test daily entry CRUD
- [  ] Manual testing: Test targets CRUD
- [  ] Manual testing: Test history viewer
- [  ] Manual testing: Verify data persistence
- [  ] Manual testing: Test search functionality
- [  ] Performance testing: Load testing with realistic data volume
- [  ] Documentation: Update README with database setup
- [  ] Clean database for Phase 3 (db_management.ps1 clean)

**Success Criteria:**
- ✅ All tests passing with DatabaseStorage
- ✅ Entry system works seamlessly with PostgreSQL
- ✅ Visualization still works with Google Sheets
- ✅ No data loss during CRUD operations
- ✅ Database enforces all constraints correctly
- ✅ Clean database ready for Phase 3 migration

**Phase 2 Deliverables:**
1. Fully functional database-backed entry system
2. Comprehensive test suite for database operations
3. Documentation for database setup and management
4. Clean local database ready for data migration
5. Dual data source architecture proven

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

### Phase 1: File-Based System ✅ COMPLETE
- ✅ **Data models & storage**: 2-3 days
- ✅ **Food database UI**: 2 days
- ✅ **Daily entry UI**: 3-4 days
- ✅ **Daily targets/limits system**: 2 days
- ✅ **Integration with viz app**: 1 day
- ✅ **Testing & refinement**: 2-3 days
- ✅ **Total**: ~2 weeks (Completed December 2025)

### Phase 2: Database Integration 🔄 IN PROGRESS
- **Environment setup (Docker, Alembic)**: 1 day
- **Database models & connection**: 1-2 days
- **Repository layer implementation**: 2-3 days
- **DatabaseStorage class**: 1-2 days
- **Dual data source configuration**: 1 day
- **Testing & debugging**: 2-3 days
- **Manual testing workflow**: 1-2 days
- **Documentation**: 1 day
- **Total**: ~2 weeks

### Phase 3: Migration
- **Migration script development**: 2-3 days
- **Pre-migration validation**: 1 day
- **Testing with Google Sheets copy**: 1-2 days
- **Production migration execution**: 1 day
- **Post-migration validation**: 1 day
- **Update loaders.py for database**: 1 day
- **Monitoring & adjustments**: 1 week
- **Total**: ~2-3 weeks

**Overall Progress**: Phase 1 Complete | Phase 2 In Progress | Phase 3 Planned
**Estimated Completion**: Q1 2026 (assuming Phase 2 starts January 2026)

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

### New Files (Phase 2) 📋 PLANNED
- [  ] `.env` - Environment configuration
- [  ] `.env.test` - Test environment configuration
- [  ] `docker-compose.yml` - PostgreSQL container setup
- [  ] `scripts/db_management.ps1` - Database management helper
- [  ] `nutritional/database/__init__.py` - Module exports and get_storage() factory
- [  ] `nutritional/database/connection.py` - Database connection pooling
- [  ] `nutritional/database/models.py` - SQLAlchemy ORM models (4 tables)
- [  ] `nutritional/database/repositories.py` - Data access layer (4 repositories)
- [  ] `nutritional/database/storage.py` - DatabaseStorage class
- [  ] `nutritional/database/migrations/env.py` - Alembic configuration
- [  ] `alembic.ini` - Alembic settings
- [  ] `tests/test_database_models.py` - SQLAlchemy model tests
- [  ] `tests/test_repositories.py` - Repository tests
- [  ] `tests/test_database_storage.py` - DatabaseStorage integration tests

### New Files (Phase 3) 📋 PLANNED
- [  ] `scripts/migrate_from_sheets.py` - Google Sheets migration script
- [  ] `scripts/validate_migration.py` - Migration validation
- [  ] `scripts/backup_database.ps1` - Database backup helper

### Files to Modify

**Phase 2:**
- [  ] `nutritional/settings.py` - Add database config and dual data source
- [  ] `nutritional/pages/entry.py` - Use get_storage() factory
- [  ] `nutritional/pages/foods.py` - Use get_storage() factory
- [  ] `nutritional/pages/history.py` - Use get_storage() factory
- [  ] `pyproject.toml` - Add database dependencies
- [  ] `tests/conftest.py` - Add database test fixtures
- [  ] `README.md` - Update with database setup instructions

**Phase 3:**
- [  ] `nutritional/data/loaders.py` - Switch from Google Sheets to database for visualization
- [  ] `.env` - Update VIZ_DATA_SOURCE to database

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
[project.dependencies]
sqlmodel = ">=0.0.14"        # SQLAlchemy + Pydantic ORM
alembic = ">=1.13.0"         # Database migrations (works with SQLModel)
psycopg2-binary = ">=2.9.0"  # PostgreSQL driver
python-dotenv = ">=1.0.0"    # ✅ Already present

# Note: sqlmodel includes sqlalchemy and pydantic as dependencies,
# so no need to explicitly list them
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

### Next Steps for Phase 2

**Immediate Actions (Database Setup):**
1. ✅ Create `.env` file with local PostgreSQL configuration
2. ✅ Create `docker-compose.yml` for PostgreSQL container
3. ✅ Create `scripts/db_management.ps1` for database management
4. ✅ Install dependencies: `sqlalchemy`, `alembic`, `psycopg2-binary`
5. ✅ Start PostgreSQL: `.\scripts\db_management.ps1 -Command start`

**Development Workflow:**
1. Create SQLAlchemy ORM models (4 tables)
2. Initialize Alembic and configure migrations
3. Generate and apply initial migration
4. Implement repository pattern for data access
5. Create DatabaseStorage class matching FileStorage API
6. Add get_storage() factory with environment-based switching
7. Update settings.py with dual data source configuration
8. Update UI pages to use get_storage() instead of direct FileStorage
9. Write comprehensive tests (unit + integration)
10. Manual testing workflow with local database
11. Clean database for Phase 3: `.\scripts\db_management.ps1 -Command clean`

**Key Design Decisions Made:**
- ✅ PostgreSQL chosen for production-grade features
- ✅ Docker Compose for consistent local development
- ✅ Dual data source during Phase 2 (database for entry, Google Sheets for viz)
- ✅ Repository pattern for clean separation
- ✅ Alembic for version-controlled schema migrations
- ✅ Environment variables for easy dev/prod switching

**Phase 3 Prerequisites:**
- Backup production Google Sheet
- Test migration script with sheet copy
- Validate data quality in source sheet
- Create rollback procedure
- Schedule migration window

The file-based Phase 1 system is fully functional and can be used in production while Phase 2 and 3 are planned and executed.
