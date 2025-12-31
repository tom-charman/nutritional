"""PostgreSQL-based storage for nutritional data."""

import uuid
from datetime import date, datetime

from nutritional.data.db import get_db_cursor
from nutritional.data_entry.models import (
    DailyData,
    DailyTargets,
    FoodEntry,
    FoodItem,
    Measurements,
    Nutrients,
)


class PostgresStorage:
    """PostgreSQL-based storage for nutritional tracking data."""

    def __init__(self):
        """Initialize PostgreSQL storage."""
        pass

    # ============= Food Items =============

    def load_food_database(self) -> list[FoodItem]:
        """Load all food items from database.

        Returns:
            List of FoodItem objects
        """
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT id, name, unit_type, serving_size_g,
                       energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                       sugar_g, protein_g, fibre_g, salt_g, calcium_mg,
                       created_at, updated_at
                FROM food_items
                ORDER BY name
            """)
            rows = cur.fetchall()

            return [
                FoodItem(
                    id=str(row["id"]),
                    name=row["name"],
                    unit_type=row["unit_type"],
                    serving_size_g=float(row["serving_size_g"]) if row["serving_size_g"] else None,
                    energy_kcal=float(row["energy_kcal"]),
                    fat_g=float(row["fat_g"]),
                    saturated_fat_g=float(row["saturated_fat_g"]),
                    carbohydrates_g=float(row["carbohydrates_g"]),
                    sugar_g=float(row["sugar_g"]),
                    protein_g=float(row["protein_g"]),
                    fibre_g=float(row["fibre_g"]),
                    salt_g=float(row["salt_g"]),
                    calcium_mg=float(row["calcium_mg"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    def save_food_item(self, item: FoodItem) -> None:
        """Add or update a food item in the database.

        Args:
            item: FoodItem to save
        """
        with get_db_cursor() as cur:
            # Check if item exists
            cur.execute("SELECT id FROM food_items WHERE id = %s", (uuid.UUID(item.id),))
            exists = cur.fetchone()

            if exists:
                # Update existing
                item.updated_at = datetime.now()
                cur.execute(
                    """
                    UPDATE food_items
                    SET name = %s, unit_type = %s, serving_size_g = %s,
                        energy_kcal = %s, fat_g = %s, saturated_fat_g = %s,
                        carbohydrates_g = %s, sugar_g = %s, protein_g = %s,
                        fibre_g = %s, salt_g = %s, calcium_mg = %s,
                        updated_at = %s
                    WHERE id = %s
                """,
                    (
                        item.name,
                        item.unit_type,
                        item.serving_size_g,
                        item.energy_kcal,
                        item.fat_g,
                        item.saturated_fat_g,
                        item.carbohydrates_g,
                        item.sugar_g,
                        item.protein_g,
                        item.fibre_g,
                        item.salt_g,
                        item.calcium_mg,
                        item.updated_at,
                        uuid.UUID(item.id),
                    ),
                )
            else:
                # Insert new
                cur.execute(
                    """
                    INSERT INTO food_items (
                        id, name, unit_type, serving_size_g,
                        energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                        sugar_g, protein_g, fibre_g, salt_g, calcium_mg,
                        created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                    (
                        uuid.UUID(item.id),
                        item.name,
                        item.unit_type,
                        item.serving_size_g,
                        item.energy_kcal,
                        item.fat_g,
                        item.saturated_fat_g,
                        item.carbohydrates_g,
                        item.sugar_g,
                        item.protein_g,
                        item.fibre_g,
                        item.salt_g,
                        item.calcium_mg,
                        item.created_at,
                        item.updated_at,
                    ),
                )

    def delete_food_item(self, food_id: str) -> bool:
        """Delete a food item from the database.

        Args:
            food_id: ID of the food item to delete

        Returns:
            True if item was deleted, False if not found
        """
        with get_db_cursor() as cur:
            cur.execute("DELETE FROM food_items WHERE id = %s", (uuid.UUID(food_id),))
            return cur.rowcount > 0

    def get_food_item(self, food_id: str) -> FoodItem | None:
        """Get a specific food item by ID.

        Args:
            food_id: ID of the food item

        Returns:
            FoodItem if found, None otherwise
        """
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT id, name, unit_type, serving_size_g,
                       energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                       sugar_g, protein_g, fibre_g, salt_g, calcium_mg,
                       created_at, updated_at
                FROM food_items
                WHERE id = %s
            """,
                (uuid.UUID(food_id),),
            )
            row = cur.fetchone()

            if not row:
                return None

            return FoodItem(
                id=str(row["id"]),
                name=row["name"],
                unit_type=row["unit_type"],
                serving_size_g=float(row["serving_size_g"]) if row["serving_size_g"] else None,
                energy_kcal=float(row["energy_kcal"]),
                fat_g=float(row["fat_g"]),
                saturated_fat_g=float(row["saturated_fat_g"]),
                carbohydrates_g=float(row["carbohydrates_g"]),
                sugar_g=float(row["sugar_g"]),
                protein_g=float(row["protein_g"]),
                fibre_g=float(row["fibre_g"]),
                salt_g=float(row["salt_g"]),
                calcium_mg=float(row["calcium_mg"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def search_food_items(self, query: str) -> list[FoodItem]:
        """Search food items by name.

        Args:
            query: Search query string

        Returns:
            List of matching FoodItem objects
        """
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT id, name, unit_type, serving_size_g,
                       energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                       sugar_g, protein_g, fibre_g, salt_g, calcium_mg,
                       created_at, updated_at
                FROM food_items
                WHERE LOWER(name) LIKE LOWER(%s)
                ORDER BY name
            """,
                (f"%{query}%",),
            )
            rows = cur.fetchall()

            return [
                FoodItem(
                    id=str(row["id"]),
                    name=row["name"],
                    unit_type=row["unit_type"],
                    serving_size_g=float(row["serving_size_g"]) if row["serving_size_g"] else None,
                    energy_kcal=float(row["energy_kcal"]),
                    fat_g=float(row["fat_g"]),
                    saturated_fat_g=float(row["saturated_fat_g"]),
                    carbohydrates_g=float(row["carbohydrates_g"]),
                    sugar_g=float(row["sugar_g"]),
                    protein_g=float(row["protein_g"]),
                    fibre_g=float(row["fibre_g"]),
                    salt_g=float(row["salt_g"]),
                    calcium_mg=float(row["calcium_mg"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    # ============= Daily Entries =============

    def load_daily_entry(self, entry_date: date) -> DailyData | None:
        """Load daily entry for a specific date.

        Args:
            entry_date: Date to load

        Returns:
            DailyData if found, None otherwise
        """
        with get_db_cursor() as cur:
            # Get food entries for the date
            cur.execute(
                """
                SELECT entry_id, food_id, food_name, timestamp,
                       weight_g, quantity,
                       energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                       sugar_g, protein_g, fibre_g, salt_g, calcium_mg
                FROM food_entries
                WHERE date = %s
                ORDER BY timestamp
            """,
                (entry_date,),
            )
            rows = cur.fetchall()

            if not rows:
                return None

            entries = [
                FoodEntry(
                    entry_id=str(row["entry_id"]),
                    food_id=str(row["food_id"]),
                    food_name=row["food_name"],
                    timestamp=row["timestamp"],
                    weight_g=float(row["weight_g"]) if row["weight_g"] else None,
                    quantity=int(row["quantity"]) if row["quantity"] else None,
                    nutrients=Nutrients(
                        energy_kcal=float(row["energy_kcal"]),
                        fat_g=float(row["fat_g"]),
                        saturated_fat_g=float(row["saturated_fat_g"]),
                        carbohydrates_g=float(row["carbohydrates_g"]),
                        sugar_g=float(row["sugar_g"]),
                        protein_g=float(row["protein_g"]),
                        fibre_g=float(row["fibre_g"]),
                        salt_g=float(row["salt_g"]),
                        calcium_mg=float(row["calcium_mg"]),
                    ),
                )
                for row in rows
            ]

            # Get daily summary for measurements
            cur.execute(
                """
                SELECT morning_weight_kg, evening_weight_kg
                FROM daily_summaries
                WHERE date = %s
            """,
                (entry_date,),
            )
            summary = cur.fetchone()

            measurements = Measurements(
                morning_weight_kg=float(summary["morning_weight_kg"])
                if summary and summary["morning_weight_kg"]
                else None,
                evening_weight_kg=float(summary["evening_weight_kg"])
                if summary and summary["evening_weight_kg"]
                else None,
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

        with get_db_cursor() as cur:
            # Delete existing entries for this date (will be replaced)
            cur.execute("DELETE FROM food_entries WHERE date = %s", (daily_data.date,))

            # Insert food entries
            for entry in daily_data.entries:
                cur.execute(
                    """
                    INSERT INTO food_entries (
                        entry_id, date, food_id, food_name, timestamp,
                        weight_g, quantity,
                        energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                        sugar_g, protein_g, fibre_g, salt_g, calcium_mg
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                    (
                        uuid.UUID(entry.entry_id),
                        daily_data.date,
                        uuid.UUID(entry.food_id),
                        entry.food_name,
                        entry.timestamp,
                        entry.weight_g,
                        entry.quantity,
                        entry.nutrients.energy_kcal,
                        entry.nutrients.fat_g,
                        entry.nutrients.saturated_fat_g,
                        entry.nutrients.carbohydrates_g,
                        entry.nutrients.sugar_g,
                        entry.nutrients.protein_g,
                        entry.nutrients.fibre_g,
                        entry.nutrients.salt_g,
                        entry.nutrients.calcium_mg,
                    ),
                )

            # Upsert daily summary
            totals = daily_data.totals
            cur.execute(
                """
                INSERT INTO daily_summaries (
                    date, energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                    sugar_g, protein_g, fibre_g, salt_g, calcium_mg,
                    morning_weight_kg, evening_weight_kg
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    energy_kcal = EXCLUDED.energy_kcal,
                    fat_g = EXCLUDED.fat_g,
                    saturated_fat_g = EXCLUDED.saturated_fat_g,
                    carbohydrates_g = EXCLUDED.carbohydrates_g,
                    sugar_g = EXCLUDED.sugar_g,
                    protein_g = EXCLUDED.protein_g,
                    fibre_g = EXCLUDED.fibre_g,
                    salt_g = EXCLUDED.salt_g,
                    calcium_mg = EXCLUDED.calcium_mg,
                    morning_weight_kg = EXCLUDED.morning_weight_kg,
                    evening_weight_kg = EXCLUDED.evening_weight_kg
            """,
                (
                    daily_data.date,
                    totals.energy_kcal,
                    totals.fat_g,
                    totals.saturated_fat_g,
                    totals.carbohydrates_g,
                    totals.sugar_g,
                    totals.protein_g,
                    totals.fibre_g,
                    totals.salt_g,
                    totals.calcium_mg,
                    daily_data.measurements.morning_weight_kg,
                    daily_data.measurements.evening_weight_kg,
                ),
            )

    def get_all_dates(self) -> list[date]:
        """Get all dates with entries.

        Returns:
            List of dates (sorted newest first)
        """
        with get_db_cursor() as cur:
            cur.execute("""
                SELECT DISTINCT date
                FROM food_entries
                ORDER BY date DESC
            """)
            return [row["date"] for row in cur.fetchall()]

    # ============= Daily Targets =============

    def save_daily_targets(self, targets: DailyTargets) -> None:
        """Save daily targets.

        Args:
            targets: DailyTargets to save
        """
        with get_db_cursor() as cur:
            cur.execute(
                """
                INSERT INTO daily_targets (
                    date, energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                    sugar_g, protein_g, fibre_g, salt_g, calcium_mg
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    energy_kcal = EXCLUDED.energy_kcal,
                    fat_g = EXCLUDED.fat_g,
                    saturated_fat_g = EXCLUDED.saturated_fat_g,
                    carbohydrates_g = EXCLUDED.carbohydrates_g,
                    sugar_g = EXCLUDED.sugar_g,
                    protein_g = EXCLUDED.protein_g,
                    fibre_g = EXCLUDED.fibre_g,
                    salt_g = EXCLUDED.salt_g,
                    calcium_mg = EXCLUDED.calcium_mg
            """,
                (
                    targets.date,
                    targets.energy_kcal,
                    targets.fat_g,
                    targets.saturated_fat_g,
                    targets.carbohydrates_g,
                    targets.sugar_g,
                    targets.protein_g,
                    targets.fibre_g,
                    targets.salt_g,
                    targets.calcium_mg,
                ),
            )

    def load_daily_targets(self, target_date: date) -> DailyTargets | None:
        """Load daily targets for a specific date.

        Args:
            target_date: Date to load targets for

        Returns:
            DailyTargets if found, None otherwise
        """
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT date, energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                       sugar_g, protein_g, fibre_g, salt_g, calcium_mg
                FROM daily_targets
                WHERE date = %s
            """,
                (target_date,),
            )
            row = cur.fetchone()

            if not row:
                return None

            return DailyTargets(
                date=row["date"],
                energy_kcal=float(row["energy_kcal"]),
                fat_g=float(row["fat_g"]),
                saturated_fat_g=float(row["saturated_fat_g"]),
                carbohydrates_g=float(row["carbohydrates_g"]),
                sugar_g=float(row["sugar_g"]),
                protein_g=float(row["protein_g"]),
                fibre_g=float(row["fibre_g"]),
                salt_g=float(row["salt_g"]),
                calcium_mg=float(row["calcium_mg"]),
            )

    def get_previous_day_targets(self, target_date: date) -> DailyTargets | None:
        """Get targets from the most recent day before the given date.

        Args:
            target_date: Reference date

        Returns:
            DailyTargets from previous day, or None if not found
        """
        with get_db_cursor() as cur:
            cur.execute(
                """
                SELECT date, energy_kcal, fat_g, saturated_fat_g, carbohydrates_g,
                       sugar_g, protein_g, fibre_g, salt_g, calcium_mg
                FROM daily_targets
                WHERE date < %s
                ORDER BY date DESC
                LIMIT 1
            """,
                (target_date,),
            )
            row = cur.fetchone()

            if not row:
                return None

            # Return with the target_date, not the previous date
            return DailyTargets(
                date=target_date,
                energy_kcal=float(row["energy_kcal"]),
                fat_g=float(row["fat_g"]),
                saturated_fat_g=float(row["saturated_fat_g"]),
                carbohydrates_g=float(row["carbohydrates_g"]),
                sugar_g=float(row["sugar_g"]),
                protein_g=float(row["protein_g"]),
                fibre_g=float(row["fibre_g"]),
                salt_g=float(row["salt_g"]),
                calcium_mg=float(row["calcium_mg"]),
            )

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
