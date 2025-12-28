"""Daily entry form page."""

from datetime import date, datetime

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html, no_update
from dash.exceptions import PreventUpdate

from nutritional.data_entry.calculator import calculate_nutrients
from nutritional.data_entry.models import DailyData, FoodEntry, Measurements, UnitType
from nutritional.data_entry.storage import FileStorage

dash.register_page(__name__, path="/entry", title="Daily Entry")

storage = FileStorage()

layout = dbc.Container(
    [
        # Hidden trigger to reload data when page is visited
        html.Div(id="page-load-trigger", style={"display": "none"}),
        dbc.Row(
            [
                dbc.Col(html.H1("Daily Food Entry"), width=12),
                dbc.Col(
                    html.P(
                        id="current-date-display",
                        className="text-muted",
                    ),
                    width=12,
                ),
            ],
            className="mb-4",
        ),
        dbc.Row(
            [
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Add Food Entry")),
                                dbc.CardBody(
                                    [
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Food Item"),
                                                        dcc.Dropdown(
                                                            id="food-selector",
                                                            placeholder="Select a food...",
                                                            searchable=True,
                                                        ),
                                                    ],
                                                    width=12,
                                                ),
                                            ],
                                            className="mb-3",
                                        ),
                                        html.Div(id="food-input-container"),
                                        html.Div(
                                            id="calculated-nutrients",
                                            className="mt-3",
                                        ),
                                        dbc.Button(
                                            "Add Entry",
                                            id="add-entry-btn",
                                            color="primary",
                                            className="mt-3",
                                        ),
                                        html.Div(id="entry-message", className="mt-2"),
                                    ]
                                ),
                            ]
                        ),
                    ],
                    width=6,
                ),
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Today's Entries")),
                                dbc.CardBody(
                                    [
                                        html.Div(id="entries-list"),
                                    ]
                                ),
                            ],
                            className="mb-3",
                        ),
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Daily Totals")),
                                dbc.CardBody(
                                    [
                                        html.Div(id="daily-totals"),
                                    ]
                                ),
                            ],
                            className="mb-3",
                        ),
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Body Weight")),
                                dbc.CardBody(
                                    [
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Morning Weight (kg)"),
                                                        dbc.Input(
                                                            id="morning-weight",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=6,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Evening Weight (kg)"),
                                                        dbc.Input(
                                                            id="evening-weight",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=6,
                                                ),
                                            ]
                                        ),
                                    ]
                                ),
                            ],
                            className="mb-3",
                        ),
                    ],
                    width=6,
                ),
            ]
        ),
    ],
    fluid=True,
)


# Display current date
@callback(
    Output("current-date-display", "children"),
    Input("page-load-trigger", "children"),
)
def display_current_date(_):
    """Display the current date."""
    return f"Tracking for: {date.today().strftime('%A, %B %d, %Y')}"


# Load today's entries from file on page load
@callback(
    [
        Output("persistent-entries", "data", allow_duplicate=True),
        Output("persistent-morning-weight", "data", allow_duplicate=True),
        Output("persistent-evening-weight", "data", allow_duplicate=True),
    ],
    Input("page-load-trigger", "children"),
    prevent_initial_call=True,
)
def load_todays_entries(_):
    """Load entries for today's date from file."""
    today = date.today()
    daily_data = storage.load_daily_entry(today)

    if daily_data:
        return (
            [entry.model_dump(mode="json") for entry in daily_data.entries],
            daily_data.measurements.morning_weight_kg,
            daily_data.measurements.evening_weight_kg,
        )
    return [], None, None


# Trigger callback when page loads to ensure persistent data is displayed
@callback(
    Output("page-load-trigger", "children"),
    Input("url", "pathname"),
)
def trigger_on_page_load(pathname):
    """Trigger when page is loaded."""
    if pathname == "/entry":
        return "loaded"
    return no_update


