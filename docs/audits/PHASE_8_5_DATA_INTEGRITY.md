# Phase 8.5 M4: Offline reliability and data-integrity matrix

Branch `feat/phase8-5-forge-hardening`. New coverage in `d057730`: `tests/integrity-stress.test.ts` and `tests/sync-convergence.test.ts`. All on disposable in-memory databases; no real data, account or cloud was touched.

**Verification level.** Logic tests with `node:sqlite` and the in-memory cloud (`tests/cloud-fixture.ts`), plus the earlier hand-written suites. Faults are injected in software: a failed write or commit stands in for a full disk or a crash; lost requests, lost replies, outages and expired sign-ins stand in for networks. Real power loss, the OS ending FORGE, and full storage on a phone are **not** reproduced here (section 3).

**Later, on the Android emulator (M1):** a set cell could save its typed value over a load applied while it kept focus (D-2, P2, fixed in `53bf269`). See PHASE_8_5_ANDROID_VALIDATION.md §4.

**Result: no data-integrity defect was found.** Each new oracle was mutation-checked: it fails against a deliberately broken copy of the code it guards, namely
- a non-atomic exercise removal;
- a set edit that isn't queued;
- a download that overwrites waiting changes;
- a "keep this phone's version" that drops the change.

## 1. The new stress tests

| Test | What it does | Invariant checked after every step |
| --- | --- | --- |
| Logger stress (4 seeds × 900 steps) | Random add, edit, remove and reorder of exercises and sets; about a third of the changes fail part-way (the *n*-th write, or the commit); restart every 100 steps; backup round trip every 300; finish twice | A failed change leaves the database byte-identical. Otherwise it matches an independent model: order, contiguous positions, values, no orphaned sets, and one queued sync copy equal to what is stored |
| Rapid edits | 500 consecutive edits of one set | The last value is kept; one queued copy |
| Food log stress (2 seeds × 400 steps) | Add, edit and delete food entries with faults and restarts | Matches the model; daily totals within 1e-6 of the model's; queued copies equal the data |
| Damaged backups | Truncated at 59 points; 11 kinds of broken record (missing parent, duplicate, two sessions in progress, wrong types, newer format and others) | Refused whole; the phone being restored is byte-identical; `backup:check` never calls it restorable; the intact file restores |
| Two-phone sync (6 seeds × 160 steps) | Two phones, one account: food entries and finished sessions created, edited and deleted; random conflict choices; faults injected on uploads and downloads (lost request or reply, outage, expired sign-in) | Both phones and the cloud converge. Every record ends at its latest edit or the athlete's latest choice. Nothing appears that no edit wrote. Per seed: 15–23 faults, 3–9 conflicts |

## 2. Matrix

Severity: P0 data loss or corruption, P1 wrong data shown, P2 recoverable inconvenience.

### Workout persistence (4.1)

| Scenario | Expected invariant | Actual outcome | Regression coverage | Defect | Fix |
| --- | --- | --- | --- | --- | --- |
| Rapid consecutive set updates | Last value kept; one queued copy | Holds | `integrity-stress` (500 edits); `workout-reliability` T-1 (each keystroke saved) | None | — |
| Repeated exercise additions | Contiguous positions; no duplicate rows | Holds | `integrity-stress` logger; `repository` (sequential positions) | None | — |
| Exercise removal and reordering | Order matches; sets follow their exercise; no orphans | Holds | `integrity-stress` logger; `workout-logging` (moving the eighth exercise) | None | — |
| Saving while offline | Saves never wait for the network; changes are queued | Holds | `sync`, `sync-safety` (refused upload kept), `sync-convergence` | None | — |
| Interrupted write (crash mid-change) | All or nothing: byte-identical on failure | Holds | `integrity-stress` (write and commit faults); `repository` (atomic backup import) | None | — |
| Restart and recovery | Reopened data equals what was saved | Holds | `integrity-stress` (restart every 100 steps); `repository` (disk-backed reopen) | None | — |
| Finishing after offline logging | One finished session; repeat finishes change nothing | Holds | `integrity-stress` (finish twice); `repository` (idempotent completion) | None | — |
| Duplicate saves (double taps) | One record per intent | Holds by code: guards in Quick add and the Nutrition quick log | Existing UI tests | None | — |
| Corrupted or incomplete records | Schema validation, foreign keys, a finished session keeps a completed set | Holds | `repository`; `workout-reliability` W-4 (8.3C-3) | None | — |
| Backgrounded or ended by the OS | Typed values already saved; the workout returns on launch | Saved per keystroke (T-1); **the OS ending FORGE needs a device** | `workout-reliability` T-1 | — | Device test |

