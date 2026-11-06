# FORGE — Phase 7B WP4D: Goals Audit and Plan

**Status: approved (2026-10-24). All decisions approved: D1–D23, with the revised D3 and refinements to D6 and D7. Implemented and verified on the Android emulator; awaiting founder iPhone review. Not committed.**

Audit date: 2026-10-24 (Pacific).

Evidence labels:
- **[Code]** read at the baseline.
- **[Device]** reproduced on the Android emulator (Expo Go 58).
- **[Calc]** run against the app's own repository, validation and analytics code in Node.
- **Proposed** describes a design, not existing behaviour.

---

## 1. Verified baseline

| Check | Result |
| --- | --- |
| Branch | `feat/forge-paths-foundation` |
| HEAD | `e1413de8b37ec975da29f0aef2e7e7957d70ec6b`: "WP4C: Recovery rebuild with check-ins, trends and history" |
| Remote | `origin/feat/forge-paths-foundation` at the same commit after `git fetch`. WP4C is pushed. |
| Working tree before the audit | Clean |
| Unexpected changes | None |

Documentation read:
- [Phase 7A audit](PHASE_7A_PRODUCT_AUDIT.md): C-02 (bodyweight goal, fixed in WP1), C-05 (goal form), C-09, C-15 and C-19 (clipped metric chips).
- [WP4B Measurements](PHASE_7B_WP4B_MEASUREMENTS_AUDIT.md): M-15, *bodyweight goals show kg for pound users*, which WP4B deferred to WP4D.
- [WP4C Recovery](PHASE_7B_WP4C_RECOVERY_AUDIT.md).

Goals-related code and tests:

| Kind | File | Role |
| --- | --- | --- |
| Screen | [Journal.tsx](../../src/screens/Journal.tsx) `LegacyJournal` (`/journal?kind=goal`) | The only Goals UI: list, form sheet, progress text and bar |
| Domain | [analytics.ts](../../src/domain/analytics.ts) `goalProgress`, `latestBodyweight`, `bodyweightGoal` | Progress ratios and current bodyweight |
| Domain | [metrics.ts](../../src/domain/metrics.ts) `summary`, `records`, `nutritionTotals` | Sources for the workouts, volume, duration, strength and nutrition metrics |
| Contract | [validation.ts](../../src/domain/validation.ts) `validateJournal` (goal branch), `journalSchema` | Storage rules; applied on save, backup import and sync pull |
| Entry points | [You.tsx](../../src/screens/You.tsx) Health & body → Goals · [Progress.tsx](../../src/screens/Progress.tsx) More → Goals | Both open `/journal?kind=goal` |
| Tests | [analytics.test.ts](../../tests/analytics.test.ts) `goalProgress` · [data-safety.test.ts](../../tests/data-safety.test.ts) `latestBodyweight`/`bodyweightGoal` · [data-safety.test.tsx](../../tests/ui/data-safety.test.tsx) two bodyweight-goal UI tests · [nutrition.test.tsx](../../tests/ui/nutrition.test.tsx) one nutrition-goal UI test · [you.test.tsx](../../tests/ui/you.test.tsx) route | |

> **Naming warning.** The profile's **training goal** (`profile.goal`, e.g. "Muscle", shown in You as "Training focus · Goal not set") is unrelated to goal records. It drives program recommendations. New code should say "goal record" or use a `goals` module, and leave `profile.goal` alone.

---

## 2. Existing Goals contract

Goals are journal rows with `kind = "goal"` in the shared `journal` table.
- **Columns:** `id`, `date` (`YYYY-MM-DD`), `data` (JSON), `created_at`, `updated_at`.
- **No** goal table, status column, migration or schema version exists.

### 2.1 Fields

| Key | Form label | Storage rule (`validateJournal`) | Notes |
| --- | --- | --- | --- |
| `name` | "Goal name" | non-empty after trim | Free text; no length limit beyond the generic 5,000 characters |
| `metric` | Chips: `workouts` `volume` `bodyweight` `strength` `duration` `nutrition` | must be one of those six | Shown as raw lower-case IDs; clipped on standard and SE phones (C-19) |
| `target` | "Target" | number, 0.01–100,000 | **No unit stored.** The meaning depends on the metric (section 3). |
| `start` | "Starting value (kg for bodyweight goals)" | **bodyweight only:** number 0.01–700 and ≠ target. Other metrics: not checked (any number, including negatives). | The new-goal form **prefills it with the latest bodyweight (kg) for every metric**, so most non-bodyweight goals store a meaningless `start` such as 82 or 84.2. |
| `exerciseId` | "Exercise ID (strength goals, optional)" | not checked | Typed internal ID (e.g. `barbell-bench-press`). A typo (`squat` instead of `back-squat`) silently reads as no history. |
| `notes` | "Notes" | generic string | |
| row `date` | "Date (YYYY-MM-DD)", typed | ISO date; **future dates accepted** | Defaults to today. It has no stated meaning; in practice it is "set on". There is **no target date**. |
| any other key | — | Accepted | Older and newer app versions keep unknown keys, which makes optional additions migration-free (section 14). |

### 2.2 Accepted and rejected values

Each value was run through the app's own `validateJournal` and `Repository`. **[Calc]**

| Accepted | Rejected |
| --- | --- |
| Workouts goal with no `start` | Empty name |
| Target 0.5 | Target 0 or −5 |
| Bodyweight target 180 with start 82, which is what a **pound user typing pounds** produces | Target 100,001 |
| Strength `exerciseId: "bench"` (no such exercise) | Target `"80"` (string), or `NaN` from a comma decimal |
| Extra keys (`deadline`, `status`) | `metric: "custom"`, or a missing metric |
| `start: -4` on a workouts goal | Bodyweight with no start, start 0, start = target, or start 800 |
| A goal dated 2031-05-05 | |

### 2.3 What exists in the data versus the UI

| Capability | Data model | UI |
| --- | --- | --- |
| Create, edit and delete | ✓ | ✓ (generic form; delete confirmed, no Undo) |
| Status (active, completed, paused, archived) | ✗ | ✗ |
| Completion record | ✗ | ✗. A full bar is the only signal, and it disappears if the value later moves away. |
| Target date or overdue | ✗ | ✗ |
| Units for a target | ✗ (implicitly kg for bodyweight and strength) | Hard-coded "kg" |
| Goal history | Only as long as the row exists | Every goal is in one list, sorted by row date |
| Goal detail | ✗ | ✗ (card only) |

---

## 3. How each goal type gets its progress

All values are recomputed from the source data on every render. Nothing is written back to the goal. **[Code]**

| Metric | Source records and rule | Current value shown | Ratio | Units | Missing data | Edits and deletes of the source |
| --- | --- | --- | --- | --- | --- | --- |
| `bodyweight` | `measurement` rows whose name matches `/^body\s*weight$/i`; the **first** in journal order (date ↓, created ↓) with a value > 0 | "82.0 kg now · target 80 kg" | `(current − start)/(target − start)`, clamped 0–1. It works for losing **and** gaining weight. | **Always kg.** No conversion. | "No bodyweight logged yet", 0 % (C-02 fix) | Live. Deleting or editing weigh-ins changes progress immediately. |
| `strength` | Completed, non-warm-up sets of `exerciseId` across **all** completed workouts; `records().load` = heaviest set weight | "90.0 / 100 strength" | `current / target` | kg, unlabelled | 0, shown as "0.0 / 160 strength" with no explanation | Live |
| `workouts` | `summary().weekly`: completed workouts finished since **Monday 00:00 this week** | "2.0 / 4 workouts" | `current / target`; resets to 0 every Monday | count | 0 | Live |
| `volume` | `summary().totalVolume`: **lifetime** Σ weight × reps of completed non-warm-up sets | "25590.0 / 100000 volume" | `current / target` | kg, unlabelled | 0 | Live. A goal set two days ago already shows the volume of every earlier workout. |
| `duration` | `summary().averageMinutes`: the **average** length of all completed workouts | "55.0 / 60 duration" | `current / target`. **The direction is assumed upward**: "Keep sessions to an hour" at 55 min shows 92 %, as if unfinished. | minutes | 0 | Live |
| `nutrition` | **Today's** calorie total (`nutritionTotals`) | "1800.0 / 2500 nutrition" | `current / target`; resets daily. Eating over target shows 100 %. | kcal | 0 | Live |

