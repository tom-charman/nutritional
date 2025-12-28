"""History viewer page."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, callback, dcc, html

from nutritional.data_entry.storage import FileStorage

dash.register_page(__name__, path="/history", title="History")

storage = FileStorage()

layout = dbc.Container(
    [
        dbc.Row(
            [
                dbc.Col(html.H1("Food Entry History"), width=12),
            ],
            className="mb-4",
        ),
        dbc.Row(
            [
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Browse Days")),
                                dbc.CardBody(
                                    [
                                        dbc.Label("Select Date"),
                                        dcc.Dropdown(
                                            id="history-date-selector",
                                            placeholder="Select a date...",
                                        ),
                                    ]
                                ),
                            ]
                        ),
                    ],
                    width=12,
                ),
            ],
            className="mb-3",
        ),
        dbc.Row(
            [
                dbc.Col(
                    [
                        html.Div(id="history-content"),
                    ],
                    width=12,
                ),
            ]
        ),
    ],
    fluid=True,
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
    Output("history-content", "children"),
    Input("history-date-selector", "value"),
)
def display_history(selected_date):
    """Display history for the selected date."""
    if not selected_date:
        return html.P("Select a date to view history.", className="text-muted")

    from datetime import datetime

    try:
        date_obj = datetime.fromisoformat(selected_date).date()
        daily_data = storage.load_daily_entry(date_obj)

        if not daily_data:
            return html.P(f"No data found for {selected_date}.", className="text-muted")

        # Display entries
        entries_list = dbc.ListGroup(
            [
                dbc.ListGroupItem(
                    [
                        html.Div(
                            [
                                html.Strong(entry.food_name),
                                dbc.Badge(
                                    f"{entry.weight_g}g"
                                    if entry.weight_g
                                    else f"{entry.quantity}x",
                                    color="secondary",
                                    className="ms-2",
                                ),
                                dbc.Badge(
                                    entry.timestamp.strftime("%H:%M"),
                                    color="info",
                                    className="ms-2",
                                ),
                            ]
                        ),
                        html.Small(
                            f"{entry.nutrients.energy_kcal:.0f}kcal | "
                            f"P:{entry.nutrients.protein_g:.1f}g | "
                            f"C:{entry.nutrients.carbohydrates_g:.1f}g | "
                            f"F:{entry.nutrients.fat_g:.1f}g",
                            className="text-muted",
                        ),
                    ]
                )
                for entry in daily_data.entries
            ],
            flush=True,
        )

        # Display totals
        totals = daily_data.totals if daily_data.totals else daily_data.calculate_totals()

        totals_card = dbc.Card(
            [
                dbc.CardHeader(html.H5("Daily Totals")),
                dbc.CardBody(
                    [
                        dbc.Row(
                            [
                                dbc.Col(
                                    [html.Strong("Energy:"), f" {totals.energy_kcal:.0f} kcal"],
                                    width=3,
                                ),
                                dbc.Col(
                                    [html.Strong("Protein:"), f" {totals.protein_g:.1f} g"], width=3
                                ),
                                dbc.Col(
                                    [html.Strong("Carbs:"), f" {totals.carbohydrates_g:.1f} g"],
                                    width=3,
                                ),
                                dbc.Col([html.Strong("Fat:"), f" {totals.fat_g:.1f} g"], width=3),
                            ]
                        ),
                        html.Hr(),
                        dbc.Row(
                            [
                                dbc.Col(
                                    [html.Strong("Fibre:"), f" {totals.fibre_g:.1f} g"], width=3
                                ),
                                dbc.Col(
                                    [html.Strong("Sugar:"), f" {totals.sugar_g:.1f} g"], width=3
                                ),
                                dbc.Col(
                                    [html.Strong("Sat Fat:"), f" {totals.saturated_fat_g:.1f} g"],
                                    width=3,
                                ),
                                dbc.Col([html.Strong("Salt:"), f" {totals.salt_g:.1f} g"], width=3),
                            ]
                        ),
                    ]
                ),
            ],
            className="mt-3",
        )

        # Display measurements
        measurements_info = []
        if daily_data.measurements.morning_weight_kg:
            measurements_info.append(
                html.P(f"Morning Weight: {daily_data.measurements.morning_weight_kg:.1f} kg")
            )
        if daily_data.measurements.evening_weight_kg:
            measurements_info.append(
                html.P(f"Evening Weight: {daily_data.measurements.evening_weight_kg:.1f} kg")
            )

        measurements_card = None
        if measurements_info:
            measurements_card = dbc.Card(
                [
                    dbc.CardHeader(html.H5("Body Weight")),
                    dbc.CardBody(measurements_info),
                ],
                className="mt-3",
            )

        return [
            dbc.Card(
                [
                    dbc.CardHeader(html.H4(f"Entries for {selected_date}")),
                    dbc.CardBody([entries_list]),
                ]
            ),
            totals_card,
            measurements_card,
        ]

    except Exception as e:
        return html.P(f"Error loading history: {str(e)}", className="text-danger")
