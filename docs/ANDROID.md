# Android: readiness and device validation (Phase 8.4, M3)

Android launches with iOS. This Windows PC has no Android toolchain, and EAS builds Android in the cloud ([RELEASE.md](RELEASE.md) §8).

This page records:
- what is known about Forge's Android builds without a device (Nov 5, 2026);
- what was fixed;
- what needs the founder's decisions;
- what to verify on devices.

**Nothing here has run on an Android device or emulator yet.**

## 1. The build, as Expo SDK 58 makes it

| Item | Forge's Android builds | Source |
| --- | --- | --- |
| Apps | `com.lsaint06.forge`, `.dev` and `.preview` | [RELEASE.md](RELEASE.md) §1 |
| Android versions | Android 7.0 and later (minSdk 24) | React Native 0.88.1's version catalog |
| Target and compile SDK | Target API 36 (Android 16), compile SDK 37. Google Play requires target 36 for new apps and updates since Aug 31, 2026 (extensions ended Nov 1) | The same; `tests/android-readiness.test.ts` |
| Toolchain on EAS | Build-Tools 37.0.0, NDK 27.1, Android Gradle Plugin 9.2.1, Kotlin 2.2.0; JDK 17 | The same; RELEASE.md §11, V4 |
| Runtime | New Architecture, Hermes, edge-to-edge (`edgeToEdgeEnabled=true`) | Expo's template |
| Architectures | arm64-v8a, armeabi-v7a, x86_64, x86. One App Bundle; Play gives each phone its own | Expo's template |
| **R8 in release builds** | **On.** `android.enableMinifyInReleaseBuilds=true`; resource shrinking off. Phase 8.4C-0 wrongly recorded it as off | Expo's SDK 58 template |
| Release signing | The template signs release builds with the **debug** key unless EAS replaces it. EAS's builds use the upload key EAS holds, whose creation needs approval. Never upload a bundle built on a computer | Expo's template; RELEASE.md §8 |
| 16 KB memory pages | Google Play requires them since Nov 1, 2025. Native libraries in `node_modules`: `libexpo-sqlite.so` is 16 KB-aligned. expo-sqlite's optional `vec.so` (sqlite-vec) is 4 KB-aligned and packaged only when that extension is on: off in Forge, and tested | Scanned Nov 5, 2026; `tests/app-variants.test.ts` |

What R8 means for testing:
- **Validate release builds.** R8 can remove code that native modules reach by reflection, so a release build can fail where a debug build works.
- **Crash reports stay readable.** The App Bundle carries R8's mapping file, which Play uses to read crash reports.

**Still to check on the first bundle:**
- the 16 KB alignment of libraries that come from Maven: React Native, Hermes, and ML Kit for the barcode scanner;
- the permissions those libraries add (V6).

Both show in Play Console's App bundle explorer.

## 2. Android 16's changes for apps that target it

