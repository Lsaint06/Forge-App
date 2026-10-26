# Project REFORGE — Phase 7.3A: Nutrition Architecture and Reference Mapping

**Status:** accepted by the founder with a required roadmap amendment (§7, §9, §10). The audit itself changed no production UI, data or tests.

- **Baseline:** `31d43a9` (Phase 7.2C-4), identical to `origin/feat/forge-paths-foundation`, clean tree.
- **Approved reference:** `ChatGPT Image Oct 24, 2026, 09_17_59 PM-3.png`, 941 × 1672 px, from the founder's Downloads folder. It is the same file Phase 7.0 inspected (7.0 §3.1, §4.3), which recorded its size as 768 × 1365; that was incorrect. Stored unaltered as [nutrition-approved-2026-10-24.png](../redesign/reforge/references/nutrition-approved-2026-10-24.png) (SHA-256 `581A17F1…923843`).
- **Inputs:**
  - the REFORGE foundation ([REFORGE_FOUNDATION.md](../redesign/REFORGE_FOUNDATION.md));
  - the Phase 7.0 roadmap (§13, 7.3-1 to 7.3-6) and decisions D11 – D14 and D29;
  - the asset register ([ASSETS.md](../redesign/reforge/ASSETS.md)).

---

## 1. Existing nutrition feature inventory

Verified in code and tests. **Exists** means it ships today; **Build** means it would be new functionality.

