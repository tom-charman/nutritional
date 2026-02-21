"""Tests for the meal planner page."""

from unittest.mock import Mock, patch

import pytest
from dash import no_update

from nutritional.components import (
    create_ingredients_list,
    create_nutrient_totals,
)
from nutritional.data_entry.models import FoodItem, MealIngredient, Nutrients, UnitType

# Mock auth and dash before importing
with (
    patch("nutritional.auth_utils.load_authorized_users", return_value={"test@example.com"}),
    patch("dash.register_page"),
):
    from nutritional.pages.meal_planner import (
        calculate_totals,
        load_meals_list,
        update_amount_placeholder,
        update_food_options,
    )


class TestMealPlannerHelpers:
    """Test helper functions for meal planner."""

    def test_calculate_totals_empty_list(self):
        """Test calculating totals with empty ingredients list."""
        result = calculate_totals([])
        expected = Nutrients(
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
        assert result == expected

    def test_calculate_totals_single_ingredient(self):
        """Test calculating totals with one ingredient."""
        ingredients = [
            {
                "nutrients": {
                    "energy_kcal": 100.0,
                    "fat_g": 5.0,
                    "saturated_fat_g": 2.0,
                    "carbohydrates_g": 10.0,
                    "sugar_g": 5.0,
                    "protein_g": 15.0,
                    "fibre_g": 2.0,
                    "salt_g": 0.5,
                    "calcium_mg": 100.0,
                }
            }
        ]
        result = calculate_totals(ingredients)
        expected = Nutrients(
            energy_kcal=100.0,
            fat_g=5.0,
            saturated_fat_g=2.0,
            carbohydrates_g=10.0,
            sugar_g=5.0,
            protein_g=15.0,
            fibre_g=2.0,
            salt_g=0.5,
            calcium_mg=100.0,
        )
        assert result == expected

    def test_calculate_totals_multiple_ingredients(self):
        """Test calculating totals with multiple ingredients."""
        ingredients = [
            {
                "nutrients": {
                    "energy_kcal": 100.0,
                    "fat_g": 5.0,
                    "saturated_fat_g": 2.0,
                    "carbohydrates_g": 10.0,
                    "sugar_g": 5.0,
                    "protein_g": 15.0,
                    "fibre_g": 2.0,
                    "salt_g": 0.5,
                    "calcium_mg": 100.0,
                }
            },
            {
                "nutrients": {
                    "energy_kcal": 200.0,
                    "fat_g": 10.0,
                    "saturated_fat_g": 4.0,
                    "carbohydrates_g": 20.0,
                    "sugar_g": 10.0,
                    "protein_g": 30.0,
                    "fibre_g": 4.0,
                    "salt_g": 1.0,
                    "calcium_mg": 200.0,
                }
            },
        ]
        result = calculate_totals(ingredients)
        expected = Nutrients(
            energy_kcal=300.0,
            fat_g=15.0,
            saturated_fat_g=6.0,
            carbohydrates_g=30.0,
            sugar_g=15.0,
            protein_g=45.0,
            fibre_g=6.0,
            salt_g=1.5,
            calcium_mg=300.0,
        )
        assert result == expected

    def test_create_ingredients_list_empty(self):
        """Test creating ingredients list with no ingredients."""
        result = create_ingredients_list([])
        # Now returns None for empty list (zen essentialism)
        assert result is None

    def test_create_ingredients_list_with_ingredients(self):
        """Test creating ingredients list with ingredients."""
        ingredients = [
            {
                "food_name": "Chicken Breast",
                "weight_g": 100.0,
                "quantity": None,
                "nutrients": {"energy_kcal": 165.0},
            },
            {
                "food_name": "Rice",
                "weight_g": None,
                "quantity": 2.0,
                "nutrients": {"energy_kcal": 130.0},
            },
        ]
        result = create_ingredients_list(ingredients)
        result_str = str(result)

        assert "Chicken Breast" in result_str
        assert "100.0g" in result_str
        assert "Rice" in result_str
        assert "2.0 servings" in result_str

    def test_create_nutrient_totals(self):
        """Test creating nutrient totals display."""
        totals = Nutrients(
            energy_kcal=500.0,
            protein_g=25.0,
            carbohydrates_g=50.0,
            fat_g=20.0,
            saturated_fat_g=10.0,
            sugar_g=15.0,
            fibre_g=5.0,
            salt_g=2.0,
            calcium_mg=150.0,
        )
        result = create_nutrient_totals(totals)
        result_str = str(result)

        assert "500" in result_str
        assert "kcal" in result_str
        # Now uses full nutrient preview format (same as entry screen)
        assert "Protein" in result_str
        assert "Carbohydrates" in result_str
        assert "Fat" in result_str


class TestMealPlannerCallbacks:
    """Test callback functions for meal planner."""

    @patch("nutritional.pages.meal_planner.storage")
    def test_update_food_options_no_search(self, mock_storage):
        """Test food options update with no search value."""
        result = update_food_options(None, None)
        assert result == no_update

    @patch("nutritional.pages.meal_planner.storage")
    def test_update_food_options_with_search(self, mock_storage):
        """Test food options update with search value."""
        # Mock food database
        mock_food1 = FoodItem(
            id="food1",
            name="Chicken Breast",
            unit_type=UnitType.PER_100G,
            serving_size_g=None,
            energy_kcal=165.0,
            fat_g=3.6,
            saturated_fat_g=1.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=31.0,
            fibre_g=0.0,
            salt_g=0.1,
            calcium_mg=15.0,
        )
        mock_food2 = FoodItem(
            id="food2",
            name="Apple",
            unit_type=UnitType.PER_ITEM,
            serving_size_g=150.0,
            energy_kcal=52.0,
            fat_g=0.2,
            saturated_fat_g=0.0,
            carbohydrates_g=13.8,
            sugar_g=10.4,
            protein_g=0.3,
            fibre_g=2.4,
            salt_g=0.0,
            calcium_mg=6.0,
        )
        mock_storage.load_food_database.return_value = [mock_food1, mock_food2]

        result = update_food_options("chicken", None)

        assert len(result) == 1
        assert result[0]["label"] == "Chicken Breast (per 100g)"
        assert result[0]["value"] == "food1"

    @patch("nutritional.pages.meal_planner.storage")
    def test_update_amount_placeholder_per_100g(self, mock_storage):
        """Test amount placeholder update for per 100g food."""
        mock_food = FoodItem(
            id="food1",
            name="Chicken Breast",
            unit_type=UnitType.PER_100G,
            energy_kcal=165.0,
            fat_g=3.6,
            saturated_fat_g=1.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=31.0,
            fibre_g=0.0,
            salt_g=0.1,
            calcium_mg=15.0,
        )
        mock_storage.get_food_item.return_value = mock_food

        unit, placeholder = update_amount_placeholder("food1")
        assert unit == "g"
        assert "grams" in placeholder.lower()

    @patch("nutritional.pages.meal_planner.storage")
    def test_update_amount_placeholder_per_item(self, mock_storage):
        """Test amount placeholder update for per item food."""
        mock_food = FoodItem(
            id="food1",
            name="Apple",
            unit_type=UnitType.PER_ITEM,
            serving_size_g=150.0,
            energy_kcal=52.0,
            fat_g=0.2,
            saturated_fat_g=0.0,
            carbohydrates_g=13.8,
            sugar_g=10.4,
            protein_g=0.3,
            fibre_g=2.4,
            salt_g=0.0,
            calcium_mg=6.0,
        )
        mock_storage.get_food_item.return_value = mock_food

        unit, placeholder = update_amount_placeholder("food1")
        assert unit == "servings"
        assert "servings" in placeholder.lower()

    @patch("nutritional.pages.meal_planner.storage")
    def test_update_amount_placeholder_no_food(self, mock_storage):
        """Test amount placeholder update when no food selected."""
        mock_storage.get_food_item.return_value = None

        unit, placeholder = update_amount_placeholder(None)
        assert unit == "g"
        assert "grams" in placeholder.lower()

    @patch("nutritional.pages.meal_planner.storage")
    def test_load_meals_list_empty(self, mock_storage):
        """Test loading meals list when no meals exist."""
        mock_storage.load_meals.return_value = []

        result = load_meals_list(1, None)
        result_str = str(result)
        assert "No meals saved yet" in result_str

    @patch("nutritional.pages.meal_planner.storage")
    def test_load_meals_list_with_meals(self, mock_storage):
        """Test loading meals list with meals."""
        mock_meal = Mock()
        mock_meal.id = "meal1"
        mock_meal.name = "Test Meal"
        mock_meal.ingredients = [
            Mock(
                nutrients=Nutrients(
                    energy_kcal=100.0,
                    fat_g=5.0,
                    saturated_fat_g=2.0,
                    carbohydrates_g=10.0,
                    sugar_g=5.0,
                    protein_g=15.0,
                    fibre_g=2.0,
                    salt_g=0.5,
                    calcium_mg=50.0,
                )
            )
        ]
        mock_meal.calculate_totals.return_value = Nutrients(
            energy_kcal=100.0,
            fat_g=5.0,
            saturated_fat_g=2.0,
            carbohydrates_g=10.0,
            sugar_g=5.0,
            protein_g=15.0,
            fibre_g=2.0,
            salt_g=0.5,
            calcium_mg=50.0,
        )
        mock_storage.load_meals.return_value = [mock_meal]

        result = load_meals_list(1, None)
        result_str = str(result)

        assert "Test Meal" in result_str
        assert "1 ingredient" in result_str
        assert "100 kcal" in result_str
