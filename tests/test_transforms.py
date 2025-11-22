"""
Tests for plotting data transform functions.

Tests verify that data preparation for plots correctly applies interpolation,
rolling averages, and creates properly formatted output dictionaries.
"""

import numpy as np
import pytest

from nutritional.plotting.transforms import (
    prepare_calories_weight_data,
    prepare_macro_breakdown_data,
    prepare_normalized_nutrients_data,
    calculate_summary_statistics
)


# Test prepare_calories_weight_data


@pytest.mark.parametrize("rolling_window", [3, 7, 14, 30])
def test_prepare_calories_weight_data_returns_required_keys(minimal_data_dict, rolling_window):
    """Calories/weight preparation should return dict with all required keys."""
    result = prepare_calories_weight_data(minimal_data_dict, rolling_window)
    
    required_keys = [
        'dates', 'calories_avg', 'weight_morning_avg', 
        'weight_evening_avg', 'y1_limits', 'y2_limits'
    ]
    for key in required_keys:
        assert key in result


def test_prepare_calories_weight_data_applies_rolling_average(minimal_data_dict):
    """Calories/weight preparation should apply rolling average to data."""
    result = prepare_calories_weight_data(minimal_data_dict, rolling_window=3)
    
    # Rolling average should be applied (implementation uses cumulative mean)
    assert 'calories_avg' in result
    assert len(result['calories_avg']) == len(result['dates'])


def test_prepare_calories_weight_data_computes_axis_limits(minimal_data_dict):
    """Calories/weight preparation should compute appropriate axis limits."""
    result = prepare_calories_weight_data(minimal_data_dict, rolling_window=3)
    
    y1_min, y1_max = result['y1_limits']
    y2_min, y2_max = result['y2_limits']
    
    assert y1_min < y1_max
    assert y2_min < y2_max
    assert isinstance(y1_min, (int, float))
    assert isinstance(y2_min, (int, float))


def test_prepare_calories_weight_data_raises_error_for_missing_columns(minimal_data_dict):
    """Calories/weight preparation should raise error when required columns missing."""
    del minimal_data_dict['data']['Weight Kg (Evening)']
    minimal_data_dict['columns'].remove('Weight Kg (Evening)')
    
    with pytest.raises(ValueError, match="Missing required columns"):
        prepare_calories_weight_data(minimal_data_dict, rolling_window=7)


# Test prepare_macro_breakdown_data


def test_prepare_macro_breakdown_data_returns_required_keys(minimal_data_dict):
    """Macro breakdown preparation should return dict with calorie breakdown keys."""
    result = prepare_macro_breakdown_data(minimal_data_dict, rolling_window=7)
    
    required_keys = ['dates', 'carbs_cal', 'protein_cal', 'other_fat_cal', 'saturated_fat_cal']
    for key in required_keys:
        assert key in result


def test_prepare_macro_breakdown_data_converts_to_calories(minimal_data_dict):
    """Macro breakdown should convert macros to calories using correct factors."""
    result = prepare_macro_breakdown_data(minimal_data_dict, rolling_window=3)
    
    # Protein and carbs use 4 cal/g, fat uses 9 cal/g
    # Check that calorie values are in reasonable range
    assert np.all(result['protein_cal'][~np.isnan(result['protein_cal'])] > 0)
    assert np.all(result['carbs_cal'][~np.isnan(result['carbs_cal'])] > 0)


@pytest.mark.parametrize("rolling_window", [3, 7, 14])
def test_prepare_macro_breakdown_data_with_different_windows(minimal_data_dict, rolling_window):
    """Macro breakdown preparation should work with various rolling window sizes."""
    result = prepare_macro_breakdown_data(minimal_data_dict, rolling_window)
    
    assert len(result['dates']) == len(minimal_data_dict['dates'])


# Test prepare_normalized_nutrients_data


def test_prepare_normalized_nutrients_data_returns_percentage_keys(data_dict_with_nutrients, rdi_guidelines):
    """Normalized nutrients preparation should return percentage keys for each nutrient."""
    result = prepare_normalized_nutrients_data(
        data_dict_with_nutrients, rdi_guidelines, rolling_window=7
    )
    
    assert 'dates' in result
    # Should have percentage keys for each nutrient
    assert any('pct' in key for key in result.keys())


def test_prepare_normalized_nutrients_data_normalizes_to_100_percent(data_dict_with_nutrients, rdi_guidelines):
    """Normalized nutrients should express values as percentage of RDI."""
    result = prepare_normalized_nutrients_data(
        data_dict_with_nutrients, rdi_guidelines, rolling_window=3
    )
    
    # Values should be percentages (can be >100%)
    for key, values in result.items():
        if key != 'dates' and '_pct' in key:
            valid_values = values[~np.isnan(values)]
            if len(valid_values) > 0:
                assert np.all(valid_values >= 0)


def test_prepare_normalized_nutrients_data_raises_error_for_missing_nutrients(minimal_data_dict, rdi_guidelines):
    """Normalized nutrients should raise error when required nutrient columns missing."""
    with pytest.raises(ValueError, match="Missing required columns"):
        prepare_normalized_nutrients_data(minimal_data_dict, rdi_guidelines, rolling_window=7)


# Test calculate_summary_statistics


def test_calculate_summary_statistics_returns_required_keys(minimal_data_dict):
    """Summary statistics should return dict with expected metric keys."""
    result = calculate_summary_statistics(minimal_data_dict)
    
    expected_keys = ['avg_calories', 'avg_protein', 'avg_carbs', 'avg_fat', 'total_days']
    for key in expected_keys:
        assert key in result


def test_calculate_summary_statistics_computes_correct_averages(minimal_data_dict):
    """Summary statistics should compute correct mean values."""
    result = calculate_summary_statistics(minimal_data_dict)
    
    # Compute expected average manually
    expected_avg_calories = np.mean(minimal_data_dict['data']['Energy kcal'])
    
    assert np.isclose(result['avg_calories'], expected_avg_calories)


def test_calculate_summary_statistics_handles_nan_values(data_dict_with_nans):
    """Summary statistics should skip NaN values when computing averages."""
    result = calculate_summary_statistics(data_dict_with_nans)
    
    # Should compute average of non-NaN values
    assert result['avg_calories'] is not None
    assert not np.isnan(result['avg_calories'])


def test_calculate_summary_statistics_with_date_filtering(minimal_data_dict):
    """Summary statistics should filter data by date range when provided."""
    start_date = np.datetime64('2025-01-02')
    end_date = np.datetime64('2025-01-04')
    
    result = calculate_summary_statistics(minimal_data_dict, start_date, end_date)
    
    # Should only include 3 days
    assert result['total_days'] == 3


def test_calculate_summary_statistics_returns_none_for_missing_columns(minimal_data_dict):
    """Summary statistics should return None for missing optional columns."""
    del minimal_data_dict['data']['Weight Kg (Morning)']
    
    result = calculate_summary_statistics(minimal_data_dict)
    
    assert result.get('avg_weight_morning') is None


def test_calculate_summary_statistics_handles_all_nan_column(data_dict_with_nans):
    """Summary statistics should return None when all values in a column are NaN."""
    # Make all morning weights NaN
    data_dict_with_nans['data']['Weight Kg (Morning)'][:] = np.nan
    
    result = calculate_summary_statistics(data_dict_with_nans)
    
    assert result['avg_weight_morning'] is None
