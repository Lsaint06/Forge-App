# Forge Paths: weekly session balance audit

> **Historical — retired in Phase 6B.** The workout generator and Path builder described here were removed from the app. Forge Paths now uses 18 curated programs; existing generated Paths can still be continued. See [PHASE_6.md](../PHASE_6.md).

## Scope and evidence

Baseline: `6a7c540`, programming version 5 (the duration/volume architecture inherited from Planner 4). The focused corrections produce programming version 6; they do not replace the planner, change supported frequencies, or regenerate existing plans.

Measured **525 requests**: all 21 supported Path/frequency combinations, five duration budgets (30/45/60/75/90 minutes), and five equipment/exclusion configurations. Start Strong used beginner experience; the other Paths used intermediate experience. Configurations covered full equipment, dumbbells/bench/pull-up bar, machines, individual exercise exclusions, and movement exclusions. Complete before/after drafts and per-day metrics were retained as session audit artifacts, not added as large repository fixtures.

Each successful session was measured for exercise count, working sets, expected/range duration, movement patterns, direct/supporting/primary-target muscle exposure, compound/isolation sets, low-rep long-rest compound sets, unilateral sets, and training purpose. These are descriptive programming metrics, not measured fatigue or personalized recovery predictions.

The evidence constraints come from the existing [training research review](TRAINING_RESEARCH_REVIEW.md), [continuing research](CONTINUING_RESEARCH.md), and [programming audit](PROGRAMMING_OVERHAUL_AUDIT.md): redistribute before adding volume; do not equate assistance to another full direct set; do not infer equal fatigue from equal exercise counts; do not treat volume ceilings or available time as obligatory doses. Exact set prescriptions and diagnostic thresholds remain coaching heuristics.

## Verified causes

1. **Frequency-specific scopes explain many count differences.** The five-day hypertrophy split has broad upper, lower, focused push, focused pull, and lower sessions. An eight-exercise broad upper day and five-exercise push day are not interchangeable scopes.
2. **The Advanced Physique main-slot bonus followed position, not purpose.** At three days, the day called "back & hamstrings" gave five sets each to split squats and incline presses but only three each to pulldowns and leg curls.
3. **Fill ties favored early slots.** Later accessories and complementary movements could receive less work than the first compounds even when their inclusion was purposeful.
4. **Exclusions could promote strength assistance accidentally.** Fill classified the first two _remaining_ movements as main lifts, even if an original main lift had been omitted. Higher-rep assistance could consequently receive five sets.
5. **Goal limits were not consistently checked on edits.** The shared validator used the general 28-set limit rather than each goal's smaller session/exercise ceilings. Weekly primary-target ceilings were only allocation guards.
6. **Restrictions explain some sparse sessions.** Missing leg-curl/vertical-pull/arm equipment legitimately removes approved slots. These cases need coverage diagnostics, not unrelated replacement exercises.

There was no evidence that every eight-versus-five count difference needed additional exercises. Whole-workout totals also do not establish whether a particular person needs or can recover from that dose.

## Focused corrections

- Keep the existing movement slots, exercise choices, split, rep ranges, duration estimator, and recovery-spacing validation.
- Declare session focus roles alongside the existing session definitions.
- Reassign Advanced Physique's existing main-slot set bonuses to the declared focus when appropriate, without increasing the session's set budget. Explicit user muscle priorities take precedence.
- Within equal allocation priorities, consider the lower-set movement first instead of always favoring the earliest slot.
- Use the previous bounded allocation as an **upper weekly set budget**, never a target. If the new allocation is cheaper in time, saved minutes cannot become additional weekly volume.
- Where comparable days still have materially uneven work, move sets only between identical movements already present on both days. No exercise is inserted, removed, reordered, or moved to a new training day. Weekly direct/supporting muscle counts and recovery exposures are unchanged by this across-day stage.
- Recognize strength main work from its low-rep, long-rest prescription, not its remaining list index.
- Validate goal-specific session/exercise limits and weekly primary-target ceilings for version 6 plans, including edits. Beginner non-strength compounds use two initial sets so their base sessions also respect the existing beginner session ceiling; strength practice and Start Strong retain their goal-specific prescriptions.

