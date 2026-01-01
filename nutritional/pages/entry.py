"""Daily entry form page."""

from datetime import date, datetime

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html, no_update
from dash.exceptions import PreventUpdate

from nutritional.auth_utils import (
    get_access_denied_layout,
    get_current_user_email,
    is_authorized,
)
from nutritional.data_entry.calculator import calculate_nutrients
from nutritional.data_entry.models import (
    DailyData,
    DailyTargets,
    FoodEntry,
    Measurements,
    TargetMode,
    UnitType,
)
from nutritional.data_entry.storage_factory import get_storage

dash.register_page(__name__, path="/entry", title="Daily Entry")

storage = get_storage()


def get_entry_layout():
    """Return the entry form layout."""
    return dbc.Container(
        [
            # Hidden trigger to reload data when page is visited
            html.Div(id="page-load-trigger", className="hidden"),
            # Unified Daily Log Header
            html.Div(
                [
                    html.Div(
                        [
                            html.H1(id="current-date-display", className="margin-bottom-0"),
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
                                        className="food-selector-full-width",
                                    ),
                                ],
                                className="action-row action-row-flex",
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
                                className="hidden",
                            ),
                            # Receipt-style List
                            html.Div(
                                id="entries-list",
                                className="receipt-list mt-3",
                            ),
                            # Inline Totals (thin footer style)
                            html.Div(
                                [
                                    html.Div(
                                        [
                                            html.Div(id="daily-totals-inline"),
                                            html.Div(
                                                [
                                                    dbc.Button(
                                                        "Edit Targets",
                                                        id="open-targets-modal",
                                                        color="link",
                                                        size="sm",
                                                        className="mt-2",
                                                    ),
                                                ],
                                                style={"textAlign": "center"},
                                            ),
                                        ],
                                    ),
                                ],
                                className="mt-3",
                            ),
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
                                                                        className="form-label-sm",
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
                                                                        className="form-label-sm",
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
                                        className="card-padding",
                                    ),
                                ],
                                className="card-border",
                            ),
                        ],
                        width=12,
                        lg=4,
                    ),
                ]
            ),
            # Targets Editor Modal
            dbc.Modal(
                [
                    dbc.ModalHeader(dbc.ModalTitle("Edit Daily Targets")),
                    dbc.ModalBody(
                        [
                            html.Div(
                                [
                                    html.P(
                                        "Set your daily nutritional targets. Toggle "
                                        "between Target (goal to reach) and Limit "
                                        "(maximum to stay under) for each nutrient.",
                                        className="text-muted mb-3",
                                    ),
                                    # Two-column layout for inputs
                                    dbc.Row(
                                        [
                                            # Left column
                                            dbc.Col(
                                                [
                                                    html.Div(
                                                        [
                                                            html.Label("Calories (kcal)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-energy",
                                                                        type="number",
                                                                        min=0,
                                                                        step=10,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-energy",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Protein (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-protein",
                                                                        type="number",
                                                                        min=0,
                                                                        step=1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-protein",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Carbohydrates (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-carbohydrates",
                                                                        type="number",
                                                                        min=0,
                                                                        step=1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-carbohydrates",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Fat (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-fat",
                                                                        type="number",
                                                                        min=0,
                                                                        step=1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-fat",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Fibre (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-fibre",
                                                                        type="number",
                                                                        min=0,
                                                                        step=1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-fibre",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                ],
                                                md=6,
                                            ),
                                            # Right column
                                            dbc.Col(
                                                [
                                                    html.Div(
                                                        [
                                                            html.Label("Sugar (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-sugar",
                                                                        type="number",
                                                                        min=0,
                                                                        step=1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-sugar",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Saturated Fat (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-saturated-fat",
                                                                        type="number",
                                                                        min=0,
                                                                        step=1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-saturated-fat",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Salt (g)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-salt",
                                                                        type="number",
                                                                        min=0,
                                                                        step=0.1,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-salt",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                    html.Div(
                                                        [
                                                            html.Label("Calcium (mg)"),
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="target-calcium",
                                                                        type="number",
                                                                        min=0,
                                                                        step=10,
                                                                    ),
                                                                    dbc.Select(
                                                                        id="mode-calcium",
                                                                        options=[
                                                                            {
                                                                                "label": "Target",
                                                                                "value": "target",
                                                                            },
                                                                            {
                                                                                "label": "Limit",
                                                                                "value": "limit",
                                                                            },
                                                                        ],
                                                                    ),
                                                                ],
                                                                className="mb-3",
                                                            ),
                                                        ]
                                                    ),
                                                ],
                                                md=6,
                                            ),
                                        ]
                                    ),
                                ]
                            ),
                        ]
                    ),
                    dbc.ModalFooter(
                        [
                            dbc.Button(
                                "Copy from Previous Day",
                                id="copy-previous-targets",
                                color="secondary",
                                className="me-auto",
                            ),
                            dbc.Button("Cancel", id="close-targets-modal", className="ms-1"),
                            dbc.Button(
                                "Save Targets", id="save-targets", color="primary", className="ms-1"
                            ),
                        ]
                    ),
                ],
                id="targets-modal",
                size="lg",
                is_open=False,
            ),
        ],
        fluid=True,
        className="page-content page-max-width-1200",
    )


# Set layout based on authorization
def layout():
    """Return layout based on user authorization."""
    if is_authorized():
        return get_entry_layout()
    return get_access_denied_layout(get_current_user_email())


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
                    f"Protein: {nutrients.protein_g:.1f} g | "
                    f"Carbs: {nutrients.carbohydrates_g:.1f} g | "
                    f"Fat: {nutrients.fat_g:.1f} g"
                ),
                html.Small(
                    f"Fibre: {nutrients.fibre_g:.1f} g | "
                    f"Sugar: {nutrients.sugar_g:.1f} g | "
                    f"Sat Fat: {nutrients.saturated_fat_g:.1f} g | "
                    f"Salt: {nutrients.salt_g:.1f} g | "
                    f"Calcium: {nutrients.calcium_mg:.1f} mg"
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
                            f"{entry['nutrients']['energy_kcal']:.0f} kcal",
                            className="macro-badge badge-calories",
                            title="Calories",
                        ),
                        html.Span(
                            f"{entry['nutrients']['protein_g']:.1f} g Protein",
                            className="macro-badge badge-protein",
                            title="Protein",
                        ),
                        html.Span(
                            f"{entry['nutrients']['carbohydrates_g']:.1f} g Carbs",
                            className="macro-badge badge-carbs",
                            title="Carbohydrates",
                        ),
                        html.Span(
                            f"{entry['nutrients']['fat_g']:.1f} g Fat",
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
    # Load targets for today
    targets = storage.get_or_create_daily_targets(date.today())

    if not entries:
        compact_summary = html.Span(f"0 / {targets.energy_kcal:.0f} kcal", className="text-muted")
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
                f"{totals['energy_kcal']:.0f} / {targets.energy_kcal:.0f} kcal",
                className="summary-item",
                style={"fontWeight": "600", "color": "var(--text-main)"},
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['protein_g']:.1f} g Protein",
                className="summary-item",
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['carbohydrates_g']:.1f} g Carbs",
                className="summary-item",
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['fat_g']:.1f} g Fat",
                className="summary-item",
            ),
        ]
    )

    def create_thin_progress_bar(label, value, target, css_class, mode="target", unit="g"):
        """Create a thin, modern progress bar with visual feedback."""
        percentage = min((value / target * 100), 100) if target > 0 else 0

        # Format values
        if unit == "kcal":
            value_str = f"{value:.0f}"
            target_str = f"{target:.0f}"
        elif unit == "mg":
            value_str = f"{value:.0f} mg"
            target_str = f"{target:.0f} mg"
        else:
            value_str = f"{value:.1f} g"
            target_str = f"{target:.0f} g"

        # Determine visual indicator
        indicator = None
        if mode == "limit":
            # Limit mode - show warnings when exceeding
            if value > target * 1.1:
                indicator = html.Span("⚠️", className="target-exceeded", title="Limit exceeded")
            elif value > target:
                indicator = html.Span("⚠️", className="target-warning", title="Near limit")
        else:
            # Target mode - show checkmark when met
            if value >= target:
                indicator = html.Span("✓", className="target-met", title="Target met")

        return html.Div(
            [
                html.Div(
                    [
                        html.Span(label, className="progress-label"),
                        html.Div(
                            [
                                html.Span(
                                    f"{value_str} / {target_str}",
                                    className="progress-value",
                                ),
                                indicator if indicator else None,
                            ],
                            style={"display": "flex", "gap": "6px", "alignItems": "center"},
                        ),
                    ],
                    className="progress-header",
                ),
                dbc.Progress(
                    value=percentage,
                    className=css_class,
                    style={"height": "4px"},
                ),
            ],
            style={"marginBottom": "16px"},
        )

    # Inline Totals with all 9 nutrients as progress bars
    inline_totals = html.Div(
        [
            html.Div(
                [
                    html.Div(
                        [
                            # Left column - macros
                            html.Div(
                                [
                                    create_thin_progress_bar(
                                        "Calories",
                                        totals["energy_kcal"],
                                        targets.energy_kcal,
                                        "progress-calories",
                                        mode=targets.get_nutrient_mode("energy").value,
                                        unit="kcal",
                                    ),
                                    create_thin_progress_bar(
                                        "Protein",
                                        totals["protein_g"],
                                        targets.protein_g,
                                        "progress-protein",
                                        mode=targets.get_nutrient_mode("protein").value,
                                    ),
                                    create_thin_progress_bar(
                                        "Carbs",
                                        totals["carbohydrates_g"],
                                        targets.carbohydrates_g,
                                        "progress-carbs",
                                        mode=targets.get_nutrient_mode("carbohydrates").value,
                                    ),
                                    create_thin_progress_bar(
                                        "Fat",
                                        totals["fat_g"],
                                        targets.fat_g,
                                        "progress-fat",
                                        mode=targets.get_nutrient_mode("fat").value,
                                    ),
                                    create_thin_progress_bar(
                                        "Fibre",
                                        totals["fibre_g"],
                                        targets.fibre_g,
                                        "progress-fibre",
                                        mode=targets.get_nutrient_mode("fibre").value,
                                    ),
                                ],
                                style={"flex": "1"},
                            ),
                            # Right column - sugars, fats, minerals
                            html.Div(
                                [
                                    create_thin_progress_bar(
                                        "Sugar",
                                        totals["sugar_g"],
                                        targets.sugar_g,
                                        "progress-sugar",
                                        mode=targets.get_nutrient_mode("sugar").value,
                                    ),
                                    create_thin_progress_bar(
                                        "Saturated Fat",
                                        totals["saturated_fat_g"],
                                        targets.saturated_fat_g,
                                        "progress-saturated-fat",
                                        mode=targets.get_nutrient_mode("saturated_fat").value,
                                    ),
                                    create_thin_progress_bar(
                                        "Salt",
                                        totals["salt_g"],
                                        targets.salt_g,
                                        "progress-salt",
                                        mode=targets.get_nutrient_mode("salt").value,
                                    ),
                                    create_thin_progress_bar(
                                        "Calcium",
                                        totals["calcium_mg"],
                                        targets.calcium_mg,
                                        "progress-calcium",
                                        mode=targets.get_nutrient_mode("calcium").value,
                                        unit="mg",
                                    ),
                                ],
                                style={"flex": "1"},
                            ),
                        ],
                        style={
                            "display": "flex",
                            "gap": "24px",
                            "flexWrap": "wrap",
                        },
                    ),
                ],
                style={
                    "padding": "16px",
                    "background": "var(--surface)",
                    "border": "1px solid var(--border)",
                    "borderRadius": "8px",
                },
            ),
        ],
    )

    return compact_summary, inline_totals


