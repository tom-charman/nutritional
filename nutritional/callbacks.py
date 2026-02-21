"""
Dash callback functions for interactivity.

Handles data loading, plot updates, and summary statistics based on user interactions.
"""

from datetime import date, timedelta

import numpy as np
from dash import Input, Output, callback

from nutritional.component_ids import ID, get_id
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

HOME_PREFIX = ""


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
    Output(get_id(ID.DATA_STORE, HOME_PREFIX), "data"),
    Input(get_id(ID.REFRESH_BUTTON, HOME_PREFIX), "n_clicks"),
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
        Output(get_id(ID.CALORIES_WEIGHT_PLOT, HOME_PREFIX), "figure"),
        Output(get_id(ID.MACRO_BREAKDOWN_PLOT, HOME_PREFIX), "figure"),
        Output(get_id(ID.NUTRIENTS_RDI_PLOT, HOME_PREFIX), "figure"),
        Output(get_id(ID.AVG_CALORIES, HOME_PREFIX), "children"),
        Output(get_id(ID.AVG_WEIGHT, HOME_PREFIX), "children"),
        Output(get_id(ID.AVG_PROTEIN, HOME_PREFIX), "children"),
        Output(get_id(ID.DATA_POINTS, HOME_PREFIX), "children"),
        Output(get_id(ID.DATA_SOURCE_INFO, HOME_PREFIX), "children"),
        Output(get_id(ID.LOADING_OUTPUT, HOME_PREFIX), "children"),
    ],
    [Input(get_id(ID.DATA_STORE, HOME_PREFIX), "data")],
)
def update_dashboard(stored_data, start_date=None, end_date=None, rolling_window=None):
    """
    Update all plots and summary statistics.

    Triggered when:
    - Data is loaded/refreshed
    - (No user controls; uses default range)

    Args:
        stored_data: Data from store
        (Date range is derived from the loaded data)
    Returns:
        Tuple of (fig1, fig2, fig3, cal_stat, weight_stat, protein_stat,
                 data_points, source_info, loading_div)
    """
    # Always use 30 days (UI selector removed)
    rolling_window = 30
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

    # Default range: full available data, capped to yesterday (today is often incomplete)
    start = raw_data["dates"][0]
    yesterday = np.datetime64(date.today() - timedelta(days=1), "D")
    end = min(raw_data["dates"][-1], yesterday)
    filtered_data = filter_by_date_range(raw_data, start, end)

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
    fig1 = create_calories_weight_figure(cal_weight_data, COLOR_PALETTE, rolling_window=30)
    fig2 = create_macro_breakdown_figure(macro_data, COLOR_PALETTE, rolling_window=30)
    fig3 = create_normalized_nutrients_figure(
        nutrients_data, COLOR_PALETTE, RDI_GUIDELINES, rolling_window=30
    )

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
