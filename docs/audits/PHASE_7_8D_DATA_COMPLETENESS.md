# Phase 7.8D: Data completeness and cross-version safety

Implementation report. Baseline: `feat/forge-paths-foundation` at `8956378`. Approved by the founder on Nov 1, 2026, after the final verification pass (section 11).

**Unchanged:** Supabase SQL, row-level security, server functions and the RPC; authentication and account ownership; the 7.8B conflict safety and the 7.8C incremental download; the splash screen and every screen's design. Sync is still manual only.

**Changed locally:** one additive SQLite migration (v3, three new tables). The backup file is still version 1, with one new optional section.

## 1. Before and after

| Situation | Before 7.8D | After 7.8D |
| --- | --- | --- |
| Favorites on a new phone | Lost. Only backup files had them | Restored with the account |
| Unfavoriting on one phone | Never reached other phones | Removes the star everywhere; it never comes back on its own |
| Two phones change **different** profile settings | Whole-profile conflict; either choice loses the other change | Merged automatically |
| Two phones change the **same** setting differently | Whole-profile conflict | A choice for that setting only; both answers keep every other change |
| An older build edits a profile a newer build extended | The new setting is erased everywhere | The setting is kept and sent back untouched |
| An older build edits a workout, template or entry a newer build extended | The new fields are erased everywhere | The record is shown but can't be changed or deleted ("Update Forge…"); the cloud copy is never replaced |
| A backup made by a newer Forge | Rejected with a validation error | Refused with "This backup was made by a newer version of Forge…" |

## 2. Favorites (Objective 1, decisions D1 and D2)

- **Record:** one synced journal entry per exercise, kind `favorite`, id `favorite:<exerciseId>`, data `{ exerciseId }`. Two phones starring the same exercise write the same record, so duplicates are impossible.
- **Unfavoriting** deletes the record and queues a tombstone, as every other journal deletion does. A phone that had the star applies the deletion; restoring elsewhere never brings it back.
- **Identity, not timestamps:** two copies of the same favorite are the same record regardless of when each phone starred it (`compare.ts`), so they settle without a choice.
- **Opposite actions (D2):** one phone unstars while another still has the star changed: this is an explicit conflict card ("Favorite exercise · Back Squat": "Favorite on this phone" / "Removed from favorites on another device"). Nothing is decided silently.
- **Offline:** toggles queue like any change; repeated toggles collapse into the latest state.
- **Older builds on the same phone:** the old `favorites` table is kept in step, so a build from before 7.8D opening this database still sees the list. Such a build changes only that table, and keeps favorite records it downloads as an unknown kind (Phase 7.3C). At every start, this build compares three things to tell which side changed: the old table, the synced records, and `favorites_seen` (the old table as this build last left it, with the cloud revision it had seen of each). Revisions, not timestamps, show whether the cloud moved on:
  - **Only in the old table** (listed before the update, or starred there since): queued as **new** (revision 0). One the cloud already has settles on its own; one another device removed becomes a choice, because the write can't replace the cloud's deletion.
  - **Only a synced record, and listed when last seen** (unstarred under the older build): the removal is queued. If the record's revision moved on meanwhile (the older build downloaded another device's change), the removal is queued as new, so the cloud asks instead of this phone deciding.
  - **Only a synced record, never listed** (downloaded by the older build): it's added to the old table.
  
  A removed favorite is never silently resurrected. One favorite that can't be settled (for example an unreadable row) is left exactly as it was for the next start and never stops Forge from opening.
- **Exercises this build doesn't know:** the favorite is kept and synced but not listed.
- **Backups:** carry favorites as records and in the old `favorites` list (for older builds). A backup from before 7.8D restores its list as records, once each.

## 3. Profile merge (Objective 2)

The phone now keeps the **merge base**: the cloud's copy of the profile as it last saw it, at that revision (`sync_base`). When this phone has a profile change waiting and the cloud's copy has moved on, each field is decided against the base:

| This phone | Cloud | Result |
| --- | --- | --- |
| unchanged | changed | the cloud's value |
| changed | unchanged | this phone's value |
| changed to X | changed to X | X |
| changed to X | changed to Y | a choice for that field |
| cleared | changed (or the reverse) | a choice for that field |

