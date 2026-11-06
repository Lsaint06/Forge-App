# Phase 7.8B: Synchronization safety and reliability

Implementation report and one design for approval. Baseline: `feat/forge-paths-foundation` at `b4115d1` (Phases 7.7A–7.7C) plus the uncommitted 7.8A audit ([PHASE_7_8A_CLOUD_DATA_AUDIT.md](PHASE_7_8A_CLOUD_DATA_AUDIT.md)). Not committed.

**Unchanged:** Supabase SQL, row-level security, server functions, the local database schema and the backup file format.

**Also unchanged:** sync is still manual only, and ownership checks, the account gate, Forge Paths and training calculations are untouched.

## 1. Before and after

These are the same scenarios run through the sync engine as it was at `b4115d1` and as it is now, against the same simulated cloud. The simulated cloud follows `forge_write`'s revision rule and reorders keys the way Postgres `jsonb` does.

| Scenario                                                    | Before                         | After                                 |
| ----------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| Reply lost after the cloud saved a change; next sync        | 1 conflict                     | 0 conflicts                           |
| Reply lost, then the record edited; next sync               | 1 conflict                     | 0 conflicts; the edit uploads         |
| Backup restored into the same account (20 records)          | 20 conflicts                   | 0 conflicts                           |
| Sync while offline, 5 changes waiting                       | 5 requests, 5 errors           | 1 request; "couldn't reach the cloud" |
| Back online, sync again at once                             | 0 uploaded (waiting out back-off) | 5 uploaded                         |
| Sign-in expires after the first upload                      | 5 more requests, 5 error lines | Stops; 1 request                      |
| Workout in progress on two phones                           | Raw error on every sync        | Held and explained; no error          |
| Workout using an exercise this version doesn't know         | Raw error on every sync        | Held and explained; no error          |

## 2. What changed

### H1: false conflicts after successful uploads

1. **Same content settles.** A conflict is recorded only when the cloud copy really differs from this phone's version. The comparison ignores two things:
   - key order, because Postgres `jsonb` reorders keys;
   - the record's own save time (`updatedAt`), which isn't training data.

   Equal versions are settled at the cloud's revision without a choice.
2. **What was sent is written down before it's sent.** Before each upload, the phone stores what it is sending, in its local settings table under `syncSent:<id>` (no schema change). If the reply never arrives, the cloud may already hold that version. This covers a lost connection, the time limit, and Forge being closed mid-upload. If a later conflict's cloud copy is exactly one of those versions, the cloud holds this phone's own write. The waiting change was made on top of it, so it moves onto that revision and uploads in the same sync. The record is cleared once the outcome is known.
3. **Earlier conflicts are rechecked.** Conflicts saved by earlier versions of Forge are rechecked at the start of each sync, and identical ones settle.
4. **A missing record goes back up.** If the cloud reports it holds no copy at all, not even a deletion (for example, a record removed from the project by hand), the change goes up as a new record. Nothing is replaced.

**Why this can't lose anyone's training:** Forge settles without asking only when the cloud copy equals this phone's version, or equals a version this phone itself sent from the same starting revision. In both cases nothing written by another device is replaced. Every revision still comes from `forge_write`'s check, so real concurrent edits still conflict and both versions are kept.

**Files:**

- `src/cloud/compare.ts` (new);
- `src/cloud/sync.ts`;
- `src/data/repository.ts`: `markSent`, `sentVersions`, `rebase`, `settleConflict`.

### H2: backup restoration conflicts

- **Cause:** a restore gave every workout and template a new save time, and a download gave templates a new save time too. So their content never matched the cloud's copy.
- **Fix:** a restore keeps the save times recorded in the file (`queueWorkout(id, false)`, `writeTemplate`). Downloaded templates keep the cloud's save time and queue nothing.
- **Result:** together with H1, unchanged records settle on the next sync. Records that really differ still conflict, for example an older backup against newer cloud versions. The cloud versions stay untouched until the athlete chooses.

### H3: network failures, retries and interruptions

