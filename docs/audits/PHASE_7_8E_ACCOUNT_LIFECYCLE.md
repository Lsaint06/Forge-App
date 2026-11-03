# Phase 7.8E: Account lifecycle and server hardening

Implementation report. Baseline: `feat/forge-paths-foundation` at `e541339`. Stage 0 (redirect security) is verified and complete on the live project. Stage 1 is committed and pushed (`3409972`, `13eb666`). Stage 2 (safe account deletion, section 9) is committed and pushed (`7faef77`), followed by the founder-approved corrections from the final Stage 2 review (section 10), committed and pushed as `7204da4`. Stages 3–6 (sections 11–17) are committed locally, one commit per stage (section 16), and not pushed; nothing is deployed or activated.

**Unchanged in Stage 1:** Supabase SQL, row-level security, functions and the live project's settings; sign-in providers and their flows; account ownership rules; the sync engine and the 7.8B–7.8D safeguards; the splash screen and screen designs (one new action and some wording only).

**Unchanged in Stage 2:** Supabase SQL (the migration is byte-identical), the live project and its dashboard, sign-in providers and Apple, PKCE (not started), the entry gate's ownership rules, the sync engine (`src/cloud/sync.ts`), the splash screen, REFORGE components, Forge Paths, workouts, Nutrition and Progress. No live account was deleted or touched.

**Unchanged in Stages 3–6:**
- **Live project:** the project, its dashboard settings and its users. The baseline migration is byte-identical; the hardening migration is new and **not deployed**.
- **Sign-in:** sign-in flows and providers. PKCE and email codes are prepared but inactive.
- **Untouched:** Apple; the sync engine; the splash screen and REFORGE components; Forge Paths, Nutrition and Progress; `app.json`, `eas.json` and the dependencies.
- **No live account was created, changed or deleted.**

## 1. Decisions (founder review, Nov 1, 2026)

| | Decision | Status |
|---|---|---|
| E1 | Account deletion with an export opportunity, local-data choices and recovery from interruptions; never silently destroy unsynced training | **App side done in Stage 2**; keeping local data after deletion awaits decision D1 (section 9) |
| E2 | Recent reauthentication before deletion, enforced on the server too; review Google and future Apple | **App-side check in Stage 2**; server check in Stage 3 (draft SQL, section 9) |
| E3 | Sign out of this device by default; a separate all-devices action | **Done in Stage 1** |
| E4 | Finish an active workout safely after an unexpected sign-in loss, with no cloud writes while signed out | Approved in principle; Stage 4 |
| E5 | PKCE for email links, after a compatibility assessment | Approved in principle; Stage 5 |
| E6 | Separate development and production Supabase projects before external testing; nothing created or switched automatically | Direction approved |
| E7 | Server migration | Planning only; the exact SQL needs separate approval |
| E8 | Apple authorization revocation | Prerequisite for public App Store release |
| E9 | Remove unreachable legacy account forms | **Done in Stage 1** |
| E10 | Live verification with throwaway accounts, preferably in a development project | Direction approved |

## 2. Audit findings

| | Severity | Finding | Status |
|---|---|---|---|
| H1 | High | Deleting the cloud account leaves the phone's training (then the only copy) owned by a deleted account, with no way to export it | **Fixed in Stage 2:** export offered first, then removed after a confirmed deletion; other devices' copies stay locked (section 9) |
| H2 | High | The redirect allow list accepted any `exp://` and `exps://` address, so a reset link chosen by someone else could deliver a sign-in to their own Expo Go project | **Fixed and verified live (Stage 0)** |
| M1 | Medium | No reauthentication before permanent deletion | **App-side check (Stage 2)**; server check Stage 3 |
| M2 | Medium | Email links carry the sign-in itself over the `forge://` scheme (implicit flow) | Stage 5 (PKCE) |
| M3 | Medium | Sign out ended the sign-in on every device | **Fixed (Stage 1)** |
| M4 | Medium | An unexpected end of the sign-in leaves an active workout | Stage 4 |
| M5 | Medium | An interrupted deletion isn't recorded or recovered | **Fixed (Stage 2)** |
| M6 | Medium | Delete all local data didn't mention changes never synchronized | **Fixed (Stage 1)** |
| M7 | Medium | Default email service (team addresses only) and a localhost Site URL | Dashboard, before release |
| L1 | Low | The offline sign-out notice said the sign-in "expires on its own" | **Fixed (Stage 1)** |
| L2 | Low | An unusable reset link gave no feedback | **Fixed (Stage 1)** |
| L3 | Low | After deletion, a still-valid sign-in fails record by record | **Fixed in the app (Stage 2):** sync asks first and stops once, saying the account no longer exists |
| L4 | Low | `synchronize` still claims a phone with no owner (unreachable) | Later |
| L5 | Low | Unreachable legacy sign-in form in Account & privacy | **Removed (Stage 1)** |
| L6 | Low | Table privileges wider than needed (not reachable through the API) | Baseline tested (Stage 1); revoke in E7 |
| L7–L10 | Low / info | Auth settings not yet read; no quotas; live deletion untested; the iOS Keychain keeps the sign-in across a reinstall | Stage 0 checklist; later |

## 3. Stage 0: redirect security (read-only, live)

**Method.** Requests to the public Auth API with an invalid token: Supabase sends the browser back to `redirect_to` only when its allow list accepts the address, otherwise to the Site URL. No email was sent, and no user, session or setting changed. Supabase Auth v2.197.0.

**Before.** `exp://` and `exps://` addresses with any host were accepted, including another Expo account's tunnel (H2). `forge://` accepted any path.

**Facts used for the fix:**
- SDK 58 tunnels are issued to an Expo account: `c-lstamand-97rrx8-<16 lowercase letters or digits, new on every start>.on.expo.app`. Tunnels without an account use `boltexpo.dev`. The tunnel serves Forge over HTTPS, so Expo Go returns to `exps://`.
- Supabase matches entries with `gobwas/glob` v0.2.3 (`.` and `/` as separators), checked against its own `IsRedirectURLValid` from v2.197.0. `*` can't cross `.` or `/`, but it does match `@` and `:`, so `exps://c-lstamand-97rrx8-*.on.expo.app/--/**` would accept `…-x@<another account's tunnel>…`. Sixteen `?` don't.
- Character ranges such as `[a-z0-9]` don't compile in that library, and Supabase compiles entries with a function that stops on an invalid one.

**After.** The allow list holds exactly four entries (README → Redirect URLs):

```text
exps://c-lstamand-97rrx8-????????????????.on.expo.app/--/**
forge:///welcome
forge:///sign-in
forge:///account
```

**Verified** (final run, 13 of 13; an earlier 25-check run found and fixed a two-slash `forge://account` entry):

| Check | Result |
|---|---|
| A brand-new tunnel's Google, email-confirmation and password-reset returns | Accepted |
| `forge:///welcome`, `forge:///sign-in`, `forge:///account` | Accepted |
| `forge://account` (two slashes) | Refused |
| Any `exp://` or `exps://` host, any `on.expo.app` host, another Expo account's tunnel | Refused |
| `user@` and `user:password@` addresses pointing at another account's tunnel | Refused |
| Sign-in service health | HTTP 200; settings unchanged (Google and email; anonymous sign-ins off; email confirmation required) |

