#!/usr/bin/env python3
"""
Script to analyze calorie data in the database.

Checks:
- How many days have exactly 0 calories
- How many days have less than 2000 calories (excluding NULL)
"""

from sqlalchemy import select

from nutritional.database.connection import get_db_session
from nutritional.database.models import DailySummaryModel


def check_zero_calorie_days():
    """Count days with exactly 0 calories (not NULL)."""
    with get_db_session() as session:
        # Count summaries where energy_kcal is exactly 0 (NOT NULL)
        zero_calorie_days = session.exec(
            select(DailySummaryModel).where(DailySummaryModel.energy_kcal == 0)
        ).all()

        print(f"Days with exactly 0 calories: {len(zero_calorie_days)}")

        # Also show the dates for reference
        if zero_calorie_days:
            print("\nDates with 0 calories:")
            for summary in zero_calorie_days:
                print(f"  {summary.summary_date}")


def check_under_2000_calories():
    """Count days with less than 2000 calories (excluding NULL values)."""
    with get_db_session() as session:
        # Get all summaries with non-NULL energy values
        all_with_data = (
            session.exec(select(DailySummaryModel).where(DailySummaryModel.energy_kcal.isnot(None)))  # type: ignore[attr-defined]
            .scalars()
            .all()
        )

        # Filter to those under 2000 calories
        under_2000_days = [d for d in all_with_data if d.energy_kcal < 2000]

        print(f"\nDays with less than 2000 calories: {len(under_2000_days)}")

        # Show the dates and calorie counts for reference
        if under_2000_days:
            print("\nDates with under 2000 calories:")
            for summary in sorted(under_2000_days, key=lambda x: x.summary_date):
                print(f"  {summary.summary_date}: {summary.energy_kcal:.0f} kcal")


if __name__ == "__main__":
    check_zero_calorie_days()
    check_under_2000_calories()
