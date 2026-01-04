# Visual Migration Plan (Web) — “The Precision Tool”

Version: 2026-01-02

## Visual assets to create/provide (so the UI can look “real”)

These are the concrete files a developer/designer will likely need to add under `nutritional/assets/` to achieve the intended “ink on paper / etched tool” finish.

### A) Texture & material assets

- **Paper grain overlay** (required)
	- `assets/textures/grain.png` (or `.webp`) — small tileable noise (not gritty), used via `body::before`.
- **Paper/porcelain base texture** (optional but recommended)
	- `assets/textures/kaolin-paper.png` — subtle fibre/porcelain variation that can sit under the grain.
- **Technical grid background** (optional)
	- `assets/textures/graph-grid.svg` — faint blueprint grid used behind Plotly charts and/or weight-range shading.

### B) Iconography (“etched wireframe”)

- **SVG icon set (1px stroke, no fill)** (recommended)
	- `assets/icons/search.svg`
	- `assets/icons/edit.svg`
	- `assets/icons/delete.svg`
	- `assets/icons/warning.svg` (if you don’t use typographic symbols)
	- Notes:
		- Use `stroke="currentColor"` so CSS can control active/inactive states.
		- Prefer consistent viewBox and sizing (e.g., 20×20).

### C) Chart pattern assets (Plotly limitations workaround)

- **Cross-hatch pattern** for the weight “cloud” (optional)
	- `assets/patterns/crosshatch.svg` (tileable)
	- Can be applied as a CSS background on the graph container or as a Plotly `layout.image`.

### D) Fonts (license + delivery decision)

- If you plan to **self-host fonts** (recommended for consistency/offline/dev parity), provide:
	- `assets/fonts/EditorialNew.woff2` (or a licensed substitute)
	- `assets/fonts/BerkeleyMono.woff2` (or a licensed substitute)
- If you plan to **load fonts from a CDN**, document:
	- the exact font family names to use in CSS/Plotly
	- fallback stacks for when fonts are unavailable

---

This plan updates the original visual checklist using the v2.0 brand guidelines and the *actual UI surface area* in this repository (Dash + dash-bootstrap-components + Plotly + custom CSS).

Goal: migrate the entire app UI to the new brand without leaving “old system” visuals behind.

Non-goals (for now): sound/haptics, mobile-specific behaviors, new pages/features.

---

## 0) Where visuals live in this repo (inventory)

The app’s visuals are split between **Dash layouts**, **custom CSS**, **Bootstrap defaults**, and **Plotly figure styling**.

### Global / shared

- `nutritional/assets/style.css`
	- Global design tokens (`:root` CSS variables)
	- Base typography and body background
	- Navbar styles, buttons, forms, dropdowns, tabs
	- All custom layout classes used by pages
- `nutritional/app.py`
	- The top navbar (`dbc.NavbarSimple`) and Bootstrap theme usage
	- External font includes (currently Inter via Google Fonts)

### Pages (Dash layouts and UI markup)

- `/` dashboard page: `nutritional/layout.py` (used by `nutritional/pages/home.py`)
	- Date range picker, rolling dropdown
	- Tabbed Plotly graphs and graph wrappers
- `/entry` daily entry: `nutritional/pages/entry.py`
	- Date picker + “Friday, January 02” header
	- Food search dropdown, receipt list, delete “×”
	- Nutrient progress bars, alerts, modal editor
- `/foods` food database: `nutritional/pages/foods.py`
	- Toolbar search input and “+ New Food” button
	- Master/detail editor, lots of form controls
	- Edit/delete icon buttons (currently emoji)
- `/history` history viewer: `nutritional/pages/history.py`
	- Date dropdown, summary bar, receipt list, measurements block
- Authorization/denied view: `nutritional/auth_utils.py`
	- Access denied alert UI

### Data visualization (Plotly styling)

- Shared utilities: `nutritional/plotting/utils.py`
	- Common layout defaults (currently “plotly_white”, light gray grids)
- Figures:
	- `nutritional/plotting/calories_weight.py` (calories line, weight range fill)
	- `nutritional/plotting/macros.py` (stacked area fills)
	- `nutritional/plotting/nutrients.py` (multi-line + 100% RDI line)
- Color palette source (currently vibrant): `nutritional/settings.py` (`COLOR_PALETTE`)

---

## 1) Strategy to ensure we don’t miss any visual element

This migration must be *mechanical and exhaustive*, not “best effort”. Use this coverage loop:

### 1.1 Create a “visual inventory checklist” from code

