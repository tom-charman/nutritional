"""
Tests for Dash callback functions.

Tests verify data serialization, callback behavior, and handling of
various data scenarios in the web interface.
"""

import numpy as np
import pytest

from nutritional.callbacks import deserialize_data, serialize_data

# Test serialize_data


def test_serialize_data_converts_arrays_to_lists(minimal_data_dict):
    """Serialization should convert numpy arrays to JSON-serializable lists."""
    serialized = serialize_data(minimal_data_dict)

    assert isinstance(serialized["dates"], list)
    for values in serialized["data"].values():
        assert isinstance(values, list)


def test_serialize_data_preserves_structure(minimal_data_dict):
    """Serialization should preserve the dictionary structure."""
    serialized = serialize_data(minimal_data_dict)

    assert "dates" in serialized
    assert "data" in serialized
    assert "columns" in serialized
    assert "source" in serialized


def test_serialize_data_handles_nan_values(data_dict_with_nans):
    """Serialization should handle NaN values correctly."""
    serialized = serialize_data(data_dict_with_nans)

    # NaN should be serialized (will become null in JSON)
    assert isinstance(serialized["dates"], list)
    assert isinstance(serialized["data"]["Energy kcal"], list)


# Test deserialize_data


def test_deserialize_data_converts_lists_to_arrays(minimal_data_dict):
    """Deserialization should convert lists back to numpy arrays."""
    serialized = serialize_data(minimal_data_dict)
    deserialized = deserialize_data(serialized)

    assert isinstance(deserialized["dates"], np.ndarray)
    for values in deserialized["data"].values():
        assert isinstance(values, np.ndarray)


def test_deserialize_data_restores_datetime64_dtype(minimal_data_dict):
    """Deserialization should restore datetime64[D] dtype for dates."""
    serialized = serialize_data(minimal_data_dict)
    deserialized = deserialize_data(serialized)

    assert deserialized["dates"].dtype == np.dtype("datetime64[D]")


def test_deserialize_data_restores_float_dtype(minimal_data_dict):
    """Deserialization should restore float dtype for numeric data."""
    serialized = serialize_data(minimal_data_dict)
    deserialized = deserialize_data(serialized)

    for values in deserialized["data"].values():
        assert values.dtype == np.float64


# Test round-trip serialization


@pytest.mark.parametrize(
    "fixture_name", ["minimal_data_dict", "complete_data_dict", "data_dict_with_nans"]
)
def test_round_trip_serialization_preserves_dates(fixture_name, request):
    """Round-trip serialization should preserve date values exactly."""
    data = request.getfixturevalue(fixture_name)

    serialized = serialize_data(data)
    deserialized = deserialize_data(serialized)

    assert np.array_equal(deserialized["dates"], data["dates"])


def test_round_trip_serialization_preserves_numeric_data(minimal_data_dict):
    """Round-trip serialization should preserve numeric values exactly."""
    serialized = serialize_data(minimal_data_dict)
    deserialized = deserialize_data(serialized)

    for col in minimal_data_dict["columns"]:
        original = minimal_data_dict["data"][col]
        restored = deserialized["data"][col]

        # Use allclose to handle floating point comparison
        # NaN values are considered equal
        assert np.allclose(restored, original, equal_nan=True)


def test_round_trip_serialization_preserves_nan_locations(data_dict_with_nans):
    """Round-trip serialization should preserve NaN positions."""
    serialized = serialize_data(data_dict_with_nans)
    deserialized = deserialize_data(serialized)

    for col in data_dict_with_nans["columns"]:
        original_nans = np.isnan(data_dict_with_nans["data"][col])
        restored_nans = np.isnan(deserialized["data"][col])

        assert np.array_equal(original_nans, restored_nans)


def test_round_trip_serialization_preserves_metadata(complete_data_dict):
    """Round-trip serialization should preserve metadata fields."""
    serialized = serialize_data(complete_data_dict)
    deserialized = deserialize_data(serialized)

    assert deserialized["source"] == complete_data_dict["source"]
    assert deserialized["columns"] == complete_data_dict["columns"]