- **No timestamps:** the result depends only on contents and revisions, so it's the same whichever phone syncs first (tested both ways).
- **Missing vs cleared:** a field absent from a version whose writer knew the field is a clearing. A field absent because the writer's version predates it (`PROFILE_FIELD_FORMAT`), or a field this build doesn't know, keeps its value.
- **Never a broken profile:** the merged profile must pass the profile's rules (for example minimum reps ≤ maximum reps). If it doesn't, the athlete chooses, and each choice is one side's whole set of changed fields.
- **The conflict card** lists only the settings the athlete decides. *Keep local version* and *Use cloud version* both keep every change that didn't conflict, from both sides.
- **Edits during a sync:** a merge only replaces the exact change the sync read; an edit made meanwhile is kept and merged on the next sync.
- **A saved conflict** that later becomes mergeable (for example after the athlete edits the setting to match) settles on the next sync.
- **No base yet** (a profile change waiting since before 7.8D): the first conflict falls back to the whole-profile choice as before, and *Keep local version* still keeps settings this build doesn't know.

## 4. Cross-version rules (Objective 3, decision D3)

**Format marker.** Any record may carry `forgeFormat: { version, minReader }`; none means format 1. This build reads and writes format 1 and **stamps nothing**, so everything it uploads is exactly what earlier builds already read (tested). The rule for future builds: adding a field anywhere in a record (journal `data` keys included) raises that record type's `version`; a change older builds would misread also raises `minReader`.

| Cloud record | Profile, custom exercises | Workouts, templates, journal entries |
| --- | --- | --- |
| `minReader` above this build | Held, untouched ("Update Forge…") | Held, untouched |
| Newer format, or fields this build doesn't know | Applied; unknown fields kept and sent back with every change | Shown; kept verbatim in `newer_records`; changing or deleting it is refused |
| Newer format that fails this build's validation | Held, not counted as unreadable | Held, not counted as unreadable |

- **Enforced in the data layer (D3):** `Repository.queue` refuses any change or deletion of a protected record, inside the same transaction, so no screen can bypass it. All UI mutation sites already report errors through `mutate`/`confirm` (verified), so the athlete sees "This workout was saved by a newer version of Forge. Update Forge on this phone to change or delete it." Undo-deletes are refused before the item is hidden.
- **Conflicts:** *Keep local version* is refused when the cloud copy has fields this build doesn't know (as 7.8B already did for unknown exercises); the card explains why both choices wait.
- **After updating Forge:** kept copies are read again at start-up; once a build understands one, it's applied and becomes editable. A kept copy replaced by a later version of the record is dropped.
- **Backups:** stay version 1. Unknown profile and custom-exercise fields stay in the file, and protected records travel verbatim in an optional `newerRecords` section that earlier builds ignore. Restoring keeps them protected and re-uploads them exactly as received. A backup with a version above 1 is refused with a clear message.

## 5. Local migration (v3)

- **Additive:** three new tables (`sync_base`, `newer_records`, `favorites_seen`) with `CREATE TABLE IF NOT EXISTS`. No existing table, column or row is rewritten or removed.
- **Transactional and idempotent:** the tables, the merge base and the version marker are written in one transaction. The favorites conversion runs in its own transaction at every start (section 2), each favorite in its own savepoint. An interrupted start leaves the database exactly as it was; the next start completes it; repeated starts change nothing more (tested, including interruptions at two points).
- **Pending changes preserved:** every waiting change is kept byte for byte through the update and later starts (tested). The only additions are the favorite records and their queued uploads.
- **Older builds** still open a v3 database unchanged (tested by running the pre-7.8D start-up steps against it).
- **Local data deletion** also clears the three new tables.

## 6. What the athlete sees differently

- Favorites come back after a restore or on a new phone, and unfavoriting syncs.
- Fewer profile conflicts; the remaining ones name only the setting to decide.
- Two new conflict titles ("Favorite exercise · …") and a reason line for records saved by a newer Forge.
- On a phone running an older build than another device, some records may show "Update Forge on this phone to change or delete it."
- After updating, existing favorites appear as changes waiting to upload until the next sync.

