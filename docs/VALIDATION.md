# Validation results — 2026-10-14

Executed in `/workspace/Forge-App` with Node 24.19.0. Results describe this instance, not publication, restoration in a new task, a signed native build, or a physical-device run.

| Check | Result |
| --- | --- |
| Frozen dependency installation: `npm ci --no-audit` | Passed; exercised again through `bash scripts/install-cloud.sh` |
| `npm run typecheck` | Passed, strict TypeScript |
| `npm run lint` | Passed with no project errors/warnings |
| `npm run format:check` | Passed |
| `npm test` | 43 passed, 0 failed, 0 skipped |
| `npm run test:ui` | 3 passed, 0 failed, across 2 suites |
| `EXPO_NO_TELEMETRY=1 EXPO_NO_CACHE=1 CI=1 npm run export` | Passed iOS and Android Hermes bundles; approximately 6.1 MB / 6.3 MB before distribution compression |
| Expo SDK-compatible dependency check | Passed embedded/offline compatibility check; CLI notes offline validation is less authoritative |
| Development server status/manifest/launch asset | HTTP 200, FORGE / SDK 57.0.0, iOS development JavaScript served |
| Independent code review | Four important findings fixed; local regressions cover applicable paths |
| `git diff --check` | Passed |
| GitHub API operation | Blocked: proxy CONNECT to api.github.com returns 403 Forbidden; host addition saved in draft |
| Maestro/device/iOS signing/live Supabase | Not run; no installed device/emulator, Apple signing or configured backend supplied |

The 43 domain/integration tests exercise exercise identity/search and program references; volume and Epley estimates; units; timers; overload; nutrition; readiness; achievements; goal ratios; program adherence; SQLite migration/recovery/order/cascades/validation; disk database close/reopen; backup rollback; sync retries, conflicts, account binding and generation invalidation; recovery callback parsing; and actual PostgreSQL migration/permission behavior. The 3 UI tests exercise numeric edits without blur, invalid-number rejection, and notification-preference persistence through form submission.

The PostgreSQL test runs the real migration in PGlite with a test `auth.uid()`/users scaffold. It verifies SQL behavior, RLS across two identities, compare-and-set revision conflicts, revoked direct writes, anonymous RPC rejection and owned deletion. It does **not** verify the deployed Supabase Auth/Gateway, SMTP, placeholder credentials, network transport or real token refresh.

## Corrections made during validation

- Moved npm and Expo tool caches into writable `/workspace` locations. Kept package integrity/TLS checks enabled.
- Pinned React DOM and the UI test renderer to React 19.2-compatible versions instead of accepting incompatible peer versions.
- Fixed SQL set insertion placeholder count and preserved sequential row positions after deletion.
- Added completed-set validation and backup transaction rollback checks.
- Invalidated in-flight sync on clear/import and rejected remote child IDs owned by another workout.
- Preserved notification preference when submitting a cached form and implemented verified recovery-callback parsing plus a real password-update action.
- Corrected the PostgreSQL test's reserved configuration key; migration then passed real execution.
- ESLint's import parser cannot inspect PGlite's generated WASM glue without overflowing. Import parsing is narrowly ignored **for that external dependency in the PostgreSQL test**, while project lint, TypeScript and executable SQL tests remain enabled.
- Forced IPv4-first resolution for internal cloud Metro startup. Without it, this machine listened on IPv6 localhost while Expo generated IPv4 asset URLs; the saved startup script fixes both status and asset requests.

Dependency installation still reports upstream deprecation notices. Export reports runner NO_COLOR/FORCE_COLOR notices. Optional desktop React Native DevTools cannot launch its Electron sandbox correctly in this headless environment; Metro and bundle delivery work, and its sandbox was not disabled. None of these notices is presented as physical-device validation.

## Publication and credentials

Saved cloud draft fields: `install_script`, `start_skill`, and custom network allowlist addition `api.github.com`, preserving the existing package-manager preset. Saving did not apply or publish them. Review/save in environment settings, then publish to activate the prepared snapshot/settings. No fresh-task restoration has been verified.

Cloud app variables remain optional and unset: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Guest mode needs neither. Supply public project configuration securely and apply the SQL migration to verify live cloud behavior. No service-role key, authentication value or user token was committed.
