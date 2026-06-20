"use client";

/**
 * Weekly Trend card — the Cutter's "is my cut working, and how fast?" readout.
 *
 * Brand notes:
 *  - The hero rate is NEUTRAL Sumi ink; the minus sign carries direction and a
 *    word ("losing"/"holding"/"gaining") disambiguates it — no red/green on the
 *    rate itself (goal direction is the user's choice).
 *  - Bamboo green appears only as weight-series IDENTITY (the unit underscore),
 *    and as a verdict ONLY against a user-declared target rate.
 */
import type { WeeklyReadout } from "@/lib/domain/summary/weekly";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Signed rate with a typographic minus and 2dp. */
function fmtRate(rate: number): { sign: string; mag: string } {
  return { sign: rate < 0 ? "−" : "+", mag: Math.abs(rate).toFixed(2) };
}

function directionWord(rate: number): string {
  if (Math.abs(rate) < 0.05) return "holding";
  return rate < 0 ? "losing" : "gaining";
}

function GoalBlock({ readout }: { readout: WeeklyReadout }) {
  const p = readout.projection;
  if (!p) return null;
  const verdict =
    p.on_track === "on_track"
      ? { cls: "target-met", mark: "✓", text: "on track" }
      : p.on_track === "too_slow"
        ? { cls: "target-warning", mark: "⚠", text: "slower than planned" }
        : p.on_track === "too_fast"
          ? { cls: "target-warning", mark: "⚠", text: "faster than planned" }
          : p.on_track === "wrong_direction"
            ? { cls: "target-exceeded", mark: "⚠", text: "moving away from goal" }
            : null;

  return (
    <div className="weekly-goal-block">
      <div className="weekly-goal-head">
        <span className="weekly-goal-sublabel">Goal</span>
        <span className="weekly-goal-target">
          {(readout.trend_weight_kg! - p.kg_to_go).toFixed(1)} kg
        </span>
      </div>
      {p.at_goal ? (
        <p className="weekly-goal-detail">At goal — maintaining</p>
      ) : (
        <>
          <div className="progress weekly-goal-channel" aria-hidden>
            <div className="progress-bar" style={{ width: `${p.pct_to_goal}%` }} />
          </div>
          <p className="weekly-goal-detail">
            {Math.abs(p.kg_to_go).toFixed(1)} kg to go
            {p.projected_date && <> · projected {fmtShortDate(p.projected_date)}</>}
          </p>
        </>
      )}
      {verdict && (
        <p className={`weekly-goal-verdict ${verdict.cls}`}>
          <span aria-hidden>{verdict.mark}</span> {verdict.text}
        </p>
      )}
    </div>
  );
}

function WeeklySummaryEmpty({
  readout,
  hasGoal,
  onSetGoal,
  variant,
}: {
  readout: WeeklyReadout;
  hasGoal: boolean;
  onSetGoal: () => void;
  variant: "portrait" | "strip";
}) {
  return (
    <div className={`weekly-summary-card${variant === "strip" ? " is-strip" : ""}`}>
      <div className="weekly-summary-head">
        <span className="weekly-summary-label">Weekly Trend</span>
      </div>
      <p className="empty-state weekly-summary-empty">
        A trend needs about two weeks of weigh-ins to settle.
        {readout.trend_weight_kg !== null && (
          <> Latest trend weight {readout.trend_weight_kg.toFixed(1)} kg.</>
        )}
      </p>
      {!hasGoal && (
        <button type="button" className="weekly-goal-affordance" onClick={onSetGoal}>
          Set a goal weight
        </button>
      )}
    </div>
  );
}

export default function WeeklySummaryCard({
  readout,
  hasGoal,
  onSetGoal,
  variant = "portrait",
}: {
  readout: WeeklyReadout;
  hasGoal: boolean;
  onSetGoal: () => void;
  variant?: "portrait" | "strip";
}) {
  if (readout.rate_kg_per_week === null) {
    return (
      <WeeklySummaryEmpty
        readout={readout}
        hasGoal={hasGoal}
        onSetGoal={onSetGoal}
        variant={variant}
      />
    );
  }

  const rate = readout.rate_kg_per_week;
  const { sign, mag } = fmtRate(rate);
  const deficit = readout.implied_deficit_kcal_per_day ?? 0;
  const deficitWord =
    Math.abs(deficit) < 25 ? "at maintenance" : deficit > 0 ? "below maintenance" : "above maintenance";

  return (
    <div className={`weekly-summary-card${variant === "strip" ? " is-strip" : ""}`}>
      <div className="weekly-summary-head">
        <span className="weekly-summary-label">Weekly Trend</span>
        <span className="weekly-summary-window">14-day</span>
      </div>

      <div className="weekly-rate-hero">
        <div className="weekly-rate-number">
          {sign}
          {mag}
          <span className="weekly-rate-unit">kg / wk</span>
        </div>
        <div className="weekly-rate-dir">{directionWord(rate)}</div>
      </div>

      <dl className="weekly-stat-rows">
        <div className="weekly-stat-row">
          <dt>Trend weight</dt>
          <dd>{readout.trend_weight_kg !== null ? `${readout.trend_weight_kg.toFixed(1)} kg` : "—"}</dd>
        </div>
        <div className="weekly-stat-row">
          <dt>Avg intake</dt>
          <dd>
            {readout.avg_intake_kcal !== null
              ? `${Math.round(readout.avg_intake_kcal).toLocaleString("en-GB")} kcal`
              : "—"}
          </dd>
        </div>
      </dl>

      <p className="weekly-deficit">
        {deficitWord === "at maintenance"
          ? "≈ at maintenance"
          : `≈ ${Math.abs(Math.round(deficit)).toLocaleString("en-GB")} kcal/day ${deficitWord}`}
      </p>

      {readout.projection ? (
        <GoalBlock readout={readout} />
      ) : (
        <button type="button" className="weekly-goal-affordance" onClick={onSetGoal}>
          Set a goal weight
        </button>
      )}
    </div>
  );
}
