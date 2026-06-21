"use client";

/**
 * Weekly Planner. A plan is intent, SEPARATE from the log — the planner NEVER
 * writes to the diary. Intentions reach the log only as faint "ghost" suggestions
 * on the daily-entry screen, added with one click there.
 *
 * Composition (multi-day assignment) is "Stamp mode": load a meal, then press the
 * cells (or a whole slot across the week) where it goes — no wizard, no chips.
 *
 * Desktop renders a 7-day grid; the same markup stacks into a vertical day-list
 * on mobile (today pinned).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addPlanFoodAction,
  addPlanMealAction,
  clearPlanDayAction,
  clearPlanWeekAction,
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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

  const [denom, setDenom] = useState<"planned" | "calendar">("planned");
  const avg = denom === "planned" ? aggregate.avgPerPlannedDay : aggregate.avgPerCalendarDay;

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

  // --- add-to-cell ---
  const [adding, setAdding] = useState<{ date: string; slot: PlanSlot } | null>(null);
  function addToCell(date: string, slot: PlanSlot, optionKey: string) {
    setAdding(null);
    if (optionKey.startsWith("meal:")) {
      run(() => addPlanMealAction(weekStart, date, slot, optionKey.slice(5), 1));
    } else if (optionKey.startsWith("food:")) {
      const foodId = optionKey.slice(5);
      const food = foods.find((f) => f.id === foodId);
      const amount = food?.unit_type === "per_item" ? 1 : 100;
      run(() => addPlanFoodAction(weekStart, date, slot, foodId, amount));
    }
  }

  // --- stamp mode (replaces the paint wizard): load a meal, press where it goes ---
  const [stampMode, setStampMode] = useState(false);
  const [stampMealId, setStampMealId] = useState<string | null>(null);
  const [stampPortions, setStampPortions] = useState("1");
  const stampMeal = meals.find((m) => m.id === stampMealId) ?? null;
  const stampReady = stampMode && stampMealId !== null;
  const portionsNum = Number(stampPortions);

  const openStamp = useCallback((mealId?: string, portions?: number) => {
    setStampMode(true);
    if (mealId) setStampMealId(mealId);
    if (portions) setStampPortions(String(portions));
  }, []);
  const closeStamp = useCallback(() => {
    setStampMode(false);
    setStampMealId(null);
    setStampPortions("1");
  }, []);
  useEffect(() => {
    if (!stampMode) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && closeStamp();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [stampMode, closeStamp]);

  function stampInto(date: string, slot: PlanSlot) {
    if (!stampMealId || !(portionsNum > 0)) return;
    run(() => addPlanMealAction(weekStart, date, slot, stampMealId, portionsNum));
  }
  function stampAcrossWeek(slot: PlanSlot) {
    if (!stampMealId || !(portionsNum > 0)) return;
    run(() => paintMealAcrossDaysAction(weekStart, stampMealId, portionsNum, slot, dates));
  }

  const goWeek = (target: string) => router.push(`/planner?week=${target}`);
  const empty = initialWeek.items.length === 0;

  return (
    <div className={`planner${stampMode ? " stamping" : ""}`}>
      {/* ── Week stepper — identical treatment to the daily-entry day stepper ── */}
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
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => (stampMode ? closeStamp() : openStamp())}
            disabled={meals.length === 0}
            data-testid="compose-toggle"
          >
            {stampMode ? "Done composing" : "Compose"}
          </button>
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

      {/* ── Stamp chit: the only new chrome for multi-day assignment ── */}
      {stampMode && (
        <div className="planner-stamp-chit card" data-testid="stamp-chit">
          <span className="section-label">Stamp a meal</span>
          <div className="planner-stamp-row">
            <Combobox
              options={mealOptions}
              placeholder="Load a meal to stamp…"
              selectedLabel={stampMeal?.name ?? null}
              onSelect={(key) => setStampMealId(key)}
              onClear={() => setStampMealId(null)}
              testId="stamp-meal"
            />
            <label className="planner-stamp-field">
              Portions
              <input
                className="planner-amount-input"
                type="number"
                min={0}
                step={0.5}
                value={stampPortions}
                onChange={(e) => setStampPortions(e.target.value)}
              />
            </label>
          </div>
          {stampReady ? (
            <p className="planner-stamp-hint">
              Press any slot below to stamp it there — or stamp a whole week’s slot:
            </p>
          ) : (
            <p className="planner-stamp-hint muted">Load a meal, then press where it goes.</p>
          )}
          {stampReady && (
            <div className="planner-stamp-allweek">
              <span className="planner-stamp-allweek-label">All week</span>
              {PLAN_SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="planner-chip-btn"
                  onClick={() => stampAcrossWeek(s)}
                  disabled={isPending}
                  data-testid={`stamp-allweek-${s}`}
                >
                  {SLOT_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {empty && !stampMode ? (
        <p className="planner-empty-aside">An open week. Compose a meal across days to begin.</p>
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
          const kcal = aggregate.byDay[date]?.energy_kcal ?? null;
          const verdict = verdicts[date];
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
                  <VerdictHanko verdict={verdict} kcal={kcal} />
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
                return (
                  <div key={slot} className="planner-slot" data-slot={slot}>
                    <div className="planner-slot-head">
                      <span className="planner-slot-label">{SLOT_LABELS[slot]}</span>
                    </div>

                    {items.map((it) => (
                      <PlanItemRow
                        key={it.id}
                        item={it}
                        onEdit={(amt) => run(() => editPlanItemAmountAction(it.id, amt))}
                        onRemove={() => run(() => removePlanItemAction(it.id))}
                        onRepeat={
                          it.ref.kind === "meal"
                            ? () => openStamp((it.ref as { meal_id: string }).meal_id, (it.ref as { portions: number }).portions)
                            : undefined
                        }
                      />
                    ))}

                    {stampReady ? (
                      <button
                        type="button"
                        className="planner-stamp-target"
                        onClick={() => stampInto(date, slot)}
                        disabled={isPending}
                        data-testid={`stamp-${i}-${slot}`}
                      >
                        ⊕ stamp here
                      </button>
                    ) : adding && adding.date === date && adding.slot === slot ? (
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

function PlanItemRow({
  item,
  onEdit,
  onRemove,
  onRepeat,
}: {
  item: PlanItem;
  onEdit: (amount: number) => void;
  onRemove: () => void;
  onRepeat?: () => void;
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
        {onRepeat && (
          <button
            type="button"
            className="planner-item-repeat"
            aria-label={`Repeat ${name} on other days`}
            title="Repeat on other days"
            onClick={onRepeat}
          >
            ⤺
          </button>
        )}
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
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

function VerdictHanko({ verdict, kcal }: { verdict: DayVerdict; kcal: number | null }) {
  if (verdict.state === "unknown") {
    return <span className="planner-verdict unknown">— plan</span>;
  }
  const met = verdict.state === "met";
  return (
    <span className={`planner-verdict ${met ? "met" : "warn"}`} title={verdict.reason ?? undefined}>
      <span className="planner-verdict-mark">{met ? "✓" : "⚠"}</span>
      <span className="planner-verdict-kcal">{kcal === null ? "—" : `${Math.round(kcal)} kcal`}</span>
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
