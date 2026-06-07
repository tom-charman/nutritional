"use client";

/**
 * Shared chart plumbing — the instrument kit.
 *
 * Charts are drawn like an artisan's measuring instrument: one heavy scribed
 * datum line, faint dotted pencil guides, engraved readouts at the line ends
 * (no legend round-tripping), and a caliper-style hover with contact dots.
 * SVG paths render during React render (SSR-correct); only hover hydrates.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { scaleLinear, scaleTime, type ScaleTime } from "d3-scale";

export const CHART_FONT = "var(--font-mono)";
export const AXIS_COLOR = "#6B6B6B";
export const GRID_COLOR = "#D4C5B0";
export const DATUM_COLOR = "#6B6B6B";
export const KAOLIN = "#F2F0EB";
/** kept for API compatibility — the plot rect is no longer painted */
export const PLOT_BG = "transparent";

export const MARGIN = { top: 12, right: 132, bottom: 30, left: 44 };
export const MARGIN_MOBILE = { top: 12, right: 16, bottom: 30, left: 40 };

/** Narrow screens get a shorter chart and no right readout gutter. */
export function chartFrame(width: number, tall = 480) {
  const narrow = width <= 560;
  return {
    narrow,
    height: narrow ? 320 : tall,
    margin: narrow ? MARGIN_MOBILE : MARGIN,
  };
}

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

// ==================== hover (the caliper) ====================

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

/** Find the nearest date index for a pointer x position (mouse or touch). */
export function useUnifiedHover(
  dates: string[],
  xScale: ScaleTime<number, number>,
  rowsForIndex: (i: number) => TooltipRow[],
) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const onMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
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

/** The caliper's hairline + axis date readout. Render inside the plot <g>. */
export function CaliperLine({
  hover,
  innerHeight,
}: {
  hover: HoverState;
  innerHeight: number;
}) {
  return (
    <g>
      <line
        x1={hover.x}
        x2={hover.x}
        y1={0}
        y2={innerHeight}
        stroke="#2B2B2B"
        strokeWidth={0.5}
        strokeOpacity={0.45}
      />
      {/* the axis reads out the measured position */}
      <line
        x1={hover.x}
        x2={hover.x}
        y1={innerHeight}
        y2={innerHeight + 6}
        stroke="#2B2B2B"
        strokeWidth={1}
        strokeOpacity={0.6}
      />
    </g>
  );
}

/** Contact dot — the caliper's measuring point on a series. */
export function ContactDot({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={4} fill={KAOLIN} />
      <circle cx={x} cy={y} r={2.5} fill={color} />
    </g>
  );
}