1) Enumerate all CSS classes referenced by Dash:
	 - Grep all `className=` values under `nutritional/pages/*.py`, `nutritional/layout.py`, and `nutritional/auth_utils.py`.
	 - Create a checklist table: **Class name → file(s) used → styling section in `assets/style.css`**.

2) Enumerate all custom CSS selectors actually defined:
	 - Parse `nutritional/assets/style.css` and list all class selectors (`.^\.`).
	 - Diff against the `className=` list.
	 - Outcome:
		 - Any class used but not styled gets a decision: *remove*, *style*, or *rename*.

3) Kill hard-coded colors/fonts:
	 - Grep for hex codes (`#RRGGBB`) and explicit font names (`Inter`, `sans-serif`) in:
		 - `nutritional/**/*.py`
		 - `nutritional/assets/style.css`
	 - Every found value must either:
		 - be replaced by a CSS variable, or
		 - be replaced by a brand palette constant, or
		 - be explicitly justified as “acceptable exception”.

4) Audit iconography (emoji counts as “temporary”):
	 - Grep for emoji and icon-like characters in placeholders and buttons (examples already present):
		 - Foods search placeholder uses `🔍`.
		 - Foods edit/delete uses `✏️`, `🗑️`.
		 - Entry target indicators use `⚠️` and `✓`.
	 - Replace with etched icons / typographic symbols per brand (details below).

### 1.2 Scope each page and sign-off per page

For each route (`/`, `/entry`, `/foods`, `/history`) do a “full page pass” after tokens are in place:

- Page background and surfaces
- Typography (headings, labels, inline metrics)
- Inputs (dropdown/date picker/text/number/select/radio)
- Buttons (primary/link/icon)
- Dividers, borders, list rows
- States: empty, hover, active, focus, disabled
- Alerts, modals
- Plotly charts on that page

---

## 2) Define the new brand tokens (single source of truth)

The app already uses CSS variables in `nutritional/assets/style.css`. Extend/replace them to match the Material Palette.

### 2.1 Palette mapping

| Brand concept | Token | Hex |
|---|---:|---:|
| Canvas | `--background` | `#F2F0EB` (Kaolin White) |
| Ink | `--text-main`, `--text-body` | `#2B2B2B` (Sumi Iron) |
| Edge / dividers | `--border` | `#A6A6A6` (Graphite) |
| Proteins | `--protein-*` | `#BFA67D` (Oxidized Brass) |
| Carbs | `--carbs-*` | `#8A9A85` (Matcha Stone) |
| Alerts / fats | `--danger`, `--fat-*` | `#C47E68` (Baked Terracotta) |

Notes:
- Keep “bg/surface” subtle: surfaces should feel like paper or frosted glass over paper, not bright cards.
- Borders/dividers should be visually “0.5px” thin. In CSS, emulate with:
	- `border-color: var(--border)`
	- `border-width: 1px` but reduce contrast and use `opacity`/alpha if needed, or use `box-shadow: inset 0 0 0 0.5px ...` where supported.

### 2.2 Typography tokens

Create font variables:

- `--font-display`: Editorial New (or a similar high-end serif)
- `--font-mono`: Berkeley Mono (or similar mono)

Apply rules:

- Headings + navigation links: `--font-display` with tracking `letter-spacing: 0.05em`.
- Quantitative data (kcal/g/kg/mg, all numeric badges, progress values, summary stats): `--font-mono`.
- Default text color everywhere: Sumi Iron (`#2B2B2B`). Avoid pure black.

Implementation note:
- Current code loads Inter twice (CSS `@import` + `app.py` external stylesheet). Migration should consolidate to the new fonts in one place.

---

## 3) Canvas & surfaces (washi paper + debossed tactility)

### 3.1 Kaolin base + grain overlay

Touchpoints:

- `nutritional/assets/style.css`: `body { background-color: ... }`

Checklist:

- Replace `--background` with Kaolin White.
- Add a global subtle grain overlay:
	- Add a small noise texture file under `nutritional/assets/` (e.g., `grain.png` or `grain.svg`).
	- Use a `body::before` fixed pseudo-element with `opacity: 0.01–0.02` and `pointer-events: none`.

### 3.2 Remove “floating” shadows; add inner shadows

Current:

- CSS defines `--shadow-sm/md/lg` and applies drop shadows on cards/buttons.

Target:

- Cards and panels: mostly flat with edge definition (Graphite line).
- Inputs: debossed / recessed look via `box-shadow: inset ...` (no glow).
- Buttons: pressed behavior should feel like “depress”, not hover glow.

