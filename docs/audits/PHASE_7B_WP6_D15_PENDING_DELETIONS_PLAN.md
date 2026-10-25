# FORGE — Phase 7B WP6, Decision D15: Durable Pending Deletions (Plan)

**Status: implemented and verified (not committed).** The founder approved the plan with D15-a to D15-e as recommended. The results are in section 13.

## 1. The current Undo lifecycle

**Only two flows defer a write behind the six-second Undo.** Measurements and Nutrition delete immediately after confirmation; their Undo reverses a *save*.

| Flow | File | Where the pending state lives | When the write happens |
| --- | --- | --- | --- |
| Goal delete (and "Mark as achieved") | [Goals.tsx](../../src/screens/Goals.tsx) `useDeferred` | `useRef` box plus `held` state (memory) | The 6 s timer ends (`commit`); a new `hold`/`show` commits the previous one first; screen unmount |
| Check-in delete | [Checkins.tsx](../../src/screens/Checkins.tsx) `pending` ref, `writePending` | `useRef` plus `hidden` state (memory) | The 6 s timer ends; a new `show` commits first; screen unmount |

- **The write itself:** `Repository.deleteJournal(id)` ([repository.ts](../../src/data/repository.ts)) runs one `BEGIN IMMEDIATE` transaction: `DELETE FROM journal` plus an outbox tombstone (`queue(..., deleted=true)`).
- **Undo:** clears the ref; nothing was written.
- **Backgrounding:** nothing listens. On iOS the JS timer is suspended while backgrounded, so the window resumes on return. On Android, timers keep running for a while.
- **Failure today:** if the process is ended inside the window, the pending ref is lost, so the item reappears. Data stays safe, but the deletion intent is lost.

## 2. Storage: the existing `settings` table

- `settings(key, value)` is local key–value storage, already used for `restDeadline`, `lastBackupAt` and `onboardingStep`.
- **No migration.** Settings are **not** synced (no outbox entry), **not** in backups (`exportBackup` omits them), and are wiped by `clearData()`. That covers restore and "Delete everything".
- **One key per kind:** `pendingDelete.goal` and `pendingDelete.recovery`. Each screen allows only one pending delete at a time (a new one commits the previous first), so one key per kind is enough. It needs no key scanning and no array rewrites.
- **One new repository method:** `clearSetting(key)` (`DELETE FROM settings WHERE key=?`). There is no schema change.

## 3. Marker structure

```json
{ "v": 1, "kind": "goal", "id": "<uuid>", "updatedAt": 1792..., "createdAt": 1792..., "expiresAt": 1792... }
```

| Field | Why it is needed |
| --- | --- |
| `v` | Format version; an unknown version is discarded, never acted on |
| `kind` | `"goal"` or `"recovery"`; the delete is restricted to `journal` rows with this **kind** |
| `id` | The record to delete |
| `updatedAt` | Guard: delete only the exact version the lifter confirmed |
| `createdAt`, `expiresAt` | The window (`expiresAt = createdAt + 6000`), and detection of clock changes |

No names, values or personal data. Nothing goes to the cloud.

## 4. Preserving the six-second window

- **In the session:** unchanged. The existing in-memory timer stays authoritative for the banner and Undo, including the current iOS behaviour where backgrounding pauses the window (decision **D15-a**). **Nothing commits on background.** The marker only matters if the process dies.
- **After a restart** (the only time the marker is read): the remaining time is `clamp(expiresAt − now, 0, 6000)`, using wall-clock time. If the device clock moved backwards (`now < createdAt`), the remaining time is treated as 0.

## 5. Restarting before vs after expiry

| On restart | Behaviour |
| --- | --- |
| **After `expiresAt`** | Commit the deletion (section 6), then clear the marker. The item stays gone, as the lifter confirmed |
| **Before `expiresAt`** (rare: a cold start usually takes longer than the remaining seconds) | **Recommended (D15-b):** keep the item hidden and commit at `expiresAt` with a timer started at launch. If Goals or Recovery is open in that time, show "Deleted … · Undo" for the remaining seconds. *Alternative:* commit at launch (simpler, but shortens the rare remaining window) |

