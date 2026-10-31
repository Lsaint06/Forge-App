# Phase 7.8C: Synchronization performance and visibility

Implementation report. Baseline: `feat/forge-paths-foundation` at `6712067` (Phase 7.8B). Not committed.

**Unchanged:** Supabase SQL, row-level security, server functions, the local database schema and the backup format. Sync is still manual only, and ownership checks and the 7.8B conflict safety are untouched. Keep Both is still a design only.

## 1. Before and after

The same 3,000-record account (600 workouts with sets, 2,400 weigh-ins), measured through the 7.8B engine (`6712067`) and the 7.8C engine against the same simulated cloud. Figures are what each sync receives from the cloud.

| Sync on a second phone                  | Before (7.8B)          | After: history uploaded in one go | After: history synced daily for 30 days |
| --------------------------------------- | ---------------------- | --------------------------------- | --------------------------------------- |
| First sync (empty phone)                | 3,000 records · 3.3 MB | 3,000 · 3.3 MB                    | 3,000 · 3.3 MB                          |
| Sync again, nothing new                 | 3,000 · 3.3 MB         | 3,000 · 3.3 MB                    | 100 · 109 KB                            |
| After 1 workout + 1 weigh-in elsewhere  | 3,002 · 3.3 MB         | 3,002 · 3.3 MB                    | 102 · 114 KB                            |
| Sync again, nothing new                 | 3,002 · 3.3 MB         | 2 · 4 KB                          | 2 · 4 KB                                |

- **Time:** the engine's own time for a repeat sync went from 22–29 ms to 2–3 ms (desktop, simulated cloud). On a phone the saving is mostly network: about 3.3 MB less per routine sync for this account.
- **Why the middle column stays large for a while:** every record carries the time the cloud received it. An account uploaded in one go therefore stays within a day of its newest change (section 2), and is read again until a newer change arrives and moves the checkpoint forward.

## 2. Incremental download

### How it works

- **What is read:**
  - The first sync downloads everything.
  - After that, a sync downloads only the records the cloud changed since its checkpoint, minus a day of margin.
  - The checkpoint is the cloud's own time (`updated_at`) of the newest change received.
- **Same timestamp, never skipped:** pages are read in `(updated_at, id)` order and follow the last record received (keyset paging), rather than counting from an offset. Records sharing a time are never skipped, and a record changed mid-download moves to a later page instead of shifting others.
- **Deletions:** deletions are records too (tombstones). They carry a new time, so they arrive incrementally like any change.
- **Held or unreadable records:** a record this phone can't take yet goes on a retry list:
  - it needs a newer Forge;
  - it's a workout in progress elsewhere;
  - or it couldn't be read.

  Every incremental sync fetches the retry list again by ID. After an update, the held records arrive. A record the cloud no longer has is dropped from the list.
- **Safety nets:**
  - a full download at least weekly;
  - also when the checkpoint can't be read;
  - also when this phone's clock has gone backwards.
- **Interrupted downloads:** records are applied only after the whole download has arrived. The checkpoint moves only after every record has been handled. A lost connection, an expired sign-in or a closed app therefore changes nothing, and the next sync reads the same range again.
- **Account isolation:** the checkpoint, the retry list and the sync status each name the account they belong to. Another account's are ignored, and deleting this phone's data removes them.
- **Conflicts:** conflict handling is unchanged. A record changed in the cloud is in the incremental range, so it still conflicts with a waiting change exactly as before.

### Why the margin makes it safe

Postgres stamps `updated_at` with `now()`: the time a write began, not the time it became visible. A slow write can therefore become visible with a time slightly before a checkpoint another phone has already taken. Re-reading a day before the checkpoint covers any write shorter than a day. Writes are bounded by the database's statement timeout, 8 s by default for signed-in requests on Supabase.

Records read again are skipped by revision, so nothing is applied twice. The tests include a write that began before the checkpoint and landed after it. The weekly full download covers even an impossible write older than the margin, and the tests include that too.

### Checked against the live project

Using anonymous, read-only requests, which row-level security answers with no rows, the live project accepted every filter the incremental download uses:

- the time lower bound;
- the keyset filter with microsecond times and quoted IDs;
- the ID list;
- the exact count.

A malformed time was rejected with HTTP 400, which shows the filters are really parsed. No authenticated, data-bearing incremental read has been made yet: that's the first iPhone test.

### Optional server design (not needed now)

A strictly commit-ordered cursor would remove the need for the margin. That means either:

- a per-account change counter incremented inside `forge_write` under a per-account lock;
- or a transaction-ID column read against the reader's snapshot.

Either one changes the schema and the RPC, so it needs separate approval. Recommendation: not now. The margin and the weekly full download are sufficient.

## 3. Restore Your Training: progress and outcome

- **Steps while it runs:**
  - Connecting to your account;
  - Downloading your training, with "1,200 of 3,400 records" when the cloud reports a total, otherwise "500 records";
  - Restoring to this phone, with the number of records being restored.

  Each step reads done, in progress or next. There are no percentages, and counts appear only when they're measured.
- **Complete:** a "Restore complete" card says how many records were restored and that nothing was held back. Home opens when the athlete taps Continue.
- **Incomplete:** a "Restore incomplete" card says what was restored and what wasn't, and why: unreadable records, records that need a newer Forge, or a workout in progress on another device. Continue and Try again work as before. Counts add up across tries.
- **Failed:** "Nothing on this phone changed", as before.
- **Never complete with a gap:** a restore with any held or unreadable record is never called complete. A workout in progress elsewhere now makes it incomplete; in 7.8B it was treated as complete.

