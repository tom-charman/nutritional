# Nutritional App - Plotly Dash Refactor Plan

**Created:** November 22, 2025
**Purpose:** Transform the current static PDF plotting tool into an interactive Plotly Dash web application with Google Sheets integration

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture Changes](#architecture-changes)
3. [Phase 1: Data Layer Refactor](#phase-1-data-layer-refactor)
4. [Phase 2: Plotting Layer Refactor](#phase-2-plotting-layer-refactor)
5. [Phase 3: Dash Application](#phase-3-dash-application)
6. [Phase 4: Google Sheets Integration](#phase-4-google-sheets-integration)
7. [Phase 5: Polish & Deploy](#phase-5-polish--deploy)
8. [Dependencies](#dependencies)
9. [Testing Strategy](#testing-strategy)

---

## Project Overview

### Current State
- **Input:** Local CSV file (`local_data/Food - Daily.csv`)
- **Processing:** Pandas-based data handling with matplotlib/seaborn plotting
- **Output:** Static PDF files saved to `plots/` directory
- **Visualization Types:**
  1. Calories vs Weight (dual-axis with rolling averages)
  2. Macro Breakdown (stacked area chart with calorie contributions)
  3. Normalized Nutrients vs RDI (multi-line comparison)

### Target State
- **Input:** Google Sheets via Google Drive API (with local CSV fallback)
- **Processing:** NumPy-based data manipulation with Plotly visualization
- **Output:** Interactive web dashboard with real-time updates
- **User Experience:**
  - Date range selection
  - Interactive tooltips and zooming
  - Responsive layout for mobile/desktop
  - Automatic data refresh capability

---

## Architecture Changes

### New Project Structure
```
nutritional/
├── nutritional/
│   ├── __init__.py
│   ├── __main__.py              # Entry point (dash app runner)
│   ├── settings.py              # Configuration constants
│   ├── app.py                   # NEW: Main Dash app definition
│   ├── layout.py                # NEW: Dash layout components
│   ├── callbacks.py             # NEW: Dash callback functions
│   │
│   ├── data/                    # NEW: Data layer sub-module
│   │   ├── __init__.py
│   │   ├── google_sheets.py     # NEW: Google Sheets API integration
│   │   ├── loaders.py           # Refactored data loading (CSV + Sheets)
│   │   ├── preprocessing.py     # NEW: NumPy-based data manipulation
│   │   └── validators.py        # NEW: Data validation utilities
│   │
│   ├── plotting/                # NEW: Plotting sub-module
│   │   ├── __init__.py
│   │   ├── transforms.py        # NEW: All data transformations for plots
│   │   ├── calories_weight.py   # NEW: Calories vs weight plot (Plotly)
│   │   ├── macros.py            # NEW: Macro breakdown plot (Plotly)
│   │   ├── nutrients.py         # NEW: Normalized nutrients plot (Plotly)
│   │   └── utils.py             # NEW: Shared plotting utilities
│   │
│   └── utils/                   # NEW: General utilities
│       ├── __init__.py
│       └── date_helpers.py      # NEW: Date range utilities
│
├── assets/                      # NEW: Static assets for Dash
│   ├── styles.css               # Custom CSS styling
│   └── favicon.ico              # App icon
│
├── credentials/                 # NEW: API credentials (git-ignored)
│   └── google_service_account.json
│
├── local_data/                  # Existing local data storage
│   └── Food - Daily.csv
│
├── plots/                       # Legacy (can be deprecated)
│
├── docs/                        # NEW: Documentation
│   └── dash-refactor-plan.md    # This file
│
├── tests/                       # NEW: Test suite
│   ├── __init__.py
│   ├── test_data_loaders.py
│   ├── test_transforms.py
│   └── test_plotting.py
│
├── .env.example                 # NEW: Environment variables template
├── .gitignore                   # Updated to ignore credentials
├── pyproject.toml               # Updated with new dependencies
└── README.md                    # Updated with new usage instructions
```

### Design Principles
1. **Separation of Concerns:** Data manipulation separate from visualization
2. **NumPy-first:** Prefer NumPy arrays over Pandas DataFrames for calculations
3. **Simple Plotting Functions:** UI rendering functions should only handle Plotly figure creation
4. **Modularity:** Each plot type in its own module with dedicated transform functions
5. **Testability:** Pure functions for transformations enable easy unit testing

---

## Phase 1: Data Layer Refactor

### Objective
Create a robust data layer that supports both CSV and Google Sheets, with NumPy-based processing

### Tasks

#### 1.1 Create `data/loaders.py`
**Purpose:** Centralized data loading from multiple sources

**Functions:**
```python
def load_from_csv(filepath: str) -> dict:
    """
    Load nutritional data from CSV file.

    Returns:
        dict with keys:
            - 'dates': np.array of datetime64 objects
            - 'data': dict of {column_name: np.array}
            - 'columns': list of column names
    """

def load_from_google_sheets(spreadsheet_id: str, range_name: str) -> dict:
    """
    Load nutritional data from Google Sheets.
    Uses same return format as load_from_csv.
    """

def get_data_source() -> dict:
    """
    Intelligently select data source (Sheets -> CSV fallback).
    Returns standardized data dictionary.
    """
```

**Implementation Notes:**
- Use `np.genfromtxt()` or `np.loadtxt()` for CSV reading
- Convert dates to `np.datetime64` for time-series operations
- Store each column as a separate NumPy array (avoid DataFrame overhead)
- Handle missing values with `np.nan` and provide masking utilities

#### 1.2 Create `data/preprocessing.py`
**Purpose:** All data transformation logic using NumPy

**Functions:**
```python
def interpolate_daily(dates: np.ndarray, values: np.ndarray) -> tuple:
    """
    Resample to daily frequency and linearly interpolate missing values.

    Returns:
        (new_dates, interpolated_values)
    """

def rolling_average(values: np.ndarray, window: int) -> np.ndarray:
    """
    Calculate rolling average using np.convolve or sliding window.
    Handles edge cases (start of series).
    """

def normalize_to_rdi(values: np.ndarray, rdi_value: float) -> np.ndarray:
    """
    Normalize values to percentage of RDI.
    Returns (values / rdi_value) * 100
    """

def calculate_macro_calories(protein_g: np.ndarray,
                             carbs_g: np.ndarray,
                             fat_g: np.ndarray,
                             saturated_fat_g: np.ndarray,
                             total_calories: np.ndarray) -> dict:
    """
    Calculate calorie contribution from each macro.
    Apply adjustment factor to match actual total calories.

    Returns:
        dict with keys: 'protein_cal', 'carbs_cal',
                       'saturated_fat_cal', 'other_fat_cal'
    """

def create_date_range(start_date: np.datetime64,
                     end_date: np.datetime64) -> np.ndarray:
    """
    Create continuous daily date range.
    """
```

**Implementation Notes:**
- Use `np.interp()` for linear interpolation
- Rolling averages with `np.convolve()` or manual sliding window
- Vectorized operations throughout (no loops over data points)
- Return tuples or dicts to maintain clarity
- All functions should be pure (no side effects)

#### 1.3 Create `data/validators.py`
**Purpose:** Data validation and error checking

**Functions:**
```python
def validate_columns(data: dict, required_cols: list) -> tuple[bool, list]:
    """
    Check if all required columns exist.
    Returns (is_valid, missing_columns)
    """

def validate_date_range(dates: np.ndarray) -> bool:
    """
    Ensure dates are sorted and within reasonable range.
    """

def check_data_quality(data: dict) -> dict:
    """
    Generate data quality report:
    - Missing value percentages
    - Date gaps
    - Outliers
    """
```

#### 1.4 Create `data/google_sheets.py`
**Purpose:** Google Sheets API integration (Phase 4)

**Initial Structure:**
```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

class GoogleSheetsClient:
    """Wrapper for Google Sheets API operations."""

    def __init__(self, credentials_path: str):
        """Initialize with service account credentials."""

    def get_spreadsheet_data(self, spreadsheet_id: str,
                            range_name: str) -> list:
        """Fetch data from specified sheet range."""

    def get_sheet_metadata(self, spreadsheet_id: str) -> dict:
        """Get spreadsheet metadata (last modified, etc.)."""
```

---

## Phase 2: Plotting Layer Refactor

### Objective
Create Plotly-based plotting functions with data transforms separated from visualization

### Tasks

#### 2.1 Create `plotting/transforms.py`
**Purpose:** ALL data transformations needed for plotting

**Functions:**
```python
def prepare_calories_weight_data(raw_data: dict,
                                rolling_window: int) -> dict:
    """
    Transform raw data for calories vs weight plot.

    Returns:
        dict with keys:
            - 'dates': np.array (common date range)
            - 'calories_avg': np.array
            - 'weight_morning_avg': np.array
            - 'weight_evening_avg': np.array
            - 'y1_limits': (min, max) for calories axis
            - 'y2_limits': (min, max) for weight axis
    """

def prepare_macro_breakdown_data(raw_data: dict,
                                 rolling_window: int) -> dict:
    """
    Transform raw data for macro stacked area chart.

    Returns:
        dict with keys:
            - 'dates': np.array
            - 'carbs_cal': np.array
            - 'protein_cal': np.array
            - 'other_fat_cal': np.array
            - 'saturated_fat_cal': np.array
    """

def prepare_normalized_nutrients_data(raw_data: dict,
                                      rdi_guidelines: dict,
                                      rolling_window: int) -> dict:
    """
    Transform raw data for normalized nutrients plot.

    Returns:
        dict with keys for each nutrient:
            - 'dates': np.array (common)
            - 'saturated_fat_pct': np.array
            - 'sugar_pct': np.array
            - 'fibre_pct': np.array
            - 'salt_pct': np.array
            - 'calcium_pct': np.array
    """
```

**Implementation Notes:**
- These functions call `preprocessing.py` functions internally
- All NumPy operations happen here
- Return data structures optimized for Plotly
- Handle edge cases (missing data, zero values)

#### 2.2 Create `plotting/calories_weight.py`
**Purpose:** Plotly figure for calories vs weight visualization

**Function:**
```python
def create_calories_weight_figure(plot_data: dict,
                                 color_palette: dict) -> go.Figure:
    """
    Create Plotly figure with dual y-axes.

    Args:
        plot_data: Output from prepare_calories_weight_data()
        color_palette: Color scheme from settings

    Returns:
        plotly.graph_objects.Figure
    """
```

**Implementation Notes:**
- Use `plotly.graph_objects` for precise control
- Create dual y-axes with `fig.add_trace(..., secondary_y=True/False)`
- Add `fill='tonexty'` for weight range shading
- Configure hover templates for clarity
- Set axis properties (titles, gridlines, tick formatting)
- Return figure object (no `fig.show()` call)

#### 2.3 Create `plotting/macros.py`
**Purpose:** Plotly figure for macro breakdown visualization

**Function:**
```python
def create_macro_breakdown_figure(plot_data: dict,
                                 color_palette: dict) -> go.Figure:
    """
    Create Plotly stacked area chart for macronutrient calories.

    Args:
        plot_data: Output from prepare_macro_breakdown_data()
        color_palette: Color scheme from settings

    Returns:
        plotly.graph_objects.Figure
    """
```

**Implementation Notes:**
- Use multiple `go.Scatter` traces with `stackgroup='one'`
- Order traces correctly (carbs, protein, other fat, saturated fat)
- Configure colors to match current palette
- Y-axis should start at 0
- Rich hover information showing breakdown

#### 2.4 Create `plotting/nutrients.py`
**Purpose:** Plotly figure for normalized nutrients visualization

**Function:**
```python
def create_normalized_nutrients_figure(plot_data: dict,
                                       color_palette: dict) -> go.Figure:
    """
    Create Plotly multi-line chart for nutrients vs RDI.

    Args:
        plot_data: Output from prepare_normalized_nutrients_data()
        color_palette: Color scheme from settings

    Returns:
        plotly.graph_objects.Figure
    """
```

**Implementation Notes:**
- One trace per nutrient
- Horizontal line at y=100 (100% RDI target)
- Legend positioned appropriately
- Hover shows nutrient name and percentage

#### 2.5 Create `plotting/utils.py`
**Purpose:** Shared plotting utilities

**Functions:**
```python
def apply_common_layout(fig: go.Figure, title: str,
                       date_range: tuple) -> go.Figure:
    """
    Apply consistent styling to all figures.
    - Background colors
    - Font settings
    - Margin adjustments
    - X-axis date formatting
    """

def create_date_selector_buttons() -> list:
    """
    Create Plotly range selector buttons (1M, 3M, 6M, 1Y, ALL).
    """

def format_hover_template(metric_name: str,
                         unit: str,
                         include_date: bool = True) -> str:
    """
    Standardized hover template formatting.
    """
```

---

## Phase 3: Dash Application

### Objective
Build the interactive web application using Plotly Dash

### Tasks

#### 3.1 Create `app.py`
**Purpose:** Main Dash application instance and configuration

```python
import dash
from dash import dcc, html
import dash_bootstrap_components as dbc

# Initialize Dash app with Bootstrap theme
app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    suppress_callback_exceptions=True
)

# Server reference for deployment
server = app.server

# App title and metadata
app.title = "Nutritional Dashboard"

# Import layout and callbacks
from nutritional.layout import get_layout
from nutritional import callbacks  # noqa (registers callbacks)

app.layout = get_layout()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8050)
```

#### 3.2 Create `layout.py`
**Purpose:** Define the entire dashboard layout using Dash components

**Structure:**
```python
def get_layout():
    """
    Create the main dashboard layout.

    Components:
    1. Header with title and refresh button
    2. Date range picker
    3. Summary statistics cards
    4. Three plot sections (tabs or stacked)
    5. Footer with data source info
    """
    return dbc.Container([
        # Header
        dbc.Row([
            dbc.Col([
                html.H1("Nutritional Dashboard",
                       className="text-center mb-4"),
            ])
        ]),

        # Controls
        dbc.Row([
            dbc.Col([
                dcc.DatePickerRange(
                    id='date-range-picker',
                    display_format='YYYY-MM-DD',
                    start_date_placeholder_text="Start Date",
                    end_date_placeholder_text="End Date",
                ),
            ], width=6),
            dbc.Col([
                html.Button('Refresh Data',
                          id='refresh-button',
                          className='btn btn-primary'),
            ], width=3),
        ], className="mb-4"),

        # Summary Cards
        dbc.Row([
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H4(id="avg-calories"),
                        html.P("Avg Daily Calories"),
                    ])
                ])
            ], width=3),
            # ... more summary cards
        ], className="mb-4"),

        # Plots
        dbc.Tabs([
            dbc.Tab([
                dcc.Graph(id='calories-weight-plot')
            ], label="Calories & Weight"),

            dbc.Tab([
                dcc.Graph(id='macro-breakdown-plot')
            ], label="Macronutrient Breakdown"),

            dbc.Tab([
                dcc.Graph(id='nutrients-rdi-plot')
            ], label="Nutrients vs RDI"),
        ]),

        # Loading indicator
        dcc.Loading(
            id="loading",
            type="default",
            children=[html.Div(id="loading-output")]
        ),

        # Store for data (client-side caching)
        dcc.Store(id='data-store'),

        # Footer
        dbc.Row([
            dbc.Col([
                html.P(id="data-source-info",
                      className="text-muted text-center mt-4")
            ])
        ])
    ], fluid=True)
```

**Implementation Notes:**
- Use `dash-bootstrap-components` for responsive grid layout
- Create reusable card components for statistics
- Use tabs to organize plots (reduces initial load)
- Include `dcc.Store` for client-side data caching
- Add loading spinners for async operations

#### 3.3 Create `callbacks.py`
**Purpose:** Define all Dash callbacks for interactivity

**Callbacks:**

```python
from dash import Input, Output, State, callback
from nutritional.data.loaders import get_data_source
from nutritional.plotting.transforms import (
    prepare_calories_weight_data,
    prepare_macro_breakdown_data,
    prepare_normalized_nutrients_data
)
from nutritional.plotting.calories_weight import create_calories_weight_figure
from nutritional.plotting.macros import create_macro_breakdown_figure
from nutritional.plotting.nutrients import create_normalized_nutrients_figure
from nutritional.settings import COLOR_PALETTE, ROLLING_WINDOW_DAYS, RDI_GUIDELINES

@callback(
    Output('data-store', 'data'),
    Input('refresh-button', 'n_clicks'),
    prevent_initial_call=False
)
def load_data(n_clicks):
    """
    Load data from source and store in client-side cache.
    Triggered on initial load and when refresh button clicked.
    """
    raw_data = get_data_source()
    # Convert numpy arrays to lists for JSON serialization
    return serialize_data(raw_data)

@callback(
    [Output('calories-weight-plot', 'figure'),
     Output('macro-breakdown-plot', 'figure'),
     Output('nutrients-rdi-plot', 'figure'),
     Output('avg-calories', 'children'),
     Output('data-source-info', 'children')],
    [Input('data-store', 'data'),
     Input('date-range-picker', 'start_date'),
     Input('date-range-picker', 'end_date')]
)
def update_dashboard(stored_data, start_date, end_date):
    """
    Update all plots and summary statistics based on:
    - Current data in store
    - Selected date range
    """
    if not stored_data:
        # Return empty figures
        return empty_figure(), empty_figure(), empty_figure(), "N/A", "No data"

    # Deserialize data
    raw_data = deserialize_data(stored_data)

    # Filter by date range
    filtered_data = filter_by_date_range(raw_data, start_date, end_date)

    # Prepare data for each plot
    cal_weight_data = prepare_calories_weight_data(
        filtered_data, ROLLING_WINDOW_DAYS
    )
    macro_data = prepare_macro_breakdown_data(
        filtered_data, ROLLING_WINDOW_DAYS
    )
    nutrients_data = prepare_normalized_nutrients_data(
        filtered_data, RDI_GUIDELINES, ROLLING_WINDOW_DAYS
    )

    # Create figures
    fig1 = create_calories_weight_figure(cal_weight_data, COLOR_PALETTE)
    fig2 = create_macro_breakdown_figure(macro_data, COLOR_PALETTE)
    fig3 = create_normalized_nutrients_figure(nutrients_data, COLOR_PALETTE)

    # Calculate summary stat
    avg_cals = f"{np.mean(filtered_data['data']['Energy kcal']):.0f}"

    # Data source info
    source_info = f"Data from: {filtered_data['source']} | Last updated: {filtered_data['last_updated']}"

    return fig1, fig2, fig3, avg_cals, source_info

@callback(
    [Output('date-range-picker', 'start_date'),
     Output('date-range-picker', 'end_date')],
    Input('data-store', 'data')
)
def set_initial_date_range(stored_data):
    """
    Set date picker range to full data range on initial load.
    """
    if not stored_data:
        return None, None

    raw_data = deserialize_data(stored_data)
    dates = raw_data['dates']
    return dates[0], dates[-1]
```

**Implementation Notes:**
- Use `@callback` decorator for all callbacks
- Minimize callback complexity (delegate to transform functions)
- Handle empty/missing data gracefully
- Serialize/deserialize NumPy arrays for `dcc.Store`
- Use `prevent_initial_call` strategically
- Consider using `@callback` with `background=True` for long operations

#### 3.4 Update `__main__.py`
**Purpose:** Entry point for running the Dash app

```python
from nutritional.app import app

if __name__ == '__main__':
    app.run(debug=True)
```

#### 3.5 Create `assets/styles.css`
**Purpose:** Custom CSS styling for the dashboard

```css
/* Custom styling for nutritional dashboard */

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: #f8f9fa;
}

.card {
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    border-radius: 8px;
    transition: transform 0.2s;
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
}

.graph-container {
    background-color: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Date picker styling */
.DateRangePickerInput {
    border-radius: 4px;
}

/* Button styling */
.btn-primary {
    background-color: #0077b6;
    border-color: #0077b6;
}

.btn-primary:hover {
    background-color: #005f8a;
    border-color: #005f8a;
}

/* Responsive adjustments */
@media (max-width: 768px) {
    .container-fluid {
        padding: 10px;
    }

    .card {
        margin-bottom: 15px;
    }
}
```

---

## Phase 4: Google Sheets Integration

### Objective
Enable fetching data from Google Sheets using Google Drive API

### Tasks

#### 4.1 Set Up Google Cloud Project
**Manual Steps:**
1. Create new project in Google Cloud Console
2. Enable Google Sheets API
3. Enable Google Drive API
4. Create Service Account
5. Download credentials JSON file
6. Share Google Sheet with service account email

**Documentation to Create:**
- `docs/google-sheets-setup.md` - Step-by-step guide with screenshots

#### 4.2 Implement `data/google_sheets.py`
**Full Implementation:**

```python
import os
from typing import Optional, Dict, List
import numpy as np
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

class GoogleSheetsClient:
    """Client for Google Sheets API operations."""

    SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
    ]

    def __init__(self, credentials_path: Optional[str] = None):
        """
        Initialize Google Sheets client.

        Args:
            credentials_path: Path to service account JSON.
                            If None, uses GOOGLE_CREDENTIALS_PATH env var.
        """
        if credentials_path is None:
            credentials_path = os.getenv('GOOGLE_CREDENTIALS_PATH')

        if not credentials_path or not os.path.exists(credentials_path):
            raise FileNotFoundError(
                f"Credentials file not found: {credentials_path}"
            )

        self.credentials = service_account.Credentials.from_service_account_file(
            credentials_path, scopes=self.SCOPES
        )

        self.sheets_service = build('sheets', 'v4', credentials=self.credentials)
        self.drive_service = build('drive', 'v3', credentials=self.credentials)

    def get_spreadsheet_data(self,
                            spreadsheet_id: str,
                            range_name: str = 'A:Z') -> List[List]:
        """
        Fetch data from Google Sheet.

        Args:
            spreadsheet_id: The ID from the sheet URL
            range_name: A1 notation range (default: all columns)

        Returns:
            List of rows, each row is a list of cell values

        Raises:
            HttpError: If API request fails
        """
        try:
            result = self.sheets_service.spreadsheets().values().get(
                spreadsheetId=spreadsheet_id,
                range=range_name
            ).execute()

            values = result.get('values', [])
            return values

        except HttpError as error:
            print(f"An error occurred: {error}")
            raise

    def get_last_modified(self, spreadsheet_id: str) -> str:
        """
        Get the last modified timestamp of the spreadsheet.

        Args:
            spreadsheet_id: The ID from the sheet URL

        Returns:
            ISO format timestamp string
        """
        try:
            file_metadata = self.drive_service.files().get(
                fileId=spreadsheet_id,
                fields='modifiedTime'
            ).execute()

            return file_metadata.get('modifiedTime', 'Unknown')

        except HttpError as error:
            print(f"An error occurred: {error}")
            return 'Unknown'

    def validate_sheet_access(self, spreadsheet_id: str) -> bool:
        """
        Check if the service account has access to the sheet.

        Args:
            spreadsheet_id: The ID from the sheet URL

        Returns:
            True if accessible, False otherwise
        """
        try:
            self.sheets_service.spreadsheets().get(
                spreadsheetId=spreadsheet_id
            ).execute()
            return True
        except HttpError:
            return False
```

#### 4.3 Update `data/loaders.py`
**Add Google Sheets support:**

```python
def load_from_google_sheets(spreadsheet_id: str,
                           range_name: str = 'A:Z',
                           credentials_path: Optional[str] = None) -> dict:
    """
    Load nutritional data from Google Sheets.

    Args:
        spreadsheet_id: Google Sheets ID from URL
        range_name: A1 notation range
        credentials_path: Path to service account JSON

    Returns:
        Standardized data dict matching load_from_csv format
    """
    from .google_sheets import GoogleSheetsClient

    client = GoogleSheetsClient(credentials_path)

    # Fetch data
    values = client.get_spreadsheet_data(spreadsheet_id, range_name)

    if not values:
        raise ValueError("No data found in sheet")

    # First row is headers
    headers = values[0]
    data_rows = values[1:]

    # Convert to numpy arrays
    dates = []
    data_dict = {col: [] for col in headers if col != 'Date'}

    for row in data_rows:
        if len(row) > 0 and row[0]:  # Has date value
            # Parse date (assuming YYYY-MM-DD format)
            dates.append(np.datetime64(row[0]))

            # Parse data columns
            for i, col in enumerate(headers[1:], start=1):
                if i < len(row) and row[i]:
                    try:
                        data_dict[col].append(float(row[i]))
                    except ValueError:
                        data_dict[col].append(np.nan)
                else:
                    data_dict[col].append(np.nan)

    # Convert to numpy arrays
    dates_array = np.array(dates)
    for col in data_dict:
        data_dict[col] = np.array(data_dict[col])

    # Get metadata
    last_modified = client.get_last_modified(spreadsheet_id)

    return {
        'dates': dates_array,
        'data': data_dict,
        'columns': list(data_dict.keys()),
        'source': 'Google Sheets',
        'last_updated': last_modified
    }

def get_data_source() -> dict:
    """
    Intelligently select and load data from best available source.
    Priority: Google Sheets > Local CSV

    Returns:
        Standardized data dictionary
    """
    # Try Google Sheets first
    spreadsheet_id = os.getenv('GOOGLE_SHEETS_ID')
    credentials_path = os.getenv('GOOGLE_CREDENTIALS_PATH')

    if spreadsheet_id and credentials_path:
        try:
            print("Attempting to load from Google Sheets...")
            return load_from_google_sheets(spreadsheet_id,
                                          credentials_path=credentials_path)
        except Exception as e:
            print(f"Failed to load from Google Sheets: {e}")
            print("Falling back to local CSV...")

    # Fallback to local CSV
    csv_path = os.getenv('LOCAL_CSV_PATH', 'local_data/Food - Daily.csv')
    if os.path.exists(csv_path):
        print(f"Loading from local CSV: {csv_path}")
        return load_from_csv(csv_path)

    raise FileNotFoundError("No data source available (Sheets or CSV)")
```

#### 4.4 Create `.env.example`
**Template for environment variables:**

```bash
# Google Sheets Configuration
GOOGLE_SHEETS_ID=your_spreadsheet_id_here
GOOGLE_CREDENTIALS_PATH=credentials/google_service_account.json

# Local CSV Fallback
LOCAL_CSV_PATH=local_data/Food - Daily.csv

# App Configuration
DASH_DEBUG=True
DASH_HOST=0.0.0.0
DASH_PORT=8050
```

#### 4.5 Update `.gitignore`
**Add credentials and secrets:**

```gitignore
# Existing entries...

# Google Sheets Credentials
credentials/
*.json
!.gitkeep

# Environment variables
.env
.env.local

# Dash cache
.dash_cache/
```

---

## Phase 5: Polish & Deploy

### Objective
Finalize the application with testing, documentation, and deployment setup

### Tasks

#### 5.1 Testing

**Create `tests/test_data_loaders.py`:**
```python
import pytest
import numpy as np
from nutritional.data.loaders import load_from_csv

def test_load_from_csv(tmp_path):
    """Test CSV loading with sample data."""
    # Create sample CSV
    csv_path = tmp_path / "test_data.csv"
    csv_path.write_text(
        "Date,Energy kcal,Protein g\n"
        "2024-01-01,2000,80\n"
        "2024-01-02,2100,85\n"
    )

    data = load_from_csv(str(csv_path))

    assert 'dates' in data
    assert 'data' in data
    assert len(data['dates']) == 2
    assert data['data']['Energy kcal'][0] == 2000
```

**Create `tests/test_transforms.py`:**
```python
import pytest
import numpy as np
from nutritional.plotting.transforms import (
    prepare_calories_weight_data,
    prepare_macro_breakdown_data
)

def test_prepare_calories_weight_data():
    """Test data transformation for calories/weight plot."""
    # Create mock data
    dates = np.array([np.datetime64('2024-01-01') + np.timedelta64(i, 'D')
                     for i in range(10)])
    raw_data = {
        'dates': dates,
        'data': {
            'Energy kcal': np.random.uniform(1800, 2200, 10),
            'Weight Kg (Morning)': np.random.uniform(70, 72, 10),
            'Weight Kg (Evening)': np.random.uniform(70.5, 72.5, 10)
        }
    }

    result = prepare_calories_weight_data(raw_data, rolling_window=3)

    assert 'dates' in result
    assert 'calories_avg' in result
    assert len(result['dates']) > 0
```

**Run tests:**
```bash
pytest tests/ -v --cov=nutritional
```

#### 5.2 Documentation

**Update `README.md`:**
```markdown
# Nutritional Dashboard

Interactive web application for visualizing nutritional data and weight trends.

## Features
- 📊 Interactive Plotly visualizations
- 🔄 Real-time data from Google Sheets
- 📅 Custom date range selection
- 📱 Responsive design for mobile/desktop
- 🎨 Modern, polished UI

## Setup

### Prerequisites
- Python 3.13+
- Google Cloud project (for Sheets integration)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/nutritional.git
cd nutritional
```

2. Install dependencies:
```bash
pip install -e .
```

3. Set up Google Sheets (optional):
   - Follow [docs/google-sheets-setup.md](docs/google-sheets-setup.md)
   - Place credentials in `credentials/google_service_account.json`

4. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

### Running the App

```bash
python -m nutritional
```

Then open http://localhost:8050 in your browser.

## Data Format

The app expects data in the following CSV/Sheet format:

| Date       | Energy kcal | Protein g | Carbohydrates g | Fat g | Saturated Fat g | ... |
|------------|-------------|-----------|-----------------|-------|-----------------|-----|
| 2024-01-01 | 2000        | 80        | 250             | 65    | 20              | ... |

Required columns:
- Date (YYYY-MM-DD format)
- Energy kcal
- Protein g, Carbohydrates g, Fat g, Saturated Fat g
- Weight Kg (Morning), Weight Kg (Evening)
- Sugar g, Fibre g, Salt g, Calcium mg

## Project Structure
```
nutritional/
├── nutritional/          # Main package
│   ├── data/            # Data loading & processing
│   ├── plotting/        # Visualization modules
│   ├── app.py           # Dash app
│   ├── layout.py        # UI layout
│   └── callbacks.py     # Interactivity
├── assets/              # Static files (CSS, images)
├── tests/               # Test suite
└── docs/                # Documentation
```

## Development

Run tests:
```bash
pytest tests/ -v
```

Run with debug mode:
```bash
python -m nutritional --debug
```

## License
MIT License - see LICENSE file
```

**Create `docs/google-sheets-setup.md`:**
Detailed guide with:
- Google Cloud Console screenshots
- API enabling steps
- Service account creation
- Sheet sharing instructions
- Troubleshooting common issues

#### 5.3 Deployment Options

**Option A: Local/Development**
```bash
python -m nutritional
```

**Option B: Docker**
Create `Dockerfile`:
```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY pyproject.toml .
COPY nutritional/ ./nutritional/
COPY assets/ ./assets/

RUN pip install -e .

EXPOSE 8050

CMD ["python", "-m", "nutritional"]
```

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  nutritional-app:
    build: .
    ports:
      - "8050:8050"
    volumes:
      - ./credentials:/app/credentials:ro
      - ./local_data:/app/local_data:ro
    environment:
      - GOOGLE_SHEETS_ID=${GOOGLE_SHEETS_ID}
      - GOOGLE_CREDENTIALS_PATH=/app/credentials/google_service_account.json
```

**Option C: Heroku**
Create `Procfile`:
```
web: gunicorn nutritional.app:server
```

Update `pyproject.toml` to include gunicorn:
```toml
dependencies = [
    # ... existing
    "gunicorn>=21.2.0",
]
```

**Option D: Render/Railway**
- Connect GitHub repository
- Set environment variables
- Use auto-deploy on push

#### 5.4 Performance Optimization

**Strategies:**
1. **Client-side caching:** Use `dcc.Store` to avoid re-fetching data
2. **Lazy loading:** Load plots only when tab is active
3. **Data sampling:** For very large datasets, sample for visualization
4. **Background callbacks:** Use `@callback(background=True)` for slow operations
5. **Memoization:** Cache transform results using `functools.lru_cache`

**Example memoization:**
```python
from functools import lru_cache

@lru_cache(maxsize=128)
def prepare_calories_weight_data(dates_hash, data_hash, rolling_window):
    # Convert hashes back to arrays...
    # Perform computation...
    return result
```

---

## Dependencies

### Update `pyproject.toml`

```toml
[project]
name = "nutritional"
version = "0.2.0"
description = "Interactive nutritional data visualization dashboard"
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    # Core data processing
    "numpy>=2.3.4",

    # Dash framework
    "dash>=2.14.0",
    "dash-bootstrap-components>=1.5.0",
    "plotly>=5.18.0",

    # Google Sheets integration
    "google-auth>=2.25.0",
    "google-auth-oauthlib>=1.2.0",
    "google-auth-httplib2>=0.2.0",
    "google-api-python-client>=2.110.0",

    # Utilities
    "python-dotenv>=1.0.0",

    # Legacy support (optional, for migration)
    "pandas>=2.3.3",
    "matplotlib>=3.10.7",
    "seaborn>=0.13.2",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-cov>=4.1.0",
    "black>=23.12.0",
    "ruff>=0.1.0",
]
deploy = [
    "gunicorn>=21.2.0",
]

[project.scripts]
nutritional = "nutritional.__main__:main"

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"
```

### Installation Commands

```bash
# Install base dependencies
pip install -e .

# Install with development tools
pip install -e ".[dev]"

# Install with deployment tools
pip install -e ".[deploy]"
```

---

## Testing Strategy

### Test Coverage Goals
- **Data loaders:** 90%+ coverage
  - CSV parsing edge cases
  - Google Sheets API mocking
  - Error handling

- **Transforms:** 95%+ coverage
  - NumPy operations correctness
  - Edge cases (empty data, single point, NaN handling)
  - Output format validation

- **Plotting:** 70%+ coverage
  - Figure structure validation
  - Color/style application
  - Layout configuration

### Testing Tools
- **pytest:** Test runner
- **pytest-cov:** Coverage reporting
- **unittest.mock:** Mock Google Sheets API calls
- **numpy.testing:** Assert array equality with tolerance

### Test Data
Create `tests/fixtures/sample_data.csv`:
```csv
Date,Energy kcal,Protein g,Carbohydrates g,Fat g,Saturated Fat g,Sugar g,Fibre g,Salt g,Calcium mg,Weight Kg (Morning),Weight Kg (Evening)
2024-01-01,2000,80,250,65,20,50,25,4,800,70.5,71.0
2024-01-02,2100,85,240,70,22,45,28,4.5,850,70.3,70.8
2024-01-03,1950,78,255,62,19,52,24,3.8,780,70.4,70.9
...
```

### Continuous Integration
Create `.github/workflows/test.yml`:
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.13'
      - name: Install dependencies
        run: |
          pip install -e ".[dev]"
      - name: Run tests
        run: |
          pytest tests/ -v --cov=nutritional --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## Migration Path

### Phase-by-Phase Implementation

**Week 1: Data Layer**
- [x] Set up new project structure
- [ ] Implement `data/loaders.py` (CSV only)
- [ ] Implement `data/preprocessing.py`
- [ ] Implement `data/validators.py`
- [ ] Write tests for data layer
- [ ] Verify NumPy operations match Pandas results

**Week 2: Plotting Layer**
- [ ] Implement `plotting/transforms.py`
- [ ] Implement `plotting/calories_weight.py`
- [ ] Implement `plotting/macros.py`
- [ ] Implement `plotting/nutrients.py`
- [ ] Write tests for transforms
- [ ] Visual comparison: Plotly vs matplotlib outputs

**Week 3: Dash Application**
- [ ] Implement `app.py` and `layout.py`
- [ ] Implement `callbacks.py`
- [ ] Create `assets/styles.css`
- [ ] Test basic interactivity
- [ ] Responsive design testing

**Week 4: Google Sheets Integration**
- [ ] Set up Google Cloud project
- [ ] Implement `data/google_sheets.py`
- [ ] Update `data/loaders.py` with Sheets support
- [ ] Test with real Google Sheet
- [ ] Document setup process

**Week 5: Polish & Deploy**
- [ ] Complete test suite
- [ ] Update documentation
- [ ] Performance optimization
- [ ] Choose and configure deployment platform
- [ ] Deploy to production

### Backward Compatibility
During migration, keep old plotting functions available:
```python
# In __main__.py
if __name__ == '__main__':
    import sys
    if '--legacy' in sys.argv:
        from nutritional.legacy_main import main
        main()
    else:
        from nutritional.app import app
        app.run(debug=True)
```

---

## Success Metrics

### Functional Requirements
- ✅ All three plots render correctly in Dash
- ✅ Date range filtering works without errors
- ✅ Google Sheets data loads successfully
- ✅ CSV fallback works when Sheets unavailable
- ✅ Responsive design on mobile devices

### Performance Requirements
- ⏱️ Initial page load < 3 seconds
- ⏱️ Plot updates after date change < 1 second
- ⏱️ Google Sheets data fetch < 5 seconds
- 💾 Memory usage < 500MB for typical datasets

### Code Quality Requirements
- 🧪 Test coverage > 85%
- 📝 All public functions documented
- 🎨 Code formatted with black
- ✅ No linting errors (ruff)

---

## Future Enhancements

### Phase 6: Advanced Features (Post-MVP)
1. **User Authentication**
   - Multi-user support
   - Personal Google Sheets per user
   - Saved preferences

2. **Advanced Analytics**
   - Correlation analysis between nutrients
   - Trend forecasting
   - Goal setting and tracking

3. **Export Capabilities**
   - Export plots as PNG/PDF
   - Export filtered data as CSV
   - Generate summary reports

4. **Mobile App**
   - React Native or Flutter app
   - Push notifications for goals
   - Offline data entry

5. **AI Insights**
   - Automated insights generation
   - Anomaly detection
   - Personalized recommendations

---

## Conclusion

This refactor transforms the nutritional project from a static CLI tool into a modern, interactive web application. The architecture prioritizes:

1. **Modularity:** Clear separation between data, transforms, and visualization
2. **Performance:** NumPy-based processing for speed
3. **Maintainability:** Simple plotting functions, complex logic isolated
4. **Flexibility:** Multiple data sources, easy to extend
5. **User Experience:** Interactive, responsive, intuitive interface

The phased approach allows for incremental development and testing, ensuring each component works before moving to the next. The result will be a production-ready dashboard that can scale to multiple users and data sources.

---

**Document Version:** 1.0
**Last Updated:** November 22, 2025
**Author:** GitHub Copilot
**Status:** Ready for Implementation