Hiding uses the same filters as today (`held` and `hidden`), seeded from the marker when the screen mounts.

**Known gap:** Today's Recovery row could show a pending check-in for those few seconds after a restart. It's cosmetic and resolves at commit (each commit calls `touch()`).

## 6. Idempotent reconciliation

`reconcilePendingDeletes(r, now)` runs after `initializeRepository()` at launch and on each `active` event in `app/_layout.tsx`. That is where the database is already reopened. For each key:

1. Read and **validate** the marker (section 10). If invalid: clear the key and stop. Never delete anything.
2. If it hasn't expired: schedule a commit (D15-b) and stop.
3. In **one** `transaction`:
   - look up `journal WHERE id=? AND kind=?`;
   - **missing** (already deleted, restored over, or removed by sync): clear the key; queue **no** tombstone;
   - **`updatedAt` differs** (changed since it was confirmed, for example by sync): clear the key and **keep** the record (D15-e);
   - **otherwise:** delete the row, queue the tombstone exactly as `deleteJournal` does, and clear the key.

Running it twice is safe: the second pass finds no key, or a missing row.

## 7. Crash consistency

| Step | Order | If the process dies here |
| --- | --- | --- |
| Delete confirmed | **Write the marker first** (one autocommitted statement, durable in WAL), then hide the item and show Undo | Before the write: nothing changed, and the lifter never saw "Deleted". After: reconcile handles it |
| Undo | **Clear the marker first**, then show the item | Before the clear: the lifter never saw the restore, and the delete completes (as confirmed). After: the item stays |
| Window ends, screen closes, or the next delete | **One transaction:** row delete + tombstone + clear the marker | All three or none. If none, the marker survives and reconcile repeats it |

The ordering matters more than the storage: every user-visible state follows a durable write. `transaction` already nests (an inner call runs inside the outer `BEGIN IMMEDIATE`), so adding the marker clear to `deleteJournal`'s transaction is atomic.

**Assumption to verify on the device:** expo-sqlite's default `synchronous` level in WAL mode. At `NORMAL`, an OS crash (not an app kill) could lose the last commit, which is the same risk every other Forge write already has. A process kill doesn't lose committed WAL data. D15 adds no new durability risk; changing that setting is out of scope.

## 8. Multiple and repeated actions

- **Second delete on the same screen:** the existing `commit`-then-`hold` order is kept. The first delete's transaction clears its marker before the second marker is written (same key, so it's simply replaced).
- **Goal and check-in pending together:** possible only across the two screens in one session, and the first screen's unmount commits before the second opens. They use separate keys anyway.
- **Repeated taps on Delete:** the confirmation alert is modal, and the item is hidden at once, so a second Delete can't target it. If a stale marker exists for the same id, it is overwritten with an identical intent.
- **Undo replaced by a new delete:** the previous delete commits (transaction above), then the new marker is written.

## 9. Auth, backup and restore, sync, accounts

| System | Interaction |
| --- | --- |
| **Sync** | During the window the record is unchanged locally, so a sync may upload it as it already does. The tombstone is queued **only at commit**, exactly as now. A remote delete of the same record shows as "missing" in reconcile (no duplicate tombstone). A remote *update* changes `updatedAt`, so the record is kept (D15-e) |
| **Backup export** | Markers aren't exported. A backup taken inside the window still contains the record (as today) |
| **Restore and "Delete everything"** | `clearData()` deletes `settings`, so markers vanish with the data they referred to. An in-memory pending delete on a screen commits on unmount *before* the You screen can run restore; if the record is gone, the commit is a no-op |
| **Account switching and sign-out** | Markers are device-local and data-local. Sign-out doesn't clear data (unchanged); a different account's data arrives only through restore or `clearData`, which removes markers. `cloudOwner` and the generation guards in `sync.ts` are unchanged |
| **Auth** | Not involved |

