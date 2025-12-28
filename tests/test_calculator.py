"""Unit tests for nutrient calculator functions."""

from datetime import datetime

import pytest

from nutritional.data_entry.calculator import calculate_daily_totals, calculate_nutrients
from nutritional.data_entry.models import FoodEntry, FoodItem, Nutrients, UnitType

# Fixtures


@pytest.fixture
def per_100g_food() -> FoodItem:
    """Sample per-100g food item for testing."""
    return FoodItem(
        name="Brown Rice",
        unit_type=UnitType.PER_100G,
        serving_size_g=None,
        energy_kcal=370.0,
        fat_g=2.9,
        saturated_fat_g=0.6,
        carbohydrates_g=77.2,
        sugar_g=0.8,
        protein_g=7.9,
        fibre_g=3.5,
        salt_g=0.01,
        calcium_mg=23.0,
    )


@pytest.fixture
def per_item_food() -> FoodItem:
    """Sample per-item food item for testing."""
    return FoodItem(
        name="Medium Banana",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=120.0,
        energy_kcal=105.0,
        fat_g=0.4,
        saturated_fat_g=0.1,
        carbohydrates_g=27.0,
        sugar_g=14.0,
        protein_g=1.3,
        fibre_g=3.1,
        salt_g=0.001,
        calcium_mg=6.0,
    )


# calculate_nutrients Tests


def test_calculate_nutrients_per_100g_exact_serving(per_100g_food: FoodItem) -> None:
    """Test calculating nutrients for exactly 100g of per-100g food."""
    nutrients = calculate_nutrients(per_100g_food, weight_g=100.0)

    assert nutrients.energy_kcal == 370.0
    assert nutrients.protein_g == 7.9
    assert nutrients.carbohydrates_g == 77.2


@pytest.mark.parametrize(
    "weight_g,expected_energy,expected_protein",
    [
        (50.0, 185.0, 3.95),  # Half serving
        (200.0, 740.0, 15.8),  # Double serving
        (150.0, 555.0, 11.85),  # 1.5x serving
        (75.0, 277.5, 5.925),  # 0.75x serving
    ],
)
def test_calculate_nutrients_per_100g_various_weights(
    per_100g_food: FoodItem,
    weight_g: float,
    expected_energy: float,
    expected_protein: float,
) -> None:
    """Test calculating nutrients for various weights of per-100g food."""
    nutrients = calculate_nutrients(per_100g_food, weight_g=weight_g)

    assert pytest.approx(nutrients.energy_kcal, rel=1e-9) == expected_energy
    assert pytest.approx(nutrients.protein_g, rel=1e-9) == expected_protein


def test_calculate_nutrients_per_item_single(per_item_food: FoodItem) -> None:
    """Test calculating nutrients for single per-item food."""
    nutrients = calculate_nutrients(per_item_food, quantity=1.0)

    assert nutrients.energy_kcal == 105.0
    assert nutrients.protein_g == 1.3
    assert nutrients.sugar_g == 14.0


@pytest.mark.parametrize(
    "quantity,expected_energy,expected_sugar",
    [
        (2.0, 210.0, 28.0),  # Two items
        (3.0, 315.0, 42.0),  # Three items
        (0.5, 52.5, 7.0),  # Half item
        (1.5, 157.5, 21.0),  # 1.5 items
    ],
)
def test_calculate_nutrients_per_item_various_quantities(
    per_item_food: FoodItem,
    quantity: float,
    expected_energy: float,
    expected_sugar: float,
) -> None:
    """Test calculating nutrients for various quantities of per-item food."""
    nutrients = calculate_nutrients(per_item_food, quantity=quantity)

    assert pytest.approx(nutrients.energy_kcal, rel=1e-9) == expected_energy
    assert pytest.approx(nutrients.sugar_g, rel=1e-9) == expected_sugar


def test_calculate_nutrients_zero_weight(per_100g_food: FoodItem) -> None:
    """Test calculating nutrients for zero weight returns zero nutrients."""
    nutrients = calculate_nutrients(per_100g_food, weight_g=0.0)

    assert nutrients.energy_kcal == 0.0
    assert nutrients.protein_g == 0.0
    assert nutrients.fat_g == 0.0


def test_calculate_nutrients_zero_quantity(per_item_food: FoodItem) -> None:
    """Test calculating nutrients for zero quantity returns zero nutrients."""
    nutrients = calculate_nutrients(per_item_food, quantity=0.0)

    assert nutrients.energy_kcal == 0.0
    assert nutrients.protein_g == 0.0
    assert nutrients.carbohydrates_g == 0.0


