# Phase 8.3A: device validation preparation

**Preparation only.** Nothing was built, installed or tested on a device. No account was created, no Supabase setting changed, and the production project and Expo Go were not touched. Baseline: `feat/forge-paths-foundation` at `5f07c9b`.

**Goal of Phase 8.3.** Prove on the founder's iPhone, in Forge's own app (FORGE Dev) and only against the development project (FORGE DEV), that workouts, data and accounts survive real conditions. Then fix what breaks.

**The short version, for use at the Mac:** [FORGE_DEV_IPHONE_CHECKLIST.md](../FORGE_DEV_IPHONE_CHECKLIST.md) (Phase 8.3B).

**This document is three things:**

- the Mac-to-iPhone setup guide (§3);
- the procedure that keeps the Expo Go training history safe (§4);
- the prioritized test checklist (§5–§6).

The approvals it needs are in §9.

## 1. Where things stand

| Item | State |
| --- | --- |
| Apple Developer Program | Paid team (Individual). Its Apple Development certificate is in the Mac's login keychain, valid until Nov 3, 2027; Apple's WWDR G3 intermediate is installed ([NATIVE_BUILDS.md](../NATIVE_BUILDS.md)) |
| Mac | MacBook Air M4, macOS 27.2, Xcode 27.2 (Expo SDK 58 needs 26.4 or later), CocoaPods 1.17.0. `xcode-select` points to the Command Line Tools; `npm run dev:ios` uses Xcode directly |
| iPhone | iPhone 17, iOS 26.6.2, paired with the Mac, Developer Mode on. **Not yet registered with the team:** the first `npm run dev:ios` with it connected registers it |
| FORGE Dev | Builds and passes its checks on the Mac (Simulator; unsigned iPhone build). **Never installed on the iPhone** |
| FORGE DEV (`gmyo…`) | <ul><li>**Applied:** the schema and the security hardening (Nov 3).</li><li>**Verified live, read-only (Nov 4):** email sign-in on; confirmation off; sign-ups allowed; anonymous, phone and SAML sign-ins off; exactly the three `forge-dev:///` return addresses; the records table closed to anonymous callers.</li><li>**Set by the founder, not readable from outside:** 300-second sign-ins, no hooks, no CAPTCHA.</li><li>**Not set up:** Google (deferred).</li></ul> |
| Windows | Verifies everything that runs off the phone: logic 799 of 801 (2 Mac-only tests skipped), UI 783 of 783, TypeScript, ESLint, Prettier, `dev:check`; the GitHub check passes on `5f07c9b` |

**What FORGE Dev shows today.** Welcome offers only **Continue with Email**: Google and Apple aren't enabled on FORGE DEV. Email confirmation is off, so an account created in FORGE Dev works at once, and no email is sent.

## 2. Prerequisites (confirm before the Mac session)

| # | Check | How | Expected |
| --- | --- | --- | --- |
| M1 | The Mac checkout is the main one, on the right commit | In the Forge-App folder (the main checkout, not a `Forge-App.worktrees/…` folder): `git status` and `git log -1 --oneline` | `feat/forge-paths-foundation`, clean, `5f07c9b` (or a later commit I name). **If it's on another branch, stop and tell me; don't switch** |
| M2 | Node and npm | `node -v`, `npm -v` | The project asks for Node 24. The Mac ran Node 26 for Phase 8.1 without problems; note the version, don't change it now |
| M3 | Xcode signed in to the paid team | Xcode → Settings → Accounts | Your Apple ID with the paid team (not "Personal Team") |
| M4 | The development project's settings file | `npm run dev:check` | Starts with `Development project gmyo…: read-only checks`. ✓ for Auth, settings, email, sign-ups and the Forge schema. <ul><li>**At `5f07c9b`:** Google ✗ is expected, ending with "1 check(s) failed."</li><li>**From the Phase 8.3B commit:** Google is information (•), the return addresses are checked without Google, and it ends with "All checks passed."</li></ul>**Any other project prefix: stop** |
| M5 | No settings file Expo would bundle | `ls -a` | No `.env.local`, `.env.development` or `.env.development.local`. `.env` (production, Expo Go) stays; the build never reads it |
| M6 | The build readiness check | `npm run dev:ios -- --check` with the iPhone connected and unlocked | ✓ Xcode, ✓ CocoaPods, ✓ signing team, ✓ iPhone |
| M7 | Disk space and time | Finder → the Mac's storage | About 10 GB free; 30–45 minutes for the first session |
| M8 | Expo Go history protected | §4, steps 1–3 | Done **before** the Mac session |

