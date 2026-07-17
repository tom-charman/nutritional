"use client";

/**
 * Macronutrient breakdown — soft mineral bands stacked on the paper.
 * Stack order (bottom→top): Protein, Other Carbs, Sugar, Other Fat, Sat Fat.
 * Bands carry the soft `area` dilution; identity markers (tooltip bullets)
 * use `ink`. Direct band labels at the right edge replace the legend.
 */
import { useCallback } from "react";
import { area, curveMonotoneX } from "d3-shape";
import { NUTRIENT_COLORS } from "@/lib/constants";
import type { MacroBreakdownData } from "@/lib/domain/charts/prepare";
import {
  CaliperLine,
  ChartTooltip,
  DirectLabels,
  EmptyChart,
  LatestReadout,
  Legend,
  XAxis,
  YAxis,
  chartFrame,
  lastDefined,
  makeXScale,
  makeYScale,
  useMeasuredWidth,
  useUnifiedHover,
} from "./chartCommon";

const LAYERS: { key: keyof Omit<MacroBreakdownData, "dates">; label: string; area: string; ink: string }[] = [
  { key: "protein_cal", label: "Protein", area: NUTRIENT_COLORS.protein_g.area, ink: NUTRIENT_COLORS.protein_g.ink },
  { key: "other_carbs_cal", label: "Other Carbs", area: NUTRIENT_COLORS.carbohydrates_g.area, ink: NUTRIENT_COLORS.carbohydrates_g.ink },
  { key: "sugar_cal", label: "Sugar", area: NUTRIENT_COLORS.sugar_g.area, ink: NUTRIENT_COLORS.sugar_g.ink },
  { key: "other_fat_cal", label: "Other Fat", area: NUTRIENT_COLORS.fat_g.area, ink: NUTRIENT_COLORS.fat_g.ink },
  { key: "saturated_fat_cal", label: "Sat Fat", area: NUTRIENT_COLORS.saturated_fat_g.area, ink: NUTRIENT_COLORS.saturated_fat_g.ink },
];

