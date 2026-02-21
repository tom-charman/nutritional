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
    NUTRIENT_FIELD_INFO,
    NUTRIENT_INPUT_ORDER,
    DailyData,
    DailyTargets,
    FoodEntry,
    MealEntry,
    Measurements,
    TargetMode,
    UnitType,
)
from nutritional.data_entry.sqlmodel_storage import SQLModelStorage

dash.register_page(__name__, path="/entry", title="Daily Entry")

storage = SQLModelStorage()


def create_target_input(field):
    """Create a target input element for the given nutrient field."""
    target_id = f"target-{field.replace('_', '-')}"
    mode_id = f"mode-{field.replace('_', '-')}"
    step_value = 10 if field == "energy_kcal" else (0.1 if field in ["salt_g", "calcium_mg"] else 1)
    return html.Div(
        [
            html.Label(NUTRIENT_FIELD_INFO[field]["label"]),
            dbc.InputGroup(
                [
                    dbc.Input(
                        id=target_id,
                        type="number",
                        min=0,
                        step=step_value,
                    ),
                    dbc.Select(
                        id=mode_id,
                        options=[
                            {"label": "Target", "value": "target"},
                            {"label": "Limit", "value": "limit"},
                        ],
                    ),
                ],
            ),
        ],
        className="compact-input",
    )


