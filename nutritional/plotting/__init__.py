"""Plotting submodule for interactive Plotly visualizations."""

from .transforms import (
    prepare_calories_weight_data,
    prepare_macro_breakdown_data,
    prepare_normalized_nutrients_data,
)
from .calories_weight import create_calories_weight_figure
from .macros import create_macro_breakdown_figure
from .nutrients import create_normalized_nutrients_figure
from .utils import apply_common_layout, create_date_selector_buttons

__all__ = [
    # Transform functions
    "prepare_calories_weight_data",
    "prepare_macro_breakdown_data",
    "prepare_normalized_nutrients_data",
    # Figure creation functions
    "create_calories_weight_figure",
    "create_macro_breakdown_figure",
    "create_normalized_nutrients_figure",
    # Utilities
    "apply_common_layout",
    "create_date_selector_buttons",
]
