# Forge Muscle Building V3 — curated hypertrophy programs

Nine human-authored Muscle Building programs (B-M3 … A-M5) built on the same curated-program architecture, progression engine and development preview as [Strength V2](./STRENGTH_V2.md). The authored tables are the source of truth. They are kept verbatim in [`tests/fixtures/forge-muscle-v3-tables.md`](../tests/fixtures/forge-muscle-v3-tables.md), and `npm test` proves every bundled program matches them.

**Status: draft.** All nine are bundled and validated but never listed or recommended in production. Phase 6 (generator retirement) is untouched.

| Code | ID (`src/programs/library/<id>.json`) | Split | Exercises per day | Sets per week |
| --- | --- | --- | --- | --- |
| B-M3 | `forge-muscle-beginner-3-day` | Full Body / Upper / Lower | 7 | 42 |
| B-M4 | `forge-muscle-beginner-4-day` | Upper A / Lower A / Upper B / Lower B | 6 | 48 |
| B-M5 | `forge-muscle-beginner-5-day` | Upper / Lower / Pull / Push / Lower | 5 | 50 |
| I-M3 | `forge-muscle-intermediate-3-day` | Full Body A / B / C | 7 | 51 |
| I-M4 | `forge-muscle-intermediate-4-day` | Upper A / Lower A / Upper B / Lower B | 7/6/7/6 | 65 |
| I-M5 | `forge-muscle-intermediate-5-day` | Push / Pull / Legs / Upper / Lower | 6 | 75 |
| A-M3 | `forge-muscle-advanced-3-day` | Full Body A / B / C | 7 | 59 |
| A-M4 | `forge-muscle-advanced-4-day` | Upper A / Lower A / Upper B / Lower B | 7 | 72 |
| A-M5 | `forge-muscle-advanced-5-day` | Upper / Lower / Push / Pull / Legs | 7 | 83 |

## 1. Exercise catalog mapping (approved 2026-10-22)

Of the 44 distinct prescribed names, 29 match a catalog entry exactly. The rest:

| Prescribed name | Catalog ID | Basis |
| --- | --- | --- |
| Flat Dumbbell Bench Press | `dumbbell-bench-press` | Name only |
| Flat Machine Chest Press | `machine-chest-press` | Name only (the incline version is a separate ID) |
| Shoulder Press Machine | `machine-shoulder-press` | Name only |
| Hip Thrust Machine | `machine-hip-thrust` | Name only. Machine, not barbell, hip thrust |
| Incline Smith Machine Press | `smith-machine-incline-press` | Name only |
| Cable Biceps Curl | `cable-curl` | Name only |
| Single-Arm Cable Pushdown | `single-arm-pushdown` | Name only (cable, unilateral) |
| Single-Arm Cable Lat Pulldown | `single-arm-lat-pulldown` | Name only (cable, unilateral) |
| Chest-Supported Row | `chest-supported-dumbbell-row` | Approved for Strength V2 |
| Cable Triceps Pushdown | `triceps-rope-pushdown` | Approved for Strength V2 |
| Supported Split Squat | `dumbbell-split-squat` | Approved for Strength V2, with the support note |
| Preacher Curl | `machine-preacher-curl` | Approved choice among machine / dumbbell / barbell / cable |
| Cable Fly | `standing-cable-fly` | Approved choice |
| Supported Bulgarian Split Squat | `bulgarian-split-squat` | Approved, with the note "hold a stable support for balance" |
| Smith Machine Romanian Deadlift | `smith-machine-romanian-deadlift` | **New catalog entry** (Smith machine, hinge, hamstrings / glutes) |

The new catalog entry is a bundled data addition, not a database migration. `Repository.migrate()` inserts missing built-in exercises on every launch, so existing installs receive it. The Path generator chooses from its own movement list, so it does not start selecting this exercise. The full mapping is `approvedMapping` in [`tests/muscle-v3-source.ts`](../tests/muscle-v3-source.ts).

## 2. Scientific programming audit

This is a desk audit of the authored tables. It has not been validated on lifters or devices.

**Method:**
- **Direct sets** count toward the target muscle of each exercise.
- **Indirect sets** count at half credit for clear synergists: pressing → triceps and front delts; rows and pulldowns → biceps and rear delts; squat patterns and hinges → glutes; machine shoulder press → triceps and side delts. Half credit is a common fractional convention; real stimulus varies by exercise and lifter.
- **Days** is how many days a week the muscle receives direct work.

| Muscle | B-M3 | B-M4 | B-M5 | I-M3 | I-M4 | I-M5 | A-M3 | A-M4 | A-M5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chest | 6 · 2× | 4 · 2× | 6 · 2× | 8 · 3× | 8 · 2× | 10 · 2× | 9 · 3× | 9 · 2× | 10 · 2× |
| Back (lats / upper back) | 6 · 2× | 8 · 2× | 8 · 2× | 9 · 3× | 12 · 2× | 13 · 2× | 9 · 3× | 12 · 2× | 14 · 2× |
| Front delts | 2+2 | 2+2 | 2+2 | 0+4 | 2+4 | 2+4 | 0+4.5 | 2+4.5 | 2+4 |
| Side delts | 4+1 · 2× | 2+1 · 1× | 4+1 · 2× | 4 · 2× | 3+1 · 1× | 5+1 · 2× | 6 · 2× | 3+1 · 1× | 5+1 · 2× |
| Rear delts | 0+3 | 0+4 | 2+4 | 2+4.5 | 2+6 | 3+6.5 | 3+4.5 | 3+6 | 4+7 |
| Biceps | 2+3 · 1× | 4+4 | 4+4 | 4+4.5 | 5+6 | 7+6.5 | 4+4.5 | 5+6 | 9+7 |
| Triceps | 4+3 | 4+3 | 4+3 | 2+4 · 1× | 4+5 | 5+5 | 4+4.5 | 4+5.5 | 6+5 |
| Quads | 8 | 6 | 8 | 8 · 3× | 12 | 12 | 9 · 3× | 12 | 12 |
| Hamstrings | 4 | 8 | 6 | 7 · 3× | 9 | 8 | 9 · 3× | 10 | 9 |
| Glutes | 2+3 | 2+4 | 2+3 | 0+4.5 | 2+6 | 2+5 | 0+4.5 | 2+6 | 2+6 |
| Calves | 4 · 1× | 4 | 4 | 5 | 6 | 6 | 6 | 6 | 6 |
| Abs | 0 | 4 | 0 | 2 | 0 | 2 | 0 | 4 | 4 |