Touchpoints:

- `nutritional/assets/style.css`
	- Buttons (`.btn-*`), forms (`input`, `.Select-control`), cards (`.card`, `.graph-wrapper`, `.detail-panel`, `.master-list`, `.receipt-list`)

---

## 4) Iconography & dividers (“etched”)

### 4.1 Replace emoji-based icons

Current hotspots:

- Foods page
	- Search placeholder includes `🔍` (`nutritional/pages/foods.py`)
	- Edit/delete controls render emoji (`✏️`, `🗑️`) (`nutritional/pages/foods.py`)
- Entry page
	- Target indicators use `⚠️` and `✓` (`nutritional/pages/entry.py`)
	- Delete is already `×` (good), but styling should become serif/etched (`.delete-icon`)
- CSS also injects a search emoji via `.search-input-wrapper::before`.

Target:

- Use etched SVG icons (1px stroke, no fill) for “Search”, “Edit”, “Delete”, and optionally “Warning/Target Met”.
- The “X” delete affordance should remain typographic `×` (serif-styled), not a circled icon.

Implementation approach (web-safe):

- Put SVG assets under `nutritional/assets/icons/`.
- Render via `html.Img` or inline SVG (preferred for stroke control).
- Avoid adding a new icon dependency unless necessary.

### 4.2 Dividers to 0.5px graphite

Touchpoints:

- `nutritional/assets/style.css`
	- `.receipt-item { border-bottom: ... }`
	- `.data-row`, `.food-item-row`, `.master-list-item`, `.navbar` borders
	- Tabs underline and active styles

Checklist:

- Replace all `--border` usage with Graphite.
- Reduce divider visual weight: remove heavy hover backgrounds and keep “ink-on-paper” subtlety.

---

## 5) Buttons & interactive elements

### 5.1 “+ New Food” becomes the Brass Coin

Touchpoint:

- `nutritional/pages/foods.py`: `dbc.Button("+ New Food", id="new-food-btn", color="primary")`
- `nutritional/assets/style.css`: `.btn-primary`

Checklist:

- Do **not** globally change all primary buttons into coins.
- Scope the Brass Coin styling to the specific button (by `id` or a new class).
- Requirements:
	- Perfect circle
	- Fill: Oxidized Brass (`#BFA67D`)
	- Very slight 45° linear gradient for matte sheen
	- Debossed “+” symbol (inset shadow), not glow

### 5.2 Inputs become logbook lines on the Food Database screen

Touchpoints:

- `nutritional/pages/foods.py`: all `dbc.Input`, `dbc.RadioItems`, etc.
- `nutritional/assets/style.css`: global input styling (`input`, `.form-control`, `.form-select`)

Checklist:

- On Foods page only:
	- Remove 4-sided borders
	- Use a single bottom border (Graphite)
	- Keep recessed tactile focus state (no blue glow)

Implementation detail:

- Add a page-scoping class on the Foods container (recommended) rather than relying on broad selectors.

### 5.3 Focus/hover behavior

- Replace blue focus rings (`box-shadow: 0 0 0 3px ...`) with a quieter “pressed/engraved” focus style.
- Keep accessibility: focus must remain visible.

---

## 6) Data visualization (“seismograph” + “ceramic glaze”)

### 6.1 Apply a single Plotly theme layer

Current:

- Each figure module hard-codes colors and `font=dict(family="Inter, sans-serif"...)`.
- Shared util `apply_common_layout()` exists but is not consistently applied.

Target:

- One shared “Nutritional brand chart theme” applied to all figures.

Touchpoints:

- `nutritional/plotting/utils.py`
- `nutritional/plotting/calories_weight.py`
- `nutritional/plotting/macros.py`
- `nutritional/plotting/nutrients.py`
- `nutritional/settings.py` (`COLOR_PALETTE`)

Checklist:

- Replace hard-coded colors with palette constants.
- Set chart font:
	- Labels/titles: Sumi Iron
	- Numeric text: Mono font (or a consistent chart font if Plotly font mixing is too painful)
- Background:
	- Transparent plot/paper backgrounds (already mostly true)
	- Add faint technical grid (Graphite at very low opacity)

### 6.2 Calories & weight chart (“seismograph”)

Touchpoint: `nutritional/plotting/calories_weight.py`

- Calories line:
	- Replace blue, thick, dashed style with **solid 1px Sumi Iron**.
	- Markers: small hollow circles.
