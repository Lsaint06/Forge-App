# Forge Strength V2 — curated Strength programs

Nine human-authored Strength programs (B-S3 … A-S5) built on the Forge Paths 4.0 curated-program architecture ([CURATED_PROGRAMS.md](./CURATED_PROGRAMS.md)). The authored tables are the source of truth. They are kept verbatim in [`tests/fixtures/forge-strength-v2-tables.md`](../tests/fixtures/forge-strength-v2-tables.md), and `npm test` proves every bundled program matches them.

**Status: draft.** All nine are bundled and validated but never listed or recommended. Phase 6 (generator retirement) is untouched.

| Code | File (`src/programs/library/`) | Sessions × exercises | Length |
| --- | --- | --- | --- |
| B-S3 | `forge-strength-beginner-3-day.json` | 3 × 5 | Open-ended |
| B-S4 | `forge-strength-beginner-4-day.json` | 4 × 5 | Open-ended |
| B-S5 | `forge-strength-beginner-5-day.json` | 5 × 5 | Open-ended |
| I-S3 | `forge-strength-intermediate-3-day.json` | 3 × 6 | 8 weeks |
| I-S4 | `forge-strength-intermediate-4-day.json` | 4 × 6 | 8 weeks |
| I-S5 | `forge-strength-intermediate-5-day.json` | 5 × 6 | 8 weeks |
| A-S3 | `forge-strength-advanced-3-day.json` | 3 × 7 | 8 weeks |
| A-S4 | `forge-strength-advanced-4-day.json` | 4 × 7 | 8 weeks |
| A-S5 | `forge-strength-advanced-5-day.json` | 5 × 7 | 8 weeks |

## 1. Exercise catalog mapping (approved)

Of the 49 distinct prescribed names, 35 match a catalog entry exactly, 6 differ only in spelling or wording, and 8 needed an approved decision:

| Prescribed name | Catalog ID | Instruction shown in the workout |
| --- | --- | --- |
| Hip Thrust | `barbell-hip-thrust` | — |
| Cable Triceps Pushdown | `triceps-rope-pushdown` | — |
| Chest-Supported Row | `chest-supported-dumbbell-row` | — |
| Paused Back Squat | `paused-squat` (barbell, squat pattern) | Paused barbell back squat. |
| Pull-Up / Assisted Pull-Up | `pull-up` | Use assistance as needed. |
| Weighted Pull-Up | `pull-up` | Add external load when appropriate. |
| Weighted Chin-Up | `chin-up` | Add external load. |
| Supported Split Squat | `dumbbell-split-squat` | Hold a stable support for balance; dumbbells optional. |

Spelling or wording only: Trap-Bar Deadlift → `trap-bar-deadlift`, Barbell Back Squat → `back-squat`, Standing Barbell Overhead Press and Barbell Overhead Press → `overhead-press`, Dumbbell Biceps Curl → `dumbbell-curl`, Barbell Row → `barbell-bent-over-row`.

The full table lives in `approvedMapping` in [`tests/strength-v2-source.ts`](../tests/strength-v2-source.ts).

## 2. Schema extension (additive)

All new fields are optional, so earlier programs, fixtures, enrollments and session logs stay valid.

| Level | Field | Meaning |
| --- | --- | --- |
| Exercise | `role` | `primary` · `secondary` · `accessory`, explicit per entry |
| Exercise | `perSide` | Sets and reps are per side |
| Exercise | `rest` | `{ min, max }` rest guidance in seconds; `restSeconds` (timer default) must fall inside it |
| Exercise | `loading` | `bodyweight-or-assisted` · `added-load` — logged load is not plain external resistance |
| Phase | `block` | `standard` · `accumulation` · `lower-fatigue` · `intensification` · `assessment` |
| Phase | `rir` | Target RIR range per role |
| Phase | `setReduction` | Default working-set reduction when a session in this phase starts (the Week 8 assessment) |
| Program | `progressionModel` | `double-progression` · `structured` · `autoregulated`; requires roles, rest, blocks and RIR everywhere |
| Program | `lowerFatigue` | `{ setReduction, rir }` for the planned lower-fatigue week and any lifter-chosen lower-fatigue session |
| Session log | `lowerFatigue` | That session was started as a lower-fatigue session |

The authored sessions repeat unchanged in every phase. Set reductions (lower-fatigue sessions and the Week 8 default) are applied when a session starts, never written into the program.

## 3. Approved rules applied

- **Patterns:** 3 days T-R-T-R-T-R-R · 4 days T-T-R-T-T-R-R · 5 days T-T-T-R-T-T-R. Forge rotates them to keep the preferred rest day free.
- **Roles** (explicit per session entry):
  - Primary: the lifts a session prioritises: back squat, bench press, conventional deadlift, goblet squat and trap-bar deadlift. The barbell overhead press is primary when the session name prioritises pressing or upper-body strength ("Deadlift + Upper Strength", "Deadlift + Press"); today that is I-S3 Day 2.
  - Secondary: paused, close-grip, front and high-bar variations; the barbell overhead press elsewhere; major compound pulls (rows, pull-ups, chin-ups, pulldowns); barbell Romanian deadlift; and the approved supporting compounds: leg press, dumbbell Romanian deadlift, hip thrust, supported split squat, hack squat, machine and dumbbell shoulder presses, incline dumbbell bench press and machine chest press.
  - Accessory: isolation and trunk work.
