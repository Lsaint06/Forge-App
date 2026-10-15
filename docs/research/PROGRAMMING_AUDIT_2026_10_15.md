# Forge Path programming audit — October 15, 2026

This is a code and prescription audit against the research already reviewed in this repository, not a new clinical trial or proof of universally optimal training. The [source review](TRAINING_RESEARCH_REVIEW.md) and [continuing research](CONTINUING_RESEARCH.md) distinguish research evidence from athlete anecdotes and coaching judgments. No additional sources were newly reviewed for this implementation.

## Confirmed problems and corrections

- Generic role fallback could replace a shoulder press with a lateral raise, a knee-flexion hamstring curl with another hinge, and side-delt work with rear-delt work. Planner 3 restricts jobs by movement pattern and reviewed exercise selection. Unavailable jobs are omitted; exclusions are never reversed.
- Some compound slots could select an isolation exercise while retaining compound-oriented prescriptions. Sets, reps and rest now account for the selected exercise's actual job.
- The three-day muscle-building layout had uneven direct arm work and little explicit trunk work. Its sessions now deliberately distribute chest/back, knee-dominant/hinge/curl, shoulder, arm, calf and trunk work across the week. Starter and athletic defaults also gained targeted core/calf/shoulder work within their existing session allowances.
- Reporting only one broad primary muscle hid co-targeted glute work and supporting arm/delt work. Reviewed direct and supporting targets are now reported separately. A squat set may directly target quads and glutes, but it counts once in total workout sets. Supporting work is not converted into a supposedly exact fraction or efficiency percentage.
- The optional workout load recommendation used the profile's global rep range, which can conflict with a Path's five-rep strength prescription. Linked Path workouts now use explicit manual progression guidance rather than that unrelated automatic suggestion. Immutable rep-target snapshots would be needed for a future automatic Path progression engine.
- The selected Path displayed all sessions and long explanations at once. It now presents one session, its Start/Resume action and an ordered prescription list. Coaching explanations, rationale, coverage, editing and schedule management remain available on request.

## Evidence guiding the choices

IUSCA 2021 (doi:10.47206/ijsc.v1i1.81) and ACSM 2026 (doi:10.1249/MSS.0000000000003897) support deliberate volume, exercise order, practice and sufficient rest, while leaving substantial uncertainty about an individual's exact optimum. Pelland et al. (doi:10.1007/s40279-025-02344-w) supports considering indirect work and diminishing returns; it does not validate one universal set target. The reviewed proximity-to-failure work (doi:10.1007/s40279-024-02069-2) supports effort guidance without establishing one exact RIR for everyone.

The exercise-specific curl, calf, triceps and squat/extension comparisons in Continuing Research, Update 8, motivate complementary selections. They do not make any movement mandatory, and most sampled populations do not establish elite-bodybuilder prescriptions. Three working sets can be appropriate; the number alone does not establish whether a session is effective. The design retains consistent exercise selections throughout the eight weeks so performance can be compared.

## Generated default review

These are actual Planner 3 outputs using all listed equipment, balanced style, no exclusions, each Path's default frequency/duration, Beginner for Start Strong and Advanced for the other review cases. They are example starting prescriptions, not individualized dose findings. Shorter availability, experience, preferences and exclusions can change these outputs.

| Path              | Working sets per session | Weekly working sets | Chest direct | Back direct | Quads direct | Hamstrings direct | Calves direct |
| ----------------- | ------------------------ | ------------------- | ------------ | ----------- | ------------ | ----------------- | ------------- |
| START STRONG      | 10, 10, 10               | 30                  | 6            | 6           | 6            | 6                 | 2             |
| BUILD MUSCLE      | 20, 14, 20, 14           | 68                  | 12           | 12          | 10           | 10                | 4             |
| GET STRONG        | 14, 14, 14               | 42                  | 8            | 6           | 10           | 8                 | 2             |
| LEAN & STRONG     | 16, 15, 16               | 47                  | 9            | 9           | 9            | 8                 | 2             |
| ATHLETE MODE      | 18, 16, 18               | 52                  | 9            | 9           | 9            | 9                 | 6             |
| ADVANCED PHYSIQUE | 26, 20, 17, 17, 20       | 100                 | 15           | 15          | 14           | 14                | 6             |

All six default review cases have planned direct or supporting work for the twelve reviewed major groups: chest, back, quads, hamstrings, glutes, front/side/rear delts, biceps, triceps, calves and core. This is a coverage check, not proof that each receives its maximum possible stimulus. Different goals deliberately allocate different workloads. Not every frequency/equipment/exclusion combination can provide the same coverage; constraints remain visible in optional plan details.

### Why the default splits differ

