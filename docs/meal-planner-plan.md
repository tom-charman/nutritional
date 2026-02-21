# Meal Planner Feature Plan

## Overview

This document outlines the plan for implementing a new "Meal Planner" screen in the Nutritional app. The meal planner allows users to compose custom meals by selecting foods from the existing food database, specifying amounts, and saving them as reusable meal templates. These meals can then be added to daily entries with adjustable portion sizes, displaying nested ingredients with editable weights.

The feature aligns with the app's brand philosophy as "The Precision Tool" – emphasizing mathematical exactness in nutritional calculations while maintaining an organic, material-honest aesthetic. The interface will prioritize essential functionality with zen minimalism, using white space actively and ensuring digital elements feel tactile and weighted.

Daily entries will support both individual food entries (`FoodEntry`) and meal entries (`MealEntry`), where meals are stored as templates in a separate table and instantiated in daily logs with adjustable portions and weights. **Meal instances in daily entries are independent copies**: editing weights in a daily meal only affects that day's log and does not modify the original meal template.

## Key Features

- **Meal Composition**: Select foods, specify amounts (per 100g or per item), and compile into a meal.
- **Meal Storage**: Save meals with names to a new database table.
- **Daily Entry Integration**: Select saved meals in the daily entry screen, choose portion sizes (default 1).
- **Nested Display**: Meals appear in daily entries with expandable ingredient lists showing calculated weights.
- **Editable Weights**: Individual ingredient weights can be adjusted post-addition for real-world variations. **Note**: Edits only affect the daily entry instance; the original meal template remains unchanged.
- **Meal Viewing**: Provide a way to view and manage existing meals (e.g., via an extension to the meal planner screen or a dedicated meals page).

## Design Harmony with Brand Guidelines

