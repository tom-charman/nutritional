# UI/UX Design Review

A designer's review of the app, conducted in two passes and judged against the bar
of an *incredible, consistently beautiful* experience with *extreme attention to
detail*:

1. **Feature sweep** — performed every action in [`docs/FEATURES.md`](./FEATURES.md)
   at desktop (1440×900) and mobile (390×844).
2. **Real-user journeys** *(this revision)* — stopped clicking happily through
   features and instead tracked the way a real person does: they make mistakes,
   they don't eat what they planned, they eat more than they planned, they prep a
   batch and eat half of it, they cook a recipe missing an ingredient, they eat out.

The second pass is where the app's polish breaks down. The headline finding is a
**class of data-integrity bugs around meals and portions** that the happy-path
sweep (which only ever used "1 portion" and clean numbers) completely missed —
exactly the kind of gap that signals attention to detail wasn't high enough the
first time.

## Method

- **Capture scripts** (screenshots are git-ignored; regenerate as below):
  - [`scripts/ux-review.ts`](../scripts/ux-review.ts) — the feature sweep, both viewports.
  - [`scripts/ux-review-personas.ts`](../scripts/ux-review-personas.ts) — the real-user journeys below.
- **Data:** an isolated clone of the real local DB (`nutritional_review`: 516 foods,
  9 meals, ~450 logged days). Destructive steps touch only throwaway records / empty dates.
- **Run:**
  ```bash
  docker compose up -d
  AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
  DATABASE_URL=…/nutritional_review npx tsx scripts/ux-review.ts          # sweep
  DATABASE_URL=…/nutritional_review npx tsx scripts/ux-review-personas.ts # journeys
  ```
- Screenshot paths below are relative to `tests/e2e/screenshots/ux-review/`.

---

## Headline: the portions model loses data

`food_entries` has **no portions column**. When a meal is logged, each ingredient's
grams/quantity are scaled by the portion factor and stored — but the portion number
itself is never persisted. On reload, `loadDailyEntry` hardcodes it back to 1:

```ts
// lib/data/storage.ts:311-314
const me: MealEntry = {
  meal_id: mealId,
  meal_name: mealRows[0].name,
  portions: 1.0, // default on reload, as in python
  ...
```

Everything below flows from this one line. It is invisible on the happy path and
unavoidable on a real one.

---

## Real-user journeys

### A. Meal prep & fractional portions

> *"I batch-cook on Sunday, save it as a meal, and through the week I log a portion —
> but some days I'm not that hungry and only eat half."*

**Eats half a portion (0.5).** The amount input explicitly invites this (`min 0.1`).
The nutrition is scaled correctly to half, **but the label resets to "1 portion"** —
and the contradiction is visible *on the same screen*: the toast says **"Added …
(0.5 portions)"** while the row immediately below already reads **"1 portion"**.
(`personas/02-after-add-half.png`). After reload it's still "1 portion", and
expanding it shows the grams *are* halved (Chicken 100g not 200g; 528 kcal not 1056)
under a label that says they ate a whole portion
(`personas/03-…`, `personas/04-expanded-grams-halved-but-label-1.png`).
**Impact:** the diary now lies about how much of the batch was eaten. Tomorrow the
user can't trust their own history. This is the single most damaging issue in the app.

**Eats the same batch twice in a day (lunch + dinner).** Two separate logs of one
meal **merge into a single entry on reload** — "Chicken, Edamame, Rice · 1 portion ·
**12 ingredients** · 2113 kcal" — because entries are grouped by `meal_id`
(storage.ts:294-318). (`personas/06-same-meal-twice-after-reload-merged.png`)
**Impact:** two meals become one unsplittable blob; they can't remove just dinner.

**Tries to correct the portions.** There's no way to. The meal header
(EntriesList.tsx:91-116) renders portions as plain text; only individual ingredient
rows are editable. (`personas/07-two-portions-reset-no-edit-affordance.png`)
**Impact:** even noticing the "1 portion" error, the user can only fix it by hand-editing
six ingredient weights — or deleting and re-adding, which hits the same bug again.

### B. Plans change / mistakes happen

> *"I don't always eat what I planned. I run out of an ingredient, I eat out, I fat-finger
> a number, I overshoot my target."*

