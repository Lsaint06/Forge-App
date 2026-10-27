# Phase 7.4G — Final Progress REFORGE verification

**Status:** verified and approved by the founder (26 October 2026). The physical-iPhone checks in §7 are **pending**: none has been run on a device yet.
**Branch:** `feat/forge-paths-foundation`, after 7.4F (`80d2593`).
**Date:** 26 October 2026.
**Scope:** quality assurance, performance and targeted fixes only. No redesign and no new features.

**Baseline:**

- the Phase 7.0 architecture (§4.4, §6.9, §10, §13);
- the 7.4A audit and decisions P1–P12 ([PHASE_7_4A_REFORGE_PROGRESS_AUDIT.md](PHASE_7_4A_REFORGE_PROGRESS_AUDIT.md));
- the approved reference ([progress-approved-2026-10-24.png](../redesign/reforge/references/progress-approved-2026-10-24.png));
- the 7.4B–F implementation (`d797590`, `caefb89`, `f349267`, `6237874`, `80d2593`).

## 1. Verified functionality

**Calculation and data integrity.** Since the last pre-7.4 commit (`4bfa311`), the only change to existing calculation or data code is in `src/domain/metrics.ts`. It is the 7.4F split: `milestoneList()` lists every milestone, and `achievements()` is exactly its earned ones. Thresholds and names are unchanged, and the outputs are pinned by `tests/progress-milestones.test.ts` and the existing `domain.test.ts`.

Everything else Phase 7.4 added to `src/domain` is new presentation code under `src/domain/presentation/` (bodyweight change, record highlight, milestone names, goal order), each with its own tests. `src/data`, `src/cloud`, persistence and sync are untouched. The original Progress logic suites pass unchanged: `progress-consistency` (13), `progress-data` (8) and `progress-strength` (11).

| Feature | Verified by (automated) |
| --- | --- |
| Range switching 4W / 12W / 1Y / All; weekly and monthly buckets | `progress-reforge` (labels, default 12W, filtering, buckets per range), `progress-cards`, `progress-analytics` |
| Bodyweight: range points, start, change, %, units, sparse and empty states, All = every weigh-in | `progress-bodyweight.test.ts` (4), `progress-cards` (bodyweight tests), `measurements` (variants share a series) |
| Training volume / Workouts toggle, load vs workouts vs sets, kg / lb | `progress-cards` (bar sum = 1,700 kg and 4 sets; monthly; pounds; empty ranges) |
| PR highlight: choice, tie order, gain over the beaten best, kg / lb, empty | `progress-records-highlight.test.ts` (5, checked against the unchanged `exerciseRecords`), `progress-analytics` |
| All-time stats: workouts, total volume (= Training volume over All), time | `progress-analytics` |
| Strength: default exercise, picker, Est. 1RM / Heaviest set, comparisons, details link | `progress.test` (unchanged assertions), `progress-charts` |
| Consistency against plans (100% on plan, planned outlines) | `progress.test` |
| Records card and Records screen: categories, units, workout and exercise navigation, empty state | `progress.test`, `progress-analytics`, `progress-milestones` (UI) |
| Milestones: earned, not yet earned, thresholds (10 workouts, 10,000 kg), PD-3 pounds, empty | `progress-milestones` (logic and UI) |
| Next goals: Goals' own evaluation, Home's order, bars only with a real ratio, empty state | `progress-milestones` (logic and UI) |
| Muscle sets (Show all / Show fewer), training time, measurements (PD-2) | `progress-analytics`, `progress-cards` |
| Secondary navigation: History, Calendar, Measurements, Nutrition (today), Recovery, Goals, Records, exercise and workout reviews | `progress-milestones` (More), `progress.test`, `progress-reforge` |
| Caching: lifetime totals (PD-1) and goal evaluation (PD-4) | `progress-reforge` |
| Exercise detail chart and Goals' unchanged chart | `progress-charts`, `exercise-detail`, `goals` |

## 2. Visual fidelity

Every section of the approved reference is present in REFORGE form, in the reference's order:

1. Brand header and streak
2. Title block with date and plan week
3. Range segments
4. Bodyweight
5. Training volume with Volume / Workouts
6. PR highlight beside All-time stats
7. Milestones
8. Next goals

The existing analytics follow as compact REFORGE cards.

**Departures by decision:**

