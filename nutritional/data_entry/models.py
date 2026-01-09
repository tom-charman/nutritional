"""Pydantic models for nutritional data validation."""

import uuid
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator

# Order for nutrient input fields (including energy/calories)
NUTRIENT_INPUT_ORDER = [
    "energy_kcal",
    "fat_g",
    "saturated_fat_g",
    "carbohydrates_g",
    "sugar_g",
    "protein_g",
    "fibre_g",
    "salt_g",
    "calcium_mg",
]

# Field info for generating input forms
NUTRIENT_FIELD_INFO = {
    "energy_kcal": {"label": "Calories (kcal)", "id": "energy-kcal", "unit": "kcal"},
    "fat_g": {"label": "Fat (g)", "id": "fat-g", "unit": "g"},
    "saturated_fat_g": {"label": "Sat Fat (g)", "id": "saturated-fat-g", "unit": "g"},
    "carbohydrates_g": {"label": "Carbs (g)", "id": "carbohydrates-g", "unit": "g"},
    "sugar_g": {"label": "Sugar (g)", "id": "sugar-g", "unit": "g"},
    "protein_g": {"label": "Protein (g)", "id": "protein-g", "unit": "g"},
    "fibre_g": {"label": "Fibre (g)", "id": "fibre-g", "unit": "g"},
    "salt_g": {"label": "Salt (g)", "id": "salt-g", "unit": "g"},
    "calcium_mg": {"label": "Calcium (mg)", "id": "calcium-mg", "unit": "mg"},
}


class UnitType(str, Enum):
    """Unit type for food items."""

    PER_100G = "per_100g"
    PER_ITEM = "per_item"


class Nutrients(BaseModel):
    """Nutritional values."""

    energy_kcal: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    saturated_fat_g: float = Field(ge=0)
    carbohydrates_g: float = Field(ge=0)
    sugar_g: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fibre_g: float = Field(ge=0)
    salt_g: float = Field(ge=0)
    calcium_mg: float = Field(ge=0)


