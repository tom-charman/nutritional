"""
Tests for data loading functionality.

Tests verify correct behavior of CSV loading, data source selection,
and date range filtering operations.
"""

import numpy as np
import pytest

from nutritional.data.loaders import (
    filter_by_date_range,
    get_data_source,
    load_from_csv,
)

# Test load_from_csv


def test_load_valid_csv_returns_correct_structure(temp_csv_file):
    """CSV loading should return a dict with dates, data, columns, and source."""
    result = load_from_csv(str(temp_csv_file))

    assert isinstance(result, dict)
    assert "dates" in result
    assert "data" in result
    assert "columns" in result
    assert "source" in result
    assert result["source"] == "CSV"


def test_load_csv_dates_are_sorted(temp_csv_file):
    """Loaded dates should be sorted in ascending order."""
    result = load_from_csv(str(temp_csv_file))
    dates = result["dates"]

    assert np.all(dates[:-1] <= dates[1:])


def test_load_csv_converts_dates_to_datetime64(temp_csv_file):
    """Dates should be converted to numpy datetime64[D] dtype."""
    result = load_from_csv(str(temp_csv_file))

    assert result["dates"].dtype == np.dtype("datetime64[D]")


def test_load_csv_converts_numeric_data_to_float(temp_csv_file):
    """Numeric columns should be converted to float arrays."""
    result = load_from_csv(str(temp_csv_file))

    for col, values in result["data"].items():
        assert values.dtype in [np.float64, np.float32]


def test_load_csv_handles_missing_values(temp_csv_with_missing_values):
    """Missing values in CSV should be converted to NaN."""
    result = load_from_csv(str(temp_csv_with_missing_values))

    # Check that some values are NaN
    assert np.any(np.isnan(result["data"]["Energy kcal"]))
    assert np.any(np.isnan(result["data"]["Weight Kg (Morning)"]))


def test_load_csv_includes_metadata(temp_csv_file):
    """Loaded data should include metadata like last_updated and filepath."""
    result = load_from_csv(str(temp_csv_file))

    assert "last_updated" in result
    assert "filepath" in result
    assert result["filepath"] == str(temp_csv_file)


def test_load_csv_with_nonexistent_file_raises_error():
    """Loading a non-existent CSV should raise FileNotFoundError."""
    with pytest.raises(FileNotFoundError):
        load_from_csv("nonexistent_file.csv")


@pytest.mark.parametrize(
    "invalid_path",
    [
        "",
        None,
        123,
    ],
)
def test_load_csv_with_invalid_path_type_raises_error(invalid_path):
    """Loading CSV with invalid path type should raise an error."""
    with pytest.raises((TypeError, FileNotFoundError, ValueError)):
        load_from_csv(invalid_path)


# Test filter_by_date_range


@pytest.mark.parametrize(
    "start_date,end_date,expected_count",
    [
        ("2025-01-01", "2025-01-03", 3),
        ("2025-01-02", "2025-01-05", 4),
        ("2025-01-03", "2025-01-03", 1),
        ("2025-01-01", "2025-01-05", 5),
    ],
)
def test_filter_by_date_range_returns_correct_count(
    minimal_data_dict, start_date, end_date, expected_count
):
    """Date filtering should return the correct number of records."""
    filtered = filter_by_date_range(minimal_data_dict, start_date, end_date)

    assert len(filtered["dates"]) == expected_count


def test_filter_by_date_range_with_only_start_date(minimal_data_dict):
    """Filtering with only start_date should include all dates from start onwards."""
    filtered = filter_by_date_range(minimal_data_dict, start_date="2025-01-03")

    assert len(filtered["dates"]) == 3
    assert filtered["dates"][0] == np.datetime64("2025-01-03")


def test_filter_by_date_range_with_only_end_date(minimal_data_dict):
    """Filtering with only end_date should include all dates up to end."""
    filtered = filter_by_date_range(minimal_data_dict, end_date="2025-01-03")

    assert len(filtered["dates"]) == 3
    assert filtered["dates"][-1] == np.datetime64("2025-01-03")


def test_filter_by_date_range_with_no_dates_returns_all(minimal_data_dict):
    """Filtering without dates should return all data unchanged."""
    filtered = filter_by_date_range(minimal_data_dict)

    assert len(filtered["dates"]) == len(minimal_data_dict["dates"])


def test_filter_by_date_range_preserves_data_alignment(minimal_data_dict):
    """Filtered data should maintain correct alignment between dates and values."""
    filtered = filter_by_date_range(minimal_data_dict, "2025-01-02", "2025-01-04")

    # Check that the energy values match the filtered dates
    original_idx = [1, 2, 3]  # Indices for dates 2, 3, 4
    for i, orig_i in enumerate(original_idx):
        assert (
            filtered["data"]["Energy kcal"][i] == minimal_data_dict["data"]["Energy kcal"][orig_i]
        )


def test_filter_by_date_range_handles_missing_optional_fields(minimal_data_dict):
    """Filtering should not fail when optional metadata fields are missing."""
    # Ensure no optional fields
    assert "last_updated" not in minimal_data_dict
    assert "filepath" not in minimal_data_dict

    filtered = filter_by_date_range(minimal_data_dict, "2025-01-01", "2025-01-03")

    assert len(filtered["dates"]) == 3
    assert "source" in filtered


def test_filter_by_date_range_preserves_optional_fields(complete_data_dict):
    """Filtering should preserve optional fields when they exist."""
    filtered = filter_by_date_range(complete_data_dict, "2025-01-01", "2025-01-03")

    assert "last_updated" in filtered
    assert "filepath" in filtered
    assert filtered["last_updated"] == complete_data_dict["last_updated"]


@pytest.mark.parametrize(
    "start_date,end_date",
    [
        ("2024-12-01", "2024-12-31"),  # Before all data
        ("2025-12-01", "2025-12-31"),  # After all data
        ("2025-01-10", "2025-01-20"),  # No overlap
    ],
)
def test_filter_by_date_range_with_no_matching_data(minimal_data_dict, start_date, end_date):
    """Filtering with no matching dates should return empty arrays."""
    filtered = filter_by_date_range(minimal_data_dict, start_date, end_date)

    assert len(filtered["dates"]) == 0
    for col in filtered["data"].values():
        assert len(col) == 0


# Test get_data_source


def test_get_data_source_with_explicit_path(temp_csv_file, monkeypatch):
    """get_data_source should load from explicitly provided CSV path."""
    from nutritional import settings

    # Mock settings to disable Google Sheets priority
    monkeypatch.setattr(settings, "LOCAL_CSV_PATH", str(temp_csv_file))
    monkeypatch.setattr(settings, "GOOGLE_SHEETS_ID", None)

    result = get_data_source(csv_path=str(temp_csv_file))

    assert result["source"] == "CSV"
    assert len(result["dates"]) > 0


def test_get_data_source_with_nonexistent_explicit_path(monkeypatch):
    """get_data_source with nonexistent explicit path should fall back or raise error."""
    from nutritional import settings

    # Mock settings to ensure no fallback paths exist
    monkeypatch.setattr(settings, "LOCAL_CSV_PATH", None)
    monkeypatch.setattr(settings, "GOOGLE_SHEETS_ID", None)
    monkeypatch.setattr(settings, "GOOGLE_CREDENTIALS_PATH", None)

    # With no fallback, should raise FileNotFoundError
    with pytest.raises(FileNotFoundError):
        get_data_source(csv_path="definitely_nonexistent_file_12345.csv")
