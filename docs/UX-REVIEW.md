# UI/UX Design Review

A comprehensive review of the app, run against the playbook in
[`docs/UX-REVIEW-GUIDE.md`](./UX-REVIEW-GUIDE.md). Three passes:

1. **Feature sweep** — every action in [`docs/FEATURES.md`](./FEATURES.md), both viewports.
2. **Real-user journeys** — tracked as a real person: mistakes, deviations, meal-prep, eating out.
3. **Scenario matrix** — the 20 cross-cutting dimensions from the guide applied to every
   feature (boundary values, persistence round-trips, invalid-input feedback, precision,
   units, destructive aftermath, date edges, idempotency).

The bar: a person tracking their food every day should never be confused, never lose
data, and never be lied to by the UI. The app is genuinely beautiful and a lot is
robust; the issues that remain cluster around **meals/portions data integrity** and
**feedback on the unhappy path**.

## Method

- **Capture scripts** (screenshots git-ignored; regenerate via the guide):
  `scripts/ux-review.ts` (sweep, both viewports), `scripts/ux-review-personas.ts`
  (journeys), `scripts/ux-review-matrix.ts` (matrix).
- **Data:** isolated clone of the real DB (`nutritional_review`); destructive steps
  touch only throwaway records / empty dates.
- Screenshot paths below are relative to `tests/e2e/screenshots/ux-review/`.

---

## Coverage: the scenario matrix

Every dimension was exercised. "✓ Robust" = behaves well; "✗ Issue" = see findings.

| Dimension | Result | Note / evidence |
|-----------|--------|-----------------|
| Happy path | ✓ Robust | all features (`desktop/**`) |
| **Persistence / reload** | ✗ **Issue** | meal **portions reset to 1** on reload (`personas/03`); *but* foods, per-item serving size, and meal ingredient amounts **do** round-trip (`matrix/foods/06`, `matrix/meals/02`) |
| Fractional & precision | ✓ Robust | quantity bounded to 2 dp by schema → "× 0.67", no float-vomit (`matrix/entry/01`) |
| Boundary values | ◐ Mixed | negative nutrient rejected (`matrix/foods/02`); **blank macros silently become 0** (`matrix/foods/04`) |
| Pluralization | ✗ Issue | "1 **ingredients**" in daily log; meals page is correct (`personas/10`) |
| Invalid input + feedback | ✗ Issue | inline edit to 0/−20 **silently ignored, no feedback** (`matrix/entry/03`, `personas/14`); weight >500 & export from>to **do** warn (`export/…`, `desktop/entry/47`) |
| Duplicates / repeats | ◐ Mixed | rapid double-add **guarded** (`matrix/entry/04`); but same meal twice/day **merges** (`personas/06`) |
| Ordering | ✗ Issue | on reload, foods then meals — insertion order lost (storage.ts:323) |
| Mistakes & corrections | ✗ Issue | can't edit portions; can't move an entry to another day; invalid edits silent |
| Deviation from plan | ✗ Issue | eat half / more / missing ingredient / eat out all misbehave (journeys below) |
| Units & conversion | ◐ Mixed | per-item/per-weight correct everywhere; **150 kg accepted, no plausibility guard** (`matrix/entry/05`) |
| Long / special content | ✓ Robust | long supermarket names wrap, no overflow (`matrix/foods/07`) |
| Cross-surface consistency | ✗ Issue | "N ingredients" pluralized on meals page but not daily log; toast vs row contradict (`personas/02`) |
| Date & time edges | ◐ Mixed | future nav disabled, picker capped (`matrix/entry/08`); **"TODAY'S INTAKE" on a past day** (`desktop/entry/50`) |
| Empty & first-run | ✓ Robust | clean empty states (`desktop/foods/14`, `matrix/entry/08`) |
| Destructive aftermath | ✓ Robust | FK-guarded food delete; meal delete preserves logged history; weight-only day persists (`matrix/entry/06`) |
| Responsive | ✗ Issue | mobile dashboard cramped (`mobile/dashboard/51`); floating avatar overlaps content (`mobile/entry/35`) |
| Feedback & latency | ✗ Issue | toasts never dismiss, stack, overlap controls, persist across navigation (`mobile/entry/44`) |
| Accessibility | ◐ Mixed | modal toggles/roles present; error toasts low-contrast & hue-only; needs a keyboard/contrast audit |
| Beauty & consistency | ✓ Strong | coherent identity & pigment system (see below) |