### Verified from Windows before the first install (Nov 4)

**FORGE Dev can only reach FORGE DEV.** Four independent layers, each checked:

1. **Settings:** a Release build reads only `.env.forge-dev`. It must name `development`, pin its project's ref, use that project's own HTTPS address and a publishable key, and differ from every Expo settings file (`.env` is production). The Windows copy passes and is FORGE DEV (`gmyo…`).
2. **Build environment:** nothing inherited from the shell's `EXPO_PUBLIC_` variables, `.env` switched off (`EXPO_NO_DOTENV`), the root `.env` files kept out of Metro, and no packager started by Xcode.
   - **Proven on Windows:** FORGE Dev's iOS JavaScript was built with exactly this environment and scanned. It contains FORGE DEV's ref and address. It contains **none of the 3 production markers** (the address, ref and key from `.env`), in the JavaScript, assets or app config.
3. **Before installing,** the build tool refuses the app unless it passes every check:
   - FORGE Dev's ID, answering `forge-dev:` links and not `forge:`;
   - signed by your team;
   - Sign in with Apple, and no push;
   - a profile with this iPhone;
   - JavaScript built in;
   - no production value.
4. **At run time,** `com.lsaint06.forge.dev` connects only when its JavaScript carries the `forge-dev` scheme, the environment is named `development`, the ref is pinned, and the address is exactly `https://<ref>.supabase.co`. Otherwise: "Accounts aren't available".

**Tests.** 46 automated tests cover these layers and all pass: 38 logic tests, including "FORGE Dev never connects with today's settings, or to production", and 8 UI tests. Expo's own configuration pipeline gives FORGE Dev:

- the ID `com.lsaint06.forge.dev`;
- the name "FORGE Dev";
- the link schemes `forge-dev`, `com.lsaint06.forge.dev` and `exp+forge-fitness`;
- Sign in with Apple as its only entitlement.

**The Mac confirms its own copy at the session:**

- `npm run dev:check` prints `gmyo…`;
- the build prints `development project gmyo…`;
- the build prints `✓ Checked: … no production values`.

**Signing requirements:**

- **The paid team.** A Personal Team can't sign the Sign in with Apple capability.
- **Xcode signed in** to that Apple ID.
- **One trusted Apple Development certificate** for the team (or `--team <Team ID>`), with Apple's WWDR G3 intermediate installed.
- **The iPhone:** paired and trusted, unlocked, Developer Mode on.
- **An internet connection** during the build.

**What the first install changes in the Apple Developer account.** Xcode's automatic signing does this the first time; it is inherent to A0:

- registers the iPhone (its UDID) with the team: one of the 100 iPhones a membership year allows;
- registers the App ID `com.lsaint06.forge.dev` with Sign in with Apple, if Phase 8.1 hasn't already;
- creates a development provisioning profile valid for a year.

No App Store Connect record, distribution certificate or push key is created or changed.

## 3. Mac-to-iPhone setup guide (FORGE Dev, standalone Release build)

**Release** builds the JavaScript into the app, so FORGE Dev opens without the Mac, as the real app will. Everything below runs in Terminal, in the Forge-App folder on the Mac. Approval needed: §9, item A0.

**Step 1: update the checkout (if needed).**

```sh
git status                                    # must be clean, on feat/forge-paths-foundation
git pull --ff-only origin feat/forge-paths-foundation
git log -1 --oneline                          # the commit I named
```

If `git pull` changed `package-lock.json`, run `npm ci` (about 2 minutes).

**Step 2: read-only checks.**

```sh
npm run dev:check                             # FORGE DEV: see M4
npm run dev:ios -- --check                    # see M6
```

