"""SQLModel database models for nutritional tracker."""

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from sqlmodel import CheckConstraint, Field, SQLModel


def now_utc():
    """Return current datetime in UTC."""
    return datetime.now(UTC)


class FoodItemModel(SQLModel, table=True):
    """Food item with nutritional information.

    SQLModel provides:
    - Database ORM functionality (via SQLAlchemy)
    - Pydantic validation (automatic type checking)
    - Single source of truth (no duplicate Pydantic model needed)
    """

    __tablename__ = "food_items"

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
    unit_type: str = Field(default="per_100g", max_length=20)
    serving_size_g: float | None = None

    # Nutrients (all required for creation)
    energy_kcal: float
    fat_g: float
    saturated_fat_g: float
    carbohydrates_g: float
    sugar_g: float
    protein_g: float
    fibre_g: float
    salt_g: float
    calcium_mg: float

    # Timestamps
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        CheckConstraint("unit_type IN ('per_100g', 'per_item')", name="check_unit_type"),
        CheckConstraint(
            "(unit_type = 'per_item' AND serving_size_g IS NOT NULL) OR "
            "(unit_type = 'per_100g')",
            name="check_serving_size",
        ),
    )


class FoodEntryModel(SQLModel, table=True):
    """Individual food entry in daily log."""

    __tablename__ = "food_entries"

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)
    entry_date: date = Field(index=True)
    timestamp: datetime = Field(default_factory=now_utc)
    food_id: UUID = Field(foreign_key="food_items.id")

    # Quantity consumed (one of these should be set)
    weight_g: float | None = None
    quantity: float | None = None

    # Calculated nutrients (denormalized for history)
    energy_kcal: float
    fat_g: float
    saturated_fat_g: float
    carbohydrates_g: float
    sugar_g: float
    protein_g: float
    fibre_g: float
    salt_g: float
    calcium_mg: float

    # Timestamps
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class DailySummaryModel(SQLModel, table=True):
    """Daily nutritional totals and measurements."""

    __tablename__ = "daily_summaries"

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)
    summary_date: date = Field(unique=True, index=True)

    # Nutritional totals
    energy_kcal: float
    fat_g: float
    saturated_fat_g: float
    carbohydrates_g: float
    sugar_g: float
    protein_g: float
    fibre_g: float
    salt_g: float
    calcium_mg: float

    # Body measurements
    morning_weight_kg: float | None = None
    evening_weight_kg: float | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)


class DailyTargetsModel(SQLModel, table=True):
    """Daily nutritional targets and limits."""

    __tablename__ = "daily_targets"

    id: UUID | None = Field(default_factory=uuid4, primary_key=True)
    target_date: date = Field(unique=True, index=True)
    default_mode: str = Field(default="target", max_length=10)

    # Target values
    energy_kcal: float = Field(default=2000)
    protein_g: float = Field(default=150)
    carbohydrates_g: float = Field(default=225)
    fat_g: float = Field(default=67)
    sugar_g: float = Field(default=90)
    saturated_fat_g: float = Field(default=20)
    fibre_g: float = Field(default=30)
    salt_g: float = Field(default=6)
    calcium_mg: float = Field(default=700)

    # Per-nutrient mode overrides (None = use default_mode)
    energy_mode: str | None = Field(default=None, max_length=10)
    protein_mode: str | None = Field(default=None, max_length=10)
    carbohydrates_mode: str | None = Field(default=None, max_length=10)
    fat_mode: str | None = Field(default=None, max_length=10)
    sugar_mode: str | None = Field(default="limit", max_length=10)
    saturated_fat_mode: str | None = Field(default="limit", max_length=10)
    fibre_mode: str | None = Field(default=None, max_length=10)
    salt_mode: str | None = Field(default="limit", max_length=10)
    calcium_mode: str | None = Field(default=None, max_length=10)

    # Timestamps
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)

    __table_args__ = (
        CheckConstraint("default_mode IN ('target', 'limit')", name="check_default_mode"),
    )