| Capability | Status | Where | Notes |
| --- | --- | --- | --- |
| Nutrition tab | **Exists** | [app/(tabs)/nutrition.tsx](../../app/(tabs)/nutrition.tsx) → [Nutrition.tsx](../../src/screens/Nutrition.tsx) `tab` | Added in 7.1A. It still renders the **DS 2.0** `Screen`: no brand header and no REFORGE cards |
| Pushed Nutrition screen | Exists | `/journal?kind=nutrition` → [Journal.tsx](../../src/screens/Journal.tsx) | Same screen with Back (fallback: the tab) |
| Daily calories against target | Exists | [MacroSummary.tsx](../../src/components/nutrition/MacroSummary.tsx) | "1,940 of 2,400 kcal", "460 left" / "N over", progress bar. Target shown **only when personalised** (`targetsPersonalized`) |
| Protein, carbs, fat totals and bars | Exists | `MacroSummary` | Bars only against personal targets. Columns fall back to rows when labels don't fit |
| Unset-targets state | Exists | "Set your daily targets" → You `?edit=nutrition` | Defaults are never shown as targets (tested) |
| Day navigation | Exists | [DaySwitcher.tsx](../../src/components/DaySwitcher.tsx) (Nutrition only) + `DateSheet` | Previous / next day, past days via calendar, never past today. A chosen past day stays; otherwise follows today, including after the app wakes |
| Historical totals | **Partial** | Per day only (DaySwitcher); the nutrition goal keeps a 7-day met / missed history | No weekly or monthly nutrition view or chart |
| Meal grouping | Exists | `groupByMeal` | Breakfast, Lunch, Dinner, Snacks (always shown, in order), then legacy free-text meals under their own names, then "Other". Every entry appears once |
| Per-meal totals | Exists | `MealGroup.totals` | kcal shown; P/C/F computed but not shown per meal |
| Add to a meal | Exists | Meal header **Add** → `QuickAddSheet` with that meal | Footer **Add food** uses `defaultMeal()` (time of day) |
| Food search | Exists | [QuickAddSheet.tsx](../../src/components/nutrition/QuickAddSheet.tsx) | One search over recent, saved and library foods. The library search is deferred so typing stays responsive; shown 30 at a time |
| Food library | Exists | [food-library.ts](../../src/domain/food-library.ts), [food-catalog.ts](../../src/data/food-catalog.ts), `src/data/food-library/` | USDA FoodData Central (FNDDS 2021-2023 + SR Legacy), **3,730 foods**, catalogue `2026.1`, CC0. Read-only and offline; parsed on first use, warmed 300 ms after Nutrition renders. "Common foods" (18 featured) when not searching |
| Serving quantities and units | Exists | `PortionChoice`, `valuesForGrams`, `servingOf`, `choiceError` | Grams 0.1 – 5,000, or household portions × 0.01 – 100. Values per 100 g × grams / 100 (only float noise removed) |
| One-tap logging with Undo | Exists | `QuickAddSheet` + | Recent and saved foods at their usual servings; library foods at 100 g. Double-tap guard; Undo removes exactly that entry |
| Food detail before adding | Exists | Sheet steps `food` / `library` | Servings, meal, grams or portion, values preview, "Save to my foods", "View on FoodData Central" |
| Recent foods | Exists | `foodChoices` | Last 8 distinct foods, at the servings last eaten; searching looks through all history |
| Favourite foods | **No** (by design) | — | **Saved foods** fill this role |
| Custom foods | Exists | Create from label (sheet `create`); [SavedFoods.tsx](../../src/screens/SavedFoods.tsx) | `food` journal records; duplicates refused (`isDuplicateFood`) |
| Custom meals / recipes | **Build** | — | Not supported |
| Edit an entry | Exists | [FoodEditorSheet.tsx](../../src/components/nutrition/FoodEditorSheet.tsx) + [FoodForm.tsx](../../src/components/nutrition/FoodForm.tsx) | Only changed fields are written (`mergeEntry`); library values edited are marked "based on USDA"; the date can move; discard asks first |
| Entry actions | Exists | Row overflow menu | Edit, Copy to today (past days), Save as food, Delete (confirm). Copy and Save show an Undo banner, announced to screen readers |
| Future-dated entries | Exists | "Dated after today" section | Older entries could be typed with a future date; kept reachable |
| Nutrition targets | Exists | You → *Nutrition targets* (`ProfileForm` focused editor) | kcal 0 – 20,000, protein ≤ 2,000, carbs ≤ 3,000, fat ≤ 2,000 g. Saving records `nutritionTargetsSaved` |
| Nutrition goal | Exists | Goals, metric `nutrition` ([goals.ts](../../src/domain/goals.ts) `calories`) | Daily calories at least / at most, with a **7-day** met / missed / nothing-logged history |
| Home card | Exists (REFORGE) | `NutritionToday` in [home/sections.tsx](../../src/screens/home/sections.tsx) | Ring + macros; opens the tab |
| Persistence | Exists | `journal` table (SQLite), kinds `nutrition` and `food` | Every write is validated (`journalSchema`, `validateJournal`: name required; kcal / P / C / F ≤ 20,000; quantity 0.01 – 1,000) inside a transaction |
| Synchronisation | Exists (optional) | `queue()` outbox → [sync.ts](../../src/cloud/sync.ts) via Account (Supabase, when configured) | Manual sync; conflicts are recorded, never overwritten |
| Backup | Exists | `exportBackup` (journals included) | Restores through the same validation |
| Offline | Exists | Everything above | No network is needed for logging, search or the library |
| Hydration | **Build** | — | No data (D11) |
| Nutrition streak | **Derive / Build** | — | No streak exists. Derivable from goal history or logged days (D12) |
| Meal times | **No data** | — | `createdAt` is when an entry was logged, not eaten (D13) |
| Food photographs | **No data** | `nutritionHero` artwork slot is empty | No food imagery may be AI-generated (ASSETS.md) |

## 2. Route and component map

