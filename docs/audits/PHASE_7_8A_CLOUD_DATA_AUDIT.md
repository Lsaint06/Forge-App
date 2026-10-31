# Phase 7.8A: Cloud architecture and data reliability — audit

Audit only. No code, database schema or Supabase policy was changed. Baseline: `feat/forge-paths-foundation` at `b4115d1` (Phases 7.7A–7.7C), clean and in sync with `origin`.

**Method.** Every statement was checked against the code at that commit. Behaviour marked **Probe** was reproduced with Forge's real `Repository` and `synchronize` (SQLite through `node:sqlite`) against an in-memory server that applies `forge_write`'s revision rule. The probe scripts were deleted afterwards. Not verified here:

- live Supabase behaviour beyond the earlier anonymous checks (a select returned no rows; `forge_write` was refused with `42501`);
- performance on a phone;
- anything requiring two real accounts.

These are listed in section 6.

## Summary

- **No CRITICAL findings.**
  - No path was found that lets one account read, receive or overwrite another account's records.
  - No path was found where Forge destroys training data on its own.
  - The sync engine is conservative by design: it never applies last-write-wins, and it keeps both versions until the athlete chooses.
- **The real risks are in failure handling and in the choices athletes are asked to make.**
  - Interrupted uploads and backup restores create **false conflicts**. Probe: 2 of 2 records after a dropped connection, and 51 of 51 records after a backup import.
  - Bad connections make Sync and Restore **stall or silently do nothing**.
  - Conflict choices are **blind and all-or-nothing**. A wrong guess can permanently discard training, because the server keeps no history.
- **Moving the founder's phone from Expo Go to Forge's own build starts with an empty database.** Do 7.8B first, and follow the runbook in section 10.
- **Findings:** 4 HIGH, 9 MEDIUM, 8 LOW, plus 6 items already tracked from earlier phases.

## 1. Local data architecture

All athlete data lives in one SQLite database (`src/data/schema.ts`). No AsyncStorage, MMKV or loose files hold athlete data. SecureStore holds only the auth session, chunked (`src/platform/sessionStorage.ts`).

| Data                                                                                                                                                   | Stored in                                                       | Cloud sync                                      | Backup file | Restored on a new phone      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------- | ----------- | ---------------------------- |
| Profile: name, body, units, theme, reminders on/off, rest timer, nutrition targets, `onboarded`                                                        | `profile` (one JSON row)                                        | Yes, as one record (`profile`)                  | Yes         | Yes                          |
| Workouts with exercises and sets                                                                                                                       | `workouts`, `workout_exercises`, `workout_sets`                 | Yes, one record per session (the whole session) | Yes         | Yes                          |
| Templates, including Forge Path phase templates                                                                                                        | `templates`, `template_exercises`                               | Yes                                             | Yes         | Yes                          |
| Custom exercises                                                                                                                                       | `exercises` (custom=1)                                          | Yes                                             | Yes         | Yes                          |
| Journals: measurements, food log, recovery, goals, personal foods, hydration, Forge Path enrollments (`program`) and scheduled sessions (`schedule`)    | `journal`                                                       | Yes                                             | Yes         | Yes                          |
| **Favorites**                                                                                                                                          | `favorites`                                                     | **No**                                          | Yes         | **No**                       |
| Settings: ownership (`cloudOwner`, `cloudOwnerHint`), `nutritionTargetsSaved`, rest timer state, workout edit drafts, Undo markers, backup reminder dates | `settings`                                                      | No (ownership is deliberately per phone)        | No          | No                           |
| Sync state                                                                                                                                             | `outbox`, `sync_meta`, `conflicts`                              | —                                               | No          | Rebuilt                      |
| Exercise catalogue                                                                                                                                     | `exercises` (custom=0), shipped in the app                       | No                                              | No          | Shipped with the app         |

**Derived, safe to recalculate:** progress charts, personal records, achievements, streaks, the calendar, nutrition totals and a Path's next session. They're computed from the records above and never stored as records.

**Ownership in the data layer.** The `Repository` has no notion of an owner. Ownership is a fact about the phone (`cloudOwner`), enforced at every edge:

