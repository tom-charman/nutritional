"""Calories vs Weight interactive Plotly visualization."""

import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots


def create_calories_weight_figure(
    plot_data: dict, color_palette: dict, rolling_window: int = 30
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

    # Add calories trace (primary y-axis) with Sumi Iron (brand color)
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=calories_avg,
            name="Calories",
            line=dict(color="#2B2B2B", width=1.5, shape="spline"),
            mode="lines+markers",
            marker=dict(size=4, color="#2B2B2B", line=dict(width=0.5, color="#F2F0EB")),
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Calories:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        ),
        secondary_y=False,
    )

    # Add morning weight trace (secondary y-axis) with Wakatake Bamboo
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=weight_morning_avg,
            name="Morning Weight",
            line=dict(
                color="#789440",
                width=1.5,
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

    # Add evening weight trace (secondary y-axis) with Wakatake Bamboo
    fig.add_trace(
        go.Scatter(
            x=dates,
            y=weight_evening_avg,
            name="Evening Weight",
            line=dict(color="#789440", width=1.5, dash="dash", shape="spline"),
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
                fillcolor="rgba(120, 148, 64, 0.08)",
                name="Weight Range",
                hoverinfo="skip",
            ),
            secondary_y=True,
        )

    # Update axes with brand styling
    fig.update_xaxes(
        title_text="Date",
        showgrid=False,
        showline=True,
        linewidth=0.5,
        mirror=False,
        zeroline=False,
        linecolor="#D4C5B0",
        tickfont=dict(size=11, color="#6B6B6B"),
    )

    fig.update_yaxes(
        title_text=f"Calories {rolling_window}-day average (kcal)",
        range=[y1_min, y1_max + 1e-6],
        gridcolor="#D4C5B0",
        gridwidth=1,
        showgrid=True,
        showline=True,
        linewidth=0.5,
        mirror=False,
        zeroline=False,
        linecolor="#D4C5B0",
        tickfont=dict(size=11, color="#6B6B6B"),
        secondary_y=False,
    )

    fig.update_yaxes(
        title_text=f"Weight {rolling_window}-day average (kg)",
        range=[y2_min, y2_max + 1e-6],
        showgrid=False,
        showline=True,
        linewidth=0.5,
        mirror=False,
        zeroline=False,
        linecolor="#D4C5B0",
        tickfont=dict(size=11, color="#6B6B6B"),
        secondary_y=True,
    )

    # Update layout with brand styling (Artisan) - no title
    fig.update_layout(
        hovermode="x unified",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        height=600,
        template="plotly_white",
        paper_bgcolor="#FEFDFB",
        plot_bgcolor="#F2F0EB",
        font=dict(family="'JetBrains Mono', monospace", size=11, color="#2B2B2B"),
        margin=dict(l=60, r=20, t=40, b=40),
        title_font=dict(family="'Crimson Text', serif", size=13),
        showlegend=True,
    )

    return fig