```
Tab bar ── Nutrition (app/(tabs)/nutrition.tsx) ─┐
Home "Nutrition today" ── navigate ──────────────┤
Progress → Nutrition ── navigate ────────────────┤
You → Nutrition log ── navigate ─────────────────┼──► Nutrition.tsx (tab)
/journal?kind=nutrition (older links) ───────────┴──► Nutrition.tsx (pushed, Back)

Nutrition.tsx
 ├─ DaySwitcher ── DateSheet (shared)
 ├─ Undo banner (Card + TextButton)
 ├─ MacroSummary ── ProgressBar, TextButton → You ?edit=nutrition
 ├─ MealSection × n ── ListSection / ListRow / OverflowMenu (shared DS 2.0)
 ├─ "Dated after today" ListSection
 ├─ Saved foods ListRow → /journal?kind=food → SavedFoods.tsx ── FoodEditorSheet
 ├─ Footer Button "Add food"
 ├─ QuickAddSheet (Sheet, SegmentedControl, Field, FlatList; steps list / food / library / create)
 │    └─ FoodFields (FoodForm.tsx)
 └─ FoodEditorSheet (Sheet) ── FoodFields, SourceNote

Domain (protected): domain/nutrition.ts, domain/food-library.ts, domain/metrics.ts nutritionTotals,
domain/validation.ts, domain/goals.ts (nutrition metric), data/repository.ts (journal, outbox),
data/food-catalog.ts, data/food-library/*, scripts/food-library/*
```

**Shared controls**, which stay unchanged until 7.6: `Sheet`, `Field`, `SegmentedControl`, `DateSheet`, `ListRow`, `ListSection`, `OverflowMenu`, `Button`, `TextButton`.

- **Restyle freely (Nutrition only):** `DaySwitcher` and `MacroSummary` (the latter used only by Nutrition).
- **Nutrition-only, restyled from the inside:** `QuickAddSheet`, `FoodEditorSheet`, `FoodForm`, `SavedFoods`.

## 3. Approved mockup breakdown

**Measurement method.** Measured horizontally at 2.394 px per pt (941 px ÷ 393 pt). Vertical sizes are compressed in the 9:16 canvas, so fidelity is proportional: widths, margins, order, hierarchy and type ratios match, and heights grow to the 44 pt minimum.

| # | Element (top → bottom) | Position and hierarchy | ≈ pt at 393 wide |
| --- | --- | --- | --- |
| M1 | Brand header: FORGE wordmark, tagline, bell with dot, streak pill "🔥 12" | Top bar, as on every tab | Shared `BrandHeader` |
| M2 | Title "Nutrition" + subtitle "Fuel your progress. Consistency compounds." · right: "FRI, APR 25" / "Week 8 · Build Phase" | Same composition as Home's `TitleBlock` | — |
| M3 | **Today's Nutrition** hero card | The dominant card. Ember overline; giant "1,940" with "of 2,400 kcal"; ember bar with "81%"; three macro columns (value, label, mini bar; protein bar ember, carbs and fat grey) separated by hairlines. Right ~40 %: food photograph fading in, vertical tagline "BETTER FUEL STRONGER TOMORROWS", short ember rule | Full width × ~136 tall |
| M4 | **Calorie goal** card (left, ~57 %) | Overline + chevron; ember target icon; "2,400 kcal / Daily goal"; three stats: Consumed, Remaining, % Complete, with hairline separators | ~203 wide |
| M5 | **Nutrition streak** card (right, ~43 %) | Overline + chevron; flame; "12 days / On track"; M–S dots (filled ember = on track, today labelled "F", outlined = upcoming) | ~148 wide |
| M6 | **Today's meals** card | Overline; day total "1,940 kcal" + chevron. Four rows on a vertical timeline: meal icon (sun, sun, moon, cup) + time; food photo tile; meal name (bold) + foods; kcal (bold) + "35P 45C 12F"; chevron | Full width; rows ~41 tall in the mockup (≥ 56 in app) |
| M7 | **Quick add** card (left, ~51 %) | Overline + chevron; four tiles (icon, food name, kcal) | ~179 wide; tiles ~35 × 46 |
| M8 | **Hydration** card (right, ~49 %) | Overline; blue drop; "2.1 L of 3.0 L"; blue bar 70 %; bottle photo; tagline "HYDRATE PERFORM RECOVER" | ~172 wide |
| M9 | Tab bar, Nutrition selected | Ember icon and label | Existing `ForgeTabBar` |

**Visual language** (consistent with the four approved tabs):

- Near-black cards with hairline borders.
- Letter-spaced overlines (M3 and M6 in ember or white, the half-width cards in white).
- Condensed heavy numerals.
- Ember used for progress, the protein bar, icons and streak dots; carbs and fat bars in grey.
- 16 pt margins and a tight card rhythm.