**Remaining (low):**
- A 16-character `x@<14-character host>.on.expo.app` address still matches, but Expo doesn't issue such names.
- Supabase always accepts any `http://localhost:<port>` (the Site URL's host) and loopback IP addresses.
- The tunnel entry relies on Expo issuing `c-lstamand-97rrx8-…` names only to that account; remove it from any project real athletes use (E6).

**Still open from Stage 0:**
- the read-only SQL report (kept outside the repository), especially checks 6, 9, 10 and 11;
- the dashboard checklist;
- `npx expo whoami` on Windows.

## 4. Stage 1 changes

### Device-specific sign-out (E3)
- **Sign out** asks Supabase to end only this device's session (`scope: "local"`). The account's other devices stay signed in. Offline, the existing safe fallback still applies: Forge removes the stored session from this phone and says so.
- **Sign out of all devices** (Account & privacy, after a confirmation) ends every session of the account (`scope: "global"`). Welcome then says other devices sign out the next time Forge renews their sign-in (usually within an hour). Offline, or if the service refuses, nothing changes and the reason is shown; this phone stays signed in rather than pretending.
- Neither action touches local data: training, its owner and every change waiting to sync stay on each device (tested).
- Files: `src/auth/session.ts`, `app/account.tsx`; the fallbacks in `src/screens/entry/AccountCheck.tsx` and `Setup.tsx`, used only outside the entry gate, also end just this device's sign-in.

### Server security baseline (tests only)
`tests/server-security.test.ts` runs the unchanged migration in Postgres (PGlite), set up as Supabase sets up a project: its API roles, `auth.uid()` from the request's JWT claims, Supabase's default privileges, and one transaction per request in the caller's role. It checks:
- **Two accounts, same IDs:** each account keeps its own record under the same ID. A conflict only ever shows the caller's own record, and an ID only another account uses looks empty.
- **No impersonation:** a caller can only write as themselves; `forge_write` has no owner parameter, and an owner named in a payload is only data.
- **No direct writes:** no API role can insert, update or delete directly.
- **Signed-out callers** see no rows and can't run either function. A signed-in request that names no user is refused.
- **Deletion:** deleting an account removes its identities and cloud records, and only its own. Afterwards, its still-valid sign-in can't write or read, and deleting again is harmless.
- **Limits:** identity length, revision, kind, kind changes and the 5 MB payload cap hold.
- **Baseline (L6):** under Supabase's defaults the migration leaves `SELECT` for anon and `TRUNCATE`, `REFERENCES` and `TRIGGER` for both API roles, plus `MAINTAIN` on Postgres 17 and later (found in the Stage 3–6 review). None is reachable through the Data API. E7 revokes them, and this test changes with it.

Each guarantee was checked against a deliberately broken copy of the migration (an open read policy, direct writes granted, no caller check, anon allowed to write, deletion of every account, no cascade). Every break was caught.

### Documentation
- **README:** the outdated redirect instructions are replaced by **Redirect URLs (Phase 7.8E)**, which lists:
  - the four verified entries;
  - the tunnel entry's development-only, single-account limits;
  - a ban on broad patterns and character ranges;
  - the three-slash rule.

  The sign-out notes and the local-deletion sentence are updated too.
- **`PHASE_7_7A_ONBOARDING_AUDIT.md`:** the two wildcard instructions are marked superseded.
- **`IMPLEMENTATION_STATUS.md`:** two rows updated.

### Legacy account form removed (E9)
- **Unreachable, confirmed:** Account & privacy is mounted only in the entry gate's `ready` state, which always carries the signed-in user and requires a configured cloud client. Deep links are redirected by the same guard.
- **Removed:** the Sign in / Create account / Reset password form, its handler and its mode switcher. Outside the gate, the card now just says "Not signed in".
- **Kept:** the Account screen's handling of a reset link opened while signed in, and every entry screen (Welcome, Sign in, Create account, recovery).
- **Left for later:** the old "guest mode" card for builds without a cloud project, also unreachable but not a form.

### Account safety wording (M6, L1, L2)
- **M6:** before anything is deleted, **Delete all local data** shows the number of changes never synchronized, on the row and in its confirmation, and says they would be lost for good. The confirmation says what a later sync can restore (synchronized training) or, for training linked to no account, that only a backup file can. The other-account screen uses the same sentence.
- **L1:** the offline sign-out notice now says the sign-in was removed from this phone only, and how to end it everywhere.
- **L2:** a reset link whose sign-in can't start shows a plain notice on Welcome, distinguishing a connection problem from an unusable link. A link cut short is explained on Welcome and Sign in. Opened while signed in, a failure shows plain words instead of the server's message.

### Daylight-saving-sensitive tests (final review)
- **Cause:** three UI tests (`goals.test.tsx` "a lift already done before the goal…", and `you-performance.test.tsx`'s two weeks-consistent tests) made "N days ago" by subtracting N × 24 hours, then compared calendar days. Within ten days after a daylight-saving change, one day has 25 or 23 hours. In the last hour of the day (or the first, after spring-forward) the subtraction lands on a neighbouring day, or in the wrong week. They failed this way on the unchanged committed code on Nov 1 (US daylight saving ended that morning).
- **Not an application defect:** Forge dates a workout by the local calendar day it finished (`localDate(finishedAt)`), and counts weeks and days with calendar arithmetic at local noon (`addDays`, `mondayOf`). A workout that finished at 00:21 on Oct 23 is correctly reported as achieved on Oct 23. No production code changed.
- **Fix (tests only):** each fixture now finishes its workout at local noon on a calendar date, which a one-hour shift can't move to another day. Each of the three tests pins its "now" (`tests/ui/clock.ts`; only `Date` is faked) to 23:30 on Nov 1, 2026, the moment that failed, so it stays deterministic and doubles as a regression guard.
- **Verified:**
  - **Boundary sweep:** the three tests pass at 11 moments around daylight-saving changes (US fall-back night and its repeated hour, just after midnight and a week later; US spring-forward before and after the gap and early the next Monday; the EU fall-back; Australia's spring-forward and fall-back), each in its own time zone, and in UTC.
  - **Guard check:** with the old 24-hour fixtures restored, all three fail in Pacific time at the pinned moment and pass in UTC.
  - **No others:** three other tests use 24-hour offsets (a sync 30 days old, "Training since" any month, a confirmation 12 days old). Their assertions don't depend on the calendar day, and they passed inside the same window.

## 5. Verification (final, Nov 1, 2026, 23:30 PST, macOS, Node 26)

All suites ran inside the window in which the three date-sensitive tests used to fail: the last hour of the day US daylight saving ended.

- TypeScript: passes.
- ESLint: 0 errors. The 1 warning is pre-existing (`tests/ui/templates-wp3.test.tsx`).
- Prettier: passes.
- Logic tests: **683 of 683** pass (673 before, plus 9 server and 1 recovery-link test).
- UI tests: **712 of 712** pass in Pacific time, and **712 of 712** in UTC (700 before, plus 12).
- iOS and Android production exports: pass. The bundles are byte-identical to the Stage 1 export made before the test fix, confirming it touched no app code.
- **Diff review:** 21 files (19 changed, 2 new: this report and `tests/server-security.test.ts`).
  - **Untouched:** Supabase SQL, the splash screen, the root layout, the theme and REFORGE components, assets, app and build configuration, packages, and `.env.example`.
  - **Not included:** generated artifacts, caches and local env files.
  - **Secrets:** none. No project URL or ref, no key, token or personal email; the Expo account name appears only inside the approved redirect entry.
  - **Line endings:** each file keeps its original endings (the 7.7A audit stays CRLF).

**New tests:**
- **Logic (10):** the 9 server tests above, and broken reset links recognized.
- **UI (12):**
  - all-devices sign-out: asks first, ends every sign-in, keeps local data; offline, changes nothing;
  - each sign-out reaches the gate with its kind;
  - ordinary and all-devices sign-out through the real entry gate, with training, owner and waiting changes kept;
  - offline all-devices sign-out leaves this phone signed in;
  - reset links failing on Welcome (unusable or offline), while signed in (both), and cut short;
  - never-synchronized counts before local deletion.

**Updated tests (7):**
- The Account screen's signed-out test now checks that no sign-in form exists.
- The sign-out assertion checks the scope.
- The offline notice test checks the corrected wording.
- The guest-mode deletion test checks the new, accurate confirmation.
- The three daylight-saving-sensitive tests use calendar dates and a pinned clock (section 4).

## 6. Remaining risks

1. **Not yet verified on a device.** Supabase's sign-out scopes and the new wording ran against tests and the real client library, not on the iPhone.
2. **Other devices sign out after up to one access-token lifetime** (Supabase's default is one hour; the setting isn't read yet).
3. **After an offline sign-out**, the server's session for this phone stays until it's ended with Sign out of all devices; it can't be used, because this phone no longer holds it.
4. **The L6 grants are still live** (not reachable through the API) until the E7 migration.
5. **Deletion (H1, M1, M5), PKCE (M2) and workout continuation (M4)** are unchanged until their stages. *(Deletion: Stage 2, section 9.)*
6. **Date coverage:** the complete suites ran in the real fall-back window, and the three fixed tests ran across 11 daylight-saving moments in 4 time zones. The complete suites have not run inside a spring-forward window, because the system clock can't be moved.

## 7. iPhone tests (Expo Go)

Global sign-out ends the sign-in on every device, so be ready to sign in again everywhere. None of these steps deletes data.

1. **Sign out affects one device.** With two devices signed in, sign out on one. The other stays signed in. Signing back in on the first opens its training, and waiting changes sync as before.
2. **Sign out of all devices.** In Account & privacy, choose it and confirm. Welcome explains what happens. The other device signs out within about an hour (or when reopened after that), and both keep their training.
3. **Offline.** In airplane mode, Sign out of all devices shows a connection message and stays signed in. Plain Sign out signs out with the corrected notice. Back online, sign in: the same training is there.
4. **Unsynchronized changes.** Log something offline, then open Delete all local data. The row and the confirmation give the count. Cancel.
5. **Reset links.** Open a reset email that was already used: Welcome explains it and points to Forgot password.

## 8. Next stages

- **Stage 2:** account deletion (P3), with an export opportunity, local-data choices, recovery from interruptions and client reauthentication. *Implemented: section 9.*
- **Stage 3:** server migration (E7): revoke the L6 grants, check recent sign-in before deletion, refuse anonymous users. Exact SQL for separate approval, in a development project first.
- **Stage 4:** finishing an active workout after an unexpected sign-in loss (E4).
- **Stage 5:** PKCE (E5) and separate development and production projects (E6).
- **Stage 6:** live tests with throwaway accounts (E10). Apple revocation (E8) is required before App Store release.

## 9. Stage 2: safe account deletion and lifecycle recovery

Baseline `13eb666`. App-side only: the Supabase migration, the live project and the dashboard are unchanged, and nothing was run against the live service.

### Flow
Account & privacy → **Delete Forge account** (the old one-step "Delete cloud account" row is gone) opens a separate screen (`app/delete-account.tsx`, reachable only in the entry gate's `ready` state). It is built from the existing REFORGE pieces: sub-screen frame, cards, danger row, backup choices, password field and Google button.

1. **What deleting means.**
   - **In the cloud:** the account and everything saved to it are deleted permanently.
   - **On this phone:** what it holds, how many changes were never synchronized, and that it is removed only once the deletion is confirmed.
   - **Other devices:** they're signed out when their sign-in renews, and their copy stays locked to the deleted account.
   - **Signing up again** with the same email creates a new, empty account.
   - **A backup is a file, not the account.**
   - **Only want to clear this phone?** Use Delete all local data instead.
2. **Export first.** The existing backup choices. A folder save is reported as "saved and checked"; a share as unconfirmed; a cancelled or failed export claims nothing. The athlete may continue without a backup (a secondary button); the final step says which happened.
3. **Confirm it's you.** A password (email accounts) or Google (Google accounts). Accounts that sign in only with Apple, or with Google where Google can't open (Expo Go on a local address), are told they can't delete here yet.
4. **Final.** What will happen, the never-synchronized count, the backup status, then a danger row and one more dialog ("Delete your Forge account?" / "Delete account").
5. **Working, then the outcome.**
   - **Deleted:** this phone is signed out, its training removed, and Welcome says so.
   - **Not confirmed:** nothing is removed; offers **Check again** and an export.
   - **Didn't go through:** offers **Keep my account** or **Try again**.

Leaving at any step before the final dialog changes nothing (tested).

The engine is `src/auth/account-deletion.ts` (no React Native imports; tested in Node):
- **Marker.** Before the request it writes `{owner, state: "requested", at}` to local settings. The marker holds the account ID, a state and a time only: never a token, password or email (tested).
- **Success** (`forge_delete_account` returns no error, so the account row no longer exists):
  1. the marker becomes `deleted`;
  2. this phone's sign-in ends (local scope; the stored session is removed even if the service can't confirm it);
  3. the training is removed with `clearData()`, but only if it still belongs to that account;
  4. a record `{owner, at, localRemoved, source}` is kept for the notices.
- **Any failure is checked, never guessed.** The account service is asked about the signed-in account:
  - "user not found" means deleted, so the steps above are finished;
  - the same account still there means **not deleted** (nothing changed);
  - no answer, or another sign-in, leaves it **uncertain**: the marker stays and nothing is removed.

### Files
- **New:**
  - `src/auth/account-deletion.ts`: the engine, marker and record;
  - `src/auth/reauth.ts`: same-account confirmation;
  - `src/screens/you/DeleteAccount.tsx` and `app/delete-account.tsx`;
  - `tests/account-deletion.test.ts`, `tests/reauth.test.ts` and `tests/ui/delete-account.test.tsx`.
- **Changed:**
  - `src/auth/social.ts`: Google's sheet is shared by sign-in and confirmation; confirmation adds `login_hint`; sign-in is unchanged.
  - `src/auth/session.ts`: `signOut({ deleted })`, now a stable callback; the entry context carries a deletion notice.
  - `src/cloud/client.ts`: `verifierClient()`, a client that stores and refreshes nothing.
  - `src/cloud/errors.ts` and `src/cloud/transport.ts`: a new `deleted` stop, mapped from foreign-key error `23503`, the only foreign key on cloud records being their owner.
  - `src/domain/presentation/account.ts`: the deletion, sync and restore wording.
  - `app/account.tsx`: the row now opens the flow; a deletion banner; sync checks the account first.
  - `app/_layout.tsx`: finishes or checks an interrupted deletion at launch; Welcome's notice.
  - `src/auth/AppStack.tsx`: the route, under the `ready` guard.
  - `src/screens/entry/Welcome.tsx`, `src/screens/entry/AccountCheck.tsx`: wording.
  - `README.md`, `IMPLEMENTATION_STATUS.md` and this report.
  - Tests: `tests/ui/account-reforge.test.tsx`, `entry-gate.test.tsx`, `entry-screens.test.tsx` and `social-auth.test.tsx`.

### Ownership safeguards
- **Only the owner.** Only the signed-in account that owns this phone's training can start a deletion, checked by the engine and the screen.
- **Same account only.** Confirmation is accepted only when the account service itself says the fresh sign-in is the same account ID. Any other account's new sign-in is ended at once, and this phone stays as it was (tested for password and Google).
- **Owner-bound removal.** Local removal happens only when the training still belongs to the deleted account. Otherwise only the marker is cleared.
- **No transfer.** Records are never moved to another account:
  - this phone's copy is removed;
  - other devices keep theirs locked, and any other account, including a new one with the same email (a new ID), gets the existing "belongs to another account" screen;
  - nothing claims a phone that holds data (unchanged rules).
- **Checks only for their own account.** An interrupted deletion is checked only while its own account is signed in online. Signed out, or with another account, nothing is asked or changed (tested at launch through the real entry gate).
- **Nothing uploaded after deletion.** Another device's sync asks the account service first. If the account is gone, it stops before uploading; if a write is refused for the missing owner, the sync stops at that first refusal. Nothing is uploaded, and its local training and waiting changes are kept (PGlite test against the real migration).
- **Notices show no training.** Welcome only says that an account, or its deletion, exists.

### Reauthentication: what it does and doesn't prove
- **Password:** sent once to the account service from a client that stores nothing. The resulting session replaces this phone's only after the same-account check, and the previous session is ended. The password is never stored: it stays in the field only until it's confirmed (or corrected after a wrong attempt), then the field is cleared.
- **Google:** the sheet always asks which account (`prompt=select_account`) and suggests the signed-in one (`login_hint`). Cancelling changes nothing; another Google account is refused.
- **App-side only.** The final step requires a confirmation from the last five minutes. **This is a check in the app, not a security boundary:** `forge_delete_account` still accepts any valid session of that account, of any age. Stage 3 adds the server's own check (draft below). The fresh session the confirmation creates is what that check will read.
- **Not covered:**
  - **Apple-only accounts** can't confirm or delete in the app yet; Apple confirmation and token revocation (E8) are release requirements.
  - **Choosing a different Google account** that has no Forge account makes Supabase create one, as signing in would. *Final decision (D4, section 10): Forge refuses it, ends only its new session, never deletes or changes it, and tells the athlete it may have created an empty account.*
  - **Expo Go on a local network address** hides Google, so a Google-only account can delete only through the tunnel or a development build.

### Interruptions and recovery
| Situation | What happens |
|---|---|
| Two taps, or the dialog confirmed twice | One request: the screen and the engine share it (tested) |
| The request never reached the service | The check finds the account: "didn't go through", nothing changed |
| The service deleted it, the reply was lost | The check gets "user not found": finished |
| No answer either way | Uncertain: marker kept, nothing removed, Check again. Next launch checks once the owner is signed in online; if it finds the account deleted, the training is kept for export (final review, section 10) |
| Forge closed before a reply | Next launch checks, as above, and never removes training on its own |
| Forge closed after the deletion was confirmed | Next launch finishes it without a connection (tested) |
| A launch check meets a new tap | The tap waits; if the check settled it, that's the answer (tested) |
| Confirmation older than five minutes | Back to Confirm it's you; nothing sent (tested) |
| The service asks to sign in again (Stage 3) | Back to Confirm it's you; marker cleared, nothing changed (tested) |
| Sign-in invalid because the deletion succeeded | The sign-out for a deleted account removes the stored session whatever the service answers, with no offline notice |
| Offline | The final button is disabled and says why |

The uncertain state is deliberately conservative. A request the service refused (for example, a sign-in revoked mid-flow) also shows as uncertain when the follow-up check can't reach the account. It resolves at the next check, and nothing is removed meanwhile.

### Other devices, signing up again, older versions
- **Another device still signed in** (up to one access-token lifetime):
  - Synchronize now says "This Forge account no longer exists, so sync stopped. Nothing on this phone was removed…"; nothing is uploaded or removed.
  - Account & privacy shows a banner with **Export backup**. Delete Forge account is hidden; Delete all local data stays.
- **After that device is signed out:**
  - **If it learned of the deletion** (any sync while still signed in), Welcome says the account that used it was deleted and its training is locked. Any account that signs in sees "belongs to a deleted account", with no instructions to sign in to it and only removal offered (the strict rule: another account never exports it).
  - **If it never learned,** it shows the usual "belongs to another account" screen, and signing in to the deleted account fails. Removal is still available there.
- **Same email again:** a new account with a new ID and no cloud records (tested). Import a backup into it explicitly.
- **Forge before Stage 2:** its `cloudAccountDeleted` flag (written, never read) is now read as "this phone's owner was deleted" when an owner exists, so those phones get the same wording.

### Keeping local data after deletion (decision D1)
Not implemented. Forge's database isn't encrypted, so the only lock would be the entry gate (screens). After deletion that account can never sign in again, so a "locked" copy could never be opened in Forge, while staying readable to anyone with the device's files. Options:
- **R1. Keep it, gated:** honest wording, the same protection as signed-out data today, but no way back in. Little use; not recommended.
- **R2. Keep it, encrypted:** a passphrase- or Keychain-protected copy (for example SQLCipher in a development build), with a way to unlock and export later. A stage of its own.
- **R3. Export, then remove (implemented):** the backup file is the athlete's copy and can be imported into any account later.

**Recommendation:** R3 now; R2 only if athletes need to keep training on the phone without a file.

### Verification (Stage 2, Nov 2, 2026, PST and UTC, macOS, Node 26)
- **TypeScript:** passes. **ESLint:** 0 errors; the 1 warning is pre-existing (`tests/ui/templates-wp3.test.tsx`). **Prettier:** passes.
- **Logic tests:** **705 of 705** (683 before, plus 22: 16 deletion, 6 confirmation).
- **UI tests:** **743 of 743** in Pacific time and **743 of 743** in UTC (712 before, plus 31: 17 Delete Forge account, 5 launch and entry gate, 3 Account & privacy, 3 conflict screen and Welcome, 3 Google confirmation).
- **Mutation checks:** the suites were run against two deliberate breaks, each restored afterwards:
  - ignoring the five-minute window: caught;
  - treating "no answer" as "deleted": caught by 2 logic tests and 1 UI test.
- **Independent code review** of the whole uncommitted diff, against the invariants in this section: no significant issues. One hardening came out of the self-review that ran alongside it: if something fails unexpectedly mid-deletion, the screen now reports only what this phone's own state shows. If the deletion was confirmed, it says so, and the next launch finishes it. If nothing was sent, it says nothing changed. Both cases are tested.
- **iOS and Android production exports:** pass on the final code. The new screen is present in both bundles.
- **Diff review:** 25 files (18 changed, 7 new). No Supabase SQL, splash, theme, REFORGE component, asset, configuration or package changes; no generated artifacts, env files or secrets; line endings unchanged.

**Updated tests:** the Account screen's old one-step deletion test now checks that the row opens the flow and deletes nothing; the sync test uses the new row name; the Account screen's test client gained `getUser`.

### Stage 3: remaining server-side requirements (draft, not applied)
For review only. Apply to a development project first (E6/E7) and verify there before it goes anywhere near athletes' data.

```sql
-- DRAFT (Stage 3). Not applied to any project.
create or replace function public.forge_delete_account()
returns void language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare
  claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  signed_in_at bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce((claims ->> 'is_anonymous')::boolean, false) then
    raise exception 'Anonymous sign-ins cannot delete an account';
  end if;
  -- The most recent sign-in of this session (Supabase's amr claim).
  select max((entry ->> 'timestamp')::bigint) into signed_in_at
    from jsonb_array_elements(coalesce(claims -> 'amr', '[]'::jsonb)) entry;
  if signed_in_at is null or signed_in_at < extract(epoch from now())::bigint - 600 then
    raise exception 'Sign in again to delete your account'
      using errcode = '42501', hint = 'reauthentication_needed';
  end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.forge_delete_account() from public, anon;
grant execute on function public.forge_delete_account() to authenticated;
-- L6: privileges the API never needs.
revoke select on public.forge_records from anon;
revoke truncate, references, trigger on public.forge_records from anon, authenticated;
```

**To verify in the development project first:**
- `amr` timestamps for password and Google sessions, and that refreshing doesn't change them;
- that the hint reaches the app (it already returns to Confirm it's you on `reauthentication_needed`, tested);
- the PGlite tests extended to the new function.

**Also before App Store release:**
- Apple confirmation and authorization revocation (E8, needs the Apple client secret on the server, for example in an Edge Function);
- the dashboard checklist from Stage 0.

### Remaining risks (Stage 2)
1. **Not run on a device or against a live account.** The flow ran against the real client library, a simulated account service and the real migration in PGlite.
2. **App-side confirmation only** until Stage 3 (above).
3. **Apple-only accounts** can't delete in the app; a release blocker under App Store rules.
4. **Other devices' copies** stay locked to the deleted account. Their athlete can export only while still signed in (up to an access-token lifetime) or remove it later.
5. **A Google account chosen by mistake** during confirmation may leave an empty Forge account. *Final decision (section 10, D4): refused and explained, never deleted.*
6. **Brief view on relaunch.** If Forge closes after the deletion was confirmed but before this phone's part, the next launch may show the training for a moment before finishing the removal.
7. **A deliberately conservative "uncertain"** (see Interruptions).

### Manual tests (development project, throwaway accounts only)
Never on the founder's real account. Two devices signed in to the same throwaway account.

1. **Leave without deleting.** Open Delete Forge account and leave at each step: nothing changes.
2. **Export.** Save to a folder (Android: saved and checked) and share (unconfirmed); cancel the picker; then continue.
3. **Confirm it's you.**
   - Wrong password: plain message.
   - Google: cancel the sheet, then choose another Google account (refused), then the right one; check the right account is suggested.
4. **Delete.** Welcome says the account was deleted; this phone is empty.
5. **The other device.**
   - Synchronize now: "no longer exists"; nothing is uploaded; the banner offers Export backup.
   - Later it signs out. Sign in with another account: "belongs to a deleted account".
6. **Interruptions.**
   - Airplane mode right after the final confirmation: not confirmed, or didn't go through. Online again, Check again.
   - Force-quit during "Deleting your account…", then reopen.
7. **Same email again.** Sign up with the same email: setup on an empty phone; import the exported backup.

### Decisions for approval
- **D1.** Local data after deletion: R3 (implemented) now, R2 later if needed, R1 not recommended.
- **D2.** The Stage 3 SQL above: a 10-minute server window against the app's 5 minutes; anonymous refusal; the L6 revokes. Development project first.
- **D3.** Apple: confirmation and revocation (E8) scheduled before App Store submission; until then Apple-only accounts can't delete in the app.
- **D4.** Accept the empty-account side effect of choosing the wrong Google account, or plan a server-side cleanup. *Not accepted by the founder; final decision in section 10.*
- **D5.** Keep the strict rule that another account can never export a deleted account's training from a shared device.
- **D6.** Approval to commit and push Stage 2. **Approved (Nov 2, 2026).**

## 10. Stage 2 final review (Nov 2, 2026)

The founder's review of Stage 2 and final decision on D4. The founder approved these corrections, and they were committed and pushed on top of Stage 2 (`7faef77`); nothing was reverted or rewritten. The live Supabase project, its SQL and its settings are unchanged, and nothing was run against them.

### Decisions
| | Decision | Status |
|---|---|---|
| D1 | Export-then-remove is the supported deletion behavior; no insecure local retention | **Approved.** Implemented (no retention option exists) |
| D2 | Stage 3 server-side recent sign-in check and privilege hardening | **Approved in principle:** planning and local tests only; no live SQL. Not started |
| D3 | Apple-only accounts delete after the Apple sign-in work | **Conditionally accepted:** they need an appropriate deletion path before App Store release |
| D4 | A different Google account chosen while confirming: refuse it; never adopt, delete or change it; end only its new session; explain that it may have created an empty account; plan email one-time-code confirmation for a later, approved implementation | **Final.** Implemented below; the automatic removal proposed earlier was rejected and removed |
| D5 | Strict ownership isolation: another account never accesses or exports a previous account's training | **Approved.** Unchanged |
| D6 | Commit and push | **Approved** (Nov 2, 2026): committed and pushed |
| Release | No external beta or production release of account deletion until Stage 3's server-side recent sign-in check is deployed and verified. No SQL deployment and no live authentication changes | **Recorded** (README, IMPLEMENTATION_STATUS) |

### Corrections approved by the founder
1. **Pinned to the account.** The deletion request and the "does the account still exist?" check use this phone's sign-in only while its token names the account being deleted, and the request runs through a client pinned to that token. Otherwise nothing is sent, and nothing is concluded.
2. **A launch check never removes training.** An unconfirmed deletion found to have gone through at a later launch keeps the training for export; the athlete removes it with Delete all local data.
3. **One step.** Removing the training and recording the deletion happen in one transaction, and the screen reports only what the records show.
4. **Sync** records "account gone" only when the account service confirms it, asked as that account.
5. **The Delete Forge account screen follows the records.** If a launch check settles the deletion while the screen is open, the screen shows where things stand (found by the independent review).

### D4: a different Google account chosen while confirming
**Why it can't be prevented with the current Google sign-in:**
- **Created before Forge sees anything.** Supabase creates the account inside its own OAuth callback (`createAccountFromExternalIdentity`): a Google identity not yet linked to an account is signed up, unless sign-ups are off for the whole project.
- **No "existing accounts only" option.** `signInWithOAuth` has no equivalent of `shouldCreateUser: false`; it is a long-standing request (supabase/auth#1064).
- **A hook can't tell the cases apart.** The "Before User Created" hook receives only the request's ID, time and IP address and the new user. It can't tell a deletion confirmation from a new athlete's first sign-in.

**What Forge does (final):**
1. **Before the sheet:** "In Google's sheet, choose a@example.com. A different Google account can't confirm this deletion."
2. **Checked against the account being deleted.** The account service is asked which account ID the returned sign-in belongs to. A client that stores no session asks, so nothing about that sign-in can touch this phone's own; through this phone's client, a "session missing" answer could have signed this phone out.
3. **Refused at once.** A different account's sign-in is never adopted.
4. **Only its own new session ends** (scope `local`, with its own token). This phone's session is never read, replaced or ended. A sign-in the account service can't vouch for is ended the same way.
5. **Never deleted or changed.** That account and its records are left alone; no confirmation path can delete or change any account. The automatic removal proposed earlier is gone, with its helpers: creation and sign-in times, identity counts and an empty records list don't prove the account belongs to this attempt, or that removing it is safe.
6. **Explained:** "That's a different Google account (c@gmail.com), so it can't confirm this deletion. Forge signed it out here and didn't change it or anything else. If it had no Forge account, choosing it may have created an empty one. Confirm with a@example.com."
7. **Nothing else changes.** Training and ownership are untouched, and the athlete can try again; each wrong choice is refused the same way.

**Accepted consequence:**
- **A possible empty account.** A wrong choice may leave an empty Forge account for that Google identity (with its name and email from Google). It stays until its owner deletes it.
- **Google consent.** Google also keeps that account's consent to Forge's Google sign-in.

### Planned: email one-time-code confirmation (later, separately approved)
The flow to verify, not implemented:
1. `signInWithOtp({ email, options: { shouldCreateUser: false } })`, with the signed-in account's email. It can only reach an existing account; it never creates one.
2. The athlete types the code from the email; `verifyOtp({ email, token, type: "email" })` returns a session.
3. The same check as today: adopted only for the same account ID.

To verify first, in a development project:
- **The email:** the template shows the code (`{{ .Token }}`, a dashboard change), with no link to tap instead.
- **The code:** its length and lifetime, which are project-wide settings also used by sign-up confirmation.
- **Delivery:** custom SMTP for addresses outside the team (M7) and rate limits; for Apple users, the sender registered for Apple's private email relay (D3).
- **Identities:** whether verifying adds an email identity to a Google-only account. Forge must not then offer a password the account doesn't have.
- **Stage 3:** the session's `amr` entry (`otp`), and Stage 3's check accepting it.
- **Failures:** what happens when the account no longer exists, or the email can't be delivered.

No redirect URL is involved (the code is typed), so the allow list doesn't change.

### Checks
- **No overstated guarantees.** The copy review stands. The refusal text says only what Forge did.
- **Nothing removed silently, or without authoritative confirmation.** Confirmed, with the corrections above; the D4 path removes and changes nothing.
- **Gating.** The founder's release restriction applies. Development builds keep the flow for testing with throwaway accounts.

### Changes (uncommitted)
- **New:** `src/auth/jwt.ts`: reads which account a token names, never trusted on its own.
- **Changed:**
  - `src/auth/account-deletion.ts`: pinning, the `notSent` and `accountGone` outcomes, `checkDeletion`, launch keeps training, one-step removal.
  - `src/auth/reauth.ts`: refuse a different account; never adopt, delete or change it; end only its new session, checked by a client that stores nothing.
  - `src/auth/social.ts`: passes that client through.
  - `src/cloud/client.ts`: `tokenClient`, for the pinned deletion request.
  - `src/screens/you/DeleteAccount.tsx`: the refusal explanation; "no longer exists" and nothing-sent states; the count before Check again; follows the records.
  - `app/_layout.tsx`, `app/account.tsx`: pinned checks.
  - `README.md`, `IMPLEMENTATION_STATUS.md` and this report.
- **Tests:** `tests/account-deletion.test.ts`, `tests/reauth.test.ts`, `tests/ui/delete-account.test.tsx`, `tests/ui/account-reforge.test.tsx`, `tests/ui/entry-gate.test.tsx`, `tests/ui/social-auth.test.tsx`.
- **Untouched:** Supabase SQL, the live project, the splash screen, REFORGE components, Paths, Nutrition and Progress.

### Verification (Nov 2, 2026, PST and UTC, macOS, Node 26)
- **TypeScript:** passes. **ESLint:** 0 errors; the 1 warning is pre-existing. **Prettier:** passes.
- **Logic tests:** **714 of 714** (705 at `7faef77`, plus 9).
- **UI tests:** **755 of 755** in Pacific time and **755 of 755** in UTC (743 at `7faef77`, plus 12).
- **D4 cases tested:**
  - an existing different account, and one created just now: each refused and named, only its own new session ended, nothing deleted or changed, this phone's sign-in untouched (logic and the Google flow);
  - a cancelled sheet: nothing asked or changed;
  - the wrong identity: refused with the explanation (screen);
  - repeated attempts: each wrong choice refused and ended on its own, then the right one adopted; a second tap while the sheet is open starts nothing;
  - an unverifiable sign-in: ended, never adopted.
- **Deliberate breaks:** seven, each caught by the tests and then restored byte-for-byte:
  - an answer not pinned to the account;
  - a launch check that removes;
  - removal and record as two steps;
  - the stale screen;
  - a different account adopted;
  - the check run through this phone's own sign-in;
  - the wrong sign-in not ended.
- **iOS and Android production exports:** pass on the final code.

### Next
- **Later:** the email one-time-code implementation, after its verification in a development project (dashboard changes). Prepared in Stage 5.

## 11. Stage 3: server security hardening (prepared, not deployed)

Stage 2 is final at `7204da4` (committed and pushed). Nothing in Stages 3–6 was deployed: the live Supabase project, its SQL, its settings and its users are unchanged.

### Goal
Before any external distribution, deleting an account must need a genuinely recent sign-in, enforced by the server rather than by the app, with no direct-table privileges beyond what the app uses.

### What Supabase's tokens actually prove
Read from the Supabase Auth source at the live project's version (v2.197.0; unchanged on `master`):
- **The `amr` claim** lists each authentication method used on the session, with the time it was last used (`AMREntry{Method, Timestamp: claim.UpdatedAt}`). These come from the session's `mfa_amr_claims` rows, which are written only when the athlete authenticates: a sign-in creates a new session with its method (`AddClaimToSession` in `IssueRefreshToken`), and MFA adds to it.
- **A token refresh never adds to `amr`.** The refresh grant reissues the token from the session's existing records (`CalculateAALAndAMR`). It passes `token_refresh` only as the request's own label, never as an `amr` entry. So `amr` timestamps measure real authentication, and refreshes can't renew them.
- **`iat`** is the token's issue time, renewed by every refresh: never proof of a recent sign-in, and not used. `auth_time` exists only in OIDC ID tokens, not in access tokens.
- **`session_id`** names the session, and **`is_anonymous`** is always present.
- **Method names:** `password`, `oauth`, `otp`, `magiclink`, `recovery`, `email/signup`, `invite`, `sso/saml`, `web3`, `passkey`, `totp`, `mfa/phone`, `mfa/webauthn`, `mfa/recovery_code` are interactive. `token_refresh`, `anonymous`, `email_change` and `oauth_provider/authorization_code` (Supabase acting as an OAuth server for other apps) are not.
- **Email codes:** `signInWithOtp` with `create_user: false` refuses an email that has no account (`otp_disabled`, "Signups not allowed for otp"). Verifying a code starts a session recorded as `otp`, and adds no identity; an email identity is created only when an email change is confirmed.

### The migration
`supabase/migrations/202611020001_forge_security_hardening.sql`, additive (no table, column or record changes):
1. **`forge_delete_account`:**
   - Refuses a caller without a user, a role claim other than `authenticated`, or an anonymous sign-in.
   - If the account is already gone, it returns: a repeated request succeeds and changes nothing.
   - The request's session must still exist for that account and not be past its `not_after`; signing out (here or everywhere) or revoking it ends its power to delete.
   - The most recent interactive `amr` entry must be within 10 minutes (and not more than a minute in the future).
   - Anything missing, malformed or not interactive is refused with `42501` and the hint `reauthentication_needed`.
   - It takes no arguments, so no client-provided value can stand in for a sign-in.
2. **`forge_write`:** unchanged behavior for every non-anonymous account, refuses anonymous sign-ins, with every name schema-qualified.
3. **Search path:** both functions run with a fixed `search_path` of `pg_catalog, pg_temp`. PostgreSQL's built-ins come first and the caller's temporary schema last, as PostgreSQL advises for `SECURITY DEFINER` functions. The first draft used an empty search path, which searches the caller's temporary schema *first* for type names; the final review found and fixed this (section 16).
4. **Reads:** the read policy still allows only the account's own rows (now `(select auth.uid())`, the form Supabase recommends) and excludes anonymous sign-ins.
5. **Privileges (L6):** anon loses every table privilege; `authenticated` keeps only `SELECT` (row-level security). Both are revoked with `all`, so `TRUNCATE`, `REFERENCES`, `TRIGGER` and, on Postgres 17 and later, `MAINTAIN` (which allows `LOCK TABLE`, `VACUUM`, `REINDEX`) go too. Function execution stays `authenticated`-only. A first draft named the privileges one by one, which would have left `MAINTAIN`; the independent review found it (section 14).

**Rollback:** `supabase/rollback/202611020001_forge_security_hardening.sql` restores the previous function bodies and read policy exactly. It leaves the unused privileges revoked, with the exact statements to restore them too.

**App compatibility:** no app change needed.
- The deletion flow already treats `reauthentication_needed` as "confirm it's you again" (tested against the hardened schema).
- The app's 5-minute window sits inside the server's 10 minutes.
- Password and Google confirmations start new sessions (`password`, `oauth`), as would email codes (`otp`).
- Sync is unchanged: the app's real sync runs against the hardened schema in the tests.

### Verification (local, PGlite)
`tests/server-hardening.test.ts` sets PGlite up the way Supabase sets up a project: API roles, `auth.uid()` and `auth.jwt()` from the request's claims, the sessions and identities tables, Supabase's default privileges, and one transaction per request in the caller's role. It applies the live migration, then the hardening, and covers 14 cases:
- **Deletion itself:** a fresh sign-in deletes the account with its records, identities and sessions, and nothing of B's.
- **Stale sign-ins:** refused, including a token issued just now for a session signed in 30 minutes ago, and a fresh `token_refresh` entry.
- **Methods:** 8 interactive methods accepted; 7 others refused.
- **Malformed assurance:** 11 missing, malformed or future-dated `amr` shapes, each refused, with nothing changed.
- **Dead sessions:** no, malformed, unknown, another account's, deleted or expired session, each refused.
- **Callers:** anon, a signed-in token without a user, the wrong role, and an anonymous sign-in, each refused.
- **Repeats:** a repeated request after deletion succeeds and changes nothing, even with a stale token.
- **No caller-supplied value counts:** a timestamp argument isn't accepted, and claims outside `amr` (`auth_time`, `iat`…) don't count.
- **Sync writes:** unchanged (revisions, conflicts); anonymous refused; reads owner-only, and empty for an anonymous sign-in.
- **Privileges:** checked one by one (`has_table_privilege`, `has_function_privilege`, including `MAINTAIN` where Postgres has it), and as the table's exact access list, so a privilege a newer Postgres adds can't hide. Both functions are `SECURITY DEFINER` with `search_path=pg_catalog, pg_temp`. PGlite runs PostgreSQL 18.6.
- **Temporary objects:** a caller's temporary tables named `uuid`, `jsonb` and `text` change nothing: the write works, a stale sign-in is refused, and a fresh one deletes.
- **The app's real sync** against the hardened schema: upload, download on a second device, and nothing seen by another account.
- **The app's deletion engine** against the hardened schema: stale returns to "confirm it's you" and removes nothing; fresh deletes.
- **The rollback** restores the previous behavior exactly. Its documented statements for the table privileges (`grant all`, then `revoke insert, update, delete`) restore the previous access list exactly, on any Postgres version.

**Deliberate breaks:** each of 8 weakenings was caught, and the file restored byte-for-byte:
- using `iat` instead of `amr`;
- skipping the session check;
- counting `token_refresh`;
- allowing anonymous deletion;
- accepting future dates;
- leaving the L6 privileges;
- an unpinned search path;
- anonymous reads.

The final review added four more for the search path (section 16), all caught.

The baseline tests (`tests/server-security.test.ts`, `tests/postgres.test.ts`) still describe the live, unhardened project and pass unchanged.

### Assumptions (check in the dashboard before applying)
1. **No custom access token hook** rewrites `amr`, `session_id` or `is_anonymous` (Authentication → Hooks).
2. **The claims are the verified JWT's.** The Data API exposes no function that sets `request.jwt.*`; only `forge_write` and `forge_delete_account` are exposed in `public`.
3. **`auth.sessions` keeps its documented shape** (`id`, `user_id`, `not_after`). If Supabase changed it, deletion would fail closed (refused), never open.
4. **Clocks:** the database and Auth clocks agree within a minute.
5. **The functions' owner can read `auth.sessions`.** Read-only check: `select has_table_privilege('postgres', 'auth.sessions', 'select');`. If it can't, deletion fails closed (refused), never open.

### Development project: how to apply and verify
1. Create the development project (E6, section 13) and apply `202610140001_forge.sql`, then this migration (`supabase db push`, or the SQL editor, wrapped in `begin; … commit;`).
2. **Read-only checks:** `select proname, prosecdef, proconfig from pg_proc where proname like 'forge_%';` and the Stage 0 privilege queries.
3. **With throwaway accounts** (one email, one Google):
   - sign in and delete within 10 minutes: deleted;
   - sign in, wait 11 minutes (refresh happens on its own), delete: "Forge's account service asks you to sign in again first", then confirm and delete: deleted;
   - sign out of all devices on another device, then delete with the old sign-in: asked to sign in again;
   - sync, conflicts, and a second device's download all work.
4. Decode a real access token (on a developer machine, never logged) to confirm the `amr` shape for password and Google sessions.

### Production: deployment and rollback checklist
1. Founder approves this exact SQL (E7).
2. Development project verified as above.
3. Back up the production database (dashboard backup or `pg_dump` of `public.forge_records`).
4. Apply the migration in one transaction during low use.
5. Run the read-only checks.
6. Delete a throwaway production account once (fresh, then stale).
7. If anything regresses, apply the rollback script (one transaction) and re-run the checks.

### Requires live verification
- That the live functions are still the baseline until this is applied (nothing deployed): `select proname, proconfig from pg_proc where proname in ('forge_write', 'forge_delete_account');` shows `search_path=public, pg_temp` and `search_path=public, auth, pg_temp`.
- The `amr` timestamps for password, Google and email-code sessions on the real project.
- That a refresh after 10 minutes leaves deletion refused.
- `auth.sessions` row removal on sign-out and sign-out of all devices.
- That PostgREST passes the `hint` through to the app.

### Remaining risks (Stage 3)
- **PGlite only simulates Supabase's roles and claims;** live verification is still required.
- **Recovery links count as a recent sign-in.** A password-reset link proves the inbox (by design).
- **Freshness isn't knowledge of a password.** A recent Google sign-in can come from one tap when the browser is signed in.
- **Default privileges.** Supabase grants new objects to anon by default; future migrations must revoke as this one does.

## 12. Stage 4: keeping a workout going when the sign-in ends (implemented)

### Goal
A sign-in that ends without the athlete asking must never cost them the workout in progress, and must never weaken ownership (E4).

### The states, told apart
| State | What Forge does |
|---|---|
| No connection | Unchanged: the stored sign-in keeps training open (`ready`, offline); sync needs a connection |
| Access token expired | Unchanged: Supabase refreshes it on its own |
| Refresh fails for good, or the session is revoked or deleted elsewhere (sign out of all devices, account deleted) | **New:** if that account's own workout is in progress here, it continues (`continuing`); otherwise Welcome says "Your sign-in ended on this phone…" |
| Sign out (this phone), Sign out of all devices (here), Delete Forge account | Asked for: never continues the workout. The workout stays saved for the next sign-in |
| Another account's training on this phone | Unchanged: the account check holds it |
| Recent sign-in required (deletion) | Unchanged: "Confirm it's you" (Stages 2–3) |

### Design
- **Telling the cases apart (`src/auth/session.ts`).** `useAuthSession` marks each sign-out the athlete asks for, and reads that mark the moment the account service's `SIGNED_OUT` arrives. Any other `SIGNED_OUT` ends the sign-in unexpectedly, and the account it belonged to is kept as `ended`. Any sign-in clears it.
- **The entry state (`src/auth/entry.ts`).** `continuing` applies only when nobody is signed in, the phone's training belongs to `ended`, and `ended`'s workout is in progress. A workout just finished stays open for 10 minutes, so its summary can be read. Another account's training never qualifies.
- **The marker (`src/auth/continuation.ts`).** A marker holds the owner's ID, the workout's ID and the time (never a token or email). It lets that same workout continue after an app restart for 12 hours. Any sign-in ends it; a different or finished workout, another owner, or an expired marker opens nothing.
- **Routes (`src/auth/AppStack.tsx`).** While continuing, only the workout and the sign-in screens open; everything else leads to Welcome. The tabs stay in the stack, so the open workout isn't rebuilt (no lost input or rest timer), but a guard around them (`TabsGuard`) shows nothing and leads to Welcome if they're reached.
- **Words.**
  - **Workout screen:** one quiet note above it: "Signed out · Saved on this phone. Finish your workout, then sign in again to sync it." Nothing else on the screen changed.
  - **Welcome:** says the workout is saved, with **Return to your workout** while it's in progress.
- **Sync.** It needs Account & privacy, which only a signed-in owner reaches, so nothing syncs while continuing. Back with the same account, one sync uploads the workout once (revision-checked). Another account can't sync it, as before.

### Files
- **New:** `src/auth/continuation.ts`, `tests/continuation.test.ts`.
- **Changed:**
  - `src/auth/session.ts`, `src/auth/entry.ts`, `src/auth/AppStack.tsx`, `app/(tabs)/_layout.tsx` (wrapped in `TabsGuard`), `app/_layout.tsx`;
  - `src/screens/entry/Welcome.tsx`, `src/screens/Workout.tsx` (the note);
  - `src/domain/presentation/account.ts`;
  - tests: `tests/ui/entry-routing.test.tsx`, `entry-gate.test.tsx`, `entry-screens.test.tsx`, `workout-logger.test.tsx`.

### Verification
- **Logic (7):**
  - the entry decision;
  - the marker (written only for the owner's workout in progress; no secret);
  - restart within 12 hours, only for the same workout, owner and clock;
  - the finished-summary grace;
  - nothing changes ownership;
  - back with the same account, one sync uploads everything once and the next uploads nothing;
  - another account's sync is refused, and nothing moves.
- **Routing, with real Expo Router (4):**
  - signed out on the workout: the same screen stays mounted (nothing typed is lost), then back to `ready` still on it;
  - while continuing, Home, history, account, a tab, the account check and setup all lead to Welcome; sign-in and the workout open;
  - Back from the workout leads to Welcome, never Home;
  - another account's sign-in holds the account check.
- **Root layout and Supabase events (8):**
  - an unexpected end mid-workout continues it, with the notice, the marker, no sync, a summary after finishing, and the same account back to `ready`;
  - the athlete's own sign-out never continues it, nor a sign-out of all devices from this phone;
  - nothing in progress: Welcome only;
  - another account's workout never continues;
  - a restart within 12 hours continues only the same workout;
  - repeated changes of account keep the workout its owner's;
  - Welcome mentions a saved workout only when there is one (fixed in the independent review, section 14).
- **The real supabase-js client (6, `tests/ui/session-events.test.tsx`).** Forge's session hook runs on the client version Forge ships, with a simulated account service:
  - Sign out, Sign out of all devices and an offline sign-out all count as asked: nothing continues, and the offline one doesn't come back.
  - A refused renewal ends the sign-in unexpectedly once its access token has expired; it is kept while the token still works.
  - `session_not_found` ends it at once.
  - A renewal that fails only for want of a connection ends nothing.
  - Signing in again clears it.
- **Screens (2):** the workout note (and logging unchanged); Welcome's text and Return button.
- **Deliberate breaks:** four, each caught and restored byte-for-byte:
  - the owner check dropped (caught by the logic tests; the layout's own owner check is a second guard);
  - the athlete's sign-out treated as unexpected;
  - the tabs guard off;
  - no time limit.

The final review added four more for the sign-out classification (section 16), all caught; one was caught only by the real-client tests.

### Known limits
- **Ended while Forge was closed.** If the sign-in ends while Forge is closed (for example, revoked overnight), the next launch is signed out as usual. Forge can't tell whose sign-in ended once the account service has removed it. The workout is safe, and continues after signing in.
- **A finished workout in a shared session** stays its owner's: it uploads only after that account signs in again.
- **Up to one access-token lifetime.**
  - When a sign-in is ended elsewhere (Sign out of all devices on another phone), this phone's access token keeps working until it expires: supabase-js 2.118 keeps a sign-in whose renewal is refused while its token is still valid.
  - The workout continues from when supabase-js ends the sign-in: within about a minute of the token's expiry (an hour by default) while Forge is open, or at once if the account service reports the session gone.
- **The phone's clock.** The 12-hour and 10-minute windows use the phone's clock. Changing it only lengthens or shortens access to the owner's own workout on that phone.

### Physical-device checklist (iPhone)
1. Start a workout. End the sign-in elsewhere: **Sign out of all devices** on a second device signed in to the same throwaway account. Keep Forge open until the access token expires (an hour by default). Expected: the workout stays open with the note; sets can be logged and the workout finished.
2. Same, mid-rest: the rest timer keeps running.
3. Force-quit mid-workout after the sign-in ended; reopen within 12 hours. Expected: Welcome, with **Return to your workout**.
4. Sign in with the same account: the workout is there; sync uploads it once.
5. Sign in with another account instead: the account check holds; the workout isn't visible.
6. Airplane mode mid-workout (no sign-in loss): training continues as before; sync says it needs a connection.

## 13. Stage 5: authentication preparation (prepared, not activated)

Everything in this stage is **inactive**. No screen offers it, no client option switches it on, and today's `.env` sets none of the new variables. Activating any part needs dashboard changes (or a development project) first, and the founder's approval.

### Email one-time code (D4 follow-up, D3)
**Code (`src/auth/reauth.ts`):**
- `sendEmailCode` asks Supabase for a code for the signed-in account's own email, with `shouldCreateUser: false`, on a client that stores nothing. It can reach only an existing account and never creates one.
- `reauthWithEmailCode` ignores spaces and refuses anything but 6–10 digits before asking the service (`invalid_code`). It verifies on the same storage-less client, then adopts the session only for the same account (`adoptIfSameAccount`). A session for anyone else is refused and ended, exactly like a wrong Google account.
- **Not wired to a screen.** The project's email template today sends a link, not a code; offering "Email me a code" before the template changes would send a sign-in link instead.

**Tests (`tests/reauth.test.ts`, 3 new):**
- the code goes to the account's own email with `shouldCreateUser: false`;
- Supabase's `otp_disabled` (no such account) is passed on unchanged;
- no email: nothing is sent;
- spaces are ignored, and the code is checked by the storage-less client;
- malformed codes are refused without a request; an expired code changes nothing;
- a code that signs in another account is refused, and only that session is ended.

**To activate (development project first):**
1. Email template ("Magic Link"): show `{{ .Token }}` and no link.
2. Email OTP length (6–10 digits; the app accepts all) and expiry: about 10 minutes, rather than the 1-hour default.
3. Custom SMTP (M7). Supabase's built-in sender reaches only the project team, and its rate limits are very low.
4. Check the per-user resend cooldown and map its error ("wait before requesting another code").
5. Confirm on the development project:
   - a Google-only account can receive and use a code;
   - no email identity is added;
   - the session's `amr` is `otp`, which Stage 3 accepts.
6. Add the "Email me a code" option to the Confirm-it's-you step: a UI change, for approval.

### PKCE (E5)
**Code (`src/auth/pkce.ts`):**
- `pkceSupported` and `pkceAuthOptions`: PKCE can be switched on only where Web Crypto exists. Without it, the installed supabase-js (auth-js 2.118.0) quietly makes the verifier with `Math.random` and sends it as a `plain` challenge, which anyone who sees the sign-in address can read. `pkceAuthOptions` throws instead.
- `readAuthCallback`:
  - takes a code only from the query, never the fragment, and the account service's errors from either;
  - reads the flow ID (`sb_flow_id`);
  - refuses a malformed flow ID rather than dropping it, because without it supabase-js would try the latest flow's verifier and spend the single-use code.
- `exchangeOnce`:
  - exchanges a code once per runtime; a duplicate callback is ignored;
  - any failure means starting again (expired, refused, or network). supabase-js discards a flow's verifier after any failed exchange, so not even a lost answer can be retried with the same code.
  - Nothing is logged.

**Findings from the installed library:**
- `exchangeCodeForSession` saves the session in the starting client and announces `SIGNED_IN` to it. A confirmation must therefore start on the storage-less verifier client, never on this phone's own client, or a different account would be signed in before it is checked. A test shows the starting client holding the session.
- Several flows can be in flight at once, so each callback should carry its flow ID. Appending it to redirects is an experimental supabase-js option (`experimental.appendPkceFlowIdToRedirects`); without it, the most recent verifier is used.

**Tests (`tests/pkce.test.ts`, 8):**
- callback shapes, including 12 refused ones;
- the Web Crypto requirement;
- one exchange per code, with its flow;
- every failure means starting again, and the code is never retried;
- nothing logged.
- With the **real supabase-js client** and a simulated account service:
  - the authorize address uses `s256`, and the verifier matches its challenge;
  - one request per code;
  - a lost answer discards the verifier;
  - an unknown flow fails without spending the code.

**What switching on would change:**

| Flow | Today (implicit) | With PKCE |
|---|---|---|
| Google sign-in (`src/auth/social.ts`) | Tokens in the fragment | `?code=` exchanged by the client that started it (this phone's client) |
| Google confirmation (deletion) | Tokens checked on the verifier client | Started and exchanged on the verifier client, then `adoptIfSameAccount` |
| Email confirmation (`src/auth/links.ts`, `src/auth/email.ts`) | Tokens in the fragment | `?code=`; works only on the phone that signed up. Elsewhere the email is still confirmed, and the athlete signs in with their password |
| Password reset (`src/cloud/recovery.ts`, `src/auth/session.ts`, `app/account.tsx`) | Tokens in the fragment | `?code=` with the `recovery` type, on the phone that asked for it |

**Activation checklist:**
1. On the phone (Expo Go and Forge's own build), check `pkceSupported()` (true/false only, nothing else logged). If it is false, add Web Crypto first: `crypto.getRandomValues` and `crypto.subtle.digest` (`expo-crypto` is already installed and provides both), and verify again.
2. Switch the main and verifier clients to `pkceAuthOptions()` together, on the development project.
3. Route `?code=` callbacks through `readAuthCallback` / `exchangeOnce` in the four flows above. Keep reading fragment tokens for at least the longest link lifetime, so emails sent before the switch still work.
4. Existing sessions are unaffected: refresh doesn't depend on the flow type, so nobody is signed out.
5. No redirect allow-list change: the addresses stay the same, and only what they carry changes.
6. Test each flow, including a link opened on a second device ("start again", nothing changed), and a Google sheet cancelled mid-way.

### Development and production separation (E6)
**Code:**
- `src/cloud/environment.ts`, with `EXPO_PUBLIC_FORGE_ENV` and `EXPO_PUBLIC_SUPABASE_PROJECT_REF`, used by `src/cloud/client.ts`.
- With neither set (today), nothing changes. Once they are set, every client (the phone's, the verifier, the pinned deletion client) connects only to `https://<ref>.supabase.co`.
- An unknown environment name, a name without a ref, or any other address leaves the build "misconfigured": "Accounts aren't available", training kept, no request made.
- Problems name variables, never values. `.env.example` and the README document both variables.

**Tests:**
- `tests/environment.test.ts` (3): unchanged when unset or blank; each build only to its own project; unknown names, near-miss and look-alike addresses (`<ref>.evil.co`, `<ref>.supabase.co.evil.co`, `…@evil.co`) refused.
- `tests/ui/cloud-environment.test.tsx` (4): the real client module, loaded fresh with each set of variables, creates no client of any kind for another project.

**Plan (founder's steps, none done):**
1. **Create** a development project (`forge-dev`) in the same organization and region.
2. **Before any `supabase db push`,** run `supabase migration list` against production (read-only). If the baseline was applied in the SQL editor, the CLI doesn't know it was applied, and a push would try to apply it again. Mark it applied with `supabase migration repair --status applied 202610140001`, and only with approval.
3. **Development schema:** link the CLI to the development project by default (`supabase link --project-ref <dev-ref>`) and apply both migrations there (`supabase db push`). Pushing to production stays a separate, approved step (E7).
4. **Auth on development:**
   - email/password;
   - a **separate** Google OAuth client ("Forge Dev") whose redirect URI is `https://<dev-ref>.supabase.co/auth/v1/callback`;
   - the same four redirect entries.
   - Production's Google client, provider settings and redirect entries stay untouched until development works. Then remove the tunnel entry from production.
5. **Variables:**
   - Local `.env` (Mac and Windows) points to development, with `EXPO_PUBLIC_FORGE_ENV=development` and its ref.
   - Production values live only in EAS environment variables (`production`), with `EXPO_PUBLIC_FORGE_ENV=production` and the production ref; the build profiles select them.
6. **Testing:** throwaway accounts only (E10), and the Stage 3 checks (section 11).

**Keeping Google sign-in working during the switch:**
- **Production is unchanged.** Nothing on production changes until development is verified, so Google sign-in there keeps working.
- **Switching projects doesn't sign anyone out.** Pointing the phone at development changes the session's storage key (`sb-<ref>-auth-token`). Forge simply looks signed out, and production's stored sign-in stays as it was.
- **Don't test on the founder's own phone.** Its training belongs to the production account, so a development account sees "This phone's data belongs to a different account". Nothing is lost, but none of that screen's actions should be taken. Test development on a simulator or a second phone, or export a backup first.

### Apple readiness (E8, D3): checklist only
Apple's account-deletion guidance (App Review 5.1.1(v)):
- Deletion must start in the app.
- Reauthentication is allowed, including "entering a code from an email … already associated with the account".
- It must not be "unnecessarily difficult".

Apple's token-revocation reference: `POST https://appleid.apple.com/auth/revoke` with `client_id`, a `client_secret` JWT and a refresh or access token. The answer is `200` even when the token was already invalidated. If no token is kept, one can be generated from an authorization code.

1. **Forge's own build** (EAS development build). Apple sign-in is deliberately never offered in Expo Go.
2. **Reauthentication for Apple-only accounts:** Sign in with Apple again on the storage-less client (`signInWithIdToken` with a fresh nonce), then `adoptIfSameAccount`. A different Apple ID is refused, as with Google.
3. **Revocation without storing Apple tokens (recommended).**
   - The same confirmation sheet returns a fresh `authorizationCode`, which is single-use and short-lived.
   - A Supabase Edge Function exchanges it at `https://appleid.apple.com/auth/token` and revokes the result.
   - The Edge Function first checks that the caller's Supabase account owns that Apple identity.
   - Only after revocation succeeds does the app call `forge_delete_account`, which still needs Stage 3's recent sign-in.
   - Team ID, Key ID and the `.p8` key live only in the Edge Function's secrets, never in the app or the repository.
4. **Hidden emails:** register Forge's sender for Apple's private email relay (with SPF/DKIM). Otherwise emails to `@privaterelay.appleid.com` (including codes) are dropped. That is why Apple-only accounts confirm with Apple, not email.
5. **Optional:** Apple's server-to-server notifications (`consent-revoked`, `account-delete`) to an Edge Function.
6. **Release gate:** no App Store submission with Apple sign-in until 1–4 are implemented and verified on a device.

### Verification (Stage 5)
- **Logic:** `tests/reauth.test.ts` 12 of 12, `tests/pkce.test.ts` 8 of 8, `tests/environment.test.ts` 3 of 3.
- **UI:** `tests/ui/cloud-environment.test.tsx` 4 of 4.
- **TypeScript:** passes.
- **Deliberate breaks:** 15, each caught and then restored byte-for-byte.
  - Environment:
    - the guard removed from the phone's client, and from the pinned client;
    - a prefix host match;
    - unknown names accepted;
    - a name accepted without its ref.
  - Email code:
    - `shouldCreateUser: true`;
    - no format check;
    - adoption checked through this phone's own client.
  - PKCE:
    - no dedupe;
    - a code taken from the fragment;
    - a malformed flow ID dropped;
    - Web Crypto's digest not required;
    - its random source not required;
    - a lost answer reported as a refusal;
    - the flow ID not passed.
- **Design corrected while reading auth-js:** a first draft let a code be retried after a lost answer. supabase-js discards the verifier on any failure, so such a retry can never succeed, and the outcome is now "start again".

## 14. Stage 6: adversarial verification and release readiness

### New adversarial tests
**`tests/lifecycle-adversarial.test.ts` (5):**
- **Entry state:** all **13,824** combinations of entry facts (two accounts; every session, offline, owner, data, sync-history, setup, recovery, ended and continued value). Training opens (`ready`, `setup`) only for the signed-in account, and never over another account's protected training. `continuing` means nobody signed in, and only the ended account's own training. An earlier ending never changes anything for someone signed in. `unlinked` only for unowned data.
- **`tokenSubject`:**
  - 5,000 seeded random tokens never throw;
  - 500 real shapes, with accented names and emoji in the metadata, in either base64, are read correctly;
  - only a top-level string `sub` counts (not one nested in `user_metadata`);
  - a 1 MB token is read.
- **Stored markers:** 26 corrupted or hostile values (JSON junk, wrong types, `__proto__` and `constructor` keys, 1 MB) are ignored by every marker reader, never thrown, and nothing leaks into other objects.
- **Continuation:** a marker for another account, another workout, a future or expired time never continues, and B never opens A's workout.
- **Deletion marker for another account:**
  - A's screens and launch check ignore B's unconfirmed request.
  - Even a "confirmed" marker for B removes nothing of A's, and "B is gone" changes nothing on A's phone.
  - Residual (not reachable through the app; such a marker can't arise there): a "confirmed" marker naming B would still end A's sign-in at launch. Nothing is removed or exposed, and A can sign in again.

**`tests/server-hardening.test.ts` (+4, now 17):** Stage 1's baseline attacks (`tests/server-security.test.ts`, live schema) repeated against the hardened migration, which replaces both functions, plus an exposure guard:
- **Direct changes:** as a signed-in account and as anon, direct `INSERT` (own or planted for B), `UPDATE` (including reassigning `user_id`), `DELETE`, `TRUNCATE` and an exclusive `LOCK TABLE` are all refused, and B's row is invisible to A even when asked for by owner and ID.
- **Hostile IDs and kinds:** IDs written as SQL, quotes, emoji and 200 characters are stored as data. These are refused whole:
  - 201 characters, or an empty ID;
  - an injected kind;
  - a negative revision;
  - a payload over 5 MB;
  - a change of kind.
- **Deleted accounts:** a deleted account's still-valid token can't write (foreign key) or read.
- **Exposure guard:** only `forge_write` and `forge_delete_account` exist in `public`, neither runs for anon, and neither contains `set_config`, `request.jwt`, `SET ROLE` or dynamic `EXECUTE`. The only policy is the authenticated read policy. This catches a future migration that exposes a claim-setting function or a permissive policy.

**Real supabase-js PKCE tests:** see section 13.

**Deliberate breaks (Stage 6):** each restored byte-for-byte.
- **App:** nine of ten weakenings were caught. The tenth (`session ?? ended` in the continuing branch) behaves identically, because that branch runs only without a session.
- **Migration and rollback:** re-run after the review fix; all nine were caught:
  - the first draft's named revoke, which kept `MAINTAIN`;
  - `TRUNCATE` and `MAINTAIN` left granted;
  - no revoke for `authenticated`;
  - no revoke for anon;
  - the rollback's restore statements naming privileges again;
  - insert/update re-granted;
  - a permissive read policy;
  - a claim-setting function;
  - the identity length unchecked.

### Independent review (Stages 3–6)
An independent code review of the uncommitted Stage 3–6 changes found two issues. Both are fixed and covered by tests that fail on the original code:
1. **Welcome said "Your workout is saved on this phone" when nothing was** (medium).
   - **Cause:** `app/_layout.tsx` compared the continuation marker's account with the phone's owner, and with neither present that was `undefined === undefined`.
   - **Effect:** the text appeared on a new phone, on unowned training, and right after **Delete Forge account**, beside the notice that the training was deleted.
   - **Fix:** it now needs a marker, naming this phone's owner, for a workout still on the phone (so not once it's discarded).
   - **Tests:** `tests/ui/entry-gate.test.tsx`: one new test (new phone, unowned training, the 12 hours over, another account's marker, discarded), and the deletion test now checks there's no such text. Three weakenings were caught: the original condition, no workout check, no owner check.
2. **`MAINTAIN` survived the privilege revoke on Postgres 17 and later** (medium; defense in depth, unreachable through the Data API).
   - **Fix:** the migration now uses `revoke all` (section 11), and the rollback's restore statements are version-independent.
   - **Tests:** check the table's exact access list, attempt an exclusive `LOCK TABLE`, and confirm that the rollback's statements restore the previous access list exactly.

The review also confirmed:
- no path deletes an account without a recent interactive sign-in, and malformed claims are refused cleanly;
- the rollback's function bodies and policy are byte-identical to the baseline;
- every deliberate sign-out goes through `auth.signOut`, and supabase-js 2.118 emits `SIGNED_OUT` while that call is still running, so the "asked" mark is always set in time;
- no other account can reach the continuing state, and nothing syncs in it;
- the environment guard is inert when unset;
- no secrets or splash changes.

### Traceability
| Scenario | Tests |
|---|---|
| Deletion with local removal | `account-deletion`: confirmed…removed and recorded; `delete-account` (UI): deleted, one request |
| Secure local retention | Not offered (D1): export, then remove |
| Cancelling before the final confirmation | UI: final, asks once more; explains…leaving changes nothing |
| Cancelled or failed confirmation | UI: confirming it's you (wrong password, another account, offline); Google cancelling; `reauth`: wrong password or no connection |
| Export success, cancellation, failure | UI: export saved, shared, cancelled or failed |
| Unsynced workouts | UI: never-synchronized count before Check again; Stage 1 wording tests |
| Network loss, lost answer | `account-deletion`: reply lost, no answer, never arrived; UI: same three |
| Restart during deletion | `account-deletion`: closed after confirmation, found deleted at a later launch; UI: reopened after an interrupted request |
| Repeated attempts | `account-deletion`: second tap shares the request; server: repeated request is harmless; UI: one request however often it's pressed |
| Account switching, same email again | `account-deletion`: a new account starts empty; UI: explains signing up again |
| Other devices with old records | `account-deletion`: another device finds the account gone; real migration, another device uploads nothing |
| Ownership boundaries | `account-deletion`: only the owner, `cloudDeletion` pinned; UI: another account's training; adversarial: 13,824 entry combinations, foreign markers |
| Unrelated accounts untouched | server: deletes A and nothing else (hardened and baseline) |
| Wrong Google account (D4) | `reauth`: existing or just created, refused; UI: refused and named, repeated attempts |
| Recent sign-in on the server (Stage 3) | `server-hardening`: stale, methods, malformed, dead sessions, callers, no caller-supplied values, temporary objects, app engine against it |
| Least privilege (L6) | `server-hardening`: privileges, direct changes, exposure guard |
| Workout continuity (Stage 4) | `continuation` (7), `entry-gate` (+8), `session-events` (6, real supabase-js), `entry-routing` (+4), `workout-logger` (+1), `entry-screens` (+1), adversarial markers |
| Email code, PKCE, environment (Stage 5) | `reauth` (+3), `pkce` (8), `environment` (3), `cloud-environment` (4) |

### Release readiness
| # | Item | State |
|---|---|---|
| 1 | Account deletion flow (Stage 2) | **Committed** (`7204da4`), verified locally. Needs device tests (section 9) |
| 2 | Server-side recent sign-in (Stage 3) | **Prepared, verified locally (PGlite). Not deployed.** Blocks any external release of deletion (founder's restriction) |
| 3 | Least privilege, fixed search path | Prepared in the same migration. Not deployed |
| 4 | Workout continuity (Stage 4) | **Implemented, uncommitted**, verified locally. Needs the device checklist (section 12) |
| 5 | Email-code confirmation | Logic prepared, not offered. Needs template, SMTP and UI approval |
| 6 | PKCE | Prepared, not active. Needs the Web Crypto check on the phone |
| 7 | Development/production separation | Guard prepared (inactive). Project not created |
| 8 | Redirect allow list | **Verified live** (Stage 0, 13 of 13). Remove the tunnel entry from production before release |
| 9 | Site URL | `http://localhost:3000`: must be a real HTTPS page before release |
| 10 | Custom SMTP (M7) | Not configured. Required for real athletes (confirmation, reset, codes) |
| 11 | Apple: own build, revocation, private relay | Not started. App Store blocker (E8) |
| 12 | Deleting Apple-only accounts | No confirmation path yet. App Store blocker (D3) |
| 13 | Live verification with throwaway accounts | Not done. Required for Stages 2–5, in the development project |

## 15. Handoff: Stages 3–6 (Nov 2, 2026, before the final review)

Section 16 supersedes the test totals and repository state below.

### Summary
- **Stage 2 committed.** Its founder-approved corrections are committed and pushed (`7204da4`). That was the only commit authorized, and the only one made.
- **Stages 3–6 uncommitted.** They are implemented, documented (sections 11–14) and verified locally, and they wait for review.
- **Nothing deployed.** No live project setting, SQL or account was touched.

### Stage status
| Stage | State | Verified | Still needs |
|---|---|---|---|
| 2: safe account deletion | Committed and pushed (`7faef77`, `7204da4`) | Locally (logic, UI, PGlite) | Device tests (section 9). No external release until Stage 3 is live |
| 3: server hardening | Prepared: migration and rollback, **not deployed** | Locally: PGlite (PostgreSQL 18.6), 17 tests | Dashboard checks, development project, approval of the exact SQL (E7), deployment |
| 4: workout continuity | Implemented | Locally (logic, UI) | iPhone checklist (section 12) |
| 5: email code, PKCE, project pin | Prepared, **inactive** | Locally, including PKCE with the real supabase-js client | Template, SMTP, the device's Web Crypto, development project, UI approval |
| 6: adversarial tests, readiness | Done | Locally | Live items in the readiness table (section 14) |

### Final verification (macOS, Node 26)
- **Logic:** **757 of 757**, in Pacific time and in UTC (714 at `7204da4`, plus 43):
  - server hardening 17, PKCE 8, continuation 7, adversarial 5;
  - email code 3, environment 3.
- **UI:** **772 of 772** in 72 suites, in Pacific time and in UTC (755 at `7204da4`, plus 17):
  - entry gate 7, entry routing 4, cloud environment 4;
  - workout logger 1, entry screens 1.
- **TypeScript:** passes. **ESLint:** 0 errors; its 1 warning (`tests/ui/templates-wp3.test.tsx`) is pre-existing. **Prettier:** passes.
- **Exports:** the iOS and Android production exports pass. In the built bundle, `buildEnvironment()` reads both new variables as `undefined`, so the project pin is inert today.
- **Deliberate breaks, Stages 3–6:** 49 in all. 48 were caught; the remaining one behaves identically to the original code.
  - **Stage 3:** 8
  - **Stage 4:** 4
  - **Stage 5:** 15
  - **Stage 6:** 19
  - **Review fixes:** 3
- **Independent code review:** two findings, both fixed and tested (section 14).

### Repository
- **Branch:** `feat/forge-paths-foundation`. HEAD and origin are both at `7204da4`; nothing after Stage 2 is committed.
- **Modified (19):**
  - `.env.example`, `IMPLEMENTATION_STATUS.md`, `README.md`, this report;
  - `app/(tabs)/_layout.tsx`, `app/_layout.tsx`;
  - `src/auth/AppStack.tsx`, `src/auth/entry.ts`, `src/auth/reauth.ts`, `src/auth/session.ts`, `src/cloud/client.ts`;
  - `src/domain/presentation/account.ts`, `src/screens/Workout.tsx`, `src/screens/entry/Welcome.tsx`;
  - `tests/reauth.test.ts`, `tests/ui/entry-gate.test.tsx`, `tests/ui/entry-routing.test.tsx`, `tests/ui/entry-screens.test.tsx`, `tests/ui/workout-logger.test.tsx`.
- **New (11):**
  - `src/auth/continuation.ts`, `src/auth/pkce.ts`, `src/cloud/environment.ts`;
  - `supabase/migrations/202611020001_forge_security_hardening.sql`, `supabase/rollback/202611020001_forge_security_hardening.sql`;
  - `tests/continuation.test.ts`, `tests/environment.test.ts`, `tests/lifecycle-adversarial.test.ts`, `tests/pkce.test.ts`, `tests/server-hardening.test.ts`, `tests/ui/cloud-environment.test.tsx`.
- **Untouched:**
  - the baseline migration;
  - the splash screen and REFORGE components;
  - Forge Paths, Nutrition and Progress;
  - `app.json`, `eas.json` and the package files.
- **Clean:** `.env` stays ignored; no secrets, project ref or key in the changes.

### Founder checklist, in order
1. **Review and commit.** Review sections 11–15 and the uncommitted changes, then decide how to commit (for example one commit per stage). Committing deploys nothing.
2. **iPhone tests** (Expo Go through the tunnel, throwaway accounts only): Stage 4 (section 12), then Stage 2 (section 9).
3. **Read-only dashboard checks for Stage 3:**
   - Authentication → Hooks: no custom access token hook;
   - the project's Postgres version (15 or 17; the migration handles both);
   - the current table grants (Stage 0 queries).
4. **Development project (section 13):** create it, then apply both migrations. Give it its own Google OAuth client and the four redirect entries, and point the local `.env` at it with `EXPO_PUBLIC_FORGE_ENV=development` and its ref.
5. **Verify Stage 3 there** with throwaway accounts (section 11).
6. **Production, after approving the exact SQL (E7):**
   - back up the database;
   - apply the migration in one transaction;
   - run the read-only checks;
   - delete one throwaway account;
   - keep the rollback ready.
7. **External testing of account deletion,** only after step 6.
8. **Before real athletes:**
   - custom SMTP;
   - a real HTTPS Site URL;
   - remove the tunnel entry from production.
9. **Email code:** change the template and expiry on development, verify the flow, then approve the "Email me a code" option.
10. **PKCE:** check Web Crypto on the phone, switch PKCE on in development, then test the four flows.
11. **Apple, before the App Store:**
    - Forge's own build;
    - Apple confirmation and token revocation (Edge Function);
    - the private email relay;
    - a deletion path for Apple-only accounts.

### Risks
- **Stage 3 is verified only in PGlite.** On the live project, still to check:
  - the `amr` shapes;
  - the absence of hooks;
  - `auth.sessions` behavior;
  - that PostgREST passes the hint through.
- **Stage 4 limit:** a sign-in that ends while Forge is closed can't be attributed; the next launch is simply signed out.
- **Wrong Google account (D4):** choosing one may leave an empty Forge account (accepted).
- **Apple-only accounts:** no deletion confirmation yet. This blocks the App Store.
- **Recovery links:** they count as a recent sign-in, by design.
- **Future migrations:** Supabase's default privileges grant new objects to anon, so each one must revoke as this one does.

### Recommendation
1. Commit Stages 3–6 after review; committing deploys nothing.
2. Device-test Stages 2 and 4.
3. Set up the development project and verify Stage 3 there.
4. Deploy Stage 3 to production only with the exact SQL approved. Until then, account deletion stays internal.

## 16. Final review and Git checkpoints (Nov 2, 2026)

The founder approved a final review of Stages 3–6 and one local commit per stage. Nothing is pushed or deployed.

### Starting point
- **Branch:** `feat/forge-paths-foundation`. HEAD and origin were both at `7204da4` (checked against the remote with `git ls-remote`).
- **Working tree:** exactly the 30 uncommitted files of section 15; nothing staged, no stashes.

### Found and fixed
1. **Stage 3: an empty search path searched the caller's temporary schema first** (low; worse than the live baseline).
   - **Cause:** with `search_path = ''`, PostgreSQL searches the session's temporary schema *before* `pg_catalog` for table and type names, and both functions use unqualified built-in types (`uuid`, `jsonb`, `text`).
   - **Effect, in PGlite:** a caller's temporary table named `uuid`, `jsonb` or `text` broke both functions. Every such call failed closed: nothing was deleted or written, but nothing worked either.
   - **Exposure:** not reachable through Supabase's Data API, which can't create temporary objects. The live baseline (`public, auth, pg_temp`) isn't affected, because it lists `pg_temp` last.
   - **Fix:** `set search_path = pg_catalog, pg_temp`, PostgreSQL's documented arrangement for `SECURITY DEFINER` functions.
   - **Tests:** a regression test (the write works, stale is refused, fresh deletes, all with those temporary tables present), and the exact setting. Four weakenings were caught: the empty path, `pg_catalog` alone, and each function reverted on its own.
2. **Stage 4: when a sign-in ended elsewhere ends on this phone** (library behavior; now tested and documented, no code change).
   - supabase-js 2.118 keeps a sign-in whose renewal is refused while its access token still works, and ends it once the token has expired. The account service reporting `session_not_found` ends it at once.
   - So after **Sign out of all devices** on another phone, this phone continues the workout up to an access-token lifetime later (an hour by default), not immediately. Section 12's device checklist said otherwise; it is corrected.
   - **Tests:** `tests/ui/session-events.test.tsx` (6) runs Forge's session hook on the real client.
     - It confirms the mocks' assumption: supabase-js announces `SIGNED_OUT` while `signOut()` is still running.
     - Four weakenings were caught: the flag never set, the flag read when React applies the update, every sign-out treated as asked, and a sign-in not clearing the ended account. The last was caught only by these tests.
3. **Stage 4: a missing negative case.** **Sign out of all devices** from this phone, mid-workout, was untested at the app level. Added: it never continues the workout.

### Confirmed
- **Stage 3:**
  - **Recent sign-in:** freshness comes only from `amr`, never `iat`, and only from interactive methods, allowing a minute of clock difference. A live session row is required.
  - **Callers:** anonymous, no-user and wrong-role callers are refused; a repeated request is harmless.
  - **Privileges:** exactly `SELECT` for signed-in accounts and nothing for anon, on Postgres 15 and 17. Only `forge_write` and `forge_delete_account` are exposed, neither runs for anon, and the only policy is owner-only reading.
  - **Rollback:** restores the baseline function bodies and policy, and its statements restore the previous privileges exactly. The baseline migration is byte-identical to `7204da4`.
  - **Not deployed:** the Supabase CLI was never installed or linked here, and nothing ran against the live project.
- **Stage 4:**
  - **Sign-outs:** every sign-out the athlete can choose goes through the session hook. Its direct `client.auth.signOut` fallbacks run only without a session context, which happens only in tests.
  - **When it applies:** continuing needs no one signed in, the phone's training owned by the ended account, and that account's workout in progress (or finished within 10 minutes).
  - **What opens:** only the workout, Welcome, Sign in and Create account. The workout screen can only go back to the tabs, and the tabs lead to Welcome.
  - **Sync and other accounts:** nothing syncs while continuing, and another account's sign-in holds the account check.
- **Stage 5:**
  - **PKCE is off:** no client sets `flowType` (supabase-js defaults to the implicit flow), and nothing imports `src/auth/pkce.ts`.
  - **Email codes:** no screen imports the email-code functions.
  - **The project pin is inert:** neither variable appears in `.env`, `app.json` or `eas.json`, and the built bundle reads both as `undefined`.
  - **PKCE parsing:** the parser reads links the same way as Forge's working Google sign-in.
  - **Secrets:** none in any change.
- **Stage 6:** the adversarial tests exercise production code: the real migration in Postgres, the real sync and deletion engines, and real supabase-js (PKCE and session events). The entry decision is enumerated exhaustively. Still simulated: the account service (no live calls), and the screen contexts in the UI tests.

### Read-only checks for the founder, before Stage 3 is applied
1. **Hooks:** Authentication → Hooks shows no custom access token hook.
2. **Postgres version:** the project's Postgres version (15 or 17; the migration handles both).
3. **SQL editor, read-only:**
   - `select proname, proconfig from pg_proc where proname in ('forge_write', 'forge_delete_account');` shows `search_path=public, pg_temp` and `search_path=public, auth, pg_temp`: still the baseline, so nothing is deployed.
   - `select has_table_privilege('postgres', 'auth.sessions', 'select');` returns `true`.
   - `select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'sessions' and column_name in ('id', 'user_id', 'not_after');` returns three rows.
4. **Access-token lifetime:** the project's JWT expiry setting (Supabase's default is 3,600 seconds). It sets the device test's waiting time (section 17).

### Commits
One local commit per stage, made after the checks below. Each commit's report header says exactly what is committed at that point.

| | Commit | What it contains |
|---|---|---|
| A | `858e377` Stage 3 | The migration and its rollback; the Stage 3 tests in `tests/server-hardening.test.ts`; report section 11 and the corrected baseline privilege note; the Stage 3 status rows |
| B | `ae4573d` Stage 4 | `src/auth/continuation.ts`; the session, entry and route changes; the root and tabs layouts; the Welcome and workout wording; the Stage 4 tests, including `tests/ui/session-events.test.tsx`; report section 12; the Stage 4 status row |
| C | `83119f9` Stage 5 | `src/auth/pkce.ts`; the email-code functions; `src/cloud/environment.ts` and the client guard; their tests; `.env.example` and the README; report section 13; the Stage 5 status row |
| D | this commit, Stage 6 | `tests/lifecycle-adversarial.test.ts`; the Stage 6 tests appended to `tests/server-hardening.test.ts`; report sections 14–17 and the final header |

- **Split files:** `tests/server-hardening.test.ts` (Stage 3 tests in A, Stage 6 tests in D), this report (one section per stage) and `IMPLEMENTATION_STATUS.md` (each stage's rows with its stage). No other file mixes stages.
- **Dependencies:** each commit builds on the previous one only through what it needs. B's tests use no Stage 5 code, and C's none of Stage 6; D's adversarial tests use Stage 4's continuation code.
- **Each commit verified on its own:** A, B and C were checked out into temporary copies, sharing `node_modules`, and passed TypeScript and the complete logic and UI suites. D is the final tree.

### Final verification (the final tree, which D commits unchanged)
- **Logic:** **758 of 758**, in Pacific time and in UTC: section 15's 757, plus the search-path test.
- **UI:** **779 of 779** in 73 suites, in Pacific time and in UTC: section 15's 772, plus 6 real-client session tests and the all-devices test.
- **Server (PGlite, PostgreSQL 18.6):** `server-hardening` 18, `server-security` 9 and `postgres` 1, all pass. They are part of the logic suite.
- **TypeScript:** passes. **ESLint:** 0 errors; the 1 warning is pre-existing. **Prettier:** passes.
- **Exports:** iOS and Android production exports pass.

## 17. Device testing: iPhone walkthrough

Nothing here deletes an account, changes a Supabase setting, or uses your real Forge account.

### Before you start
- **One Supabase project today.** The only project is the live one, so these tests use throwaway accounts on it (E10). They create test records for those accounts only. Use the development project instead once it exists.
- **Not on your own iPhone.** Its training belongs to your real account, so a throwaway account can't open it. Use a device whose Forge has no training yet, the *test device*:
  - the **iOS Simulator** on the Mac (needs Xcode; press `i` in the Expo terminal, or `Shift+i` to choose a simulator; Expo Go installs itself);
  - or a spare iPhone or iPad with Expo Go.
- **Two throwaway accounts, A and B.** Two spare Google accounts are easiest, since Continue with Google needs no confirmation email. Supabase's built-in email sender only reaches your team's addresses.
- **A second device for test 3:** A also needs to be signed in and set up on a *second device* (another simulator or a spare device), whose Account & privacy offers **Sign out of all devices**.
- **Start Forge** with the tunnel (`npm start -- --tunnel` on the Mac), then open it on each device from the QR code (or with `i` for the simulator).

### A. A workout continues after an unexpected sign-out (Stage 4). Today, in Expo Go.
On the test device, signed in as A, with setup done:
1. Open Forge and start a workout.
2. Log several sets.
3. **End A's sign-in elsewhere.**
   - On the second device, open You → Account & privacy → **Sign out of all devices**, and confirm.
   - On the test device, keep Forge open on the workout until A's access token expires: up to an hour by default. Turn Auto-Lock off on a phone; a simulator never sleeps.
   - Forge notices within about a minute of the expiry.
4. **Expected:** the workout stays open, with **"Signed out · Saved on this phone. Finish your workout, then sign in again to sync it."** above it. Every set is still there, and a running rest timer keeps going.
5. Log more sets.
6. Finish the workout. **Expected:** the summary opens as usual. After it closes, Welcome says **"Your workout is saved on this phone. Sign in with the same account to keep training and to sync it."**
7. Sign in again as A, the same way as before.
8. **Expected:** Home. The workout is in your history with every set from steps 2 and 5.
9. **Sync.** In Account & privacy, tap **Synchronize now**; it succeeds. On the second device, sign in as A and tap **Synchronize now**: the workout appears there too. This writes only A's records to the live project; skip it until the development project exists if you prefer.
10. **Another account.** On the test device, tap **Sign out**, then sign in as B. **Expected:** "This phone's training belongs to another account", and none of A's training is visible. Tap only **Sign out** there. Sign in as A again: everything is as it was.

### B. Force-quit and reopen (Stage 4). Today, in Expo Go.
1. Repeat A.1–A.4 with a new workout.
2. Force-quit Forge (swipe it away) and reopen it within 12 hours. **Expected:** Welcome says **"Your workout in progress is saved on this phone. Return to it to keep logging and finish it; sign in again afterwards to sync it."**, with **Return to your workout**.
3. Tap **Return to your workout**. Every set is there; log one more, then finish.
4. **Ordinary case:** force-quit mid-workout while still signed in, then reopen. **Expected:** Home as usual, with the workout still in progress.
5. **Known limit:** if the sign-in ends while Forge is closed, reopening shows a plain Welcome with no Return button. Sign in as A, and the workout is there.

### C. A sign-out you ask for never continues (Stage 4). Today, in Expo Go.
On the test device, signed in as A: start a workout, log a set, then go back to the tabs.
1. Account & privacy → **Sign out**. **Expected:** Welcome, with no **Return to your workout** and no "Your sign-in ended" message. Sign in as A, and the workout is still in progress.
2. The same with **Sign out of all devices**. **Expected:** "You're signed out on all your devices…", with no Return button.
3. *Optional, on a phone:* turn on Airplane mode, then **Sign out**. **Expected:** "You're signed out on this phone. Forge couldn't reach its account service…", with no Return button. Turn Airplane mode off: you stay signed out. Sign in as A, and the workout is still there. (Metro also loses the phone while it's offline; reload Forge from Expo Go afterwards if needed.)

### What each test needs
| Test | Where |
|---|---|
| A, B and C above (workout continuity; sign-outs; another account) | **Today:** Expo Go through the tunnel, with throwaway accounts on a test device |
| Sync between two devices (A.9) | Today with throwaway accounts, or the development project once it exists |
| Stage 3 server checks (fresh versus stale deletion; sign out of all devices, then delete) | **The development project**, with the hardening applied |
| Account deletion end to end (Stage 2) | **The development project** only, never the live project |
| Email one-time code; PKCE links; the project pin | **The development project**, after the dashboard changes in section 13 |
| Sign in with Apple, Apple revocation, `forge:///` return links | **Forge's own build** (an EAS development build) |

If anything differs from **Expected**, note the step and what appeared, then stop; nothing needs fixing on the spot.
