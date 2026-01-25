#!/usr/bin/env python3
"""
Script to fix daily summaries where nutrients are incorrectly set to 0
when there are no food entries for that day.

This sets nutrients to NULL for days with no food consumption data.
"""

from sqlalchemy import select, update

from nutritional.database.connection import get_db_session
from nutritional.database.models import DailySummaryModel, FoodEntryModel


def fix_null_nutrients():
    """Update daily summaries to set nutrients to NULL where no food entries exist."""
    with get_db_session() as session:
        # Find all dates with summaries having 0 calories (indicating no data)
        dates_to_check = session.exec(
            select(DailySummaryModel.summary_date).where(DailySummaryModel.energy_kcal == 0)
        ).all()

        updated_count = 0
        for date_val in dates_to_check:
            # Check if there are any food entries for this date
            entries_exist = session.exec(
                select(FoodEntryModel.id).where(FoodEntryModel.entry_date == date_val).limit(1)
            ).first()

            if not entries_exist:
                # No food entries, set all nutrients to NULL
                session.exec(
                    update(DailySummaryModel)
                    .where(DailySummaryModel.summary_date == date_val)
                    .values(
                        energy_kcal=None,
                        fat_g=None,
                        saturated_fat_g=None,
                        carbohydrates_g=None,
                        sugar_g=None,
                        protein_g=None,
                        fibre_g=None,
                        salt_g=None,
                        calcium_mg=None,
                    )
                )
                updated_count += 1

        session.commit()
        print(
            f"Updated {updated_count} daily summaries to set nutrients to NULL "
            "where no food entries exist."
        )


if __name__ == "__main__":
    fix_null_nutrients()
