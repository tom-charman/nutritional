"""Unit tests for data entry Pydantic models."""

from datetime import date, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from nutritional.data_entry.models import (
    DailyData,
    FoodEntry,
    FoodItem,
    Measurements,
    Nutrients,
    UnitType,
)

# Fixtures


@pytest.fixture
def sample_nutrients() -> Nutrients:
    """Sample nutritional data for testing."""
    return Nutrients(
        energy_kcal=250.0,
        fat_g=10.0,
        saturated_fat_g=3.0,
        carbohydrates_g=30.0,
        sugar_g=5.0,
        protein_g=8.0,
        fibre_g=2.0,
        salt_g=0.5,
        calcium_mg=100.0,
    )


@pytest.fixture
def per_100g_food_item(sample_nutrients: Nutrients) -> FoodItem:
    """Sample food item with per-100g unit type."""
    return FoodItem(
        name="Brown Rice",
        unit_type=UnitType.PER_100G,
        serving_size_g=None,
        energy_kcal=sample_nutrients.energy_kcal,
        fat_g=sample_nutrients.fat_g,
        saturated_fat_g=sample_nutrients.saturated_fat_g,
        carbohydrates_g=sample_nutrients.carbohydrates_g,
        sugar_g=sample_nutrients.sugar_g,
        protein_g=sample_nutrients.protein_g,
        fibre_g=sample_nutrients.fibre_g,
        salt_g=sample_nutrients.salt_g,
        calcium_mg=sample_nutrients.calcium_mg,
    )


@pytest.fixture
def per_item_food_item(sample_nutrients: Nutrients) -> FoodItem:
    """Sample food item with per-item unit type."""
    return FoodItem(
        name="Medium Apple",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=150.0,
        energy_kcal=sample_nutrients.energy_kcal,
        fat_g=sample_nutrients.fat_g,
        saturated_fat_g=sample_nutrients.saturated_fat_g,
        carbohydrates_g=sample_nutrients.carbohydrates_g,
        sugar_g=sample_nutrients.sugar_g,
        protein_g=sample_nutrients.protein_g,
        fibre_g=sample_nutrients.fibre_g,
        salt_g=sample_nutrients.salt_g,
        calcium_mg=sample_nutrients.calcium_mg,
    )


# Nutrients Model Tests


def test_nutrients_with_all_fields(sample_nutrients: Nutrients) -> None:
    """Test Nutrients model accepts all nutritional fields."""
    assert sample_nutrients.energy_kcal == 250.0
    assert sample_nutrients.protein_g == 8.0
    assert sample_nutrients.calcium_mg == 100.0


def test_nutrients_with_partial_fields() -> None:
    """Test Nutrients model requires all nutritional fields."""
    # All fields are required, not optional
    nutrients = Nutrients(
        energy_kcal=100.0,
        protein_g=5.0,
        fat_g=0.0,
        saturated_fat_g=0.0,
        carbohydrates_g=0.0,
        sugar_g=0.0,
        fibre_g=0.0,
        salt_g=0.0,
        calcium_mg=0.0,
    )
    assert nutrients.energy_kcal == 100.0
    assert nutrients.protein_g == 5.0
    assert nutrients.fat_g == 0.0
    assert nutrients.carbohydrates_g == 0.0


