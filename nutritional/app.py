"""
Main Dash application instance and configuration.

This module initializes the Dash app with Bootstrap styling and sets up
the multi-page structure with navigation.
"""

import os  # pragma: no cover
from pathlib import Path  # pragma: no cover

import dash  # pragma: no cover
import dash_bootstrap_components as dbc  # pragma: no cover
from dash import dcc, page_container  # pragma: no cover
from dash_auth import OIDCAuth  # pragma: no cover
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

# Initialize Dash app with Bootstrap theme and multi-page support
app = dash.Dash(  # pragma: no cover
    __name__,
    external_stylesheets=[
        dbc.themes.BOOTSTRAP,
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    ],
    suppress_callback_exceptions=True,
    title="Nutritional Tracker",
    update_title="Updating...",
    use_pages=True,  # Enable multi-page support
)

# Server reference for deployment (e.g., Gunicorn)
server = app.server  # pragma: no cover

# Add OIDC Authentication with Google
auth = OIDCAuth(  # pragma: no cover
    app,
    secret_key=os.getenv("SECRET_KEY", "dev-secret-key-change-in-production"),
)
auth.register_provider(  # pragma: no cover
    "google",
    token_endpoint_auth_method="client_secret_post",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    # Use manual configuration instead of discovery
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    token_url="https://oauth2.googleapis.com/token",
    userinfo_url="https://openidconnect.googleapis.com/v1/userinfo",
    client_kwargs={"scope": "openid email profile"},
)  # pragma: no cover


# Create navigation bar
def create_navbar():
    """Create navigation bar for multi-page app."""
    return dbc.NavbarSimple(
        children=[
            dbc.NavItem(dbc.NavLink("Dashboard", href="/")),
            dbc.NavItem(dbc.NavLink("Daily Entry", href="/entry")),
            dbc.NavItem(dbc.NavLink("Food Database", href="/foods")),
            dbc.NavItem(dbc.NavLink("History", href="/history")),
        ],
        brand="Nutritional Tracker",
        brand_href="/",
        color="primary",
        dark=True,
        className="mb-3",
    )


# Set the app layout with navigation and persistent stores
app.layout = dbc.Container(  # pragma: no cover
    [
        dcc.Location(id="url", refresh=False),
        # Persistent stores for daily entry state (survives page navigation)
        dcc.Store(id="persistent-entries", storage_type="session", data=[]),
        dcc.Store(id="persistent-entry-date", storage_type="session"),
        dcc.Store(id="persistent-morning-weight", storage_type="session"),
        dcc.Store(id="persistent-evening-weight", storage_type="session"),
        create_navbar(),
        page_container,
    ],
    fluid=True,
)


if __name__ == "__main__":  # pragma: no cover
    app.run(debug=True, host="0.0.0.0", port=8050)
