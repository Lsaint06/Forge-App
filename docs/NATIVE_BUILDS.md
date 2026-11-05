# Native development builds (Phase 8)

The goal: install Forge on the iPhone as its own app, **FORGE Dev**, instead of running it inside Expo Go. FORGE Dev connects only to the development Supabase project (`docs/DEVELOPMENT_ENVIRONMENT.md`), never to production, and keeps its data apart from Expo Go and from the future production app.

**First install on the iPhone:** follow the short checklist in [FORGE_DEV_IPHONE_CHECKLIST.md](FORGE_DEV_IPHONE_CHECKLIST.md), with expected outputs and stop conditions. The rest of this page is the reference.

**Since Phase 8.1 (Nov 3–4, 2026):**

- **FORGE DEV is set up:** the schema and the Stage 3 hardening applied, sign-in settings verified live. A Release build therefore connects to it.
- **Its JavaScript was checked from Windows:** built for FORGE Dev, it holds FORGE DEV's address and none of production's address, project ref or key.
- **The iPhone still isn't registered** with the team; the first install does that.

## Where things stand (Phase 8.1, Nov 3, 2026)
**This Mac:**
- MacBook Air, Apple M4, 16 GB, macOS 27.2.
- Xcode 27.2: license accepted, first launch done, the iOS 27.2 SDK and the iOS 27.2 Simulator.
- `xcode-select` still points to the Command Line Tools.
  - `npm run dev:ios` uses `/Applications/Xcode.app` directly (`DEVELOPER_DIR`), so nothing needs an administrator password.
  - To make Xcode the default for every tool (optional): `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
- CocoaPods 1.17.0 (Homebrew).

**Signing:**
- The founder's paid Apple Developer Program team (Individual) signs FORGE Dev. Xcode signs it automatically, and `npm run dev:ios` reads the Team ID from the certificate.
- Its Apple Development certificate is in the login keychain, valid until Nov 3, 2027.
- Apple's WWDR G3 intermediate certificate was added to the login keychain, so macOS trusts the certificate. Only the 2013 intermediate, expired in 2023, had been installed. G3 was verified as signed by the Apple Root CA built into macOS, and as the issuer of the certificate.
- The team has **no registered iPhone yet**, so Apple can't issue a development profile. The first `npm run dev:ios` with the iPhone connected registers it automatically.

**The iPhone:** the founder's iPhone 17, iOS 26.6.2, paired with this Mac, Developer Mode on.

**Verified on this Mac:**
- **Simulator:** FORGE Dev compiled in Release with Xcode 27.2 (6.4 minutes), then installed and opened in the iPhone 17 Simulator.
  - It showed the charcoal launch screen, the REFORGE intro, then "Accounts aren't available".
  - No crash.
- **iPhone build (unsigned):** FORGE Dev compiled and linked in Release for real iPhones (arm64, iOS 27.2 SDK, iOS 16.4 or later).
- **Both builds:**
  - FORGE Dev's ID and name, and only `forge-dev:` links.
  - 8.3 MB of built-in Hermes JavaScript with no production address or key.
  - No development launcher.
  - Sign in with Apple as the only entitlement.
- **Signing up to Apple's step:** a signed build with the paid team reached Apple, and stopped only because the team has no registered iPhone.

**Not verified yet:** registering the iPhone, the signed build, installing on the iPhone and opening it there. All of these need the iPhone connected.

| | FORGE Dev | FORGE |
|---|---|---|
| Built by | `npm run dev:ios` (Xcode, this Mac), or EAS | EAS, later |
| Bundle ID | `com.lsaint06.forge.dev` | `com.lsaint06.forge` |
| Home-screen name | FORGE Dev | FORGE |
| Link schemes | `forge-dev`, `com.lsaint06.forge.dev`, `exp+forge-fitness` | `forge`, `com.lsaint06.forge` (no development-client link since Phase 8.4B) |
| Entitlements | Sign in with Apple | Sign in with Apple |
| Supabase | The development project only | Production only |

FORGE Preview (`APP_VARIANT=preview`, FORGE DEV only) is the app for TestFlight and Google Play internal testing. Its build profiles, checks and procedures are in [RELEASE.md](RELEASE.md).

- **Shared by every build:**
  - iOS 16.4 or later, with the Hermes engine.
  - The camera text and the encryption declaration.
  - The native launch screen: charcoal `#101216` in light and dark mode, with the transparent launch mark. Then the approved REFORGE intro plays, as in Expo Go.
  - Release builds leave out Expo's development launcher and menu (they are Debug-only), so they open like the real app.
