"""
Main Dash application instance and configuration.

This module initializes the Dash app with Bootstrap styling and sets up
the server reference for deployment.
"""

import os  # pragma: no cover
from pathlib import Path  # pragma: no cover

import dash  # pragma: no cover
import dash_bootstrap_components as dbc  # pragma: no cover
from dotenv import load_dotenv  # pragma: no cover

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"  # pragma: no cover
if env_path.exists():  # pragma: no cover
    load_dotenv(env_path)  # pragma: no cover
    print(f"✓ Loaded environment variables from {env_path}")  # pragma: no cover
else:  # pragma: no cover
    # Try loading from current directory
    load_dotenv()  # pragma: no cover
    if os.getenv("GOOGLE_SHEETS_ID") or os.getenv("LOCAL_CSV_PATH"):  # pragma: no cover
        print("✓ Loaded environment variables from .env")  # pragma: no cover
    else:  # pragma: no cover
        print("ℹ No .env file found, using default configuration")  # pragma: no cover

# Initialize Dash app with Bootstrap theme
app = dash.Dash(  # pragma: no cover
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    suppress_callback_exceptions=True,
    title="Nutritional Dashboard",
    update_title="Updating...",
)

# Server reference for deployment (e.g., Gunicorn)
server = app.server  # pragma: no cover

# Import layout and callbacks after app creation
from nutritional import callbacks  # noqa: F401 (registers callbacks)  # pragma: no cover
from nutritional.layout import get_layout  # pragma: no cover

# Set the app layout
app.layout = get_layout()  # pragma: no cover


if __name__ == "__main__":  # pragma: no cover
    app.run(debug=True, host="0.0.0.0", port=8050)
