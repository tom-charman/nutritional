# UI/UX Design Review

A designer's pass over the whole app, conducted by **acting as the user and
performing every action catalogued in [`docs/FEATURES.md`](./FEATURES.md)**,
capturing a before/after screenshot at each step, at **both** desktop
(1440×900) and mobile (390×844, Pixel 7, 2× DPI). The lens throughout is an
*incredible, consistently beautiful* experience with *extreme attention to
detail*.

## Method

- **Capture:** [`scripts/ux-review.ts`](../scripts/ux-review.ts) drives the full
  feature catalogue and writes paired screenshots to
  `tests/e2e/screenshots/ux-review/<desktop|mobile>/<section>/NN-state.png`.
  (Screenshots are git-ignored — regenerate with the command below.)
- **Data:** an isolated clone of the real local database (`nutritional_review`)
  — 516 foods, 9 meals, ~450 logged days — so charts, long product names, and a
  dense diary are all realistic. Destructive steps act only on throwaway
  `ZZ Review …` records and empty demo dates.
- **Run:**
  ```bash
  docker compose up -d
  AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
  DATABASE_URL=…/nutritional_review npx tsx scripts/ux-review.ts
  ```
- Screenshot paths below are relative to `tests/e2e/screenshots/ux-review/`.

---

## What's already excellent

This is a genuinely beautiful, opinionated product. Before the critique, the
craft worth preserving:

- **A coherent editorial identity.** Fraunces serif headings against JetBrains
  Mono data, on a warm Kaolin-paper ground with restrained ink — it reads like a
  well-set almanac, not a generic dashboard. (`desktop/entry/50-real-populated-day.png`)
- **A disciplined per-nutrient pigment system.** Each nutrient owns one colour and
  keeps it everywhere — entry macro bars, meal totals, the stacked macro chart, and
  the RDI panel. That consistency is what lets a user learn the palette once.
  (`desktop/dashboard/56-macro-breakdown.png`, `desktop/entry/39-calories-and-macros.png`)
- **The Nutrients-vs-RDI small-multiples** are the standout: five pigment bands,
  each with its own 100% reference track and a live percentage. Instantly legible.
  (`desktop/dashboard/57-nutrients-rdi.png`)
- **The hero "calories remaining" number** and the chart **hover tooltip**
  (date + calories + both weights, with pigment dots) are both lovely.
  (`desktop/dashboard/58-hover-tooltip.png`)
- **The per-item / per-weight duality renders correctly everywhere** — "150 g" vs
  "× 1.5" in the diary, mixed units inside one meal composer, and a genuinely
  helpful "Quantity (1 item ≈ 118g)" input label.
  (`desktop/entry/32-quantity-label.png`, `desktop/meals/21-mixed-units-composer.png`)
- **Thoughtful empty states** ("No foods found.", "Select a food from the list…")
  and a **sensible mobile reflow** (intake → weight → summary).
  (`desktop/foods/14-search-empty-state.png`, `mobile/entry/50-real-populated-day.png`)

---

## Per-section findings