## 4. Feature-to-mockup mapping

Classes:

- **R** reuse existing data;
- **P** presentation of existing data;
- **D** derived (new read-only formula, unit-tested);
- **F** new functionality;
- **X** omit.

| Element | Existing support | Data | Must preserve | Missing | Class | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| M1 Brand header | `ForgeScreen` + `BadgePill` (Home, Train) | Training day streak (`summary().streak`) | Tab has no Back; `/journal?kind=nutrition` keeps Back | Bell (D14: omitted app-wide) | R / X | Pushed variant needs `ForgeSubScreen` instead (no brand header, C1) |
| M2 Title block | Home `TitleBlock` pattern; plan text from `planStatus` | Date, week and phase when a plan is active | — | Subtitle copy (D29) | R / P | Week/phase only when a plan exists |
| M3 Hero: kcal, of target, bar, % | `MacroSummary` maths; `ForgeProgress` | `totalsOf`, profile targets, `targetsPersonalized` | **Never show defaults as targets**; "left / over" from the shown total; the "Set your daily targets" action | "81 %" (P: `totals / target`, display rounding only) | R / P | Over 100 %: bar caps, text says "N over"; % must not exceed what the bar shows without saying "over" |
| M3 Macro columns | `MacroSummary` (stacked fallback) | Totals, targets | Bars only against personal targets; large-text stacking | — | R | The narrow column next to artwork at large text: stack under the number instead |
| M3 Food photograph and tagline | `HeroCard`, empty `nutritionHero` slot | — | No AI imagery | Licensed artwork | X now | Without art: ember glow, as on Home (N2) |
| M4 Calorie goal card | Same numbers as M3 | Target, consumed, remaining, % | Personal targets only; opens target editor (You `?edit=nutrition`) | — | P | **Duplicates M3** (7.0 noted; D29). Without targets: becomes a "Set your daily targets" card |
| M5 Nutrition streak | Nutrition goal history (7 days, met / missed / none) | `evaluate()` for an active `nutrition` goal, or logged days | No invented streak | Streak count across weeks | D / F | Two meanings in one place (goal on-target vs days logged); must be labelled honestly (N3) |
| M5 M–S dots | Same | Per-day state this week | — | — | D | Future days outlined, not "missed" |
| M6 Meals list | `groupByMeal` | Groups, totals, entries | Legacy and "Other" groups; every entry once; **Add to meal** | — | R | Accessibility labels per entry must carry over |
| M6 Meal icon | — | Meal key | — | — | P | Icons only for the four meals; legacy groups get a neutral icon |
| M6 Time "7:00 AM" | — | No eating time | — | Eating time | X | D13: omit. `createdAt` is logging time and would mislead |
| M6 Food photo tile | — | — | — | Imagery | X | Replace with the meal icon tile (no photos) |
| M6 Foods line | Entry names | `entries[].data.name` | — | — | P | Truncate to one line; spoken in full |
| M6 kcal + "35P 45C 12F" | `MealGroup.totals` | Per-meal totals | Raw totals, display rounding | — | R / P | "P/C/F" abbreviations need spoken labels ("protein 35 grams") |
| M6 Chevron → meal detail | Entries inline; OverflowMenu actions | Entries | **Edit, Copy to today, Save as food, Delete, Add to meal**, tap-to-edit | A meal view | P | Choice of inline expand vs sheet vs pushed screen (N4) |
| M6 Day total + chevron | `totals.calories` | — | — | — | R | Chevron target undefined (N4) |
| M7 Quick add tiles | `foodChoices` recent + saved, one-tap log, Undo | The lifter's **own** recent / saved foods | Double-tap guard; Undo; meal and day chosen correctly | Tile icons per food | R / P | One tap logs into `defaultMeal()` on the viewed day; must show Undo and announce. Empty for new users (N5) |
| M7 Quick add chevron | `QuickAddSheet` | — | Library warm-up | — | R | — |
| M8 Hydration | — | — | — | New journal kind or setting, sync and backup review | F / X | D11: omit (N6). Blue is off-palette |
| M9 Tab bar | `ForgeTabBar` | — | — | — | R | — |
| (not in mockup) DaySwitcher | Exists | — | Past days, never future | — | R | Needed below the title; restyle (Nutrition-only) |
| (not in mockup) Undo banner | Exists | — | Announces; 6 s | — | R | REFORGE toast styling |
| (not in mockup) "Dated after today" | Exists | — | Reachable | — | R | Keep below meals |
| (not in mockup) Saved foods link | Exists | — | Reachable | — | R | `ForgeListRow` |
| (not in mockup) Add food footer | Exists | — | Always reachable | — | R | Pinned `CtaButton` vs Quick add's chevron (N7) |
| (not in mockup) Empty day hint | Exists | — | Explains logging | — | R | `ForgeEmpty`-style text inside the meals card |