### Visual Identity
- **Background**: Use Kaolin White (#F2F0EB) with subtle texture resembling unglazed porcelain or washi paper.
- **Typography**:
  - Headings: Editorial New for elegant, calligraphic feel.
  - Data/UI Elements: Berkeley Mono for precise, gridded alignment of numbers and inputs.
- **Color Palette**:
  - Primary Actions (Save, Add): Aizome Indigo (#2C3E50).
  - Success (Meal Saved): Wakatake Bamboo (#789440).
  - Warning/Delete: Bengara Rust (#A04000).
  - Data Visualization: Nihonga palette (Indigo, Persimmon, etc.) for ingredient categorization if needed.
- **Material Honesty**: Buttons should have pressable feel with subtle shadows; inputs feel like physical forms. Avoid flat, digital aesthetics.
- **Zen Essentialism**: Minimal UI clutter; use white space (Ma) to create breathing room. No unnecessary animations or gamification elements.

### User Experience
- Interface feels like a precision instrument: Clean, focused, with organic imperfections (e.g., slight texture variations).
- Interactions provide tactile feedback: Hover states with gentle color shifts, button presses with visual depth.
- Data presentation emphasizes accuracy: Numbers align perfectly, calculations are transparent.

## Implementation Steps

### Step 1: Database Schema Update
**Description**: Create a new `meals` table to store meal templates, including meal name, creation date, and a list of ingredients with their amounts. Also, update `food_entries` table to support meal references. **This design enables daily entries to store independent copies of meal ingredients**: the `meal_id` in `food_entries` links ingredients to their originating meal for grouping, but allows weights to be adjusted per daily instance without affecting the template.

**Sub-steps**:
- Design the schema: `meals` table with columns for `id`, `name`, `created_at`, and relational structure for ingredients (e.g., `meal_ingredients` table with `meal_id`, `food_id`, `amount`).
- Add `meal_id: UUID | None` to `food_entries` table to link daily entries to meals.
- Update database migration scripts (e.g., in `database/` folder) to create new tables and alter existing ones.

**Acceptance Criteria**:
- Unit test: Verify table creation via SQLAlchemy models.
- Unit test: Insert a sample meal and retrieve it, confirming all fields (name, ingredients with amounts) are stored correctly.
- Unit test: Ensure foreign key constraints to food database are enforced.
- Unit test: Verify `meal_id` column addition to `food_entries` without data loss.

### Step 2: Backend Models and Storage
**Description**: Extend the data models and storage layer to handle meals, including CRUD operations for meals and integration with existing food storage.

**Sub-steps**:
- Create `Meal` and `MealIngredient` models in `nutritional/data_entry/models.py`. `MealIngredient` should include `food_id`, `amount` (weight_g or quantity), and reference to the food item.
- Create `MealEntry` model for daily entries, with `meal_id`, `portions` (default 1), and `ingredients` as a list of `FoodEntry` with calculated weights based on portions.
- Update `DailyData.entries` to be `list[Union[FoodEntry, MealEntry]]` to support both individual foods and meals.
- Create `MealModel` and `MealIngredientModel` in `nutritional/database/models.py` for the meals table.
- Update `SQLModelStorage` class to include methods like `save_meal`, `load_meals`, `get_meal`.
- Modify `load_daily_entry` and `save_daily_entry` to handle `MealEntry`: when saving, store ingredients as `FoodEntry` with a new `meal_id` field in `FoodEntryModel`; when loading, group `FoodEntry` with `meal_id` into `MealEntry`. **This creates independent copies**: each daily `MealEntry` has its own `FoodEntry` records that can be edited without affecting the meal template or other days.
- Add `meal_id: UUID | None` to `FoodEntryModel` to link ingredients to meals.
- Ensure amounts are handled for per-100g vs. per-item foods in meal composition.

**Acceptance Criteria**:
- Unit test: Create a `Meal` instance with ingredients, save via storage, and load it back identically.
- Unit test: Create a `MealEntry` with portions, save daily data, load back, and verify MealEntry is reconstructed correctly.
- Unit test: Validate amount calculations (e.g., for per-item foods, ensure serving size is used).
- Unit test: Test error handling for invalid food IDs or amounts.
- Unit test: Verify that individual `FoodEntry` and `MealEntry` both contribute correctly to daily totals.

### Step 3: Meal Planner Screen UI
**Description**: Build the new `/meal-planner` page with Dash components for selecting foods, inputting amounts, and saving meals. Include a section to view and manage existing meals.

**Sub-steps**:
- Create `nutritional/pages/meal_planner.py` with layout including food selector, amount inputs, ingredient list, and save functionality.
- Add a section to list existing meals, with options to view details, edit (load into composer), or delete.
- Implement callbacks for adding/removing ingredients, calculating totals, saving, loading meals into composer, and managing meals.
- Style with CSS to match brand: Kaolin background, Sumi Iron text, Indigo buttons.

**Acceptance Criteria**:
- Unit test: Callback for adding ingredient updates the list correctly.
- Unit test: Save callback creates a meal in storage and shows success toast.
- Unit test: Loading an existing meal populates the composer correctly.
- Integration test: Full UI flow (select food, add amount, save) via Dash testing framework.
- Unit test: Viewing meals list displays saved meals accurately.

### Step 4: Daily Entry Integration - Meal Selection
**Description**: Update the daily entry screen to include a meal selector dropdown, allowing users to choose saved meals and specify portions.

**Sub-steps**:
- Add meal dropdown to `entry.py` layout, populated from storage.
- Add portion input (default 1) and "Add Meal" button.
- Implement callback to add selected meal as a `MealEntry` to `persistent-entries`, calculating initial ingredient weights based on portions.

**Acceptance Criteria**:
- Unit test: Dropdown options populated from storage.
- Unit test: Adding a meal creates a `MealEntry` with correct portions and calculated ingredient weights.
- Unit test: Default portion size is 1.
- Unit test: Total nutrients are updated correctly after adding meal.

### Step 5: Nested Ingredient Display in Daily Entry
**Description**: When a meal is added to daily entries, display it as a collapsible item with nested ingredients showing calculated weights.

**Sub-steps**:
- Modify `update_entries_list` callback in `entry.py` to handle `MealEntry` differently, showing meal name as header, with expandable list of ingredients and their weights.
- Calculate ingredient weights based on portions in `MealEntry`.

**Acceptance Criteria**:
- Unit test: `MealEntry` renders with correct structure (meal name, nested ingredients).
- Unit test: Weights are calculated accurately (e.g., ingredient amount * portions).
- Unit test: Collapsible behavior works (expand/collapse via UI interaction).
- Unit test: Individual `FoodEntry` still displays normally.

### Step 6: Editable Ingredient Weights
**Description**: Allow editing of individual ingredient weights within added meals for real-world adjustments. **Important**: These edits only modify the daily entry instance and do not update the canonical meal template in the database.

**Sub-steps**:
- Add edit inputs for each nested ingredient in the `MealEntry` display in `entry.py`.
- Implement callbacks to update weights in the `MealEntry.ingredients` and recalculate totals.
- Ensure changes are saved persistently via `persistent-entries`.

**Acceptance Criteria**:
- Unit test: Editing a weight in `MealEntry` updates the ingredient's weight and recalculates daily totals.
- Unit test: Changes persist across page reloads.
- Unit test: Validation prevents invalid weights (e.g., negative values).
- Unit test: Editing does not affect the original meal template (verify by loading the meal separately).

## Testing Strategy
- **Unit Tests**: Focus on individual functions (e.g., storage methods, calculation logic) using pytest.
- **Integration Tests**: Test full UI flows with Dash's testing tools.
- **Acceptance Tests**: Manual verification of end-to-end scenarios matching criteria.

## Risks and Mitigations
- **Data Integrity**: Ensure meal additions don't corrupt daily totals. Mitigate with comprehensive validation tests.
- **Performance**: Large meal lists could slow UI. Mitigate by lazy-loading ingredients.
- **Brand Consistency**: Regular design reviews to ensure harmony.

## Timeline
- Step 1-2: 1 week (backend focus).
- Step 3: 1 week (UI development).
- Step 4-6: 2 weeks (integration and refinements).
- Testing and polish: 1 week.

This plan ensures the meal planner enhances the app's precision while maintaining its minimalist, tool-like ethos.
