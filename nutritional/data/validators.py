"""Data validation utilities for nutritional data."""

import numpy as np
from typing import Tuple, List, Dict, Optional


def validate_columns(data: dict, required_cols: List[str]) -> Tuple[bool, List[str]]:
    """
    Check if all required columns exist in the data dictionary.
    
    Args:
        data: Data dictionary with 'columns' or 'data' key
        required_cols: List of required column names
        
    Returns:
        Tuple of (is_valid, missing_columns)
        
    Example:
        >>> data = {'columns': ['Energy kcal', 'Protein g']}
        >>> is_valid, missing = validate_columns(data, ['Energy kcal', 'Fat g'])
        >>> is_valid
        False
        >>> missing
        ['Fat g']
    """
    if 'columns' in data:
        available_cols = set(data['columns'])
    elif 'data' in data:
        available_cols = set(data['data'].keys())
    else:
        return False, required_cols
    
    missing = [col for col in required_cols if col not in available_cols]
    
    return len(missing) == 0, missing


def validate_date_range(dates: np.ndarray, 
                       min_date: Optional[np.datetime64] = None,
                       max_date: Optional[np.datetime64] = None) -> Tuple[bool, str]:
    """
    Ensure dates are sorted and within reasonable range.
    
    Args:
        dates: Array of datetime64 objects
        min_date: Minimum acceptable date (None = no limit)
        max_date: Maximum acceptable date (None = no limit)
        
    Returns:
        Tuple of (is_valid, error_message)
        Empty error_message if valid.
        
    Example:
        >>> dates = np.array(['2024-01-01', '2024-01-02'], dtype='datetime64')
        >>> is_valid, msg = validate_date_range(dates)
        >>> is_valid
        True
    """
    if len(dates) == 0:
        return False, "Date array is empty"
    
    # Check if sorted
    if not np.all(dates[:-1] <= dates[1:]):
        return False, "Dates are not sorted in ascending order"
    
    # Check for duplicates
    if len(dates) != len(np.unique(dates)):
        return False, "Duplicate dates found"
    
    # Check minimum date
    if min_date is not None and np.any(dates < min_date):
        return False, f"Dates found before minimum date: {min_date}"
    
    # Check maximum date
    if max_date is not None and np.any(dates > max_date):
        return False, f"Dates found after maximum date: {max_date}"
    
    # Check for reasonable date range (not too far in past or future)
    year_1900 = np.datetime64('1900-01-01')
    year_2100 = np.datetime64('2100-01-01')
    
    if np.any(dates < year_1900):
        return False, "Dates found before year 1900"
    
    if np.any(dates > year_2100):
        return False, "Dates found after year 2100"
    
    return True, ""


def check_data_quality(data: dict, verbose: bool = True) -> Dict[str, any]:
    """
    Generate data quality report including missing values, date gaps, and outliers.
    
    Args:
        data: Data dictionary from loaders
        verbose: If True, print report to console
        
    Returns:
        Dictionary containing:
            - 'missing_percentages': Dict of {column: percentage}
            - 'date_gaps': List of (gap_start, gap_end, gap_days) tuples
            - 'outliers': Dict of {column: number_of_outliers}
            - 'total_records': Total number of records
            - 'date_range': (start_date, end_date)
            - 'is_healthy': Overall health status boolean
            
    Example:
        >>> data = load_from_csv('data.csv')
        >>> quality = check_data_quality(data, verbose=False)
        >>> quality['total_records']
        100
    """
    report = {
        'missing_percentages': {},
        'date_gaps': [],
        'outliers': {},
        'total_records': len(data['dates']),
        'date_range': (data['dates'][0], data['dates'][-1]),
        'is_healthy': True
    }
    
    # Check missing values for each column
    for col, values in data['data'].items():
        nan_count = np.sum(np.isnan(values))
        nan_percentage = (nan_count / len(values)) * 100
        report['missing_percentages'][col] = nan_percentage
        
        if nan_percentage > 50:
            report['is_healthy'] = False
    
    # Check for date gaps (more than 1 day)
    dates = data['dates'].astype('datetime64[D]')
    date_diffs = np.diff(dates).astype('timedelta64[D]').astype(int)
    
    gap_indices = np.where(date_diffs > 1)[0]
    for idx in gap_indices:
        gap_start = dates[idx]
        gap_end = dates[idx + 1]
        gap_days = date_diffs[idx]
        report['date_gaps'].append((gap_start, gap_end, gap_days))
        
        if gap_days > 7:
            report['is_healthy'] = False
    
    # Check for outliers using IQR method
    for col, values in data['data'].items():
        # Remove NaN values for outlier detection
        valid_values = values[~np.isnan(values)]
        
        if len(valid_values) < 4:
            continue
        
        q1 = np.percentile(valid_values, 25)
        q3 = np.percentile(valid_values, 75)
        iqr = q3 - q1
        
        lower_bound = q1 - 3 * iqr
        upper_bound = q3 + 3 * iqr
        
        outliers = np.sum((valid_values < lower_bound) | (valid_values > upper_bound))
        report['outliers'][col] = outliers
    
    # Print report if verbose
    if verbose:
        print("\n" + "="*60)
        print("DATA QUALITY REPORT")
        print("="*60)
        print(f"\nTotal Records: {report['total_records']}")
        print(f"Date Range: {report['date_range'][0]} to {report['date_range'][1]}")
        print(f"Overall Health: {'✓ HEALTHY' if report['is_healthy'] else '✗ ISSUES FOUND'}")
        
        print("\n--- Missing Values ---")
        if report['missing_percentages']:
            for col, pct in sorted(report['missing_percentages'].items(), 
                                  key=lambda x: x[1], reverse=True)[:10]:
                status = "⚠" if pct > 20 else "✓"
                print(f"{status} {col}: {pct:.1f}% missing")
        else:
            print("No missing values detected")
        
        print("\n--- Date Gaps ---")
        if report['date_gaps']:
            print(f"Found {len(report['date_gaps'])} gap(s):")
            for gap_start, gap_end, gap_days in report['date_gaps'][:5]:
                status = "⚠" if gap_days > 7 else "ℹ"
                print(f"{status} Gap of {gap_days} days: {gap_start} to {gap_end}")
            if len(report['date_gaps']) > 5:
                print(f"... and {len(report['date_gaps']) - 5} more")
        else:
            print("✓ No significant date gaps detected")
        
        print("\n--- Outliers (3×IQR method) ---")
        if report['outliers']:
            outlier_cols = [(col, count) for col, count in report['outliers'].items() if count > 0]
            if outlier_cols:
                for col, count in sorted(outlier_cols, key=lambda x: x[1], reverse=True)[:10]:
                    pct = (count / report['total_records']) * 100
                    print(f"ℹ {col}: {count} outliers ({pct:.1f}%)")
            else:
                print("✓ No significant outliers detected")
        
        print("="*60 + "\n")
    
    return report


