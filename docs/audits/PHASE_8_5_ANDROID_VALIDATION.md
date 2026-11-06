# Phase 8.5 M1: Android native validation

Branch `feat/phase8-5-forge-hardening`. Builds on [ANDROID.md](../ANDROID.md) (Phase 8.4, M3), which records the configuration, Android 16's changes, the founder's decisions D-A1 to D-A5 and the device checklist A1–A12. It isn't repeated here.

**Status (Nov 6, 2026): validated on an Android 16 emulator, not yet on a phone.**

- With the founder's approval, Android tooling was installed on this PC, without administrator rights or a restart.
- FORGE Dev was built locally as a minified release APK, signed with the debug key, on FORGE DEV only.
- The founder created a disposable FORGE DEV test account on the emulator and entered its credentials. Nothing was synchronized or restored.
- Three defects were found and fixed (§4). What an emulator can't show is in §6.

Results use three levels:
- **Emulator:** seen on the emulator, in a release build.
- **Partial:** part of the check ran. The rest needs a phone, or isn't allowed yet (sync, restore).
- **Not run:** needs a phone, a Play Console bundle or a decision.

## 1. Environment

| Need | Before (read-only check) | Used |
| --- | --- | --- |
| Android SDK | None in the standard places (no `ANDROID_HOME`, no `%LOCALAPPDATA%\Android\Sdk`). An older SDK from Phase 7, in `%LOCALAPPDATA%\forge-android\sdk` (an emulator, no build tools), wasn't used | In `%LOCALAPPDATA%\Android\Sdk`: command-line tools 23.0 (checksum verified), platform-tools, emulator 37.2.13, `platforms;android-37.0`, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.30.5 and `system-images;android-36;google_apis_playstore;x86_64` |
| Java | A JDK 21 cached by Gradle | The same JDK 21 (Eclipse Adoptium), set only inside the build script |
| Gradle | 9.2.1 cached | 9.4.1, downloaded by the project's wrapper |
| Acceleration | Unknown without administrator rights | `emulator -accel-check`: WHPX installed and usable |
| Long paths | `LongPathsEnabled` is 0 | Unchanged; worked around (§7) |
| Emulator | None | AVD `forge-api36`: Pixel 8 profile, Android 16 (API 36), 1080 × 2400 at 420 dpi, Google Play image, emulated back camera |
| Phone | None | None |
| EAS | Not linked | Not linked |
| Disk | 223 GB free | About 17 GB used: the SDK 6.2 GB, the emulator 7.0 GB, the worktree `C:\f` 4.0 GB |

## 2. The builds

| Commit | Contents | Gradle |
| --- | --- | --- |
| `66a6edc` | Phase 8.5 M2–M6 | Full build, about 4.5 min |
| `53bf269` | Fixes D-1 and D-2 | About 45 s |
| `07893b9` | Fix D-3 | About 40 s |

Each build was installed over the previous one (`adb install -r`). Data and sign-in were kept, and the first-install time didn't change.

Checked on the first and last APKs (`66a6edc`, `07893b9`):
- **Identity:** `com.lsaint06.forge.dev`, "FORGE Dev", version 1.0.0 (1). Minimum SDK 24, target 36, compile 37. x86_64 only (an emulator build), 76.1 MB.
- **Signing:** the React Native template's **debug key** (CN=Android Debug). It must never be uploaded.
- **Backend:** the Hermes bundle holds FORGE DEV's address and key, and **neither production's address nor its key**. Checked with a byte scan; no value was printed.
- **Links:** `forge-dev://` and the development client's `exp+forge-fitness://` open FORGE Dev. `forge://` and `forge-preview://` don't.

### Merged permissions (V6)

Read from this release build. The first App Bundle must still confirm the list (A12).

| Permission | Added by | Forge uses it |
| --- | --- | --- |
| `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK` | The app and its libraries | Yes |
| `CAMERA` | expo-camera | Yes: barcodes, after a prompt |
| `VIBRATE` | expo-haptics | Yes |
| `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` | expo-notifications | Yes: rest alerts and reminders |
| `SYSTEM_ALERT_WINDOW` | The Expo template | No (D-A4) |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | expo-secure-store | No: nothing uses `requireAuthentication` |
| `com.google.android.c2dm.permission.RECEIVE` | Firebase Messaging, through expo-notifications | No: remote notifications are off |
| `READ_APP_BADGE` and 15 launcher-badge permissions (Samsung, Huawei, HTC, Oppo, Sony and others) | ShortcutBadger, through expo-notifications | No: `shouldSetBadge: false` |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` | Play Install Referrer, through expo-application | No |
| `com.lsaint06.forge.dev.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX | Internal, signature-only |