- the entry gate (`src/auth/entry.ts`);
- linking only to an empty cloud account (`linkChecked`, `src/cloud/link.ts`);
- claiming only an empty phone (`claimIfEmpty`, `src/data/ownership.ts`);
- `synchronize` refusing another account (`src/cloud/sync.ts:23–27`);
- `transport.requireOwner` checking the account before and after every request (`src/cloud/client.ts:32–39`);
- backup import keeping the owner (`importBackupKeepingOwner`);
- Undo markers tagged with the owner (`src/data/pending-deletes.ts`).

On the server, row-level security limits reads to `auth.uid()`, and `forge_write` writes only as `auth.uid()`.

## 2. Synchronization engine as it behaves today

Sync is manual: Account & privacy → Sync, or Setup → Restore Your Training.

- **Queue.** Every local write puts the _whole_ record in `outbox`, together with the revision this phone last saw (`Repository.queue`, `repository.ts:850`). Any edit to a workout re-queues the whole session (`queueWorkout`, `:329`).
- **Upload** (`sync.ts:42–65`). Each queued record goes to `forge_write(base revision)`. The server takes an advisory lock and compares revisions:
  - if they match, it writes `revision + 1`;
  - otherwise it returns the cloud copy, and the phone records a **conflict**.

  Nothing is last-write-wins. `acknowledge` (`repository.ts:866`) removes the queued record only if it didn't change while it was being sent, so edits made during a sync are safe.
- **Download** (`sync.ts:66–103`). It fetches **every** record of the account, 500 per page ordered by id (`client.ts:41–56`). For each record:
  - if there's a pending local change with a different revision, that's a conflict;
  - if this revision is already here, it's skipped;
  - otherwise it's applied in its own transaction and its revision is recorded.

  One bad record doesn't stop the rest: its error is collected.
- **Conflicts** block that record until the athlete chooses _Keep local version_ (upload over the cloud) or _Use cloud version_ (replace local).
- **Deletions** are tombstones (`deleted`, empty payload). A remote tombstone deletes the local workout, journal entry or template.
- **Duplicates.** Record ids are generated on the phone and the server key is `(user_id, id)`. Sync, restore and import therefore can't duplicate a record. Semantic duplicates are possible (L7).
- **Failures.** A failed upload is retried with back-off: 2 s doubling up to 1 h (`Repository.retry`, `repository.ts:896`). The back-off also applies to the next manual tap.
- **Safety.** A generation counter and an owner re-check abort a sync if this phone's data is cleared or replaced, or the account changes mid-sync (`sync.ts:29–35`).

**Probe results** (real engine; times are from a desktop CPU):

| #   | Scenario                                                                    | Result                                                                                                                            |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A   | Connection lost after the server saved 2 records                            | Next sync: **2 conflicts**, both versions identical                                                                               |
| B   | Backup imported into an account that already held the same 51 records      | Next sync: **51 of 51 in conflict**, 0 uploaded                                                                                   |
| C   | Sync while offline, then Sync again once back online                        | **0 uploaded, 5 still pending, no message**: the records were waiting out their back-off                                          |
| D   | Download 1,000 / 1,000 (500 pending) / 3,000 (1,000 pending) records        | 74 / 90 / 215 ms. Slower on a phone; not a blocker at this size                                                                   |
| 1   | Payload size                                                                | **7.5 KB per workout** (6 exercises × 4 sets); 0.2 KB per journal entry                                                           |
| 2   | A workout in progress on two phones                                         | `UNIQUE constraint failed: index 'one_active'` on **every** sync; the other phone's session never arrives                         |
| 3   | An older build receives fields written by a newer build                     | Unknown profile, workout and journal fields are dropped; the profile is **uploaded back without them**. Journal `data` keys are kept |
| 4   | A workout uses an exercise missing from this build's catalogue              | "Exercise not found" on **every** sync; the workout never appears on that phone                                                   |
| 5   | Two phones change _different_ profile settings                              | **Conflict on the whole profile**                                                                                                 |

## 3. Restore Your Training (Phase 7.7C P1)

**Already verified with the real engine** (`tests/restore.test.ts`, `tests/ui/setup-restore.test.tsx`):

- An empty phone downloads the account and opens Home: the profile arrives with `onboarded`, so onboarding isn't repeated.
- Restoring again duplicates nothing.
- An interrupted restore changes nothing, and trying again completes it.
- A partial restore keeps what arrived; the next try brings the rest.
- Restore is offered only before anything is entered.
- Restore never takes another account's phone.

**What returns:**

