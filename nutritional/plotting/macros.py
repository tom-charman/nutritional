"""Macronutrient Breakdown interactive Plotly visualization."""

import plotly.graph_objects as go


def create_macro_breakdown_figure(
    plot_data: dict, color_palette: dict, rolling_window: int = 30
) -> go.Figure:
    """
    Create Plotly stacked area chart for macronutrient calorie breakdown.

    Features:
    - Stacked areas showing calorie contribution from each macro
    - Ordered: Protein, Other Carbs, Sugar, Other Fat, Saturated Fat
    - Interactive tooltips showing breakdown
    - Y-axis starts at 0

    Args:
        plot_data: Output from prepare_macro_breakdown_data()
        color_palette: Color scheme dict
        rolling_window: Window size for display purposes

    Returns:
        plotly.graph_objects.Figure
    """
    dates = plot_data["dates"]
    other_carbs_cal = plot_data["other_carbs_cal"]
    sugar_cal = plot_data["sugar_cal"]
    protein_cal = plot_data["protein_cal"]
    other_fat_cal = plot_data["other_fat_cal"]
    saturated_fat_cal = plot_data["saturated_fat_cal"]

    # Create figure
    fig = go.Figure()

    # Add traces in order (bottom to top of stack)
    # Order: Protein, Other Carbs, Sugar, Other Fat, Saturated Fat

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=protein_cal,
            name=f"Protein ({rolling_window}-day avg)",
            mode="lines",
            line=dict(width=0, color="#2C4C5B"),
            stackgroup="one",
            fillcolor="#2C4C5B",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Protein:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=other_carbs_cal,
            name=f"Other Carbohydrates ({rolling_window}-day avg)",
            mode="lines",
            line=dict(width=0, color="#C8963E"),
            stackgroup="one",
            fillcolor="#C8963E",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Other Carbs:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=sugar_cal,
            name=f"Sugar ({rolling_window}-day avg)",
            mode="lines",
            line=dict(width=0, color="#EBC374"),
            stackgroup="one",
            fillcolor="#EBC374",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Sugar:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=other_fat_cal,
            name=f"Other Fat ({rolling_window}-day avg)",
            mode="lines",
            line=dict(width=0, color="#BF6B59"),
            stackgroup="one",
            fillcolor="#BF6B59",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Other Fat:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=saturated_fat_cal,
            name=f"Saturated Fat ({rolling_window}-day avg)",
            mode="lines",
            line=dict(width=0, color="#E09F91"),
            stackgroup="one",
            fillcolor="rgba(224, 159, 145, 0.7)",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Saturated Fat:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    # Update layout with brand styling (Artisan) - no title
    fig.update_layout(
        xaxis_title="Date",
        yaxis_title="Total Calories (kcal)",
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

    # Update axes with brand styling
    fig.update_xaxes(
        showgrid=False,
        linecolor="#D4C5B0",
        tickfont=dict(size=11, color="#6B6B6B"),
    )
    fig.update_yaxes(
        rangemode="tozero",
        gridcolor="#D4C5B0",
        gridwidth=0.5,
        showgrid=True,
        linecolor="#D4C5B0",
        tickfont=dict(size=11, color="#6B6B6B"),
    )

    return fig
