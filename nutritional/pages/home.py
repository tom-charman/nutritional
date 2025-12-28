"""Home page - visualization dashboard."""

import dash

# Register this as the home page
dash.register_page(__name__, path="/", title="Nutritional Dashboard")

from nutritional.layout import get_layout as get_visualization_layout

# Use the existing visualization layout
layout = get_visualization_layout()

# Import the existing callbacks to ensure they are registered
from nutritional import callbacks  # noqa: F401