Further notes:
- **Same-day ties:** only bodyweight is affected. It uses SQL order (date, then `created_at`), not WP4B's full `newestFirst` comparator (which adds `updatedAt` and `id`). These agree except when two weigh-ins share a creation millisecond.
- **Baseline:** only bodyweight goals use `start`. For every other metric, progress is measured from zero and includes history from before the goal existed.
- **Time:** progress is never awarded for elapsed time. That is good, but nothing ties progress to the goal's own dates either.
- **Recovery:** check-ins are not a goal source.
- **Measurements other than bodyweight** (waist, body fat) are not goal sources.

---

## 4. Bodyweight-unit defect (M-15): cause and fix

**Cause [Code]:** the legacy form has no unit handling for goals.
- **Entry:** the field is labelled "Starting value (kg for bodyweight goals)" and prefilled with the latest weigh-in **in kg**. "Target" has no unit. A pound user naturally types pounds, and the number is stored as if it were kg.
- **Display:** `goalStatus` prints `current.toFixed(1)` and `target` followed by the literal "kg", ignoring `profile.units`.
- **Storage:** canonical bodyweight is kg (measurements store kg; validation forces kg for bodyweight). Goal `target` and `start` carry **no unit key**. Their only defensible meaning is kg, because the form told the user kg.

**Evidence [Device]** (`standard-lb-0`): a pound user's "Get to 175 lb" goal is stored as target 175 (kg). It shows "82.0 kg now · target 175 kg" with a 0 % bar.

**Does switching units corrupt anything?** No stored value changes when units change. The only risk is the one shown above: **entry** in the wrong unit. Display-only conversion is therefore safe for all records.

**Proposed fix (D4)**, migration-free:
1. **Store kg.** Bodyweight `target` and `start` stay canonical kilograms, the same as measurements.
2. **Enter and display in the lifter's units.** Pound users type and see pounds, converted on save with WP4B's `readValue` and displayed with WP4B's `valueText`, including the comma decimal and rounding rules.
3. **Strength goals** use the same rule. Set weights are already kg (`loadText(kg, units)`).
4. **Existing records are never rewritten.** A legacy target that is implausible against your recorded weight (175 "kg" when you weigh 82 kg) is shown as recorded, converted ("Target 385.8 lb"). It carries a neutral note, *"This target is far from your recorded weight. Edit it if it was entered in pounds."*, and an **Edit** action. Nothing is changed automatically.

---

## 5. Progress and completion accuracy risks

| Situation | Current behaviour | Risk |
| --- | --- | --- |
| Missing starting value (bodyweight) | Impossible to save. A new goal with no weigh-in prefills start 0, which fails with **raw schema JSON** ("Too small: expected number to be >=0.01"). | Can't set a bodyweight goal before the first weigh-in; hostile error |
| Wrong baseline | Non-bodyweight goals ignore `start` and count everything before the goal | "Lift 100 tonnes" set 2 days ago shows 26 % at once (`standard-several-0`) |
| Target direction | Bodyweight handles both directions. Duration and nutrition assume "more is progress". | "Keep sessions to an hour" can never read as met while sessions are short |
| Target already met when set | Bodyweight: start = target is rejected; passing the target shows 100 % | Fine. Strength: an already-lifted target shows 100 % immediately, with no explanation. |
| Zero or negative target | Rejected by storage (raw JSON) | Friendly copy needed |
| Moving away after reaching | "Cut to 80 kg": reached 79.6 kg, now 81.2 kg, shows **70 %** with no record of having reached it (`standard-edge`) | The achievement is lost |
| Moving the wrong way | Bodyweight at 0 % with "81.2 kg now" (`standard-edge`, "Gain to 86 kg") | Correct, but with no context such as "0.8 kg below your start" |
| Several weigh-ins on one day | Newest created wins | Consistent with WP4B except for ties within the same millisecond |
| Stale source | The latest weigh-in is used whatever its age; no date is shown | "82 kg now" may be months old |
| Deleted source records | Progress drops silently | No history of what the goal showed |
| Back-dated records | Count fully | Expected for bodyweight; for volume and strength they inflate "progress" |
| Rounding | Bodyweight shown to 0.1 kg; other values `toFixed(1)` ("2.0 / 4 workouts", "1800.0") | Noisy |
| Missing source (unknown exercise ID) | "0.0 / 160 strength" | Looks like zero effort |
| Goal dates before history | Not applicable (no target date) | — |
| Weekly frequency | Calendar week, Monday-start, current week only | Monday always shows 0 %; earlier weeks are invisible |

**Recorded versus estimated:** all current values are recorded (derived from logs). Nothing is projected. The plan keeps it that way, with no completion estimates (D14).

---

## 6. Usability findings and emulator evidence

Setup:
- **Seeds:** `forge-visual-harness\seed19.ts`. They cover:
  - empty;
  - one bodyweight goal;
  - "several": 8 goals across all six metrics, with 7 workouts, weigh-ins and today's meals, a mistyped exercise ID, and a long name and note;
  - the same in pounds and light theme, plus a pounds-typed target;
  - an edge case: reached then regressed, and a gain goal;
  - no weigh-ins.
