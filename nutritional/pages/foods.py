"""Food database manager page."""

import dash
import dash_bootstrap_components as dbc
from dash import Input, Output, State, callback, dcc, html, no_update
from dash.exceptions import PreventUpdate

from nutritional.auth_utils import (
    get_access_denied_layout,
    get_current_user_email,
    is_authorized,
)
from nutritional.data_entry.models import FoodItem, UnitType
from nutritional.data_entry.sqlmodel_storage import SQLModelStorage

dash.register_page(__name__, path="/foods", title="Food Database")

storage = SQLModelStorage()


def get_foods_layout():
    """Return the food database layout."""
    return dbc.Container(
        [
            # Toolbar - Search and Add New
            html.Div(
                [
                    html.Div(
                        [
                            dbc.Input(
                                id="search-food",
                                placeholder="Search foods...",
                                type="text",
                                className="search-input-rounded",
                                size="sm",
                            ),
                        ],
                        className="toolbar-left",
                    ),
                    html.Div(
                        [
                            dbc.Button(
                                "+ New Food",
                                id="new-food-btn",
                                color="primary",
                                size="sm",
                            ),
                        ],
                        className="toolbar-right",
                    ),
                ],
                className="toolbar",
            ),
            # Master-Detail Layout
            html.Div(
                [
                    # Master Panel - Food List
                    html.Div(
                        [
                            html.Div(
                                id="food-list",
                                className="master-list",
                            ),
                        ],
                        className="master-panel",
                    ),
                    # Detail Panel - Editor
                    html.Div(
                        [
                            dcc.Store(id="edit-food-id"),
                            html.Div(
                                id="food-editor",
                                children=[
                                    html.P(
                                        "Select a food from the list or "
                                        "click '+ New Food' to begin.",
                                        className="text-muted text-center p-3",
                                    ),
                                ],
                            ),
                            # Food form (always present but values controlled by callbacks)
                            html.Div(
                                [
                                    # Name and Unit Type Row
                                    html.Div(
                                        [
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Food Name",
                                                        className="form-label-sm",
                                                    ),
                                                    dbc.Input(
                                                        id="food-name",
                                                        placeholder="e.g., Chicken Breast",
                                                        type="text",
                                                        size="sm",
                                                    ),
                                                ],
                                                className="editor-flex-70",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Unit Type",
                                                        className="form-label-sm",
                                                    ),
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
                                                className="editor-flex-30",
                                            ),
                                        ],
                                        className="editor-grid-2col hidden",
                                        id="form-row-1",
                                    ),
                                    # Serving Size
                                    html.Div(
                                        [
                                            html.Label(
                                                "Serving Size (g)",
                                                className="form-label-sm",
                                            ),
                                            dbc.Input(
                                                id="serving-size",
                                                placeholder="Required for per-item",
                                                type="number",
                                                min=0,
                                                step=0.1,
                                                size="sm",
                                            ),
                                        ],
                                        className="form-row-mb hidden",
                                        id="form-row-2",
                                    ),
                                    # Nutritional Grid
                                    html.Div(
                                        [
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Calories (kcal)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="energy-kcal",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Protein (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="protein-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Carbs (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="carbohydrates-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Fat (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="fat-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Sugar (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="sugar-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Sat Fat (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="saturated-fat-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Fibre (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="fibre-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Salt (g)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="salt-g",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                            html.Div(
                                                [
                                                    html.Label(
                                                        "Calcium (mg)",
                                                        className="form-label-xs",
                                                    ),
                                                    dbc.Input(
                                                        id="calcium-mg",
                                                        type="number",
                                                        min=0,
                                                        step=0.1,
                                                        size="sm",
                                                        placeholder="0",
                                                    ),
                                                ],
                                                className="compact-input",
                                            ),
                                        ],
                                        className="editor-grid hidden",
                                        id="form-grid",
                                    ),
                                    # Editor Actions
                                    html.Div(
                                        [
                                            dbc.Button(
                                                "Clear",
                                                id="clear-food-form-btn",
                                                color="secondary",
                                                size="sm",
                                                outline=True,
                                            ),
                                            dbc.Button(
                                                "Save Food",
                                                id="save-food-btn",
                                                color="primary",
                                                size="sm",
                                            ),
                                        ],
                                        className="editor-actions hidden",
                                        id="form-actions",
                                    ),
                                ],
                            ),
                        ],
                        className="detail-panel",
                    ),
                ],
                className="master-detail",
            ),
            # Save message
            html.Div(id="food-save-message", className="mt-3"),
        ],
        fluid=True,
        className="page-content page-max-width-1400 page-padding-top-20",
    )


# Set layout based on authorization
def layout():
    """Return layout based on user authorization."""
    if is_authorized():
        return get_foods_layout()
    return get_access_denied_layout(get_current_user_email())