**Proposal (needs approval, not done):**
- Block the unused permissions in `android.blockedPermissions`, together with D-A4.
- Then rebuild, and re-check rest alerts, the scanner and sign-in.

## 3. Results

| # | Feature | Method on the emulator | Result | Level |
| --- | --- | --- | --- | --- |
| 1 | Cold and warm start, splash | `am start -W`; force-stop and reopen; background and return | First frame 748 ms cold and 138 ms warm; later cold starts 366–512 ms. The intro, then Welcome or Home. **Offline with an expired sign-in:** about 28 s on "Opening FORGE…" (**D-3**). After the fix, Home in about 6 s (screen polling, 3 runs) | Emulator |
| 2 | Sign-in and accounts | The founder signed up and finished setup | Stays signed in through force-stops, two in-place updates and an emulator restart. Offline, the Account screen says "Signed in · offline", then "Signed in" about 10 s after reconnecting. The sign-in button stays above the keyboard. **Not run:** password-reset and confirmation email links | Partial |
| 3 | Five tabs | Each tab, signed in, with a workout in progress | All render; no errors in the log | Emulator |
| 4 | System back | Back with the full soft keyboard: the logger, Set Details, Add food | Back closes the keyboard first, then the sheet or screen. Leaving the logger with Back keeps the workout. On the account-entry screen, Back leaves FORGE (O-1). **Not run:** the discard question when editing a finished workout | Partial |
| 5 | Deep links | `adb` intents for each scheme | Only FORGE Dev's own schemes open it (§2). **Not run:** links from an email app | Partial |
| 6 | Keyboard | Full soft keyboard (emulator without a window): sign-in, Set Details, a set cell that the keyboard would cover | Each focused field stays visible above the keyboard. The logger scrolls the focused cell above its dock | Emulator, one screen size |
| 7 | Edge-to-edge | Dark theme: entry screens, the five tabs, the logger and its dock, the sheets in row 15 | All clear the status bar and the gesture handle. **Not run:** the light theme (A9) | Partial |
| 8 | Orientation | Rotation | Stays portrait on a phone. **Not run:** a tablet or foldable (D-A3) | Partial |
| 9 | Background and resume | Home button during a rest | The rest alert arrives; tapping it reopens the workout | Emulator |
| 10 | Workouts | A freestyle workout: two exercises found with the picker's search, typed weights and reps, completed sets, Set Details (RPE 11 refused, then 8), Progression, finished offline | The summary, Home's streak, and Progress's volume (3,165 lb, which matches the sets) all agree. **D-1** and **D-2** found (fixed). **Not run:** editing a finished workout | Partial |
| 11 | Rest timer and alerts | Complete a set; +30 s; Skip; Finish; force-stop | Completing a set schedules one alarm at the rest's end. +30 s moves it 30 s later; Skip and Finish cancel it. A force-stop removes the app's alarms, and reopening FORGE schedules the alert again. The alert reads "Rest complete" and "Ready for your next set?", on the `training` channel at default importance. With FORGE in the background it arrived **27 s late** (inexact alarm, D-A1). **Not run:** screen off, Doze, a phone restart | Partial |
| 12 | Notification permission | The first rest | The invitation (W-2) appears once the keyboard is down. Android's prompt comes only after **Enable notifications**. Allowed, the permission is granted | Emulator |
| 13 | Force-quit recovery | `am force-stop` while typing a weight, without leaving the cell; an emulator restart | The typed value is kept; the workout reopens; the session timer follows the clock | Emulator |
| 14 | Offline training and sync | Airplane mode: log and complete sets, force-stop, reopen, finish | Every value kept. **No sync** (not allowed in this pass) | Partial |
| 15 | Modals and sheets | Set Details, Progression, the exercise menu and picker, Finish, Add food, a food's details, Scan barcode | All open, scroll and close at 1080 × 2400. O-3. **Not run:** small screens | Partial |
| 16 | Text size | Font scale 2.0 on the entry screens | No clipping. Home's "Start workout" wraps to two lines at the default size (O-2). **Not run:** signed-in screens at large sizes | Partial |
| 17 | Barcode scanning and camera | Scan barcode; a typed barcode | Android's prompt appears, and "While using the app" shows the live preview (emulated camera). The typed barcode (049000028911) finds its product in the bundled USDA catalogue. **Not run:** a real barcode; ML Kit's 16 KB alignment | Partial |
| 18 | Database start | First launch, about 15 relaunches, two updates, an emulator restart | The data is intact every time | Emulator |
| 19 | Disk space | — | — | Not run (phone) |
| 20 | Export and sharing | Save backup to a folder | Android's folder picker refuses the storage root, so Documents was chosen; FORGE says "Backup saved and checked". The file, pulled to this PC, passes `backup:check`: 1 workout, 3 sets, restorable. The copy was then deleted. **Not run:** Share a copy, and Import (which replaces the data) | Partial |
| 21 | Backup policy | — | — | Not run (device backup and restore) |
| 22 | 16 KB pages | — | — | Not run (first App Bundle) |
| 23 | Food search and logging | "banana" → Banana, raw → 1 banana (126 g) → Breakfast | The day reads 122 kcal, protein 1 g, carbs 29 g, which matches USDA's values | Emulator |