## 10. Corrupted or stale markers

A marker is acted on **only** if all of these hold:
- the JSON parses;
- `v === 1`;
- `kind` is `"goal"` or `"recovery"` and matches its key;
- `id` is a non-empty string of at most 100 characters;
- `createdAt`, `expiresAt` and `updatedAt` are finite numbers;
- `expiresAt − createdAt === 6000`.

Otherwise **only the key is cleared**. The delete is always `WHERE id=? AND kind=?`, so a marker can never touch another kind or table.

**Stale but valid markers** (for example, the app reopened weeks later): **recommended (D15-c):** still commit, because the lifter explicitly confirmed it and the `updatedAt` guard prevents deleting a changed record. *Alternative:* discard markers older than N days.

## 11. Implementation scope, tests and rollback

**Files (estimated about 150 lines plus tests):**
- `src/data/pending-deletes.ts` (new): marker type, `validate`, `markPending`, `clearPending`, `commitPending` (transaction), `reconcilePendingDeletes`, `remainingMs`.
- `src/data/repository.ts`: `clearSetting(key)`; `deleteJournal` gains an optional `kind`/`updatedAt` guard used by `commitPending` (existing callers unchanged).
- `src/screens/Goals.tsx`: `useDeferred` writes and clears markers for **delete** holds; seeds `held` from an unexpired marker on mount.
- `src/screens/Checkins.tsx`: the same for `pending`/`hidden`.
- `app/_layout.tsx`: call `reconcilePendingDeletes` after `initializeRepository()` (launch and `active`), then `touch()`.

**Logic tests** (`tests/pending-deletes.test.ts`, node:sqlite fixture):
- marker round-trip;
- invalid JSON, version, kind, id or timestamps clear only the key, with data unchanged;
- expired marker: row deleted, one tombstone, key cleared;
- missing row: key cleared, no tombstone;
- `updatedAt` mismatch: row kept, key cleared;
- an unexpired marker isn't committed, and its remaining time is right (clock-backwards gives 0);
- atomicity: a forced failure inside the commit transaction leaves row, outbox and marker unchanged;
- idempotence: reconcile twice;
- `clearData` removes markers;
- `exportBackup` contains no markers.

**UI tests** (Goals and Check-ins):
- delete writes a marker; Undo clears it before the item reappears;
- expiry and unmount commit and clear it;
- a background/foreground cycle neither commits nor clears;
- **simulated process death:** delete, then discard the component without its cleanup; a new repository on the same database, after reconcile, deletes the row;
- restart inside the window: the item stays hidden and Undo shows the remaining time.

**Device check:** delete, `am force-stop` within 6 s, relaunch, and the item stays deleted. Relaunching *inside* the window is impractical in Expo Go (cold start of about 10 s), so it is covered by tests.

**Rollback:** remove the calls in the two screens and `_layout.tsx`. Any leftover `pendingDelete.*` keys are inert to older code (unused settings) and are removed by `clearData`; optionally, a one-line cleanup at launch.

## 12. Decisions for the founder

| ID | Question | Recommended | Alternative |
| --- | --- | --- | --- |
| **D15-a** | The window during backgrounding, in the session | Keep current behaviour (the in-memory timer; never commit on background) | Wall-clock window in the session too (could expire while backgrounded) |
| **D15-b** | Restart *before* expiry | Keep the item hidden; commit at `expiresAt`; offer Undo if the screen is open | Commit at launch (simpler; shortens a rare remaining window) |
| **D15-c** | Old but valid markers | Commit (the delete was confirmed; the guard protects changed records) | Discard after N days |
| **D15-d** | Scope | Goal and check-in **deletions** only. "Mark as achieved" (also deferred) stays in memory; losing it is data-safe (the goal stays active) | Include achievements now |
| **D15-e** | Record changed since confirmation | Keep the record, discard the marker | Delete anyway |

