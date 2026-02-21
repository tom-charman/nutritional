"""Centralized component ID definitions for the Dash application.

This module provides a single source of truth for all component IDs used across
the application. By centralizing IDs, we:
1. Avoid accidental ID collisions between pages
2. Make it easy to audit and ensure uniqueness
3. Provide clear documentation of which components exist
4. Enable IDE autocomplete for component IDs

Usage:
    # In a page module:
    from nutritional.component_ids import ID, get_id

    # Apply page-specific prefix when accessing IDs
    dcc.Dropdown(id=get_id(ID.FOOD_SELECTOR, "entry"), ...)
    # -> "entry-food-selector"

    dcc.Input(id=get_id(ID.MEAL_NAME, "meal-planner"), ...)
    # -> "meal-planner-meal-name"
"""

from enum import Enum


class ID(Enum):
    """Single enum containing all component IDs for the entire application."""

    # Shared components (used across multiple pages)
    FOOD_SELECTOR = "food_selector"

    # Daily Entry Page
    FOOD_INPUT_CONTAINER = "food_input_container"
    ADD_ENTRY_BTN = "add_entry_btn"
    CALCULATED_NUTRIENTS = "calculated_nutrients"
    ENTRIES_LIST = "entries_list"
    ENTRY_DATE_PICKER = "entry_date_picker"
    CURRENT_DATE_DISPLAY = "current_date_display"
    DAILY_SUMMARY_COMPACT = "daily_summary_compact"
    ENTRY_TOAST = "entry_toast"
    PERSISTENT_ENTRIES = "persistent_entries"
    PERSISTENT_MORNING_WEIGHT = "persistent_morning_weight"
    PERSISTENT_EVENING_WEIGHT = "persistent_evening_weight"
    SELECTED_DATE_STORE = "selected_date_store"
    PAGE_LOAD_TRIGGER = "page_load_trigger"
    TARGETS_UPDATED_TRIGGER = "targets_updated_trigger"
    EDITING_ENTRY_INDEX = "editing_entry_index"
    EXPANDED_MEALS = "expanded_meals"
    MORNING_WEIGHT = "morning_weight"
    EVENING_WEIGHT = "evening_weight"
    DAILY_MACROS_DISPLAY = "daily_macros_display"
    CALORIES_REMAINING_DISPLAY = "calories_remaining_display"
    CALORIE_STATUS = "calorie_status"
    TARGETS_MODAL = "targets_modal"
    OPEN_TARGETS_MODAL = "open_targets_modal"
    CLOSE_TARGETS_MODAL = "close_targets_modal"
    SAVE_TARGETS = "save_targets"
    COPY_PREVIOUS_TARGETS = "copy_previous_targets"

    # Meal Planner Page
    MEAL_NAME = "meal_name"
    INGREDIENT_AMOUNT = "ingredient_amount"
    AMOUNT_UNIT = "amount_unit"
    ADD_INGREDIENT_BTN = "add_ingredient_btn"
    CLEAR_COMPOSER_BTN = "clear_composer_btn"
    SAVE_MEAL_BTN = "save_meal_btn"
    COMPOSER_INGREDIENTS = "composer_ingredients"
    INGREDIENTS_LIST = "ingredients_list"
    MEAL_TOTALS = "meal_totals"
    MEALS_LIST = "meals_list"
    CURRENT_MEAL_ID = "current_meal_id"
    MEAL_PLANNER_CONTAINER = "meal_planner_container"

    # Foods Database Page
    FORM_ROW_1 = "form_row_1"
    FORM_ROW_2 = "form_row_2"
    FORM_GRID = "form_grid"
    FORM_ACTIONS = "form_actions"
    FOOD_NAME = "food_name"
    UNIT_TYPE = "unit_type"
    SERVING_SIZE = "serving_size"
    SAVE_FOOD_BTN = "save_food_btn"
    CLEAR_FOOD_FORM_BTN = "clear_food_form_btn"
    FOOD_LIST = "food_list"
    EDIT_FOOD_ID = "edit_food_id"
    FOOD_EDITOR = "food_editor"
    FOOD_SAVE_MESSAGE = "food_save_message"
    SEARCH_FOOD = "search_food"
    NEW_FOOD_BTN = "new_food_btn"

    # Home/Analytics Page
    DATA_STORE = "data_store"
    REFRESH_BUTTON = "refresh_button"
    DATE_RANGE_PICKER = "date_range_picker"
    CALORIES_WEIGHT_PLOT = "calories_weight_plot"
    MACRO_BREAKDOWN_PLOT = "macro_breakdown_plot"
    NUTRIENTS_RDI_PLOT = "nutrients_rdi_plot"
    AVG_CALORIES = "avg_calories"
    AVG_WEIGHT = "avg_weight"
    AVG_PROTEIN = "avg_protein"
    DATA_POINTS = "data_points"
    DATA_SOURCE_INFO = "data_source_info"
    LOADING_OUTPUT = "loading_output"
    LOADING_OVERLAY = "loading_overlay"


