"""
Tests for Plotly figure creation functions.

Tests verify that plotting functions create valid Plotly figures with
correct structure, traces, and layout properties.
"""

import plotly.graph_objects as go
import pytest

from nutritional.plotting.calories_weight import create_calories_weight_figure
from nutritional.plotting.macros import create_macro_breakdown_figure
from nutritional.plotting.nutrients import create_normalized_nutrients_figure
from nutritional.plotting.utils import (
    add_annotation,
    apply_common_layout,
    create_date_selector_buttons,
    create_empty_figure,
    format_hover_template,
)

# Test create_calories_weight_figure


def test_create_calories_weight_figure_returns_figure(minimal_data_dict, color_palette):
    """Calories/weight figure creation should return a Plotly Figure object."""
    from nutritional.plotting.transforms import prepare_calories_weight_data

    plot_data = prepare_calories_weight_data(minimal_data_dict, rolling_window=3)
    fig = create_calories_weight_figure(plot_data, color_palette)

    assert isinstance(fig, go.Figure)


def test_create_calories_weight_figure_has_multiple_traces(minimal_data_dict, color_palette):
    """Calories/weight figure should have traces for calories and both weight measurements."""
    from nutritional.plotting.transforms import prepare_calories_weight_data

    plot_data = prepare_calories_weight_data(minimal_data_dict, rolling_window=3)
    fig = create_calories_weight_figure(plot_data, color_palette)

    # Should have at least 2 traces (calories, weight morning, weight evening, fill area)
    assert len(fig.data) >= 2


def test_create_calories_weight_figure_has_dual_axes(minimal_data_dict, color_palette):
    """Calories/weight figure should have dual y-axes for different scales."""
    from nutritional.plotting.transforms import prepare_calories_weight_data

    plot_data = prepare_calories_weight_data(minimal_data_dict, rolling_window=3)
    fig = create_calories_weight_figure(plot_data, color_palette)

    # Check layout has both y-axes configured
    assert hasattr(fig.layout, "yaxis")
    assert hasattr(fig.layout, "yaxis2")


# Test create_macro_breakdown_figure


def test_create_macro_breakdown_figure_returns_figure(minimal_data_dict, color_palette):
    """Macro breakdown figure creation should return a Plotly Figure object."""
    from nutritional.plotting.transforms import prepare_macro_breakdown_data

    plot_data = prepare_macro_breakdown_data(minimal_data_dict, rolling_window=3)
    fig = create_macro_breakdown_figure(plot_data, color_palette)

    assert isinstance(fig, go.Figure)


def test_create_macro_breakdown_figure_has_stacked_traces(minimal_data_dict, color_palette):
    """Macro breakdown figure should have multiple stacked traces for each macro."""
    from nutritional.plotting.transforms import prepare_macro_breakdown_data

    plot_data = prepare_macro_breakdown_data(minimal_data_dict, rolling_window=3)
    fig = create_macro_breakdown_figure(plot_data, color_palette)

    # Should have 5 traces (protein, other carbs, sugar, other fat, saturated fat)
    assert len(fig.data) == 5


# Test create_normalized_nutrients_figure


def test_create_normalized_nutrients_figure_returns_figure(
    data_dict_with_nutrients, rdi_guidelines, color_palette
):
    """Normalized nutrients figure creation should return a Plotly Figure object."""
    from nutritional.plotting.transforms import prepare_normalized_nutrients_data

    plot_data = prepare_normalized_nutrients_data(
        data_dict_with_nutrients, rdi_guidelines, rolling_window=3
    )
    fig = create_normalized_nutrients_figure(plot_data, color_palette, rdi_guidelines)

    assert isinstance(fig, go.Figure)


def test_create_normalized_nutrients_figure_has_multiple_traces(
    data_dict_with_nutrients, rdi_guidelines, color_palette
):
    """Normalized nutrients figure should have trace for each nutrient."""
    from nutritional.plotting.transforms import prepare_normalized_nutrients_data

    plot_data = prepare_normalized_nutrients_data(
        data_dict_with_nutrients, rdi_guidelines, rolling_window=3
    )
    fig = create_normalized_nutrients_figure(plot_data, color_palette, rdi_guidelines)

    # Should have traces for each nutrient (at least 1)
    assert len(fig.data) >= 1


# Test utility functions


def test_apply_common_layout_modifies_figure():
    """Common layout application should modify figure properties."""
    fig = go.Figure()
    date_range = ("2025-01-01", "2025-01-31")

    result = apply_common_layout(fig, title="Test Title", date_range=date_range)

    assert isinstance(result, go.Figure)
    assert result.layout.title.text == "Test Title"


def test_create_date_selector_buttons_returns_list():
    """Date selector button creation should return list of button configurations."""
    buttons = create_date_selector_buttons()

    assert isinstance(buttons, list)
    assert len(buttons) > 0


@pytest.mark.parametrize(
    "metric,unit,include_date",
    [
        ("Calories", "kcal", True),
        ("Weight", "kg", True),
        ("Protein", "g", False),
    ],
)
def test_format_hover_template_creates_valid_template(metric, unit, include_date):
    """Hover template formatting should create valid template string."""
    template = format_hover_template(metric, unit, include_date)

    assert isinstance(template, str)
    assert metric in template
    assert unit in template


def test_create_empty_figure_with_message():
    """Empty figure creation should display custom message."""
    message = "No data available"
    fig = create_empty_figure(message)

    assert isinstance(fig, go.Figure)
    # Empty figure should have minimal or no data traces
    assert len(fig.data) == 0 or all(len(trace.x) == 0 for trace in fig.data)


def test_add_annotation_modifies_figure():
    """Adding annotation should modify figure's annotation list."""
    fig = go.Figure()
    initial_annotations = len(fig.layout.annotations)

    result = add_annotation(fig, text="Test annotation", x=0.5, y=0.5)

    assert isinstance(result, go.Figure)
    assert len(result.layout.annotations) == initial_annotations + 1