- profile;
- workouts with exercises and sets;
- custom exercises, which arrive before the workouts that use them;
- templates;
- Forge Paths: enrollments and schedules, which arrive after their templates and workouts;
- food log, personal foods, hydration, measurements, recovery and goals.

**What doesn't return:**

- **favorites**;
- **reminder permission** on the new phone: the restored profile can say reminders are on while this phone never asked, so rest-timer alerts silently don't appear (M7);
- `nutritionTargetsSaved`, which only matters for targets saved at their default values;
- backup reminder dates;
- anything that was never synced.

**Gaps:**

- no request timeout and no Cancel (H3);
- a large account applies in one uninterrupted loop without progress (M6);
- records that use exercises from a newer catalogue fail (M3).

## 4. Backup and recovery

- **Contents** (`exportBackup`, `repository.ts:778`): version 1, export time, profile, workouts, workout exercises, sets, templates, every journal (unknown kinds included), custom exercises, favorites.
- **Omits:** settings (ownership, reminders state, backup dates, `nutritionTargetsSaved`), sync state (queue, revisions, conflicts), auth tokens, and the catalogue (it ships with the app).
- **Validation before anything changes** (`importBackup`, `:794`): 50 MB cap; JSON parse; schema check (version must be 1); per-kind journal rules; unique ids; at most one active workout. Then **one transaction**: any failure, such as "Exercise not found", rolls everything back. An invalid file shows "This file isn't a valid FORGE backup. Nothing was changed."
- **Incompatible files:** another version number is rejected outright. Unknown fields are silently dropped (M2).
- **Replace semantics:** import replaces all local data. The confirmation says so and recommends exporting first. Unsynced changes that aren't in the file are gone, as an explicit and confirmed choice.
- **Ownership:** a file isn't tied to an account. Importing keeps the signed-in owner, and the next sync uploads the data to _that_ account. A backup can never reach another account's cloud records. Whoever holds the file holds the data. That's by design: it's the only recovery path when an account becomes inaccessible.
- **Into an already-synced account:** every record conflicts (H2).
- **Database won't open:** the recovery screen exports JSON or a raw database copy (`src/platform/rescue.ts`).
- **Account inaccessible:**
  - Today's path is to sign in to (or create) any other account, open the conflict screen, tap Export backup (`AccountCheck.tsx:102`), delete this phone's data, set up, then import. It works, but it needs a connection, a second account and knowledge of the steps (M9).
  - With no connection and no stored session, there is no way in.

## 5. Security and privacy

**Verified in `supabase/migrations/202610140001_forge.sql`:**

- `forge_records`:
  - RLS is on; the only policy is _Read owned records_ (`select … to authenticated using (user_id = auth.uid())`).
  - Insert, update and delete are revoked from `authenticated` and `anon`.
  - Kinds are restricted, and each payload is capped at 5 MB.
- `forge_write`:
  - `security definer` with a fixed `search_path`.
  - Requires `auth.uid()`, validates id length and revision, serializes with an advisory lock, and refuses kind changes.
  - Execute is revoked from `public` and `anon` and granted to `authenticated` only.
- `forge_delete_account`: same protections; deletes only `auth.uid()`; records cascade.

**Verified in the app:**

- Only the publishable key ships; there's no service-role key. HTTPS is enforced (`client.ts:10`).
- The session lives in SecureStore.
- The account is re-checked before and after every request.
- Sync refuses a phone owned by another account.
- Developer logs carry only auth error codes and validation failures. No tokens, codes, emails or payloads are logged.
- Sync errors are shown on screen, not logged (L3).

**Not encrypted at rest:** the SQLite database and backup files. This is disclosed in Account & privacy, and iOS file protection applies (L8).

**Still to verify:**

- the table's remaining default privileges (L2);
- a two-account isolation test;
- a live account-deletion test with throwaway accounts.

Read-only checks for the Supabase SQL editor (they change nothing):

```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'forge_records' order by 1, 2;

select relrowsecurity from pg_class where oid = 'public.forge_records'::regclass;

select policyname, roles, cmd, qual from pg_policies where tablename = 'forge_records';
```

## 6. Risk assessment

The **Architecture** line says whether the fix changes existing architecture.

### HIGH

**H1 — Interrupted uploads create false conflicts**