The optional **Plan details -> Weekly session balance** section shows concise daily workload and scope explanations. The default workout logging UI is unchanged.

### Diagnostic policy

Compare like session purposes: full-body, upper, lower, push, pull, or focused work. A difference exceeding three working sets or ten estimated minutes prompts comparison; these are review heuristics, not biological cutoffs. Exercise count alone never triggers redistribution.

Distinct scopes receive explicit explanations. Different low-rep/long-rest or unilateral demands can explain time differences when set totals are similar. Missing planned roles receive restriction diagnostics. Direct and supporting overlap is recorded with cyclic weekday spacing; adjacent loaded direct overlap receives a recovery-review prompt, not an invented universal recovery-time prescription. Supporting exposure is never converted into equivalent full sets.

Automatic redistribution is conservative: it only operates on experienced hypertrophy Paths, protects donor focus work, must improve the comparable-day balance measure, and cannot exceed the receiving day's time/exercise/session limits.

## All supported frequencies: before and after

Full equipment, 90-minute availability. Values are in scheduled day order. Exercise counts are unchanged throughout; `->` separates before and after. Minutes are the estimator's **expected** value, not a guarantee or a requirement to occupy 90 minutes. The UI still displays its existing low-high range.

| Path              | Days/week | Exercises/day | Working sets/day, before -> after      | Expected minutes/day, before -> after  |
| ----------------- | --------- | ------------- | -------------------------------------- | -------------------------------------- |
| Start Strong      | 1         | 5             | 10 -> 10                               | 22 -> 22                               |
| Start Strong      | 2         | 5/5           | 10/10 -> 10/10                         | 22/23 -> 22/23                         |
| Start Strong      | 3         | 5/5/5         | 10/10/10 -> 10/10/10                   | 22/23/23 -> 22/23/23                   |
| Build Muscle      | 2         | 8/8           | 24/24 -> 24/24                         | 61/55 -> 59/53                         |
| Build Muscle      | 3         | 8/8/8         | 24/24/24 -> 24/24/24                   | 61/55/62 -> 59/53/58                   |
| Build Muscle      | 4         | 8/6/8/6       | 24/24/24/24 -> 24/24/24/24             | 58/56/60/55 -> 58/56/60/54             |
| Build Muscle      | 5         | 8/6/5/5/6     | 24/24/23/22/24 -> 24/24/23/22/24       | 58/56/59/51/55 -> 58/56/59/51/54       |
| Build Muscle      | 6         | 5/5/6/5/5/6   | 23/22/24/23/22/24 -> 23/22/24/23/22/24 | 59/51/56/61/51/55 -> 59/51/56/61/51/54 |
| Get Strong        | 2         | 5/5           | 19/19 -> 19/19                         | 57/56 -> 57/56                         |
| Get Strong        | 3         | 5/5/5         | 19/19/19 -> 19/19/19                   | 57/56/57 -> 57/56/57                   |
| Get Strong        | 4         | 4/4/4/4       | 16/16/16/16 -> 16/16/16/16             | 51/47/51/46 -> 51/47/51/46             |
| Lean & Strong     | 2         | 6/6           | 22/22 -> 22/22                         | 56/50 -> 56/49                         |
| Lean & Strong     | 3         | 6/6/6         | 22/22/22 -> 22/22/22                   | 56/50/56 -> 56/49/56                   |
| Lean & Strong     | 4         | 5/4/5/5       | 21/17/20/20 -> 21/17/20/20             | 54/43/47/47 -> 54/43/47/47             |
| Athlete Mode      | 2         | 7/6           | 22/22 -> 22/22                         | 52/52 -> 50/52                         |
| Athlete Mode      | 3         | 7/6/7         | 22/22/22 -> 22/22/22                   | 52/52/52 -> 50/52/50                   |
| Athlete Mode      | 4         | 5/4/5/5       | 21/17/20/20 -> 21/17/20/20             | 52/41/45/45 -> 52/41/45/45             |
| Advanced Physique | 3         | 8/8/8         | 28/28/28 -> 28/28/28                   | 68/63/69 -> 68/62/69                   |
| Advanced Physique | 4         | 8/6/8/6       | 28/26/28/26 -> 28/26/28/26             | 65/60/68/58 -> 66/60/67/58             |
| Advanced Physique | 5         | 8/6/5/5/6     | 28/26/23/22/26 -> 28/26/23/22/26       | 65/60/59/51/58 -> 66/60/59/51/58       |
| Advanced Physique | 6         | 5/5/6/5/5/6   | 23/22/26/23/22/26 -> 23/22/26/23/22/26 | 59/51/60/61/51/58 -> 59/51/60/61/51/58 |

