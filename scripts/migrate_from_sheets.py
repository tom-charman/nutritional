"""Migration script to load data from Google Sheets into PostgreSQL.

This script:
1. Reads food items from the "Nutrients" tab
2. Reads historical entries from the "History" tab
3. Reads daily summaries from the "Daily" tab
4. Populates the PostgreSQL database

Run this script to migrate from Google Sheets to the database.
"""

import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlmodel import select

from nutritional.database.connection import get_db_session
from nutritional.database.models import (
    DailySummaryModel,
    FoodEntryModel,
    FoodItemModel,
)

# Scopes required for reading Google Sheets
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]


class GoogleSheetsClient:
    """
    Wrapper for Google Sheets API operations using service account authentication.

    Features:
    - Service account authentication (no user interaction needed)
    - Read data from specific ranges
    - Get last modified timestamp
    - Validate sheet access
    """

    def __init__(self, credentials_path: str | None = None):
        """
        Initialize Google Sheets client with service account credentials.

        Args:
            credentials_path: Path to service account credentials JSON file.
                            If None, uses GOOGLE_CREDENTIALS_PATH env var.

        Raises:
            FileNotFoundError: If credentials file doesn't exist
            ValueError: If credentials are invalid
        """
        # Determine credentials path
        if credentials_path is None:
            credentials_path = os.getenv("GOOGLE_CREDENTIALS_PATH")

        if not credentials_path:
            raise ValueError(
                "No credentials path provided. Set GOOGLE_CREDENTIALS_PATH "
                "environment variable or pass credentials_path parameter."
            )

        creds_file = Path(credentials_path)
        if not creds_file.exists():
            raise FileNotFoundError(
                f"Credentials file not found: {credentials_path}\n"
                "Please download your service account JSON from Google Cloud Console."
            )

        # Authenticate
        try:
            self.credentials = service_account.Credentials.from_service_account_file(
                str(creds_file), scopes=SCOPES
            )
        except Exception as e:
            raise ValueError(f"Failed to load credentials: {e}")

        # Build Google Sheets API service
        self.sheets_service = build("sheets", "v4", credentials=self.credentials)
        self.drive_service = build("drive", "v3", credentials=self.credentials)

    def get_spreadsheet_data(self, spreadsheet_id: str, range_name: str = "A:Z") -> list[list[Any]]:
        """
        Fetch data from Google Sheet.

        Args:
            spreadsheet_id: The ID from the sheet URL
                          (e.g., '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')
            range_name: A1 notation range (default: 'A:Z' for all columns)

        Returns:
            List of rows, each row is a list of cell values.
            Empty cells are represented as empty strings.

        Raises:
            HttpError: If API request fails (e.g., permission denied, not found)
        """
        try:
            result = (
                self.sheets_service.spreadsheets()
                .values()
                .get(
                    spreadsheetId=spreadsheet_id,
                    range=range_name,
                    valueRenderOption="UNFORMATTED_VALUE",
                    dateTimeRenderOption="FORMATTED_STRING",
                )
                .execute()
            )

            values = result.get("values", [])
            return values

        except HttpError as e:
            if e.resp.status == 404:
                raise HttpError(
                    e.resp,
                    f"Spreadsheet not found: {spreadsheet_id}. Check the ID is correct.".encode(),
                )
            elif e.resp.status == 403:
                raise HttpError(
                    e.resp,
                    (
                        f"Access denied to spreadsheet: {spreadsheet_id}. "
                        "Make sure the service account has been granted access."
                    ).encode(),
                )
            else:
                raise

    def get_last_modified(self, spreadsheet_id: str) -> str:
        """
        Get the last modified timestamp of the spreadsheet.

        Args:
            spreadsheet_id: The ID from the sheet URL

        Returns:
            ISO format timestamp string (e.g., '2025-11-22T14:30:00Z')

        Raises:
            HttpError: If API request fails
        """
        try:
            file_metadata = (
                self.drive_service.files()
                .get(fileId=spreadsheet_id, fields="modifiedTime")
                .execute()
            )

            return file_metadata.get("modifiedTime", datetime.now().isoformat())

        except HttpError:
            # Fallback to current time if we can't get modified time
            return datetime.now().isoformat()

    def validate_sheet_access(self, spreadsheet_id: str) -> bool:
        """
        Check if the service account has access to the sheet.

        Args:
            spreadsheet_id: The ID from the sheet URL

        Returns:
            True if accessible, False otherwise
        """
        try:
            self.sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            return True
        except HttpError:
            return False

    def get_spreadsheet_info(self, spreadsheet_id: str) -> dict:
        """
        Get metadata about the spreadsheet.

        Args:
            spreadsheet_id: The ID from the sheet URL

        Returns:
            Dict with keys: title, sheets (list of sheet names), url

        Raises:
            HttpError: If API request fails
        """
        try:
            spreadsheet = (
                self.sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
            )

            return {
                "title": spreadsheet.get("properties", {}).get("title", "Unknown"),
                "sheets": [sheet["properties"]["title"] for sheet in spreadsheet.get("sheets", [])],
                "url": f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}",
            }
        except HttpError:
            raise