- **Captures:** `p19.ps1`.
- **Screenshots:** `C:\Users\LStAm\forge-visual-harness\shots\android\p19\`, 41 frames plus contact sheets `_sheet-a…d.png`.

| ID | Sev | Finding | Evidence |
| --- | --- | --- | --- |
| G-01 | **P1** | **Pound users see and enter kg.** A pounds-typed target is stored as kg ("82.0 kg now · target 175 kg", 0 %). This is M-15. | `standard-lb-0`, `standard-addbw-lb` |
| G-02 | **P1** | **Raw schema JSON** for a comma decimal ("2,5" gives `invalid_union … NaN`) and for a bodyweight goal with no weigh-in (`too_small`) | `standard-comma`, `standard-noweight-add` |
| G-03 | **P1** | **Misleading bars:** lifetime volume counted before the goal existed; duration direction inverted; nutrition "100 %" for over-eating; strength at 0 % for a mistyped exercise | `standard-several-0..2` |
| G-04 | **P1** | **An untouched edit rewrites the record** and queues a sync (`updatedAt` bumped, outbox +1). Values are stringified and re-parsed on every edit. | [Calc] |
| G-05 | P2 | **Reaching a goal leaves no record.** If the value moves back, progress drops and the achievement disappears. There is no complete or archive. | `standard-edge` |
| G-06 | P2 | **Fields don't fit the goal type.** Every type shows Target, "Starting value (kg for bodyweight goals)" prefilled with bodyweight, and "Exercise ID". Junk `start` values get stored on non-bodyweight goals. | `standard-add-0/1`, [Calc] |
| G-07 | P2 | **Typing exercise IDs** instead of picking an exercise, with no feedback when the ID doesn't exist (C-05) | `standard-several-1` ("Squat double bodyweight" 0.0 / 160) |
| G-08 | P2 | **Raw metric names** ("workouts", "strength") that are clipped on standard and SE phones (C-19); values like "1800.0 / 2500 nutrition" and "2.0 / 4 workouts" | `standard-add-0`, `se-add-0` |
| G-09 | P2 | **The same 3-line methodology paragraph repeats on every card** (C-15). 8 goals take about 7 screens. | `standard-several-0..5` |
| G-10 | P2 | **No units next to values** (volume kg, strength kg, duration min) and **no "as of" date** for bodyweight | all goal frames |
| G-11 | P2 | **No target date**, so goals can't be time-boxed; the row date is typed as `YYYY-MM-DD` with no explanation | `standard-add-0` |
| G-12 | P3 | Slogan title "Give your effort direction.", a "PROGRESS / GOAL" eyebrow even from You, and a full-width Back (C-09) | all |
| G-13 | P3 | Delete is confirmed with generic copy ("Delete entry? This removes this recorded entry.") and has no Undo | `standard-delete` |
| G-14 | P3 | Today and Progress show no goal. The only entry points are You → Goals and Progress → More → Goals. | `standard-today`, `standard-progress`, `standard-you` |
| G-15 | P3 | You shows "Training focus · Goal not set" (the profile training goal) a few rows above "Goals", a naming collision | `standard-you` |
| G-16 | P3 | The keyboard covers Save on the form; Save is reached by scrolling | `standard-keyboard` |
| — | ok | At 130% text on SE, text wraps rather than clips (but cards become very tall); light theme and large phones are legible | `se-text130-*`, `standard-lb-*`, `large-*` |

**Compared with WP4A, WP4B and WP4C:** those screens have:
- type-first sheets with only relevant fields, values in the lifter's units with comma decimals and friendly validation;
- a day picker instead of typed dates, change-only edits, Undo, and plain titles with a back chevron.

Goals has none of these.

---

## 7. Proposed Premium Goals experience (Proposed)

### 7.1 Overview (same route)

- **Header:** "Goals", a back chevron, and an ⓘ that explains how each type is measured. This replaces the repeated paragraph.
- **Active goals:** one compact card each.
  - **Name**, plus the type in words ("Bodyweight", "Lift · Bench press", "Workouts per week").
  - **Current value, with its unit and basis date:**
    - "82.0 kg · Thu, Oct 22"
    - "Best 90 kg · Fri, Oct 23"
    - "2 of 4 this week"
  - **Target**, and the **target date** when set (D8).
  - **Progress:**
    - a bar **only when a defensible baseline exists** (bodyweight with a start; lift with a start; weekly count against its target);
    - otherwise plain values, with no bar.
  - **State in words:** "1.8 kg to go" · "Target reached on Oct 12" · "Target date passed" · "No weigh-in yet. Log one in Measurements."
- **Reached goals awaiting confirmation** show a **Mark as achieved** action (D7).
- **Achieved and archived goals:** a collapsed "Past goals (n)" section.
- **Empty state:** "Set a goal you can measure" with **New goal**.

### 7.2 Creation (type first, then only relevant fields)

1. **Choose a type**, from a list of large rows with one-line explanations. **All six existing types remain creatable** (revised D3, section 16A).
   - **Bodyweight**: "Reach a weight, up or down"
   - **Lift**: "Lift a weight in an exercise"
   - **Workouts per week**: "Train a number of times each week"
   - **Training volume**: "Lift a total amount from a chosen day"
   - **Session length**: "Keep workouts at least or at most a length"
   - **Daily calories**: "Eat at least, or at most, an amount each day"
2. **Fill in only that type's fields:**
   - **Bodyweight:**
     - Target, in the lifter's units.
     - Starting weight, which defaults to the **latest weigh-in, shown with its date and editable**. With no weigh-in, the field starts empty and a hint suggests logging one.
     - Direction is inferred and stated: "Lose 4.2 kg" / "Gain 4 kg".
   - **Lift:** an exercise from the existing `ExercisePicker` and a target weight in the lifter's units. It shows "Your best so far: 90 kg (Oct 23)".
   - **Workouts per week:** a 1–7 stepper, with "Your plan: 4 a week" as a hint when a frequency is set.
3. **Optional for every type:** a name (defaults to a generated one such as "Reach 80 kg", editable), a target date (past dates blocked), and a note.
4. **Save** is pinned above the keyboard.

### 7.3 Goal detail

Tap a card to open the detail view, which shows:
- start → current → target, with dates;
- the **source history** it is based on: weigh-ins since the goal was set, the lift's best sets, or the last 8 weeks' counts. This reuses the WP4B chart with real-date spacing;
- "Set on {date}" and the target date;
- notes;
- actions: Edit · Mark as achieved / Reopen · Archive · Delete.

### 7.4 Milestones (D13)

- **Not recommended for WP4D.** The existing Progress → Milestones achievements stay as they are.
- **Optional later:** intermediate thresholds on bodyweight goals (each 25 %), shown only as recorded crossings, never as predictions.

### 7.5 History

- Achieved goals keep their **snapshot**: the achieved value, the date and the source basis.
- If source data is later edited, the detail notes "Recorded values have changed since". The snapshot itself is never altered.
- Archived goals keep everything and can be restored.

---

## 8. Text wireframes (Proposed)

```text
OVERVIEW                                 NEW GOAL · step 1           NEW GOAL · Bodyweight
┌──────────────────────────────┐         ┌───────────────────────┐   ┌───────────────────────────┐
│ ‹  Goals                  ⓘ  │         │ New goal            ✕ │   │ ‹ Bodyweight goal       ✕ │
│ ┌──────────────────────────┐ │         │ What will you work    │   │ Target          [ 176.5 ] lb│
│ │ Reach 80 kg              │ │         │ toward?               │   │ Starting weight [ 185.6 ] lb│
│ │ Bodyweight · lose        │ │         │ ▸ Bodyweight          │   │  Latest weigh-in · Oct 22 │
│ │ 82.0 kg · Thu, Oct 22    │ │         │   Reach a weight      │   │ → Lose 9.1 lb             │
│ │ ████████░░░░  52%        │ │         │ ▸ Lift                │   │ Target date (optional) ▸  │
│ │ 2.0 kg to go · by Dec 31 │ │         │   A weight in an      │   │ Name  Reach 176.5 lb      │
│ └──────────────────────────┘ │         │   exercise            │   │ + Add note                │
│ ┌──────────────────────────┐ │         │ ▸ Workouts per week   │   ├───────────────────────────┤
│ │ Bench press 100 kg       │ │         │   Train regularly     │   │ [       Save goal       ] │
│ │ Lift · best 90 kg Oct 23 │ │         └───────────────────────┘   └───────────────────────────┘
│ │ ████████████░  from 80   │ │
│ └──────────────────────────┘ │         DETAIL                       EMPTY
│ ┌──────────────────────────┐ │         ┌───────────────────────┐   ┌───────────────────────────┐
│ │ Train 4× a week          │ │         │ ‹ Reach 80 kg     ••• │   │ ‹  Goals               ⓘ  │
│ │ 2 of 4 this week         │ │         │ 84.2 → 82.0 → 80 kg   │   │ Set a goal you can        │
│ │ ● ● ● ○  last 4 weeks*   │ │         │ Set Aug 25 · by Dec 31│   │ measure: a bodyweight,    │
│ └──────────────────────────┘ │         │  ╲__╱‾╲_  weigh-ins   │   │ a lift or how often you   │
│ Past goals (2)            ›  │         │ Mark as achieved      │   │ train.                    │
├──────────────────────────────┤         │ Edit · Archive        │   │ [       New goal        ] │
│ [         New goal         ] │         └───────────────────────┘   └───────────────────────────┘
└──────────────────────────────┘          * optional (D10)
```

---

## 9. Recommended architecture (Proposed)

- **`src/domain/goals.ts` (new):** pure functions. It gets a separate name from `profile.goal`. It provides:
  - `goalKind(record)`: maps the stored `metric` to a display type, never rewriting it.
  - `evaluate(goal, sources, units, today)`, returning:
    - `{ current?, basisDate?, start?, target, unit, ratio?, state }`
    - where state is `"no-data" | "in-progress" | "reached" | "achieved" | "archived" | "overdue"`;
    - `ratio` is present only with a valid baseline.
  - Bodyweight reuses WP4B (`isBodyweightName`, `newestFirst`, `readValue`, `valueText`). Strength reuses `records`. Weekly reuses the `summary` week rule. **No new data sources.**
  - `newGoal(draft)` and a change-only `editedGoal(original, draft)` (undefined when untouched), following WP4B and WP4C.
  - Each type follows the exact rules in section 16A. Legacy goals keep their legacy meaning (labelled, never reinterpreted); new and explicitly converted goals carry `goalRules: 2`.
- **`src/screens/Goals.tsx` (new):** the overview, the detail (as an in-screen state, like WP4B's series detail), and the past-goals section.
- **`src/components/goals/` (new):**
  - `GoalSheet` (type step, then type-specific fields, using `DateSheet range="future"` for the target date and `ExercisePicker`);
  - `GoalCard`;
  - `GoalHistoryChart` (wraps `LineChart` with `x`/`breakOver`).
- **[Journal.tsx](../../src/screens/Journal.tsx):** `kind=goal` opens `Goals`. `LegacyJournal` and its `config` become dead and are removed. **This retires the last legacy journal UI.**
- **Unchanged:**
  - `validation.ts`, `repository.ts`, the schema, backup and sync;
  - `analytics.ts` (`goalProgress`, `bodyweightGoal` and `latestBodyweight` stay, with their tests);
  - Measurements, Recovery, Nutrition, workouts, programs, progression, Paths;
  - You and Progress, whose links are unchanged.
  - Home/Today is unchanged unless D12 is approved.

---

## 10. Expected file changes

| File | Change |
| --- | --- |
| `src/domain/goals.ts` | New |
| `src/screens/Goals.tsx` | New |
| `src/components/goals/GoalSheet.tsx`, `GoalCard.tsx`, `GoalHistoryChart.tsx` | New |
| `src/screens/Journal.tsx` | Route `goal`; remove `LegacyJournal` |
| `tests/goals.test.ts`, `tests/ui/goals.test.tsx` | New |
| `tests/ui/data-safety.test.tsx`, `tests/ui/nutrition.test.tsx` | Update the three legacy goal-card text assertions ("81.8 kg now · target 80 kg" etc.) to the new wording. They keep testing the same guarantees: any bodyweight spelling, no false completion without a weigh-in, and today's calories. |
| README, IMPLEMENTATION_STATUS, IPHONE_TESTING, the 7A audit's WP4 section, this file | Docs |
| `src/screens/Home.tsx` | Only if D12 is approved |

No dependencies.

---

## 11. Data-safety approach

1. **Records:** every goal keeps its `id`, `date`, `createdAt`, `metric`, `target`, `start`, `exerciseId`, `notes` and any unknown keys, with the **same value and type**. Display never normalises stored values.
2. **No migration.** New information uses **optional keys** that today's validation already accepts and older app versions preserve:
   - `targetDate` (ISO date)
   - `status` (`"achieved"` | `"archived"`; absent means active)
   - `achievedOn` (the date of the recorded source), `achievedValue` (a kg or count snapshot), `confirmedAt` (the real time of confirmation)
   - `goalRules: 2`: marks goals measured by the section 16A definitions (new goals, and legacy goals the lifter explicitly converts)
   - `direction` (`"atLeast"` | `"atMost"`): session-length and daily-calorie goals
   - `reps` (whole number 1–30): optional for lift goals; absent means 1
   
   No required key is added, and nothing is removed.
3. **Older app versions:** they show these goals exactly as today, ignoring the new keys. Their legacy edit form copies all keys, so the keys survive, although an old-version edit would stringify them. They are strings already except `achievedValue`. **Risk:** an old-version edit turns `achievedValue` into a string. Display code must read it with `Number()`.
4. **Change-only edits:** an untouched Save writes nothing and queues nothing. A change writes only the changed keys, as in WP4B and WP4C.
5. **Delete:** confirmation, then Undo through a deferred write, which keeps ID and timestamps (the WP4C pattern). **Archive** is the non-destructive alternative.
6. **Storage validation is not tightened.** New limits (for example a plausible bodyweight range) are form-only, so existing backups and synced rows always import.
7. **Backup and sync:** unchanged generic journal handling. Tests assert a byte-identical round trip of legacy goals.

---

## 12. Validation and edge cases (Proposed)

| Case | Rule | Type |
| --- | --- | --- |
| Empty target | "Enter a target, e.g. 80" | Hard |
| Zero or negative target | "The target must be more than zero" (storage requires 0.01) | Hard |
| Comma decimal | Accepted ("80,5"), using WP4B `readValue` | — |
| Bodyweight outside 25–350 kg (shown in units) | Ask "Check this value", then allow, as WP4B does | Soft |
| Bodyweight start = target | "Your target is your starting weight. Choose a different target." (storage rule) | Hard |
| No weigh-in yet (bodyweight) | Starting weight is required. The field starts empty with "Log a weigh-in first, or enter your current weight", and a typed start is allowed. | Hard (contract) |
| Lift: no exercise chosen | "Choose an exercise" | Hard |
| Lift target ≤ current best | "You've already lifted this. Save it anyway?" (no achievement is inferred; D7) | Soft |
| Session length or calories without a direction (new goal) | "Choose at least or at most" | Hard |
| Lift reps outside 1–30 | Prevented by stepper | Hard by control |
| Volume target over 100,000 kg (shown in units) | "Volume targets can be up to 100,000 kg (220,462 lb)" (storage cap) | Hard |
| Workouts per week | 1–7 via stepper | Hard by control |
| Target date in the past (new goal) | Blocked by `DateSheet range="future"` | Hard |
| Target date in the past (existing goal) | Kept, and shown "Target date passed" | — |
| Duplicate goals | Allowed, with a note "You already have a goal for bench press" | Soft |
| Very long name | Wraps to 2 lines on cards and in full in the detail; at most 120 characters (form only) | Hard (form) |
| Name left empty | Generated from type and target ("Reach 80 kg") | — |
| Editing after progress | Allowed. Changing the target or start recomputes progress; an achieved snapshot is kept. | — |
| Unsaved changes | The sheet asks before discarding (existing `Sheet unsaved`) | — |
| Offline | Everything is local, with no network dependence | — |

---

## 13. Accessibility and performance acceptance criteria

1. **Card label:** each card is one element, e.g. "Reach 80 kilograms. Bodyweight, lose. 82.0 kilograms as of Thursday, October 22. 52 percent of the way from 84.2. 2 kilograms to go." Values use the lifter's units, spoken in words.
2. **Progress bars:** they expose `accessibilityValue` (min, max, now) **only when shown**. Goals without a baseline expose no percentage.
3. **Type rows, the stepper and the picker** have targets of at least 44 pt. Type rows use `radio` semantics.
4. **130% text on SE (375×667):** no clipped labels or truncated values; Save is visible above the keyboard.
5. **Light and dark:** AA contrast. A reached state is indicated with text, not colour alone.
6. **Reduced motion:** no animated progress fills.
7. **Long lists:** 100 goals (including 80 past) render the overview in under 1 s in the UI test environment. Past goals are collapsed by default.
8. **No raw errors:** no alert or inline error contains `{`, `"code"` or `pattern`.
9. **Undo** is announced ("Goal deleted. Undo available.").

---

## 14. Test and emulator plan

**Domain (`tests/goals.test.ts`):**
- Bodyweight lose and gain: ratio, "to go", reached and moved-away states.
- Start from the latest weigh-in using WP4B's same-day comparator.
- kg/lb entry and display, including commas and rounding to 0.1.
- A legacy pounds-typed target displayed as recorded, with the plausibility note.
- Lift:
  - current best from completed non-warm-up sets only;
  - an unknown exercise ID gives "Exercise not found", not 0;
  - lb display.
- Weekly: the Monday boundary, plus the last-4-weeks counts if D10 is approved.
- Each section 16A definition, with its legacy counterpart:
  - **Lift best:** the heaviest working set at ≥ reps. Estimated 1RM is never used. Excluded:
    - warm-up and 0-rep sets;
    - non-load exercises;
    - incomplete sets;
    - incomplete workouts.
    
    Ties go to the earliest workout.
  - **Volume:** from the Counts-from day versus lifetime (legacy), equal to History's volume.
  - **Session length:** at most and at least over 28 days; "no workouts" state; legacy values-only.
  - **Daily calories:** at least and at most; days with nothing logged are never 0 or "within limit"; today is "so far" and not judged; legacy values-only.
  - **Conversion:** writes only `goalRules` and `direction`.
- Achievement:
  - `achievedOn` comes from the qualifying record's date;
  - `confirmedAt` is real;
  - Mark as achieved is not offered without a qualifying record;
  - the snapshot is unchanged after source edits or deletes;
  - Undo leaves nothing written;
  - habits are never achievable.
- Status:
  - achieved snapshot kept after source edits or deletes;
  - archive and restore;
  - overdue only from `targetDate`.
- Change-only edits: an untouched edit gives undefined and no outbox entry; types and unknown keys are preserved.
- A backup round trip is byte-identical; sync applies a remote goal with the new optional keys.

**UI (`tests/ui/goals.test.tsx`):**
- Empty, then create each type in at most N taps.
- Validation copy.
- Edit untouched writes nothing.
- Delete with Undo.
- Archive, achieve and reopen.
- Detail.
- Missing weigh-in.
- Units switched to pounds.
- Target date picker.
- Accessibility labels and values.
- The existing data-safety and nutrition goal tests, updated as in section 10.

**Cross-feature:**
- WP4B Measurements (`latestBodyweight` semantics unchanged); WP4C Recovery; WP4A Nutrition and WP4A.1 `food-library:check`.
- Progress screens; workout history; templates and Paths.
- The 18 curated program lock tests.
- Backup and sync suites; typecheck, lint, format; iOS and Android export.

**Emulator:**
- `seed19.ts` states on SE, standard and large, in light and dark, at 130% text, with the keyboard open.
- Pounds profile.
- Device-database check that an untouched edit leaves rows and outbox identical.

**Founder iPhone acceptance checklist (for after implementation):**
1. With pounds selected, create a bodyweight goal in pounds: it shows pounds everywhere.
2. A gain goal and a lose goal both show the right direction.
3. A lift goal chosen from the exercise list shows your best lift with its date.
4. Reaching a goal offers **Mark as achieved**, and it stays achieved after the value moves.
5. Edit with no change, then Save: nothing changes.
6. Delete, then Undo.
7. Archive, then find it under Past goals.
8. VoiceOver reads a card with its units and dates.
9. Larger Text keeps the sheet usable.

---

## 15. Known risks and limitations

1. **Legacy pounds-typed targets** can't be detected with certainty. Only implausibility against recorded weight is flagged, and nothing is auto-corrected.
2. **Junk `start` values** (bodyweight numbers on non-bodyweight goals) exist in real data. The new code reads `start` only for bodyweight goals, and for lift goals carrying `goalRules: 2`.
3. **Legacy definitions persist alongside new ones.** Volume, session-length and calorie goals can mean two things (legacy versus `goalRules: 2`). Every card states its definition in words, and conversion is explicit only (D21).
4. **Cross-version display:** an older app version reads a `goalRules: 2` goal with legacy maths. For example, it counts volume over the lifetime, and shows an "at most" calorie goal as a filling bar. This matters only to lifters running two app versions against the same synced data.
5. **Storage cap:** targets are limited to 100,000 by storage validation, which is not changed. A volume target can therefore be at most 100,000 kg (220,462 lb). This is an existing limit; the form explains it.
6. **Optional keys and older app versions** (section 11.3).
7. **Weekly counts** use the device's local week (Monday start, as `summary` already does). Time-zone travel can shift a workout across a week boundary, the same as everywhere else in Forge.
8. **Removing `LegacyJournal`** removes the last generic journal form. The `/journal` route still dispatches by kind, so no route changes.
9. **Expo Go only:** iPhone review is still required.

---

## 16. Implementation scope

Revised after founder review: all six types stay creatable.

**Required (WP4D):**
- the overview, the type-first sheet, detail, and past goals;
- **all six goal types creatable**, each with the exact definitions in section 16A;
- legacy goals kept with their legacy meaning, labelled in words, and converted only on request (D21);
- units in the lifter's preference (M-15), including volume;
- accurate, labelled progress with bars only where section 16A allows;
- exercise picker; target date;
- achieved and archived status as optional keys; target versus habit behaviour (D17);
- change-only edits; Undo for delete and for Mark as achieved;
- friendly validation; accessibility; tests.
- removal of `LegacyJournal`.

**Added to scope by the revision** (all read existing data only; no new integrations):
- the volume window from a chosen day;
- the direction choice (at least or at most) for session length and daily calories;
- the rolling 4-week session-length average;
- the calorie habit's last-7-logged-days history;
- the optional lift reps;
- explicit legacy conversion.

**Optional (needs approval):**
- new goal types (another body measurement, a recovery or sleep habit);
- milestones; streaks; reminders; new achievements; auto-generated goals;
- the 4-week frequency history (D10, recommended);
- a Today "top goal" row (D12);
- richer charts;
- a "total workouts" count goal.

**Deferred:**
- AI predictions and completion estimates;
- programming changes from goals;
- social features and challenges;
- medical or body-composition predictions;
- wearables.

---

## 16A. Revised goal-type rules (after founder review)

The founder's policy is to **preserve existing functionality during rebuilds**. All six goal types therefore stay creatable. Each misleading calculation is fixed by giving the type an **exact, stated definition**, not by removing it. **No type has a technical blocker** to being kept safely. The only hard limit is the existing storage cap (risk 5).

### Two kinds of goal (D17)

| Kind | Types | What "done" means |
| --- | --- | --- |
| **Target**: reach something once | Bodyweight, Lift, Training volume | "Target reached" appears when the recorded value meets the target; the lifter can **Mark as achieved** (D7) |
| **Habit**: keep doing something | Workouts per week, Session length, Daily calories | Measured per period (week, rolling 4 weeks, day) as met or not met. Ongoing: never "achieved", only archived when the lifter stops. |

### Exact definitions

Common rules for all types:
- **"Counts from"** is the goal row's `date`: the day the goal is set. It defaults to today and can be moved to a past day.
- **Days** are local calendar days.
- **Workouts** means completed workouts only, dated by their local finish day.
- **Weights** are stored in kg and shown in the lifter's units.

| Type | Measured value | Reached / met | Progress bar | New keys (`goalRules: 2`) | Legacy goals (no `goalRules`) |
| --- | --- | --- | --- | --- | --- |
| **Bodyweight** | Latest weigh-in by WP4B's comparator (any "body weight" spelling) | Losing: current ≤ target. Gaining: current ≥ target. Direction is the sign of target − start. | `(current − start)/(target − start)`, clamped 0–100 % | none | **Same rules** (unchanged meaning) |
| **Lift** | **Best recorded performance**: see D6 | best ≥ target, at the required reps | `(best − start)/(target − start)`, where `start` = best when the goal was set (0 if none) | `start` (trusted), optional `reps` | Same measured value; **no bar** (stored `start` is untrusted); shows "Best 90 kg · Oct 23 · target 100 kg" |
| **Training volume** | Σ weight × reps of completed non-warm-up sets (`metrics.volume`, the same number as workout History), over workouts from **Counts from** onward (D19) | total ≥ target | total ÷ target (the count starts at zero on the Counts-from day) | `goalRules: 2` | **Lifetime** total, labelled "Lifetime volume", with the same bar and reached rule (its original meaning) |
| **Workouts per week** | Workouts finished this week (Monday 00:00 to now) | count ≥ target: "Met this week" | count ÷ target, labelled "this week" | none | **Same rules** |
| **Session length** | **Average** length (finish − start − paused, as History shows) of workouts in the **last 28 days**, never before Counts from; at least 1 workout (D20) | At most: average ≤ target. At least: average ≥ target. Shown as "Within target" or "8 min over". | **None** (an average has no fill) | `direction` | Legacy average of **all** workouts, shown as **values only** ("Average 55 min · target 60 min"). No status or bar, because its direction was never recorded. |
| **Daily calories** | Each local day's logged calories (Σ calories × servings), **today shown "so far"**. Days with no entries are **"nothing logged"**: never 0, and never "within limit". (D22) | Per finished day. At least: total ≥ target. At most: total ≤ target and at least one entry. | At least: today so far ÷ target, labelled "today so far". At most: **no bar**, with text "200 kcal left" / "300 kcal over". | `direction` | Legacy "today's calories", shown as **values only** ("1,800 kcal today · target 2,500"). No status or bar, because its direction was never recorded. |

**Habit history** (read-only, from existing data):
- **Workouts per week:** the last 4 finished weeks as met or not met (D10).
- **Daily calories:** the last 7 days as met, not met, or "nothing logged".
- **Session length:** the 28-day average, plus the number of workouts it is based on.

**Legacy goals are never reinterpreted.** On a legacy volume, session-length or calorie goal, Edit offers an explicit **"Use the new measurement"** step. It previews the new value first, then writes `goalRules: 2`, plus `direction` where needed. Nothing changes until the lifter saves (D21).

**Why this is mathematically sound:**
- **Bars only for quantities measured from a real zero or start.** Bodyweight and Lift run from their recorded start. Volume and the weekly or daily counts start at zero when their window opens.
- **No bar for averages or limits.** An "at most" bar that fills would read as progress while it is really a warning.

---

## 17. Founder decisions

**Founder review, 2026-10-24:**
- D1, D2 and D4–D16 are approved in principle.
- D6 and D7 are clarified: lift "best" is defined exactly, and confirmed achievements keep their real date and value forever.
- D3 is to be revised so that no goal type is retired.
- Historical goals, their meanings, backups and sync must all be preserved.

The revised D3, D6 and D7, and new decisions D17–D23, are below and await approval.

Each decision can be approved as recommended or adjusted.

**D1: Dedicated Goals screen.**
- **Proposed rule:** replace the legacy journal with an overview, detail and past goals at the same route, and remove the legacy form.
- **Why it matters:** fixes C-05, C-09, C-15, C-19, G-08, G-09 and G-12.
- **Recommended:** approve.
- **Alternatives:** polish in place.
- **Trade-offs:** in-place polish can't fix fields per type, detail or history.
- **Data:** none.

**D2: What progress means.**
- **Proposed rule:** a bar and percentage appear only where section 16A allows:
  - a recorded start: bodyweight, and lift goals created by the new flow;
  - a count that starts at zero when its window opens: volume, workouts this week, and calories "today so far" for at-least goals.
  
  Averages and "at most" limits never get a bar. Everything else shows values with units and basis dates.
- **Why it matters:** removes the misleading bars (G-03).
- **Recommended:** approve.
- **Alternatives:** keep bars for all types.
- **Trade-offs:** fewer bars, but every bar is meaningful.
- **Data:** none.

**D3 (revised): Which types can be created.**
- **Proposed rule:** **all six** stay creatable: Bodyweight, Lift, Workouts per week, Training volume, Session length and Daily calories. Each has the exact definition in section 16A. Existing goals keep their legacy meaning, are labelled in words, and are converted only on request (D21).
- **Why it matters:** this preserves functionality, per founder policy. The misleading maths is fixed by stating definitions:
  - volume counts from a chosen day;
  - session length and calories get an explicit direction;
  - averages and limits get no progress bar.
- **Recommended:** approve.
- **Alternatives:**
  - B: keep the legacy definitions for new goals too, with labels only. This is simpler, but new volume goals would still count pre-goal history, and duration and calories would still have no direction.
  - C: retire some types. This is rejected under founder policy.
- **Trade-offs:** two definitions coexist for three types (legacy and new). Cards always state which one applies.
- **Technical blockers:** none. The storage cap limits volume targets to 100,000 kg, an existing limit.
- **Data:** new optional keys only (`goalRules`, `direction`, `reps`). Existing records are unchanged.

**D4: Units (M-15).**
- **Proposed rule:** bodyweight and lift targets are entered and shown in the lifter's units and stored in kg. Legacy values are shown converted, never rewritten, and implausible legacy targets get a neutral "edit if entered in pounds" note.
- **Why it matters:** fixes G-01.
- **Recommended:** approve.
- **Alternatives:** store a `unit` key per goal.
- **Trade-offs:** a unit key adds a second meaning to existing records and needs reading rules for old ones. Canonical kg matches Measurements.
- **Data:** none (display and entry only).

**D5: Bodyweight starting weight.**
- **Proposed rule:** it defaults to the latest weigh-in (shown with its date) and stays editable. With no weigh-in it starts empty and must be entered.
- **Why it matters:** replaces the invisible prefill and the raw error.
- **Recommended:** approve.
- **Alternatives:** require a logged weigh-in before a bodyweight goal can be created.
- **Trade-offs:** the alternative is stricter and slower to start.
- **Data:** `start` keeps its meaning.

**D6 (clarified): Lift goal: best recorded performance.**
- **Proposed rule:**
  - **What "best" means:** the **heaviest weight actually lifted** for the goal's exercise, in kg, on a **working set**. A working set is completed, not a warm-up, and has at least the goal's reps (`reps`, default 1). Drop and failure sets count. The set must be in a completed workout.
  - **What is excluded:**
    - Estimated 1RM is **never** used.
    - Volume and rep counts are not used.
    - Only exercises that Progress classifies as **external load** qualify. Bodyweight, assisted and band movements can't be lift goals, because their logged number isn't load (PROGRESS_METRICS).
  - **Ties:** the earliest workout keeps the best, as Progress records do. Unilateral sets count as logged (the weight of one side's implement).
  - **Window:** **all** recorded history, because a lift is a capability.
  - **Baseline:** new goals store `start` = the best at creation (0 if none), and the bar runs from it. If the target is at or below that best, the form asks "You've already lifted this. Save it anyway?"
  - **Legacy strength goals** use the same "best" definition, with no bar. The only difference from today's number: completed sets with 0 reps, and non-load exercises, no longer count. Progress already refuses to treat those as lifts.
  - **An unknown exercise ID** shows "Exercise not found (squat). Choose an exercise", never 0.
- **Why it matters:** it avoids confusing an estimate, volume and actual weight, and it matches the Progress screen's "heaviest set".
- **Recommended:** approve.
- **Alternatives:**
  - count only lifts made after the goal was set;
  - add an "estimated 1RM" goal variant, clearly labelled as an estimate (would need separate approval).
- **Trade-offs:** counting only post-goal lifts undercounts earlier strength.
- **Data:** new optional `reps` and a trusted `start` (with `goalRules: 2`). Legacy records are unchanged.

**D7 (clarified): Completion of target goals.**
- **Proposed rule:**
  - **Reached:** Forge shows "Target reached" when the recorded value meets the target (section 16A).
  - **Confirmation:** the lifter confirms with **Mark as achieved**. Habit goals never offer it (D17).
  - **What confirming stores:**
    - `status: "achieved"`
    - `achievedValue`: the recorded value that met the target, in kg or a count
    - `achievedOn`: **the date of the recorded source that met it**:
      - Bodyweight: the date of the weigh-in shown;
      - Lift: the finish day of the earliest qualifying workout;
      - Volume: the finish day of the workout that brought the total over the target.
    - `confirmedAt`: the real time of the tap
  - **No invented timestamps:** if no qualifying recorded source exists, Mark as achieved is not offered. Achievements are never inferred or backfilled for goals the lifter didn't confirm.
  - **Permanence:** once confirmed, the snapshot is **never recomputed or changed**, even if weigh-ins or workouts are later edited or deleted. The detail then notes "Your records have changed since this was achieved".
  - **Mistakes:** there is no Reopen. A mistaken confirmation can be undone only through the 6-second Undo (a deferred write, so nothing is stored until Undo expires). Achieved goals can then be archived or deleted (delete is confirmed).
- **Why it matters:** fixes G-05, and honours the founder's rule that confirmed achievements and their dates are permanent and real.
- **Recommended:** approve.
- **Alternatives:**
  - B: automatic completion on crossing (could award from a mistyped weigh-in);
  - C: a Reopen that keeps the old snapshot as history (more UI and keys).
- **Trade-offs:** without Reopen, a lifter who wants to continue sets a new goal (one tap: "Set a new target", which copies the goal).
- **Data:** new optional keys. Existing records are unchanged.

**D8: Target date and overdue.**
- **Proposed rule:** an optional `targetDate`, from today onward. After it passes, show "Target date passed" neutrally, with no penalty and no estimate.
- **Why it matters:** time-boxed goals are common, and it was asked for in the brief.
- **Recommended:** approve.
- **Alternatives:** no target dates.
- **Trade-offs:** none significant.
- **Data:** new optional key.

**D9: Archive and delete.**
- **Proposed rule:** **Archive** moves a goal to Past goals and can be restored. **Delete** is confirmed and offers Undo via a deferred write.
- **Why it matters:** non-destructive history.
- **Recommended:** approve.
- **Alternatives:** delete only.
- **Trade-offs:** none significant.
- **Data:** new optional `status: "archived"`.

**D10: Weekly frequency history.**
- **Proposed rule:** a workouts-per-week goal also shows dots for the last 4 completed weeks.
- **Why it matters:** Monday otherwise always reads 0.
- **Recommended:** **optional**, but I suggest approving it. It reads existing workout data only.
- **Alternatives:** this week only.
- **Trade-offs:** small extra UI.
- **Data:** none.

**D11: Duplicate goals.**
- **Proposed rule:** allowed, with a gentle note.
- **Why it matters:** some lifters want parallel targets.
- **Recommended:** approve.
- **Alternatives:** block duplicates.
- **Trade-offs:** blocking is arbitrary.
- **Data:** none.

**D12: Goals on Today.**
- **Proposed rule:** show the most recently updated active goal as one row in Today, above Recovery.
- **Why it matters:** visibility.
- **Recommended:** **defer**. Keep Today as is; You and Progress already link to Goals.
- **Alternatives:** approve the row.
- **Trade-offs:** it touches Today, which is otherwise outside WP4D.
- **Data:** none.

**D13: Milestones, streaks, reminders, achievements, auto-generated goals.**
- **Proposed rule:** none in WP4D.
- **Why it matters:** avoids gamification creep.
- **Recommended:** defer.
- **Alternatives:** approve individually.
- **Trade-offs:** —
- **Data:** —

**D14: Estimates and predictions.**
- **Proposed rule:** no projected completion dates or "on track" judgements; recorded values only.
- **Why it matters:** accuracy, and the brief's rule.
- **Recommended:** approve.
- **Alternatives:** a simple trend projection (needs approval).
- **Trade-offs:** —
- **Data:** —

**D15: The training-goal naming collision.**
- **Proposed rule:** leave You's "Training focus" copy unchanged in WP4D. Goals UI copy never says "training goal".
- **Why it matters:** avoids touching onboarding and profile.
- **Recommended:** approve.
- **Alternatives:** rename "Goal not set" to "Focus not set" (touches You).
- **Trade-offs:** —
- **Data:** none.

**D16: Deferred list.**
- **Proposed rule:** AI predictions, programming changes, social and challenges, medical or body-composition predictions, and wearables stay out.
- **Recommended:** confirm.

### Founder approval (2026-10-24, second review)

- **Approved:**
  - the revised D3;
  - D17–D23, with the recommended options and the exact definitions in section 16A;
  - the clarified D6 and D7.
- **Refinement 1, historical lift achievements:** if historical workouts already satisfy a target when the goal is created, this is stated clearly, never implying the lift happened after the goal was set. A confirmed historical achievement keeps the real qualifying workout date and the real confirmation time. No date is ever invented or substituted.
- **Refinement 2, daily calories:** "at most" goals are described as based on **logged** intake, not total consumption. Unlogged days are unmeasured, never zero-calorie successes, and partially logged days never imply complete compliance.
- **Requirements:**
  - preserve all six types, existing functionality and historical data;
  - no silent conversion of legacy goals;
  - apply the definitions consistently across creation, editing, cards, detail and history;
  - respect the protected boundaries;
  - test all six types, legacy compatibility, achievement permanence and the edge cases.

---

## Implementation results (WP4D)

### What changed

| File | Change |
| --- | --- |
| [domain/goals.ts](../../src/domain/goals.ts) (new) | Pure goal logic: the six type definitions and the target/habit split, `evaluate` (exact section 16A rules), achievement snapshots (`achievedData`, `canAchieve`), and entry rules (`newGoal`, change-only `editedGoal`, `readTarget` in the lifter's units with commas accepted, soft `confirmations`). |
| [data/goal-sources.ts](../../src/data/goal-sources.ts) (new) | Read-only sources, computed lazily: weigh-ins, completed workouts by local finish day, History's `metrics.volume` per workout, working sets per exercise (Progress's `isWorkingSet`), Progress's load classification, and logged calories per day. |
| [screens/Goals.tsx](../../src/screens/Goals.tsx) (new) | The overview (active goals, "Mark as achieved", collapsed Past goals) and the detail. The detail has the full notes, habit history, a source chart for bodyweight and lift on real dates, Details, and actions: Edit, Archive/Restore, Set a new target, Delete. Delete and Mark as achieved are held for a 6-second Undo, so nothing is written until it expires. |
| [components/goals/](../../src/components/goals/) (new) | `GoalSheet`: types first, then only that type's fields: units, reps stepper, at least/at most, Counts-from and target-date calendars, the explicit legacy "Use the new measurement" switch, and Save pinned above the keyboard. `GoalCard`: the card, with an accessible summary, bars only where allowed, and habit history marks. |
| [Journal.tsx](../../src/screens/Journal.tsx) | `kind=goal` opens Goals. `LegacyJournal` (the last generic journal form) is removed; the route still dispatches by kind. |
| [data-safety.test.tsx](../../tests/ui/data-safety.test.tsx), [nutrition.test.tsx](../../tests/ui/nutrition.test.tsx) | The three legacy goal-card assertions now check the new wording. They test the same guarantees: any bodyweight spelling (with the bar still at 56 %); no false completion or bar without a weigh-in; today's logged calories. |

**Unchanged:**
- `validation.ts`, `repository.ts`, the schema, backup and sync;
- `analytics.ts` (`goalProgress`, `bodyweightGoal` and `latestBodyweight` are kept, with their tests);
- Measurements, Recovery, Nutrition, workouts, programs, progression, Paths;
- You, Progress and Today;
- splash, onboarding, navigation.

No dependencies were added.

### How the refinements are met

- **Historical lifts:**
  - If the earliest qualifying set is older than the goal, the card says "Already lifted before this goal was set" and "You first lifted this on {date}, before this goal was set".
  - Creating such a goal first asks "You've already lifted … before this goal. It will show as already met. Save it anyway?"
  - Confirming stores `achievedOn` = that workout's day and `confirmedAt` = the real tap time. The achieved card states "The qualifying record is from before this goal was set", plus "Confirmed {day}" when the two dates differ.
- **No invented dates:**
  - Mark as achieved is offered only for an active target goal with a qualifying record. Habits, archived goals, and goals with no record never get it.
  - Snapshots are never recomputed. If the qualifying record is later deleted or changed, the card adds "Your records have changed since this was achieved".
  - A bodyweight snapshot stays matched while its weigh-in exists, even after newer weigh-ins.
- **Logged calories:**
  - Every calorie goal shows "Based on the food you log in Nutrition. Days with nothing logged aren't counted."
  - Today reads "… kcal logged so far today" and "… kcal left today, by what you've logged" (or "over").
  - History marks unlogged days "Nothing logged" (–), never as met.
  - The minimum wording is "Today's logged intake has reached the minimum". "Within limit" or "compliant" is never used.

### Tests

- **`tests/goals.test.ts` (18 tests):**
  - **Bodyweight:**
    - losing, gaining and moving the wrong way;
    - no weigh-in means no progress and nothing to achieve;
    - pounds entry with commas, stored canonically;
    - a legacy pounds-typed target shown as recorded with its note.
  - **Lift:**
    - "best" is the heaviest set at ≥ reps, with ties going to the earliest day;
    - the bar runs from the best at creation;
    - reaching needs a real set;
    - historical lifts are stated and confirmed with the real date;
    - legacy goals get no bar;
    - unknown and non-load exercises are explained.
  - **Volume:** windowed (new) versus lifetime (legacy), the historical crossing, pounds, unit entry, the 100,000 kg cap.
  - **Weekly:** the Monday–Sunday count and recent weeks.
  - **Session length:** at most and at least, the 28-day window, legacy values-only, a required direction.
  - **Calories:**
    - at most and at least on logged intake;
    - unlogged days are "Nothing logged";
    - today is "so far", with no bar for at most;
    - legacy values-only.
  - **Achievements:**
    - the snapshot is unchanged after newer weigh-ins;
    - "records have changed" appears after the qualifying weigh-in is deleted;
    - a text `achievedValue` from an old-version edit still reads;
    - nothing is achievable without a record, and habits never are.
  - **Entry:**
    - new goals store only chosen keys (no junk `start`);
    - every validation message;
    - untouched edits (legacy junk included) give undefined;
    - conversion is explicit and writes only `goalRules` and `direction`;
    - one-key edits keep types and unknown keys;
    - target dates can be added and cleared.
  - **Repository:**
    - lift sources exclude warm-ups, 0-rep sets (legacy data), incomplete sets, unfinished workouts and non-load exercises;
    - an untouched edit queues no outbox entry;
    - a backup with the new keys round-trips byte-identically.
- **`tests/ui/goals.test.tsx` (8 tests):**
  - all six types created from the sheet, each with WP4D rules;
  - a pound user's bodyweight goal: start from the latest weigh-in, comma decimal, saved once on a double tap, no "kg" shown, Undo;
  - plain validation sentences;
  - a historical lift: the ask, the statement, then Mark as achieved, written on close with the real workout day and confirmation time;
  - Mark as achieved, Undo, then permanence after a later weigh-in;
  - an untouched legacy edit writes nothing (outbox unchanged), then an explicit conversion;
  - archive, restore, and delete with Undo;
  - the card's accessible summary with units and dates, the bar's accessible value, and no raw errors.
- **Full suite:**
  - 334 logic tests (including the 18 curated program locks) and 251 UI tests pass;
  - typecheck and format pass; lint shows only the existing WP3 warning;
  - `food-library:check` (3,730 foods) passes;
  - iOS and Android export pass.

### Android emulator

Captures: `forge-visual-harness\p20.ps1` with the `seed19.ts` (audit) and `seed20.ts` (reached and historical) states. Screenshots: `shots\android\p20\`, 41 frames plus contact sheets `_sheet-a…c.png`.

Verified:
- **States:** empty, one, and 8 legacy goals across all six types, labelled "Lifetime volume", "Average of all workouts", "Today's calories" and "Exercise not found (squat)", with no misleading bars. Also the edge case (gain goal "0.8 kg below your start") and no weigh-in.
- **Pounds and light theme:** pounds everywhere, including "Get to 175 lb · Target 385.8 lb" with its note.
- **Reached and historical:** the historical lift statements; reps-aware lift with a target date; session length at most ("Within target"); calories at most with "Nothing logged" history.
- **Mark as achieved:** the Undo banner, then Past goals showing "Achieved Thu, Oct 22 · 79.6 kg".
- **Detail:** lift with a real-date chart; the calorie habit's Recent list; Details and Actions.
- **New goal:** the type list; pounds bodyweight with the starting weight from the latest weigh-in (180.78 lb); comma entry with the keyboard open and Save visible; lift via the picker with "Your best"; calories without a direction showing "Choose at least or at most".
- **Legacy edit sheet:** the opt-in "Use the new measurement" switch.
  - **Device database:** an untouched Save on a legacy goal left 8 goals byte-identical and the outbox unchanged (23 → 23).
- **Entry from Progress → Goals.**
- **Sizes and text:** SE, standard and large; 130% text on SE (cards and the type list wrap without clipping, and Save stays pinned).

### Known limitations

- **Lift goals** need an external-load exercise. Bodyweight, assisted and band movements are explained rather than measured, consistent with Progress.
- **Lift weights** show up to 2 decimals in pounds (for example "198.42 lb"), matching Progress's `loadText`.
- **Older app versions** read `goalRules: 2` goals with legacy maths (risk 4). An old-version edit may stringify `achievedValue`; the new code reads it defensively.
- **TalkBack:** goal cards are read as one summary. Habit history rows each read "Week of …: met, 3 of 3".
- **Not run:** a release build, or a very long goal list (100+) profiled on a device.

### iPhone acceptance checks (outstanding)

See section 14 and [IPHONE_TESTING.md](../../IPHONE_TESTING.md).

### New exact rules from the revision (approval requested)

**D17: Target goals versus habit goals.**
- **Proposed rule:**
  - Bodyweight, Lift and Volume are **targets**. They can be reached and confirmed as achieved.
  - Workouts per week, Session length and Daily calories are **habits**. They are measured per period as met or not met, are ongoing, and are archived when the lifter stops.
- **Why it matters:** "achieving" a weekly or daily habit after one good period would be misleading.
- **Recommended:** approve.
- **Alternatives:** let habits be marked achieved after N consecutive met periods (adds streak rules, D13).
- **Trade-offs:** habits get no completion moment.
- **Data:** none.

**D18: Lift reps.**
- **Proposed rule:** an optional "for at least N reps" on lift goals (1–30, default 1). For example, "100 kg for 5" counts only working sets of at least 5 reps.
- **Why it matters:** many lifters set rep targets. Without it, a 100 kg single would satisfy "100 kg for 5".
- **Recommended:** approve.
- **Alternatives:** singles only.
- **Trade-offs:** one extra optional field.
- **Data:** optional `reps` key.

**D19: Volume definition and window.**
- **Proposed rule:**
  - **Volume** = recorded weight × reps of completed non-warm-up sets: the number shown in workout History (`metrics.volume`).
  - **New goals** count from the goal's Counts-from day (default: the day it's set; can be moved to a past day).
  - **Legacy goals** stay "Lifetime volume".
  - The target is entered in the lifter's units.
- **Why it matters:** fixes pre-goal history inflating new goals, and matches the number lifters already see.
- **Recommended:** approve.
- **Alternatives:** Progress's load-only volume, which excludes bodyweight and assisted movements (PROGRESS_METRICS). It is stricter but differs from History.
- **Trade-offs:** History volume includes logged numbers for assisted movements.
- **Data:** `goalRules: 2`. Existing records are unchanged.

**D20: Session length.**
- **Proposed rule:**
  - The lifter chooses **at most** or **at least** when creating the goal.
  - The measured value is the average length (finish − start − paused) of workouts finished in the **last 28 days**, never before Counts from.
  - It shows "No workouts in the last 4 weeks" when there are none.
  - No bar.
- **Why it matters:** fixes the inverted direction, and a rolling window reflects current habits rather than all-time history.
- **Recommended:** approve.
- **Alternatives:**
  - the share of sessions within target over 28 days ("7 of 9 within an hour"), which is clearer for "at most" but a new measure;
  - all-time average (legacy).
- **Trade-offs:** a rolling average moves as old workouts leave the window.
- **Data:** `direction`, `goalRules: 2`.

**D21: Legacy goals and conversion.**
- **Proposed rule:** legacy goals keep their legacy meaning and are labelled in words:
  - "Lifetime volume"
  - "Average of all workouts"
  - "Today's calories"
  
  Legacy session-length and calorie goals show values only, because their direction was never recorded. Edit offers **"Use the new measurement"**, with a preview, for volume, session length and calories. It writes `goalRules: 2` (plus `direction`) only when saved. It never happens automatically.
- **Why it matters:** preserves historical meanings, per founder policy.
- **Recommended:** approve.
- **Alternatives:** convert automatically, which is rejected because it silently changes meaning.
- **Trade-offs:** some old goals stay values-only until converted.
- **Data:** none unless the lifter converts.

**D22: Daily calories.**
- **Proposed rule:**
  - The lifter chooses **at least** or **at most**.
  - Each local day is judged on its logged entries. Today is "so far" and is not judged until the day ends.
  - **Days with nothing logged are "nothing logged"**: never 0 kcal, and never "within limit".
  - History shows the last 7 days.
  - The goal is independent of Nutrition targets, which it never changes.
- **Why it matters:** fixes the "100 % for over-eating" and the "empty day counts as success" traps.
- **Recommended:** approve.
- **Alternatives:**
  - B: a range ("2,300–2,700") (adds a second value);
  - C: reuse the Nutrition calorie target instead of a separate goal.
- **Trade-offs:** a calorie goal can differ from the Nutrition target. The goal card shows both when they differ.
- **Data:** `direction`, `goalRules: 2`.

**D23: Counts-from day.**
- **Proposed rule:** the goal row's existing `date` becomes the visible "Counts from" day. It defaults to today and can be moved to a past day only (calendar). It drives the volume and session-length windows.
- **Why it matters:** it gives the existing, unexplained date field a clear meaning without a new key.
- **Recommended:** approve.
- **Alternatives:** a separate `startDate` key, leaving the row date as "created".
- **Trade-offs:** moving the day changes volume totals, which is shown live in the sheet.
- **Data:** none (existing field). Legacy goals' dates are shown as "Set on" and are unused by legacy rules.

---

*End of WP4D. Not committed. WP5 has not begun.*