export default function MacroBreakdownChart({
  data,
  readoutTotalLabel = "total",
  forceLegend = false,
}: {
  data: MacroBreakdownData;
  /** Caption for the readout's top figure (the last defined day's total). The
   *  planner passes "latest day" so it doesn't collide with the week's own total. */
  readoutTotalLabel?: string;
  /** Use the legend instead of right-edge band labels regardless of width —
   *  the planner's sparse weeks would otherwise detach the labels. */
  forceLegend?: boolean;
}) {
  const [containerRef, width] = useMeasuredWidth();
  const { narrow, height, margin } = chartFrame(width);
  const innerWidth = Math.max(width - margin.left - margin.right, 100);
  const innerHeight = height - margin.top - margin.bottom;

  const n = data.dates.length;

  // Build cumulative stack: lower[i] and upper[i] per layer
  const stacks: { lower: (number | null)[]; upper: (number | null)[] }[] = [];
  let running: (number | null)[] = new Array(n).fill(0);
  for (const layer of LAYERS) {
    const values = data[layer.key];
    const lower = running.slice();
    const upper = running.map((base, i) => {
      const v = values[i];
      if (base === null || v === null) return null;
      return base + v;
    });
    stacks.push({ lower, upper });
    running = upper;
  }

  const maxY = Math.max(
    100,
    ...running.filter((v): v is number => v !== null),
  );

  const xScale = makeXScale(data.dates, innerWidth);
  const yScale = makeYScale([0, Math.ceil(maxY * 1.05)], innerHeight);

  type StackPoint = { date: Date; lower: number | null; upper: number | null };
  const areaGen = area<StackPoint>()
    .defined((p) => p.lower !== null && p.upper !== null)
    .x((p) => xScale(p.date))
    .y0((p) => yScale(p.lower as number))
    .y1((p) => yScale(p.upper as number))
    .curve(curveMonotoneX);

  const rowsForIndex = useCallback(
    (i: number) =>
      LAYERS.map((layer) => {
        const v = data[layer.key][i];
        return {
          label: layer.label,
          value: v === null ? "—" : `${Math.round(v)} kcal`,
          color: layer.ink,
        };
      }).reverse(),
    [data],
  );

  const { hover, onMove, onLeave } = useUnifiedHover(data.dates, xScale, rowsForIndex);

  if (n === 0) return <EmptyChart height={height} />;

  // Latest reading: total + macro shares
  const lastTotal = lastDefined(running);
  const readout = [];
  if (lastTotal) {
    const i = lastTotal.index;
    const p = data.protein_cal[i] ?? 0;
    const c = (data.other_carbs_cal[i] ?? 0) + (data.sugar_cal[i] ?? 0);
    const f = (data.other_fat_cal[i] ?? 0) + (data.saturated_fat_cal[i] ?? 0);
    const total = lastTotal.value;
    readout.push({
      value: Math.round(total).toLocaleString("en-US"),
      unit: "kcal",
      label: readoutTotalLabel,
    });
    if (total > 0) {
      readout.push({
        value: `${Math.round((p / total) * 100)} / ${Math.round((c / total) * 100)} / ${Math.round((f / total) * 100)}`,
        unit: "%",
        label: "protein / carbs / fat",
      });
    }
  }

  // Isolated defined days (a planned day with no defined neighbour) draw no
  // area band — the segment has zero width — so render each as a thin column
  // per layer, otherwise a single/gapped plan looks like a blank chart.
  const isolatedColumns: { x: number; yTop: number; yBottom: number; fill: string }[] = [];
  for (let li = 0; li < LAYERS.length; li++) {
    for (let i = 0; i < n; i++) {
      const lo = stacks[li].lower[i];
      const up = stacks[li].upper[i];
      if (lo === null || up === null || up === lo) continue;
      const prevDef = i > 0 && stacks[li].upper[i - 1] !== null;
      const nextDef = i < n - 1 && stacks[li].upper[i + 1] !== null;
      if (prevDef || nextDef) continue;
      isolatedColumns.push({
        x: xScale(new Date(`${data.dates[i]}T00:00:00Z`)),
        yTop: yScale(up),
        yBottom: yScale(lo),
        fill: LAYERS[li].area,
      });
    }
  }

  // Direct band labels at right-edge mid-heights
  const lastIdx = lastTotal?.index ?? n - 1;
  const bandLabels = LAYERS.map((layer, li) => {
    const lower = stacks[li].lower[lastIdx];
    const upper = stacks[li].upper[lastIdx];
    if (lower === null || upper === null) return null;
    return {
      label: layer.label,
      color: layer.ink,
      y: yScale((lower + upper) / 2),
    };
  }).filter((x): x is { label: string; color: string; y: number } => x !== null);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <LatestReadout items={readout} />
      {(narrow || forceLegend) && (
        <Legend
          items={LAYERS.map((l) => ({ label: l.label, color: l.area, kind: "area" as const }))}
        />
      )}
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          <YAxis yScale={yScale} innerWidth={innerWidth} baselineAt={0} />
          <XAxis xScale={xScale} innerHeight={innerHeight} />

          {LAYERS.map((layer, li) => {
            const pts: StackPoint[] = data.dates.map((d, i) => ({
              date: new Date(`${d}T00:00:00Z`),
              lower: stacks[li].lower[i],
              upper: stacks[li].upper[i],
            }));
            return (
              <path
                key={layer.key}
                d={areaGen(pts) ?? undefined}
                fill={layer.area}
                stroke="none"
              />
            );
          })}

          {/* Thin columns for isolated defined days (no neighbouring band). */}
          {isolatedColumns.map((c, i) => (
            <rect
              key={`iso-${i}`}
              x={c.x - 3}
              width={6}
              y={c.yTop}
              height={Math.max(1, c.yBottom - c.yTop)}
              fill={c.fill}
            />
          ))}

          {!narrow && !forceLegend && (
            <DirectLabels items={bandLabels} innerWidth={innerWidth} innerHeight={innerHeight} />
          )}

          {hover && <CaliperLine hover={hover} innerHeight={innerHeight} />}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            style={{ touchAction: "pan-y" }}
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={onLeave}
          />
        </g>
      </svg>
      {hover && <ChartTooltip hover={hover} containerWidth={width} />}
    </div>
  );
}