## 7. Verification

**Results (Nov 1, 2026, macOS, Node 26; final verification pass, section 11):**

- TypeScript: passes.
- ESLint: 0 errors. The 1 warning is pre-existing (`tests/ui/templates-wp3.test.tsx`, unchanged).
- Prettier: passes.
- Logic tests: 673 of 673 pass in each of 10 consecutive full runs. `tests/data-safety.test.ts` also passed 40 of 40 repeat runs.
- UI tests: 700 of 700 pass in 70 suites, run on the 1st of the month, the day the calendar tests used to fail.
- iOS and Android production exports: pass.

**New tests (46 logic, 3 UI):**

- **Migration (6):** additive with every row and waiting change kept; no merge base while a profile change waits; interruption, retry and repeated start-up; waiting changes byte-identical through the update and later starts; a fresh phone; an older build opening a v3 database.
- **Favorites (16):** sync and restore; deletion propagation that never resurrects; offline changes collapsing; the same star on two phones; opposite actions as an explicit choice (both answers); a phone updated from before 7.8D, including an older client's pending upload; lost replies; account ownership; unknown exercises; backups both ways; an older build on the same phone (its unstar, its downloads, a removal it downloaded, an unstar of a record that changed meanwhile); an unreadable favorite that can't block start-up; two phones updated from before 7.8D; an updated phone's favorite against a removal in the real `forge_write` (PGlite).
- **Cross-version (9):** newer profile and custom-exercise fields surviving edits, sync, restore and backups; protected workouts, templates and journal entries (Undo-delete included); unreadable formats held; re-reading after an update; newer backups refused; unknown fields through the real `forge_write` and `jsonb` in Postgres (PGlite); what this build sends is exactly what older builds read.
- **Profile merge (15):** independent edits (both orders); the same edit; the same field changed differently; clearing vs missing; fields older and newer builds don't know; merges that would break validation; two-phone merges both ways; resolution keeping everything else; a saved conflict settling; a lost reply mid-merge; an edit during a sync; an older build's upload without a newer field; the pre-7.8D whole-profile fallback; account isolation.
- **UI (3):** a profile card showing only the decided setting; a favorite conflict card; the reason line for a newer record.
- **Updated tests (3):** the v2 migration test now expects migration 3 and the favorite record added at the upgrade; the legacy backup test counts that favorite record; the M3 conflict test checks the reason text. In the final pass (section 11), the two calendar tests pin their date and the backup-state test uses a fixed clock. The account test also checks that `favorites_seen` is cleared, and the PGlite helper moved into `tests/cloud-fixture.ts`.

## 8. Remaining risks

1. **Not yet verified on the iPhone.** Everything above ran against the real engine and SQLite, and once against the real Postgres function, but not on a device or the live project.
2. **Mixed builds on two devices:** a build from before 7.8D still strips unknown profile fields when it saves, never syncs favorites, and doesn't honour the protection rules. Update every device.
3. **One phone, two builds:** if the Mac and the Windows PC serve the same Expo Go copy at different commits, favorite changes made under the older build are taken in at the next 7.8D start (section 2), but sync only from then. Two cases become a choice rather than being applied silently: a removal the older build downloaded while the old table still lists the favorite, and an unstar under the older build after it uploaded that favorite for this build. Profile merges fall back to whole-profile choices until a base exists.
4. **Free-form journal keys:** a newer build that adds a `data` key to an existing journal kind must raise the format, or older builds can't tell it apart from an ordinary key. The rule is documented in `src/domain/format.ts`.
5. **Favorites from before 7.8D are combined:** builds before 7.8D kept each phone's list separately and recorded no removals. The first sync after updating gives the account every favorite any phone still had (tested), so an exercise unstarred long ago on one phone reappears there if another phone still had it.

## 9. Decisions (founder review, Nov 1, 2026)

- **D1, favorites as per-exercise journal records:** approved, as implemented.
- **D2, explicit conflicts for opposite favorite actions:** approved, as implemented.
- **D3, protecting newer records in the data layer:** approved, as implemented; change and deletion are both refused.
- **D4, per-phone theme, reminders and notification permission:** deferred to a future phase.

