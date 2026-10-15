# Introduce FORGE offline fitness tracker

Forge previously contained only a README. This adds an Expo SDK 57 / strict TypeScript application with five tabs, a SQLite workout engine, exercise search and history, prescribed templates/programs, training analytics, lifestyle journals, validated backups and optional Supabase authentication/sync.

Workouts save immediately, recover from persistent SQLite state, and complete idempotently. Timestamp-based timers handle background time. The cloud outbox uses optimistic revisions; conflicts preserve local data, clearing/importing invalidates old in-flight sync, and remote children cannot alter another workout. PostgreSQL migrations provide authenticated ownership isolation and guarded writes/deletion.

Validation: frozen installation, TypeScript, lint and formatting pass; 44 domain/database/protocol tests and 4 React Native interaction tests pass; iOS/Android Hermes exports and internal iOS development-bundle requests pass. See docs/VALIDATION.md for details and corrected failures.

This does not complete the entire product brief. Physical iPhone/Android and live Supabase behavior remain unverified. Background sync, photo storage, barcode services, recurring reminder types, advanced program progression, circuit automation and detailed PR/strength-trend features remain incomplete. IMPLEMENTATION_STATUS.md inventories the exact scope; IPHONE_TESTING.md explains Expo Go, Windows, tunnels and signed builds.

Design decisions: normalized SQLite core plus atomic cloud aggregate records; explicit manual synchronization; lightweight maintained SVG rendering; optional unimplemented integrations are documented rather than simulated. No application user records or secrets are seeded.
