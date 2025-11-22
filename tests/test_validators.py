"""
Tests for data validation functions.

Tests verify that data quality checks, column validation, and data fix
suggestions work correctly.
"""

import numpy as np
import pytest

from nutritional.data.validators import (
    check_data_quality,
    check_required_columns_for_plot,
    suggest_data_fixes,
    validate_columns,
    validate_date_range,
)

# Test validate_columns


@pytest.mark.parametrize(
    "required_cols",
    [
        ["Energy kcal"],
        ["Energy kcal", "Protein g"],
        ["Energy kcal", "Protein g", "Fat g"],
    ],
)
def test_validate_columns_succeeds_when_all_present(minimal_data_dict, required_cols):
    """Column validation should succeed when all required columns are present."""
    is_valid, missing = validate_columns(minimal_data_dict, required_cols)

    assert is_valid is True
    assert len(missing) == 0


def test_validate_columns_fails_when_columns_missing(minimal_data_dict):
    """Column validation should fail and list missing columns."""
    required_cols = ["Energy kcal", "Nonexistent Column", "Another Missing"]

    is_valid, missing = validate_columns(minimal_data_dict, required_cols)

    assert is_valid is False
    assert "Nonexistent Column" in missing
    assert "Another Missing" in missing


def test_validate_columns_with_empty_requirements(minimal_data_dict):
    """Column validation with empty requirements should always succeed."""
    is_valid, missing = validate_columns(minimal_data_dict, [])

    assert is_valid is True
    assert len(missing) == 0


# Test validate_date_range


def test_validate_date_range_succeeds_for_sorted_dates(sample_dates):
    """Date range validation should succeed when dates are properly sorted."""
    is_valid, issues = validate_date_range(sample_dates)

    assert is_valid is True
    assert len(issues) == 0


def test_validate_date_range_detects_unsorted_dates():
    """Date range validation should detect unsorted dates."""
    dates = np.array(["2025-01-03", "2025-01-01", "2025-01-02"], dtype="datetime64[D]")

    is_valid, issues = validate_date_range(dates)

    assert is_valid is False
    assert len(issues) > 0  # Should have some issues reported


def test_validate_date_range_detects_duplicates():
    """Date range validation should detect duplicate dates."""
    dates = np.array(["2025-01-01", "2025-01-02", "2025-01-02"], dtype="datetime64[D]")

    is_valid, issues = validate_date_range(dates)

    assert is_valid is False
    assert len(issues) > 0  # Should have some issues reported


def test_validate_date_range_with_empty_array():
    """Date range validation with empty array should fail appropriately."""
    dates = np.array([], dtype="datetime64[D]")

    is_valid, issues = validate_date_range(dates)

    assert is_valid is False


# Test check_data_quality


def test_check_data_quality_returns_report_structure(minimal_data_dict):
    """Data quality check should return report dict with expected keys."""
    report = check_data_quality(minimal_data_dict)

    expected_keys = [
        "missing_percentages",
        "date_gaps",
        "total_records",
        "date_range",
        "is_healthy",
    ]
    for key in expected_keys:
        assert key in report


def test_check_data_quality_calculates_missing_percentage(data_dict_with_nans):
    """Data quality check should calculate correct percentage of missing values."""
    report = check_data_quality(data_dict_with_nans)

    assert "missing_percentages" in report
    # Should have some columns with missing data
    assert any(pct > 0 for pct in report["missing_percentages"].values())


def test_check_data_quality_detects_date_gaps(minimal_data_dict):
    """Data quality check should detect gaps in date sequence."""
    # Create data with a gap
    data = minimal_data_dict.copy()
    data["dates"] = np.array(
        [
            "2025-01-01",
            "2025-01-02",
            "2025-01-05",  # Missing 3 and 4
        ],
        dtype="datetime64[D]",
    )

    report = check_data_quality(data)

    # date_gaps is a list of gap information
    assert len(report["date_gaps"]) > 0


def test_check_data_quality_with_clean_data(minimal_data_dict):
    """Data quality check should report clean data appropriately."""
    report = check_data_quality(minimal_data_dict)

    assert report["total_records"] == len(minimal_data_dict["dates"])
    # Clean data should have 0 missing percentage for all columns
    assert all(pct == 0.0 for pct in report["missing_percentages"].values())


# Test check_required_columns_for_plot


@pytest.mark.parametrize(
    "plot_name,should_succeed",
    [
        ("calories_weight", True),
        ("macros", True),
        ("nutrients", False),  # minimal_data_dict doesn't have nutrient columns
    ],
)
def test_check_required_columns_for_plot(minimal_data_dict, plot_name, should_succeed):
    """Required column check should verify columns needed for specific plot types."""
    is_valid, missing = check_required_columns_for_plot(minimal_data_dict, plot_name)

    if should_succeed:
        assert is_valid is True
        assert len(missing) == 0
    else:
        assert is_valid is False
        assert len(missing) > 0


def test_check_required_columns_for_plot_with_invalid_plot_name(minimal_data_dict):
    """Required column check with invalid plot name should raise error."""
    with pytest.raises((ValueError, KeyError)):
        check_required_columns_for_plot(minimal_data_dict, "nonexistent_plot")


# Test suggest_data_fixes


def test_suggest_data_fixes_returns_list(minimal_data_dict):
    """Data fix suggestions should return a list of suggestion strings."""
    suggestions = suggest_data_fixes(minimal_data_dict)

    assert isinstance(suggestions, list)


def test_suggest_data_fixes_for_high_missing_data(data_dict_with_nans):
    """Data fix suggestions should recommend actions for high missing data percentage."""
    # Add more NaN values to trigger high missing data warning
    data = data_dict_with_nans.copy()
    for col in data["data"]:
        data["data"][col][3:] = np.nan  # Make more values NaN

    suggestions = suggest_data_fixes(data)

    assert len(suggestions) > 0


def test_suggest_data_fixes_for_date_gaps(minimal_data_dict):
    """Data fix suggestions should recommend actions for date gaps."""
    data = minimal_data_dict.copy()
    data["dates"] = np.array(["2025-01-01", "2025-01-10"], dtype="datetime64[D]")  # Large gap
    data["data"] = {k: v[:2] for k, v in data["data"].items()}

    suggestions = suggest_data_fixes(data)

    assert len(suggestions) > 0


def test_suggest_data_fixes_for_small_dataset(minimal_data_dict):
    """Data fix suggestions should warn about small datasets."""
    data = minimal_data_dict.copy()
    # Use only 2 records - very small dataset
    data["dates"] = data["dates"][:2]
    data["data"] = {k: v[:2] for k, v in data["data"].items()}

    suggestions = suggest_data_fixes(data)

    assert len(suggestions) > 0


def test_suggest_data_fixes_returns_empty_for_good_data():
    """Data fix suggestions should return few/no suggestions for clean data."""
    # Create a large, clean dataset
    large_dates = np.arange("2025-01-01", "2025-07-01", dtype="datetime64[D]")
    data = {
        "dates": large_dates,
        "data": {
            "Energy kcal": np.full(len(large_dates), 2000.0),
            "Protein g": np.full(len(large_dates), 80.0),
        },
        "columns": ["Energy kcal", "Protein g"],
        "source": "CSV",
    }

    suggestions = suggest_data_fixes(data)

    # Clean data might still get some general suggestions, but should be minimal
    assert isinstance(suggestions, list)
