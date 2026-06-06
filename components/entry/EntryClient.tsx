"use client";

/**
 * Daily Entry page — port of pages/entry.py "mise-en-place" 3-column layout:
 *  Col 1: food/meal selector + amount + live preview + daily log
 *  Col 2: calories-remaining card + macro progress bars
 *  Col 3: morning/evening weight inputs
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addFoodEntryAction,
  addMealEntryAction,
  editEntryAmountAction,
  removeEntryAction,
  updateWeightAction,
} from "@/app/actions/entry";
import { ZERO_NUTRIENTS } from "@/lib/constants";
import { calculateNutrients, dailyTotals } from "@/lib/domain/nutrients";
import { calorieStatus } from "@/lib/domain/targets";
import type { DailyData, DailyTargets, FoodItem, Meal } from "@/lib/domain/types";
import Combobox from "@/components/ui/Combobox";
import EntriesList from "./EntriesList";
import MacroProgressBars from "./MacroProgressBars";
import NutrientPreview from "./NutrientPreview";
import TargetsModal from "./TargetsModal";
import ToastContainer, { type ToastMessage } from "./Toast";

type Selection =
  | { kind: "food"; food: FoodItem }
  | { kind: "meal"; meal: Meal }
  | null;

function shiftDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function formatHeaderDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${weekdays[d.getUTCDay()]}, ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export default function EntryClient({
  date,
  today,
  foods,
  meals,
  initialDay,
  targets,
}: {
  date: string;
  today: string;
  foods: FoodItem[];
  meals: Meal[];
  initialDay: DailyData;
  targets: DailyTargets;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- optimistic date (arrows step instantly; server data follows) ---
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const shownDate = pendingDate ?? date;
  useEffect(() => {
    setPendingDate(null); // server caught up
  }, [date]);
  const navigateToDate = useCallback(
    (d: string) => {
      setPendingDate(d);
      router.push(`/entry?date=${d}`);
    },
    [router],
  );

  // --- selector state ---
  const [selection, setSelection] = useState<Selection>(null);
  const [amount, setAmount] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusSearchAfterRender = useRef(false);
  useEffect(() => {
    // The input only exists once the selection chip is gone — focus then.
    if (selection === null && focusSearchAfterRender.current) {
      focusSearchAfterRender.current = false;
      searchRef.current?.focus();
    }
  });

  // --- toasts / modal ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastId = useRef(0);
  const [modalOpen, setModalOpen] = useState(false);

  const pushToast = useCallback((text: string, ok: boolean) => {
    if (!text) return;
    toastId.current += 1;
    setToasts((t) => [...t, { id: toastId.current, kind: ok ? "success" : "error", text }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // --- selector options: foods + meals combined (entry.py update_food_options) ---
  const options = useMemo(() => {
    const foodOpts = foods.map((f) => ({
      key: `food:${f.id}`,
      label:
        f.unit_type === "per_100g"
          ? `${f.name} (per 100g)`
          : `${f.name} (per item, ~${f.serving_size_g}g)`,
    }));
    const mealOpts = meals.map((m) => ({
      key: `meal:${m.id}`,
      label: `${m.name} (meal)`,
    }));
    return [...foodOpts, ...mealOpts];
  }, [foods, meals]);

  const handleSelect = useCallback(
    (key: string) => {
      setAmount("");
      if (key.startsWith("food:")) {
        const food = foods.find((f) => f.id === key.slice(5));
        if (food) setSelection({ kind: "food", food });
      } else {
        const meal = meals.find((m) => m.id === key.slice(5));
        if (meal) setSelection({ kind: "meal", meal });
      }
    },
    [foods, meals],
  );

  // --- live nutrient preview (shared pure domain code) ---
  const preview = useMemo(() => {
    const n = Number(amount);
    if (!selection || !Number.isFinite(n) || n <= 0) return null;
    if (selection.kind === "food") {
      const isPerItem = selection.food.unit_type === "per_item";
      try {
        return calculateNutrients(selection.food, {
          weight_g: isPerItem ? null : n,
          quantity: isPerItem ? n : null,
        });
      } catch {
        return null;
      }
    }
    // meal: scale template ingredient nutrients by portions
    const totals = { ...ZERO_NUTRIENTS };
    for (const ing of selection.meal.ingredients) {
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[key] += ing.nutrients[key] * n;
      }
    }
    return totals;
  }, [selection, amount]);

  // --- totals & summary ---
  const totals = dailyTotals(initialDay.entries) ?? ZERO_NUTRIENTS;
  const calStatus = calorieStatus(totals.energy_kcal, targets.values.energy_kcal);
  const statusClass =
    calStatus.status === "over"
      ? " target-exceeded"
      : calStatus.status === "near"
        ? " target-met"
        : "";

  // --- handlers ---
  function refreshAfter(result: { ok: boolean; message: string }) {
    pushToast(result.message, result.ok);
    if (result.ok) router.refresh();
  }

  function handleAdd() {
    if (isPending) return; // guard against rapid double-submit
    const n = Number(amount);
    if (!selection) return pushToast("Please select a food or meal", false);
    if (!Number.isFinite(n) || n <= 0) return pushToast("Please enter an amount", false);
    startTransition(async () => {
      const result =
        selection.kind === "food"
          ? await addFoodEntryAction(date, selection.food.id, n)
          : await addMealEntryAction(date, selection.meal.id, n);
      refreshAfter(result);
      if (result.ok) {
        // Real days have a dozen entries — put the cursor back where the
        // next one starts (focused once the input re-renders).
        focusSearchAfterRender.current = true;
        setSelection(null);
        setAmount("");
      }
    });
  }

  const handleEditAmount = (entryId: string, newAmount: number) =>
    startTransition(async () => refreshAfter(await editEntryAmountAction(date, entryId, newAmount)));

  const handleRemoveFood = (entryId: string) =>
    startTransition(async () => refreshAfter(await removeEntryAction(date, { entryId })));

  const handleRemoveMeal = (mealId: string) =>
    startTransition(async () => refreshAfter(await removeEntryAction(date, { mealId })));

  // Last persisted weights — lets blur be a no-op when nothing changed
  // (e.g. tabbing through an empty field must not fire a "clear").
  const savedWeights = useRef({
    morning: initialDay.measurements.morning_weight_kg,
    evening: initialDay.measurements.evening_weight_kg,
  });
  useEffect(() => {
    savedWeights.current = {
      morning: initialDay.measurements.morning_weight_kg,
      evening: initialDay.measurements.evening_weight_kg,
    };
  }, [initialDay]);

  const handleWeightBlur = (which: "morning" | "evening") =>
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value.trim();
      const v = raw === "" ? null : Number(raw);
      const normalized = v !== null && v > 0 ? v : null;
      const prev = savedWeights.current[which];
      if (prev === normalized) return; // unchanged — no write, no toast
      savedWeights.current[which] = normalized; // optimistic: rapid edits compare correctly
      startTransition(async () => {
        const result = await updateWeightAction(date, which, v);
        if (!result.ok) {
          savedWeights.current[which] = prev;
          pushToast(result.message, false);
        } else {
          router.refresh();
        }
      });
    };

  // amount input config per selection type (entry.py conditional amount input)
  const amountConfig =
    selection === null
      ? null
      : selection.kind === "meal"
        ? { label: "Portions", placeholder: "1.0", min: 0.1, step: 0.1 }
        : selection.food.unit_type === "per_100g"
          ? { label: "Weight (g)", placeholder: "e.g. 150", min: 0, step: 1 }
          : {
              label: `Quantity (1 item ≈ ${selection.food.serving_size_g}g)`,
              placeholder: "e.g. 1.5",
              min: 0,
              step: 0.5,
            };

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Header: date picker + compact summary */}
      <div className="daily-header">
        <div className="daily-header-left">
          <h1>{formatHeaderDate(shownDate)}</h1>
          <div className="date-stepper">
            <button
              type="button"
              className="icon-button"
              data-testid="prev-day"
              title="Previous day"
              onClick={() => navigateToDate(shiftDate(shownDate, -1))}
            >
              ‹
            </button>
            <input
              type="date"
              data-testid="date-picker"
              value={shownDate}
              max={today}
              style={{ width: 170 }}
              onChange={(e) => {
                if (e.target.value) navigateToDate(e.target.value);
              }}
            />
            <button
              type="button"
              className="icon-button"
              data-testid="next-day"
              title="Next day"
              disabled={shownDate >= today}
              onClick={() => navigateToDate(shiftDate(shownDate, 1))}
            >
              ›
            </button>
          </div>
        </div>
        <div className="daily-summary-bar">
          <span className="summary-item">
            <strong>
              {Math.round(totals.energy_kcal)} / {Math.round(targets.values.energy_kcal)} kcal
            </strong>
          </span>
          <span className="summary-separator">·</span>
          <span className="summary-item">{totals.fat_g.toFixed(1)} g Fat</span>
          <span className="summary-separator">·</span>
          <span className="summary-item">{totals.carbohydrates_g.toFixed(1)} g Carbs</span>
          <span className="summary-separator">·</span>
          <span className="summary-item">{totals.protein_g.toFixed(1)} g Protein</span>
          <button className="btn-secondary btn-sm" onClick={() => setModalOpen(true)}>
            Edit Targets
          </button>
        </div>
      </div>

      <div className="mise-en-place-container">
        {/* Column 1: Food & Meals */}
        <div className="mise-ingredients-column">
          <div className="section-label">Food &amp; Meals</div>

          <Combobox
            options={options}
            placeholder="Search foods and meals..."
            testId="food-search"
            inputRef={searchRef}
            selectedLabel={
              selection === null
                ? null
                : selection.kind === "food"
                  ? selection.food.name
                  : `${selection.meal.name} (meal)`
            }
            onSelect={handleSelect}
            onClear={() => {
              setSelection(null);
              setAmount("");
            }}
          />

          {amountConfig && (
            <div className="compact-input">
              <label className="form-label-sm">{amountConfig.label}</label>
              <div className="input-group">
                <input
                  type="number"
                  data-testid="amount-input"
                  className="form-control"
                  min={amountConfig.min}
                  step={amountConfig.step}
                  placeholder={amountConfig.placeholder}
                  value={amount}
                  autoFocus
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd();
                  }}
                />
                <button
                  className="btn-primary"
                  data-testid="add-button"
                  onClick={handleAdd}
                  disabled={isPending}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {preview && <NutrientPreview nutrients={preview} />}

          <div className="section-label" style={{ marginTop: 16 }}>
            Today&apos;s Intake
          </div>
          <EntriesList
            entries={initialDay.entries}
            onEditAmount={handleEditAmount}
            onRemoveFood={handleRemoveFood}
            onRemoveMeal={handleRemoveMeal}
          />
        </div>

        {/* Column 2: Daily Summary */}
        <div className="mise-summary-column">
          <div className="section-label">Daily Summary</div>
          <div className="calories-remaining-card">
            <div className="calories-remaining-label">Calories Remaining</div>
            <div className={`calories-remaining-number${statusClass}`}>
              {calStatus.remaining}
            </div>
            <div className="calorie-status-indicator">{calStatus.statusText}</div>
          </div>
          <MacroProgressBars consumed={totals} targets={targets} />
        </div>

        {/* Column 3: Body Measurements */}
        <div className="mise-logbook-column">
          <div className="section-label">Body Measurements</div>
          <div className="weight-entry-card">
            <div className="weight-entry-label">Weight (kg)</div>
            <div className="weight-inputs">
              <div className="weight-input-group">
                <label>Morning</label>
                <input
                  type="number"
                  data-testid="weight-morning"
                  min={0}
                  step={0.1}
                  defaultValue={initialDay.measurements.morning_weight_kg ?? ""}
                  onBlur={handleWeightBlur("morning")}
                />
              </div>
              <div className="weight-input-group">
                <label>Evening</label>
                <input
                  type="number"
                  data-testid="weight-evening"
                  min={0}
                  step={0.1}
                  defaultValue={initialDay.measurements.evening_weight_kg ?? ""}
                  onBlur={handleWeightBlur("evening")}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {modalOpen && (
        <TargetsModal
          date={date}
          initial={targets}
          onClose={() => setModalOpen(false)}
          onSaved={(msg, ok) => {
            pushToast(msg, ok);
            if (ok) router.refresh();
          }}
        />
      )}

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}
