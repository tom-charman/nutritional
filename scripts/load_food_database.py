"""Script to load food database from JSON into PostgreSQL."""

import json
from pathlib import Path

from nutritional.database.connection import get_db_session
from nutritional.database.models import FoodItemModel


def load_food_database():
    """Load food items from JSON file into database."""
    # Path to the food database JSON
    json_path = Path(__file__).parent.parent / "nutritional_data" / "food_database.json"

    if not json_path.exists():
        print(f"Error: Food database file not found at {json_path}")
        return

    # Load JSON data
    with open(json_path) as f:
        data = json.load(f)

    food_items = data.get("items", [])

    print(f"Loading {len(food_items)} food items into database...")

    with get_db_session() as session:
        # Check if data already exists
        existing_count = session.query(FoodItemModel).count()
        if existing_count > 0:
            print(f"Database already contains {existing_count} food items. Skipping load.")
            return

        # Load food items
        for item_data in food_items:
            food_item = FoodItemModel(**item_data)
            session.add(food_item)

        session.commit()
        print(f"Successfully loaded {len(food_items)} food items into database.")


if __name__ == "__main__":
    load_food_database()
