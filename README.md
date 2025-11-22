# nutritional

[![Tests](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml/badge.svg)](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml)
[![codecov](https://codecov.io/gh/tom-charman/nutritional/branch/main/graph/badge.svg)](https://codecov.io/gh/tom-charman/nutritional)

Interactive Plotly Dash application for visualizing nutritional data from CSV files or Google Sheets.

## Features

- 📊 **Interactive Plotly Charts**: Calories vs weight, macro breakdown, and RDI-normalized nutrients
- 🔄 **Rolling Averages**: Smooth out daily fluctuations with configurable rolling windows (1, 3, 7, 14, 30 days)
- 📅 **Date Range Filtering**: Focus on specific time periods
- 🎨 **Responsive UI**: Bootstrap-based layout that works on desktop and mobile
- 📈 **Summary Statistics**: At-a-glance metrics for calories, weight, and protein
- 🔢 **NumPy-First**: Fast data processing using NumPy instead of Pandas

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

Place your CSV file in `local_data/Food - Daily.csv` or set the `LOCAL_CSV_PATH` environment variable:

```bash
# Run the app
uv run python -m nutritional

# Open browser to http://localhost:8050
```

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

The project maintains 93%+ test coverage with 156+ tests following pytest best practices:
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

## Roadmap

- [x] Phase 1: NumPy data layer
- [x] Phase 2: Plotly plotting layer
- [x] Phase 3: Dash application
- [ ] Phase 4: Google Sheets integration
- [ ] Phase 5: Deployment

## License

MIT