- **App icon: a plain white square for now.**
  - No icon is configured: that is the deferred branding decision C-00b (`docs/SPLASH.md`). Expo fills in a white 1024×1024 placeholder.
  - The real FORGE icon needs the approved master: a 1024×1024 PNG with no transparency.
  - Once it is approved, adding it is one line in `app.json` (`"icon"`) and a rebuild; every build then shows it.
- **No push entitlement.** Remote push is off (`enableRemoteNotifications: false` in `app.json`), because Forge only schedules local notifications (the rest timer and planned reminders).
- **`eas.json`** validates against EAS's published schema (re-checked in Phase 8.4B), and `npm run release:check` checks its profiles ([RELEASE.md](RELEASE.md)).

## Debug, Release or TestFlight: does FORGE Dev need the Mac?
| | Debug: `npm run dev:ios` | Release: `npm run dev:ios -- --release` | TestFlight (later) |
|---|---|---|---|
| JavaScript | Loaded from this Mac: `npm run start:dev`, on the same Wi-Fi | Built into the app | Built into the app |
| Opens without the Mac | No: it opens Expo's development launcher, which needs `start:dev` | **Yes**, like the real app | Yes |
| Installed by | A cable to this Mac | A cable to this Mac | The TestFlight app; no Mac |
| After a code change | Reloads in seconds | Build again (minutes) | A new build through EAS and App Store Connect |
| Signing | Development, valid a year | Development, valid a year | Distribution; testers need no registered iPhone |

- **Release is the build to take to the gym.** Its JavaScript is in the app, so it opens with no Mac nearby.
- **Accounts still need a network.** Sign-in and sync need the internet and the development project. Training on the phone works offline, as in Expo Go.

## Without the development project (`--no-cloud`)
Forge needs an account, and FORGE Dev refuses production by design. Built with `--no-cloud`, FORGE Dev has no account service, so it stops at **"Accounts aren't available"** after the intro.

**What such a build can check** (`npm run dev:ios -- --release --no-cloud`):
- the install, the home-screen name and icon;
- the native launch screen and the REFORGE intro, the fonts, light and dark mode;
- the "Accounts aren't available" screen;
- opening again after a force quit, away from the Mac.

**What needs the development project** and a disposable account: everything behind sign-in. That means the tabs, logging a workout, nutrition and barcode scanning, the rest timer, and sync. FORGE DEV has been set up since Nov 3, 2026 (`docs/DEVELOPMENT_ENVIRONMENT.md`), so a build without `--no-cloud` connects to it.

## Your training stays safe
- **Expo Go keeps your training.**
  - FORGE Dev is a separate app with its own storage. It starts empty and never reads or changes Expo Go's training.
  - Keep using Expo Go (`npm start`) for real training, and don't delete it.
- **Production is untouched.** FORGE Dev can't connect to the production project, so your real account and its training never meet FORGE Dev.
- **Separate from the future production app.** FORGE Dev never shares an ID, storage or a link scheme with the future production app.
- **Disposable data only.** FORGE Dev holds development accounts' training. Deleting FORGE Dev deletes only that.
- **No backend comes with the app.** Installing FORGE Dev doesn't create a separate Supabase backend. FORGE Dev uses only the project named in `.env.forge-dev`, or none.