---

## What's genuinely excellent / robust

Worth protecting — and several were *verified* this pass, not assumed:

- **Editorial identity** — Fraunces + JetBrains Mono on Kaolin paper; a disciplined
  **per-nutrient pigment system** used identically across bars and charts.
- **RDI small-multiples** and the **chart hover tooltip** (`desktop/dashboard/57`, `58`).
- **Foods and meals persist correctly** — per-item unit + serving size round-trip
  (`matrix/foods/06`); meal ingredient amounts "150 g" / "× 2" round-trip on reopen
  (`matrix/meals/02`).
- **Solid guards where they exist** — rapid double-add deduped (`matrix/entry/04`),
  over-*limit* macros flag ⚠ (`matrix/entry/07`), future dates blocked
  (`matrix/entry/08`), export date range validated (`export/01`), negative nutrients
  rejected (`matrix/foods/02`), long names wrap cleanly (`matrix/foods/07`).

---

## Real-user journeys (the heart)

### A. Meal prep & fractional portions
**Root cause:** `food_entries` has no portions column; `loadDailyEntry` hardcodes
`portions: 1.0` on reload (storage.ts:311-314).

- **Eats half (0.5).** Nutrition halves correctly, but the label resets to "1 portion"
  — and the toast says "Added … (0.5 portions)" while the row already reads "1 portion"
  (`personas/02`). Expanding shows grams halved under a "1 portion" label
  (`personas/04`). **The diary lies about how much was eaten.**
- **Same batch twice/day → merges** into one "1 portion · 12 ingredients" entry
  (`personas/06`).
- **Can't correct portions** — no edit affordance, only ingredients (`personas/07`).

### B. Plans change / mistakes
- **Recipe missing an ingredient** — removing it works (`personas/09`) but the entry
  keeps the full meal name / "1 portion" with no "modified" cue, can read
  "1 ingredients" (`personas/10`), and you can't add/substitute within a logged meal.
- **Ate out (not in DB)** — search dead-ends with no quick-add; must build a full
  9-field food first (`personas/12`).
- **Fix a typo to 0 / −20** — silently ignored, no feedback (`personas/14`, `matrix/entry/03`).
- **Ate more than planned** — calories hero clamps to a big "0"; overage relegated to
  small text, macro ✓ persists (`personas/11`).
- **Fat-fingered a weigh-in (150 kg)** — accepted with no plausibility check, and it
  **catastrophically skews the maintenance estimate to "−13,168 kcal"** on the
  dashboard (no outlier rejection) (`matrix/export/01`, header).

---

## Prioritized findings

Severity: **Major** = breaks trust / real friction · **Minor** = noticeable detail · **Polish**.

