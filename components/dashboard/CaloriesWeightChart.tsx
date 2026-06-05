"use client";

/**
 * Calories vs Weight dual-axis chart — port of plotting/calories_weight.py.
 *  - Calories (left axis): Sumi Iron #2B2B2B spline, 30-day rolling avg
 *  - Morning/Evening weight (right axis): Wakatake #789440 dashdot/dash
 *  - Shaded band between morning and evening weight
 */
import { useCallback } from "react";
import { area, curveCatmullRom, line } from "d3-shape";
import { WEIGHT_BAND_FILL, WEIGHT_COLOR } from "@/lib/constants";
import type { CaloriesWeightData } from "@/lib/domain/charts/prepare";
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

const CALORIES_COLOR = "#2B2B2B";
const HEIGHT = 480;

type Point = { date: Date; value: number | null };

export default function CaloriesWeightChart({ data }: { data: CaloriesWeightData }) {
  const [containerRef, width] = useMeasuredWidth();
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 100);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xScale = makeXScale(data.dates, innerWidth);
  const yCal = makeYScale(data.y1Limits, innerHeight);
  const yWeight = makeYScale(data.y2Limits, innerHeight);

  const toPoints = (values: (number | null)[]): Point[] =>
    data.dates.map((d, i) => ({ date: new Date(`${d}T00:00:00Z`), value: values[i] }));

  const calLine = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => xScale(p.date))
    .y((p) => yCal(p.value as number))
    .curve(curveCatmullRom);

  const weightLine = line<Point>()
    .defined((p) => p.value !== null)
    .x((p) => xScale(p.date))
    .y((p) => yWeight(p.value as number))
    .curve(curveCatmullRom);

  // Shaded band between morning and evening weight (both defined)
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
    .curve(curveCatmullRom);

  const rowsForIndex = useCallback(
    (i: number) => {
      const rows = [];
      const cal = data.calories_avg[i];
      const m = data.weight_morning[i];
      const e = data.weight_evening[i];
      if (cal !== null) rows.push({ label: "Calories", value: `${Math.round(cal)} kcal`, color: CALORIES_COLOR });
      if (m !== null) rows.push({ label: "Weight (morning)", value: `${m.toFixed(1)} kg`, color: WEIGHT_COLOR });
      if (e !== null) rows.push({ label: "Weight (evening)", value: `${e.toFixed(1)} kg`, color: WEIGHT_COLOR });
      return rows;
    },
    [data],
  );

  const { hover, onMove, onLeave } = useUnifiedHover(data.dates, xScale, rowsForIndex);

  if (data.dates.length === 0) return <EmptyChart height={HEIGHT} />;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <Legend
        items={[
          { label: "Calories (30-day avg)", color: CALORIES_COLOR },
          { label: "Weight kg (morning)", color: WEIGHT_COLOR, dash: "6 2 1 2" },
          { label: "Weight kg (evening)", color: WEIGHT_COLOR, dash: "5 4" },
        ]}
      />
      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width={width}
        height={HEIGHT}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <rect width={innerWidth} height={innerHeight} fill={PLOT_BG} />
          <YAxis yScale={yCal} innerWidth={innerWidth} side="left" />
          <YAxis yScale={yWeight} innerWidth={innerWidth} side="right" grid={false} />
          <XAxis xScale={xScale} innerHeight={innerHeight} />

          <path d={band(bandPoints) ?? undefined} fill={WEIGHT_BAND_FILL} stroke="none" />
          <path
            d={calLine(toPoints(data.calories_avg)) ?? undefined}
            fill="none"
            stroke={CALORIES_COLOR}
            strokeWidth={1.5}
          />
          <path
            d={weightLine(toPoints(data.weight_morning)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={1.5}
            strokeDasharray="6 2 1 2"
          />
          <path
            d={weightLine(toPoints(data.weight_evening)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />

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
