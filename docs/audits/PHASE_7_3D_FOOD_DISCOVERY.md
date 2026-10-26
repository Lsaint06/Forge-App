# Project REFORGE — Phase 7.3D: Food Discovery and Logging

**Status:** implemented for founder review; not committed.

- **Baseline:** `45bb509` (Phase 7.3C), identical to `origin/feat/forge-paths-foundation`, clean tree.
- **Not in this phase:** the branded-food catalogue (7.3E) and the barcode scanner (7.3F).
- **Unchanged:** protected nutrition calculations, records and the 3,730-food library.

## 1. Journey audit (before)

| # | Step | Where | Behaviour that must stay |
| --- | --- | --- | --- |
| 1 | Open Add food | Dashboard **Add food**, a meal's **Add to …**, Quick add's header | Opens on the viewed day. The meal is the meal tapped, or `defaultMeal()` (time of day) |
| 2 | Choose a meal | Meal control in the sheet | Four meals; the choice applies to every add from the sheet |
| 3 | Search or browse | One field over recent, saved and library foods | Search is deferred while typing. Recent foods come first (last 8, at the servings last eaten), then saved foods, then the USDA library (featured "Common foods" when empty), shown 30 at a time. The list keeps its order while the sheet is open |
| 4 | Select a result | Tap a row → `detail` (own food) or `library` step | Nothing is logged by selecting |
| 5 | Review serving and nutrients | Step body | Own foods: values per serving × servings. Library: values per 100 g as published; household portions |
| 6 | Adjust the amount | Servings (0.25 steps), grams (10 g steps) or portions | Typed or stepped; comma decimals; limits 0.01–1000 servings, 0.1–5000 g, 0.01–100 portions; an over-large serving is refused |
| 7 | Log | **+** on a row (one tap) or **Add to meal** | Double-tap guard; snapshot of values with source keys; Undo for one-tap adds; screen-reader announcement |
| 8 | Confirm meal and date | "Adding to *day*"; the meal control | Past days log to that day |
| 9 | Edit, copy, save, delete | Expanded meal → entry → **Edit entry**; options menu | Only changed fields are written; source marked "based on USDA" when values change; move day or meal; discard prompt; duplicate saved foods refused |

## 2. What changed (after)

All changes are presentation only. The sheet's logic block (logging, guards, Undo, save copy, create, library loading, keyboard modes) is untouched.

| Step | Before | After |
| --- | --- | --- |
| Sheet frame | Design System 2.0 field, segments, buttons and text | REFORGE throughout: `ForgeSearchField`, `ForgeSegments` meal picker, REFORGE section labels, ember primary **Add to *meal*** (`CtaButton`) beside an outline **Back** |
| Search results | Plain rows with a caption | One `ResultRow` for every source: name (two lines), an optional brand line, "portion · kcal", a small provenance pill ("USDA", "Based on USDA"), and a 44 pt ember **+**. When added: "✓ Added · Undo". The library header shows how many foods matched ("214 foods"). Zero results: "No matches" plus guidance and **Create** |
| Selected food | Serving line, stepper, values card, meal | The serving stated plainly ("1 serving = 1 medium · 105 kcal · P … " or "Per 100 g: …"). An **Amount** stepper (REFORGE −/+ at 48 pt, a typed value, and the unit under it, e.g. "× 1 medium" or "grams"). A values card headed with what it is for ("For 1.5 × 1 medium", "For 160 g"), the kcal large, and protein / carbs / fat in columns. The meal picker, then **"Logs to Dinner · Today"** |
| Library extras | List row and caption | REFORGE **Save to my foods** row (becomes "✓ Saved to your foods"), the source line, and **View on FoodData Central** |
| New food / Edit entry | 2.0 fields and stepper | `ForgeField`s grouped in a "Per serving" card; REFORGE servings stepper with a live "Total …" line; REFORGE meal segments with the legacy-meal note; REFORGE day row; notes. Editor footer: outline **Cancel** and ember **Save** |

**Accessibility:** every label and spoken summary is unchanged ("Add Banana", "Undo adding …", "Increase Grams by 10", "Banana, 1 medium, 105 kcal", "225 kcal, protein 8 g, …"). The existing suites pass without edits.

