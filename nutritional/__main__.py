"""
Entry point for the nutritional dashboard application.

Runs the Plotly Dash web server.
"""

from nutritional.app import app


def main():  # pragma: no cover
    """
    Start the Dash application server.
    """
    print("="*70)
    print("NUTRITIONAL DASHBOARD")
    print("="*70)
    print()
    print("Starting Dash server...")
    print("Open your browser and navigate to: http://localhost:8050")
    print()
    print("Press Ctrl+C to stop the server")
    print("="*70)
    print()
    
    app.run(debug=True, host='0.0.0.0', port=8050)


if __name__ == "__main__":  # pragma: no cover
    main()