### Cloud synchronization (4.2)

| Scenario | Expected invariant | Actual outcome | Regression coverage | Defect | Fix |
| --- | --- | --- | --- | --- | --- |
| Offline to online | Queued changes upload on the next sync | Holds | `sync`, `sync-convergence` | None | — |
| Concurrent updates | A conflict is shown; neither version is overwritten | Holds | `sync-safety` H1–H3; `sync-convergence` | None | — |
| Retry | A refused write retries with back-off; network faults stop without loss | Holds | `sync` (refused upload), `sync-convergence` | None | — |
| Duplicates | A repeated sync moves nothing twice; a lost reply settles as its own | Holds | `sync-safety` H1, repeated sync | None | — |
| Conflict resolution | Each choice wins and converges on both phones | Holds; mutation-checked | `sync-convergence` | None | — |
| Partial failure | An interrupted download changes nothing; the checkpoint waits | Holds | `sync-incremental` | None | — |
| Sign-in expires during sync | Sync stops; changes kept; the next sync completes | Holds | `sync-convergence` (expired sign-in faults) | None | — |
| Interrupted write (lost reply) | Settles without a conflict | Holds | `sync-safety` H1 | None | — |
| Ordering | The final value is the latest edit or choice | Holds | `sync-convergence` | None | — |
| Error reporting | Plain-language status; details in the developer log only, never payloads | Holds by code (M6 review) | Account screen tests | None | — |

### Backup and restore (4.3)

| Scenario | Expected invariant | Actual outcome | Regression coverage | Defect | Fix |
| --- | --- | --- | --- | --- | --- |
| Creation and verification | The export restores to the same data; the checker uses the importer's own code | Holds | `integrity-stress` round trips; `backup-check` | None | — |
| Invalid, truncated or duplicated | Refused whole; the phone being restored is unchanged | Holds | `integrity-stress` damaged backups; `backup-check` | None | — |
| Unsupported or newer format | Refused with a clear message | Holds | `sync-versions`; `integrity-stress` | None | — |
| Older backups | Pre-Phase-6 backups import | Holds | `legacy-fixture` suites | None | — |
| Import warnings | A workout in progress is named before replacing (W-5) | Holds | 8.3C-3 UI tests | None | — |
| Interrupted import | One transaction: a failure rolls everything back | Holds | `repository` (foreign-key failure rolls back) | None | — |

### Nutrition (4.4)

| Scenario | Expected invariant | Actual outcome | Regression coverage | Defect | Fix |
| --- | --- | --- | --- | --- | --- |
| Meals persist; daily totals after restart | Totals equal the model | Holds | `integrity-stress` food log; `nutrition-offline` | None | — |
| Logging offline | Works offline | Holds | `nutrition-offline` | None | — |
| Duplicate meals | One entry per tap | Holds by code (guards); Copy to today has Undo instead of a guard | Existing UI tests | None (P3 note) | — |
| Calculations | Unchanged formulas | Holds; not touched in 8.5 | `nutrition`, `food-library` suites | None | — |
| Food catalogue and local database | The catalogue loads; a database that can't open shows Recovery, never deletes | Holds | `food-library`; `data-safety` (Recovery, M6 codes) | None | — |

## 3. Needs a device

1. **Power loss and the OS ending FORGE** during a save. SQLite's journal (WAL) is designed for this; the fault-injection tests show only that FORGE's own changes are all-or-nothing.
2. **Full storage** on the phone: how iOS and Android report it, and what the lifter sees.
3. **Backgrounding** during a workout for a long time, then returning: the workout, rest timer and alert.
4. **Real network transitions:** airplane mode mid-sync, captive Wi-Fi, a slow connection.

Run these with the FORGE Dev checklists (`docs/FORGE_DEV_IPHONE_CHECKLIST.md`; `docs/ANDROID.md` §6 for Android).
