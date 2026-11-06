# FORGE — Phase 7B WP4A: Nutrition Pre-Implementation Audit

**Status:** audit complete; founder decisions recorded; **WP4A implemented and in review** (see "Implementation" at the end). The audit sections describe the app before WP4A.

**Baseline:** commit `4cf4348` on `feat/forge-paths-foundation`. Inputs:

- [PHASE_7A_PRODUCT_AUDIT.md](PHASE_7A_PRODUCT_AUDIT.md): C-05, C-06, WP4.
- Code inspection.
- The Android emulator (Expo Go 58), with screenshots in `forge-visual-harness\shots\android\p12\`.

Evidence labels:

- **[Code]**: read in source.
- **[Device]**: reproduced on the emulator.
- **[DB]**: confirmed by reading the device database after the interaction.

---

## 1. Existing Nutrition functionality

Nutrition has no screen of its own. It is two modes of the generic journal screen [Journal.tsx](../../src/screens/Journal.tsx):

- `/journal?kind=nutrition` is the log.
- `/journal?kind=food` is the saved-food library.

The same file also renders Measurements, Recovery and Goals.

| Capability                        | Status                          | Notes                                                                                                                                                                   |
| --------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log a food or meal                | **Implemented**                 | A 10-field sheet: typed date, name, typed meal, kcal/P/C/F per serving, servings, serving description, notes. [Code][Device]                                            |
| Daily totals                      | **Today only**                  | kcal against the target with a bar; P/C/F against targets as text. No totals for any other day. [Code][Device]                                                          |
| Nutrition history                 | **Flat list only**              | Every entry from every day in one list, newest date first, with a raw `2026-10-23` date per card. No grouping by day or meal and no per-day totals. [Device]            |
| Date navigation                   | **Not implemented**             | The only way to log for another day is typing `YYYY-MM-DD`.                                                                                                             |
| Meal categorisation               | **Free text**                   | "Lunch" is prefilled for new entries. Any string is accepted, so "breakfast", "Breakfast " and "Post-workout" are all different. Nothing groups by meal. [Code][Device] |
| Serving quantities                | **Implemented**                 | "Servings consumed" (min 0.01, max 1000) is typed. Totals multiply per-serving values. [Code]                                                                           |
| Saved foods: create, edit, delete | **Implemented**                 | Separate library screen with the same card and button pattern. [Device]                                                                                                 |
| Saved foods: reuse                | **Implemented, cumbersome**     | One full-width "Log <food>" button per saved food, above the history. With 26 foods that is 26 buttons before the first entry. [Device]                                 |
| Saved foods: search               | **Not implemented**             |                                                                                                                                                                         |
| Edit an entry                     | **Implemented**                 | The same sheet, prefilled. [Device]                                                                                                                                     |
| Delete an entry                   | **Implemented**                 | Confirmation required ("Delete entry? / Confirm"). [Device]                                                                                                             |
| Repeat an entry                   | **Implemented, unsafe**         | "Repeat today" copies the entry to today immediately, with no feedback, undo or double-tap guard. [Device][DB]                                                          |
| Save an entry as a food           | **Implemented, unsafe**         | "Save food" copies the whole entry, including `meal` and `notes`, with no duplicate check. [Device][DB]                                                                 |
| Nutrition targets                 | **Implemented, in You**         | You → Nutrition targets edits `profile.calories/protein/carbs/fat`. Defaults are 2000 / 150 / 200 / 65, shown as targets even if never set. [Code]                      |
| Barcode or food database          | **Not implemented (by design)** | The product spec forbids fabricated nutrition data; [IMPLEMENTATION_STATUS.md](../../IMPLEMENTATION_STATUS.md) records it as not implemented.                           |
| Per-entry macros                  | **Not shown**                   | Rows show kcal only. Macros are visible only when editing.                                                                                                              |
| Weekly or trend analytics         | **Not implemented**             | Progress has no nutrition analytics; it only links to the log.                                                                                                          |

**Entry points:**

- You → Health & body → **Nutrition log** and **Nutrition targets**.
- Progress → More → **Nutrition**.
- Nutrition → **Manage saved foods**.

Today/Home has no nutrition content.

**Existing tests that touch nutrition:**

- `nutritionTotals` scaling (`tests/domain.test.ts`).
- A nutrition journal round trip (`tests/repository.test.ts`).
- You and Progress navigation to the log.
- The journal sheet's unsaved-changes guard (measurement kind).

There is **no UI test of the Nutrition screen itself.**

---

## 2. Current UX problems

| #    | Problem                                                                                                                                                                                                                                                                               | Evidence                                                | Severity                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| N-01 | **No day view.** Totals are today-only, and history is one undifferentiated list with ISO dates. Yesterday's intake cannot be reviewed.                                                                                                                                               | `standard-day-*.png`                                    | P1                            |
| N-02 | **Saved foods crowd the screen.** Every saved food is a full-width "Log X" button between the totals and the log, so the log moves further down as the library grows. On SE, no entry is visible on the first screen even with 8 foods.                                               | `standard-foods-nutrition*.png`, `se-day-0.png`         | P1                            |
| N-03 | **Logging a saved food leaves Meal blank.** The sheet copies the food's fields, which have no meal. Saving without typing one stores an entry with no meal, and the row then shows the serving ("1 medium") where the meal belongs.                                                   | `standard-log-saved.png`, `standard-day-1.png` (Banana) | P1                            |
| N-04 | **Keyboard-heavy entry form.** Ten stacked fields: typed date, typed meal, four macros, servings, description, notes. Save sits at the bottom of the scroll.                                                                                                                          | `standard-add*.png`                                     | P1                            |
| N-05 | **The Android keyboard traps the form.** With the number pad open, tapping the sheet does not dismiss it, and Save is behind it. Only the keyboard's own hide key works; Android Back or Escape close the sheet and show the discard prompt.                                          | `dbg2.png` (session notes)                              | P1                            |
| N-06 | **Comma decimals fail with a raw developer error.** The number pad offers ",". "1,5" servings produce a full Zod JSON dump in "Could not save". On iPhones set to comma-decimal regions, the pad shows only "," (iPhone check needed), so fractional values cannot be entered at all. | `standard-comma.png`                                    | **P0 for comma-locale users** |
| N-07 | **An invalid typed date shows a raw regex error.**                                                                                                                                                                                                                                    | `standard-bad-date.png`                                 | P1                            |
| N-08 | **Four buttons per entry** (Edit, Repeat today, Save food, Delete), wrapping onto two rows on every card.                                                                                                                                                                             | `standard-entry-actions.png`                            | P2                            |
| N-09 | **"Repeat today" has no feedback and duplicates on a double tap.** Nothing visible happens, because the copy lands elsewhere in the list.                                                                                                                                             | [DB]: 11 → 13 entries from one double tap               | P1                            |
| N-10 | **"Save food" creates duplicates** and copies the meal and notes into the library item.                                                                                                                                                                                               | [DB]: two "Banana" foods                                | P2                            |
| N-11 | Copy and grammar: "1 servings"; "PROGRESS / NUTRITION" eyebrow even when opened from You; a full-width **Back** button; "Add meal" actually adds one food.                                                                                                                            | Screenshots                                             | P2                            |
| N-12 | No search and no recents: reuse doesn't scale.                                                                                                                                                                                                                                        | `standard-foods-nutrition-1.png`                        | P1                            |
| N-13 | Profile defaults (2000 kcal, etc.) look like chosen targets.                                                                                                                                                                                                                          | [Code]                                                  | P2 (needs a decision)         |
| N-14 | At 130 % text on SE, the totals card and buttons fit, but the form needs scrolling for every field.                                                                                                                                                                                   | `se130-light-*.png`                                     | P2                            |

---

## 3. Current data and persistence architecture

### Storage

There is one SQLite table for all journals:

```sql
journal(id TEXT PRIMARY KEY, kind TEXT, date TEXT, data TEXT /*JSON*/, created_at INTEGER, updated_at INTEGER)
INDEX journal_kind_date ON journal(kind, date)
```

([schema.ts](../../src/data/schema.ts))

### Record shapes (`data` JSON)

| Kind        | Keys written by the current UI                                                          | Required by validation                                                                                   |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `nutrition` | `name`, `meal`, `calories`, `protein`, `carbs`, `fat`, `quantity`, `serving`, `notes`   | `name` (non-empty after trim); `calories`/`protein`/`carbs`/`fat`: finite 0–20000; `quantity`: 0.01–1000 |
| `food`      | `name`, `calories`, `protein`, `carbs`, `fat`, `quantity` (default servings), `serving` | Same as nutrition                                                                                        |

Any key **beyond the required ones may be absent**, and real data already contains these variants:

- `meal` is missing (entries logged from a saved food).
- `meal`/`notes` appear inside foods (from "Save food").
- `meal` has legacy casing or custom text.

The `food` kind has no `meal` semantics. Values are `string | number | boolean` ([validation.ts](../../src/domain/validation.ts) `journalSchema`, `validateJournal`).

### Units and serving convention

- Macros are grams and energy is kcal, entered **per serving**. They are never converted; `profile.units` doesn't apply.
- `quantity` is the number of servings eaten.
- `serving` is a free-text description ("100 g", "1 scoop") with no arithmetic meaning.
- There is no gram-based scaling: "150 g of a 100 g serving" must be entered as 1.5 servings.

### Totals

- `nutritionTotals` in [metrics.ts](../../src/domain/metrics.ts) is `Σ value × quantity` for each macro, using raw floats.
- The display rounds only at the end: the totals card shows `Math.round(total)`, and each row shows `Math.round(calories × quantity)`.
- As a result, the row values can differ from the total by rounding (three rows of 100.4 kcal read 100 + 100 + 100, but the total is 301). This is correct behaviour; the rebuild must keep totals computed from raw values.
- **No check that kcal ≈ 4P + 4C + 9F.** Label values are trusted, which is correct: fibre, alcohol and rounding make strict checks wrong.

### Create, edit and delete

| Operation                                    | Behaviour                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `addJournal(kind, data, date = localDate())` | Validated inside a transaction, then queued for sync.                                                                    |
| `updateJournal(id, data, date?)`             | Replaces `data` **wholesale** and keeps the ID and `createdAt`. It finds the record by scanning **all** journals (O(n)). |
| `deleteJournal(id)`                          | A hard delete plus a sync tombstone. There is no undo.                                                                   |

### Identity and reuse of saved foods

- Saved foods are identified only by their journal `id`. Logging copies their values **by value** into a new nutrition entry.
- Entries are snapshots: editing or deleting a saved food never changes history. This is correct and must be kept.
- There is no de-duplication and no link from an entry back to its food.

### Dates and time zones

- `date` is a local calendar string `YYYY-MM-DD` with no time of day. `createdAt` (ms) orders entries within a day.
- "Today" is `localDate()` evaluated at render time. A screen left open across midnight keeps showing yesterday until it re-renders.
- Travelling across time zones never moves an entry, because it's a plain date.
- Future dates can be typed and saved; they count toward no total until that day.

### Effects on other features

| Feature                                           | Uses nutrition?                                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goals**                                         | The `nutrition` goal metric shows **today's** kcal from `nutritionTotals` ([Journal.tsx](../../src/screens/Journal.tsx) `goalValue`). WP4D owns this; WP4A must keep `nutritionTotals` unchanged. |
| **Backups (WP1)**                                 | Every journal is exported and validated on import.                                                                                                                                                |
| **Cloud sync**                                    | Per-record `journal` upserts and tombstones.                                                                                                                                                      |
| **You**                                           | Targets editor plus a link.                                                                                                                                                                       |
| **Progress**                                      | A link only.                                                                                                                                                                                      |
| Today, Train, programs, progression, achievements | No.                                                                                                                                                                                               |

### Edit-path type coercion

Opening an entry turns every value into a string. Saving converts back only the known numeric keys. Any extra numeric or boolean key (from a future version or sync) would be **re-saved as a string**. Nutrition records hold no such keys today, but the rebuild must round-trip unknown keys with their original types.

---

## 4. Identified risks

| Risk                                                                                                                                                                            | Severity                        | Mitigation in WP4A                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comma decimal input fails across all numeric fields (N-06); on comma-region iPhones fractional servings may be impossible.                                                      | **High**                        | Comma-tolerant parsing in nutrition inputs, plus steppers so common values need no typing (see decision D4 for the shared parser).                                           |
| Duplicate entries from repeat or double tap (N-09).                                                                                                                             | Medium                          | One guarded action, visible confirmation, Undo.                                                                                                                              |
| Duplicate saved foods (N-10).                                                                                                                                                   | Low                             | "Already saved" when the name and per-serving values match.                                                                                                                  |
| Entries without a meal, or with legacy meal text, could be hidden by a strict meal-section design.                                                                              | **High (data visibility)**      | Every entry must appear. Legacy text maps case-insensitively to the canonical meals; anything else shows under its own label. Nothing is rewritten unless the user edits it. |
| Edit-path string coercion of unknown keys.                                                                                                                                      | Low                             | The new editor merges changed fields into the original `data` object.                                                                                                        |
| Rewriting `meal` on legacy entries during display normalisation.                                                                                                                | Medium                          | Normalisation is display-only.                                                                                                                                               |
| Performance: `journal("nutrition")` loads and parses every entry on each render; `updateJournal` scans all journals. Fine at hundreds of entries, noticeable at many thousands. | Low now                         | Filter the day in memory (no contract change); optional additive read helper (decision D6).                                                                                  |
| Midnight rollover shows a stale "Today".                                                                                                                                        | Low                             | Recompute on focus and app foreground.                                                                                                                                       |
| `DateSheet` (WP3) is future-only; nutrition needs past days.                                                                                                                    | Medium (regression risk to WP3) | Add an optional range prop whose default keeps WP3's behaviour; templates tests guard it.                                                                                    |

---

## 5. Proposed screen and component architecture

**Routing:** keep `/journal?kind=nutrition` and `/journal?kind=food`, which You and Progress already link to and older builds deep-link to. [Journal.tsx](../../src/screens/Journal.tsx) delegates those two kinds to the new screens. Measurements, Recovery and Goals stay untouched until WP4B–D.

### Nutrition (day view)

```
‹  Today, Fri Oct 23  ›                       (title row; tap the date → calendar)
┌ 1,438 of 2,600 kcal · 1,162 left ───────────┐
│ ████████████░░░░░░░░                        │
│ Protein 136/180 g  Carbs 150/300 g  Fat 31/75 g │  (three slim bars)
└─────────────────────────────────────────────┘
BREAKFAST · 250 kcal                     + Add
  Oats              40 g · 1 serving      150 ⋯
  Greek yogurt 0%   170 g pot             100 ⋯
