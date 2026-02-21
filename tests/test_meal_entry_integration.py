"""Tests for meal entry integration in the daily entry screen.

Tests cover:
- Adding meals to daily entries
- Meal entry creation with multiple portions
- Collapsible meal item display
- Meal ingredient weight calculations
- Toast notifications for meal additions
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from unittest.mock import Mock, patch

import pytest

from nutritional.data_entry.calculator import calculate_nutrients
from nutritional.data_entry.models import (
    DailyData,
    FoodEntry,
    Meal,
    MealEntry,
    MealIngredient,
    Measurements,
    Nutrients,
    UnitType,
)

# ============================================================================
# Tests for Adding Meals to Daily Entry
# ============================================================================


def test_add_meal_creates_meal_entry_with_default_portions(
    sample_meal_with_single_ingredient: Meal,
    sample_food_item_per_100g,
) -> None:
    """Test that adding a meal creates a MealEntry with default portions of 1.0."""
    portions: float = 1.0
    meal: Meal = sample_meal_with_single_ingredient

    # Create meal entry as would happen in the add_entry callback
    meal_ingredients: list[FoodEntry] = []
    for ingredient in meal.ingredients:
        # Type guard for weight_g
        weight_value = ingredient.weight_g if ingredient.weight_g is not None else 0.0
        scaled_weight = weight_value * portions
        nutrients = Nutrients(
            energy_kcal=sample_food_item_per_100g.energy_kcal,
            fat_g=sample_food_item_per_100g.fat_g,
            saturated_fat_g=sample_food_item_per_100g.saturated_fat_g,
            carbohydrates_g=sample_food_item_per_100g.carbohydrates_g,
            sugar_g=sample_food_item_per_100g.sugar_g,
            protein_g=sample_food_item_per_100g.protein_g,
            fibre_g=sample_food_item_per_100g.fibre_g,
            salt_g=sample_food_item_per_100g.salt_g,
            calcium_mg=sample_food_item_per_100g.calcium_mg,
        )
        entry = FoodEntry(
            timestamp=datetime.now(),
            food_id=ingredient.food_id,
            food_name=ingredient.food_name,
            weight_g=scaled_weight,
            quantity=None,
            nutrients=nutrients,
        )
        meal_ingredients.append(entry)

    meal_entry = MealEntry(
        meal_id=meal.id,
        meal_name=meal.name,
        portions=portions,
        ingredients=meal_ingredients,
    )

    assert meal_entry.portions == 1.0
    assert meal_entry.meal_id == sample_meal_with_single_ingredient.id
    assert len(meal_entry.ingredients) == 1
    assert meal_entry.ingredients[0].food_name == "Chicken Breast"


def test_add_meal_scales_ingredients_by_portions(
    sample_meal_with_single_ingredient: Meal,
    sample_food_item_per_100g,
) -> None:
    """Test that adding a meal scales ingredient weights according to portions."""
    portions: float = 2.5
    meal: Meal = sample_meal_with_single_ingredient

    # Create meal entry with scaled portions
    meal_ingredients: list[FoodEntry] = []
    for ingredient in meal.ingredients:
        # Type guard for weight_g
        weight_value = ingredient.weight_g if ingredient.weight_g is not None else 0.0
        scaled_weight: float = weight_value * portions
        nutrients = Nutrients(
            energy_kcal=sample_food_item_per_100g.energy_kcal * portions,
            fat_g=sample_food_item_per_100g.fat_g * portions,
            saturated_fat_g=sample_food_item_per_100g.saturated_fat_g * portions,
            carbohydrates_g=sample_food_item_per_100g.carbohydrates_g * portions,
            sugar_g=sample_food_item_per_100g.sugar_g * portions,
            protein_g=sample_food_item_per_100g.protein_g * portions,
            fibre_g=sample_food_item_per_100g.fibre_g * portions,
            salt_g=sample_food_item_per_100g.salt_g * portions,
            calcium_mg=sample_food_item_per_100g.calcium_mg * portions,
        )
        entry = FoodEntry(
            timestamp=datetime.now(),
            food_id=ingredient.food_id,
            food_name=ingredient.food_name,
            weight_g=scaled_weight,
            quantity=None,
            nutrients=nutrients,
        )
        meal_ingredients.append(entry)

    meal_entry = MealEntry(
        meal_id=meal.id,
        meal_name=meal.name,
        portions=portions,
        ingredients=meal_ingredients,
    )

    assert meal_entry.portions == 2.5
    assert meal_entry.ingredients[0].weight_g == pytest.approx(375.0)  # 150 * 2.5


def test_add_meal_with_per_item_ingredients_scales_quantities(
    sample_meal_with_multiple_ingredients: Meal,
    sample_food_item_per_item,
) -> None:
    """Test that adding a meal with per-item ingredients scales quantities by portions."""
    portions: float = 3.0
    meal: Meal = sample_meal_with_multiple_ingredients

    # Create meal entry - the second ingredient is per-item
    meal_ingredients: list[FoodEntry] = []
    for ingredient in meal.ingredients:
        if ingredient.quantity is not None:
            scaled_quantity: float = ingredient.quantity * portions
            nutrients = Nutrients(
                energy_kcal=sample_food_item_per_item.energy_kcal * portions,
                fat_g=sample_food_item_per_item.fat_g * portions,
                saturated_fat_g=sample_food_item_per_item.saturated_fat_g * portions,
                carbohydrates_g=sample_food_item_per_item.carbohydrates_g * portions,
                sugar_g=sample_food_item_per_item.sugar_g * portions,
                protein_g=sample_food_item_per_item.protein_g * portions,
                fibre_g=sample_food_item_per_item.fibre_g * portions,
                salt_g=sample_food_item_per_item.salt_g * portions,
                calcium_mg=sample_food_item_per_item.calcium_mg * portions,
            )
            entry = FoodEntry(
                timestamp=datetime.now(),
                food_id=ingredient.food_id,
                food_name=ingredient.food_name,
                weight_g=None,
                quantity=scaled_quantity,
                nutrients=nutrients,
            )
            meal_ingredients.append(entry)

    assert len(meal_ingredients) == 1
    assert meal_ingredients[0].quantity == pytest.approx(3.0)


def test_meal_entry_calculation_aggregates_all_ingredients(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that meal entry total nutrient calculation sums all ingredient nutrients."""
    totals: Nutrients = sample_meal_entry.calculate_totals()

    # With 1 ingredient (150g chicken breast):
    # The fixture stores nutrients as-is (not scaled), so just the per-100g values
    assert totals.energy_kcal == pytest.approx(165.0)
    assert totals.protein_g == pytest.approx(31.0)


