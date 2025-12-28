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
        # Unified Daily Log Header
        html.Div(
            [
                html.Div(
                    [
                        html.H1(id="current-date-display", style={"marginBottom": "0"}),
                    ],
                    className="daily-header-left",
                ),
                html.Div(
                    id="daily-summary-compact",
                    className="daily-summary-bar",
                ),
            ],
            className="daily-header",
        ),
        # Main Content Area
        dbc.Row(
            [
                # Main Journal Column
                dbc.Col(
                    [
                        # Action Row - Search/Add Food
                        html.Div(
                            [
                                dcc.Dropdown(
                                    id="food-selector",
                                    placeholder="🔍 Search foods...",
                                    searchable=True,
                                    style={"flex": "1"},
                                ),
                            ],
                            className="action-row",
                            style={"display": "flex", "gap": "12px", "alignItems": "center"},
                        ),
                        # Inline Amount Input (appears when food selected)
                        html.Div(id="food-input-container"),
                        # Calculated nutrients preview
                        html.Div(id="calculated-nutrients", className="mt-2"),
                        # Add button and message
                        html.Div(
                            [
                                dbc.Button(
                                    "Add Entry",
                                    id="add-entry-btn",
                                    color="primary",
                                    size="sm",
                                    className="mt-2",
                                ),
                                html.Div(id="entry-message", className="mt-2"),
                            ],
                            id="add-controls-container",
                            style={"display": "none"},
                        ),
                        # Receipt-style List
                        html.Div(
                            id="entries-list",
                            className="receipt-list mt-3",
                        ),
                        # Inline Totals (thin footer style)
                        html.Div(id="daily-totals-inline", className="mt-3"),
                    ],
                    width=12,
                    lg=8,
                ),
                # Sidebar - Body Weight (Collapsed/Secondary)
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardBody(
                                    [
                                        html.Div("BODY WEIGHT", className="section-label"),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        html.Div(
                                                            [
                                                                html.Label(
                                                                    "Morning (kg)",
                                                                    style={
                                                                        "fontSize": "12px",
                                                                        "color": "var(--text-muted)",  # noqa: E501
                                                                        "marginBottom": "4px",
                                                                    },
                                                                ),
                                                                dbc.Input(
                                                                    id="morning-weight",
                                                                    type="number",
                                                                    min=0,
                                                                    step=0.1,
                                                                    size="sm",
                                                                ),
                                                            ],
                                                            className="compact-input",
                                                        ),
                                                    ],
                                                    width=12,
                                                    className="mb-2",
                                                ),
                                                dbc.Col(
                                                    [
                                                        html.Div(
                                                            [
                                                                html.Label(
                                                                    "Evening (kg)",
                                                                    style={
                                                                        "fontSize": "12px",
                                                                        "color": "var(--text-muted)",  # noqa: E501
                                                                        "marginBottom": "4px",
                                                                    },
                                                                ),
                                                                dbc.Input(
                                                                    id="evening-weight",
                                                                    type="number",
                                                                    min=0,
                                                                    step=0.1,
                                                                    size="sm",
                                                                ),
                                                            ],
                                                            className="compact-input",
                                                        ),
                                                    ],
                                                    width=12,
                                                ),
                                            ]
                                        ),
                                    ],
                                    style={"padding": "16px"},
                                ),
                            ],
                            style={"border": "1px solid var(--border)"},
                        ),
                    ],
                    width=12,
                    lg=4,
                ),
            ]
        ),
    ],
    fluid=True,
    className="page-content",
    style={"maxWidth": "1200px"},
)


