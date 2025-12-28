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

    # Define nutrient mapping with premium color palette
    nutrient_config = {
        "saturated_fat_pct": ("Saturated Fat", "#DC2626"),
        "sugar_pct": ("Sugar", "#D97706"),
        "fibre_pct": ("Fibre", "#059669"),
        "salt_pct": ("Salt", "#2563EB"),
        "calcium_pct": ("Calcium", "#7C3AED"),
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
                    line=dict(color=color, width=3, shape="spline"),
                    marker=dict(size=5, color=color, line=dict(width=1, color="white")),
                    hovertemplate="<b>Date:</b> %{x|%Y-%m-%d}<br>"
                    + f"<b>{display_name}:</b> %{{y:.1f}}% of RDI<br>"
                    + "<extra></extra>",
                )
            )

    # Add horizontal line at 100% RDI
    fig.add_hline(
        y=100,
        line_dash="dash",
        line_color="#DC2626",
        annotation_text="100% RDI Target",
        annotation_position="right",
        line_width=2,
        opacity=0.5,
    )

    # Update layout with premium styling
    fig.update_layout(
        title=f"Nutrient Intake vs RDI ({rolling_window}-day avg)",
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
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(family="Inter, sans-serif", size=13, color="#475569"),
        margin=dict(l=60, r=20, t=40, b=40),
    )

    # Update axes with premium styling
    fig.update_xaxes(
        showgrid=False,
        linecolor="#E2E8F0",
        tickfont=dict(size=12, color="#64748B"),
    )
    fig.update_yaxes(
        rangemode="tozero",
        gridcolor="#F1F5F9",
        gridwidth=1,
        showgrid=True,
        linecolor="#E2E8F0",
        tickfont=dict(size=12, color="#64748B"),
    )

    return fig
