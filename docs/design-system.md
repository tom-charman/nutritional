# Design System — tokens, components, conventions

The HOW companion to `brand-guidelines.md` (the WHY). Everything here has a
single source of truth in code: **colors/type tokens in `app/globals.css`
`:root` + `lib/constants.ts`** (the two must mirror each other), component
styles in `app/globals.css`, chart conventions in
`components/dashboard/chartCommon.tsx`.

## 1. Color tokens

### Foundation
| token | value | role |
|---|---|---|
| `--background` | `#F2F0EB` | Kaolin paper (body, washes) |
| `--surface` | `#FFFFFF` | cards/panels |
| `--border` / `--border-hover` | `#D4C5B0` / `#A0937D` | hairlines / interactive edges |
| `--text-main` / `--text-body` / `--text-muted` / `--text-disabled` | `#1A1A1A` `#2B2B2B` `#6B6B6B` `#A0A0A0` | ink hierarchy |
| `--primary` / `--primary-hover` / `--primary-light` | `#2C3E50` `#1F2A37` `#E8EEF5` | Aizome indigo actions |
| `--success` / `--success-bg` / `--success-text` | `#789440` `#E9F0E0` `#3F5C38` | bamboo |
| `--danger` / `--danger-bg` / `--danger-text` | `#A04000` `#F5E6D3` `#7A2E00` | rust (warning ≡ danger, deliberate) |

### Nutrient pigments — one hue, four dilutions
`--<nutrient>-{ink,line,area,wash}` in CSS ⇔ `NUTRIENT_COLORS[key].{ink,line,area,wash}` in TS.

