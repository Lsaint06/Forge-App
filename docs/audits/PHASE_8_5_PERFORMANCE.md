# Phase 8.5 M2: Performance profiling and targeted optimization

Branch `feat/phase8-5-forge-hardening`. Baseline: `d057730` (after M4). Main engineering only: no dependency, schema, sync, design or Engineer #2 file changes.

**Verification level.** Measured in Jest on a Windows desktop CPU, with `node:sqlite` and the React test renderer. These are not phone timings: use them to compare before with after. Query counts don't depend on the computer. On a phone every query is a synchronous call into SQLite on the JavaScript thread (`expo-sqlite` `getAllSync`), so fewer queries means less time the interface can't respond. **No device, Release-build or memory measurement was possible here** (section 6).

## 1. Method

- **Tool:** `scripts/perf/history.perf.tsx`, outside the test suites. Run it with:
  ```
  npx jest --testMatch "**/scripts/perf/*.perf.tsx" --runInBand
  ```
  `PERF_WEEKS` (default `0,52,156`) sets the histories; `PERF_OUT` saves JSON.
- **Seeded lifter:**
  - four sessions a week, six exercises of four sets (24 lifts in rotation);
  - four food entries a day, a weekly weigh-in, a check-in every other day;
  - goals for strength, bodyweight, workouts a week and volume;
  - nothing waiting to sync.
