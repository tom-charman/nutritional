"""Pydantic models for nutritional data validation."""

import uuid
from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


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