## Build and install with `npm run dev:ios`
**Once, on the Mac** (all done on Nov 3, 2026):
1. **Xcode** from the Mac App Store (Expo SDK 58 needs 26.4 or later), opened once.
2. **Your Apple ID in Xcode:** Settings → Accounts.
3. **The certificate:** select your paid team (not "Personal Team") → **Manage Certificates** → **+** → **Apple Development**.
4. **CocoaPods:** `brew install cocoapods`.
5. **Check:** `npm run dev:ios -- --check` shows ✓ for Xcode, CocoaPods, the signing team and the iPhone.

**Once, on the iPhone** (done): connect it with a cable, tap **Trust**, then Settings → Privacy & Security → **Developer Mode** → On → Restart → **Turn On**.

**Build, install and open:** connect the iPhone with a cable and keep it unlocked, then in the project folder run one of:
- **The usual build:** `npm run dev:ios -- --release`. It opens without the Mac and connects to FORGE DEV.
- **For live reloading:** `npm run dev:ios`, then `npm run start:dev`.
- **Without accounts:** `npm run dev:ios -- --release --no-cloud`. It opens without the Mac; accounts are unavailable.
- **Without the iPhone:** add `--build-only` to build, sign and check without installing. This needs Apple to know the iPhone already, which the first install arranges.

The first build takes roughly 10–20 minutes; later builds are faster.

**The first run with the iPhone** registers it with your team, then registers the App ID `com.lsaint06.forge.dev` with Sign in with Apple, then creates a development profile. These are Xcode's automatic signing steps.
- The profile lasts a year, so there is no weekly re-install.
- If a dialog asks to let Xcode or codesign use your keychain, enter your Mac password there and choose **Always Allow**.

**What `npm run dev:ios` does:**
1. **Checks the Mac and the iPhone:**
   - Xcode 26.4 or later;
   - CocoaPods;
   - one signing team, read from your certificate, or named with `--team <Team ID>`;
   - the connected iPhone, by its UDID (never a simulator), with Developer Mode on.
2. **Refuses the files Expo would bundle:** `.env.local`, `.env.development` and `.env.development.local`, as `start:dev` does.
3. **For `--release`, reads only `.env.forge-dev`,** checked as `start:dev` checks it.
4. **Regenerates the git-ignored `ios/` folder** for exactly this build (`expo prebuild --clean`) and installs the pods.
5. **Builds with Xcode,** for your team, with automatic signing. The full log goes to `ios/xcodebuild.log`.
6. **Checks the built app before installing it,** and refuses to install otherwise:
   - its bundle ID and links are FORGE Dev's;
   - it's signed by your team;
   - Sign in with Apple and no push;
   - its provisioning profile is your team's and includes this iPhone;
   - for `--release`, its JavaScript is built in;
   - neither its JavaScript nor its configuration holds any address or key from Expo's own `.env` files (production).
7. **Installs and opens it** on the iPhone with Apple's `devicectl`.

**It never reads `.env`** (production). If a step changes `app.json` or `package.json`, it puts them back. Ctrl+C cancels cleanly: the running step stops, no later step starts, and it never reports success.

**Build with `npm run dev:ios`, not Xcode's Run button.**
- Xcode's own build steps run without FORGE Dev's settings: no `APP_VARIANT`, and with Expo's `.env` read.
- A Release build from Xcode would therefore carry the production app's configuration and production's settings.
- FORGE Dev then refuses to connect ("Accounts aren't available"): that's the safe failure, but not a usable build.

