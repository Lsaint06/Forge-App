# FORGE Dev on your iPhone: first install and first tests (Phase 8.3)

FORGE Dev is Forge's own app, installed beside Expo Go. It uses only the development project, **FORGE DEV** (`gmyo…`), and its own storage.

- **It never reads or changes:** Expo Go, your real account or production.
- **Time:** about 45 minutes for the first install, mostly the build.
- **Reference:** [the full plan](audits/PHASE_8_3A_DEVICE_VALIDATION.md) and [NATIVE_BUILDS.md](NATIVE_BUILDS.md).

**At any STOP, stop there and send the Terminal output (or a screenshot).** Nothing needs fixing on the spot, and the outputs hold no keys or tokens.

## Part 1: before the Mac (Expo Go, 10 minutes)

1. **Sync:** You → Account & privacy → **Synchronize now**. **STOP if it shows a conflict:** don't choose a version.
2. **Back up:** **Export backup** → **Share a copy** → **Save to Files** → iCloud Drive (for example, a "Forge backups" folder).
3. **Second copy:** **Share a copy** again → AirDrop to the Mac.
4. **Optional check on Windows:** copy the file to the PC, then in the Forge-App folder:
   - run `npm.cmd run backup:check -- "<path to the file>"`;
   - expected: **"This backup is complete and restorable. The file was only read."** with your counts and a fingerprint;
   - the same fingerprint on two copies means the same file.

**Never, during these tests:**
- in Expo Go: Import backup, Sign out, Delete all local data, Delete Forge account;
- uninstall or reset Expo Go;
- import your real backup into FORGE Dev.

## Part 2: at the Mac

Open Terminal **in the main Forge-App folder**, not a folder inside `Forge-App.worktrees`.

**Step 1: the right code.**

```sh
git worktree list         # the first line is this folder
git status -sb            # expect: ## feat/forge-paths-foundation...origin/feat/forge-paths-foundation
git log -1 --oneline      # expect: 5f07c9b fix(dev): … (or the newer commit named in the chat)
```

- **STOP if** it's another branch, or `git status` lists any file. Don't switch branches or discard anything.
- If a newer commit was announced, run `git pull --ff-only` (**STOP if** it refuses), then `npm ci` if `package-lock.json` changed.

**Step 2: FORGE DEV only.**

```sh
ls -a | grep '^\.env'     # expect: .env  .env.example  .env.forge-dev  .env.forge-dev.example
npm run dev:check
```

Expected:

- **The first line:** `Development project gmyo…: read-only checks`.
- **✓** for Auth, settings, email sign-in, sign-ups and "Forge schema applied; anonymous users can't read it".
- **The ending depends on the Mac's commit:**

  | Mac at | Google | Return addresses | Last line |
  | --- | --- | --- | --- |
  | `5f07c9b` | ✗ (expected) | "not checked" | "1 check(s) failed." |
  | The Phase 8.3B commit | • (information) | ✓, checked without Google | "All checks passed." |

**STOP if:**

- the prefix isn't `gmyo…`;
- any ✗ other than Google;
- it says `.env.forge-dev` "points at the same project as .env";
- `.env.local`, `.env.development` or `.env.development.local` exists. Move it out of the folder; don't delete it.

**Step 3: signing.** Xcode → Settings → Accounts.

- Your Apple ID shows your **paid team**.
- **STOP if** the only team is "Personal Team": it can't sign Sign in with Apple.

**Step 4: the iPhone.**

1. Connect it with a cable, unlock it, and tap **Trust** if asked.
2. Check Developer Mode is on: Settings → Privacy & Security → **Developer Mode**.
3. Run:

```sh
npm run dev:ios -- --check
```

Expected: four ✓, one each for **Xcode**, **CocoaPods**, **Signing team** (your name and Team ID) and **iPhone** (iPhone 17, iOS 26.6.2, Developer Mode on).

**STOP if** there's any ✗. The line under it says what to do, for example the WWDR G3 certificate, or `--team <Team ID>` when the Mac knows several teams.

**Step 5: build, check, install** (only after Steps 1–4 pass).

```sh
npm run dev:ios -- --release
```

What you'll see, in order:

1. `FORGE Dev (com.lsaint06.forge.dev) → <your iPhone>, signed by <your team>`.
2. `Release: JavaScript built in, development project gmyo… (Expo's own .env files not read)`. **If it's not `gmyo…`, press Ctrl+C:** nothing gets installed.
3. **The build:** Expo prepares `ios/` and installs the pods, then Xcode builds for 10–20 minutes, printing "…still building" every minute.
   - If the Mac asks for your keychain, enter your Mac password and choose **Always Allow**.
   - **This first run registers your iPhone with your Apple team** and creates FORGE Dev's development profile (valid a year), as approved (A0).