## 5. Missing capabilities and implementation risks

**Missing (build only if approved):**

- **Hydration (F):** a new journal kind or settings key, validation, sync priority, backup, goal type, and a new colour. A separate feature project.
- **Nutrition streak (D or F):** the honest D version reads existing data. A true multi-week streak needs a definition of "on track" (nutrition goal met? targets within ±X %? anything logged?).
- **Meal times (F):** needs an "eaten at" field. Today only `createdAt` exists.
- **Food photography (asset):** licensed or commissioned only; no AI imagery.
- **Custom meals / recipes (F):** not in the mockup; not proposed.
- **Weekly nutrition history (F):** not in the mockup; not proposed for 7.3.

**Risks:**

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Dashboard duplication (M3 vs M4) makes the tab longer and repeats numbers | N1 decision; compact M4 |
| R2 | The tab grows tall: hero, two pairs and the meals list exceed one screen even before entries | Accept scrolling (7.0 §3.2); keep Add food pinned |
| R3 | Half-width pairs (M4 / M5, M7 / M8) at compact widths and large text | `pairFits()` as on Home: stack when they don't fit |
| R4 | Meal rows from inline entries to summaries could hide entry actions | Every action stays reachable within one tap of the meal (N4) and is tested |
| R5 | `QuickAddSheet` is 900 lines with keyboard, roomy and short-screen modes and tested timings | Restyle inside its existing structure; no logic changes; keep `Sheet` (shared) |
| R6 | The pushed `/journal?kind=nutrition` variant must not show the brand header | `ForgeSubScreen` for the pushed variant, `ForgeScreen` for the tab |
| R7 | Percentages and "remaining" rounding | Use the same shown-total rule as `MacroSummary`; unit-test the formatter |
| R8 | 111 nutrition UI assertions and 127 library assertions depend on labels | Keep accessibility labels and texts; change tests only where wording is approved |
| R9 | Library warm-up timing (300 ms) and offline parse | Keep the effect in place; no change to `food-catalog.ts` |
| R10 | Light mode | The REFORGE light palette maps; check on device |

## 6. Protected calculations and data boundaries

**Do not change** (any change needs a separate written proposal):

| Area | Protected items |
| --- | --- |
| Calculations | `nutritionTotals` (Σ value × quantity on raw values), `entryCalories`, `macrosOf`, `totalsOf`, `valuesForGrams` (only float noise removed), `servingOf`, `totalGrams`, `choiceError` limits, `amount` / `gramsText` / `kcalText` display rounding |
| Rules | `targetsPersonalized` + `TARGETS_SAVED`; `defaultMeal` times; `canonicalMeal`; `groupByMeal` ordering and grouping; `foodChoices` ordering, limit and search; `isDuplicateFood` / `foodKey` |
| Records | `journal` kinds `nutrition` and `food`; fields name, meal, calories, protein, carbs, fat, quantity, serving, notes, `sourceId`, `sourceCatalog`, `sourceGrams`, `sourceEdited`; `mergeEntry` (only edited fields) and `withSourceEdits` |
| Validation | `journalSchema`, `validateJournal` limits, profile target limits |
| Storage and sync | `addJournal` / `updateJournal` / `deleteJournal` transactions and outbox queue; sync; backup schema |
| Food library | `src/data/food-library/*` (SHA-256 `2d95151e…6d6001`, 3,730 foods), `decodeLibrary`, `searchLibrary` and synonyms, `scripts/food-library/*`; `food-library:check` must stay reproducible |
| Goals | `nutrition` goal evaluation and `CALORIE_HISTORY_DAYS` |