# Targets Modal Callbacks
@callback(
    Output("targets-modal", "is_open"),
    [
        Input("open-targets-modal", "n_clicks"),
        Input("close-targets-modal", "n_clicks"),
        Input("save-targets", "n_clicks"),
    ],
    [State("targets-modal", "is_open")],
    prevent_initial_call=True,
)
def toggle_targets_modal(open_clicks, close_clicks, save_clicks, is_open):
    """Toggle the targets editor modal."""
    return not is_open


@callback(
    [
        Output("target-energy", "value"),
        Output("target-protein", "value"),
        Output("target-carbohydrates", "value"),
        Output("target-fat", "value"),
        Output("target-sugar", "value"),
        Output("target-saturated-fat", "value"),
        Output("target-fibre", "value"),
        Output("target-salt", "value"),
        Output("target-calcium", "value"),
        Output("mode-energy", "value"),
        Output("mode-protein", "value"),
        Output("mode-carbohydrates", "value"),
        Output("mode-fat", "value"),
        Output("mode-sugar", "value"),
        Output("mode-saturated-fat", "value"),
        Output("mode-fibre", "value"),
        Output("mode-salt", "value"),
        Output("mode-calcium", "value"),
    ],
    [Input("open-targets-modal", "n_clicks"), Input("copy-previous-targets", "n_clicks")],
    prevent_initial_call=True,
)
def load_targets_into_modal(open_clicks, copy_clicks):
    """Load current or previous day's targets into the modal."""
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    if trigger_id == "copy-previous-targets":
        # Get previous day's targets
        targets = storage.get_previous_day_targets(date.today())
        if not targets:
            targets = storage.get_or_create_daily_targets(date.today())
    else:
        # Load today's targets
        targets = storage.get_or_create_daily_targets(date.today())

    return (
        targets.energy_kcal,
        targets.protein_g,
        targets.carbohydrates_g,
        targets.fat_g,
        targets.sugar_g,
        targets.saturated_fat_g,
        targets.fibre_g,
        targets.salt_g,
        targets.calcium_mg,
        targets.get_nutrient_mode("energy").value,
        targets.get_nutrient_mode("protein").value,
        targets.get_nutrient_mode("carbohydrates").value,
        targets.get_nutrient_mode("fat").value,
        targets.get_nutrient_mode("sugar").value,
        targets.get_nutrient_mode("saturated_fat").value,
        targets.get_nutrient_mode("fibre").value,
        targets.get_nutrient_mode("salt").value,
        targets.get_nutrient_mode("calcium").value,
    )