## EAS development build (alternative)
Builds in Expo's cloud instead of on this Mac. It needs the paid team too, and **linking the project needs the founder's approval** ([STORE_SETUP.md](STORE_SETUP.md) §1).
1. **Install EAS and sign in.** Install the EAS CLI (`npm install -g eas-cli`) and run `eas login` with your Expo account.
2. **Link the project.** `eas init` adds `owner` and `extra.eas.projectId` to the app config; review and commit that change.
3. **Register the iPhone.** Run `eas device:create`, then open the link it gives on the iPhone to install the registration profile.
4. **Build.** Run `eas build --profile development --platform ios`. EAS uses the same App ID, `com.lsaint06.forge.dev`, and makes an ad hoc profile that includes your iPhone.
5. **Install** FORGE Dev from the build's link or QR code, then start Metro with `npm run start:dev`.

- **`development-simulator`** builds the same app for the iOS Simulator.
- **`development-release`** builds FORGE Dev with its JavaScript built in: an ad hoc IPA for registered iPhones, or an APK for Android phones.
- **Every EAS build checks itself first** on the builder (`npm run release:check -- --builder`, [RELEASE.md](RELEASE.md) §4).

## Sign-in and links in FORGE Dev
- **Return addresses:** `forge-dev:///welcome` (Google), `forge-dev:///sign-in` (email confirmation) and `forge-dev:///account` (password reset). They are allowed in the development project only.
- **Google** uses the same Supabase-hosted sign-in in the system sheet. It works on the local network with no tunnel, because a custom scheme has no IP address.
- **Email links** opened in Mail on the iPhone open FORGE Dev, which registers `forge-dev`. The production app registers only `forge`, so the two never catch each other's links.
- **Apple:** the button appears in FORGE Dev only once the development project enables Apple, with `com.lsaint06.forge.dev` among its Client IDs. The build already carries the capability; the backend decides whether it's offered.
- **Always start Metro with `npm run start:dev`.**
  - **Plain `npx expo start --dev-client`:** reads `.env`, and the JavaScript carries the production scheme. FORGE Dev then refuses to connect, by design, and Metro's log says why.
  - **`npm start`:** serves Expo Go only.
  - **Other settings files:** `start:dev` refuses to start while `.env.local`, `.env.development` or `.env.development.local` exists, because Expo would add their values to FORGE Dev's JavaScript. Move them out of the project first.

## Apple Developer capabilities
| Capability | FORGE Dev and FORGE | Why |
|---|---|---|
| Sign in with Apple | Yes: Xcode's automatic signing (or EAS) turns it on for each App ID | `expo-apple-authentication`. Offered only when the account service enables Apple |
| Push Notifications | **No** | Remote notifications are off; local notifications need no capability. Turn both back on only if remote push is ever added |
| Camera | Usage text only | Barcode scanning |
| Others (associated domains, iCloud, App Groups) | None | |

## Physical-device checklist (FORGE Dev)
**Today in Expo Go:** the workout-continuity walkthrough (7.8E report, section 17).

**With FORGE Dev, before the development project** (`npm run dev:ios -- --release --no-cloud`):
1. **Install.** FORGE Dev appears beside Expo Go under its own name, with the white placeholder icon (until C-00b).
2. **Launch.** A charcoal native launch screen, then the REFORGE intro, in light and dark mode, with no white or black flash between them.
3. **No account service.** "Accounts aren't available"; training already on the phone is mentioned as kept.
4. **Independent of the Mac.** Force-quit FORGE Dev, then open it away from the Mac's Wi-Fi: it opens the same way.
5. **Expo Go unchanged.** Your training is still in Expo Go.

**With FORGE Dev and the development project:**
1. **Install.** A Debug build opens Expo's development launcher; a Release build opens straight into Forge.
2. **Launch.** A charcoal native launch screen, then the REFORGE intro, exactly as approved.
3. **Environment guard.**
   - With `npm run start:dev` (Debug) or `--release`: Welcome offers sign-in (email, and Google or Apple once the development project enables them).
   - With Metro started any other way (for example, plain `npx expo start --dev-client`): "Accounts aren't available", and Metro's log explains why.
