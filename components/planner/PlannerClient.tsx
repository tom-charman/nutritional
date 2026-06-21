"use client";

/**
 * Weekly Planner. A plan is intent, SEPARATE from the logged daily entries.
 * The keystone gesture is "paint" — stamp one meal across many days/slots at
 * once (batch cooking = eating the same thing repeatedly). Applying a plan into
 * the log is TODAY ONLY and per-slot: we log what we actually ate.
 *
 * Desktop renders a 7-day grid; the same markup stacks into a vertical day-list
 * on mobile (a 7-column grid is unusable on a phone).
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addPlanFoodAction,
  addPlanMealAction,
  applyPlanDayAction,
  clearPlanDayAction,
  copyPlanDayAction,
  editPlanItemAmountAction,
  paintMealAcrossDaysAction,
  removePlanItemAction,
} from "@/app/actions/planner";
import {
  PLAN_SLOTS,
  type DailyTargets,
  type FoodItem,
  type Meal,
  type PlanItem,
  type PlanSlot,
  type WeekPlan,
} from "@/lib/domain/types";
import {
  NUTRIENT_COLORS,
  NUTRIENT_KEYS,
  NUTRIENT_LABELS,
  NUTRIENT_UNITS,
  type NutrientKey,
} from "@/lib/constants";
import { getNutrientMode, macroIndicator } from "@/lib/domain/targets";
import type { WeeklyPlanAggregate } from "@/lib/domain/plan/aggregate";
import type { DayVerdict } from "@/lib/domain/plan/verdict";
import type { WeekComparison } from "@/lib/domain/plan/compare";
import { addDays, weekDates } from "@/lib/domain/plan/week";
import Combobox, { type ComboOption } from "@/components/ui/Combobox";
import EditableAmount from "@/components/ui/EditableAmount";
import ToastContainer, { type ToastMessage } from "@/components/ui/Toast";

const SLOT_LABELS: Record<PlanSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

const WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayNumber(iso: string): string {
  return iso.slice(8, 10);
}

export default function PlannerClient({
  weekStart,
  today,
  initialWeek,
  meals,
  foods,
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
  aggregate: WeeklyPlanAggregate;
  verdicts: Record<string, DayVerdict>;
  targets: DailyTargets;
  comparison: WeekComparison;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- toasts ---
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [toastSeq, setToastSeq] = useState(0);
  function pushToast(text: string, ok: boolean) {
    if (!text) return;
    setToastSeq((n) => {
      const id = n + 1;
      setToasts((t) => [...t, { id, kind: ok ? "success" : "error", text }]);
      return id;
    });
  }
  function dismissToast(id: number) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const res = await fn();
      pushToast(res.message, res.ok);
      router.refresh();
    });
  }

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);

  // Index plan items by `${date}|${slot}`.
  const byCell = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const it of initialWeek.items) {
      const key = `${it.plan_date}|${it.slot}`;
      const arr = m.get(key) ?? [];
      arr.push(it);
      m.set(key, arr);
    }
    return m;
  }, [initialWeek]);

  // ÷7 (calendar) vs ÷days-planned — surfaced, never silently chosen.
  const [denom, setDenom] = useState<"planned" | "calendar">("planned");
  const avg =
    denom === "planned" ? aggregate.avgPerPlannedDay : aggregate.avgPerCalendarDay;

  // Combobox options: meals first, then foods. Keys are prefixed so we know which.
  const addOptions = useMemo<ComboOption[]>(
    () => [
      ...meals.map((m) => ({ key: `meal:${m.id}`, label: m.name, section: "Meals" })),
      ...foods.map((f) => ({
        key: `food:${f.id}`,
        label: f.unit_type === "per_100g" ? `${f.name} (per 100g)` : `${f.name} (per item)`,
        section: "Foods",
      })),
    ],
    [meals, foods],
  );
  const mealOptions = useMemo<ComboOption[]>(
    () => meals.map((m) => ({ key: m.id, label: m.name })),
    [meals],
  );

  // --- add-to-cell state ---
  const [adding, setAdding] = useState<{ date: string; slot: PlanSlot } | null>(null);

  function addToCell(date: string, slot: PlanSlot, optionKey: string) {
    setAdding(null);
    if (optionKey.startsWith("meal:")) {
      const mealId = optionKey.slice(5);
      run(() => addPlanMealAction(weekStart, date, slot, mealId, 1));
    } else if (optionKey.startsWith("food:")) {
      const foodId = optionKey.slice(5);
      const food = foods.find((f) => f.id === foodId);
      const amount = food?.unit_type === "per_item" ? 1 : 100;
      run(() => addPlanFoodAction(weekStart, date, slot, foodId, amount));
    }
  }

  // --- paint mode ---
  const [paintOpen, setPaintOpen] = useState(false);
  const [paintMealId, setPaintMealId] = useState<string | null>(null);
  const [paintPortions, setPaintPortions] = useState("1");
  const [paintSlot, setPaintSlot] = useState<PlanSlot>("lunch");
  const [paintDays, setPaintDays] = useState<Set<string>>(new Set());

  const paintMeal = meals.find((m) => m.id === paintMealId) ?? null;

  function togglePaintDay(d: string) {
    setPaintDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function stampPaint() {
    const portions = Number(paintPortions);
    if (!paintMealId) return pushToast("Pick a meal to paint", false);
    if (!(portions > 0)) return pushToast("Enter valid portions", false);
    if (paintDays.size === 0) return pushToast("Pick at least one day", false);
    const days = [...paintDays];
    run(() => paintMealAcrossDaysAction(weekStart, paintMealId, portions, paintSlot, days));
    setPaintOpen(false);
    setPaintMealId(null);
    setPaintDays(new Set());
  }

  const prevWeek = addDays(weekStart, -7);
  const nextWeek = addDays(weekStart, 7);
  const weekLabel = `${dates[0].slice(5)} – ${dates[6].slice(5)}`;
  const empty = initialWeek.items.length === 0;

  return (
    <div className="planner">
      <header className="planner-header">
        <div className="planner-weeknav">
          <Link className="btn btn-secondary btn-sm" href={`/planner?week=${prevWeek}`}>
            ‹ Prev
          </Link>
          <h1 className="planner-title">Week of {weekLabel}</h1>
          <Link className="btn btn-secondary btn-sm" href={`/planner?week=${nextWeek}`}>
            Next ›
          </Link>
        </div>
        <button
          type="button"
          className={`btn btn-sm ${paintOpen ? "btn-primary" : "btn-secondary"}`}
          onClick={() => setPaintOpen((o) => !o)}
          disabled={meals.length === 0}
          data-testid="paint-toggle"
        >
          Paint a meal across days
        </button>
      </header>

      {paintOpen && (
        <div className="planner-paint card" data-testid="paint-panel">
          <span className="section-label">Paint a meal</span>
          <div className="planner-paint-row">
            <Combobox
              options={mealOptions}
              placeholder="Pick a meal…"
              selectedLabel={paintMeal?.name ?? null}
              onSelect={(key) => setPaintMealId(key)}
              onClear={() => setPaintMealId(null)}
              testId="paint-meal"
            />
            <label className="planner-paint-field">
              Portions
              <input
                className="planner-amount-input"
                type="number"
                min={0}
                step={0.5}
                value={paintPortions}
                onChange={(e) => setPaintPortions(e.target.value)}
              />
            </label>
            <label className="planner-paint-field">
              Slot
              <select
                value={paintSlot}
                onChange={(e) => setPaintSlot(e.target.value as PlanSlot)}
                data-testid="paint-slot"
              >
                {PLAN_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {SLOT_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="planner-paint-days">
            {dates.map((d, i) => (
              <button
                key={d}
                type="button"
                className={`planner-day-chip${paintDays.has(d) ? " selected" : ""}`}
                onClick={() => togglePaintDay(d)}
                data-testid={`paint-day-${i}`}
              >
                {WEEKDAY[i]} {dayNumber(d)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={stampPaint}
            disabled={isPending}
            data-testid="paint-stamp"
          >
            Stamp on {paintDays.size} day{paintDays.size === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {empty ? (
        <p className="planner-empty-aside">
          An empty week. Add a meal to a day, or paint one across several, to begin.
        </p>
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
          const dayTotals = aggregate.byDay[date];
          const kcal = dayTotals?.energy_kcal ?? null;
          const verdict = verdicts[date];
          return (
            <section
              key={date}
              className={`planner-day${isToday ? " today" : ""}`}
              data-testid={`planner-day-${i}`}
              data-date={date}
            >
              <header className="planner-day-head">
                <div>
                  <span className="planner-day-name">{WEEKDAY[i]}</span>{" "}
                  <span className="planner-day-num">{dayNumber(date)}</span>
                  {isToday && <span className="planner-today-badge">Today</span>}
                </div>
                <VerdictHanko verdict={verdict} kcal={kcal} />
              </header>

              {verdict.reason && (
                <p className={`planner-day-reason ${verdict.state}`}>{verdict.reason}</p>
              )}

              {(() => {
                const c = comparison.byDay[i]?.byNutrient.energy_kcal;
                if (!c || c.actual === null) return null;
                return (
                  <p className="planner-day-actual">
                    Logged <span className="mono">{Math.round(c.actual)}</span> kcal
                    {c.delta !== null && (
                      <span className="planner-delta">
                        {" "}
                        ({c.delta >= 0 ? "+" : "−"}
                        {Math.abs(Math.round(c.delta))} vs plan)
                      </span>
                    )}
                  </p>
                );
              })()}

              {PLAN_SLOTS.map((slot) => {
                const items = byCell.get(`${date}|${slot}`) ?? [];
                const hasUnapplied = isToday && items.some((it) => !it.applied);
                return (
                  <div key={slot} className="planner-slot" data-slot={slot}>
                    <div className="planner-slot-head">
                      <span className="planner-slot-label">{SLOT_LABELS[slot]}</span>
                      {hasUnapplied && (
                        <button
                          type="button"
                          className="planner-slot-apply"
                          onClick={() => run(() => applyPlanDayAction(slot))}
                          disabled={isPending}
                          data-testid={`apply-slot-${slot}`}
                          title="Log this slot for today"
                        >
                          Log
                        </button>
                      )}
                    </div>

                    {items.map((it) => (
                      <PlanItemRow
                        key={it.id}
                        item={it}
                        onEdit={(amt) => run(() => editPlanItemAmountAction(it.id, amt))}
                        onRemove={() => run(() => removePlanItemAction(it.id))}
                      />
                    ))}

                    {adding && adding.date === date && adding.slot === slot ? (
                      <Combobox
                        options={addOptions}
                        placeholder="Add meal or food…"
                        selectedLabel={null}
                        startOpen
                        onSelect={(key) => addToCell(date, slot, key)}
                        onClear={() => setAdding(null)}
                        onCancel={() => setAdding(null)}
                        testId={`add-${i}-${slot}`}
                      />
                    ) : (
                      <button
                        type="button"
                        className="planner-add"
                        onClick={() => setAdding({ date, slot })}
                        data-testid={`add-open-${i}-${slot}`}
                      >
                        + add
                      </button>
                    )}
                  </div>
                );
              })}

              <footer className="planner-day-foot">
                {isToday && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => run(() => applyPlanDayAction())}
                    disabled={isPending}
                    data-testid="apply-day"
                  >
                    Log today
                  </button>
                )}
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => run(() => copyPlanDayAction(weekStart, dates[i - 1], date))}
                    disabled={isPending}
                    title={`Copy ${WEEKDAY[i - 1]} onto ${WEEKDAY[i]}`}
                  >
                    Copy {WEEKDAY[i - 1]}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => run(() => clearPlanDayAction(date))}
                  disabled={isPending}
                >
                  Clear
                </button>
              </footer>
            </section>
          );
        })}
      </div>

      {comparison.anyLogged && <PlanVsActual comparison={comparison} />}

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

function PlanItemRow({
  item,
  onEdit,
  onRemove,
}: {
  item: PlanItem;
  onEdit: (amount: number) => void;
  onRemove: () => void;
}) {
  const { ref } = item;
  let display: string;
  let value: number;
  let name: string;
  if (ref.kind === "meal") {
    name = ref.meal_name;
    value = ref.portions;
    // Match the diary's wording ("1 portion") — and avoid "× 1" colliding with the × delete icon.
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
        {item.applied && <span className="planner-item-check" aria-label="Logged">✓</span>}
        {name}
      </span>
      <span className="planner-item-amount">
        <EditableAmount display={display} value={value} onSave={onEdit} onRemove={onRemove} />
      </span>
      <button
        type="button"
        className="delete-icon"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Format a signed delta with an explicit +/− (neutral fact — never red/green). */
