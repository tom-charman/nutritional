# Feature Inventory

This document catalogues **every specific user-facing feature** in the Nutritional
Tracker, grouped by area. It is the product-level companion to the code: a place
to see, at a glance, what a user can actually *do*.

**How to read it.** Each entry is one user-observable capability, phrased in the
"A user can…" voice. Every feature lists:

- **What it does** — the capability in one or two sentences.
- **UI/UX considerations** — the consequences the feature generates. Most
  features ripple outward: a choice made in one screen must be honoured
  everywhere that data later appears. These notes are what to re-check when the
  feature changes.
- **Implemented in** — the 1–3 files that primarily implement it.

**The spine of the app: two food unit models.** Almost every UX consequence below
traces back to one design decision — foods are measured either **per 100g** or
**per item**:

- **`per_100g`** — nutrients are defined per 100 grams. The user enters an
  **amount in grams** (`weight_g`); the multiplier is `weight_g / 100`.
- **`per_item`** — nutrients are defined per single item (e.g. one banana). The
  food carries a required `serving_size_g` (the weight of one item), and the user
  enters a **count** (`quantity`, e.g. `1.5`); the multiplier is the quantity
  itself.

A meal ingredient stores exactly one of `weight_g` / `quantity`, matching its
food's unit model. Logging a meal scales every ingredient by a single
**portions** factor. Keep this duality in mind — it is the single most common
source of "looks right for one kind of food, wrong for the other" bugs.

> Data shapes and validation rules referenced here live in
> [`lib/db/schema.ts`](../lib/db/schema.ts) and
> [`database/init.sql`](../database/init.sql); domain math lives in
> [`lib/domain/`](../lib/domain).

---

## 1. Authentication & access

### A user can sign in with their Google account
- **What it does:** Authentication is via Google OAuth (NextAuth, JWT sessions, no
  database adapter). A branded `/signin` page offers a single "Continue with
  Google" button.
- **UI/UX considerations:** The sign-in page is custom-branded rather than the
  default Auth.js screen, so it must stay visually consistent with the rest of the
  app. After login the user should land back where they were headed, not always on
  the home page.
- **Implemented in:** `app/signin/page.tsx`, `lib/auth.ts`,
  `app/api/auth/[...nextauth]/route.ts`

### A user is granted access only if their email is on the allowlist
- **What it does:** Authorization is gated by an `AUTHORIZED_EMAILS` allowlist
  (comma-separated, case-insensitive). An authenticated-but-unlisted user is sent
  to a `/denied` page.
- **UI/UX considerations:** The denied state must be unambiguous — show *which*
  email was rejected and offer a sign-out so the user can retry with a different
  account. Failing silently or bouncing back to sign-in would be confusing.
- **Implemented in:** `lib/auth.ts` (`parseAllowlist`, `isAuthorizedEmail`),
  `app/denied/page.tsx`

### A user's pages are protected, and they can sign out
- **What it does:** Middleware protects every route except the auth endpoints,
  `/signin`, `/denied`, and static assets. A "Sign out" control in the navbar ends
  the session and returns to `/signin`.
- **UI/UX considerations:** The sign-out control should only appear when signed in.
  Protected routes must redirect cleanly (no flash of protected content). A dev/e2e
  `AUTH_DISABLED` bypass exists but must never apply in production.
- **Implemented in:** `proxy.ts`, `components/nav/Navbar.tsx`,
  `app/actions/auth.ts`

---

## 2. Food database (`/foods`)

### A user can add a food item to the database by weight (per 100g)
- **What it does:** Create a food whose nutrients are defined per 100 grams. The
  nine nutrient fields (energy, fat, saturated fat, carbs, sugar, protein, fibre,
  salt, calcium) are captured per 100g; `serving_size_g` is left empty.
- **UI/UX considerations:** Nutrient inputs must be framed as "per 100g" so users
  enter label values directly. The serving-size field must be hidden/disabled for
  this unit type — showing it would imply it's needed.
- **Implemented in:** `components/foods/FoodsClient.tsx`, `app/actions/foods.ts`
  (`saveFoodAction`)

### A user can add a food item to the database by item (per item)
- **What it does:** Create a food whose nutrients are defined per single item, with
  a **required** serving size (the gram weight of one item).
- **UI/UX considerations:** Choosing "per item" must reveal and require the
  serving-size field; saving without it returns "Serving size is required for
  per-item foods". The list shows a "Per item" badge so the two kinds are
  distinguishable at a glance.
