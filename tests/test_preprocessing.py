"""Tests for data preprocessing functionality."""

import pytest
import numpy as np
from numpy.testing import assert_array_equal, assert_array_almost_equal

from nutritional.data.preprocessing import (
    interpolate_daily,
    rolling_average,
    normalize_to_rdi,
    calculate_macro_calories,
    create_date_range,
    fill_missing_values
)


class TestInterpolateDaily:
    """Tests for interpolate_daily function."""
    
    def test_interpolate_with_gap(self):
        """Test interpolation fills gaps between dates."""
        dates = np.array(['2024-01-01', '2024-01-03'], dtype='datetime64')
        values = np.array([100.0, 120.0])
        
        new_dates, new_values = interpolate_daily(dates, values)
        
        assert len(new_dates) == 3
        assert new_dates[0] == np.datetime64('2024-01-01')
        assert new_dates[1] == np.datetime64('2024-01-02')
        assert new_dates[2] == np.datetime64('2024-01-03')
        assert new_values[0] == 100.0
        assert new_values[1] == 110.0  # Interpolated
        assert new_values[2] == 120.0
    
    def test_interpolate_no_gap(self):
        """Test interpolation with consecutive dates."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        values = np.array([100.0, 110.0, 120.0])
        
        new_dates, new_values = interpolate_daily(dates, values)
        
        assert len(new_dates) == 3
        assert_array_equal(new_dates, dates)
        assert_array_almost_equal(new_values, values)
    
    def test_interpolate_empty_array(self):
        """Test interpolation with empty arrays."""
        dates = np.array([], dtype='datetime64')
        values = np.array([])
        
        new_dates, new_values = interpolate_daily(dates, values)
        
        assert len(new_dates) == 0
        assert len(new_values) == 0


class TestRollingAverage:
    """Tests for rolling_average function."""
    
    def test_rolling_average_basic(self):
        """Test basic rolling average calculation."""
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        result = rolling_average(values, window=3)
        
        assert len(result) == 5
        assert result[0] == 1.0  # Only 1 value
        assert result[1] == 1.5  # Avg of [1, 2]
        assert result[2] == 2.0  # Avg of [1, 2, 3]
        assert result[3] == 3.0  # Avg of [2, 3, 4]
        assert result[4] == 4.0  # Avg of [3, 4, 5]
    
    def test_rolling_average_with_nan(self):
        """Test rolling average with NaN values."""
        values = np.array([1.0, np.nan, 3.0, 4.0, 5.0])
        result = rolling_average(values, window=3)
        
        assert result[0] == 1.0
        assert result[1] == 1.0  # Only 1 valid value in window [1, NaN]
        assert result[2] == 2.0  # Avg of [1, 3]
        assert result[3] == 3.5  # Avg of [3, 4]
    
    def test_rolling_average_empty(self):
        """Test rolling average with empty array."""
        values = np.array([])
        result = rolling_average(values, window=3)
        
        assert len(result) == 0


class TestNormalizeToRDI:
    """Tests for normalize_to_rdi function."""
    
    def test_normalize_basic(self):
        """Test basic RDI normalization."""
        values = np.array([50.0, 100.0, 150.0])
        result = normalize_to_rdi(values, rdi_value=100.0)
        
        assert_array_almost_equal(result, [50.0, 100.0, 150.0])
    
    def test_normalize_zero_rdi(self):
        """Test normalization with zero RDI value."""
        values = np.array([50.0, 100.0])
        result = normalize_to_rdi(values, rdi_value=0.0)
        
        assert np.all(np.isnan(result))
    
    def test_normalize_with_nan(self):
        """Test normalization with NaN values."""
        values = np.array([50.0, np.nan, 150.0])
        result = normalize_to_rdi(values, rdi_value=100.0)
        
        assert result[0] == 50.0
        assert np.isnan(result[1])
        assert result[2] == 150.0


class TestCalculateMacroCalories:
    """Tests for calculate_macro_calories function."""
    
    def test_calculate_basic(self):
        """Test basic macro calorie calculation."""
        protein_g = np.array([50.0])
        carbs_g = np.array([200.0])
        fat_g = np.array([70.0])
        saturated_fat_g = np.array([20.0])
        total_calories = np.array([2000.0])
        
        result = calculate_macro_calories(
            protein_g, carbs_g, fat_g, saturated_fat_g, total_calories
        )
        
        assert 'protein_cal' in result
        assert 'carbs_cal' in result
        assert 'saturated_fat_cal' in result
        assert 'other_fat_cal' in result
        
        # Check that total approximately matches
        total = (result['protein_cal'][0] + result['carbs_cal'][0] + 
                result['saturated_fat_cal'][0] + result['other_fat_cal'][0])
        assert abs(total - 2000.0) < 1.0
    
    def test_calculate_with_adjustment(self):
        """Test that adjustment factor is applied."""
        # Set up data where calculated cals != actual cals
        protein_g = np.array([100.0])  # 400 cal
        carbs_g = np.array([100.0])    # 400 cal
        fat_g = np.array([100.0])      # 900 cal
        saturated_fat_g = np.array([50.0])  # 450 cal
        total_calories = np.array([1700.0])  # Less than calculated
        
        result = calculate_macro_calories(
            protein_g, carbs_g, fat_g, saturated_fat_g, total_calories
        )
        
        # Total should match actual calories
        total = (result['protein_cal'][0] + result['carbs_cal'][0] + 
                result['saturated_fat_cal'][0] + result['other_fat_cal'][0])
        assert abs(total - 1700.0) < 1.0


class TestCreateDateRange:
    """Tests for create_date_range function."""
    
    def test_create_range_basic(self):
        """Test basic date range creation."""
        start = np.datetime64('2024-01-01')
        end = np.datetime64('2024-01-03')
        
        result = create_date_range(start, end)
        
        assert len(result) == 3
        assert result[0] == np.datetime64('2024-01-01')
        assert result[1] == np.datetime64('2024-01-02')
        assert result[2] == np.datetime64('2024-01-03')
    
    def test_create_range_single_day(self):
        """Test date range with single day."""
        start = np.datetime64('2024-01-01')
        end = np.datetime64('2024-01-01')
        
        result = create_date_range(start, end)
        
        assert len(result) == 1
        assert result[0] == np.datetime64('2024-01-01')


class TestFillMissingValues:
    """Tests for fill_missing_values function."""
    
    def test_fill_linear(self):
        """Test linear interpolation fill."""
        values = np.array([1.0, np.nan, 3.0, np.nan, 5.0])
        result = fill_missing_values(values, method='linear')
        
        assert result[0] == 1.0
        assert result[1] == 2.0
        assert result[2] == 3.0
        assert result[3] == 4.0
        assert result[4] == 5.0
    
    def test_fill_forward(self):
        """Test forward fill."""
        values = np.array([1.0, np.nan, np.nan, 4.0, np.nan])
        result = fill_missing_values(values, method='forward')
        
        assert result[0] == 1.0
        assert result[1] == 1.0
        assert result[2] == 1.0
        assert result[3] == 4.0
        assert result[4] == 4.0
    
    def test_fill_mean(self):
        """Test mean fill."""
        values = np.array([1.0, np.nan, 3.0, np.nan, 5.0])
        result = fill_missing_values(values, method='mean')
        
        mean_val = 3.0  # Mean of [1, 3, 5]
        assert result[1] == mean_val
        assert result[3] == mean_val
    
    def test_fill_invalid_method(self):
        """Test with invalid method."""
        values = np.array([1.0, np.nan, 3.0])
        
        with pytest.raises(ValueError, match="Unknown fill method"):
            fill_missing_values(values, method='invalid')
