"""History viewer page."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, callback, dcc, html

from nutritional.data_entry.storage import FileStorage

dash.register_page(__name__, path="/history", title="History")

storage = FileStorage()

layout = dbc.Container(
    [
        # Integrated Toolbar with Date Selector
        html.Div(
            [
                html.Div(
                    [
                        dcc.Dropdown(
                            id="history-date-selector",
                            placeholder="Select a date...",
                            style={"width": "250px"},
                        ),
                    ],
                    className="toolbar-left",
                ),
                html.Div(
                    id="history-summary-bar",
                    className="toolbar-right",
                ),
            ],
            className="toolbar",
            style={"marginBottom": "24px"},
        ),
        # Main Content
        html.Div(id="history-content"),
    ],
    fluid=True,
    className="page-content",
    style={"maxWidth": "1000px"},
)


@callback(
    Output("history-date-selector", "options"),
    Input("history-date-selector", "search_value"),
)
def update_date_options(_):
    """Load available dates."""
    dates = storage.get_all_dates()
    return [{"label": str(d), "value": str(d)} for d in dates]


@callback(
    [Output("history-content", "children"), Output("history-summary-bar", "children")],
    Input("history-date-selector", "value"),
)
def display_history(selected_date):
    """Display history for the selected date with integrated summary."""
    if not selected_date:
        return (
            html.Div(
                html.P(
                    "Select a date from above to view history.",
                    className="text-muted",
                    style={"textAlign": "center", "padding": "60px 20px"},
                ),
                style={
                    "border": "1px solid var(--border)",
                    "borderRadius": "8px",
                    "background": "var(--surface)",
                },
            ),
            None,
        )

    from datetime import datetime

    try:
        date_obj = datetime.fromisoformat(selected_date).date()
        daily_data = storage.load_daily_entry(date_obj)

        if not daily_data:
            return (
                html.Div(
                    html.P(
                        f"No data found for {selected_date}.",
                        className="text-muted",
                        style={"textAlign": "center", "padding": "60px 20px"},
                    ),
                    style={
                        "border": "1px solid var(--border)",
                        "borderRadius": "8px",
                        "background": "var(--surface)",
                    },
                ),
                None,
            )

        # Calculate totals
        totals = daily_data.totals if daily_data.totals else daily_data.calculate_totals()

        # Summary Bar
        summary_bar = html.Div(
            [
                html.Span(
                    f"{totals.energy_kcal:.0f} kcal",
                    style={"fontWeight": "600", "fontSize": "14px", "color": "var(--text-main)"},
                ),
                html.Span(" | ", style={"color": "var(--text-disabled)", "margin": "0 8px"}),
                html.Span(
                    f"{totals.protein_g:.1f}g P",
                    style={"fontSize": "13px", "color": "var(--text-muted)"},
                ),
                html.Span(" | ", style={"color": "var(--text-disabled)", "margin": "0 8px"}),
                html.Span(
                    f"{totals.carbohydrates_g:.1f}g C",
                    style={"fontSize": "13px", "color": "var(--text-muted)"},
                ),
                html.Span(" | ", style={"color": "var(--text-disabled)", "margin": "0 8px"}),
                html.Span(
                    f"{totals.fat_g:.1f}g F",
                    style={"fontSize": "13px", "color": "var(--text-muted)"},
                ),
            ],
            style={"display": "flex", "alignItems": "center"},
        )

        # Receipt-style entries list
        entries_list = html.Div(
            [
                html.Div(
                    [
                        html.Div(
                            [
                                html.Strong(entry.food_name, style={"fontSize": "15px"}),
                                html.Span(
                                    f" · {entry.weight_g:.1f}g"
                                    if entry.weight_g
                                    else f" · {entry.quantity:.1f}x",
                                    style={
                                        "color": "var(--text-muted)",
                                        "fontSize": "14px",
                                    },
                                ),
                                html.Span(
                                    f" · {entry.timestamp.strftime('%H:%M')}",
                                    style={
                                        "color": "var(--text-disabled)",
                                        "fontSize": "13px",
                                        "marginLeft": "4px",
                                    },
                                ),
                            ],
                            style={"flex": "1"},
                        ),
                        html.Div(
                            [
                                html.Span(
                                    f"{entry.nutrients.energy_kcal:.0f}",
                                    className="macro-badge badge-calories",
                                    title="Calories",
                                ),
                                html.Span(
                                    f"{entry.nutrients.protein_g:.1f}g P",
                                    className="macro-badge badge-protein",
                                    title="Protein",
                                ),
                                html.Span(
                                    f"{entry.nutrients.carbohydrates_g:.1f}g C",
                                    className="macro-badge badge-carbs",
                                    title="Carbohydrates",
                                ),
                                html.Span(
                                    f"{entry.nutrients.fat_g:.1f}g F",
                                    className="macro-badge badge-fat",
                                    title="Fat",
                                ),
                            ],
                            style={
                                "display": "flex",
                                "gap": "6px",
                                "flexWrap": "wrap",
                                "alignItems": "center",
                            },
                        ),
                    ],
                    className="receipt-item",
                )
                for entry in daily_data.entries
            ],
            className="receipt-list",
            style={"marginBottom": "16px"},
        )

        # Additional info
        additional_info = []

        # Measurements
        if daily_data.measurements.morning_weight_kg or daily_data.measurements.evening_weight_kg:
            measurements_content = []
            if daily_data.measurements.morning_weight_kg:
                measurements_content.append(
                    html.Div(
                        [
                            html.Span(
                                "Morning Weight",
                                style={"fontSize": "13px", "color": "var(--text-muted)"},
                            ),
                            html.Span(
                                f"{daily_data.measurements.morning_weight_kg:.1f} kg",
                                style={
                                    "fontSize": "13px",
                                    "fontWeight": "600",
                                    "color": "var(--text-main)",
                                },
                            ),
                        ],
                        style={
                            "display": "flex",
                            "justifyContent": "space-between",
                            "marginBottom": "6px",
                        },
                    )
                )
            if daily_data.measurements.evening_weight_kg:
                measurements_content.append(
                    html.Div(
                        [
                            html.Span(
                                "Evening Weight",
                                style={"fontSize": "13px", "color": "var(--text-muted)"},
                            ),
                            html.Span(
                                f"{daily_data.measurements.evening_weight_kg:.1f} kg",
                                style={
                                    "fontSize": "13px",
                                    "fontWeight": "600",
                                    "color": "var(--text-main)",
                                },
                            ),
                        ],
                        style={"display": "flex", "justifyContent": "space-between"},
                    )
                )

            additional_info.append(
                html.Div(
                    [
                        html.Div(
                            "BODY WEIGHT", className="section-label", style={"marginBottom": "8px"}
                        ),
                        html.Div(
                            measurements_content,
                            style={
                                "padding": "12px",
                                "background": "var(--background)",
                                "borderRadius": "6px",
                            },
                        ),
                    ],
                    style={"marginTop": "16px"},
                )
            )

        # Additional nutrients
        additional_info.append(
            html.Div(
                [
                    html.Div(
                        "ADDITIONAL NUTRIENTS",
                        className="section-label",
                        style={"marginBottom": "8px", "marginTop": "16px"},
                    ),
                    html.Div(
                        [
                            html.Div(
                                [
                                    html.Span(
                                        "Fibre",
                                        style={"fontSize": "13px", "color": "var(--text-muted)"},
                                    ),
                                    html.Span(
                                        f"{totals.fibre_g:.1f}g",
                                        style={
                                            "fontSize": "13px",
                                            "fontWeight": "600",
                                            "color": "var(--text-main)",
                                        },
                                    ),
                                ],
                                style={
                                    "display": "flex",
                                    "justifyContent": "space-between",
                                    "marginBottom": "6px",
                                },
                            ),
                            html.Div(
                                [
                                    html.Span(
                                        "Sugar",
                                        style={"fontSize": "13px", "color": "var(--text-muted)"},
                                    ),
                                    html.Span(
                                        f"{totals.sugar_g:.1f}g",
                                        style={
                                            "fontSize": "13px",
                                            "fontWeight": "600",
                                            "color": "var(--text-main)",
                                        },
                                    ),
                                ],
                                style={
                                    "display": "flex",
                                    "justifyContent": "space-between",
                                    "marginBottom": "6px",
                                },
                            ),
                            html.Div(
                                [
                                    html.Span(
                                        "Sat Fat",
                                        style={"fontSize": "13px", "color": "var(--text-muted)"},
                                    ),
                                    html.Span(
                                        f"{totals.saturated_fat_g:.1f}g",
                                        style={
                                            "fontSize": "13px",
                                            "fontWeight": "600",
                                            "color": "var(--text-main)",
                                        },
                                    ),
                                ],
                                style={
                                    "display": "flex",
                                    "justifyContent": "space-between",
                                    "marginBottom": "6px",
                                },
                            ),
                            html.Div(
                                [
                                    html.Span(
                                        "Salt",
                                        style={"fontSize": "13px", "color": "var(--text-muted)"},
                                    ),
                                    html.Span(
                                        f"{totals.salt_g:.1f}g",
                                        style={
                                            "fontSize": "13px",
                                            "fontWeight": "600",
                                            "color": "var(--text-main)",
                                        },
                                    ),
                                ],
                                style={"display": "flex", "justifyContent": "space-between"},
                            ),
                        ],
                        style={
                            "padding": "12px",
                            "background": "var(--background)",
                            "borderRadius": "6px",
                        },
                    ),
                ],
            )
        )

        return (
            html.Div([entries_list] + additional_info),
            summary_bar,
        )

    except Exception as e:
        return (
            html.Div(
                html.P(
                    f"Error loading history: {str(e)}",
                    className="text-danger",
                    style={"textAlign": "center", "padding": "60px 20px"},
                ),
                style={
                    "border": "1px solid var(--border)",
                    "borderRadius": "8px",
                    "background": "var(--surface)",
                },
            ),
            None,
        )
