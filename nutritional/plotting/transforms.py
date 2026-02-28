"""Data transformation functions for plotting.

All data manipulation for plots happens here using NumPy.
Plotting functions receive pre-processed data ready for visualization.
"""

import numpy as np

from nutritional.data import (
    calculate_macro_calories,
    interpolate_daily,
    normalize_to_rdi,
    rolling_average,
    validate_columns,
)


def prepare_calories_weight_data(raw_data: dict, rolling_window: int) -> dict:
    """
    Transform raw data for calories vs weight plot.

    Performs:
    - Daily interpolation
    - Rolling averages
    - Axis limit calculations

    Args:
        raw_data: Data dictionary from loaders
        rolling_window: Size of rolling window in days

    Returns:
        dict with keys:
            - 'dates': np.array (common date range)
            - 'calories_avg': np.array
            - 'weight_morning_avg': np.array
            - 'weight_evening_avg': np.array
            - 'y1_limits': (min, max) for calories axis (rounded to 100s)
            - 'y2_limits': (min, max) for weight axis (rounded to integers)

    Raises:
        ValueError: If required columns are missing
    """
    required_cols = ["Energy kcal", "Weight Kg (Morning)", "Weight Kg (Evening)"]
    is_valid, missing = validate_columns(raw_data, required_cols)

    if not is_valid:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    dates = raw_data["dates"]
    calories = raw_data["data"]["Energy kcal"]
    weight_morning = raw_data["data"]["Weight Kg (Morning)"]
    weight_evening = raw_data["data"]["Weight Kg (Evening)"]

    # Interpolate to daily and calculate rolling averages
    cal_dates, cal_interp = interpolate_daily(dates, calories)
    calories_avg = rolling_average(cal_interp, rolling_window)

    # For weight: interpolate only, no rolling average (show actual weight trend)
    wm_dates, wm_interp = interpolate_daily(dates, weight_morning)
    weight_morning_avg = wm_interp  # Use raw interpolated data, no rolling average

    we_dates, we_interp = interpolate_daily(dates, weight_evening)
    weight_evening_avg = we_interp  # Use raw interpolated data, no rolling average

    # Use common date range (all should be the same after interpolation)
    common_dates = cal_dates

    # Calculate y-axis limits for calories (round to 100s)
    cal_valid = calories_avg[~np.isnan(calories_avg)]
    if len(cal_valid) > 0:
        cal_min = cal_valid.min()
        cal_max = cal_valid.max()
        pad = (cal_max - cal_min) * 0.1
        if pad < 50:
            pad = 50

        y1_min = int((cal_min - pad) // 100 * 100)
        y1_max = int(((cal_max + pad + 99) // 100) * 100)
    else:
        y1_min, y1_max = 0, 3000

    # Calculate y-axis limits for weight (round to integers)
    wm_valid = weight_morning_avg[~np.isnan(weight_morning_avg)]
    we_valid = weight_evening_avg[~np.isnan(weight_evening_avg)]

    if len(wm_valid) > 0 or len(we_valid) > 0:
        w_min = min(
            wm_valid.min() if len(wm_valid) > 0 else float("inf"),
            we_valid.min() if len(we_valid) > 0 else float("inf"),
        )
        w_max = max(
            wm_valid.max() if len(wm_valid) > 0 else float("-inf"),
            we_valid.max() if len(we_valid) > 0 else float("-inf"),
        )
        w_pad = max((w_max - w_min) * 0.1, 0.5)

        y2_min = int(np.floor(w_min - w_pad))
        y2_max = int(np.ceil(w_max + w_pad))
    else:
        y2_min, y2_max = 60, 90

    return {
        "dates": common_dates,
        "calories_avg": calories_avg,
        "weight_morning_avg": weight_morning_avg,
        "weight_evening_avg": weight_evening_avg,
        "y1_limits": (y1_min, y1_max),
        "y2_limits": (y2_min, y2_max),
    }


def prepare_macro_breakdown_data(
    raw_data: dict,
    rolling_window: int,
    cal_prot: float = 4,
    cal_carb: float = 4,
    cal_fat: float = 9,
) -> dict:
    """
    Transform raw data for macro stacked area chart.

    Performs:
    - Macro calorie calculations with adjustment
    - Daily interpolation
    - Rolling averages

    Args:
        raw_data: Data dictionary from loaders
        rolling_window: Size of rolling window in days
        cal_prot: Calories per gram of protein (default: 4)
        cal_carb: Calories per gram of carbs (default: 4)
        cal_fat: Calories per gram of fat (default: 9)

    Returns:
        dict with keys:
            - 'dates': np.array
            - 'other_carbs_cal': np.array
            - 'sugar_cal': np.array
            - 'protein_cal': np.array
            - 'other_fat_cal': np.array
            - 'saturated_fat_cal': np.array

    Raises:
        ValueError: If required columns are missing
    """
    required_cols = [
        "Protein g",
        "Carbohydrates g",
        "Sugar g",
        "Fat g",
        "Saturated Fat g",
        "Energy kcal",
    ]
    is_valid, missing = validate_columns(raw_data, required_cols)

    if not is_valid:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    dates = raw_data["dates"]
    protein_g = raw_data["data"]["Protein g"]
    carbs_g = raw_data["data"]["Carbohydrates g"]
    sugar_g = raw_data["data"]["Sugar g"]
    fat_g = raw_data["data"]["Fat g"]
    saturated_fat_g = raw_data["data"]["Saturated Fat g"]
    total_calories = raw_data["data"]["Energy kcal"]

    # Calculate macro calories with adjustment
    macro_cals = calculate_macro_calories(
        protein_g,
        carbs_g,
        fat_g,
        saturated_fat_g,
        total_calories,
        cal_prot,
        cal_carb,
        cal_fat,
    )

    # Calculate sugar and other carbs calories
    carbs_cal = macro_cals["carbs_cal"]
    sugar_cal = np.where(carbs_g > 0, (sugar_g / carbs_g) * carbs_cal, 0)
    other_carbs_cal = carbs_cal - sugar_cal

    # Interpolate each macro to daily and apply rolling average
    result_dates = None
    result_data = {}

    for key in [
        "protein_cal",
        "other_carbs_cal",
        "sugar_cal",
        "saturated_fat_cal",
        "other_fat_cal",
    ]:
        if key == "other_carbs_cal":
            values = other_carbs_cal
        elif key == "sugar_cal":
            values = sugar_cal
        else:
            values = macro_cals[key]

        interp_dates, interp_values = interpolate_daily(dates, values)
        rolling_values = rolling_average(interp_values, rolling_window)

        if result_dates is None:
            result_dates = interp_dates

        result_data[key] = rolling_values

    return {
        "dates": result_dates,
        "other_carbs_cal": result_data["other_carbs_cal"],
        "sugar_cal": result_data["sugar_cal"],
        "protein_cal": result_data["protein_cal"],
        "other_fat_cal": result_data["other_fat_cal"],
        "saturated_fat_cal": result_data["saturated_fat_cal"],
    }


def prepare_normalized_nutrients_data(
    raw_data: dict, rdi_guidelines: dict, rolling_window: int
) -> dict:
    """
    Transform raw data for normalized nutrients plot.

    Performs:
    - Daily interpolation
    - Rolling averages
    - RDI normalization (percentage)

    Args:
        raw_data: Data dictionary from loaders
        rdi_guidelines: Dict of {nutrient_name: rdi_value}
        rolling_window: Size of rolling window in days

    Returns:
        dict with keys:
            - 'dates': np.array (common)
            - For each nutrient in rdi_guidelines:
                - '{nutrient}_pct': np.array (percentage of RDI)

    Raises:
        ValueError: If required columns are missing
    """
    required_cols = list(rdi_guidelines.keys())
    is_valid, missing = validate_columns(raw_data, required_cols)

    if not is_valid:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    dates = raw_data["dates"]
    result_dates = None
    result_data = {}

    for nutrient, rdi_value in rdi_guidelines.items():
        nutrient_values = raw_data["data"][nutrient]

        # Interpolate to daily
        interp_dates, interp_values = interpolate_daily(dates, nutrient_values)

        # Apply rolling average
        rolling_values = rolling_average(interp_values, rolling_window)

        # Normalize to RDI percentage
        normalized = normalize_to_rdi(rolling_values, rdi_value)

        if result_dates is None:
            result_dates = interp_dates

        # Create a clean key name
        key = nutrient.replace(" g", "").replace(" mg", "").replace(" ", "_").lower()
        result_data[f"{key}_pct"] = normalized

    return {"dates": result_dates, **result_data}


def calculate_summary_statistics(
    raw_data: dict, start_date: np.datetime64 | None = None, end_date: np.datetime64 | None = None
) -> dict:
    """
    Calculate summary statistics for dashboard display.

    Args:
        raw_data: Data dictionary from loaders
        start_date: Optional start date for filtering
        end_date: Optional end date for filtering

    Returns:
        dict with summary metrics:
            - 'avg_calories': Average daily calories
            - 'avg_protein': Average protein (g)
            - 'avg_carbs': Average carbs (g)
            - 'avg_fat': Average fat (g)
            - 'avg_weight_morning': Average morning weight (kg)
            - 'total_days': Number of days with data
    """
    dates = raw_data["dates"]

    # Filter by date range if specified
    if start_date is not None or end_date is not None:
        mask = np.ones(len(dates), dtype=bool)
        if start_date is not None:
            mask &= dates >= start_date
        if end_date is not None:
            mask &= dates <= end_date

        dates = dates[mask]
        filtered_data = {col: arr[mask] for col, arr in raw_data["data"].items()}
    else:
        filtered_data = raw_data["data"]

    stats = {"total_days": len(dates)}

    # Calculate averages for common columns
    columns_to_avg = {
        "Energy kcal": "avg_calories",
        "Protein g": "avg_protein",
        "Carbohydrates g": "avg_carbs",
        "Fat g": "avg_fat",
        "Weight Kg (Morning)": "avg_weight_morning",
    }

    for col, key in columns_to_avg.items():
        if col in filtered_data:
            values = filtered_data[col]
            valid_values = values[~np.isnan(values)]
            if len(valid_values) > 0:
                stats[key] = float(np.mean(valid_values))
            else:
                stats[key] = None
        else:
            stats[key] = None

    return stats
