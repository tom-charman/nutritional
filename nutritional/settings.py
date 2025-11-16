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