# Add parent directory to path to import nutritional modules
sys.path.insert(0, str(Path(__file__).parent.parent))


def migrate_food_items(client: GoogleSheetsClient, spreadsheet_id: str):
    """Migrate food items from Nutrients tab to food_items table."""
    print("\n=== Migrating Food Items ===")

    # Read Nutrients tab (note: sheet is named "Nurients" with typo)
    nutrients_data = client.get_spreadsheet_data(spreadsheet_id, "Nurients!A:J")

    if not nutrients_data or len(nutrients_data) < 2:
        print("⚠️  No food items found in Nutrients tab")
        return

    headers = [str(h).strip() for h in nutrients_data[0]]
    print(f"✓ Found columns: {headers}")

    # Expected columns: Item, Energy kcal, Fat, Saturated Fat, Carbohydrates,
    # Sugar, Protein, Fibre, Salt, Calcium
    food_items = []
    skipped = 0

    with get_db_session() as session:
        for idx, row in enumerate(nutrients_data[1:], start=2):
            if not row or len(row) < 2:
                skipped += 1
                continue

            try:
                name = str(row[0]).strip() if row[0] else None
                if not name:
                    skipped += 1
                    continue

                # Check if item already exists
                existing = session.exec(
                    select(FoodItemModel).where(FoodItemModel.name == name)
                ).first()

                if existing:
                    print(f"  ⏭️  Skipping existing: {name}")
                    continue

                # Parse nutrient values (default to 0 if missing/invalid)
                def parse_float(val):
                    try:
                        return float(val) if val else 0.0
                    except (ValueError, TypeError):
                        return 0.0

                food_item = FoodItemModel(
                    id=uuid4(),
                    name=name,
                    unit_type="per_100g",
                    serving_size_g=None,
                    energy_kcal=parse_float(row[1] if len(row) > 1 else 0),
                    fat_g=parse_float(row[2] if len(row) > 2 else 0),
                    saturated_fat_g=parse_float(row[3] if len(row) > 3 else 0),
                    carbohydrates_g=parse_float(row[4] if len(row) > 4 else 0),
                    sugar_g=parse_float(row[5] if len(row) > 5 else 0),
                    protein_g=parse_float(row[6] if len(row) > 6 else 0),
                    fibre_g=parse_float(row[7] if len(row) > 7 else 0),
                    salt_g=parse_float(row[8] if len(row) > 8 else 0),
                    calcium_mg=parse_float(row[9] if len(row) > 9 else 0),
                )

                session.add(food_item)
                food_items.append(food_item)

                if len(food_items) % 10 == 0:
                    print(f"  Processing row {idx}...")

            except Exception as e:
                print(f"  ⚠️  Error on row {idx}: {e}")
                skipped += 1
                continue

        session.commit()

    print(f"✓ Migrated {len(food_items)} food items")
    if skipped > 0:
        print(f"  ⚠️  Skipped {skipped} rows")


