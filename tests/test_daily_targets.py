"""Unit tests for daily targets functionality."""

from datetime import date, timedelta

import pytest

from nutritional.data_entry.models import DailyTargets, TargetMode
from nutritional.data_entry.storage import FileStorage


@pytest.fixture
def storage(tmp_path):
    """Create a temporary storage instance."""
    return FileStorage(base_path=str(tmp_path / "test_data"))


@pytest.fixture
def sample_targets():
    """Sample daily targets."""
    return DailyTargets(
        date=date.today(),
        energy_kcal=2000,
        protein_g=150,
        carbohydrates_g=225,
        fat_g=67,
        sugar_g=90,
        saturated_fat_g=20,
        fibre_g=30,
        salt_g=6,
        calcium_mg=700,
        energy_mode=TargetMode.TARGET,
        protein_mode=TargetMode.TARGET,
        carbohydrates_mode=TargetMode.TARGET,
        fat_mode=TargetMode.TARGET,
        sugar_mode=TargetMode.LIMIT,
        saturated_fat_mode=TargetMode.LIMIT,
        fibre_mode=TargetMode.TARGET,
        salt_mode=TargetMode.LIMIT,
        calcium_mode=TargetMode.TARGET,
    )


class TestDailyTargetsModel:
    """Tests for DailyTargets model."""

    def test_create_targets_with_defaults(self):
        """Test creating targets with default values."""
        targets = DailyTargets.get_default_targets()

        assert targets.energy_kcal == 2000
        assert targets.protein_g == 150
        assert targets.carbohydrates_g == 225
        assert targets.fat_g == 67
        assert targets.sugar_g == 90
        assert targets.saturated_fat_g == 20
        assert targets.fibre_g == 30
        assert targets.salt_g == 6
        assert targets.calcium_mg == 700

    def test_create_targets_with_custom_values(self):
        """Test creating targets with custom values."""
        targets = DailyTargets(
            date=date.today(),
            energy_kcal=2500,
            protein_g=180,
            carbohydrates_g=300,
            fat_g=80,
            sugar_g=100,
            saturated_fat_g=25,
            fibre_g=35,
            salt_g=7,
            calcium_mg=800,
        )

        assert targets.energy_kcal == 2500
        assert targets.protein_g == 180
        assert targets.carbohydrates_g == 300

    def test_get_nutrient_mode_default(self):
        """Test getting nutrient mode when not specifically set."""
        targets = DailyTargets(
            date=date.today(),
            mode=TargetMode.LIMIT,
            energy_kcal=2000,
        )

        # Should return the default mode when nutrient-specific mode is not set
        assert targets.get_nutrient_mode("protein") == TargetMode.LIMIT

    def test_get_nutrient_mode_specific(self):
        """Test getting nutrient mode when specifically set."""
        targets = DailyTargets(
            date=date.today(),
            mode=TargetMode.TARGET,
            energy_kcal=2000,
            sugar_mode=TargetMode.LIMIT,
        )

        # Should return specific mode for sugar
        assert targets.get_nutrient_mode("sugar") == TargetMode.LIMIT
        # Should return default mode for other nutrients
        assert targets.get_nutrient_mode("protein") == TargetMode.TARGET

    def test_default_modes_are_sensible(self):
        """Test that default targets have sensible modes."""
        targets = DailyTargets.get_default_targets()

        # Targets
        assert targets.get_nutrient_mode("energy") == TargetMode.TARGET
        assert targets.get_nutrient_mode("protein") == TargetMode.TARGET
        assert targets.get_nutrient_mode("carbohydrates") == TargetMode.TARGET
        assert targets.get_nutrient_mode("fibre") == TargetMode.TARGET
        assert targets.get_nutrient_mode("calcium") == TargetMode.TARGET

        # Limits
        assert targets.get_nutrient_mode("sugar") == TargetMode.LIMIT
        assert targets.get_nutrient_mode("saturated_fat") == TargetMode.LIMIT
        assert targets.get_nutrient_mode("salt") == TargetMode.LIMIT

    def test_negative_values_not_allowed(self):
        """Test that negative values are not allowed."""
        with pytest.raises(Exception):  # Pydantic validation error
            DailyTargets(
                date=date.today(),
                energy_kcal=-100,
            )


