"""Tests for plotting transform functions."""

import pytest
import numpy as np

from nutritional.plotting.transforms import (
    prepare_calories_weight_data,
    prepare_macro_breakdown_data,
    prepare_normalized_nutrients_data,
    calculate_summary_statistics,
)


class TestPrepareCaloriesWeightData:
    """Tests for prepare_calories_weight_data function."""
    
    def test_basic_preparation(self):
        """Test basic data preparation for calories/weight plot."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Energy kcal': np.array([2000.0, 2100.0, 1950.0]),
                'Weight Kg (Morning)': np.array([70.0, 70.2, 70.1]),
                'Weight Kg (Evening)': np.array([70.5, 70.7, 70.6]),
            },
            'columns': ['Energy kcal', 'Weight Kg (Morning)', 'Weight Kg (Evening)']
        }
        
        result = prepare_calories_weight_data(raw_data, rolling_window=2)
        
        assert 'dates' in result
        assert 'calories_avg' in result
        assert 'weight_morning_avg' in result
        assert 'weight_evening_avg' in result
        assert 'y1_limits' in result
        assert 'y2_limits' in result
        
        assert len(result['dates']) == 3
        assert len(result['calories_avg']) == 3
    
    def test_missing_columns(self):
        """Test error when required columns are missing."""
        raw_data = {
            'dates': np.array(['2024-01-01'], dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000.0]),
            },
            'columns': ['Energy kcal']
        }
        
        with pytest.raises(ValueError, match="Missing required columns"):
            prepare_calories_weight_data(raw_data, rolling_window=2)
    
    def test_axis_limits(self):
        """Test that axis limits are calculated correctly."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Energy kcal': np.array([2000.0, 2100.0, 1950.0]),
                'Weight Kg (Morning)': np.array([70.0, 70.2, 70.1]),
                'Weight Kg (Evening)': np.array([70.5, 70.7, 70.6]),
            },
            'columns': ['Energy kcal', 'Weight Kg (Morning)', 'Weight Kg (Evening)']
        }
        
        result = prepare_calories_weight_data(raw_data, rolling_window=2)
        
        y1_min, y1_max = result['y1_limits']
        y2_min, y2_max = result['y2_limits']
        
        # Calories should be rounded to 100s
        assert y1_min % 100 == 0
        assert y1_max % 100 == 0
        
        # Weight should be integers
        assert isinstance(y2_min, (int, np.integer))
        assert isinstance(y2_max, (int, np.integer))


class TestPrepareMacroBreakdownData:
    """Tests for prepare_macro_breakdown_data function."""
    
    def test_basic_preparation(self):
        """Test basic data preparation for macro breakdown."""
        dates = np.array(['2024-01-01', '2024-01-02'], dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Protein g': np.array([80.0, 85.0]),
                'Carbohydrates g': np.array([250.0, 260.0]),
                'Fat g': np.array([70.0, 75.0]),
                'Saturated Fat g': np.array([20.0, 22.0]),
                'Energy kcal': np.array([2000.0, 2100.0]),
            },
            'columns': ['Protein g', 'Carbohydrates g', 'Fat g', 
                       'Saturated Fat g', 'Energy kcal']
        }
        
        result = prepare_macro_breakdown_data(raw_data, rolling_window=2)
        
        assert 'dates' in result
        assert 'carbs_cal' in result
        assert 'protein_cal' in result
        assert 'other_fat_cal' in result
        assert 'saturated_fat_cal' in result
        
        assert len(result['dates']) == 2
    
    def test_calorie_adjustment(self):
        """Test that macro calories sum to approximately total calories."""
        dates = np.array(['2024-01-01'], dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Protein g': np.array([100.0]),  # 400 kcal
                'Carbohydrates g': np.array([100.0]),  # 400 kcal
                'Fat g': np.array([100.0]),  # 900 kcal
                'Saturated Fat g': np.array([50.0]),  # 450 kcal
                'Energy kcal': np.array([1700.0]),  # Actual total
            },
            'columns': ['Protein g', 'Carbohydrates g', 'Fat g', 
                       'Saturated Fat g', 'Energy kcal']
        }
        
        result = prepare_macro_breakdown_data(raw_data, rolling_window=1)
        
        total_from_macros = (result['protein_cal'][0] + 
                           result['carbs_cal'][0] +
                           result['saturated_fat_cal'][0] +
                           result['other_fat_cal'][0])
        
        # Should match actual calories (within tolerance)
        assert abs(total_from_macros - 1700.0) < 1.0
    
    def test_missing_columns(self):
        """Test error when required columns are missing."""
        raw_data = {
            'dates': np.array(['2024-01-01'], dtype='datetime64'),
            'data': {
                'Protein g': np.array([80.0]),
            },
            'columns': ['Protein g']
        }
        
        with pytest.raises(ValueError, match="Missing required columns"):
            prepare_macro_breakdown_data(raw_data, rolling_window=2)