| # | Sev | Area | What's wrong | Suggested fix | Evidence / root cause |
|---|-----|------|--------------|---------------|------------------------|
| 1 | **Major** | Meals / data | **Portion count discarded on reload** (reset to 1.0) — diary misrepresents intake for any portion ≠ 1. | Persist portions on the meal entry; render the real value. | `personas/02-04`; storage.ts:314 |
| 2 | **Major** | Meals | **Same meal twice/day merges** into one entry. | Group by per-log instance id, not bare `meal_id`. | `personas/06`; storage.ts:294-318 |
| 3 | **Major** | Daily entry | **Portions can't be edited** after logging. | Editable portions control on the meal header that rescales. | `personas/07`; EntriesList.tsx:91-116 |
| 4 | **Major** | Daily entry | **No quick-add** for food not in the DB (eating out). | Inline "quick add (name + calories)" from entry search. | `personas/12` |
| 5 | **Major** | Daily entry | **Over-target hero clamps to "0"**; overage de-emphasized. | Show real over-state prominently; flag exceeded targets. | `personas/11`; targets.ts `calorieStatus` |
| 6 | Minor | Dashboard | **One bad weigh-in skews maintenance** to nonsense ("−13,168 kcal"); no outlier guard. | Reject/winsorize weight outliers; guard the slope regression. | `matrix/export/01` header |
| 7 | Minor | Daily entry | **Invalid inline edit (0/−/blank) silently ignored.** | Treat 0/clear as "remove?"; show validation. | `matrix/entry/03`; EditableAmount.tsx:42 |
| 8 | Minor | Daily entry | **"1 ingredients"** not pluralized (meals page is correct). | Reuse the meals-page pluralization. | `personas/10`; EntriesList.tsx:98 |
| 9 | Minor | Foods | **Blank macros silently saved as 0** — no "unknown" concept; understates charts. | Distinguish blank vs 0, or hint that blanks become 0. | `matrix/foods/04` |
| 10 | Minor | Global | **Toasts never dismiss / stack / overlap controls** and persist across navigation. | Auto-dismiss; cap stack; coalesce; keep clear of controls/modals. | `mobile/entry/44`, `matrix/foods/04` |
| 11 | Minor | Daily entry | **"TODAY'S INTAKE" while viewing a past day.** | Neutral or date-aware heading. | `desktop/entry/50` |
| 12 | Minor | Daily entry | Logged meal can't **add/substitute** ingredients; no "modified" cue. | Allow add/substitute; mark edited. | `personas/09` |
| 13 | Minor | Dashboard | Cramped **mobile chart**; unlabeled weight axis; irregular x-ticks. | Taller mobile plot; label weight axis; even monthly ticks. | `mobile/dashboard/51`, `desktop/dashboard/51` |
| 14 | Minor | Foods | **Unbounded list** (~500 rows); per-item required field lacks affordance. | Virtualize + alpha index; mark required field. | `desktop/foods/03`, `08` |
| 15 | Minor | Weight | **150 kg accepted** with no plausibility range (lb/kg slip). | Soft-warn on out-of-band values. | `matrix/entry/05` |
| 16 | Polish | Toasts/Auth | Error vs success by hue only; logged-out navbar; missing brand mark; modal fade. | Toast icons + contrast; hide nav when signed out; add hanko mark; tighten transitions. | `desktop/foods/16`, `desktop/auth/01` |

---

## Corrections to the earlier review

In the spirit of accuracy, the matrix pass overturned two things I had flagged before:

- **Quantity formatting is fine.** I worried scaled quantities would render as raw
  floats (`× 0.6666667`); the `DECIMAL(8,2)` schema bounds it to "× 0.67"
  (`matrix/entry/01`). Withdrawn.
- **Meal amounts and per-item foods round-trip correctly** after reload/reopen
  (`matrix/meals/02`, `matrix/foods/06`) — the persistence bug is specific to meal
  *portions*, not amounts generally. Scoped down.

---

## Triage

**Fix first (trust):** #1–#3 (portions data integrity), then #4 (quick-add) and #5
(over-target hero) — the most-felt daily-use gaps. #6 (maintenance outlier) is cheap
insurance against a believable headline number going absurd.

**Quick wins:** #5 copy/colour, #7, #8, #9, #11, #15, and the #16 set.

**Larger efforts:** #1–#3, #4 (quick-add flow), #10 (toast system), #13 (responsive
dashboard), #14 (list virtualization).

## Close the loop

Encode the sharpest journeys as e2e assertions so they can't regress: 0.5 portions →
reload → expect "0.5 portions"; meal twice → expect two entries; inline-edit to 0 →
expect a visible result; exceed target → expect a clear over-state; reduce a meal to
one ingredient → expect "1 ingredient"; a 150 kg outlier → maintenance stays sane.
`scripts/ux-review-personas.ts` and `scripts/ux-review-matrix.ts` already drive these.

---

## Post-fix sweep — 2026-06-16

After the 16 findings were implemented (PRs #32–#37) and deployed, a follow-up sweep
caught that the **quick-add** feature (#4) shipped sloppy. Fixed in `fix/quick-add-polish`:

- Quick-add now offers **all 9 nutrient fields** (was calories + 3), has a clear
  **Cancel** button, and **dismisses when the user types a new search or selects an
  existing food** (was lingering and could render alongside the amount input).
- Cleanups found in the same audit: toast `scheduled`-ref no longer leaks ids for
  early-dismissed toasts; the foods 50-row cap now always keeps the row being edited
  visible; an inline-edit blurred on an invalid value reverts instead of leaving a
  stuck red unfocused input.
- `docs/FEATURES.md` brought back in sync (quick-add, editable/persisted portions,
  "Calories Over" card, edit-to-0-removes, weight plausibility warning, foods cap,
  maintenance outlier robustness).

Re-ran the feature sweep + persona + matrix suites (both viewports) against a prod-data
clone: quick-add verified (9 fields / dismiss-on-search / dismiss-on-select / single
amount input / logs correctly); all prior headline fixes still pass; no new regressions.
