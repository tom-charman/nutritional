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
            # Header
            dbc.Row(
                [
                    dbc.Col(
                        [
                            html.H1(
                                "Nutritional Dashboard",
                                className="text-center mb-2 mt-4",
                            ),
                            html.P(
                                "Interactive visualization of daily nutritional intake",
                                className="text-center text-muted mb-4",
                            ),
                        ]
                    )
                ]
            ),
            # Controls Row
            html.Div(
                [
                    html.Div(
                        [
                            html.Label("Date Range:", className="fw-bold"),
                            dcc.DatePickerRange(
                                id="date-range-picker",
                                display_format="YYYY-MM-DD",
                                start_date_placeholder_text="Start Date",
                                end_date_placeholder_text="End Date",
                            ),
                        ],
                        className="control-group-left",
                    ),
                    html.Div(
                        [
                            html.Label("Rolling Window:", className="fw-bold me-2"),
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
                                style={"width": "150px"},
                            ),
                            dbc.Button(
                                "Refresh",
                                id="refresh-button",
                                color="secondary",
                                className="ms-2",
                                n_clicks=0,
                            ),
                        ],
                        className="control-group-right",
                    ),
                ],
                className="control-bar",
            ),
            # Summary Statistics Cards
            html.H4("Summary Statistics", className="mt-4 mb-3"),
            dbc.Row(
                [
                    dbc.Col(
                        [
                            html.Div(
                                [
                                    html.H3(
                                        id="avg-calories",
                                    ),
                                    html.P(
                                        "Avg Daily Calories",
                                        className="mb-0",
                                    ),
                                ],
                                className="summary-card",
                            )
                        ],
                        md=3,
                    ),
                    dbc.Col(
                        [
                            html.Div(
                                [
                                    html.H3(
                                        id="avg-weight",
                                    ),
                                    html.P(
                                        "Avg Weight (kg)",
                                        className="mb-0",
                                    ),
                                ],
                                className="summary-card",
                            )
                        ],
                        md=3,
                    ),
                    dbc.Col(
                        [
                            html.Div(
                                [
                                    html.H3(
                                        id="avg-protein",
                                    ),
                                    html.P(
                                        "Avg Protein (g)",
                                        className="mb-0",
                                    ),
                                ],
                                className="summary-card",
                            )
                        ],
                        md=3,
                    ),
                    dbc.Col(
                        [
                            html.Div(
                                [
                                    html.H3(
                                        id="data-points",
                                    ),
                                    html.P(
                                        "Data Points",
                                        className="mb-0",
                                    ),
                                ],
                                className="summary-card",
                            )
                        ],
                        md=3,
                    ),
                ],
                className="mb-4",
            ),
            # Plots Section
            html.H4("Visualizations", className="mt-4 mb-3"),
            dbc.Tabs(
                [
                    dbc.Tab(
                        [
                            html.Div(
                                [
                                    dcc.Graph(
                                        id="calories-weight-plot",
                                        config={"displayModeBar": True, "displaylogo": False},
                                        style={"height": "600px"},
                                    )
                                ],
                                className="graph-container",
                            )
                        ],
                        label="📊 Calories & Weight",
                        tab_id="tab-1",
                    ),
                    dbc.Tab(
                        [
                            html.Div(
                                [
                                    dcc.Graph(
                                        id="macro-breakdown-plot",
                                        config={"displayModeBar": True, "displaylogo": False},
                                        style={"height": "600px"},
                                    )
                                ],
                                className="graph-container",
                            )
                        ],
                        label="🥗 Macronutrient Breakdown",
                        tab_id="tab-2",
                    ),
                    dbc.Tab(
                        [
                            html.Div(
                                [
                                    dcc.Graph(
                                        id="nutrients-rdi-plot",
                                        config={"displayModeBar": True, "displaylogo": False},
                                        style={"height": "600px"},
                                    )
                                ],
                                className="graph-container",
                            )
                        ],
                        label="💊 Nutrients vs RDI",
                        tab_id="tab-3",
                    ),
                ],
                id="plot-tabs",
                active_tab="tab-1",
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
            # Footer with data source information
            html.Hr(className="mt-5"),
            dbc.Row(
                [
                    dbc.Col(
                        [
                            html.P(
                                id="data-source-info",
                                className="text-muted text-center",
                            ),
                            html.P(
                                "Built with Plotly Dash | Data processed with NumPy",
                                className="text-muted text-center small",
                            ),
                        ]
                    )
                ],
                className="mb-4",
            ),
        ],
        fluid=True,
        className="px-4",
    )
