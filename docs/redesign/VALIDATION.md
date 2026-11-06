# FORGE 2 validation

Validated in the Codex Linux cloud environment, Node 24.19.0, Expo 57.0.29. No physical-device run is claimed.

- `npm test`: 44 tests passed; zero failures/skips. Domain, real SQLite persistence/backup rollback, catalog/program prescriptions, protocol and embedded Postgres checks retained.
- `npm run test:ui`: 12 tests across five suites passed. Covers numeric draft persistence/validation, preference notification preservation, lifetime achievements outside chart range, new tab navigation/resume, guarded finish, exercise addition, completed history, freestyle start, set completion/rest, rest skip, search/detail routing, honest media fallback and accessible controls.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check`: pass; no source lint warnings.
- iOS and Android Hermes exports: pass, approximately 6.2 MB and 6.4 MB. Bundled icon assets remain offline.
- Fresh local Expo Go server on port 8082: iOS manifest HTTP 200, FORGE, SDK 57.0.0. Development JavaScript HTTP 200, 12,550,065 bytes, includes the redesigned media-label marker. These are local requests, not public reachability checks.
- Structural nesting correction is exercised by rendering the workout and opening its exercise picker in UI tests. No warnings are suppressed.
- Diff inspection confirms no schema, data model, repository, cloud, dependency or app-identifier modifications.

Cloud-only warning: optional React Native DevTools Electron cannot start because this environment's SUID sandbox helper is not configured. Metro and bundling still run; no sandbox protections were disabled. Exports also report the harmless NO_COLOR/FORCE_COLOR terminal-color warning.

The component tests mock native notifications, routing and repository interactions; they are not substitutes for device acceptance. Native share sheets, public Codespaces manifest/bundle delivery, keyboard/VoiceOver/Dynamic Type, background timers, and live Supabase remain unverified. Use the explicit device checklist in STATUS.md.
