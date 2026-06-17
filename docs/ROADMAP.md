# Product Roadmap

A ranked backlog of capabilities, derived by sweeping the entire feature matrix in
[`FEATURES.md`](./FEATURES.md) through six needs-based user personas and folding in the
still-open findings from [`UX-REVIEW.md`](./UX-REVIEW.md). It answers a forward-looking
question — *"what would real users with different nutritional goals want next?"* — rather than
"is the existing thing broken?" (the friction sweep already answered that; see the note at the end).

## Method

Each of the six personas walked all nine `FEATURES.md` sections and judged every feature against
what the code actually does today. Their unmet needs were de-duplicated into the backlog below.
**A capability wanted by more than one persona carries a stronger demand signal** and ranks higher.

The six personas (each defined by a distinct *goal*, which decides which features matter):

| Persona | Goal | Stresses |
|---|---|---|
| **The Cutter** | sustained deficit, fat loss | maintenance/TDEE accuracy, weekly trend weight, rate-of-loss, adherence |
| **The Builder** | lean bulk, hit-macros | fast repeat-logging, protein/carb floors, per-meal splits |
| **The Patient** | medical (BP/diabetes/CKD) | micronutrient *limits*, accuracy, clinician-ready exports |
| **The Home Cook** | batch-cook, plan ahead | recipe yield/scaling, future-day planning |
| **The Data Nerd** | quantified self | data depth, custom nutrients, exports/API, integrations |
| **The Time-Poor Casual** | log fast, mostly mobile | barcode, recents/favourites, copy-yesterday, mobile speed |

**How to read the ranking:** ordered strictly by **user value**, highest first. **Effort** (S / M / L)
is a tag, not the sort key — it's grounded in the code (does it fit the existing schema/actions, or
need new tables, external services, or a data-model change?). High-value + S effort = a quick win;
high-value + L effort = a deliberate bet.

## Ranked backlog

