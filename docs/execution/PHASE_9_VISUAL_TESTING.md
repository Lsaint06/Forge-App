# Phase 9 — Android visual testing (Opus 2)

**Status (2026-11-04): operational.** Phase 9.2 onboarding ran on the Android emulator Opus 1 (Engineer #1) set up. It was navigated end to end, and every screen was captured at three viewports and inspected. Nothing was committed, and production was not used.

## 1. For Opus 1: Android Expo Go is refused by the environment guard

**Symptom.** On Android Expo Go, Forge shows "Accounts aren't available". Metro logs `[FORGE] Accounts aren't available: This app's ID isn't one of Forge's builds (app.config.ts)`.

**Cause.** `appIdentity()` in `src/cloud/client.ts` detects Expo Go like this:

```ts
expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
```

On Android Expo Go 58.0.5 (AVD `forge`, Android 15), this is `false`. `checkEnvironment()` (`src/cloud/environment.ts`) then treats Expo Go as one of Forge's own builds. Expo Go's package, `host.exp.exponent`, isn't in `APP_IDS`, so the check fails before any environment variable is read.

**Impact.**

- Every Android Expo Go session is refused, whatever the environment, the production `.env` included. On Android, `docs/DEVELOPMENT_ENVIRONMENT.md` ("Today nothing changes. Expo Go … connects to the production project exactly as before") doesn't hold.
- iOS Expo Go was not tested here. The founder trains in Expo Go on his iPhone, which suggests iOS is unaffected. Handoff row X12 (the founder is never locked out) depends on that.
- Emulator visual testing can't reach signed-in screens without the temporary patch (section 2, step 3).

**Evidence.**

- Unpatched: the "Accounts aren't available" screen on every launch, with and without `--offline`.
- With `|| isRunningInExpoGo()` added temporarily: accounts work against FORGE DEV. The served bundle was checked: it names the FORGE DEV host, never the production host.

**Recommended fix.**

```ts
import { isRunningInExpoGo } from "expo";

expoGo: isRunningInExpoGo(),
```

- `isRunningInExpoGo()` checks for the `ExpoGo` native module, which exists only in Expo Go (`node_modules/expo/src/environment/ExpoGo.ts`).
- **Use it alone, not `StoreClient || isRunningInExpoGo()`.** expo-constants documents `StoreClient` as "Expo Go or a development build built with `expo-dev-client`", and Forge ships `expo-dev-client`. A FORGE Dev build reported as `StoreClient` would skip its app-ID and environment pinning. `docs/NATIVE_BUILDS.md` describes FORGE Dev refusing a production-scheme bundle, which suggests it isn't. One device check after the fix settles it.
- **Tests to add:**
  - Android Expo Go (`host.exp.exponent`, not `StoreClient`) is allowed with the production `.env`.
  - A FORGE Dev-like environment (`com.lsaint06.forge.dev`, `StoreClient`) is still pinned.
- **Existing tests to adjust:** with the temporary `|| isRunningInExpoGo()` patch applied, four tests in `tests/ui/cloud-environment.test.tsx` fail. They are the ones where the running app is one of Forge's own builds, e.g. "the production app needs production named; an unknown app never connects". Under the jest-expo preset, `isRunningInExpoGo()` evidently returns true, so the fix must mock it in those tests. With `client.ts` restored, all 814 UI tests pass.

Phase 9 doesn't change `src/cloud/client.ts`: it is Opus 1's.

## 2. Running Phase 9 on the emulator

This reuses Opus 1's setup as is: no second emulator, SDK or Expo Go.

| Piece | Where |
| --- | --- |
| Android SDK (emulator 37.2.12, platform-tools 37.0.1, Android 35 image) | `%LOCALAPPDATA%\forge-android\sdk` |
| AVD `forge` (Pixel 7) with Expo Go 58.0.5 | `%LOCALAPPDATA%\forge-android\avd` |
| Harness: `android.ps1` (`Set-Size`, `Ui`, `Tap`, `Shot`, `Open-Route`), `grid.mjs` contact sheets | `%USERPROFILE%\forge-visual-harness` (Phase 9 reads it, never writes to it) |

1. **Boot.**
   - Set `ANDROID_SDK_ROOT` and `ANDROID_AVD_HOME` to the paths above.
   - Run `emulator.exe -avd forge -no-snapshot-save -no-audio -no-boot-anim`.
   - Wait for `sys.boot_completed`, then run `adb root`.
2. **Metro from the Phase 9 worktree:** `npx expo start --go --port 8082`.
   - Load the FORGE DEV values from `.env.forge-dev` into the Metro process only. Never print them or copy them into the worktree.
   - Before any sign-in, check that the served bundle names the FORGE DEV host and not the production host.
3. **Until section 1 is fixed: the temporary patch.**
   - Back up `src/cloud/client.ts`, then add `|| isRunningInExpoGo()` (two lines).
   - Afterwards, restore the file byte for byte. `git hash-object src/cloud/client.ts` must equal `git rev-parse HEAD:src/cloud/client.ts`.
4. **Open a route:** `exp://10.0.2.2:8082/--/<route>`.
   - The onboarding preview is Preferences → Development → Preview onboarding, or `--/onboarding-preview`.
   - The preview saves nothing; this was checked (the profile kept its values).
5. **Viewports and text size.**
   - Viewport: `Set-Size se|standard|large`.
   - Larger text: `adb shell settings put system font_scale 1.3`.
6. **Clean up.**
   - Restore the display: `font_scale 1.0` and `Set-Size standard` (the state found).
   - Stop Metro and restore `client.ts`.
   - **Run `adb shell sync` before `adb emu kill`.** `emu kill` stops the emulator abruptly. A file pushed or copied with adb (a database, a backup restore) can then come back empty after the next boot: the guest hadn't flushed it yet. This happened once here. Files the app writes itself are unaffected: SQLite and SharedPreferences sync their own writes. Verify a restore by its checksum after a reboot (`md5sum`).

**Tapping.** Tap only nodes that are entirely on screen. UIAutomator also lists clipped nodes (their bounds are inverted), and a tap on one lands elsewhere.

**Test account.**

- Account: `forge-visual-p92-202611041216@example.com`, a throwaway in FORGE DEV. Email confirmation is off there, so no email was sent.
- Password: random and not kept. The emulator's Expo Go stays signed in.
- Opus 1's previous local Forge database on the emulator was backed up before testing and can be restored on request.
- **Demo data for product visuals** (the onboarding redesign):
  - A demo athlete was seeded with Forge's own data layer into this account's local database: five weeks of a real program, real catalogue foods.
  - The account's database was backed up first and restored afterwards.
  - How to remake the visuals: `docs/ONBOARDING.md`, "Product visuals".
- **Avoid endless animations on screens under test.** UIAutomator waits for the screen to go idle, so a looping animation makes `uiautomator dump` and taps time out.

**Seeing Stage A as a fresh phone does** (real launch intro, no preview banner):

1. Force-stop Expo Go. Copy Forge's database (`files/SQLite/forge.db`) and session (`shared_prefs/…-SecureStore.xml`) to `/data/local/tmp` and pull them to the PC. Record their `md5sum`.
2. Remove both, then `adb shell sync`. Each cold start now plays the launch intro, then Stage A.
3. Frame-by-frame checks of the handoff: start Forge, then capture `screencap` back to back (about three frames a second).
4. Restore: copy both files back, `chown u0_a209:u0_a209`, `chmod 660`, `restorecon`, then `sync`, and compare the checksums.
   - Signed out, Forge never writes a session, so restoring the old one reuses no refresh token.
   - Leave the intro by Get started or the account buttons only if you want the phone to remember it (`onboardingIntro`).
- **Reduce Motion on Android:** set `window_animation_scale`, `transition_animation_scale` and `animator_duration_scale` (global settings) to 0. Note each value first and put it back afterwards; `animator_duration_scale` is unset by default (`settings delete`).

## 3. Reload errors after display changes (environment, not onboarding)

After `wm size`, `wm density` or `font_scale` changes, Expo Go reloaded Forge and failed twice:

- Metro logged `[Error: Access to closed resource]` from `expo-sqlite` `execSync`. It came from `initializeRepository` (`app/_layout.tsx` → `src/data/native.ts`).
- Expo Go's error screen showed `[runtime not ready]: TypeError: Cannot read property 'EventEmitter' of undefined`.

Force-stopping Expo Go and reopening the route recovered both times. A check worth doing on FORGE Dev: change the system font size while Forge is open.