### Why the five-day Advanced Physique differences remain

The broad upper session covers chest, both pulling directions, side/rear delts, and direct arms: **16 compound + 12 isolation sets**. Push covers a smaller scope but includes **15 compound + 8 isolation sets**. Pull contains **10 compound + 12 isolation sets**. Each lower session contains **10 compound + 16 isolation sets**, with different knee/hip emphasis.

Thus 8/6/5/5/6 exercises is intentional, not repaired to a universal count. Expected durations remain approximately 66/60/59/51/58 minutes. Strength's four-exercise upper/lower days likewise retain lower-rep work and longer rests rather than receiving hypertrophy filler.

## Weekly hypertrophy coverage

These are direct-target set exposures, including listed co-targets. A squat set can appear under both quads and glutes, but only once in the week's total working sets. **Do not sum the muscle columns to calculate weekly total sets.** Primary-target ceilings govern allocation; co-target/supporting exposures are also reported for review, not claimed to be exact equivalent doses.

| Path / frequency      | Chest    | Back     | Quads    | Hamstrings | Glutes   |
| --------------------- | -------- | -------- | -------- | ---------- | -------- |
| Build Muscle / 2      | 8 -> 7   | 8 -> 7   | 8 -> 7   | 7 -> 6     | 12 -> 10 |
| Build Muscle / 3      | 12 -> 10 | 12 -> 10 | 12 -> 10 | 11 -> 9    | 20 -> 16 |
| Build Muscle / 4      | 16 -> 16 | 16 -> 16 | 18 -> 17 | 18 -> 17   | 20 -> 18 |
| Build Muscle / 5      | 18 -> 18 | 18 -> 18 | 18 -> 17 | 18 -> 17   | 20 -> 18 |
| Build Muscle / 6      | 20 -> 20 | 20 -> 20 | 18 -> 17 | 18 -> 17   | 20 -> 18 |
| Advanced Physique / 3 | 15 -> 12 | 9 -> 12  | 15 -> 13 | 9 -> 11    | 21 -> 20 |
| Advanced Physique / 4 | 16 -> 16 | 16 -> 16 | 18 -> 18 | 18 -> 18   | 20 -> 20 |
| Advanced Physique / 5 | 18 -> 18 | 18 -> 18 | 18 -> 18 | 18 -> 18   | 20 -> 20 |
| Advanced Physique / 6 | 20 -> 20 | 20 -> 20 | 18 -> 18 | 18 -> 18   | 20 -> 20 |

Accessory pairs below are side/rear delts and biceps/triceps respectively.

| Path / frequency      | Side/rear  | Biceps/triceps | Calves | Core     |
| --------------------- | ---------- | -------------- | ------ | -------- |
| Build Muscle / 2      | 2/3 -> 3/3 | 2/2 -> 3/3     | 4 -> 5 | 4 -> 4   |
| Build Muscle / 3      | 4/3 -> 6/3 | 4/4 -> 6/6     | 6 -> 8 | 4 -> 4   |
| Build Muscle / 4      | 4/4 -> 4/4 | 4/4 -> 4/4     | 6 -> 8 | 6 -> 6   |
| Build Muscle / 5      | 6/6 -> 6/6 | 6/6 -> 6/6     | 6 -> 8 | 10 -> 10 |
| Build Muscle / 6      | 8/8 -> 8/8 | 8/8 -> 8/8     | 6 -> 8 | 14 -> 14 |
| Advanced Physique / 3 | 6/3 -> 6/3 | 6/6 -> 6/6     | 9 -> 9 | 6 -> 6   |
| Advanced Physique / 4 | 6/6 -> 6/6 | 6/6 -> 6/6     | 8 -> 8 | 8 -> 8   |
| Advanced Physique / 5 | 7/7 -> 7/7 | 7/7 -> 7/7     | 8 -> 8 | 12 -> 12 |
| Advanced Physique / 6 | 8/8 -> 8/8 | 8/8 -> 8/8     | 8 -> 8 | 16 -> 16 |

