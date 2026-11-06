# Phase 8.5 M1: Android native validation

Branch `feat/phase8-5-forge-hardening`. Builds on [ANDROID.md](../ANDROID.md) (Phase 8.4, M3), which records the configuration, Android 16's changes, the founder's decisions D-A1 to D-A5 and the device checklist A1–A12. It isn't repeated here.

**Status: no native Android build, emulator or device run was possible.** Every native item below remains **unverified**. A JavaScript export, a configuration check or a unit test doesn't show that FORGE builds or runs on Android.

## 1. This PC (checked Nov 6, 2026, read-only)

| Need | Found |
| --- | --- |
| Android SDK | None: no `ANDROID_HOME` or `ANDROID_SDK_ROOT`, no `%LOCALAPPDATA%\Android\Sdk`, no Android Studio |
| Java | None on `PATH`. A JDK 21 (Eclipse Adoptium 21.0.12) is cached by Gradle in `~\.gradle\jdks`, from other projects |
| Gradle | 9.2.1 cached in `~\.gradle\wrapper\dists` |
| `adb`, emulator, system images | None |
| Android phone | None connected (no `adb`) |
| Virtualization | A hypervisor is present. Whether the Windows Hypervisor Platform (needed for emulator acceleration) is on can't be read without administrator rights |
| Long paths | `LongPathsEnabled` is 0. React Native's native (CMake and NDK) steps fail on long Windows paths, and this repository's deepest path is already 237 characters |
| Disk | 223 GB free |
| EAS | Not linked (founder approval) |

## 2. Validation matrix

Device, Android version and actual result are the same for every row: **none, —, not run (no build)**. *Evidence so far* is what the repository shows without a device.

| # | Feature | Test method (planned) | Evidence so far | Defect | Fix | Remaining blocker |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Cold and warm start, splash | Install the FORGE Dev APK; force-stop and open; background and return (A1) | Splash and intro tests (`splash.test.tsx`) | — | — | Build |
| 2 | Sign-in and accounts | Email sign-in, sign-up, password reset link (A2, A7) | Auth suites; links per app (`app-variants`) | — | — | Build |
| 3 | Five tabs and switching | Open each; switch during a workout | UI suites; `render-cost`, `accessibility-sweep` (M2, M3) | — | — | Build |
| 4 | System back | Back button and gesture: screens, sheets, the logger's edit (A3) | Classic back events kept and tested (`app-variants`) | — | — | Build |
| 5 | Deep links | `forge-dev://` links; email links (A7) | Scheme per app (`app-variants`) | — | — | Build |
| 6 | Keyboard | Sign-in, sheets, the set grid near the bottom (A2) | `behavior="padding"` everywhere (`android-keyboard.test.tsx`, 8.4) | Fixed in 8.4 (`989c11f`) | `989c11f` | Device check |
| 7 | Edge-to-edge, status and navigation bars, gestures | Every tab and sheet in both themes (A1, A9) | Safe-area insets throughout; logger safe area (8.3C) | — | — | Build |
| 8 | Orientation | Phone portrait; a tablet or foldable (A11) | Portrait lock in the manifest; ignored on large screens by Android 16 (decision D-A3) | — | — | Decision D-A3 |
| 9 | Background and resume | Background mid-workout and mid-rest; return | Values saved per keystroke (T-1) | — | — | Build |
| 10 | Workouts: start, exercises, sets, edits, finish, history | Full session; edit a finished one | Stress tests (M4); logger suites | — | — | Build |
| 11 | Rest timer and alerts | Rest with the screen off, another app open, after a restart (A4, A10) | Alerts scheduled through `expo-notifications`; inexact alarms (D-A1); default importance (D-A2) | — | — | Decisions D-A1, D-A2 |
| 12 | Notification permission | Tap Enable notifications (Android 13+ prompt) | Asked only after the tap (8.3C-3, W-2) | — | — | Build |
| 13 | Force-quit recovery | Force-stop mid-workout (A10) | The workout is stored as it is logged | — | — | Build |
| 14 | Offline training and sync | Airplane mode; log; reconnect; sync (A8) | `sync-convergence` (faults), `nutrition-offline` (M4) | — | — | Build |
| 15 | Modals and sheets | Every sheet on a short screen | Accessibility sweep at 320 × 568 pt and 200% text (M3) | — | — | Build |
| 16 | Text clipping and font scaling | Largest font size and display size | Caps only on display styles (M3) | — | — | Build |
| 17 | Barcode scanning and camera permission | Scan in a minified release build (A5) | ML Kit's 16 KB alignment unchecked (V6) | — | — | Build |
| 18 | Database start | First launch; relaunch | Migrations and Recovery tests; failure codes (M6) | — | — | Build |
| 19 | Disk space | Export and backup on a nearly full phone | Write faults are all-or-nothing (M4) | — | — | Device |
| 20 | Export and sharing | Share sheet to Drive or Files; import with the picker (A6) | `backup:check` agrees with the importer | — | — | Build |
| 21 | Backup policy | Device backup, then restore | Sign-in kept out of backups (`app-variants`) | — | — | Device |
| 22 | 16 KB pages | The first App Bundle in Play Console (A12) | `libexpo-sqlite.so` aligned; sqlite-vec off (8.4) | — | — | First bundle |