## 4. Defects found and fixed

Severity follows the beta scale (PHASE_8_5_DIAGNOSTICS.md): P1 means a core flow is blocked, P2 that a workaround exists, P3 polish.

| ID | Severity | What happened | Cause | Fix | Test | Checked on the emulator |
| --- | --- | --- | --- | --- | --- | --- |
| D-1 | P2 | A freestyle exercise without logged working sets: Progression offered "Suggested load · 0 lb", and **Apply** set the sets to 0 | The generic suggestion returned 0 lb instead of no suggestion | `overload()` returns no load, as targeted progression already did. The sheet reads "No load suggestion yet" with Apply disabled | `workout-logger.test.tsx` (fails without the fix) | `53bf269`: Overhead Press without history; the typed 95 lb is kept |
| D-2 | P2 | On Android a set cell keeps focus while a sheet is open. After typing in it, an applied load was saved, but the cell kept showing the typed value; leaving the cell wrote that value back. So Apply silently didn't change that set | The cell kept its draft when its value changed elsewhere | The cell shows a value set elsewhere and drops its draft. Its own saves are unchanged | `workout-logger.test.tsx` (fails without the fix) | `53bf269`: typed 150, applied 145, left the cell: 145 |
| D-3 | P1 | Opened without a connection more than an hour after the last online use, FORGE showed "Opening FORGE…" for about 28 s | With an expired access token, supabase-js retries the refresh for about 25 s before it answers, and the launch waited for that answer | After 3 s, the stored sign-in is used offline until the answer comes. The answer still settles the session: renewed, offline, or ended | `session-events.test.tsx`, with the real supabase-js client (fails without the fix) | `07893b9`: Home in about 6 s, 3 runs of 3 |

**D-3: what changes if the answer is "signed out".** When the account service ends the sign-in (revoked elsewhere, or the account deleted), FORGE now does what it does when a sign-in ends during use (Phase 7.8E, Stage 4):
- Welcome, with the ended-sign-in notice;
- the athlete's own workout in progress can still be finished.

This happens only if FORGE was already in offline use, that is, when the answer took over 3 s.

## 5. Observations, not fixed

| ID | What | Owner or decision |
| --- | --- | --- |
| O-1 | On the account-entry screen, system Back leaves FORGE. That screen is the root of its stack, which is standard on Android | Engineer #2's entry flow: noted for review |
| O-2 | Home's hero button, "Start workout", wraps to two lines at the default text size (1080 × 2400, 420 dpi) | P3 polish |
| O-3 | After typing a barcode, the food's details open scrolled by about 32 px, half-hiding the brand line. The scanner and the details reuse one sheet, which keeps its scroll position | P3 polish; the fix touches the shared sheet |
| O-4 | The rest alert arrived 27 s late with FORGE in the background. Expected with inexact alarms | Decision D-A1, with phone measurements |
| O-5 | Permissions Forge doesn't use (§2) | Proposal in §2, with D-A4 |