**Cooked the recipe missing an ingredient.** Logging the meal then removing the one
thing they skipped *works* and totals update ("5 ingredients · 949 kcal") —
(`personas/09-missing-ingredient-after-remove.png`) — **but** the entry still carries
the full meal name and "1 portion" with no "modified" indication, and there's **no way
to add or substitute** an ingredient within a logged meal (only remove). A reduced
meal can even read "**1 portion · 1 ingredients**" — an unpluralized count
(`personas/10-meal-one-ingredient-plural-bug.png`). Notably the meals page *does*
pluralize this correctly (MealsClient.tsx:332), so the daily log (EntriesList.tsx:98)
is simply inconsistent with it.

**Ate something not in the database (a takeaway).** Searching a restaurant meal hits
"No matches" with **no quick "add custom calories" or "create food from here" path**
(`personas/12-food-not-in-db-no-quick-add.png`). **Impact:** to log one ad-hoc meal
the user must abandon the entry screen, go to Food Database, fill all nine nutrient
fields for a one-off, then return. Most real diets include food you didn't pre-enter;
this is heavy friction precisely at the moment of logging.

**Fat-fingered an amount, tries to fix it to 0.** Inline-editing an amount to `0`
(or clearing it) is **silently ignored — no change, no error** (the commit guard is
`n > 0` with no else branch, EditableAmount.tsx:42).
(`personas/14-inline-edit-to-zero-silently-ignored.png`) **Impact:** the user thinks
they cleared the entry; nothing happened and nothing told them why.

**Ate more than planned (over target).** The "calories remaining" hero **clamps to a
big "0"** with the actual overage ("1725 kcal over target") relegated to small
secondary text, and the macro rows still show green ✓ indicators
(`personas/11-over-target-hero-clamps-to-zero.png`). **Impact:** at the one moment a
tracker most needs a clear signal, the most prominent number is a meaningless "0" and
the overage is the quietest thing on the card.

---

## What's genuinely excellent

The craft is real and worth protecting:

- A coherent **editorial identity** — Fraunces serif + JetBrains Mono data on warm
  Kaolin paper. (`desktop/entry/50-real-populated-day.png`)
- A disciplined **per-nutrient pigment system** used identically across entry bars,
  meal totals, and every chart. (`desktop/dashboard/56-macro-breakdown.png`)
- The **Nutrients-vs-RDI small-multiples** and the **chart hover tooltip** are
  standout. (`desktop/dashboard/57-nutrients-rdi.png`, `…/58-hover-tooltip.png`)
- The **per-item/per-weight duality** renders correctly across surfaces ("× 1.5" vs
  "150 g"; "Quantity (1 item ≈ 118g)"). (`desktop/entry/32-quantity-label.png`)
- Thoughtful **empty states** and a sensible **mobile reflow** (intake → weight → summary).

---

## Feature-sweep findings (pass 1)

Still valid, lower-severity than the journeys above:

- **Toasts stack indefinitely and never auto-dismiss**, overlapping the weight column
  (desktop) and burying the targets modal's Save button (mobile).
  (`mobile/entry/44-targets-mode-toggle.png`)
- **"TODAY'S INTAKE" heading shows while viewing a past day.** (`desktop/entry/50-…`)
- **Mobile dashboard chart is cramped**; stats/tabs/legend crowd out the plot.
  (`mobile/dashboard/51-…`)
- **Foods list is unbounded** (~500 rows, no pagination/virtualization/index).
- Per-item **required serving-size field has no required affordance** and reads as
  disabled. (`desktop/foods/08-…`)
- Error vs success toasts differ **by hue only**; the error toast looked low-contrast
  in one frame. (`desktop/foods/16-…`)
- Calories/weight chart has an **unlabeled weight axis**, crowded edge labels, and
  **irregular x-axis ticks**. (`desktop/dashboard/51-…`)
- Auth pages render the **full app navbar while logged out**; `/denied` says "not
  signed in" and omits the rejected email. (`desktop/auth/01-…`, `02-…`)

---

## Prioritized improvements

Severity: **Major** = breaks trust / real friction · **Minor** = noticeable detail ·
**Polish** = refinement.