- **Time limits:** every Supabase request, sign-in included, now gives up after 60 s for reads (they can carry hundreds of records) or 30 s for writes. This uses supabase-js's `global.fetch` option, and a caller's own cancellation still applies.
- **Failures say what they mean:** the transport classifies each failure (`src/cloud/transport.ts`, `src/cloud/errors.ts`):

  | Failure                                                                              | Treated as                  |
  | ------------------------------------------------------------------------------------ | --------------------------- |
  | No reply, or the time limit passed                                                   | No connection (`offline`)   |
  | 401/403, `42501`, `PGRST301`–`303`, "Authentication required", or a different signed-in account | Sign-in not confirmed (`auth`) |
  | 408, 429, 502, 503, 504, 52x                                                         | Cloud not answering (`unavailable`) |
  | Anything else                                                                        | A refusal of that one record |

- **Stop at the first failure that isn't about one record:** nothing else is sent, the download is skipped, and the result says why. One refused record doesn't stop the others.
- **No back-off for a manual sync:** every waiting change is tried on every sync. Changes that failed before go last within their kind, so one troubled record can't hold up the rest.
- **Overlapping syncs:** still refused ("A sync is already in progress"), now covered by a test.
- **Interruptions:** each confirmation and each download is still its own transaction. The write-ahead record from H1 covers Forge closing mid-upload.
- **Plain results:** technical details go to the developer log only. That means error text, never payloads or credentials.

### M3: exercises and record kinds from a newer Forge

- **Held, not failed.** Some cloud records name an exercise or a kind of record this version doesn't know: workouts and templates with unknown exercises, or an unknown record kind. These are now held:
  - nothing is written;
  - the cloud copy is untouched;
  - they're tried again on every sync and arrive after Forge is updated;
  - the result says so plainly.
- **Conflicts wait for an update.** When a conflict's cloud version needs a newer Forge, both choices are locked, in the screen and in the repository itself. The card says to update Forge first, because either choice could overwrite what the newer version recorded.
- **Catalogue IDs can't disappear.** A test now fails if any released catalogue exercise ID is removed or renamed (`tests/catalogue-ids.test.ts`, with the 367 IDs in `tests/fixtures/catalogue-ids.json`). All four historical catalogue versions were checked: no ID was ever removed.
- **Limitation:** unknown fields written by a newer Forge are still dropped by an older build (audit M2, planned for 7.8D).

### M4: conflict information

- **Both versions, side by side.** Each conflict card now shows a "This phone" tile and a "Cloud" tile:
  - sets, exercises, in progress or finished, the entry date, and when each version was last changed;
  - for the profile, the settings that differ, with their values;
  - "Deleted on another device" or "Deleted on this phone" where that applies.

  Below them is a "Differs in: …" line. "This phone" shows the waiting change, which is what Keep local version would upload.
- **Use cloud version is tested.** It moved from the screen into `Repository.useCloudVersion`: one transaction, covered by tests.
- **Keep both** is designed in section 4. It is not implemented.

### M5: workouts in progress on two phones

- **Held, never merged.** A cloud workout in progress is held while a different one is in progress on this phone. The two are never merged and neither replaces the other. It arrives once this phone's session is finished or discarded.
- **Everything else still downloads.**
- **Restore:** restoring onto an empty phone when two sessions are in progress keeps one and holds the other.

## 3. What the athlete sees differently

- **Sync results in words**, replacing "3 uploaded · 1 downloaded · 0 pending · 0 conflicts" and the raw error list:
  - "Sync complete: 3 uploaded · 1 downloaded."
  - "Sync complete. Nothing new to upload or download. 51 records already matched the cloud."
  - "Forge couldn't reach the cloud, so sync stopped. Nothing was lost: 5 changes are still waiting on this phone. Check your connection and try again."
  - Messages for refused changes, for records that need a newer Forge, for a workout in progress elsewhere, and for conflicts waiting for a choice.
- **Conflict cards** show both versions and what differs. Both choices are locked when the cloud version needs a newer Forge.
- **Restore Your Training** names records that need a newer Forge instead of reporting them as failures.
- **No more false conflicts.** Conflicts saved earlier whose two versions are identical disappear at the next sync. Restoring a backup into the same account no longer produces a card per record.
- **Use cloud version** for a workout in progress, while a different one is in progress on this phone, now says "Another workout is in progress on this phone. Finish or discard it first." Nothing changes.

## 4. Keep both: proposed design (not implemented)

**Status: deferred** (founder decision, Phase 7.8C review). A copied workout would count twice in progression calculations until one copy is deleted. The design is kept below for reference only.

**Goal:** resolve a real conflict without discarding either version. The cloud version stays under the record's ID, exactly as with Use cloud version. This phone's version is saved as a separate new record.