**Step 3: connect the iPhone.** Use a cable. Unlock it and keep it unlocked. If it asks, tap **Trust**.

**Step 4: build, check, install and open.**

```sh
npm run dev:ios -- --release
```

What you'll see:

1. `FORGE Dev (com.lsaint06.forge.dev) → <your iPhone>, signed by <team>`, then `Release: JavaScript built in, development project gmyo…`.
2. **Expo regenerates the `ios/` folder,** then the CocoaPods install runs.
3. **Xcode builds,** with a progress line every minute. The first build takes 10–20 minutes; the full log goes to `ios/xcodebuild.log`.
   - If macOS asks to let Xcode or codesign use the keychain, enter your Mac password and choose **Always Allow**.
   - **On this first run, Xcode registers the iPhone with your team** and creates the App ID `com.lsaint06.forge.dev` with Sign in with Apple, plus a development profile valid for a year.
4. `✓ Built`, then `✓ Checked: FORGE Dev's ID and link scheme, signed by team …, no production values, JavaScript built in`.
5. `✓ Provisioning profile: team …, 1 registered iPhone, valid until …`.
6. `✓ Installed on <your iPhone>`, then `✓ Opened FORGE Dev`.

The command refuses to install if any check fails. **Nothing is installed half-way.**

**Step 5: first launch, on the iPhone (no account yet).**

1. **FORGE Dev appears beside Expo Go,** with a plain white placeholder icon (the icon decision is open).
2. **On launch:** a charcoal launch screen, the REFORGE intro, then Welcome with **Continue with Email**.
   - **"Accounts aren't available" means stop.** The environment guard refused the build's settings; send me the Metro or Terminal output.
3. **Don't create an account yet.** That needs approval A1.
4. **Check it runs without the Mac:** unplug the iPhone, force-quit FORGE Dev, turn Wi-Fi off, and reopen it. It should open the same way.
5. **Open Expo Go:** your training is there, unchanged. FORGE Dev has its own storage and its own sign-in; neither can see the other.

**Step 6: after a code change** (only once a fix is approved and pushed): `git pull`, then `npm run dev:ios -- --release` again. Later builds take a few minutes, and the data in FORGE Dev is kept.

**If something goes wrong.** The command prints the reason and a fix; nothing is left half-installed.

| Message | Fix |
| --- | --- |
| "No signing certificate yet…" | Xcode → Settings → Accounts → your paid team → Manage Certificates → + → Apple Development; or add `--team <Team ID>` |
| "…isn't trusted on this Mac yet: Apple's intermediate certificate is missing" | Download the WWDR G3 certificate from the link it prints, double-click it, run again |
| "This Mac can sign for more than one team" | Add `--team <your paid Team ID>` |
| "Connect your iPhone…" or "…isn't connected right now" | Cable, unlock, Trust |
| "Turn on Developer Mode…" | Settings → Privacy & Security → Developer Mode → restart |
| "Xcode isn't signed in to your Apple Developer account" | Xcode → Settings → Accounts, sign in, run again |
| "macOS didn't let Xcode use the signing key" | Unlock the Mac, answer the keychain dialog with Always Allow |
| "Apple refused the bundle ID…" | Stop: FORGE Dev's ID needs a decision. Nothing was installed |
| "FORGE Dev won't build: move .env.local…" | Move that file out of the project (it would leak into the build) |
| An "Untrusted Developer" alert on the iPhone (unlikely with a paid team) | Settings → General → VPN & Device Management → trust the developer |

**For diagnosing a failure (optional).** A Debug build (`npm run dev:ios`, then `npm run start:dev`) loads its JavaScript from a computer and shows Forge's log live. Connecting it to Windows on the same Wi-Fi is unverified. Release stays the build that is tested.

## 4. Protecting the Expo Go training history

Expo Go holds your real training and is signed in to your production account. **Nothing in Phase 8.3 reads, writes or replaces it.** FORGE Dev is a different app (`com.lsaint06.forge.dev`) with its own storage, its own keychain entries, and only the development project: it refuses production by design.

**Before any test (about 10 minutes, Expo Go only):**