def get_entry_layout():
    return dbc.Container(
        [
            # Hidden trigger to reload data when page is visited
            html.Div(id="page-load-trigger", className="hidden"),
            # Store to trigger refresh when targets are updated
            dcc.Store(id="targets-updated-trigger", data=0),
            # Store for editing entry index
            dcc.Store(id="editing-entry-index", data=None),
            # Store for expanded meal items
            dcc.Store(id="expanded-meals", data=[]),
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
                            html.Div("Food & Meals", className="section-label"),
                            # Unified Food/Meal Selector
                            html.Div(
                                [
                                    dcc.Dropdown(
                                        id="food-selector",
                                        placeholder="Search foods or meals...",
                                        searchable=True,
                                        className="food-selector-full-width",
                                    ),
                                ],
                                className="action-row action-row-flex",
                                style={"marginBottom": "0px"},
                            ),
                            # Unified Amount/Portions Input (appears when selection made)
                            html.Div(id="food-input-container", style={"marginBottom": "0px"}),
                            # Calculated nutrients preview
                            html.Div(id="calculated-nutrients"),
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
                                    # Grid layout for inputs
                                    html.Div(
                                        [
                                            create_target_input(field)
                                            for field in NUTRIENT_INPUT_ORDER
                                        ],
                                        className="editor-grid",
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
            # Toast notification
            dbc.Toast(
                id="entry-toast",
                is_open=False,
                duration=3000,
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
    """Update dropdown options with both foods and meals."""
    options = []

    # Load foods
    if search_value:
        food_items = storage.search_food_items(search_value)
    else:
        food_items = storage.load_food_database()

    # Add food options
    for item in food_items:
        options.append(
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
                "value": f"food:{item.id}",
            }
        )

    # Load meals and filter by search if needed
    meals = storage.load_meals()
    if search_value:
        meals = [m for m in meals if search_value.lower() in m.name.lower()]

    # Add meal options
    for meal in meals:
        options.append(
            {
                "label": meal.name,
                "value": f"meal:{meal.id}",
            }
        )

    return options


@callback(
    Output("food-input-container", "children"),
    Input("food-selector", "value"),
)
def update_input_fields(selection):
    """Update input fields based on selected food or meal."""
    if not selection:
        return []

    # Check if it's a food or meal
    if selection.startswith("food:"):
        food_id = selection.split(":", 1)[1]
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

    elif selection.startswith("meal:"):
        # Show portions input for meals
        input_fields = html.Div(
            [
                dbc.InputGroup(
                    [
                        dbc.Input(
                            id={"type": "meal-portions", "index": 0},
                            type="number",
                            min=0.1,
                            step=0.1,
                            value=1.0,
                            placeholder="Portions",
                            size="sm",
                        ),
                        dbc.Button(
                            "Add Meal",
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

    return []


@callback(
    Output("calculated-nutrients", "children"),
    [
        Input("food-selector", "value"),
        Input({"type": "food-amount", "index": dash.ALL}, "value"),
        Input({"type": "meal-portions", "index": dash.ALL}, "value"),
    ],
)
def calculate_and_display_nutrients(food_id, amount_list, portions_list):
    """Calculate and display nutrients based on amount."""
    if not food_id:
        return []

    # Determine the amount based on food or meal selection
    if food_id.startswith("meal:"):
        amount = portions_list[0] if portions_list and len(portions_list) > 0 else None
    else:
        amount = amount_list[0] if amount_list and len(amount_list) > 0 else None

    if not amount:
        return []

    try:
        nutrients = None

        # Get the appropriate item (food or meal)
        if food_id.startswith("food:"):
            food_id_str = food_id.split(":", 1)[1]
            item = storage.get_food_item(food_id_str)
            if item:
                if item.unit_type == UnitType.PER_100G:
                    nutrients = calculate_nutrients(item, weight_g=float(amount))
                else:
                    nutrients = calculate_nutrients(item, quantity=float(amount))
        elif food_id.startswith("meal:"):
            meal_id_str = food_id.split(":", 1)[1]
            meal = storage.get_meal(meal_id_str)
            if meal:
                # For meals, sum up all ingredients' nutrients
                total_nutrients = None
                for ingredient in meal.ingredients:
                    food_item = storage.get_food_item(ingredient.food_id)
                    if not food_item:
                        continue
                    if ingredient.weight_g is not None:
                        scaled_weight = ingredient.weight_g * float(amount)
                        ing_nutrients = calculate_nutrients(food_item, weight_g=scaled_weight)
                    elif ingredient.quantity is not None:
                        scaled_quantity = ingredient.quantity * float(amount)
                        ing_nutrients = calculate_nutrients(food_item, quantity=scaled_quantity)
                    else:
                        continue
                    if total_nutrients is None:
                        total_nutrients = ing_nutrients
                    else:
                        # Sum nutrients
                        total_nutrients.energy_kcal += ing_nutrients.energy_kcal
                        total_nutrients.fat_g += ing_nutrients.fat_g
                        total_nutrients.saturated_fat_g += ing_nutrients.saturated_fat_g
                        total_nutrients.carbohydrates_g += ing_nutrients.carbohydrates_g
                        total_nutrients.sugar_g += ing_nutrients.sugar_g
                        total_nutrients.protein_g += ing_nutrients.protein_g
                        total_nutrients.fibre_g += ing_nutrients.fibre_g
                        total_nutrients.salt_g += ing_nutrients.salt_g
                        total_nutrients.calcium_mg += ing_nutrients.calcium_mg
                nutrients = total_nutrients

        if not nutrients:
            return []

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
        Output("entry-toast", "is_open"),
        Output("entry-toast", "children"),
        Output("entry-toast", "style"),
        Output("food-selector", "value"),
        Output("persistent-morning-weight", "data", allow_duplicate=True),
        Output("persistent-evening-weight", "data", allow_duplicate=True),
    ],
    Input("add-entry-btn", "n_clicks"),
    [
        State("food-selector", "value"),
        State({"type": "food-amount", "index": dash.ALL}, "value"),
        State({"type": "meal-portions", "index": dash.ALL}, "value"),
        State("persistent-entries", "data"),
        State("persistent-morning-weight", "data"),
        State("persistent-evening-weight", "data"),
        State("selected-date-store", "data"),
    ],
    prevent_initial_call=True,
)
def add_entry(
    n_clicks,
    selection,
    amount_list,
    portions_list,
    current_entries,
    morning_weight,
    evening_weight,
    selected_date_str,
):
    """Add a food or meal entry to the selected day and save immediately."""
    if not n_clicks or not selection:
        raise PreventUpdate

    # Parse selected date
    if selected_date_str is None:
        entry_date = date.today()
    else:
        entry_date = date.fromisoformat(selected_date_str)

    # Determine if it's a food or meal
    if selection.startswith("food:"):
        # Handle food entry
        food_id = selection.split(":", 1)[1]
        amount = amount_list[0] if amount_list and len(amount_list) > 0 else None

        if not amount:
            return (
                no_update,
                True,
                "Please enter an amount",
                {
                    "backgroundColor": "#A04000",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                no_update,
                no_update,
                no_update,
            )

        item = storage.get_food_item(food_id)
        if not item:
            return (
                no_update,
                True,
                "Food item not found",
                {
                    "backgroundColor": "#A04000",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                no_update,
                no_update,
                no_update,
            )

        try:
            # Calculate nutrients
            if item.unit_type == UnitType.PER_100G:
                nutrients = calculate_nutrients(item, weight_g=float(amount))
                weight_g = float(amount)
                qty = None
            else:
                nutrients = calculate_nutrients(item, quantity=float(amount))
                weight_g = None
                qty = float(amount)

            # Create entry
            entry = FoodEntry(
                timestamp=datetime.now(),
                food_id=item.id,
                food_name=item.name,
                weight_g=weight_g,
                quantity=qty,
                nutrients=nutrients,
            )

            # Add to current entries
            current_entries.append(entry.model_dump(mode="json"))

            # Save immediately to selected day
            food_entries = []
            for e in current_entries:
                if e.get("meal_id"):
                    food_entries.append(MealEntry(**e))
                else:
                    food_entries.append(FoodEntry(**e))

            daily_data = DailyData(
                date=entry_date,
                entries=food_entries,
                measurements=Measurements(),
            )
            storage.save_daily_entry(daily_data)

            return (
                current_entries,
                True,
                f"Added {item.name}",
                {
                    "backgroundColor": "#789440",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                None,
                morning_weight,
                evening_weight,
            )
        except Exception as e:
            return (
                no_update,
                True,
                f"Error adding entry: {str(e)}",
                {
                    "backgroundColor": "#A04000",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                no_update,
                no_update,
                no_update,
            )

    elif selection.startswith("meal:"):
        # Handle meal entry
        meal_id = selection.split(":", 1)[1]
        portions = portions_list[0] if portions_list and len(portions_list) > 0 else None

        if portions is None or portions <= 0:
            return (
                no_update,
                True,
                "Please enter valid portions",
                {
                    "backgroundColor": "#A04000",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                no_update,
                no_update,
                no_update,
            )

        # Get the meal from storage
        meal = storage.get_meal(meal_id)
        if not meal:
            return (
                no_update,
                True,
                "Meal not found",
                {
                    "backgroundColor": "#A04000",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                no_update,
                no_update,
                no_update,
            )

        try:
            # Create food entries for each ingredient, scaled by portions
            meal_ingredients = []
            for ingredient in meal.ingredients:
                food_item = storage.get_food_item(ingredient.food_id)
                if not food_item:
                    continue

                # Scale the ingredient by portions
                if ingredient.weight_g is not None:
                    scaled_weight = ingredient.weight_g * portions
                    nutrients = calculate_nutrients(food_item, weight_g=scaled_weight)
                    entry = FoodEntry(
                        timestamp=datetime.now(),
                        food_id=ingredient.food_id,
                        food_name=ingredient.food_name,
                        weight_g=scaled_weight,
                        quantity=None,
                        nutrients=nutrients,
                    )
                else:
                    scaled_quantity = ingredient.quantity * portions
                    nutrients = calculate_nutrients(food_item, quantity=scaled_quantity)
                    entry = FoodEntry(
                        timestamp=datetime.now(),
                        food_id=ingredient.food_id,
                        food_name=ingredient.food_name,
                        weight_g=None,
                        quantity=scaled_quantity,
                        nutrients=nutrients,
                    )

                meal_ingredients.append(entry)

            # Create MealEntry with independent copies of ingredients
            meal_entry = MealEntry(
                meal_id=meal.id,
                meal_name=meal.name,
                portions=portions,
                ingredients=meal_ingredients,
            )

            # Add to current entries
            current_entries.append(meal_entry.model_dump(mode="json"))

            # Save immediately
            food_entries = []
            for e in current_entries:
                if e.get("meal_id"):
                    food_entries.append(MealEntry(**e))
                else:
                    food_entries.append(FoodEntry(**e))

            daily_data = DailyData(
                date=entry_date,
                entries=food_entries,
                measurements=Measurements(),
            )
            storage.save_daily_entry(daily_data)

            return (
                current_entries,
                True,
                f"Added {meal.name} ({portions} portion{'s' if portions != 1 else ''})",
                {
                    "backgroundColor": "#789440",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                None,
                morning_weight,
                evening_weight,
            )
        except Exception as e:
            return (
                no_update,
                True,
                f"Error adding meal: {str(e)}",
                {
                    "backgroundColor": "#A04000",
                    "color": "white",
                    "position": "fixed",
                    "bottom": "20px",
                    "right": "20px",
                    "zIndex": 1000,
                },
                no_update,
                no_update,
                no_update,
            )

    raise PreventUpdate


@callback(
    Output("entries-list", "children"),
    [
        Input("persistent-entries", "data"),
        Input("page-load-trigger", "children"),
        Input("editing-entry-index", "data"),
        Input("expanded-meals", "data"),
    ],
    prevent_initial_call=False,
)
def update_entries_list(entries, _, editing_index, expanded_meals):
    """Display list of current entries with collapsible meals."""
    if expanded_meals is not None:
        expanded_meals = expanded_meals or []
    else:
        expanded_meals = []

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

    entry_items = []
    for i, entry in enumerate(entries):
        # Check if this is a MealEntry (has meal_id) or FoodEntry
        if "meal_id" in entry and entry.get("meal_id"):
            # This is a MealEntry - display as collapsible meal with nested ingredients
            meal_entry = entry
            meal_id = meal_entry.get("meal_id")
            meal_name = meal_entry.get("meal_name", "Meal")
            portions = meal_entry.get("portions", 1.0)
            ingredients = meal_entry.get("ingredients", [])
            is_expanded = meal_id in expanded_meals

            # Calculate total calories for the meal
            total_calories = sum(
                ing.get("nutrients", {}).get("energy_kcal", 0) for ing in ingredients
            )

            # Create meal header - clean design with subtle visual feedback
            meal_header = html.Div(
                [
                    html.Div(
                        [
                            html.Div(
                                meal_name,
                                className="ingredient-name",
                                style={"fontWeight": "500"},
                            ),
                            html.Div(
                                f"{portions} portion{'s' if portions != 1 else ''}",
                                className="ingredient-weight",
                                style={"fontSize": "0.85em", "color": "var(--text-secondary)"},
                            ),
                        ],
                        className="ingredient-item-header",
                    ),
                    html.Span(
                        f"{total_calories:.0f} kcal",
                        className="ingredient-calories",
                        title="Total Calories",
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
                id={"type": "meal-header", "meal_id": meal_id},
                n_clicks=0,
                style={
                    "cursor": "pointer",
                    "borderBottom": (
                        "2px solid var(--text-disabled)" if is_expanded else "2px solid transparent"
                    ),
                    "transition": "border-color 0.2s ease",
                },
            )

            # Create nested ingredients list - only show if expanded
            nested_ingredients = []
            if is_expanded:
                for j, ingredient in enumerate(ingredients):
                    ing_calories = ingredient.get("nutrients", {}).get("energy_kcal", 0)

                    nested_item = html.Div(
                        [
                            html.Div(
                                [
                                    html.Div(
                                        f"  └─ {ingredient.get('food_name', 'Unknown')}",
                                        className="ingredient-name",
                                        style={"paddingLeft": "12px"},
                                    ),
                                    dcc.Input(
                                        id={
                                            "type": "meal-ingredient-amount",
                                            "meal_id": meal_id,
                                            "index": j,
                                        },
                                        type="number",
                                        value=ingredient.get("weight_g")
                                        or ingredient.get("quantity"),
                                        min=0,
                                        step=0.1,
                                        size="sm",
                                        style={
                                            "width": "60px",
                                            "padding": "4px",
                                            "fontSize": "0.85em",
                                        },
                                        placeholder="Amount",
                                    ),
                                ],
                                className="ingredient-item-header",
                            ),
                            html.Span(
                                f"{ing_calories:.0f} kcal",
                                className="ingredient-calories",
                                title="Calories",
                            ),
                        ],
                        className="ingredient-item",
                        style={"backgroundColor": "rgba(0,0,0,0.02)"},
                        id={"type": "meal-ingredient-item", "meal_id": meal_id, "index": j},
                    )
                    nested_ingredients.append(nested_item)

            # Combine meal header and ingredients
            meal_div = html.Div(
                [meal_header] + nested_ingredients,
                style={"marginBottom": "8px"},
            )
            entry_items.append(meal_div)
        else:
            # This is a FoodEntry - display normally
            if editing_index == i:
                # Edit mode
                item = storage.get_food_item(entry["food_id"])
                if not item:
                    continue
                if item.unit_type == UnitType.PER_100G:
                    current_amount = entry["weight_g"]
                    placeholder = "weight in grams"
                else:
                    current_amount = entry["quantity"]
                    placeholder = "quantity"
                entry_div = html.Div(
                    [
                        html.Div(
                            [
                                html.Div(
                                    entry["food_name"],
                                    className="ingredient-name",
                                ),
                                dcc.Input(
                                    id={"type": "edit-amount", "index": i},
                                    type="number",
                                    value=current_amount,
                                    placeholder=placeholder,
                                    min=0,
                                    step=0.1,
                                    size="sm",
                                    style={"width": "100px"},
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
            else:
                # Normal display
                entry_div = html.Div(
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
                                    id={"type": "edit-trigger", "index": i},
                                    n_clicks=0,
                                    style={"cursor": "pointer"},
                                    title="Click to edit amount",
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
            entry_items.append(entry_div)

    return entry_items


# Handle meal expand/collapse
@callback(
    Output("expanded-meals", "data"),
    Input({"type": "meal-header", "meal_id": dash.ALL}, "n_clicks"),
    State("expanded-meals", "data"),
    prevent_initial_call=True,
)
def toggle_meal_expansion(n_clicks_list, expanded_meals):
    """Toggle meal expansion when header is clicked."""
    if not any(n_clicks_list):
        raise PreventUpdate

    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    # Get the meal_id from the triggered input
    header_id = ctx.triggered[0]["prop_id"].split(".")[0]
    meal_id = eval(header_id)["meal_id"]

    if expanded_meals is None:
        expanded_meals = []

    # Toggle the meal
    if meal_id in expanded_meals:
        expanded_meals.remove(meal_id)
    else:
        expanded_meals.append(meal_id)

    return expanded_meals


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
    # Convert entries back to Pydantic models
    food_entries = []
    for e in entries:
        if e.get("meal_id"):
            food_entries.append(MealEntry(**e))
        else:
            food_entries.append(FoodEntry(**e))

    daily_data = DailyData(
        date=entry_date,
        entries=food_entries,
        measurements=Measurements(),  # Empty measurements - weights are updated separately
    )
    storage.save_daily_entry(daily_data)

    return entries


@callback(
    Output("editing-entry-index", "data"),
    Input({"type": "edit-trigger", "index": dash.ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def start_edit(n_clicks):
    """Start editing an entry."""
    if not any(n_clicks):
        raise PreventUpdate

    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    button_id = ctx.triggered[0]["prop_id"].split(".")[0]
    index = eval(button_id)["index"]

    return index


@callback(
    [
        Output("persistent-entries", "data", allow_duplicate=True),
        Output("editing-entry-index", "data", allow_duplicate=True),
        Output("entry-toast", "is_open", allow_duplicate=True),
        Output("entry-toast", "children", allow_duplicate=True),
        Output("entry-toast", "style", allow_duplicate=True),
    ],
    [
        Input({"type": "edit-amount", "index": dash.ALL}, "n_blur"),
        Input({"type": "edit-amount", "index": dash.ALL}, "n_submit"),
    ],
    [
        State({"type": "edit-amount", "index": dash.ALL}, "value"),
        State("persistent-entries", "data"),
        State("persistent-morning-weight", "data"),
        State("persistent-evening-weight", "data"),
        State("selected-date-store", "data"),
    ],
    prevent_initial_call=True,
)
def save_edit(
    n_blur, n_submit, amounts, entries, morning_weight, evening_weight, selected_date_str
):
    """Save the edited amount for an entry."""
    if not any(n_blur) and not any(n_submit):
        raise PreventUpdate

    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    button_id = ctx.triggered[0]["prop_id"].split(".")[0]
    index = eval(button_id)["index"]

    new_amount = amounts[0]

    if not new_amount:
        return (
            no_update,
            None,
            True,
            "Please enter an amount",
            {
                "backgroundColor": "#A04000",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )

    entry = entries[index]

    item = storage.get_food_item(entry["food_id"])
    if not item:
        return (
            no_update,
            None,
            True,
            "Food item not found",
            {
                "backgroundColor": "#A04000",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )

    try:
        if item.unit_type == UnitType.PER_100G:
            nutrients = calculate_nutrients(item, weight_g=float(new_amount))
            entry["weight_g"] = float(new_amount)
            entry["quantity"] = None
        else:
            nutrients = calculate_nutrients(item, quantity=float(new_amount))
            entry["weight_g"] = None
            entry["quantity"] = float(new_amount)

        entry["nutrients"] = nutrients.model_dump(mode="json")

        # Parse selected date
        if selected_date_str is None:
            entry_date = date.today()
        else:
            entry_date = date.fromisoformat(selected_date_str)

        # Save immediately to selected day
        # Convert entries back to Pydantic models
        food_entries = []
        for e in entries:
            if e.get("meal_id"):
                food_entries.append(MealEntry(**e))
            else:
                food_entries.append(FoodEntry(**e))
        daily_data = DailyData(
            date=entry_date,
            entries=food_entries,
            measurements=Measurements(),  # Empty measurements - weights are updated separately
        )
        storage.save_daily_entry(daily_data)

        return (
            entries,
            None,
            True,
            f"Updated {item.name}",
            {
                "backgroundColor": "#789440",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )
    except Exception as e:
        return (
            no_update,
            None,
            True,
            f"Error updating entry: {str(e)}",
            {
                "backgroundColor": "#A04000",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )


# Handle meal ingredient amount edits
@callback(
    [
        Output("persistent-entries", "data", allow_duplicate=True),
        Output("entry-toast", "is_open", allow_duplicate=True),
        Output("entry-toast", "children", allow_duplicate=True),
        Output("entry-toast", "style", allow_duplicate=True),
    ],
    Input({"type": "meal-ingredient-amount", "meal_id": dash.ALL, "index": dash.ALL}, "n_blur"),
    [
        State({"type": "meal-ingredient-amount", "meal_id": dash.ALL, "index": dash.ALL}, "value"),
        State("persistent-entries", "data"),
        State("selected-date-store", "data"),
    ],
    prevent_initial_call=True,
)
def update_meal_ingredient_amount(n_blur_list, amount_list, entries, selected_date_str):
    """Update meal ingredient amounts when user edits them."""
    if not any(n_blur_list):
        raise PreventUpdate

    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    # Get the triggered input ID
    triggered_id = ctx.triggered[0]["prop_id"].split(".")[0]
    triggered_data = eval(triggered_id)
    meal_id = triggered_data["meal_id"]
    ingredient_index = triggered_data["index"]
    new_amount = amount_list[0] if amount_list else None

    if new_amount is None or new_amount <= 0:
        return (
            no_update,
            True,
            "Please enter a valid amount",
            {
                "backgroundColor": "#A04000",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )

    try:
        # Find the meal entry
        meal_entry_idx = None
        for i, entry in enumerate(entries):
            if entry.get("meal_id") == meal_id:
                meal_entry_idx = i
                break

        if meal_entry_idx is None:
            raise ValueError("Meal entry not found")

        meal_entry = entries[meal_entry_idx]
        if ingredient_index >= len(meal_entry["ingredients"]):
            raise ValueError("Ingredient index out of range")

        ingredient = meal_entry["ingredients"][ingredient_index]
        food_id = ingredient["food_id"]
        food_item = storage.get_food_item(food_id)

        if not food_item:
            raise ValueError(f"Food item {food_id} not found")

        # Update the ingredient amount and recalculate nutrients
        if ingredient.get("weight_g") is not None:
            # Per 100g food
            nutrients = calculate_nutrients(food_item, weight_g=float(new_amount))
            ingredient["weight_g"] = float(new_amount)
            ingredient["quantity"] = None
        else:
            # Per-item food
            nutrients = calculate_nutrients(food_item, quantity=float(new_amount))
            ingredient["weight_g"] = None
            ingredient["quantity"] = float(new_amount)

        ingredient["nutrients"] = nutrients.model_dump(mode="json")

        # Save immediately
        if selected_date_str is None:
            entry_date = date.today()
        else:
            entry_date = date.fromisoformat(selected_date_str)

        # Convert entries back to Pydantic models for saving
        food_entries = []
        for e in entries:
            if e.get("meal_id"):
                food_entries.append(MealEntry(**e))
            else:
                food_entries.append(FoodEntry(**e))

        daily_data = DailyData(
            date=entry_date,
            entries=food_entries,
            measurements=Measurements(),
        )
        storage.save_daily_entry(daily_data)

        return (
            entries,
            True,
            f"Updated {ingredient.get('food_name', 'ingredient')}",
            {
                "backgroundColor": "#789440",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )
    except Exception as e:
        return (
            no_update,
            True,
            f"Error updating ingredient: {str(e)}",
            {
                "backgroundColor": "#A04000",
                "color": "white",
                "position": "fixed",
                "bottom": "20px",
                "right": "20px",
                "zIndex": 1000,
            },
        )


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
            if "meal_id" in entry and entry.get("meal_id"):
                # This is a MealEntry - sum calories from ingredients
                for ingredient in entry.get("ingredients", []):
                    consumed_calories += ingredient.get("nutrients", {}).get("energy_kcal", 0)
            else:
                # This is a FoodEntry
                consumed_calories += entry.get("nutrients", {}).get("energy_kcal", 0)

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
    if not entries:
        # No data for this day
        return html.Div(
            html.P(
                "No food entries for this day.",
                className="text-muted",
                style={"textAlign": "center", "padding": "24px"},
            ),
            style={
                "border": "1px solid var(--border)",
                "borderRadius": "8px",
                "background": "var(--surface)",
            },
        )

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
        if "meal_id" in entry and entry.get("meal_id"):
            # This is a MealEntry - sum nutrients from ingredients
            for ingredient in entry.get("ingredients", []):
                for nutrient in totals:
                    totals[nutrient] += ingredient.get("nutrients", {}).get(nutrient, 0)
        else:
            # This is a FoodEntry
            for nutrient in totals:
                totals[nutrient] += entry.get("nutrients", {}).get(nutrient, 0)

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
        compact_summary = html.Span("No data", className="text-muted")
        return compact_summary

    # Calculate totals
    totals = {
        "energy_kcal": 0.0,
        "fat_g": 0.0,
        "carbohydrates_g": 0.0,
        "protein_g": 0.0,
    }

    for entry in entries:
        if "meal_id" in entry and entry.get("meal_id"):
            # This is a MealEntry - sum nutrients from ingredients
            for ingredient in entry.get("ingredients", []):
                for nutrient in totals:
                    totals[nutrient] += ingredient.get("nutrients", {}).get(nutrient, 0)
        else:
            # This is a FoodEntry
            for nutrient in totals:
                totals[nutrient] += entry.get("nutrients", {}).get(nutrient, 0)

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
        Output("persistent-morning-weight", "data", allow_duplicate=True),
        Output("morning-weight", "style", allow_duplicate=True),
    ],
    Input("morning-weight", "value"),
    State("selected-date-store", "data"),
    prevent_initial_call=True,
)
def save_morning_weight(morning_weight, selected_date_str):
    """Save morning weight to database immediately when changed.

    This callback is completely independent of food entries.
    Weight changes are saved directly to the database and reflected immediately.
    """
    try:
        # Parse selected date
        if selected_date_str is None:
            entry_date = date.today()
        else:
            entry_date = date.fromisoformat(selected_date_str)

        # Treat 0 or None as None (invalid weight)
        morning_weight_kg = (
            None if morning_weight == 0 or morning_weight is None else float(morning_weight)
        )

        # Update ONLY measurements in the database (independent from food)
        storage.update_measurements(entry_date, morning_weight_kg=morning_weight_kg)

        # Update persistent store to keep UI in sync
        return morning_weight_kg, no_update
    except Exception as e:
        print(f"Error saving morning weight: {e}")
        # Return unchanged values on error
        return no_update, no_update


@callback(
    [
        Output("persistent-evening-weight", "data", allow_duplicate=True),
        Output("evening-weight", "style", allow_duplicate=True),
    ],
    Input("evening-weight", "value"),
    State("selected-date-store", "data"),
    prevent_initial_call=True,
)
def save_evening_weight(evening_weight, selected_date_str):
    """Save evening weight to database immediately when changed.

    This callback is completely independent of food entries.
    Weight changes are saved directly to the database and reflected immediately.
    """
    try:
        # Parse selected date
        if selected_date_str is None:
            entry_date = date.today()
        else:
            entry_date = date.fromisoformat(selected_date_str)

        # Treat 0 or None as None (invalid weight)
        evening_weight_kg = (
            None if evening_weight == 0 or evening_weight is None else float(evening_weight)
        )

        # Update ONLY measurements in the database (independent from food)
        storage.update_measurements(entry_date, evening_weight_kg=evening_weight_kg)

        # Update persistent store to keep UI in sync
        return evening_weight_kg, no_update
    except Exception as e:
        print(f"Error saving evening weight: {e}")
        # Return unchanged values on error
        return no_update, no_update