- **Where:** `synchronize` upload loop (`src/cloud/sync.ts:42–65`, retry at `:62`); `Repository.retry` (`repository.ts:896`); conflict card copy (`app/account.tsx:371–376`).
- **Evidence:**
  - A failed `write` is always treated as "not saved". If the server committed before the response was lost, the next upload carries the old base revision, and `forge_write` returns the cloud copy as a conflict.
  - **Probe A:** 2 of 2 records in conflict, with identical contents.
  - The card says "The cloud record changed since this device last synchronized", which is untrue here.
- **Scenario:** The athlete taps Sync and switches to their music app. iOS suspends Forge mid-request. The next sync shows conflicts on their latest workouts, and the athlete learns to dismiss conflict cards. That habit matters when a real one appears (M4).
- **Fix:** Before raising a conflict, on upload and on download, compare the local and cloud contents canonically, including the deleted flag. The comparison must ignore key order, because Postgres `jsonb` reorders keys. If they're identical, acknowledge at the cloud revision silently. Client-only.
- **Architecture:** No.

**H2 — Restoring a backup into an already-synced account puts every record in conflict**

- **Where:**
  - `Repository.importBackup` (`repository.ts:794–828`) calls `clearData` (`:830`), which wipes `sync_meta` and the queue, then re-queues everything at revision 0.
  - `queueWorkout` (`:329`) and `saveTemplate` (`:649`) give every workout and template a new `updatedAt`.
  - The conflict list (`app/account.tsx:360`) shows one card per record, with no bulk choice.
- **Evidence:** **Probe B:** 51 of 51 records in conflict, 0 uploaded. The confirmation says "your next sync may report conflicts", not "every record".
- **Scenario:** The athlete restores yesterday's backup after a mistake. Hundreds of cards appear, each needing a separate, blind and irreversible choice. Every one of those records stops syncing until it's resolved.
- **Fix:**
  1. Import keeps each workout's and template's original timestamps.
  2. H1's identical-contents check then settles unchanged records automatically.
  3. For records that really differ, offer one summarized choice ("23 records differ: keep this phone's versions / use the cloud's"), after an export prompt.

  Client-only. Import keeps its replace semantics.
- **Architecture:** No.

**H3 — Sync and Restore handle bad connections poorly**

- **Where:**
  - `cloudClient` (`src/cloud/client.ts:8–27`) sets no request timeout.
  - The upload loop (`sync.ts:42–65`) keeps going after a network failure.
  - `retry` back-off also applies to manual taps.
  - The status joins every error (`app/account.tsx:172–174`).
  - During Restore, _Not you?_ is disabled while it runs (`src/screens/entry/Setup.tsx`, `disabled={!!busy}`).
- **Evidence:**
  - Supabase requests have no timeout; only `fetchAuthProviders` has one.
  - Every pending record is attempted even after the first network failure.
  - **Probe C:** after an offline attempt, the next tap uploaded 0 of 5 records with no message.
  - The back-off reaches 1 h after repeated failures.
- **Scenario:**
  - Gym basement with weak signal: Sync spins while each request waits for the platform's default timeout. The status then lists one identical error per record.
  - Back outside, tapping Sync appears to do nothing.
  - On a new phone, Restore can sit on "Restoring…" until the app is force-quit.
- **Fix:**
  - A request timeout, via a `fetch` wrapper passed to `createClient`.
  - Stop at the first network or authentication failure and say so once ("No connection. Nothing was lost; try again.").
  - Manual sync ignores back-off.
  - Group the errors.
  - Restore gets a Cancel.

  Client-only.
- **Architecture:** No.

**H4 — Moving from Expo Go to Forge's own build starts with an empty database**

- **Where:** platform. Expo Go keeps each project's database in Expo Go's own sandbox (`src/platform/rescue.ts` notes this). A native build (`com.lsaint06.forge`, `app.json`) is a separate app.
- **Evidence:**
  - Restore brings back only what was synced. It doesn't bring favorites (M7).
  - Importing a backup on top of a restore triggers H2.
- **Scenario:** Apple Sign-In needs the native build. The founder installs it, restores, and removes Expo Go. Anything that wasn't synced, plus favorites, is permanently gone.
- **Fix:**
  - Follow the runbook in section 10.
  - Ship 7.8B (H1, H2) before migrating; ideally also favorites sync (M7).
  - Keep the same bundle identifier for development, TestFlight and App Store builds, so later builds install as updates of the same app with the same data.
- **Architecture:** No.

### MEDIUM

