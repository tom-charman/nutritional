"""History viewer page."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, callback, dcc, html

from nutritional.data_entry.storage_factory import get_storage

dash.register_page(__name__, path="/history", title="History")

storage = get_storage()

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
                            className="history-date-dropdown",
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
        ),
        # Main Content
        html.Div(id="history-content"),
    ],
    fluid=True,
    className="page-content",
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
                    className="text-muted text-center p-3",
                ),
                className="card",
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
                        className="text-muted text-center p-3",
                    ),
                    className="card",
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
                    className="summary-stat-primary",
                ),
                html.Span(" | ", className="summary-separator"),
                html.Span(
                    f"{totals.protein_g:.1f} g Protein",
                    className="summary-stat-secondary",
                ),
                html.Span(" | ", className="summary-separator"),
                html.Span(
                    f"{totals.carbohydrates_g:.1f} g Carbs",
                    className="summary-stat-secondary",
                ),
                html.Span(" | ", className="summary-separator"),
                html.Span(
                    f"{totals.fat_g:.1f} g Fat",
                    className="summary-stat-secondary",
                ),
            ],
            className="history-summary-compact",
        )

        # Receipt-style entries list
        entries_list = html.Div(
            [
                html.Div(
                    [
                        html.Div(
                            [
                                html.Strong(entry.food_name, className="entry-name"),
                                html.Span(
                                    f" · {entry.weight_g:.1f} g"
                                    if entry.weight_g
                                    else f" · {entry.quantity:.1f} x",
                                    className="entry-meta",
                                ),
                                html.Span(
                                    f" · {entry.timestamp.strftime('%H:%M')}",
                                    className="entry-timestamp",
                                ),
                            ],
                            className="flex-1",
                        ),
                        html.Div(
                            [
                                html.Span(
                                    f"{entry.nutrients.energy_kcal:.0f} kcal",
                                    className="macro-badge badge-calories",
                                    title="Calories",
                                ),
                                html.Span(
                                    f"{entry.nutrients.protein_g:.1f} g Protein",
                                    className="macro-badge badge-protein",
                                    title="Protein",
                                ),
                                html.Span(
                                    f"{entry.nutrients.carbohydrates_g:.1f} g Carbs",
                                    className="macro-badge badge-carbs",
                                    title="Carbohydrates",
                                ),
                                html.Span(
                                    f"{entry.nutrients.fat_g:.1f} g Fat",
                                    className="macro-badge badge-fat",
                                    title="Fat",
                                ),
                            ],
                            className="macro-badges-container",
                        ),
                    ],
                    className="receipt-item",
                )
                for entry in daily_data.entries
            ],
            className="receipt-list receipt-list-mb",
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
                                className="measurement-label",
                            ),
                            html.Span(
                                f"{daily_data.measurements.morning_weight_kg:.1f} kg",
                                className="measurement-value",
                            ),
                        ],
                        className="measurement-item",
                    )
                )
            if daily_data.measurements.evening_weight_kg:
                measurements_content.append(
                    html.Div(
                        [
                            html.Span(
                                "Evening Weight",
                                className="measurement-label",
                            ),
                            html.Span(
                                f"{daily_data.measurements.evening_weight_kg:.1f} kg",
                                className="measurement-value",
                            ),
                        ],
                        className="measurement-item",
                    )
                )

            additional_info.append(
                html.Div(
                    [
                        html.Div("BODY WEIGHT", className="section-label section-label-mb"),
                        html.Div(
                            measurements_content,
                            className="measurement-container",
                        ),
                    ],
                    className="nutrients-section",
                )
            )

        # Additional nutrients
        additional_info.append(
            html.Div(
                [
                    html.Div(
                        "ADDITIONAL NUTRIENTS",
                        className="section-label section-label-mt",
                    ),
                    html.Div(
                        [
                            html.Div(
                                [
                                    html.Span(
                                        "Fibre",
                                        className="measurement-label",
                                    ),
                                    html.Span(
                                        f"{totals.fibre_g:.1f} g",
                                        className="measurement-value",
                                    ),
                                ],
                                className="measurement-item",
                            ),
                            html.Div(
                                [
                                    html.Span(
                                        "Sugar",
                                        className="measurement-label",
                                    ),
                                    html.Span(
                                        f"{totals.sugar_g:.1f} g",
                                        className="measurement-value",
                                    ),
                                ],
                                className="measurement-item",
                            ),
                            html.Div(
                                [
                                    html.Span(
                                        "Sat Fat",
                                        className="measurement-label",
                                    ),
                                    html.Span(
                                        f"{totals.saturated_fat_g:.1f} g",
                                        className="measurement-value",
                                    ),
                                ],
                                className="measurement-item",
                            ),
                            html.Div(
                                [
                                    html.Span(
                                        "Salt",
                                        className="measurement-label",
                                    ),
                                    html.Span(
                                        f"{totals.salt_g:.1f} g",
                                        className="measurement-value",
                                    ),
                                ],
                                className="measurement-item",
                            ),
                        ],
                        className="measurement-container",
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
                    className="text-danger text-center p-3",
                ),
                className="card",
            ),
            None,
        )