def check_required_columns_for_plot(data: dict, plot_name: str) -> Tuple[bool, List[str]]:
    """
    Check if data contains all required columns for a specific plot type.
    
    Args:
        data: Data dictionary from loaders
        plot_name: Name of the plot ('calories_weight', 'macros', 'nutrients')
        
    Returns:
        Tuple of (has_columns, missing_columns)
    """
    plot_requirements = {
        'calories_weight': [
            'Energy kcal',
            'Weight Kg (Morning)',
            'Weight Kg (Evening)'
        ],
        'macros': [
            'Protein g',
            'Carbohydrates g',
            'Fat g',
            'Saturated Fat g',
            'Energy kcal'
        ],
        'nutrients': [
            'Saturated Fat g',
            'Sugar g',
            'Fibre g',
            'Salt g',
            'Calcium mg'
        ]
    }
    
    if plot_name not in plot_requirements:
        raise ValueError(f"Unknown plot name: {plot_name}. "
                        f"Choose from: {', '.join(plot_requirements.keys())}")
    
    required_cols = plot_requirements[plot_name]
    return validate_columns(data, required_cols)


def suggest_data_fixes(data: dict) -> List[str]:
    """
    Analyze data and suggest potential fixes for common issues.
    
    Args:
        data: Data dictionary from loaders
        
    Returns:
        List of suggestion strings
    """
    suggestions = []
    
    quality_report = check_data_quality(data, verbose=False)
    
    # Suggestions for missing values
    high_missing = [(col, pct) for col, pct in quality_report['missing_percentages'].items() 
                   if pct > 20]
    if high_missing:
        suggestions.append(
            f"Consider interpolating or filling missing values for: "
            f"{', '.join([col for col, _ in high_missing])}"
        )
    
    # Suggestions for date gaps
    if len(quality_report['date_gaps']) > 0:
        large_gaps = [gap for gap in quality_report['date_gaps'] if gap[2] > 7]
        if large_gaps:
            suggestions.append(
                f"Found {len(large_gaps)} large date gap(s). "
                "Consider using interpolation to fill gaps."
            )
    
    # Suggestions for outliers
    high_outliers = [(col, count) for col, count in quality_report['outliers'].items() 
                    if count > len(data['dates']) * 0.05]  # More than 5% outliers
    if high_outliers:
        suggestions.append(
            f"High number of outliers detected in: "
            f"{', '.join([col for col, _ in high_outliers])}. "
            "Consider reviewing data entry or using rolling averages."
        )
    
    # Suggestions for data range
    total_days = (quality_report['date_range'][1] - quality_report['date_range'][0]) / np.timedelta64(1, 'D')
    if total_days < 30:
        suggestions.append(
            "Dataset covers less than 30 days. "
            "Consider collecting more data for meaningful trend analysis."
        )
    
    return suggestions
