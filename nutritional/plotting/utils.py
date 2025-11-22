"""Shared plotting utilities for consistent styling and components."""

import plotly.graph_objects as go


def apply_common_layout(
    fig: go.Figure, title: str | None = None, date_range: tuple | None = None, height: int = 600
) -> go.Figure:
    """
    Apply consistent styling to all figures.

    Args:
        fig: Plotly figure to style
        title: Optional title override
        date_range: Optional (start_date, end_date) tuple
        height: Figure height in pixels

    Returns:
        Modified figure with consistent styling
    """
    if title:
        fig.update_layout(title=title)

    if date_range:
        fig.update_xaxes(range=date_range)

    fig.update_layout(
        height=height,
        template="plotly_white",
        font=dict(family="sans-serif", size=12),
        hovermode="x unified",
        plot_bgcolor="white",
        paper_bgcolor="white",
    )

    fig.update_xaxes(
        gridcolor="lightgray",
        showgrid=True,
    )

    fig.update_yaxes(
        gridcolor="lightgray",
        showgrid=True,
    )

    return fig


def create_date_selector_buttons() -> list:
    """
    Create Plotly range selector buttons for date filtering.

    Returns:
        List of button configurations for rangeselector
    """
    return [
        dict(count=1, label="1M", step="month", stepmode="backward"),
        dict(count=3, label="3M", step="month", stepmode="backward"),
        dict(count=6, label="6M", step="month", stepmode="backward"),
        dict(count=1, label="1Y", step="year", stepmode="backward"),
        dict(step="all", label="ALL"),
    ]


def add_date_range_selector(fig: go.Figure) -> go.Figure:
    """
    Add interactive date range selector to figure.

    Args:
        fig: Plotly figure

    Returns:
        Modified figure with range selector
    """
    fig.update_xaxes(
        rangeselector=dict(
            buttons=create_date_selector_buttons(),
            bgcolor="lightgray",
            activecolor="gray",
        ),
        rangeslider=dict(visible=False),
    )

    return fig


def format_hover_template(
    metric_name: str, unit: str, include_date: bool = True, precision: int = 1
) -> str:
    """
    Create standardized hover template formatting.

    Args:
        metric_name: Name of the metric to display
        unit: Unit of measurement
        include_date: Whether to include date in hover
        precision: Number of decimal places

    Returns:
        Formatted hover template string
    """
    template = ""

    if include_date:
        template += "<b>Date:</b> %{x|%Y-%m-%d}<br>"

    template += f"<b>{metric_name}:</b> %{{y:.{precision}f}} {unit}<br>"
    template += "<extra></extra>"

    return template


def create_empty_figure(message: str = "No data available") -> go.Figure:
    """
    Create an empty figure with a message.

    Args:
        message: Message to display

    Returns:
        Empty Plotly figure with annotation
    """
    fig = go.Figure()

    fig.add_annotation(
        text=message,
        xref="paper",
        yref="paper",
        x=0.5,
        y=0.5,
        showarrow=False,
        font=dict(size=20, color="gray"),
    )

    fig.update_layout(
        height=600,
        template="plotly_white",
        xaxis=dict(showgrid=False, showticklabels=False),
        yaxis=dict(showgrid=False, showticklabels=False),
    )

    return fig


def add_annotation(
    fig: go.Figure,
    text: str,
    x: float,
    y: float,
    xref: str = "x",
    yref: str = "y",
    showarrow: bool = True,
) -> go.Figure:
    """
    Add text annotation to figure.

    Args:
        fig: Plotly figure
        text: Annotation text
        x: X position
        y: Y position
        xref: X reference ('x', 'paper', etc.)
        yref: Y reference ('y', 'paper', etc.)
        showarrow: Whether to show arrow pointing to location

    Returns:
        Modified figure with annotation
    """
    fig.add_annotation(
        text=text,
        x=x,
        y=y,
        xref=xref,
        yref=yref,
        showarrow=showarrow,
        arrowhead=2 if showarrow else 0,
        arrowsize=1,
        arrowwidth=2,
        arrowcolor="gray",
        font=dict(size=12),
        bgcolor="white",
        opacity=0.8,
    )

    return fig
