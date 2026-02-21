"""SQLModel-based PostgreSQL storage for nutritional data."""

from datetime import UTC, date, datetime
from uuid import UUID

from sqlmodel import col, select

from nutritional.data_entry.models import (
    DailyData,
    DailyTargets,
    FoodEntry,
    FoodItem,
    Meal,
    MealEntry,
    MealIngredient,
    Measurements,
    Nutrients,
)
from nutritional.database.connection import get_db_session
from nutritional.database.models import (
    DailySummaryModel,
    DailyTargetsModel,
    FoodEntryModel,
    FoodItemModel,
    MealIngredientModel,
    MealModel,
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
            try:
                item = session.get(FoodItemModel, UUID(food_id))
            except (ValueError, TypeError):
                return False
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
            try:
                item = session.get(FoodItemModel, UUID(food_id))
            except (ValueError, TypeError):
                # If food_id is not a valid UUID format, return None
                return None
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

    # ============= Meals =============

    def load_meals(self) -> list[Meal]:
        """Load all meal templates from database.

        Returns:
            List of Meal objects
        """
        with get_db_session() as session:
            statement = select(MealModel).order_by(MealModel.name)
            results = session.exec(statement).all()

            return [self._db_meal_to_pydantic(meal) for meal in results]

    def save_meal(self, meal: Meal) -> None:
        """Add or update a meal template in the database.

        Args:
            meal: Meal to save
        """
        with get_db_session() as session:
            # Check if meal exists
            existing = session.get(MealModel, UUID(meal.id))

            if existing:
                # Update existing
                existing.name = meal.name
                existing.updated_at = datetime.now(UTC)
                session.add(existing)
                # Delete existing ingredients
                session.exec(
                    select(MealIngredientModel).where(MealIngredientModel.meal_id == UUID(meal.id))
                ).delete()
            else:
                # Insert new
                db_meal = MealModel(
                    id=UUID(meal.id),
                    name=meal.name,
                    created_at=meal.created_at,
                    updated_at=meal.updated_at,
                )
                session.add(db_meal)
                session.flush()  # Ensure meal is inserted before ingredients

            # Insert ingredients (after meal is inserted/updated)
            for ingredient in meal.ingredients:
                db_ingredient = MealIngredientModel(
                    meal_id=UUID(meal.id),
                    food_id=UUID(ingredient.food_id),
                    weight_g=ingredient.weight_g,
                    quantity=ingredient.quantity,
                )
                session.add(db_ingredient)

    def get_meal(self, meal_id: str) -> Meal | None:
        """Get a specific meal by ID.

        Args:
            meal_id: ID of the meal

        Returns:
            Meal if found, None otherwise
        """
        with get_db_session() as session:
            try:
                meal = session.get(MealModel, UUID(meal_id))
            except (ValueError, TypeError):
                return None
            if not meal:
                return None
            return self._db_meal_to_pydantic(meal)

    def delete_meal(self, meal_id: str) -> bool:
        """Delete a meal template from the database.

        Args:
            meal_id: ID of the meal to delete

        Returns:
            True if meal was deleted, False if not found
        """
        with get_db_session() as session:
            try:
                meal = session.get(MealModel, UUID(meal_id))
            except (ValueError, TypeError):
                return False
            if meal:
                session.delete(meal)
                return True
            return False

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

            # Get daily summary for measurements
            summary_statement = select(DailySummaryModel).where(
                DailySummaryModel.summary_date == entry_date
            )
            summary = session.exec(summary_statement).first()

            # Return None only if there are no entries AND no measurements
            if not db_entries and not summary:
                return None

            # Group entries by meal_id
            individual_entries = []
            meal_groups = {}

            for db_entry in db_entries:
                pydantic_entry = self._db_food_entry_to_pydantic(db_entry)
                if db_entry.meal_id:
                    # Part of a meal
                    meal_id_str = str(db_entry.meal_id)
                    if meal_id_str not in meal_groups:
                        meal_groups[meal_id_str] = []
                    meal_groups[meal_id_str].append(pydantic_entry)
                else:
                    # Individual entry
                    individual_entries.append(pydantic_entry)

            # Convert meal groups to MealEntry objects
            meal_entries = []
            for meal_id_str, ingredients in meal_groups.items():
                # Get meal details
                meal = session.get(MealModel, UUID(meal_id_str))
                if meal:
                    meal_entry = MealEntry(
                        meal_id=meal_id_str,
                        meal_name=meal.name,
                        portions=1.0,  # Default, will be calculated if needed
                        ingredients=ingredients,
                    )
                    meal_entries.append(meal_entry)

            # Combine individual and meal entries
            entries = individual_entries + meal_entries

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

        This method saves food entries and updates nutrient totals.
        If weights (measurements) are provided, they will also be updated.
        To update weights independently of food entries, use update_measurements() instead.

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
                if isinstance(entry, FoodEntry):
                    # Regular food entry
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
                        meal_id=None,  # Not part of a meal
                    )
                    session.add(db_entry)
                elif isinstance(entry, MealEntry):
                    # Meal entry - store each ingredient as a FoodEntry with meal_id
                    for ingredient in entry.ingredients:
                        db_entry = FoodEntryModel(
                            id=UUID(ingredient.entry_id),
                            entry_date=daily_data.date,
                            timestamp=ingredient.timestamp,
                            food_id=UUID(ingredient.food_id),
                            weight_g=ingredient.weight_g,
                            quantity=ingredient.quantity,
                            energy_kcal=ingredient.nutrients.energy_kcal,
                            fat_g=ingredient.nutrients.fat_g,
                            saturated_fat_g=ingredient.nutrients.saturated_fat_g,
                            carbohydrates_g=ingredient.nutrients.carbohydrates_g,
                            sugar_g=ingredient.nutrients.sugar_g,
                            protein_g=ingredient.nutrients.protein_g,
                            fibre_g=ingredient.nutrients.fibre_g,
                            salt_g=ingredient.nutrients.salt_g,
                            calcium_mg=ingredient.nutrients.calcium_mg,
                            meal_id=UUID(entry.meal_id),  # Link to the meal
                        )
                        session.add(db_entry)

            # Upsert daily summary (nutrients only - weights are updated independently)
            summary_statement = select(DailySummaryModel).where(
                DailySummaryModel.summary_date == daily_data.date
            )
            summary = session.exec(summary_statement).first()

            totals = daily_data.totals

            if summary:
                # Update existing - ONLY update nutrients, not weights
                if totals is not None:
                    summary.energy_kcal = totals.energy_kcal
                    summary.fat_g = totals.fat_g
                    summary.saturated_fat_g = totals.saturated_fat_g
                    summary.carbohydrates_g = totals.carbohydrates_g
                    summary.sugar_g = totals.sugar_g
                    summary.protein_g = totals.protein_g
                    summary.fibre_g = totals.fibre_g
                    summary.salt_g = totals.salt_g
                    summary.calcium_mg = totals.calcium_mg
                else:
                    summary.energy_kcal = None
                    summary.fat_g = None
                    summary.saturated_fat_g = None
                    summary.carbohydrates_g = None
                    summary.sugar_g = None
                    summary.protein_g = None
                    summary.fibre_g = None
                    summary.salt_g = None
                    summary.calcium_mg = None
                # NOTE: Weights (morning_weight_kg, evening_weight_kg) are NOT updated here
                # They are managed independently by update_measurements() callback
                summary.updated_at = datetime.now(UTC)
                session.add(summary)
            else:
                # Create new
                if totals is not None:
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
                        # NOTE: Weights are NOT set here either
                        # They must be saved independently via update_measurements()
                    )
                else:
                    summary = DailySummaryModel(
                        summary_date=daily_data.date,
                        energy_kcal=None,
                        fat_g=None,
                        saturated_fat_g=None,
                        carbohydrates_g=None,
                        sugar_g=None,
                        protein_g=None,
                        fibre_g=None,
                        salt_g=None,
                        calcium_mg=None,
                        # NOTE: Weights are NOT set here
                    )
                session.add(summary)

    def update_measurements(
        self,
        entry_date: date,
        morning_weight_kg: float | None = None,
        evening_weight_kg: float | None = None,
    ) -> None:
        """Update only weight measurements without touching food entries.

        This method updates weight measurements independently of food entries.
        It performs an upsert: if the date exists, only the specified weights are updated.
        If the date doesn't exist, a new row is created with the weights and null nutrients.

        Args:
            entry_date: Date to update
            morning_weight_kg: Morning weight (or None to keep existing)
            evening_weight_kg: Evening weight (or None to keep existing)
        """
        with get_db_session() as session:
            # Check if summary exists for this date
            existing = session.exec(
                select(DailySummaryModel).where(DailySummaryModel.summary_date == entry_date)
            ).first()

            if existing:
                # Update only the weight fields
                if morning_weight_kg is not None:
                    existing.morning_weight_kg = morning_weight_kg
                if evening_weight_kg is not None:
                    existing.evening_weight_kg = evening_weight_kg
                existing.updated_at = datetime.now(UTC)
                session.add(existing)
            else:
                # Create new with weights only (nutrients will be null)
                new_summary = DailySummaryModel(
                    summary_date=entry_date,
                    morning_weight_kg=morning_weight_kg,
                    evening_weight_kg=evening_weight_kg,
                )
                session.add(new_summary)

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

    def _db_meal_to_pydantic(self, db_meal: MealModel) -> Meal:
        """Convert SQLModel MealModel to Pydantic Meal.

        Args:
            db_meal: SQLModel database object

        Returns:
            Pydantic Meal object
        """
        with get_db_session() as session:
            # Load ingredients
            ingredients_statement = select(MealIngredientModel).where(
                MealIngredientModel.meal_id == db_meal.id
            )
            db_ingredients = session.exec(ingredients_statement).all()

            ingredients = []
            for db_ing in db_ingredients:
                # Get food item details
                food_item = session.get(FoodItemModel, db_ing.food_id)
                if not food_item:
                    continue  # Skip if food not found

                # Calculate nutrients based on amount
                if db_ing.weight_g is not None:
                    # Scale nutrients by weight_g / 100 for per_100g items
                    if food_item.unit_type == "per_100g":
                        scale = db_ing.weight_g / 100.0
                    else:
                        # For per_item, weight_g should be serving_size_g * quantity
                        scale = db_ing.weight_g / 100.0
                else:
                    # For quantity (per_item), use serving_size_g as base
                    if food_item.unit_type == "per_item" and food_item.serving_size_g:
                        scale = db_ing.quantity
                    else:
                        scale = 1.0  # Fallback

                nutrients = Nutrients(
                    energy_kcal=food_item.energy_kcal * scale,
                    fat_g=food_item.fat_g * scale,
                    saturated_fat_g=food_item.saturated_fat_g * scale,
                    carbohydrates_g=food_item.carbohydrates_g * scale,
                    sugar_g=food_item.sugar_g * scale,
                    protein_g=food_item.protein_g * scale,
                    fibre_g=food_item.fibre_g * scale,
                    salt_g=food_item.salt_g * scale,
                    calcium_mg=food_item.calcium_mg * scale,
                )

                ingredients.append(
                    MealIngredient(
                        food_id=str(db_ing.food_id),
                        food_name=food_item.name,
                        weight_g=db_ing.weight_g,
                        quantity=db_ing.quantity,
                        nutrients=nutrients,
                    )
                )

        return Meal(
            id=str(db_meal.id),
            name=db_meal.name,
            ingredients=ingredients,
            created_at=db_meal.created_at,
            updated_at=db_meal.updated_at,
        )