| Departure | Decision |
| --- | --- |
| No notification bell | D14 |
| No 7D range or daily bars | P2 |
| 12 weeks by default | P3 |
| No volume "vs last period" percentage | P1 |
| Ember glow and trophy, no plate image | P6 |
| No invented milestone types; no goal ring among the milestone tiles (Next goals carries goal progress) | P7 |

**Design rules checked in code:**

- 16 pt margins and 12 pt card gaps (`ForgeScreen`).
- Ember used for data, selection and gains: line, bars, change, PR gain, earned milestones, goal bars.
- Neutral colours for context. Bodyweight changes are ember in either direction, never green or red.
- Only the frame's sheen and the PR glow use gradients.

**Not verifiable here:** exact pixel fidelity. There is no simulator, and the browser preview is retired. It is part of the founder's device review (§7).

## 3. Accessibility

- **Interactive elements:** every `Pressable` in Progress, its sections, the Records screen and the REFORGE charts has an accessibility role and label (audited).
- **Charts:**
  - stay "adjustable": swipe up or down moves the selection, and the spoken value carries the point's value and date;
  - axis labels and dates are hidden from screen readers, because every value is in the spoken value.
- **Spoken labels, unchanged from Phase 5 and pinned by tests:** "Workouts: 3", "On plan: 100%, 3 of 3 sessions", "Records: 2", "Latest: …", and each record row's "…. Review workout".
- **Touch targets:** 44 pt or more for range and toggle segments, More rows and Records rows (tested).
- **Large text and small screens:**
  - the PR highlight / All-time pair stacks with large text or below 352 pt of content;
  - stat strips drop to two columns, then one;
  - milestone tiles go to one per row at more than 1.5× text;
  - chart axis text is capped at 1.5× so the plot keeps its room;
  - an extremes test renders a 1,010,100 kg history at 320 pt with 2× text.
- **Light mode:** tested for the header, charts (light ember), PR gain, bodyweight change, milestone tiles and stat labels.
- **Still needs the device:** reading order with real VoiceOver, swipe gestures on charts, the Dynamic Type accessibility sizes (AX1–AX5) and bold text.

## 4. Performance

Fixture: 5 exercises × 4 sets per workout, 150 measurements and 3 goals.

**Per-render work** (Node, desktop):

| Work | 200 workouts | 400 workouts | When it runs |
| --- | --- | --- | --- |
| `progressModel` | 10.2 ms | 21.0 ms | Once per data change (memoised) |
| Lifetime `summary` | 28.3 ms | 59.2 ms | Once per data change and day (PD-1, 7.4B) |
| `consistencyInput` | 0.6 ms | 1.4 ms | Once per data change and day |
| **Goal sources + evaluation** | **10.2 ms** | **17.9 ms** | **Was every render; now once per data change, day and unit (PD-4)** |
| Measurement series, latest record, milestones | ≤ 0.7 ms | ≤ 0.6 ms | Every render |
| Consistency and volume buckets for a range | 0.2–0.3 ms | 0.2–0.3 ms | Every range change |

**Rendering the full screen** (jest; the old 7.4F screen and the 7.4G screen in the same harness):

| History | Version | Median range tap | Worst range tap | Volume / Workouts toggle | Workout-set reads per tap |
| --- | --- | --- | --- | --- | --- |
| 200 workouts | 7.4F | 60 ms | 80 ms | 5 ms | 0 |
| 200 workouts | **7.4G** | **43 ms** | 66 ms | 3 ms | 0 |
| 400 workouts | 7.4F | 74 ms | 110 ms | 12 ms | 0 |
| 400 workouts | **7.4G** | **48 ms** | 90 ms | 4 ms | 0 |

**Mount time:** 126–202 ms in the harness; the first run of a session includes JIT warm-up.

Desktop and jest figures are relative. Phone timings need the device check (§7). No repeated calculations remain on interactions: range taps, toggles and selection read no workout sets and re-evaluate no goals (tested).

## 5. Splash-screen tests: root cause

**Symptom (7.4E):** four splash tests failed once while the iOS and Android exports were running at the same time. On their own they passed; one isolated run had one failure.

**Root cause:** wall-clock test timeouts. It is not a timer, isolation or app defect.

- The five full-intro tests step the whole ~2.5 s animation frame by frame on the JS animation driver, under fake timers. They take **4.0–4.4 s each** on an idle machine (measured with `--json`), against jest's **5 s default timeout**. CPU contention pushes them over.
- **Reproduced:** with a tighter 3.5 s timeout, exactly these tests fail with "Exceeded timeout", never with an assertion error.
- **Ruled out:**
  - **App defect:** the splash component has no real-clock dependency (no `Date.now`, `performance.now` or `requestAnimationFrame` of its own; its one `setTimeout` is on the fake clock).
  - **Test isolation:** fake timers are installed and removed per test, and spies are restored.

