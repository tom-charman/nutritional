"use client";

/**
 * Nutrients vs RDI — five inked lines over an etched 100% datum.
 * Strokes use the deep `line` dilution with a paper casing (the page shows
 * through where lines cross); engraved end labels carry name + current %.
 * Production RDI values: SatFat 30g, Sugar 90g, Fibre 30g, Salt 6g, Calcium 1000mg.
 */
import { useCallback } from "react";
import { curveMonotoneX, line } from "d3-shape";
import {
  NUTRIENT_COLORS,
  NUTRIENT_SHORT_NAMES,
  RDI_GUIDELINES,
  type NutrientKey,
} from "@/lib/constants";
import type { NutrientsRdiData } from "@/lib/domain/charts/prepare";
import {
  CaliperLine,
  ChartTooltip,
  ContactDot,
  DirectLabels,
  EmptyChart,
  KAOLIN,
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
  const { narrow, height, margin } = chartFrame(width);
  const innerWidth = Math.max(width - margin.left - margin.right, 100);
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = makeXScale(data.dates, innerWidth);
  const yScale = makeYScale([0, 200], innerHeight);

  type Point = { date: Date; value: number | null };
  const lineGen = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => xScale(p.date))
    .y((p) => yScale(Math.min(p.value as number, 200)))
    .curve(curveMonotoneX);

  const active = SERIES.filter((s) => data.series[s.key]);

  const rowsForIndex = useCallback(
    (i: number) =>
      active.map((s) => {
        const v = data.series[s.key][i];
        return {
          label: NUTRIENT_SHORT_NAMES[s.key],
          value: v === null ? "—" : `${v.toFixed(1)}% of RDI`,
          color: NUTRIENT_COLORS[s.key].ink,
        };
      }),
    [data, active],
  );

  const { hover, onMove, onLeave } = useUnifiedHover(data.dates, xScale, rowsForIndex);

  if (data.dates.length === 0) return <EmptyChart height={height} />;

  // Latest readings + engraved end labels
  const latest = active
    .map((s) => {
      const last = lastDefined(data.series[s.key]);
      return last ? { s, last } : null;
    })
    .filter((x): x is { s: (typeof SERIES)[number]; last: { value: number; index: number } } => x !== null);

  const readout = latest.map(({ s, last }) => ({
    value: `${Math.round(last.value)}`,
    unit: "%",
    label: NUTRIENT_SHORT_NAMES[s.key],
  }));

  const endLabels = latest.map(({ s, last }) => ({
    label: NUTRIENT_SHORT_NAMES[s.key],
    value: `${Math.round(last.value)}%`,
    color: NUTRIENT_COLORS[s.key].line,
    y: yScale(Math.min(last.value, 200)),
  }));

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <LatestReadout items={narrow ? [] : readout} />
      {narrow && (
        <Legend
          items={active.map((s) => ({
            label: `${NUTRIENT_SHORT_NAMES[s.key]} (${RDI_GUIDELINES[s.key]}${s.unit})`,
            color: NUTRIENT_COLORS[s.key].line,
          }))}
        />
      )}
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          <YAxis
            yScale={yScale}
            innerWidth={innerWidth}
            tickFormat={(v) => `${v}%`}
            tickValues={[0, 50, 100, 150, 200]}
            baselineAt={0}
          />
          <XAxis xScale={xScale} innerHeight={innerHeight} />

          {/* 100% RDI — an etched datum: incised line with an engraved label */}
          <g>
            <line
              x1={0}
              x2={innerWidth}
              y1={yScale(100)}
              y2={yScale(100)}
              stroke="#2B2B2B"
              strokeWidth={1}
              strokeOpacity={0.35}
            />
            <line
              x1={0}
              x2={innerWidth}
              y1={yScale(100) + 1.5}
              y2={yScale(100) + 1.5}
              stroke="#2B2B2B"
              strokeWidth={0.5}
              strokeOpacity={0.08}
            />
            <rect
              x={innerWidth - 112}
              y={yScale(100) - 6}
              width={108}
              height={12}
              fill={KAOLIN}
            />
            <text
              x={innerWidth - 6}
              y={yScale(100)}
              dy="0.32em"
              textAnchor="end"
              fontSize={9}
              letterSpacing="0.08em"
              fill="#6B6B6B"
            >
              100% RDI Target
            </text>
          </g>

          {active.map((s) => {
            const pts: Point[] = data.dates.map((d, i) => ({
              date: new Date(`${d}T00:00:00Z`),
              value: data.series[s.key][i],
            }));
            const d = lineGen(pts) ?? undefined;
            return (
              <g key={s.key}>
                {/* paper casing — the page shows through where lines cross */}
                <path d={d} fill="none" stroke={KAOLIN} strokeWidth={5.25} strokeLinecap="round" strokeLinejoin="round" />
                <path
                  d={d}
                  fill="none"
                  stroke={NUTRIENT_COLORS[s.key].line}
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {!narrow && (
            <DirectLabels items={endLabels} innerWidth={innerWidth} innerHeight={innerHeight} />
          )}

          {hover && (
            <g>
              <CaliperLine hover={hover} innerHeight={innerHeight} />
              {active.map((s) => {
                const v = data.series[s.key][hover.index];
                return v === null ? null : (
                  <ContactDot
                    key={s.key}
                    x={hover.x}
                    y={yScale(Math.min(v, 200))}
                    color={NUTRIENT_COLORS[s.key].line}
                  />
                );
              })}
            </g>
          )}
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
