"""
Main Dash application instance and configuration.

This module initializes the Dash app with Bootstrap styling and sets up
the server reference for deployment.
"""

import dash
import dash_bootstrap_components as dbc

# Initialize Dash app with Bootstrap theme
app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.BOOTSTRAP],
    suppress_callback_exceptions=True,
    title="Nutritional Dashboard",
    update_title="Updating..."
)

# Server reference for deployment (e.g., Gunicorn)
server = app.server

# Import layout and callbacks after app creation
from nutritional.layout import get_layout
from nutritional import callbacks  # noqa: F401 (registers callbacks)

# Set the app layout
app.layout = get_layout()


if __name__ == '__main__':  # pragma: no cover
    app.run(debug=True, host='0.0.0.0', port=8050)