def get_id(id_enum: ID, prefix: str = "") -> str:
    """Get the HTML ID string for a component with optional page-specific prefix.

    Args:
        id_enum: The ID enum member
        prefix: Optional prefix for the ID (e.g., "entry", "meal-planner")
                Pass empty string "" for no prefix

    Returns:
        The formatted HTML ID string in kebab-case with prefix

    Example:
        >>> get_id(ID.FOOD_SELECTOR, "entry")
        "entry-food-selector"
        >>> get_id(ID.FOOD_SELECTOR, "meal-planner")
        "meal-planner-food-selector"
        >>> get_id(ID.FOOD_NAME, "")
        "food-name"
    """
    sep = "-" if prefix else ""
    return f"{prefix}{sep}{id_enum.value.replace('_', '-')}"


# Pattern-matching callback types (used with dash.ALL, dash.MATCH)
# These are type identifiers, not component IDs, so they don't need prefixing
PATTERN_TYPES = {
    "food_amount": "food-amount",
    "meal_portions": "meal-portions",
    "remove_ingredient": "remove-ingredient",
    "meal_card": "meal-card",
    "delete_meal": "delete-meal",
    "remove_entry": "remove-entry",
    "edit_entry": "edit-entry",
    "toggle_meal": "toggle-meal",
}


# Backward compatibility: Pre-create ID dictionaries for existing code
# New code should use get_id(ID.COMPONENT_NAME, "prefix") instead
def _create_legacy_dict(prefix: str) -> dict[str, str]:
    """Create a dictionary of all IDs with the given prefix for backward compatibility."""
    return {id_member.name.lower(): get_id(id_member, prefix) for id_member in ID}


ENTRY_IDS = {
    "food_selector": get_id(ID.FOOD_SELECTOR, "entry"),
    "food_input_container": get_id(ID.FOOD_INPUT_CONTAINER, "entry"),
    "add_entry_btn": get_id(ID.ADD_ENTRY_BTN, "entry"),
    "calculated_nutrients": get_id(ID.CALCULATED_NUTRIENTS, "entry"),
    "entries_list": get_id(ID.ENTRIES_LIST, "entry"),
    "entry_date_picker": get_id(ID.ENTRY_DATE_PICKER, "entry"),
    "current_date_display": get_id(ID.CURRENT_DATE_DISPLAY, "entry"),
    "daily_summary_compact": get_id(ID.DAILY_SUMMARY_COMPACT, "entry"),
    "entry_toast": get_id(ID.ENTRY_TOAST, "entry"),
    "persistent_entries": get_id(ID.PERSISTENT_ENTRIES, "entry"),
    "persistent_morning_weight": get_id(ID.PERSISTENT_MORNING_WEIGHT, "entry"),
    "persistent_evening_weight": get_id(ID.PERSISTENT_EVENING_WEIGHT, "entry"),
    "selected_date_store": get_id(ID.SELECTED_DATE_STORE, "entry"),
    "page_load_trigger": get_id(ID.PAGE_LOAD_TRIGGER, "entry"),
    "targets_updated_trigger": get_id(ID.TARGETS_UPDATED_TRIGGER, "entry"),
    "editing_entry_index": get_id(ID.EDITING_ENTRY_INDEX, "entry"),
    "expanded_meals": get_id(ID.EXPANDED_MEALS, "entry"),
    "morning_weight": get_id(ID.MORNING_WEIGHT, "entry"),
    "evening_weight": get_id(ID.EVENING_WEIGHT, "entry"),
    "daily_macros_display": get_id(ID.DAILY_MACROS_DISPLAY, "entry"),
    "calories_remaining_display": get_id(ID.CALORIES_REMAINING_DISPLAY, "entry"),
    "calorie_status": get_id(ID.CALORIE_STATUS, "entry"),
    "targets_modal": get_id(ID.TARGETS_MODAL, "entry"),
    "open_targets_modal": get_id(ID.OPEN_TARGETS_MODAL, "entry"),
    "close_targets_modal": get_id(ID.CLOSE_TARGETS_MODAL, "entry"),
    "save_targets": get_id(ID.SAVE_TARGETS, "entry"),
    "copy_previous_targets": get_id(ID.COPY_PREVIOUS_TARGETS, "entry"),
}

