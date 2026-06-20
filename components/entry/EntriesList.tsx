"use client";

/**
 * Daily log entries list — port of entry.py entries display:
 * food rows with click-to-edit amounts, × delete, collapsible meal entries
 * with per-ingredient inline edit.
 */
import { useState } from "react";
import { mealEntryTotals } from "@/lib/domain/nutrients";
import type { DayEntry, FoodEntry } from "@/lib/domain/types";
import EditableAmount from "@/components/ui/EditableAmount";
import Combobox, { type ComboOption } from "@/components/ui/Combobox";

function amountText(e: FoodEntry): string {
  if (e.weight_g !== null) return `${Number.isInteger(e.weight_g) ? e.weight_g : e.weight_g.toFixed(1)} g`;
  return `× ${e.quantity}`;
}

function FoodRow({
  entry,
  foodOptions,
  onEdit,
  onSwap,
  onRemove,
}: {
  entry: FoodEntry;
  foodOptions: ComboOption[];
  onEdit: (entryId: string, amount: number) => void;
  onSwap: (entryId: string, newFoodId: string) => void;
  onRemove: () => void;
}) {
  const [swapping, setSwapping] = useState(false);

  if (swapping) {
    return (
      <div className="ingredient-item" style={{ display: "block" }}>
        <Combobox
          options={foodOptions}
          placeholder={`Swap ${entry.food_name} for…`}
          testId="swap-food-search"
          selectedLabel={null}
          startOpen
          onSelect={(key) => {
            setSwapping(false);
            onSwap(entry.entry_id, key.slice(5)); // strip "food:" prefix
          }}
          onClear={() => setSwapping(false)}
          onCancel={() => setSwapping(false)}
        />
      </div>
    );
  }

  return (
    <div className="ingredient-item">
      <div className="ingredient-item-header">
        <button
          type="button"
          className="ingredient-name ingredient-name-swap"
          title="Swap this food"
          onClick={() => setSwapping(true)}
        >
          {entry.food_name}
        </button>
        <EditableAmount
          display={amountText(entry)}
          value={entry.weight_g ?? entry.quantity ?? 0}
          onSave={(n) => onEdit(entry.entry_id, n)}
          onRemove={onRemove}
        />
      </div>
      <span className="ingredient-calories">
        {Math.round(entry.nutrients.energy_kcal)} kcal
      </span>
      <button className="delete-icon" title="Remove entry" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

export default function EntriesList({
  entries,
  foodOptions,
  onEditAmount,
  onEditPortions,
  onSwapFood,
  onRemoveFood,
  onRemoveMeal,
}: {
  entries: DayEntry[];
  foodOptions: ComboOption[];
  onEditAmount: (entryId: string, amount: number) => void;
  onEditPortions: (mealLogId: string, portions: number) => void;
  onSwapFood: (entryId: string, newFoodId: string) => void;
  onRemoveFood: (entryId: string) => void;
  onRemoveMeal: (mealLogId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (entries.length === 0) {
    return <p className="empty-state-message">No entries yet. Add your first food above.</p>;
  }

  const toggle = (mealId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
  };

  return (
    <div className="ingredients-list">
      {entries.map((e, idx) => {
        if (e.kind === "food") {
          return (
            <FoodRow
              key={e.entry.entry_id}
              entry={e.entry}
              foodOptions={foodOptions}
              onEdit={onEditAmount}
              onSwap={onSwapFood}
              onRemove={() => onRemoveFood(e.entry.entry_id)}
            />
          );
        }
        const meal = e.entry;
        const isOpen = expanded.has(meal.meal_log_id);
        const totals = mealEntryTotals(meal);
        return (
          <div key={meal.meal_log_id} className="ingredient-item" style={{ display: "block" }}>
            <div className="meal-entry-header" onClick={() => toggle(meal.meal_log_id)}>
              <span>
                <span className="meal-entry-name">
                  {isOpen ? "▾" : "▸"} {meal.meal_name}
                </span>{" "}
                <span className="meal-entry-info">
                  {/* portions is click-to-edit; stop the click from toggling the meal */}
                  <span
                    className="meal-entry-portions"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <EditableAmount
                      display={`${meal.portions} portion${meal.portions === 1 ? "" : "s"}`}
                      value={meal.portions}
                      onSave={(n) => onEditPortions(meal.meal_log_id, n)}
                    />
                  </span>{" "}
                  · {meal.ingredients.length} ingredient
                  {meal.ingredients.length === 1 ? "" : "s"}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className="ingredient-calories">
                  {Math.round(totals.energy_kcal)} kcal
                </span>
                <button
                  className="delete-icon"
                  title="Remove meal"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onRemoveMeal(meal.meal_log_id);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
            {isOpen && (
              <div className="meal-entry-ingredients">
                {meal.ingredients.map((ing) => (
                  <FoodRow
                    key={ing.entry_id}
                    entry={ing}
                    foodOptions={foodOptions}
                    onEdit={onEditAmount}
                    onSwap={onSwapFood}
                    onRemove={() => onRemoveFood(ing.entry_id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