- **Implemented in:** `components/foods/FoodsClient.tsx`, `app/actions/foods.ts`
  (`saveFoodAction`)

### A user can edit an existing food item
- **What it does:** Click a food in the list to load it into the form; saving
  upserts the same record. Empty nutrient inputs coerce to 0; negatives are
  rejected; duplicate names are rejected with a clear message.
- **UI/UX considerations:** **Switching unit type while editing must re-validate
  the serving-size field** — flipping per-item → per-100g should clear/hide it, and
  the reverse should require it. The form title should reflect edit-vs-create mode.
  Editing a food silently changes the nutrients of every meal and (future) entry
  that references it.
- **Implemented in:** `components/foods/FoodsClient.tsx`, `app/actions/foods.ts`
  (`saveFoodAction`)

### A user can delete a food item
- **What it does:** Delete a food via the ✕ control in the list. Blocked by a
  foreign-key guard if the food is referenced by any meal ingredient or logged
  entry.
- **UI/UX considerations:** A blocked delete must **explain why** — the action
  returns "Cannot delete: this food is used by existing entries or meals" rather
  than failing opaquely. Successful delete should clear the form if that food was
  loaded.
- **Implemented in:** `app/actions/foods.ts` (`deleteFoodAction`),
  `components/foods/FoodsClient.tsx`

### A user can search and browse the food database
- **What it does:** A live, case-insensitive substring filter narrows the
  alphabetically-sorted food list; a count and per-unit badges are shown, with an
  empty state when nothing matches. At most 50 rows render at once; beyond that a
  "Showing 50 of N — refine your search" hint appears (the food currently open in the
  editor is always kept visible).
- **UI/UX considerations:** Search should be instant (client-side) and forgiving of
  case. The empty state must read as "no matches", distinct from "no foods exist". The
  50-row cap keeps a large database fast to render without losing the selected row.
- **Implemented in:** `components/foods/FoodsClient.tsx`, `app/foods/page.tsx`

> **Cross-cutting consequence of the two unit models:** every place a food appears
> — the entry selector, the daily log, the meal composer, nutrient previews — must
> render *both* kinds correctly: "150 g" vs "× 1.5", and per-item gram hints like
> "(per item, ~80g)". Adding the per-item model is not a `/foods`-only change; it
> obliges correct display in every downstream surface.

---

## 3. Meal templates (`/meals`)

### A user can create a meal from existing foods
- **What it does:** Compose a reusable, named meal by searching the food database
  and adding ingredients with per-ingredient amounts. A live total shows the meal's
  nutrition as it's built.
- **UI/UX considerations:** Each ingredient's amount field must **adapt to that
  food's unit model** — grams for per-100g foods, a count for per-item foods —
  within the same composer. The selector should surface the unit context so the
  user knows what they're typing. A meal needs a unique name and at least one
  ingredient.
- **Implemented in:** `components/meals/MealsClient.tsx`, `app/actions/meals.ts`
  (`saveMealAction`)

### A user can edit a saved meal
- **What it does:** Click a saved meal to load its name and ingredients into the
  composer; saving replaces the meal's ingredients wholesale in a transaction
  (delete-all + reinsert).
- **UI/UX considerations:** The save button should read "Update" vs "Save" by mode.
  Because save is a full replace, partially-failed saves must not leave a meal with
  mixed old/new ingredients — the transaction guarantees this.
- **Implemented in:** `components/meals/MealsClient.tsx`, `app/actions/meals.ts`
  (`saveMealAction`), `lib/data/storage.ts` (`saveMeal`)

### A user can delete a meal without losing logged history
- **What it does:** Delete a meal template. Its ingredient definitions
  cascade-delete, but any already-logged entries that referenced it have their
  `meal_id` cleared first, so those entries survive as individual food entries.
- **UI/UX considerations:** Deleting a *template* must not erase *history* — this is
  a deliberate distinction the UI should not blur. Past days keep their logged
  foods; they simply stop being grouped under the (now-gone) meal name.
- **Implemented in:** `app/actions/meals.ts` (`deleteMealAction`),
  `lib/data/storage.ts` (`deleteMeal`, see `meal_id` clear at storage.ts:254)