**Presentation-only additions allowed:**

- read-only formatters, such as percent complete or a per-meal "35P 45C 12F" string;
- view models (`src/screens/nutrition/model.ts`), unit-tested against the protected functions.

## 7. Checkpoint sequence (amended after founder review)

**Founder amendment (7.3A review).** Phase 7.3 must also deliver:

1. a substantial catalogue of real, identifiable **branded foods**;
2. **camera barcode scanning** with product lookup and logging.

Both are mandatory before Phase 7.3 is complete; neither may be deferred. The original plan (7.3B–7.3E) omitted them and is replaced by the sequence below.

**Second founder amendment (hydration).** Hydration appears in the approved mockup and is now a **mandatory** Phase 7.3 feature: the earlier deferral (N6) is reversed. It becomes 7.3C, and the later checkpoints move by one. Branded foods, barcode scanning and hydration are all mandatory before Phase 7.3 is complete.

Each checkpoint:

- runs the full suite (typecheck, lint, format, logic, UI, food library, iOS / Android export);
- adds focused tests;
- stops for founder approval.

| Checkpoint | Scope | Status |
| --- | --- | --- |
| **7.3B** | Nutrition dashboard transformation and visual refinement | Authorized; built, in founder review |
| **7.3C** | Hydration tracking and dashboard integration | Architecture proposed ([PHASE_7_3C_HYDRATION_ARCHITECTURE.md](PHASE_7_3C_HYDRATION_ARCHITECTURE.md)); implementation needs founder approval |
| **7.3D** | Food discovery, search, serving selection and logging redesign | After 7.3C |
| **7.3E** | Branded foods, real product data and catalogue expansion | Gated by the feasibility report (§10) |
| **7.3F** | Barcode scanning and product lookup | Gated by the feasibility report (§10) |
| **7.3G** | Saved foods, goals, history and supporting screens | After 7.3F |
| **7.3H** | Final integration, accuracy, performance and visual QA | Last |

### 7.3B — Nutrition dashboard transformation

| | |
| --- | --- |
| **Files** | `src/screens/Nutrition.tsx` (frame and composition); new `src/screens/nutrition/sections.tsx` (hero, calorie goal, nutrition streak, meals, quick add, card pair) and `src/screens/nutrition/model.ts` (read-only view model); `src/components/DaySwitcher.tsx` (REFORGE restyle; used only by Nutrition); Home's `TitleBlock` gains an optional subtitle (Home unchanged) |
| **Reuse** | `ForgeScreen`, `ForgeSubScreen`, `BadgePill`, `FText`, `ForgeCard`, `CardHeader`, `ForgeProgress`, `ForgeListRow`, `RowDivider`, `CtaButton`, `pairFits` |
| **Unchanged** | `QuickAddSheet`, `FoodEditorSheet`, `FoodForm`, `SavedFoods` (they open exactly as before); all §6 protected logic |
| **Tests** | `tests/nutrition-model.test.ts`; `tests/ui/nutrition-dashboard.test.tsx`; existing nutrition suites keep their assertions, with the extra "expand the meal" tap the approved meal rows require |

### 7.3C — Hydration tracking and dashboard integration

| | |
| --- | --- |
| **Architecture** | [PHASE_7_3C_HYDRATION_ARCHITECTURE.md](PHASE_7_3C_HYDRATION_ARCHITECTURE.md): a separate hydration journal kind (never mixed with food records or totals), canonical millilitres, a daily goal and fluid-unit preference in the profile, validation, backup and sync effects, migration (none needed for existing data) |
| **Scope** | Daily totals; configurable goal; mL / fl oz preference; quick-add and custom amounts; edit and delete; day-by-day history; offline, backup and sync; the real Hydration card in the dashboard's reserved place beside Quick add |
| **Gate** | Founder approval of the architecture and its decisions before any code |