# Callback to load food into editor or clear for new food
@callback(
    [
        Output("food-editor", "style"),
        Output("form-row-1", "style"),
        Output("form-row-2", "style"),
        Output("form-grid", "style"),
        Output("form-actions", "style"),
        Output("edit-food-id", "data", allow_duplicate=True),
        Output("food-name", "value", allow_duplicate=True),
        Output("unit-type", "value", allow_duplicate=True),
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
    ],
    [
        Input("new-food-btn", "n_clicks"),
        Input({"type": "select-food", "index": dash.ALL}, "n_clicks"),
    ],
    [State("edit-food-id", "data")],
    prevent_initial_call=True,
)
def load_food_editor(new_btn_clicks, select_clicks, current_id):
    """Load food into editor or show new food form."""
    ctx = dash.callback_context
    if not ctx.triggered:
        raise PreventUpdate

    trigger_id = ctx.triggered[0]["prop_id"].split(".")[0]

    # Check if "New Food" button was clicked
    if trigger_id == "new-food-btn":
        food_id = None
        food_item = None
    else:
        # Extract food ID from the clicked list item
        try:
            button_info = eval(trigger_id)
            food_id = button_info["index"]
            food_item = storage.get_food_item(food_id)
        except Exception:
            raise PreventUpdate

    # Show form, hide placeholder
    editor_hidden = {"display": "none"}
    form_visible = {"display": "block"}
    form_grid_visible = {"display": "grid"}
    form_actions_visible = {"display": "flex"}

    # Return all values
    return (
        editor_hidden,  # Hide placeholder message
        form_visible,  # Show form row 1
        form_visible,  # Show form row 2
        form_grid_visible,  # Show form grid
        form_actions_visible,  # Show form actions
        food_id,
        food_item.name if food_item else "",
        food_item.unit_type.value if food_item else "per_100g",
        food_item.serving_size_g if food_item and food_item.unit_type.value == "per_item" else None,
        food_item.energy_kcal if food_item else None,
        food_item.fat_g if food_item else None,
        food_item.saturated_fat_g if food_item else None,
        food_item.carbohydrates_g if food_item else None,
        food_item.sugar_g if food_item else None,
        food_item.protein_g if food_item else None,
        food_item.fibre_g if food_item else None,
        food_item.salt_g if food_item else None,
        food_item.calcium_mg if food_item else None,
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
    [
        Input("search-food", "value"),
        Input("save-food-btn", "n_clicks"),
        Input("edit-food-id", "data"),
    ],
)
def update_food_list(search_query, _, selected_id):
    """Update the list of food items with master-list styling."""
    if search_query:
        items = storage.search_food_items(search_query)
    else:
        items = storage.load_food_database()

    if not items:
        return html.Div(
            html.P(
                "No food items found.",
                className="text-muted",
                style={"padding": "20px", "textAlign": "center"},
            ),
        )

    return [
        html.Div(
            [
                html.Div(
                    [
                        html.Div(item.name, className="master-list-item-name"),
                    ],
                    style={"flex": "1"},
                ),
                html.Div(
                    [
                        html.Span(
                            "Per 100g" if item.unit_type == UnitType.PER_100G else "Per item",
                            className="master-list-item-badge",
                        ),
                    ],
                ),
            ],
            className=f"master-list-item {'selected' if selected_id == item.id else ''}",
            id={"type": "select-food", "index": item.id},
            n_clicks=0,
        )
        for item in items
    ]


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
                                f"{item.energy_kcal:.0f} kcal",
                                className="macro-badge badge-calories",
                                title="Calories",
                            ),
                            html.Span(
                                f"{item.protein_g:.1f} g Protein",
                                className="macro-badge badge-protein",
                                title="Protein",
                            ),
                            html.Span(
                                f"{item.carbohydrates_g:.1f} g Carbs",
                                className="macro-badge badge-carbs",
                                title="Carbohydrates",
                            ),
                            html.Span(
                                f"{item.fat_g:.1f} g Fat",
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
                                children="✎",
                                id={"type": "edit-food", "index": item.id},
                                n_clicks=0,
                                title="Edit",
                                style={
                                    "cursor": "pointer",
                                    "fontSize": "18px",
                                    "padding": "8px",
                                    "fontFamily": "Georgia, serif",
                                },
                            ),
                            html.I(
                                className="icon-button danger",
                                children="✕",
                                id={"type": "delete-food", "index": item.id},
                                n_clicks=0,
                                title="Delete",
                                style={
                                    "cursor": "pointer",
                                    "fontSize": "18px",
                                    "padding": "8px",
                                    "fontFamily": "Georgia, serif",
                                    "fontWeight": "bold",
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