### A user can expand a saved meal to inspect its full nutrition
- **What it does:** Each saved-meal card collapses to name + ingredient count + total
  kcal, and expands to the full nine-nutrient breakdown with bars comparing against
  today's targets.
- **UI/UX considerations:** Expansion state is view-only and per-card; it shouldn't
  persist or affect other cards. The comparison bars borrow the daily-target
  context, so they must degrade gracefully if no targets exist.
- **Implemented in:** `components/meals/MealsClient.tsx`,
  `components/entry/NutrientPreview.tsx`

> **Cross-cutting consequence:** a single meal can mix per-item and per-weight
> ingredients. Totals must sum correctly across both, and the per-ingredient rows
> must display each in its own unit without implying they're the same.

---

## 4. Daily entry / diary (`/entry`)

### A user can enter a food item (by weight) into the daily log
- **What it does:** Search for a per-100g food, enter a weight in grams, and add it
  to the selected day. Nutrients are computed server-side from the weight.
- **UI/UX considerations:** The amount input is labelled "Weight (g)" with step 1.
  The selector label carries the unit context "(per 100g)". Enter or an "Add" button
  both commit.
- **Implemented in:** `components/entry/EntryClient.tsx`, `app/actions/entry.ts`
  (`addFoodEntryAction`)

### A user can enter a food item (by item) into the daily log
- **What it does:** Search for a per-item food and enter a **count** (e.g. 1.5
  bananas); nutrients scale by the count.
- **UI/UX considerations:** The amount input switches to "Quantity (1 item ≈ Xg)"
  with step 0.5, and the selector label reads "(per item, ~Xg)" — the gram hint
  reassures the user what one item weighs. The same control must morph correctly
  the instant the selected food's unit type differs.
- **Implemented in:** `components/entry/EntryClient.tsx`, `app/actions/entry.ts`
  (`addFoodEntryAction`)

### A user can enter a meal (by portion size) into the daily log
- **What it does:** Add a saved meal by specifying portions (e.g. 1.5 = 150% of the
  template). Each ingredient is scaled by the portions factor and stored, grouped by a
  per-log instance id (`meal_log_id`). The portion count **persists across reload**, and
  the same meal logged twice in a day stays as two separate entries (not merged).
- **UI/UX considerations:** The amount input becomes "Portions" (placeholder "1.0",
  step 0.1). In the log the scaled ingredients **explode into grouped, collapsible
  rows** under the meal name with its portion count — they must read as one logical
  meal yet remain individually inspectable.
- **Implemented in:** `components/entry/EntryClient.tsx`, `app/actions/entry.ts`
  (`addMealEntryAction`), `lib/data/storage.ts` (groups by `meal_log_id`)

### A user can change a logged meal's portions
- **What it does:** The portion count on a logged meal's header is click-to-edit; saving
  rescales every ingredient (weights/quantities and nutrients) to the new portions.
