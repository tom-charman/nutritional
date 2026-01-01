"""Authorization utilities for checking user access to protected pages."""

import os
from pathlib import Path

import dash_bootstrap_components as dbc
from dash import html
from flask import session


# Load authorized users list
def load_authorized_users():  # pragma: no cover
    """Load authorized users from file specified in environment variable."""
    auth_file = os.getenv("AUTHORIZED_USERS_FILE")
    if not auth_file:
        print("⚠ Warning: AUTHORIZED_USERS_FILE not set. Only home page will be accessible.")
        return None

    auth_path = Path(auth_file)
    if not auth_path.exists():
        print(
            f"⚠ Warning: Authorized users file not found at {auth_path}. "
            "Only home page will be accessible."
        )
        return None

    try:
        with open(auth_path) as f:
            # Read emails, strip whitespace, ignore empty lines and comments
            users = [
                line.strip() for line in f if line.strip() and not line.strip().startswith("#")
            ]
        print(f"✓ Loaded {len(users)} authorized user(s) from {auth_path}")
        return set(users)
    except Exception as e:
        print(f"⚠ Error loading authorized users: {e}. Only home page will be accessible.")
        return None


AUTHORIZED_USERS = load_authorized_users()  # pragma: no cover


def is_authorized():  # pragma: no cover
    """Check if the current user is authorized to access protected pages."""
    # If no authorized users list is configured, deny access to protected pages
    if AUTHORIZED_USERS is None:
        return False

    # Get the user profile from the OIDC session - try different keys
    user_profile = session.get("oidc_auth_profile", {})
    if not user_profile:
        user_profile = session.get("user", {})

    # Try to get email from various possible locations
    email = user_profile.get("email")
    if not email:
        email = user_profile.get("preferred_username")
    if not email:
        email = user_profile.get("sub")

    if not email:
        # Debug: print all session keys to help troubleshoot
        print(f"🔍 Debug - Session keys: {list(session.keys())}")
        if user_profile:
            print(f"🔍 Debug - Profile keys: {list(user_profile.keys())}")
        return False

    # Normalize email for comparison (lowercase, strip whitespace)
    email = email.strip().lower()
    # Normalize authorized users list
    normalized_authorized = {user.strip().lower() for user in AUTHORIZED_USERS}

    return email in normalized_authorized


def get_current_user_email():  # pragma: no cover
    """Get the email of the currently logged in user."""
    # Try different possible session keys used by dash-auth
    user_profile = session.get("oidc_auth_profile", {})
    if not user_profile:
        user_profile = session.get("user", {})

    # Try to get email from various possible locations
    email = user_profile.get("email")
    if not email:
        email = user_profile.get("preferred_username")
    if not email:
        email = user_profile.get("sub")

    return email or "Unknown"


def get_access_denied_layout(user_email):
    """Return an access denied layout for unauthorized users."""
    return dbc.Container(
        [
            dbc.Alert(
                [
                    html.H4("403 - Access Denied", className="alert-heading"),
                    html.Hr(),
                    html.P(
                        [
                            "You are logged in as ",
                            html.Strong(user_email),
                            ", but your account is not authorized to access this page.",
                        ]
                    ),
                    html.P(
                        "Please contact the system administrator "
                        "if you believe you should have access.",
                        className="mb-0",
                    ),
                ],
                color="danger",
                className="mt-5",
            )
        ],
        className="mt-5",
    )
