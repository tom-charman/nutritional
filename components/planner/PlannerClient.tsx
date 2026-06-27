"use client";

/**
 * Weekly Planner. A plan is intent, SEPARATE from the log — the planner NEVER
 * writes to the diary. Intentions reach the log only as faint "ghost" suggestions
 * on the daily-entry screen, added with one click there.
 *
 * Adding is one flow, modelled on the daily-entry screen: pick a food/meal from a
 * dropdown (recent foods pinned + search), set the quantity up front, choose which
 * day(s) it lands on, then Add. There are no breakfast/lunch/dinner slots — a day
 * is a single flat list, sorted by a stable content key so two days holding the
 * same foods render identically and line up column-for-column.
 *
 * Desktop renders a 7-day grid; the same markup stacks into a vertical day-list
 * on mobile (today pinned).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addPlanItemsAcrossDaysAction,
  clearPlanDayAction,
  clearPlanWeekAction,
  copyPlanDayAction,
  editPlanItemAmountAction,
  removePlanItemAction,
} from "@/app/actions/planner";
import type {
  DailyTargets,
  FoodItem,
  Meal,
  PlanItem,
  WeekPlan,
} from "@/lib/domain/types";
import {
  NUTRIENT_BANDS,
  NUTRIENT_COLORS,
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  type NutrientKey,
  type Nutrients,
  type TargetMode,
} from "@/lib/constants";
import { getNutrientMode, macroIndicator } from "@/lib/domain/targets";
import { calculateNutrients, scaleNutrients, sumNutrients } from "@/lib/domain/nutrients";
import { formatConsumed, mealAmountConfig, mealConsumedToFactor } from "@/lib/domain/meals";
import MacroBreakdownChart from "@/components/dashboard/MacroBreakdownChart";
import NutrientsRdiChart from "@/components/dashboard/NutrientsRdiChart";
import type { MacroBreakdownData, NutrientsRdiData } from "@/lib/domain/charts/prepare";
import type { WeeklyPlanAggregate } from "@/lib/domain/plan/aggregate";
import type { DayVerdict } from "@/lib/domain/plan/verdict";
import { addDays, weekDates } from "@/lib/domain/plan/week";
import Combobox, { type ComboOption } from "@/components/ui/Combobox";
import EditableAmount from "@/components/ui/EditableAmount";
import NutrientPreview from "@/components/entry/NutrientPreview";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Macros shown on every day's strip; limit nutrients surface only when breached. */
const STRIP_MACROS: NutrientKey[] = ["protein_g", "carbohydrates_g", "fat_g"];
const MACRO_ABBR: Partial<Record<NutrientKey, string>> = {
  protein_g: "P",
  carbohydrates_g: "C",
  fat_g: "F",
};
const LIMIT_MACROS: NutrientKey[] = ["sugar_g", "saturated_fat_g", "salt_g"];

type Selection = { kind: "food"; food: FoodItem } | { kind: "meal"; meal: Meal };

