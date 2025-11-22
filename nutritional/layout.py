"""
Dashboard layout components using Dash and Bootstrap.

Defines the entire UI structure including header, controls, plots, and summary statistics.
"""

from dash import dcc, html
import dash_bootstrap_components as dbc


def get_layout():
    """
    Create the main dashboard layout.
    
    Returns:
        Dash layout container with all UI components
    """
    return dbc.Container([
        # Header
        dbc.Row([
            dbc.Col([
                html.H1(
                    "Nutritional Dashboard", 
                    className="text-center mb-2 mt-4"
                ),
                html.P(
                    "Interactive visualization of daily nutritional intake",
                    className="text-center text-muted mb-4"
                )
            ])
        ]),
        
        # Controls Row
        dbc.Row([
            dbc.Col([
                html.Label("Date Range:", className="fw-bold"),
                dcc.DatePickerRange(
                    id='date-range-picker',
                    display_format='YYYY-MM-DD',
                    start_date_placeholder_text="Start Date",
                    end_date_placeholder_text="End Date",
                    className="mb-2"
                ),
            ], md=6),
            dbc.Col([
                html.Label("Actions:", className="fw-bold"),
                html.Div([
                    dbc.Button(
                        'Refresh Data',
                        id='refresh-button',
                        color='primary',
                        className='me-2',
                        n_clicks=0
                    ),
                ]),
            ], md=3),
            dbc.Col([
                html.Label("Rolling Window:", className="fw-bold"),
                dcc.Dropdown(
                    id='rolling-window-dropdown',
                    options=[
                        {'label': '3 days', 'value': 3},
                        {'label': '7 days', 'value': 7},
                        {'label': '14 days', 'value': 14},
                        {'label': '30 days', 'value': 30},
                    ],
                    value=7,
                    clearable=False,
                ),
            ], md=3),
        ], className="mb-4 p-3 bg-light rounded"),
        
        # Summary Statistics Cards
        html.H4("Summary Statistics", className="mt-4 mb-3"),
        dbc.Row([
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H3(id="avg-calories", className="text-primary"),
                        html.P("Avg Daily Calories", className="mb-0 text-muted"),
                    ])
                ], className="text-center")
            ], md=3),
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H3(id="avg-weight", className="text-success"),
                        html.P("Avg Weight (kg)", className="mb-0 text-muted"),
                    ])
                ], className="text-center")
            ], md=3),
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H3(id="avg-protein", className="text-info"),
                        html.P("Avg Protein (g)", className="mb-0 text-muted"),
                    ])
                ], className="text-center")
            ], md=3),
            dbc.Col([
                dbc.Card([
                    dbc.CardBody([
                        html.H3(id="data-points", className="text-secondary"),
                        html.P("Data Points", className="mb-0 text-muted"),
                    ])
                ], className="text-center")
            ], md=3),
        ], className="mb-4"),
        
        # Plots Section
        html.H4("Visualizations", className="mt-4 mb-3"),
        dbc.Tabs([
            dbc.Tab([
                dcc.Graph(
                    id='calories-weight-plot',
                    config={'displayModeBar': True, 'displaylogo': False},
                    style={'height': '600px'}
                )
            ], label="📊 Calories & Weight", tab_id="tab-1"),
            
            dbc.Tab([
                dcc.Graph(
                    id='macro-breakdown-plot',
                    config={'displayModeBar': True, 'displaylogo': False},
                    style={'height': '600px'}
                )
            ], label="🥗 Macronutrient Breakdown", tab_id="tab-2"),
            
            dbc.Tab([
                dcc.Graph(
                    id='nutrients-rdi-plot',
                    config={'displayModeBar': True, 'displaylogo': False},
                    style={'height': '600px'}
                )
            ], label="💊 Nutrients vs RDI", tab_id="tab-3"),
        ], id="plot-tabs", active_tab="tab-1"),
        
        # Loading indicator overlay
        dcc.Loading(
            id="loading-overlay",
            type="default",
            children=[html.Div(id="loading-output")],
            overlay_style={"visibility": "visible", "opacity": 0.5},
        ),
        
        # Store for data (client-side caching)
        dcc.Store(id='data-store'),
        
        # Footer with data source information
        html.Hr(className="mt-5"),
        dbc.Row([
            dbc.Col([
                html.P(
                    id="data-source-info", 
                    className="text-muted text-center"
                ),
                html.P(
                    "Built with Plotly Dash | Data processed with NumPy",
                    className="text-muted text-center small"
                )
            ])
        ], className="mb-4")
    ], fluid=True, className="px-4")