Notes on method:
- **The windowed emulator** takes typing from this PC's keyboard, so Gboard shows only a small toolbar. Back then closes the keyboard and the sheet or screen at once. With the full soft keyboard (the emulator without a window), Back behaves as on a phone: rows 4 and 6 come from that run.
- **UI Automator** can't read the logger while its clock ticks, so screenshots were used there. It reads sheets and other screens.

## 6. Still needs a phone or Play Console

1. A real barcode scan (camera and ML Kit), and ML Kit's 16 KB alignment (A5, A12).
2. Rest alerts with the screen off, in Doze, after a phone restart, and under battery managers such as Samsung's and Xiaomi's: delay and banner (A4, A10; D-A1, D-A2).
3. Speed on a mid-range phone (the emulator runs on this PC's processor).
4. The light theme and both system modes (A9), and TalkBack.
5. Password-reset and confirmation links from an email app (A7).
6. Share a copy and Import through the system pickers (A6); a nearly full phone.
7. Device backup and restore, with the sign-in kept out (row 21).
8. A tablet or foldable (A11, D-A3).
9. The first App Bundle in Play Console: 16 KB pages and the permission list (A12, V6).
10. Sync with a second device (A8), once sync testing is approved.

## 7. Rebuilding on this PC

EAS (ANDROID.md §6) stays the route for FORGE Preview and the App Bundle. This local route builds FORGE Dev for emulators.

1. **Worktree on a short path.** Windows' 260-character limit breaks the NDK build from the repository's own folder.
   ```
   git worktree add --detach C:\f <commit>
   ```
   Then run `npm ci` there.
2. **Food catalogue.** Run `npm run branded:ensure` in the worktree, or copy `assets/catalog/` from the main checkout. It's gitignored; EAS builds generate it in `eas-build-post-install`.
3. **Environment, as `dev:ios`:**
   - remove every `EXPO_PUBLIC_*` variable from the shell;
   - load only `.env.forge-dev`'s `EXPO_PUBLIC_*` values, from the main checkout. It must say `EXPO_PUBLIC_FORGE_ENV=development`;
   - set `APP_VARIANT=development`, `EXPO_NO_DOTENV=1` and `EXPO_NO_GIT_STATUS=1`;
   - set `JAVA_HOME` (JDK 17 or 21) and `ANDROID_HOME`.
4. **Prebuild:** `npx expo prebuild --platform android --clean --no-install`.
5. **Object paths.** In the generated `android/app/build.gradle`, inside `defaultConfig`, add:
   ```gradle
   externalNativeBuild { cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=240" } }
   ```
   - Without it, ninja can't create its object folders, even from `C:\f`.
   - A `--clean` prebuild removes it. It is never committed.
   - EAS builds, on Linux and macOS, don't need it.
6. **Build:** in `android`, run `gradlew.bat assembleRelease -PreactNativeArchitectures=x86_64`.
   - x86_64 is for the emulator; leave the property out for a phone.
   - The APK is `android\app\build\outputs\apk\release\app-release.apk`.
7. **Check the APK before installing (§2):**
   - `aapt2 dump badging` and `aapt2 dump permissions`;
   - the bundle scan;
   - the signer.
8. **Install** over the previous build with `adb install -r`, which keeps the data.
   - With more than one emulator running, name it: `adb -s emulator-5554 …`.
   - Never uninstall or clear the app's data without the founder's approval: that deletes the test account's training on the emulator.

## 8. Decisions and approvals

- **D-A1 to D-A5** (ANDROID.md §4). New evidence:
  - D-A1: an alert 27 s late in the background (O-4);
  - D-A4: `SYSTEM_ALERT_WINDOW` is in the release build, with the other unused permissions (§2).
- **The emulator's test account:** keep it for re-tests, or discard its data. Uninstalling deletes it. Nothing on it was synchronized.
- **EAS linking**, for FORGE Preview and the first App Bundle (STORE_SETUP.md §1).
- **O-1**, for Engineer #2.