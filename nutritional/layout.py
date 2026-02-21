"""
Dashboard layout components using Dash and Bootstrap.

Defines the entire UI structure including header, controls, plots, and summary statistics.
"""

import dash_bootstrap_components as dbc
from dash import dcc, html

from nutritional.component_ids import ID, get_id

HOME_PREFIX = ""


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
                                                id=get_id(ID.CALORIES_WEIGHT_PLOT, HOME_PREFIX),
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
                                                id=get_id(ID.MACRO_BREAKDOWN_PLOT, HOME_PREFIX),
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
                                                id=get_id(ID.NUTRIENTS_RDI_PLOT, HOME_PREFIX),
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
                id=get_id(ID.LOADING_OVERLAY, HOME_PREFIX),
                type="default",
                children=[html.Div(id=get_id(ID.LOADING_OUTPUT, HOME_PREFIX))],
                overlay_style={"visibility": "visible", "opacity": 0.5},
            ),
            # Store for data (client-side caching)
            dcc.Store(id=get_id(ID.DATA_STORE, HOME_PREFIX)),
            # Hidden elements for removed components (keep callbacks working)
            html.Div(
                [
                    html.Div(id=get_id(ID.AVG_CALORIES, HOME_PREFIX), className="hidden"),
                    html.Div(id=get_id(ID.AVG_WEIGHT, HOME_PREFIX), className="hidden"),
                    html.Div(id=get_id(ID.AVG_PROTEIN, HOME_PREFIX), className="hidden"),
                    html.Div(id=get_id(ID.DATA_POINTS, HOME_PREFIX), className="hidden"),
                    html.Div(id=get_id(ID.DATA_SOURCE_INFO, HOME_PREFIX), className="hidden"),
                    dbc.Button(
                        "Refresh", id=get_id(ID.REFRESH_BUTTON, HOME_PREFIX), className="hidden"
                    ),
                ],
                className="hidden",
            ),
        ],
        fluid=True,
        className="px-4",
    )