def migrate_history(client: GoogleSheetsClient, spreadsheet_id: str):
    """Migrate historical food entries from History tab to food_entries table.

    History format:
    - Headers in first row
    - Food items with: Name, Amount g, nutrients...
    - Date rows (e.g., "31/12/2025") with daily totals
    - All items above a date row belong to that date
    """
    print("\n=== Migrating History ===")

    # Read History tab
    history_data = client.get_spreadsheet_data(spreadsheet_id, "History!A:K")

    if not history_data or len(history_data) < 2:
        print("⚠️  No history data found")
        return

    headers = [str(h).strip() if h else "" for h in history_data[0]]
    print(f"✓ Found columns: {headers}")

    # Build food name -> food item ID mapping
    with get_db_session() as session:
        food_items = session.exec(select(FoodItemModel)).all()
        # Store just the IDs to avoid detached instance issues
        food_map = {item.name: str(item.id) for item in food_items}
        print(f"✓ Loaded {len(food_map)} food items for lookup")

    # Parse history data - group by dates
    entries = []
    skipped = 0
    unknown_foods = set()
    daily_items = []

    # Column indices (based on your data: Item, Amount g, Energy kcal, ...)
    # Column 0 = Item name, Column 1 = Amount g

    for idx, row in enumerate(history_data[1:], start=2):
        if not row or not row[0]:
            continue

        first_col = str(row[0]).strip()

        # Check if this is a date row (format: DD/MM/YYYY or just date string)
        is_date_row = False
        date_candidate = None

        # Try to parse first column as a date
        for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
            try:
                date_candidate = datetime.strptime(first_col, fmt).date()
                is_date_row = True
                break
            except (ValueError, TypeError):
                continue

        if is_date_row and date_candidate:
            # This is a date/summary row - commit the items above to THIS date
            if daily_items:
                print(f"  Processing {len(daily_items)} items for {date_candidate}")
                with get_db_session() as session:
                    for food_name, weight_g in daily_items:
                        if food_name not in food_map:
                            unknown_foods.add(food_name)
                            skipped += 1
                            continue

                        # Get the food item from DB using the stored ID
                        food_item_id_str = food_map[food_name]
                        food_item = session.get(FoodItemModel, UUID(food_item_id_str))

                        if not food_item:
                            skipped += 1
                            continue

                        multiplier = weight_g / 100.0

                        entry = FoodEntryModel(
                            id=uuid4(),
                            entry_date=date_candidate,
                            timestamp=datetime.combine(date_candidate, datetime.min.time()),
                            food_id=food_item.id,
                            weight_g=weight_g,
                            quantity=None,
                            energy_kcal=food_item.energy_kcal * multiplier,
                            fat_g=food_item.fat_g * multiplier,
                            saturated_fat_g=food_item.saturated_fat_g * multiplier,
                            carbohydrates_g=food_item.carbohydrates_g * multiplier,
                            sugar_g=food_item.sugar_g * multiplier,
                            protein_g=food_item.protein_g * multiplier,
                            fibre_g=food_item.fibre_g * multiplier,
                            salt_g=food_item.salt_g * multiplier,
                            calcium_mg=food_item.calcium_mg * multiplier,
                        )

                        session.add(entry)
                        entries.append(entry)

                    session.commit()

            # Clear items for next day
            daily_items = []
        else:
            # This is a food item row
            food_name = first_col

            # Parse amount (column 1)
            try:
                weight_g = float(row[1]) if len(row) > 1 and row[1] else None
            except (ValueError, TypeError):
                weight_g = None

            if weight_g and food_name:
                daily_items.append((food_name, weight_g))

    print(f"✓ Migrated {len(entries)} history entries")
    if skipped > 0:
        print(f"  ⚠️  Skipped {skipped} rows")
    if unknown_foods:
        print(f"  ⚠️  Unknown foods ({len(unknown_foods)}): {', '.join(list(unknown_foods)[:10])}")