4. `✓ Built in N min`.
5. `✓ Checked: FORGE Dev's ID and link scheme, signed by team …, no production values, JavaScript built in`.
6. `✓ Provisioning profile: team …, 1 registered iPhone, valid until 2027-…`.
7. `✓ Installed on <your iPhone>`, then `✓ Opened FORGE Dev on <your iPhone>`.

**STOP if** it ends any other way. The command installs nothing unless every check passes, and it prints the reason.

## Part 3: first launch (no account needed)

**Priority 1: standalone startup and reopening.**

| # | Do | Expected |
| --- | --- | --- |
| T1 | Look at the home screen | **FORGE Dev** beside Expo Go, with a plain white placeholder icon |
| T2 | Open it | A charcoal launch screen, the REFORGE intro, then **Welcome** with **Continue with Email**. **STOP if** "Accounts aren't available" |
| T3 | Unplug the cable, turn on Airplane mode, force-quit FORGE Dev (swipe it away), reopen it | Opens the same way, with no Mac and no network |
| T4 | Restart the iPhone, open FORGE Dev | Opens the same way |
| T5 | Switch light and dark mode (Control Center), then force-quit and reopen each way | No white or black flash between the launch screen and the intro |
| T6 | Open **Expo Go** | Your training is there, unchanged |

Turn Airplane mode off afterwards. **Stop here:** everything else is behind sign-in and needs a FORGE DEV test account (approval A1).

## Part 4: with a test account (after approval A1)

**Creating the account.** Continue with Email → **Create account**, then the first-run steps. Use a plus-address on your own mailbox (`you+forgedev1@…`) and keep the password in your password manager. FORGE DEV has email confirmation off, so no email is sent.

The test IDs and full expected results are in the [plan](audits/PHASE_8_3A_DEVICE_VALIDATION.md) (§5).

| Priority | Test | Expected (short) |
| --- | --- | --- |
| **2. Workouts and recovery** | **W1:** a real session (template and empty; comma decimals; add, remove and reorder; finish) | Every set saved as typed; correct summary and history; no lag or crash |
| | **W5:** force-quit mid-typing, during rest, after completing sets | Reopens with the workout in progress and every completed set |
| | **W6:** restart the phone mid-workout | As W5 |
| | **W8:** edit a finished workout, Cancel; edit again, save | Cancel restores it exactly; save keeps the change |
| **3. Rest timers and notifications** | **W2:** Preferences → Notifications on (allow the prompt); complete a set; lock the phone | "Rest complete — Ready for your next set?" with sound at the deadline |
| | **W3:** same, with another app open | A banner at the deadline; the timer is correct back in Forge |
| | **N1:** refuse the permission | "Notifications not enabled"; the in-app timer still runs |
| **4. Offline** | **O1:** Airplane mode, a full workout plus a food entry, force-quit and reopen offline, then reconnect and **Synchronize now** | Everything works offline; the sync succeeds afterwards |
| | **O2:** Synchronize now while in Airplane mode | "Forge couldn't reach the cloud, so sync stopped." Nothing is lost |
| **5. Backup and restore** | **D1:** export a backup from FORGE Dev; check it on Windows with `backup:check` | Its counts match what FORGE Dev shows |
| | **D2:** change something, then Import backup → Replace data | FORGE Dev matches the file again |
| | **D4:** open Expo Go after each session | Your real training is unchanged |
| **6. Accounts and sync** | Sign-out continuity, another account, deletion, two devices, the server rules | Each needs its own approval (A1–A5) |

## What's covered without your iPhone

| On Windows, automated, on every change | Only on your iPhone |
| --- | --- |
| <ul><li>Workout saving and restart recovery (real SQLite)</li><li>The sync protocol and conflicts, incremental downloads</li><li>Backup round trips</li><li>The logger, rest timer and sign-out continuity screens (about 800 UI tests)</li><li>FORGE Dev's FORGE DEV-only guards</li><li>`dev:check` against FORGE DEV</li><li>`backup:check` on any backup file</li><li>The schema checks in PGlite</li></ul> | <ul><li>Launch, intro and icon</li><li>Opening with no Mac and no network</li><li>Force-quit and restart</li><li>Notifications while locked or in the background, and permissions</li><li>Calls and other interruptions</li><li>Real performance in a long session</li><li>The camera and barcode scanner</li><li>Staying signed in (the keychain)</li><li>VoiceOver and the largest text size on the device</li></ul> |

**Reporting a problem:** the test number, the step, what appeared, and a screenshot or screen recording. Then move on to the next test.
