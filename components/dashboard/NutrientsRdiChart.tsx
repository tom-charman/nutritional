"use client";

/**
 * Nutrients vs RDI — the etched grid.
 *
 * Five overlapping lines always tangled in a band around 100% (where a
 * well-fed person lives), so each nutrient gets its own strip: a soft
 * pigment wash filled to its value, crossed by a common etched 100% datum
 * at the same height in every strip. Where the wash pools ABOVE the datum,
 * the pigment deepens (ink dilution) — overage is visible at a glance
 * without a single overlapping line. The inked top edge carries precision;
 * the engraved % at each strip's end is the instrument's reading.
 *
 * The datum carries the CURRENT target semantics like an engineering
 * drawing hatches the solid side of a boundary: a LIMIT is a ceiling
 * (hatch strokes rise above the line — the wall you shouldn't cross);
 * a TARGET is a floor (strokes hang below — the shelf you stand on).
 */
import { useCallback } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import {
  NUTRIENT_COLORS,
  NUTRIENT_SHORT_NAMES,
  RDI_GUIDELINES,
  type NutrientKey,
  type TargetMode,
} from "@/lib/constants";
import { macroIndicator } from "@/lib/domain/targets";
import type { NutrientsRdiData } from "@/lib/domain/charts/prepare";
import {
  AXIS_COLOR,
  CaliperLine,
  ChartTooltip,
  ContactDot,
  EmptyChart,
  KAOLIN,
  XAxis,
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

const STRIP_LABEL_H = 20; // mono caption above each strip
const STRIP_GAP = 18;
const BOTTOM = 30; // shared date axis
const READOUT_W = 64; // engraved % gutter at the right

export default function NutrientsRdiChart({
  data,
  modes,
}: {
  data: NutrientsRdiData;
  modes?: Record<string, TargetMode>;
}) {
  const [containerRef, width] = useMeasuredWidth();
  const narrow = width <= 560;
  const stripH = narrow ? 48 : 76;

  const active = SERIES.filter((s) => data.series[s.key]);
  const n = active.length;
  const height = 12 + n * (STRIP_LABEL_H + stripH + STRIP_GAP) - STRIP_GAP + BOTTOM + 8;

  const marginLeft = narrow ? 10 : 16;
  const innerWidth = Math.max(width - marginLeft - READOUT_W, 100);
  const xScale = makeXScale(data.dates, innerWidth);
  // One shared scale, capped at 150%: daily life happens around 100, so the
  // datum sits at 2/3 height with real amplitude around it. Values beyond
  // 150 peg flat against the strip's top — a pinned needle, honestly read
  // via the deep overage pigment and the engraved %.
  const CAP = 150;
  const yScale = makeYScale([0, CAP], stripH);

  const plotHeight = n * (STRIP_LABEL_H + stripH + STRIP_GAP) - STRIP_GAP;

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

  if (data.dates.length === 0) return <EmptyChart height={320} />;

  type Point = { date: Date; value: number | null };
  const clamp = (v: number) => Math.min(v, CAP);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <g transform={`translate(${marginLeft},12)`}>
          {active.map((s, si) => {
            const tones = NUTRIENT_COLORS[s.key];
            const values = data.series[s.key];
            const pts: Point[] = data.dates.map((d, i) => ({
              date: new Date(`${d}T00:00:00Z`),
              value: values[i],
            }));

            // soft wash filled from the floor to the value
            const washArea = area<Point>()
              .defined((p) => p.value !== null)
              .x((p) => xScale(p.date))
              .y0(yScale(0))
              .y1((p) => yScale(clamp(p.value as number)))
              .curve(curveMonotoneX);

            // the pigment deepens where it pools above the datum
            const overArea = area<Point>()
              .defined((p) => p.value !== null && (p.value as number) > 100)
              .x((p) => xScale(p.date))
              .y0(yScale(100))
              .y1((p) => yScale(clamp(p.value as number)))
              .curve(curveMonotoneX);

            // the inked top edge — precision over the wash
            const edge = line<Point>()
              .defined((p) => p.value !== null)
              .x((p) => xScale(p.date))
              .y((p) => yScale(clamp(p.value as number)))
              .curve(curveMonotoneX);

            const last = lastDefined(values);
            const stripTop = si * (STRIP_LABEL_H + stripH + STRIP_GAP) + STRIP_LABEL_H;
            const hoverValue = hover ? values[hover.index] : null;
            const mode = modes?.[s.key];
            // verdict per the entry-channel grammar (value vs the 100% rule)
            const verdict = last && mode ? macroIndicator(last.value, 100, mode) : null;
            // ceiling/floor hatching: strokes on the forbidden/solid side
            const hatchDir = mode === "limit" ? -1 : 1;
            const hatches: number[] = [];
            if (mode) {
              for (let hx = 10; hx < innerWidth - 110; hx += 30) hatches.push(hx);
            }

            return (
              <g key={s.key} transform={`translate(0,${stripTop})`}>
                {/* caption: name · RDI reference */}
                <text x={0} y={-7} fontSize={10} fill={AXIS_COLOR} letterSpacing="0.06em">
                  {NUTRIENT_SHORT_NAMES[s.key].toUpperCase()}
                  <tspan fill="#A0A0A0"> · {RDI_GUIDELINES[s.key]}{s.unit}</tspan>
                  {mode && (
                    <tspan fill="#A0A0A0" letterSpacing="0.1em">
                      {"  "}{mode === "limit" ? "LIMIT" : "TARGET"}
                    </tspan>
                  )}
                </text>

                <path d={washArea(pts) ?? undefined} fill={tones.area} fillOpacity={0.55} />
                <path d={overArea(pts) ?? undefined} fill={tones.ink} fillOpacity={0.45} />
                <path
                  d={edge(pts) ?? undefined}
                  fill="none"
                  stroke={tones.line}
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* the common etched datum — same height in every strip */}
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(100)}
                  y2={yScale(100)}
                  stroke="#2B2B2B"
                  strokeWidth={0.75}
                  strokeOpacity={0.5}
                />
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(100) + 1.25}
                  y2={yScale(100) + 1.25}
                  stroke="#2B2B2B"
                  strokeWidth={0.5}
                  strokeOpacity={0.1}
                />
                {hatches.map((hx) => (
                  <line
                    key={hx}
                    x1={hx}
                    y1={yScale(100)}
                    x2={hx + 4}
                    y2={yScale(100) + hatchDir * 4.5}
                    stroke="#2B2B2B"
                    strokeWidth={0.75}
                    strokeOpacity={0.3}
                  />
                ))}
                {si === 0 && (
                  <g>
                    <rect
                      x={innerWidth - 100}
                      y={yScale(100) - 6}
                      width={100}
                      height={12}
                      fill={KAOLIN}
                    />
                    <text
                      x={innerWidth - 2}
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
                )}

                {/* engraved reading at the strip's end */}
                {last && (
                  <text
                    x={innerWidth + 10}
                    y={Math.max(10, Math.min(stripH - 2, yScale(clamp(last.value)) + 4))}
                    fontSize={13}
                    fontWeight={600}
                    fill={tones.ink}
                  >
                    {Math.round(last.value)}%
                    {verdict === "met" && (
                      <tspan fill="#789440" fontSize={11}> ✓</tspan>
                    )}
                    {(verdict === "warning" || verdict === "exceeded") && (
                      <tspan fill="#A04000" fontSize={11}> ⚠</tspan>
                    )}
                  </text>
                )}

                {/* caliper contact */}
                {hover && hoverValue !== null && (
                  <ContactDot x={hover.x} y={yScale(clamp(hoverValue))} color={tones.ink} />
                )}
              </g>
            );
          })}

          {/* shared caliper hairline through all strips */}
          {hover && (
            <g transform={`translate(0,${STRIP_LABEL_H})`}>
              <CaliperLine hover={hover} innerHeight={plotHeight - STRIP_LABEL_H} />
            </g>
          )}

          {/* one shared date axis under the last strip */}
          <g transform={`translate(0,${plotHeight})`}>
            <line x2={innerWidth} stroke={AXIS_COLOR} strokeWidth={0.75} />
            <XAxis xScale={xScale} innerHeight={0} />
          </g>

          <rect
            y={0}
            width={innerWidth}
            height={plotHeight}
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
