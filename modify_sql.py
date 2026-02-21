import re

# Read the file
with open("backup_data.sql") as f:
    content = f.read()

# Replace food_entries INSERT statements to add meal_id column
# From: INSERT INTO public.food_entries VALUES
#   ('id', 'date', 'time', 'food_id', weight, NULL, calories, ...)
# To:   INSERT INTO public.food_entries VALUES
#   ('id', 'date', 'time', 'food_id', NULL, weight, NULL, calories, ...)


def replace_food_entries(match):
    # Get the matched groups
    prefix = match.group(1)  # Everything up to food_id
    weight = match.group(2)  # The weight value
    # Everything after weight including NULL and nutrients
    rest = match.group(3)

    # Insert NULL for meal_id after food_id, and NULL for quantity after weight
    return f"INSERT INTO public.food_entries VALUES ({prefix}, NULL, {weight}, NULL{rest}"


# Pattern to match food_entries inserts
pattern = (
    r"INSERT INTO public\.food_entries VALUES "
    r"\(([^)]*'[^']*', '[^']*', '[^']*', '[^']*'), ([^,]*), NULL([^)]*)\);"
)

new_content = re.sub(pattern, replace_food_entries, content)

# Write the modified content
with open("backup_data_modified.sql", "w") as f:
    f.write(new_content)

print("Modified SQL file created as backup_data_modified.sql")