class TestDailyTargetsStorage:
    """Tests for storage of daily targets."""

    def test_save_and_load_targets(self, storage, sample_targets):
        """Test saving and loading targets."""
        storage.save_daily_targets(sample_targets)
        loaded = storage.load_daily_targets(sample_targets.date)

        assert loaded is not None
        assert loaded.energy_kcal == sample_targets.energy_kcal
        assert loaded.protein_g == sample_targets.protein_g
        assert loaded.get_nutrient_mode("sugar") == TargetMode.LIMIT

    def test_load_nonexistent_targets(self, storage):
        """Test loading targets that don't exist."""
        loaded = storage.load_daily_targets(date.today())
        assert loaded is None

    def test_update_existing_targets(self, storage, sample_targets):
        """Test updating existing targets."""
        # Save initial targets
        storage.save_daily_targets(sample_targets)

        # Update targets
        sample_targets.energy_kcal = 2500
        storage.save_daily_targets(sample_targets)

        # Load and verify
        loaded = storage.load_daily_targets(sample_targets.date)
        assert loaded.energy_kcal == 2500

    def test_get_previous_day_targets(self, storage):
        """Test getting targets from previous day."""
        # Save targets for yesterday
        yesterday = date.today() - timedelta(days=1)
        yesterday_targets = DailyTargets(
            date=yesterday,
            energy_kcal=2100,
            protein_g=160,
        )
        storage.save_daily_targets(yesterday_targets)

        # Get previous day targets for today
        previous = storage.get_previous_day_targets(date.today())

        assert previous is not None
        assert previous.date == date.today()  # Date should be updated
        assert previous.energy_kcal == 2100  # Values should be copied
        assert previous.protein_g == 160

    def test_get_previous_day_targets_none_found(self, storage):
        """Test getting previous day targets when none exist."""
        previous = storage.get_previous_day_targets(date.today())
        assert previous is None

    def test_get_previous_day_targets_skips_future_dates(self, storage):
        """Test that future dates are not considered as previous."""
        # Save targets for tomorrow
        tomorrow = date.today() + timedelta(days=1)
        tomorrow_targets = DailyTargets(
            date=tomorrow,
            energy_kcal=2100,
        )
        storage.save_daily_targets(tomorrow_targets)

        # Get previous day targets for today should return None
        previous = storage.get_previous_day_targets(date.today())
        assert previous is None

    def test_get_or_create_daily_targets_existing(self, storage, sample_targets):
        """Test get_or_create when targets exist."""
        storage.save_daily_targets(sample_targets)
        targets = storage.get_or_create_daily_targets(sample_targets.date)

        assert targets.energy_kcal == sample_targets.energy_kcal

    def test_get_or_create_daily_targets_from_previous(self, storage):
        """Test get_or_create falls back to previous day."""
        # Save targets for yesterday
        yesterday = date.today() - timedelta(days=1)
        yesterday_targets = DailyTargets(
            date=yesterday,
            energy_kcal=2100,
        )
        storage.save_daily_targets(yesterday_targets)

        # Get or create for today should use yesterday's values
        targets = storage.get_or_create_daily_targets(date.today())
        assert targets.energy_kcal == 2100

    def test_get_or_create_daily_targets_defaults(self, storage):
        """Test get_or_create falls back to defaults."""
        targets = storage.get_or_create_daily_targets(date.today())

        # Should return default values
        assert targets.energy_kcal == 2000
        assert targets.protein_g == 150

    def test_multiple_dates_targets(self, storage):
        """Test storing targets for multiple dates."""
        today = date.today()
        yesterday = today - timedelta(days=1)
        two_days_ago = today - timedelta(days=2)

        # Save targets for multiple dates
        for i, d in enumerate([two_days_ago, yesterday, today]):
            targets = DailyTargets(
                date=d,
                energy_kcal=2000 + i * 100,
            )
            storage.save_daily_targets(targets)

        # Verify each can be loaded correctly
        assert storage.load_daily_targets(two_days_ago).energy_kcal == 2000
        assert storage.load_daily_targets(yesterday).energy_kcal == 2100
        assert storage.load_daily_targets(today).energy_kcal == 2200


class TestTargetMode:
    """Tests for TargetMode enum."""

    def test_target_mode_values(self):
        """Test TargetMode enum values."""
        assert TargetMode.TARGET.value == "target"
        assert TargetMode.LIMIT.value == "limit"

    def test_target_mode_from_string(self):
        """Test creating TargetMode from string."""
        assert TargetMode("target") == TargetMode.TARGET
        assert TargetMode("limit") == TargetMode.LIMIT
