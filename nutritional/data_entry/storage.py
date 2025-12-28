"""File-based storage for nutritional data."""

import csv
import json
from datetime import date, datetime
from pathlib import Path

from nutritional.data_entry.models import DailyData, FoodItem


class FileStorage:
    """File-based storage for nutritional tracking data."""

    def __init__(self, base_path: str = "nutritional_data"):
        """Initialize file storage.

        Args:
            base_path: Base directory for data files
        """
        self.base_path = Path(base_path)
        self.food_db_path = self.base_path / "food_database.json"
        self.daily_entries_path = self.base_path / "daily_entries"
        self.summaries_path = self.base_path / "daily_summaries.csv"
        self.history_path = self.base_path / "history.jsonl"

        # Ensure directories exist
        self.base_path.mkdir(exist_ok=True)
        self.daily_entries_path.mkdir(exist_ok=True)

    def load_food_database(self) -> list[FoodItem]:
        """Load all food items from database.

        Returns:
            List of FoodItem objects
        """
        if not self.food_db_path.exists():
            return []

        with open(self.food_db_path, encoding="utf-8") as f:
            data = json.load(f)
            return [FoodItem(**item) for item in data.get("items", [])]

    def save_food_item(self, item: FoodItem) -> None:
        """Add or update a food item in the database.

        Args:
            item: FoodItem to save
        """
        items = self.load_food_database()

        # Update existing or append new
        updated = False
        for i, existing in enumerate(items):
            if existing.id == item.id:
                item.updated_at = datetime.now()
                items[i] = item
                updated = True
                break

        if not updated:
            items.append(item)

        # Save back to file
        data = {"items": [item.model_dump(mode="json") for item in items]}
        with open(self.food_db_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def delete_food_item(self, food_id: str) -> bool:
        """Delete a food item from the database.

        Args:
            food_id: ID of the food item to delete

        Returns:
            True if item was deleted, False if not found
        """
        items = self.load_food_database()
        original_count = len(items)
        items = [item for item in items if item.id != food_id]

        if len(items) < original_count:
            data = {"items": [item.model_dump(mode="json") for item in items]}
            with open(self.food_db_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            return True
        return False

    def get_food_item(self, food_id: str) -> FoodItem | None:
        """Get a specific food item by ID.

        Args:
            food_id: ID of the food item

        Returns:
            FoodItem if found, None otherwise
        """
        items = self.load_food_database()
        for item in items:
            if item.id == food_id:
                return item
        return None

    def search_food_items(self, query: str) -> list[FoodItem]:
        """Search food items by name.

        Args:
            query: Search query string

        Returns:
            List of matching FoodItem objects
        """
        items = self.load_food_database()
        query_lower = query.lower()
        return [item for item in items if query_lower in item.name.lower()]

    def load_daily_entry(self, entry_date: date) -> DailyData | None:
        """Load daily entry for a specific date.

        Args:
            entry_date: Date to load

        Returns:
            DailyData if found, None otherwise
        """
        file_path = self.daily_entries_path / f"{entry_date}.json"
        if not file_path.exists():
            return None

        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)
            return DailyData(**data)

    def save_daily_entry(self, daily_data: DailyData) -> None:
        """Save daily entry and update summaries.

        This performs three operations:
        1. Save to daily_entries/{date}.json
        2. Append entries to history.jsonl
        3. Update daily_summaries.csv

        Args:
            daily_data: DailyData to save
        """
        # Calculate totals
        daily_data.totals = daily_data.calculate_totals()

        # 1. Save daily entry
        file_path = self.daily_entries_path / f"{daily_data.date}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(daily_data.model_dump(mode="json"), f, indent=2, default=str)

        # 2. Append to history
        with open(self.history_path, "a", encoding="utf-8") as f:
            for entry in daily_data.entries:
                history_entry = {
                    "date": str(daily_data.date),
                    "entry_id": entry.entry_id,
                    "timestamp": entry.timestamp.isoformat(),
                    "food_id": entry.food_id,
                    "food_name": entry.food_name,
                    "weight_g": entry.weight_g,
                    "quantity": entry.quantity,
                    "nutrients": entry.nutrients.model_dump(),
                }
                f.write(json.dumps(history_entry, default=str) + "\n")

        # 3. Update daily summaries CSV
        self._update_daily_summaries(daily_data)

    def _update_daily_summaries(self, daily_data: DailyData) -> None:
        """Update the daily summaries CSV file.

        Args:
            daily_data: DailyData to add/update in summaries
        """
        # Load existing summaries
        summaries = {}
        if self.summaries_path.exists():
            with open(self.summaries_path, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    summaries[row["Date"]] = row

        # Update with new data
        date_str = str(daily_data.date)
        summaries[date_str] = {
            "Date": date_str,
            "Energy kcal": f"{daily_data.totals.energy_kcal:.2f}",
            "Fat g": f"{daily_data.totals.fat_g:.2f}",
            "Saturated Fat g": f"{daily_data.totals.saturated_fat_g:.2f}",
            "Carbohydrates g": f"{daily_data.totals.carbohydrates_g:.2f}",
            "Sugar g": f"{daily_data.totals.sugar_g:.2f}",
            "Protein g": f"{daily_data.totals.protein_g:.2f}",
            "Fibre g": f"{daily_data.totals.fibre_g:.2f}",
            "Salt g": f"{daily_data.totals.salt_g:.2f}",
            "Calcium mg": f"{daily_data.totals.calcium_mg:.2f}",
            "Morning Weight kg": (
                f"{daily_data.measurements.morning_weight_kg:.2f}"
                if daily_data.measurements.morning_weight_kg is not None
                else ""
            ),
            "Evening Weight kg": (
                f"{daily_data.measurements.evening_weight_kg:.2f}"
                if daily_data.measurements.evening_weight_kg is not None
                else ""
            ),
        }

        # Write back to CSV (sorted by date)
        with open(self.summaries_path, "w", encoding="utf-8", newline="") as f:
            fieldnames = [
                "Date",
                "Energy kcal",
                "Fat g",
                "Saturated Fat g",
                "Carbohydrates g",
                "Sugar g",
                "Protein g",
                "Fibre g",
                "Salt g",
                "Calcium mg",
                "Morning Weight kg",
                "Evening Weight kg",
            ]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            # Sort by date
            sorted_dates = sorted(summaries.keys())
            for date_key in sorted_dates:
                writer.writerow(summaries[date_key])

    def get_all_dates(self) -> list[date]:
        """Get all dates with entries.

        Returns:
            List of dates (sorted newest first)
        """
        dates = []
        for file_path in self.daily_entries_path.glob("*.json"):
            try:
                date_obj = date.fromisoformat(file_path.stem)
                dates.append(date_obj)
            except ValueError:
                continue
        return sorted(dates, reverse=True)