**New REFORGE primitives** ([reforge/Field.tsx](../../src/components/reforge/Field.tsx)): `ForgeField`, `ForgeNumberField`, `ForgeStepper`, `ForgeChips`.

- They behave exactly like the 2.0 `Field`, `NumberField`, `NumberControl` and `Chips`: same `parseNumber` rules, live application while typing, announced errors.
- The 2.0 controls are unchanged and keep serving Goals, the profile form and templates.

## 3. Prepared for branded foods (7.3E)

- **[results.ts](../../src/components/nutrition/results.ts) `FoodResult`** is the one presentation shape for every source. It has slots for:
  - `brand`;
  - `barcode`;
  - `provenance`;
  - a stable `key` across sources;
  - spoken labels.

  Adapters (`choiceResult`, `libraryResult`) fill only what a source really has. A test checks that no brand or barcode is invented for the generic library.
- A branded source adds:
  - an adapter (`brandedResult`) and a `ResultSource` value;
  - a section in the list (e.g. "Brands · USDA Branded Foods") between Saved foods and the generic library;
  - a `library`-style step whose serving is the label serving, with grams when the label gives them.

  The rows, values card, stepper, meal and destination are reused.
- **Search contract for large catalogues:**
  - A branded search must return a **bounded page** of results (e.g. the first 30 plus a total count). It must never return the whole catalogue.
  - The list already renders pages and only the rows on screen, with deferred input.
  - The catalogue itself stays outside React state: indexed on disk or in a lazily loaded module, as the current library is.
- **Logging stays a snapshot**, as today: values per serving × quantity plus source keys. Brand and GTIN identifiers on entries need the separate data-model proposal (7.3A §6, feasibility B6).

## 4. Barcode entry point (7.3F)

- **Where:** a square scan button to the right of the search field in the Add food sheet, and the same action in Quick add's "All foods". **Nothing is shown in 7.3D:** no inactive control. The code marks the slot in `QuickAddSheet` (`controls`).
- **Handoff:**
  1. The camera returns a code.
  2. GTIN normalisation and check digit.
  3. Lookup: local branded catalogue, then the device scan cache, then the online provider.
  4. **Found:** open the same selected-food step (serving, Amount, values card, meal, "Logs to …"). The lifter confirms with **Add to *meal***; a scan never logs by itself.
  5. **Not found:** open **New food** pre-filled with the barcode, for label entry.
  6. **Offline:** say so, and offer New food.

## 5. Performance

| Concern | State |
| --- | --- |
| Rendering | `FlatList` with `initialNumToRender` and `maxToRenderPerBatch` of 14 and `windowSize` 7. Library results are paged 30 at a time ("Show 30 more") |
| Typing | The library search runs on `useDeferredValue`, so keystrokes are not blocked. Recent and saved matching is linear over the lifter's own records |
| Catalogue | The 3,730-food library is parsed once, offline, on first use (warmed 300 ms after the dashboard renders). It is not copied into component state; results are derived with `useMemo` |
| Conversions | `valuesForGrams` and serving totals are O(1) per render |
| Branded (7.3E) | Must meet the bounded-page contract (§3); nothing in the UI loads a full catalogue |

## 6. Tests

- [food-results.test.ts](../../tests/food-results.test.ts) (3): result model, provenance, nothing invented.
- [food-discovery.test.tsx](../../tests/ui/food-discovery.test.tsx) (6):
  - sections, counts, Clear search, no scan control;
  - the selected food shows serving, values for the amount, meal and day before logging once, with Undo;
  - Back keeps the search, Close dismisses, a past day is named;
  - empty states and Create;
  - custom food validation, total, meal and day;
  - compact and large text at 44 pt.
- Existing `nutrition.test.tsx`, `food-library.test.tsx`, `nutrition-tab`, dashboard and hydration suites pass unchanged.

## 7. Limitations

- The shared `Sheet` container (grabber, title, close) is still the Design System 2.0 sheet; it converges in 7.6.
- `DateSheet` (the day picker) is shared and unchanged.
- Saved foods (the screen) is restyled in 7.3G; its editor already uses the new fields.
- Search ranking is the existing library ranking.
