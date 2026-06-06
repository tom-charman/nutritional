"use client";

/**
 * Calories vs Weight — the instrument version.
 *  - Calories (left axis): Sumi ink line, 30-day rolling avg, monotone curve
 *  - Morning/Evening weight: bamboo dashdot/dash with a pencil-shaded band
 *  - Engraved readouts at the line ends replace the legend; latest values
 *    head the plot; hover is a caliper with contact dots.
 */
import { useCallback } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import { WEIGHT_COLOR } from "@/lib/constants";
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

  if (data.dates.length === 0) return <EmptyChart height={height} />;

  // Latest readings — the instrument's primary display
  const lastCal = lastDefined(data.calories_avg);
  const lastM = lastDefined(data.weight_morning);
  const lastE = lastDefined(data.weight_evening);
  const readout = [
    ...(lastCal
      ? [{ value: Math.round(lastCal.value).toLocaleString("en-US"), unit: "kcal", label: "30-day avg" }]
      : []),
    ...(lastM || lastE
      ? [
          {
            value: [lastM?.value.toFixed(1), lastE?.value.toFixed(1)]
              .filter(Boolean)
              .join(" / "),
            unit: "kg",
            label: "morning / evening",
          },
        ]
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
    ...(lastM
      ? [
          {
            label: "Weight m",
            value: `${lastM.value.toFixed(1)} kg`,
            color: WEIGHT_COLOR,
            y: yWeight(lastM.value),
          },
        ]
      : []),
    ...(lastE
      ? [
          {
            label: "Weight e",
            value: `${lastE.value.toFixed(1)} kg`,
            color: WEIGHT_COLOR,
            y: yWeight(lastE.value),
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
            { label: "Weight m", color: WEIGHT_COLOR, dash: "6 2 1 2" },
            { label: "Weight e", color: WEIGHT_COLOR, dash: "5 4" },
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

          <path d={band(bandPoints) ?? undefined} fill="url(#weightBand)" stroke="none" />
          <path
            d={calLine(toPoints(data.calories_avg)) ?? undefined}
            fill="none"
            stroke={CALORIES_COLOR}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={weightLine(toPoints(data.weight_morning)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={1.25}
            strokeDasharray="6 2 1 2"
          />
          <path
            d={weightLine(toPoints(data.weight_evening)) ?? undefined}
            fill="none"
            stroke={WEIGHT_COLOR}
            strokeWidth={1.25}
            strokeDasharray="5 4"
          />

          {!narrow && (
            <DirectLabels items={directLabels} innerWidth={innerWidth} innerHeight={innerHeight} />
          )}

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
              {data.weight_morning[hover.index] !== null && (
                <ContactDot
                  x={hover.x}
                  y={yWeight(data.weight_morning[hover.index] as number)}
                  color={WEIGHT_COLOR}
                />
              )}
              {data.weight_evening[hover.index] !== null && (
                <ContactDot
                  x={hover.x}
                  y={yWeight(data.weight_evening[hover.index] as number)}
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