### 7.3D — Food discovery, search, serving selection and logging

| | |
| --- | --- |
| **Files** | `QuickAddSheet.tsx`, `FoodEditorSheet.tsx`, `FoodForm.tsx` |
| **Plan** | REFORGE rows, section labels, values card, empty and error states, inside the shared `Sheet` / `Field` / `SegmentedControl` / `DateSheet`. Structure the search results so a "Branded" source (7.3E) and a "Scan barcode" entry (7.3F) can join without another redesign |
| **Unchanged** | Search, paging, ordering, portions, limits, Undo and double-tap guards, keyboard modes, library warm-up |
| **Tests** | `food-library.test.tsx` and the logging tests in `nutrition.test.tsx`; new REFORGE and large-text checks |

### 7.3E — Branded foods, real product data and catalogue expansion

| | |
| --- | --- |
| **Prerequisite** | Founder approval of the provider and scanner feasibility report (§10), including licensing |
| **Target** | **Maximum useful, reliable coverage, with no artificial cap or stopping point** (founder, 7.3B review): identifiable brand and product, reliable serving size and nutrition. App size, memory, search latency and barcode-lookup speed stay under control: the catalogue must scale **without loading the whole product database into memory** (indexed, paged or on-disk lookup) |
| **Principles** | Never invent nutrition data or product identities. Keep the snapshot model: a logged branded food stores its own values plus source and product identifiers, so history never depends on the catalogue. Keep the existing 3,730-food generic catalogue unchanged and separately versioned |
| **Likely files** | A new branded catalogue module beside `src/domain/food-library.ts` (decoder, search, GTIN index), a build or update script with source manifests and hashes, attribution UI, and search integration in `QuickAddSheet` |
| **Data-model note** | Branded entries need product identifiers (brand, GTIN, provider id). This is a **separate written proposal**, as §6 requires, before any field is added |
| **Tests** | Catalogue integrity (counts, hashes, no placeholder data), normalisation (per serving vs per 100 g, kJ vs kcal), deduplication by GTIN, search ranking, logging snapshots |

### 7.3F — Barcode scanning and product lookup

| | |
| --- | --- |
| **Prerequisite** | Same report (§10); the camera dependency needs founder approval (new dependency) |
| **Plan** | Scan from Add food. Normalise UPC / EAN / GTIN with check digits. Look up the local branded catalogue first, then the online provider; cache found products locally. An unknown barcode falls back to manual entry from the label |
| **Constraints** | Camera permission copy; physical-device testing (iPhone and Android); offline behaviour (the local catalogue keeps working, online lookup fails clearly) |
| **Tests** | GTIN normalisation, lookup order, cache, unknown-barcode fallback, permission-denied state; device checklist |

### 7.3G — Saved foods, goals, history and supporting screens

| | |
| --- | --- |
| **Files** | `SavedFoods.tsx` → `ForgeSubScreen`, `ForgeSearchField`, REFORGE rows; an "Edit targets" path; nutrition history surfaces identified in this audit |
| **Unchanged** | Saved-food rules, target validation, goal evaluation |

### 7.3H — Final integration, accuracy, performance and visual QA

**Scope:**

- **Entry points:** the tab, the Home card, Progress, You, `/journal?kind=nutrition`, Saved foods Back.
- **Totals:** identical for a fixed fixture before and after.
- **Accuracy:** branded and scanned values checked against labels.
- **Performance:** library and branded catalogue load and search time.
- **Accessibility, light mode and the smallest iPhone.**
- **Founder visual review** against the reference.

## 8. Verification baseline (at `31d43a9`, before any 7.3 work)