LUNCH · 443 kcal                         + Add
  …
DINNER                                   + Add   (an empty meal shows only its header)
SNACKS                                   + Add
POST-WORKOUT (legacy label) · 120 kcal
OTHER (no meal) · 105 kcal
                       [ Saved foods ]          (secondary text link)
```

- Rows are `ListRow`s: name, serving and servings, and kcal at the end. Macros appear in the row's accessibility label and in the edit sheet.
- The overflow menu (`OverflowMenu`) offers Edit, Change servings, Move to meal…, Copy to today (past days only), Save as food, and Delete (with confirmation).
- No orange buttons in the list. "Add food" in the footer is the single primary action.

### Quick-add sheet

- Header: "Add to Lunch · Today", with the meal shown as a `SegmentedControl` (changeable).
- Search field; **Recent** (deduplicated from recent entries) and **Saved foods** sections.
- Each row shows the name and "105 kcal · 1 medium". The trailing **+** logs it instantly at its default servings. Tapping the row opens a detail step:
  - a servings control (− / value / + in 0.25 steps, the value typeable);
  - a live kcal and macro preview;
  - "Add to Lunch".
- "Create food" at the bottom, and an empty state that explains saved foods.
- After a one-tap add, the row shows "Added ✓" and an inline "Undo" for a few seconds. The sheet stays open for the next food.

### Food editor sheet (custom food, entry edit, saved-food edit)

- Fields: name, kcal and P/C/F per serving (number fields accepting "," and "."), serving description, servings stepper, and meal (entries only).
- Save sits in the sheet **footer**, so it stays visible above the keyboard.
- Has an unsaved-changes guard and is double-tap safe.
- "Also save to my foods" toggle when creating an entry.

### Saved foods library

- A search bar and alphabetical `ListRow`s, each with Log and an overflow (Edit, Delete).
- The same editor sheet as above.

### Reusable components (for WP4B–D)

| Component                                                                               | Use in WP4A      | Later use                                                 |
| --------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- |
| `DaySwitcher` (‹ date ›, calendar on tap, can't pass today)                             | Nutrition day    | Recovery check-in day (C), measurement date (B)           |
| `DateSheet` + `range: "future" \| "past"` (default `"future"`)                          | Day picker       | B, C, D                                                   |
| `NumberControl`, generalised from `LoadControl` (label, step, min, max, comma-tolerant) | Servings, macros | Measurement values (B), sleep hours (C), goal targets (D) |
| `Stepper` (unchanged)                                                                   | —                | Recovery 1–5 scales (C)                                   |
| `SegmentedControl` (unchanged)                                                          | Meal             | Recovery scales, goal metric                              |
| `MacroBars` (kcal bar + three bars)                                                     | Totals card      | —                                                         |
| Quick-pick search sheet pattern                                                         | Foods            | Measurement name picker (B), goal exercise picker (D)     |

**Shared-component impact:**

- `DateSheet` has one consumer ([templates.tsx](../../app/templates.tsx)).
- `LoadControl` has one consumer ([TemplateEditor.tsx](../../src/components/TemplateEditor.tsx)).
- Both changes are additive with defaults equal to today's behaviour, guarded by the existing WP3 tests.
- `parseNumber` and `NumberField` are also used by the workout set grid and the exercise cards (WP2). Changing them is decision D4, not assumed.

---

## 6. Recommended interaction flows

Tap counts assume the food is on screen. Typing a search is listed separately, and meal and servings are counted honestly.

| Task                                                           | Today                                                                   | Proposed                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Log a saved or recent food at its default servings into a meal | 2 taps **plus** a scroll; meal left blank (or typed)                    | **2 taps:** that meal's **+ Add**, then the food's **+**. The meal comes from the section; the servings are the food's default. |
| Same, food found by search                                     | Scroll through the button list                                          | 2 taps plus typing                                                                                                              |
| Same, from the footer "Add food"                               | —                                                                       | 2 taps. The meal defaults by time of day (decision D2) and is visible and changeable in the sheet.                              |
| Log 1.5 servings                                               | Log → scroll → type → hide keyboard → scroll → Save (keyboard required) | 4 taps, no keyboard: + Add → tap the food → + (0.25 × 2) → Add to Lunch                                                         |
| Log for yesterday                                              | Type the date                                                           | +1 tap (‹), then the same flow; the sheet header says "Yesterday"                                                               |
| Create a new food                                              | 10 fields                                                               | Name + kcal + 3 macros + serving (typed, because label data can't be avoided) → "Save & add"                                    |
| Copy a past entry to today                                     | "Repeat today" (silent, duplicable)                                     | ⋯ → Copy to today, confirmed by an "Added to Today · Undo" banner                                                               |
| Delete                                                         | Delete → Confirm (2)                                                    | ⋯ → Delete → Confirm (3). The confirmation is kept: data safety beats one tap.                                                  |

**On the Phase 7A "≤ 2 taps" target:** achievable for the most common case (re-logging a recent or saved food at its default servings into a chosen meal) without weakening accuracy. That relies on two things:

1. The meal comes from where the user tapped **+ Add**.
2. Instant logging is protected by a per-row double-tap guard and a visible Undo.

Anything that changes servings or meal is 3–4 taps, which is honest and still keyboard-free.

---

## 7. Proposed implementation file scope

**New**

- `src/screens/Nutrition.tsx`: day view.
- `src/screens/SavedFoods.tsx`: library.
- `src/components/nutrition/QuickAddSheet.tsx`, `FoodEditor.tsx`, `MacroBars.tsx`.
- `src/components/DaySwitcher.tsx`.
- `src/domain/nutrition.ts` (pure):
  - `entriesOn(day)`, `groupByMeal` with canonical, legacy and none groups, and `mealLabel`;
  - `recentFoods` (deduplicated), `foodKey` and `isDuplicateFood`;
  - `defaultMeal(time)`, `servingsText`, and `parseDecimal` (accepts "," and ".");
  - `entryFromFood` and `mergeEntry`, which keep unknown keys and their types.
- `tests/nutrition.test.ts` and `tests/ui/nutrition.test.tsx`.

**Modified (additive)**

- `src/screens/Journal.tsx`: delegate `kind=nutrition` and `kind=food`. Nothing else changes.
- `src/components/DateSheet.tsx`: optional `range` prop (default unchanged).
- `src/components/Stepper.tsx`: `NumberControl` generalised from `LoadControl`. `LoadControl` keeps its API.
- `src/components/ui.tsx`: `parseNumber` accepts a comma decimal separator (**D4, approved**), with the WP2 regression tests listed under the founder decisions.
- `src/screens/You.tsx`: the Nutrition targets row shows "Not set" for unconfirmed defaults, and saving the targets records the device setting (**D7**, pending confirmation of the rule).
- Docs: README, IPHONE_TESTING.md, this audit and the Phase 7A progress section.

**Not touched**

- `repository.ts`, `schema.ts`, `validation.ts`, and `metrics.ts` (`nutritionTotals`).
- Sync, backups, Progress (links unchanged), Goals, Measurements, Recovery.
- Workout logging logic, templates, programs, onboarding, splash.

---

## 8. Required tests

**Logic (`tests/nutrition.test.ts`)**

- Day filtering:
  - only the chosen local date;
  - no shift at time-zone or DST boundaries (noon-based dates).
- Meal grouping:
  - canonical order;
  - `"breakfast"` and `" Breakfast "` group as Breakfast;
  - "Post-workout" keeps its own label;
  - a missing meal goes to "Other";
  - **every entry appears exactly once**.
- Totals: equal to `nutritionTotals` on raw values. The rounding case (3 × 100.4 → 301) and fractional servings (1.5 × 130 = 195).
- `parseDecimal`:
  - "1,5" → 1.5, "1.5" → 1.5;
  - "1.234,5", "1,2,3", "", "abc" and negative values are rejected;
  - validation bounds are respected.
- `recentFoods`: deduplicated by normalised name and values, most recent first, capped.
- `isDuplicateFood`: same name and values match; different values don't.
- `mergeEntry`: unknown numeric and boolean keys keep their types, and unchanged fields stay identical.
- `entryFromFood`: the copy is by value, carries no food `meal`/`notes`, and later food edits don't affect it.

**UI (`tests/ui/nutrition.test.tsx`)**

- Empty day: an explanatory empty state, totals of 0, and meal headers with Add.
- Populated day:
  - per-meal subtotals and the day total match the stored data;
  - legacy, no-meal and custom-meal entries are all visible.
- Day navigation:
  - ‹ shows yesterday's entries and totals;
  - › is disabled on today;
  - the calendar can't pick future days.
- Quick add:
  - **+** logs exactly one entry with the section's meal, the viewed date and the default servings;
  - a double tap logs once;
  - Undo removes exactly that entry.
- Detail step: servings 1 → 1.5 via the stepper writes `quantity: 1.5`; a meal change writes that meal.
- Search filters saved foods and recents.
- Create food: a comma value stores 1.5; an invalid value shows a friendly inline error (no JSON); "Also save to my foods" creates exactly one food.
- Editing an entry changes only the edited fields and keeps the ID, date, `createdAt` and unknown keys.
- Delete asks first; Cancel keeps the entry.
- Copy to today: one entry with a banner; no duplicate on a double tap.
- Save as food: "Already saved" for a duplicate.
- Saved-food library: search, edit, delete, and editing a food doesn't change logged entries.
- Unsaved-changes guard on the editor.
- **Regression:**
  - the Goals nutrition metric still equals today's kcal;
  - backup export and import round-trip nutrition and food records byte-identically;
  - You and Progress links still open the log;
  - the templates `DateSheet` remains future-only;
  - `LoadControl` behaviour is unchanged (existing WP3 tests).
- **Nested-modal structure test** (the WP3 iOS lesson): every sheet opened from another sheet renders inside it.

---

## 9. Emulator findings and screenshots

Android emulator, Expo Go 58.

| Area                   | Coverage                                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixtures (`seed12.ts`) | Empty; populated day (7 entries across Breakfast, Lunch, Dinner, a "Post-workout" custom meal and one entry without a meal); yesterday (with a lowercase "breakfast") and 3 days ago; 8 saved foods; 26 saved foods; light theme with pounds. |
| Sizes and text         | Compact (SE), standard, large; dark and light; 130 % text.                                                                                                                                                                                    |

**Screenshots** (`forge-visual-harness\shots\android\p12\`)

| Screenshot     | What it shows                                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `S-states.png` | Empty, then a populated day scrolled top to bottom: the flat list, ISO dates, four buttons per card, the no-meal row showing "1 medium".       |
| `S-flows.png`  | New entry; keyboard on Calories; bottom of the form; the missing-value alert; logging a saved food (Meal blank).                               |
| `S-foods.png`  | 26 saved foods as "Log" buttons; the saved-foods library.                                                                                      |
| `S-edit.png`   | Edit sheet; delete confirmation; **comma-decimal Zod error**; **invalid-date regex error**; entry actions; the list after a double-tap repeat. |
| `S-sizes.png`  | SE, large, SE + light + 130 %.                                                                                                                 |

**Interaction results**

| Interaction                        | Result                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Add meal                           | Works; 10 fields. Save is reachable only after scrolling.                                                                                         |
| Log saved food                     | Prefills everything except Meal.                                                                                                                  |
| Edit entry                         | Works; values are prefilled.                                                                                                                      |
| Delete                             | Asks, then deletes.                                                                                                                               |
| Change date                        | Typed only; an invalid value gives a raw error.                                                                                                   |
| Adjust servings                    | Typed only; a comma gives a raw error.                                                                                                            |
| Keyboard (Android)                 | The number pad cannot be dismissed by tapping the sheet, and Save is hidden behind it. Back or Escape closes the sheet (with the discard prompt). |
| Repeat today (double tap)          | **Two duplicates** created [DB].                                                                                                                  |
| Save food on an already-saved food | **Duplicate** food created [DB].                                                                                                                  |

**Not supported (documented, not invented):** day navigation, food search, per-meal grouping, per-day totals for past days, servings controls, and undo.

**iPhone checks outstanding (current build):**

- The decimal pad in a comma-decimal region (N-06).
- The keyboard and Save reachability in the iOS sheet (it has keyboard padding on iOS, unlike Android).

---

## 10. Decisions requiring founder approval

_Outcomes are recorded under "Founder decisions" below._

| #   | Decision                                                                                                                                                                               | Recommendation                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Canonical meals.** Breakfast, Lunch, Dinner, Snacks. Legacy and custom labels such as "Post-workout" are shown, not removed. Should users still be able to create custom meal names? | Four fixed meals for new entries; legacy labels displayed and kept, never rewritten automatically.                                                                                  |
| D2  | **Default meal for the footer "Add food".**                                                                                                                                            | Time of day (before 10:30 Breakfast, until 15:00 Lunch, until 21:00 Dinner, otherwise Snacks), always visible and changeable. Per-meal "+ Add" uses its own meal.                   |
| D3  | **One-tap add with Undo** (rather than always confirming servings).                                                                                                                    | Approve; it is what makes 2-tap logging achievable.                                                                                                                                 |
| D4  | **Comma decimals.** Fix only in Nutrition, or in the shared `parseNumber`, which also fixes workout set entry (WP2) for comma-region users?                                            | Fix in the shared parser in WP4A with its own regression tests: European iPhone users likely cannot enter "22,5 kg" today either. Needs your OK because it touches WP2 input paths. |
| D5  | **Past and future days.**                                                                                                                                                              | Navigate and log any past day; no future days (consistent with "today" totals). Existing future-dated entries stay visible on their day.                                            |
| D6  | **Additive repository read** (`journalOn(kind, date)`, using the existing `kind,date` index), or keep filtering in memory.                                                             | Keep in-memory filtering for WP4A (no contract change); revisit if large histories are slow.                                                                                        |
| D7  | **Default targets** (2000 / 150 / 200 / 65) shown as targets.                                                                                                                          | Keep the values. Show "Targets: set in You" alongside the totals until the user saves targets once (that needs a flag; otherwise leave as is).                                      |
| D8  | **Delete with Undo instead of a confirmation dialog.**                                                                                                                                 | Keep the confirmation for WP4A (consistent with WP1–WP3).                                                                                                                           |
| D9  | **Gram-based servings** ("150 g of a 100 g food").                                                                                                                                     | Defer. It needs a structured serving size (a data-shape addition).                                                                                                                  |
| D10 | **Copy a whole meal** to today (for example, yesterday's breakfast).                                                                                                                   | Nice to have; include only if D3 is approved (it uses the same Undo pattern).                                                                                                       |

### Founder decisions (2026-10-23)

| #   | Outcome                                                      | Effect on WP4A scope                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Approved.** Four default meals; legacy labels preserved.   | New entries use Breakfast, Lunch, Dinner or Snacks. Legacy and custom labels display under their own heading and are never rewritten unless the user changes that entry's meal.                                                                                                                                                                                                                                                                                             |
| D2  | **Approved.** Time of day, always changeable.                | As recommended.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D3  | **Approved** with Undo.                                      | One-tap add, a per-row double-tap guard and Undo.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D4  | **Approved** with strict WP2 regression tests.               | The shared `parseNumber` in [ui.tsx](../../src/components/ui.tsx) accepts "," or "." as the decimal separator. Required regression tests: set-grid weight "22,5" → 22.5 and "22.5" unchanged; integer fields (reps) still reject "8,5"; nullable fields (RPE, RIR) still accept empty; WP2 copy-forward with a comma-typed load; exercise-card rest and target fields; template `LoadControl`; ambiguous input ("1.234,5", "1,2,3") rejected; min and max bounds unchanged. |
| D5  | **Approved.** Today and past days only.                      | The day switcher and calendar stop at today. Existing future-dated entries remain visible on their day.                                                                                                                                                                                                                                                                                                                                                                     |
| D6  | **Deferred.** No repository or schema changes.               | In-memory day filtering.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D7  | **Modified.** Never imply default targets were personalised. | Proposed rule (pending confirmation; no schema change): see the note below this table.                                                                                                                                                                                                                                                                                                                                                                                      |
| D8  | **Approved.** Keep the delete confirmation.                  | As recommended.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D9  | **Deferred** to a separate enhancement.                      | Out of scope.                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D10 | **Deferred** until core logging is polished.                 | Copying a whole meal is out of scope. The per-entry **Copy to today** stays, because it replaces the existing "Repeat today" (now guarded, with feedback and Undo).                                                                                                                                                                                                                                                                                                         |

**D7 rule (proposed, no schema change).** Onboarding's last step pre-fills 2000 kcal / 150 g / 200 g / 65 g, so a profile alone cannot show whether targets were chosen. Targets count as **personalised** if either:

- any of the four values differs from those defaults; or
- the user has saved targets from You → Nutrition targets (recorded as a device setting).

Otherwise they are **not set**, and:

- Nutrition shows intake totals without "of 2,000" and without bars;
- a quiet "Set your daily targets" row opens the targets editor;
- You's Nutrition targets row reads "Not set" instead of "2,000 kcal · 150 g protein".

The onboarding form itself is unchanged.

Limitation: device settings are not part of backups. A user who deliberately chose exactly the defaults sees "Not set" again after a restore, and one save confirms them.

---

## Implementation (WP4A, in review)

Starting commit `4cf4348`. There are no schema, repository, validation, sync, backup or dependency changes, and `nutritionTotals` is unchanged. `/journal?kind=nutrition` and `kind=food` now open the new screens; Measurements, Recovery and Goals still use the legacy journal.

| Area                                                                                                                                                 | What changed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Day view** ([Nutrition.tsx](../../src/screens/Nutrition.tsx))                                                                                      | ‹ Today › ([DaySwitcher.tsx](../../src/components/DaySwitcher.tsx)) with a past-only calendar. A totals card ([MacroSummary.tsx](../../src/components/nutrition/MacroSummary.tsx)). Breakfast, Lunch, Dinner and Snacks sections with subtotals and **Add**; legacy meals under their own name; "Other" for entries without a meal; "Dated after today" for future-dated entries. Rows are `ListRow`s with kcal and a ••• menu (Edit, Copy to today, Save as food, Delete). The footer **Add food** is the single primary action. "Today" follows the date when FORGE returns to the foreground. |
| **Quick add** ([QuickAddSheet.tsx](../../src/components/nutrition/QuickAddSheet.tsx))                                                                | Recent (deduplicated, the servings last eaten) and Saved foods, with search. **+** logs in one tap, with a per-row double-tap guard and **Undo**. Tapping a food opens servings (± 0.25 or typed), a live kcal and macro total, and the meal. **Create food** logs from a label and can save it to your foods (duplicates are skipped). All steps live in one sheet, so iOS never stacks sheets. The list order is fixed while the sheet is open.                                                                                                                                                |
| **Editing** ([FoodEditorSheet.tsx](../../src/components/nutrition/FoodEditorSheet.tsx), [FoodForm.tsx](../../src/components/nutrition/FoodForm.tsx)) | Only edited fields are written; unknown keys and legacy meal text are kept exactly. Meal, day (nested past-only calendar) and notes can be changed. Friendly inline errors replace the raw developer errors. Save sits in the footer, above the keyboard. The editor has an unsaved-changes guard and a double-tap guard.                                                                                                                                                                                                                                                                        |
| **Saved foods** ([SavedFoods.tsx](../../src/screens/SavedFoods.tsx))                                                                                 | Search, natural A–Z order, per-serving values, edit, and delete with confirmation. "Already saved" for duplicates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **D4: comma decimals** ([numbers.ts](../../src/domain/numbers.ts), `parseNumber`)                                                                    | A single "," with no "." is read as the decimal point. "1.234,5" and "1,2,3" stay invalid. Every rule is unchanged otherwise (integers, nullable fields, bounds).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **D7: targets** ([nutrition.ts](../../src/domain/nutrition.ts) `targetsPersonalized`, [You.tsx](../../src/screens/You.tsx))                          | Personalised when any value differs from 2000/150/200/65, or after a successful save in You → Nutrition targets (device setting `nutritionTargetsSaved`, written only after the save succeeds). Until then: intake only, no bars, no "of 2,000", "Set your daily targets", and You shows "Not set". Stored targets are unchanged.                                                                                                                                                                                                                                                                |
| **Shared components**                                                                                                                                | `DateSheet` gains `range` (default `"future"`; templates are unchanged). `NumberControl` is generalised from `LoadControl` (same labels; + now stops at the 2,000 maximum the field already enforced). `IconButton` gains an optional `disabled`. `dayTitle` added to calendar-dates.                                                                                                                                                                                                                                                                                                            |

**Tests:**

| Suite                                                                                     | Count | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logic, [nutrition.test.ts](../../tests/nutrition.test.ts)                                 | 13    | Day filter, day titles, meal grouping (every entry once, legacy kept), default meal by time, totals equal `nutritionTotals` (including rounding), portions, recents and search, entry/food copies, duplicates, merge keeps unknown keys and types, comma parsing, targets rule, backup round trip of legacy shapes                                                                                                                                                                                                                                                     |
| UI, [nutrition.test.tsx](../../tests/ui/nutrition.test.tsx)                               | 18    | Empty day and targets display; personalised and explicit-save targets; meal grouping and totals; day navigation and calendar; one-tap add, double tap, Undo; detail servings and meal; past-day logging; search and create; kind validation, comma values, saving to my foods once; edit keeps untouched fields, moves meal and day; discard guard; delete confirm; copy and save-as-food with Undo and duplicate refusal; saved-foods library; Goals nutrition metric unchanged; You "Not set" and flag only after a successful save; DateSheet ranges; nested modals |
| UI, [decimal-input.test.tsx](../../tests/ui/decimal-input.test.tsx) (D4 / WP2 regression) | 7     | Parser rules; set weight "22,5" with copy-forward; pounds; reps refuse "8,5"; inline RIR nullable and bounded; Set Details RPE, RIR and rest; template load                                                                                                                                                                                                                                                                                                                                                                                                            |

**Emulator** (Android, Expo Go 58; screenshots in `forge-visual-harness\shots\android\p13\`):

- Sizes and themes: compact, standard and large; dark, and light with pounds at 130 % text.
- States: empty with default targets; populated with personalised and with default targets; legacy and no-meal entries; future-dated entry; yesterday; calendar; quick add (+, Added · Undo, detail, search, create with the keyboard); edit with the day picker; menu; delete confirmation; saved foods (26) and search; You "Not set".
- Device database check: a rapid double tap stored one entry; Undo removed the entry; an edit changed only `quantity`, keeping field order and `createdAt`; saved foods were untouched.

**Fixed during emulator review:**

- The Recent list re-sorted after an add, under the finger.
- The search message overlapped the field with the keyboard open.
- "0" placeholders looked like values.
- "eaten + left" could differ from the target by 1.
- Macro values truncated at 130 % text on SE.
- Units wrapped away from their values in Saved foods.
- "box 1, 10, 11" sorting.
- A same-frame double tap on Create could log twice (caught by a test).

**Known limitations:**

- The shared meal control shortens "Breakfast" to "Breakf…" at 130 % text on SE; the spoken label is complete.
- Profile and onboarding number fields (`ProfileForm`) still parse with "." only. They are outside WP4A and protected (onboarding).
- `expo-doctor` reports newer SDK 58 patch releases (expo 58.0.19 and others) published after WP3. They are unrelated to WP4A, and dependencies were not changed.

**iPhone checks outstanding:**

- The keyboard with each sheet's footer (Add, Save) on notched and Dynamic Island phones.
- The comma-decimal keypad in a comma region.
- The editor's day picker presented over the editor.
- VoiceOver on rows, + and Undo, and the day switcher.
- "Today" rolling over after midnight when FORGE returns from the background.

---

_End of WP4A audit. WP4A is implemented and awaiting the founder's iPhone review; WP4B–WP4D have not started._