1. **Sync (recommended).** In Expo Go: You → Account & privacy → **Synchronize now**. The cloud copy becomes current, a second way back.
   - If it reports a conflict, **stop and tell me.** Don't choose a version.
2. **Back up to a file.** You → Account & privacy → **Export backup** → *Back up your data* → **Share a copy** → **Save to Files**, into iCloud Drive (a folder such as `Forge backups`).
   - "Save to a folder" only exists on Android.
   - On the iPhone, Forge can't confirm a shared file was saved, so the backup reminder may stay; that's expected.
3. **Make a second copy off the phone:** share the same file again, by AirDrop to the Mac.
4. **Check the file without importing it (Windows, read-only).** Copy the file to the Windows PC, for example from iCloud Drive. Then, in the Forge-App folder, run `npm.cmd run backup:check -- "<path to the file>"`. You can run it yourself, or I run it on a file you provide (A7). The checker never changes the file and prints only counts, dates and a fingerprint:
   - it validates the file with Forge's own backup format;
   - it trial-imports it into a throwaway in-memory database with Forge's own import checks;
   - it exports it again and compares the counts;
   - it reports workouts finished and in progress, the latest finished workout's date, sets, templates, journal entries by kind and custom exercises, plus a SHA-256 fingerprint.

   Compare the fingerprint of the iCloud and Mac copies: the same fingerprint means the same file.

   The checker (`scripts/dev/check-backup.ts`, Phase 8.3B) is tested on synthetic files, never on real data:
   - a valid file is "complete and restorable";
   - truncated, empty, foreign, duplicated, two-in-progress and newer-format files are refused;
   - the file stays byte-identical.

**During Phase 8.3: never do these in Expo Go.**

- **Import backup:** it replaces every workout, template, preference and journal entry on that phone, and can't be undone.
- **Delete all local data, Delete Forge account, Sign out of all devices, Sign out.**
- **Uninstalling or resetting Expo Go,** or its data.
- **Importing the Expo Go backup into FORGE Dev:** that would copy production training into the development project. FORGE Dev tests use test data only.

**After each test session:** open Expo Go and check your latest workout is there. This only looks; it doesn't change anything.

**One more risk to Expo Go.** Each Expo Go release supports one Expo SDK. If the App Store updates Expo Go to a release for a later SDK, Forge may stop opening in Expo Go until Forge is upgraded too.

- **The training isn't lost,** but it's unreachable until then.
- **Until the real app replaces Expo Go (Phase 8.4):**
  - keep the backup current, with a fresh export each week you train;
  - consider turning off automatic app updates (Settings → App Store → App Updates).

**If something ever goes wrong with Expo Go's data, there are two ways back.** Decide them together, never during a test:

- **the cloud:** sign in to the same account; "Restore your training" downloads it;
- **the checked backup file.**

## 5. Test checklist (prioritized)

The founder runs each test on the iPhone in **FORGE Dev**, with throwaway FORGE DEV accounts (A1).

**Where:**

- **iPhone:** FORGE Dev on the founder's iPhone.
- **iPhone + 2nd:** a second device signed in to the same throwaway account (§6).
- **Windows:** done by me.

**Reporting.** Record any difference from *Expected* as: test ID, step, what appeared, and a screenshot or screen recording. Then stop that test. Nothing needs fixing on the spot.

### P0: workouts and data (must pass before Phase 8.4)