# Test edge cases


def test_serialize_data_with_minimal_fields(minimal_data_dict):
    """Serialization should work with minimal required fields only."""
    # Ensure no optional fields
    assert "last_updated" not in minimal_data_dict

    serialized = serialize_data(minimal_data_dict)

    assert "dates" in serialized
    assert "data" in serialized


def test_deserialize_data_with_minimal_fields():
    """Deserialization should work with minimal required fields only."""
    minimal_serialized = {
        "dates": ["2025-01-01", "2025-01-02"],
        "data": {"Energy kcal": [2000.0, 2100.0]},
        "columns": ["Energy kcal"],
        "source": "CSV",
    }

    deserialized = deserialize_data(minimal_serialized)

    assert len(deserialized["dates"]) == 2
    assert "Energy kcal" in deserialized["data"]


def test_serialize_data_with_empty_data():
    """Serialization should handle data dicts with empty arrays."""
    empty_data = {
        "dates": np.array([], dtype="datetime64[D]"),
        "data": {"Energy kcal": np.array([])},
        "columns": ["Energy kcal"],
        "source": "CSV",
    }

    serialized = serialize_data(empty_data)

    assert len(serialized["dates"]) == 0
    assert len(serialized["data"]["Energy kcal"]) == 0


def test_serialize_data_with_single_value():
    """Serialization should handle data dicts with single values."""
    single_value_data = {
        "dates": np.array(["2025-01-01"], dtype="datetime64[D]"),
        "data": {"Energy kcal": np.array([2000.0])},
        "columns": ["Energy kcal"],
        "source": "CSV",
    }

    serialized = serialize_data(single_value_data)
    deserialized = deserialize_data(serialized)

    assert len(deserialized["dates"]) == 1
    assert deserialized["data"]["Energy kcal"][0] == 2000.0


# Test update_dashboard


def test_update_dashboard_with_no_data():
    """Dashboard update should handle empty data gracefully."""
    from nutritional.callbacks import update_dashboard

    results = update_dashboard(None, None, None, 7)

    # Should return 9 values
    assert len(results) == 9
    # Figures, stats, info should indicate no data
    assert "N/A" in results[3]  # avg_calories
    assert "N/A" in results[4]  # avg_weight
    assert "N/A" in results[5]  # avg_protein
    assert results[6] == "0"  # data_points


def test_update_dashboard_with_valid_data(minimal_data_dict):
    """Dashboard update should process valid data and return figures."""
    from nutritional.callbacks import update_dashboard

    stored_data = serialize_data(minimal_data_dict)
    results = update_dashboard(stored_data, None, None, 7)

    # Should return 9 values
    assert len(results) == 9
    # Should have valid figures (we'll just check they're not None)
    assert results[0] is not None  # calories_weight_figure
    assert results[1] is not None  # macro_breakdown_figure
    assert results[2] is not None  # nutrients_figure


def test_update_dashboard_with_date_range_filter(data_dict_with_nutrients):
    """Dashboard update should filter data by date range."""
    from nutritional.callbacks import update_dashboard

    stored_data = serialize_data(data_dict_with_nutrients)
    start_date = "2025-01-02"
    end_date = "2025-01-04"

    results = update_dashboard(stored_data, start_date, end_date, 3)

    # Should have filtered to 3 data points
    assert results[6] == "3"  # data_points


