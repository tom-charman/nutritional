"""Application settings and configuration.

Loads environment variables and exposes configuration constants.
"""

import os
from logging import getLogger
from pathlib import Path

from dotenv import load_dotenv

logger = getLogger(__name__)

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# --- ENVIRONMENT VARIABLES ---
# Database Configuration (for data entry - Phase 2)
DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://nutritional_user:dev_password@127.0.0.1:5432/nutritional_db"
)

# Local CSV Configuration (fallback for visualization)
LOCAL_CSV_PATH = os.getenv("LOCAL_CSV_PATH")

# App Configuration
DASH_DEBUG = os.getenv("DASH_DEBUG", "True").lower() == "true"
DASH_HOST = os.getenv("DASH_HOST", "0.0.0.0")
DASH_PORT = int(os.getenv("DASH_PORT", "8050"))

# --- CONFIGURATION ---
ROLLING_WINDOW_DAYS = 7  # We'll use a 7-day rolling average to see trends

# Caloric conversion factors (kcal/g)
CAL_PROT = 4
CAL_CARB = 4
CAL_FAT = 9

# Recommended Daily Intake (RDI) Guidelines (Based on standard adult recommendations)
RDI_GUIDELINES = {
    "Saturated Fat g": 30,  # Max 20g (often 10% of 2000 kcal)
    "Sugar g": 90,  # Total sugars, not tracking free sugars
    "Fibre g": 30,  # Target 30g (European guidelines)
    "Salt g": 6,  # Max 5g (NHS recommendation)
    "Calcium mg": 1000,  # Target 1000mg (Osteoporsis)
}

# Custom Artisan Palette - Brand pigments (2026) with Nihonga colors
COLOR_PALETTE = {
    "protein": "#2C4C5B",  # Iron Blue - Protein (Structural Anchor)
    "carbs": "#C8963E",  # Antique Gold - Carbohydrates (Primary Fuel Base)
    "fat": "#BF6B59",  # Baked Clay - Fats (Secondary Fuel Base)
    "calories": "#2B2B2B",  # Sumi Iron - Calories (neutral)
    "fibre": "#4F6D46",  # Aged Pine - Fibre (Vegetal / Plant)
    "sugar": "#EBC374",  # Pale Amber - Sugar (Primary Fuel Highlight)
    "salt": "#7C6A88",  # Oxidized Ube - Salt (Mineral Alert)
    "calcium": "#6B7F82",  # Stone Grey - Calcium (Mineral Structure)
}

# Database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    # Fallback: construct from separate components
    DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
    DB_PORT = os.getenv("DB_PORT", "5432")
    DB_NAME = os.getenv("DB_NAME", "nutritional_db")
    DB_USER = os.getenv("DB_USER", "nutritional_user")
    DB_PASSWORD = os.getenv("DB_PASSWORD")

    if not DB_PASSWORD:
        logger.warning("DB_PASSWORD not set in environment; using empty password.")
        DB_PASSWORD = ""

    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
