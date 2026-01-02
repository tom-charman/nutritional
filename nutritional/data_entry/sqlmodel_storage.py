"""SQLModel-based PostgreSQL storage for nutritional data."""

from datetime import UTC, date, datetime
from uuid import UUID

from sqlmodel import col, select

from nutritional.data_entry.models import (
    DailyData,
    DailyTargets,
    FoodEntry,
    FoodItem,
    Measurements,
    Nutrients,
)
from nutritional.database.connection import get_db_session
from nutritional.database.models import (
    DailySummaryModel,
    DailyTargetsModel,
    FoodEntryModel,
    FoodItemModel,
)


class SQLModelStorage:
    """SQLModel-based PostgreSQL storage for nutritional tracking data."""

    def __init__(self):
        """Initialize SQLModel storage."""
        pass

    # ============= Food Items =============

    def load_food_database(self) -> list[FoodItem]:
        """Load all food items from database.

        Returns:
            List of FoodItem objects
        """
        with get_db_session() as session:
            statement = select(FoodItemModel).order_by(FoodItemModel.name)
            results = session.exec(statement).all()

            return [self._db_food_item_to_pydantic(item) for item in results]

    def save_food_item(self, item: FoodItem) -> None:
        """Add or update a food item in the database.

        Args:
            item: FoodItem to save
        """
        with get_db_session() as session:
            # Check if item exists
            existing = session.get(FoodItemModel, UUID(item.id))

            if existing:
                # Update existing
                existing.name = item.name
                existing.unit_type = item.unit_type
                existing.serving_size_g = item.serving_size_g
                existing.energy_kcal = item.energy_kcal
                existing.fat_g = item.fat_g
                existing.saturated_fat_g = item.saturated_fat_g
                existing.carbohydrates_g = item.carbohydrates_g
                existing.sugar_g = item.sugar_g
                existing.protein_g = item.protein_g
                existing.fibre_g = item.fibre_g
                existing.salt_g = item.salt_g
                existing.calcium_mg = item.calcium_mg
                existing.updated_at = datetime.now(UTC)
                session.add(existing)
            else:
                # Insert new
                db_item = FoodItemModel(
                    id=UUID(item.id),
                    name=item.name,
                    unit_type=item.unit_type,
                    serving_size_g=item.serving_size_g,
                    energy_kcal=item.energy_kcal,
                    fat_g=item.fat_g,
                    saturated_fat_g=item.saturated_fat_g,
                    carbohydrates_g=item.carbohydrates_g,
                    sugar_g=item.sugar_g,
                    protein_g=item.protein_g,
                    fibre_g=item.fibre_g,
                    salt_g=item.salt_g,
                    calcium_mg=item.calcium_mg,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                )
                session.add(db_item)

    def delete_food_item(self, food_id: str) -> bool:
        """Delete a food item from the database.

        Args:
            food_id: ID of the food item to delete

        Returns:
            True if item was deleted, False if not found
        """
        with get_db_session() as session:
            item = session.get(FoodItemModel, UUID(food_id))
            if item:
                session.delete(item)
                return True
            return False

    def get_food_item(self, food_id: str) -> FoodItem | None:
        """Get a specific food item by ID.

        Args:
            food_id: ID of the food item

        Returns:
            FoodItem if found, None otherwise
        """
        with get_db_session() as session:
            item = session.get(FoodItemModel, UUID(food_id))
            if not item:
                return None
            return self._db_food_item_to_pydantic(item)

    def search_food_items(self, query: str) -> list[FoodItem]:
        """Search food items by name.

        Args:
            query: Search query string

        Returns:
            List of matching FoodItem objects
        """
        with get_db_session() as session:
            statement = (
                select(FoodItemModel)
                .where(col(FoodItemModel.name).ilike(f"%{query}%"))
                .order_by(FoodItemModel.name)
            )
            results = session.exec(statement).all()

            return [self._db_food_item_to_pydantic(item) for item in results]

    # ============= Daily Entries =============

    def load_daily_entry(self, entry_date: date) -> DailyData | None:
        """Load daily entry for a specific date.

        Args:
            entry_date: Date to load

        Returns:
            DailyData if found, None otherwise
        """
        with get_db_session() as session:
            # Get food entries for the date
            statement = (
                select(FoodEntryModel)
                .where(FoodEntryModel.entry_date == entry_date)
                .order_by(FoodEntryModel.timestamp)
            )
            db_entries = session.exec(statement).all()

            if not db_entries:
                return None

            entries = [self._db_food_entry_to_pydantic(entry) for entry in db_entries]

            # Get daily summary for measurements
            summary_statement = select(DailySummaryModel).where(
                DailySummaryModel.summary_date == entry_date
            )
            summary = session.exec(summary_statement).first()

            measurements = Measurements(
                morning_weight_kg=summary.morning_weight_kg if summary else None,
                evening_weight_kg=summary.evening_weight_kg if summary else None,
            )

            daily_data = DailyData(
                date=entry_date,
                entries=entries,
                measurements=measurements,
            )
            daily_data.totals = daily_data.calculate_totals()

            return daily_data

    def save_daily_entry(self, daily_data: DailyData) -> None:
        """Save daily entry to database.

        Args:
            daily_data: DailyData to save
        """
        # Calculate totals
        daily_data.totals = daily_data.calculate_totals()

        with get_db_session() as session:
            # Delete existing entries for this date (will be replaced)
            condition = FoodEntryModel.entry_date == daily_data.date
            delete_statement = select(FoodEntryModel).where(condition)
            existing_entries = session.exec(delete_statement).all()
            for entry in existing_entries:
                session.delete(entry)

            # Insert food entries
            for entry in daily_data.entries:
                db_entry = FoodEntryModel(
                    id=UUID(entry.entry_id),
                    entry_date=daily_data.date,
                    timestamp=entry.timestamp,
                    food_id=UUID(entry.food_id),
                    weight_g=entry.weight_g,
                    quantity=entry.quantity,
                    energy_kcal=entry.nutrients.energy_kcal,
                    fat_g=entry.nutrients.fat_g,
                    saturated_fat_g=entry.nutrients.saturated_fat_g,
                    carbohydrates_g=entry.nutrients.carbohydrates_g,
                    sugar_g=entry.nutrients.sugar_g,
                    protein_g=entry.nutrients.protein_g,
                    fibre_g=entry.nutrients.fibre_g,
                    salt_g=entry.nutrients.salt_g,
                    calcium_mg=entry.nutrients.calcium_mg,
                )
                session.add(db_entry)

            # Upsert daily summary
            summary_statement = select(DailySummaryModel).where(
                DailySummaryModel.summary_date == daily_data.date
            )
            summary = session.exec(summary_statement).first()

            totals = daily_data.totals

            if summary:
                # Update existing
                summary.energy_kcal = totals.energy_kcal
                summary.fat_g = totals.fat_g
                summary.saturated_fat_g = totals.saturated_fat_g
                summary.carbohydrates_g = totals.carbohydrates_g
                summary.sugar_g = totals.sugar_g
                summary.protein_g = totals.protein_g
                summary.fibre_g = totals.fibre_g
                summary.salt_g = totals.salt_g
                summary.calcium_mg = totals.calcium_mg
                summary.morning_weight_kg = daily_data.measurements.morning_weight_kg
                summary.evening_weight_kg = daily_data.measurements.evening_weight_kg
                summary.updated_at = datetime.now(UTC)
                session.add(summary)
            else:
                # Create new
                summary = DailySummaryModel(
                    summary_date=daily_data.date,
                    energy_kcal=totals.energy_kcal,
                    fat_g=totals.fat_g,
                    saturated_fat_g=totals.saturated_fat_g,
                    carbohydrates_g=totals.carbohydrates_g,
                    sugar_g=totals.sugar_g,
                    protein_g=totals.protein_g,
                    fibre_g=totals.fibre_g,
                    salt_g=totals.salt_g,
                    calcium_mg=totals.calcium_mg,
                    morning_weight_kg=daily_data.measurements.morning_weight_kg,
                    evening_weight_kg=daily_data.measurements.evening_weight_kg,
                )
                session.add(summary)

    def get_all_dates(self) -> list[date]:
        """Get all dates with entries.

        Returns:
            List of dates (sorted newest first)
        """
        with get_db_session() as session:
            from sqlalchemy import desc

            field = FoodEntryModel.entry_date
            statement = select(field).distinct().order_by(desc(field))
            results = session.exec(statement).all()
            return results

    # ============= Daily Targets =============

    def save_daily_targets(self, targets: DailyTargets) -> None:
        """Save daily targets.

        Args:
            targets: DailyTargets to save
        """
        with get_db_session() as session:
            # Check if targets exist for this date
            condition = DailyTargetsModel.target_date == targets.date
            statement = select(DailyTargetsModel).where(condition)
            existing = session.exec(statement).first()

            if existing:
                # Update existing
                existing.default_mode = targets.mode.value
                existing.energy_kcal = targets.energy_kcal
                existing.protein_g = targets.protein_g
                existing.carbohydrates_g = targets.carbohydrates_g
                existing.fat_g = targets.fat_g
                existing.sugar_g = targets.sugar_g
                existing.saturated_fat_g = targets.saturated_fat_g
                existing.fibre_g = targets.fibre_g
                existing.salt_g = targets.salt_g
                existing.calcium_mg = targets.calcium_mg
                existing.energy_mode = targets.energy_mode.value if targets.energy_mode else None
                existing.protein_mode = targets.protein_mode.value if targets.protein_mode else None
                existing.carbohydrates_mode = (
                    targets.carbohydrates_mode.value if targets.carbohydrates_mode else None
                )
                existing.fat_mode = targets.fat_mode.value if targets.fat_mode else None
                existing.sugar_mode = targets.sugar_mode.value if targets.sugar_mode else None
                existing.saturated_fat_mode = (
                    targets.saturated_fat_mode.value if targets.saturated_fat_mode else None
                )
                existing.fibre_mode = targets.fibre_mode.value if targets.fibre_mode else None
                existing.salt_mode = targets.salt_mode.value if targets.salt_mode else None
                existing.calcium_mode = targets.calcium_mode.value if targets.calcium_mode else None
                existing.updated_at = datetime.now(UTC)
                session.add(existing)
            else:
                # Create new
                db_targets = DailyTargetsModel(
                    target_date=targets.date,
                    default_mode=targets.mode.value,
                    energy_kcal=targets.energy_kcal,
                    protein_g=targets.protein_g,
                    carbohydrates_g=targets.carbohydrates_g,
                    fat_g=targets.fat_g,
                    sugar_g=targets.sugar_g,
                    saturated_fat_g=targets.saturated_fat_g,
                    fibre_g=targets.fibre_g,
                    salt_g=targets.salt_g,
                    calcium_mg=targets.calcium_mg,
                    energy_mode=targets.energy_mode.value if targets.energy_mode else None,
                    protein_mode=targets.protein_mode.value if targets.protein_mode else None,
                    carbohydrates_mode=targets.carbohydrates_mode.value
                    if targets.carbohydrates_mode
                    else None,
                    fat_mode=targets.fat_mode.value if targets.fat_mode else None,
                    sugar_mode=targets.sugar_mode.value if targets.sugar_mode else None,
                    saturated_fat_mode=targets.saturated_fat_mode.value
                    if targets.saturated_fat_mode
                    else None,
                    fibre_mode=targets.fibre_mode.value if targets.fibre_mode else None,
                    salt_mode=targets.salt_mode.value if targets.salt_mode else None,
                    calcium_mode=targets.calcium_mode.value if targets.calcium_mode else None,
                )
                session.add(db_targets)

    def load_daily_targets(self, target_date: date) -> DailyTargets | None:
        """Load daily targets for a specific date.

        Args:
            target_date: Date to load targets for

        Returns:
            DailyTargets if found, None otherwise
        """
        with get_db_session() as session:
            condition = DailyTargetsModel.target_date == target_date
            statement = select(DailyTargetsModel).where(condition)
            db_targets = session.exec(statement).first()

            if not db_targets:
                return None

            return self._db_daily_targets_to_pydantic(db_targets)

    def get_previous_day_targets(self, target_date: date) -> DailyTargets | None:
        """Get targets from the most recent day before the given date.

        Args:
            target_date: Reference date

        Returns:
            DailyTargets from previous day, or None if not found
        """
        with get_db_session() as session:
            from sqlalchemy import desc

            statement = (
                select(DailyTargetsModel)
                .where(DailyTargetsModel.target_date < target_date)
                .order_by(desc(DailyTargetsModel.target_date))
                .limit(1)
            )
            db_targets = session.exec(statement).first()

            if not db_targets:
                return None

            # Return with the target_date, not the previous date
            targets = self._db_daily_targets_to_pydantic(db_targets)
            targets.date = target_date
            return targets

    def get_or_create_daily_targets(self, target_date: date) -> DailyTargets:
        """Get targets for a date, creating from previous day or defaults if not found.

        Args:
            target_date: Date to get targets for

        Returns:
            DailyTargets for the date
        """
        # Try to load existing targets
        targets = self.load_daily_targets(target_date)
        if targets:
            return targets

        # Try to get from previous day
        targets = self.get_previous_day_targets(target_date)
        if targets:
            return targets

        # Fall back to defaults
        targets = DailyTargets.get_default_targets(target_date)
        return targets

    # ============= Helper Methods =============

    def _db_food_item_to_pydantic(self, db_item: FoodItemModel) -> FoodItem:
        """Convert SQLModel FoodItemModel to Pydantic FoodItem.

        Args:
            db_item: SQLModel database object

        Returns:
            Pydantic FoodItem object
        """
        from nutritional.data_entry.models import UnitType

        return FoodItem(
            id=str(db_item.id),
            name=db_item.name,
            unit_type=UnitType(db_item.unit_type),
            serving_size_g=db_item.serving_size_g,
            energy_kcal=db_item.energy_kcal,
            fat_g=db_item.fat_g,
            saturated_fat_g=db_item.saturated_fat_g,
            carbohydrates_g=db_item.carbohydrates_g,
            sugar_g=db_item.sugar_g,
            protein_g=db_item.protein_g,
            fibre_g=db_item.fibre_g,
            salt_g=db_item.salt_g,
            calcium_mg=db_item.calcium_mg,
            created_at=db_item.created_at,
            updated_at=db_item.updated_at,
        )

    def _db_food_entry_to_pydantic(self, db_entry: FoodEntryModel) -> FoodEntry:
        """Convert SQLModel FoodEntryModel to Pydantic FoodEntry.

        Args:
            db_entry: SQLModel database object

        Returns:
            Pydantic FoodEntry object
        """
        # Look up food name from food_id
        with get_db_session() as session:
            food_item = session.get(FoodItemModel, db_entry.food_id)
            food_name = food_item.name if food_item else "Unknown"

        return FoodEntry(
            entry_id=str(db_entry.id),
            timestamp=db_entry.timestamp,
            food_id=str(db_entry.food_id),
            food_name=food_name,
            weight_g=db_entry.weight_g,
            quantity=db_entry.quantity,
            nutrients=Nutrients(
                energy_kcal=db_entry.energy_kcal,
                fat_g=db_entry.fat_g,
                saturated_fat_g=db_entry.saturated_fat_g,
                carbohydrates_g=db_entry.carbohydrates_g,
                sugar_g=db_entry.sugar_g,
                protein_g=db_entry.protein_g,
                fibre_g=db_entry.fibre_g,
                salt_g=db_entry.salt_g,
                calcium_mg=db_entry.calcium_mg,
            ),
        )

    def _db_daily_targets_to_pydantic(self, db_targets: DailyTargetsModel) -> DailyTargets:
        """Convert SQLModel DailyTargetsModel to Pydantic DailyTargets.

        Args:
            db_targets: SQLModel database object

        Returns:
            Pydantic DailyTargets object
        """
        from nutritional.data_entry.models import TargetMode

        return DailyTargets(
            date=db_targets.target_date,
            mode=TargetMode(db_targets.default_mode),
            energy_kcal=db_targets.energy_kcal,
            protein_g=db_targets.protein_g,
            carbohydrates_g=db_targets.carbohydrates_g,
            fat_g=db_targets.fat_g,
            sugar_g=db_targets.sugar_g,
            saturated_fat_g=db_targets.saturated_fat_g,
            fibre_g=db_targets.fibre_g,
            salt_g=db_targets.salt_g,
            calcium_mg=db_targets.calcium_mg,
            energy_mode=TargetMode(db_targets.energy_mode) if db_targets.energy_mode else None,
            protein_mode=TargetMode(db_targets.protein_mode) if db_targets.protein_mode else None,
            carbohydrates_mode=TargetMode(db_targets.carbohydrates_mode)
            if db_targets.carbohydrates_mode
            else None,
            fat_mode=TargetMode(db_targets.fat_mode) if db_targets.fat_mode else None,
            sugar_mode=TargetMode(db_targets.sugar_mode) if db_targets.sugar_mode else None,
            saturated_fat_mode=TargetMode(db_targets.saturated_fat_mode)
            if db_targets.saturated_fat_mode
            else None,
            fibre_mode=TargetMode(db_targets.fibre_mode) if db_targets.fibre_mode else None,
            salt_mode=TargetMode(db_targets.salt_mode) if db_targets.salt_mode else None,
            calcium_mode=TargetMode(db_targets.calcium_mode) if db_targets.calcium_mode else None,
        )
