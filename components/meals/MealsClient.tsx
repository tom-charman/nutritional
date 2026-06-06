"use client";

/**
 * Meal Planner — port of pages/meal_planner.py: 2-column mise-en-place.
 * Left: meal composer (name, food selector, amount, ingredients, totals).
 * Right: saved meals (click to load for editing, delete link).
 */
import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMealAction, saveMealAction } from "@/app/actions/meals";
import { ZERO_NUTRIENTS, type Nutrients } from "@/lib/constants";
import { calculateNutrients, sumNutrients } from "@/lib/domain/nutrients";
import type { FoodItem, Meal, MealIngredient } from "@/lib/domain/types";
import Combobox from "@/components/ui/Combobox";
import NutrientPreview from "@/components/entry/NutrientPreview";
import ToastContainer, { type ToastMessage } from "@/components/entry/Toast";

export default function MealsClient({
  foods,
  initialMeals,
}: {
  foods: FoodItem[];
  initialMeals: Meal[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- composer state ---
  const [mealId, setMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState("");
  const [ingredients, setIngredients] = useState<MealIngredient[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [amount, setAmount] = useState("");

  // --- toasts ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const pushToast = useCallback((text: string, ok: boolean) => {
    if (!text) return;
    toastId.current += 1;
    setToasts((t) => [...t, { id: toastId.current, kind: ok ? "success" : "error", text }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const options = useMemo(
    () =>
      foods.map((f) => ({
        key: f.id,
        label:
          f.unit_type === "per_100g"
            ? `${f.name} (per 100g)`
            : `${f.name} (per ${f.serving_size_g}g serving)`,
      })),
    [foods],
  );

  const totals: Nutrients | null =
    ingredients.length > 0 ? sumNutrients(ingredients.map((i) => i.nutrients)) : null;

  function addIngredient() {
    const n = Number(amount);
    if (!selectedFood) return pushToast("Please select a food", false);
    if (!Number.isFinite(n) || n <= 0) return pushToast("Please enter an amount", false);
    const isPerItem = selectedFood.unit_type === "per_item";
    const nutrients = calculateNutrients(selectedFood, {
      weight_g: isPerItem ? null : n,
      quantity: isPerItem ? n : null,
    });
    setIngredients((prev) => [
      ...prev,
      {
        food_id: selectedFood.id,
        food_name: selectedFood.name,
        weight_g: isPerItem ? null : n,
        quantity: isPerItem ? n : null,
        nutrients,
      },
    ]);
    setSelectedFood(null);
    setAmount("");
  }

  function clearComposer() {
    setMealId(null);
    setMealName("");
    setIngredients([]);
    setSelectedFood(null);
    setAmount("");
  }

  function loadMealForEditing(meal: Meal) {
    setMealId(meal.id);
    setMealName(meal.name);
    setIngredients(meal.ingredients);
    setSelectedFood(null);
    setAmount("");
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMealAction(
        mealId,
        mealName,
        ingredients.map((ing) => ({
          food_id: ing.food_id,
          weight_g: ing.weight_g,
          quantity: ing.quantity,
        })),
      );
      pushToast(result.message, result.ok);
      if (result.ok) {
        clearComposer();
        router.refresh();
      }
    });
  }

  function handleDelete(meal: Meal) {
    startTransition(async () => {
      const result = await deleteMealAction(meal.id);
      pushToast(result.message, result.ok);
      if (result.ok) {
        if (mealId === meal.id) clearComposer();
        router.refresh();
      }
    });
  }

  const amountConfig =
    selectedFood === null
      ? null
      : selectedFood.unit_type === "per_100g"
        ? { label: "Weight (g)", placeholder: "Weight in grams", step: 1 }
        : {
            label: `Servings (${selectedFood.serving_size_g}g each)`,
            placeholder: "e.g. 1.5",
            step: 0.5,
          };

  return (
    <div className="meal-planner-container">
      <div className="page-header">
        <h1 className="page-title">Meal Planner</h1>
        <p className="text-muted">
          Create reusable meal templates by combining foods with specific amounts.
        </p>
      </div>

      <div className="mise-planner-container">
        {/* Column 1: Meal Composer */}
        <div className="mise-planner-column">
          <div className="section-label">Meal Composer</div>

          <input
            type="text"
            data-testid="meal-name"
            placeholder="Meal name (e.g., Breakfast Smoothie)"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <Combobox
            options={options}
            placeholder="Search for a food..."
            testId="meal-food-search"
            selectedLabel={selectedFood?.name ?? null}
            onSelect={(key) => {
              const food = foods.find((f) => f.id === key);
              if (food) {
                setSelectedFood(food);
                setAmount("");
              }
            }}
            onClear={() => {
              setSelectedFood(null);
              setAmount("");
            }}
          />

          {amountConfig && (
            <div className="compact-input" style={{ marginTop: 8 }}>
              <label className="form-label-sm">{amountConfig.label}</label>
              <div className="input-group">
                <input
                  type="number"
                  data-testid="ingredient-amount"
                  className="form-control"
                  min={0}
                  step={amountConfig.step}
                  placeholder={amountConfig.placeholder}
                  value={amount}
                  autoFocus
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addIngredient();
                  }}
                />
                <button
                  className="btn-primary"
                  data-testid="add-ingredient"
                  onClick={addIngredient}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {ingredients.length > 0 && (
            <div className="ingredients-list" data-testid="composer-ingredients">
              {ingredients.map((ing, i) => (
                <div key={`${ing.food_id}-${i}`} className="ingredient-item">
                  <div className="ingredient-item-header">
                    <span className="ingredient-name">{ing.food_name}</span>
                    <span className="ingredient-weight">
                      {ing.weight_g !== null ? `${ing.weight_g} g` : `× ${ing.quantity}`}
                    </span>
                  </div>
                  <span className="ingredient-calories">
                    {Math.round(ing.nutrients.energy_kcal)} kcal
                  </span>
                  <button
                    className="delete-icon"
                    title="Remove ingredient"
                    onClick={() => setIngredients((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {totals && totals.energy_kcal > 0 && <NutrientPreview nutrients={totals} />}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              className="btn-success"
              data-testid="save-meal"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "Saving..." : mealId ? "Update Meal" : "Save Meal"}
            </button>
            <button className="btn-secondary" onClick={clearComposer}>
              Clear
            </button>
          </div>
        </div>

        {/* Column 2: Saved Meals */}
        <div className="mise-planner-column">
          <div className="section-label">Saved Meals</div>
          <div className="saved-meals-list">
            {initialMeals.length === 0 ? (
              <p className="empty-state-message">
                No meals saved yet. Create your first meal using the composer.
              </p>
            ) : (
              initialMeals.map((meal) => {
                const mealTotals = sumNutrients(
                  meal.ingredients.map((i) => i.nutrients),
                );
                return (
                  <div
                    key={meal.id}
                    className={`meal-card${mealId === meal.id ? " editing" : ""}`}
                  >
                    <div
                      className="meal-card-header"
                      role="button"
                      onClick={() => loadMealForEditing(meal)}
                    >
                      <span className="meal-card-name">{meal.name}</span>
                      <span className="meal-card-info">
                        {meal.ingredients.length} ingredient
                        {meal.ingredients.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span className="meal-card-calories">
                      {Math.round(mealTotals.energy_kcal)} kcal
                    </span>
                    <div className="meal-card-actions">
                      <span
                        className="meal-action-link"
                        role="button"
                        onClick={() => loadMealForEditing(meal)}
                      >
                        Edit
                      </span>
                      <span className="meal-action-separator"> · </span>
                      <span
                        className="meal-action-link meal-action-delete"
                        role="button"
                        onClick={() => handleDelete(meal)}
                      >
                        Delete
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}
