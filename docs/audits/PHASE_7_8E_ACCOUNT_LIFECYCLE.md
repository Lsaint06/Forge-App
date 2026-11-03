# Phase 7.8E: Account lifecycle and server hardening

Implementation report. Baseline: `feat/forge-paths-foundation` at `e541339`. Stage 0 (redirect security) is verified and complete on the live project. Stage 1 is committed and pushed (`3409972`, `13eb666`). Stage 2 (safe account deletion, section 9) is committed and pushed (`7faef77`), followed by the founder-approved corrections from the final Stage 2 review (section 10), committed and pushed as `7204da4`. Stages 3–4 (sections 11–12) are committed locally, one commit per stage, and not pushed; nothing is deployed.

**Unchanged in Stage 1:** Supabase SQL, row-level security, functions and the live project's settings; sign-in providers and their flows; account ownership rules; the sync engine and the 7.8B–7.8D safeguards; the splash screen and screen designs (one new action and some wording only).

**Unchanged in Stage 2:** Supabase SQL (the migration is byte-identical), the live project and its dashboard, sign-in providers and Apple, PKCE (not started), the entry gate's ownership rules, the sync engine (`src/cloud/sync.ts`), the splash screen, REFORGE components, Forge Paths, workouts, Nutrition and Progress. No live account was deleted or touched.

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
