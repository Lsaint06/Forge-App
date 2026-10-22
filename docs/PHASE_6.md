# Phase 6 — Curated-only Forge Paths and generator retirement

**Status: prepared and awaiting publication approval.** Every non-destructive step is done. The generator is still bundled because the 18 curated programs are drafts: deleting it now would leave production users without a way to start a training plan. Publication and generator deletion happen together, after explicit approval (see [Activation](#5-activation-checklist)).

## 1. Generator dependency inventory

### DELETE — creates or reshapes generated plans; removed at activation

| Component | Role |
| --- | --- |
| `src/domain/paths/generator.ts` | Current workout generator (engine 9), validation, Evolution derivation, scheduling of new plans |
| `src/domain/paths/legacyGenerator.ts` | Engine 1 generator |
| `src/domain/paths/versionTwoGenerator.ts` | Engine 2–7 generator |
| `src/domain/paths/catalog.ts` | Generator Path definitions (START STRONG …) and movement menu |
| `src/domain/paths/policy.ts`, `balance.ts`, `volume.ts`, `stimulus.ts` | Prescription policy, weekly balance, volume targets, exercise-purpose text used by the generator |
| `src/domain/paths/programQuality.ts`, `review.ts`, `weekAudit.ts` | Plan scoring, workload review, week audits for generated plans |
| `src/data/pathBuilder.ts` | `acceptPath`, `editPathDay`, `savedDraft`, `workloadGuidance`. `acceptPath` already refuses once curated programs are active |
| `src/screens/Paths.tsx` | Path builder (discover, setup, preview), rebuild, plan editing and the old generator-coupled dashboard |
| `src/components/PathPlanEditor.tsx`, `PathWorkoutList.tsx` | Builder day editor, plan preview and stimulus list |
| `src/programs/activation.ts` and the `builderAvailable` branch in `src/screens/ForgePaths.tsx` | Transition switch; unnecessary once the builder is gone |
| `tests/path-fixture.ts` → `pathPreferences` | Generator input helper (`pathRepository` stays) |

**Tests deleted with the generator:** these only exercise retired generation behavior.

- `tests/balanced-weeks.test.ts`
- `tests/path-programming-review.test.ts`
- `tests/paths-rework.test.ts`
- `tests/paths-v3.test.ts`
- `tests/programming-engine.test.ts`
- `tests/weekly-session-balance.test.ts`

**Tests to convert, not delete.** These files mix generator tests with shared or compatibility coverage. Before deletion, move the shared tests to the legacy fixture or to plain templates:

- `tests/rep-ranges.test.ts`: keep the `targetProgression` and rep-label tests ("range progression …", "repeated missed targets …", "rep labels …").
- `tests/paths.test.ts`: keep the session-link, reschedule, pause/resume, backup round-trip, disk reopen and malformed-metadata tests, built on `legacyUserRepository()`. Most are already mirrored in `tests/phase6.test.ts`.
- `tests/ui/paths.test.tsx`: keep the template editor, workout card, compact logging and "Path workouts progress against the Path's prescribed rep target" tests, using legacy-fixture workouts.
- `tests/ui/forge-paths.test.tsx`: no generator use remains.

### COMPATIBILITY — kept so existing generated Paths stay readable and continuable

| Component | Role |
| --- | --- |
| `src/domain/paths/model.ts` | Stored Path and session record schemas, preferences schema, date helpers. Depends only on `zod` |
| `src/domain/paths/calendar.ts` | Calendar weeks and week focus text |
| `src/data/paths.ts` | Read Paths and sessions, summary, start a session from its saved template, skip, restore, reschedule, pause, resume, archive, calendar entry points. **No generator imports** |
| `src/screens/LegacyPath.tsx` | Generator-free dashboard for an existing Path: calendar, next workout, start or resume, skip, restore, move, pause, resume, earlier Paths read-only, and a link to Forge programs |
| `src/components/PathSummary.tsx` | Current-Path card on Home, Train, Progress and Forge Paths |
| `src/domain/validation.ts` Path record checks | Validate Path records on import and sync |
| `WorkoutExerciseCard` Path target label, `app/templates.tsx` Path link, `app/(tabs)/progress.tsx` filter, Home calendar | Display existing Path workouts and links |

### PRESERVE — shared infrastructure, untouched

Exercise catalog and custom exercises, templates, workouts and sets (including RIR and RPE), workout editing and customization, analytics and progress, journal, sync and backup, onboarding and profile, the curated program model, recommendation, scheduling, enrollment and progression engine, the development draft preview, and the splash screen.

## 2. Data strategy

- **No schema change and no data migration.** Generated Paths are ordinary journal records (`forgePath: 1`) linked to saved templates and workouts. They load exactly as before.
- Startup `migrate()` only adds missing built-in exercises (`INSERT OR IGNORE`). It's idempotent, as tested on existing-user data.
- **Nothing is converted or deleted.** Completed workouts, sets, weights, reps, RIR, RPE, dates, exercise references, templates, custom exercises, favourites and measurements are unchanged.
- **An active generated Path is never replaced automatically.** The lifter keeps training it or chooses a curated program; starting one asks for confirmation, archives the Path and preserves its history.
- **Saved Path workouts start from their stored templates and are never regenerated.** The database's foreign keys prevent a template from referencing a missing exercise; `startPathSession` also checks defensively.
- **Upgrade evidence:** `tests/fixtures/legacy-user-backup.json` is a real backup exported by the pre-Phase-6 app. It includes an archived engine-1 Path, an active engine-9 Path with completed, skipped and pending sessions, a template workout, a custom exercise, a favourite, a measurement and an onboarded profile. `tests/phase6.test.ts`, `tests/ui/legacy-path.test.tsx` and the converted sync, enrollment and Forge Paths tests restore it and verify the upgrade behavior.

## 3. Behavior of existing generated Paths

| | Before activation | After activation |
| --- | --- | --- |
| Continue an active Path (start, resume, skip, restore, move, pause, resume) | Yes | Yes (`LegacyPath`) |
| Review earlier Paths | Yes | Yes, read-only |
| Edit or rebuild a Path, or build a new one | Yes (builder) | **No** |
| Switch to a curated program | Yes, with confirmation | Yes, with confirmation |
| Workout history and logged sets | Kept | Kept |

## 4. Publication procedure

1. **Validate:** run `npm test`. This covers the authored-table fidelity for all 18 programs, catalog IDs, progression, matching, scheduling and the content fingerprints.
2. **Dry run:** `npm run programs:publish`. It validates every program, plans the `draft → published` change, computes each fingerprint, checks `checkLibrary` against the new lock, and requires exactly one published program for each of the 18 goal × experience × frequency combinations. It writes nothing.
3. **Apply, only with final approval:** `npm run programs:publish -- --apply`. It runs the full logic suite first, then changes only each program's `status` and writes the fingerprints to `src/programs/published-lock.json`. Published versions are immutable; later changes need a new version.
4. Update the draft-status expectations in `tests/strength-v2.test.ts` and `tests/muscle-v3.test.ts` to expect published, locked programs. The content fingerprints in `tests/phase6.test.ts` are status-independent and must not change.

## 5. Activation checklist

Activation is automatic once the published library covers all 18 combinations (`curatedOnly()`). At that point:

- **Forge Paths** shows only curated programs. The "Open the Path builder" button and the "Generated Paths" section disappear; a current Path appears as "Your current Path".
- **`/paths`** renders `LegacyPath` instead of the builder.
- **`acceptPath`** refuses to create a plan.

Then, in the same release:

1. Delete every **DELETE** item in §1, and simplify `app/paths.tsx` to `export { default } from "../src/screens/LegacyPath";`.
2. Convert the mixed tests listed in §1, then delete the generator-only tests.
3. Run the full verification: logic, UI, TypeScript, lint, format, and the iOS and Android exports.
4. Test on a real device before release: upgrade an existing install with a generated Path; continue, skip and move a session; switch to a curated program; and train Strength weeks 1, 4 and 8 plus a Muscle Building lower-fatigue session.

## 6. Current blockers

- Final approval to publish the 18 programs.
- Real-device validation (none performed).
- Pull-up and chin-up assistance tracking (Strength): a documented limitation, with load advice disabled.
