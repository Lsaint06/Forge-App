# FORGE architecture

The authoritative product brief is ../../PRODUCT_SPEC.txt. The owner explicitly requests autonomous implementation without further stage approvals.

Build a strict TypeScript Expo Router mobile app. Five tabs lead to functional training, exercise search, progress and profile flows. The palette follows the brief; reusable accessible controls support light/dark themes. Guest data is never fabricated.

SQLite is the source of truth. Normalized workout/exercise/set tables preserve every meaningful edit in a transaction. One active workout is allowed, completion is idempotent, and timestamps account for background time. Durable rest deadlines survive relaunch. Local repositories operate without authentication. Shared SQL runs in integration tests against real SQLite.

Domain functions calculate volume, Epley estimates, overload, nutrition, readiness, goals and achievements. Stored loads are kilograms, lengths centimeters and distances meters. Warmups are excluded from training volume. Bodyweight volume counts only external load; estimates are for loaded rep sets only. Calendar grouping uses local dates.

Templates and prescribed starter programs reference stable exercise IDs. Lifestyle records have validated structured payloads and timestamps. Export/import validates the entire backup before atomic replacement. Local deletion requires confirmation.

Optional Supabase uses public URL and publishable key only, SecureStore sessions, authenticated RLS and an optimistic revision RPC. A durable outbox uploads user-owned records. Remote revisions are compared before writes; conflicts stop synchronization and preserve both versions for explicit resolution. Cloud functionality remains clearly disabled when not configured. Remote integration and native device behavior must not be claimed tested without credentials/device evidence.

Prioritize the durable workout vertical slice, then functioning breadth. Document any unsatisfied advanced requirements in IMPLEMENTATION_STATUS.md. Required checks: domain and SQLite integration tests, strict typecheck, lint, Expo iOS/Android bundle export. Physical iPhone, Maestro and live Supabase are separate validation targets.