## 10. iPhone tests (Expo Go)

1. **Favorites follow the account.** Star two exercises, sync. On a second device (or after Restore Your Training on an empty phone), sync: both are starred.
2. **Unfavorite spreads.** Unstar one on the first device and sync; sync the second: it's gone, and syncing again doesn't bring it back.
3. **Independent profile edits.** Change the rest timer on one device and the calorie goal on the other; sync both, then the first again. Both changes appear on both, with no conflict card.
4. **Same setting, two values.** Change your display name on both devices to different names; sync both. One conflict card shows only "Display name". Either choice keeps every other change.
5. **Opposite favorite actions.** With an exercise starred on both, unstar it on one and sync; on the other, unstar and star it again, then sync. A "Favorite exercise · …" card appears; choose either answer and sync both.
6. **Upgrade.** Before updating, note your favorites. After updating, they're unchanged and show as waiting to upload; sync once and they reach the account.
7. **One phone, two builds (optional, Mac and Windows sharing one Expo Go copy).** Star two exercises and sync under this build. Open the phone from a checkout before 7.8D, unstar one, then open this build again: it stays unstarred, and the next sync removes it on other devices too.

## 11. Final verification pass (Nov 1, 2026)

1. **Calendar UI tests on the 1st of the month: a test assumption, not a calendar bug.** The day picker (`DateSheet` with `range="past"`) always allows Previous month, so on the 1st yesterday is one tap back. The tests assumed yesterday was in the current month. They now pin the date mid-month. Only `Date` is faked and rendering timers stay real, as `tests/ui/legacy-workouts.test.tsx` already does. A new test pins the 1st and reaches yesterday through Previous month. They pass in three time zones covering Nov 1 and Nov 2. No product code changed.
2. **Backup reminder test: a timing assumption in the test, not an app issue.** A workout finished in the same millisecond as a backup counts as backed up. That's correct: `exportBackup` reads the data synchronously at `exportedAt`, which is the time recorded for the backup. In the app, a backup and a finished workout are always separated by the athlete's taps and the file write. The test ran its steps back to back, so they sometimes shared a millisecond. It now uses a fixed clock. A new test pins the boundary: a finish in the backup's millisecond is in it, one a millisecond later isn't. 40 of 40 repeat runs passed; the baseline failed 3 of 12. No product code changed.
3. **Favorites migration safety.** Confirmed for two devices and for the cloud: favorites from before 7.8D are only ever sent as new (revision 0). `forge_write` refuses a write whose base isn't the cloud's revision, so a deletion in the cloud is never replaced; it becomes a choice. This is now also tested against the real Postgres function. Two gaps were found and fixed:
   - **Resurrection with two builds on one phone:** an older build's unstar changed only the old table, so this build showed the favorite again and never synced the removal. Fixed with `favorites_seen` and the start-up comparison in section 2.
   - **Start-up failure:** one unreadable row in the old table made the favorites conversion throw, so Forge couldn't open. Each favorite is now settled in its own savepoint; one that can't be settled is left exactly as it was.

   The comparison first told a changed record apart by its timestamp. A repeat run of the full suite caught that: records made in the same millisecond are identical, so a change was missed. It now uses only cloud revisions, which this build notes whenever it confirms, rebases or applies a favorite. The test now freezes the clock, so the records are always identical. Favorite records saved by a newer Forge are never changed by this comparison (D3). Each new safeguard was checked: removing it makes at least one test fail.
4. **Pending changes and ownership.** Every change waiting from before the update comes through the update and later starts byte-identical, and so do this build's own offline changes (tested). Another account's sync is still refused, and switching accounts starts from cleared data, including the new table (tested).
5. **Checks:** all pass, with no remaining failures (section 7).

Product code changed in this pass: `src/data/repository.ts` (the start-up comparison, `favorites_seen` kept in step and cleared with local data) and `src/data/schema.ts` (the `favorites_seen` table, in v3). No UI, splash screen, Supabase schema or unrelated feature changed.
