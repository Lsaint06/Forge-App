> Historical Phase A implementation report. The current phone-only Paths rework supersedes the browser workflow below; see [Paths rework](PATHS_REWORK.md).

# Forge Paths — Phase A foundation

## Scope and implementation plan

This branch extends `feat/forge-web` (commit `c0cdb30`). It implements the approved
foundation only. It does not include rotation, adaptive progression, creator
content, trends or the next-cycle engine from Phases B–E.

1. Reuse the existing exercise catalog, prescriptions, SQLite repository,
   transactional template/calendar creation, workout logger, backup validation,
   account/outbox protocol, shared controls and theme.
2. Add six goal-specific discovery cards and a three-step personalization flow:
   experience/availability/dates, equipment/exclusions, then movement restrictions,
   notes/priorities/style. A deterministic generator creates a preview that can
   be edited before explicit acceptance.
3. Persist the accepted plan as existing `program`, `schedule` and template
   records. No new tables, schema changes, dependency or backend migration are
   necessary. Existing history and the seven starter programs remain intact.
4. Link each scheduled session to the workout explicitly started from it. Derive
   progress from those links; never infer completion from a matching date or
   template, elapsed time, a repeated workout, or a skip.
5. Provide dashboard, timeline, upcoming workout, week-by-week schedule, template
   editing, pause/resume, rescheduling, skip/restore and explicit Path replacement.
   Home, Train and Progress link to the same saved Path.
6. Keep browser adapters, startup/build scripts, account security and native
   app identifiers intact. Exercise the existing browser workflow as well as
   the new Path workflow, and export all supported platforms.
7. Validate generation constraints, goal differences, schedule/calendar behavior,
   phase boundaries, persistence, data safety, protocol transport and real UI
   interactions. Report device/live-cloud limits separately.

## Goal-specific rules

| Path              | Availability                | Main work and priorities                                                                                                                           |
| ----------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start Strong      | 1–3 days                    | Full body, two sets, manageable repetition targets, simple exercise preferences                                                                    |
| Build Muscle      | 2–6 days                    | Moderate reps; full body, upper/lower or push/pull/legs; compound and isolation work                                                               |
| Get Strong        | 2–4 days                    | Lower reps, longer rest, stable foundational free-weight choices, fewer default accessories                                                        |
| Lean & Strong     | 2–4 days                    | Moderate-volume resistance work, higher reps, core emphasis; optional walking described, not invented fat-loss results                             |
| Athlete Mode      | 2–4 days                    | Controlled lower-rep movement practice, unilateral legs, posterior chain and mandatory trunk work; no invented ballistic/conditioning prescription |
| Advanced Physique | 3–6 days, experienced users | More main sets and targeted isolation work, higher accessory reps, shoulder/arm emphasis                                                           |

Beginner plans allow at most three weekly sessions. Plans include rest-aware
weekday spacing, conservative session set limits and an estimated time budget.
If required movement coverage cannot fit, generation fails with an actionable
explanation rather than silently removing a movement or exceeding availability.
Free-weight/machine preferences rank eligible choices; equipment, experience and
exclusions always win. User priorities add suitable accessories when time allows.
They do not guarantee that every requested accessory will fit.

The movement menu references existing exercise IDs and adds explicit equipment
requirements such as a bench, rack and band anchor. It does not assume every
exercise labeled Bodyweight can be performed without apparatus. A balanced
pulling slot requires appropriate equipment; a completely unequipped setup may
be rejected. Limitations notes are stored, not interpreted as a medical
assessment. Users must select movement/exercise exclusions to affect generation.

## Data contract and future phase evolution

The marker `forgePath: 1` identifies versioned Path program/session journal data.
Other legacy records retain their original validation and behavior.

Program metadata contains engine version, Path key, accepted preferences, ordered
day identities/roles/offsets, start date, lifecycle state and accumulated pause
days. JSON fields are validated and fit the existing journal scalar payload.
The two phases are explicit:

- Foundation: weeks 1–4, with an ordered list of template references.
- Evolution: weeks 5–8, with a different ordered list of template references.

Phase A creates separate template identities for the two phases with identical
accepted prescriptions. Each calendar entry retains its own identity, logical
week/day, phase, template reference, workout link and skip flag. Phase B can
modify selected Evolution prescriptions/references for unstarted sessions without
recreating the program, changing Foundation templates or modifying logged sets.
There is no rotation engine or automatic week-five mutation in this release.

Editing a training day from Paths updates both phases consistently for future
starts. Workout exercises/sets are snapshots made by the existing logger, so
neither completed nor active workout records are rewritten by template edits.

Local plan acceptance and replacement are atomic SQLite transactions. Existing
version-1 JSON backups include the new records through their existing journal
and template fields. Malformed versioned metadata is rejected before import
clears local data. No existing records are transformed on startup.

