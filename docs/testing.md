# Testing Guide

This document describes the testing philosophy and practices for the nutritional project.

## Test Statistics

- **156 tests** across 7 test files
- **93% code coverage** (549 statements, 38 uncovered)
- **All tests follow pytest best practices**

## Testing Philosophy

### 1. Bare Functions Only
We don't use test classes. Every test is a standalone function:

```python
# ✅ Good
def test_rolling_average_smooths_data():
    """Rolling average should reduce variance in data."""
    ...

# ❌ Bad
class TestRollingAverage:
    def test_smooths_data(self):
        ...
```

### 2. Parametrize Over Magic Values

Use `pytest.mark.parametrize` to test multiple cases without duplication:

```python
# ✅ Good
@pytest.mark.parametrize("window,expected_length", [
    (1, 5),
    (3, 5),
    (7, 5),
])
def test_rolling_average_preserves_length(window, expected_length):
    """Rolling average should preserve array length."""
    ...

# ❌ Bad
def test_rolling_average_window_1():
    result = rolling_average(data, 1)
    assert len(result) == 5

def test_rolling_average_window_3():
    result = rolling_average(data, 3)
    assert len(result) == 5
```

### 3. Use Fixtures for Test Data

Never create test data inside test functions. Use fixtures:

```python
# ✅ Good
def test_normalize_to_rdi_calculates_percentages(sample_data, rdi_guidelines):
    """Normalization should calculate percentage of RDI."""
    result = normalize_to_rdi(sample_data, rdi_guidelines, 'Calcium mg')
    ...

# ❌ Bad
def test_normalize_to_rdi_calculates_percentages():
    data = np.array([800, 850, 900, 950, 1000])  # Magic values!
    rdi = {'Calcium mg': 700.0}
    ...
```

### 4. Behavior-Focused Docstrings

Every test must have a docstring describing the expected behavior:

```python
def test_interpolate_daily_fills_gaps():
    """Daily interpolation should fill date gaps with interpolated values."""
    ...
```

## Test Structure

### Fixtures (`tests/conftest.py`)

Shared fixtures available to all tests:

- `sample_dates` - 5 consecutive dates
- `sample_energy_data` - Sample calorie data
- `sample_weight_data` - Dict with morning/evening weights
- `sample_macro_data` - Dict with protein, carbs, fats
- `sample_nutrient_data` - Dict with micronutrients
- `minimal_data_dict` - Basic valid data structure
- `complete_data_dict` - Data with all optional fields
- `data_dict_with_nutrients` - Data with micronutrients for RDI tests
- `data_dict_with_nans` - Data with missing values
- `temp_csv_file` - Temporary CSV file for I/O tests
- `temp_csv_with_missing_values` - CSV with NaN values
- `rdi_guidelines` - Reference daily intake values
- `color_palette` - Standard color scheme

### Test Files

- `test_data_loaders.py` - CSV loading and filtering (24 tests)
- `test_preprocessing.py` - NumPy transformations (22 tests)
- `test_validators.py` - Data quality checks (22 tests)
- `test_transforms.py` - Plot data preparation (21 tests)
- `test_plotting_functions.py` - Plotly figure creation (14 tests)
- `test_callbacks.py` - Dash interactivity (23 tests)
- `test_edge_cases.py` - Edge cases and error conditions (16 tests)

## Coverage Guidelines

### What We Cover

- All business logic (data transformations, calculations)
- Edge cases (empty data, single values, NaN handling)
- Input validation
- API contracts (function signatures and return types)

### What We Don't Cover (pragma: no cover)

- Entry points (`__main__.py`, `app.py`)
- Error handling paths that are defensive (e.g., malformed CSV files)
- Debug/logging code (print statements in validators)
- External service failures (file not found, network errors)

### Adding `pragma: no cover`

Only add to code that:
1. Cannot be meaningfully tested (app entry points)
2. Is defensive error handling for malformed inputs
3. Is debugging/logging code

```python
# Entry point - can't test in isolation
if __name__ == "__main__":  # pragma: no cover
    app.run()

# Defensive error handling
if len(lines) < 2:  # pragma: no cover
    raise ValueError("CSV must have header and data")
```

## Running Tests

```bash
# Run all tests
uv run pytest tests/ -v

# Run with coverage report
uv run pytest tests/ --cov=nutritional --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_transforms.py -v

# Run tests matching a pattern
uv run pytest tests/ -k "rolling_average" -v

# Run with parallel execution (faster)
uv run pytest tests/ -n auto
```

## Writing New Tests

### Checklist

- [ ] Test is a bare function (no classes)
- [ ] Has descriptive name starting with `test_`
- [ ] Has docstring explaining expected behavior
- [ ] Uses fixtures for test data (no magic values)
- [ ] Uses `pytest.mark.parametrize` for multiple test cases
- [ ] Tests behavior, not implementation details
- [ ] Has clear assertions with descriptive failure messages

### Example

```python
@pytest.mark.parametrize("input_array,window,expected_mean", [
    (np.array([10, 20, 30, 40, 50]), 3, np.array([10, 15, 20, 30, 40])),
    (np.array([5, 5, 5, 5, 5]), 3, np.array([5, 5, 5, 5, 5])),
])
def test_rolling_average_calculates_correct_means(input_array, window, expected_mean):
    """Rolling average should calculate cumulative mean correctly."""
    from nutritional.data.preprocessing import rolling_average
    
    result = rolling_average(input_array, window)
    
    assert np.allclose(result, expected_mean, rtol=1e-5)
```

## Continuous Integration

Tests run automatically on every push and pull request via GitHub Actions:

- **Platform**: Ubuntu latest
- **Python**: 3.13
- **Package Manager**: uv
- **Coverage**: Uploaded to Codecov

See `.github/workflows/tests.yml` for configuration.

## Coverage Badges

[![Tests](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml/badge.svg)](https://github.com/tom-charman/nutritional/actions/workflows/tests.yml)
[![codecov](https://codecov.io/gh/tom-charman/nutritional/branch/main/graph/badge.svg)](https://codecov.io/gh/tom-charman/nutritional)

Badges are automatically updated on each push to main.