def test_calculate_nutrients_missing_weight_for_per_100g(per_100g_food: FoodItem) -> None:
    """Test that calculating per-100g food without weight raises ValueError."""
    with pytest.raises(ValueError, match="weight_g is required"):
        calculate_nutrients(per_100g_food)


def test_calculate_nutrients_missing_quantity_for_per_item(per_item_food: FoodItem) -> None:
    """Test that calculating per-item food without quantity raises ValueError."""
    with pytest.raises(ValueError, match="quantity is required"):
        calculate_nutrients(per_item_food)


def test_calculate_nutrients_preserves_all_fields(per_100g_food: FoodItem) -> None:
    """Test that all nutrient fields are calculated, not just energy."""
    nutrients = calculate_nutrients(per_100g_food, weight_g=200.0)

    # All fields should be doubled
    assert pytest.approx(nutrients.energy_kcal) == 740.0
    assert pytest.approx(nutrients.fat_g) == 5.8
    assert pytest.approx(nutrients.saturated_fat_g) == 1.2
    assert pytest.approx(nutrients.carbohydrates_g) == 154.4
    assert pytest.approx(nutrients.sugar_g) == 1.6
    assert pytest.approx(nutrients.protein_g) == 15.8
    assert pytest.approx(nutrients.fibre_g) == 7.0
    assert pytest.approx(nutrients.salt_g) == 0.02
    assert pytest.approx(nutrients.calcium_mg) == 46.0


def test_calculate_nutrients_with_partial_nutrient_data() -> None:
    """Test calculating nutrients when food has partial nutrient data."""
    food = FoodItem(
        name="Test Food",
        unit_type=UnitType.PER_100G,
        serving_size_g=None,
        energy_kcal=100.0,
        protein_g=10.0,
        fat_g=0.0,
        saturated_fat_g=0.0,
        carbohydrates_g=0.0,
        sugar_g=0.0,
        fibre_g=0.0,
        salt_g=0.0,
        calcium_mg=0.0,
    )

    nutrients = calculate_nutrients(food, weight_g=50.0)

    assert nutrients.energy_kcal == 50.0
    assert nutrients.protein_g == 5.0
    assert nutrients.fat_g == 0.0
    assert nutrients.carbohydrates_g == 0.0


# calculate_daily_totals Tests


def test_calculate_daily_totals_single_entry(per_100g_food: FoodItem) -> None:
    """Test calculating daily totals with a single entry."""
    entry = FoodEntry(
        timestamp=datetime(2025, 12, 28, 10, 0, 0),
        food_id=per_100g_food.id,
        food_name=per_100g_food.name,
        weight_g=100.0,
        nutrients=calculate_nutrients(per_100g_food, weight_g=100.0),
    )

    totals = calculate_daily_totals([entry])

    assert totals.energy_kcal == 370.0
    assert totals.protein_g == 7.9


def test_calculate_daily_totals_multiple_entries(
    per_100g_food: FoodItem,
    per_item_food: FoodItem,
) -> None:
    """Test calculating daily totals with multiple entries."""
    entries = [
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 8, 0, 0),
            food_id=per_100g_food.id,
            food_name=per_100g_food.name,
            weight_g=75.0,
            nutrients=calculate_nutrients(per_100g_food, weight_g=75.0),
        ),
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 10, 0, 0),
            food_id=per_item_food.id,
            food_name=per_item_food.name,
            quantity=2.0,
            nutrients=calculate_nutrients(per_item_food, quantity=2.0),
        ),
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 14, 0, 0),
            food_id=per_100g_food.id,
            food_name=per_100g_food.name,
            weight_g=150.0,
            nutrients=calculate_nutrients(per_100g_food, weight_g=150.0),
        ),
    ]

    totals = calculate_daily_totals(entries)

    # 75g rice (277.5) + 2 bananas (210) + 150g rice (555) = 1042.5 kcal
    assert pytest.approx(totals.energy_kcal) == 1042.5

    # 75g rice (5.925) + 2 bananas (2.6) + 150g rice (11.85) = 20.375g protein
    assert pytest.approx(totals.protein_g) == 20.375


def test_calculate_daily_totals_empty_list() -> None:
    """Test calculating daily totals with no entries returns zero nutrients."""
    totals = calculate_daily_totals([])

    assert totals.energy_kcal == 0.0
    assert totals.protein_g == 0.0
    assert totals.fat_g == 0.0
    assert totals.carbohydrates_g == 0.0


