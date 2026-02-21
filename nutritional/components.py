"""Shared UI components for consistent visual design across pages.

These components follow the brand guidelines - natural items on paper,
precision typography, material honesty, and zen essentialism.
"""

from dash import html

from nutritional.data_entry.models import Nutrients

# Nutrient color palette - based on brand guidelines (Nihonga data palette)
NUTRIENT_COLORS = {
    "energy_kcal": ("#2B2B2B", "kcal"),  # Sumi Iron - neutral
    "fat_g": ("#BF6B59", "g"),  # Baked Clay
    "saturated_fat_g": ("#E09F91", "g"),  # Dusty Salmon
    "carbohydrates_g": ("#C8963E", "g"),  # Antique Gold
    "sugar_g": ("#EBC374", "g"),  # Pale Amber
    "protein_g": ("#2C4C5B", "g"),  # Iron Blue
    "fibre_g": ("#4F6D46", "g"),  # Aged Pine
    "salt_g": ("#7C6A88", "g"),  # Oxidized Ube
    "calcium_mg": ("#6B7F82", "mg"),  # Stone Grey
}

NUTRIENT_LABELS = {
    "energy_kcal": "Energy",
    "fat_g": "Fat",
    "saturated_fat_g": "Saturated Fat",
    "carbohydrates_g": "Carbohydrates",
    "sugar_g": "Sugar",
    "protein_g": "Protein",
    "fibre_g": "Fibre",
    "salt_g": "Salt",
    "calcium_mg": "Calcium",
}


def create_nutrient_preview(nutrients: Nutrients) -> html.Div:
    """Create a styled nutrient preview display.

    This component shows calculated nutrients in a clean, paper-like card
    that matches the brand guidelines. Used when previewing food additions
    in both the daily entry and meal planner screens.

    Args:
        nutrients: The Nutrients object containing all nutrient values.

    Returns:
        A styled html.Div containing the nutrient display.
    """
    nutrient_items = []

    nutrient_order = [
        "energy_kcal",
        "fat_g",
        "saturated_fat_g",
        "carbohydrates_g",
        "sugar_g",
        "protein_g",
        "fibre_g",
        "salt_g",
        "calcium_mg",
    ]

    for field in nutrient_order:
        color, unit = NUTRIENT_COLORS[field]
        label = NUTRIENT_LABELS[field]
        value = getattr(nutrients, field)

        nutrient_items.append(
            html.Div(
                [
                    html.Span(
                        "",
                        className="nutrient-dot",
                        style={
                            "display": "inline-block",
                            "width": "10px",
                            "height": "10px",
                            "borderRadius": "50%",
                            "backgroundColor": color,
                            "marginRight": "8px",
                            "flexShrink": "0",
                        },
                    ),
                    html.Span(
                        f"{label}: ",
                        className="nutrient-label",
                    ),
                    html.Span(
                        f"{value:.1f} {unit}",
                        className="nutrient-value",
                    ),
                ],
                className="nutrient-preview-item",
            )
        )

    return html.Div(
        nutrient_items,
        className="nutrient-preview-card",
    )


def create_nutrient_totals(nutrients: Nutrients) -> html.Div | None:
    """Create nutrient totals display for meal composition.

    This now uses the same visual style as create_nutrient_preview
    for consistency with the entry screen.

    Args:
        nutrients: The Nutrients object containing totals.

    Returns:
        A styled html.Div with the totals, or None if empty.
    """
    if nutrients.energy_kcal == 0:
        return None

    # Use the same style as create_nutrient_preview for consistency
    return create_nutrient_preview(nutrients)


def create_ingredient_item(
    name: str,
    amount_text: str,
    calories: float,
    index: int,
    remove_button_type: str = "remove-ingredient",
) -> html.Div:
    """Create a single ingredient item row.

    This component displays an ingredient in a clean list format matching
    the daily entry ingredient list style.

    Args:
        name: The food name.
        amount_text: The formatted amount (e.g., "150g" or "2 servings").
        calories: The calorie value.
        index: The index for the remove button callback.
        remove_button_type: The pattern-matching type for the remove button.

    Returns:
        A styled html.Div representing the ingredient row.
    """
    return html.Div(
        [
            html.Div(
                [
                    html.Div(name, className="ingredient-name"),
                    html.Div(amount_text, className="ingredient-weight"),
                ],
                className="ingredient-item-header",
            ),
            html.Span(
                f"{calories:.0f} kcal",
                className="ingredient-calories",
            ),
            html.Span(
                "×",
                className="delete-icon",
                id={"type": remove_button_type, "index": index},
                n_clicks=0,
                title="Remove",
            ),
        ],
        className="ingredient-item",
    )


def create_ingredients_list(ingredients_data: list) -> html.Div | None:
    """Create the ingredients list display for meal composition.

    Only renders content when there are ingredients - no empty placeholder box.
    This follows the brand guideline of zen essentialism.

    Args:
        ingredients_data: List of ingredient dictionaries with food_name,
            weight_g/quantity, and nutrients.

    Returns:
        A styled html.Div with the ingredients list, or None if empty.
    """
    if not ingredients_data:
        return None

    items = []
    for i, ing in enumerate(ingredients_data):
        amount_text = (
            f"{ing['weight_g']}g" if ing.get("weight_g") else f"{ing['quantity']} servings"
        )
        calories = ing.get("nutrients", {}).get("energy_kcal", 0)

        items.append(
            create_ingredient_item(
                name=ing["food_name"],
                amount_text=amount_text,
                calories=calories,
                index=i,
            )
        )

    return html.Div(items, className="ingredients-list")


def create_meal_card(
    meal_id: str,
    name: str,
    ingredient_count: int,
    total_calories: float,
    show_actions: bool = True,
) -> html.Div:
    """Create a meal card for the saved meals list.

    Styled to match food database items - simple clickable list items
    with just the name, metadata, and calorie count.

    Args:
        meal_id: The unique meal identifier.
        name: The meal name.
        ingredient_count: Number of ingredients in the meal.
        total_calories: Total calories for the meal.
        show_actions: Kept for API compatibility, not used.

    Returns:
        A styled html.Div representing the meal card.
    """
    # Simple row matching ingredient-item pattern
    return html.Div(
        [
            html.Div(
                [
                    html.Div(name, className="ingredient-name"),
                    html.Div(
                        f"{ingredient_count} ingredient{'s' if ingredient_count != 1 else ''}",
                        className="ingredient-weight",
                    ),
                ],
                className="ingredient-item-header",
            ),
            html.Span(
                f"{total_calories:.0f} kcal",
                className="ingredient-calories",
            ),
        ],
        className="ingredient-item",
        id={"type": "meal-card", "meal_id": meal_id},
        n_clicks=0,
        style={"cursor": "pointer"},
    )


def create_empty_state(message: str) -> html.P:
    """Create an empty state message.

    Used when there are no items to display. Follows zen essentialism -
    just a simple text message, no decorative boxes.

    Args:
        message: The message to display.

    Returns:
        A styled paragraph element.
    """
    return html.P(message, className="empty-state-message")
