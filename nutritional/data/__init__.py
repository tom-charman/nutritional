"""Data handling submodule for nutritional data processing."""

from .loaders import load_from_csv, get_data_source, filter_by_date_range
from .preprocessing import (
    interpolate_daily,
    rolling_average,
    normalize_to_rdi,
    calculate_macro_calories,
    create_date_range,
    fill_missing_values,
)
from .validators import (
    validate_columns,
    validate_date_range,
    check_data_quality,
    check_required_columns_for_plot,
    suggest_data_fixes,
)

__all__ = [
    # Loaders
    "load_from_csv",
    "get_data_source",
    "filter_by_date_range",
    # Preprocessing
    "interpolate_daily",
    "rolling_average",
    "normalize_to_rdi",
    "calculate_macro_calories",
    "create_date_range",
    "fill_missing_values",
    # Validators
    "validate_columns",
    "validate_date_range",
    "check_data_quality",
    "check_required_columns_for_plot",
    "suggest_data_fixes",
]
