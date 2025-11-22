"""Application settings and configuration.

Loads environment variables and exposes configuration constants.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)

# --- ENVIRONMENT VARIABLES ---
# Google Sheets Configuration
GOOGLE_SHEETS_ID = os.getenv("GOOGLE_SHEETS_ID")
GOOGLE_SHEETS_RANGE = os.getenv("GOOGLE_SHEETS_RANGE", "A:Z")  # Default to all columns
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH")

# Local CSV Configuration
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
    "Sugar g": 70,  # Total sugars, not tracking free sugars
    "Fibre g": 30,  # Target 30g (European guidelines)
    "Salt g": 6,  # Max 5g (NHS recommendation)
    "Calcium mg": 1000,  # Target 1000mg (Osteoporsis)
}

# Custom Modern Palette (for consistent identity)
COLOR_PALETTE = {
    "deep_blue": "#0077b6",  # Primary: Salt, Calories
    "vibrant_pink": "#ef476f",  # Secondary: Saturated Fat, Evening Weight
    "mint_green": "#06d6a0",  # Tertiary: Fibre, Protein
    "warm_yellow": "#ffd166",  # Quaternary: Sugar, Carbs
    "rich_purple": "#6a4c93",  # Quinary: Calcium, Other Fat
}
