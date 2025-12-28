# Phase 1 Implementation: File-Based Data Entry System

## Overview

Phase 1 implements a file-based data entry system as a stepping stone toward full database migration. This phase introduces a multi-page Dash application with food database management, daily entry tracking, and historical data viewing.

## Architecture

### Multi-Page Application Structure

The application uses Dash's `pages` plugin (`use_pages=True`) to create a multi-page experience with shared navigation:

- **Home** (`/`) - Dashboard with existing visualizations
- **Food Database** (`/foods`) - CRUD interface for food items
- **Daily Entry** (`/entry`) - Food tracking for today
- **History** (`/history`) - View past daily entries

### Data Models

All data structures are defined using Pydantic v2 for validation and serialization:

#### `UnitType` Enum
```python
class UnitType(str, Enum):
    PER_100G = "per_100g"    # Nutrients per 100g (weight-based)
    PER_ITEM = "per_item"     # Nutrients per whole item (quantity-based)
```

#### `Nutrients` Model
Contains all nutritional information fields (energy, macros, micronutrients). All fields are optional floats defaulting to 0.0 to allow partial data entry.

#### `FoodItem` Model
Represents a food in the database:
- `id`: Optional UUID (generated on save)
- `name`: Food name (required)
- `unit_type`: PER_100G or PER_ITEM
- `serving_size_g`: Weight in grams (required for PER_100G)
- `nutrients`: Nutritional information

#### `FoodEntry` Model
Represents a single food entry in a day:
- `timestamp`: When the entry was added
- `food_id`: Reference to FoodItem
- `food_name`: Cached name for display
- `weight_g`: Amount in grams (for PER_100G foods)
- `quantity`: Number of items (for PER_ITEM foods)
- `nutrients`: Calculated nutrients for this entry

#### `Measurements` Model
Daily body measurements:
- `morning_weight_kg`: Optional morning weight
- `evening_weight_kg`: Optional evening weight

#### `DailyData` Model
Complete data for a single day:
- `date`: The date
- `entries`: List of FoodEntry
- `measurements`: Measurements

### Calculator Module

The `calculator.py` module provides two main functions:

#### `calculate_nutrients(food_item, weight_g=None, quantity=None)`
Calculates nutrients for a food entry based on unit type:
- **PER_100G**: Multiplies base nutrients by `(weight_g / 100)`
- **PER_ITEM**: Multiplies base nutrients by `quantity`

#### `calculate_daily_totals(entries)`
Sums up nutrients from all entries in a day.

### Storage Layer

The `FileStorage` class in `storage.py` handles all file I/O operations:

#### Directory Structure
```
nutritional_data/
├── food_database.json       # All food items
├── daily_summaries.csv      # One row per day with totals
├── history.jsonl           # Append-only log of all days
└── daily_entries/          # Individual JSON files per day
    ├── 2025-12-28.json
    └── ...
```

#### Key Methods

- `get_all_food_items()` / `get_food_item(food_id)`: Read food database
- `save_food_item(food_item)`: Create or update food item
- `delete_food_item(food_id)`: Remove food item
- `load_daily_entry(date)`: Load data for a specific date
- `save_daily_entry(daily_data)`: Save to all three locations (daily JSON, history JSONL, summary CSV)

### Pages Implementation

#### Food Database Page (`/foods`)

**Features:**
- Add new food items with full nutritional data
- Edit existing food items
- Delete food items with confirmation
- Search/filter food list
- Supports both per-100g and per-item unit types

**Key Components:**
- Form inputs for all nutritional fields
- Food list with edit/delete buttons
- Pattern-matching callbacks for dynamic buttons

**UX Decisions:**
- Empty/zero values are allowed (not all nutritional data is always available)
- Search filters the displayed list in real-time
- Edit populates the form for quick updates

#### Daily Entry Page (`/entry`)

**Features:**
- Select food from dropdown
- Enter amount (weight or quantity based on food type)
- Auto-save on every action (add/remove entry)
- Display running totals
- Enter morning/evening weights

**Key Components:**
- Food selector dropdown (populated from database)
- Dynamic amount input (appears when food is selected)
- Entries list with remove buttons
- Daily totals display
- Weight inputs

**UX Decisions:**
- **Auto-save Design**: All entries save immediately to today's file, no explicit "Save Day" button needed
- **Today-Only Focus**: Page always shows/edits today's date (use History page for past dates)
- **Persistent State**: Uses session stores to maintain data when navigating between pages
- **Dynamic Inputs**: Amount input only appears when a food is selected, with appropriate label (grams vs. items)

**Technical Implementation:**
- Pattern-matching callbacks handle dynamic amount inputs: `{"type": "food-amount", "index": dash.ALL}`
- Page-load trigger ensures data loads from file when visiting the page
- Persistent stores bridge the gap between pages: `persistent-entries`, `persistent-morning-weight`, `persistent-evening-weight`
- All callbacks read weights from persistent stores (not direct inputs) to avoid multi-page component reference errors

#### History Page (`/history`)

**Features:**
- Date picker to select any past date
- Display all entries for selected date
- Show daily totals and measurements

**Key Components:**
- Date picker
- Entry list display
- Totals summary

## State Management

### Persistent Stores (Session Storage)

Three persistent stores maintain state across page navigation:

1. **`persistent-entries`**: List of food entries for the current editing session
2. **`persistent-morning-weight`**: Morning weight value
3. **`persistent-evening-weight`**: Evening weight value

### Callback Patterns

#### Page Load Pattern
```python
@callback(
    Output("component", "value"),
    [Input("persistent-store", "data"), Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def load_data_on_page_visit(stored_data, _):
    # Load from file if not in store
    # Return stored data or file data
```

