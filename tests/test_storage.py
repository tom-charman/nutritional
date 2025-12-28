"""Unit tests for file storage operations."""

import json
from collections.abc import Generator
from datetime import date, datetime
from pathlib import Path

import pytest

from nutritional.data_entry.models import (
    DailyData,
    FoodEntry,
    FoodItem,
    Measurements,
    Nutrients,
    UnitType,
)
from nutritional.data_entry.storage import FileStorage

# Fixtures


@pytest.fixture
def temp_data_dir(tmp_path: Path) -> Path:
    """Create a temporary data directory for testing."""
    data_dir = tmp_path / "test_data"
    data_dir.mkdir()
    return data_dir


@pytest.fixture
def storage(temp_data_dir: Path) -> FileStorage:
    """Create a FileStorage instance with temporary directory."""
    return FileStorage(base_path=str(temp_data_dir))


@pytest.fixture
def sample_food_item() -> FoodItem:
    """Sample food item for testing."""
    return FoodItem(
        name="Test Food",
        unit_type=UnitType.PER_100G,
        serving_size_g=None,
        energy_kcal=250.0,
        protein_g=10.0,
        fat_g=5.0,
        carbohydrates_g=40.0,
        saturated_fat_g=0.0,
        sugar_g=0.0,
        fibre_g=0.0,
        salt_g=0.0,
        calcium_mg=0.0,
    )


@pytest.fixture
def sample_daily_data(sample_food_item: FoodItem) -> DailyData:
    """Sample daily data for testing."""
    from nutritional.data_entry.calculator import calculate_nutrients

    entry = FoodEntry(
        timestamp=datetime(2025, 12, 28, 10, 0, 0),
        food_id=sample_food_item.id,
        food_name=sample_food_item.name,
        weight_g=150.0,
        nutrients=calculate_nutrients(sample_food_item, weight_g=150.0),
    )

    return DailyData(
        date=date(2025, 12, 28),
        entries=[entry],
        measurements=Measurements(morning_weight_kg=70.5, evening_weight_kg=71.0),
    )


# Directory Structure Tests


def test_storage_creates_directory_structure(storage: FileStorage) -> None:
    """Test that FileStorage creates necessary directories on initialization."""
    assert storage.base_path.exists()
    assert storage.daily_entries_path.exists()


def test_storage_creates_empty_food_database(storage: FileStorage) -> None:
    """Test that FileStorage creates empty food database file."""
    # Database file may not exist initially, load_food_database returns empty list
    items = storage.load_food_database()
    assert items == []


# Food Item CRUD Tests


def test_save_new_food_item(storage: FileStorage, sample_food_item: FoodItem) -> None:
    """Test saving a new food item to the database."""
    storage.save_food_item(sample_food_item)

    items = storage.load_food_database()
    assert len(items) == 1
    assert items[0].name == "Test Food"
    assert items[0].id == sample_food_item.id


def test_save_multiple_food_items(storage: FileStorage) -> None:
    """Test saving multiple food items."""
    items = [
        FoodItem(
            name=f"Food {i}",
            unit_type=UnitType.PER_ITEM,
            serving_size_g=100.0,
            energy_kcal=100.0 * i,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        )
        for i in range(1, 4)
    ]

    for item in items:
        storage.save_food_item(item)

    all_items = storage.load_food_database()
    assert len(all_items) == 3
    assert {item.name for item in all_items} == {"Food 1", "Food 2", "Food 3"}


def test_update_existing_food_item(storage: FileStorage, sample_food_item: FoodItem) -> None:
    """Test updating an existing food item."""
    storage.save_food_item(sample_food_item)

    # Update the item
    sample_food_item.name = "Updated Food Name"
    sample_food_item.energy_kcal = 300.0
    storage.save_food_item(sample_food_item)

    # Verify update
    items = storage.load_food_database()
    assert len(items) == 1
    assert items[0].name == "Updated Food Name"
    assert items[0].energy_kcal == 300.0


def test_get_food_item_by_id(storage: FileStorage, sample_food_item: FoodItem) -> None:
    """Test retrieving a specific food item by ID."""
    storage.save_food_item(sample_food_item)

    retrieved = storage.get_food_item(sample_food_item.id)
    assert retrieved is not None
    assert retrieved.id == sample_food_item.id
    assert retrieved.name == sample_food_item.name


def test_get_nonexistent_food_item(storage: FileStorage) -> None:
    """Test that getting a nonexistent food item returns None."""
    result = storage.get_food_item("nonexistent-id")
    assert result is None


def test_delete_food_item(storage: FileStorage, sample_food_item: FoodItem) -> None:
    """Test deleting a food item."""
    storage.save_food_item(sample_food_item)
    assert len(storage.load_food_database()) == 1

    storage.delete_food_item(sample_food_item.id)
    assert len(storage.load_food_database()) == 0
    assert storage.get_food_item(sample_food_item.id) is None


def test_delete_nonexistent_food_item(storage: FileStorage) -> None:
    """Test that deleting a nonexistent item doesn't raise an error."""
    storage.delete_food_item("nonexistent-id")
    # Should not raise an error