| ID | Test | Expected | Where |
| --- | --- | --- | --- |
| W1 | **A real session:**<ol><li>start an empty workout and one from a template;</li><li>add exercises;</li><li>log weight and reps, including a decimal typed with a comma;</li><li>complete sets, add and remove a set, reorder exercises;</li><li>finish.</li></ol> | Every set is saved as typed. The finish summary is correct. History shows the workout. No lag above about a second; no crash | iPhone |
| W2 | **Rest timer, phone locked:**<ol><li>You → Preferences → **Notifications** on, and allow the iOS prompt (FORGE Dev asks for itself);</li><li>complete a set;</li><li>lock the phone.</li></ol> | At the end of the rest: **"Rest complete — Ready for your next set?"** with sound. Unlocked, the timer shows it's done | iPhone |
| W3 | Rest timer while Forge is in the background (another app open) | A banner at the deadline. Back in Forge, the timer is correct | iPhone |
| W4 | **Interruptions:** a phone or FaceTime call during rest and while typing; Control Center; Siri; another app's notification; the app switcher | Nothing typed is lost (numbers save as soon as they're valid). The timer and workout are correct after returning | iPhone |
| W5 | **Force-quit** (swipe away) mid-typing, during rest, and after completing sets; then reopen | The workout is in progress with every completed set; it continues and finishes normally | iPhone |
| W6 | Restart the phone mid-workout | As W5 | iPhone |
| W7 | **Long session:** 10 exercises × 5 sets, with scrolling, editing and reordering | Responsive throughout; no crash | iPhone |
| W8 | Edit a finished workout, then **Cancel**; edit again, then save | Cancel restores it exactly; a save persists | iPhone |
| W9 | Pause, background Forge, wait, resume | The duration excludes the pause | iPhone |
| O1 | **Offline workout:**<ol><li>Airplane mode before starting;</li><li>a full workout plus a nutrition entry;</li><li>force-quit and reopen offline;</li><li>reconnect and **Synchronize now**.</li></ol> | Everything works offline. The sync after reconnecting succeeds, and the records are in FORGE DEV | iPhone |
| O2 | **Synchronize now** in Airplane mode | **"Forge couldn't reach the cloud, so sync stopped." / "Check your connection and try again."** Nothing lost; the next online sync succeeds | iPhone |
| O3 | Turn on Airplane mode **during** a sync, then sync again online | Stops safely. The next sync completes with **no duplicates** and no false conflicts (7.8B) | iPhone |
| D1 | **Backup from FORGE Dev** (test data): Export backup → Share a copy → Save to Files and AirDrop; I check it on Windows | The checker's counts match what FORGE Dev shows | iPhone + Windows |
| D2 | **Import into FORGE Dev** after changing its data: Import backup → "Replace local data from backup?" → Replace data; then sync | FORGE Dev's data equals the file. Sync completes; any conflict is shown, never applied silently | iPhone |
| D3 | **Reinstall and restore:**<ol><li>sync;</li><li>delete the FORGE Dev app (test data only);</li><li>`npm run dev:ios -- --release` again;</li><li>open it.</li></ol> | Either already signed in (iOS keeps the sign-in in the keychain after deletion) or sign in. Then **Restore my training** brings back everything: same counts as D1. A second restore duplicates nothing | iPhone (+ Mac) |
| D4 | **Expo Go check,** after every session | Your latest real workout is there, untouched | iPhone |

### P1: accounts and sessions (FORGE DEV only)

