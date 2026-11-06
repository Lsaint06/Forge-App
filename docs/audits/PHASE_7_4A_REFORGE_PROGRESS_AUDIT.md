# Phase 7.4A — REFORGE Progress: roadmap audit and plan

**Status:** read-only audit for founder review. No application code is changed; nothing is committed.
**Branch:** `feat/forge-paths-foundation` at `4bfa311` (after 7.3H).
**Date:** 26 October 2026.

This audit compares the original Phase 7.4 plan with the current Progress code and the approved Progress reference, and proposes the remaining work.

## 0. Sources reviewed

- **Phase 7.0 plan** ([PHASE_7_0_REFORGE_ARCHITECTURE.md](PHASE_7_0_REFORGE_ARCHITECTURE.md)):
  - §4.4: Progress reference mapping;
  - §6.9: chart conventions;
  - §10: preservation boundaries;
  - §13: 7.4-1 to 7.4-7;
  - §15: decisions D8, D14, D19, D20, D25 and D31.
- **REFORGE foundation** ([REFORGE_FOUNDATION.md](../redesign/REFORGE_FOUNDATION.md)):
  - Home precedent: "No comparison percentages" (no comparison % on Home's snapshot);
  - `nextTarget`;
  - the streak pill.
- **Phase 7.2 plans** ([PHASE_7_2B_0_REFORGE_TRAIN_HUB.md](PHASE_7_2B_0_REFORGE_TRAIN_HUB.md), [PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md](PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md)):
  - History moved to You, and its restyle goes with You in 7.5;
  - the Training calendar was restyled in 7.2C-4 (decision C4).
- **Earlier audits:**
  - [PHASE_7B_WP6_ACCESSIBILITY_DEVICE_QA_AUDIT.md](PHASE_7B_WP6_ACCESSIBILITY_DEVICE_QA_AUDIT.md): the Overview tiles are full width on purpose;
  - [ASSETS.md](../redesign/reforge/ASSETS.md): the plate artwork was cancelled on 2026-10-24.
- **Metric definitions:** [PROGRESS_METRICS.md](../PROGRESS_METRICS.md).
- **Code:**
  - screens: `Progress.tsx` (891 lines), `Records.tsx`, `History.tsx`, `TrainingCalendar.tsx`, `Exercise.tsx`;
  - components: `charts.tsx`, `design.tsx`, `system.tsx`;
  - calculations: `src/domain/progress/*`, `src/data/progress.ts`, `metrics.ts`, `measurements.ts`, `home/model.ts`.
- **Tests:**
  - `tests/ui/progress.test.tsx` (11 tests);
  - `progress-consistency`, `progress-data` and `progress-strength` (32 logic tests);
  - plus the calendar, exercise-detail, goals and measurements suites.
- **Approved Progress reference:** `ChatGPT Image Oct 24, 2026, 09_17_59 PM-4.png` from the founder's Downloads (941 × 1672 px, SHA-256 `60BA9695…98448`). It is the fourth file of the same approved set as the stored Nutrition reference (`…-3.png`, identical bytes). **It is not yet in the repository** (D31; see P10).

## 1. Original Phase 7.4 scope

| WP | Original scope (7.0 §13) | Notes now |
| --- | --- | --- |
| 7.4-1 | Range control (D20: 7D and daily bars) | D20 still open |
| 7.4-2 | Bodyweight card and `LineChart` restyle (area, grid, callout) | |
| 7.4-3 | Training volume card with toggle and `BarChart` restyle | |
| 7.4-4 | PR highlight and All-time stats | The plate artwork it showed was cancelled |
| 7.4-5 | Strength, Consistency, Records and muscle sets in REFORGE cards | |
| 7.4-6 | Milestones and Next goals | |
| 7.4-7 | Records, History and Calendar consistency | **Calendar is done (7.2C-4). History moved to 7.5 (7.2C).** Records remains |

**The reference** (top to bottom):

1. Brand header with bell and streak 12.
2. "Progress", subtitle "Evidence of a stronger you. Keep building.", date, "Week 8 · Build Phase".
3. Range 7D | **4W** | 12W | 1Y | All.
4. **Bodyweight:** current, range start and end, "−1.2 kg (−1.4%)", area chart with callout.
5. **Training volume:** 12,480 kg, "+18 % vs last 4 weeks", *Total Volume / Workouts* toggle, about 28 daily ember bars with a callout.
6. **PR highlight** (Bench 95 kg, "+5 kg New Personal Record", plate image) beside **All-time stats** (workouts, total volume, total time).
7. **Milestones** tiles, including a bodyweight-target ring.
8. **Next goals**.

**Standing rules (7.0 §4.4 and §10):**

- The sections that hold the calculations stay: Overview, Consistency, Strength, Records, muscle sets, Training time, Saved plans, More, info sheets and the empty state.
- Proposed order: Range → Bodyweight → Volume → PR and All-time → Strength → Consistency → Records → Milestones and Goals → More.
- `src/domain/**` and `src/data/**` stay untouched without approval. New class-D numbers go in `src/domain/presentation/**` as tested pure functions.
- No fictional metrics.

## 2. What is already complete

**Calculations.** Everything the reference needs, except the class-D deltas, already exists and is tested:

| Need | Existing source |
| --- | --- |
| Ranges and buckets | `range.ts`: 4w, 12w, 1y, all; weekly ≤ 16 weeks, otherwise monthly |
| Consistency and plan adherence | `consistency.ts` |
| Strength series and comparisons | `strength.ts` |
| Volume and muscle sets | `volume.ts` |
| Record events and bests | `data/progress.ts` |
| Bodyweight series and change over a period | `measurements.ts`: `seriesOf`, `sincePrevious`, `overRange` |
| Lifetime totals | `metrics.ts`: `summary()`, `achievements()`, `elapsedSeconds` |
| Goal progress | `evaluate()`; Home's `nextTarget` rule |
| Latest weigh-in | Home's `bodyweight` helper |

**Progress functionality** (all working; 11 UI tests):

- range control;
- Overview;
- Consistency against plan, with legend;
- legacy Saved plans;
- Strength with a searchable picker, Est. 1RM / Heaviest set, latest against previous, and a link to Exercise details;
- Records: three in range, plus All records;
- Volume, with sets by primary muscle;
- Training time;
- Body: every measurement series, with chips;
- More: History, Calendar, Milestones, Measurements, Nutrition (opens today since G4), Recovery, Goals;
- info sheets;
- the new-lifter empty state.

**Sub-screens already in REFORGE:**

| Screen | Done in |
| --- | --- |
| Training calendar (`/calendar`) | 7.2C-4 |
| Exercise detail (`/exercise`, with strength chart and records strip) | 7.2C-3 |
| Workout review (`/workout?id=`) | 7.2 |

**Cross-tab pieces in place:**

- Home's streak pill and Progress snapshot open Progress and use the same numbers.
- Home's `TitleBlock`, `BadgePill`, `ForgeScreen` and `NextTargetCard` can be reused as they are.

## 3. Screens requiring visual work

| Surface | Current styling | Work |
| --- | --- | --- |
| **Progress tab** | Older UI components throughout (`Screen`, `Card`, `Txt`, `SegmentedControl`, `ListRow` / `ListSection`, `Chips`, `Button`); plain "Progress" title with no brand header. It is the only tab besides You without the REFORGE frame | Full REFORGE transformation (§6) |
| Charts (`charts.tsx`) | Older chart style: grey line, ember last point only; **green** completed bars; no area, grid or callout | REFORGE chart style (§6.9 of the 7.0 plan). **Shared:** `LineChart` is also used by Exercise detail (REFORGE) and Goals (7.5) |
| Records (`/records`) | Older UI components | REFORGE sub-screen (`ForgeSubScreen`, REFORGE rows) |
| Milestones sheet | Older `Sheet` with `AchievementCard` | REFORGE tiles (7.4-6) |
| Exercise picker sheet (in Progress) | Older `Sheet`, `Field` and `ListRow` | REFORGE rows and search field |
| Info sheets | `InfoSheet` (shared) | Unchanged (used app-wide; 7.6-1) |
| History (`/history`) | Older UI components | **7.5** (owned by You, per 7.2C) unless P8 brings it forward |
| Calendar, Exercise detail, Workout review | Already REFORGE | None |

## 4. Missing or inconsistent against the reference

The class letters are those of the 7.0 plan: R = existing data, P = existing data that needs presentation work, D = derived number that needs approval, F = new feature, X = omitted.

| Reference element | Status | Class |
| --- | --- | --- |
| Brand header, streak pill | Missing on Progress (Home has both) | R |
| Bell | Omitted everywhere (D14) | X |
| Title, subtitle, date, "Week · Phase" | Missing (Home's `TitleBlock` and `planContext` exist) | R |
| Range 4W / 12W / 1Y / All | Exists; labels are full words ("4 weeks") | R (short visual labels, spoken in full) |
| Range **7D** and daily bars | Missing | D (D20) |
| Default range | Code: **12 weeks**. Reference shows 4W selected | Decision (P3) |
| **Bodyweight card** (current, range start and end) | Missing as a card. Body is a generic all-measurement chart **at the bottom**, and **it ignores the selected range** | R |
| Bodyweight Δ kg and % | Missing. `overRange` exists but uses the Measurements screen's own ranges | D (P1) |
| Training volume total | Exists (Overview and Volume) | R |
| Volume bars in kg | Bars show **working sets**; kg is only in each bar's description | P |
| *Total Volume / Workouts* toggle | Missing; both series exist | P |
| "+18 % vs last 4 weeks" | Missing | D (P1) |
| ~28 daily bars | Weekly / monthly only | D (D20) |
| PR highlight (latest record) | Data exists (`model.events[0]`, `recordHeadline`) | R |
| "+5 kg" over the previous best | Missing; `RecordEvent` has no previous value | D (P1) |
| PR plate image | **Cancelled** artwork | X (P6) |
| All-time stats | Data exists (You shows similar) | R |
| Milestone tiles "4-week streak", "+18 % volume" | Not real milestone types | F (P7) |
| Milestones from real achievements | 5 fixed achievements, in a sheet behind *More* | R |
| Bodyweight target ring | Goal progress exists (`evaluate`, `ForgeRing`) | R |
| Next goals | Missing on Progress; Home's `nextTarget` / `NextTargetCard` | R |
| Consistency bar colour | Green (`c.success`); REFORGE uses ember bars with the planned outline | P |
| Sections not in the reference | All present; must remain | R |

## 5. Defects versus optional improvements

### Confirmed defects

| # | Defect | Severity | Evidence | Safe fix |
| --- | --- | --- | --- | --- |
| PD-1 | The lifetime `summary()` (workouts, volume, streak) runs **on every render**, including each range tap. It reads every workout's sets separately | Medium (performance with long histories) | 400 workouts × 20 sets: **54 ms per render on desktop**, likely several times that on a phone. `progressModel` (21 ms) and `consistencyInput` (1 ms) are already memoised | Memoise by `revision`, as the models already are. Presentation only; no calculation change |
| PD-2 | The Body chart **ignores the range control** that sits above every other section | Low (inconsistent behaviour) | `Body` plots `s.days` for all time | Resolved by the range-aware Bodyweight card (7.4D) |
| PD-3 | The "10,000 kg lifted" milestone is named in kg for pound users | Low (unit consistency) | `achievements()` name string | Display-only label in the lifter's unit; the threshold is unchanged (needs P12, because the name lives in `metrics.ts`) |
| (fixed) | Monday-only Progress test failures | — | Fixed in 7.3H (`4bfa311`) | — |

No calculation defect was found. All 32 Progress logic tests and 11 Progress UI tests pass on every weekday (verified in 7.3H).

### Intentional (keep)

- Overview tiles are one per row: WP6 accessibility decision.
- History's Back fallback is You: 7.2B decision T3.
- Day streak means consecutive days: Home matches.

### Optional improvements (not defects)

- Range deltas and comparison percentages (P1).
- 7D and daily bars (P2).
- New milestone types (P7).
- A weekly muscle-coverage view (7.2C note).
- Chart draw-in motion and a selection haptic (7.0 §6.9; overlaps 7.6-3).
- Copy: "No Bench sessions in the last 1 year." reads awkwardly.

## 6. Proposed staged roadmap

Each stage:

- runs the full suite (typecheck, lint, format, logic, UI, food library and branded checks, iOS / Android export);
- adds focused tests;
- stops for founder approval before commit.

| Stage | Scope | Main files | Protected |
| --- | --- | --- | --- |
| **7.4B Frame and range** | `ForgeScreen` with brand header and streak pill. `TitleBlock`: "Progress", subtitle (P11), date, plan week and phase. REFORGE range segments: "4W · 12W · 1Y · All", spoken in full. **PD-1** memoisation | `Progress.tsx` | All calculations |
| **7.4C Charts** | REFORGE `LineChart` (ember line, area, grid, y labels, callout) and `BarChart` (ember bars, planned outline kept, callout). Keep the adjustable role, per-point descriptions, gaps (`breakOver`) and scrubbing. Scope per P5 | `charts.tsx` | Chart data inputs |
| **7.4D Bodyweight and Training volume** | **Bodyweight card:** latest weigh-in, value at the range's start and end, range-aware chart; other measurements remain via chips or *Body measurements*; fixes PD-2. **Training volume card:** kg total for the range and a *Volume / Workouts* toggle over existing buckets. Deltas only if P1 approves (new tested helpers in `src/domain/presentation/`) | `Progress.tsx`, new `screens/progress/sections.tsx` and `model.ts` | `measurements.ts`, `volume.ts`, `range.ts` |
| **7.4E PR highlight, All-time stats, core sections** | PR highlight (latest record; "+Δ" only if P1); All-time stats (workouts, volume, time); Strength, Consistency, Records, muscle sets and Training time in `ForgeCard`s with REFORGE rows; REFORGE exercise picker | same | `strength.ts`, `data/progress.ts`, `metrics.ts` |
| **7.4F Milestones, Next goals, Records** | Milestone tiles from real achievements plus a goal ring (P7); Next goals via `nextTarget` / `NextTargetCard`; *See all* opens the existing Milestones sheet and Goals. **Records screen** in REFORGE | `Progress.tsx`, `Records.tsx` | `goals`, `achievements` |
| **7.4G QA** | Compact (320 pt) and 200 % text; light mode; VoiceOver order; 200+-workout performance (range switch and chart scrub); founder side-by-side against the reference; short report | tests, report | — |

Total: 5 implementation stages plus QA. 7.4B and 7.4C are independent; 7.4D–F depend on both.

## 7. Testing and acceptance criteria

**Behaviour that must not change:**

- All existing Progress UI tests keep their behavioural assertions. Only design-rule assertions may be updated (as D27 allowed before), and each change is listed.
- These logic suites stay untouched and green: `progress-*`, `measurements`, `goals`, `analytics`, `workout-*`.

**Number parity:** a fixed history fixture gives the same numbers before and after for:

- workouts, active weeks, on-plan %, record count, volume;
- the strength series and comparisons;
- muscle sets, training time, streak;
- milestones.

The parity test runs at 4W, 12W, 1Y and All, in kg and lb.

**New tests:**

| Stage | Tests |
| --- | --- |
| 7.4B | Header, title and plan context; spoken range labels; memoised summary (no recalculation on a range tap) |
| 7.4C | Chart roles, descriptions, `breakOver` gaps and scrubbing unchanged; ember colours in dark and light |
| 7.4D | Bodyweight start, end and latest for each range; empty and one-entry states; units; toggle |
| 7.4E | PR highlight from the latest event, or an empty state; All-time totals equal You's |
| 7.4F | Next goals equal Home's `nextTarget`; milestone tiles only from earned achievements |
| Delta helpers (if P1) | Unit-tested in `src/domain/presentation/` |

**Acceptance:**

- No fictional values; every number traces to a named function.
- Empty states for a new lifter.
- 44 pt touch targets.
- Large text without truncation.
- Light mode readable.
- Range switch under about 100 ms on device with 200+ workouts.
- Founder visual approval against the reference.

**Regression risks and mitigations:**

| Risk | Mitigation |
| --- | --- |
| Shared `charts.tsx` changes Exercise detail and Goals | Opt-in props, or approved global scope (P5) |
| Record or delta logic drifting into screens | Helpers in `presentation/` with tests; screens only format |
| Bodyweight unit conversions | Reuse `toDisplay` / `displayUnit` |
| Long histories | Memoisation; monthly buckets above 16 weeks (unchanged) |
| Sync, backup and persistence | Untouched: Progress only reads |

## 8. Decisions requiring founder approval

| # | Decision | Options (recommended first) |
| --- | --- | --- |
| **P1** | Comparison numbers (D19 for Progress) | **(a) Only the two lifters care about most, each as a tested helper: bodyweight change over the range (kg and %, neutral or ember, never green or red) and PR "+Δ over the previous best"; no volume percentage** · (b) all reference deltas, including "+18 % vs previous period" · (c) none, matching Home's "no comparison percentages" |
| **P2** | 7D range and daily bars (D20) | **Omit 7D; keep weekly and monthly bars** · add 7D and daily bucketing (`range.ts` change) |
| **P3** | Default range | **Keep 12W** (enough weeks for a trend line) · 4W as in the reference |
| **P4** | Section order | **Reference order first, then the preserved sections:** Range → Bodyweight → Volume → PR and All-time → Strength → Consistency → Records → Milestones and Next goals → Training time → More · keep the current order |
| **P5** | Chart restyle scope | **Opt-in REFORGE variant used by Progress and Exercise detail; Goals adopts it in 7.5** · global change now (Goals restyled early) |
| **P6** | PR highlight artwork (plate cancelled) | **Ember glow and trophy icon, no image** (as Nutrition's hero) · wait for the pending artwork direction |
| **P7** | Milestone tiles | **Earned achievements plus up to one goal ring; no new milestone types** · design new types ("4-week streak", "+18 % volume") as a feature |
| **P8** | History restyle | **Keep it in 7.5 with You (per 7.2C)** · bring it into 7.4F |
| **P9** | Body measurements | **Bodyweight card first; other measurement series stay available (chips or a link to Measurements)** · bodyweight only on Progress |
| **P10** | Store the Progress reference in `docs/redesign/reforge/references/` (D31), unaltered, with its SHA-256 | **Yes, in 7.4B** · no |
| **P11** | Copy: the subtitle "Evidence of a stronger you. Keep building." | **Use the reference line** · founder supplies |
| **P12** | Unit label of the "10,000 kg lifted" milestone (PD-3) | **Show it in the lifter's unit (display only; threshold unchanged)** · leave as is |

No implementation starts until these decisions are made. Phase 7.5 is not started.