**M1 — Profile conflicts are all-or-nothing, and per-phone preferences sync**

- **Where:**
  - `saveProfile` (`repository.ts:86`) queues the whole profile.
  - `applyRemote` replaces it.
  - `profileSchema` includes theme and reminders (`src/domain/validation.ts:17–33`).
- **Evidence:** **Probe 5:** the name changed on one phone and the rest timer on another, and the result is one whole-profile conflict. Either choice loses the other change.
- **Scenario:** The iPad is switched to light theme and the iPhone's nutrition targets are edited. Keeping the iPad's version silently reverts the targets.
- **Fix:** Merge field by field when the two phones changed different fields. This needs the last-synced copy as a base: a small local migration. Decide which preferences stay per phone.
- **Architecture:** Yes. A local schema addition; no server change. Decision D4.

**M2 — Fields from a newer app version are dropped and can be erased from the cloud**

- **Where:** `profileSchema`, `workoutSchema` and `templateSchema` strip unknown keys in `applyRemote` and `importBackup`. `backupSchema` accepts only `version: 1`.
- **Evidence:** **Probe 3:** a profile field added by a newer build is dropped by an older build and re-uploaded without it. Workout and journal top-level fields are dropped too; journal `data` keys are kept (Phase 7.3C design).
- **Scenario:** During the beta, the iPhone on build N+1 gains a new setting. The iPad, still on build N, edits the athlete's name, and the setting is erased everywhere.
- **Fix:**
  - Keep unknown profile fields: the profile is stored as JSON.
  - Workouts and templates are relational, so stamp them with a schema version and refuse to overwrite a record written by a newer schema ("Update Forge to edit this").
  - Accept older backup versions; refuse newer ones with a clear message.
- **Architecture:** Moderate: the validation layer and one new payload field. No server change.

**M3 — Mixed app versions: records with exercises unknown to an older build fail repeatedly**

- **Where:** `applyRemote` → `putExercise` ("Exercise not found"); the `template_exercises` foreign key. The catalogue ships in `src/data/exercises.json`.
- **Evidence:**
  - **Probe 4:** "Exercise not found" on every sync, and the workout never appears.
  - Catalogue ids have been append-only across all 4 historical versions (367 today), but nothing enforces it. A removed id would also break restores and backup imports of history that uses it.
- **Scenario:** The athlete updates the iPhone, logs a new exercise, and the iPad on the old build shows a raw error on every sync.
- **Fix:** A test that fails if a catalogue id is ever removed or renamed. Hold such records back with "Update Forge to see 1 workout" instead of an error.
- **Architecture:** No.

**M4 — Conflict choices are blind and can permanently discard training**

- **Where:** the conflict card (`app/account.tsx:360–413`) shows only `conflictTitle(remote)`. _Use cloud version_ is direct SQL inside the screen (`:396–410`). The server keeps no history.
- **Evidence:**
  - The card shows a title and two buttons: no date, no set count, nothing about which side changed.
  - A remote deletion shows only "Workout".
  - Errors are caught by `mutate`, so the app doesn't crash, but the resolution logic has no repository tests.
- **Scenario:** The same workout is edited on two phones and the athlete chooses _Keep local_. The other phone's added sets are overwritten in the cloud, then removed from that phone on its next sync. They're gone unless a backup exists.
- **Fix:**
  - Show what differs: date, exercises and sets, when each changed.
  - Add **Keep both** for workouts, journal entries and templates: this phone's copy is saved under a new id and the cloud version is accepted, so nothing is lost.
  - Move the resolution into tested `Repository` methods.
- **Architecture:** No.

**M5 — A workout in progress on two phones blocks download**

- **Where:** `applyRemote` → `putWorkout`; unique index `one_active` (`schema.ts:8`).
- **Evidence:** **Probe 2:** `UNIQUE constraint failed: index 'one_active'` on every sync until one session ends, shown as raw text.
- **Scenario:** The athlete starts a session on the iPad, forgets it, trains on the iPhone and syncs. Every sync now errors.
- **Fix:** While another session is in progress here, hold the remote one back with a plain notice, and apply it when either finishes.
- **Architecture:** No.

**M6 — Every sync downloads the whole account**