## 3. Executable plan

### Option A: EAS cloud build (recommended)

Needs the founder's approval to link EAS (STORE_SETUP.md §1). No Android toolchain on this PC.

1. Link EAS and set the FORGE Dev variables (RELEASE.md §4).
2. Build: `eas build --profile development-release --platform android`. This is a FORGE Dev APK on FORGE DEV, minified as a release build (RELEASE.md §8).
3. Run checks A1–A12 on a phone (D-A5).
4. Optionally, run it on emulators here (Option B, steps 2 and 5 only).

### Option B: local build on this PC

Needs approval to install about 8–10 GB of Android tooling. Emulator acceleration may also need the Windows Hypervisor Platform turned on (administrator rights and a restart). Uses only FORGE Dev and FORGE DEV. Creates no signing key: the template signs local release builds with its debug key, which must never be uploaded.

1. **Short path, no registry change.** Create a worktree of this branch at `C:\f` (`git worktree add C:\f feat/phase8-5-forge-hardening`), then run `npm ci` there. This avoids the long-path failure without administrator rights.
2. **SDK.** Download Google's command-line tools to `%LOCALAPPDATA%\Android\Sdk`. Set `JAVA_HOME` to a JDK 17 (EAS's version) or the cached JDK 21. Then:
   ```
   sdkmanager "platform-tools" "platforms;android-37" "build-tools;37.0.0" "ndk;27.1.12297006" "emulator" "system-images;android-36;google_apis_playstore;x86_64"
   ```
   Accept the licences. CMake installs at the version the build asks for.
3. **Build FORGE Dev.** Set `APP_VARIANT=development` and `EXPO_NO_DOTENV=1`, with only `.env.forge-dev`'s values (as `dev:ios` does). Then:
   ```
   npx expo prebuild --platform android --clean
   android\gradlew.bat -p android assembleRelease
   ```
4. **Check the APK before installing:**
   - `aapt2 dump badging` reports `com.lsaint06.forge.dev`;
   - the bundle has no production address or key (the same scan as the iOS exports);
   - `npm run release:check -- --profile development-release` passes.
5. **Run.**
   - Check acceleration: `emulator -accel-check`.
   - Create a Pixel-sized AVD on API 36 and boot it.
   - Install and screenshot:
     ```
     adb install -r <apk>
     adb exec-out screencap -p > shot.png
     ```
   - Then run A1–A12 where an emulator can, and record results in §2.

## 4. Approvals needed

- **Either** EAS linking (Option A, preferred for the beta), **or** the local Android tooling (Option B), **or** both. Option B adds emulators to EAS builds.
- Decisions D-A1 to D-A5 (ANDROID.md §4), before the first Android testers.