| Nutrient | pigment | ink | line | area | wash |
|---|---|---|---|---|---|
| Protein | Iron Blue (anchor) | `#2C4C5B` | `#2C4C5B` | `#5E7C88` | `#E6ECEE` |
| Carbs | Antique Gold | `#B07D2B` | `#9A6A1E` | `#D9A848` | `#F5EEDD` |
| Sugar | Pale Amber (carbs' kin) | `#997C18` | `#8A6D00` | `#EBC374` | `#F8F0DA` |
| Fat | Baked Clay | `#BF6B59` | `#A8503D` | `#E5A593` | `#F3E6E0` |
| Sat Fat | Persimmon (fat's kin) | `#C8531C` | `#B5440F` | `#EFB48C` | `#FBEADD` |
| Fibre | Aged Pine | `#4F6D46` | `#3F5C38` | `#8FA587` | `#E7EFE5` |
| Salt | Wisteria | `#6E54A8` | `#5B4196` | `#B4A4D6` | `#EFEAF7` |
| Calcium | Verdigris | `#3F8C80` | `#2F7468` | `#9CC7BF` | `#E4F0ED` |
| Energy | Sumi (never tinted) | `#2B2B2B` | `#2B2B2B` | `#2B2B2B` | `#F2F0EB` |

Consumption map: dots/tooltip-bullets/badge-text → `ink` · chart strokes +
end labels → `line` · stacked fills + area swatches AND progress-channel
fills → `area` · badge/row tints AND progress-channel tracks → `wash`.
The daily macro bars are "pigment channels": the nutrient's own wash as the
empty track, its area tone as the fill (12px; preview channels 7px) —
Energy uses diluted sumi `#6B6B6B` on the kaolin wash. Contrast floors: ink ≥4.5:1 on white; line ≥3:1
on Kaolin (sugar line #8A6D00 ≈4.3:1 on Kaolin).
Weight series stays `WEIGHT_COLOR` bamboo `#789440`.

## 2. Typography

- **Display — Fraunces variable** (`next/font/google`, axes opsz/SOFT/WONK),
  exposed as `--font-crimson` → `--font-display`. Usage grades:
  - Hero reading (`.calories-remaining-number`): `opsz 144, SOFT 30, WONK 0`
  - Page/date headings: `opsz 60, SOFT 20`
  - Chart readout values (`.chart-readout-value`): `opsz 32`
  - Empty-state asides: italic, `opsz 18, SOFT 60`
- **Data — JetBrains Mono** (`--font-mono`). All amounts, units, labels in
  lists/forms/charts. `font-feature-settings: "tnum"` on every digit column
  (see the tnum rule at the top of globals.css for the class list).
- Scale: tiny 11 / xs 12 / sm 13 / base 15 / md 16 / lg 18 / xl 24 / 2xl 28 / 3xl 32 px.
- Uppercase section labels: 0.75rem, `letter-spacing: 0.05em`, with the
  28px scribed rule (`.section-label::after`).

## 3. Space, edges, depth

- Spacing: 4 / 8 / 12 / 16 / 24 / 32 (`--space-*`); inline styles must land on this scale.
- Radii: `--radius-sm 6` (controls) / `--radius-md 8` (cards) / `--radius-lg 12` (modals); 2px for the engraved tooltip plate; 4px bar tracks; 50% dots. Nothing else.
- Borders: 1px hairlines everywhere (no 0.5px).
- Shadows (warmed Sumi `rgba(43,38,34,…)`): `--shadow-sm/md/lg`, `--shadow-press` (inset, for pressed states), `--ring-focus` (warm brass, on every focusable).

## 4. Motion grammar

| token | value | use |
|---|---|---|
| `--ease-settle` | `cubic-bezier(0.22,1,0.36,1)` | entrances: toast, modal, chart wrapper, stamp-in |
| `--ease-press` | `cubic-bezier(0.4,0,0.6,1)` | hovers, presses, background shifts |
| `--ease-exit` | `ease-in` | exits (always quicker than entrances) |
| `--dur-instant / quick / settle` | 80 / 160 / 280ms | press / hover+exit / entrance |

Rules: menus/dropdowns never animate; charts fade up once per view change
(`.graph-wrapper` keyed by tab+range); nothing loops; `prefers-reduced-motion`
zeroes everything (global block at the bottom of globals.css).

## 5. Chart conventions (`components/dashboard/chartCommon.tsx`)

- **Frame**: no plot background; margins `{12, 132, 30, 44}` (right gutter
  carries engraved readouts); mobile ≤560px → 320px tall, narrow right,
  `Legend` instead of end labels.
- **Axes**: ≤4 dotted pencil guides (`1 5` dash, 0.7 opacity); ONE heavy
  datum via `baselineAt` (y=0 for stacks/percentages); x-ticks scored
  across the baseline (`y1=-2`).
- **Engraved readouts**: `DirectLabels` at line ends (name `line`-tone +
  value); `placeLabels` resolves collisions deterministically (SSR-safe);
  displaced labels get an honest leader tick. `LatestReadout` heads every
  chart with the current reading.
- **Caliper hover**: `CaliperLine` (solid 0.5px hairline + axis scribe),
  `ContactDot` (kaolin halo), engraved plate `.chart-tooltip` (2px radius,
  tnum two-column); pointer events; pinned top-center plate ≤560px;
  `touch-action: pan-y` on the overlay.
- **Curves**: `curveMonotoneX` only — never an interpolation that
  overshoots the data.
- **Reference lines**: etched datum (solid hairline + faint incised echo),
  label engraved on the line over a kaolin knockout.
- **The RDI tab is an etched grid**, not a multi-line chart: one strip per
  nutrient (76px desktop / 48px mobile), shared y-scale capped at 150% so
  the 100% datum sits at the same height in every strip; soft `area`-tone
  wash (0.55) filled to the value, `ink`-tone pooling (0.45) where it
  crosses the datum, `line`-tone inked top edge, engraved current % at the
  strip's end. Values past 150% peg flat — a pinned needle, honestly read
  via the deep pigment and the % readout. Rationale: a well-fed person
  lives near 100% on all five, so overlapping lines always tangle.

## 6. Component inventory (selectors are an e2e contract)

Stable selectors/roles asserted by `tests/e2e/` — **do not rename**:
`.toast`, `.modal`, `.combobox-option`, `.chart-tooltip` (+ "Calories" row),
`.ingredient-item`, `.macro-bar-*`, `.master-list-item`, `.meal-card`,
`.delete-icon`, `svg.chart-svg`, text `100% RDI Target`, `radiogroup`
"Date range" with `radio`+`aria-checked`, `tab` roles, data-testids
(`food-search`, `amount-input`, `add-button`, `weight-*`, `date-picker`,
`meal-*`, `save-meal`, `prev-day`/`next-day`).

Shared primitives: `ui/Combobox` (keyboard nav; opens on click/typing,
NEVER on programmatic focus), `ui/EditableAmount` (click→input,
Enter/blur commit, Esc cancel), `ui/Toast` (settle in/out, 3s),
`entry/NutrientPreview` (with targets → slim pigment channels mirroring the
daily bars, the entry's slice of the day; without targets → ink dots),
`entry/MacroProgressBars` (pigment channels incl. Energy, hanko verdicts).

Interaction grammar shared across pages: focus returns to search after an
add; explicit form-opens autofocus their first field; toasts are the one
feedback channel; × is the one delete affordance; nutrient lists always
follow `NUTRIENT_KEYS` order with `NUTRIENT_SHORT_NAMES` labels.

## 7. Do / Don't (against the walkthrough screenshots)

- DO let the stack read as a warm mineral gradient (02-macros) — if a band
  shouts, its `area` tone is wrong.
- DO name lines where they end (03-rdi) — if you're adding a legend strip,
  reconsider.
- DON'T reintroduce a plot-background rect, grid-on-every-tick, or
  cursor-chasing tooltips (the Plotly hangovers this system replaced).
- DON'T color a nutrient outside its family — sugar in the macro stack and
  sugar in the RDI lines are the same pigment at different dilutions.
- DON'T animate anything the user waits behind.

Visual audits: `npx tsx scripts/ux-walkthrough.ts` (real data, both
viewports) and `scripts/design-review.ts` (2× crops) — review the PNGs.