| ID | Test | Expected | Where |
| --- | --- | --- | --- |
| S1 | **Create throwaway account A** (Continue with Email → Create account), then complete the first-run steps | Signed in at once (no confirmation email); setup completes; Home | iPhone (A1) |
| S2 | Sign out (this phone), then sign in again | Training and its owner kept; syncs afterwards | iPhone |
| S3 | **Sign-in renewal** (FORGE DEV sign-ins last 5 minutes): leave Forge in the background 10+ minutes, return, sync; then 10+ minutes offline, reconnect, sync | Stays signed in; both syncs succeed (renewed automatically). Also confirms the 300-second setting | iPhone |
| S4 | **Sign-in ended elsewhere** during a workout: the second device runs **Sign out of all devices** for A | Within about 6 minutes: **"Signed out · Saved on this phone. Finish your workout, then sign in again to sync it."** Sets kept; finish; sign in as A; everything synced (7.8E §17 A) | iPhone + 2nd |
| S5 | Force-quit while continuing after S4, then reopen within 12 hours | **Return to your workout**; every set there (7.8E §17 B) | iPhone + 2nd |
| S6 | A requested **Sign out** (online, and in Airplane mode) during a workout | Never continues: Welcome without Return. After signing in as A, the workout is still in progress. Offline: says the sign-in still exists on the server (7.8E §17 C) | iPhone |
| S7 | **Another account:** sign out, create and sign in as throwaway B | **"This phone's training belongs to another account"**; A's training is invisible. Sign out, sign in as A: all intact | iPhone (A1) |
| S8 | **Delete account** (A or B), fresh, within 10 minutes of signing in; then again after more than 10 minutes | <ul><li>**Fresh:** offers an export, asks for the same sign-in, confirms, deletes, removes that account's training from FORGE Dev.</li><li>**Stale:** "Confirm it's you" first (the server hardening).</li></ul> | iPhone (A2) |
| S9 | **Password reset by email** | The email arrives; its link opens FORGE Dev (`forge-dev:///account`); the new password works. **Needs** a team address (Supabase's built-in sender) or custom SMTP | iPhone (A3), or later in Phase 8.5 |
| Y1 | **Two devices:** a workout on each, then sync both; edit the same template on both | Each sees the other's workout. The same record edited on both shows a conflict card with the differences; no duplicates | iPhone + 2nd |
| Y2 | A workout in progress on both devices | The other device's active workout is held, never merged or replaced (7.8B M5) | iPhone + 2nd |
| V1 | **The server rules, end to end** (`dev:verify-stage3`, two throwaway accounts created and deleted) | All ✓: owner-only reads; anonymous callers refused; no direct writes; fresh deletion works; stale and signed-out deletion asks to sign in again | Windows (A4) |

### P2: platform behaviour

| ID | Test | Expected | Where |
| --- | --- | --- | --- |
| N1 | **Permission refused:** turn the Notifications switch on and choose **Don't Allow** (or later: iOS Settings → FORGE Dev → Notifications off) | **"Notifications not enabled"**; the switch stays off; no rest notification; the in-app rest timer still runs | iPhone |
| N2 | **Barcode scanner:** camera permission, then scan a packaged food | Forge's own camera text; the scan finds the food or offers to add it | iPhone |
| P1 | **Large history:** import a synthetic backup of about 400 workouts into FORGE Dev | Tabs and logging stay responsive (measured on desktop: a set edit takes about 1 ms with the logger open) | iPhone (A5: generator) |
| X1 | VoiceOver on the logger (complete a set, the rest timer); Dynamic Type at the largest size; Reduce Motion | Readable and operable; nothing clipped | iPhone |

## 6. Where each test can run

| Place | Tests | Notes |
| --- | --- | --- |
| **Founder's iPhone** (required) | W1–W9, O1–O3, D1–D4, S1–S9, N1–N2, P1, X1 | Notifications while locked, interruptions, force-quit and restart, Airplane mode, the keychain, the camera and real performance only exist on the phone. Release build |
| **Second device** for S4, S5, Y1, Y2 | One of: <ul><li>a **Windows "second device"** that runs Forge's own sync engine against FORGE DEV as account A (A5: about a day of tooling);</li><li>a **spare iPhone or iPad**, registered like step 4;</li><li>**FORGE Dev in the Simulator** (A5: a `--simulator` option for `dev:ios`).</li></ul> | I recommend the Windows option: no extra hardware, and it can also trigger **Sign out of all devices** for S4 |
| **Mac Simulator** (optional) | Layout at the smallest and largest iPhones, Dynamic Type, light mode | Needs the simulator option (A5). The automated UI tests already cover sizes and text scales, so this is the lowest priority |
| **Windows** (me) | V1; D1 and §4 file checks; S4/Y1/Y2 as the second device (A5); every automated suite and the GitHub check; diagnosing reported failures | Fixes come with regression tests and are re-tested on the iPhone after approval |

**Suggested order:**

1. **Session 0** (§4, Expo Go, 10 minutes).
2. **Session 1** (Mac, 45 minutes): steps 1–5, then S1 and a short W1.
3. **Session 2** (60–90 minutes, ideally a real gym session): W1–W9, O1–O3, D4.
4. **Session 3** (45 minutes): D1–D3, S2–S8, Y1–Y2.
5. **V1** on Windows whenever approved.

## 7. What a failure triggers

1. I reproduce it from the report: on Windows where possible, or with an automated UI test.
2. You approve the fix.
3. I fix it with a regression test that fails without the fix.
4. Full checks.
5. Commit and push on your approval.
6. On the Mac: `git pull`, then `npm run dev:ios -- --release`.
7. You re-run the failed test, plus the tests that share its area.

No redesign; only what the failure needs.

## 8. Phase 8.2 close-out

**Verified (Nov 4, live, read-only):** see §1, FORGE DEV row.

**Done in Phase 8.3B** (Nov 4, uncommitted, for review):

- **`dev:check` reads the return-address allow list without Google.**
  - **How:** email-link verifications with random tokens, which create nothing. It checks the three `forge-dev:///` addresses, production's scheme, the `@` trick, one address per broad pattern and any website.
  - **Controls:** two control requests mean nothing is reported as passed or failed if Supabase answers any other way.
  - **Google** is information while it's deliberately off.
  - **Live on FORGE DEV:** every check passed (exit 0).
- **`supabase/verify/schema_summary.sql`:** the one-query PASS/FAIL check, tested in PGlite against eight database states, including later drift. `schema_checks.sql` now says to run it one query at a time.
- **`npm run backup:check`:** the backup checker in §4, with tests.
- **Documentation:** IMPLEMENTATION_STATUS, DEVELOPMENT_ENVIRONMENT (with Windows steps), NATIVE_BUILDS, IPHONE_TESTING, the README and `.env.forge-dev.example`. Plus the short [first-install checklist](../FORGE_DEV_IPHONE_CHECKLIST.md).

**Still open:**

| Item | How | Needs |
| --- | --- | --- |
| Server rules, end to end | V1 (`dev:verify-stage3`) | A4 |
| The schema, structurally | `supabase/verify/schema_summary.sql`, pasted once into FORGE DEV's SQL editor; expected "18 PASS, 0 FAIL" | The founder, read-only; required before production (E7) |
| 300-second sign-ins, no hooks, no CAPTCHA | Not readable from outside: S3 exercises the expiry, and V1 would fail if CAPTCHA were on | Covered by tests above |
| Rollback rehearsal | Development only, before any production deployment | Later, with E7 |

## 9. Approvals

Founder decisions, Nov 4, 2026:

| # | Approval | Covers | Status |
| --- | --- | --- | --- |
| **A0** | Run the Mac session: steps 1–5 (install FORGE Dev on the iPhone; registers it with the team) | Everything on the phone | **Approved**, guided once the founder is at the Mac and the prerequisites are confirmed; never started remotely |
| **A1** | Create throwaway FORGE DEV accounts **A** and **B** in FORGE Dev: plus-addresses on a domain you own; confirmation is off, so no email is sent | Every signed-in test (nearly all of §5) | Pending |
| **A2** | Account deletion tests on FORGE DEV (throwaway accounts only) | S8 | Pending |
| **A3** | The password-reset email test: a team address, or wait for custom SMTP (Phase 8.5) | S9 | Pending |
| **A4** | Run `dev:verify-stage3` from Windows: two throwaway accounts, created and deleted; needs the email address for the plus-addresses | V1 | Pending |
| **A5** | Build test tooling (code, not app changes): the Windows second device; the synthetic-history generator; optionally `dev:ios --simulator` | S4, S5, Y1, Y2, P1 | Pending |
| **A6** | Fix defects found, each with a regression test, reported before committing | §7 | Pending |
| **A7** | Check the founder's Expo Go backup file on Windows with the read-only checker (§4) | Data safety | **Approved**, for a file the founder explicitly provides; the original is never modified |
| **A8** | Commits: this document, the deferred 7.6A inventory and, later, the 8.2 close-out | Documentation | **Approved to prepare.** No commit or push yet |

## 10. Statements

- **Changed in the repository:** this document and the deferred 7.6A inventory (8.3A); the Phase 8.3B close-out in §8.
- **Session tools, outside the repository:**
  - the FORGE DEV-target check (a Windows export of FORGE Dev's JavaScript, deleted after scanning);
  - the live probes.
  The backup checker and the one-query schema check moved into the repository in 8.3B.
- **Not done:** no device was used, no account created, and no data, setting or infrastructure changed. Engineer #2's worktree and Phase 9 files were not touched.
