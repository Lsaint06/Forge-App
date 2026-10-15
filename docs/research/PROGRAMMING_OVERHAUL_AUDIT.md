# Forge programming overhaul — Phase 1 audit

Date: 2026-10-15. Branch: `feat/forge-paths-foundation`. Baseline commit: `58a5f2a`.

This audit precedes implementation. It documents the **verified** behaviour of the
current workout-programming system, the confirmed deficiencies, the affected code
paths, and the proposed architecture. It distinguishes confirmed bugs from design
limitations and from optional enhancements. It does not claim scientific certainty
about optimal training doses.

## A. Workout-generation pathways (as they actually exist)

All Forge workout programming is **deterministic and rule-based**. There is no
language model in any generation path. "Intelligence" means typed, testable pure
functions over an exercise catalogue.

| Pathway | Code | Role |
| --- | --- | --- |
| Planner 3 (active) | [`src/domain/paths/generator.ts`](../../src/domain/paths/generator.ts) `generatePath` → `engineVersion: 3` | Generates every new Forge Path. |
| Planner 2 (legacy) | [`src/domain/paths/versionTwoGenerator.ts`](../../src/domain/paths/versionTwoGenerator.ts) | Retained only to validate saved v2 plans. |
| Planner 1 (legacy) | [`src/domain/paths/legacyGenerator.ts`](../../src/domain/paths/legacyGenerator.ts) | Retained only to validate saved v1 plans; also **hosts the shared `estimatedMinutes`**. |
| Version dispatch | `validateDraft` (generator.ts) switches on `engineVersion` | Keeps older saved plans loadable/editable. |
| Setup / preview / accept | [`src/screens/Paths.tsx`](../../src/screens/Paths.tsx) | Collects preferences, previews, accepts. |
| Substitution / manual edit | `slotMovements`, `compatibleMovements`, `PathDayEditor` | Re-validated through `validateDraft`. |
| Persistence | [`src/data/paths.ts`](../../src/data/paths.ts) `acceptPath` | Draft → templates + scheduled sessions; Foundation (wk 1–4) and Evolution (wk 5–8). |
| Weekly review | [`src/domain/paths/review.ts`](../../src/domain/paths/review.ts) `workloadReview` | Direct/assistance set counts, coverage warnings (descriptive only). |
| Muscle stimulus model | [`src/domain/paths/stimulus.ts`](../../src/domain/paths/stimulus.ts) | Per-exercise direct/assistance targets; no double counting. |

Shared logic: `catalog.ts` (paths + movement menu), `model.ts` (schemas, equipment,
calendar maths), `stimulus.ts`, `review.ts`, `calendar.ts`. Individual/freestyle
workouts and the fixed starter programs are **separate** from Path generation and are
out of scope except where they share `estimatedMinutes`.

## B. Confirmed deficiencies

**D1 — Session duration is a ceiling, never a target (highest priority).**
`generatePath` builds a fixed per-goal template, then only *rejects* it when the
estimate exceeds the requested minutes (generator.ts, throw at the
`estimatedMinutes(exercises) > p.duration` check) and the priority redistribution
step only guards against exceeding the limit. Nothing ever uses the *remaining* time.
Consequence: a 90-minute request yields the same ~45–60 minute session as a 75-minute
request. This is encoded as intended behaviour today in
`tests/paths-rework.test.ts` ("short duration requests…"), which asserts the 90-minute
and 75-minute plans are byte-for-byte identical. That assertion must be replaced.

**D2 — The duration model is crude and partly wrong.**
The single shared estimator ([`estimatedMinutes`](../../src/domain/paths/legacyGenerator.ts), ~line 42):

```
ceil( 5 + items.length + Σ sets × (40 + rest) / 60 )
```

Problems: (a) bills rest after the **final** set of every exercise; (b) a flat 40 s per
set regardless of rep count, tempo, or whether it is a heavy triple or a 20-rep calf
set; (c) no general warm-up, no ramp-up sets for heavy compounds, no inter-exercise
transition/setup time; (d) returns one integer presented to users as authoritative.

**D3 — No uncertainty.** Users see "X min" with no range, implying false precision.

**D4 — Goal differentiation is shallow on time/volume.** Rep/rest/set choices differ by
goal (good), but *session construction* is identical across goals: every goal simply
stops at the ceiling. A 90-minute strength session and a 90-minute hypertrophy session
are built by the same "fill to the template, then stop" rule.

**D5 — Weekly reasoning is descriptive, not constructive.** `workloadReview` already
computes weekly direct vs assistance sets correctly (no double counting) and surfaces
coverage gaps, but nothing feeds those numbers back into construction to bound volume
or distribute added work.

**D6 — Progression is static for Paths (by deliberate design).** Linked Path workouts
use manual `trainingGuidance` text; the profile's global double-progression is
intentionally disabled for Paths to avoid rep-range conflicts (documented in the prior
audit). There is no data-driven, per-exercise progression yet. This is an enhancement
opportunity, not a bug.

Pre-existing unrelated failure (not introduced here): `tests/analytics.test.ts`
"program adherence…" is timezone-dependent — it compares schedule dates against
`localDate(now)` using a UTC-based reference, so it fails in UTC-7 and passes on CI.

## C. Proposed architecture

1. **`src/domain/paths/duration.ts` — a real, pure, catalogue-aware estimator.**
   Returns a range `{ low, expected, high }` minutes from defensible components:
   general warm-up (once, only when the session warrants it), ramp-up sets for heavy
   compounds (not isolation), working-set execution derived from reps × per-rep tempo,
   inter-set rest counted `(sets − 1)` times, and per-transition setup between distinct
   pieces of equipment. No invented filler warm-up/cooldown. A backward-compatible
   `estimatedMinutes()` wrapper returns the rounded `expected` so existing callers and
   the three generators keep working while we migrate.

2. **Duration-aware construction (Planner 4).** After building the goal-appropriate
   base template, approach the target within **goal-specific weekly and per-session
   volume caps**: add sets to under-stimulated priority muscles or add a complementary
   accessory slot, stopping inside a documented tolerance band or when a cap is reached.
   If the productive session is shorter than requested, keep it and report the honest
   estimate; if the request cannot be met without junk volume, explain rather than pad.
   New plans use `engineVersion: 4`; v1–v3 `validateDraft` paths are preserved so saved
   plans still load and edit (additive schema change only).

3. **Goal strategies** (Phase 3) and **weekly volume bounds** (Phase 4) plug into the
   same construction loop so logic is shared, not special-cased per Path.

4. **Validation** (Phase 8): a scenario suite covering the 18 mandatory cases plus
   invariants (duration accuracy, no double-counted sets, exclusions respected,
   backward compatibility of saved plans).

### Definition of "done" for this effort
Duration estimates come from real components; construction uses duration as a genuine
constraint; goals differ meaningfully; weekly volume and recovery bound the plan;
exclusions and saved plans remain respected; tests cover programming quality, not just
"a workout was produced".