Supporting exposure changes are retained, not counted as extra full direct sets:

| Path / frequency      | Triceps  | Front delts | Biceps   | Rear delts | Back     |
| --------------------- | -------- | ----------- | -------- | ---------- | -------- |
| Build Muscle / 2      | 8 -> 7   | 8 -> 7      | 8 -> 7   | 4 -> 3     | 7 -> 6   |
| Build Muscle / 3      | 12 -> 10 | 12 -> 10    | 12 -> 10 | 8 -> 6     | 11 -> 9  |
| Build Muscle / 4      | 16 -> 16 | 16 -> 16    | 16 -> 16 | 8 -> 8     | 14 -> 13 |
| Build Muscle / 5      | 23 -> 23 | 18 -> 18    | 18 -> 18 | 9 -> 9     | 16 -> 15 |
| Build Muscle / 6      | 30 -> 30 | 20 -> 20    | 20 -> 20 | 10 -> 10   | 18 -> 17 |
| Advanced Physique / 3 | 15 -> 12 | 15 -> 12    | 9 -> 12  | 6 -> 7     | 9 -> 10  |
| Advanced Physique / 4 | 16 -> 16 | 16 -> 16    | 16 -> 16 | 8 -> 8     | 16 -> 16 |
| Advanced Physique / 5 | 23 -> 23 | 18 -> 18    | 18 -> 18 | 10 -> 9    | 17 -> 17 |
| Advanced Physique / 6 | 30 -> 30 | 20 -> 20    | 20 -> 20 | 10 -> 10   | 18 -> 18 |

The extra side-delt supporting exposure from overhead presses is unchanged: five sets for five-day and ten for six-day hypertrophy plans.

### Concrete corrections without weekly inflation

- Advanced Physique, three-day back/hamstrings session: split squat **5 -> 4**, incline press **5 -> 3**, pulldown **3 -> 5**, leg curl **3 -> 4**. All other exercises remain at three sets. Total stays **28**, while weekly chest/back exposure changes from **15/9 to 12/12** and hamstrings increase **9 -> 11** across the week.
- A controlled comparable-upper-day regression redistributes **24/16 -> 21/19** sets. The paired total remains **40**, the whole week remains **88**, every direct/supporting muscle count is identical, and no exercise or training-day exposure changes. Running it again makes no further transfers.
- Build Muscle six-day/45-minute request remains **107 -> 107** weekly sets. Reordering cheaper work does not consume spare minutes by adding volume.
- Restricted-machine strength cases lose erroneous five-set assistance allocations rather than replacing them with extra exercises.

## Validation and limitations

- **525-scenario replay:** 417 successful requests and 108 identical explanatory failures before and after; no newly rejected requests or changed error messages.
- **Zero weekly-set increases** in matched successful requests. Twenty-two requests decrease by 65 sets in aggregate, mainly because invalid assistance allocations are corrected or the new allocation cannot productively use the entire old budget.
- Exercise counts are unchanged in all measured requests. All 21 full-equipment/90-minute combinations retain their weekly total working sets.
- No successful final request violates its expected-duration budget, goal/exercise/weekly-primary ceilings, or exclusions. No remaining `review`-kind diagnostics occurred in the measured matrix; this means the configured review heuristics found none, not that training outcomes or personal recovery are proven.
- **108 relevant domain/data tests** and **41 native UI tests** pass. Checks cover supported frequencies, budgets, equipment/exclusions, strength and beginner structure, overlap, volume-neutral redistribution, edit validation, old-version compatibility, backups/sync, target snapshots, and optional review presentation. TypeScript, changed-file ESLint and formatting pass.
- iOS and Android production/Hermes exports pass. Physical-device training flows, actual session timing, recovery and physiological outcomes have not been validated.

Existing versions 1-5 retain their saved exercises and validation behavior. Version 6 applies only to newly generated or explicitly rebuilt plans. No database fields or logged targets are rewritten. This change does not add automatic periodization, medically interpreted restrictions, or a personalized fatigue/recovery model; the existing goal ceilings remain upper bounds rather than proven optimal prescriptions.
