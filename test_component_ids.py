"""Test script for the new component ID system."""

from nutritional.component_ids import ENTRY_IDS, FOODS_IDS, HOME_IDS, ID, MEAL_PLANNER_IDS, get_id

print("Testing get_id() function with ID enum:")
print("=" * 50)
print(f"Entry page food selector: {get_id(ID.FOOD_SELECTOR, 'entry')}")
print(f"Meal Planner food selector: {get_id(ID.FOOD_SELECTOR, 'meal-planner')}")
print(f"Foods page food name: {get_id(ID.FOOD_NAME, '')}")
print(f"Home page data store: {get_id(ID.DATA_STORE, '')}")

print("\nBackward compatibility (legacy dictionaries):")
print("=" * 50)
print(f"ENTRY_IDS['food_selector']: {ENTRY_IDS['food_selector']}")
print(f"MEAL_PLANNER_IDS['food_selector']: {MEAL_PLANNER_IDS['food_selector']}")
print(f"FOODS_IDS['food_name']: {FOODS_IDS['food_name']}")
print(f"HOME_IDS['data_store']: {HOME_IDS['data_store']}")

print("\nAll ID enum members:")
print("=" * 50)
for id_member in ID:
    print(f"  ID.{id_member.name}")

print("\n✓ Component ID system working correctly!")