def test_calculate_daily_totals_sums_all_fields(
    per_100g_food: FoodItem,
    per_item_food: FoodItem,
) -> None:
    """Test that daily totals include all nutrient fields, not just energy."""
    entries = [
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 8, 0, 0),
            food_id=per_100g_food.id,
            food_name=per_100g_food.name,
            weight_g=100.0,
            nutrients=calculate_nutrients(per_100g_food, weight_g=100.0),
        ),
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 10, 0, 0),
            food_id=per_item_food.id,
            food_name=per_item_food.name,
            quantity=1.0,
            nutrients=calculate_nutrients(per_item_food, quantity=1.0),
        ),
    ]

    totals = calculate_daily_totals(entries)

    # Verify all fields are summed
    assert pytest.approx(totals.energy_kcal) == 475.0  # 370 + 105
    assert pytest.approx(totals.fat_g) == 3.3  # 2.9 + 0.4
    assert pytest.approx(totals.saturated_fat_g) == 0.7  # 0.6 + 0.1
    assert pytest.approx(totals.carbohydrates_g) == 104.2  # 77.2 + 27.0
    assert pytest.approx(totals.sugar_g) == 14.8  # 0.8 + 14.0
    assert pytest.approx(totals.protein_g) == 9.2  # 7.9 + 1.3
    assert pytest.approx(totals.fibre_g) == 6.6  # 3.5 + 3.1
    assert pytest.approx(totals.salt_g) == 0.011  # 0.01 + 0.001
    assert pytest.approx(totals.calcium_mg) == 29.0  # 23 + 6


@pytest.mark.parametrize(
    "num_entries",
    [1, 5, 10, 25, 100],
)
def test_calculate_daily_totals_scales_with_entries(
    per_100g_food: FoodItem,
    num_entries: int,
) -> None:
    """Test that daily totals scale correctly with number of entries."""
    entries = [
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 10, 0, 0),
            food_id=per_100g_food.id,
            food_name=per_100g_food.name,
            weight_g=100.0,
            nutrients=calculate_nutrients(per_100g_food, weight_g=100.0),
        )
        for _ in range(num_entries)
    ]

    totals = calculate_daily_totals(entries)

    expected_energy = 370.0 * num_entries
    expected_protein = 7.9 * num_entries

    assert pytest.approx(totals.energy_kcal) == expected_energy
    assert pytest.approx(totals.protein_g) == expected_protein


def test_calculate_daily_totals_with_zero_nutrient_entries() -> None:
    """Test daily totals when some entries have zero nutrients."""
    zero_nutrient_food = FoodItem(
        name="Water",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=250.0,
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

    entries = [
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 10, 0, 0),
            food_id=zero_nutrient_food.id,
            food_name=zero_nutrient_food.name,
            quantity=5.0,
            nutrients=calculate_nutrients(zero_nutrient_food, quantity=5.0),
        )
    ]

    totals = calculate_daily_totals(entries)

    assert totals.energy_kcal == 0.0
    assert totals.protein_g == 0.0


def test_calculate_daily_totals_mixed_zero_and_nonzero(per_100g_food: FoodItem) -> None:
    """Test daily totals with mix of zero and non-zero nutrient entries."""
    zero_nutrient_food = FoodItem(
        name="Water",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=250.0,
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

    entries = [
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 8, 0, 0),
            food_id=per_100g_food.id,
            food_name=per_100g_food.name,
            weight_g=100.0,
            nutrients=calculate_nutrients(per_100g_food, weight_g=100.0),
        ),
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 10, 0, 0),
            food_id=zero_nutrient_food.id,
            food_name=zero_nutrient_food.name,
            quantity=1.0,
            nutrients=calculate_nutrients(zero_nutrient_food, quantity=1.0),
        ),
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 14, 0, 0),
            food_id=per_100g_food.id,
            food_name=per_100g_food.name,
            weight_g=50.0,
            nutrients=calculate_nutrients(per_100g_food, weight_g=50.0),
        ),
    ]

    totals = calculate_daily_totals(entries)

    # Should be same as 150g of rice (100g + 0g + 50g)
    assert pytest.approx(totals.energy_kcal) == 555.0  # 370 + 0 + 185
    assert pytest.approx(totals.protein_g) == 11.85  # 7.9 + 0 + 3.95
