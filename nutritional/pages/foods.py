"""Food database manager page."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html, no_update
from dash.exceptions import PreventUpdate

from nutritional.data_entry.models import FoodItem, UnitType
from nutritional.data_entry.storage import FileStorage

dash.register_page(__name__, path="/foods", title="Food Database")

storage = FileStorage()

layout = dbc.Container(
    [
        dbc.Row(
            [
                dbc.Col(html.H1("Food Database Manager"), width=12),
            ],
            className="mb-4",
        ),
        dbc.Row(
            [
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Add/Edit Food Item")),
                                dbc.CardBody(
                                    [
                                        dcc.Store(id="edit-food-id"),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Food Name"),
                                                        dbc.Input(
                                                            id="food-name",
                                                            placeholder="e.g., Chicken Breast",
                                                            type="text",
                                                        ),
                                                    ],
                                                    width=12,
                                                ),
                                            ],
                                            className="mb-3",
                                        ),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Unit Type"),
                                                        dbc.RadioItems(
                                                            id="unit-type",
                                                            options=[
                                                                {
                                                                    "label": "Per 100g",
                                                                    "value": "per_100g",
                                                                },
                                                                {
                                                                    "label": "Per Item",
                                                                    "value": "per_item",
                                                                },
                                                            ],
                                                            value="per_100g",
                                                            inline=True,
                                                        ),
                                                    ],
                                                    width=6,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Serving Size (g)"),
                                                        dbc.Input(
                                                            id="serving-size",
                                                            placeholder="Required for per-item",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                            disabled=True,
                                                        ),
                                                        dbc.FormText(
                                                            "Only for per-item foods "
                                                            "(e.g., 118g for medium banana)"
                                                        ),
                                                    ],
                                                    width=6,
                                                ),
                                            ],
                                            className="mb-3",
                                        ),
                                        html.H5("Nutritional Values", className="mt-3 mb-2"),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Energy (kcal)"),
                                                        dbc.Input(
                                                            id="energy-kcal",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Fat (g)"),
                                                        dbc.Input(
                                                            id="fat-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Saturated Fat (g)"),
                                                        dbc.Input(
                                                            id="saturated-fat-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                            ],
                                            className="mb-2",
                                        ),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Carbohydrates (g)"),
                                                        dbc.Input(
                                                            id="carbohydrates-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Sugar (g)"),
                                                        dbc.Input(
                                                            id="sugar-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Protein (g)"),
                                                        dbc.Input(
                                                            id="protein-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                            ],
                                            className="mb-2",
                                        ),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Fibre (g)"),
                                                        dbc.Input(
                                                            id="fibre-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Salt (g)"),
                                                        dbc.Input(
                                                            id="salt-g",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                                dbc.Col(
                                                    [
                                                        dbc.Label("Calcium (mg)"),
                                                        dbc.Input(
                                                            id="calcium-mg",
                                                            type="number",
                                                            min=0,
                                                            step=0.1,
                                                        ),
                                                    ],
                                                    width=4,
                                                ),
                                            ],
                                            className="mb-3",
                                        ),
                                        dbc.Row(
                                            [
                                                dbc.Col(
                                                    [
                                                        dbc.Button(
                                                            "Save Food Item",
                                                            id="save-food-btn",
                                                            color="primary",
                                                            className="me-2",
                                                        ),
                                                        dbc.Button(
                                                            "Clear Form",
                                                            id="clear-food-form-btn",
                                                            color="secondary",
                                                        ),
                                                    ]
                                                ),
                                            ]
                                        ),
                                        html.Div(id="food-save-message", className="mt-3"),
                                    ]
                                ),
                            ]
                        ),
                    ],
                    width=6,
                ),
                dbc.Col(
                    [
                        dbc.Card(
                            [
                                dbc.CardHeader(html.H4("Food Items")),
                                dbc.CardBody(
                                    [
                                        dbc.Input(
                                            id="search-food",
                                            placeholder="Search foods...",
                                            type="text",
                                            className="mb-3",
                                        ),
                                        html.Div(id="food-list"),
                                    ]
                                ),
                            ]
                        ),
                    ],
                    width=6,
                ),
            ],
            className="mb-4",
        ),
    ],
    fluid=True,
)


@callback(
    Output("serving-size", "disabled"),
    Input("unit-type", "value"),
)
def toggle_serving_size(unit_type):
    """Enable serving size input only for per-item foods."""
    return unit_type == "per_100g"


@callback(
    [
        Output("food-save-message", "children"),
        Output("food-name", "value"),
        Output("serving-size", "value"),
        Output("energy-kcal", "value"),
        Output("fat-g", "value"),
        Output("saturated-fat-g", "value"),
        Output("carbohydrates-g", "value"),
        Output("sugar-g", "value"),
        Output("protein-g", "value"),
        Output("fibre-g", "value"),
        Output("salt-g", "value"),
        Output("calcium-mg", "value"),
        Output("edit-food-id", "data"),
    ],
    Input("save-food-btn", "n_clicks"),
    [
        State("food-name", "value"),
        State("unit-type", "value"),
        State("serving-size", "value"),
        State("energy-kcal", "value"),
        State("fat-g", "value"),
        State("saturated-fat-g", "value"),
        State("carbohydrates-g", "value"),
        State("sugar-g", "value"),
        State("protein-g", "value"),
        State("fibre-g", "value"),
        State("salt-g", "value"),
        State("calcium-mg", "value"),
        State("edit-food-id", "data"),
    ],
    prevent_initial_call=True,
)
def save_food_item(n_clicks, name, unit_type, serving_size, *nutrients_and_id):
    """Save a food item to the database."""
    if not n_clicks:
        raise PreventUpdate

    # Unpack nutrients and ID
    (
        energy,
        fat,
        sat_fat,
        carbs,
        sugar,
        protein,
        fibre,
        salt,
        calcium,
        edit_id,
    ) = nutrients_and_id

    # Validate inputs
    if not name:
        return (
            dbc.Alert("Please enter a food name", color="danger"),
            *[no_update] * 12,
        )

    if unit_type == "per_item" and not serving_size:
        return (
            dbc.Alert("Serving size is required for per-item foods", color="danger"),
            *[no_update] * 12,
        )

    # Convert None or empty values to 0 for nutrients
    def to_float_or_zero(value):
        """Convert value to float, treating None or empty as 0."""
        if value is None or value == "":
            return 0.0
        return float(value)

    try:
        # Create food item - construct directly to avoid type confusion
        if edit_id:
            # Editing existing item
            food_item = FoodItem(
                id=edit_id,
                name=name,
                unit_type=UnitType(unit_type),
                serving_size_g=serving_size if unit_type == "per_item" else None,
                energy_kcal=to_float_or_zero(energy),
                fat_g=to_float_or_zero(fat),
                saturated_fat_g=to_float_or_zero(sat_fat),
                carbohydrates_g=to_float_or_zero(carbs),
                sugar_g=to_float_or_zero(sugar),
                protein_g=to_float_or_zero(protein),
                fibre_g=to_float_or_zero(fibre),
                salt_g=to_float_or_zero(salt),
                calcium_mg=to_float_or_zero(calcium),
            )
        else:
            # Creating new item (id will be auto-generated)
            food_item = FoodItem(
                name=name,
                unit_type=UnitType(unit_type),
                serving_size_g=serving_size if unit_type == "per_item" else None,
                energy_kcal=to_float_or_zero(energy),
                fat_g=to_float_or_zero(fat),
                saturated_fat_g=to_float_or_zero(sat_fat),
                carbohydrates_g=to_float_or_zero(carbs),
                sugar_g=to_float_or_zero(sugar),
                protein_g=to_float_or_zero(protein),
                fibre_g=to_float_or_zero(fibre),
                salt_g=to_float_or_zero(salt),
                calcium_mg=to_float_or_zero(calcium),
            )

        # Save to storage
        storage.save_food_item(food_item)

        # Clear form and show success message
        return (
            dbc.Alert(f"Food item '{name}' saved successfully!", color="success"),
            "",  # name
            None,  # serving_size
            None,  # energy
            None,  # fat
            None,  # sat_fat
            None,  # carbs
            None,  # sugar
            None,  # protein
            None,  # fibre
            None,  # salt
            None,  # calcium
            None,  # edit_id
        )
    except Exception as e:
        return (
            dbc.Alert(f"Error saving food item: {str(e)}", color="danger"),
            *[no_update] * 12,
        )


@callback(
    Output("food-list", "children"),
    [Input("search-food", "value"), Input("save-food-btn", "n_clicks")],
)
def update_food_list(search_query, _):
    """Update the list of food items."""
    if search_query:
        items = storage.search_food_items(search_query)
    else:
        items = storage.load_food_database()

    if not items:
        return html.P("No food items found.", className="text-muted")

    return html.Div(
        [
            html.Div(
                [
                    html.Div(
                        [
                            html.Strong(item.name, style={"fontSize": "16px"}),
                            html.Div(
                                [
                                    dbc.Badge(
                                        "Per 100g"
                                        if item.unit_type == UnitType.PER_100G
                                        else f"Per item ({item.serving_size_g}g)",
                                        color="info",
                                        className="ms-2",
                                        style={"fontSize": "11px"},
                                    ),
                                ],
                                style={"display": "inline"},
                            ),
                        ],
                        style={"flex": "1", "minWidth": "150px"},
                    ),
                    html.Div(
                        [
                            html.Span(
                                f"{item.energy_kcal:.0f}",
                                className="macro-badge badge-calories",
                                title="Calories",
                            ),
                            html.Span(
                                f"{item.protein_g:.1f}g P",
                                className="macro-badge badge-protein",
                                title="Protein",
                            ),
                            html.Span(
                                f"{item.carbohydrates_g:.1f}g C",
                                className="macro-badge badge-carbs",
                                title="Carbohydrates",
                            ),
                            html.Span(
                                f"{item.fat_g:.1f}g F",
                                className="macro-badge badge-fat",
                                title="Fat",
                            ),
                        ],
                        style={
                            "display": "flex",
                            "gap": "8px",
                            "flexWrap": "wrap",
                            "alignItems": "center",
                        },
                    ),
                    html.Div(
                        [
                            html.I(
                                className="icon-button",
                                children="✏️",
                                id={"type": "edit-food", "index": item.id},
                                n_clicks=0,
                                title="Edit",
                                style={
                                    "cursor": "pointer",
                                    "fontSize": "18px",
                                    "padding": "8px",
                                },
                            ),
                            html.I(
                                className="icon-button danger",
                                children="🗑️",
                                id={"type": "delete-food", "index": item.id},
                                n_clicks=0,
                                title="Delete",
                                style={
                                    "cursor": "pointer",
                                    "fontSize": "18px",
                                    "padding": "8px",
                                },
                            ),
                        ],
                        style={"display": "flex", "gap": "4px"},
                    ),
                ],
                className="food-item-row",
                style={
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "gap": "16px",
                    "flexWrap": "wrap",
                },
            )
            for item in items
        ],
        style={"display": "flex", "flexDirection": "column", "gap": "12px"},
    )


@callback(
    [
        Output("food-name", "value", allow_duplicate=True),
        Output("unit-type", "value"),
        Output("serving-size", "value", allow_duplicate=True),
        Output("energy-kcal", "value", allow_duplicate=True),
        Output("fat-g", "value", allow_duplicate=True),
        Output("saturated-fat-g", "value", allow_duplicate=True),
        Output("carbohydrates-g", "value", allow_duplicate=True),
        Output("sugar-g", "value", allow_duplicate=True),
        Output("protein-g", "value", allow_duplicate=True),
        Output("fibre-g", "value", allow_duplicate=True),
        Output("salt-g", "value", allow_duplicate=True),
        Output("calcium-mg", "value", allow_duplicate=True),
        Output("edit-food-id", "data", allow_duplicate=True),
    ],
    Input({"type": "edit-food", "index": dash.ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def edit_food_item(n_clicks):
    """Load food item into form for editing."""
    if not any(n_clicks):
        raise PreventUpdate

    # Get the food ID from the triggered button
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    button_id = ctx.triggered[0]["prop_id"].split(".")[0]
    food_id = eval(button_id)["index"]

    # Load the food item
    item = storage.get_food_item(food_id)
    if not item:
        raise PreventUpdate

    return (
        item.name,
        item.unit_type.value,
        item.serving_size_g,
        item.energy_kcal,
        item.fat_g,
        item.saturated_fat_g,
        item.carbohydrates_g,
        item.sugar_g,
        item.protein_g,
        item.fibre_g,
        item.salt_g,
        item.calcium_mg,
        item.id,
    )


@callback(
    Output("food-list", "children", allow_duplicate=True),
    Input({"type": "delete-food", "index": dash.ALL}, "n_clicks"),
    prevent_initial_call=True,
)
def delete_food_item(n_clicks):
    """Delete a food item."""
    if not any(n_clicks):
        raise PreventUpdate

    # Get the food ID from the triggered button
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    button_id = ctx.triggered[0]["prop_id"].split(".")[0]
    food_id = eval(button_id)["index"]

    # Delete the item
    storage.delete_food_item(food_id)

    # Return updated list
    items = storage.load_food_database()
    if not items:
        return html.P("No food items found.", className="text-muted")

    return html.Div(
        [
            html.Div(
                [
                    html.Div(
                        [
                            html.Strong(item.name, style={"fontSize": "16px"}),
                            html.Div(
                                [
                                    dbc.Badge(
                                        "Per 100g"
                                        if item.unit_type == UnitType.PER_100G
                                        else f"Per item ({item.serving_size_g}g)",
                                        color="info",
                                        className="ms-2",
                                        style={"fontSize": "11px"},
                                    ),
                                ],
                                style={"display": "inline"},
                            ),
                        ],
                        style={"flex": "1", "minWidth": "150px"},
                    ),
                    html.Div(
                        [
                            html.Span(
                                f"{item.energy_kcal:.0f}",
                                className="macro-badge badge-calories",
                                title="Calories",
                            ),
                            html.Span(
                                f"{item.protein_g:.1f}g P",
                                className="macro-badge badge-protein",
                                title="Protein",
                            ),
                            html.Span(
                                f"{item.carbohydrates_g:.1f}g C",
                                className="macro-badge badge-carbs",
                                title="Carbohydrates",
                            ),
                            html.Span(
                                f"{item.fat_g:.1f}g F",
                                className="macro-badge badge-fat",
                                title="Fat",
                            ),
                        ],
                        style={
                            "display": "flex",
                            "gap": "8px",
                            "flexWrap": "wrap",
                            "alignItems": "center",
                        },
                    ),
                    html.Div(
                        [
                            html.I(
                                className="icon-button",
                                children="✏️",
                                id={"type": "edit-food", "index": item.id},
                                n_clicks=0,
                                title="Edit",
                                style={
                                    "cursor": "pointer",
                                    "fontSize": "18px",
                                    "padding": "8px",
                                },
                            ),
                            html.I(
                                className="icon-button danger",
                                children="🗑️",
                                id={"type": "delete-food", "index": item.id},
                                n_clicks=0,
                                title="Delete",
                                style={
                                    "cursor": "pointer",
                                    "fontSize": "18px",
                                    "padding": "8px",
                                },
                            ),
                        ],
                        style={"display": "flex", "gap": "4px"},
                    ),
                ],
                className="food-item-row",
                style={
                    "display": "flex",
                    "alignItems": "center",
                    "justifyContent": "space-between",
                    "gap": "16px",
                    "flexWrap": "wrap",
                },
            )
            for item in items
        ],
        style={"display": "flex", "flexDirection": "column", "gap": "12px"},
    )


@callback(
    [
        Output("food-name", "value", allow_duplicate=True),
        Output("serving-size", "value", allow_duplicate=True),
        Output("energy-kcal", "value", allow_duplicate=True),
        Output("fat-g", "value", allow_duplicate=True),
        Output("saturated-fat-g", "value", allow_duplicate=True),
        Output("carbohydrates-g", "value", allow_duplicate=True),
        Output("sugar-g", "value", allow_duplicate=True),
        Output("protein-g", "value", allow_duplicate=True),
        Output("fibre-g", "value", allow_duplicate=True),
        Output("salt-g", "value", allow_duplicate=True),
        Output("calcium-mg", "value", allow_duplicate=True),
        Output("edit-food-id", "data", allow_duplicate=True),
    ],
    Input("clear-food-form-btn", "n_clicks"),
    prevent_initial_call=True,
)
def clear_form(n_clicks):
    """Clear the food form."""
    if not n_clicks:
        raise PreventUpdate
    return ("",) + (None,) * 11
