"""Fix zero weights in the database by setting them to NULL."""

from sqlmodel import update

from nutritional.database.connection import get_db_session
from nutritional.database.models import DailySummaryModel


def fix_zero_weights():
    """Set morning_weight_kg and evening_weight_kg to NULL where they are 0."""
    with get_db_session() as session:
        # Update morning weights
        stmt_morning = (
            update(DailySummaryModel)
            .where(DailySummaryModel.morning_weight_kg == 0)
            .values(morning_weight_kg=None)
        )
        result_morning = session.exec(stmt_morning)
        print(f"Updated {result_morning.rowcount} morning weights from 0 to NULL")

        # Update evening weights
        stmt_evening = (
            update(DailySummaryModel)
            .where(DailySummaryModel.evening_weight_kg == 0)
            .values(evening_weight_kg=None)
        )
        result_evening = session.exec(stmt_evening)
        print(f"Updated {result_evening.rowcount} evening weights from 0 to NULL")

        session.commit()


if __name__ == "__main__":
    fix_zero_weights()
