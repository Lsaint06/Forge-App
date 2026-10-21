# Forge Paths 4.0 — curated programs

Forge Paths is moving from automatically generated workouts to **human-authored programs**. The program author writes and approves every program. The app stores, validates, recommends, schedules and tracks them. It does not invent exercises, sets, reps or progression.

> Forge recommends. The lifter decides. The program author controls the programming.

## Status

| Phase | State |
| --- | --- |
| 1. Codebase audit | Done |
| 2. Onboarding foundation | Done — experience, goal and preferred rest day |
| 3. Program data architecture | Done — schema, validation, version lock, recommendation, weekday placement |
| 4. Paths interface (recommended program + library) | Not started |
| 5. Workout tracking integration (enrollment, session start) | Not started |
| 6. Legacy generator retirement | Not started — generator remains fully in use |

The bundled library is currently **empty**. No program has been published, so nothing is shown to users yet. The generated Paths flow and all saved generated plans are unchanged.

## Training profile

First-time setup now has a **Your training journey** step:

- **Where are you in your training journey?** Beginner / Intermediate / Advanced
- **What are you training toward?** Strength / Muscle Building
- **Which day would you prefer to rest?** Monday–Sunday

Nothing is preselected and the lifter can skip it. All three remain editable in **You → Edit profile & preferences**. Existing users are not sent back through onboarding. If anything is missing, the You tab shows an optional **Complete your training profile** prompt.

Storage compatibility:

- `restDay` is optional (`0` = Monday … `6` = Sunday), so older profiles, backups and cloud records still load.
- Older goals `Build strength` and `Build muscle` read as Strength and Muscle Building. `Improve fitness` and `Manage weight` read as **not set**. They are never reassigned automatically.
- Weekly workout frequency is no longer asked during setup. It stays in settings for the Home weekly goal. A program's own day count defines its schedule.

## Authoring a program

Programs are JSON files bundled with the app. Create the file in `src/programs/library/` and add it to `programSources` in `src/programs/index.ts`. The full schema is `curatedProgramSchema` in `src/domain/programs/model.ts`.

```jsonc
{
  "id": "example-program-id",          // lowercase-with-dashes, permanent
  "version": 1,                        // increase for every published change
  "status": "draft",                   // "draft" is never shown; "published" is
  "name": "…",
  "summary": "…",                      // one line, ≤160 characters
  "description": "…",
  "experience": "Beginner",            // Beginner | Intermediate | Advanced
  "goal": "Strength",                  // Strength | Muscle Building
  "daysPerWeek": 3,                    // 3 | 4 | 5
  "durationWeeks": 8,                  // optional; omit for an open-ended program
  "equipment": ["Barbell", "Bench"],
  "weeklyPattern": ["train","rest","train","rest","train","rest","rest"],
  "progression": "How the lifter should progress — written by the author.",
  "phases": [
    {
      "name": "…",
      "weeks": 8,                      // required when durationWeeks is set
      "sessions": [
        {
          "id": "day-a",
          "name": "…",
          "exercises": [
            {
              "exerciseId": "barbell-bench-press", // must exist in the catalog
              "sets": 3,
              "reps": { "min": 6, "max": 8 },      // equal min/max = fixed reps
              "restSeconds": 120,
              "notes": "Optional coaching note"
            }
          ]
        }
      ]
    }
  ]
}
```

Rules enforced by `npm test`:

- Each phase has exactly `daysPerWeek` sessions. The weekly pattern has exactly that many `train` days.
- With `durationWeeks`, every phase has `weeks` and the weeks add up. Without it, the program has one open-ended phase.
- Every `exerciseId` must exist in the exercise catalog and be rep-based. Unknown exercises are reported, never substituted. Time-based holds such as planks are not supported yet.
- Unknown fields are rejected, which catches typos.
- **Publishing:** after setting `"status": "published"`, run `npm test`. The failure message prints the fingerprint to add to `src/programs/published-lock.json`.
- **Published versions are frozen.** Any change to a published version fails the lock check. Publish the change as a new `version` and keep the old version bundled, so enrolled lifters can still load the exact version they started.

Only the latest published version of each program is listed. Drafts are never listed or recommended.

## Recommendation and scheduling

- `recommendProgram` (`src/domain/programs/recommend.ts`) recommends only published programs whose experience and goal match the lifter's own choices. The settings weekly workout goal breaks ties, then the program with fewer days. It returns `incomplete` when experience or goal is missing, and `none` when no program matches. Nothing is generated to fill a gap.
- `trainingWeekdays` (`src/domain/programs/schedule.ts`) maps the author's weekly pattern onto weekdays. Spacing between sessions stays exactly as authored. Only the starting day rotates, so the preferred rest day falls on a rest slot. It is a suggestion; lifters can still train or reschedule on any day.

## Transition plan for later phases

- **Enrollment (Phase 5):** store a separate record with the program ID, version, start date and personal schedule changes. The authored program is never modified. Each workout keeps the existing snapshot of exercises, rest and rep targets, so later changes cannot rewrite history.
- **Missed sessions:** keep history accurate, with no makeup or punishment workouts and no prescription changes.
- **Generator and legacy Paths:** generated plans stay fully usable. Generator-only behavior—validation, Evolution re-derivation, role-based reschedule checks and workload-level suggestions—must not apply to curated programs. Creating new generated Paths stays available until the curated flow is verified. Removing generator code requires a separate migration and test review.

## Known pre-existing check failures

These fail identically on the unchanged baseline and are unrelated to this work:

- `program adherence cannot count one workout against multiple planned sessions` in `npm test`.
- `weekly calendar navigates Monday–Sunday…` in `npm run test:ui`.
- ESLint `import/namespace` stack overflow while parsing `@electric-sql/pglite` from `tests/postgres.test.ts`.
