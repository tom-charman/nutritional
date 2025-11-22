"""
Dash callback functions for interactivity.

Handles data loading, plot updates, and summary statistics based on user interactions.
"""

import numpy as np
from dash import Input, Output, callback

from nutritional.data.loaders import filter_by_date_range, get_data_source
from nutritional.plotting.calories_weight import create_calories_weight_figure
from nutritional.plotting.macros import create_macro_breakdown_figure
from nutritional.plotting.nutrients import create_normalized_nutrients_figure
from nutritional.plotting.transforms import (
    calculate_summary_statistics,
    prepare_calories_weight_data,
    prepare_macro_breakdown_data,
    prepare_normalized_nutrients_data,
)
from nutritional.plotting.utils import create_empty_figure
from nutritional.settings import COLOR_PALETTE, RDI_GUIDELINES


def serialize_data(raw_data: dict) -> dict:
    """
    Convert numpy arrays to lists for JSON serialization.

    Args:
        raw_data: Dict with numpy arrays

    Returns:
        Dict with lists (JSON-serializable)
    """
    serialized = {
        "dates": raw_data["dates"].astype(str).tolist(),
        "data": {},
        "columns": raw_data["columns"],
        "source": raw_data.get("source", "CSV"),
    }

    for col, values in raw_data["data"].items():
        serialized["data"][col] = values.tolist()

    return serialized


def deserialize_data(stored_data: dict) -> dict:
    """
    Convert lists back to numpy arrays.

    Args:
        stored_data: Dict with lists from JSON

    Returns:
        Dict with numpy arrays
    """
    deserialized = {
        "dates": np.array(stored_data["dates"], dtype="datetime64[D]"),
        "data": {},
        "columns": stored_data["columns"],
        "source": stored_data.get("source", "CSV"),
    }

    for col, values in stored_data["data"].items():
        deserialized["data"][col] = np.array(values, dtype=float)

    return deserialized


@callback(
    Output("data-store", "data"),
    Input("refresh-button", "n_clicks"),
    prevent_initial_call=False,
)
def load_data(n_clicks):
    """
    Load data from source and store in client-side cache.

    Triggered on:
    - Initial page load
    - Refresh button click

    Args:
        n_clicks: Number of times refresh button clicked

    Returns:
        Serialized data dict
    """
    raw_data = get_data_source()
    return serialize_data(raw_data)


@callback(
    [
        Output("date-range-picker", "start_date"),
        Output("date-range-picker", "end_date"),
    ],
    Input("data-store", "data"),
    prevent_initial_call=False,
)
def set_initial_date_range(stored_data):
    """
    Set date picker range to match data extent.

    Args:
        stored_data: Data from store

    Returns:
        Tuple of (start_date, end_date) strings
    """
    if not stored_data:  # pragma: no cover
        return None, None

    dates = stored_data["dates"]
    return dates[0], dates[-1]


@callback(
    [
        Output("calories-weight-plot", "figure"),
        Output("macro-breakdown-plot", "figure"),
        Output("nutrients-rdi-plot", "figure"),
        Output("avg-calories", "children"),
        Output("avg-weight", "children"),
        Output("avg-protein", "children"),
        Output("data-points", "children"),
        Output("data-source-info", "children"),
        Output("loading-output", "children"),
    ],
    [
        Input("data-store", "data"),
        Input("date-range-picker", "start_date"),
        Input("date-range-picker", "end_date"),
        Input("rolling-window-dropdown", "value"),
    ],
)
def update_dashboard(stored_data, start_date, end_date, rolling_window):
    """
    Update all plots and summary statistics.

    Triggered when:
    - Data is loaded/refreshed
    - Date range changes
    - Rolling window changes

    Args:
        stored_data: Data from store
        start_date: Start date string (YYYY-MM-DD)
        end_date: End date string (YYYY-MM-DD)
        rolling_window: Window size in days

    Returns:
        Tuple of (fig1, fig2, fig3, cal_stat, weight_stat, protein_stat,
                 data_points, source_info, loading_div)
    """
    # Handle empty data
    if not stored_data:
        empty_fig = create_empty_figure("No data available")
        return (
            empty_fig,
            empty_fig,
            empty_fig,
            "N/A",
            "N/A",
            "N/A",
            "0",
            "No data loaded",
            None,
        )

    # Deserialize data
    raw_data = deserialize_data(stored_data)

    # Filter by date range if specified
    if start_date and end_date:
        start = np.datetime64(start_date, "D")
        end = np.datetime64(end_date, "D")
        filtered_data = filter_by_date_range(raw_data, start, end)
    else:
        filtered_data = raw_data

    # Check if we have data after filtering
    if len(filtered_data["dates"]) == 0:
        empty_fig = create_empty_figure("No data in selected date range")
        return (
            empty_fig,
            empty_fig,
            empty_fig,
            "N/A",
            "N/A",
            "N/A",
            "0",
            "No data in selected range",
            None,
        )

    # Prepare data for each plot
    try:
        cal_weight_data = prepare_calories_weight_data(filtered_data, rolling_window)
        macro_data = prepare_macro_breakdown_data(filtered_data, rolling_window)
        nutrients_data = prepare_normalized_nutrients_data(
            filtered_data, RDI_GUIDELINES, rolling_window
        )
    except Exception as e:  # pragma: no cover
        empty_fig = create_empty_figure(f"Error preparing data: {str(e)}")
        return (
            empty_fig,
            empty_fig,
            empty_fig,
            "Error",
            "Error",
            "Error",
            "0",
            f"Error: {str(e)}",
            None,
        )

    # Create figures
    fig1 = create_calories_weight_figure(cal_weight_data, COLOR_PALETTE)
    fig2 = create_macro_breakdown_figure(macro_data, COLOR_PALETTE)
    fig3 = create_normalized_nutrients_figure(nutrients_data, COLOR_PALETTE)

    # Calculate summary statistics
    stats = calculate_summary_statistics(filtered_data)

    # Format summary values
    avg_cals = f"{stats['avg_calories']:.0f}" if stats["avg_calories"] is not None else "N/A"

    # Calculate average weight from morning weight (or could average morning and evening)
    avg_weight = (
        f"{stats['avg_weight_morning']:.1f}" if stats["avg_weight_morning"] is not None else "N/A"
    )

    avg_protein = f"{stats['avg_protein']:.1f}" if stats["avg_protein"] is not None else "N/A"
    data_points = str(len(filtered_data["dates"]))

    # Data source info
    source = filtered_data.get("source", "CSV")
    date_range_str = f"{filtered_data['dates'][0]} to {filtered_data['dates'][-1]}"
    last_updated = filtered_data.get("last_updated", "Unknown")
    source_info = (
        f"Data source: {source} | Date range: {date_range_str} | "
        f"Records: {data_points} | Last updated: {last_updated}"
    )

    return (
        fig1,
        fig2,
        fig3,
        avg_cals,
        avg_weight,
        avg_protein,
        data_points,
        source_info,
        None,
    )
