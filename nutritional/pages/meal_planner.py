"""Meal planner page for creating and managing meal templates."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html, no_update

from nutritional.auth_utils import (
    get_access_denied_layout,
    get_current_user_email,
    is_authorized,
)
from nutritional.component_ids import ID, get_id

MEAL_PLANNER_PREFIX = "meal-planner"
from nutritional.components import (
    create_empty_state,
    create_ingredients_list,
    create_meal_card,
    create_nutrient_totals,
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
    """Return the meal planner layout.

    Uses a 2-column mise-en-place grid matching the entry screen's visual style.
    Both columns are styled consistently with section-label headers.
    """
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
            # Main Content - Mise-en-place 2-Column Layout
            html.Div(
                [
                    # Column 1: Meal Composer
                    html.Div(
                        [
                            html.Div("MEAL COMPOSER", className="section-label"),
                            # Meal Name Input
                            html.Div(
                                [
                                    dbc.Input(
                                        id=get_id(ID.MEAL_NAME, MEAL_PLANNER_PREFIX),
                                        placeholder="Meal name (e.g., Breakfast Smoothie)",
                                        type="text",
                                    ),
                                ],
                                className="action-row",
                                style={"marginBottom": "12px"},
                            ),
                            # Food Selector
                            html.Div(
                                [
                                    dcc.Dropdown(
                                        id=get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX),
                                        placeholder="Search for a food...",
                                        searchable=True,
                                        className="food-selector-full-width",
                                    ),
                                ],
                                className="action-row",
                                style={"marginBottom": "8px"},
                            ),
                            # Amount input row
                            html.Div(
                                [
                                    dbc.Input(
                                        id=get_id(ID.INGREDIENT_AMOUNT, MEAL_PLANNER_PREFIX),
                                        placeholder="Amount",
                                        type="number",
                                        min=0,
                                        step=0.1,
                                        style={"flex": "1"},
                                    ),
                                    # Hidden element to store unit type
                                    html.Div(
                                        id=get_id(ID.AMOUNT_UNIT, MEAL_PLANNER_PREFIX),
                                        style={"display": "none"},
                                    ),
                                    dbc.Button(
                                        "Add",
                                        id=get_id(ID.ADD_INGREDIENT_BTN, MEAL_PLANNER_PREFIX),
                                        color="primary",
                                    ),
                                ],
                                className="action-row action-row-flex",
                                style={"marginBottom": "12px"},
                            ),
                            # Ingredients List - only shown when there are ingredients
                            html.Div(id=get_id(ID.INGREDIENTS_LIST, MEAL_PLANNER_PREFIX)),
                            # Totals Display - styled like entry screen nutrients preview
                            html.Div(id=get_id(ID.MEAL_TOTALS, MEAL_PLANNER_PREFIX)),
                            # Action Buttons
                            html.Div(
                                [
                                    dbc.Button(
                                        "Save Meal",
                                        id=get_id(ID.SAVE_MEAL_BTN, MEAL_PLANNER_PREFIX),
                                        color="success",
                                        className="me-2",
                                    ),
                                    dbc.Button(
                                        "Clear",
                                        id=get_id(ID.CLEAR_COMPOSER_BTN, MEAL_PLANNER_PREFIX),
                                        color="secondary",
                                    ),
                                ],
                                className="mt-3",
                            ),
                        ],
                        className="mise-planner-column",
                    ),
                    # Column 2: Saved Meals
                    html.Div(
                        [
                            html.Div("SAVED MEALS", className="section-label"),
                            html.Div(
                                id=get_id(ID.MEALS_LIST, MEAL_PLANNER_PREFIX),
                                className="saved-meals-list",
                            ),
                        ],
                        className="mise-planner-column",
                    ),
                ],
                className="mise-planner-container",
            ),
            # Hidden stores
            dcc.Store(id=get_id(ID.CURRENT_MEAL_ID, MEAL_PLANNER_PREFIX), data=None),
            dcc.Store(id=get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), data=[]),
        ],
        fluid=True,
        id=get_id(ID.MEAL_PLANNER_CONTAINER, MEAL_PLANNER_PREFIX),
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
    Output(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "options", allow_duplicate=True),
    Input(get_id(ID.MEAL_PLANNER_CONTAINER, MEAL_PLANNER_PREFIX), "id"),
    prevent_initial_call="initial_duplicate",
)
def load_food_options(container_id):
    """Load all available food options on page load."""
    foods = storage.load_food_database()
    options = []
    for food in foods:
        unit_label = (
            "per 100g"
            if food.unit_type == UnitType.PER_100G
            else f"per {food.serving_size_g}g serving"
        )
        options.append({"label": f"{food.name} ({unit_label})", "value": food.id})
    return options


@callback(
    Output(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "options", allow_duplicate=True),
    Input(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "search_value"),
    State(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "value"),
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
    Output(get_id(ID.AMOUNT_UNIT, MEAL_PLANNER_PREFIX), "children"),
    Output(get_id(ID.INGREDIENT_AMOUNT, MEAL_PLANNER_PREFIX), "placeholder"),
    Input(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "value"),
)
def update_amount_placeholder(food_id):
    """Update the amount input placeholder based on selected food."""
    if not food_id:
        return "g", "Weight in grams"

    food = storage.get_food_item(food_id)
    if food and food.unit_type == UnitType.PER_ITEM:
        return "servings", f"Servings ({food.serving_size_g}g each)"
    return "g", "Weight in grams"


@callback(
    Output(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data", allow_duplicate=True),
    Output(get_id(ID.INGREDIENTS_LIST, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Output(get_id(ID.MEAL_TOTALS, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Output(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "value", allow_duplicate=True),
    Output(get_id(ID.INGREDIENT_AMOUNT, MEAL_PLANNER_PREFIX), "value", allow_duplicate=True),
    Input(get_id(ID.ADD_INGREDIENT_BTN, MEAL_PLANNER_PREFIX), "n_clicks"),
    Input(get_id(ID.CLEAR_COMPOSER_BTN, MEAL_PLANNER_PREFIX), "n_clicks"),
    State(get_id(ID.FOOD_SELECTOR, MEAL_PLANNER_PREFIX), "value"),
    State(get_id(ID.INGREDIENT_AMOUNT, MEAL_PLANNER_PREFIX), "value"),
    State(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data"),
    State(get_id(ID.CURRENT_MEAL_ID, MEAL_PLANNER_PREFIX), "data"),
    prevent_initial_call=True,
)
def manage_ingredients(
    add_clicks, clear_clicks, food_id, amount, current_ingredients, current_meal_id
):
    """Add or clear ingredients in the composer."""
    ctx = dash.callback_context
    if not ctx.triggered:
        return no_update, no_update, no_update, no_update, no_update

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    if trigger_id == get_id(ID.CLEAR_COMPOSER_BTN, MEAL_PLANNER_PREFIX):
        return [], None, None, None, None

    if trigger_id == get_id(ID.ADD_INGREDIENT_BTN, MEAL_PLANNER_PREFIX):
        # Ensure current_ingredients is a list
        if current_ingredients is None:
            current_ingredients = []

        # Validate inputs
        if not food_id:
            return no_update, no_update, no_update, no_update, no_update

        if amount is None or amount <= 0:
            return no_update, no_update, no_update, no_update, no_update

        food = storage.get_food_item(food_id)
        if not food:
            return no_update, no_update, no_update, no_update, no_update

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
        totals = calculate_totals(new_ingredients)

        return (
            new_ingredients,
            create_ingredients_list(new_ingredients),
            create_nutrient_totals(totals),
            None,  # Clear food selector
            None,  # Clear amount input
        )

    return no_update, no_update, no_update, no_update, no_update


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


@callback(
    Output(get_id(ID.MEALS_LIST, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Input(get_id(ID.SAVE_MEAL_BTN, MEAL_PLANNER_PREFIX), "n_clicks"),
    Input(get_id(ID.MEALS_LIST, MEAL_PLANNER_PREFIX), "children"),  # Dummy input to trigger refresh
    prevent_initial_call="initial_duplicate",
)
def load_meals_list(save_clicks, current_list):
    """Load and display the list of saved meals."""
    meals = storage.load_meals()
    if not meals:
        return create_empty_state("No meals saved yet. Create your first meal using the composer.")

    items = []
    for meal in meals:
        totals = meal.calculate_totals()
        items.append(
            create_meal_card(
                meal_id=meal.id,
                name=meal.name,
                ingredient_count=len(meal.ingredients),
                total_calories=totals.energy_kcal,
            )
        )

    return html.Div(items)


@callback(
    Output(get_id(ID.MEAL_NAME, MEAL_PLANNER_PREFIX), "value"),
    Output(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data"),
    Output(get_id(ID.INGREDIENTS_LIST, MEAL_PLANNER_PREFIX), "children"),
    Output(get_id(ID.MEAL_TOTALS, MEAL_PLANNER_PREFIX), "children"),
    Output(get_id(ID.CURRENT_MEAL_ID, MEAL_PLANNER_PREFIX), "data"),
    Input({"type": "meal-card", "meal_id": dash.ALL}, "n_clicks"),
)
def load_meal_for_editing(meal_clicks):
    """Load a meal into the composer for editing when clicked."""
    ctx = dash.callback_context
    if not ctx.triggered or not any(meal_clicks):
        return no_update, no_update, no_update, no_update, no_update

    # Find which meal card was clicked
    triggered = ctx.triggered[0]
    meal_id = triggered["prop_id"].split('"meal_id":"')[1].split('"')[0]

    meal = storage.get_meal(meal_id)
    if not meal:
        return no_update, no_update, no_update, no_update, no_update

    ingredients_data = [ing.model_dump() for ing in meal.ingredients]
    totals = meal.calculate_totals()

    return (
        meal.name,
        ingredients_data,
        create_ingredients_list(ingredients_data),
        create_nutrient_totals(totals),
        meal.id,
    )


@callback(
    Output(get_id(ID.MEAL_NAME, MEAL_PLANNER_PREFIX), "value", allow_duplicate=True),
    Output(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data", allow_duplicate=True),
    Output(get_id(ID.INGREDIENTS_LIST, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Output(get_id(ID.MEAL_TOTALS, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Output(get_id(ID.CURRENT_MEAL_ID, MEAL_PLANNER_PREFIX), "data", allow_duplicate=True),
    Input({"type": "remove-ingredient", "index": dash.ALL}, "n_clicks"),
    State(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data"),
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
    totals = calculate_totals(new_ingredients) if new_ingredients else None

    return (
        no_update,
        new_ingredients,
        create_ingredients_list(new_ingredients),
        create_nutrient_totals(totals) if totals else None,
        no_update,
    )


@callback(
    Output(get_id(ID.MEAL_NAME, MEAL_PLANNER_PREFIX), "value", allow_duplicate=True),
    Output(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data", allow_duplicate=True),
    Output(get_id(ID.INGREDIENTS_LIST, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Output(get_id(ID.MEAL_TOTALS, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Output(get_id(ID.CURRENT_MEAL_ID, MEAL_PLANNER_PREFIX), "data", allow_duplicate=True),
    Output(get_id(ID.MEALS_LIST, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
    Input(get_id(ID.SAVE_MEAL_BTN, MEAL_PLANNER_PREFIX), "n_clicks"),
    State(get_id(ID.MEAL_NAME, MEAL_PLANNER_PREFIX), "value"),
    State(get_id(ID.COMPOSER_INGREDIENTS, MEAL_PLANNER_PREFIX), "data"),
    State(get_id(ID.CURRENT_MEAL_ID, MEAL_PLANNER_PREFIX), "data"),
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

    # Clear composer and refresh meals list
    return (
        "",
        [],
        None,
        None,
        None,
        load_meals_list(1, None),
    )


@callback(
    Output(get_id(ID.MEALS_LIST, MEAL_PLANNER_PREFIX), "children", allow_duplicate=True),
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
