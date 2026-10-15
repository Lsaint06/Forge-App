# FORGE implementation status

Statuses describe **specific capabilities**, not an assertion that the entire product specification is complete. “Implemented and tested” means a relevant automated check ran successfully. Screens that typecheck/export but were not exercised on a device are “Implemented but unverified.” Source of truth: `docs/PRODUCT_SPEC.txt`.

| Feature / capability | Status | Evidence or limitation |
| --- | --- | --- |
| Expo SDK 57 / strict TypeScript foundation | Implemented and tested | Typecheck and iOS/Android bundle export |
| Five custom tabs and persistent workout entry point | Implemented but unverified | Bundled; no physical navigation run |
| Theme, safe areas, large targets and accessible labels | Implemented but unverified | Source implemented; no VoiceOver/device audit |
| Reduced-motion progress/sheets, haptics | Implemented but unverified | Native behavior untested |
| Skeleton loading states | Partially implemented | Startup loading indicator; no skeleton card system |
| Swipe interactions | Not implemented | Explicit reorder/delete controls are available |
| Onboarding fields and editable preferences | Implemented but unverified | Validated forms, saved valid inputs and step; full onboarding not device-tested |
| Notification setting survives form save | Implemented and tested | React Native interaction regression |
| Guest mode without credentials | Implemented and tested | Offline repository and disabled cloud configuration; native guest launch unverified |
| SQLite schema, transactions, indexes and repeatable migration | Implemented and tested | Actual SQLite integration tests |
| Single active workout / idempotent completion | Implemented and tested | Repository integration tests |
| Set creation/editing, cascade deletion, stable ordering | Implemented and tested | SQLite persistence/ordering/validation tests |
| Restartable active workout | Implemented and tested | Stored rows reopened through repository; phone process termination still unverified |
| Empty completed-set rejection | Implemented and tested | Regression rejects completion without reps/duration/distance |
| Workout editor controls, exercise substitution and notes | Implemented but unverified | Typecheck/export; device flow outstanding |
| Valid numeric edits persist before blur | Implemented and tested | React Native interaction tests |
| Pause/resume duration arithmetic | Implemented and tested | Pure timestamp timer test; background native behavior outstanding |
| Rest deadlines/manual start/skip/extend/per-exercise defaults | Implemented but unverified | Persisted settings and native notification hooks; device delivery outstanding |
| Warmup/drop/failure kinds, RPE/RIR, tempo and unilateral sides | Implemented but unverified | Validated persisted set fields; complete UI flows unverified |
| Bodyweight, duration and distance inputs | Implemented but unverified | Canonical fields and category-dependent editors |
| Superset/circuit tracking | Partially implemented | Group labels/notes only; no automatic circuit rounds or rotation |
| Completed-workout editing and duplication | Implemented and tested | Duplication integration test; native edit flow unverified |
| Exercise catalog / metadata structure | Implemented and tested | 366 unique names/IDs, schema and search checks; coaching content not professionally reviewed |
| Exercise instructions/safety metadata | Partially implemented | Authored general cues, many shared by movement class; advanced technique should be reviewed |
| Exercise search/filter/sort | Implemented and tested | Token/muscle/equipment search tests; native list unverified |
| Favorites/recent list/custom exercise editing | Implemented but unverified | Local persistence/UI; favorites do not cloud-sync |
| Exercise history and best load/reps/e1RM | Implemented and tested | Record/analytics functions; history UI unverified |
| Template prescriptions/start/duplicate | Implemented and tested | Actual template-to-workout integration test |
| Template creation/editor/deletion/scheduling UI | Implemented but unverified | Native flows not exercised |
| Seven prescribed starter programs | Implemented and tested | All prescription references and counts checked |
| Multiweek schedule adoption and deload starts | Implemented but unverified | Calendar generation and one-set reduction implemented; device adoption flow untested |
| Program adherence | Implemented and tested | One recorded workout cannot satisfy two schedule entries |
| Program-specific progression/completion controls | Partially implemented | General overload plus date adherence; no separate completion workflow |
| Deterministic double-progression / regression suggestion | Implemented and tested | Raise/maintain/reduce tests with explained recommendations |
| Custom per-exercise progression rules | Partially implemented | Global rep range/increment; individual rule presets absent |
| Volume, primary-muscle volume/sets, frequency and duration | Implemented and tested | Exact aggregate and no-double-count tests |
| 7/30/90 days, year, all-time interactive charts | Implemented but unverified | SVG controls; last 60 recorded dates visible, all range records included in totals |
| Strength trend and detailed exercise-frequency charts | Partially implemented | Records/history and frequency totals exist; dedicated trend charts absent |
| Personal-record events/highlights | Partially implemented | Best values derived; no chronological PR event feed or immediate PR celebration |
| Training streak | Implemented but unverified | Calendar calculation implemented, not separately device/timezone-tested |
| Measurement history/edit/delete/custom names | Implemented but unverified | Journal persistence and charts; full device flow untested |
| Metric/imperial load and measurement conversion | Implemented and tested | Reversible conversion/canonical measurement tests |
| Private progress photos/storage | Not implemented | No photo acquisition or storage |
| Manual nutrition totals | Implemented and tested | Serving quantity scales all four totals |
| Meals, serving descriptions, saved foods and repeated meals | Implemented but unverified | Offline forms/repositories; native workflow outstanding |
| Barcode scanning/external food API | Not implemented | No invented food data or pretend scanner |
| Recovery scoring | Implemented and tested | Bounded transparent five-factor formula |
| Recovery journal / subjective readiness / rest days | Implemented but unverified | Additional inputs recorded; subjective readiness not part of derived five-factor score |
| Configurable goals | Partially implemented | Workouts, volume, load, bodyweight, duration, calories; ratio calculation tested, device goal flows unverified |
| Basic achievements | Implemented and tested | First/10/100 workouts, 10,000 kg, first recorded strength record thresholds |
| Four-week consistency and custom exercise milestones | Not implemented | No fabricated unlocks |
| Local rest/planned reminders / permission denial fallback | Implemented but unverified | Native APIs present; background/denial delivery requires device |
| Recurring workout/goal/consistency reminders | Not implemented | Only explicitly scheduled local events |
| SecureStore session storage | Implemented but unverified | Chunked storage adapter; device restoration not tested |
| Email register/login/logout/session restoration | Blocked by external configuration | Real Supabase calls; no live project credentials supplied |
| Password recovery callback and password update | Blocked by external configuration | Callback parsing tested; live email/link/password change unverified |
| PostgreSQL migration, RLS and optimistic-write RPC | Implemented and tested | Isolated PostgreSQL compatibility test with auth scaffold; not deployed/live Supabase verification |
| Authenticated cloud-account deletion | Blocked by external configuration | Owned SQL deletion tested locally; live endpoint/user session unverified |
| Full normalized cloud data model | Partially implemented | Normalized local workout/template core; atomic JSON aggregates in PostgreSQL, journals structured JSON |
| Durable sync outbox and retry backoff | Implemented and tested | Coalescing/retry integration tests |
| Cloud revision conflicts and account-owner guard | Implemented and tested | Upload/download/conflict/multi-account protocol tests using real local repository |
| Clear/import invalidates in-flight sync | Implemented and tested | Pending-upload/download regression tests |
| Cross-workout remote child-ID rejection | Implemented and tested | Malformed remote data cannot alter another workout |
| Manual sync against live Supabase | Blocked by external configuration | Transport implemented; actual network integration unrun |
| Automatic/background/incremental sync | Not implemented | Explicit full pull and bounded manual retry only |
| Export/import validation and atomic rollback | Implemented and tested | Backup round-trip, malformed JSON and FK rollback tests |
| Native backup share/import and deletion controls | Implemented but unverified | File/share APIs and confirmations; physical device outstanding |
| Privacy disclosure/version/error recovery | Implemented but unverified | UI text and preserved database on startup failures |
| CI workflow | Implemented but unverified | Workflow authored; equivalent commands ran locally, remote Actions run unconfirmed |
| Maestro end-to-end scenario | Implemented but unverified | Authored smoke flow; no device/emulator/Maestro execution |
| iPhone/Windows testing guide / EAS profiles | Implemented but unverified | Instructions/config exist; no signed build created |
| Physical iOS/Android performance and accessibility | Not implemented | No profiling, physical-device run or formal audit performed |

## Highest-priority continuation

1. Run the iPhone checklist, fix any layout/native behavior defects and execute Maestro on disposable device data.
2. Configure a test Supabase project and verify two-user RLS, callbacks, SecureStore restoration and conflict resolution end to end.
3. Improve exercise-specific coaching metadata, safety classification and offline search indexing; obtain a qualified review for advanced exercises.
4. Add dedicated PR events/strength trends, program completion and per-exercise progression rules.
5. Add actual circuit rounds, recurring reminders and automatic incremental sync with audited lifecycle boundaries.
6. Add private photos only with a complete permission/storage/security flow; add nutrition APIs only with valid sources and credentials.

## FORGE 2 presentation pass

The `feat/forge-2-redesign` branch is based on the fetched implementation head `60f4e7a`. It changes presentation and navigation without database/domain/cloud changes. [Redesign status](docs/redesign/STATUS.md) records implemented UI, media sourcing gaps, device acceptance limits and phone preview instructions. This does not change the backend or physical-device limitations above.
