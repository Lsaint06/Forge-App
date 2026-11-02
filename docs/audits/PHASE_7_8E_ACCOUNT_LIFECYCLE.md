# Phase 7.8E: Account lifecycle and server hardening

Implementation report. Baseline: `feat/forge-paths-foundation` at `e541339`. Stage 0 (redirect security) is verified and complete on the live project. Stage 1 is implemented and **not committed**; it awaits founder review.

**Unchanged in Stage 1:** Supabase SQL, row-level security, functions and the live project's settings; sign-in providers and their flows; account ownership rules; the sync engine and the 7.8B–7.8D safeguards; the splash screen and screen designs (one new action and some wording only).

## 1. Decisions (founder review, Nov 1, 2026)

| | Decision | Status |
|---|---|---|
| E1 | Account deletion with an export opportunity, local-data choices and recovery from interruptions; never silently destroy unsynced training | Approved in principle; Stage 2 |
| E2 | Recent reauthentication before deletion, enforced on the server too; review Google and future Apple | Approved in principle; Stages 2–3 |
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
| H1 | High | Deleting the cloud account leaves the phone's training (then the only copy) owned by a deleted account, with no way to export it | Stage 2 (P3) |
| H2 | High | The redirect allow list accepted any `exp://` and `exps://` address, so a reset link chosen by someone else could deliver a sign-in to their own Expo Go project | **Fixed and verified live (Stage 0)** |
| M1 | Medium | No reauthentication before permanent deletion | Stages 2–3 |
| M2 | Medium | Email links carry the sign-in itself over the `forge://` scheme (implicit flow) | Stage 5 (PKCE) |
| M3 | Medium | Sign out ended the sign-in on every device | **Fixed (Stage 1)** |
| M4 | Medium | An unexpected end of the sign-in leaves an active workout | Stage 4 |
| M5 | Medium | An interrupted deletion isn't recorded or recovered | Stage 2 |
| M6 | Medium | Delete all local data didn't mention changes never synchronized | **Fixed (Stage 1)** |
| M7 | Medium | Default email service (team addresses only) and a localhost Site URL | Dashboard, before release |
| L1 | Low | The offline sign-out notice said the sign-in "expires on its own" | **Fixed (Stage 1)** |
| L2 | Low | An unusable reset link gave no feedback | **Fixed (Stage 1)** |
| L3 | Low | After deletion, a still-valid sign-in fails record by record | Stages 2–3 |
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
- **Baseline (L6):** under Supabase's defaults the migration leaves `SELECT` for anon and `TRUNCATE`, `REFERENCES` and `TRIGGER` for both API roles. None is reachable through the Data API. E7 revokes them, and this test changes with it.

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
5. **Deletion (H1, M1, M5), PKCE (M2) and workout continuation (M4)** are unchanged until their stages.
6. **Date coverage:** the complete suites ran in the real fall-back window, and the three fixed tests ran across 11 daylight-saving moments in 4 time zones. The complete suites have not run inside a spring-forward window, because the system clock can't be moved.

## 7. iPhone tests (Expo Go)

Global sign-out ends the sign-in on every device, so be ready to sign in again everywhere. None of these steps deletes data.

1. **Sign out affects one device.** With two devices signed in, sign out on one. The other stays signed in. Signing back in on the first opens its training, and waiting changes sync as before.
2. **Sign out of all devices.** In Account & privacy, choose it and confirm. Welcome explains what happens. The other device signs out within about an hour (or when reopened after that), and both keep their training.
3. **Offline.** In airplane mode, Sign out of all devices shows a connection message and stays signed in. Plain Sign out signs out with the corrected notice. Back online, sign in: the same training is there.
4. **Unsynchronized changes.** Log something offline, then open Delete all local data. The row and the confirmation give the count. Cancel.
5. **Reset links.** Open a reset email that was already used: Welcome explains it and points to Forgot password.

## 8. Next stages

- **Stage 2:** account deletion (P3), with an export opportunity, local-data choices, recovery from interruptions and client reauthentication.
- **Stage 3:** server migration (E7): revoke the L6 grants, check recent sign-in before deletion, refuse anonymous users. Exact SQL for separate approval, in a development project first.
- **Stage 4:** finishing an active workout after an unexpected sign-in loss (E4).
- **Stage 5:** PKCE (E5) and separate development and production projects (E6).
- **Stage 6:** live tests with throwaway accounts (E10). Apple revocation (E8) is required before App Store release.
