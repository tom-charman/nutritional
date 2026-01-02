"""
Shared pytest fixtures for nutritional app tests.

This module contains reusable fixtures that can be used across multiple test files.
"""

import csv
import tempfile
from pathlib import Path

import numpy as np
import pytest


@pytest.fixture(autouse=True)
def mock_settings(monkeypatch):
    """
    Automatically mock settings for all tests to ensure no real env vars are used.

    This fixture runs automatically for all tests and ensures tests work in CI/CD
    environments without any real environment variables or data files.
    """
    from nutritional import settings

    # Mock all environment-based settings to None by default
    monkeypatch.setattr(settings, "LOCAL_CSV_PATH", None)
    monkeypatch.setattr(settings, "DASH_DEBUG", True)
    monkeypatch.setattr(settings, "DASH_HOST", "0.0.0.0")
    monkeypatch.setattr(settings, "DASH_PORT", 8050)


@pytest.fixture
def sample_dates():
    """Provide a sample array of dates for testing."""
    return np.array(
        ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05"],
        dtype="datetime64[D]",
    )


@pytest.fixture
def sample_energy_data():
    """Provide sample energy (calorie) data."""
    return np.array([2000.0, 2100.0, 2200.0, 2150.0, 2050.0])


@pytest.fixture
def sample_weight_data():
    """Provide sample weight data."""
    return {
        "morning": np.array([75.0, 74.8, 74.6, 74.7, 74.5]),
        "evening": np.array([75.5, 75.3, 75.1, 75.2, 75.0]),
    }


@pytest.fixture
def sample_macro_data():
    """Provide sample macronutrient data."""
    return {
        "protein": np.array([80.0, 85.0, 90.0, 87.0, 82.0]),
        "carbs": np.array([250.0, 260.0, 270.0, 265.0, 255.0]),
        "fat": np.array([70.0, 75.0, 80.0, 77.0, 72.0]),
        "saturated_fat": np.array([20.0, 22.0, 24.0, 23.0, 21.0]),
    }


@pytest.fixture
def sample_nutrient_data():
    """Provide sample micronutrient data."""
    return {
        "Saturated Fat g": np.array([20.0, 22.0, 24.0, 23.0, 21.0]),
        "Sugar g": np.array([50.0, 55.0, 60.0, 57.0, 52.0]),
        "Fibre g": np.array([25.0, 27.0, 29.0, 28.0, 26.0]),
        "Salt g": np.array([5.0, 5.5, 6.0, 5.7, 5.2]),
        "Calcium mg": np.array([800.0, 850.0, 900.0, 875.0, 825.0]),
    }


@pytest.fixture
def minimal_data_dict(sample_dates, sample_energy_data, sample_weight_data, sample_macro_data):
    """
    Create a minimal valid data dictionary for testing.

    Contains only required fields without optional metadata.
    """
    return {
        "dates": sample_dates,
        "data": {
            "Energy kcal": sample_energy_data,
            "Protein g": sample_macro_data["protein"],
            "Carbohydrates g": sample_macro_data["carbs"],
            "Fat g": sample_macro_data["fat"],
            "Saturated Fat g": sample_macro_data["saturated_fat"],
            "Weight Kg (Morning)": sample_weight_data["morning"],
            "Weight Kg (Evening)": sample_weight_data["evening"],
        },
        "columns": [
            "Energy kcal",
            "Protein g",
            "Carbohydrates g",
            "Fat g",
            "Saturated Fat g",
            "Weight Kg (Morning)",
            "Weight Kg (Evening)",
        ],
        "source": "CSV",
    }


@pytest.fixture
def complete_data_dict(minimal_data_dict):
    """
    Create a complete data dictionary with all optional fields.

    Extends minimal_data_dict with metadata like last_updated and filepath.
    """
    data = minimal_data_dict.copy()
    data["last_updated"] = "2025-01-05T12:00:00"
    data["filepath"] = "/path/to/test_data.csv"
    return data


@pytest.fixture
def data_dict_with_nutrients(minimal_data_dict, sample_nutrient_data):
    """Create data dictionary including micronutrient data."""
    data = minimal_data_dict.copy()
    data["data"].update(sample_nutrient_data)
    data["columns"].extend(sample_nutrient_data.keys())
    return data


@pytest.fixture
def data_dict_with_nans(minimal_data_dict):
    """Create data dictionary with NaN values for testing missing data."""
    data = minimal_data_dict.copy()
    # Add NaNs to various columns
    data["data"]["Energy kcal"][2] = np.nan
    data["data"]["Weight Kg (Morning)"][1] = np.nan
    data["data"]["Weight Kg (Evening)"][3] = np.nan
    return data


@pytest.fixture
def temp_csv_file():
    """
    Create a temporary CSV file for testing file I/O operations.

    Yields the file path and cleans up after the test.
    """
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.writer(f)
        # Write header
        writer.writerow(
            [
                "Date",
                "Energy kcal",
                "Protein g",
                "Carbohydrates g",
                "Fat g",
                "Saturated Fat g",
                "Weight Kg (Morning)",
                "Weight Kg (Evening)",
            ]
        )
        # Write data rows
        writer.writerow(["2025-01-01", "2000", "80", "250", "70", "20", "75.0", "75.5"])
        writer.writerow(["2025-01-02", "2100", "85", "260", "75", "22", "74.8", "75.3"])
        writer.writerow(["2025-01-03", "2200", "90", "270", "80", "24", "74.6", "75.1"])

        temp_path = Path(f.name)

    yield temp_path

    # Cleanup
    if temp_path.exists():
        temp_path.unlink()


@pytest.fixture
def temp_csv_with_missing_values():
    """Create a temporary CSV file with missing values."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["Date", "Energy kcal", "Protein g", "Weight Kg (Morning)"])
        writer.writerow(["2025-01-01", "2000", "80", "75.0"])
        writer.writerow(["2025-01-02", "", "85", ""])  # Missing values
        writer.writerow(["2025-01-03", "2200", "", "74.6"])  # Missing values

        temp_path = Path(f.name)

    yield temp_path

    if temp_path.exists():
        temp_path.unlink()


@pytest.fixture
def rdi_guidelines():
    """Provide standard RDI (Recommended Daily Intake) values."""
    return {
        "Saturated Fat g": 20.0,
        "Sugar g": 90.0,
        "Fibre g": 30.0,
        "Salt g": 6.0,
        "Calcium mg": 700.0,
    }


@pytest.fixture
def color_palette():
    """Provide standard color palette for plotting."""
    return {
        "primary": "#1f77b4",
        "secondary": "#ff7f0e",
        "success": "#2ca02c",
        "danger": "#d62728",
        "warning": "#ff9896",
        "info": "#9467bd",
    }


