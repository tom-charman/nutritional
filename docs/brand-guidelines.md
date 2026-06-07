# Brand Guidelines — "The Precision Tool"

## 0. The Essence

Ask one question of every decision: **what if an expert artisan, who makes
highly precise tools, made this app?**

Not a robot. Not a lab. A person sharpening a knife on a stone by feel.
Someone sanding by hand until the wood is perfect under their fingertips.
The result is insanely precise — and warm, connected to nature and feeling.
The precision comes *from* the care, not instead of it.

"Nutritional" is not a gamified tracker; it is that artisan's instrument.
The user respects their biometric data the way a chef respects their knife.
The app rejects the noise of modern applications in favor of the quiet,
heavy confidence of a well-made tool.

## 1. The Three Pillars

### Wabi-Sabi Precision
The data is mathematically exact; the presentation feels organic — perfect
numbers recorded on textured paper.
*In the app:* tabular mono numerals aligned to the digit; chart curves that
never overshoot the data (monotone interpolation); the kaolin paper grain
breathing through the plot area; one pigment rendered in many dilutions.

### Material Honesty
Digital elements have physical weight and friction. **Buttons press; they
do not blink.**
*In the app:* every button travels 1px down into a pressed shadow; the
range selector is a detented switch with a raised key; inputs are debossed
like ruled logbook lines; toasts settle in and out; the ✓/⚠ verdicts stamp
in like a hanko seal; shadows are warmed Sumi ink, never pure black.

### Zen Essentialism (Ma)
If it isn't necessary, cut it away. White space is an active element.
*In the app:* no legend strips — series are named where they end, like an
engraved scale; one heavy datum line and four faint pencil guides instead
of a grid; menus simply appear (a sharp tool doesn't perform an entrance);
empty states are a single italic aside.

## 2. Color — Pigments, Not Hex Codes

Colors are ground from minerals and plants. Two systems:

### Foundation & action
- **Kaolin White** `#F2F0EB` — the paper. Always textured, never flat.
- **Sumi Iron** `#2B2B2B` — the ink. Warm charcoal, never pure black.
- **Aizome Indigo** `#2C3E50` — primary actions: save, navigate, the active
  detent. Durability and work.
- **Wakatake Bamboo** `#789440` — success, growth, and the weight series.
  *Never use red for success.*
- **Bengara Rust** `#A04000` — delete, error, caloric overage. Warning
  without alarmism (warning deliberately ≡ danger).

### The nutrient pigment system — one hue, four dilutions
Every nutrient owns ONE hue identity, applied thick or thin like ink:

| dilution | where | character |
|---|---|---|
| `ink` | dots, bars, tooltip bullets, accent text | full-strength; the recognizable identity (≥4.5:1 on white) |
| `line` | chart strokes | deep enough for a 2.25px line on Kaolin (≥3:1) |
| `area` | stacked fills | soft mineral washes; the stack reads as one warm composition on a cool iron base |
| `wash` | background tints | the faintest dilution |

Fat is *always* Baked Clay; sugar is *always* the amber-mustard family —
the tone varies with the surface, the pigment never changes. Exact values
live in `docs/design-system.md` and `lib/constants.ts` (single source).

## 3. Typography — the hand and the gauge

- **Display: Fraunces** (variable; opsz/SOFT/WONK axes). The calligraphic
  hand: optical sizing sharpens it at text sizes and lets it relax and
  carve at display sizes. The hero calories number is its showcase
  (`opsz 144`). Stand-in for Editorial New / GT Super.
- **Data: JetBrains Mono.** The engineering gauge: strictly gridded,
  tabular numerals (`tnum`) wherever digits form columns. Numbers are
  *never* set in a display or handwriting face.

## 4. Motion — stillness, then one gesture

A returning daily user doesn't want a show. Charts and pages are still;
readings fade up once and hold. The single signature gesture is **settle**
(`--ease-settle`): things come to rest like a well-fitted drawer. Presses
are instant and physical. Exits are quicker than entrances. Menus and
dropdowns don't animate at all. `prefers-reduced-motion` disables
everything.

## 5. The Anti-Kitsch Charter

Capturing hand-made warmth must never become theme-park craft:

- No wood, brass, or leather textures; no skeuomorphic frames
- No rotary knobs or dials where a switch is more usable
- No handwriting or brush fonts — least of all for numerals
- No springy/bouncy easings (overshoot contradicts precision)
- No glow, blur, or 3D; no glossy gradients
- No paper-tear edges, coffee stains, or fake imperfection
- No red/green semantic coloring of deltas (goal direction is the user's)
- No entrance animation replayed on every visit
- The texture stays subliminal (≤3–5% opacity); if you notice it, it's too loud

## 6. Where the essence lives (quick tour)

- The **calories-remaining number**: Fraunces at display optical size —
  the carved focal reading of the whole instrument.
- The **dashboard charts**: engraved end-of-line readouts, a caliper
  hairline with contact dots, one scribed datum line, an etched 100% RDI
  mark, a pencil-shaded weight band.
- The **range selector**: a machined detented switch.
- The **macro bars**: pigment channels with hanko-stamped verdicts.
- The **navbar**: a kraft book binding; the active page is ink-stamped.
