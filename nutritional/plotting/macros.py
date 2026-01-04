"""Macronutrient Breakdown interactive Plotly visualization."""

import plotly.graph_objects as go


def create_macro_breakdown_figure(
    plot_data: dict, color_palette: dict, rolling_window: int = 7
) -> go.Figure:
    """
    Create Plotly stacked area chart for macronutrient calorie breakdown.

    Features:
    - Stacked areas showing calorie contribution from each macro
    - Ordered: Carbs, Protein, Other Fat, Saturated Fat
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
    carbs_cal = plot_data["carbs_cal"]
    protein_cal = plot_data["protein_cal"]
    other_fat_cal = plot_data["other_fat_cal"]
    saturated_fat_cal = plot_data["saturated_fat_cal"]

    # Create figure
    fig = go.Figure()

    # Add traces in order (bottom to top of stack)
    # Order: Carbs, Protein, Other Fat, Saturated Fat

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=carbs_cal,
            name="Carbohydrates",
            mode="lines",
            line=dict(width=0, color="#789440"),
            stackgroup="one",
            fillcolor="#789440",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Carbs:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=protein_cal,
            name="Protein",
            mode="lines",
            line=dict(width=0, color="#E87722"),
            stackgroup="one",
            fillcolor="#E87722",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Protein:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=other_fat_cal,
            name="Other Fat",
            mode="lines",
            line=dict(width=0, color="#4A9B8E"),
            stackgroup="one",
            fillcolor="#4A9B8E",
            hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
            + "<b>Other Fat:</b> %{y:.0f} kcal<br>"
            + "<extra></extra>",
        )
    )

    fig.add_trace(
        go.Scatter(
            x=dates,
            y=saturated_fat_cal,
            name="Saturated Fat",
            mode="lines",
            line=dict(width=0, color="#A04000"),
            stackgroup="one",
            fillcolor="rgba(160, 64, 0, 0.7)",
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