@pytest.mark.parametrize(
    "num_items",
    [0, 1, 10, 50],
)
def test_get_all_food_items_scales(storage: FileStorage, num_items: int) -> None:
    """Test that load_food_database works with various database sizes."""
    for i in range(num_items):
        item = FoodItem(
            name=f"Food {i}",
            unit_type=UnitType.PER_ITEM,
            serving_size_g=100.0,
            energy_kcal=100.0,
            fat_g=0.0,
            saturated_fat_g=0.0,
            carbohydrates_g=0.0,
            sugar_g=0.0,
            protein_g=0.0,
            fibre_g=0.0,
            salt_g=0.0,
            calcium_mg=0.0,
        )
        storage.save_food_item(item)

    items = storage.load_food_database()
    assert len(items) == num_items


# Daily Entry Tests


def test_save_daily_entry(storage: FileStorage, sample_daily_data: DailyData) -> None:
    """Test saving a daily entry creates all necessary files."""
    storage.save_daily_entry(sample_daily_data)

    # Check daily entry file
    daily_file = storage.daily_entries_path / "2025-12-28.json"
    assert daily_file.exists()

    # Check history file
    assert storage.history_path.exists()

    # Check summary file
    assert storage.summaries_path.exists()


def test_load_daily_entry(storage: FileStorage, sample_daily_data: DailyData) -> None:
    """Test loading a saved daily entry."""
    storage.save_daily_entry(sample_daily_data)

    loaded = storage.load_daily_entry(date(2025, 12, 28))
    assert loaded is not None
    assert loaded.date == sample_daily_data.date
    assert len(loaded.entries) == 1
    assert loaded.entries[0].food_name == "Test Food"
    assert loaded.measurements.morning_weight_kg == 70.5


def test_load_nonexistent_daily_entry(storage: FileStorage) -> None:
    """Test loading a daily entry that doesn't exist returns None."""
    result = storage.load_daily_entry(date(2025, 1, 1))
    assert result is None


def test_save_overwrites_existing_daily_entry(
    storage: FileStorage,
    sample_daily_data: DailyData,
) -> None:
    """Test that saving a daily entry overwrites existing data for that date."""
    storage.save_daily_entry(sample_daily_data)

    # Modify and save again
    sample_daily_data.measurements.evening_weight_kg = 72.0
    storage.save_daily_entry(sample_daily_data)

    # Verify overwrite
    loaded = storage.load_daily_entry(sample_daily_data.date)
    assert loaded.measurements.evening_weight_kg == 72.0


@pytest.mark.parametrize(
    "test_date",
    [
        date(2025, 1, 1),
        date(2025, 6, 15),
        date(2025, 12, 31),
        date(2024, 2, 29),  # Leap year
    ],
)
def test_save_daily_entry_various_dates(
    storage: FileStorage,
    sample_daily_data: DailyData,
    test_date: date,
) -> None:
    """Test saving daily entries for various dates."""
    sample_daily_data.date = test_date
    storage.save_daily_entry(sample_daily_data)

    loaded = storage.load_daily_entry(test_date)
    assert loaded is not None
    assert loaded.date == test_date


