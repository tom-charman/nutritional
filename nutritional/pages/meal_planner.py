"""Meal planner page for creating and managing meal templates."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html, no_update

from nutritional.auth_utils import (
    get_access_denied_layout,
    get_current_user_email,
    is_authorized,
)
from nutritional.data_entry.models import (
    Meal,
    MealIngredient,
    Nutrients,
    UnitType,
)
from nutritional.data_entry.sqlmodel_storage import SQLModelStorage

dash.register_page(__name__, path="/meal-planner", title="Meal Planner")

storage = SQLModelStorage()


def get_meal_planner_layout():
    """Return the meal planner layout."""
    return dbc.Container(
        [
            # Header
            html.Div(
                [
                    html.H1("Meal Planner", className="page-title"),
                    html.P(
                        "Create reusable meal templates by combining foods with specific amounts.",
                        className="text-muted",
                    ),
                ],
                className="page-header",
            ),
            # Main Content - Two Column Layout
            dbc.Row(
                [
                    # Left Column - Meal Composer
                    dbc.Col(
                        [
                            html.Div(
                                [
                                    html.H3("Meal Composer", className="section-title"),
                                    # Meal Name Input
                                    html.Div(
                                        [
                                            html.Label("Meal Name", className="form-label"),
                                            dbc.Input(
                                                id="meal-name",
                                                placeholder="e.g., Breakfast Smoothie",
                                                type="text",
                                                className="mb-3",
                                            ),
                                        ]
                                    ),
                                    # Food Selector and Amount
                                    html.Div(
                                        [
                                            html.Label("Add Ingredient", className="form-label"),
                                            dbc.Row(
                                                [
                                                    dbc.Col(
                                                        [
                                                            dcc.Dropdown(
                                                                id="food-selector",
                                                                placeholder="Select a food...",
                                                                className="mb-2",
                                                            ),
                                                        ],
                                                        md=6,
                                                    ),
                                                    dbc.Col(
                                                        [
                                                            dbc.InputGroup(
                                                                [
                                                                    dbc.Input(
                                                                        id="ingredient-amount",
                                                                        placeholder="Amount",
                                                                        type="number",
                                                                        min=0,
                                                                        step=0.1,
                                                                    ),
                                                                    dbc.InputGroupText(
                                                                        id="amount-unit",
                                                                        children="g",
                                                                    ),
                                                                ]
                                                            ),
                                                        ],
                                                        md=3,
                                                    ),
                                                    dbc.Col(
                                                        [
                                                            dbc.Button(
                                                                "Add",
                                                                id="add-ingredient-btn",
                                                                color="primary",
                                                                className="w-100",
                                                            ),
                                                        ],
                                                        md=3,
                                                    ),
                                                ]
                                            ),
                                        ],
                                        className="mb-4",
                                    ),
                                    # Ingredients List
                                    html.Div(
                                        [
                                            html.Label("Ingredients", className="form-label"),
                                            html.Div(
                                                id="ingredients-list",
                                                children=[
                                                    html.P(
                                                        "No ingredients added yet.",
                                                        className="text-muted text-center py-3",
                                                    )
                                                ],
                                                className="ingredients-container",
                                            ),
                                        ]
                                    ),
                                    # Totals Display
                                    html.Div(
                                        id="meal-totals",
                                        className="totals-display mt-3",
                                    ),
                                    # Action Buttons
                                    html.Div(
                                        [
                                            dbc.Button(
                                                "Save Meal",
                                                id="save-meal-btn",
                                                color="success",
                                                className="me-2",
                                            ),
                                            dbc.Button(
                                                "Clear",
                                                id="clear-composer-btn",
                                                color="secondary",
                                            ),
                                        ],
                                        className="mt-4",
                                    ),
                                ],
                                className="composer-panel",
                            ),
                        ],
                        md=6,
                    ),
                    # Right Column - Saved Meals
                    dbc.Col(
                        [
                            html.Div(
                                [
                                    html.H3("Saved Meals", className="section-title"),
                                    html.Div(
                                        id="meals-list",
                                        children=[
                                            html.P(
                                                "No meals saved yet.",
                                                className="text-muted text-center py-3",
                                            )
                                        ],
                                        className="meals-container",
                                    ),
                                ],
                                className="meals-panel",
                            ),
                        ],
                        md=6,
                    ),
                ]
            ),
            # Hidden stores
            dcc.Store(id="current-meal-id", data=None),
            dcc.Store(id="composer-ingredients", data=[]),
        ],
        fluid=True,
        className="meal-planner-container",
    )


# Layout function
def layout():
    """Return the page layout with authorization check."""
    if is_authorized():
        return get_meal_planner_layout()
    return get_access_denied_layout(get_current_user_email())


# Callbacks


@callback(
    Output("food-selector", "options", allow_duplicate=True),
    Input("food-selector", "search_value"),
    State("food-selector", "value"),
    prevent_initial_call=True,
)
def update_food_options(search_value, current_value):
    """Update food selector options based on search."""
    if not search_value:
        return no_update

    foods = storage.load_food_database()
    options = []
    for food in foods:
        if search_value.lower() in food.name.lower():
            unit_label = (
                "per 100g"
                if food.unit_type == UnitType.PER_100G
                else f"per {food.serving_size_g}g serving"
            )
            options.append({"label": f"{food.name} ({unit_label})", "value": food.id})
    return options[:10]  # Limit to 10 results


@callback(
    Output("amount-unit", "children"),
    Input("food-selector", "value"),
)
def update_amount_unit(food_id):
    """Update the amount unit based on selected food."""
    if not food_id:
        return "g"

    food = storage.get_food_item(food_id)
    if food and food.unit_type == UnitType.PER_ITEM:
        return "servings"
    return "g"


@callback(
    Output("composer-ingredients", "data", allow_duplicate=True),
    Output("ingredients-list", "children", allow_duplicate=True),
    Output("meal-totals", "children", allow_duplicate=True),
    Input("add-ingredient-btn", "n_clicks"),
    Input("clear-composer-btn", "n_clicks"),
    State("food-selector", "value"),
    State("ingredient-amount", "value"),
    State("composer-ingredients", "data"),
    State("current-meal-id", "data"),
    prevent_initial_call=True,
)
def manage_ingredients(
    add_clicks, clear_clicks, food_id, amount, current_ingredients, current_meal_id
):
    """Add or clear ingredients in the composer."""
    ctx = dash.callback_context
    if not ctx.triggered:
        return current_ingredients, no_update, no_update

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    if trigger_id == "clear-composer-btn":
        return [], create_ingredients_list([]), create_totals_display(Nutrients())

    if trigger_id == "add-ingredient-btn":
        if not food_id or not amount or amount <= 0:
            return no_update, no_update, no_update

        food = storage.get_food_item(food_id)
        if not food:
            return no_update, no_update, no_update

        # Calculate nutrients based on amount
        if food.unit_type == UnitType.PER_100G:
            multiplier = amount / 100
        else:
            multiplier = amount  # servings

        nutrients = Nutrients(
            energy_kcal=food.energy_kcal * multiplier,
            fat_g=food.fat_g * multiplier,
            saturated_fat_g=food.saturated_fat_g * multiplier,
            carbohydrates_g=food.carbohydrates_g * multiplier,
            sugar_g=food.sugar_g * multiplier,
            protein_g=food.protein_g * multiplier,
            fibre_g=food.fibre_g * multiplier,
            salt_g=food.salt_g * multiplier,
            calcium_mg=food.calcium_mg * multiplier,
        )

        ingredient = MealIngredient(
            food_id=food.id,
            food_name=food.name,
            weight_g=amount if food.unit_type == UnitType.PER_100G else None,
            quantity=amount if food.unit_type == UnitType.PER_ITEM else None,
            nutrients=nutrients,
        )

        new_ingredients = current_ingredients + [ingredient.model_dump()]

        return (
            new_ingredients,
            create_ingredients_list(new_ingredients),
            create_totals_display(calculate_totals(new_ingredients)),
        )

    return no_update, no_update, no_update


def create_ingredients_list(ingredients_data):
    """Create the ingredients list display."""
    if not ingredients_data:
        return html.P("No ingredients added yet.", className="text-muted text-center py-3")

    items = []
    for i, ing in enumerate(ingredients_data):
        amount_text = (
            f"{ing['weight_g']}g" if ing.get("weight_g") else f"{ing['quantity']} servings"
        )
        items.append(
            dbc.ListGroupItem(
                [
                    html.Div(
                        [
                            html.Strong(ing["food_name"]),
                            html.Span(f" - {amount_text}", className="text-muted"),
                        ],
                        className="d-flex justify-content-between align-items-center",
                    ),
                    dbc.Button(
                        "×",
                        id={"type": "remove-ingredient", "index": i},
                        color="danger",
                        size="sm",
                        className="btn-close",
                    ),
                ],
                className="d-flex justify-content-between align-items-center",
            )
        )

    return dbc.ListGroup(items, flush=True)


def calculate_totals(ingredients_data):
    """Calculate total nutrients from ingredients."""
    totals = Nutrients(
        energy_kcal=0.0,
        fat_g=0.0,
        saturated_fat_g=0.0,
        carbohydrates_g=0.0,
        sugar_g=0.0,
        protein_g=0.0,
        fibre_g=0.0,
        salt_g=0.0,
        calcium_mg=0.0,
    )
    for ing in ingredients_data:
        nutrients = Nutrients(**ing["nutrients"])
        totals.energy_kcal += nutrients.energy_kcal
        totals.fat_g += nutrients.fat_g
        totals.saturated_fat_g += nutrients.saturated_fat_g
        totals.carbohydrates_g += nutrients.carbohydrates_g
        totals.sugar_g += nutrients.sugar_g
        totals.protein_g += nutrients.protein_g
        totals.fibre_g += nutrients.fibre_g
        totals.salt_g += nutrients.salt_g
        totals.calcium_mg += nutrients.calcium_mg
    return totals


def create_totals_display(totals):
    """Create the totals display."""
    return html.Div(
        [
            html.H5("Nutritional Totals", className="mb-3"),
            dbc.Row(
                [
                    dbc.Col(
                        [
                            html.Div(
                                f"Calories: {totals.energy_kcal:.0f} kcal", className="total-item"
                            ),
                            html.Div(f"Protein: {totals.protein_g:.1f}g", className="total-item"),
                        ]
                    ),
                    dbc.Col(
                        [
                            html.Div(
                                f"Carbs: {totals.carbohydrates_g:.1f}g", className="total-item"
                            ),
                            html.Div(f"Fat: {totals.fat_g:.1f}g", className="total-item"),
                        ]
                    ),
                ]
            ),
        ],
        className="totals-card",
    )


@callback(
    Output("meals-list", "children", allow_duplicate=True),
    Input("save-meal-btn", "n_clicks"),
    Input("meals-list", "children"),  # Dummy input to trigger refresh
    prevent_initial_call="initial_duplicate",
)
def load_meals_list(save_clicks, current_list):
    """Load and display the list of saved meals."""
    meals = storage.load_meals()
    if not meals:
        return html.P("No meals saved yet.", className="text-muted text-center py-3")

    items = []
    for meal in meals:
        totals = meal.calculate_totals()
        items.append(
            dbc.Card(
                [
                    dbc.CardBody(
                        [
                            html.H5(meal.name, className="card-title"),
                            html.P(
                                f"{len(meal.ingredients)} ingredients",
                                className="card-text text-muted",
                            ),
                            html.Small(
                                f"Calories: {totals.energy_kcal:.0f} kcal", className="text-muted"
                            ),
                            html.Div(
                                [
                                    dbc.Button(
                                        "Edit",
                                        id={"type": "edit-meal", "meal_id": meal.id},
                                        color="primary",
                                        size="sm",
                                        className="me-2",
                                    ),
                                    dbc.Button(
                                        "Delete",
                                        id={"type": "delete-meal", "meal_id": meal.id},
                                        color="danger",
                                        size="sm",
                                    ),
                                ],
                                className="mt-2",
                            ),
                        ]
                    ),
                ],
                className="mb-3",
            )
        )

    return items


@callback(
    Output("meal-name", "value"),
    Output("composer-ingredients", "data"),
    Output("ingredients-list", "children"),
    Output("meal-totals", "children"),
    Output("current-meal-id", "data"),
    Input({"type": "edit-meal", "meal_id": dash.ALL}, "n_clicks"),
)
def load_meal_for_editing(edit_clicks):
    """Load a meal into the composer for editing."""
    ctx = dash.callback_context
    if not ctx.triggered or not any(edit_clicks):
        return no_update, no_update, no_update, no_update, no_update

    # Find which button was clicked
    triggered = ctx.triggered[0]
    meal_id = triggered["prop_id"].split('"meal_id":"')[1].split('"')[0]

    meal = storage.get_meal(meal_id)
    if not meal:
        return no_update, no_update, no_update, no_update, no_update

    ingredients_data = [ing.model_dump() for ing in meal.ingredients]

    return (
        meal.name,
        ingredients_data,
        create_ingredients_list(ingredients_data),
        create_totals_display(meal.calculate_totals()),
        meal.id,
    )


@callback(
    Output("meal-name", "value", allow_duplicate=True),
    Output("composer-ingredients", "data", allow_duplicate=True),
    Output("ingredients-list", "children", allow_duplicate=True),
    Output("meal-totals", "children", allow_duplicate=True),
    Output("current-meal-id", "data", allow_duplicate=True),
    Input({"type": "remove-ingredient", "index": dash.ALL}, "n_clicks"),
    State("composer-ingredients", "data"),
    prevent_initial_call=True,
)
def remove_ingredient(remove_clicks, current_ingredients):
    """Remove an ingredient from the composer."""
    ctx = dash.callback_context
    if not ctx.triggered or not any(remove_clicks):
        return no_update, no_update, no_update, no_update, no_update

    # Find which button was clicked
    triggered = ctx.triggered[0]
    index = int(triggered["prop_id"].split('"index":')[1].split("}")[0])

    new_ingredients = [ing for i, ing in enumerate(current_ingredients) if i != index]

    return (
        no_update,
        new_ingredients,
        create_ingredients_list(new_ingredients),
        create_totals_display(calculate_totals(new_ingredients)),
        no_update,
    )


@callback(
    Output("meal-name", "value", allow_duplicate=True),
    Output("composer-ingredients", "data", allow_duplicate=True),
    Output("ingredients-list", "children", allow_duplicate=True),
    Output("meal-totals", "children", allow_duplicate=True),
    Output("current-meal-id", "data", allow_duplicate=True),
    Output("meals-list", "children", allow_duplicate=True),
    Input("save-meal-btn", "n_clicks"),
    State("meal-name", "value"),
    State("composer-ingredients", "data"),
    State("current-meal-id", "data"),
    prevent_initial_call=True,
)
def save_meal(save_clicks, meal_name, ingredients_data, current_meal_id):
    """Save the current meal."""
    if not save_clicks or not meal_name or not ingredients_data:
        return no_update, no_update, no_update, no_update, no_update, no_update

    ingredients = [MealIngredient(**ing) for ing in ingredients_data]

    if current_meal_id:
        # Update existing meal
        meal = Meal(id=current_meal_id, name=meal_name, ingredients=ingredients)
    else:
        # Create new meal
        meal = Meal(name=meal_name, ingredients=ingredients)

    storage.save_meal(meal)

    # Clear composer
    return (
        "",
        [],
        create_ingredients_list([]),
        create_totals_display(Nutrients()),
        None,
        load_meals_list(1, None),
    )


@callback(
    Output("meals-list", "children", allow_duplicate=True),
    Input({"type": "delete-meal", "meal_id": dash.ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def delete_meal(delete_clicks):
    """Delete a meal."""
    ctx = dash.callback_context
    if not ctx.triggered or not any(delete_clicks):
        return no_update

    # Find which button was clicked
    triggered = ctx.triggered[0]
    meal_id = triggered["prop_id"].split('"meal_id":"')[1].split('"')[0]

    storage.delete_meal(meal_id)

    return load_meals_list(1, None)
