"""Tests for shared UI components."""

import pytest
from dash import html

from nutritional.components import (
    NUTRIENT_COLORS,
    NUTRIENT_LABELS,
    create_empty_state,
    create_ingredient_item,
    create_ingredients_list,
    create_meal_card,
    create_nutrient_preview,
    create_nutrient_totals,
)
from nutritional.data_entry.models import Nutrients


class TestNutrientPreview:
    """Tests for the nutrient preview component."""

    def test_create_nutrient_preview_basic(self):
        """Test creating a nutrient preview with basic values."""
        nutrients = Nutrients(
            energy_kcal=250.0,
            fat_g=10.0,
            saturated_fat_g=3.5,
            carbohydrates_g=30.0,
            sugar_g=5.0,
            protein_g=20.0,
            fibre_g=4.0,
            salt_g=0.8,
            calcium_mg=120.0,
        )

        result = create_nutrient_preview(nutrients)

        assert result is not None
        assert isinstance(result, html.Div)
        result_str = str(result)

        # Check that key nutrient values appear
        assert "Energy" in result_str
        assert "250.0" in result_str
        assert "Protein" in result_str
        assert "20.0" in result_str

    def test_nutrient_colors_defined(self):
        """Test that all nutrient fields have colors defined."""
        expected_fields = [
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

        for field in expected_fields:
            assert field in NUTRIENT_COLORS
            color, unit = NUTRIENT_COLORS[field]
            assert color.startswith("#")
            assert unit in ["g", "mg", "kcal"]

    def test_nutrient_labels_defined(self):
        """Test that all nutrient fields have labels defined."""
        expected_fields = [
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

        for field in expected_fields:
            assert field in NUTRIENT_LABELS
            assert len(NUTRIENT_LABELS[field]) > 0


class TestNutrientTotals:
    """Tests for the nutrient totals component."""

    def test_create_nutrient_totals_with_values(self):
        """Test creating nutrient totals with non-zero values."""
        nutrients = Nutrients(
            energy_kcal=500.0,
            protein_g=25.0,
            carbohydrates_g=60.0,
            fat_g=15.0,
            saturated_fat_g=5.0,
            sugar_g=10.0,
            fibre_g=8.0,
            salt_g=1.0,
            calcium_mg=200.0,
        )

        result = create_nutrient_totals(nutrients)

        assert result is not None
        result_str = str(result)

        # Check main calorie display
        assert "500" in result_str
        assert "kcal" in result_str

        # Now uses full nutrient preview format (same as entry screen)
        assert "Protein" in result_str
        assert "Carbohydrates" in result_str
        assert "Fat" in result_str

    def test_create_nutrient_totals_zero_calories(self):
        """Test that zero calories returns None (zen essentialism)."""
        nutrients = Nutrients(
            energy_kcal=0.0,
            protein_g=0.0,
            carbohydrates_g=0.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            sugar_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        )

        result = create_nutrient_totals(nutrients)

        assert result is None


class TestIngredientItem:
    """Tests for the ingredient item component."""

    def test_create_ingredient_item_basic(self):
        """Test creating a basic ingredient item."""
        result = create_ingredient_item(
            name="Chicken Breast",
            amount_text="150g",
            calories=247.5,
            index=0,
        )

        assert result is not None
        result_str = str(result)

        assert "Chicken Breast" in result_str
        assert "150g" in result_str
        assert "248 kcal" in result_str

    def test_create_ingredient_item_with_custom_button_type(self):
        """Test creating ingredient item with custom remove button type."""
        result = create_ingredient_item(
            name="Rice",
            amount_text="2 servings",
            calories=260.0,
            index=1,
            remove_button_type="custom-remove",
        )

        result_str = str(result)

        assert "Rice" in result_str
        assert "custom-remove" in result_str


class TestIngredientsList:
    """Tests for the ingredients list component."""

    def test_create_ingredients_list_empty(self):
        """Test that empty list returns None."""
        result = create_ingredients_list([])
        assert result is None

    def test_create_ingredients_list_with_weight(self):
        """Test creating list with weight-based ingredients."""
        ingredients = [
            {
                "food_name": "Chicken",
                "weight_g": 100.0,
                "quantity": None,
                "nutrients": {"energy_kcal": 165.0},
            }
        ]

        result = create_ingredients_list(ingredients)

        assert result is not None
        result_str = str(result)
        assert "Chicken" in result_str
        assert "100.0g" in result_str

    def test_create_ingredients_list_with_quantity(self):
        """Test creating list with quantity-based ingredients."""
        ingredients = [
            {
                "food_name": "Eggs",
                "weight_g": None,
                "quantity": 2.0,
                "nutrients": {"energy_kcal": 140.0},
            }
        ]

        result = create_ingredients_list(ingredients)

        assert result is not None
        result_str = str(result)
        assert "Eggs" in result_str
        assert "2.0 servings" in result_str


class TestMealCard:
    """Tests for the meal card component."""

    def test_create_meal_card_basic(self):
        """Test creating a basic meal card."""
        result = create_meal_card(
            meal_id="meal-123",
            name="Breakfast Bowl",
            ingredient_count=5,
            total_calories=450.0,
        )

        result_str = str(result)

        assert "Breakfast Bowl" in result_str
        assert "5 ingredients" in result_str
        assert "450 kcal" in result_str

    def test_create_meal_card_singular_ingredient(self):
        """Test meal card with singular ingredient text."""
        result = create_meal_card(
            meal_id="meal-123",
            name="Simple Meal",
            ingredient_count=1,
            total_calories=200.0,
        )

        result_str = str(result)
        assert "1 ingredient" in result_str
        # Should NOT have "1 ingredients"
        assert "1 ingredients" not in result_str

    def test_create_meal_card_with_actions(self):
        """Test meal card is clickable and simple (no edit/delete buttons)."""
        result = create_meal_card(
            meal_id="meal-456",
            name="Lunch",
            ingredient_count=3,
            total_calories=600.0,
        )

        result_str = str(result)
        # Should have meal info
        assert "Lunch" in result_str
        assert "3 ingredients" in result_str
        assert "600" in result_str
        assert "kcal" in result_str
        # Should be clickable
        assert "'cursor': 'pointer'" in result_str
        # Should NOT have explicit edit/delete buttons
        assert "Edit" not in result_str
        assert "Delete" not in result_str

    def test_create_meal_card_without_actions(self):
        """Test meal card parameter compatibility (show_actions no longer used)."""
        result = create_meal_card(
            meal_id="meal-456",
            name="Lunch",
            ingredient_count=3,
            total_calories=600.0,
            show_actions=False,
        )

        result_str = str(result)
        # Should still be simple with no buttons
        assert "Lunch" in result_str
        assert "Edit" not in result_str
        assert "Delete" not in result_str


class TestEmptyState:
    """Tests for the empty state component."""

    def test_create_empty_state(self):
        """Test creating an empty state message."""
        result = create_empty_state("No items found.")

        assert result is not None
        assert isinstance(result, html.P)
        assert "No items found." in str(result)
        assert "empty-state-message" in str(result)
