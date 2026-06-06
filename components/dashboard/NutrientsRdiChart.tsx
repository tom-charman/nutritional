"use client";

/**
 * Nutrients vs RDI multi-line chart — port of plotting/nutrients.py.
 * Each nutrient normalized to % of RDI; fixed y [0,200]; dashed 100% line.
 * Production RDI values: SatFat 30g, Sugar 90g, Fibre 30g, Salt 6g, Calcium 1000mg.
 */
import { useCallback } from "react";
import { curveCatmullRom, line } from "d3-shape";
import {
  NUTRIENT_COLORS,
  NUTRIENT_SHORT_NAMES,
  RDI_GUIDELINES,
  type NutrientKey,
} from "@/lib/constants";
import type { NutrientsRdiData } from "@/lib/domain/charts/prepare";
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

/** Labels come from the one canonical short-name set. */
const SERIES: { key: NutrientKey; unit: string }[] = [
  { key: "saturated_fat_g", unit: "g" },
  { key: "sugar_g", unit: "g" },
  { key: "fibre_g", unit: "g" },
  { key: "salt_g", unit: "g" },
  { key: "calcium_mg", unit: "mg" },
];

export default function NutrientsRdiChart({ data }: { data: NutrientsRdiData }) {
  const [containerRef, width] = useMeasuredWidth();
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 100);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = makeXScale(data.dates, innerWidth);
  const yScale = makeYScale([0, 200], innerHeight);

  type Point = { date: Date; value: number | null };
  const lineGen = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => xScale(p.date))
    .y((p) => yScale(Math.min(p.value as number, 200)))
    .curve(curveCatmullRom);

  const rowsForIndex = useCallback(
    (i: number) =>
      SERIES.filter((s) => data.series[s.key]).map((s) => {
        const v = data.series[s.key][i];
        return {
          label: NUTRIENT_SHORT_NAMES[s.key],
          value: v === null ? "—" : `${v.toFixed(1)}% of RDI`,
          color: NUTRIENT_COLORS[s.key].ink,
        };
      }),
    [data],
  );

  const { hover, onMove, onLeave } = useUnifiedHover(data.dates, xScale, rowsForIndex);

  if (data.dates.length === 0) return <EmptyChart height={HEIGHT} />;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Legend
        items={SERIES.map((s) => ({
          label: `${NUTRIENT_SHORT_NAMES[s.key]} (${RDI_GUIDELINES[s.key]}${s.unit})`,
          color: NUTRIENT_COLORS[s.key].line,
        }))}
      />
      <svg className="chart-svg" viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <rect width={innerWidth} height={innerHeight} fill={PLOT_BG} />
          <YAxis yScale={yScale} innerWidth={innerWidth} tickFormat={(v) => `${v}%`} />
          <XAxis xScale={xScale} innerHeight={innerHeight} />

          {/* 100% RDI reference line */}
          <line
            x1={0}
            x2={innerWidth}
            y1={yScale(100)}
            y2={yScale(100)}
            stroke="#2B2B2B"
            strokeWidth={1}
            strokeOpacity={0.5}
            strokeDasharray="6 4"
          />
          <text
            x={innerWidth - 4}
            y={yScale(100) - 6}
            textAnchor="end"
            fontSize={11}
            fill="#6B6B6B"
          >
            100% RDI Target
          </text>

          {SERIES.filter((s) => data.series[s.key]).map((s) => {
            const pts: Point[] = data.dates.map((d, i) => ({
              date: new Date(`${d}T00:00:00Z`),
              value: data.series[s.key][i],
            }));
            return (
              <path
                key={s.key}
                d={lineGen(pts) ?? undefined}
                fill="none"
                stroke={NUTRIENT_COLORS[s.key].line}
                strokeWidth={1.5}
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