function dayNumber(iso: string): string {
  return iso.slice(8, 10);
}
function fmtWeekRange(a: string, b: string): string {
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  const ma = MONTHS[da.getUTCMonth()];
  const mb = MONTHS[db.getUTCMonth()];
  const yr = db.getUTCFullYear();
  return ma === mb
    ? `${da.getUTCDate()}–${db.getUTCDate()} ${mb} ${yr}`
    : `${da.getUTCDate()} ${ma} – ${db.getUTCDate()} ${mb} ${yr}`;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** A day's items in a stable order: meals first, then foods, each A→Z by name. */
function sortItems(items: PlanItem[]): PlanItem[] {
  return [...items].sort((a, b) => {
    const ak = a.ref.kind === "meal" ? 0 : 1;
    const bk = b.ref.kind === "meal" ? 0 : 1;
    if (ak !== bk) return ak - bk;
    const an = (a.ref.kind === "meal" ? a.ref.meal_name : a.ref.food_name).toLowerCase();
    const bn = (b.ref.kind === "meal" ? b.ref.meal_name : b.ref.food_name).toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.id < b.id ? -1 : 1; // final tiebreak for total stability
  });
}

export default function PlannerClient({
  weekStart,
  today,
  initialWeek,
  meals,
  foods,
  recentFoods,
  aggregate,
  verdicts,
  targets,
}: {
  weekStart: string;
  today: string;
  initialWeek: WeekPlan;
  meals: Meal[];
  foods: FoodItem[];
  recentFoods: FoodItem[];
  aggregate: WeeklyPlanAggregate;
  verdicts: Record<string, DayVerdict>;
  targets: DailyTargets;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- toasts (ref counter keeps id derivation out of a setState updater) ---
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

  const run = useCallback(
    (fn: () => Promise<{ ok: boolean; message: string }>) => {
      startTransition(async () => {
        const res = await fn();
        pushToast(res.message, res.ok);
        router.refresh();
      });
    },
    [pushToast, router],
  );

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const currentWeek = useMemo(() => weekDates(today)[0] === dates[0], [today, dates]);

  // Items grouped by date only (no slots), each list in stable content order so
  // identical days render row-for-row identically.
  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const it of initialWeek.items) {
      const arr = m.get(it.plan_date) ?? [];
      arr.push(it);
      m.set(it.plan_date, arr);
    }
    for (const [k, v] of m) m.set(k, sortItems(v));
    return m;
  }, [initialWeek]);

  const [denom, setDenom] = useState<"planned" | "calendar">("planned");
  const avg = denom === "planned" ? aggregate.avgPerPlannedDay : aggregate.avgPerCalendarDay;

  // --- analysis charts: hideable, sticky per-device (a view preference, not a
  // cross-device setting, so it lives in localStorage rather than user_settings).
  // Default visible; hydrate after mount to avoid an SSR hydration mismatch.
  const [chartsHidden, setChartsHidden] = useState(false);
  useEffect(() => {
    setChartsHidden(localStorage.getItem("planner-charts-hidden") === "1");
  }, []);
  const toggleCharts = useCallback(() => {
    setChartsHidden((h) => {
      const next = !h;
      localStorage.setItem("planner-charts-hidden", next ? "1" : "0");
      return next;
    });
  }, []);

  // --- add panel: dropdown (recent + all + meals) → quantity → day(s) → Add ---
  const foodOption = useCallback(
    (f: FoodItem, section: string): ComboOption => ({
      key: `food:${f.id}`,
      label:
        f.unit_type === "per_100g"
          ? `${f.name} (per 100g)`
          : `${f.name} (per item, ~${f.serving_size_g}g)`,
      section,
    }),
    [],
  );
  const options = useMemo<ComboOption[]>(() => {
    const recentIds = new Set(recentFoods.map((f) => f.id));
    const recentOpts = recentFoods.map((f) => foodOption(f, "Recent"));
    const restOpts = foods.filter((f) => !recentIds.has(f.id)).map((f) => foodOption(f, "All foods"));
    const mealOpts = meals.map((m) => ({
      key: `meal:${m.id}`,
      label:
        m.yield_mode === "by_weight"
          ? `${m.name} (recipe · per g)`
          : m.yield_mode === "by_count"
            ? `${m.name} (recipe · per item)`
            : `${m.name} (recipe)`,
      section: "Recipes",
    }));
    return [...recentOpts, ...restOpts, ...mealOpts];
  }, [foods, meals, recentFoods, foodOption]);

  const [selection, setSelection] = useState<Selection | null>(null);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const handleSelect = useCallback(
    (key: string) => {
      if (key.startsWith("food:")) {
        const food = foods.find((f) => f.id === key.slice(5));
        // A food needs an explicit weight/quantity — leave it blank to prompt one.
        setAmount("");
        if (food) setSelection({ kind: "food", food });
      } else if (key.startsWith("meal:")) {
        const meal = meals.find((m) => m.id === key.slice(5));
        // 'whole'/'by_count' have a natural unit of 1 (portion / item) — auto-fill
        // so adding is one click; 'by_weight' has no sensible default gram amount.
        setAmount(meal && meal.yield_mode === "by_weight" ? "" : "1");
        if (meal) setSelection({ kind: "meal", meal });
      }
    },
    [foods, meals],
  );

  // amount input config per selection type (mirrors the daily-entry screen)
  const amountConfig =
    selection === null
      ? null
      : selection.kind === "meal"
        ? mealAmountConfig(selection.meal.yield_mode)
        : selection.food.unit_type === "per_100g"
          ? { label: "Weight (g)", placeholder: "e.g. 150", min: 0, step: 1 }
          : {
              label: `Quantity (1 item ≈ ${selection.food.serving_size_g}g)`,
              placeholder: "e.g. 1.5",
              min: 0,
              step: 0.5,
            };

  // live nutrient preview for the pending item (shared pure domain code)
  const preview = useMemo<Nutrients | null>(() => {
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
    const factor = mealConsumedToFactor(selection.meal, n);
    if (factor === null) return null;
    return scaleNutrients(sumNutrients(selection.meal.ingredients.map((i) => i.nutrients)), factor);
  }, [selection, amount]);

  const toggleDay = (d: string) =>
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const setEveryDay = () => setDays(new Set(dates));
  const setWeekdays = () => setDays(new Set(dates.slice(0, 5)));
  const clearDays = () => setDays(new Set());

  function resetSelection() {
    setSelection(null);
    setAmount("");
  }

  function handleAdd() {
    if (isPending) return;
    const n = Number(amount);
    if (!selection) return pushToast("Pick a food or meal first", false);
    if (!Number.isFinite(n) || n <= 0) return pushToast("Enter an amount", false);
    if (days.size === 0) return pushToast("Pick at least one day", false);
    const key = selection.kind === "food" ? `food:${selection.food.id}` : `meal:${selection.meal.id}`;
    const chosen = dates.filter((d) => days.has(d)); // keep canonical Mon→Sun order
    startTransition(async () => {
      const res = await addPlanItemsAcrossDaysAction(weekStart, chosen, key, n);
      pushToast(res.message, res.ok);
      if (res.ok) {
        resetSelection(); // keep day selection — adding several foods to the same days is common
        searchRef.current?.focus();
      }
      router.refresh();
    });
  }

  // Pull a planned row back into the add panel, ready to drop on more days.
  function repeatItem(item: PlanItem) {
    if (item.ref.kind === "meal") {
      const meal = meals.find((m) => m.id === (item.ref as { meal_id: string }).meal_id);
      if (meal) {
        setSelection({ kind: "meal", meal });
        setAmount(String((item.ref as { consumed_amount: number }).consumed_amount));
      }
    } else {
      const food = foods.find((f) => f.id === (item.ref as { food_id: string }).food_id);
      if (food) {
        setSelection({ kind: "food", food });
        const r = item.ref as { weight_g: number | null; quantity: number | null };
        setAmount(String(r.weight_g ?? r.quantity ?? ""));
      }
    }
    clearDays();
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => amountRef.current?.focus(), 60);
  }

  // A day's "+ add" preselects that day and drops focus into the search.
  function quickAddToDay(date: string) {
    setDays(new Set([date]));
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => searchRef.current?.focus(), 60);
  }

  const goWeek = (target: string) => router.push(`/planner?week=${target}`);
  const empty = initialWeek.items.length === 0;

  return (
    <div className="planner">
      {/* ── Week stepper — same treatment as the daily-entry day stepper ── */}
      <header className="planner-header">
        <div className="planner-weeknav">
          <button
            type="button"
            className="icon-button"
            data-testid="prev-week"
            title="Previous week"
            onClick={() => goWeek(addDays(weekStart, -7))}
          >
            ‹
          </button>
          <h1 className="planner-week-heading">{fmtWeekRange(dates[0], dates[6])}</h1>
          <button
            type="button"
            className="icon-button"
            data-testid="next-week"
            title="Next week"
            onClick={() => goWeek(addDays(weekStart, 7))}
          >
            ›
          </button>
          {!currentWeek && (
            <button
              type="button"
              className="planner-thisweek"
              onClick={() => goWeek(today)}
              title="Jump to the current week"
            >
              This week
            </button>
          )}
        </div>

        <div className="planner-rail">
          <KebabMenu label="Week actions" testId="week-menu">
            {(close) => (
              <button
                type="button"
                role="menuitem"
                className="planner-menu-item danger"
                onClick={() => {
                  close();
                  run(() => clearPlanWeekAction(weekStart));
                }}
              >
                Clear week
              </button>
            )}
          </KebabMenu>
        </div>
      </header>

      {/* ── Add panel: pick item → quantity → day(s) → Add ── */}
      <section className="planner-add-panel card" data-testid="add-panel" ref={panelRef}>
        <span className="section-label">Add to plan</span>
        <div className="planner-add-row">
          <Combobox
            options={options}
            placeholder="Search foods and meals…"
            testId="planner-food-search"
            inputRef={searchRef}
            selectedLabel={
              selection === null
                ? null
                : selection.kind === "food"
                  ? selection.food.name
                  : `${selection.meal.name} (meal)`
            }
            onSelect={handleSelect}
            onClear={resetSelection}
          />
          {amountConfig && (
            <div className="planner-add-amount">
              <label className="form-label-sm">{amountConfig.label}</label>
              <input
                ref={amountRef}
                type="number"
                data-testid="planner-amount"
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
            </div>
          )}
        </div>

        <div className="planner-add-days">
          <span className="planner-add-days-label">Add to</span>
          <div className="planner-daychips" role="group" aria-label="Days to add to">
            {dates.map((d, i) => (
              <button
                key={d}
                type="button"
                className={`planner-daychip${days.has(d) ? " on" : ""}${d === today ? " today" : ""}`}
                aria-pressed={days.has(d)}
                onClick={() => toggleDay(d)}
                data-testid={`daychip-${i}`}
              >
                <span className="planner-daychip-name">{WEEKDAY[i]}</span>
                <span className="planner-daychip-num">{dayNumber(d)}</span>
              </button>
            ))}
          </div>
          <div className="planner-add-quick">
            <button type="button" className="planner-chip-btn" onClick={setEveryDay} data-testid="days-every">
              Every day
            </button>
            <button type="button" className="planner-chip-btn" onClick={setWeekdays} data-testid="days-weekdays">
              Weekdays
            </button>
            {days.size > 0 && (
              <button type="button" className="planner-chip-btn ghost" onClick={clearDays}>
                Clear
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary planner-add-btn"
            onClick={handleAdd}
            disabled={isPending || !selection || days.size === 0}
            data-testid="planner-add-btn"
          >
            Add{days.size > 1 ? ` · ${days.size} days` : ""}
          </button>
        </div>

        {preview && (
          <div className="planner-add-preview">
            <NutrientPreview nutrients={preview} />
          </div>
        )}
      </section>

      {empty && (
        <p className="planner-empty-aside">An open week. Pick a food or meal above and choose the days it lands on.</p>
      )}

      <div className="planner-week">
        {dates.map((date, i) => {
          const isToday = date === today;
          const planned = aggregate.byDay[date] ?? null;
          const verdict = verdicts[date];
          const items = byDay.get(date) ?? [];
          return (
            <section
              key={date}
              className={`planner-day${isToday ? " today" : ""}`}
              data-testid={`planner-day-${i}`}
              data-date={date}
            >
              <header className="planner-day-head">
                <div className="planner-day-id">
                  <span className="planner-day-name">{WEEKDAY[i]}</span>{" "}
                  <span className="planner-day-num">{dayNumber(date)}</span>
                  {isToday && <span className="planner-today-badge">Today</span>}
                </div>
                <div className="planner-day-head-right">
                  <VerdictHanko verdict={verdict} />
                  <KebabMenu label={`${WEEKDAY[i]} actions`} testId={`day-menu-${i}`} compact>
                    {(close) => (
                      <>
                        {i > 0 && (
                          <button
                            type="button"
                            role="menuitem"
                            className="planner-menu-item"
                            onClick={() => {
                              close();
                              run(() => copyPlanDayAction(weekStart, dates[i - 1], date));
                            }}
                          >
                            Copy from {WEEKDAY[i - 1]}
                          </button>
                        )}
                        {isToday && (
                          <Link
                            role="menuitem"
                            className="planner-menu-item"
                            href={`/entry?date=${date}`}
                            onClick={close}
                          >
                            Go to entry →
                          </Link>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          className="planner-menu-item danger"
                          onClick={() => {
                            close();
                            run(() => clearPlanDayAction(date));
                          }}
                        >
                          Clear day
                        </button>
                      </>
                    )}
                  </KebabMenu>
                </div>
              </header>

              <DayMacros planned={planned} targets={targets} />

              <div className="planner-day-items">
                {items.map((it) => (
                  <PlanItemRow
                    key={it.id}
                    item={it}
                    onEdit={(amt) => run(() => editPlanItemAmountAction(it.id, amt))}
                    onRemove={() => run(() => removePlanItemAction(it.id))}
                    onRepeat={() => repeatItem(it)}
                  />
                ))}
              </div>

              <button
                type="button"
                className="planner-add"
                onClick={() => quickAddToDay(date)}
                data-testid={`add-open-${i}`}
              >
                + add
              </button>
            </section>
          );
        })}
      </div>

      {!empty &&
        (chartsHidden ? (
          <button
            type="button"
            className="weekly-show-affordance"
            onClick={toggleCharts}
            data-testid="planner-charts-toggle"
          >
            Show charts
          </button>
        ) : (
          <div className="planner-analysis">
            <div className="planner-analysis-head">
              <button
                type="button"
                className="planner-charts-hide"
                onClick={toggleCharts}
                data-testid="planner-charts-toggle"
                title="Hide the weekly charts"
              >
                Hide charts
              </button>
            </div>
            <WeekSummary
              aggregate={aggregate}
              targets={targets}
              denom={denom}
              onToggleDenom={() => setDenom((d) => (d === "planned" ? "calendar" : "planned"))}
              avg={avg}
              dates={dates}
            />
            <WeekTargets dates={dates} avg={avg} targets={targets} />
          </div>
        ))}

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

/** A quiet kebab menu — appears with NO animation (brand), closes on outside click / Esc. */
function KebabMenu({
  label,
  testId,
  compact = false,
  children,
}: {
  label: string;
  testId?: string;
  compact?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="planner-kebab" ref={ref}>
      <button
        type="button"
        className={`planner-kebab-btn${compact ? " compact" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="planner-kebab-menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Per-day macro strip: kcal vs target up front, then P/C/F, limits only if over. */
function DayMacros({ planned, targets }: { planned: Nutrients | null; targets: DailyTargets }) {
  if (!planned) {
    return (
      <div className="planner-day-strip empty" data-testid="day-strip">
        No plan yet
      </div>
    );
  }
  const kcalTarget = targets.values.energy_kcal;
  const kcalDelta = Math.round(planned.energy_kcal - kcalTarget);
  const deltaStr = `${kcalDelta >= 0 ? "+" : "−"}${Math.abs(kcalDelta)}`;
  const overLimits = LIMIT_MACROS.filter((k) => {
    const ind = macroIndicator(planned[k], targets.values[k], getNutrientMode(targets, k), NUTRIENT_BANDS[k]);
    return ind === "warning" || ind === "exceeded";
  });
  return (
    <div className="planner-day-strip" data-testid="day-strip">
      <div className="planner-day-kcal">
        <span className="planner-day-kcal-val">{Math.round(planned.energy_kcal)}</span>
        <span className="planner-day-kcal-unit">kcal</span>
        <span className={`planner-day-kcal-delta ${kcalDelta >= 0 ? "over" : "under"}`}>{deltaStr}</span>
      </div>
      <div className="planner-day-macros">
        {STRIP_MACROS.map((k) => {
          const v = planned[k];
          const t = targets.values[k];
          const ind = macroIndicator(v, t, getNutrientMode(targets, k), NUTRIENT_BANDS[k]);
          const d = Math.round(v - t);
          return (
            <span key={k} className="planner-day-macro" title={`${NUTRIENT_LABELS[k].replace(/ \(.*\)$/, "")}: ${round1(v)} / ${round1(t)} ${NUTRIENT_UNITS[k]}`}>
              <span className="planner-day-macro-key" style={{ color: NUTRIENT_COLORS[k].ink }}>
                {MACRO_ABBR[k]}
              </span>
              <span className="planner-day-macro-val">{Math.round(v)}</span>
              <span className={`planner-day-macro-delta ${ind === "met" ? "met" : "miss"}`}>
                ({d >= 0 ? "+" : "−"}
                {Math.abs(d)})
              </span>
            </span>
          );
        })}
      </div>
      {overLimits.length > 0 && (
        <div className="planner-day-limits">
          {overLimits.map((k) => (
            <span key={k} className="planner-day-limit warn">
              ⚠ {NUTRIENT_LABELS[k].replace(/ \(.*\)$/, "")} {round1(planned[k])} {NUTRIENT_UNITS[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanItemRow({
  item,
  onEdit,
  onRemove,
  onRepeat,
}: {
  item: PlanItem;
  onEdit: (amount: number) => void;
  onRemove: () => void;
  onRepeat: () => void;
}) {
  const { ref } = item;
  let display: string;
  let value: number;
  let name: string;
  if (ref.kind === "meal") {
    name = ref.meal_name;
    value = ref.consumed_amount;
    display = formatConsumed(ref.yield_mode, ref.consumed_amount);
  } else {
    name = ref.food_name;
    if (ref.weight_g !== null) {
      value = ref.weight_g;
      display = `${ref.weight_g} g`;
    } else {
      value = ref.quantity ?? 1;
      display = `× ${ref.quantity ?? 1}`;
    }
  }
  return (
    <div className={`planner-item${item.applied ? " applied" : ""}`} data-testid="plan-item">
      <div className="planner-item-main">
        <span className="planner-item-name" title={name}>
          {item.applied && (
            <span className="planner-item-check" title="Logged from plan">✓</span>
          )}
          {name}
        </span>
        <span className="planner-item-controls">
          <button
            type="button"
            className="planner-item-repeat"
            aria-label={`Add ${name} to other days`}
            title="Add to other days"
            onClick={onRepeat}
          >
            ⤺
          </button>
          <button
            type="button"
            className="delete-icon"
            aria-label={`Remove ${name}`}
            onClick={onRemove}
          >
            ×
          </button>
        </span>
      </div>
      <span className="planner-item-amount">
        <EditableAmount display={display} value={value} onSave={onEdit} onRemove={onRemove} />
      </span>
    </div>
  );
}

/** Nutrients shown in the weekly RDI strips — every macro except energy. */
const RDI_NUTRIENTS: NutrientKey[] = NUTRIENT_KEYS.filter((k) => k !== "energy_kcal");

/**
 * Week vs targets — the dashboard's RDI strip chart, fed the week's AVERAGE as a
 * single point per nutrient (a flat band across the week) measured against each
 * nutrient's own target/limit. Reuses NutrientsRdiChart in compact mode.
 */
function WeekTargets({
  dates,
  avg,
  targets,
}: {
  dates: string[];
  avg: Record<NutrientKey, number> | null;
  targets: DailyTargets;
}) {
  const span = [dates[0], dates[dates.length - 1]];
  const series: Record<string, (number | null)[]> = {};
  const modes: Record<string, TargetMode> = {};
  const guidelines: Partial<Record<NutrientKey, number>> = {};
  for (const k of RDI_NUTRIENTS) {
    const t = targets.values[k];
    const v = avg ? avg[k] : null;
    const pct = v === null || !(t > 0) ? null : (v / t) * 100;
    series[k] = [pct, pct]; // flat band = the week's single average value
    modes[k] = getNutrientMode(targets, k);
    guidelines[k] = t;
  }
  const data: NutrientsRdiData = { dates: span, series };
  return (
    <section className="planner-week-rdi card">
      <div className="planner-summary-top">
        <span className="section-label">Week average vs targets</span>
      </div>
      <NutrientsRdiChart
        data={data}
        modes={modes}
        nutrients={RDI_NUTRIENTS}
        guidelines={guidelines}
        compact
      />
    </section>
  );
}

/**
 * At-a-glance day mark — icon only. The per-day macro strip already carries the
 * kcal/macro deltas, so a word here ("Over"/"Under") was redundant AND misleading:
 * a day far UNDER on energy but over one limit nutrient read as "Over". The icon
 * (✓ all good / ⚠ something needs attention) keeps the glance; the tooltip names
 * the specific reason. Empty days show nothing — the strip says "No plan yet".
 */
function VerdictHanko({ verdict }: { verdict: DayVerdict }) {
  if (verdict.state === "unknown") return null;
  const met = verdict.state === "met";
  return (
    <span
      className={`planner-verdict ${met ? "met" : "warn"}`}
      title={verdict.reason ?? (met ? "On target" : undefined)}
      aria-label={met ? "On target" : verdict.reason ?? "Needs attention"}
    >
      {met ? "✓" : "⚠"}
    </span>
  );
}

/**
 * Build the dashboard's MacroBreakdownData shape from the week's per-day plan,
 * so the planner can render the SAME chart component. Decomposition mirrors
 * prepareMacroBreakdown: protein/carbs/fat → kcal (4/4/9), carbs split into
 * sugar (sugar_g/carbs_g share) + other carbs, fat split into sat + other.
 * Unplanned days are null (a gap), never zero.
 */
function weeklyMacroBreakdown(
  dates: string[],
  byDay: Record<string, Nutrients | null>,
): MacroBreakdownData {
  const protein_cal: (number | null)[] = [];
  const other_carbs_cal: (number | null)[] = [];
  const sugar_cal: (number | null)[] = [];
  const other_fat_cal: (number | null)[] = [];
  const saturated_fat_cal: (number | null)[] = [];
  for (const d of dates) {
    const n = byDay[d] ?? null;
    if (!n) {
      protein_cal.push(null);
      other_carbs_cal.push(null);
      sugar_cal.push(null);
      other_fat_cal.push(null);
      saturated_fat_cal.push(null);
      continue;
    }
    const carbsCal = n.carbohydrates_g * 4;
    const sugarCal = n.carbohydrates_g > 0 ? (n.sugar_g / n.carbohydrates_g) * carbsCal : 0;
    const fatCal = n.fat_g * 9;
    const satFatCal = Math.min(n.saturated_fat_g * 9, fatCal);
    protein_cal.push(n.protein_g * 4);
    sugar_cal.push(Math.min(sugarCal, carbsCal));
    other_carbs_cal.push(Math.max(0, carbsCal - sugarCal));
    saturated_fat_cal.push(satFatCal);
    other_fat_cal.push(Math.max(0, fatCal - satFatCal));
  }
  return { dates, protein_cal, other_carbs_cal, sugar_cal, other_fat_cal, saturated_fat_cal };
}

function WeekSummary({
  aggregate,
  targets,
  denom,
  onToggleDenom,
  avg,
  dates,
}: {
  aggregate: WeeklyPlanAggregate;
  targets: DailyTargets;
  denom: "planned" | "calendar";
  onToggleDenom: () => void;
  avg: Record<NutrientKey, number> | null;
  dates: string[];
}) {
  const totalKcal = Math.round(aggregate.total.energy_kcal);
  return (
    <section className="planner-week-summary card">
      <div className="planner-summary-top">
        <span className="section-label">Week at a glance</span>
        <button
          type="button"
          className="planner-denom-toggle"
          onClick={onToggleDenom}
          data-testid="denom-toggle"
          title="Switch the average's divisor"
        >
          {denom === "planned" ? "÷ days planned" : "÷ 7 days"}
        </button>
      </div>

      <p className="planner-summary-line">
        <span className="planner-summary-avg">{avg ? Math.round(avg.energy_kcal) : "—"}</span>
        <span className="planner-summary-avg-unit">kcal avg/day</span>
        <span className="planner-summary-sub">
          {aggregate.daysPlanned} of 7 days planned · {totalKcal} kcal total
        </span>
      </p>

      <MacroBreakdownChart data={weeklyMacroBreakdown(dates, aggregate.byDay)} />
    </section>
  );
}