- **Where:** `transport.list` (`client.ts:41–56`) pages through all records. The download (`sync.ts:66–103`) re-reads the queue once per record (`:72`) and applies everything in one uninterrupted loop.
- **Evidence:**
  - **Probe 1:** 7.5 KB per workout. For a three-year athlete (about 800 workouts and 5,000 journal entries) that's roughly 7–9 MB per sync. This is an estimate.
  - **Probe D:** 215 ms on a desktop for 3,000 records, slower on a phone.
  - Paging by offset can skip a record inserted mid-sync; it's caught on the next sync.
- **Scenario:** Every tap costs mobile data, battery and seconds of "Syncing…", growing every month. A large restore freezes the screen without progress.
- **Fix:**
  - Download incrementally, using the existing `(user_id, updated_at)` index with an overlap window. Applying is already idempotent by revision.
  - Read the queue once.
  - Apply in chunks with progress.
- **Architecture:** Minor: the client protocol only. No schema or policy change.

**M7 — Favorites and reminders don't come back on a new phone**

- **Where:** `toggleFavorite` (`repository.ts:153`) never queues. `notifyAt` (`src/notifications.ts:56–57`) trusts the synced profile flag, but permission is per phone.
- **Evidence:** Favorites exist only in backups. A restored profile can say reminders are on while this phone never asked for permission.
- **Scenario:** On a new iPhone the Favorites list is empty, and rest-timer alerts never appear although Preferences shows reminders on.
- **Fix:**
  - Sync favorites as journal records of a new kind. Builds since 7.3C already store unknown kinds unchanged (`validation.ts:136–143`), and no server change is needed.
  - After a restore with reminders on, ask this phone for permission once.
- **Architecture:** Minor: a new journal kind. Decision D3.

**M8 — The cloud copy is only as recent as the last manual tap**

- **Where:** the You tab shows "N changes waiting to sync" (`src/screens/You.tsx:124`), and Account shows "On this phone". There's no last-sync time anywhere. The backup reminder (`src/domain/backup.ts`) counts exported files only.
- **Evidence:** The indicator is passive, and nothing records when the last successful sync happened.
- **Scenario:** The athlete syncs once in March and loses the phone in June. Three months are gone, though they believed Forge backs up to the cloud.
- **Fix:**
  - Show "Last synced …".
  - Gently remind the athlete when changes have waited several days. Nothing is synced automatically.
  - Count a complete sync as a backup in the backup reminder.
- **Architecture:** No.

**M9 — Recovering from an inaccessible account works but can't be discovered**

- **Where:** entry gate; Export backup on the conflict screen (`AccountCheck.tsx:102`); P3.
- **Evidence:** The path is: another account → conflict screen → Export → delete this phone's data → set up → import. It needs a connection and a second account. Without a stored session, there's no way in offline.
- **Scenario:** The athlete loses the Google account that owns their training and can't find a way to keep it.
- **Fix:** Add "Can't get into that account?" guidance on the conflict screen and Welcome, and fold it into the P3 workflow.
- **Architecture:** No (P3 is separate).

### LOW

- **L1 — `synchronize` claims a phone that has no owner** (`sync.ts:23–28`). This can't be reached today: the gate always sets the owner first, and linking requires an empty cloud account. Fix: refuse instead of claiming. Architecture: no.
- **L2 — Server privileges not fully tightened, and isolation not tested live.**
  - The migration revokes only insert, update and delete. Supabase's default privileges normally also give `anon` and `authenticated` other table privileges, such as `TRUNCATE`, and give `anon` `select`. That `select` returns nothing, because the policy covers `authenticated` only. This is **unverified**; the read-only check in section 5 confirms it.
  - None of these privileges is reachable through the API.
  - Fix: run the read-only checks in section 5 now. Later, `revoke all` then `grant select … to authenticated`, which needs approval. Run a two-account isolation test and a live deletion test with throwaway accounts.
  - Architecture: no, but the SQL needs approval.
- **L3 — Raw technical errors in the sync status:** SQLite, validation and server messages, one line per record. Fix: plain messages, with details in the developer log only (with H3). Architecture: no.
- **L4 — Tombstones are kept forever and downloaded on every sync.**
  - Deleting a record that was never uploaded still uploads a tombstone. **Keep this behaviour:** after a lost response (H1) the record may exist in the cloud, and the tombstone is what stops it coming back.
  - Fix: M6 removes the download cost. Any purge needs a server change and approval.
  - Architecture: no.
