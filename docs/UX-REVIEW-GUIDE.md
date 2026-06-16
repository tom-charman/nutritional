# UX Review Guide

How to run a UI/UX review of this app so it is **comprehensive** — not a happy-path
click-through. This is the playbook behind [`docs/UX-REVIEW.md`](./UX-REVIEW.md);
follow it whenever the app is reviewed so findings stay thorough and repeatable.

The lens is always twofold: an **incredible, consistently beautiful** experience, and
**extreme attention to detail**. The bar: a real person tracking their food every day
should never be confused, never lose data, never be lied to by the UI.

## The core principle

> Review every feature as a **real user living their life**, not as a tester clicking
> the demo flow. Real people make mistakes, change their minds, deviate from plans,
> enter messy numbers, come back tomorrow, and use a phone. **Most defects hide in the
> deviation, not the demo.** A clean "1 portion, 150 g" pass will pass a broken app.

Two rules that catch the highest-value bugs:

1. **Always reload.** After every create/edit/delete, refresh the page (or navigate
   away and back). Verify what you entered actually survived and reads back correctly.
   *(This is how the "portions reset to 1 on reload" data-loss bug surfaces.)*
2. **Always deviate.** For every action, also do the "wrong"/unusual version — half a
   portion, the same thing twice, a 0, a blank, a typo, a 40-character name, food you
   never entered.

## Setup

```bash
docker compose up -d
# isolated clone so destructive scenarios never touch real data
docker exec nutritional_db psql -U nutritional_user -d postgres \
  -c "CREATE DATABASE nutritional_review TEMPLATE nutritional_db;"
AUTH_DISABLED=true DATABASE_URL=…/nutritional_review npx next dev -p 3300
```

Drive it with the capture scripts (extend them as the matrix grows):
- `scripts/ux-review.ts` — feature sweep, **both** viewports (desktop 1440×900, mobile 390×844, 2× DPI).
- `scripts/ux-review-personas.ts` — multi-step real-user journeys.

Capture **before + after** for every action, at **both** viewports. Tear down: kill
:3300 and `DROP DATABASE nutritional_review`.

---

## The scenario matrix

Apply **every** dimension below to **every** feature. If a dimension is "N/A" for a
feature, say so explicitly — don't skip it silently. This matrix is the part that was
missing before; treat each cell as a required check.

### Cross-cutting dimensions (run against every action)

| # | Dimension | Always try… | The bug it catches |
|---|-----------|-------------|--------------------|
| 1 | **Happy path** | the obvious correct input | baseline works |
| 2 | **Persistence / reload** | refresh + navigate away/back after every mutation | data silently lost or reset on reload |
| 3 | **Fractional & precision** | 0.5, 1.5, 0.333…, 2 dp | rounding, trailing zeros, "0.0" shown for a non-zero, raw floats like `× 0.6666667` |
| 4 | **Boundary values** | 0, negative, empty, huge, tiny, max length | clamping, overflow, accepted-but-wrong |
| 5 | **Pluralization & grammar** | counts of 0, 1, 2, many | "1 ingredients", "1 portions", "0 food" |
| 6 | **Invalid input + feedback** | letters, 0, negative, blank, whitespace, duplicate, out-of-range | silent no-op (no error), unclear/again-hidden errors |
| 7 | **Duplicates / repeats / concurrency** | the same action twice, the same entity twice, rapid double-click | merges, dupes, lost instances |
| 8 | **Ordering** | add items in a deliberate order, reload | insertion order not preserved |
| 9 | **Mistakes & corrections** | edit it, change it back, delete it, undo, move to another day | no edit path, no undo, no feedback, can't move |
| 10 | **Deviation from plan** | do less / more / none / substitute / skip | model assumes the plan was followed exactly |
| 11 | **Units & conversion** | per-100g vs per-item everywhere; a plausible-but-wrong unit (lb for kg) | unit mismatch across surfaces; no sanity guard |
| 12 | **Long / special content** | 40+ char names, punctuation, emoji | truncation, wrap, overflow, layout break |
| 13 | **Cross-surface consistency** | compare the same datum in list vs preview vs chart vs export vs modal | inconsistent formatting/labels/rounding between places |
| 14 | **Date & time edges** | today, past, future, midnight rollover, sticky inheritance | wrong-day logging, "TODAY" label on a past day, tz drift |
| 15 | **Empty & first-run** | zero data, no search results, brand-new account | missing/blank/ugly empty states |
| 16 | **Destructive aftermath** | delete something referenced elsewhere; delete a template with history | broken references, lost history, or over-aggressive cascade |
| 17 | **Responsive** | every screen at mobile width; scroll long lists | reflow, tap-target size, floating elements overlapping content |
| 18 | **Feedback & latency** | watch toasts/loading; optimistic vs server truth | toasts stack/never dismiss/overlap controls; optimistic UI disagrees with reload |
| 19 | **Accessibility** | keyboard-only, focus order, modal focus trap, contrast (esp. errors) | no focus ring, lost focus, low-contrast error, missing labels |
| 20 | **Beauty & consistency** | spacing rhythm, alignment, type scale, pigment system, motion | one-off colours, misalignment, inconsistent components |

