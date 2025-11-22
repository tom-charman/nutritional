"""Data preprocessing functions using NumPy for nutritional data."""

import numpy as np
from typing import Tuple, Dict


def interpolate_daily(dates: np.ndarray, values: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Resample to daily frequency and linearly interpolate missing values.
    
    Args:
        dates: Array of datetime64 objects (must be sorted)
        values: Array of corresponding values (can contain NaN)
        
    Returns:
        Tuple of (new_dates, interpolated_values)
        
    Example:
        >>> dates = np.array(['2024-01-01', '2024-01-03'], dtype='datetime64')
        >>> values = np.array([100.0, 120.0])
        >>> new_dates, new_values = interpolate_daily(dates, values)
        >>> len(new_dates)  # Will be 3 (includes 2024-01-02)
        3
    """
    if len(dates) == 0:
        return np.array([], dtype='datetime64[D]'), np.array([])
    
    # Ensure dates are in day precision
    dates = dates.astype('datetime64[D]')
    
    # Create continuous daily date range
    start_date = dates[0]
    end_date = dates[-1]
    new_dates = create_date_range(start_date, end_date)
    
    # Find which new dates match original dates
    new_values = np.full(len(new_dates), np.nan)
    
    # Map original values to new date range
    for i, date in enumerate(dates):
        idx = np.where(new_dates == date)[0]
        if len(idx) > 0:
            new_values[idx[0]] = values[i]
    
    # Find indices of non-NaN values (actual data points)
    valid_mask = ~np.isnan(new_values)
    valid_indices = np.where(valid_mask)[0]
    
    if len(valid_indices) == 0:
        # All NaN, nothing to interpolate
        return new_dates, new_values
    
    if len(valid_indices) == 1:
        # Only one valid value, don't interpolate
        return new_dates, new_values
    
    # Perform linear interpolation ONLY between first and last valid data points
    # This prevents interpolation before the first data point or after the last
    first_valid = valid_indices[0]
    last_valid = valid_indices[-1]
    
    # Only interpolate within the range of actual data
    for i in range(first_valid, last_valid + 1):
        if np.isnan(new_values[i]):
            # Find nearest valid values before and after
            prev_idx = valid_indices[valid_indices < i]
            next_idx = valid_indices[valid_indices > i]
            
            if len(prev_idx) > 0 and len(next_idx) > 0:
                # Linear interpolation between prev and next
                prev_idx = prev_idx[-1]
                next_idx = next_idx[0]
                
                weight = (i - prev_idx) / (next_idx - prev_idx)
                new_values[i] = new_values[prev_idx] + weight * (new_values[next_idx] - new_values[prev_idx])
    
    return new_dates, new_values


def rolling_average(values: np.ndarray, window: int, min_periods: int = 1) -> np.ndarray:
    """
    Calculate rolling average using a sliding window.
    Handles edge cases at the start of series.
    
    Args:
        values: Array of values (can contain NaN)
        window: Size of the rolling window (in number of periods)
        min_periods: Minimum number of observations required to have a value
        
    Returns:
        Array of rolling averages (same length as input)
        
    Example:
        >>> values = np.array([1, 2, 3, 4, 5])
        >>> rolling_average(values, window=3)
        array([1. , 1.5, 2. , 3. , 4. ])
    """
    if len(values) == 0:
        return np.array([])
    
    result = np.full(len(values), np.nan)
    
    for i in range(len(values)):
        start_idx = max(0, i - window + 1)
        window_values = values[start_idx:i + 1]
        
        # Remove NaN values
        valid_values = window_values[~np.isnan(window_values)]
        
        if len(valid_values) >= min_periods:
            result[i] = np.mean(valid_values)
    
    return result


def normalize_to_rdi(values: np.ndarray, rdi_value: float) -> np.ndarray:
    """
    Normalize values to percentage of RDI (Recommended Daily Intake).
    
    Args:
        values: Array of actual intake values
        rdi_value: RDI reference value
        
    Returns:
        Array of percentages (values / rdi_value * 100)
        
    Example:
        >>> values = np.array([50, 100, 150])
        >>> normalize_to_rdi(values, rdi_value=100)
        array([ 50., 100., 150.])
    """
    if rdi_value == 0:
        return np.full_like(values, np.nan, dtype=float)
    
    return (values / rdi_value) * 100


def calculate_macro_calories(protein_g: np.ndarray,
                            carbs_g: np.ndarray,
                            fat_g: np.ndarray,
                            saturated_fat_g: np.ndarray,
                            total_calories: np.ndarray,
                            cal_prot: float = 4,
                            cal_carb: float = 4,
                            cal_fat: float = 9) -> Dict[str, np.ndarray]:
    """
    Calculate calorie contribution from each macronutrient.
    Applies adjustment factor to match actual total calories.
    
    This handles the discrepancy between calculated calories (from grams * factors)
    and actual recorded total calories by proportionally adjusting each macro.
    
    Args:
        protein_g: Array of protein in grams
        carbs_g: Array of carbohydrates in grams
        fat_g: Array of total fat in grams
        saturated_fat_g: Array of saturated fat in grams
        total_calories: Array of actual total calories
        cal_prot: Calories per gram of protein (default: 4)
        cal_carb: Calories per gram of carbs (default: 4)
        cal_fat: Calories per gram of fat (default: 9)
        
    Returns:
        Dict with keys:
            - 'protein_cal': Adjusted protein calories
            - 'carbs_cal': Adjusted carb calories
            - 'saturated_fat_cal': Adjusted saturated fat calories
            - 'other_fat_cal': Adjusted other (unsaturated) fat calories
            
    Example:
        >>> protein_g = np.array([50, 60])
        >>> carbs_g = np.array([200, 250])
        >>> fat_g = np.array([70, 80])
        >>> saturated_fat_g = np.array([20, 25])
        >>> total_calories = np.array([2000, 2300])
        >>> result = calculate_macro_calories(protein_g, carbs_g, fat_g, 
        ...                                   saturated_fat_g, total_calories)
        >>> 'protein_cal' in result
        True
    """
    # Calculate other (unsaturated) fat
    other_fat_g = np.clip(fat_g - saturated_fat_g, 0, None)
    
    # Calculate potential calories from grams
    potential_protein_cal = protein_g * cal_prot
    potential_carbs_cal = carbs_g * cal_carb
    potential_saturated_fat_cal = saturated_fat_g * cal_fat
    potential_other_fat_cal = other_fat_g * cal_fat
    
    # Calculate total potential calories
    total_potential_cal = (potential_protein_cal + potential_carbs_cal + 
                          potential_saturated_fat_cal + potential_other_fat_cal)
    
    # Calculate adjustment factor (avoid division by zero)
    adjustment_factor = np.where(
        total_potential_cal > 0,
        total_calories / total_potential_cal,
        1.0
    )
    
    # Handle inf/-inf values
    adjustment_factor = np.where(
        np.isfinite(adjustment_factor),
        adjustment_factor,
        1.0
    )
    
    # Apply adjustment factor to get final calories
    return {
        'protein_cal': potential_protein_cal * adjustment_factor,
        'carbs_cal': potential_carbs_cal * adjustment_factor,
        'saturated_fat_cal': potential_saturated_fat_cal * adjustment_factor,
        'other_fat_cal': potential_other_fat_cal * adjustment_factor,
    }


def create_date_range(start_date: np.datetime64, 
                     end_date: np.datetime64,
                     freq: str = 'D') -> np.ndarray:
    """
    Create continuous date range with specified frequency.
    
    Args:
        start_date: Start date (datetime64)
        end_date: End date (datetime64)
        freq: Frequency - 'D' for daily (default), 'W' for weekly, etc.
        
    Returns:
        Array of datetime64 objects
        
    Example:
        >>> start = np.datetime64('2024-01-01')
        >>> end = np.datetime64('2024-01-03')
        >>> dates = create_date_range(start, end)
        >>> len(dates)
        3
    """
    if freq != 'D':
        raise NotImplementedError("Only daily ('D') frequency is currently supported")
    
    # Ensure day precision
    start_date = start_date.astype('datetime64[D]')
    end_date = end_date.astype('datetime64[D]')
    
    # Calculate number of days
    num_days = int((end_date - start_date) / np.timedelta64(1, 'D')) + 1
    
    # Create range
    return start_date + np.arange(num_days).astype('timedelta64[D]')


def fill_missing_values(values: np.ndarray, method: str = 'linear') -> np.ndarray:
    """
    Fill missing (NaN) values using specified method.
    
    Args:
        values: Array with potential NaN values
        method: Filling method - 'linear', 'forward', 'backward', or 'mean'
        
    Returns:
        Array with NaN values filled
        
    Raises:
        ValueError: If method is not recognized
    """
    if method == 'linear':
        # Use linear interpolation
        valid_mask = ~np.isnan(values)
        valid_indices = np.where(valid_mask)[0]
        
        if len(valid_indices) == 0:
            return values  # All NaN, nothing to fill
        
        if len(valid_indices) == len(values):
            return values  # No NaN values
        
        all_indices = np.arange(len(values))
        filled = np.interp(all_indices, valid_indices, values[valid_indices])
        return filled
        
    elif method == 'forward':
        # Forward fill
        result = values.copy()
        mask = np.isnan(result)
        idx = np.where(~mask, np.arange(len(mask)), 0)
        np.maximum.accumulate(idx, out=idx)
        result[mask] = result[idx[mask]]
        return result
        
    elif method == 'backward':
        # Backward fill
        result = values[::-1].copy()
        mask = np.isnan(result)
        idx = np.where(~mask, np.arange(len(mask)), 0)
        np.maximum.accumulate(idx, out=idx)
        result[mask] = result[idx[mask]]
        return result[::-1]
        
    elif method == 'mean':
        # Fill with mean of valid values
        mean_value = np.nanmean(values)
        result = values.copy()
        result[np.isnan(result)] = mean_value
        return result
        
    else:
        raise ValueError(f"Unknown fill method: {method}. Use 'linear', 'forward', 'backward', or 'mean'")