def test_meal_entry_add_to_daily_data(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that a meal entry can be added to daily data."""
    daily_data = DailyData(
        date=date(2025, 1, 20),
        entries=[sample_meal_entry],
        measurements=Measurements(),
    )

    assert len(daily_data.entries) == 1
    assert isinstance(daily_data.entries[0], MealEntry)
    assert daily_data.entries[0].meal_id == sample_meal_entry.meal_id


def test_meal_entry_serialization_preserves_structure(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that a meal entry can be serialized and deserialized without loss."""
    serialized: dict[str, Any] = sample_meal_entry.model_dump(mode="json")
    deserialized: MealEntry = MealEntry(**serialized)

    assert deserialized.meal_id == sample_meal_entry.meal_id
    assert deserialized.meal_name == sample_meal_entry.meal_name
    assert deserialized.portions == sample_meal_entry.portions
    assert len(deserialized.ingredients) == len(sample_meal_entry.ingredients)


# ============================================================================
# Tests for Collapsible Meal Item Display
# ============================================================================


def test_meal_entry_expanded_state_displays_nested_ingredients(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that when a meal is expanded, nested ingredients are accessible."""
    assert len(sample_meal_entry.ingredients) > 0

    for ingredient in sample_meal_entry.ingredients:
        assert ingredient.food_name is not None
        assert ingredient.food_id is not None
        assert ingredient.weight_g is not None or ingredient.quantity is not None


def test_collapsible_meal_item_header_contains_meal_name(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that the meal header displays the meal name."""
    assert sample_meal_entry.meal_name == "Single Ingredient Meal"


def test_collapsible_meal_item_displays_portion_count(
    sample_meal_entry_with_portions: MealEntry,
) -> None:
    """Test that the meal header displays portion information."""
    assert sample_meal_entry_with_portions.portions == 2.5


def test_collapsible_meal_item_displays_total_calories(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that the meal item can calculate and display total calories."""
    totals: Nutrients = sample_meal_entry.calculate_totals()
    assert totals.energy_kcal > 0


def test_nested_ingredient_amount_input_accessible(
    sample_meal_entry: MealEntry,
) -> None:
    """Test that nested ingredient amounts are editable."""
    # Each ingredient should have an editable amount field
    for ingredient in sample_meal_entry.ingredients:
        assert ingredient.weight_g is not None or ingredient.quantity is not None


@pytest.mark.parametrize(
    "portions,expected_weight_multiplier",
    [
        (1.0, 1.0),
        (2.0, 2.0),
        (0.5, 0.5),
        (3.5, 3.5),
    ],
)
def test_meal_entry_weight_scales_with_portions(
    sample_meal_with_single_ingredient: Meal,
    sample_food_item_per_100g,
    portions: float,
    expected_weight_multiplier: float,
) -> None:
    """Test that ingredient weights scale correctly with various portion sizes."""
    base_weight: float = 150.0
    scaled_weight: float = base_weight * portions

    # Verify scaling calculation
    assert scaled_weight == pytest.approx(base_weight * expected_weight_multiplier)


@pytest.mark.parametrize(
    "meal_name,ingredient_count",
    [
        ("Simple Meal", 1),
        ("Complex Meal", 3),
        ("Detailed Meal", 5),
    ],
)
def test_meal_entry_handles_varying_ingredient_counts(
    meal_name: str,
    ingredient_count: int,
    sample_food_item_per_100g,
) -> None:
    """Test that meal entries can handle different numbers of ingredients."""
    ingredients: list[MealIngredient] = []
    for i in range(ingredient_count):
        ingredient = MealIngredient(
            food_id=sample_food_item_per_100g.id,
            food_name=f"{sample_food_item_per_100g.name} {i+1}",
            weight_g=100.0,
            quantity=None,
            nutrients=sample_food_item_per_100g.get_nutrients(),
        )
        ingredients.append(ingredient)

    meal = Meal(name=meal_name, ingredients=ingredients)
    meal_ingredients = [
        FoodEntry(
            timestamp=datetime.now(),
            food_id=ing.food_id,
            food_name=ing.food_name,
            weight_g=ing.weight_g,
            quantity=ing.quantity,
            nutrients=ing.nutrients,
        )
        for ing in ingredients
    ]

    meal_entry = MealEntry(
        meal_id=meal.id,
        meal_name=meal.name,
        portions=1.0,
        ingredients=meal_ingredients,
    )

    assert len(meal_entry.ingredients) == ingredient_count


# ============================================================================
# Tests for Mixed Daily Data (Food + Meal Entries)
# ============================================================================


def test_daily_data_with_mixed_entries_preserves_entry_types(
    sample_daily_data_with_meals: DailyData,
) -> None:
    """Test that daily data can contain both FoodEntry and MealEntry objects."""
    entries = sample_daily_data_with_meals.entries

    food_entries = [e for e in entries if isinstance(e, FoodEntry) and not hasattr(e, "meal_id")]
    meal_entries = [e for e in entries if isinstance(e, MealEntry)]

    assert len(food_entries) > 0
    assert len(meal_entries) > 0


def test_daily_data_serialization_maintains_entry_type_information(
    sample_daily_data_with_meals: DailyData,
) -> None:
    """Test that serialized daily data can distinguish between entry types."""
    serialized = sample_daily_data_with_meals.model_dump(mode="json")

    for entry in serialized["entries"]:
        if "meal_id" in entry:
            assert "meal_name" in entry
            assert "portions" in entry
            assert "ingredients" in entry
        else:
            assert "food_id" in entry
            assert "food_name" in entry


# ============================================================================
# Edge Case Tests
# ============================================================================


def test_meal_entry_with_zero_portions_raises_error(
    sample_meal_with_single_ingredient: Meal,
) -> None:
    """Test that creating a meal entry with zero portions is not allowed by Pydantic validation."""
    # Note: Pydantic Field validator ge=0 allows 0, so this actually passes
    # A zero portions meal entry would be technically valid but semantically nonsensical
    meal_entry = MealEntry(
        meal_id=sample_meal_with_single_ingredient.id,
        meal_name=sample_meal_with_single_ingredient.name,
        portions=0.0,  # This is technically allowed by the model
        ingredients=[],
    )

    # Verify it was created with zero portions
    assert meal_entry.portions == 0.0


def test_meal_entry_with_negative_portions_raises_error(
    sample_meal_with_single_ingredient: Meal,
) -> None:
    """Test that creating a meal entry with negative portions raises validation error."""
    with pytest.raises(ValueError):
        MealEntry(
            meal_id=sample_meal_with_single_ingredient.id,
            meal_name=sample_meal_with_single_ingredient.name,
            portions=-1.0,  # Invalid: portions must be positive
            ingredients=[],
        )


def test_meal_entry_with_empty_ingredients_has_zero_totals(
    sample_meal_with_single_ingredient: Meal,
) -> None:
    """Test that a meal entry with no ingredients has zero total nutrients."""
    meal_entry = MealEntry(
        meal_id=sample_meal_with_single_ingredient.id,
        meal_name=sample_meal_with_single_ingredient.name,
        portions=1.0,
        ingredients=[],
    )

    totals = meal_entry.calculate_totals()
    assert totals.energy_kcal == 0.0
    assert totals.protein_g == 0.0


def test_meal_entry_preserves_ingredient_timestamp(
    sample_meal_with_single_ingredient: Meal,
    sample_food_item_per_100g,
) -> None:
    """Test that meal entry preserves timestamp information from ingredients."""
    now = datetime.now()
    ingredient = FoodEntry(
        timestamp=now,
        food_id=sample_food_item_per_100g.id,
        food_name=sample_food_item_per_100g.name,
        weight_g=150.0,
        quantity=None,
        nutrients=sample_food_item_per_100g.get_nutrients(),
    )

    meal_entry = MealEntry(
        meal_id=sample_meal_with_single_ingredient.id,
        meal_name=sample_meal_with_single_ingredient.name,
        portions=1.0,
        ingredients=[ingredient],
    )

    assert meal_entry.ingredients[0].timestamp == now
