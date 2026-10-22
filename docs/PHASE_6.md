# Phase 6 — Curated-only Forge Paths and generator retirement

**Status: complete (Phase 6B), pending device validation before release.**

- All 18 curated programs are published and fingerprint-locked.
- The workout generator, its plan builder and every route to it are deleted.
- Existing generated Paths stay readable and can be continued through a generator-free compatibility layer.
- Phase 6A (preparation) is commit `60f52f1`.

## 1. Generator dependency inventory

### DELETE — creates or reshapes generated plans (deleted in Phase 6B)

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
| `src/programs/activation.ts` and the `builderAvailable` branch in `src/screens/ForgePaths.tsx` | Transition switch and its development preview; unnecessary once the builder is gone |
| `src/components/CuratedPreviewBanner.tsx`, the "Preview curated-only Forge Paths" button in `DraftPreview`, and the banner line in `LegacyPath.tsx` | Development preview of curated-only mode |
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

## 5. Phase 6B result

### Publication

`npm run programs:publish -- --apply` ran the full logic suite (223 of 223 passing), then:

- changed only `"status": "draft"` to `"status": "published"` in each of the 18 program files;
- recorded 18 fingerprints in `src/programs/published-lock.json`.

Tests confirm the following:

- **Lock:** the committed lock is exactly what the procedure produces from the drafts, and re-running it is a no-op.
- **Edits:** every published version validates against its fingerprint. Edits and removals are rejected.
- **Content:** each program's content fingerprint, with status normalized, is unchanged from the authored drafts, so no prescription changed.
- **Coverage:** production lists 18 programs and recommends exactly one for each experience × goal × frequency combination.

### Removed

Every **DELETE** item in §1 is gone:

- the three engines and eight generator helper modules;
- `src/data/pathBuilder.ts`, the builder screen `src/screens/Paths.tsx`, `PathPlanEditor.tsx` and `PathWorkoutList.tsx`;
- the activation switch `src/programs/activation.ts` and the curated-only development preview, whose toggle and banner had served their purpose;
- `pathPreferences` and the generator-only helpers in `src/domain/paths/model.ts`: `PathDefinition`, `defaultWeekdays`, `expandEquipment`, `hasEquipment` and `machineRequirement`.

`/paths` now always renders `LegacyPath`. Forge Paths has no builder entry point.

Deleted tests (generator-only):

- `balanced-weeks.test.ts`
- `path-programming-review.test.ts`
- `paths-rework.test.ts`
- `paths-v3.test.ts`
- `programming-engine.test.ts`
- `weekly-session-balance.test.ts`

Converted tests:

- `rep-ranges.test.ts`: kept the shared progression and label tests.
- `paths.test.ts` → `legacy-paths.test.ts`: the compatibility tests now run on a restored pre-Phase-6 Path.
- `ui/paths.test.tsx` → `ui/legacy-workouts.test.tsx`: workout card, logging, template editor, Path targets and the calendar on `LegacyPath`.

The fixture `tests/fixtures/legacy-fresh-path-backup.json` (a freshly accepted engine-9 Path) was exported before the generator was deleted.

### Guard against regression

`tests/phase6.test.ts` → "no generator code, route or entry point remains in the app":

- asserts every deleted file is absent;
- scans all of `src/` and `app/` for generator identifiers, modules and builder text;
- asserts `/paths` is `LegacyPath`, and that `src/domain/paths` holds only `model.ts` and `calendar.ts`.

### Kept on purpose

- **Generated-Path record schemas** (`src/domain/paths/model.ts`, vocabulary unchanged) and `calendar.ts`, so saved Paths still parse, sync and back up.
- **The draft-program development preview** (`src/programs/preview.ts`, `DraftPreview`). It's authoring infrastructure for future drafts and new versions. With every bundled program published, it renders nothing, and it's never available in production.
- **`scripts/publish-programs.ts`**, for publishing future programs and versions.

## 6. Before release

- **Real-device validation (not yet performed):**
  - Upgrade an install that has a generated Path and continue it (start, log, skip, restore, move, pause, resume).
  - Switch to a curated program (confirmation, archived Path, history intact).
  - Train Strength weeks 1, 4 and 8, and a Muscle Building lower-fatigue session.
- **Pull-up and chin-up assistance tracking (Strength):** a documented limitation, with load advice disabled.
