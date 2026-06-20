# Product Roadmap

A ranked backlog of capabilities, derived by sweeping the entire feature matrix in
[`FEATURES.md`](./FEATURES.md) through six needs-based user personas and folding in the
still-open findings from [`UX-REVIEW.md`](./UX-REVIEW.md). It answers a forward-looking
question — *"what would real users with different nutritional goals want next?"* — rather than
"is the existing thing broken?" (the friction sweep already answered that; see the note at the end).

> **Prioritised 2026-06-19.** Each item below was reviewed item-by-item and assigned a priority
> (High / Medium / Low). Six candidates were dropped and one was reframed — see *Dropped in review*
> and item #11. The ranking now reflects those decisions, not the original value estimate.

> **Shipped 2026-06-20.** The "fast repeat-logging" cluster — **#1 Recent & favourite foods**,
> **#2 Copy yesterday**, **#4 Swap food in a logged entry** — shipped together (they shared the
> `Combobox` and a new cross-day `food_entries` read). Rows kept below for history, marked ✅.

> **Shipped 2026-06-20.** The Patient cluster — **#3 Real-time limit alerts in the entry preview**
> and **#6 Clinician-ready export** — shipped together (PR #45): both serve the "never let them
> breach silently / never lie to the user" bar, neither needed a schema change. Rows kept below, marked ✅.

## Method

Each of the six personas walked all nine `FEATURES.md` sections and judged every feature against
what the code actually does today. Their unmet needs were de-duplicated into the backlog below.
**A capability wanted by more than one persona carries a stronger demand signal.**

The six personas (each defined by a distinct *goal*, which decides which features matter):

| Persona | Goal | Stresses |
|---|---|---|
| **The Cutter** | sustained deficit, fat loss | maintenance/TDEE accuracy, weekly trend weight, rate-of-loss, adherence |
| **The Builder** | lean bulk, hit-macros | fast repeat-logging, protein/carb floors, per-meal splits |
| **The Patient** | medical (BP/diabetes/CKD) | micronutrient *limits*, accuracy, clinician-ready exports |
| **The Home Cook** | batch-cook, plan ahead | recipe yield/scaling, future-day planning |
| **The Data Nerd** | quantified self | data depth, custom nutrients, exports/API, integrations |
| **The Time-Poor Casual** | log fast, mostly mobile | barcode, recents/favourites, copy-yesterday, mobile speed |

**How to read it:** grouped by **priority** (High → Medium → Low), highest first. **Effort** (S / M / L)
is grounded in the code — does it fit the existing schema/actions, or need new tables, external
services, or a data-model change?

## Ranked backlog