## Scheduling and completion rules

- Late sessions can be started explicitly or rescheduled to today/a future date.
  Rescheduling preserves the session identity, logical week/phase and workout
  relationship, and rejects pending-date collisions and adjacent overlapping work.
- Pausing freezes the displayed program week. Resuming moves unresolved sessions
  dated on/after the pause date forward by the paused calendar-day count. Earlier
  missed entries, completed workouts and an active session retain their dates.
- Skips are explicit and reversible; they never count as completion. Moving a
  skipped session restores it. Missed status is derived from dates, not persisted
  as a false completion flag.
- An unrelated active workout blocks starting a new scheduled one. It is never
  silently attached. Re-entering the same active session resumes it.
- Only unique completed workout links with matching template ownership count.
  Removed workouts no longer count. Duplicate associations cannot inflate totals.
- Missing calendar rows do not shrink the completion denominator. A full cycle
  means all expected sessions actually have completed links, not that eight
  calendar weeks elapsed. There is no automatic next cycle.
- Replacing a Path explicitly archives the previous metadata/calendar and keeps
  every workout and template. Archived plans are reviewable and cannot start new
  sessions. Legacy programs continue using their existing schedule/adherence logic.

## Files and integration points

- `src/domain/paths/model.ts`: preferences, versioned metadata, phases and dates.
- `src/domain/paths/catalog.ts`: six goal definitions and equipment-aware menu.
- `src/domain/paths/generator.ts`: deterministic planning, preview validation,
  compatible manual choices and eight-week scheduling.
- `src/data/paths.ts`: existing-record persistence, identity/progress and controls.
- `src/domain/validation.ts`: validate marked Path records on write/import/sync.
- `app/paths.tsx`, `src/screens/Paths.tsx`: discovery through saved dashboard.
- `src/components/PathSummary.tsx`: shared active-Path summary.
- Home/Train/Progress, stack navigation and template calendar: entry points and
  guarded starts; existing workflows and the browser-specific adapters remain.
- New domain, native UI and browser tests extend the existing checks.

## Cloud compatibility and limits

Path records use existing `journal`, `template` and `workout` transport kinds and
continue through the durable outbox/revision/conflict machinery. A test verifies
upload/download of phase metadata and a completed session link against the
existing protocol with real SQLite repositories. No new record kind or SQL
migration is introduced. This is protocol compatibility, not live Supabase
verification. Failed/partial downloads can leave missing references: starts
validate them and fail clearly rather than creating incomplete workouts.

The existing cloud protocol does not make the whole program an atomic multi-record
cloud transaction. Simultaneous Path creation on multiple devices may need manual
conflict review. Favorites/settings remain local-only as before.

## Running and verification

Fetch and switch to `feat/forge-paths-foundation` to try Paths. The older browser
guide names `feat/forge-web`; stay on the Paths branch for this feature. Use the
existing commands:

```sh
npm ci
npx expo start --go  # phone
npm run web         # separate terminal for Windows/browser preview
npm test
npm run test:ui
npm run typecheck
npm run lint
npm run format:check
npm run export
npm run test:web     # exports/serves the browser app and uses disposable storage
```

The browser needs its local preview server for an initial load/reload; this is
not a service worker/PWA. Loaded screens, planning and logging do not require a
network API. Native app records remain offline in SQLite. Physical iOS/Android,
screen-reader/large-text and live Supabase testing require separate acceptance;
successful exports and browser automation do not establish those results.

## Results from this implementation

| Check | Result |
| --- | --- |
| `npm test` | 66 passed, zero failures/skips |
| `npm run test:ui` | 14 passed across six suites |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings |
| `npm run format:check`, `git diff --check` | Passed |
| `npm run test:web` | Both real Chromium workflows passed, including browser export/startup |
| `npm run export` | iOS and Android Hermes exports passed |
| Layout inspection | Browser views at desktop and 390px width inspected; dashboard scroll reset verified |
| Physical devices / live Supabase | Not run |

The Path browser flow covers exercise/movement exclusions, preview cancellation,
confirmed acceptance, reload persistence, a linked completed workout, pause/resume,
skip and reschedule. Scheduling controls work with network access disabled after
the app loads. The original browser workout/backup flow also still passes.

Domain tests cover distinct prescriptions even with identical availability,
beginner/advanced limits, actual equipment prerequisites, deterministic generation,
eight-week dates, independently editable phase references, skip/missed/completion
semantics, pause/resume, rescheduling and recovery spacing, active-workout guards,
transaction rollback, preserved workout snapshots, backups, disk reopening offline,
and existing-protocol synchronization. Native UI tests cover confirmed acceptance
and imperial inputs saved in canonical kilograms.