@callback(
    Output("morning-weight", "value"),
    [Input("persistent-morning-weight", "data"), Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def load_morning_weight(weight, _):
    """Load morning weight from persistent store."""
    return weight


@callback(
    Output("evening-weight", "value"),
    [Input("persistent-evening-weight", "data"), Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def load_evening_weight(weight, _):
    """Load evening weight from persistent store."""
    return weight


@callback(
    Output("food-selector", "options"),
    Input("food-selector", "search_value"),
)
def update_food_options(search_value):
    """Update food dropdown options."""
    if search_value:
        items = storage.search_food_items(search_value)
    else:
        items = storage.load_food_database()

    return [
        {
            "label": (
                f"{item.name} ("
                + (
                    "per 100g"
                    if item.unit_type == UnitType.PER_100G
                    else f"per item, ~{item.serving_size_g}g"
                )
                + ")"
            ),
            "value": item.id,
        }
        for item in items
    ]


@callback(
    Output("food-input-container", "children"),
    Input("food-selector", "value"),
)
def update_input_fields(food_id):
    """Update input fields based on selected food item."""
    if not food_id:
        return []

    item = storage.get_food_item(food_id)
    if not item:
        return []

    if item.unit_type == UnitType.PER_100G:
        return [
            dbc.Label("Weight (g)", className="mt-2"),
            dbc.Input(
                id={"type": "food-amount", "index": 0},
                type="number",
                min=0,
                step=0.1,
                placeholder="Enter weight in grams",
            ),
        ]
    else:  # PER_ITEM
        return [
            dbc.Label(f"Quantity (1 item = {item.serving_size_g}g)", className="mt-2"),
            dbc.Input(
                id={"type": "food-amount", "index": 0},
                type="number",
                min=0,
                step=0.1,
                placeholder="Enter quantity (e.g., 1.5)",
            ),
        ]


@callback(
    Output("calculated-nutrients", "children"),
    [Input("food-selector", "value"), Input({"type": "food-amount", "index": dash.ALL}, "value")],
    prevent_initial_call=True,
)
def calculate_and_display_nutrients(food_id, amount_list):
    """Calculate and display nutrients based on amount."""
    # Extract amount from list
    amount = amount_list[0] if amount_list and len(amount_list) > 0 else None

    if not food_id or not amount:
        return []

    item = storage.get_food_item(food_id)
    if not item:
        return []

    try:
        if item.unit_type == UnitType.PER_100G:
            nutrients = calculate_nutrients(item, weight_g=float(amount))
        else:
            nutrients = calculate_nutrients(item, quantity=float(amount))

        return dbc.Alert(
            [
                html.H5("Calculated Nutrients:", className="alert-heading"),
                html.P(
                    f"Energy: {nutrients.energy_kcal:.1f} kcal | "
                    f"Protein: {nutrients.protein_g:.1f}g | "
                    f"Carbs: {nutrients.carbohydrates_g:.1f}g | "
                    f"Fat: {nutrients.fat_g:.1f}g"
                ),
                html.Small(
                    f"Fibre: {nutrients.fibre_g:.1f}g | "
                    f"Sugar: {nutrients.sugar_g:.1f}g | "
                    f"Sat Fat: {nutrients.saturated_fat_g:.1f}g | "
                    f"Salt: {nutrients.salt_g:.1f}g | "
                    f"Calcium: {nutrients.calcium_mg:.1f}mg"
                ),
            ],
            color="info",
        )
    except Exception:
        return []


@callback(
    [
        Output("persistent-entries", "data"),
        Output("entry-message", "children"),
        Output("food-selector", "value"),
        Output("persistent-morning-weight", "data", allow_duplicate=True),
        Output("persistent-evening-weight", "data", allow_duplicate=True),
    ],
    Input("add-entry-btn", "n_clicks"),
    [
        State("food-selector", "value"),
        State({"type": "food-amount", "index": dash.ALL}, "value"),
        State("persistent-entries", "data"),
        State("persistent-morning-weight", "data"),
        State("persistent-evening-weight", "data"),
    ],
    prevent_initial_call=True,
)
def add_food_entry(n_clicks, food_id, amount_list, current_entries, morning_weight, evening_weight):
    """Add a food entry to the current day and save immediately."""
    if not n_clicks or not food_id:
        raise PreventUpdate

    # Extract amount from list (it will be empty if input doesn't exist)
    amount = amount_list[0] if amount_list and len(amount_list) > 0 else None

    if not amount:
        return (
            no_update,
            dbc.Alert("Please enter an amount", color="warning"),
            no_update,
            no_update,
            no_update,
        )

    item = storage.get_food_item(food_id)
    if not item:
        return (
            no_update,
            dbc.Alert("Food item not found", color="danger"),
            no_update,
            no_update,
            no_update,
        )

    try:
        # Calculate nutrients
        if item.unit_type == UnitType.PER_100G:
            nutrients = calculate_nutrients(item, weight_g=float(amount))
            weight_g = float(amount)
            quantity = None
        else:
            nutrients = calculate_nutrients(item, quantity=float(amount))
            weight_g = None
            quantity = float(amount)

        # Create entry
        entry = FoodEntry(
            timestamp=datetime.now(),
            food_id=item.id,
            food_name=item.name,
            weight_g=weight_g,
            quantity=quantity,
            nutrients=nutrients,
        )

        # Add to current entries
        current_entries.append(entry.model_dump(mode="json"))

        # Save immediately to today's file
        food_entries = [FoodEntry(**e) for e in current_entries]
        daily_data = DailyData(
            date=date.today(),
            entries=food_entries,
            measurements=Measurements(
                morning_weight_kg=morning_weight,
                evening_weight_kg=evening_weight,
            ),
        )
        storage.save_daily_entry(daily_data)

        return (
            current_entries,
            dbc.Alert(f"Added {item.name}", color="success"),
            None,  # Clear food selector (which will remove the amount input)
            morning_weight,  # Save current morning weight to persistent store
            evening_weight,  # Save current evening weight to persistent store
        )
    except Exception as e:
        return (
            no_update,
            dbc.Alert(f"Error adding entry: {str(e)}", color="danger"),
            no_update,
            no_update,
            no_update,
        )


@callback(
    Output("entries-list", "children"),
    [Input("persistent-entries", "data"), Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def update_entries_list(entries, _):
    """Display list of current entries."""
    if not entries:
        return html.P("No entries yet.", className="text-muted")

    return dbc.ListGroup(
        [
            dbc.ListGroupItem(
                [
                    html.Div(
                        [
                            html.Strong(entry["food_name"]),
                            dbc.Badge(
                                f"{entry['weight_g']}g"
                                if entry["weight_g"]
                                else f"{entry['quantity']}x",
                                color="secondary",
                                className="ms-2",
                            ),
                        ]
                    ),
                    html.Small(
                        f"{entry['nutrients']['energy_kcal']:.0f}kcal | "
                        f"P:{entry['nutrients']['protein_g']:.1f}g | "
                        f"C:{entry['nutrients']['carbohydrates_g']:.1f}g | "
                        f"F:{entry['nutrients']['fat_g']:.1f}g",
                        className="text-muted",
                    ),
                    html.Div(
                        [
                            dbc.Button(
                                "Remove",
                                id={"type": "remove-entry", "index": i},
                                color="danger",
                                size="sm",
                                className="mt-2",
                            ),
                        ]
                    ),
                ]
            )
            for i, entry in enumerate(entries)
        ],
        flush=True,
    )


@callback(
    Output("persistent-entries", "data", allow_duplicate=True),
    Input({"type": "remove-entry", "index": dash.ALL}, "n_clicks"),
    [
        State("persistent-entries", "data"),
        State("persistent-morning-weight", "data"),
        State("persistent-evening-weight", "data"),
    ],
    prevent_initial_call=True,
)
def remove_entry(n_clicks, entries, morning_weight, evening_weight):
    """Remove an entry from the list and save immediately."""
    if not any(n_clicks):
        raise PreventUpdate

    # Get the index from the triggered button
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    button_id = ctx.triggered[0]["prop_id"].split(".")[0]
    index = eval(button_id)["index"]

    # Remove the entry
    entries.pop(index)

    # Save immediately to today's file
    food_entries = [FoodEntry(**e) for e in entries]
    daily_data = DailyData(
        date=date.today(),
        entries=food_entries,
        measurements=Measurements(
            morning_weight_kg=morning_weight,
            evening_weight_kg=evening_weight,
        ),
    )
    storage.save_daily_entry(daily_data)

    return entries


@callback(
    Output("daily-totals", "children"),
    [Input("persistent-entries", "data"), Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def update_daily_totals(entries, _):
    """Calculate and display daily totals."""
    if not entries:
        return html.P("No entries to calculate.", className="text-muted")

    # Calculate totals
    totals = {
        "energy_kcal": 0.0,
        "fat_g": 0.0,
        "saturated_fat_g": 0.0,
        "carbohydrates_g": 0.0,
        "sugar_g": 0.0,
        "protein_g": 0.0,
        "fibre_g": 0.0,
        "salt_g": 0.0,
        "calcium_mg": 0.0,
    }

    for entry in entries:
        for nutrient in totals:
            totals[nutrient] += entry["nutrients"][nutrient]

    return [
        dbc.Row(
            [
                dbc.Col(html.Strong("Energy:"), width=6),
                dbc.Col(f"{totals['energy_kcal']:.0f} kcal", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Protein:"), width=6),
                dbc.Col(f"{totals['protein_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Carbohydrates:"), width=6),
                dbc.Col(f"{totals['carbohydrates_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Fat:"), width=6),
                dbc.Col(f"{totals['fat_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Fibre:"), width=6),
                dbc.Col(f"{totals['fibre_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Sugar:"), width=6),
                dbc.Col(f"{totals['sugar_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Saturated Fat:"), width=6),
                dbc.Col(f"{totals['saturated_fat_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Salt:"), width=6),
                dbc.Col(f"{totals['salt_g']:.1f} g", width=6),
            ],
            className="mb-1",
        ),
        dbc.Row(
            [
                dbc.Col(html.Strong("Calcium:"), width=6),
                dbc.Col(f"{totals['calcium_mg']:.0f} mg", width=6),
            ],
        ),
    ]
