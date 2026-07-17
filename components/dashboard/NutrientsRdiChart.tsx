"use client";

/**
 * Nutrients vs Target — the etched grid.
 *
 * Overlapping lines always tangled in a band around 100% (where a
 * well-fed person lives), so each nutrient gets its own strip: a soft
 * pigment wash filled to its value, crossed by a common etched 100% datum
 * (the user's CURRENT daily target for that nutrient, not a generic RDI)
 * at the same height in every strip. Where the wash pools ABOVE the datum,
 * the pigment deepens (ink dilution) — overage is visible at a glance
 * without a single overlapping line. The inked top edge carries precision;
 * the engraved % at each strip's end is the instrument's reading.
 *
 * The CURRENT target semantics render as drafting poché — the whole
 * forbidden/aspirational zone is hatch-filled, not the line: a LIMIT
 * hatches the sky above the datum (don't let your pigment rise into it);
 * a TARGET hatches the floor below (bury it under your pigment — exposed
 * hatching is shortfall showing through). Region position is readable at
 * arm's length where stroke-direction ticks were not.
 */
import { useCallback } from "react";
import { area, curveMonotoneX, line } from "d3-shape";
import {
  NUTRIENT_BANDS,
  NUTRIENT_COLORS,
  NUTRIENT_SHORT_NAMES,
  NUTRIENT_UNITS,
  RDI_GUIDELINES,
  type NutrientKey,
  type TargetMode,
} from "@/lib/constants";
import { nutrientIndicator } from "@/lib/domain/targets";
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

/** Default strips (the dashboard's RDI tab) — keyed by RDI_GUIDELINES. */
const SERIES: NutrientKey[] = ["saturated_fat_g", "sugar_g", "fibre_g", "salt_g", "calcium_mg", "vitamin_c_mg"];

const READOUT_W = 64; // engraved % gutter at the right

export default function NutrientsRdiChart({
  data,
  modes,
  nutrients,
  guidelines = RDI_GUIDELINES,
  compact = false,
}: {
  data: NutrientsRdiData;
  modes?: Record<string, TargetMode>;
  /** Which nutrients to draw, in order. Defaults to the RDI five. */
  nutrients?: NutrientKey[];
  /** Per-nutrient denominator shown in the caption (defaults to RDI_GUIDELINES). */
  guidelines?: Partial<Record<NutrientKey, number>>;
  /** Mini mode: shorter strips, no date axis — for a single weekly-average point. */
  compact?: boolean;
}) {
  const [containerRef, width] = useMeasuredWidth();
  const narrow = width <= 560;
  const stripH = compact ? 30 : narrow ? 48 : 76;
  const STRIP_LABEL_H = compact ? 16 : 20; // mono caption above each strip
  const STRIP_GAP = compact ? 12 : 18;
  const BOTTOM = compact ? 4 : 30; // shared date axis (none in compact)

  const keys = nutrients ?? SERIES;
  const active = keys.filter((k) => data.series[k]).map((key) => ({ key }));
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
          value: v === null ? "—" : `${v.toFixed(1)}% of target`,
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
      <p className="chart-legend-note">
        Each strip fills to the day&rsquo;s % of its target · the etched line is 100% ·{" "}
        <span style={{ color: "#789440", fontWeight: 600 }}>✓</span> on target ·{" "}
        <span style={{ color: "#A04000", fontWeight: 600 }}>⚠</span> a target missed or a limit exceeded
      </p>
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <defs>
          {/* drafting poché: fine 45° sumi hatching for the semantic zones */}
          <pattern id="poche" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            {/* flat shadow veil (reads at arm's length) + fine hatch (reads up close) */}
            <rect width="5" height="5" fill="#2B2B2B" fillOpacity="0.055" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#2B2B2B" strokeWidth="0.7" strokeOpacity="0.16" />
          </pattern>
        </defs>
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
            const verdict =
              last && mode
                ? nutrientIndicator(s.key, last.value, 100, mode, NUTRIENT_BANDS[s.key])
                : null;

            return (
              <g key={s.key} transform={`translate(0,${stripTop})`}>
                {/* caption: name · RDI reference */}
                <text x={0} y={-7} fontSize={10} fill={AXIS_COLOR} letterSpacing="0.06em">
                  {NUTRIENT_SHORT_NAMES[s.key].toUpperCase()}
                  <tspan fill="#A0A0A0"> · {guidelines[s.key]}{NUTRIENT_UNITS[s.key]}</tspan>
                  {mode && (
                    <tspan fill="#A0A0A0" letterSpacing="0.1em">
                      {"  "}{mode === "limit" ? "LIMIT" : "TARGET"}
                    </tspan>
                  )}
                </text>

                <path d={washArea(pts) ?? undefined} fill={tones.area} />
                <path d={overArea(pts) ?? undefined} fill={tones.ink} fillOpacity={0.4} />
                <path
                  d={edge(pts) ?? undefined}
                  fill="none"
                  stroke={tones.line}
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* poché overlay — the whole semantic zone is hatched:
                    limit = the sky you must not rise into; target = the
                    floor you bury under pigment. Region position reads at
                    arm's length; pigment seen through the hatch marks
                    trespass (limits) or attainment (targets). */}
                {mode === "limit" && (
                  <rect x={0} y={0} width={innerWidth} height={yScale(100)} fill="url(#poche)" />
                )}
                {mode === "target" && (
                  <rect x={0} y={yScale(100)} width={innerWidth} height={stripH - yScale(100)} fill="url(#poche)" />
                )}

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

                {si === 0 && !compact && (
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
                      100% of target
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
          {!compact && hover && (
            <g transform={`translate(0,${STRIP_LABEL_H})`}>
              <CaliperLine hover={hover} innerHeight={plotHeight - STRIP_LABEL_H} />
            </g>
          )}

          {/* one shared date axis under the last strip (omitted in mini mode) */}
          {!compact && (
            <g transform={`translate(0,${plotHeight})`}>
              <line x2={innerWidth} stroke={AXIS_COLOR} strokeWidth={0.75} />
              <XAxis xScale={xScale} innerHeight={0} />
            </g>
          )}

          {!compact && (
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
          )}
        </g>
      </svg>
      {!compact && hover && <ChartTooltip hover={hover} containerWidth={width} />}
    </div>
  );
}