/** Engraved readout plate. Pinned top-center on narrow screens. */
export function ChartTooltip({
  hover,
  containerWidth,
}: {
  hover: HoverState;
  containerWidth: number;
}) {
  const narrow = containerWidth <= 560;
  if (narrow) {
    return (
      <div
        className="chart-tooltip pinned"
        style={{ left: "50%", transform: "translateX(-50%)", top: 4 }}
      >
        <div className="tooltip-date">{formatHoverDate(hover.dateIso)}</div>
        {hover.rows.map((row) => (
          <div className="tooltip-row" key={row.label}>
            <span>
              <span style={{ color: row.color }}>●</span> {row.label}
            </span>
            <span className="tooltip-value">{row.value}</span>
          </div>
        ))}
      </div>
    );
  }
  const flip = hover.x + MARGIN.left > containerWidth - 220;
  return (
    <div
      className="chart-tooltip"
      style={{
        left: flip ? undefined : hover.x + MARGIN.left + 14,
        right: flip ? containerWidth - hover.x - MARGIN.left + 14 : undefined,
        top: MARGIN.top + 8,
      }}
    >
      <div className="tooltip-date">{formatHoverDate(hover.dateIso)}</div>
      {hover.rows.map((row) => (
        <div className="tooltip-row" key={row.label}>
          <span>
            <span style={{ color: row.color }}>●</span> {row.label}
          </span>
          <span className="tooltip-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

// ==================== axes (hand-ruled) ====================

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
          {/* scribe mark crossing the baseline, like a scored line */}
          <line y1={-2} y2={5} stroke={AXIS_COLOR} strokeWidth={0.5} />
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
  tickValues,
  baselineAt,
}: {
  yScale: ReturnType<typeof scaleLinear<number, number>>;
  innerWidth: number;
  side?: "left" | "right";
  grid?: boolean;
  tickFormat?: (v: number) => string;
  tickValues?: number[];
  /** One heavy scribed datum line at this value — the line the eye rests on. */
  baselineAt?: number;
}) {
  const ticks = tickValues ?? yScale.ticks(4);
  const fmt = tickFormat ?? ((v: number) => String(v));
  return (
    <g transform={side === "right" ? `translate(${innerWidth},0)` : undefined}>
      {ticks.map((t, i) => (
        <g key={i} transform={`translate(0,${yScale(t)})`}>
          {grid && side === "left" && t !== baselineAt && (
            // faint dotted pencil guide, not a Plotly grid
            <line
              x2={innerWidth}
              stroke={GRID_COLOR}
              strokeWidth={0.75}
              strokeOpacity={0.7}
              strokeDasharray="1 5"
            />
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
      {baselineAt !== undefined && side === "left" && (
        <line
          transform={`translate(0,${yScale(baselineAt)})`}
          x2={innerWidth}
          stroke={DATUM_COLOR}
          strokeWidth={0.75}
        />
      )}
    </g>
  );
}

// ==================== engraved readouts ====================

export interface DirectLabelItem {
  label: string;
  /** optional second line / value, e.g. "2,481" */
  value?: string;
  color: string;
  /** data-space pixel y of the series' last defined point */
  y: number;
}

/**
 * Deterministic, SSR-safe label placement: sort by y, push down on overlap,
 * clamp to plot, push back up if the stack overflows the bottom.
 */
export function placeLabels(
  ys: number[],
  lineHeight: number,
  top: number,
  bottom: number,
): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed: number[] = [];
  for (let k = 0; k < order.length; k++) {
    const want = Math.max(order[k].y, k === 0 ? top : placed[k - 1] + lineHeight);
    placed.push(want);
  }
  // clamp into the plot from the bottom up
  for (let k = order.length - 1; k >= 0; k--) {
    const maxY = bottom - (order.length - 1 - k) * lineHeight;
    if (placed[k] > maxY) placed[k] = maxY;
    if (k < order.length - 1 && placed[k + 1] - placed[k] < lineHeight) {
      placed[k] = placed[k + 1] - lineHeight;
    }
  }
  const result = new Array(ys.length).fill(0);
  order.forEach((o, k) => {
    result[o.i] = placed[k];
  });
  return result;
}

/** Series names + current values engraved at the right edge of the plot. */
export function DirectLabels({
  items,
  innerWidth,
  innerHeight,
}: {
  items: DirectLabelItem[];
  innerWidth: number;
  innerHeight: number;
}) {
  if (items.length === 0) return null;
  const lineHeight = items.some((i) => i.value) ? 26 : 15;
  const placed = placeLabels(
    items.map((i) => i.y),
    lineHeight,
    8,
    innerHeight - 4,
  );
  return (
    <g>
      {items.map((item, i) => {
        const ly = placed[i];
        const displaced = Math.abs(ly - item.y) > 3;
        return (
          <g key={item.label}>
            {displaced && (
              // honest leader tick: the nudged label still points at its line
              <line
                x1={innerWidth + 2}
                y1={item.y}
                x2={innerWidth + 7}
                y2={ly}
                stroke={item.color}
                strokeWidth={0.5}
                strokeOpacity={0.6}
              />
            )}
            <text
              x={innerWidth + 10}
              y={ly}
              dy="0.32em"
              fontSize={11}
              fontWeight={500}
              fill={item.color}
            >
              {item.label}
            </text>
            {item.value && (
              <text
                x={innerWidth + 10}
                y={ly + 13}
                dy="0.32em"
                fontSize={11}
                fill={AXIS_COLOR}
              >
                {item.value}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ==================== latest readout header ====================

export interface ReadoutItem {
  value: string;
  unit?: string;
  label: string;
}

/** The instrument's primary reading — quiet header row above the plot. */
export function LatestReadout({ items }: { items: ReadoutItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="chart-readout">
      {items.map((item, i) => (
        <span key={item.label} className="chart-readout-item">
          {i > 0 && <span className="chart-readout-sep">·</span>}
          <span className="chart-readout-value">{item.value}</span>
          {item.unit && <span className="chart-readout-unit">{item.unit}</span>}
          <span className="chart-readout-label">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

// ==================== legend (mobile / area fallback) ====================

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

/** Last non-null value of a series, or null. */
export function lastDefined(values: (number | null)[]): { value: number; index: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v !== null) return { value: v, index: i };
  }
  return null;
}