class TestPrepareNormalizedNutrientsData:
    """Tests for prepare_normalized_nutrients_data function."""
    
    def test_basic_preparation(self):
        """Test basic data preparation for normalized nutrients."""
        dates = np.array(['2024-01-01', '2024-01-02'], dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Saturated Fat g': np.array([20.0, 22.0]),
                'Sugar g': np.array([50.0, 55.0]),
                'Fibre g': np.array([25.0, 28.0]),
            },
            'columns': ['Saturated Fat g', 'Sugar g', 'Fibre g']
        }
        
        rdi_guidelines = {
            'Saturated Fat g': 30,
            'Sugar g': 70,
            'Fibre g': 30,
        }
        
        result = prepare_normalized_nutrients_data(raw_data, rdi_guidelines, 
                                                  rolling_window=2)
        
        assert 'dates' in result
        assert 'saturated_fat_pct' in result
        assert 'sugar_pct' in result
        assert 'fibre_pct' in result
        
        assert len(result['dates']) == 2
    
    def test_normalization(self):
        """Test that values are correctly normalized to RDI percentage."""
        dates = np.array(['2024-01-01'], dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Fibre g': np.array([15.0]),  # 50% of RDI
            },
            'columns': ['Fibre g']
        }
        
        rdi_guidelines = {
            'Fibre g': 30,  # RDI
        }
        
        result = prepare_normalized_nutrients_data(raw_data, rdi_guidelines, 
                                                  rolling_window=1)
        
        # Should be 50% (15/30 * 100)
        assert abs(result['fibre_pct'][0] - 50.0) < 0.1
    
    def test_missing_columns(self):
        """Test error when required columns are missing."""
        raw_data = {
            'dates': np.array(['2024-01-01'], dtype='datetime64'),
            'data': {
                'Fibre g': np.array([25.0]),
            },
            'columns': ['Fibre g']
        }
        
        rdi_guidelines = {
            'Fibre g': 30,
            'Salt g': 6,
        }
        
        with pytest.raises(ValueError, match="Missing required columns"):
            prepare_normalized_nutrients_data(raw_data, rdi_guidelines, 
                                            rolling_window=2)


class TestCalculateSummaryStatistics:
    """Tests for calculate_summary_statistics function."""
    
    def test_basic_statistics(self):
        """Test basic summary statistics calculation."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Energy kcal': np.array([2000.0, 2100.0, 1950.0]),
                'Protein g': np.array([80.0, 85.0, 78.0]),
                'Weight Kg (Morning)': np.array([70.0, 70.2, 70.1]),
            },
            'columns': ['Energy kcal', 'Protein g', 'Weight Kg (Morning)']
        }
        
        stats = calculate_summary_statistics(raw_data)
        
        assert stats['total_days'] == 3
        assert 'avg_calories' in stats
        assert 'avg_protein' in stats
        assert 'avg_weight_morning' in stats
        
        assert abs(stats['avg_calories'] - 2016.67) < 1
        assert abs(stats['avg_protein'] - 81.0) < 1
    
    def test_date_filtering(self):
        """Test that date filtering works correctly."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03', 
                         '2024-01-04', '2024-01-05'], dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Energy kcal': np.array([2000.0, 2100.0, 1950.0, 2050.0, 2020.0]),
            },
            'columns': ['Energy kcal']
        }
        
        stats = calculate_summary_statistics(
            raw_data,
            start_date=np.datetime64('2024-01-02'),
            end_date=np.datetime64('2024-01-04')
        )
        
        assert stats['total_days'] == 3  # Only 3 days in range
    
    def test_missing_values(self):
        """Test handling of NaN values in statistics."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        raw_data = {
            'dates': dates,
            'data': {
                'Energy kcal': np.array([2000.0, np.nan, 1950.0]),
            },
            'columns': ['Energy kcal']
        }
        
        stats = calculate_summary_statistics(raw_data)
        
        # Should average only valid values
        assert abs(stats['avg_calories'] - 1975.0) < 1
