"""Tests for data validation functionality."""

import pytest
import numpy as np

from nutritional.data.validators import (
    validate_columns,
    validate_date_range,
    check_data_quality,
    check_required_columns_for_plot,
    suggest_data_fixes
)


class TestValidateColumns:
    """Tests for validate_columns function."""
    
    def test_all_columns_present(self):
        """Test when all required columns are present."""
        data = {'columns': ['Energy kcal', 'Protein g', 'Fat g']}
        is_valid, missing = validate_columns(data, ['Energy kcal', 'Protein g'])
        
        assert is_valid is True
        assert len(missing) == 0
    
    def test_missing_columns(self):
        """Test when some columns are missing."""
        data = {'columns': ['Energy kcal', 'Protein g']}
        is_valid, missing = validate_columns(data, ['Energy kcal', 'Fat g', 'Carbs g'])
        
        assert is_valid is False
        assert 'Fat g' in missing
        assert 'Carbs g' in missing
    
    def test_data_dict_format(self):
        """Test with data dict format instead of columns list."""
        data = {
            'data': {
                'Energy kcal': np.array([2000, 2100]),
                'Protein g': np.array([80, 85])
            }
        }
        is_valid, missing = validate_columns(data, ['Energy kcal'])
        
        assert is_valid is True


class TestValidateDateRange:
    """Tests for validate_date_range function."""
    
    def test_valid_sorted_dates(self):
        """Test with valid sorted dates."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        is_valid, msg = validate_date_range(dates)
        
        assert is_valid is True
        assert msg == ""
    
    def test_unsorted_dates(self):
        """Test with unsorted dates."""
        dates = np.array(['2024-01-03', '2024-01-01', '2024-01-02'], 
                        dtype='datetime64')
        is_valid, msg = validate_date_range(dates)
        
        assert is_valid is False
        assert "not sorted" in msg.lower()
    
    def test_duplicate_dates(self):
        """Test with duplicate dates."""
        dates = np.array(['2024-01-01', '2024-01-01', '2024-01-02'], 
                        dtype='datetime64')
        is_valid, msg = validate_date_range(dates)
        
        assert is_valid is False
        assert "duplicate" in msg.lower()
    
    def test_empty_dates(self):
        """Test with empty date array."""
        dates = np.array([], dtype='datetime64')
        is_valid, msg = validate_date_range(dates)
        
        assert is_valid is False
        assert "empty" in msg.lower()
    
    def test_date_bounds(self):
        """Test date boundary validation."""
        # Test dates too far in past
        dates = np.array(['1800-01-01'], dtype='datetime64')
        is_valid, msg = validate_date_range(dates)
        
        assert is_valid is False
        assert "1900" in msg
        
        # Test dates too far in future
        dates = np.array(['2150-01-01'], dtype='datetime64')
        is_valid, msg = validate_date_range(dates)
        
        assert is_valid is False
        assert "2100" in msg


class TestCheckDataQuality:
    """Tests for check_data_quality function."""
    
    def test_quality_report_structure(self):
        """Test that quality report has expected structure."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                             dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100, 1950]),
                'Protein g': np.array([80, np.nan, 78])
            }
        }
        
        report = check_data_quality(data, verbose=False)
        
        assert 'missing_percentages' in report
        assert 'date_gaps' in report
        assert 'outliers' in report
        assert 'total_records' in report
        assert 'date_range' in report
        assert 'is_healthy' in report
    
    def test_missing_value_detection(self):
        """Test detection of missing values."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'], 
                             dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, np.nan, np.nan, 1950])
            }
        }
        
        report = check_data_quality(data, verbose=False)
        
        assert report['missing_percentages']['Energy kcal'] == 50.0
    
    def test_date_gap_detection(self):
        """Test detection of date gaps."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-05'], dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100])
            }
        }
        
        report = check_data_quality(data, verbose=False)
        
        assert len(report['date_gaps']) == 1
        assert report['date_gaps'][0][2] == 4  # 4 day gap
    
    def test_healthy_data(self):
        """Test that healthy data is marked as healthy."""
        dates = np.array(['2024-01-01', '2024-01-02', '2024-01-03'], 
                        dtype='datetime64')
        data = {
            'dates': dates,
            'data': {
                'Energy kcal': np.array([2000, 2100, 2050])
            }
        }
        
        report = check_data_quality(data, verbose=False)
        
        assert report['is_healthy'] is True


class TestCheckRequiredColumnsForPlot:
    """Tests for check_required_columns_for_plot function."""
    
    def test_calories_weight_plot_valid(self):
        """Test validation for calories/weight plot."""
        data = {
            'columns': ['Energy kcal', 'Weight Kg (Morning)', 
                       'Weight Kg (Evening)', 'Protein g']
        }
        
        has_cols, missing = check_required_columns_for_plot(data, 'calories_weight')
        
        assert has_cols is True
        assert len(missing) == 0
    
    def test_macros_plot_missing_columns(self):
        """Test validation for macros plot with missing columns."""
        data = {
            'columns': ['Energy kcal', 'Protein g']
        }
        
        has_cols, missing = check_required_columns_for_plot(data, 'macros')
        
        assert has_cols is False
        assert 'Carbohydrates g' in missing
        assert 'Fat g' in missing
    
    def test_invalid_plot_name(self):
        """Test with invalid plot name."""
        data = {'columns': ['Energy kcal']}
        
        with pytest.raises(ValueError, match="Unknown plot name"):
            check_required_columns_for_plot(data, 'invalid_plot')


class TestSuggestDataFixes:
    """Tests for suggest_data_fixes function."""
    
    def test_suggestions_for_high_missing(self):
        """Test suggestions when data has high missing percentage."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02', '2024-01-03', 
                              '2024-01-04', '2024-01-05'], dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, np.nan, np.nan, 1950, np.nan])
            }
        }
        
        suggestions = suggest_data_fixes(data)
        
        assert len(suggestions) > 0
        assert any('interpolat' in s.lower() for s in suggestions)
    
    def test_suggestions_for_date_gaps(self):
        """Test suggestions when data has large date gaps."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-10'], dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100])
            }
        }
        
        suggestions = suggest_data_fixes(data)
        
        assert len(suggestions) > 0
        assert any('gap' in s.lower() for s in suggestions)
    
    def test_suggestions_for_short_dataset(self):
        """Test suggestions for short dataset."""
        data = {
            'dates': np.array(['2024-01-01', '2024-01-02'], dtype='datetime64'),
            'data': {
                'Energy kcal': np.array([2000, 2100])
            }
        }
        
        suggestions = suggest_data_fixes(data)
        
        assert len(suggestions) > 0
        assert any('30 days' in s for s in suggestions)