@callback(
    Output("daily-totals-inline", "children", allow_duplicate=True),
    Input("save-targets", "n_clicks"),
    [
        State("target-energy", "value"),
        State("target-protein", "value"),
        State("target-carbohydrates", "value"),
        State("target-fat", "value"),
        State("target-sugar", "value"),
        State("target-saturated-fat", "value"),
        State("target-fibre", "value"),
        State("target-salt", "value"),
        State("target-calcium", "value"),
        State("mode-energy", "value"),
        State("mode-protein", "value"),
        State("mode-carbohydrates", "value"),
        State("mode-fat", "value"),
        State("mode-sugar", "value"),
        State("mode-saturated-fat", "value"),
        State("mode-fibre", "value"),
        State("mode-salt", "value"),
        State("mode-calcium", "value"),
    ],
    prevent_initial_call=True,
)
def save_targets_to_storage(
    n_clicks,
    energy,
    protein,
    carbs,
    fat,
    sugar,
    sat_fat,
    fibre,
    salt,
    calcium,
    mode_energy,
    mode_protein,
    mode_carbs,
    mode_fat,
    mode_sugar,
    mode_sat_fat,
    mode_fibre,
    mode_salt,
    mode_calcium,
):
    """Save targets to storage and refresh display."""
    if not n_clicks:
        raise PreventUpdate

    # Create and save targets
    targets = DailyTargets(
        date=date.today(),
        energy_kcal=float(energy),
        protein_g=float(protein),
        carbohydrates_g=float(carbs),
        fat_g=float(fat),
        sugar_g=float(sugar),
        saturated_fat_g=float(sat_fat),
        fibre_g=float(fibre),
        salt_g=float(salt),
        calcium_mg=float(calcium),
        energy_mode=TargetMode(mode_energy),
        protein_mode=TargetMode(mode_protein),
        carbohydrates_mode=TargetMode(mode_carbs),
        fat_mode=TargetMode(mode_fat),
        sugar_mode=TargetMode(mode_sugar),
        saturated_fat_mode=TargetMode(mode_sat_fat),
        fibre_mode=TargetMode(mode_fibre),
        salt_mode=TargetMode(mode_salt),
        calcium_mode=TargetMode(mode_calcium),
    )

    storage.save_daily_targets(targets)

    # Trigger a refresh by returning no_update (the other callback will handle the display)
    return no_update