- **Start Strong:** repeat a small foundation, with rotating core, calf and side-delt practice. Compound assistance trains arms and other shoulder regions. The thirty-minute allowance limits extensive isolation work.
- **Build Muscle:** complementary presses and pulls, quad/hinge/curl work, and direct shoulder, arm, calf and core work. Availability determines full body, upper/lower or a distributed muscle-group split.
- **Get Strong:** two priority compound lifts, lower-volume assistance, longer main-lift rest and retained lift practice. It is not a bodybuilding-volume contest.
- **Lean & Strong:** challenging resistance work with controlled volume and trunk work. Recomposition still depends on energy intake, recovery and adherence; short rests are not a fat-loss mechanism.
- **Athlete Mode:** loadable unilateral legs, hinge strength, trunk control and supporting calf/shoulder work. This remains a general athletic foundation, not a sport-specific power or conditioning prescription.
- **Advanced Physique:** additional complementary isolation work distributed over more sessions, without increasing every compound exercise to four sets. Selected priorities reallocate a fixed set budget.

## Prescription trace

The following ordered lists are generated examples. They are provided for review in the repository, not displayed as an essay in the app. Users choose their starting loads and can deliberately customize their accepted plan.

### START STRONG

**Learn your foundations**

Goblet Squat 2 × 10 (75s rest); Dumbbell Bench Press 2 × 10 (75s rest); Seated Cable Row 2 × 10 (75s rest); Dumbbell Romanian Deadlift 2 × 10 (75s rest); Dead Bug 2 × 8 (75s rest).

**Build movement confidence**

Dumbbell Split Squat 2 × 10 (75s rest); Dumbbell Bench Press 2 × 10 (75s rest); Seated Cable Row 2 × 10 (75s rest); Dumbbell Romanian Deadlift 2 × 10 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest).

**Practice & progress**

Goblet Squat 2 × 10 (75s rest); Dumbbell Bench Press 2 × 10 (75s rest); Seated Cable Row 2 × 10 (75s rest); Dumbbell Romanian Deadlift 2 × 10 (75s rest); Dumbbell Lateral Raise 2 × 12 (75s rest).

### BUILD MUSCLE

**Upper body · chest & back**

Barbell Bench Press 3 × 8 (120s rest); Seated Cable Row 3 × 8 (120s rest); Lat Pulldown 3 × 8 (120s rest); Incline Dumbbell Bench Press 3 × 8 (120s rest); Dumbbell Lateral Raise 2 × 12 (75s rest); Bent-Over Reverse Fly 2 × 12 (75s rest); Dumbbell Curl 2 × 12 (75s rest); Overhead Cable Triceps Extension 2 × 12 (75s rest).

**Legs · quad focus**

Back Squat 3 × 8 (120s rest); Romanian Deadlift 3 × 8 (120s rest); Leg Extension 2 × 12 (75s rest); Seated Leg Curl 2 × 12 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest); Dead Bug 2 × 8 (75s rest).

**Upper body · angles & detail**

Incline Dumbbell Bench Press 3 × 8 (120s rest); Lat Pulldown 3 × 8 (120s rest); Seated Cable Row 3 × 8 (120s rest); Barbell Bench Press 3 × 8 (120s rest); Dumbbell Lateral Raise 2 × 12 (75s rest); Bent-Over Reverse Fly 2 × 12 (75s rest); Dumbbell Curl 2 × 12 (75s rest); Overhead Cable Triceps Extension 2 × 12 (75s rest).

**Legs · posterior focus**

Romanian Deadlift 3 × 8 (120s rest); Dumbbell Split Squat 3 × 8 (120s rest); Seated Leg Curl 2 × 12 (75s rest); Leg Extension 2 × 12 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest); Dead Bug 2 × 8 (75s rest).

### GET STRONG

**Squat & press strength**

Back Squat 4 × 5 (180s rest); Barbell Bench Press 4 × 5 (180s rest); Seated Cable Row 2 × 8 (120s rest); Romanian Deadlift 2 × 8 (120s rest); Dead Bug 2 × 8 (75s rest).

**Hinge & overhead strength**

Romanian Deadlift 4 × 5 (180s rest); Overhead Press 4 × 5 (180s rest); Seated Cable Row 2 × 8 (120s rest); Dumbbell Split Squat 2 × 8 (120s rest); Dumbbell Calf Raise 2 × 12 (75s rest).

**Press & squat practice**

Back Squat 4 × 5 (180s rest); Barbell Bench Press 4 × 5 (180s rest); Seated Cable Row 2 × 8 (120s rest); Romanian Deadlift 2 × 8 (120s rest); Dead Bug 2 × 8 (75s rest).

### LEAN & STRONG

**Full body · strength retention**

Back Squat 3 × 8 (120s rest); Barbell Bench Press 3 × 8 (120s rest); Seated Cable Row 3 × 8 (120s rest); Romanian Deadlift 3 × 8 (120s rest); Dead Bug 2 × 8 (75s rest); Dumbbell Lateral Raise 2 × 12 (75s rest).