| # | Capability | Personas | Priority | Effort | Notes |
|---|---|---|---|---|---|
| 1 | **Recent & favourite foods** in the selector | Builder, Casual | ✅ Done | S | Order `food_entries` by recent `entry_date`; pin a "Recents" section atop the Combobox |
| 2 | **Copy yesterday / repeat last entry** | Casual, Builder | ✅ Done | S | Reuse `saveDailyEntry`; clone a prior day's rows into today, editable in place |
| 3 | **Real-time limit alerts in the entry preview** | Patient | ✅ Done | S–M | Extend `NutrientPreview` with `macroIndicator` so a previewed add warns *before* breaching a limit-mode cap |
| 4 | **Swap food in a logged entry** | Builder | ✅ Done | S–M | Click food name → selector → recompute nutrients, avoiding delete + re-add |
| 5 | **Add/substitute ingredients in a logged meal** *(open UX #12)* | Patient, Builder | High | M | New action + a "+ add ingredient" affordance in `EntriesList`; mark entry "(modified)" |
| 6 | **Clinician-ready export** (daily totals + targets, absolute units, summary row) | Patient | ✅ Done | M | New shape in `lib/export/dailyTotals.ts` + `app/actions/export.ts`; today's RDI-% export is unusable for medical caps |
| 7 | **Target presets + cyclical/weekly targets** (cut/bulk/carb-cycle) | Cutter, Data Nerd | High | M | Save/load named target sets; per-weekday overrides. **Depends on the `user_settings` table from #9** |
| 8 | **Weekly summary & trend-weight readout** (7-day avg, kg/week, deficit) | Cutter | Medium | M | Reuse chart-prep + `estimateMaintenance`; surface a card on `/entry` and `/` |
| 9 | **Goal weight + projection** (+ `user_settings` table) | Cutter | Medium | M | First cross-day, per-user config; foundation for #7 and the projection card |
| 10 | **Food tags / categories + filter** | Builder | Medium | M | Optional `category` on foods; filter the selector (e.g. "protein sources") |
| 11 | **Batch-cook → single-serving meal generator** | Home Cook | Medium | M | Enter total batch ingredient weights + servings; app divides and saves a normal **single-serving** meal. A meal stays a meal-for-one — this just builds one from a batch without hand-division. *(Reframed from "meal yield metadata")* |
| 12 | **Finish toast/auth polish** *(open UX #16, partial)* | — | Medium | S | Auth-specific items unverified: logged-out navbar, brand mark, modal fade |
| 13 | **Future-date logging** + planned/logged distinction | Home Cook | Low | S → M | Lifting the cap is one line (`app/entry/page.tsx:24`); the planned-vs-logged styling is the M part |
| 14 | **Mobile entry optimisation** (compact combobox, calorie-first quick-add) | Casual | Low | M | Fewer taps; quick-add collapses to name+kcal with a "more detail" expander |
| 15 | **Per-meal macro targets & breakdown** | Builder, Patient | Low | M | Optional per-meal caps + a meal-level progress strip in the daily log |
| 16 | **Customisable nutrient display** (macros-only view) | Builder | Low | S | Toggle which of the 9 progress bars show |
| 17 | **Custom nutrients beyond the fixed 9** | Data Nerd, Patient | Low | L | 9 columns are hard-coded across `food_items`/`food_entries`/`daily_summaries`/`daily_targets` — needs a key/value model |

## Top items — detail

**1. Recent & favourite foods.** ✅ *Shipped 2026-06-20.* The single strongest cross-persona signal: both the Builder (logs
chicken/rice/oats dozens of times) and the Casual (re-types the same breakfast daily) pay a full
search tax every time. The selector lists foods alphabetically only. Reuse `food_entries` to compute
most-recently / most-frequently logged and pin them above the search in the Combobox. Low effort,
high daily payoff.

**2. Copy yesterday / repeat last entry.** ✅ *Shipped 2026-06-20.* Targets already have "Copy Previous Targets"; *entries*
don't. A "Copy yesterday" button reusing `saveDailyEntry` would let routine eaters log a near-identical
day in one click and tweak amounts in place. Smallest effort in the top tier.

**3. Real-time limit alerts in the preview.** ✅ *Shipped 2026-06-20.* Today, limit breaches only show on the macro bars *after*
committing. The Patient (salt/sugar/protein caps) needs the warning in the live `NutrientPreview`
*before* adding — "this would put you 40% over your salt limit." Reuses `macroIndicator`; directly
serves the brand's "never lie to the user / never let them breach silently" bar.

**4. Swap food in a logged entry.** ✅ *Shipped 2026-06-20.* Logging the wrong food currently means delete + re-search + re-add.
Make the food name clickable to open the selector in place and recompute nutrients from the new food —
fast correction without losing the row. Small build on the existing inline-edit pattern.

**5. Add/substitute ingredients in a logged meal** *(open UX #12)*. A logged meal can have ingredient
*amounts* edited but ingredients can't be added or swapped — so a meal-prepper who adds chicken to
"Dinner Base" some days must delete and re-log. Add a "+ add ingredient" affordance inside the expanded
meal entry and mark it "(modified)" so the diary still reflects reality. New action + `EntriesList` work.

**6. Clinician-ready export.** ✅ *Shipped 2026-06-20.* The current "Nutrients vs RDI" CSV exports *% of generic RDI* — useless
when a clinician works in absolute grams against a personalised cap. The Patient needs a daily-totals
export: one row per day, each nutrient in absolute units, alongside that day's *targets* and a hit/miss
flag. New shape in `lib/export/dailyTotals.ts`; the data is already computed for the charts.

**7. Target presets + cyclical/weekly targets.** Save named target sets (Cut / Lean Bulk / Maintain) and
optional per-weekday overrides (carb-cycling, refeed days), so the Cutter and Data Nerd aren't re-typing
nine fields. **Prerequisite:** the `user_settings` table introduced by #9 — sequence #9 first even though
it sits in the Medium tier.

**8. Weekly summary & trend-weight readout.** The dashboard shows a 30-day line but no readable
"−0.5 kg/week" or weekly deficit, and the entry page shows raw daily weight with no smoothing. A
7-day trend-weight readout next to the weight input plus a weekly-summary card (avg intake, weight
change, implied deficit) gives the Cutter the week-scoped feedback the daily-only UI lacks. Reuses
existing chart-prep and `estimateMaintenance`.

**9. Goal weight + projection.** The app has no cross-day, per-user configuration — every setting is
per-day. A small `user_settings` table (goal weight, weekly-rate target) is the foundation for the
Cutter's projection card ("at −0.5 kg/week you reach 75 kg in ~8 weeks") **and** for #7's target presets.

**11. Batch-cook → single-serving meal generator.** Instead of recording how many servings a meal yields,
work the other way: the Home Cook enters the total weights of everything that went into a batch (e.g.
1.2 kg chicken, 800 g rice, 400 g sauce) and how many servings it makes; the app divides the totals and
saves the result as an ordinary **single-serving** meal that can be added to the daily entry. A "meal"
stays a meal-for-one in our model — this is just a build-time helper that scales the ingredient amounts
down before saving, reusing the existing `meal_ingredients` + save flow.

## Bigger bets / explicitly parked

Parked so they're visible, not silently dropped. These are high-effort and/or presume a different
product than a private, single-user tracker:

- **Wearable / smart-scale auto weight sync** (L) — external OAuth per vendor; niche, and manual weight
  entry already works.
- **Public REST/JSON API** (L) — low payoff for a single-user allowlisted app; revisit only if data
  genuinely needs to leave the app programmatically (CSV export covers most of this today).
- **Bulk CSV / USDA food import** (M–L) — mostly a one-time onboarding benefit.
- **Shopping-list generation & multi-meal aggregation** (M–L) — valuable only to heavy meal-preppers.
- **Full weekly meal-plan calendar** (L) — future-date logging (#13) captures most of the value first.
- **Correlation / lag analysis, confidence bands, subjective metrics (sleep/mood)** (L) — analyst-only
  delight; serves one persona.
- **Data deletion / GDPR tooling, multi-user, social sharing** — out of scope for a private single-user app.

## Dropped in review (2026-06-19)

Considered during the persona sweep and explicitly removed from the backlog:

- **Barcode + external food-DB lookup** — shifts the app from a hand-curated personal DB toward sourced
  data; not wanted.
- **"Unknown" vs 0 for blank nutrients** *(open UX #9)* — the data-model ripple isn't worth it; blank
  continues to mean 0.
- **Selectable rolling-average window** — the fixed 30-day window stays.
- **Weight-only quick flow** — weight inputs on the entry page are sufficient.
- **Maintenance transparency (rejected weigh-ins / confidence band)** — the existing silent guards are fine.
- **Move an entry to another day** — delete + re-add remains acceptable.

## Note on the friction sweep

The roadmap deliberately excludes already-fixed issues. Of the 16 findings in `UX-REVIEW.md`, **13 are
verified fixed** in current code (portions persist & are editable, same-meal-twice no longer merges,
quick-add, over-target hero, weight-spike guards, inline-edit validation, pluralisation, toast
stack/dismiss, date-aware intake label, mobile chart height, foods list cap, weight plausibility).
Of the still-open ones: #12 (add/substitute logged-meal ingredients) is now backlog **#5 (High)**; the
unverified auth half of #16 is backlog **#12 (Medium)**; and #9 (blank-vs-unknown nutrients) was
**considered and dropped** in this review.