- **Rest:** primary 3–5 min · secondary 2–3 min · accessory 1–2 min. The timer starts at the lower bound.
- **RIR (primary / secondary / accessory):**

| Level | Weeks 1–3 | Week 4 | Weeks 5–7 | Week 8 |
| --- | --- | --- | --- | --- |
| Beginner (ongoing) | 2–3 / 2–3 / 2–3 | — | — | — |
| Intermediate | 2–3 / 3 / 2–3 | 3–4 / 3–4 / 3–4 | 1–2 / 3 / 1–3 | 1–3 / 3 / 2–3 |
| Advanced | 2–3 / 3–4 / 2–3 | 3–4 / 3–4 / 3–4 | 1–2 / 2–3 / 1–3 | 1–3 / 2–3 / 2–3 |

- **Set reductions:** working sets × (1 − reduction), rounded, minimum one set per exercise.
  - **Lower-fatigue sessions (0.35):** 4 → 3, 3 → 2, 2 → 1, at 3–4 RIR. Week 4 of Intermediate and Advanced programs defaults to one. The lifter can train it normally, or choose a lower-fatigue session in any week, including Beginner programs, where it is optional and never scheduled.
  - **Week 8 assessment (0.3):** 4 → 3, 3 → 2, 2 → 1, at the assessment RIR. It's a submaximal performance check: no load increase, no maximal attempts and no 1RM test.
  - Both are configurable: `lowerFatigue.setReduction` on the program, `setReduction` on the phase.
- Listed sets are working sets; warm-ups are separate. No maximal attempts are required.

## 4. Progression engine and workout logging

[`programProgression`](../src/domain/programs/progression.ts) is pure and deterministic. [`programExerciseAdvice`](../src/data/programs.ts) feeds it from existing logging only, so nothing new is stored on sets:

- **History:** this enrollment's earlier **completed** sessions of the **same session slot** (for example I-S3 Day 1), newest first. Heavy and lighter practice days never feed each other.
- **What counts:** working sets only. Warm-up, drop and failure sets are excluded.
- **Effort:** logged RIR, or 10 − RPE. A set without effort data never counts as meeting the target, and RIR is never inferred from reps.
- **Excluded evidence:** lower-fatigue and assessment sessions are not evidence for load changes, so week 5 builds on week 3.

| Action | When | Load |
| --- | --- | --- |
| `establish` | No earlier session | Lifter chooses at the target RIR |
| `increase` | Every working set at the top of the range, effort logged, and no set harder than the target. **Advanced only:** also when every set was easier than the target range | Last load + `profile.increment` |
| `hold` | Building reps; effort missing; effort harder than target; or one session that missed reps or sets | Last load; reducing is allowed |
| `reduce` | Two consecutive sessions at the same load missed the prescribed work | About 10% less, rounded down to the increment |
| `lower-fatigue` | Lower-fatigue session | Last full-session load, no increase |
| `assess` | Week 8 | Last earned load, adjusted by readiness; never increased |
| `manual` | `loading` is set (pull-ups and chin-ups), or the last load was 0 | No suggestion |
| `review` | Working-set loads differed | No suggestion |

A **stall** (two sessions at the same load without added reps) is shown as a suggestion to consider a lower-fatigue session. Nothing is applied automatically, and exercises never change on elapsed time.

Curated workouts no longer compute the generic `targetProgression` / `overload` suggestions. Programs without a `progressionModel` keep their previous behavior: the author's text only, with no load suggestion.

**UI:**
- The workout card shows the program target (sets × reps, per side, RIR, rest range) and the exercise note even when collapsed.
- When expanded, it shows the advice with **Apply suggested load**.
- Forge Paths previews show role, per-side, rest guidance and per-phase RIR. The next-session card offers **Standard / Lower-fatigue session** and notes the Week 8 reduction.

## 5. Development preview

In development builds (`npm start` / Expo Go, where `__DEV__` is true), Forge Paths shows a **DEVELOPMENT BUILD ONLY** card below the program library. **Preview draft programs** lists the drafts and opens them in the normal program details. From there you can start one and train it through the normal enrollment, session and workout flow; it's labelled **DRAFT PREVIEW**.

Production bundles compile `__DEV__` to false ([`src/programs/preview.ts`](../src/programs/preview.ts)). There, drafts are never listed, recommended, enrolled or resolved. A draft enrollment created on a development build shows as "not available in this app version", and its history is kept.

## 6. Known limitations and future work

1. **Pull-up assistance tracking (future work).** Set `weight` must be zero or more, so the logger cannot distinguish assisted, bodyweight and weighted pull-ups or chin-ups. The safeguard stays: those slots (`loading`) get no load recommendation.
   - Generic "Previous" history for `pull-up` and `chin-up` mixes the variants.
   - Reliable tracking needs a separate assistance value on sets, with a schema, local database and cloud sync migration. That is deliberately not part of Strength V2.
2. **Per-side logging.** Per-side prescriptions are labelled per side. The logger creates one row per prescribed set; lifters log both sides within it or add sets with `side`.
3. **The B-S5 "Lower + Squat Practice" day** contains no squat. It is implemented exactly as authored, as approved.