### Per-feature checklist (map to `docs/FEATURES.md`)

For each area, run the matrix above; these are the area-specific must-tries.

- **Auth & access** — signed-out view (nav hidden?); unauthorized email on `/denied` (does it name the email?); post-login redirect; brand presence.
- **Food database** — per-100g **and** per-item create; flip unit type while editing (serving-size required affordance); empty/unknown nutrients (does blank become a silent 0?); duplicate name; delete a referenced food (clear blocked message); long supermarket names; search no-match; unbounded list (scroll ~500 rows on mobile).
- **Meal templates** — mixed per-item + per-weight ingredients; 1-ingredient meal (plural); save → reload → re-open for edit (do amounts round-trip?); delete a meal that has logged history; expanded nutrient bars' scale/reference.
- **Daily entry** — add by weight / by item / meal by **portions ≠ 1** (½, 1½, 2) then **reload**; same meal twice/day; edit a logged amount to 0/blank/huge; remove a food / whole meal / one ingredient; meal logged then modified (any "edited" cue?); **food not in the DB** (quick-add path?); date nav past/future/today-label; over-target hero; macro target-vs-limit indicators when exceeded.
- **Daily targets** — target vs limit per nutrient; copy-previous when none exists; change mid-week (does it touch past days?); modal a11y (Esc/click-out/focus); toast overlap of Save.
- **Body weight** — morning/evening independently; clear to empty (NULL not 0); >500 and plausible-but-wrong (e.g. 150 meaning lb); weight-only day with no food.
- **Dashboard** — sparse/missing days (interpolation); < 14 weight points (maintenance hidden?); first-run with little data; all ranges + all tabs; axis labels/ticks; **mobile chart legibility**; tooltip.
- **CSV export** — each format; from > to; do exported numbers match the plotted/rolling values; meals expand to ingredients.

### Persona journeys (multi-step, end-to-end)

Run these as continuous stories, reloading between sessions:

- **Meal-prepper** — batch-cook → save meal → through the week log ½, 1, 2 portions; eat the same batch twice in a day; correct a portion later.
- **Eats out / off-plan** — log food not in the DB; cook a recipe missing an ingredient; eat more than planned; eat nothing they planned.
- **Mistake-prone** — wrong food, wrong amount, wrong day; fix via edit; try to undo; double-click add.
- **Casual / sparse tracker** — logs a few days a week, weighs rarely; what do the dashboard and maintenance estimate do?
- **New user (first run)** — empty everything; create first food, first meal, first day.
- **Returning user** — opens yesterday/last week; does the history read back exactly as entered?

---

## Recording findings

For every issue capture all four:

- **Severity** — Major (breaks trust / real friction) · Minor (noticeable detail) · Polish (refinement).
- **Evidence** — the before/after screenshot path(s).
- **Root cause** — `file:line` where possible (read the code, don't just assert from the UI).
- **Impact on a real user** — say who it hurts and how (the meal-prepper, the person eating out, …).

Lead the report with the highest-leverage issues (data integrity and anything that
recurs across surfaces), and call out **what's genuinely excellent** too — the review
should protect the craft, not just list faults.

## Close the loop

Turn the sharpest journeys into **assertions** in the e2e suite (not just screenshots),
so regressions can't return: e.g. log 0.5 portions → reload → expect "0.5 portions";
log a meal twice → expect two entries; inline-edit to 0 → expect a visible result;
exceed the calorie target → expect a clear over-state; reduce a meal to one ingredient
→ expect "1 ingredient". `scripts/ux-review-personas.ts` already drives these.
