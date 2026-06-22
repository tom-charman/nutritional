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
  copyDayEntriesAction,
  editEntryAmountAction,
  editMealPortionsAction,
  quickAddEntryAction,
  removeEntryAction,
  swapFoodEntryAction,
  updateWeightAction,
} from "@/app/actions/entry";
import { setWeeklyPanelHiddenAction } from "@/app/actions/settings";
import { applyPlanItemAction } from "@/app/actions/planner";
import {
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  ZERO_NUTRIENTS,
  type Nutrients,
} from "@/lib/constants";
import { calculateNutrients, dailyTotals } from "@/lib/domain/nutrients";
import { calorieStatus } from "@/lib/domain/targets";
import {
  type DailyData,
  type DailyTargets,
  type FoodItem,
  type Meal,
  type PlanItem,
  type UserSettings,
} from "@/lib/domain/types";
import type { WeeklyReadout } from "@/lib/domain/summary/weekly";
import Combobox from "@/components/ui/Combobox";
import EntriesList from "./EntriesList";
import MacroProgressBars from "./MacroProgressBars";
import NutrientPreview from "./NutrientPreview";
import TargetsModal from "./TargetsModal";
import WeeklySummaryCard from "@/components/summary/WeeklySummaryCard";
import GoalModal from "@/components/summary/GoalModal";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";

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
  recentFoods,
  initialDay,
  targets,
  weeklyReadout,
  userSettings,
  planSuggestions,
}: {
  date: string;
  today: string;
  foods: FoodItem[];
  meals: Meal[];
  recentFoods: FoodItem[];
  initialDay: DailyData;
  targets: DailyTargets;
  weeklyReadout: WeeklyReadout;
  userSettings: UserSettings;
  planSuggestions: PlanItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- optimistic date (arrows step instantly; server data follows) ---
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const shownDate = pendingDate ?? date;
  useEffect(() => {
    setPendingDate(null); // server caught up
    setDismissed(new Set()); // a new day's suggestions are fresh
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
  // Quick-add: holds the typed name when logging food not in the DB.
  const [quickAddName, setQuickAddName] = useState<string | null>(null);
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
  const [goalModalOpen, setGoalModalOpen] = useState(false);

  const pushToast = useCallback((text: string, ok: boolean) => {
    if (!text) return;
    toastId.current += 1;
    setToasts((t) => [...t, { id: toastId.current, kind: ok ? "success" : "error", text }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  // --- plan "ghost" suggestions: one-click add a planned item into the log ---
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const handleAddSuggestion = useCallback(
    (item: PlanItem) => {
      startTransition(async () => {
        const res = await applyPlanItemAction(item.id);
        pushToast(res.message, res.ok);
        router.refresh();
      });
    },
    [pushToast, router],
  );

  // --- selector options: foods + meals combined (entry.py update_food_options) ---
  // Recently-logged foods are pinned in a "Recent" section atop the list; the
  // rest fall under "All foods". Searching collapses both back to a flat match.
  const foodOption = useCallback(
    (f: FoodItem, section: string) => ({
      key: `food:${f.id}`,
      label:
        f.unit_type === "per_100g"
          ? `${f.name} (per 100g)`
          : `${f.name} (per item, ~${f.serving_size_g}g)`,
      section,
    }),
    [],
  );

  const options = useMemo(() => {
    const recentIds = new Set(recentFoods.map((f) => f.id));
    const recentOpts = recentFoods.map((f) => foodOption(f, "Recent"));
    const restOpts = foods
      .filter((f) => !recentIds.has(f.id))
      .map((f) => foodOption(f, "All foods"));
    const mealOpts = meals.map((m) => ({
      key: `meal:${m.id}`,
      label: `${m.name} (meal)`,
      section: "All foods",
    }));
    return [...recentOpts, ...restOpts, ...mealOpts];
  }, [foods, meals, recentFoods, foodOption]);

  // Foods-only, flat (no sections) — for the inline "swap food" selector.
  const foodOptions = useMemo(
    () => foods.map((f) => foodOption(f, "")),
    [foods, foodOption],
  );

  const handleSelect = useCallback(
    (key: string) => {
      setAmount("");
      setQuickAddName(null); // leaving quick-add: a real selection takes over
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

  function handleQuickAdd(name: string, nutrients: Partial<Nutrients>) {
    if (isPending) return;
    startTransition(async () => {
      const result = await quickAddEntryAction(date, { name, nutrients });
      refreshAfter(result);
      if (result.ok) {
        setQuickAddName(null);
        focusSearchAfterRender.current = true;
      }
    });
  }

  const handleCopyYesterday = () => {
    if (isPending) return;
    startTransition(async () => refreshAfter(await copyDayEntriesAction(date)));
  };

  const handleSwapFood = (entryId: string, newFoodId: string) =>
    startTransition(async () => refreshAfter(await swapFoodEntryAction(date, entryId, newFoodId)));

  const handleEditAmount = (entryId: string, newAmount: number) =>
    startTransition(async () => refreshAfter(await editEntryAmountAction(date, entryId, newAmount)));

  const handleEditPortions = (mealLogId: string, newPortions: number) =>
    startTransition(async () => refreshAfter(await editMealPortionsAction(date, mealLogId, newPortions)));

  const handleRemoveFood = (entryId: string) =>
    startTransition(async () => refreshAfter(await removeEntryAction(date, { entryId })));

  const handleRemoveMeal = (mealLogId: string) =>
    startTransition(async () => refreshAfter(await removeEntryAction(date, { mealLogId })));

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
          {/* figures live in the calories card + pigment channels below */}
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
              setQuickAddName(null);
            }}
            onQueryChange={() => {
              // typing a new search abandons any in-progress quick-add
              if (quickAddName !== null) setQuickAddName(null);
            }}
            onQuickAdd={(q) => {
              setSelection(null);
              setAmount("");
              setQuickAddName(q);
            }}
          />

          {amountConfig && quickAddName === null && (
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

          {quickAddName !== null && (
            <QuickAddForm
              initialName={quickAddName}
              pending={isPending}
              onSubmit={handleQuickAdd}
              onCancel={() => setQuickAddName(null)}
            />
          )}

          {preview && (
            <NutrientPreview nutrients={preview} targets={targets} dayTotals={totals} />
          )}

          {/* Planned-for-today items live with the add controls (they're one-click
              adds), above the day's log — not stranded beneath it. */}
          <GhostSuggestions
            suggestions={planSuggestions.filter((s) => !dismissed.has(s.id))}
            pending={isPending}
            onAdd={handleAddSuggestion}
            onDismiss={(id) => setDismissed((d) => new Set(d).add(id))}
          />

          <div className="intake-header" style={{ marginTop: 16 }}>
            <div className="section-label">
              {shownDate === today ? "Today's Intake" : `Intake — ${formatHeaderDate(shownDate)}`}
            </div>
            <button
              type="button"
              className="copy-day-btn"
              data-testid="copy-yesterday"
              title="Copy the previous day's entries into this day"
              onClick={handleCopyYesterday}
              disabled={isPending}
            >
              Copy yesterday
            </button>
          </div>
          <EntriesList
            entries={initialDay.entries}
            foodOptions={foodOptions}
            onEditAmount={handleEditAmount}
            onEditPortions={handleEditPortions}
            onSwapFood={handleSwapFood}
            onRemoveFood={handleRemoveFood}
            onRemoveMeal={handleRemoveMeal}
          />
        </div>

        {/* Column 2: Daily Summary */}
        <div className="mise-summary-column">
          <div className="section-label">Daily Summary</div>
          <div className="calories-remaining-card">
            <div className="calories-remaining-label">
              {calStatus.status === "over" ? "Calories Over" : "Calories Remaining"}
            </div>
            <div className={`calories-remaining-number${statusClass}`}>
              {calStatus.status === "over" ? calStatus.over : calStatus.remaining}
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

          {userSettings.hide_weekly_panel ? (
            <button
              type="button"
              className="weekly-show-affordance"
              onClick={() =>
                startTransition(async () => {
                  await setWeeklyPanelHiddenAction(false);
                  router.refresh();
                })
              }
            >
              Show weekly trend
            </button>
          ) : (
            <WeeklySummaryCard
              readout={weeklyReadout}
              hasGoal={userSettings.goal_weight_kg !== null}
              onSetGoal={() => setGoalModalOpen(true)}
              onHide={() =>
                startTransition(async () => {
                  await setWeeklyPanelHiddenAction(true);
                  router.refresh();
                })
              }
            />
          )}
        </div>
      </div>

      {goalModalOpen && (
        <GoalModal
          initial={userSettings}
          currentTrendWeight={weeklyReadout.trend_weight_kg}
          today={today}
          onClose={() => setGoalModalOpen(false)}
          onSaved={(msg, ok) => {
            pushToast(msg, ok);
            if (ok) router.refresh();
          }}
        />
      )}

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

/**
 * Inline "quick add" for food not in the database — name + calories (required),
 * macros optional. Reuses the normal save+log path; the food is kept for reuse.
 */
function QuickAddForm({
  initialName,
  pending,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  pending: boolean;
  onSubmit: (name: string, nutrients: Partial<Nutrients>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [vals, setVals] = useState<Partial<Record<keyof Nutrients, string>>>({});
  const setVal = (k: keyof Nutrients, v: string) =>
    setVals((s) => ({ ...s, [k]: v }));

  const numOrUndef = (s?: string) => {
    const n = Number(s);
    return s != null && s.trim() !== "" && Number.isFinite(n) ? n : undefined;
  };
  const submit = () => {
    const nutrients: Partial<Nutrients> = {};
    for (const k of NUTRIENT_KEYS) {
      const v = numOrUndef(vals[k]);
      if (v !== undefined) nutrients[k] = v;
    }
    onSubmit(name.trim(), nutrients);
  };

  return (
    <div className="compact-input quick-add-form">
      <label className="form-label-sm">Quick add (not in your foods)</label>
      <p className="quick-add-intro">
        Enter the totals for the portion you&apos;re logging — not per 100&nbsp;g.
      </p>
      <input
        className="form-control"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="editor-grid" style={{ marginTop: 8 }}>
        {NUTRIENT_KEYS.map((k) => (
          <div key={k} className="compact-input">
            <label className="form-label-sm">
              {NUTRIENT_LABELS[k]}
              {k === "energy_kcal" ? <span className="required-mark"> *</span> : ""}
            </label>
            <input
              className="form-control"
              type="number"
              min={0}
              value={vals[k] ?? ""}
              autoFocus={k === "energy_kcal"}
              onChange={(e) => setVal(k, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </div>
        ))}
      </div>
      <p className="field-hint quick-add-hint">
        <span className="required-mark">*</span> Calories required. Blank fields are
        recorded as 0. Saved to your foods for reuse.
      </p>
      <div className="input-group">
        <button className="btn-primary" onClick={submit} disabled={pending}>
          Add to day
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ghostAmount(item: PlanItem): string {
  const r = item.ref;
  if (r.kind === "meal") return `${r.portions} portion${r.portions === 1 ? "" : "s"}`;
  if (r.weight_g !== null) return `${r.weight_g} g`;
  return `× ${r.quantity ?? 1}`;
}

/**
 * Planned-for-this-day items, shown faint beneath the logged rows. One click on
 * the + inks a suggestion into the real log; × dismisses it for the day (the plan
 * is untouched). Renders NOTHING when there's no plan — the fast-logging path and
 * a no-plan user's screen stay exactly as they were.
 */
function GhostSuggestions({
  suggestions,
  pending,
  onAdd,
  onDismiss,
}: {
  suggestions: PlanItem[];
  pending: boolean;
  onAdd: (item: PlanItem) => void;
  onDismiss: (id: string) => void;
}) {
  if (suggestions.length === 0) return null;
  // Flat list (slots were removed), meals first then foods, each A→Z by name —
  // the same stable order the planner uses, so the suggestions read consistently.
  const items = [...suggestions].sort((a, b) => {
    const ak = a.ref.kind === "meal" ? 0 : 1;
    const bk = b.ref.kind === "meal" ? 0 : 1;
    if (ak !== bk) return ak - bk;
    const an = (a.ref.kind === "meal" ? a.ref.meal_name : a.ref.food_name).toLowerCase();
    const bn = (b.ref.kind === "meal" ? b.ref.meal_name : b.ref.food_name).toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : a.id < b.id ? -1 : 1;
  });
  return (
    <div className="ghost-suggestions" data-testid="ghost-suggestions">
      <div className="ghost-suggestions-label">From your plan</div>
      <div className="ghost-slot">
        {items.map((item) => {
          const name = item.ref.kind === "meal" ? item.ref.meal_name : item.ref.food_name;
          return (
            <div key={item.id} className="ghost-row" data-testid="ghost-row">
              <button
                type="button"
                className="ghost-add"
                aria-label={`Add ${name} to the log`}
                title={`Add ${name}`}
                disabled={pending}
                onClick={() => onAdd(item)}
              >
                +
              </button>
              <span className="ghost-name" title={name}>
                {name}
              </span>
              <span className="ghost-amount">{ghostAmount(item)}</span>
              <span className="ghost-kcal">{Math.round(item.nutrients.energy_kcal)} kcal</span>
              <button
                type="button"
                className="ghost-dismiss"
                aria-label={`Dismiss ${name}`}
                title="Not eating this — hide for today"
                onClick={() => onDismiss(item.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
