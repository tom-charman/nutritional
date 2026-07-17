"use client";

/**
 * Calories vs Weight — the instrument version.
 *  - Calories (left axis): Sumi ink line, 30-day rolling avg, monotone curve
 *  - Weight trend (right axis): the HEAVY bamboo datum — a responsive EWMA curve,
 *    the cutter's actual trajectory. Raw morning/evening are demoted to faint
 *    pencil guides + a shaded band (detail on hover), per "one heavy line + faint
 *    guides".
 *  - Goal weight (when set): a faint dotted bamboo guide, labelled at its end.
 *  - Engraved readouts at the line ends replace the legend; latest values
 *    head the plot; hover is a caliper with contact dots.
 */
import { useCallback } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import { WEIGHT_COLOR } from "@/lib/constants";
import { formatKcal } from "@/lib/format";
import type { CaloriesWeightData } from "@/lib/domain/charts/prepare";
import {
  CaliperLine,
  ChartTooltip,
  ContactDot,
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

const CALORIES_COLOR = "#2B2B2B";

type Point = { date: Date; value: number | null };

export default function CaloriesWeightChart({ data }: { data: CaloriesWeightData }) {
  const [containerRef, width] = useMeasuredWidth();
  const { narrow, height, margin } = chartFrame(width);
  const innerWidth = Math.max(width - margin.left - margin.right, 100);
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = makeXScale(data.dates, innerWidth);
  const yCal = makeYScale(data.y1Limits, innerHeight);
  const yWeight = makeYScale(data.y2Limits, innerHeight);

  const toPoints = (values: (number | null)[]): Point[] =>
    data.dates.map((d, i) => ({ date: new Date(`${d}T00:00:00Z`), value: values[i] }));

  const calLine = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => xScale(p.date))
    .y((p) => yCal(p.value as number))
    .curve(curveMonotoneX);

  const weightLine = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => xScale(p.date))
    .y((p) => yWeight(p.value as number))
    .curve(curveMonotoneX);

  // Pencil-shaded band between morning and evening weight
  type BandPoint = { date: Date; m: number | null; e: number | null };
  const bandPoints: BandPoint[] = data.dates.map((d, i) => ({
    date: new Date(`${d}T00:00:00Z`),
    m: data.weight_morning[i],
    e: data.weight_evening[i],
  }));
  const band = area<BandPoint>()
    .defined((p) => p.m !== null && p.e !== null)
    .x((p) => xScale(p.date))
    .y0((p) => yWeight(p.m as number))
    .y1((p) => yWeight(p.e as number))
    .curve(curveMonotoneX);

  const rowsForIndex = useCallback(
    (i: number) => {
      const rows = [];
      const cal = data.calories_avg[i];
      const t = data.weight_trend[i];
      // Morning/evening read the RAW series — only real weigh-in days carry a
      // value, so an interpolated fill is never shown as a discrete measurement.
      const m = data.weight_morning_raw[i];
      const e = data.weight_evening_raw[i];
      if (cal !== null) rows.push({ label: "Calories (30-day avg)", value: `${formatKcal(cal)} kcal`, color: CALORIES_COLOR });
      if (t !== null) rows.push({ label: "Weight (trend)", value: `${t.toFixed(1)} kg`, color: WEIGHT_COLOR });
      if (m !== null) rows.push({ label: "Weight (morning)", value: `${m.toFixed(1)} kg`, color: WEIGHT_COLOR });
      if (e !== null) rows.push({ label: "Weight (evening)", value: `${e.toFixed(1)} kg`, color: WEIGHT_COLOR });
      return rows;
    },
    [data],
  );

  const { hover, onMove, onLeave } = useUnifiedHover(data.dates, xScale, rowsForIndex);

  if (data.dates.length === 0) return <EmptyChart height={height} />;

  // The weight scale rule — with no right axis, this caliper bracket says
  // what a kilogram looks like at the current zoom. Pick the smallest
  // round span that draws at least ~36px tall.
  const kgPerPx = (data.y2Limits[1] - data.y2Limits[0]) / innerHeight;
  const ruleKg = [0.5, 1, 2, 5, 10].find((kg) => kg / kgPerPx >= 36) ?? 10;
  const rulePx = ruleKg / kgPerPx;

  // Latest readings — the instrument's primary display
  const lastCal = lastDefined(data.calories_avg);
  const lastTrend = lastDefined(data.weight_trend);
  const lastMaint = lastDefined(data.maintenance);
  const goal = data.goal_weight_kg;
  const goalInRange = goal !== null && goal >= data.y2Limits[0] && goal <= data.y2Limits[1];
  const readout = [
    ...(lastCal
      ? [{ value: formatKcal(lastCal.value), unit: "kcal", label: "30-day avg" }]
      : []),
    ...(lastMaint
      ? [{ value: formatKcal(lastMaint.value), unit: "kcal", label: "maintenance (est.)" }]
      : []),
    ...(lastTrend
      ? [{ value: lastTrend.value.toFixed(1), unit: "kg", label: "trend weight" }]
      : []),
  ];

  const directLabels = [
    ...(lastCal
      ? [
          {
            label: "Calories",
            value: `${Math.round(lastCal.value).toLocaleString("en-US")}`,
            color: CALORIES_COLOR,
            y: yCal(lastCal.value),
          },
        ]
      : []),
    ...(lastTrend
      ? [
          {
            label: "Trend",
            value: `${lastTrend.value.toFixed(1)} kg`,
            color: WEIGHT_COLOR,
            y: yWeight(lastTrend.value),
          },
        ]
      : []),
    ...(goalInRange
      ? [
          {
            label: "Goal",
            value: `${goal.toFixed(1)} kg`,
            color: WEIGHT_COLOR,
            y: yWeight(goal),
          },
        ]
      : []),
  ];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <LatestReadout items={readout} />
      {narrow && (
        <Legend
          items={[
            { label: "Calories (30-day avg)", color: CALORIES_COLOR },
            { label: "Weight (trend)", color: WEIGHT_COLOR },
          ]}
        />
      )}
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
      >
        <defs>
          {/* graphite shading: denser at the band's heart, soft at the edges */}
          <linearGradient id="weightBand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={WEIGHT_COLOR} stopOpacity="0.05" />
            <stop offset="50%" stopColor={WEIGHT_COLOR} stopOpacity="0.17" />
            <stop offset="100%" stopColor={WEIGHT_COLOR} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <g transform={`translate(${margin.left},${margin.top})`}>
          <YAxis
            yScale={yCal}
            innerWidth={innerWidth}
            side="left"
            baselineAt={data.y1Limits[0]}
          />
          <XAxis xScale={xScale} innerHeight={innerHeight} />

          {/* Goal guide — a faint dotted pencil line, labelled at its end (no legend). */}
          {goalInRange && (
            <line
              x1={0}
              x2={innerWidth}
              y1={yWeight(goal)}
              y2={yWeight(goal)}
              stroke={WEIGHT_COLOR}
              strokeWidth={0.75}
              strokeOpacity={0.55}
              strokeDasharray="1 5"
            />
          )}

          {/* Raw morning/evening: faint pencil guides + shaded band (detail on hover) */}
          <path d={band(bandPoints) ?? undefined} fill="url(#weightBand)" stroke="none" />
          <path
            d={weightLine(toPoints(data.weight_morning)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={1}
            strokeOpacity={0.3}
            strokeDasharray="6 2 1 2"
          />
          <path
            d={weightLine(toPoints(data.weight_evening)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={1}
            strokeOpacity={0.3}
            strokeDasharray="5 4"
          />

          <path
            d={calLine(toPoints(data.calories_avg)) ?? undefined}
            fill="none"
            stroke={CALORIES_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Weight trend — the heavy bamboo datum */}
          <path
            d={weightLine(toPoints(data.weight_trend)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {!narrow && (
            <DirectLabels items={directLabels} innerWidth={innerWidth} innerHeight={innerHeight} />
          )}

          {/* weight scale rule — a caliper bracket: "this distance = N kg" */}
          <g transform={`translate(10,${innerHeight - 10 - rulePx})`} aria-label="weight scale">
            <line x1={0} x2={0} y1={0} y2={rulePx} stroke={WEIGHT_COLOR} strokeWidth={1} strokeOpacity={0.8} />
            <line x1={-3} x2={3} y1={0} y2={0} stroke={WEIGHT_COLOR} strokeWidth={1} strokeOpacity={0.8} />
            <line x1={-3} x2={3} y1={rulePx} y2={rulePx} stroke={WEIGHT_COLOR} strokeWidth={1} strokeOpacity={0.8} />
            <text x={7} y={rulePx / 2} dy="0.32em" fontSize={10} fill={WEIGHT_COLOR} fillOpacity={0.95}>
              {ruleKg} kg
            </text>
          </g>

          {hover && (
            <g>
              <CaliperLine hover={hover} innerHeight={innerHeight} />
              {data.calories_avg[hover.index] !== null && (
                <ContactDot
                  x={hover.x}
                  y={yCal(data.calories_avg[hover.index] as number)}
                  color={CALORIES_COLOR}
                />
              )}
              {data.weight_trend[hover.index] !== null && (
                <ContactDot
                  x={hover.x}
                  y={yWeight(data.weight_trend[hover.index] as number)}
                  color={WEIGHT_COLOR}
                />
              )}
              {/* Contact dots only on real weigh-in days (raw series), matching
                  the tooltip — the interpolated line stays, but no dot claims a
                  measurement that wasn't taken. */}
              {data.weight_morning_raw[hover.index] !== null && (
                <ContactDot
                  x={hover.x}
                  y={yWeight(data.weight_morning_raw[hover.index] as number)}
                  color={WEIGHT_COLOR}
                />
              )}
              {data.weight_evening_raw[hover.index] !== null && (
                <ContactDot
                  x={hover.x}
                  y={yWeight(data.weight_evening_raw[hover.index] as number)}
                  color={WEIGHT_COLOR}
                />
              )}
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