**Risks:**
- a small new persistence contract (local only);
- a reconcile step at launch (bounded: at most two keys);
- the rare restart-inside-window path, covered by tests rather than the device;
- the WAL durability assumption (section 7), unchanged from today.

---

## 13. Implementation results

### Founder approval

D15-a to D15-e as recommended, plus these safeguards:
- isolation for accounts, backup and reset;
- an honest restart and Undo window (never restart the clock, never silently shorten it);
- scope limited to Goal and check-in **deletions**.

### Files

| File | Change |
| --- | --- |
| [pending-deletes.ts](../../src/data/pending-deletes.ts) (new) | `markPending`, `cancelPending`, `readPending` (validates; a bad marker is cleared, nothing else touched), `remainingMs`, `commitPending` (one transaction), `reconcilePendingDeletes` |
| [repository.ts](../../src/data/repository.ts) | `clearSetting(key)` |
| [Goals.tsx](../../src/screens/Goals.tsx) | `useDeferred`: a delete writes the marker before the goal disappears (or doesn't hide it if the write fails); Undo clears it before the goal returns; completion uses `commitPending`. A marker inside its window is restored at mount with its **remaining** time; an expired one is completed. "Mark as achieved" is unchanged (D15-d) |
| [Checkins.tsx](../../src/screens/Checkins.tsx) | The same for check-in deletes |
| [_layout.tsx](../../app/_layout.tsx) | **At cold start only:** reconcile. Expired markers are completed; open ones are completed at their **original** deadline. Never on returning from the background (D15-a) |

### Changes from the plan

- **Marker field `owner`** (the account that owned the local data; `""` in guest mode). A marker is acted on only while the same owner holds the data; otherwise it is discarded and nothing is deleted. This is the account-isolation safeguard. A local database already belongs to one account (sync refuses another until local data is cleared, and `clearData` wipes all settings), so this is defence in depth.
- **No `deleteJournal` signature change.** `commitPending` checks `id`, `kind` and `updated_at` inside the transaction and then calls the existing `deleteJournal`, which nests in the same transaction.
- **Restores use lazy state**, not an effect, so the restored banner appears on the first render. It is computed once per screen opening.

### Results

| Outcome | Behaviour |
| --- | --- |
| Normal six seconds | Unchanged UX; on completion, one transaction deletes the record, queues one tombstone and clears the marker |
| Undo | The marker is cleared first, then the item shows; nothing is deleted later |
| Background and foreground | Nothing commits or clears; the in-session window behaves as before (Batch C device check) |
| Process ended inside the window, relaunch after the deadline | Completed at launch (**device-verified**, below) |
| Relaunch inside the window | The item stays hidden; the screen shows Undo with **the time left** (never a fresh 6 s); completed at the original deadline even if the screen isn't opened |
| Startup slower than the deadline | The window has expired: the delete completes and no Undo is offered. A cold start in Expo Go (about 10 s) almost always exceeds the window |
| Record missing | Marker cleared, no second tombstone |
| Record changed (for example by sync) | Kept; marker discarded (D15-e) |
| Another account's data | Kept; marker discarded |
| Corrupted or invalid marker | Only the marker is removed |
| Backup restore, Delete everything | `clearData()` removes markers before any later reconcile |

### Tests

**Logic, `tests/pending-deletes.test.ts` (12, real SQLite):**
1. the exact marker, Undo before expiry;
2. normal completion (one tombstone, marker cleared);
3. process ended before expiry (remaining window, completion at the deadline);
4. process ended after expiry, and repeated reconcile;
5. clock set back;
6. missing or already-deleted record;
7. record changed by sync;
8. transaction failure and rollback (record, tombstone and marker unchanged; a later retry completes);
9. nine corrupted or invalid forms, and goal and recovery kinds never crossing;
10. backup restore and Delete everything;
11. account isolation (another account, guest data later signed in);
12. rapid successive deletions, and a late timer for an old one ignored.

**UI (5):**
- Goals: marker durable before "Deleted" and cleared by Undo; reopened mid-window shows Undo with the time left, and Undo restores it; reopened after expiry has completed the delete; process ended mid-window gives one completion and one tombstone.
- Check-ins: marker and Undo, reopened mid-window, and completed on leaving the screen.

The existing background/foreground test from Batch C still passes.

### Device verification (Android emulator, Expo Go)

`am force-stop` 0.8 s after "Delete goal", inspecting the database directly:
- **After the kill:** the goal is still stored; marker `{"v":1,"kind":"goal",…,"expiresAt":createdAt+6000,"owner":""}`; 0 tombstones.
- **After relaunch** (later than the deadline): the goal is gone, no marker, **1 tombstone**.

Before D15, this goal came back.

### Limitations

- A **relaunch inside the window** can't be reproduced in Expo Go (cold start of about 10 s against 6 s), so it is covered by tests only.
- The Today screen may show a pending check-in for the few remaining seconds after such a relaunch. It is cosmetic and refreshed at completion.
- **Durability (checked in source, no setting changed):** Forge sets only `journal_mode=WAL` (`src/data/native.ts`). expo-sqlite's iOS and Android build flags don't override synchronous, and its vendored SQLite defaults to `SQLITE_DEFAULT_SYNCHRONOUS 2` with `SQLITE_DEFAULT_WAL_SYNCHRONOUS` equal to that, which is **FULL**. With WAL and FULL, a committed transaction (marker write, or the deletion with its tombstone) survives a process kill and an OS crash or power loss. The setting wasn't read from a running device.
- The two "reopened mid-window" tests now start with 5.5 s rather than 4 s of real time remaining, so a slow machine can't let the window close before the test presses Undo.

### Intermittent UI test failures: follow-up investigation

- **Observed:** two of about twelve full runs had failures in one suite (the second time 3 tests, 296/299). Neither run's output was preserved, so the suite and test names aren't known.
- **Bounded reproduction:** six more full runs (four saving complete Jest JSON and logs, the per-test timings below come from those), plus runs alongside the logic suite and a splash suite run with all 32 CPU cores saturated. All passed. **Not reproduced.**
- **D15 review (no defect found):**
  - **Real time:** each test leaves about 5.5 s or more of margin; the expired case uses −10 s.
  - **Cleanup:** every rendered screen is unmounted before `db.close()`.
  - **Isolation:** each test gets a fresh database and repository mock, so no state leaks.
  - **Races:** a late launch timer finds a different or absent marker and does nothing (Undo, a newer delete). The screen and launch timers completing the same delete is idempotent. Unmount completes exactly once. The app doesn't use React StrictMode, so restore-then-cleanup never double-runs at mount.
- **Leading candidate (not D15, not proven):** `tests/ui/splash.test.tsx` steps its animation with fake timers. Five of its tests take 3.8–4.0 s of CPU each against Jest's default 5 s timeout, the closest of any suite to the limit. A briefly slowed machine would fail several of them together, which matches "3 failed in one suite". No change was made because the cause isn't confirmed. A possible fix, to be applied if it recurs, is a longer timeout for that suite only.
- **Status: unresolved, not attributed to D15.** Timings and logs are in `C:\Users\LStAm\forge-visual-harness\uiflake\` (outside the repository). Any future failure should be run with `npx jest --runInBand --json --outputFile=…` so the suite, test, stack and timing are kept.

### Rollback

Remove the calls in `Goals.tsx`, `Checkins.tsx` and `_layout.tsx`. Leftover `pendingDelete.*` keys are inert to older code and are removed by `clearData`.

---

*D15 implemented and verified. Not committed. Batch C remains uncommitted. WP7 has not begun.*
