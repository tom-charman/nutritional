import numpy as np
import pytest

from nutritional.data.loaders import (
    filter_by_date_range,
    get_data_source,
)


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
