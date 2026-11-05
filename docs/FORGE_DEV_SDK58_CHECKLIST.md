# FORGE Dev after the Expo SDK 58 update: device checklist (Phase 8.4C-1)

Phase 8.4C-1 moved 16 packages to Expo SDK 58's own versions, including:
- React Native 0.88.1 and Expo 58.0.23;
- react-native-safe-area-context 5.11.1 and react-native-screens 4.30.1;
- expo-router, the camera, notifications, files, sharing and SQLite.

It also made the iOS status bar follow Forge's own Appearance on iOS 27, where the old way stopped working.

- **Covered without a device:** every automated check passes ([RELEASE.md](RELEASE.md) §11, V5).
- **This list:** what only a device shows.
- **Data:** FORGE Dev with FORGE DEV test data only. Expo Go and your real training are only read.
- **Time:** about 75 minutes. The first build after the update is slower: every pod is rebuilt.
- **Code:** the branch and commit named in the chat. They contain `feat/sdk58-alignment`. Nothing is merged until you approve, so testing changes nothing on `feat/forge-paths-foundation`.

**At any STOP, stop there and send the Terminal output or a screenshot.** For the status bar, a screenshot shows the icons best.

## Part 1: before the Mac (Expo Go, 5 minutes)

1. **Sync:** You → Account & privacy → **Synchronize now**. **STOP if it shows a conflict:** don't choose a version.
2. **Back up:** **Export backup** → **Share a copy** → **Save to Files**, as in [the Phase 8.3 checklist](FORGE_DEV_IPHONE_CHECKLIST.md), Part 1.

**Never, during these tests:**
- in Expo Go: Import backup, Sign out, Delete all local data, Delete Forge account;
- import your real backup into FORGE Dev.

## Part 2: at the Mac

In Terminal, in the main Forge-App folder:

```sh
git status -sb            # expect no files listed
git fetch origin
git switch feat/phase8-readiness
git log -1 --oneline      # expect the commit named in the chat
npm ci                    # the updated packages; a few minutes
npx expo-doctor           # expect: 20/20 checks passed. No issues detected!
npm run dev:check         # as in Phase 8.3: FORGE DEV, read-only
npm run dev:ios -- --release
```

**STOP if:**
- `git status` lists any file, or `git switch` refuses;
- `npm ci` fails, or Expo Doctor reports a failed check;
- `dev:ios` ends any way other than `✓ Opened FORGE Dev on <your iPhone>`. It installs nothing unless every check passes.

FORGE Dev keeps its data: it's the same app, updated in place.

## Part 3: the status bar (iPhone, 10 minutes)

- **Forge's Appearance:** You → Preferences → Appearance (Dark, Light or System).
- **The phone's mode:** Control Center → Dark Mode.

| # | Forge | Phone | Look at | Expected |
| --- | --- | --- | --- | --- |
| S1 | Dark | Light mode | Each tab, then History and Preferences | White clock, signal and battery everywhere |
| S2 | Dark | Dark mode | The same | White |
| S3 | Light | Light mode | The same | Dark icons everywhere |
| S4 | Light | Dark mode | The same | **Dark** icons: Forge's setting decides, not the phone's |
| S5 | System | Switch the phone's mode with Forge open | Any tab | Forge's colours and the icons switch together: dark icons on light screens, white on dark |
| S6 | Light | Light mode | Force-quit and reopen | White icons over the intro, then dark ones after it. The native launch screen, a split second before the intro, follows the phone's mode, as it always has |
| S7 | Dark, then Light | Either | Start a workout | The logger follows the theme too. Its back arrow and header are below the clock, and the arrow can be tapped (R1). **⋯** (Workout options) and a confirmation dialog leave the icons alone |

**STOP if** the icons are ever the same colour as the screen behind them.

## Part 4: everything else that changed (iPhone, FORGE Dev test account)

The tests are those of [the Phase 8.3 checklist](FORGE_DEV_IPHONE_CHECKLIST.md) and [the 8.3C results](audits/PHASE_8_3C_DEVICE_RESULTS.md), chosen by the packages that changed.

| Area (what changed) | Tests | Expected |
| --- | --- | --- |
| **Logger and safe areas** (safe-area 5.11.1, screens 4.30.1) | R1–R6 | As in the 8.3C results |
| **Workouts and recovery** | W1, W5, W6, W8, P1, P2, F1, F2 | As before the update |
| **Rest timer and alerts** (notifications 58.1.8) | RT1, RT2, RT3, RT5, RT6 | As before. The invitation (I1–I2) only if alerts were never turned on in this FORGE Dev |
| **Offline and sync** (`expo` 58.0.23's `fetch` carries every request to FORGE DEV) | O1, O2, Y1, then **Synchronize now** | No conflict; nothing lost |
| **Backups** (files 58.0.13, sharing 58.0.22) | D1, D5; D2 with D6, with FORGE Dev's own backup only | The share sheet opens, Save to Files works, `backup:check` agrees |
| **C1, the camera** (camera 58.0.14) | Nutrition → add a food → **Scan barcode** | The camera opens; a known product is found |
| **C2, the food catalogue** (SQLite 58.0.15) | Search a branded food, add it to today; force-quit, reopen | Found; still there |
| **L1, navigation** (router 58.0.30) | Back from History, Records, Calendar, Explore, Paths and an exercise | Each returns where it came from |
| **FP1, Forge Paths** | Paths → a program → the current program; start its workout | Opens; the workout starts |
| **K1, staying signed in** | Force-quit; then restart the phone | Still signed in, with the same data |

## Part 5: Expo Go (Windows)

Run the command below on Windows, then scan the QR code with Expo Go:

```powershell
cd C:\Users\LStAm\source\repos\Forge-App; npm.cmd start
```

| # | Do | Expected |
| --- | --- | --- |
| E1 | Open your training | Everything is there, unchanged |
| E2 | Each tab, then a workout (R7) | The status bar and logger look as before |

## Part 6: an iOS 27 Simulator (Mac)

The iPhone runs iOS 26.6.2; testers may run iOS 27. Once, in Xcode: Settings → Components → the iOS 27 runtime. Then:

```sh
npm run dev:ios -- --release --simulator "iPhone 17"
```

The `--simulator` mode is new and hasn't run on a Mac yet ([NATIVE_BUILDS.md](NATIVE_BUILDS.md)). **STOP if** it doesn't end with `✓ Opened FORGE Dev on the iPhone 17 Simulator`.

- **Light and dark mode:** Simulator → Features → Toggle Appearance.
- **Without signing in** (Forge's default Dark): S1 and S2 on Welcome and sign-in, and the intro.
- **Signing in** makes the Simulator a second device on the test account, so only with your approval (the plan's two-device item). Then S3–S5 and S7.
- **Expected:** exactly as on the iPhone.

## If something is wrong: going back

On the Mac:

```sh
git switch feat/forge-paths-foundation
npm ci
npm run dev:ios -- --release
```

This reinstalls FORGE Dev from the approved code over the same app, and its data stays: the update changed no data format (the database, backups and sync are unchanged). On Windows, the same `git switch` and `npm ci` return Expo Go's server to the approved code.

**Reporting a problem:** the test number, the step, what appeared, and a screenshot or screen recording. Then move on to the next test.

## Results

Not run yet.