- **UI/UX considerations:** The portions value reads as an editable amount like the
  ingredient amounts; editing it must not toggle the meal's expand/collapse. 0 portions
  is rejected (a logged meal can't be zero — remove it instead).
- **Implemented in:** `components/entry/EntriesList.tsx`, `app/actions/entry.ts`
  (`editMealPortionsAction`)

### A user can quick-add food that isn't in the database
- **What it does:** Searching a name with no match offers "+ Quick add <name>", opening
  an inline form (name + **calories required**, all other nutrients optional) that
  creates a reusable food and logs it — without leaving the entry page or filling the
  full food editor. Blank nutrient fields record as 0.
- **UI/UX considerations:** The form must be clearly dismissable (a Cancel button) and
  must disappear when the user types a new search or selects an existing food — it never
  lingers alongside the normal amount input. The created food is saved for reuse.
- **Implemented in:** `components/entry/EntryClient.tsx` (`QuickAddForm`),
  `components/ui/Combobox.tsx` (`onQuickAdd`), `app/actions/entry.ts`
  (`quickAddEntryAction`)

### A user sees recently-logged foods pinned atop the selector
- **What it does:** The food/meal selector opens with a **"Recent"** section listing the
  foods the user has logged most recently (ties broken by how often they're logged),
  above the full alphabetical list — so habitual foods (oats, chicken, the daily
  breakfast) are one click away instead of a full search.
- **UI/UX considerations:** Sections only show on the un-searched list; typing collapses
  back to a flat substring match so a recent food still surfaces by name. A recent food
  is **not** duplicated lower down. The ranking is by `entry_date` (recency) then
  frequency, computed across all days — no manual "favouriting". Foods logged as meal
  ingredients count too.
- **Implemented in:** `lib/data/storage.ts` (`loadRecentFoods`), `app/entry/page.tsx`,
  `components/entry/EntryClient.tsx`, `components/ui/Combobox.tsx` (`section` grouping)

### A user can preview an entry's nutrition before adding it
- **What it does:** As soon as a food/meal and a valid amount are chosen, a live
  preview shows the exact nutrients the entry would add, with slim bars showing each
  as a share of the day's target.
- **UI/UX considerations:** The preview must recompute on every change to selection
  or amount, and only appear once the amount is valid. For meals it sums scaled
  ingredients; the bars reuse the day's targets and so must handle their absence.
- **Implemented in:** `components/entry/NutrientPreview.tsx`,
  `components/entry/EntryClient.tsx`

### A user is warned before adding an entry that would breach a daily limit
- **What it does:** In the live preview, a limit nutrient (salt/sugar/saturated
  fat) whose **projected** day total — what's already logged plus this pending
  entry — would cross its cap raises a ⚠ warning *before* the entry is committed,
  quantified as "Would put you 40% over your salt limit." A breach is never first
  discovered after the fact on the committed macro bars.
- **UI/UX considerations:** Reuses the exact `macroIndicator` thresholds the
  committed macro bars use (over cap → warning, >110% → exceeded), so the
  pre-commit warning and the post-commit bar verdict always agree. The warning is
  rust (warning ≡ danger) — never false urgency. It only fires where a "day"
  exists: the preview needs both the day's targets *and* its running totals, so
  the meal composer (a template, not a day) never shows it. Recomputes live as the
  amount changes and clears the instant the projected total is back within the cap.
- **Implemented in:** `components/entry/NutrientPreview.tsx`,
  `components/entry/EntryClient.tsx`, `lib/domain/targets.ts` (`macroIndicator`,
  `limitOverPct`)

### A user can inline-edit the amount of a logged entry
- **What it does:** Click a logged amount to edit it in place; Enter or blur commits
  (only if changed and valid), Escape cancels. Nutrients and daily totals
  recalculate on commit. Editing a food amount to **0 or blank removes** that entry;
  a negative/non-numeric value goes red and stays editable (blurring it reverts).
- **UI/UX considerations:** The edit affordance must read naturally for **both**
  display forms — "150 g" and "× 1.5". This works for individual food entries and for
  single ingredients inside a meal. No silent no-op: invalid input gives visible
  feedback rather than quietly doing nothing. (Meal *portions* reject 0 instead of
  removing — remove the meal itself for that.)
- **Implemented in:** `components/ui/EditableAmount.tsx`,
  `components/entry/EntriesList.tsx`, `app/actions/entry.ts`
  (`editEntryAmountAction`)

### A user can swap the food behind a logged entry in place
- **What it does:** Clicking a logged food's **name** opens the selector inline on that
  row; picking a different food rewrites the entry to the new food — keeping the logged
  amount and recomputing nutrients — instead of delete + re-search + re-add. Works for
  standalone food rows and for single ingredients inside a logged meal.
- **UI/UX considerations:** The logged amount is **carried over and reinterpreted** for
  the new food's unit model (a "200 g" weight becomes a "× 200" count if the new food is
  per-item, and vice-versa), so the number stays but its meaning follows the food. Daily
  totals and the calories card must update on swap. Escape / clicking away cancels
  without changing the row.
- **Implemented in:** `components/entry/EntriesList.tsx`,
  `components/ui/Combobox.tsx` (embedded `startOpen`/`onCancel` mode),
  `app/actions/entry.ts` (`swapFoodEntryAction`)

### A user can remove a logged food, a whole meal, or one ingredient of a meal
- **What it does:** ✕ controls remove a standalone food entry, an entire meal
  entry (all its ingredients), or a single ingredient inside a meal. A meal whose
  last ingredient is removed disappears entirely.
- **UI/UX considerations:** The three removal scopes must be visually distinct so a
  user doesn't delete a whole meal when meaning one ingredient. The "empty meal
  vanishes" rule should feel natural rather than surprising.
- **Implemented in:** `app/actions/entry.ts` (`removeEntryAction`),
  `components/entry/EntriesList.tsx`

### A user can navigate to any past day
- **What it does:** Step between days with prev/next arrows or pick a date directly;
  the header shows the weekday ("Monday, June 16"). Future dates are disallowed.
- **UI/UX considerations:** The date picker and next-day control must cap at today —
  there's no logging the future. Switching days updates optimistically (the shown
  date changes immediately) while the server data follows.