### How it would work

Everything happens in one local transaction:

1. Take this phone's version from the waiting change, not from the snapshot saved with the conflict.
2. Copy it under a **new random ID**. For workouts, every exercise row and set also gets a new ID, and the sets are re-linked to the new rows. This is required: sync refuses a workout whose rows belong to another workout, and the original's rows are about to be replaced by the cloud's.
3. Apply the cloud version to the original ID (`applyRemote`). Then drop the original's waiting change and the conflict.
4. Queue the copy as a new record at revision 0.

Nothing is sent until the next manual sync. A failure before the transaction commits leaves the conflict exactly as it was. After it commits, the conflict no longer exists, so the choice can't be applied twice.

### IDs and references

- **The copy's ID:** always new and random, never derived from the original.
- **References to the original keep pointing at the original**, which now holds the cloud version. These include:
  - Forge Path schedule entries (`workoutId`, `templateId`);
  - program enrollments (`templateIds`);
  - a workout's `templateId`;
  - exercise IDs in workouts, templates and goals.

  Nothing refers to the copy.
- **References inside the copy** (its exercise IDs, its `templateId`) stay as they were.

### Duplicate prevention

- **One transaction.** The conflict is removed in the same transaction that creates the copy.
- **Safe upload.** The copy uploads under a fresh ID at revision 0, so it can't overwrite anything. If its reply is lost, H1 settles it.
- **Two phones choosing Keep both.** If two phones each choose Keep both for the same record, each keeps its own copy: two separate records. That preserves everything, but the athlete then sees three versions.
- **Names.** Workouts, templates and custom exercises get " (this phone)" added to their name, within the name limits. Journal entries keep every field unchanged, because some names identify the measurement, such as "Bodyweight".

### Which records

| Record                                              | Keep both                 | Why                                                                                                                 |
| --------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Profile                                             | No                        | One per account; two can't coexist. Would need its own approved design                                              |
| Workout, both versions finished                     | Proposed, with a warning  | The copy counts in history, progress, volume, records and streaks until one is deleted                              |
| Workout in progress on either side                  | No                        | Two sessions in progress can't coexist. Finish first                                                                |
| Template                                            | Proposed                  | The copy appears in the list. Forge Paths keep using the original                                                   |
| Custom exercise                                     | Proposed                  | The copy is unused until chosen                                                                                     |
| Measurement, recovery check-in, goal                | Proposed                  | A second entry for the same day. Charts show both until one is deleted                                              |
| Food log and water entries                          | Decision needed           | Both would count toward the day's totals                                                                            |
| Personal food with a barcode                        | No                        | The barcode identifies it; two would compete when scanning                                                          |
| Forge Path program or scheduled session             | No                        | Linked records: a copy would create a second program or schedule entries pointing at the wrong one                 |
| A kind this version doesn't know, or needs a newer Forge | No                   | It can't be copied safely                                                                                            |
| Either version deleted                              | No                        | Keep local version and Use cloud version already cover both outcomes                                                |

Every "No" would be refused in the repository itself, not only hidden in the screen.

### Tests before it ships

- New IDs for the copy and all of its rows and sets.
- The original's references unchanged.
- All-or-nothing behaviour under an injected failure.
- No duplicates across repeated syncs.
- A lost reply on the copy.
- Two phones choosing Keep both.
- Every excluded category refused by the repository.

### Decisions requested

- **KB1:** approve this design.
- **KB2:** offer Keep both for finished workouts, with the warning that both count until one is deleted? Or exclude workouts at first?
- **KB3:** food log and water entries: offer with the same warning, or exclude?
- **KB4:** the wording of the copy's name (" (this phone)").

## 5. Remaining risks and limitations

1. **Not yet verified on a phone or against live Supabase.**
   - The time limits and request cancellation haven't been exercised on a real network.
   - Supabase's failure shapes were taken from the installed supabase-js 2.118 source, not from live responses.
