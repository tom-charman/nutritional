"""
Additional edge case tests to improve coverage.

Tests for rarely-exercised code paths that are still testable.
"""

import numpy as np


# Test validators edge cases


def test_validate_date_range_empty_array():
    """Empty date array should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    empty_dates = np.array([], dtype='datetime64[D]')
    is_valid, msg = validate_date_range(empty_dates)
    
    assert not is_valid
    assert "empty" in msg.lower()


def test_validate_date_range_unsorted():
    """Unsorted dates should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    unsorted_dates = np.array(['2025-01-03', '2025-01-01', '2025-01-02'], dtype='datetime64[D]')
    is_valid, msg = validate_date_range(unsorted_dates)
    
    assert not is_valid
    assert "sorted" in msg.lower()


def test_validate_date_range_duplicates():
    """Duplicate dates should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    duplicate_dates = np.array(['2025-01-01', '2025-01-01', '2025-01-02'], dtype='datetime64[D]')
    is_valid, msg = validate_date_range(duplicate_dates)
    
    assert not is_valid
    assert "duplicate" in msg.lower()


def test_validate_date_range_before_min():
    """Dates before minimum should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    dates = np.array(['2020-01-01', '2020-01-02'], dtype='datetime64[D]')
    min_date = np.datetime64('2024-01-01')
    is_valid, msg = validate_date_range(dates, min_date=min_date)
    
    assert not is_valid
    assert "minimum" in msg.lower()


def test_validate_date_range_after_max():
    """Dates after maximum should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    dates = np.array(['2026-01-01', '2026-01-02'], dtype='datetime64[D]')
    max_date = np.datetime64('2025-12-31')
    is_valid, msg = validate_date_range(dates, max_date=max_date)
    
    assert not is_valid
    assert "maximum" in msg.lower()


def test_validate_date_range_ancient_dates():
    """Dates before 1900 should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    ancient_dates = np.array(['1850-01-01', '1850-01-02'], dtype='datetime64[D]')
    is_valid, msg = validate_date_range(ancient_dates)
    
    assert not is_valid
    assert "1900" in msg


def test_validate_date_range_future_dates():
    """Dates after 2100 should be invalid."""
    from nutritional.data.validators import validate_date_range
    
    future_dates = np.array(['2150-01-01', '2150-01-02'], dtype='datetime64[D]')
    is_valid, msg = validate_date_range(future_dates)
    
    assert not is_valid
    assert "2100" in msg


# Test preprocessing edge cases


def test_interpolate_daily_single_value(sample_dates):
    """Interpolation with single value should not extrapolate."""
    from nutritional.data.preprocessing import interpolate_daily
    
    # Single date and value
    sparse_dates = np.array(['2025-01-03'], dtype='datetime64[D]')
    sparse_values = np.array([100.0])
    
    dense_dates, dense_values = interpolate_daily(sparse_dates, sparse_values)
    
    # Should only return the single date/value
    assert len(dense_dates) == 1
    assert len(dense_values) == 1
    assert dense_values[0] == 100.0


# Test transforms edge cases


def test_prepare_macro_breakdown_data_with_zeros(sample_dates):
    """Macro breakdown should handle zero values correctly."""
    from nutritional.plotting.transforms import prepare_macro_breakdown_data
    
    data = {
        'dates': sample_dates,
        'data': {
            'Energy kcal': np.array([2000, 2100, 1900, 2050, 2200]),
            'Protein g': np.array([0, 0, 0, 0, 0]),  # All zeros
            'Carbohydrates g': np.array([200, 210, 190, 205, 215]),
            'Fat g': np.array([50, 52, 48, 51, 53]),
            'Saturated Fat g': np.array([20, 22, 18, 21, 23]),
        },
        'columns': ['Energy kcal', 'Protein g', 'Carbohydrates g', 'Fat g', 'Saturated Fat g'],
        'source': 'CSV'
    }
    
    plot_data = prepare_macro_breakdown_data(data, rolling_window=3)
    
    # Should handle zeros without errors
    assert 'protein_cal' in plot_data
    assert np.all(plot_data['protein_cal'] >= 0)


def test_prepare_normalized_nutrients_data_with_zero_rdi(data_dict_with_nutrients, rdi_guidelines):
    """Normalized nutrients should handle zero RDI values."""
    from nutritional.plotting.transforms import prepare_normalized_nutrients_data
    
    # Modify RDI to have a zero value
    modified_rdi = rdi_guidelines.copy()
    modified_rdi['Sugar g'] = 0  # Zero RDI
    
    plot_data = prepare_normalized_nutrients_data(
        data_dict_with_nutrients, 
        modified_rdi,
        rolling_window=3
    )
    
    # Should handle zero RDI (resulting in NaN which is expected)
    assert 'dates' in plot_data
    # Check for individual nutrient keys instead of 'nutrients'
    assert 'sugar_pct' in plot_data
    # Sugar percentages should be NaN or inf due to zero RDI
    assert np.all(np.isnan(plot_data['sugar_pct']) | np.isinf(plot_data['sugar_pct']))


# Test loaders edge cases


def test_filter_by_date_range_exact_match(minimal_data_dict):
    """Filter should handle exact date match correctly."""
    from nutritional.data.loaders import filter_by_date_range
    
    # Use exact dates from data
    start = minimal_data_dict['dates'][1]
    end = minimal_data_dict['dates'][3]
    
    filtered = filter_by_date_range(minimal_data_dict, start, end)
    
    # Should include both boundary dates
    assert len(filtered['dates']) == 3
    assert filtered['dates'][0] == start
    assert filtered['dates'][-1] == end


def test_filter_by_date_range_single_day(minimal_data_dict):
    """Filter with same start and end date should return single day."""
    from nutritional.data.loaders import filter_by_date_range
    
    single_date = minimal_data_dict['dates'][2]
    filtered = filter_by_date_range(minimal_data_dict, single_date, single_date)
    
    # Should return exactly one day
    assert len(filtered['dates']) == 1
    assert filtered['dates'][0] == single_date