| Check | Result |
| --- | --- |
| TypeScript | Clean (`tsc --noEmit`) |
| ESLint | 0 errors, 1 existing warning (`tests/ui/templates-wp3.test.tsx`, unused `Repo`) |
| Prettier | All files formatted |
| Logic tests | 402 / 402 |
| UI tests | 38 suites, 392 / 392 |
| Food library | Reproducible: 3,730 foods, catalogue SHA-256 `2d95151e…6d6001` |
| iOS / Android export | Both OK; Hermes bundles 7.8 MB each; 48 anatomy assets |

**Nutrition coverage today:**

| File | Tests |
| --- | --- |
| `tests/ui/nutrition.test.tsx` | 18 |
| `tests/ui/nutrition-tab.test.tsx` | 3 |
| `tests/ui/food-library.test.tsx` | 9 |
| `tests/nutrition.test.ts` | 13 |
| `tests/food-library.test.ts` | 27 |

Plus nutrition assertions in the Home, Goals, You, navigation and WP6 suites.

## 9. Founder decisions

### 9.1 Decided in the 7.3A review (apply to 7.3B)

| # | Decision | Outcome |
| --- | --- | --- |
| N1 | Calorie goal card | **Approved, with minimal repetition.** The card shows the daily goal and what is left or over. The hero already shows consumed and the percentage, so the card does not repeat them |
| N2 | Hero artwork | **Subtle REFORGE ember glow**; no photograph |
| N3 | Nutrition streak | **Derived from existing data, never fabricated:** consecutive days with food logged, and this week's logged days |
| N4 | Meal rows | **Expand in place**, keeping every existing food action |
| N5 | Quick add | **Recent and saved foods** with clearly stated portions and Undo |
| N6 | Hydration | ~~Deferred~~ **Reversed: mandatory in Phase 7.3 (7.3C).** Until 7.3C ships, nothing is simulated; the layout keeps its place beside Quick add |
| N7 | Add food | **Pinned ember action** |
| N8 / N9 | Title, date and context | **Follow the mockup** (title, subtitle, date; week and phase when a plan is active) |
| N10 | References | **The approved Nutrition mockup is stored unaltered** in [docs/redesign/reforge/references/](../redesign/reforge/references/README.md) |
| N11 | Header badge | **Shared training streak** |
| N12 | Meal times | **Omitted** (no eating time is recorded) |

### 9.2 Still open

| # | Decision | Needed before |
| --- | --- | --- |
| P1 | Branded-food provider(s), licensing and bundling vs online lookup (§10) | 7.3E |
| P2 | Camera dependency and scanner approach (§10) | 7.3F |
| P3 | Data-model proposal for branded product identifiers | 7.3E |
| P4 | Hydration architecture and decisions ([PHASE_7_3C_HYDRATION_ARCHITECTURE.md](PHASE_7_3C_HYDRATION_ARCHITECTURE.md)) | 7.3C |

## 10. Provider and scanner feasibility research (gate for 7.3E and 7.3F)

**Research only; no provider integration is authorized.** Report: [PHASE_7_3_FOOD_PROVIDER_SCANNER_FEASIBILITY.md](PHASE_7_3_FOOD_PROVIDER_SCANNER_FEASIBILITY.md) (prepared during 7.3B, for founder review). It covers:

- **Providers:** Open Food Facts; USDA FoodData Central Branded Foods; other commercially usable product databases (for example Nutritionix, FatSecret, Edamam).
- **Brand and product identity;** UPC / EAN / GTIN coverage.
- **Serving and nutrition normalisation** (per serving vs per 100 g, kJ vs kcal).
- **Licensing and attribution** (e.g. ODbL share-alike vs CC0), relevant to app-store distribution.
- **Data quality, update process and duplication.**
- **Online lookup vs offline bundling and caching.**
- **API keys, costs and rate limits.**
- **Expo SDK 58 camera compatibility** and physical-device testing (Expo Go vs development build).
- **Unknown-barcode fallback** and manual entry.

**Selection rule:** useful, identifiable products with reliable serving and nutrition information come first. Record counts alone never decide. The target is at least 10,000 useful records if feasible.
