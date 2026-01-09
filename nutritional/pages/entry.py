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
from nutritional.data_entry.sqlmodel_storage import SQLModelStorage

dash.register_page(__name__, path="/entry", title="Daily Entry")

storage = SQLModelStorage()


def get_entry_layout():
    """Return the entry form layout."""
    return dbc.Container(
        [
            # Hidden trigger to reload data when page is visited
            html.Div(id="page-load-trigger", className="hidden"),
            # Store to trigger refresh when targets are updated
            dcc.Store(id="targets-updated-trigger", data=0),
            # Unified Daily Log Header
            html.Div(
                [
                    html.Div(
                        [
                            html.H1(id="current-date-display", className="margin-bottom-0"),
                            dcc.DatePickerSingle(
                                id="entry-date-picker",
                                date=date.today(),
                                display_format="YYYY-MM-DD",
                                max_date_allowed=date.today(),
                                style={"marginBottom": "0", "display": "inline-block"},
                            ),
                        ],
                        className="daily-header-left",
                    ),
                    html.Div(
                        [
                            html.Div(
                                id="daily-summary-compact",
                                className="daily-summary-bar",
                                style={"flex": "1"},
                            ),
                            dbc.Button(
                                "Edit Targets",
                                id="open-targets-modal",
                                color="secondary",
                                size="sm",
                                className="ms-3",
                            ),
                        ],
                        style={"display": "flex", "alignItems": "center", "gap": "12px"},
                        className="daily-summary-bar",
                    ),
                ],
                className="daily-header",
            ),
            # Main Content Area - Mise-en-place 3-Column Layout
            html.Div(
                [
                    # Column 1: The Ingredients (25%)
                    html.Div(
                        [
                            html.Div("Food", className="section-label"),
                            # Action Row - Search/Add Food
                            html.Div(
                                [
                                    dcc.Dropdown(
                                        id="food-selector",
                                        placeholder="Search foods...",
                                        searchable=True,
                                        className="food-selector-full-width",
                                    ),
                                ],
                                className="action-row action-row-flex",
                                style={"marginBottom": "0px"},
                            ),
                            # Inline Amount Input (appears when food selected)
                            html.Div(id="food-input-container", style={"marginBottom": "0px"}),
                            # Calculated nutrients preview
                            html.Div(id="calculated-nutrients"),
                            # Entry message
                            html.Div(id="entry-message"),
                            # Ingredient List (only name, weight, calories)
                            html.Div(
                                id="entries-list",
                                className="ingredients-list",
                            ),
                        ],
                        className="mise-ingredients-column",
                    ),
                    # Column 2: The Summary (50%)
                    html.Div(
                        [
                            html.Div("TODAY'S INTAKE", className="section-label"),
                            # Calories Remaining Card
                            html.Div(
                                [
                                    html.Div(
                                        "Calories Remaining",
                                        className="calories-remaining-label",
                                    ),
                                    html.Div(
                                        id="calories-remaining-display",
                                        className="calories-remaining-number",
                                    ),
                                    html.Div(
                                        id="calorie-status",
                                        className="calorie-status-indicator",
                                    ),
                                ],
                                className="calories-remaining-card",
                            ),
                            # Macronutrient Visualization
                            html.Div(
                                [
                                    html.Div(id="daily-macros-display", className="macros-bars"),
                                ],
                                className="macros-visualization",
                            ),
                        ],
                        className="mise-summary-column",
                    ),
                    # Column 3: The Logbook (25%)
                    html.Div(
                        [
                            html.Div("BODY MEASUREMENTS", className="section-label"),
                            dbc.Card(
                                [
                                    dbc.CardBody(
                                        [
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Morning Weight (kg)",
                                                        className="weight-input-group label",
                                                    ),
                                                    dbc.Input(
                                                        id="morning-weight",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="e.g. 75.5",
                                                    ),
                                                ],
                                                className="weight-input-group",
                                                style={"marginBottom": "12px"},
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Evening Weight (kg)",
                                                        className="weight-input-group label",
                                                    ),
                                                    dbc.Input(
                                                        id="evening-weight",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="e.g. 76.2",
                                                    ),
                                                ],
                                                className="weight-input-group",
                                            ),
                                            # Weight trend sparkline
                                        ],
                                        className="card-padding",
                                    ),
                                ],
                                className="card-border",
                            ),
                        ],
                        className="mise-logbook-column",
                    ),
                ],
                className="mise-en-place-container",
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
                                                ],
                                                md=6,
                                            ),
                                            # Right column
                                            dbc.Col(
                                                [
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
    Output("selected-date-store", "data"),
    Input("entry-date-picker", "date"),
)
def update_selected_date(selected_date):
    """Update selected date store when date picker changes."""
    if selected_date is None:
        return date.today().isoformat()
    return selected_date


@callback(
    Output("current-date-display", "children"),
    Input("selected-date-store", "data"),
)
def display_current_date(selected_date_str):
    """Display selected date in header format."""
    if selected_date_str is None:
        selected_date = date.today()
    else:
        selected_date = date.fromisoformat(selected_date_str)
    return selected_date.strftime("%A, %B %d")


# Load entries from file for selected date
@callback(
    [
        Output("persistent-entries", "data", allow_duplicate=True),
        Output("persistent-morning-weight", "data", allow_duplicate=True),
        Output("persistent-evening-weight", "data", allow_duplicate=True),
    ],
    [
        Input("page-load-trigger", "children"),
        Input("selected-date-store", "data"),
    ],
    prevent_initial_call=True,
)
def load_todays_entries(_, selected_date_str):
    """Load entries for selected date from file."""
    if selected_date_str is None:
        selected_date = date.today()
    else:
        selected_date = date.fromisoformat(selected_date_str)

    daily_data = storage.load_daily_entry(selected_date)

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
    Input("persistent-morning-weight", "data"),
    prevent_initial_call=False,
)
def load_morning_weight(weight):
    """Load morning weight from persistent store."""
    return weight


