# FORGE — Fitness Tracker

A dark-first, offline fitness log for iOS and Android. Workouts, templates, measurements, nutrition and recovery live in SQLite. Guest mode requires no account, API key, food database or AI service. Dashboard statistics come from your own recorded workouts.

This branch adds **Forge Paths — Phase A**: six personalized, editable eight-week
plans with a saved dashboard, explicit workout links and flexible scheduling.
Open **Train → Forge Paths**. See the current [phone-first Paths rework](docs/PATHS_REWORK.md) and the historical [Phase A report](docs/FORGE_PATHS_PHASE_A.md).

Optional **Plan details** reviews weekly session balance, including intentional differences between broad and focused days. New plans redistribute existing work without increasing the previous weekly set budget; see the [weekly balance audit](docs/research/WEEKLY_SESSION_BALANCE.md) for measured before/after programs and limitations. Rebuild explicitly to update an existing Path.

**Forge Paths 4.0 is in progress:** Forge Paths is moving to human-authored, versioned programs. Onboarding now asks for experience, goal and preferred rest day, and the curated program data model is in place. The program library is still empty, so generated Paths remain the active flow. See [docs/CURATED_PROGRAMS.md](docs/CURATED_PROGRAMS.md) for the authoring format and transition plan.

This is a substantial first implementation, **not completion of every requirement in the product brief**. Read [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for exact coverage and verification limits. The supplied brief is preserved in [docs/PRODUCT_SPEC.txt](docs/PRODUCT_SPEC.txt).

## Run locally

FORGE now targets iPhone and Android only. The dedicated browser preview has been retired. On Windows, run the Expo development server and open it in Expo Go on your phone.

Use Node.js **24** and npm. The integration tests use Node's built-in SQLite module. The application uses Expo **SDK 57**, React **19.2.3**, and React Native **0.86.3**; compatible native versions and the dependency lockfile are committed.

```sh
git clone https://github.com/Lsaint06/Forge-App.git
cd Forge-App
# Before this feature is merged:
git checkout feat/forge-paths-foundation
npm ci
npm start
```

Install the matching Expo Go version on your phone and follow [IPHONE_TESTING.md](IPHONE_TESTING.md). No Mac or Xcode is needed for the initial Expo Go workflow. The GitHub repository is source code, not a running application or a public development server.

```sh
npm run typecheck
npm run lint
npm run format:check
npm test                 # domain, real SQLite, sync protocol and PostgreSQL migration
npm run test:ui          # React Native Testing Library interaction tests
npm run export           # iOS and Android JavaScript/Hermes export, not signed binaries
```

GitHub Actions runs these checks and retains native export artifacts. CI does not build a signed IPA/APK or run an emulator. `maestro/workout.yaml` is an unexecuted device smoke flow; run it only on a disposable installed build because it clears that app's data.

## What you can do

- Set up a guest profile and edit training, units, theme, rest, progression and nutrition preferences.
- Search/filter/sort 366 exercise definitions; favorite movements, inspect history, and create/edit custom exercises.
- Start an empty workout or a template; add/substitute/reorder/remove exercises and sets; log loads, reps, duration, distance, RPE, RIR, tempo, notes, side and set type.
- Log strength sets in compact number/weight/reps/completion rows inside collapsible exercise cards. The first unfinished exercise opens initially; prescribed sets, reps and rest remain visible when collapsed. Optional per-set effort, notes and other advanced tracking live under **Exercise options → Optional set tracking**, without clearing saved information.
- Pause/resume, recover an interrupted session, finish once, edit history, repeat a workout and save it as a template.
- Use persistent rest deadlines, manual rest starts, skip/extend and optional local completion notifications.
- Edit/duplicate/delete custom workout templates and schedule sessions. Forge Paths is the only guided-plan offering; the ready-made starter-program catalog has been retired. Previously adopted programs, saved templates, schedules and workout history remain available, including their existing calendar deload behavior.
- Inspect volume, primary-muscle set distribution, frequency, duration, best loads/reps, Epley estimates, program adherence and measurement trends.
- Log historical body measurements, manually supplied food values/servings, saved foods, repeat meals, recovery inputs and goals.
- Export/import validated JSON backups and delete local records with confirmation.
- Configure real Supabase email authentication and explicitly requested synchronization. No configured backend means guest mode, not simulated login.

Superset/circuit labels are stored but do not automatically rotate exercise order. Progress photos, barcode scanning, automatic/background cloud sync, advanced progression rules and several achievement/reminder types are not implemented.

## Architecture and data

| Module | Responsibility |
| --- | --- |
| `app/` | Expo Router routes and five-tab navigation |
| `src/components/` | Accessible theme-aware primitives, form and workout controls, SVG chart |
| `src/screens/` | Dashboard, live workout and journal flows |
| `src/domain/` | Typed records, Zod validation, units, overload, analytics and scoring |
| `src/data/schema.ts` | Indexed SQLite schema and migration version |
| `src/data/repository.ts` | Transactional persistence, backups, durable outbox and conflicts |
| `src/data/native.ts` | Expo SQLite adapter, WAL and foreign keys |
| `src/cloud/` | SecureStore session adapter, recovery callbacks and optimistic sync |
| `supabase/migrations/` | Auth-owned PostgreSQL transport, RLS, CAS RPC and deletion RPC |
| `tests/` | Domain, disk/database behavior, protocol, SQL security and UI tests |

Workout, exercise and set tables and template prescriptions are normalized locally with foreign keys. Profiles and lifecycle journals use schema-validated structured payloads. The cloud uses **atomic workout aggregate JSON records**, rather than pretending the full requested normalized PostgreSQL schema exists. Aggregate revisions prevent partially downloaded workouts. An expansion into normalized cloud reporting tables remains future work.

Zustand holds a revision signal and theme/profile snapshot; SQLite owns records. No network cache library is needed for the current explicit sync operation. Forms use React Hook Form and Zod. Charts are interactive, accessible SVG renderers using maintained `react-native-svg`; a large charting package was avoided for this initial scope. Optional native capabilities degrade to actionable errors.

Canonical storage: load/body mass **kg**, body lengths **cm**, distance **meters**, duration **seconds**, calories **kcal**. Imperial measurement entries convert before saving. Volume counts external load × reps for completed working/drop/failure sets; warmups are excluded. Bodyweight work has zero external-load volume unless added weight is logged. Left/right sets each represent separately recorded effort; no implicit doubling occurs. Sets logged with neither reps nor duration nor distance cannot be marked complete.

Epley estimated 1RM = `load × (1 + reps / 30)` for 2–12 reps, actual load for one rep. It is an estimate of **added load** and is not a validated bodyweight strength model. Overload suggests an increment after two sessions reaching the upper target with RPE ≤8 / RIR ≥2 when supplied; two sessions below minimum suggest a 10% reduction. Users can override every load. Recovery weights five self-reported factors equally; it is not medical assessment. Secondary muscles are not double-counted in set totals.

Workout durations use saved timestamps and accumulated pause milliseconds. Charts and adherence use current device-local calendar dates; changing timezone can regroup historical workouts. Schedules retain explicit local dates. Repeated dates do not count a session more than once for adherence. Achievements and best records are recomputed from retained history; they can disappear when source records are deleted.

## Supabase configuration

Cloud is optional. Copy `.env.example` to `.env` and supply your project's **public** URL and publishable/anon client key:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-client-key
```

These values are compiled into the mobile bundle. **Never use a service-role key.** Do not commit `.env`. Restart Metro after configuring it.

1. Create your Supabase project and enable email/password authentication.
2. Apply `supabase/migrations/202610140001_forge.sql` in the project's SQL editor, or link your project with the Supabase CLI and run `supabase db push`.
3. In Auth URL Configuration allow `forge://account` for signed builds and the exact development URL returned by Expo Linking for Expo Go (normally `exp://<development-host>:8081/--/account`; tunnel URLs differ). Configure Site URL and SMTP/email confirmation as appropriate. The app supplies its actual account redirect to password-reset requests.
4. For a custom EAS build make the same public variables available at build time. Mobile network access must reach that project's HTTPS hostname.
5. In Profile → Account, register/log in, export a backup, then choose Synchronize now. Review first-sync conflicts explicitly.

Session tokens are stored in chunked Expo SecureStore entries, not in SQLite or backups. Recovery links verify a recovery session and expose a new-password action. Email delivery, callback redirects, signed native storage and live authentication still require device/project verification.

### Sync and conflict rules

Every local mutation coalesces an outbox record. The server serializes writes and compares the client's base revision; mismatches return the current record instead of overwriting it. Client retries use exponential backoff capped at one hour, triggered by another explicit sync. Matching revisions upload idempotently; remote records hydrate SQLite inside transactions. In-flight sync is invalidated by clearing or replacing local data. Remote child IDs cannot modify another workout. Switching authenticated users is blocked until local records are exported and cleared.

Conflict records preserve local and cloud snapshots. Choose Keep local or Use cloud with confirmation; export first. Concurrent edits made during network requests are retained in the outbox. Local deletion queues a tombstone. Deleting all local data does **not** delete cloud data: a later sync can restore it. Cloud account deletion is a separate authenticated action and cascades cloud records. Favorites and timer/settings keys are local-only. No automatic sync, server-side incremental cursor, or remote notifications are implemented.

Local databases and JSON exports are not encrypted by FORGE. Use the device lock and keep shared backups private. Do not use this first release for irreplaceable data without regular backups.

## Validation and delivery

See [docs/VALIDATION.md](docs/VALIDATION.md) for command results and limitations. Native bundle exports demonstrate build compatibility, not physical-device behavior. No cloud project, Apple credentials or device was provided, so live Supabase, background notifications and physical iPhone tests are outstanding.

The build was reviewed independently for data-integrity defects; regression tests cover the confirmed findings. Additional review before a production release should address the scope gaps in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

### FORGE 2 redesign preview

The dedicated `feat/forge-2-redesign` branch adds the shared athletic theme, today-first Home, visual exercise browsing, streamlined workout logging, and grouped You destination while retaining schema v1 and guest tracking. See [design/status and Safari preview steps](docs/redesign/STATUS.md). Original implementation and `main` remain separate. Real exercise demonstration media and physical-device acceptance remain outstanding.
