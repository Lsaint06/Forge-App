# Forge Paths 4.0 — curated programs

Forge Paths is moving from automatically generated workouts to **human-authored programs**. The program author writes and approves every program. The app stores, validates, recommends, schedules and tracks them. It does not invent exercises, sets, reps or progression.

> Forge recommends. The lifter decides. The program author controls the programming.

## Status

| Phase | State |
| --- | --- |
| 1. Codebase audit | Done |
| 2. Onboarding foundation | Done — experience, goal and preferred rest day |
| 3. Program data architecture | Done — schema, validation, version lock, recommendation, weekday placement |
| 4. Paths interface (recommended program + library) | Done — Train → Forge Paths |
| 5. Workout tracking integration (enrollment, session start) | Done |
| 6. Legacy generator retirement | Done (Phase 6B). All 18 programs are published and locked, the generator is removed, and existing generated Paths continue through a compatibility layer. See [PHASE_6.md](./PHASE_6.md) |

The bundled library contains 18 **published** programs, locked in `src/programs/published-lock.json`: the nine **Forge Strength V2** programs ([STRENGTH_V2.md](./STRENGTH_V2.md)) and the nine **Forge Muscle Building V3** programs ([MUSCLE_BUILDING_V3.md](./MUSCLE_BUILDING_V3.md)). Together they cover every experience × goal × 3/4/5-day combination. Forge Paths is curated-only; generated plans can no longer be created.

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

- Optional structured-progression fields — `role`, `perSide`, `rest` and `loading` on exercises, `block` and `rir` on phases, and `progressionModel` and `lowerFatigue` on the program — are described in [STRENGTH_V2.md](./STRENGTH_V2.md). When `progressionModel` is set, every exercise needs a role and rest range and every phase a block and RIR targets.
- Each phase has exactly `daysPerWeek` sessions. The weekly pattern has exactly that many `train` days.
- With `durationWeeks`, every phase has `weeks` and the weeks add up. Without it, the program has one open-ended phase.
- Every `exerciseId` must exist in the exercise catalog and be rep-based. Unknown exercises are reported, never substituted. Time-based holds such as planks are not supported yet.
- Unknown fields are rejected, which catches typos.
- **Publishing:** use `npm run programs:publish`. It's a dry run by default; `--apply` requires approval. It validates, flips `status` and records fingerprints in `src/programs/published-lock.json`. See [PHASE_6.md §4](./PHASE_6.md#4-publication-procedure). Manually: after setting `"status": "published"`, run `npm test`; the failure message prints the fingerprint to add to the lock.
- **Published versions are frozen.** Any change to a published version fails the lock check. Publish the change as a new `version` and keep the old version bundled, so enrolled lifters can still load the exact version they started.

Only the latest published version of each program is listed. Drafts are never listed or recommended.

## Recommendation and scheduling

- `recommendProgram` (`src/domain/programs/recommend.ts`) recommends only published programs whose experience and goal match the lifter's own choices. The settings weekly workout goal breaks ties, then the program with fewer days. It returns `incomplete` when experience or goal is missing, and `none` when no program matches. Nothing is generated to fill a gap.
- `trainingWeekdays` (`src/domain/programs/schedule.ts`) maps the author's weekly pattern onto weekdays. Spacing between sessions stays exactly as authored. Only the starting day rotates, so the preferred rest day falls on a rest slot. It is a suggestion; lifters can still train or reschedule on any day.

## Forge Paths screen (Phase 4)

**Train → Forge Paths** and **Today → Choose a Forge Path** open `app/forge-paths.tsx`, implemented in `src/screens/ForgePaths.tsx`.

- **Recommended for you:** shows the recommended program and why it matches. If experience or goal is missing, it asks the user to complete the profile. If no program matches, it says so; nothing is generated to fill the gap.
- **Program library:** shows every published program, with optional experience and goal filters. Users can choose any program, regardless of the recommendation.
- **Program details:** shows experience, goal, days per week, duration, equipment, description, suggested training days, progression, and every phase, session, and exercise with sets, reps, rest, and notes. Users choose a start date: Today, Tomorrow, or Next Monday.
- **Your current Path:** a lifter who already has a generated Path sees its summary. **Open your Path** continues it in the existing-Path screen. There is no Path builder.

## Enrollment and tracking (Phase 5)

Implemented in `src/data/programs.ts`, with record schemas in `src/domain/programs/enrollment.ts`.

- **Enrollment:** a `program` journal record marked `forgeProgram: 1` stores the program ID, exact version, start date, status, and suggested weekdays. The authored program is referenced, never copied or edited. Records sync and back up like other journal entries. They are kept separate from generated Path records and the ordinary calendar.
- **Replacing a plan:** starting a program asks for confirmation if another curated program or a generated Path is active. The previous plan is archived; its schedules, templates, and workouts are preserved.
- **Session order:** sessions follow the authored order. The next session is the first one not completed or skipped. Suggested dates come from the author's weekly pattern and the user's rest day. Missing a day does not mark the session missed, add makeup work, or change the program.
- **Starting a session:** Forge creates a workout from that session, copying exercises, sets, rep targets, and rest into the workout. Later program versions cannot rewrite it. The user enters working loads. The workout card shows **Program target** and the author's exercise note. Programs with a `progressionModel` (Strength V2, Muscle Building V3) also show progression advice built from the lifter's recorded sets. The generic automatic load suggestion is never used for program workouts.
- **Logging and history:** each started or skipped session gets one log record. A completed workout counts as completed. If the user deletes or discards the workout, the session returns to the queue. Users can skip a session and restore it later. Program history links to completed workouts.
- **Completion:** a fixed-length program completes after every session is done. Ending a program archives it, and all workouts remain in history. If an enrolled version is no longer bundled, history is kept and new starts are blocked.
- **Home and Train:** the **Your program** card shows the next session with **Start** or **Resume**.

Personal customization still edits only the started workout. Saved personal changes to a program are not implemented yet; the enrollment model leaves room for them without changing authored content.

## Generated Paths after Phase 6

- See [PHASE_6.md](./PHASE_6.md).
- Existing generated Paths are read and continued by a generator-free compatibility layer (`src/data/paths.ts`, `src/screens/LegacyPath.tsx`).
- No code path can create a generated plan; a test scans the app source to keep it that way.

## Known pre-existing check failures

These fail identically on the unchanged baseline and are unrelated to this work:

- ESLint `import/namespace` stack overflow while parsing `@electric-sql/pglite` from `tests/postgres.test.ts`.

Two former failures were date-dependent test fixtures, now fixed without changing any assertion:

- `program adherence cannot count one workout against multiple planned sessions` hard-coded the UTC date `1970-01-01`, which is the previous local day west of UTC. The fixture now uses the workout's local date.
- `weekly calendar navigates Monday–Sunday…` (UI) expected the Path's first session on 2026-10-19 to be upcoming ("scheduled"). Once the real date passed it, the session was correctly labelled as past. The test now pins only `Date` to 2026-10-15; timers stay real.

Future draft programs or new versions can be previewed and trained in development builds only; see [STRENGTH_V2.md §5](./STRENGTH_V2.md#5-development-preview). With every bundled program published, the preview card has nothing to show and stays hidden.