- **L5 — No server-side payload validation or per-account quota;** there's only the 5 MB per record cap. A malformed write affects only the writer's own account. Fix: before public launch, with approval. Architecture: server.
- **L6 — Small restore differences.** Downloaded templates get a new local `updatedAt` (`saveTemplate`), and `nutritionTargetsSaved` isn't restored. Cosmetic. Fix: keep timestamps (with H2). Architecture: no.
- **L7 — Semantic duplicates from parallel offline use.** Two phones can each start a Forge Path and both sync; `currentEnrollment` (`src/data/programs.ts:65–69`) shows the first one. Record ids never duplicate. Fix: detect this after download and ask which to keep. Architecture: no.
- **L8 — The local database and backup files are unencrypted.** This is disclosed in the app. No change now; revisit before public launch.

### Already tracked (not re-rated)

- **P3:** the cloud account deletion workflow (proposal awaiting approval).
- **`cloudAccountDeleted`:** set to "true" (`app/account.tsx:452`) and never read. `cloudOwner` keeps the deleted account's id.
- Apple token revocation before release.
- Custom SMTP.
- Site URL still `http://localhost:3000`.
- Privacy policy and support contact.

## 7. Roadmap

**Order.** The most likely real damage comes from failure handling and blind choices, not from the core design. Fix those first, client-side only, then scale, then completeness, then the account lifecycle and server hardening.

| Phase                                                  | Scope                                                                                                                                                                                                                                                                 | Needs approval for                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **7.8B Sync safety and failure handling**              | H1 identical-contents auto-resolution · H3 timeouts, stop on first failure, manual sync ignores back-off, Restore Cancel · H2 import keeps timestamps plus a bulk choice · M4 what differs, Keep both, resolution in `Repository` · M5 · M3 catalogue id test and friendly hold-back · L1 · L3. Regression tests for every probe above | Nothing beyond this plan (client-only; no schema or policy change)   |
| **7.8C Scale and visibility**                          | M6 incremental download, one queue read, chunked apply with Restore progress · M8 "Last synced" and a gentle reminder (no automatic sync) · test with a synthetic three-year account                                                                                     | Nothing (client-only)                                                 |
| **7.8D Completeness and forward compatibility**        | M7 favorites sync and reminder permission after restore · M2 unknown-field preservation and schema-version guard, backup version policy · M1 field-level profile merge and per-phone preferences · L6 · L7                                                                | D3, D4; one local migration                                           |
| **7.8E Account lifecycle and server hardening**        | P3 deletion workflow · M9 recovery guidance · L2 privileges SQL, two-account and deletion tests · L5 · L4 retention                                                                                                                                                    | Any Supabase SQL; P3                                                  |

Move the founder's phone to the native build (section 10) **no earlier than after 7.8B**. After 7.8D, favorites come along too.

## 8. Physical-device checks after 7.8B

Airplane mode during Sync; switching apps mid-sync; Restore on weak signal; Cancel; restoring a backup into the same account; one workout edited on two phones.

## 9. Decisions requested

- **D1:** Approve the order above and the 7.8B scope (client-only).
- **D2:** Add **Keep both** to conflicts for workouts, journal entries and templates (M4).
- **D3:** Favorites sync as journal records of a new kind (M7). Recommended over a profile field, because it avoids profile conflicts.
- **D4:** Which preferences stay per phone (M1). Recommended: theme and reminders on/off per phone; everything else follows the account.
- **D5:** Timing of the native-build move (H4). Recommended: after 7.8B at the earliest, after 7.8D to keep favorites.
- **D6:** Server changes (L2 privileges, L5 quotas, L4 retention) are approved separately in 7.8E.

## 10. Runbook: moving a phone from Expo Go to Forge's own build

1. In Expo Go, open Account & privacy and Sync until it says "No local changes waiting to upload" with no conflicts.
2. Export a backup, which includes favorites, and save it off the phone (Files or iCloud Drive).
3. Install the native build, sign in with the same account, and choose **Restore Your Training**.
4. Compare: workout count, latest workout, active Forge Path, recent food log, latest measurements.
5. Until M7 ships, star favorites again by hand. Until 7.8B ships, don't import the backup on top of a restore (H2). It stays as a safety copy.
6. Keep Expo Go, and Forge's data in it, until the native build has been used for a while.
7. Keep the bundle identifier `com.lsaint06.forge` for development, TestFlight and App Store builds.