- **Implemented in:** `components/entry/EntryClient.tsx`, `app/entry/page.tsx`

### A user can copy a previous day's entries into the current day
- **What it does:** A **"Copy yesterday"** button clones the prior day's logged entries
  (foods and meals) into the day being viewed, so routine eaters log a near-identical day
  in one click and then tweak amounts in place. (Mirrors the targets' "Copy Previous
  Targets" affordance, now for entries.)
- **UI/UX considerations:** Clones get **fresh ids/timestamps** so the copy is fully
  independent of its source — deleting or editing a copied row never touches the original
  day. Copying onto a day that already has entries **appends** rather than replaces; an
  empty source day reports "Nothing to copy" rather than failing silently. The button
  must not crowd the intake list header.
- **Implemented in:** `components/entry/EntryClient.tsx`, `app/actions/entry.ts`
  (`copyDayEntriesAction`)

### A user can see calories remaining for the day
- **What it does:** A card shows logged calories against the day's target with
  status colouring (under / near / over). When over target the card flips to
  **"Calories Over"** and shows the overage as the big number (e.g. 1,725) in red,
  rather than a misleading "0 remaining".
- **UI/UX considerations:** The colour semantics must be legible at a glance — green
  on track, a warning band as the target nears (within 200 kcal), red when over. The
  big number must reflect the actual state: remaining when under, the overage when over.
- **Implemented in:** `components/entry/EntryClient.tsx`, `lib/domain/targets.ts`
  (`calorieStatus`)

### A user can track progress against every nutrient target
- **What it does:** Progress bars cover all nine nutrients, each respecting its
  per-nutrient **target vs limit** mode.
- **UI/UX considerations:** A "target" bar celebrates reaching the goal; a "limit"
  bar warns on exceeding it (and escalates past ~110%). The same bar component must
  convey opposite meanings depending on mode — the iconography/colour must make
  "goal to hit" vs "cap not to exceed" obvious.
- **Implemented in:** `components/entry/MacroProgressBars.tsx`,
  `lib/domain/targets.ts` (`macroIndicator`)

> **Cross-cutting consequence:** meal-grouped rows and standalone food rows coexist
> in one list. They must be visually distinguishable, and every row (grouped or not)
> must stay individually editable and removable.

---

## 5. Daily targets (modal on `/entry`)

### A user can set per-day nutrient targets
- **What it does:** A modal edits all nine nutrient targets for the day, each with a
  **target/limit** mode toggle.
- **UI/UX considerations:** The mode choice changes what the entry bars and
  dashboard strips *mean*, so the toggle must be unmistakable. Standard modal a11y
  applies: Escape and click-outside close it, the first field is focused. Negative
  targets are rejected.
- **Implemented in:** `components/entry/TargetsModal.tsx`, `app/actions/entry.ts`
  (`saveTargetsAction`)

### A user can copy targets forward from a previous day
- **What it does:** "Copy previous targets" fetches the most recent earlier day's
  targets (falling back through the date chain to hardcoded defaults).
- **UI/UX considerations:** Targets are "sticky" — a user who sets them once
  shouldn't re-enter them daily. The copy action should make clear it pulled from a
  prior day, and defaults should be sensible when no prior day exists.
- **Implemented in:** `app/actions/entry.ts` (`getTargetsForDateAction`),
  `lib/data/storage.ts` (`getOrCreateDailyTargets`), `lib/domain/targets.ts`

---

## 6. Body weight tracking (`/entry`)

### A user can log morning and evening body weight
- **What it does:** Two independent weight inputs auto-save on blur, stored
  separately from food entries. Clearing an input is an explicit "no weight today"
  (writes NULL, not 0). Hard range is 0–500 kg; a value outside the plausible band
  (< 30 or > 300 kg, often a lb/kg slip) still saves but surfaces a "that looks
  unusual, double-check it" warning.
- **UI/UX considerations:** Weights must save **independently of food entries** — a
  user logging only weight on a given day should succeed without any food rows.
  Auto-save should only fire on actual change, and clearing must mean cleared (NULL),
  never a misleading 0 that would skew the weight trend. The plausibility nudge is
  non-blocking — the user may legitimately be outside the band.
- **Implemented in:** `app/actions/entry.ts` (`updateWeightAction`),
  `lib/data/storage.ts` (`updateMeasurements`), `components/entry/EntryClient.tsx`

---

## 7. Dashboard & trends (`/`)

### A user can view a calories & weight trend chart
- **What it does:** A dual-axis chart plots a 30-day rolling average of daily
  calories against morning/evening body weight over time.
- **UI/UX considerations:** Calories are smoothed (rolling average) while weight is
  shown interpolated but unsmoothed, so the two lines tell different stories — the
  axis legend must make that clear. Missing days are interpolated within the tracked
  span only.
- **Implemented in:** `components/dashboard/CaloriesWeightChart.tsx`,
  `lib/domain/charts/prepare.ts` (`prepareCaloriesWeight`)

### A user can see an estimated maintenance (TDEE) calorie line
- **What it does:** From the weight trend (trailing-30-day least-squares slope) and
  intake, the app estimates daily maintenance calories: `caloriesAvg − weightSlope ×
  7700 kcal/kg`. It requires at least 14 valid weight points or it is hidden. The trend
  is hardened against bad data: impossible day-over-day jumps (> 3 kg) are dropped
  before interpolation, and the slope is clamped to ±0.5 kg/day, so one fat-fingered
  weigh-in can't drive the estimate to an absurd value.
- **UI/UX considerations:** The estimate must **gracefully disappear** when there's
  too little weight data rather than showing a wild number — a half-tracked first
  fortnight should not produce a misleading TDEE, and a single outlier must not bend it.
- **Implemented in:** `lib/domain/charts/prepare.ts`, `lib/domain/charts/series.ts`
  (`estimateMaintenance`, `rejectWeightSpikes`, `clampSlope`), `lib/constants.ts`
  (`MAINTENANCE_MIN_POINTS`, `KCAL_PER_KG`, `MAX_WEIGHT_DELTA_KG`,
  `MAX_WEIGHT_SLOPE_KG_PER_DAY`)

### A user can view a macro breakdown chart
- **What it does:** A stacked-area chart shows protein, other-carbs, sugar,
  saturated-fat, and other-fat as calories, proportionally reconciled to recorded
  totals, on a 30-day rolling average.
- **UI/UX considerations:** Stacked series must use the consistent per-nutrient
  pigment palette so colours mean the same thing here as in the entry bars and
  previews.
- **Implemented in:** `components/dashboard/MacroBreakdownChart.tsx`,
  `lib/domain/charts/series.ts` (`calculateMacroCalories`)

### A user can view nutrients as a percentage of RDI
- **What it does:** A chart plots RDI-tracked nutrients (saturated fat, sugar,
  fibre, salt, calcium) normalised to 100% at their reference intake, on a rolling
  average.
- **UI/UX considerations:** 100% is the meaningful gridline; the chart should make
  "over/under RDI" instantly readable.
- **Implemented in:** `components/dashboard/NutrientsRdiChart.tsx`,
  `lib/domain/charts/series.ts` (`normalizeToRdi`)

### A user can change the dashboard time range
- **What it does:** A selector (1M / 3M / 6M / 1Y / ALL, default 3M) windows all
  charts client-side, with keyboard navigation. Data is capped to yesterday.
- **UI/UX considerations:** Because today is usually incomplete, excluding it
  prevents a misleading dip at the right edge — the UI should set the expectation
  that the dashboard reflects *completed* days. Range changes recompute axes.
- **Implemented in:** `components/dashboard/DashboardTabs.tsx`, `app/page.tsx`

---

## 8. CSV export (modal from the navbar)

### A user can export their data to CSV
- **What it does:** A modal offers six independent exports — Calories & Weight,
  Macro Breakdown, Nutrients vs RDI, Daily Totals (clinician), Daily Entries, and
  Meals — with a from/to date range (default last 90 days). Each checked option
  downloads as its own file.
- **UI/UX considerations:** Exported numbers must **match what's plotted** (the same
  rolling-average values), so a user reconciling a CSV against the chart sees no
  drift. The Daily Entries export expands meals into their individual ingredient
  rows; the Meals export ignores the date range (it's a template backup). Date range
  requires from ≤ to.
- **Implemented in:** `components/export/ExportModal.tsx`, `app/actions/export.ts`,
  `lib/export/csv.ts`

### A user can export daily totals against targets for a clinician
- **What it does:** The "Daily Totals (clinician)" export gives one row per day in
  range, each tracked nutrient in **absolute units** alongside **that day's target**
  and a **hit/miss** flag, plus a trailing SUMMARY row (mean actual, mean target,
  and a hits/days hit-rate per nutrient). Unlike "Nutrients vs RDI" (% of a generic
  RDI), this is what a clinician working in grams against a personalised cap needs.
- **UI/UX considerations:** Hit/miss honours each nutrient's **target vs limit**
  mode — a limit is a hit when at or under the cap, a target is a hit when at or
  above the goal — so the flag agrees with the entry-page bars and the live limit
  alert for the same day. Days with no data logged leave the actual/status cells
  blank but still show the target. Per-day targets are resolved read-only (the
  export never writes target rows). Absolute units, not percentages.
- **Implemented in:** `app/actions/export.ts` (`exportDailyTotalsCsv`),
  `lib/export/dailyTotals.ts`, `components/export/ExportModal.tsx`

---

## 9. Cross-cutting / global

These apply across features rather than to one screen.

- **Toast feedback on every mutation.** Every add/edit/delete/save returns a success
  or error message surfaced as a toast, so the user always knows whether an action
  took. Error messages are specific (duplicate name, FK guard, validation) rather
  than generic.
- **Consistent modal conventions.** Targets and Export modals both close on Escape
  and click-outside and focus their first field — the patterns should not diverge.
- **A consistent nutrient pigment system.** Each of the nine nutrients has a fixed
  colour used everywhere it appears — entry bars, previews, dashboard charts. Changing
  a nutrient's colour is a global decision, not a per-chart one; consistency is what
  lets a user learn "blue = protein" once.
- **Responsive multi-column layouts.** The entry, foods, and meals screens use
  multi-column layouts that must reflow sensibly on narrow viewports.
- **Implemented in:** `app/globals.css`, `lib/constants.ts`,
  `components/nav/Navbar.tsx`, the various client components above.

---

## Feature → UX ripple cheat-sheet

When any of these high-leverage behaviours change, re-test every surface listed —
they are the places a change most often breaks something far from where it was made.

| Behaviour | Why it ripples | Re-check these surfaces |
|---|---|---|
| **Per-item vs per-weight foods** | The amount field, label, and display string differ by unit model | Foods form, entry selector & amount input, daily log rows, meal composer, nutrient previews, CSV daily-entries |
| **Meal portion scaling** | One portions factor multiplies every ingredient and explodes into grouped rows | Add-meal flow, grouped log rows, inline edit of an ingredient, CSV (meals expand to ingredients) |
| **Target vs limit modes** | The same bar/strip means "goal to hit" or "cap not to exceed" | Entry calories card, macro progress bars, meal-card comparison bars, nutrients-vs-RDI chart, pre-commit limit alert, clinician daily-totals hit/miss |
| **Pre-commit limit alerts** | A breach must read identically before and after committing, and only where a "day" exists | Live entry preview (warning copy + ⚠), committed macro bars, meal composer (must NOT show it), clinician export status |
| **Weight independence + clear-to-NULL** | Weight saves with no food rows; empty means NULL not 0 | Weight inputs, weight-only days, maintenance-calorie estimate, calories & weight chart, CSV |
| **Rolling average + yesterday cap** | Charts smooth over 30 days and exclude today | All three dashboard charts, time-range windowing, CSV exports that mirror plotted values |
| **Delete guards & history preservation** | Foods can't be deleted while referenced; deleting a meal keeps logged history | Food delete (FK message), meal delete (`meal_id` cleared), past days' logs |
| **Swap food in a logged entry** | Rewrites an entry's food, reinterprets the amount for the new unit model, recomputes nutrients | Inline swap selector (standalone rows & meal ingredients), per-item↔per-100g amount semantics, daily totals & calories card, macro bars |
| **Copy yesterday** | Clones prior-day entries with fresh ids; appends to the current day | Copy-yesterday button, daily totals after copy, copied-row edit/delete independence from the source day, empty-source message |
| **Recent foods in the selector** | A `food_entries` recency/frequency ranking pins a "Recent" section atop the list | Entry selector (un-searched vs searched states), recent de-dup vs alphabetical list, foods logged via meals appearing as recent |
