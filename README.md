# nutritional

[![Tests](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml/badge.svg)](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml)
![Coverage](https://img.shields.io/badge/coverage-93%25-brightgreen)
![Python](https://img.shields.io/badge/python-3.13-blue)

Interactive Plotly Dash application for visualizing nutritional data from CSV files or Google Sheets.

## Features

- 📊 **Interactive Plotly Charts**: Calories vs weight, macro breakdown, and RDI-normalized nutrients
- ☁️ **Google Sheets Integration**: Load data directly from Google Sheets with automatic updates
- 🔄 **Rolling Averages**: Smooth out daily fluctuations with configurable rolling windows (1, 3, 7, 14, 30 days)
- 📅 **Date Range Filtering**: Focus on specific time periods
- 🎨 **Responsive UI**: Bootstrap-based layout that works on desktop and mobile
- 📈 **Summary Statistics**: At-a-glance metrics for calories, weight, and protein
- 🔢 **NumPy-First**: Fast data processing using NumPy instead of Pandas
- 💾 **Flexible Data Sources**: Google Sheets (primary) with CSV fallback

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

See [Google Sheets Setup Guide](docs/google-sheets-setup.md) for detailed instructions.

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

### Running Tests

```bash
# Run all tests
uv run pytest tests/ -v

# Run with coverage
uv run pytest tests/ --cov=nutritional --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_transforms.py -v
```

### Test Coverage

The project maintains 96%+ test coverage with 164+ tests following pytest best practices:
- ✅ All tests are bare functions (no test classes)
- ✅ Extensive use of `pytest.mark.parametrize` for comprehensive test cases
- ✅ Shared fixtures in `conftest.py` for reusable test data
- ✅ Behavior-focused docstrings for every test
- ✅ No magic values in tests

### Project Structure

```
nutritional/
├── nutritional/
│   ├── data/              # Data loading and preprocessing
│   │   ├── loaders.py     # CSV/Google Sheets loading
│   │   ├── preprocessing.py  # NumPy transformations
│   │   └── validators.py  # Data quality checks
│   ├── plotting/          # Plotly visualization
│   │   ├── transforms.py  # Plot data preparation
│   │   ├── calories_weight.py  # Calories vs weight figure
│   │   ├── macros.py      # Macro breakdown figure
│   │   ├── nutrients.py   # RDI nutrients figure
│   │   └── utils.py       # Shared plotting utilities
│   ├── app.py            # Dash app initialization
│   ├── layout.py         # UI layout definition
│   ├── callbacks.py      # Interactive callbacks
│   └── settings.py       # Configuration and constants
├── tests/                # Comprehensive test suite
├── local_data/           # Place your CSV here
└── plots/                # HTML plot exports

```

## Architecture

The application follows a clean layered architecture:

1. **Data Layer** (`nutritional/data/`): NumPy-based data loading, filtering, and validation
2. **Plotting Layer** (`nutritional/plotting/`): Data transformations and Plotly figure creation
3. **Application Layer** (`nutritional/`): Dash web interface with callbacks

This separation ensures:
- Plotting functions remain simple (just create figures)
- Data manipulation is centralized and testable
- Easy to swap data sources (CSV → Google Sheets)

## Development

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
- **Standard hooks**: trailing whitespace, end-of-file fixer, YAML/TOML/JSON checks, large files detection
- **ty**: Astral's new type checker (coming soon - currently commented out)

### Running Tests

```bash
# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=nutritional --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_callbacks.py -v
```

## Roadmap

- [x] Phase 1: NumPy data layer
- [x] Phase 2: Plotly plotting layer
- [x] Phase 3: Dash application
- [x] Phase 4: Google Sheets integration
- [ ] Phase 5: Deployment & Polish

## License

MIT