class FoodItem(BaseModel):
    """Food item with nutritional information."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = Field(min_length=1, max_length=255)
    unit_type: UnitType = UnitType.PER_100G
    serving_size_g: float | None = Field(default=None, ge=0)

    # Nutritional values
    energy_kcal: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    saturated_fat_g: float = Field(ge=0)
    carbohydrates_g: float = Field(ge=0)
    sugar_g: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    fibre_g: float = Field(ge=0)
    salt_g: float = Field(ge=0)
    calcium_mg: float = Field(ge=0)

    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    @field_validator("serving_size_g")
    @classmethod
    def validate_serving_size(cls, v: float | None, info) -> float | None:
        """Validate that serving_size_g is required when unit_type is per_item."""
        if info.data.get("unit_type") == UnitType.PER_ITEM and v is None:
            raise ValueError("serving_size_g is required when unit_type is per_item")
        if info.data.get("unit_type") == UnitType.PER_100G and v is not None:
            raise ValueError("serving_size_g should be None when unit_type is per_100g")
        return v

    def get_nutrients(self) -> Nutrients:
        """Get nutrients as a Nutrients object."""
        return Nutrients(
            energy_kcal=self.energy_kcal,
            fat_g=self.fat_g,
            saturated_fat_g=self.saturated_fat_g,
            carbohydrates_g=self.carbohydrates_g,
            sugar_g=self.sugar_g,
            protein_g=self.protein_g,
            fibre_g=self.fibre_g,
            salt_g=self.salt_g,
            calcium_mg=self.calcium_mg,
        )


class FoodEntry(BaseModel):
    """A single food entry in a meal."""

    entry_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.now)
    food_id: str
    food_name: str
    weight_g: float | None = Field(default=None, ge=0)
    quantity: float | None = Field(default=None, ge=0)
    nutrients: Nutrients

    @field_validator("weight_g", "quantity")
    @classmethod
    def validate_weight_or_quantity(cls, v, info) -> float | None:
        """Ensure either weight_g or quantity is provided, but not both."""
        data = info.data
        if "weight_g" in data and "quantity" in data:
            if data["weight_g"] is not None and data["quantity"] is not None:
                raise ValueError("Cannot specify both weight_g and quantity")
            if data["weight_g"] is None and data["quantity"] is None:
                raise ValueError("Must specify either weight_g or quantity")
        return v


class Measurements(BaseModel):
    """Daily body weight measurements."""

    morning_weight_kg: float | None = Field(default=None, ge=0, le=500)
    evening_weight_kg: float | None = Field(default=None, ge=0, le=500)


class TargetMode(str, Enum):
    """Mode for nutrient targets."""

    TARGET = "target"  # Goal to reach
    LIMIT = "limit"  # Maximum to stay under


class DailyTargets(BaseModel):
    """Daily nutritional targets and limits."""

    date: date
    mode: TargetMode = TargetMode.TARGET
    energy_kcal: float = Field(default=2000, ge=0)
    protein_g: float = Field(default=50, ge=0)
    carbohydrates_g: float = Field(default=260, ge=0)
    fat_g: float = Field(default=70, ge=0)
    sugar_g: float = Field(default=90, ge=0)
    saturated_fat_g: float = Field(default=20, ge=0)
    fibre_g: float = Field(default=30, ge=0)
    salt_g: float = Field(default=6, ge=0)
    calcium_mg: float = Field(default=700, ge=0)

    # Per-nutrient mode overrides (if not set, use the global mode)
    energy_mode: TargetMode | None = None
    protein_mode: TargetMode | None = None
    carbohydrates_mode: TargetMode | None = None
    fat_mode: TargetMode | None = None
    sugar_mode: TargetMode | None = None
    saturated_fat_mode: TargetMode | None = None
    fibre_mode: TargetMode | None = None
    salt_mode: TargetMode | None = None
    calcium_mode: TargetMode | None = None

    def get_nutrient_mode(self, nutrient_name: str) -> TargetMode:
        """Get the mode for a specific nutrient."""
        mode_attr = f"{nutrient_name}_mode"
        specific_mode = getattr(self, mode_attr, None)
        return specific_mode if specific_mode is not None else self.mode

    @classmethod
    def get_default_targets(cls, target_date: date) -> "DailyTargets":
        """Get default targets with sensible defaults."""
        return cls(
            date=target_date,
            energy_kcal=2000,
            protein_g=150,
            carbohydrates_g=225,
            fat_g=67,
            sugar_g=90,
            saturated_fat_g=20,
            fibre_g=30,
            salt_g=6,
            calcium_mg=700,
            # Set default modes for specific nutrients
            energy_mode=TargetMode.TARGET,
            protein_mode=TargetMode.TARGET,
            carbohydrates_mode=TargetMode.TARGET,
            fat_mode=TargetMode.TARGET,
            sugar_mode=TargetMode.LIMIT,
            saturated_fat_mode=TargetMode.LIMIT,
            fibre_mode=TargetMode.TARGET,
            salt_mode=TargetMode.LIMIT,
            calcium_mode=TargetMode.TARGET,
        )


class DailyData(BaseModel):
    """Complete data for a single day."""

    date: date
    entries: list[FoodEntry] = Field(default_factory=list)
    measurements: Measurements = Field(default_factory=Measurements)
    totals: Nutrients | None = None

    def calculate_totals(self) -> Nutrients:
        """Calculate total nutrients from all entries."""
        totals = {
            "energy_kcal": 0.0,
            "fat_g": 0.0,
            "saturated_fat_g": 0.0,
            "carbohydrates_g": 0.0,
            "sugar_g": 0.0,
            "protein_g": 0.0,
            "fibre_g": 0.0,
            "salt_g": 0.0,
            "calcium_mg": 0.0,
        }

        for entry in self.entries:
            for nutrient in totals:
                totals[nutrient] += getattr(entry.nutrients, nutrient)

        return Nutrients(**totals)