def test_update_dashboard_with_empty_date_range():
    """Dashboard update should handle date range with no data."""
    from nutritional.callbacks import update_dashboard

    # Create data for Jan 1-5
    data_dict = {
        "dates": np.array(
            ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05"],
            dtype="datetime64[D]",
        ),
        "data": {
            "Calories": np.array([2000, 2100, 1900, 2050, 2200]),
            "Weight (morning)": np.array([70.0, 70.1, 70.2, 70.0, 69.9]),
            "Weight (evening)": np.array([70.5, 70.6, 70.7, 70.5, 70.4]),
            "Protein (g)": np.array([150, 160, 140, 155, 165]),
            "Carbs (g)": np.array([200, 210, 190, 205, 215]),
            "Saturated Fat (g)": np.array([20, 22, 18, 21, 23]),
            "Other Fat (g)": np.array([50, 52, 48, 51, 53]),
        },
        "columns": [
            "Calories",
            "Weight (morning)",
            "Weight (evening)",
            "Protein (g)",
            "Carbs (g)",
            "Saturated Fat (g)",
            "Other Fat (g)",
        ],
        "source": "CSV",
    }

    stored_data = serialize_data(data_dict)
    # Request date range outside data range
    start_date = "2025-02-01"
    end_date = "2025-02-28"

    results = update_dashboard(stored_data, start_date, end_date, 7)

    # Should have 0 data points
    assert results[6] == "0"


def test_update_dashboard_with_different_rolling_windows(data_dict_with_nutrients):
    """Dashboard update should handle different rolling window sizes."""
    from nutritional.callbacks import update_dashboard

    stored_data = serialize_data(data_dict_with_nutrients)

    # Test with different rolling windows
    for window in [1, 3, 7, 14]:
        results = update_dashboard(stored_data, None, None, window)
        # Should succeed for all window sizes
        assert len(results) == 9
        assert results[0] is not None  # Should have valid figure


def test_update_dashboard_calculates_summary_stats(data_dict_with_nutrients):
    """Dashboard update should calculate valid summary statistics."""
    from nutritional.callbacks import update_dashboard

    stored_data = serialize_data(data_dict_with_nutrients)
    results = update_dashboard(stored_data, None, None, 7)

    avg_cals = results[3]
    avg_weight = results[4]
    avg_protein = results[5]

    # Stats should be numeric strings, not "N/A"
    assert avg_cals != "N/A"
    assert avg_weight != "N/A"
    assert avg_protein != "N/A"

    # Should be parseable as numbers
    assert float(avg_cals) > 0
    assert float(avg_weight) > 0
    assert float(avg_protein) > 0


def test_update_dashboard_includes_source_info(data_dict_with_nutrients):
    """Dashboard update should include data source information."""
    from nutritional.callbacks import update_dashboard

    stored_data = serialize_data(data_dict_with_nutrients)
    results = update_dashboard(stored_data, None, None, 7)

    source_info = results[7]

    # Should contain key information
    assert "Data source:" in source_info
    assert "Date range:" in source_info
    assert "Records:" in source_info


# Test load_data callback


def test_load_data_returns_serialized_data(monkeypatch, minimal_data_dict):
    """load_data callback should return serialized data from data source."""
    from nutritional import callbacks

    # Mock get_data_source at the point it's used in callbacks
    def mock_get_data_source():
        return minimal_data_dict

    monkeypatch.setattr("nutritional.callbacks.get_data_source", mock_get_data_source)

    result = callbacks.load_data(0)

    # Should return a dict with serialized data
    assert isinstance(result, dict)
    assert "dates" in result
    assert "data" in result
    assert "columns" in result
    assert isinstance(result["dates"], list)


def test_load_data_with_multiple_clicks(monkeypatch, minimal_data_dict):
    """load_data should work regardless of click count."""
    from nutritional import callbacks

    # Mock get_data_source at the point it's used in callbacks
    def mock_get_data_source():
        return minimal_data_dict

    monkeypatch.setattr("nutritional.callbacks.get_data_source", mock_get_data_source)

    # Test with different click counts
    for n_clicks in [0, 1, 5, None]:
        result = callbacks.load_data(n_clicks)
        assert isinstance(result, dict)
        assert "dates" in result


# Test set_initial_date_range callback


def test_set_initial_date_range_with_valid_data(minimal_data_dict):
    """set_initial_date_range should return first and last dates."""
    from nutritional.callbacks import serialize_data, set_initial_date_range

    stored_data = serialize_data(minimal_data_dict)
    start, end = set_initial_date_range(stored_data)

    assert start == stored_data["dates"][0]
    assert end == stored_data["dates"][-1]