| # | Sev | Area | What's wrong | Suggested fix | Evidence |
|---|-----|------|--------------|---------------|----------|
| 1 | **Major** | Meals / data integrity | **Portion count is discarded on save** (reset to 1.0 on reload) — the diary misrepresents how much was eaten for anyone logging anything but exactly 1 portion. | Persist `portions` on the meal entry (add a column or store it on the grouped rows); render the real value. | `personas/02`, `03`, `04`; storage.ts:314 |
| 2 | **Major** | Meals | **Same meal logged twice/day merges** into one entry on reload — can't separate or remove one. | Group by a per-log instance id, not bare `meal_id`. | `personas/06`; storage.ts:294-318 |
| 3 | **Major** | Daily entry | **Portions can't be edited** after logging — only individual ingredients. | Add an editable portions control on the meal header that rescales ingredients. | `personas/07`; EntriesList.tsx:91-116 |
| 4 | **Major** | Daily entry | **No quick-add for food not in the DB** (eating out) — forces a full 9-field food creation mid-log. | Add an inline "quick add (name + calories, optional macros)" from the entry search. | `personas/12` |
| 5 | **Major** | Daily entry | **Over-target hero clamps to "0"**; overage de-emphasized and macro ✓ persists. | Show the real (negative) remaining or a prominent "X over" with clear over-state colour; flag exceeded limits. | `personas/11`; targets.ts `calorieStatus` |
| 6 | Minor | Daily entry | **Inline edit to 0 / empty is silently ignored** — no change, no feedback. | Treat 0/clear as "remove this entry?" or show a validation message. | `personas/14`; EditableAmount.tsx:42 |
| 7 | Minor | Daily entry | Logged meals can't have ingredients **added/substituted**, and a modified meal shows no "modified" cue. | Allow add/substitute within a logged meal; mark it edited. | `personas/09` |
| 8 | Minor | Daily entry | **"1 ingredients"** not pluralized in the daily log (the meals page gets it right). | Reuse the meals-page pluralization. | `personas/10`; EntriesList.tsx:98 vs MealsClient.tsx:332 |
| 9 | Minor | Daily entry | **Quantity rendered raw** (`× ${quantity}`) so a scaled value can show `× 0.6666666667`; weight is rounded but quantity isn't. | Round/format quantity consistently with weight. | EntriesList.tsx:15 |
| 10 | Minor | Global | **Toasts never dismiss / stack** and overlap controls (weight column, modal Save). | Auto-dismiss (~3s); cap the stack; coalesce batches; keep clear of controls. | `mobile/entry/44-…`, `desktop/entry/39-…` |
| 11 | Minor | Daily entry | **"TODAY'S INTAKE" while viewing a past day.** | Neutral or date-aware heading. | `desktop/entry/50-…` |
| 12 | Minor | Dashboard | **Cramped mobile chart**; unlabeled weight axis; irregular ticks. | Taller mobile plot; label the weight axis; even monthly ticks. | `mobile/dashboard/51-…`, `desktop/dashboard/51-…` |
| 13 | Minor | Foods | **Unbounded list**; per-item required field lacks affordance. | Virtualize + alpha index; mark the required field. | `desktop/foods/03-…`, `08-…` |
| 14 | Polish | Toasts / Auth | Error vs success by hue only; logged-out navbar; missing brand mark; modal fade flashes. | Add toast icons + contrast; hide nav when signed out; add the hanko mark; tighten transitions. | `desktop/foods/16-…`, `desktop/auth/01-…` |

---

## Triage

**Fix first (trust):** #1, #2, #3 — the portions/meal data-integrity cluster. Until
these are fixed, a committed user's history is quietly wrong, which is fatal for a
tracking app. #4 (quick-add) and #5 (over-target hero) are the next most felt in
daily use.

**Quick wins:** #5 copy/colour, #6, #8, #9, #11, and the #14 set.

**Larger efforts:** #1–#3 (persist + edit portions; per-instance grouping), #4
(quick-add flow), #10 (toast system), #12 (responsive dashboard), #13 (list
virtualization).

## Journeys worth baking into the test suite

The fastest way to keep this attention-to-detail bar is to encode these as
assertions (not just screenshots): log 0.5 portions → reload → **expect "0.5
portions"**; log a meal twice → **expect two entries**; inline-edit to 0 → **expect a
visible result**; exceed the calorie target → **expect a clear over-state**; reduce a
meal to one ingredient → **expect "1 ingredient"**. `scripts/ux-review-personas.ts`
already drives each of these and is a ready basis for them.
