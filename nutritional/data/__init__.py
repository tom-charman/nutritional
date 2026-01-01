"""Data handling submodule for nutritional data processing."""

from .loaders import filter_by_date_range, get_data_source, load_data, load_from_csv
from .preprocessing import (
    calculate_macro_calories,
    create_date_range,
    fill_missing_values,
    interpolate_daily,
    normalize_to_rdi,
    rolling_average,
)
from .validators import (
    check_data_quality,
    check_required_columns_for_plot,
    suggest_data_fixes,
    validate_columns,
    validate_date_range,
)

__all__ = [
    # Loaders
    "load_data",  # Primary loader from PostgreSQL
    "load_from_csv",  # Deprecated
    "get_data_source",  # Alias for load_data
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