- **Sizes:** one year is 208 workouts, 4,992 sets and 1,694 journal entries; three years is 624 workouts, 14,976 sets and 5,074 entries.
- **Measured for each tab, History and the logger:**
  - opening it (median of three);
  - drawing it again after a saved change, which is what every save does to the screen on display (median of five; the logger's median of 40 saves).
- **Seen before:** background tabs no longer redraw on saves (`TabFreeze`, Phase 7.6), so this phase measured the screen on display.

## 2. Before and after: three years of training

| Screen                          | Before: ms · queries | After: ms · queries |
| ------------------------------- | -------------------- | ------------------- |
| **Logger, each saved set**      | 164 · 1,964          | **50 · 92**         |
| Home, open                      | 191 · 5,190          | 44 · 43             |
| Home, after a change            | 178 · 5,190          | 43 · 43             |
| Train, open                     | 139 · 4,390          | 21 · 8              |
| Nutrition, open                 | 173 · 4,390          | 30 · 8              |
| Nutrition, after logging a food | 189 · 4,390          | 24 · 8              |
| Progress, open                  | 288 · 5,207          | 118 · 46            |
| You, open                       | 176 · 5,175          | 23 · 14             |
| Goal evaluation (four goals)    | 31 · 785             | 5 · 6               |
| History, open (unchanged)       | 97 · 482             | 97 · 482            |

- **One year of training:** the logger went from 89 ms and 716 queries to 53 ms and 92; Home from 84 ms and 1,758 queries to 28 ms and 43.
- **Query counts no longer grow with history** on any tab or in the logger. With no history at all the logger costs the same as before: 40 interleaved samples each, median 46 ms before and after.
- **Extreme case:** six rows of the same exercise in every session for a year. Each saved set cost 504 ms before and 55 ms after.

## 3. What was slow, and why

| #   | Where                   | Cause                                                                                                                                                                                                                                                                                                                             | User impact                                                                                                         |
| --- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| B1  | Workout logger          | Each exercise card read its exercise's whole history twice: once for the previous values, once for the load suggestion. `history()` issued one query per past session, and every saved set (each keystroke in a weight, since 8.3C-3) redraws every card.                                                                         | Logging got slower the longer someone trained: about 2,000 queries per saved set after three years.                 |
| B2  | Home, Train, Nutrition  | `summary()` totalled lifetime volume by reading every finished workout's sets, about seven queries per workout. Train and Nutrition show only the streak, and Home only the streak and this week.                                                                                                                                  | Every redraw of the screen on display, including each food logged on Nutrition.                                     |
| B3  | You                     | The same, for the completed count and streak (once per change).                                                                                                                                                                                                                                                                   | Opening You after any change.                                                                                       |
| B4  | Progress                | Lifetime volume read each workout separately, and the model read every completed set again.                                                                                                                                                                                                                                       | Opening Progress after any change.                                                                                  |
| B5  | Goals (Home, You, Progress) | A strength goal read every finished workout's exercise rows, one query per workout. Calories per day were totalled from every food entry even without a nutrition goal.                                                                                                                                                      | Every Home redraw.                                                                                                  |

## 4. Changes

Each one returns exactly what the code before it returned: the same reads in the same order, and sums in the same order (floating point unchanged).

- **`history()` and `exerciseHistory()` (`src/data/repository.ts`)**
  - The rows query is unchanged; all their sets are then read in one query and grouped in the same order: two queries in all.
  - A session whose rows have no sets still appears, as before.
  - Optional `limit`: only the newest sessions' sets are read.
- **Exercise card (`WorkoutExerciseCard.tsx`)**
  - Reads the three newest sessions. The workout being reviewed can be one of them, so the previous values are always among them.
  - The suggestion (`overload`) reads the first two sessions with completed working sets. When the newest three don't hold two, the card reads the whole history, as before (`overloadDecided` in `metrics.ts`).
- **`trainingStreak()` and `trainingWeek()` (`src/domain/metrics.ts`)**
  - `summary()` is now built from these two, so every tab shows the same figures.
  - Home uses the streak and this week, so it reads only this week's sets. Train and Nutrition use the streak, and You the count and streak: no sets at all.
- **Progress**
  - Reads every completed set once per change and shares the read between the model and the lifetime totals (`setsByWorkout`).
- **Goal sources (`src/data/goal-sources.ts`)**
  - A strength goal's lifts come from that exercise's history: two queries.
  - Calories per day are totalled only when a nutrition goal asks.

## 5. Tests

- **`tests/ui/render-cost.test.tsx` (new, 6 tests):**
  - opening Home, Train, Nutrition, Progress and You, and drawing them again after a change, read the same number of queries with three times the history;
  - so does the logger, per saved set;
  - **against the old code all six fail** (for example Home 89 → 196 queries, the logger 88 → 150).
- **`tests/repository.test.ts`:**
  - `history()` matches each row's own sets, newest first, including an empty session and a session with the exercise twice;
  - it leaves out the workout in progress;
  - `limit` returns the newest sessions;
  - it costs two reads with 2 or 12 sessions.
- **`tests/ui/workout-logger.test.tsx`:**
  - the suggestion still reaches past three newest sessions that hold only warm-ups (102.5 kg);
  - **removing the fallback makes it fail.**
- **Unchanged and passing:**
  - cross-tab consistency (Home, Progress, History and You agree on counts, streak and volume, `cross-tab.test.tsx`);
  - Progress, goals and the logger suites;
  - all logic and UI tests.

## 6. Remaining opportunities and what wasn't measured

**Measured, not changed (lower impact):**

- **History screen:** about eight queries per row, 482 for a 60-row page. Bounded by the page and unchanged since 7.4.
- **Volume goals:** each workout in the goal's window is read separately, about seven queries per workout. A volume goal set months ago costs hundreds of queries per Home redraw. Reading every set at once isn't cheaper for short windows, so it was left as it is.
- **Food log:** Home's today and the Nutrition tab parse every food entry, about 8 ms of 3 years on desktop. A date-limited read would change the order of entries logged in the same millisecond (Copy to today), and so the order calories are summed.
- **Startup:** every start re-inserts the 367 catalogue exercises (`INSERT OR IGNORE`): 374 statements, 2–4 ms on desktop. Phone cost unmeasured.
- **Progress:** still reads every completed set once per change, about 15,000 rows after three years (~110 ms on desktop).
- **Program workouts:** each card reads all workouts and the schedule several times (`programExerciseAdvice`). Not measured with a long program history.

**Not measured, because it needs a native build on a device:**

- cold start and splash to Home;
- frame times and dropped frames while scrolling or typing;
- memory;
- Release-build (Hermes) speed;
- tab and sheet animation smoothness.

For these, use the Hermes or React DevTools profiler on a FORGE Dev build, Xcode Instruments (Time Profiler, Allocations) on the iPhone, and Android Studio's profiler once an Android build exists. Compare Release builds with Release builds.