| # | Capability | Personas (demand) | Value | Effort | Notes |
|---|---|---|---|---|---|
| 1 | **Recent & favourite foods** in the selector | Builder, Casual | High | S | Order `food_entries` by recent `entry_date`; pin a "Recents" section atop the Combobox |
| 2 | **Copy yesterday / repeat last entry** | Casual, Builder | High | S | Reuse `saveDailyEntry`; clone prior day's rows into today, editable in place |
| 3 | **Real-time limit alerts in the entry preview** | Patient | High | S–M | Extend `NutrientPreview` with `macroIndicator` so a previewed add warns *before* breaching a limit-mode cap |
| 4 | **Weekly summary & trend-weight readout** (7-day avg, kg/week, deficit) | Cutter | High | M | Reuse chart-prep + `estimateMaintenance`; surface a card on `/entry` and `/` |
| 5 | **Clinician-ready export** (daily totals + targets, absolute units, summary row) | Patient | High | M | New shape in `lib/export/csv.ts` + `app/actions/export.ts`; today's RDI-% export is unusable for medical caps |
| 6 | **Mobile entry optimisation** (compact combobox, calorie-first quick-add) | Casual | High | M | Fewer taps; quick-add collapses to name+kcal with "more detail" expander |
| 7 | **Future-date logging** + planned/logged distinction | Home Cook | High | S → M | Lifting the cap is one line (`app/entry/page.tsx:24`); the planned-vs-logged styling is the M part |
| 8 | **Per-meal macro targets & breakdown** | Builder, Patient | Med-High | M | Optional per-meal caps + a meal-level progress strip in the daily log |
| 9 | **Goal weight + projection** (+ `user_settings` table) | Cutter | Med-High | M | Foundational: first cross-day, per-user config; unlocks #16 and the projection card |
| 10 | **Barcode + external food-DB lookup** (USDA/Nutritionix) | Casual | Med-High | L | Kills the biggest casual friction (typing every food); external API + mobile camera |
| 11 | **Add/substitute ingredients in a logged meal** *(open UX #12)* | Patient, Builder | Med | M | New action + a "+ add ingredient" affordance in `EntriesList`; mark entry "(modified)" |
| 12 | **"Unknown" vs 0 for blank nutrients** *(open UX #9)* | Patient, Data Nerd, Builder | Med | M | Nullable nutrient concept; ripples through entry, charts, export — scope carefully |
| 13 | **Selectable rolling-average window** (7/14/30) | Data Nerd | Med | S | `ROLLING_WINDOW_DAYS` is a hard-coded constant; expose as a chart control. Quick win |
| 14 | **Custom nutrients beyond the fixed 9** | Data Nerd, Patient | Med | L | 9 columns are hard-coded across `food_items`/`food_entries`/`daily_summaries`/`daily_targets` — needs a key/value model |
| 15 | **Food tags / categories + filter** | Builder | Med | M | Optional `category` on foods; filter the selector (e.g. "protein sources") |
| 16 | **Target presets + cyclical/weekly targets** (cut/bulk/carb-cycle) | Cutter, Data Nerd | Med | M | Save/load named target sets; per-weekday overrides |
| 17 | **Swap food in a logged entry** | Builder | Med | S–M | Click food name → selector → recompute nutrients, avoiding delete + re-add |
| 18 | **Meal metadata: batch yield** (+ prep time / tags / notes) | Home Cook | Med | S | `meals` has no yield field; "yields N servings" makes portion logging meaningful |
| 19 | **Weight-only quick flow** | Casual | Low-Med | S | A standalone weight tile / `/weight` for sparse weighers |
| 20 | **Maintenance transparency** (which weigh-ins rejected, confidence band) | Cutter, Data Nerd | Low-Med | S–M | Surface the existing spike/slope guards so a jumpy TDEE line is explainable |
| 21 | **Customisable nutrient display** (macros-only view) | Builder | Low-Med | S | Toggle which of the 9 progress bars show |
| 22 | **Move an entry to another day** | Home Cook | Low | S | Update `entry_date`, recompute both day summaries |
| 23 | **Finish toast/auth polish** *(open UX #16, partial)* | — | Low | S | Auth-specific items unverified: logged-out navbar, brand mark, modal fade |

## Top items — detail

**1. Recent & favourite foods.** The single strongest cross-persona signal: both the Builder (logs
chicken/rice/oats dozens of times) and the Casual (re-types the same breakfast daily) pay a full
search tax every time. The selector lists foods alphabetically only. Reuse `food_entries` to compute
most-recently / most-frequently logged and pin them above the search in the Combobox. Low effort,
high daily payoff.

**2. Copy yesterday / repeat last entry.** Targets already have "Copy Previous Targets"; *entries*
don't. A "Copy yesterday" button reusing `saveDailyEntry` would let routine eaters log a near-identical
day in one click and tweak amounts in place. Smallest effort in the top tier.

**3. Real-time limit alerts in the preview.** Today, limit breaches only show on the macro bars *after*
committing. The Patient (salt/sugar/protein caps) needs the warning in the live `NutrientPreview`
*before* adding — "this would put you 40% over your salt limit." Reuses `macroIndicator`; directly
serves the brand's "never lie to the user / never let them breach silently" bar.

**4. Weekly summary & trend-weight readout.** The dashboard shows a 30-day line but no readable
"−0.5 kg/week" or weekly deficit, and the entry page shows raw daily weight with no smoothing. A
7-day trend-weight readout next to the weight input plus a weekly-summary card (avg intake, weight
change, implied deficit) gives the Cutter the week-scoped feedback the daily-only UI lacks. Reuses
existing chart-prep and `estimateMaintenance`.

**5. Clinician-ready export.** The current "Nutrients vs RDI" CSV exports *% of generic RDI* — useless
when a clinician works in absolute grams against a personalised cap. The Patient needs a daily-totals
export: one row per day, each nutrient in absolute units, alongside that day's *targets* and a hit/miss
flag. New shape in `lib/export/csv.ts`; the data is already computed for the charts.

**6. Mobile entry optimisation.** Logging three foods on a phone is a 3–5-minute, many-tap chore; the
quick-add shows nine fields. A compact, recents-first combobox and a calorie-first quick-add
(name + kcal, with an expander for the rest) make phone logging viable for the Casual. Pairs naturally
with #1.

**7. Future-date logging.** The Home Cook plans the week on Sunday but `app/entry/page.tsx:24` hard-caps
navigation at today. Lifting the cap is nearly free; the worthwhile follow-up is visually distinguishing
a *planned* day from a *logged* one so the diary still never misrepresents what was actually eaten.
This delivers most of the value of a full meal-plan calendar (parked below) at a fraction of the cost.

**8. Per-meal macro targets & breakdown.** Wanted by both the Builder ("did my post-workout meal hit
its protein?") and the Patient ("which meal is my sodium hot-spot?"). Optional per-meal targets plus a
small per-meal progress strip in the daily log; daily totals stay the source of truth.

**9. Goal weight + projection.** The app has no cross-day, per-user configuration — every setting is
per-day. A small `user_settings` table (goal weight, weekly-rate target) is the foundation for the
Cutter's projection card ("at −0.5 kg/week you reach 75 kg in ~8 weeks") and for #16's presets.

**10. Barcode + external food DB.** The highest-want item among the larger bets: it removes the
Casual's biggest friction — building every food by hand. It's L effort (external food API + mobile
camera) and shifts the app from a hand-curated personal DB toward sourced data, so it's a deliberate
decision rather than an incremental add — but its user value is high enough to keep it in the main list.

## Bigger bets / explicitly parked

Parked so they're visible, not silently dropped. These are high-effort and/or presume a different
product than a private, single-user tracker:

- **Wearable / smart-scale auto weight sync** (L) — external OAuth per vendor; niche, and manual weight
  entry already works.
- **Public REST/JSON API** (L) — low payoff for a single-user allowlisted app; revisit only if data
  genuinely needs to leave the app programmatically (CSV export covers most of this today).
- **Bulk CSV / USDA food import** (M–L) — mostly a one-time onboarding benefit.
- **Shopping-list generation & multi-meal aggregation** (M–L) — valuable only to heavy meal-preppers;
  meal **yield** (#18) is the cheaper first step.
- **Full weekly meal-plan calendar** (L) — future-date logging (#7) captures most of the value first.
- **Correlation / lag analysis, confidence bands, subjective metrics (sleep/mood)** (L) — analyst-only
  delight; the Data Nerd would love it, but it serves one persona.
- **Data deletion / GDPR tooling, multi-user, social sharing** — out of scope for a private single-user
  app; would only matter if the product opened up.

## Note on the friction sweep

The roadmap deliberately excludes already-fixed issues. Of the 16 findings in `UX-REVIEW.md`, **13 are
verified fixed** in current code (portions persist & are editable, same-meal-twice no longer merges,
quick-add, over-target hero, weight-spike guards, inline-edit validation, pluralisation, toast
stack/dismiss, date-aware intake label, mobile chart height, foods list cap, weight plausibility).
Only the **still-open** ones were carried forward: #9 (blank-vs-unknown nutrients → backlog #12),
#12 (add/substitute logged-meal ingredients → backlog #11), and the unverified auth half of #16
(→ backlog #23).