function signed(n: number, unit: string): string {
  const v = unit === "g" ? round1(Math.abs(n)) : Math.round(Math.abs(n));
  return `${n >= 0 ? "+" : "−"}${v} ${unit}`;
}

/** Week-level plan vs actual: planned (intent) vs logged (reality) per nutrient. */
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
            <span className="planner-pva-delta">
              {d.delta === null ? "—" : signed(d.delta, unit)}
            </span>
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

/** Per-day stamp: ✓ bamboo (met), ⚠ rust (over/under), or a quiet "— plan" (unknown). */
function VerdictHanko({ verdict, kcal }: { verdict: DayVerdict; kcal: number | null }) {
  if (verdict.state === "unknown") {
    return <span className="planner-verdict unknown">— plan</span>;
  }
  const met = verdict.state === "met";
  return (
    <span
      className={`planner-verdict ${met ? "met" : "warn"}`}
      title={verdict.reason ?? undefined}
    >
      <span className="planner-verdict-mark">{met ? "✓" : "⚠"}</span>
      <span className="planner-verdict-kcal">{kcal === null ? "—" : `${Math.round(kcal)} kcal`}</span>
    </span>
  );
}

/** Weekly readout: avg/day (toggle ÷7 vs ÷planned), per-day kcal distribution, per-nutrient avg vs target. */
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
        <span className="section-label">This week</span>
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