Format: direct + indirect (half credit) · days per week, where informative.

**Findings:**
- **Volume rises with experience:** 42–50 working sets a week for Beginner, 51–75 for Intermediate, 59–83 for Advanced. The highest direct count is 14 sets a week (A-M5 back), within the ranges commonly studied for hypertrophy. Studies generally show a graded dose–response with diminishing returns at higher volumes. They do not support one universally optimal set count or split, and beginners typically respond to lower volumes.
- **Frequency:** most major muscles get direct work at least twice a week. The exceptions are flagged below.
- **Chest and back balance:** close in most programs. **B-M4** is 4 direct chest sets against 8 back sets.
- **Lower body:** quads and hamstrings are well covered. Glutes get direct work (machine hip thrust) everywhere except **I-M3** and **A-M3**, which rely on RDL, hack squat and leg press.
- **Delts:** side delts get 4–6 direct sets twice a week, except the **4-day** programs (2–3 sets, once a week). Rear delts get no direct work in **B-M3** and **B-M4**.
- **Arms:** direct biceps and triceps work everywhere. **B-M3** has only 2 direct biceps sets; I-M3 has 2 direct triceps sets.
- **Calves:** 4–6 sets a week, twice a week except B-M3 (once).
- **Recovery overlap:** no muscle gets direct work on consecutive training days in any program, including across the week boundary (tested).
- **Redundancy:** the A-M5 Pull day uses three curl variations (7 sets). Reverse pec deck appears on both A-M5 Push and Pull, separated by a rest day.
- **Difficulty:** Advanced programs differ from Intermediate mainly in volume and effort targets, not exercise complexity. That's reasonable for hypertrophy, but noted.

**Concerns reviewed with the author and kept as authored (2026-10-22):**
1. B-M4 chest volume (4 direct sets). Proposed +1 set on each chest press (week 48 → 50 sets); declined.
2. 4-day side-delt volume (once a week). Proposed adding Cable Lateral Raise 2×12–15 to Upper B (+2 sets a week); declined.

No authored exercise, set, rep range or order was changed.

## 3. Program model

- **Open-ended:** one repeating phase ("Ongoing", block `standard`), no `durationWeeks` and no scheduled deloads.
- **Patterns:** 3 days T-R-T-R-T-R-R · 4 days T-T-R-T-T-R-R · 5 days T-T-T-R-T-T-R. Forge rotates them so the preferred rest day stays free.
- **Roles:** compounds are `secondary`; isolation and core work are `accessory`. `primary` is unused. Machine hip thrust counts as a compound. Roles set only rest guidance and effort targets; every exercise remains eligible for load progression.
- **Rest (starting guidance):** compounds 2–3 min (Advanced 2–4 min), isolation 1–2 min. Longer rest is always allowed.
- **RIR, all roles:** Beginner 2–3 · Intermediate 1–3 · Advanced 1–3.
- **Lower-fatigue sessions:** optional only: about 35% fewer working sets at 3–4 RIR, chosen on the next-session card. Authored sets remain the baseline.

## 4. Progression

Uses the existing engine ([`programProgression`](../src/domain/programs/progression.ts)) with no second system. Beginner and Intermediate use `double-progression`; Advanced uses `autoregulated`. History is the lifter's earlier completed sessions of the same session slot, from existing workout logging. Warm-ups are excluded.

- **Increase:** every working set reaches the top of the range, effort is logged on every set, and no set is harder than the target RIR. Then add one `profile.increment`. **Advanced only:** also when every set is clearly easier than the target range.
- **Missing RIR or RPE:** never counts as meeting the target. The load holds.
- **Harder than target** (for example 0 RIR when the target is 1–3): the load holds. Training to failure is never required.
- **One missed exposure:** hold the load. **Two consecutive misses at the same load:** about 10% less, rounded down to the increment.
- **Stall** (two sessions at the same load without added reps): flagged with a suggestion to consider a lower-fatigue session.
- **Never:** automatic set increases, time-based load increases, or history rewrites.
- **Technique:** there is no technique flag in workout logging. The approved approach is the effort gate plus guidance text ("if technique and recovery allow").

## 5. Development preview

The existing development-only preview ([STRENGTH_V2.md §5](./STRENGTH_V2.md#5-development-preview)) lists every bundled draft, so it now covers both Strength and Muscle Building. Production bundles never list, recommend, enroll or resolve drafts.

To preview: `npm start`, open the app in Expo Go → **Train → Forge Paths** → **Preview draft programs** → choose a program → **Start this program** → **Start session**.

## 6. Known limitations

1. **One load increment for every exercise.** `profile.increment` (default 2.5 kg) also applies to isolation work such as lateral raises, where smaller jumps are common. Lifters can choose a smaller load manually.
2. **No technique logging.** See §4.
3. **Desk audit only.** Volumes are estimates from exercise attribution, not measurements. Nothing has been tested on devices or lifters.
