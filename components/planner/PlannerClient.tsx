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
  NUTRIENT_COLORS,
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  ZERO_NUTRIENTS,
  type NutrientKey,
  type Nutrients,
} from "@/lib/constants";
import { getNutrientMode, macroIndicator } from "@/lib/domain/targets";
import { calculateNutrients } from "@/lib/domain/nutrients";
import type { WeeklyPlanAggregate } from "@/lib/domain/plan/aggregate";
import type { DayVerdict } from "@/lib/domain/plan/verdict";
import type { WeekComparison } from "@/lib/domain/plan/compare";
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
  comparison,
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
  comparison: WeekComparison;
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
      label: `${m.name} (meal)`,
      section: "Meals",
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
      setAmount("");
      if (key.startsWith("food:")) {
        const food = foods.find((f) => f.id === key.slice(5));
        if (food) setSelection({ kind: "food", food });
      } else if (key.startsWith("meal:")) {
        const meal = meals.find((m) => m.id === key.slice(5));
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
        ? { label: "Portions", placeholder: "1.0", min: 0.1, step: 0.1 }
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
    const totals = { ...ZERO_NUTRIENTS };
    for (const ing of selection.meal.ingredients) {
      for (const key of Object.keys(totals) as NutrientKey[]) totals[key] += ing.nutrients[key] * n;
    }
    return totals;
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
        setAmount(String((item.ref as { portions: number }).portions));
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

      {empty ? (
        <p className="planner-empty-aside">An open week. Pick a food or meal above and choose the days it lands on.</p>
      ) : (
        <WeekSummary
          aggregate={aggregate}
          targets={targets}
          denom={denom}
          onToggleDenom={() => setDenom((d) => (d === "planned" ? "calendar" : "planned"))}
          avg={avg}
          dates={dates}
        />
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

      {comparison.anyLogged && <PlanVsActual comparison={comparison} />}

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
    const ind = macroIndicator(planned[k], targets.values[k], getNutrientMode(targets, k));
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
          const ind = macroIndicator(v, t, getNutrientMode(targets, k));
          const d = Math.round(v - t);
          return (
            <span key={k} className="planner-day-macro" title={`${NUTRIENT_LABELS[k].replace(/ \(.*\)$/, "")}: ${round1(v)} / ${round1(t)} ${NUTRIENT_UNITS[k]}`}>
              <span className="planner-day-macro-key" style={{ color: NUTRIENT_COLORS[k].ink }}>
                {MACRO_ABBR[k]}
              </span>
              <span className="planner-day-macro-val">{Math.round(v)}</span>
              <span className={`planner-day-macro-delta ${ind === "met" ? "met" : "miss"}`}>
                {d >= 0 ? "+" : "−"}
                {Math.abs(d)}
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
    value = ref.portions;
    display = `${ref.portions} portion${ref.portions === 1 ? "" : "s"}`;
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
      <span className="planner-item-name" title={name}>
        {item.applied && (
          <span className="planner-item-check" title="Logged from plan">✓</span>
        )}
        {name}
      </span>
      <span className="planner-item-amount">
        <EditableAmount display={display} value={value} onSave={onEdit} onRemove={onRemove} />
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
  );
}

function signed(n: number, unit: string): string {
  const v = unit === "g" ? round1(Math.abs(n)) : Math.round(Math.abs(n));
  return `${n >= 0 ? "+" : "−"}${v} ${unit}`;
}

function PlanVsActual({ comparison }: { comparison: WeekComparison }) {
  return (
    <section className="planner-pva card">
      <span className="section-label">Plan vs actual · this week</span>
      <div className="planner-pva-head">
        <span />
        <span>Planned</span>
        <span>Logged</span>
        <span>Δ</span>
      </div>
      {NUTRIENT_KEYS.map((k) => {
        const d = comparison.week[k];
        const unit = NUTRIENT_UNITS[k];
        return (
          <div key={k} className="planner-pva-row">
            <span className="planner-pva-label">
              <span
                className="planner-nutrient-dot"
                style={{ background: NUTRIENT_COLORS[k].ink }}
                aria-hidden="true"
              />
              {NUTRIENT_LABELS[k].replace(/ \(.*\)$/, "")}
            </span>
            <span className="planner-pva-num">{d.planned === null ? "—" : `${round1(d.planned)}`}</span>
            <span className="planner-pva-num">{d.actual === null ? "—" : `${round1(d.actual)}`}</span>
            <span className="planner-pva-delta">{d.delta === null ? "—" : signed(d.delta, unit)}</span>
          </div>
        );
      })}
      <p className="planner-pva-note">
        Compared over the {comparison.comparableDays} day
        {comparison.comparableDays === 1 ? "" : "s"} you both planned and logged. Per-day drift is on
        each day above; “—” means one side is missing — never counted as zero.
      </p>
    </section>
  );
}

function VerdictHanko({ verdict }: { verdict: DayVerdict }) {
  if (verdict.state === "unknown") {
    return <span className="planner-verdict unknown">— plan</span>;
  }
  const met = verdict.state === "met";
  return (
    <span className={`planner-verdict ${met ? "met" : "warn"}`} title={verdict.reason ?? undefined}>
      <span className="planner-verdict-mark">{met ? "✓" : "⚠"}</span>
      <span className="planner-verdict-label">{met ? "on target" : verdict.state}</span>
    </span>
  );
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
  const maxDayKcal = Math.max(1, ...dates.map((d) => aggregate.byDay[d]?.energy_kcal ?? 0));
  return (
    <section className="planner-week-summary card">
      <div className="planner-summary-top">
        <span className="section-label">Week average</span>
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
      <div className="planner-summary-grid">
        <div className="planner-summary-headline">
          <span className="planner-summary-avg">{avg ? Math.round(avg.energy_kcal) : "—"}</span>
          <span className="planner-summary-avg-label">kcal avg / day</span>
          <span className="planner-summary-sub">
            {aggregate.daysPlanned} of 7 days planned · {totalKcal} kcal total
          </span>
        </div>
        <div className="planner-distribution" aria-hidden="true">
          {dates.map((d) => {
            const k = aggregate.byDay[d]?.energy_kcal ?? null;
            const h = k === null ? 0 : Math.max(3, Math.round((k / maxDayKcal) * 100));
            return (
              <span
                key={d}
                className={`planner-dist-bar${k === null ? " empty" : ""}`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
      </div>
      <div className="planner-nutrient-rows">
        {NUTRIENT_KEYS.filter((k) => k !== "energy_kcal").map((k) => {
          const v = avg ? avg[k] : null;
          const mode = getNutrientMode(targets, k);
          const ind = v === null ? null : macroIndicator(v, targets.values[k], mode);
          const mark = ind === "met" ? "✓" : ind === "warning" || ind === "exceeded" ? "⚠" : "";
          const markCls = ind === "met" ? "met" : ind ? "warn" : "";
          return (
            <div key={k} className="planner-nutrient-row">
              <span className="planner-nutrient-label">
                <span
                  className="planner-nutrient-dot"
                  style={{ background: NUTRIENT_COLORS[k].ink }}
                  aria-hidden="true"
                />
                {NUTRIENT_LABELS[k].replace(/ \(.*\)$/, "")}
              </span>
              <span className="planner-nutrient-val">
                {v === null ? "—" : `${round1(v)} ${NUTRIENT_UNITS[k]}`}
              </span>
              <span className="planner-nutrient-target">
                {mode === "limit" ? "≤ " : "/ "}
                {round1(targets.values[k])}
              </span>
              <span className={`planner-nutrient-mark ${markCls}`} aria-hidden="true">
                {mark}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