@callback(
    Output("evening-weight", "value"),
    Input("persistent-evening-weight", "data"),
    prevent_initial_call=False,
)
def load_evening_weight(weight):
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
    """Update input fields based on selected food item and show add controls."""
    if not food_id:
        return []

    item = storage.get_food_item(food_id)
    if not item:
        return []

    if item.unit_type == UnitType.PER_100G:
        input_fields = html.Div(
            [
                dbc.InputGroup(
                    [
                        dbc.Input(
                            id={"type": "food-amount", "index": 0},
                            type="number",
                            min=0,
                            step=0.1,
                            placeholder="Enter weight in grams",
                            size="sm",
                        ),
                        dbc.Button(
                            "Add Entry",
                            id="add-entry-btn",
                            color="primary",
                            size="sm",
                        ),
                    ],
                    style={"marginTop": "8px"},
                ),
            ],
        )
    else:  # PER_ITEM
        input_fields = html.Div(
            [
                dbc.InputGroup(
                    [
                        dbc.Input(
                            id={"type": "food-amount", "index": 0},
                            type="number",
                            min=0,
                            step=0.1,
                            placeholder=f"Enter quantity (1 item = {item.serving_size_g}g)",
                            size="sm",
                        ),
                        dbc.Button(
                            "Add Entry",
                            id="add-entry-btn",
                            color="primary",
                            size="sm",
                        ),
                    ],
                    style={"marginTop": "8px"},
                ),
            ],
        )

    return input_fields


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

        # Create styled nutrient display
        nutrient_data = [
            ("Energy", f"{nutrients.energy_kcal:.1f}", "kcal", "#2B2B2B"),
            ("Fat", f"{nutrients.fat_g:.1f}", "g", "#BF6B59"),
            ("Saturated Fat", f"{nutrients.saturated_fat_g:.1f}", "g", "#E09F91"),
            ("Carbohydrates", f"{nutrients.carbohydrates_g:.1f}", "g", "#C8963E"),
            ("Sugar", f"{nutrients.sugar_g:.1f}", "g", "#EBC374"),
            ("Protein", f"{nutrients.protein_g:.1f}", "g", "#2C4C5B"),
            ("Fibre", f"{nutrients.fibre_g:.1f}", "g", "#4F6D46"),
            ("Salt", f"{nutrients.salt_g:.1f}", "g", "#7C6A88"),
            ("Calcium", f"{nutrients.calcium_mg:.1f}", "mg", "#6B7F82"),
        ]

        nutrient_items = []
        for name, value, unit, color in nutrient_data:
            nutrient_items.append(
                html.Div(
                    [
                        html.Span(
                            "",
                            style={
                                "display": "inline-block",
                                "width": "12px",
                                "height": "12px",
                                "borderRadius": "50%",
                                "backgroundColor": color,
                                "marginRight": "8px",
                                "flexShrink": "0",
                            },
                        ),
                        html.Span(
                            f"{name}: {value} {unit}",
                            style={
                                "color": "var(--text-main)",
                                "fontFamily": "var(--font-mono)",
                                "fontWeight": "500",
                            },
                        ),
                    ],
                    style={
                        "display": "flex",
                        "alignItems": "center",
                        "marginBottom": "6px",
                    },
                )
            )

        return html.Div(
            nutrient_items,
            style={
                "backgroundColor": "var(--surface)",
                "border": "1px solid var(--border)",
                "borderRadius": "var(--radius-md)",
                "padding": "16px",
                "boxShadow": "var(--shadow-sm)",
            },
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
        State("selected-date-store", "data"),
    ],
    prevent_initial_call=True,
)
def add_food_entry(
    n_clicks,
    food_id,
    amount_list,
    current_entries,
    morning_weight,
    evening_weight,
    selected_date_str,
):
    """Add a food entry to the selected day and save immediately."""
    if not n_clicks or not food_id:
        raise PreventUpdate

    # Parse selected date
    if selected_date_str is None:
        entry_date = date.today()
    else:
        entry_date = date.fromisoformat(selected_date_str)

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

        # Save immediately to selected day
        food_entries = [FoodEntry(**e) for e in current_entries]
        daily_data = DailyData(
            date=entry_date,
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
    """Display list of current entries with clean ingredient format (no macro pills)."""
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
                        html.Div(
                            entry["food_name"],
                            className="ingredient-name",
                        ),
                        html.Div(
                            f"{entry['weight_g']:.1f}g"
                            if entry["weight_g"]
                            else f"{entry['quantity']:.1f}x",
                            className="ingredient-weight",
                        ),
                    ],
                    className="ingredient-item-header",
                ),
                html.Span(
                    f"{entry['nutrients']['energy_kcal']:.0f} kcal",
                    className="ingredient-calories",
                    title="Calories",
                ),
                html.Span(
                    "×",
                    className="delete-icon",
                    id={"type": "remove-entry", "index": i},
                    n_clicks=0,
                    title="Remove",
                    style={
                        "cursor": "pointer",
                        "gridColumn": "3 / 4",
                        "gridRow": "1 / 2",
                        "display": "flex",
                        "alignItems": "center",
                        "justifyContent": "center",
                    },
                ),
            ],
            className="ingredient-item",
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
        State("selected-date-store", "data"),
    ],
    prevent_initial_call=True,
)
def remove_entry(n_clicks, entries, morning_weight, evening_weight, selected_date_str):
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

    # Parse selected date
    if selected_date_str is None:
        entry_date = date.today()
    else:
        entry_date = date.fromisoformat(selected_date_str)

    # Save immediately to selected day
    food_entries = [FoodEntry(**e) for e in entries]
    daily_data = DailyData(
        date=entry_date,
        entries=food_entries,
        measurements=Measurements(
            morning_weight_kg=morning_weight,
            evening_weight_kg=evening_weight,
        ),
    )
    storage.save_daily_entry(daily_data)

    return entries


