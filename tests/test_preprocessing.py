"""
Tests for data preprocessing functions.

Tests verify NumPy-based data transformations including interpolation,
rolling averages, normalization, and macro calorie calculations.
"""

import numpy as np
import pytest

from nutritional.data.preprocessing import (
    interpolate_daily,
    rolling_average,
    normalize_to_rdi,
    calculate_macro_calories,
    create_date_range,
    fill_missing_values
)


# Test interpolate_daily


@pytest.mark.parametrize("gap_size,expected_length", [
    (1, 3),  # No gap: 3 consecutive days
    (2, 4),  # 1-day gap: 4 days total
    (5, 7),  # 4-day gap: 7 days total
])
def test_interpolate_daily_creates_continuous_range(gap_size, expected_length):
    """Interpolation should create continuous daily date range spanning all input dates."""
    dates = np.array([
        '2025-01-01',
        f'2025-01-{gap_size:02d}',  # Gap in middle
        f'2025-01-{gap_size + 2:02d}'
    ], dtype='datetime64[D]')
    values = np.array([100.0, 150.0, 120.0])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    assert len(new_dates) == expected_length
    assert len(new_values) == expected_length


def test_interpolate_daily_preserves_original_values():
    """Interpolation should preserve values at original date points."""
    dates = np.array(['2025-01-01', '2025-01-05'], dtype='datetime64[D]')
    values = np.array([100.0, 200.0])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    # First and last values should be preserved
    assert new_values[0] == 100.0
    assert new_values[-1] == 200.0


def test_interpolate_daily_fills_gaps_linearly():
    """Interpolation should fill gaps with linear interpolation."""
    dates = np.array(['2025-01-01', '2025-01-03'], dtype='datetime64[D]')
    values = np.array([100.0, 200.0])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    # Middle value should be interpolated
    assert len(new_values) == 3
    assert new_values[1] == 150.0  # Midpoint


def test_interpolate_daily_does_not_extrapolate_before_first_point():
    """Interpolation should not extend data before the first data point."""
    dates = np.array(['2025-01-05', '2025-01-10'], dtype='datetime64[D]')
    values = np.array([100.0, 150.0])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    # Should start at first date, not earlier
    assert new_dates[0] == dates[0]


def test_interpolate_daily_does_not_extrapolate_after_last_point():
    """Interpolation should not extend data after the last data point."""
    dates = np.array(['2025-01-01', '2025-01-05'], dtype='datetime64[D]')
    values = np.array([100.0, 150.0])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    # Should end at last date, not later
    assert new_dates[-1] == dates[-1]


def test_interpolate_daily_with_empty_arrays():
    """Interpolation with empty arrays should return empty arrays."""
    dates = np.array([], dtype='datetime64[D]')
    values = np.array([])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    assert len(new_dates) == 0
    assert len(new_values) == 0


def test_interpolate_daily_with_single_value():
    """Interpolation with a single value should return that value unchanged."""
    dates = np.array(['2025-01-01'], dtype='datetime64[D]')
    values = np.array([100.0])
    
    new_dates, new_values = interpolate_daily(dates, values)
    
    assert len(new_dates) == 1
    assert new_values[0] == 100.0


# Test rolling_average


@pytest.mark.parametrize("window,expected_length", [
    (3, 8),  # Window 3: returns same length
    (5, 8),  # Window 5: returns same length
    (7, 8),  # Window 7: returns same length
])
def test_rolling_average_returns_correct_length(window, expected_length):
    """Rolling average should return array of same length as input."""
    values = np.array([10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0])
    
    result = rolling_average(values, window)
    
    assert len(result) == expected_length


