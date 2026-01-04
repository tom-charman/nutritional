"""Normalized Nutrients vs RDI interactive Plotly visualization."""

import plotly.graph_objects as go


def create_normalized_nutrients_figure(
    plot_data: dict, color_palette: dict, rolling_window: int = 7
) -> go.Figure:
    """
    Create Plotly multi-line chart for nutrients normalized to RDI percentages.

    Features:
    - Multiple lines, one per nutrient
    - Horizontal line at 100% (RDI target)
    - Interactive tooltips
    - Color-coded by nutrient type

    Args:
        plot_data: Output from prepare_normalized_nutrients_data()
        color_palette: Color scheme dict
        rolling_window: Window size for display purposes

    Returns:
        plotly.graph_objects.Figure
    """
    dates = plot_data["dates"]

    # Create figure
    fig = go.Figure()

    # Define nutrient mapping with brand palette - Nihonga colors for distinction
    nutrient_config = {
        "saturated_fat_pct": ("Saturated Fat", "#E09F91"),  # Dusty Salmon
        "sugar_pct": ("Sugar", "#EBC374"),  # Pale Amber
        "fibre_pct": ("Fibre", "#4F6D46"),  # Aged Pine
        "salt_pct": ("Salt", "#7C6A88"),  # Oxidized Ube
        "calcium_pct": ("Calcium", "#6B7F82"),  # Stone Grey
    }

    # Add a trace for each nutrient
    for key, (display_name, color) in nutrient_config.items():
        if key in plot_data:
            fig.add_trace(
                go.Scatter(
                    x=dates,
                    y=plot_data[key],
                    name=display_name,
                    mode="lines+markers",
                    line=dict(color=color, width=1.5, shape="spline"),
                    marker=dict(size=4, color=color, line=dict(width=0.5, color="#F2F0EB")),
                    hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
                    + f"<b>{display_name}:</b> %{{y:.1f}}% of RDI<br>"
                    + "<extra></extra>",
                )
            )

    # Add horizontal line at 100% RDI
    fig.add_hline(
        y=100,
        line_dash="dash",
        line_color="#2B2B2B",
        annotation_text="100% RDI Target",
        annotation_position="right",
        line_width=1,
        opacity=0.5,
    )

    # Update layout with brand styling (Artisan) - no title
    fig.update_layout(
        xaxis_title="Date",
        yaxis_title="Intake (% of RDI)",
        hovermode="x unified",
        legend=dict(
            title="Nutrient",
            orientation="v",
            yanchor="top",
            y=1,
            xanchor="left",
            x=1.02,
        ),
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