def test_nutrients_with_no_fields() -> None:
    """Test Nutrients model with all zero values."""
    nutrients = Nutrients(
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
    assert nutrients.energy_kcal == 0.0
    assert nutrients.fat_g == 0.0
    assert nutrients.protein_g == 0.0


@pytest.mark.parametrize(
    "field_name,invalid_value",
    [
        ("energy_kcal", "not_a_number"),
        ("protein_g", [1, 2, 3]),
        ("fat_g", {"value": 10}),
    ],
)
def test_nutrients_invalid_types(field_name: str, invalid_value) -> None:
    """Test Nutrients model rejects invalid field types."""
    with pytest.raises(ValidationError):
        Nutrients(**{field_name: invalid_value})


# FoodItem Model Tests


def test_food_item_per_100g_creation(per_100g_food_item: FoodItem) -> None:
    """Test FoodItem with PER_100G unit type is created correctly."""
    assert per_100g_food_item.name == "Brown Rice"
    assert per_100g_food_item.unit_type == UnitType.PER_100G
    assert per_100g_food_item.serving_size_g is None  # PER_100G items don't have serving_size_g
    assert per_100g_food_item.id is not None  # UUID generated


def test_food_item_per_item_creation(per_item_food_item: FoodItem) -> None:
    """Test FoodItem with PER_ITEM unit type is created correctly."""
    assert per_item_food_item.name == "Medium Apple"
    assert per_item_food_item.unit_type == UnitType.PER_ITEM
    assert per_item_food_item.serving_size_g == 150.0  # PER_ITEM requires serving_size_g


def test_food_item_per_100g_requires_no_serving_size() -> None:
    """Test PER_100G food items should not have serving_size_g."""
    with pytest.raises(ValidationError) as exc_info:
        FoodItem(
            name="Test Food",
            unit_type=UnitType.PER_100G,
            serving_size_g=100.0,  # This should cause error
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
    assert "should be None" in str(exc_info.value)


def test_food_item_id_generation() -> None:
    """Test FoodItem generates UUID when id is not provided."""
    food1 = FoodItem(
        name="Food 1",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=100.0,
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
    food2 = FoodItem(
        name="Food 2",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=100.0,
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
    assert isinstance(food2.id, str)
    assert food1.id != food2.id

    # Verify it's a valid UUID
    UUID(food1.id)
    UUID(food2.id)


def test_food_item_preserves_provided_id() -> None:
    """Test FoodItem preserves id when provided."""
    test_id = "12345678-1234-1234-1234-123456789abc"
    food = FoodItem(
        id=test_id,
        name="Test Food",
        unit_type=UnitType.PER_ITEM,
        serving_size_g=100.0,
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
    assert food.id == test_id


@pytest.mark.parametrize(
    "name,unit_type",
    [
        ("", UnitType.PER_100G),
        (None, UnitType.PER_ITEM),
    ],
)
def test_food_item_requires_name(name: str | None, unit_type: UnitType) -> None:
    """Test FoodItem requires a non-empty name."""
    with pytest.raises(ValidationError):
        FoodItem(name=name, unit_type=unit_type, nutrients=Nutrients())


# FoodEntry Model Tests


def test_food_entry_with_weight_creation() -> None:
    """Test FoodEntry with weight_g for per-100g foods."""
    entry = FoodEntry(
        timestamp=datetime.now(),
        food_id="test-id",
        food_name="Brown Rice",
        weight_g=150.0,
        nutrients=Nutrients(
            energy_kcal=375.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        ),
    )
    assert entry.weight_g == 150.0
    assert entry.quantity is None


def test_food_entry_with_quantity_creation() -> None:
    """Test FoodEntry with quantity for per-item foods."""
    entry = FoodEntry(
        timestamp=datetime.now(),
        food_id="test-id",
        food_name="Apple",
        quantity=2.0,
        nutrients=Nutrients(
            energy_kcal=200.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        ),
    )
    assert entry.quantity == 2.0
    assert entry.weight_g is None


@pytest.mark.parametrize(
    "field_name,field_value",
    [
        ("timestamp", None),
        ("food_id", None),
        ("food_name", None),
    ],
)
def test_food_entry_requires_fields(field_name: str, field_value) -> None:
    """Test FoodEntry requires timestamp, food_id, and food_name."""
    data = {
        "timestamp": datetime.now(),
        "food_id": "test-id",
        "food_name": "Test Food",
        "weight_g": 100.0,
        "nutrients": Nutrients(
            energy_kcal=0.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        ),
    }
    data[field_name] = field_value

    with pytest.raises(ValidationError):
        FoodEntry(**data)


# Measurements Model Tests


def test_measurements_with_both_weights() -> None:
    """Test Measurements allows partial weight data."""
    measurements = Measurements(morning_weight_kg=70.5)
    assert measurements.morning_weight_kg == 70.5
    assert measurements.evening_weight_kg is None


def test_measurements_with_no_weights() -> None:
    """Test Measurements allows no weight data."""
    measurements = Measurements()
    assert measurements.morning_weight_kg is None
    assert measurements.evening_weight_kg is None


@pytest.mark.parametrize(
    "morning_weight,evening_weight",
    [
        (-5.0, 70.0),
        (70.0, -5.0),
    ],
)
def test_measurements_rejects_invalid_weights(
    morning_weight: float | None, evening_weight: float | None
) -> None:
    """Test Measurements rejects negative weights."""
    with pytest.raises(ValidationError):
        Measurements(morning_weight_kg=morning_weight, evening_weight_kg=evening_weight)


# DailyData Model Tests


def test_daily_data_creation() -> None:
    """Test DailyData model with entries and measurements."""
    entry = FoodEntry(
        timestamp=datetime.now(),
        food_id="test-id",
        food_name="Test Food",
        weight_g=100.0,
        nutrients=Nutrients(
            energy_kcal=100.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        ),
    )
    measurements = Measurements(morning_weight_kg=70.0)

    daily_data = DailyData(
        date=date.today(),
        entries=[entry],
        measurements=measurements,
    )

    assert daily_data.date == date.today()
    assert len(daily_data.entries) == 1
    assert daily_data.measurements.morning_weight_kg == 70.0


def test_daily_data_with_empty_entries() -> None:
    """Test DailyData allows empty entries list."""
    daily_data = DailyData(
        date=date.today(),
        entries=[],
        measurements=Measurements(),
    )
    assert len(daily_data.entries) == 0


def test_daily_data_with_multiple_entries() -> None:
    """Test DailyData with multiple food entries."""
    entries = [
        FoodEntry(
            timestamp=datetime.now(),
            food_id=f"id-{i}",
            food_name=f"Food {i}",
            weight_g=100.0,
            nutrients=Nutrients(
                energy_kcal=100.0,
                fat_g=0.0,
                saturated_fat_g=0.0,
                carbohydrates_g=0.0,
                sugar_g=0.0,
                protein_g=0.0,
                fibre_g=0.0,
                salt_g=0.0,
                calcium_mg=0.0,
            ),
        )
        for i in range(5)
    ]

    daily_data = DailyData(
        date=date.today(),
        entries=entries,
        measurements=Measurements(),
    )

    assert len(daily_data.entries) == 5


def test_daily_data_serialization() -> None:
    """Test DailyData can be serialized to dict for JSON storage."""
    entry = FoodEntry(
        timestamp=datetime.now(),
        food_id="test-id",
        food_name="Test Food",
        weight_g=100.0,
        nutrients=Nutrients(
            energy_kcal=100.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        ),
    )

    daily_data = DailyData(
        date=date.today(),
        entries=[entry],
        measurements=Measurements(morning_weight_kg=70.0),
    )

    # Use Pydantic's model_dump for serialization
    data_dict = daily_data.model_dump(mode="json")

    assert isinstance(data_dict, dict)
    assert "date" in data_dict
    assert "entries" in data_dict
    assert "measurements" in data_dict
    assert len(data_dict["entries"]) == 1


def test_daily_data_deserialization() -> None:
    """Test DailyData can be deserialized from dict."""
    data_dict = {
        "date": "2025-12-28",
        "entries": [
            {
                "timestamp": "2025-12-28T10:00:00",
                "food_id": "test-id",
                "food_name": "Test Food",
                "weight_g": 100.0,
                "quantity": None,
                "nutrients": {
                    "energy_kcal": 100.0,
                    "fat_g": 0.0,
                    "saturated_fat_g": 0.0,
                    "carbohydrates_g": 0.0,
                    "sugar_g": 0.0,
                    "protein_g": 0.0,
                    "fibre_g": 0.0,
                    "salt_g": 0.0,
                    "calcium_mg": 0.0,
                },
            }
        ],
        "measurements": {"morning_weight_kg": 70.0, "evening_weight_kg": None},
    }

    daily_data = DailyData(**data_dict)

    assert daily_data.date == date(2025, 12, 28)
    assert len(daily_data.entries) == 1
    assert daily_data.entries[0].food_name == "Test Food"
    assert daily_data.measurements.morning_weight_kg == 70.0


@pytest.mark.parametrize(
    "invalid_date",
    [
        None,
        "",
        "not-a-date",
        "12/28/2025",
    ],
)
def test_daily_data_requires_valid_date(invalid_date) -> None:
    """Test DailyData requires a valid date."""
    with pytest.raises(ValidationError):
        DailyData(
            date=invalid_date,
            entries=[],
            measurements=Measurements(),
        )