def test_rolling_average_computes_correct_averages():
    """Rolling average should compute correct mean over the window."""
    values = np.array([10.0, 20.0, 30.0, 40.0, 50.0])
    window = 3
    
    result = rolling_average(values, window)
    
    # Index 2 should be average of [10, 20, 30] = 20
    assert np.isclose(result[2], 20.0)
    # Index 3 should be average of [20, 30, 40] = 30
    assert np.isclose(result[3], 30.0)
    # Index 4 should be average of [30, 40, 50] = 40
    assert np.isclose(result[4], 40.0)


def test_rolling_average_handles_nan_input():
    """Rolling average should skip NaN values when computing averages."""
    values = np.array([10.0, np.nan, 30.0, 40.0, 50.0])
    window = 3
    
    result = rolling_average(values, window)
    
    # Should compute valid averages despite NaN in input
    assert not np.isnan(result[-1])


def test_rolling_average_with_empty_array():
    """Rolling average with empty array should return empty array."""
    values = np.array([])
    
    result = rolling_average(values, 3)
    
    assert len(result) == 0


def test_rolling_average_preserves_array_length():
    """Rolling average should return array of same length as input."""
    values = np.array([10.0, 20.0, 30.0, 40.0, 50.0])
    
    result = rolling_average(values, 3)
    
    assert len(result) == len(values)


# Test normalize_to_rdi


@pytest.mark.parametrize("value,rdi,expected_percent", [
    (50.0, 100.0, 50.0),
    (100.0, 100.0, 100.0),
    (150.0, 100.0, 150.0),
    (25.0, 50.0, 50.0),
    (0.0, 100.0, 0.0),
])
def test_normalize_to_rdi_computes_correct_percentage(value, rdi, expected_percent):
    """Normalization should compute correct percentage of RDI."""
    values = np.array([value])
    
    result = normalize_to_rdi(values, rdi)
    
    assert np.isclose(result[0], expected_percent)


def test_normalize_to_rdi_with_array():
    """Normalization should work correctly with arrays of values."""
    values = np.array([50.0, 100.0, 150.0])
    rdi = 100.0
    
    result = normalize_to_rdi(values, rdi)
    
    assert np.allclose(result, [50.0, 100.0, 150.0])


def test_normalize_to_rdi_handles_nan():
    """Normalization should preserve NaN values in output."""
    values = np.array([50.0, np.nan, 150.0])
    
    result = normalize_to_rdi(values, 100.0)
    
    assert np.isnan(result[1])
    assert np.isclose(result[0], 50.0)


def test_normalize_to_rdi_with_zero_rdi_returns_nan():
    """Normalization with zero RDI should return NaN for division by zero."""
    values = np.array([50.0, 100.0])
    
    result = normalize_to_rdi(values, 0.0)
    
    assert np.all(np.isnan(result))


# Test calculate_macro_calories


def test_calculate_macro_calories_computes_with_adjustment_factor():
    """Macro calorie calculation should apply adjustment factor to match total calories."""
    protein = np.array([50.0])
    carbs = np.array([100.0])
    fat = np.array([50.0])
    sat_fat = np.array([10.0])
    total_cal = np.array([1100.0])
    
    result = calculate_macro_calories(protein, carbs, fat, sat_fat, total_cal)
    
    # Calculate expected: protein (50*4=200) + carbs (100*4=400) + fat (50*9=450) = 1050
    # Adjustment factor = 1100/1050 ≈ 1.048
    # Final protein_cal should be around 200 * 1.048 ≈ 209.5
    assert 'protein_cal' in result
    assert 'carbs_cal' in result
    # The sum should approximately equal total_cal
    total_computed = (result['protein_cal'][0] + result['carbs_cal'][0] + 
                     result['saturated_fat_cal'][0] + result['other_fat_cal'][0])
    assert np.isclose(total_computed, total_cal[0], rtol=0.01)