### Authentication & access
- `auth/01-signin.png` — the sign-in card is clean and the copy is honest ("a
  private instance; access is limited to authorized accounts"). **But the full app
  navbar (Dashboard / Daily Entry / …) renders above a logged-out page.** It reads
  oddly and the links go nowhere useful. *(Verify under real auth — this run used
  `AUTH_DISABLED`; if the navbar renders for signed-out users it should hide its
  links.)*
- `auth/02-denied.png` — "Access Denied — You are not signed in." The `/denied`
  page exists for the *authenticated-but-unauthorized* case, yet the copy says "not
  signed in" and never shows **which** email was rejected (the FEATURES UX intent).
- Neither auth page carries the brand mark (the hanko-seal favicon) — a missed
  identity beat on the one page a new user sees first.

### Food database (`/foods`)
- `foods/03-list-before.png` — handsome master-detail; the row count ("518 foods")
  is a nice touch. **The list is unbounded** — all ~500 rows render with no
  pagination, virtualization, or alphabetical index. On desktop it's a long scroll;
  on mobile it's extreme (the full-page capture was ~60,000px tall). Search mitigates
  but doesn't replace structure.
- `foods/08-per-item-serving-field-shown.png` — selecting **Per Item** correctly
  re-titles the grid to "NUTRIENTS (PER ITEM)" (great detail), **but the now-required
  "Serving Size (g)" field gets no required affordance** — no asterisk, no emphasis,
  and its greyed "Required for per-item" placeholder reads like a *disabled* field.
- `foods/12-edit-unit-flipped-serving-required.png` — flipping unit type while
  editing behaves correctly; same missing required-emphasis applies.
- `foods/16-fk-delete-blocked-toast.png` — the FK-guard message is correct and
  specific, but in this capture the error toast looked **washed-out / low-contrast**
  (pale tan, faint text). The fresh weight error (below) is a strong terracotta, so
  this may be a fade-out frame — but error toasts should stay legible for their whole
  life and be distinguishable from success by **more than hue** (e.g. an icon).

### Meal templates (`/meals`)
- `meals/21-mixed-units-composer.png` — mixed per-100g + per-item ingredients total
  correctly and display in their own units. Live totals with pigment bars are great.
- `meals/24-card-expanded-nutrients.png` — expanding a saved meal shows full nutrient
  bars, **but with no target/scale reference on this page the bar fills are ambiguous**
  — fill relative to *what*? Either show the reference or drop to value-only.
- Composer name placeholder reads "Meal name (e.g., Breakfast (mochi))" — the nested
  parenthetical example is a little confusing.

### Daily entry / diary (`/entry`)
- `entry/28-empty-day.png` / `entry/50-real-populated-day.png` — the three-column
  layout is excellent and the diary handles a 14-entry day with a 6-ingredient meal
  gracefully.
- **Copy bug:** the intake column is headed **"TODAY'S INTAKE" even when viewing a
  past day** (the captures are dated *Friday, June 5*). Should be neutral ("Intake")
  or date-aware. (`desktop/entry/50-real-populated-day.png`, `mobile/entry/50-…`)
- `entry/36-meal-row-expanded.png` — meal grouping, indentation, and per-ingredient
  delete are clear and well-built.
- `entry/32` / `33` / `34` — the amount input adapts its label per unit ("Weight (g)"
  → "Quantity (1 item ≈ 118g)" → "Portions") exactly as it should.
- `entry/37-inline-edit-active.png` — inline amount editing has a clear focused state.
- `entry/47-weight-invalid-over-500.png` — validation fires with a strong, legible
  terracotta error ("Weight must be between 0 and 500 kg"). Good.

### Daily targets
- `entry/44-targets-mode-toggle.png` — the modal is well-composed: a 3-column grid
  with per-nutrient **Target / Limit** segmented toggles, plus Copy Previous / Cancel
  / Save. (`entry/43-targets-modal.png` merely caught the fade-in as a ghost — a
  capture artifact, not a defect, though the open transition could be snappier.)

### Body weight
- `entry/45-weight-saved.png` / `46-weight-cleared.png` — morning/evening inputs,
  auto-save, and clear-to-empty all behave. See the cross-cutting toast issue for how
  feedback collides with this column.

### Dashboard (`/`)
- `dashboard/51-calories-weight-3m.png` — a beautiful calories/weight chart. Detail
  nits: the **right-edge series labels crowd the plot and can collide with the line**;
  the **weight axis is unlabeled** (dual-axis ambiguity — which line uses which
  scale?); and a small orphaned "kg" annotation floats at lower-left.
- `dashboard/56` / `57` — macro stack and RDI panel are excellent (see strengths).
- **X-axis ticks are sparse and irregularly spaced** across all charts (e.g. "Mar 11
  / Apr 20 / May 11" — a 40-day gap then a 21-day gap). Even monthly ticks would read
  as more intentional.
- `mobile/dashboard/51-calories-weight-3m.png` — **the mobile chart is cramped**: the
  three stacked header stats, three stacked tab labels, the range row, and a
  three-line legend consume most of the viewport before the (short) plot. Trends are
  hard to read on a phone.

### CSV export
- `export/60-all-options-checked.png` — the modal (date range + per-format checkboxes
  + Download) works. As with other modals, `59-modal-default.png` caught the fade-in
  as a ghost; tighten the open transition.

### Cross-cutting
- **Toasts are the dominant problem (see below).**
- **A floating "N" account avatar (bottom-left) overlaps scrollable content on
  mobile** (`mobile/entry/35-meal-added-grouped.png`).
- Modal open transitions are soft enough that an immediate screenshot catches
  half-opacity content — likely imperceptible to users but worth tightening for
  polish.

---

## Prioritized improvements

Severity: **Major** = broadly visible, hurts the experience · **Minor** = noticeable
detail · **Polish** = refinement. *(No blockers — the app is attractive and usable
as-is.)*

| # | Sev | Area | What's wrong | Suggested fix | Evidence |
|---|-----|------|--------------|---------------|----------|
| 1 | **Major** | Toasts (global) | Toasts **stack indefinitely, never auto-dismiss, and overlap interactive UI** — they cover the Body Measurements/weight column on desktop and, on mobile, **bury the targets modal's lower fields and Save button**. | Auto-dismiss (~3s); cap the visible stack (e.g. 3, then collapse); coalesce batch actions ("3 entries added"); keep them clear of the weight column and never over a modal's primary action. | `mobile/entry/44-targets-mode-toggle.png`, `desktop/entry/39-calories-and-macros.png`, `mobile/entry/35-meal-added-grouped.png` |
| 2 | **Major** | Daily entry | Intake column reads **"TODAY'S INTAKE" while viewing a past day**, which is simply incorrect. | Use a neutral "Intake" or a date-aware heading ("Intake · Fri, Jun 5"). | `desktop/entry/50-real-populated-day.png` |
| 3 | **Major** | Dashboard (mobile) | Chart is **cramped**; header stats, stacked tabs, range row, and legend crowd out the plot, so trends are hard to read on a phone. | Give the plot a taller min-height on mobile; condense the header stats to one line; make tabs a scrollable row; move/inline the legend. | `mobile/dashboard/51-calories-weight-3m.png` |
| 4 | **Major** | Food database | **Unbounded list** (~500 rows, no pagination/virtualization/index) — a very long scroll, worse on mobile, with a render/perf cost. | Virtualize the list (or paginate) and add a sticky alphabetical index/jump. | `foods/03-list-before.png`, mobile full-page ≈ 60,000px tall |
| 5 | Minor | Foods editor | When unit = Per Item, the **now-required Serving Size field has no required affordance** and its greyed placeholder reads as *disabled*. | Add a required marker (asterisk/label state) and active styling; block save with a field-level (not just toast) error. | `foods/08-per-item-serving-field-shown.png` |
| 6 | Minor | Toasts | Error vs success is **distinguished by hue alone**, and the error toast looked low-contrast in one frame. | Add an icon (✓ / !) and ensure error contrast holds for the whole lifetime; confirm AA contrast. | `foods/16-fk-delete-blocked-toast.png` vs `foods/18-delete-success-toast.png` |
| 7 | Minor | Dashboard charts | Calories/weight chart has an **unlabeled weight axis**, **edge labels that crowd/collide** with the line, and an orphaned "kg" annotation. | Add a labeled right axis for weight; move series labels into a clean legend; remove/clarify the stray annotation. | `dashboard/51-calories-weight-3m.png` |
| 8 | Minor | Dashboard charts | **Irregular, sparse x-axis ticks** across all charts. | Use evenly-spaced monthly ticks. | `dashboard/56-macro-breakdown.png` |
| 9 | Minor | Auth pages | Full app **navbar renders on signin/denied** (logged-out); `/denied` copy says "not signed in" and omits the rejected email. | Verify under real auth; hide nav links when signed out; reword `/denied` for the unauthorized-email case and show the email. | `auth/01-signin.png`, `auth/02-denied.png` |
| 10 | Minor | Meals | Expanded saved-meal nutrient bars have **no scale/target reference**, so fills are ambiguous on this page. | Show the reference value, or render value-only bars here. | `meals/24-card-expanded-nutrients.png` |
| 11 | Minor | Mobile | Floating **"N" avatar overlaps scrollable list content**. | Reserve safe-area / lift it above content, or dock it in the navbar on mobile. | `mobile/entry/35-meal-added-grouped.png` |
| 12 | Polish | Branding | Signin/denied lack the **brand hanko-seal mark**. | Place the mark above the card title. | `auth/01-signin.png` |
| 13 | Polish | Modals | Open transition soft enough to flash half-opacity content. | Tighten the enter transition / add a brief backdrop hold. | `export/59-modal-default.png`, `entry/43-targets-modal.png` |
| 14 | Polish | Copy | Meal-name placeholder "(e.g., Breakfast (mochi))" — confusing nested example. | Use a cleaner example, e.g. "e.g. Overnight oats". | `meals/19-page-before.png` |

---

## Triage

**Quick wins (copy / CSS / small component tweaks):** #2 (intake heading), #5
(required serving-size affordance), #6 (toast icon + contrast), #8 (axis ticks),
#12 (brand mark), #13 (modal transition), #14 (placeholder copy), and the #9 copy
half.

**Larger efforts (architecture / layout / data):** #1 (rework the toast system —
highest leverage), #3 (responsive dashboard re-layout), #4 (list virtualization +
index), #7 (dual-axis chart redesign), #10 (meal-card scale), #11 (mobile avatar
placement), and the #9 auth-render verification.

> Suggested first move: **#1 and #2** — the toast overhaul touches every screen and
> removes the most jarring everyday friction, and the intake heading is a one-line
> correctness fix. Both are visible on the very first session.
