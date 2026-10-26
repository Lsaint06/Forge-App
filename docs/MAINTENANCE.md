# FORGE maintenance issues

Known problems outside the current phase's scope, recorded so they are not lost. Each entry says what fails, why, and the proposed fix. Nothing here changes production behaviour until it is scheduled and approved.

## M-1 · Date-dependent Progress UI tests fail on Mondays

**Recorded:** 2026-10-26 (Phase 7.3B finalisation) · **Severity:** test-only; no production impact · **Status:** open

**Fails:**

- `tests/ui/progress.test.tsx` → *several weeks of history: overview, ranges, exercise choice, comparisons and records* (line 174: `Exercise: Back Squat. Change exercise` not found)
- `tests/ui/progress.test.tsx` → *Records lists recent records and every exercise's bests* (line 298: `Heaviest 117.5 kg × 5 · Est. 1RM …` not found)

**Cause:** the shared `history()` fixture logs each week's Tuesday session (bench, plus back squat every other week) only when that Tuesday is on or before today: `if (addDays(monday, 1) <= today)`.

- On a **Monday**, the current week's Tuesday is still ahead, so the week-0 session is not logged.
- That session holds the latest bench (117.5 kg) and a back-squat session.
- The two assertions expect it, so they fail every Monday and pass on other days.

**Evidence:** the failures reproduce on the committed code `31d43a9` with all Phase 7.3B work stashed. They are not a regression. Both passed on Sunday 2026-10-25.

**Proposed fix (test-only):** anchor the fixture to a fixed reference date instead of the real clock, or log week 0 on the most recent Tuesday on or before today. Progress production logic needs no change.
