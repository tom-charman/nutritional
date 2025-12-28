"""Calories vs Weight interactive Plotly visualization."""

import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def create_calories_weight_figure(
    plot_data: dict, color_palette: dict, rolling_window: int = 7
) -> go.Figure:
    """
    Create Plotly figure with dual y-axes for calories and weight.

    Features:
    - Left axis: Calories (rolling average)
    - Right axis: Weight morning/evening (rolling averages)
    - Shaded area between morning and evening weight
    - Interactive tooltips
    - Zoom and pan capabilities

    Args:
        plot_data: Output from prepare_calories_weight_data()
        color_palette: Color scheme dict with keys like 'deep_blue', 'vibrant_pink'
        rolling_window: Window size for display purposes

    Returns:
        plotly.graph_objects.Figure
    """
    dates = plot_data["dates"]
    calories_avg = plot_data["calories_avg"]
    weight_morning_avg = plot_data["weight_morning_avg"]
    weight_evening_avg = plot_data["weight_evening_avg"]
    y1_min, y1_max = plot_data["y1_limits"]
    y2_min, y2_max = plot_data["y2_limits"]

    # Create figure with secondary y-axis
    fig = make_subplots(specs=[[{"secondary_y": True}]])

    # Add calories trace (primary y-axis) with royal blue color
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=calories_avg,
            name=f"Calories ({rolling_window}-day avg)",
            line=dict(color="#2563EB", width=3, shape="spline"),
            mode="lines+markers",
            marker=dict(size=6, color="#2563EB", line=dict(width=2, color="white")),
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Calories:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        ),
        secondary_y=False,
    )

    # Add morning weight trace (secondary y-axis) with emerald color
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=weight_morning_avg,
            name=f"Morning Weight ({rolling_window}-day avg)",
            line=dict(
                color="#059669",
                width=2,
                dash="dashdot",
                shape="spline",
            ),
            mode="lines",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Morning:</b> %{y:.1f} kg<br>"
            + "<extra></extra>",
        ),
        secondary_y=True,
    )

    # Add evening weight trace (secondary y-axis) with emerald color
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=weight_evening_avg,
            name=f"Evening Weight ({rolling_window}-day avg)",
            line=dict(color="#059669", width=2, dash="dash", shape="spline"),
            mode="lines",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Evening:</b> %{y:.1f} kg<br>"
            + "<extra></extra>",
        ),
        secondary_y=True,
    )

    # Add filled area between morning and evening weight
    # Filter out NaN values for fill
    valid_mask = (~np.isnan(weight_morning_avg)) & (~np.isnan(weight_evening_avg))
    if np.any(valid_mask):
        fig.add_trace(
            go.Scatter(
                x=dates[valid_mask],
                y=weight_evening_avg[valid_mask],
                mode="lines",
                line=dict(width=0),
                showlegend=False,
                hoverinfo="skip",
            ),
            secondary_y=True,
        )

        fig.add_trace(
            go.Scatter(
                x=dates[valid_mask],
                y=weight_morning_avg[valid_mask],
                mode="lines",
                line=dict(width=0),
                fill="tonexty",
                fillcolor="rgba(5, 150, 105, 0.1)",
                name="Weight Range",
                hoverinfo="skip",
            ),
            secondary_y=True,
        )

    # Update axes with premium styling
    fig.update_xaxes(
        title_text="Date",
        showgrid=False,
        linecolor="#E2E8F0",
        tickfont=dict(size=12, color="#64748B"),
    )

    fig.update_yaxes(
        title_text=f"Calories ({rolling_window}-day avg)",
        range=[y1_min, y1_max],
        gridcolor="#F1F5F9",
        gridwidth=1,
        showgrid=True,
        linecolor="#E2E8F0",
        tickfont=dict(size=12, color="#64748B"),
        secondary_y=False,
    )

    fig.update_yaxes(
        title_text=f"Weight (kg) ({rolling_window}-day avg)",
        range=[y2_min, y2_max],
        showgrid=False,
        linecolor="#E2E8F0",
        tickfont=dict(size=12, color="#64748B"),
        secondary_y=True,
    )

    # Update layout with premium styling
    fig.update_layout(
        title="Calories and Weight Trends",
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=600,
        template="plotly_white",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Inter, sans-serif", size=13, color="#475569"),
        margin=dict(l=60, r=20, t=40, b=40),
    )

    return fig