- Weight range “cloud”:
	- Replace green alpha fill with cross-hatch or technical grid feel.
	- Practical approach in Plotly:
		- Use a low-opacity `layout.image` (SVG pattern) behind the fill area, or
		- Keep fill very faint and put grid behind via `plot_bgcolor`/CSS background on `.graph-wrapper`.

### 6.3 Macro breakdown (“ceramic glaze”)

Touchpoint: `nutritional/plotting/macros.py`

- Replace saturated digital fills with brand pigments.
- “Glaze” approximation (Plotly limitation: no true gradients for scatter fills):
	- Use lighter fillcolor + slightly darker edge line for each stacked segment.
	- Reduce contrast, remove harsh edges.

### 6.4 Nutrients vs RDI

Touchpoint: `nutritional/plotting/nutrients.py`

- Replace the red dashed RDI line with Sumi Iron (or Graphite) thin line.
- Ensure nutrient colors align with brand mapping:
	- Don’t use rainbow Tailwind palette; use brass/matcha/terracotta family cues.

---

## 7) Page-by-page execution checklist

### 7.1 Global: Navbar + base layout

Touchpoints:

- `nutritional/app.py` (NavbarSimple config)
- `nutritional/assets/style.css` (`.navbar`, `.navbar .nav-link`, `.navbar-brand`)

Checklist:

- Remove “bootstrap blue bar” styling:
	- Consider changing NavbarSimple props so CSS can fully control appearance (no `dark=True` / `color="primary"`).
- Typography:
	- Brand name and nav links use serif display font with tracking.
- Dividers:
	- Bottom border is Graphite, thin.

### 7.2 Dashboard (`/`)

Touchpoints:

- `nutritional/layout.py` (controls + tabs + graphs)
- `nutritional/assets/style.css` (`.control-section`, `.rolling-dropdown`, `.date-picker-style`, `.graph-wrapper`, `.nav-tabs`)

Checklist:

- Control bar inputs become debossed and quiet.
- Tabs become etched (no heavy underline).
- Graph containers look like paper/glass on Kaolin.

### 7.3 Daily Entry (`/entry`)

Touchpoints:

- `nutritional/pages/entry.py`
- `nutritional/assets/style.css` (`.daily-header`, `.daily-summary-bar`, `.receipt-list`, `.delete-icon`, `.progress-*`, `.target-*`, `.modal`)

Checklist:

- “Friday, January 02” header:
	- serif display font + tracking.
- Receipt list:
	- Graphite 0.5px dividers
	- Delete is serif `×` in Sumi Iron
- Progress bars:
	- Colors remapped to pigments
	- Track looks recessed; no neon colors
- Modal (targets editor):
	- Paper surface + subdued borders
	- Inputs debossed; no blue focus glow
- Remove emoji indicators (`⚠️`, `✓`) and replace with etched icons or typographic marks.

### 7.4 Food Database (`/foods`)

Touchpoints:

- `nutritional/pages/foods.py`
- `nutritional/assets/style.css` (`.toolbar`, `.search-input-rounded`, `.master-detail`, `.master-list-item`, `.detail-panel`, `.editor-grid`, `.icon-button`)

Checklist:

- Search input:
	- Remove emoji from placeholder and CSS `::before` injection.
	- Use etched icon or plain text.
- “+ New Food” becomes Brass Coin (scoped styling).
- Form inputs become logbook underlines (Foods page only).
- Edit/delete controls:
	- Replace emoji buttons with etched icons.

### 7.5 History (`/history`)

Touchpoints:

- `nutritional/pages/history.py`
- `nutritional/assets/style.css` (`.history-date-dropdown`, `.history-summary-compact`, `.measurement-container`)

Checklist:

- Summary bar uses mono for numeric values.
- Measurement blocks look like inset “notes” on paper (subtle inset shadow).

### 7.6 Access denied state

Touchpoint: `nutritional/auth_utils.py`

- Alerts should use terracotta family without screaming red.
- Typography and borders follow the same token rules.

---

## 8) Final “Artisan Test” acceptance criteria

Do this at the end on each page:

1) Zoom into a single receipt row (`.receipt-item`).
	 - If it reads like typical Bootstrap SaaS UI → fail.
	 - If it reads like a ledger/blueprint on paper → pass.

2) Grep-based verification:
	 - No remaining emoji used as icons.
	 - No remaining hard-coded Tailwind hex colors in plotting modules.
	 - No “Inter” in Plotly layout fonts unless explicitly approved.

3) Consistency:
	 - Same Kaolin background everywhere.
	 - Same Sumi ink text color everywhere.
	 - Graphite lines everywhere.
	 - Brass/matcha/terracotta used consistently for macro semantics.