| Change | What it means for Forge | Status |
| --- | --- | --- |
| **Edge-to-edge, no opt-out** | Screens draw under the status and navigation bars. Forge positions content with safe-area insets throughout, including the Phase 8.3C logger fix | To verify on a device |
| **The keyboard** | Under edge-to-edge the window no longer shrinks for the keyboard. A `KeyboardAvoidingView` without a `behavior` leaves its fields under it ([Expo's guide](https://docs.expo.dev/guides/keyboard-handling/)). The logger already handled this; the shared screens, sheets and sign-in screens didn't | **Fixed in M3** (below); to verify on a device |
| **Predictive back** | Now on by default, and it stops the classic back events. Forge's logger uses them: Back while editing a finished workout acts as Cancel. Forge keeps `android:enableOnBackInvokedCallback="false"`, Expo's default and Android's documented temporary opt-out | Kept and tested; migrating is a separate change |
| **Large screens** | On displays 600 dp and wider (tablets, open foldables), Android 16 ignores Forge's portrait lock and fixed size: the app fills the window and can rotate | **Decision D-A3** |

**The keyboard fix (M3).** Every screen, sheet and sign-in screen now pads above the keyboard on both platforms (`behavior="padding"`):
- `Screen` and `Sheet` in `src/components/ui.tsx`;
- `ForgeScreen`, `ForgeSubScreen` and `EntryFrame`.

On iPhone nothing changes: it already used `padding`. React Native 0.88 makes a sheet's own window edge-to-edge too, so sheets need the padding as well. `tests/ui/android-keyboard.test.tsx` covers it.

The earlier record "behaviour off on Android (window resize)" (Phase 7B WP6) predates enforced edge-to-edge.

## 3. Notifications

- **Visibility.** Rest alerts use one channel, "Training reminders", at default importance. On Android that means a sound but no pop-up banner over other apps. On iPhone the same alert is a banner (8.3C, RT2).
  - Once a channel exists on a phone, only the user can raise its importance; the app can only create a new channel.
  - Forge has no Android installs yet, so now is the time to choose. **Decision D-A2.**
- **Timing.** expo-notifications sets an exact alarm only with Android's "Alarms & reminders" permission (`SCHEDULE_EXACT_ALARM`), which Forge doesn't declare.
  - Without it, rest alerts use inexact alarms (`setAndAllowWhileIdle`), which can arrive late, especially with the screen off (Doze).
  - The in-app countdown stays exact while Forge is open.
  - Android allows exact alarms when "a user-facing function requires precisely-timed actions" ([Android](https://developer.android.com/develop/background-work/services/alarms)).
  - `SCHEDULE_EXACT_ALARM` is off by default on Android 14 and later until the user allows it; expo-notifications 58 can open that setting (`requestExactAlarmPermissionsAsync`).
  - `USE_EXACT_ALARM` is restricted by Play policy to alarm-clock and calendar apps, and doesn't fit Forge.
  - **Decision D-A1.**
- **Permission.** `POST_NOTIFICATIONS` is asked at runtime on Android 13 and later, only after the lifter taps **Enable notifications** (8.3C-3, W-2).
- **Expo Go on Android** has no notifications module (SDK 53 and later), so Forge skips notifications there (`src/notifications.ts`).

## 4. Decisions for the founder

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-A1 | **Rest-alert timing** | (a) inexact alarms for the beta, with the delay measured on devices; (b) exact alarms, once the lifter allows them in Android's settings; (c) a rest timer with a live countdown notification (a foreground service) | (a) first; (b) if the delays matter |
| D-A2 | **Rest-alert visibility** | Default importance (sound, no banner), or high (banner) in a separate "Rest timer" channel | High for rest alerts, as on iPhone; reminders stay default |
| D-A3 | **Large screens** | (a) Android's temporary opt-out (`PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY`, a small config plugin); (b) layouts that adapt; (c) leave tablets out in Play Console | (a) for the beta, with (b) planned. The opt-out ends when Forge targets API 37 |
| D-A4 | **`SYSTEM_ALERT_WINDOW`** | Block it (Forge doesn't use it in release builds) or keep it | Block it (RELEASE.md §9, waiting since 8.4B) |
| D-A5 | **Test devices** | A physical Android phone; emulators on this PC (§5); or testers through EAS internal distribution | One physical phone on Android 15 or 16, plus emulators |

## 5. Tooling on this PC (approval needed)

| Purpose | Needs | Size (approx.) |
| --- | --- | --- |
| EAS cloud builds (planned) | Nothing more here; EAS linking is a separate approval | — |
| **Emulators**, to run EAS-built APKs: Android versions, phone sizes, a tablet or foldable | Android Studio (or the command-line SDK) with the emulator, `adb`, and an Android 16 (API 36) Google Play image; Windows Hypervisor Platform turned on | 10–15 GB |
| Local Android builds (optional) | JDK 17, SDK Platform 37, Build-Tools 37.0.0, NDK 27.1.12297006, CMake | 15–25 GB more |

**Recommendation:** emulators on this PC once EAS is linked. Skip local builds while EAS builds Android.

## 6. Device checks (8.4D)

**The build:** `eas build --profile development-release --platform android`. It makes a FORGE Dev APK with FORGE DEV, a minified release build (RELEASE.md §8, step 4).

| # | Area | Do | Expected |
| --- | --- | --- | --- |
| A1 | Launch | Install; open; then each tab | The launch screen, intro and Welcome appear. Content stays clear of the status bar, the navigation bar and the gesture handle |
| A2 | **Keyboard** | Sign in and create an account; a food sheet; an account or Preferences field; the logger's weight and reps | The focused field and its button stay above the keyboard; nothing moves up twice |
| A3 | **Back** | The back gesture and button on a pushed screen, a sheet and the logger. Edit a finished workout, change a set, press Back | Back leaves screens and closes sheets. In the edit, Back asks to discard the change, as Cancel does |
| A4 | **Rest alerts** | Turn alerts on and allow the prompt; rest with the screen off; rest with another app open | The alert arrives. Note how late (D-A1) and whether a banner appears (D-A2) |
| A5 | Camera | Nutrition → add a food → **Scan barcode** | The permission prompt; scanning works in this minified build |
| A6 | Backups | Export (share sheet, then Drive or Files); Import (the document picker) | Both work; `backup:check` agrees |
| A7 | Links | A password-reset email link | Opens FORGE Dev |
| A8 | Offline and sync | As O1, O2 and Y1 on iPhone | As on iPhone |
| A9 | Themes | Dark, Light and System, in light and dark mode | Status-bar and navigation-bar icons readable in every case |
| A10 | Restart | Force-stop mid-workout; restart the phone during a rest | The workout comes back; the rest alert still arrives (`RECEIVE_BOOT_COMPLETED`) |
| A11 | Large screen | A tablet or foldable emulator on API 36 | Note how Forge looks wide and rotated (D-A3) |
| A12 | 16 KB pages and permissions | The first App Bundle in Play Console's App bundle explorer | No 16 KB warning. The permission list matches RELEASE.md §9 (V6) |

## 7. What the repository checks

- **`tests/android-readiness.test.ts`:**
  - the SDK levels against Google Play's requirement;
  - every permission the native libraries declare, so a new one can't slip into the Data safety answers unnoticed.
- **`tests/app-variants.test.ts`,** in Expo's own pipeline:
  - the app manifest: classic back, the keyboard mode, portrait, exactly four permissions, backups and links;
  - no sqlite-vec, and no override of the SDK levels.
- **`tests/ui/android-keyboard.test.tsx`:** keyboard padding on both platforms.

**Not checked here:**
- anything on screen;
- when alerts arrive;
- the permissions and 16 KB alignment of Maven libraries;
- R8's effect on a running app.