def migrate_daily_summaries(client: GoogleSheetsClient, spreadsheet_id: str):
    """Migrate daily summaries from Daily tab to daily_summaries table."""
    print("\n=== Migrating Daily Summaries ===")

    # Read Daily tab
    daily_data = client.get_spreadsheet_data(spreadsheet_id, "Daily!A:M")

    if not daily_data or len(daily_data) < 2:
        print("⚠️  No daily data found")
        return

    headers = [str(h).strip() for h in daily_data[0]]
    print(f"✓ Found columns: {headers}")

    summaries = []
    skipped = 0

    # Expected columns: Date, (empty), Energy kcal, Fat, Saturated Fat, Carbohydrates,
    #                   Sugar, Protein, Fibre, Salt, Calcium, Morning Weight, Evening Weight
    # Indices:          0      1        2           3    4               5

    for idx, row in enumerate(daily_data[1:], start=2):
        if not row or len(row) < 2:
            skipped += 1
            continue

        try:
            # Parse date
            date_str = str(row[0]).strip() if row[0] else None
            if not date_str:
                skipped += 1
                continue

            summary_date = None
            for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"]:
                try:
                    summary_date = datetime.strptime(date_str, fmt).date()
                    break
                except ValueError:
                    continue

            if not summary_date:
                skipped += 1
                continue

            # Use separate session for each row to avoid transaction cascade
            with get_db_session() as session:
                # Check if summary already exists
                existing = session.exec(
                    select(DailySummaryModel).where(DailySummaryModel.summary_date == summary_date)
                ).first()

                if existing:
                    print(f"  ⏭️  Skipping existing: {summary_date}")
                    continue

                # Parse values - use None for empty cells to match Google Sheets behavior
                def parse_optional_float(val):
                    try:
                        if val is None or val == "":
                            return None
                        result = float(val)
                        # Treat 0 as None if it's likely from an empty cell
                        return result if result != 0.0 else None
                    except (ValueError, TypeError):
                        return None

                summary = DailySummaryModel(
                    id=uuid4(),
                    summary_date=summary_date,
                    energy_kcal=parse_optional_float(row[2] if len(row) > 2 else None),
                    fat_g=parse_optional_float(row[3] if len(row) > 3 else None),
                    saturated_fat_g=parse_optional_float(row[4] if len(row) > 4 else None),
                    carbohydrates_g=parse_optional_float(row[5] if len(row) > 5 else None),
                    sugar_g=parse_optional_float(row[6] if len(row) > 6 else None),
                    protein_g=parse_optional_float(row[7] if len(row) > 7 else None),
                    fibre_g=parse_optional_float(row[8] if len(row) > 8 else None),
                    salt_g=parse_optional_float(row[9] if len(row) > 9 else None),
                    calcium_mg=parse_optional_float(row[10] if len(row) > 10 else None),
                    morning_weight_kg=parse_optional_float(row[11] if len(row) > 11 else None),
                    evening_weight_kg=parse_optional_float(row[12] if len(row) > 12 else None),
                )

                session.add(summary)
                session.commit()
                summaries.append(summary)

                if len(summaries) % 20 == 0:
                    print(f"  Processing row {idx}...")

        except Exception as e:
            print(f"  ⚠️  Error on row {idx}: {e}")
            skipped += 1
            continue

    print(f"✓ Migrated {len(summaries)} daily summaries")
    if skipped > 0:
        print(f"  ⚠️  Skipped {skipped} rows")


def main():
    """Run the migration."""
    print("=" * 60)
    print("Google Sheets to PostgreSQL Migration")
    print("=" * 60)

    # Get credentials and spreadsheet ID from environment
    credentials_path = os.getenv("GOOGLE_CREDENTIALS_PATH")
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_ID")

    if not credentials_path:
        print("❌ GOOGLE_CREDENTIALS_PATH not set in environment")
        sys.exit(1)

    if not spreadsheet_id:
        print("❌ GOOGLE_SHEETS_ID not set in environment")
        sys.exit(1)

    # Type assertions for type checker
    assert credentials_path is not None
    assert spreadsheet_id is not None

    print(f"\n✓ Using spreadsheet: {spreadsheet_id}")
    print(f"✓ Credentials: {credentials_path}")

    try:
        # Initialize Google Sheets client
        client = GoogleSheetsClient(credentials_path)
        print("✓ Connected to Google Sheets API")

        # Verify access
        if not client.validate_sheet_access(spreadsheet_id):
            print("❌ Cannot access spreadsheet. Check permissions.")
            sys.exit(1)

        # Get sheet info
        info = client.get_spreadsheet_info(spreadsheet_id)
        print(f"✓ Spreadsheet: {info['title']}")
        print(f"  Tabs: {', '.join(info['sheets'])}")

        # Run migrations in order
        migrate_food_items(client, spreadsheet_id)
        migrate_history(client, spreadsheet_id)
        migrate_daily_summaries(client, spreadsheet_id)

        print("\n" + "=" * 60)
        print("✓ Migration complete!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
