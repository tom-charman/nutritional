"use client";

/**
 * Weekly Trend card — the Cutter's "am I in a deficit, and when do I hit my goal?".
 *
 * The story is energy-balance first: recent intake vs estimated maintenance gives a
 * deficit (the hero), which predicts a rate, which drives the goal projection. When
 * the deficit is within the noise floor we say "holding" and show no ETA. Numbers are
 * neutral ink — the sign + words carry direction, never colour (brand rule).
 */
import type { ReactNode } from "react";
import { formatKcal } from "@/lib/format";
import type { WeeklyReadout } from "@/lib/domain/summary/weekly";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const kcal = (v: number) => `${formatKcal(v)} kcal`;

/** The goal + projection block (shown when a goal is set). */
function GoalBlock({ readout, onSetGoal }: { readout: WeeklyReadout; onSetGoal: () => void }) {
  const p = readout.projection;
  if (!p) return null;
  const goalKg = readout.trend_weight_kg! - p.kg_to_go;
  const rate = readout.predicted_rate_kg_per_week;

  let line: string;
  if (p.status === "at_goal") {
    line = "At goal — maintaining";
  } else if (p.weeks_to_goal !== null && p.projected_date) {
    const ratePart = rate !== null ? ` · ${Math.abs(rate).toFixed(2)} kg/wk` : "";
    line = `${Math.abs(p.kg_to_go).toFixed(1)} kg to go${ratePart} · ~${fmtDate(p.projected_date)}`;
  } else if (p.status === "holding") {
    line = `${Math.abs(p.kg_to_go).toFixed(1)} kg to go · holding — eat below maintenance to lose`;
  } else {
    // gaining while the goal is below, or otherwise moving away
    line = `${Math.abs(p.kg_to_go).toFixed(1)} kg to go · not losing at the moment`;
  }

  return (
    <div className="weekly-goal-block">
      <div className="weekly-goal-head">
        <span className="weekly-goal-sublabel">Goal</span>
        <span className="weekly-goal-target">{goalKg.toFixed(1)} kg</span>
        <button type="button" className="weekly-goal-edit" onClick={onSetGoal}>
          edit
        </button>
      </div>
      <p className="weekly-goal-detail">{line}</p>
    </div>
  );
}

/** Title row with the optional "hide" affordance. */
function Head({ onHide }: { onHide?: () => void }) {
  return (
    <div className="weekly-summary-head">
      <span className="weekly-summary-label">Weekly Trend</span>
      {onHide && (
        <button type="button" className="weekly-hide-link" onClick={onHide} title="Hide this panel">
          hide
        </button>
      )}
    </div>
  );
}

