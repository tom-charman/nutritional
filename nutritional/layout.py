"""
Dashboard layout components using Dash and Bootstrap.

Defines the entire UI structure including header, controls, plots, and summary statistics.
"""

import dash_bootstrap_components as dbc
from dash import dcc, html


def get_layout():
    """
    Create the main dashboard layout.

    Returns:
        Dash layout container with all UI components
    """
    return dbc.Container(
        [
            # Unified Dashboard View - No separate sections
            html.Div(
                [
                    # Integrated Controls & Visualizations
                    html.Div(
                        [
                            # Control Bar - positioned above visualizations
                            html.Div(
                                [
                                    html.Div(
                                        [
                                            dcc.DatePickerRange(
                                                id="date-range-picker",
                                                display_format="YYYY-MM-DD",
                                                start_date_placeholder_text="Start Date",
                                                end_date_placeholder_text="End Date",
                                                style={"fontSize": "14px"},
                                            ),
                                        ],
                                        style={
                                            "display": "flex",
                                            "gap": "12px",
                                            "alignItems": "center",
                                        },
                                    ),
                                    html.Div(
                                        [
                                            html.Span(
                                                "Rolling:",
                                                style={
                                                    "fontSize": "13px",
                                                    "color": "var(--text-muted)",
                                                    "marginRight": "8px",
                                                },
                                            ),
                                            dcc.Dropdown(
                                                id="rolling-window-dropdown",
                                                options=[
                                                    {"label": "3 days", "value": 3},
                                                    {"label": "7 days", "value": 7},
                                                    {"label": "14 days", "value": 14},
                                                    {"label": "30 days", "value": 30},
                                                ],
                                                value=7,
                                                clearable=False,
                                                style={"width": "120px", "fontSize": "14px"},
                                            ),
                                        ],
                                        style={"display": "flex", "alignItems": "center"},
                                    ),
                                ],
                                style={
                                    "display": "flex",
                                    "justifyContent": "space-between",
                                    "alignItems": "center",
                                    "marginBottom": "24px",
                                    "padding": "16px 0",
                                },
                            ),
                            # Visualization Tabs - Clean, no emojis
                            dbc.Tabs(
                                [
                                    dbc.Tab(
                                        [
                                            html.Div(
                                                [
                                                    dcc.Graph(
                                                        id="calories-weight-plot",
                                                        config={
                                                            "displayModeBar": True,
                                                            "displaylogo": False,
                                                        },
                                                        style={"height": "600px"},
                                                    )
                                                ],
                                                style={
                                                    "background": "var(--surface)",
                                                    "borderRadius": "8px",
                                                    "padding": "16px",
                                                    "border": "1px solid var(--border)",
                                                },
                                            )
                                        ],
                                        label="Calories & Weight",
                                        tab_id="tab-1",
                                    ),
                                    dbc.Tab(
                                        [
                                            html.Div(
                                                [
                                                    dcc.Graph(
                                                        id="macro-breakdown-plot",
                                                        config={
                                                            "displayModeBar": True,
                                                            "displaylogo": False,
                                                        },
                                                        style={"height": "600px"},
                                                    )
                                                ],
                                                style={
                                                    "background": "var(--surface)",
                                                    "borderRadius": "8px",
                                                    "padding": "16px",
                                                    "border": "1px solid var(--border)",
                                                },
                                            )
                                        ],
                                        label="Macronutrient Breakdown",
                                        tab_id="tab-2",
                                    ),
                                    dbc.Tab(
                                        [
                                            html.Div(
                                                [
                                                    dcc.Graph(
                                                        id="nutrients-rdi-plot",
                                                        config={
                                                            "displayModeBar": True,
                                                            "displaylogo": False,
                                                        },
                                                        style={"height": "600px"},
                                                    )
                                                ],
                                                style={
                                                    "background": "var(--surface)",
                                                    "borderRadius": "8px",
                                                    "padding": "16px",
                                                    "border": "1px solid var(--border)",
                                                },
                                            )
                                        ],
                                        label="Nutrients vs RDI",
                                        tab_id="tab-3",
                                    ),
                                ],
                                id="plot-tabs",
                                active_tab="tab-1",
                                style={"marginTop": "0"},
                            ),
                        ],
                        style={
                            "maxWidth": "1400px",
                            "margin": "0 auto",
                            "paddingTop": "40px",
                        },
                    ),
                ],
            ),
            # Loading indicator overlay
            dcc.Loading(
                id="loading-overlay",
                type="default",
                children=[html.Div(id="loading-output")],
                overlay_style={"visibility": "visible", "opacity": 0.5},
            ),
            # Store for data (client-side caching)
            dcc.Store(id="data-store"),
            # Hidden elements for removed components (keep callbacks working)
            html.Div(
                [
                    html.Div(id="avg-calories", style={"display": "none"}),
                    html.Div(id="avg-weight", style={"display": "none"}),
                    html.Div(id="avg-protein", style={"display": "none"}),
                    html.Div(id="data-points", style={"display": "none"}),
                    html.Div(id="data-source-info", style={"display": "none"}),
                    dbc.Button("Refresh", id="refresh-button", style={"display": "none"}),
                ],
                style={"display": "none"},
            ),
        ],
        fluid=True,
        className="px-4",
    )
