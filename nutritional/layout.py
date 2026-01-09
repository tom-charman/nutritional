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
                                                    "displayModeBar": False,
                                                    "displaylogo": False,
                                                },
                                                className="graph-height",
                                            )
                                        ],
                                        className="graph-wrapper",
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
                                                    "displayModeBar": False,
                                                    "displaylogo": False,
                                                },
                                                className="graph-height",
                                            )
                                        ],
                                        className="graph-wrapper",
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
                                                    "displayModeBar": False,
                                                    "displaylogo": False,
                                                },
                                                className="graph-height",
                                            )
                                        ],
                                        className="graph-wrapper",
                                    )
                                ],
                                label="Nutrients vs RDI",
                                tab_id="tab-3",
                            ),
                        ],
                        id="plot-tabs",
                        active_tab="tab-1",
                        className="tab-content-padding",
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
                    html.Div(id="avg-calories", className="hidden"),
                    html.Div(id="avg-weight", className="hidden"),
                    html.Div(id="avg-protein", className="hidden"),
                    html.Div(id="data-points", className="hidden"),
                    html.Div(id="data-source-info", className="hidden"),
                    dbc.Button("Refresh", id="refresh-button", className="hidden"),
                ],
                className="hidden",
            ),
        ],
        fluid=True,
        className="px-4",
    )
