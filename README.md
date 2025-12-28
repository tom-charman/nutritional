# nutritional

[![Tests](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml/badge.svg)](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml)
![Coverage](https://img.shields.io/badge/coverage-97%25-brightgreen)
![Python](https://img.shields.io/badge/python-3.13-blue)

Interactive Plotly Dash application for visualizing and tracking nutritional data from CSV files or Google Sheets.

## Features

- 📊 **Interactive Plotly Charts**: Calories vs weight, macro breakdown, and RDI-normalized nutrients
- 🍔 **Food Database & Entry System**: Track daily food intake with a searchable food database
- ☁️ **Google Sheets Integration**: Load data directly from Google Sheets with automatic updates
- 🔄 **Rolling Averages**: Smooth out daily fluctuations with configurable rolling windows (1, 3, 7, 14, 30 days)
- 📅 **Date Range Filtering**: Focus on specific time periods
- 🎨 **Responsive UI**: Bootstrap-based multi-page layout
- 📈 **Summary Statistics**: At-a-glance metrics for calories, weight, and protein
- 📊 **Historical Analysis**: View trends and patterns over time
- 🔢 **NumPy-First**: Fast data processing using NumPy instead of Pandas
- 💾 **Flexible Data Sources**: Google Sheets (primary) with CSV fallback

## This project uses

- **Python 3.13**: Modern Python with latest features
- **Plotly Dash**: Interactive web-based data visualization
- **NumPy**: Fast numerical computing for data processing
- **Bootstrap**: Responsive UI components
- **Pydantic**: Data validation and settings management
- **Google Sheets API**: Cloud-based data synchronization
- **pytest**: Comprehensive testing framework
- **uv**: Fast Python package manager

## Installation

This project uses [uv](https://github.com/astral-sh/uv) for package management:

```bash
# Install uv if you haven't already
curl -LsSf https://astral.sh/uv/install.sh | sh

# Clone the repository
git clone https://github.com/tom-charman/nutritional.git
cd nutritional

# Install dependencies
uv sync
```

## Quick Start

### Option 1: Using Local CSV (Quickest)

Place your CSV file in `local_data/Food - Daily.csv`:

```bash
# Run the app
uv run python -m nutritional

# Open browser to http://localhost:8050
```

### Option 2: Using Google Sheets (Recommended for Regular Use)

Quick setup:
1. Create a Google Cloud project and enable Sheets/Drive APIs
2. Create a service account and download credentials JSON
3. Share your Google Sheet with the service account email
4. Configure environment variables:

```bash
# Copy the example file
cp .env.example .env

# Edit .env and set:
# - GOOGLE_SHEETS_ID (from your sheet URL)
# - GOOGLE_SHEETS_RANGE (e.g., 'Sheet1!A:Z' - which sheet and columns to read)
# - GOOGLE_CREDENTIALS_PATH (path to your JSON file)
```

The `.env` file is automatically loaded when the app starts.

**Data Source Priority:**
- If `LOCAL_CSV_PATH` is NOT set: Google Sheets is tried first, then default CSV paths
- If `LOCAL_CSV_PATH` IS set: CSV sources are tried first, Google Sheets as fallback
- This allows flexibility in development (CSV) vs production (Google Sheets)

## CSV Format

Your CSV should have the following columns:
- `Date` (YYYY-MM-DD format)
- `Energy kcal`, `Protein g`, `Carbohydrates g`, `Fat g`, `Saturated Fat g`
- `Weight Kg (Morning)`, `Weight Kg (Evening)`
- Optional: `Sugar g`, `Fibre g`, `Salt g`, `Calcium mg` (for nutrients plot)

## Development

### Project Structure

```
nutritional/
├── nutritional/
│   ├── data/              # Data loading and preprocessing
│   │   ├── loaders.py     # CSV/Google Sheets loading
│   │   ├── preprocessing.py  # NumPy transformations
│   │   ├── validators.py  # Data quality checks
│   │   └── google_sheets.py  # Google Sheets API client
│   ├── data_entry/        # Food database and entry system
│   │   ├── models.py      # Pydantic data models
│   │   ├── calculator.py  # Nutritional calculations
│   │   └── storage.py     # JSON/JSONL persistence
│   ├── plotting/          # Plotly visualization
│   │   ├── transforms.py  # Plot data preparation
│   │   ├── calories_weight.py  # Calories vs weight figure
│   │   ├── macros.py      # Macro breakdown figure
│   │   ├── nutrients.py   # RDI nutrients figure
│   │   └── utils.py       # Shared plotting utilities
│   ├── pages/             # Multi-page Dash app
│   │   ├── home.py        # Main dashboard
│   │   ├── entry.py       # Daily food entry
│   │   ├── foods.py       # Food database management
│   │   └── history.py     # Historical data view
│   ├── app.py            # Dash app initialization
│   ├── layout.py         # UI layout definition
│   ├── callbacks.py      # Interactive callbacks
│   └── settings.py       # Configuration and constants
├── tests/                # Test suite
├── nutritional_data/     # Data storage directory
│   ├── food_database.json    # Food items
│   ├── history.jsonl         # Entry history
│   ├── daily_summaries.csv   # Aggregated data
│   └── daily_entries/        # Daily entry files
└── docs/                 # Documentation

```

### Running Tests

```bash
# Run all tests
uv run pytest tests/ -v

# Run with coverage
uv run pytest tests/ --cov=nutritional --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_transforms.py -v
```

### Pre-commit Hooks

This project uses pre-commit hooks to maintain code quality:

```bash
# Install pre-commit hooks (done automatically after uv sync)
uv run pre-commit install

# Run manually on all files
uv run pre-commit run --all-files
```

Configured hooks:
- **ruff**: Fast Python linter and formatter (replaces flake8, isort, black)
- **ty**: Astral's type checker for Python (local installation)
- **Standard hooks**: trailing whitespace, end-of-file fixer, YAML/TOML/JSON/merge conflict checks, large files detection, and private key detection
