"use client";

/**
 * Macronutrient breakdown stacked area — port of plotting/macros.py.
 * Stack order (bottom→top): Protein, Other Carbs, Sugar, Other Fat, Saturated Fat.
 */
import { useCallback } from "react";
import { area, curveCatmullRom } from "d3-shape";
import type { MacroBreakdownData } from "@/lib/domain/charts/prepare";
import {
  ChartTooltip,
  EmptyChart,
  Legend,
  MARGIN,
  PLOT_BG,
  XAxis,
  YAxis,
  makeXScale,
  makeYScale,
  useMeasuredWidth,
  useUnifiedHover,
} from "./chartCommon";

const HEIGHT = 480;

const LAYERS: { key: keyof Omit<MacroBreakdownData, "dates">; label: string; color: string; opacity?: number }[] = [
  { key: "protein_cal", label: "Protein", color: "#2C4C5B" },
  { key: "other_carbs_cal", label: "Other Carbohydrates", color: "#C8963E" },
  { key: "sugar_cal", label: "Sugar", color: "#EBC374" },
  { key: "other_fat_cal", label: "Other Fat", color: "#BF6B59" },
  { key: "saturated_fat_cal", label: "Saturated Fat", color: "#E09F91", opacity: 0.7 },
];

export default function MacroBreakdownChart({ data }: { data: MacroBreakdownData }) {
  const [containerRef, width] = useMeasuredWidth();
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 100);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

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
    .curve(curveCatmullRom);

  const rowsForIndex = useCallback(
    (i: number) =>
      LAYERS.map((layer) => {
        const v = data[layer.key][i];
        return {
          label: layer.label,
          value: v === null ? "—" : `${Math.round(v)} kcal`,
          color: layer.color,
        };
      }).reverse(),
    [data],
  );

  const { hover, onMove, onLeave } = useUnifiedHover(data.dates, xScale, rowsForIndex);

  if (n === 0) return <EmptyChart height={HEIGHT} />;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Legend
        items={LAYERS.map((l) => ({
          label: l.label,
          color: l.color,
          kind: "area" as const,
          opacity: l.opacity,
        }))}
      />
      <svg className="chart-svg" viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <rect width={innerWidth} height={innerHeight} fill={PLOT_BG} />
          <YAxis yScale={yScale} innerWidth={innerWidth} />
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
                fill={layer.color}
                fillOpacity={layer.opacity ?? 1}
                stroke="none"
              />
            );
          })}

          {hover && (
            <line
              x1={hover.x}
              x2={hover.x}
              y1={0}
              y2={innerHeight}
              stroke="#6B6B6B"
              strokeWidth={0.75}
              strokeDasharray="3 3"
            />
          )}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={onLeave}
          />
        </g>
      </svg>
      {hover && <ChartTooltip hover={hover} containerWidth={width} />}
    </div>
  );
}