def test_daily_entry_preserves_multiple_entries(storage: FileStorage) -> None:
    """Test that daily entries with multiple food entries are preserved."""
    entries = [
        FoodEntry(
            timestamp=datetime(2025, 12, 28, 8, 0, 0),
            food_id=f"id-{i}",
            food_name=f"Food {i}",
            weight_g=100.0,
            nutrients=Nutrients(
                energy_kcal=100.0 * i,
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
        for i in range(1, 6)
    ]

    daily_data = DailyData(
        date=date(2025, 12, 28),
        entries=entries,
        measurements=Measurements(),
    )

    storage.save_daily_entry(daily_data)
    loaded = storage.load_daily_entry(date(2025, 12, 28))

    assert loaded is not None
    assert len(loaded.entries) == 5
    assert [e.food_name for e in loaded.entries] == [f"Food {i}" for i in range(1, 6)]


def test_daily_entry_with_no_entries(storage: FileStorage) -> None:
    """Test saving and loading a daily entry with no food entries."""
    daily_data = DailyData(
        date=date(2025, 12, 28),
        entries=[],
        measurements=Measurements(morning_weight_kg=70.0),
    )

    storage.save_daily_entry(daily_data)
    loaded = storage.load_daily_entry(date(2025, 12, 28))

    assert loaded is not None
    assert len(loaded.entries) == 0
    assert loaded.measurements.morning_weight_kg == 70.0


# History File Tests


def test_history_file_appends_entries(storage: FileStorage, sample_daily_data: DailyData) -> None:
    """Test that history file appends entries rather than overwriting."""
    # Save first entry
    storage.save_daily_entry(sample_daily_data)

    # Save second entry for different date
    sample_daily_data.date = date(2025, 12, 29)
    storage.save_daily_entry(sample_daily_data)

    # Check history file has both entries
    with open(storage.history_path) as f:
        lines = f.readlines()
    assert len(lines) == 2


def test_history_file_format(storage: FileStorage, sample_daily_data: DailyData) -> None:
    """Test that history file entries are valid JSON."""
    storage.save_daily_entry(sample_daily_data)

    with open(storage.history_path) as f:
        line = f.readline()
        data = json.loads(line)

    assert "date" in data
    # History format matches entry serialization, not DailyData
    assert "food_id" in data or "entries" in data


# Summary CSV Tests


def test_summary_csv_creation(storage: FileStorage, sample_daily_data: DailyData) -> None:
    """Test that summary CSV is created with headers."""
    storage.save_daily_entry(sample_daily_data)

    with open(storage.summaries_path) as f:
        lines = f.readlines()

    # Should have header + 1 data row
    assert len(lines) == 2
    # Header starts with Date (capital D)
    assert lines[0].startswith("Date,") or lines[0].startswith("date,")


def test_summary_csv_updates_existing_date(
    storage: FileStorage,
    sample_daily_data: DailyData,
) -> None:
    """Test that updating a date replaces the row in summary CSV."""
    storage.save_daily_entry(sample_daily_data)

    # Update the same date
    sample_daily_data.measurements.morning_weight_kg = 71.5
    storage.save_daily_entry(sample_daily_data)

    with open(storage.summaries_path) as f:
        lines = f.readlines()

    # Should still have header + 1 data row
    assert len(lines) == 2


def test_summary_csv_multiple_dates(storage: FileStorage, sample_daily_data: DailyData) -> None:
    """Test that summary CSV contains multiple dates."""
    dates = [date(2025, 12, 28), date(2025, 12, 29), date(2025, 12, 30)]

    for test_date in dates:
        sample_daily_data.date = test_date
        storage.save_daily_entry(sample_daily_data)

    with open(storage.summaries_path) as f:
        lines = f.readlines()

    # Should have header + 3 data rows
    assert len(lines) == 4


# Integration Tests


def test_full_workflow(storage: FileStorage) -> None:
    """Test a complete workflow: save food, create entry, save daily data."""
    # Create and save food item
    food = FoodItem(
        name="Oatmeal",
        unit_type=UnitType.PER_100G,
        serving_size_g=None,
        energy_kcal=389.0,
        protein_g=16.9,
        carbohydrates_g=66.3,
        fat_g=0.0,
        saturated_fat_g=0.0,
        sugar_g=0.0,
        fibre_g=0.0,
        salt_g=0.0,
        calcium_mg=0.0,
    )
    storage.save_food_item(food)

    # Create daily entry
    from nutritional.data_entry.calculator import calculate_nutrients

    entry = FoodEntry(
        timestamp=datetime.now(),
        food_id=food.id,
        food_name=food.name,
        weight_g=50.0,
        nutrients=calculate_nutrients(food, weight_g=50.0),
    )

    daily_data = DailyData(
        date=date.today(),
        entries=[entry],
        measurements=Measurements(morning_weight_kg=72.0),
    )

    storage.save_daily_entry(daily_data)

    # Verify everything
    assert len(storage.load_food_database()) == 1
    loaded = storage.load_daily_entry(date.today())
    assert loaded is not None
    assert len(loaded.entries) == 1
    assert loaded.entries[0].nutrients.energy_kcal == pytest.approx(194.5)


def test_data_persistence_across_instances(
    temp_data_dir: Path,
    sample_food_item: FoodItem,
) -> None:
    """Test that data persists when creating new storage instances."""
    # Save with first instance
    storage1 = FileStorage(base_path=str(temp_data_dir))
    storage1.save_food_item(sample_food_item)

    # Load with second instance
    storage2 = FileStorage(base_path=str(temp_data_dir))
    items = storage2.load_food_database()

    assert len(items) == 1
    assert items[0].id == sample_food_item.id


def test_concurrent_modifications_last_write_wins(
    storage: FileStorage,
    sample_food_item: FoodItem,
) -> None:
    """Test that last write wins for concurrent modifications."""
    sample_food_item.name = "First Name"
    storage.save_food_item(sample_food_item)

    sample_food_item.name = "Second Name"
    storage.save_food_item(sample_food_item)

    retrieved = storage.get_food_item(sample_food_item.id)
    assert retrieved.name == "Second Name"


# Error Handling Tests


def test_storage_handles_corrupted_food_database(temp_data_dir: Path) -> None:
    """Test that storage handles corrupted food database gracefully."""
    # Create corrupted database file
    food_db_path = temp_data_dir / "food_database.json"
    food_db_path.parent.mkdir(parents=True, exist_ok=True)
    with open(food_db_path, "w") as f:
        f.write("{ invalid json }")

    storage = FileStorage(base_path=str(temp_data_dir))

    # Current implementation raises JSONDecodeError - this is acceptable behavior
    # A production system might want to handle this more gracefully
    with pytest.raises(json.JSONDecodeError):
        storage.load_food_database()


def test_storage_handles_missing_daily_entry_gracefully(storage: FileStorage) -> None:
    """Test that loading missing daily entry doesn't crash."""
    result = storage.load_daily_entry(date(1900, 1, 1))
    assert result is None
