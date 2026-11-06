# Advanced Physique regression review

Date: 2026-10-15. Branch: `feat/forge-paths-foundation`. This reviews the default
five-day Advanced Physique Path after the duration/volume overhaul (Phases 2–8),
as required by the programming brief. It is a regression check on one important
case, not a claim of a universally optimal program.

Configuration: Advanced experience, 5 days/week, 90-minute target, full gym
equipment, balanced style, no exclusions or priorities.

## Before the overhaul

The previous planner used session duration only as a ceiling and estimated time
with a crude model (flat 40 s/set, rest billed after every set, no warm-up or
transitions). The default produced roughly:

| Session | Working sets | Honest estimate |
| --- | --- | --- |
| Upper body · chest & back | 26 | ~52–67 min |
| Legs · quad focus | 20 | ~42–53 min |
| Chest, shoulders & triceps | 17 | ~39–50 min |
| Back, rear delts & biceps | 17 | ~35–44 min |
| Legs · posterior focus | 20 | ~40–51 min |

≈ 100 weekly working sets. The brief's specific complaint — a nominally
90-minute session containing only 17 sets and running ~44 minutes — is the
"Back, rear delts & biceps" day above.

## After the overhaul

Duration is now a real target, filled within goal and weekly volume caps:

| Session | Working sets | Estimate (low–high / expected) |
| --- | --- | --- |
| Upper body · chest & back | 28 | 57–73 min / 63 |
| Legs · quad focus | 26 | 53–67 min / 59 |
| Chest, shoulders & triceps | 23 | 52–66 min / 57 |
| Back, rear delts & biceps | 22 | 44–56 min / 49 |
| Legs · posterior focus | 26 | 51–65 min / 57 |

≈ 125 weekly working sets. Weekly direct sets by primary target muscle:

```
Chest 18 · Back 18 · Quads 18 · Hamstrings 18 · Core 12 · Calves 8 ·
Side delts 7 · Rear delts 7 · Biceps 7 · Triceps 7 · Front delts 5
(Glutes 20 — a co-target byproduct of squats and hinges, not dedicated volume)
```

## Why a "90-minute" session still holds ~22–28 sets, not more

This is intentional. Advanced sessions use 120–180 s rest on compounds, so each
working set consumes roughly 2.5–3.5 minutes including execution and rest. A
genuinely productive session therefore lands near **50–63 minutes at 22–28
quality sets**. Pushing every session to a literal 90 minutes would require
either junk volume (past the point of useful stimulus) or padded rest — both
counterproductive. Forge instead fills to a defensible volume cap and reports
the honest estimated range rather than labelling the workout "90 minutes".

The previously anemic "Back, rear delts & biceps" day improved from 17 sets /
~44 min to **22 sets / ~49 min** — fuller and better balanced, without being
inflated to match the nominal target.

## Whole-program assessment

- **Balance:** the five days distribute ~18 direct weekly sets each to the prime
  movers (chest, back, quads, hamstrings) with 7–12 to shoulders, arms, calves
  and core. No muscle is starved or blown out.
- **Weekly ceilings:** filling is bounded per primary muscle, so the high (5×)
  frequency does not compound a single muscle past its weekly ceiling.
- **Recovery:** adjacent-day repetition of the same demanding role is still
  rejected by the existing recovery check; filling does not change session
  spacing.
- **Honesty:** every session reports a range, and the weekly review continues to
  separate direct from supporting work without double-counting a set.

## Conclusion

The overhaul closes the gap the brief identified — sessions now use their
duration as a real constraint and the under-filled days are fuller — while
respecting goal-appropriate and weekly volume limits rather than padding time.
The remaining difference between the ~57-minute expected sessions and the
90-minute selection is reported transparently, not hidden. Physical-device and
real-world training validation remain outstanding, as elsewhere in the project.