MEAL_PLANNER_IDS = {
    "food_selector": get_id(ID.FOOD_SELECTOR, "meal-planner"),
    "meal_name": get_id(ID.MEAL_NAME, "meal-planner"),
    "ingredient_amount": get_id(ID.INGREDIENT_AMOUNT, "meal-planner"),
    "amount_unit": get_id(ID.AMOUNT_UNIT, "meal-planner"),
    "add_ingredient_btn": get_id(ID.ADD_INGREDIENT_BTN, "meal-planner"),
    "clear_composer_btn": get_id(ID.CLEAR_COMPOSER_BTN, "meal-planner"),
    "save_meal_btn": get_id(ID.SAVE_MEAL_BTN, "meal-planner"),
    "composer_ingredients": get_id(ID.COMPOSER_INGREDIENTS, "meal-planner"),
    "ingredients_list": get_id(ID.INGREDIENTS_LIST, "meal-planner"),
    "meal_totals": get_id(ID.MEAL_TOTALS, "meal-planner"),
    "meals_list": get_id(ID.MEALS_LIST, "meal-planner"),
    "current_meal_id": get_id(ID.CURRENT_MEAL_ID, "meal-planner"),
    "meal_planner_container": get_id(ID.MEAL_PLANNER_CONTAINER, "meal-planner"),
}

FOODS_IDS = {
    "form_row_1": get_id(ID.FORM_ROW_1, ""),
    "form_row_2": get_id(ID.FORM_ROW_2, ""),
    "form_grid": get_id(ID.FORM_GRID, ""),
    "form_actions": get_id(ID.FORM_ACTIONS, ""),
    "food_name": get_id(ID.FOOD_NAME, ""),
    "unit_type": get_id(ID.UNIT_TYPE, ""),
    "serving_size": get_id(ID.SERVING_SIZE, ""),
    "save_food_btn": get_id(ID.SAVE_FOOD_BTN, ""),
    "clear_food_form_btn": get_id(ID.CLEAR_FOOD_FORM_BTN, ""),
    "food_list": get_id(ID.FOOD_LIST, ""),
    "edit_food_id": get_id(ID.EDIT_FOOD_ID, ""),
    "food_editor": get_id(ID.FOOD_EDITOR, ""),
    "food_save_message": get_id(ID.FOOD_SAVE_MESSAGE, ""),
    "search_food": get_id(ID.SEARCH_FOOD, ""),
    "new_food_btn": get_id(ID.NEW_FOOD_BTN, ""),
}

HOME_IDS = {
    "data_store": get_id(ID.DATA_STORE, ""),
    "refresh_button": get_id(ID.REFRESH_BUTTON, ""),
    "date_range_picker": get_id(ID.DATE_RANGE_PICKER, ""),
    "calories_weight_plot": get_id(ID.CALORIES_WEIGHT_PLOT, ""),
    "macro_breakdown_plot": get_id(ID.MACRO_BREAKDOWN_PLOT, ""),
    "nutrients_rdi_plot": get_id(ID.NUTRIENTS_RDI_PLOT, ""),
    "avg_calories": get_id(ID.AVG_CALORIES, ""),
    "avg_weight": get_id(ID.AVG_WEIGHT, ""),
    "avg_protein": get_id(ID.AVG_PROTEIN, ""),
    "data_points": get_id(ID.DATA_POINTS, ""),
    "data_source_info": get_id(ID.DATA_SOURCE_INFO, ""),
    "loading_output": get_id(ID.LOADING_OUTPUT, ""),
    "loading_overlay": get_id(ID.LOADING_OVERLAY, ""),
}
