"use client";

/**
 * Shared chart plumbing for the d3 dashboard charts.
 * Charts render SVG paths during React render (SSR-correct); only the
 * hover overlay needs client interactivity.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { scaleLinear, scaleTime, type ScaleTime } from "d3-scale";

export const CHART_FONT = "var(--font-mono)";
export const AXIS_COLOR = "#6B6B6B";
export const GRID_COLOR = "#D4C5B0";
export const PLOT_BG = "#F2F0EB";

export const MARGIN = { top: 16, right: 56, bottom: 36, left: 56 };

export function useMeasuredWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, width];
}

export function makeXScale(
  dates: string[],
  innerWidth: number,
): ScaleTime<number, number> {
  const first = dates.length ? new Date(dates[0]) : new Date("2024-01-01");
  const last = dates.length ? new Date(dates[dates.length - 1]) : new Date("2024-01-02");
  return scaleTime().domain([first, last]).range([0, innerWidth]);
}

export const makeYScale = (domain: [number, number], innerHeight: number) =>
  scaleLinear().domain(domain).range([innerHeight, 0]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTickDate(d: Date, spanDays?: number): string {
  // long ranges tick on month/year boundaries — the year is the signal there
  if (spanDays !== undefined && spanDays > 180) {
    return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear() % 100).padStart(2, "0")}`;
  }
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatHoverDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export interface TooltipRow {
  label: string;
  value: string;
  color: string;
}

export interface HoverState {
  index: number;
  x: number;
  rows: TooltipRow[];
  dateIso: string;
}

/** Find the nearest date index for a mouse x position. */
export function useUnifiedHover(
  dates: string[],
  xScale: ScaleTime<number, number>,
  rowsForIndex: (i: number) => TooltipRow[],
) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const onMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      if (dates.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const t = xScale.invert(px).getTime();
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < dates.length; i++) {
        const d = Math.abs(Date.parse(`${dates[i]}T00:00:00Z`) - t);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      setHover({
        index: best,
        x: xScale(new Date(`${dates[best]}T00:00:00Z`)),
        rows: rowsForIndex(best),
        dateIso: dates[best],
      });
    },
    [dates, xScale, rowsForIndex],
  );

  const onLeave = useCallback(() => setHover(null), []);

  return { hover, onMove, onLeave };
}

export function ChartTooltip({
  hover,
  containerWidth,
}: {
  hover: HoverState;
  containerWidth: number;
}) {
  const flip = hover.x + MARGIN.left > containerWidth - 200;
  return (
    <div
      className="chart-tooltip"
      style={{
        left: flip ? undefined : hover.x + MARGIN.left + 12,
        right: flip ? containerWidth - hover.x - MARGIN.left + 12 : undefined,
        top: MARGIN.top + 8,
      }}
    >
      <div className="tooltip-date">{formatHoverDate(hover.dateIso)}</div>
      {hover.rows.map((row) => (
        <div key={row.label}>
          <span style={{ color: row.color }}>●</span> {row.label}: {row.value}
        </div>
      ))}
    </div>
  );
}

export function XAxis({
  xScale,
  innerHeight,
}: {
  xScale: ScaleTime<number, number>;
  innerHeight: number;
}) {
  // ~90px per label keeps ticks readable down to phone widths
  const [x0, x1] = xScale.range();
  const ticks = xScale.ticks(Math.max(2, Math.min(6, Math.floor((x1 - x0) / 90))));
  const [d0, d1] = xScale.domain();
  const spanDays = (d1.getTime() - d0.getTime()) / 86_400_000;
  return (
    <g transform={`translate(0,${innerHeight})`}>
      {ticks.map((t, i) => (
        <g key={i} transform={`translate(${xScale(t)},0)`}>
          <line y2={4} stroke={AXIS_COLOR} strokeWidth={0.5} />
          <text y={18} textAnchor="middle" fontSize={11} fill={AXIS_COLOR}>
            {formatTickDate(t, spanDays)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function YAxis({
  yScale,
  innerWidth,
  side = "left",
  grid = true,
  tickFormat,
}: {
  yScale: ReturnType<typeof scaleLinear<number, number>>;
  innerWidth: number;
  side?: "left" | "right";
  grid?: boolean;
  tickFormat?: (v: number) => string;
}) {
  const ticks = yScale.ticks(6);
  const fmt = tickFormat ?? ((v: number) => String(v));
  return (
    <g transform={side === "right" ? `translate(${innerWidth},0)` : undefined}>
      {ticks.map((t, i) => (
        <g key={i} transform={`translate(0,${yScale(t)})`}>
          {grid && side === "left" && (
            <line x2={innerWidth} stroke={GRID_COLOR} strokeWidth={0.5} />
          )}
          <text
            x={side === "left" ? -8 : 8}
            dy="0.32em"
            textAnchor={side === "left" ? "end" : "start"}
            fontSize={11}
            fill={AXIS_COLOR}
          >
            {fmt(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; dash?: string; kind?: "line" | "area"; opacity?: number }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-muted)",
        marginBottom: 8,
      }}
    >
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width={22} height={10}>
            {it.kind === "area" ? (
              <rect x={5} y={0} width={12} height={10} fill={it.color} fillOpacity={it.opacity ?? 1} rx={2} />
            ) : (
              <line
                x1={0}
                y1={5}
                x2={22}
                y2={5}
                stroke={it.color}
                strokeWidth={2}
                strokeDasharray={it.dash}
              />
            )}
          </svg>
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function EmptyChart({ height }: { height: number }) {
  return (
    <div className="empty-state" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      No data available
    </div>
  );
}