**Fix:** one line, `jest.setTimeout(20000)` for the splash suite, with the reason written beside it. All assertions and the fake animation clock are unchanged.

**Verified:** 19 / 19 twice with an iOS and Android export running alongside (slowest test 4.1 s), and 19 / 19 in every full suite.

## 6. Defects fixed in 7.4G

| # | Defect | Severity | Fix |
| --- | --- | --- | --- |
| PD-4 | Next goals (added in 7.4F) re-read and re-evaluated every goal's sources on every render: about 18 ms per render at 400 workouts on desktop | Medium (performance) | Memoised by data revision, day and units, as PD-1 did for lifetime totals. Range tap 74 → 48 ms; toggle 12 → 4 ms (400 workouts). Regression test in `progress-reforge` |
| T-1 | Splash suite timed out under CPU load | Low (test infrastructure) | Explicit 20 s suite timeout (§5) |
| C-1 | `AchievementCard` in `src/components/design.tsx` unused since 7.4F | Clean-up | Removed. It had no production or test references |

No other defects were found. Changes in 7.4G:

- `src/screens/Progress.tsx`: the PD-4 memo;
- `src/components/design.tsx`: `AchievementCard` removed;
- `tests/ui/splash.test.tsx`: the timeout;
- `tests/ui/progress-reforge.test.tsx`: the PD-4 test;
- `tests/ui/progress-analytics.test.tsx`: the extremes test;
- this report.

## 7. Remaining device-only checks (founder iPhone, Expo Go)

1. **Fidelity:** side by side with the reference, dark and light.
2. **Ranges:** switching feels immediate with your real history. If you have a long one, note any visible delay.
3. **Charts:**
   - tap and drag to select;
   - the callout stays inside the card at both ends;
   - long gaps in body measurements stay unjoined;
   - VoiceOver swipe up and down moves points and reads value and date.
4. **Dynamic Type:** AX sizes and bold text; the PR / All-time pair stacks; nothing is cut off.
5. **Smallest screen** (if available): iPhone SE / mini width.
6. **Navigation:**
   - every More row, Records rows (workout review), Your bests (exercise), the PR highlight (exercise), the All-time header (History) and Next goals (Goals);
   - Back from each returns to Progress.
7. **Data:**
   - log, edit and delete a workout and a weigh-in, then return: the totals, highlight, milestones and goals update;
   - switch kg / lb in You.
8. **Android:** not tested on a device. It belongs to the launch-readiness phase (N-H3).

## 8. Deferred launch-readiness concerns

- EAS release build, TestFlight and an Android physical device (N-H3, launch readiness).
- Release-build performance: Hermes bytecode with production React is faster than Expo Go's development build; it should be measured then.
- Two pre-existing items carried forward:
  - the unused `Repo` lint warning in `templates-wp3.test.tsx`;
  - the unused catalogue constants (N-H2).
- Cloud sync runs from the Account screen (`app/account.tsx`). Both a sync and a conflict resolution call `touch()`, which bumps `revision`, so the memoised Progress figures refresh after a sync. (Corrected during the Phase 7.5 audit: an earlier search missed top-level `app/*.tsx` files.) Any future automatic or background sync must do the same.
- History, You and Goals keep their earlier styling until Phase 7.5. So does the Goals trend chart (P5).

## 9. Readiness for Phase 7.5

| Check | Result |
| --- | --- |
| TypeScript, Prettier | Pass |
| ESLint | 0 errors, 1 pre-existing warning |
| Logic tests | **499 / 499** |
| UI tests | **52 suites, 499 / 499**, 0 failures |
| Food library | Reproducible: 3,730 foods, `2d95151e…6d6001` |
| Branded catalogue | Byte-identical: 404,982 products, 395,354 barcodes, `5c8a5788…a727` |
| iOS / Android export | Pass: 8,045,986 B / 8,035,501 B |

**Assessment:** Progress REFORGE is complete and verified. All automated checks pass, and every finding is fixed or deferred by decision. Only the device checks in §7 remain. I recommend approving 7.4G and proceeding to Phase 7.5 (You) after the founder's iPhone review.