def test_calculate_macro_calories_adjusts_for_total_energy(sample_macro_data):
    """Macro calorie calculation should adjust 'other fat' when total energy provided."""
    protein = sample_macro_data['protein']
    carbs = sample_macro_data['carbs']
    fat = sample_macro_data['fat']
    sat_fat = sample_macro_data['saturated_fat']
    total_energy = np.array([2000.0, 2100.0, 2200.0, 2150.0, 2050.0])
    
    result = calculate_macro_calories(protein, carbs, fat, sat_fat, total_energy)
    
    # Other fat calories should be adjusted to match total
    assert 'other_fat_cal' in result


def test_calculate_macro_calories_handles_arrays():
    """Macro calorie calculation should work with arrays of multiple values."""
    protein = np.array([50, 60, 70])
    carbs = np.array([100, 110, 120])
    fat = np.array([50, 55, 60])
    sat_fat = np.array([10, 12, 14])
    total_cal = np.array([1100, 1210, 1320])
    
    result = calculate_macro_calories(protein, carbs, fat, sat_fat, total_cal)
    
    assert len(result['protein_cal']) == 3
    assert len(result['carbs_cal']) == 3


# Test create_date_range


@pytest.mark.parametrize("start,end,expected_days", [
    ('2025-01-01', '2025-01-01', 1),  # Same day
    ('2025-01-01', '2025-01-03', 3),  # 3 days
    ('2025-01-01', '2025-01-10', 10),  # 10 days
])
def test_create_date_range_returns_correct_length(start, end, expected_days):
    """Date range creation should return correct number of days."""
    start_date = np.datetime64(start)
    end_date = np.datetime64(end)
    
    result = create_date_range(start_date, end_date)
    
    assert len(result) == expected_days


def test_create_date_range_returns_consecutive_dates():
    """Date range should contain consecutive dates with no gaps."""
    start = np.datetime64('2025-01-01')
    end = np.datetime64('2025-01-05')
    
    result = create_date_range(start, end)
    
    # Check all dates are consecutive
    for i in range(len(result) - 1):
        diff = result[i + 1] - result[i]
        assert diff == np.timedelta64(1, 'D')


def test_create_date_range_with_reversed_dates():
    """Date range with end before start should return empty or handle gracefully."""
    start = np.datetime64('2025-01-10')
    end = np.datetime64('2025-01-01')
    
    result = create_date_range(start, end)
    
    assert len(result) == 0


# Test fill_missing_values


@pytest.mark.parametrize("method,expected_middle", [
    ('linear', 150.0),  # Linear interpolation
    ('forward', 100.0),  # Forward fill
    ('backward', 200.0),  # Backward fill
])
def test_fill_missing_values_uses_correct_method(method, expected_middle):
    """Fill missing values should use the specified interpolation method."""
    values = np.array([100.0, np.nan, 200.0])
    
    result = fill_missing_values(values, method=method)
    
    if method != 'mean':  # Mean will have different expected value
        assert np.isclose(result[1], expected_middle)


def test_fill_missing_values_with_mean_method():
    """Fill missing values with 'mean' should use average of non-NaN values."""
    values = np.array([100.0, np.nan, 200.0])
    
    result = fill_missing_values(values, method='mean')
    
    # Mean of 100 and 200 is 150
    assert np.isclose(result[1], 150.0)


def test_fill_missing_values_invalid_method_raises_error():
    """Fill missing values with invalid method should raise ValueError."""
    values = np.array([100.0, np.nan, 200.0])
    
    with pytest.raises(ValueError, match="Unknown fill method"):
        fill_missing_values(values, method='invalid')


def test_fill_missing_values_handles_no_nan():
    """Fill missing values should return array unchanged when no NaN present."""
    values = np.array([100.0, 150.0, 200.0])
    
    result = fill_missing_values(values, method='linear')
    
    assert np.allclose(result, values)


def test_fill_missing_values_handles_all_nan():
    """Fill missing values should handle arrays with all NaN values."""
    values = np.array([np.nan, np.nan, np.nan])
    
    result = fill_missing_values(values, method='mean')
    
    # With all NaN, result should still be all NaN (or zeros depending on implementation)
    assert len(result) == len(values)