@callback(
    [
        Output("calories-remaining-display", "children"),
        Output("calories-remaining-display", "className"),
        Output("calorie-status", "children"),
    ],
    [
        Input("persistent-entries", "data"),
        Input("page-load-trigger", "children"),
        Input("targets-updated-trigger", "data"),
    ],
    State("selected-date-store", "data"),
    prevent_initial_call=False,
)
def update_calories_remaining(entries, _, __, selected_date_str):
    """Display calories remaining in large, prominent format."""
    # Parse selected date
    if selected_date_str is None:
        current_date = date.today()
    else:
        current_date = date.fromisoformat(selected_date_str)

    # Load targets for selected day
    targets = storage.get_or_create_daily_targets(current_date)

    # Calculate consumed calories
    consumed_calories = 0.0
    if entries:
        for entry in entries:
            consumed_calories += entry["nutrients"]["energy_kcal"]

    # Calculate remaining
    remaining = targets.energy_kcal - consumed_calories

    # Determine display class and status message
    if remaining < 0:
        display_class = "calories-remaining-number calories-remaining-number target-exceeded"
        status_text = f"{abs(remaining):.0f} kcal over target"
    elif remaining < 200:
        display_class = "calories-remaining-number calories-remaining-number target-met"
        status_text = "Target nearly met"
    else:
        display_class = "calories-remaining-number"
        status_text = "On track"

    return f"{max(0, remaining):.0f}", display_class, status_text