# Display current date in header format
@callback(
    Output("current-date-display", "children"),
    Input("page-load-trigger", "children"),
)
def display_current_date(_):
    """Display the current date in header format."""
    return date.today().strftime("%A, %B %d")


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
    [Output("food-input-container", "children"), Output("add-controls-container", "style")],
    Input("food-selector", "value"),
)
def update_input_fields(food_id):
    """Update input fields based on selected food item and show add controls."""
    if not food_id:
        return [], {"display": "none"}

    item = storage.get_food_item(food_id)
    if not item:
        return [], {"display": "none"}

    if item.unit_type == UnitType.PER_100G:
        input_fields = html.Div(
            [
                dbc.Input(
                    id={"type": "food-amount", "index": 0},
                    type="number",
                    min=0,
                    step=0.1,
                    placeholder="Enter weight in grams",
                    size="sm",
                    style={"marginTop": "8px"},
                ),
            ],
        )
    else:  # PER_ITEM
        input_fields = html.Div(
            [
                dbc.Input(
                    id={"type": "food-amount", "index": 0},
                    type="number",
                    min=0,
                    step=0.1,
                    placeholder=f"Enter quantity (1 item = {item.serving_size_g}g)",
                    size="sm",
                    style={"marginTop": "8px"},
                ),
            ],
        )

    return input_fields, {"display": "block"}


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
    """Display list of current entries with receipt-style layout."""
    if not entries:
        return html.Div(
            html.P(
                "No entries yet. Search for a food above to get started.",
                className="text-muted",
                style={"textAlign": "center", "padding": "24px"},
            ),
            style={
                "border": "1px solid var(--border)",
                "borderRadius": "8px",
                "background": "var(--surface)",
            },
        )

    return [
        html.Div(
            [
                html.Div(
                    [
                        html.Strong(entry["food_name"], style={"fontSize": "15px"}),
                        html.Span(
                            f" · {entry['weight_g']:.1f}g"
                            if entry["weight_g"]
                            else f" · {entry['quantity']:.1f}x",
                            style={
                                "color": "var(--text-muted)",
                                "fontSize": "14px",
                            },
                        ),
                    ],
                    style={"flex": "1"},
                ),
                html.Div(
                    [
                        html.Span(
                            f"{entry['nutrients']['energy_kcal']:.0f}",
                            className="macro-badge badge-calories",
                            title="Calories",
                        ),
                        html.Span(
                            f"{entry['nutrients']['protein_g']:.1f}g P",
                            className="macro-badge badge-protein",
                            title="Protein",
                        ),
                        html.Span(
                            f"{entry['nutrients']['carbohydrates_g']:.1f}g C",
                            className="macro-badge badge-carbs",
                            title="Carbohydrates",
                        ),
                        html.Span(
                            f"{entry['nutrients']['fat_g']:.1f}g F",
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
                html.Span(
                    "×",
                    className="delete-icon",
                    id={"type": "remove-entry", "index": i},
                    n_clicks=0,
                    title="Remove",
                ),
            ],
            className="receipt-item",
        )
        for i, entry in enumerate(entries)
    ]


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
    [Output("daily-summary-compact", "children"), Output("daily-totals-inline", "children")],
    [Input("persistent-entries", "data"), Input("page-load-trigger", "children")],
    prevent_initial_call=False,
)
def update_daily_totals(entries, _):
    """Calculate and display daily totals in both compact header and inline footer."""
    if not entries:
        compact_summary = html.Span("0 / 2000 kcal", className="text-muted")
        inline_totals = None
        return compact_summary, inline_totals

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

    # Compact Summary for Header
    compact_summary = html.Div(
        [
            html.Span(
                f"{totals['energy_kcal']:.0f} / 2000 kcal",
                className="summary-item",
                style={"fontWeight": "600", "color": "var(--text-main)"},
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['protein_g']:.1f}g P",
                className="summary-item",
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['carbohydrates_g']:.1f}g C",
                className="summary-item",
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['fat_g']:.1f}g F",
                className="summary-item",
            ),
        ]
    )

    # Define daily targets
    targets = {
        "energy_kcal": 2000,
        "protein_g": 150,
        "carbohydrates_g": 225,
        "fat_g": 67,
    }

    def create_thin_progress_bar(label, value, target, css_class):
        """Create a thin, modern progress bar."""
        percentage = min((value / target * 100), 100) if target > 0 else 0
        value_str = f"{value:.0f}" if "kcal" in label.lower() else f"{value:.1f}g"
        target_str = f"{target:.0f}" if "kcal" in label.lower() else f"{target:.0f}g"

        return html.Div(
            [
                html.Div(
                    [
                        html.Span(label, className="progress-label", style={"fontSize": "13px"}),
                        html.Span(
                            f"{value_str} / {target_str}",
                            className="progress-value",
                            style={"fontSize": "12px"},
                        ),
                    ],
                    className="progress-header",
                    style={"marginBottom": "6px"},
                ),
                dbc.Progress(
                    value=percentage,
                    className=css_class,
                    style={"height": "4px"},
                ),
            ],
            style={"marginBottom": "16px"},
        )

    # Inline Totals (Thin Progress Bars + Secondary Nutrients)
    inline_totals = html.Div(
        [
            html.Div(
                [
                    create_thin_progress_bar(
                        "Calories",
                        totals["energy_kcal"],
                        targets["energy_kcal"],
                        "progress-calories",
                    ),
                    create_thin_progress_bar(
                        "Protein",
                        totals["protein_g"],
                        targets["protein_g"],
                        "progress-protein",
                    ),
                    create_thin_progress_bar(
                        "Carbs",
                        totals["carbohydrates_g"],
                        targets["carbohydrates_g"],
                        "progress-carbs",
                    ),
                    create_thin_progress_bar(
                        "Fat",
                        totals["fat_g"],
                        targets["fat_g"],
                        "progress-fat",
                    ),
                ],
                style={
                    "padding": "16px",
                    "background": "var(--surface)",
                    "border": "1px solid var(--border)",
                    "borderRadius": "8px",
                    "marginBottom": "12px",
                },
            ),
            html.Div(
                [
                    html.Div(
                        "ADDITIONAL NUTRIENTS",
                        className="section-label",
                        style={"marginBottom": "8px"},
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
                                        f"{totals['fibre_g']:.1f}g",
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
                                        f"{totals['sugar_g']:.1f}g",
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
                                        f"{totals['saturated_fat_g']:.1f}g",
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
                                        f"{totals['salt_g']:.1f}g",
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
                style={"marginTop": "8px"},
            ),
        ],
    )

    return compact_summary, inline_totals