function Empty({
  readout,
  hasGoal,
  onSetGoal,
  onHide,
  variant,
}: {
  readout: WeeklyReadout;
  hasGoal: boolean;
  onSetGoal: () => void;
  onHide?: () => void;
  variant: "portrait" | "strip";
}) {
  return (
    <div className={`weekly-summary-card${variant === "strip" ? " is-strip" : ""}`}>
      <Head onHide={onHide} />
      <p className="empty-state weekly-summary-empty">
        {readout.trend_weight_kg === null
          ? "Log a couple of weeks of weigh-ins and a maintenance estimate will appear here."
          : "Need about two weeks of weigh-ins to estimate maintenance."}
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

/**
 * Dashboard variant — a single quiet mono line, NOT a hero card: it sits just above
 * the chart (which already shows maintenance / trend weight in its readout), so it
 * carries only the non-duplicated story — deficit, predicted rate, goal ETA.
 */
function StripSummary({
  readout,
  hasGoal,
  onSetGoal,
  onHide,
}: {
  readout: WeeklyReadout;
  hasGoal: boolean;
  onSetGoal: () => void;
  onHide?: () => void;
}) {
  const d = readout.deficit_kcal_per_day;
  const p = readout.projection;
  const rate = readout.predicted_rate_kg_per_week;

  let main: ReactNode;
  if (d === null) {
    main = <span className="weekly-strip-muted">add a couple of weeks of weigh-ins for an estimate</span>;
  } else if (Math.abs(d) < 75) {
    main = <>holding · eating near maintenance</>;
  } else {
    main = (
      <>
        <strong className="weekly-strip-num">
          {d > 0 ? "−" : "+"}
          {Math.abs(Math.round(d)).toLocaleString("en-GB")}
        </strong>{" "}
        kcal/day {d > 0 ? "below" : "above"} maintenance
      </>
    );
  }

  let proj: ReactNode = null;
  if (p) {
    if (p.status === "at_goal") proj = "at goal — maintaining";
    else if (p.weeks_to_goal !== null && p.projected_date)
      proj = (
        <>
          {rate !== null && <>{Math.abs(rate).toFixed(2)} kg/wk · </>}
          goal {(readout.trend_weight_kg! - p.kg_to_go).toFixed(1)} kg · ~{fmtDate(p.projected_date)}
        </>
      );
    else proj = `${Math.abs(p.kg_to_go).toFixed(1)} kg to go`;
  }

  return (
    <div className="weekly-summary-card is-strip">
      <span className="weekly-strip-label">Weekly trend</span>
      <span className="weekly-strip-main">{main}</span>
      {proj && <span className="weekly-strip-proj">{proj}</span>}
      <span className="weekly-strip-actions">
        {hasGoal ? (
          <button type="button" className="weekly-goal-edit" onClick={onSetGoal}>
            edit goal
          </button>
        ) : d !== null ? (
          <button type="button" className="weekly-goal-edit" onClick={onSetGoal}>
            set a goal
          </button>
        ) : null}
        {onHide && (
          <button type="button" className="weekly-hide-link" onClick={onHide}>
            hide
          </button>
        )}
      </span>
    </div>
  );
}

export default function WeeklySummaryCard({
  readout,
  hasGoal,
  onSetGoal,
  onHide,
  variant = "portrait",
}: {
  readout: WeeklyReadout;
  hasGoal: boolean;
  onSetGoal: () => void;
  onHide?: () => void;
  variant?: "portrait" | "strip";
}) {
  if (variant === "strip") {
    return <StripSummary readout={readout} hasGoal={hasGoal} onSetGoal={onSetGoal} onHide={onHide} />;
  }
  if (readout.deficit_kcal_per_day === null || readout.avg_intake_kcal === null) {
    return (
      <Empty
        readout={readout}
        hasGoal={hasGoal}
        onSetGoal={onSetGoal}
        onHide={onHide}
        variant={variant}
      />
    );
  }

  const deficit = readout.deficit_kcal_per_day;
  const atMaintenance = Math.abs(deficit) < 75;
  const word = deficit > 0 ? "below maintenance" : "above maintenance";

  return (
    <div className="weekly-summary-card">
      <Head onHide={onHide} />

      {/* HERO — the energy deficit (the engine). Neutral ink; sign + word carry direction. */}
      <div className="weekly-deficit-hero">
        {atMaintenance ? (
          <div className="weekly-deficit-flat">≈ at maintenance</div>
        ) : (
          <>
            <div className="weekly-deficit-number">
              {deficit > 0 ? "−" : "+"}
              {Math.abs(Math.round(deficit)).toLocaleString("en-GB")}
            </div>
            <div className="weekly-deficit-unit">kcal / day · {word}</div>
          </>
        )}
      </div>

      <dl className="weekly-stat-rows">
        <div className="weekly-stat-row">
          <dt>Intake · 7-day</dt>
          <dd>{kcal(readout.avg_intake_kcal)}</dd>
        </div>
        <div className="weekly-stat-row">
          <dt>Maintenance · est.</dt>
          <dd>{readout.est_maintenance_kcal !== null ? kcal(readout.est_maintenance_kcal) : "—"}</dd>
        </div>
        <div className="weekly-stat-row">
          <dt>Trend weight</dt>
          <dd>{readout.trend_weight_kg !== null ? `${readout.trend_weight_kg.toFixed(1)} kg` : "—"}</dd>
        </div>
      </dl>

      {readout.projection ? (
        <GoalBlock readout={readout} onSetGoal={onSetGoal} />
      ) : (
        <button type="button" className="weekly-goal-affordance" onClick={onSetGoal}>
          Set a goal weight
        </button>
      )}
    </div>
  );
}
