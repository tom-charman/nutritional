"""Nutrient calculation functions."""

from nutritional.data_entry.models import FoodEntry, FoodItem, Nutrients, UnitType


def calculate_nutrients(
    food_item: FoodItem,
    weight_g: float | None = None,
    quantity: float | None = None,
) -> Nutrients:
    """Calculate nutrients based on unit type.

    Args:
        food_item: The food item with nutrient data
        weight_g: Weight in grams (for per_100g items)
        quantity: Number of items (for per_item items)

    Returns:
        Nutrients object with calculated values

    Raises:
        ValueError: If incorrect parameters are provided for the unit type
    """
    if food_item.unit_type == UnitType.PER_100G:
        if weight_g is None:
            raise ValueError("weight_g is required for per_100g items")
        multiplier = weight_g / 100.0
    elif food_item.unit_type == UnitType.PER_ITEM:
        if quantity is None:
            raise ValueError("quantity is required for per_item items")
        multiplier = quantity
    else:
        raise ValueError(f"Unknown unit type: {food_item.unit_type}")

    return Nutrients(
        energy_kcal=food_item.energy_kcal * multiplier,
        fat_g=food_item.fat_g * multiplier,
        saturated_fat_g=food_item.saturated_fat_g * multiplier,
        carbohydrates_g=food_item.carbohydrates_g * multiplier,
        sugar_g=food_item.sugar_g * multiplier,
        protein_g=food_item.protein_g * multiplier,
        fibre_g=food_item.fibre_g * multiplier,
        salt_g=food_item.salt_g * multiplier,
        calcium_mg=food_item.calcium_mg * multiplier,
    )


def calculate_daily_totals(entries: list[FoodEntry]) -> Nutrients:
    """Sum all food entry nutrients for the day.

    Args:
        entries: List of food entries

    Returns:
        Nutrients object with total values
    """
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
            totals[nutrient] += getattr(entry.nutrients, nutrient)

    return Nutrients(**totals)