@callback(
    Output("daily-macros-display", "children"),
    [
        Input("persistent-entries", "data"),
        Input("page-load-trigger", "children"),
        Input("targets-updated-trigger", "data"),
    ],
    State("selected-date-store", "data"),
    prevent_initial_call=False,
)
def update_daily_macros(entries, _, __, selected_date_str):
    """Display macronutrient breakdown with progress bars and indicators."""
    # Parse selected date
    if selected_date_str is None:
        current_date = date.today()
    else:
        current_date = date.fromisoformat(selected_date_str)

    # Load targets for selected day
    targets = storage.get_or_create_daily_targets(current_date)

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

    if entries:
        for entry in entries:
            for nutrient in totals:
                totals[nutrient] += entry["nutrients"][nutrient]

    def create_macro_bar(label, value, target, color_class, mode="target", unit="g"):
        """Create a macro progress bar with indicator."""
        percentage = min((value / target * 100), 100) if target > 0 else 0

        # Format values
        if unit == "mg":
            value_str = f"{value:.0f}mg"
            target_str = f"{target:.0f}mg"
        elif unit == "kcal":
            value_str = f"{value:.0f}"
            target_str = f"{target:.0f}"
        else:
            value_str = f"{value:.1f}g"
            target_str = f"{target:.0f}g"

        # Determine indicator
        indicator = None
        if mode == "limit":
            # Limit mode - show warnings when exceeding
            if value > target * 1.1:
                indicator = html.Span(
                    "⚠", className="macro-bar-indicator target-exceeded", title="Limit exceeded"
                )
            elif value > target:
                indicator = html.Span(
                    "⚠", className="macro-bar-indicator target-warning", title="Near limit"
                )
        else:
            # Target mode - show checkmark when met
            if value >= target:
                indicator = html.Span(
                    "✓", className="macro-bar-indicator target-met", title="Target met"
                )

        return html.Div(
            [
                html.Div(
                    [
                        html.Span(label, className="macro-bar-label"),
                        html.Div(
                            [
                                html.Span(
                                    f"{value_str} / {target_str}", className="macro-bar-value"
                                ),
                                indicator if indicator else None,
                            ],
                            style={"display": "flex", "gap": "4px", "alignItems": "center"},
                        ),
                    ],
                    className="macro-bar-header",
                ),
                dbc.Progress(
                    value=percentage,
                    className=f"progress-{color_class}",
                    style={"height": "5px"},
                ),
            ],
            className="macro-bar-item",
        )

    # Build list of nutrients to display (macros first, then micros)
    macro_bars = [
        create_macro_bar(
            "Fat",
            totals["fat_g"],
            targets.fat_g,
            "fat",
            mode=targets.get_nutrient_mode("fat").value,
        ),
        create_macro_bar(
            "Saturated Fat",
            totals["saturated_fat_g"],
            targets.saturated_fat_g,
            "saturated-fat",
            mode=targets.get_nutrient_mode("saturated_fat").value,
        ),
        create_macro_bar(
            "Carbohydrates",
            totals["carbohydrates_g"],
            targets.carbohydrates_g,
            "carbs",
            mode=targets.get_nutrient_mode("carbohydrates").value,
        ),
        create_macro_bar(
            "Sugar",
            totals["sugar_g"],
            targets.sugar_g,
            "sugar",
            mode=targets.get_nutrient_mode("sugar").value,
        ),
        create_macro_bar(
            "Protein",
            totals["protein_g"],
            targets.protein_g,
            "protein",
            mode=targets.get_nutrient_mode("protein").value,
        ),
        create_macro_bar(
            "Fibre",
            totals["fibre_g"],
            targets.fibre_g,
            "fibre",
            mode=targets.get_nutrient_mode("fibre").value,
        ),
        create_macro_bar(
            "Salt",
            totals["salt_g"],
            targets.salt_g,
            "salt",
            mode=targets.get_nutrient_mode("salt").value,
        ),
        create_macro_bar(
            "Calcium",
            totals["calcium_mg"],
            targets.calcium_mg,
            "calcium",
            mode=targets.get_nutrient_mode("calcium").value,
            unit="mg",
        ),
    ]

    return html.Div(macro_bars)