4. **Google.** Sign in with a throwaway Google account; it returns to FORGE Dev.
5. **Links.** A password-reset or confirmation email link (custom SMTP, or a team address) opens FORGE Dev.
6. **Camera.** The permission prompt shows Forge's own text, and a barcode scans.
7. **Notifications.** With Forge in the background, the rest-timer notification still arrives.
8. **Workout continuity** (7.8E section 17). With the development project's 5-minute access tokens, the wait is minutes, not an hour.
9. **Account deletion** end to end, on the development project only (`docs/DEVELOPMENT_ENVIRONMENT.md`).
10. **Expo Go unchanged.** `npm start` with Expo Go still opens today's setup.

## Known limits and decisions for later
- **App icon:** a white placeholder until the C-00b decision.
- **Launch hand-off flash: fixed (Nov 3, 2026, approved).**
  - **What it was:** between the launch screen and the REFORGE intro, the screen briefly showed React Native's root view: white in light mode for about 3–4 frames, black in dark mode for one frame.
  - **Fix:** `expo-system-ui` (58.0.7) and `"backgroundColor": "#101216"` in `app.json` make that root view charcoal.
  - **Result:** six filmed Simulator launches, light and dark, showed no white or black frame (`docs/SPLASH.md`). Still to see on the iPhone itself.
- **Development-client scheme: FORGE Dev only (Phase 8.4B).** `expo-dev-client` registers `exp+forge-fitness`, derived from the shared slug, and Expo's CLI builds dev-client links from it.
  - Until 8.4B every app registered it, so a dev-client QR code could open the wrong one.
  - Now `app.json` turns it off (`addGeneratedScheme: false`) and `app.config.ts` turns it back on for FORGE Dev alone.
  - FORGE Dev is unchanged; FORGE and FORGE Preview no longer answer those links (tested in Expo's own pipeline, `tests/app-variants.test.ts`).
- **Free Apple IDs:** a free Apple ID's Personal Team can't sign Sign in with Apple, so FORGE Dev can't be built with one as it stands. A temporary free-Apple-ID mode (its own `.personal` bundle ID, without Sign in with Apple) existed in `6b58039`; it was removed once the paid team was available.
- **Xcode's Run button** builds without FORGE Dev's settings (its Release JavaScript would read `.env`), so that app refuses to connect. Use `npm run dev:ios`.
- **iOS 27 notices.** On iOS 27 (the Simulator), UIKit logs that the status-bar APIs React Native calls are no-ops. The iPhone runs iOS 26.6.2, where they work. Revisit with a React Native update before iOS 27 devices matter.
- **Android:** `userInterfaceStyle: automatic` now applies on Android too, since `expo-system-ui` is installed; prebuild no longer warns.
- **Updates:** `expo-doctor` (Nov 2, 2026) passes every check except 15 patch updates, including `expo` 58.0.22 (58.0.17 installed) and `react-native` 0.88.1 (0.88.0 installed).
  - Their changelogs list no iOS build fix that Forge needs. The installed set is consistent: its precompiled iOS binaries are all built against React Native 0.88.0.
  - Updating changes Expo Go's and Windows' installs too, so it is a separate, approved step (`npx expo install --fix`). Not applied here.
  - Current status (Nov 4, 2026: 16 packages, including `expo` 58.0.23) and its effect on EAS builds: open item V5 in [RELEASE.md](RELEASE.md) §11.
- **Build numbers:** EAS manages them (`cli.appVersionSource: remote`, Phase 8.4B). Store builds increment automatically ([RELEASE.md](RELEASE.md) §3).
- **EAS environment variables.** `eas.json` sets only `APP_VARIANT`; the `EXPO_PUBLIC_` values live in the EAS environments (expo.dev → project → Environment variables):
  - **`development` and `preview`:** the development project's four values;
  - **`production`:** production's four values, with `EXPO_PUBLIC_FORGE_ENV=production` and its ref, only once production builds are approved (they are locked until then).

  Every EAS build checks the values it actually got before compiling ([RELEASE.md](RELEASE.md) §4).