**Full body · balanced resistance**

Dumbbell Split Squat 3 × 8 (120s rest); Incline Dumbbell Bench Press 3 × 8 (120s rest); Lat Pulldown 3 × 8 (120s rest); Seated Leg Curl 2 × 12 (75s rest); Dead Bug 2 × 8 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest).

**Full body · repeat quality**

Back Squat 3 × 8 (120s rest); Barbell Bench Press 3 × 8 (120s rest); Seated Cable Row 3 × 8 (120s rest); Romanian Deadlift 3 × 8 (120s rest); Dead Bug 2 × 8 (75s rest); Dumbbell Lateral Raise 2 × 12 (75s rest).

### ATHLETE MODE

**Single-leg strength & control**

Dumbbell Split Squat 3 × 6 (120s rest); Romanian Deadlift 3 × 6 (120s rest); Seated Cable Row 3 × 6 (120s rest); Barbell Bench Press 3 × 6 (120s rest); Bird Dog 2 × 8 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest); Dumbbell Lateral Raise 2 × 12 (75s rest).

**Posterior chain & stability**

Dumbbell Split Squat 3 × 6 (120s rest); Romanian Deadlift 3 × 6 (120s rest); Lat Pulldown 3 × 6 (120s rest); Barbell Bench Press 3 × 6 (120s rest); Bird Dog 2 × 8 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest).

**Whole-body movement practice**

Dumbbell Split Squat 3 × 6 (120s rest); Romanian Deadlift 3 × 6 (120s rest); Seated Cable Row 3 × 6 (120s rest); Barbell Bench Press 3 × 6 (120s rest); Bird Dog 2 × 8 (75s rest); Dumbbell Calf Raise 2 × 12 (75s rest); Dumbbell Lateral Raise 2 × 12 (75s rest).

### ADVANCED PHYSIQUE

**Upper body · chest & back**

Barbell Bench Press 4 × 8 (120s rest); Seated Cable Row 4 × 8 (120s rest); Lat Pulldown 3 × 8 (120s rest); Incline Dumbbell Bench Press 3 × 8 (120s rest); Dumbbell Lateral Raise 3 × 12 (75s rest); Bent-Over Reverse Fly 3 × 12 (75s rest); Dumbbell Curl 3 × 12 (75s rest); Overhead Cable Triceps Extension 3 × 12 (75s rest).

**Legs · quad focus**

Back Squat 4 × 8 (120s rest); Romanian Deadlift 4 × 8 (120s rest); Leg Extension 3 × 12 (75s rest); Seated Leg Curl 3 × 12 (75s rest); Dumbbell Calf Raise 3 × 12 (75s rest); Dead Bug 3 × 8 (75s rest).

**Chest, shoulders & triceps**

Barbell Bench Press 4 × 8 (120s rest); Incline Dumbbell Bench Press 4 × 8 (120s rest); Overhead Press 3 × 8 (120s rest); Dumbbell Lateral Raise 3 × 12 (75s rest); Overhead Cable Triceps Extension 3 × 12 (75s rest).

**Back, rear delts & biceps**

Seated Cable Row 4 × 8 (120s rest); Lat Pulldown 4 × 8 (120s rest); Bent-Over Reverse Fly 3 × 12 (75s rest); Dumbbell Curl 3 × 12 (75s rest); Dead Bug 3 × 8 (75s rest).

**Legs · posterior focus**

Romanian Deadlift 4 × 8 (120s rest); Dumbbell Split Squat 4 × 8 (120s rest); Seated Leg Curl 3 × 12 (75s rest); Leg Extension 3 × 12 (75s rest); Dumbbell Calf Raise 3 × 12 (75s rest); Dead Bug 3 × 8 (75s rest).

## Compatibility and verification limits

New programs use programming version 3. Version 1 and 2 validation remains available for saved programs; no logged workout is rewritten. Foundation and Evolution keep independent references and identical accepted exercise selections in this phase. No exercise rotation engine or automatic Path progression engine is introduced.

Regression tests cover reviewed exercise purposes, co-target/support counting, default major-muscle coverage, non-equivalent substitutions, exercise-specific prescriptions, all advertised frequencies, exclusions, saved earlier programs, snapshots and backups. Native UI tests cover one primary Start action, hidden explanations/alternatives, optional details/management, and rescheduling beyond week eight. Software tests verify these behaviors; they do not measure muscle growth, user adherence or individual recovery. Physical-device layout and training outcomes still require real-world evaluation.

Verification for this revision: 79 domain/data tests and 21 native UI tests passed. The final wording refinement also passed all 16 targeted programming/Path review tests. TypeScript, ESLint, source formatting, and final iOS/Android Hermes exports passed. Physical-device visual acceptance remains outstanding.
