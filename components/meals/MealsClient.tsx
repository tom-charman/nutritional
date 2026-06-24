"use client";

/**
 * Recipe Planner — port of pages/meal_planner.py: 2-column mise-en-place.
 * Left: recipe composer (name, yield mode, food selector, amount, ingredients, totals).
 * Right: saved recipes (click to load for editing, delete link).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMealAction, saveMealAction } from "@/app/actions/meals";
import { type MealYieldMode, type Nutrients } from "@/lib/constants";
import { calculateNutrients, scaleNutrients, sumNutrients } from "@/lib/domain/nutrients";
import type { DailyTargets, FoodItem, Meal, MealIngredient } from "@/lib/domain/types";
import Combobox from "@/components/ui/Combobox";
import EditableAmount from "@/components/ui/EditableAmount";
import NutrientPreview from "@/components/entry/NutrientPreview";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";

const YIELD_OPTIONS: { mode: MealYieldMode; label: string }[] = [
  { mode: "whole", label: "Whole batch" },
  { mode: "by_weight", label: "By weight" },
  { mode: "by_count", label: "By count" },
];

const YIELD_HINT: Record<MealYieldMode, string> = {
  whole: "Eat the whole thing — log it scaled by portions.",
  by_weight: "Cooked as a batch (cake, stew) — weigh the finished dish, then log a weighed portion.",
  by_count: "Makes a number of items (cookies) — log how many you eat.",
};

export default function MealsClient({
  foods,
  initialMeals,
  targets,
}: {
  foods: FoodItem[];
  initialMeals: Meal[];
  targets: DailyTargets;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Saved meals whose full nutrient breakdown is expanded inline.
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());
  const toggleExpanded = useCallback((id: string) => {
    setExpandedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // --- composer state ---
  const [mealId, setMealId] = useState<string | null>(null);
  const [mealName, setMealName] = useState("");
  const [yieldMode, setYieldMode] = useState<MealYieldMode>("whole");
  const [yieldWeight, setYieldWeight] = useState("");
  const [yieldCount, setYieldCount] = useState("");
  const [ingredients, setIngredients] = useState<MealIngredient[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [amount, setAmount] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusSearchAfterRender = useRef(false);
  useEffect(() => {
    // Meals have several ingredients — after adding one, the cursor goes
    // back where the next one starts (same pattern as the daily-entry page).
    if (selectedFood === null && focusSearchAfterRender.current) {
      focusSearchAfterRender.current = false;
      searchRef.current?.focus();
    }
  });

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

  // Per-unit breakdown of the batch, shown live so the cook sees the cooked
  // dish's per-100g / per-item macros as they enter the finished yield.
  const yieldWeightNum = Number(yieldWeight);
  const yieldCountNum = Number(yieldCount);
  const perUnit: { label: string; nutrients: Nutrients } | null =
    !totals
      ? null
      : yieldMode === "by_weight" && yieldWeightNum > 0
        ? { label: "Per 100 g cooked", nutrients: scaleNutrients(totals, 100 / yieldWeightNum) }
        : yieldMode === "by_count" && yieldCountNum > 0
          ? { label: "Per item", nutrients: scaleNutrients(totals, 1 / yieldCountNum) }
          : null;

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
    focusSearchAfterRender.current = true;
    setSelectedFood(null);
    setAmount("");
  }

  /** Inline-edit an ingredient amount (same interaction as the daily log). */
  function editIngredientAmount(index: number, newAmount: number) {
    setIngredients((prev) =>
      prev.map((ing, i) => {
        if (i !== index) return ing;
        const food = foods.find((f) => f.id === ing.food_id);
        if (!food) return ing;
        const isPerItem = food.unit_type === "per_item";
        return {
          ...ing,
          weight_g: isPerItem ? null : newAmount,
          quantity: isPerItem ? newAmount : null,
          nutrients: calculateNutrients(food, {
            weight_g: isPerItem ? null : newAmount,
            quantity: isPerItem ? newAmount : null,
          }),
        };
      }),
    );
  }

  function clearComposer() {
    setMealId(null);
    setMealName("");
    setYieldMode("whole");
    setYieldWeight("");
    setYieldCount("");
    setIngredients([]);
    setSelectedFood(null);
    setAmount("");
  }

  function loadMealForEditing(meal: Meal) {
    setMealId(meal.id);
    setMealName(meal.name);
    setYieldMode(meal.yield_mode);
    setYieldWeight(meal.yield_weight_g != null ? String(meal.yield_weight_g) : "");
    setYieldCount(meal.yield_count != null ? String(meal.yield_count) : "");
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
        {
          yield_mode: yieldMode,
          yield_weight_g: yieldMode === "by_weight" ? Number(yieldWeight) : null,
          yield_count: yieldMode === "by_count" ? Number(yieldCount) : null,
        },
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
        <h1 className="page-title">Recipe Planner</h1>
        <p className="text-muted">
          Create reusable recipes by combining foods with specific amounts.
        </p>
      </div>

      <div className="mise-planner-container">
        {/* Column 1: Recipe Composer */}
        <div className="mise-planner-column">
          <div className="section-label">Recipe Composer</div>

          <input
            type="text"
            data-testid="meal-name"
            placeholder="Recipe name (e.g., Breakfast Smoothie)"
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            style={{ marginBottom: 12 }}
          />

          <div className="yield-mode" style={{ marginBottom: 12 }}>
            <label className="form-label-sm">How is this recipe portioned?</label>
            <div
              className="yield-mode-options"
              role="group"
              data-testid="yield-mode"
              style={{ display: "flex", gap: 6, marginTop: 4 }}
            >
              {YIELD_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  type="button"
                  className={yieldMode === opt.mode ? "btn-primary" : "btn-secondary"}
                  aria-pressed={yieldMode === opt.mode}
                  data-testid={`yield-mode-${opt.mode}`}
                  onClick={() => setYieldMode(opt.mode)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-muted" style={{ marginTop: 4, fontSize: "0.85em" }}>
              {YIELD_HINT[yieldMode]}
            </p>
            {yieldMode === "by_weight" && (
              <div className="compact-input">
                <label className="form-label-sm">Finished weight (g)</label>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  step={1}
                  data-testid="yield-weight"
                  placeholder="e.g. 1200"
                  value={yieldWeight}
                  onChange={(e) => setYieldWeight(e.target.value)}
                />
              </div>
            )}
            {yieldMode === "by_count" && (
              <div className="compact-input">
                <label className="form-label-sm">Yields (number of items)</label>
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  step={1}
                  data-testid="yield-count"
                  placeholder="e.g. 12"
                  value={yieldCount}
                  onChange={(e) => setYieldCount(e.target.value)}
                />
              </div>
            )}
          </div>

          <Combobox
            options={options}
            placeholder="Search for a food..."
            testId="meal-food-search"
            inputRef={searchRef}
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
                    <EditableAmount
                      display={ing.weight_g !== null ? `${ing.weight_g} g` : `× ${ing.quantity}`}
                      value={ing.weight_g ?? ing.quantity ?? 0}
                      onSave={(n) => editIngredientAmount(i, n)}
                    />
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

          {totals && totals.energy_kcal > 0 && (
            <>
              <div className="form-label-sm" style={{ marginTop: 12 }}>
                {yieldMode === "whole" ? "Per batch" : "Whole batch"}
              </div>
              <NutrientPreview nutrients={totals} targets={targets} />
              {perUnit && (
                <>
                  <div className="form-label-sm" style={{ marginTop: 12 }}>
                    {perUnit.label}
                  </div>
                  <NutrientPreview nutrients={perUnit.nutrients} targets={targets} />
                </>
              )}
            </>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button
              className="btn-primary"
              data-testid="save-meal"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "Saving..." : mealId ? "Update Recipe" : "Save Recipe"}
            </button>
            <button className="btn-secondary" onClick={clearComposer}>
              Clear
            </button>
          </div>
        </div>

        {/* Column 2: Saved Recipes */}
        <div className="mise-planner-column">
          <div className="section-label">Saved Recipes</div>
          <div className="saved-meals-list">
            {initialMeals.length === 0 ? (
              <p className="empty-state-message">
                No recipes saved yet. Create your first recipe using the composer.
              </p>
            ) : (
              initialMeals.map((meal) => {
                const mealTotals = sumNutrients(
                  meal.ingredients.map((i) => i.nutrients),
                );
                const expanded = expandedMeals.has(meal.id);
                return (
                  <div
                    key={meal.id}
                    className={`meal-card${mealId === meal.id ? " editing" : ""}`}
                  >
                    <div
                      className="meal-card-header"
                      role="button"
                      title="Click to edit"
                      onClick={() => loadMealForEditing(meal)}
                    >
                      <span className="meal-card-name">{meal.name}</span>
                      <span className="meal-card-info">
                        {meal.ingredients.length} ingredient
                        {meal.ingredients.length === 1 ? "" : "s"} ·{" "}
                        {Math.round(mealTotals.energy_kcal)} kcal
                        {meal.yield_mode === "by_weight" && meal.yield_weight_g
                          ? ` · ${meal.yield_weight_g} g batch`
                          : meal.yield_mode === "by_count" && meal.yield_count
                            ? ` · makes ${meal.yield_count}`
                            : ""}
                      </span>
                    </div>
                    <div className="meal-card-controls">
                      <button
                        className="meal-card-expand"
                        aria-expanded={expanded}
                        title={expanded ? "Hide nutrients" : "Show nutrients"}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpanded(meal.id);
                        }}
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                      <button
                        className="delete-icon"
                        title="Delete recipe"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(meal);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    {expanded && (
                      <div className="meal-card-nutrients">
                        <NutrientPreview nutrients={mealTotals} targets={targets} />
                      </div>
                    )}
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