## 4. Last complete sync (Account & privacy)

- **Rule:** a sync is complete when it ran to the end, and nothing is waiting to upload, refused, held, unreadable or in conflict. Otherwise it is partial, or stopped if it never reached the end.
- **What is recorded:**
  - each sync records its outcome and time for the account;
  - the last complete time moves only on a complete sync;
  - restores are syncs too.
- **What Account & privacy shows:**
  - a new fact, "Last complete sync: Today, 2:05 PM";
  - "Not yet" before any complete sync;
  - "Not recorded yet" on a phone that synced before 7.8C, until its next complete sync;
  - beneath it, "Your last sync (today, 3:10 PM) stopped before it finished." or "…finished, but some records still need attention." when the latest sync wasn't complete.

  The existing "On this phone: N changes waiting to upload" fact still says what isn't in the cloud. Nothing says "backed up".
- **Only the owner's history:** the record is stored with its account, survives restarts, and is shown only to the account that owns this phone's data.

## 5. Gentle sync reminder (You tab)

- **Where and how:** a quiet card in the profile prompt's style, below the plan. Its row opens Account & privacy, and "Not now" hides it for 3 days. There are no notifications, no pop-ups and no automatic sync.
- **When it's due** (only with changes waiting to upload):
  - **Never synced:** after the first finished workout. Text: "Your training on this phone isn't in the cloud yet."
  - **Synced before 7.8C, no recorded date:** "3 changes aren't in the cloud yet."
  - **Otherwise:** once the last complete sync is 3 days old, or 3 workouts have been finished since. Text: "2 changes aren't in the cloud yet · last complete sync yesterday".
- **Who sees it:** only the signed-in owner of this phone's data.

## 6. What the athlete sees differently

- **Restore Your Training:** step-by-step progress, and a completion card with Continue (one more tap than before).
- **Account & privacy:** the last complete sync, and a note when the latest sync didn't finish.
- **You tab:** the sync reminder, when due.
- **Faster syncs:** routine syncs download far less (section 1).

## 7. Verification

**Results:**

- TypeScript: passes.
- ESLint: 0 errors. The 1 warning is pre-existing.
- Prettier: passes.
- Logic tests: 626 of 626, including the D5 test added at the founder review (section 9).
- UI tests: 694 of 694 in 70 suites.
- Catalogue checks: pass.
- iOS and Android exports: pass.

**New tests:**

- 12 incremental-sync tests:
  - first sync;
  - repeated syncs without changes;
  - workouts, edits and deletions arriving incrementally;
  - a write that landed after the checkpoint;
  - identical times at the checkpoint;
  - the weekly safety net;
  - interrupted downloads, offline and an expired sign-in;
  - records from a newer Forge recovered after an update;
  - unreadable and vanished records;
  - last-complete-sync correctness;
  - account isolation;
  - unreadable checkpoints and a clock moved back;
  - progress.
- 4 transport tests: keyset paging through a run of equal times, the time filter with progress, by-ID batches, and a malformed page stopping the download.
- 6 reminder tests: eligibility, snooze, owner scoping, phones that synced before 7.8C, and keeping cloud sync and file backups separate (D5).
- 2 presentation tests and 5 UI tests (restore steps and outcomes, last complete sync, the reminder and its dismissal).

## 8. Remaining risks

1. **Not yet verified on the iPhone,** and no authenticated incremental read has run against the live project. Only anonymous syntax checks have.
2. **An account uploaded in one go** is read again until a change arrives more than a day later (section 1).
3. **A write that took longer than a day** to become visible would wait for the weekly full download. Postgres's statement timeout makes this practically impossible.
4. **Records deleted directly in the cloud database** (outside Forge) are still never removed from phones, as before.
5. **The first page's exact count** adds a count of the account's matching records to each sync; it's cheap for one account's rows.
6. **Restoring runs as one pass after its step appears.** There is no live count during it; the native spinner keeps turning.
7. **Account & privacy sync shows no step progress.** Routine incremental syncs are short.

## 9. Decisions (founder review, Oct 31, 2026)

- **D1, 1-day margin and weekly full download:** approved, as implemented.
- **D2, commit-ordered server cursor:** deferred. The current design is sufficient at present scale; no schema or RPC change.
- **D3, reminder thresholds (3 days, 3 workouts, 3-day snooze):** approved, as implemented.
- **D4, Continue after a complete restore:** approved, as implemented. Athletes acknowledge that the restore finished.
- **D5, counting a complete sync as a file backup (audit M8):** declined. Cloud sync and an independent backup file serve different recovery purposes, so their statuses stay separate. The backup reminder reads only file backups; a test now enforces it.
- **Keep Both:** deferred again. Duplicate workouts could distort progression calculations.
- **Planned for 7.8D from the audit:** favorites sync, per-field profile merge, keeping fields from newer versions.

## 10. iPhone tests (Expo Go)

1. **Sync twice.** Synchronize now, then again. The second is quick; Account & privacy shows "Last complete sync: Today, …".
2. **A change from another device.** Log a weigh-in on another device signed in to the same account, sync it, then sync this phone. The weigh-in arrives.
3. **No connection.** Turn Airplane Mode on and sync: the sync stops. The fact keeps the earlier time, and a note says the last sync stopped.
4. **Restore on an empty phone (if available).** The steps appear with record counts, then "Restore complete" and Continue.
5. **Reminder.** With changes waiting and no sync for 3 days (or before any complete sync, after a finished workout), the You tab shows the reminder. "Not now" hides it.