@callback(
    Output("daily-summary-compact", "children"),
    [
        Input("persistent-entries", "data"),
        Input("page-load-trigger", "children"),
        Input("targets-updated-trigger", "data"),
    ],
    State("selected-date-store", "data"),
    prevent_initial_call=False,
)
def update_daily_totals(entries, _, __, selected_date_str):
    """Calculate and display daily totals in compact header summary."""
    # Parse selected date
    if selected_date_str is None:
        current_date = date.today()
    else:
        current_date = date.fromisoformat(selected_date_str)

    # Load targets for selected day
    targets = storage.get_or_create_daily_targets(current_date)

    if not entries:
        compact_summary = html.Span(f"0 / {targets.energy_kcal:.0f} kcal", className="text-muted")
        return compact_summary

    # Calculate totals
    totals = {
        "energy_kcal": 0.0,
        "fat_g": 0.0,
        "carbohydrates_g": 0.0,
        "protein_g": 0.0,
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
                f"{totals['fat_g']:.1f} g Fat",
                className="summary-item",
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['carbohydrates_g']:.1f} g Carbs",
                className="summary-item",
            ),
            html.Span(" | ", style={"color": "var(--text-disabled)"}),
            html.Span(
                f"{totals['protein_g']:.1f} g Protein",
                className="summary-item",
            ),
        ],
    )

    return compact_summary


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
    """Toggle the targets editor modal based on which button was clicked."""
    ctx = dash.callback_context
    if not ctx.triggered:
        return is_open

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    # Only open if open button was clicked
    if trigger_id == "open-targets-modal":
        return True
    # Close if close or save buttons were clicked
    elif trigger_id in ["close-targets-modal", "save-targets"]:
        return False

    return is_open


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
    State("selected-date-store", "data"),
    prevent_initial_call=True,
)
def load_targets_into_modal(open_clicks, copy_clicks, selected_date_str):
    """Load current or previous day's targets into the modal."""
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    # Parse selected date
    if selected_date_str is None:
        current_date = date.today()
    else:
        current_date = date.fromisoformat(selected_date_str)

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    if trigger_id == "copy-previous-targets":
        # Get previous day's targets
        targets = storage.get_previous_day_targets(current_date)
        if not targets:
            targets = storage.get_or_create_daily_targets(current_date)
    else:
        # Load selected day's targets
        targets = storage.get_or_create_daily_targets(current_date)

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
    Output("targets-updated-trigger", "data"),
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
        State("selected-date-store", "data"),
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
    selected_date_str,
):
    """Save targets to storage and refresh display."""
    if not n_clicks:
        raise PreventUpdate

    # Parse selected date
    if selected_date_str is None:
        target_date = date.today()
    else:
        target_date = date.fromisoformat(selected_date_str)

    # Create and save targets
    targets = DailyTargets(
        date=target_date,
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

    # Trigger a refresh by incrementing the trigger counter
    # This will cause update_daily_totals to re-run with the new targets
    return (n_clicks or 0) + 1


@callback(
    [
        Output("morning-weight", "id"),
        Output("persistent-morning-weight", "data", allow_duplicate=True),
    ],
    Input("morning-weight", "value"),
    State("selected-date-store", "data"),
    prevent_initial_call=True,
)
def save_morning_weight(morning_weight, selected_date_str):
    """Save morning weight to database when it changes."""
    # Parse selected date
    if selected_date_str is None:
        entry_date = date.today()
    else:
        entry_date = date.fromisoformat(selected_date_str)

    # Treat 0 as None (invalid weight)
    morning_weight_kg = None if morning_weight == 0 or morning_weight is None else morning_weight

    # Update only measurements without touching entries
    storage.update_measurements(entry_date, morning_weight_kg=morning_weight_kg)

    # Update persistent store to keep in sync
    return no_update, morning_weight_kg


@callback(
    [
        Output("evening-weight", "id"),
        Output("persistent-evening-weight", "data", allow_duplicate=True),
    ],
    Input("evening-weight", "value"),
    State("selected-date-store", "data"),
    prevent_initial_call=True,
)
def save_evening_weight(evening_weight, selected_date_str):
    """Save evening weight to database when it changes."""
    # Parse selected date
    if selected_date_str is None:
        entry_date = date.today()
    else:
        entry_date = date.fromisoformat(selected_date_str)

    # Treat 0 as None (invalid weight)
    evening_weight_kg = None if evening_weight == 0 or evening_weight is None else evening_weight

    # Update only measurements without touching entries
    storage.update_measurements(entry_date, evening_weight_kg=evening_weight_kg)

    # Update persistent store to keep in sync
    return no_update, evening_weight_kg