#### Auto-Save Pattern
```python
@callback(
    [Output("persistent-entries", "data"), Output("persistent-morning-weight", "data")],
    Input("add-entry-btn", "n_clicks"),
    [State("persistent-entries", "data"), State("persistent-morning-weight", "data")],
    prevent_initial_call=True,
)
def add_and_save(n_clicks, entries, morning_weight):
    # Modify entries
    # Save to file immediately
    # Return updated stores
```

#### Pattern-Matching for Dynamic Components
```python
@callback(
    Output(...),
    Input({"type": "remove-entry", "index": dash.ALL}, "n_clicks"),
    ...,
)
def handle_dynamic_buttons(n_clicks):
    # Get triggered button ID
    ctx = dash.callback_context
    button_id = eval(ctx.triggered[0]["prop_id"].split(".")[0])
    index = button_id["index"]
    # Use index to identify which item to act on
```

## Key Technical Decisions

### Why File-Based Storage?

File-based storage serves as a transitional layer:
- **Simplicity**: No database setup required for Phase 1
- **Portability**: Data files are human-readable and easy to backup
- **Flexibility**: Easy to inspect and debug data
- **Migration Path**: File structure closely mirrors future database schema

### Why Auto-Save Instead of Explicit Save Button?

Original design had a "Save Day" button, but was simplified because:
- **Reduced Cognitive Load**: Users don't need to remember to save
- **No Data Loss**: Every action is immediately persisted
- **Simpler Mental Model**: "What you see is saved" rather than "draft vs. saved state"
- **Better Mobile UX**: Fewer taps required

### Why Persistent Session Stores?

Session stores solve the multi-page state challenge:
- **Cross-Page Persistence**: Data survives navigation
- **No Server-Side Sessions**: Everything lives in browser session storage
- **Automatic Cleanup**: Session storage clears when tab closes
- **Fast Access**: No file I/O on every interaction

### Why Separate `weight_g` and `quantity` Fields?

Instead of a single "amount" field:
- **Type Safety**: Clear distinction between weight-based and count-based entries
- **Calculation Clarity**: Calculator logic is explicit about which field to use
- **Data Integrity**: Only one field is populated per entry based on food's unit type

## Validation and Error Handling

### Pydantic Validation

All data models use Pydantic validators:
- `serving_size_g` required for PER_100G foods
- `weight_g` or `quantity` required (but not both) for food entries
- UUID generation for new food items
- Type coercion (strings to floats, etc.)

### User-Facing Error Messages

All callbacks catch exceptions and return user-friendly alerts:
- Success messages (green alerts)
- Warning messages (yellow alerts) for validation issues
- Error messages (red alerts) for system failures

### Callback Error Prevention

- `prevent_initial_call=True` for action callbacks
- `allow_duplicate=True` for callbacks with overlapping outputs
- `raise PreventUpdate` to skip unnecessary updates
- State checks before accessing component values

## Testing Considerations

### Test Coverage Areas

1. **Data Models**: Pydantic validation rules
2. **Calculator**: Nutrient calculations for both unit types
3. **Storage**: File I/O operations, JSON serialization
4. **Page Callbacks**: Component interactions (requires Dash testing)

### Mock Data Requirements

- Sample food items (both unit types)
- Sample daily entries
- Edge cases (zero values, missing fields, empty lists)

## Future Enhancements (Phase 2+)

### Planned Improvements

1. **Database Migration**: Replace FileStorage with PostgreSQL/SQLite
2. **Historical Editing**: Allow editing past days (not just today)
3. **Undo/Redo**: Implement action history
4. **Import from Google Sheets**: Automated data migration
5. **Export**: Generate reports, CSV exports
6. **Meal Templates**: Save and reuse common meal combinations
7. **Advanced Search**: Filter by nutritional content, date ranges
8. **Data Validation**: Nutritional value reasonableness checks

### Architectural Changes for Phase 2

- Replace `FileStorage` class with `DatabaseStorage`
- Add migration scripts for existing file data
- Introduce caching layer for frequently accessed data
- Implement proper user authentication
- Add data versioning for audit trail

## Dependencies

```toml
[project.dependencies]
dash = ">=3.3.0"
dash-bootstrap-components = ">=2.0.4"
pandas = ">=2.2.3"
plotly = ">=5.24.1"
pydantic = ">=2.0.0"  # Added for Phase 1
```

## File Structure Added

```
nutritional/
├── data_entry/
│   ├── __init__.py           # Module exports
│   ├── models.py             # Pydantic data models
│   ├── calculator.py         # Nutrient calculations
│   └── storage.py            # File I/O operations
└── pages/
    ├── __init__.py           # Pages module
    ├── home.py               # Dashboard wrapper
    ├── foods.py              # Food database manager
    ├── entry.py              # Daily entry form
    └── history.py            # Historical data viewer

nutritional_data/             # Data storage (gitignored)
├── food_database.json
├── daily_summaries.csv
├── history.jsonl
└── daily_entries/

tests/
├── test_data_entry_models.py      # New: Model validation tests
├── test_calculator.py             # New: Calculation tests
└── test_storage.py                # New: Storage layer tests
```

## Conclusion

Phase 1 successfully implements a complete food tracking system with:
- Intuitive multi-page interface
- Automatic data persistence
- Flexible food database
- Historical data access
- Clean separation of concerns
- Type-safe data models
- Comprehensive error handling

The implementation provides a solid foundation for Phase 2 database migration while delivering immediate value to users through a functional, file-based tracking system.