2. **The profile still conflicts as a whole** (audit M1, planned for 7.8D).
3. **Fields from a newer Forge are dropped by older builds** (audit M2, planned for 7.8D).
4. **Every sync still downloads the whole account** (audit M6, planned for 7.8C). A backup restored into a large account also still sends one request per record: each settles, but slowly.
5. **A change the cloud always refuses** (for example, a record over 5 MB) is retried and reported on every sync. There is no automatic way out.
6. **Held records wait.** They wait until Forge is updated or the session in progress is finished, and each sync reports them.
7. **Slow connections.** On a very slow connection, a large read can hit the 60 s limit; it is reported as no connection. A write that hits its 30 s limit may still complete in the cloud; the next sync settles it (H1).
8. **One record can stop a sync.** A gateway error on one record stops the sync. Changes that failed before are tried last within their kind.
9. **Account deletion also has the 30 s limit.** Its error message is still the raw service text, as before.
10. **A date-dependent test, fixed in the final pass.** The UI test `templates-wp3` "closing the date picker schedules nothing" failed on the last day of any month, and failed the same way on `b4115d1`. It looked for tomorrow's date in a picker that opens on the current month. It now pins its own date with the `fixToday` helper the neighbouring scheduling test already uses. This is a test-only change: picking a day and closing still schedules nothing. It passes on Oct 31 and in UTC, UTC+14 and UTC−10.
11. **Back-off is still recorded but unused.** The `next_attempt` field is still written, but a manual sync no longer waits for it.

## 6. Verification

**Results (final pass):**

- TypeScript: passes.
- ESLint: 0 errors. The 1 warning (an unused type in `templates-wp3.test.tsx`) is pre-existing.
- Prettier: passes.
- Logic tests: 604 of 604 pass, 53 of them new: 28 sync safety, 12 transport, 11 presentation, 2 catalogue IDs.
- UI tests: 689 of 689 pass in 69 suites, 3 of them new.
- Food library and branded catalogue checks: pass.
- iOS and Android exports: pass. The iOS source map was checked: the bundle holds no tests, scripts, fixtures or Supabase files, and its only new project files are `src/cloud/compare.ts`, `errors.ts` and `transport.ts`.

**What the new tests cover:**

- lost replies (once, twice, and with edits in between);
- repeated syncs;
- backup restores (unchanged, and older than the cloud);
- offline, time limits, an unavailable cloud and refused records;
- overlapping syncs;
- sign-in expiry during upload and during download;
- Forge closing mid-upload;
- two phones with workouts in progress;
- unknown exercises and record kinds;
- conflicts from a newer Forge, and unreadable saved conflicts;
- Use cloud version.

**Scope review (final pass):**

- **Unchanged since `b4115d1`:**
  - `supabase/`;
  - the local schema;
  - ownership and the account gate (`src/data/ownership.ts`, `src/auth/`, `src/cloud/link.ts`);
  - validation and the backup format;
  - Forge Paths and programs;
  - notifications;
  - package files.
- **Changed product code:**
  - the sync engine and transport;
  - the repository's sync bookkeeping, restore timestamps and `applyRemote`;
  - the account presentation module;
  - the Account & privacy sync status and conflict cards;
  - the Setup restore outcome;
  - the Supabase client's request time limit.
- **Effects beyond sync, all deliberate:**
  - The time limit applies to every Supabase request, so sign-in, account creation, password reset, Google sign-in and account deletion also give up after 30 s (writes) or 60 s (reads), instead of waiting for the system's own limit. Their messages are unchanged.
  - Restoring a backup keeps workouts' and templates' recorded save times. No screen or Forge Path reads those times.
- **Corrected during the review:**
  - The conflict tiles' text lines are keyed by position, so two identical lines can't trigger a React warning.
  - The repository's "Keep local version" guard now agrees with the screen: a saved cloud copy with no record kind is unreadable rather than newer, and can still be replaced. Both sides are covered by a test.

## 7. iPhone tests (Expo Go)

1. **No connection.** Turn Airplane Mode on, then open You → Account & privacy → Synchronize now. Expect "Forge couldn't reach the cloud, so sync stopped. Nothing was lost: …". Turn Airplane Mode off and tap Synchronize now: the waiting changes upload at once.
2. **Interrupted sync.** Log a weigh-in, tap Synchronize now and immediately turn Airplane Mode on. Turn it off and sync again: no conflict card.
3. **Backup restore.** Export a backup, then import the same file in Account & privacy and synchronize. Expect "Sync complete…" with "already matched the cloud", and no conflict cards.
4. **Large text.** With the largest text size, any conflict card's two tiles stack and remain readable.
5. **Second device (optional).** With a second phone signed in to the same account, edit the same weigh-in on both and sync both. The conflict card shows both versions and "Differs in: Value". Use cloud version replaces this phone's entry.
