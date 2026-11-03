# Native development builds (Phase 8)

The goal: install Forge on the iPhone as its own app, **FORGE Dev**, instead of running it inside Expo Go. FORGE Dev connects only to the development Supabase project (`docs/DEVELOPMENT_ENVIRONMENT.md`), never to production, and keeps its data apart from Expo Go and from the future production app.

## Where things stand (Phase 8.1, verified on the Mac, Nov 2, 2026)
- **This Mac:** MacBook Air, Apple M4, 16 GB, macOS 27.2, 72 GB free.
- **Ready:**
  - CocoaPods 1.17.0, installed with Homebrew in Phase 8.1;
  - `expo-dev-client`;
  - `npm run dev:ios`, the build command (below).
- **Missing, founder steps:** Xcode, and your Apple ID in Xcode (it creates the signing certificate). `npm run dev:ios -- --check` lists what's still missing.
- **Xcode version:** Expo SDK 58 needs **Xcode 26.4 or later** (Expo's version table). The App Store's current Xcode is right.
- **A free Apple ID is enough for the first install.** Xcode signs apps for your own iPhone with any Apple ID (a "Personal Team"), within Apple's limits below. No paid membership and no EAS are needed.
- **Verified without Xcode, in throwaway copies:**
  - `expo prebuild` of every build: IDs, entitlements, the launch screen;
  - `pod install` for the free Apple ID build: 129 pods, with React Native and Hermes prebuilt, in about a minute;
  - its Release JavaScript (`--no-cloud`): it bundles, with the splash artwork, and holds no production address or key.
- **Not verified yet:** compiling, signing, installing and running. These need Xcode and the iPhone. The iOS simulator comes with Xcode, so it isn't available yet either.

| | FORGE Dev, free Apple ID | FORGE Dev, paid team | FORGE |
|---|---|---|---|
| Built by | `npm run dev:ios` (Xcode, this Mac) | EAS, or `npm run dev:ios -- --paid-team` | EAS, later |
| Bundle ID | `com.lsaint06.forge.dev.personal` | `com.lsaint06.forge.dev` | `com.lsaint06.forge` |
| Home-screen name | FORGE Dev | FORGE Dev | FORGE |
| Link schemes | `forge-dev`, its bundle ID, `exp+forge-fitness` | `forge-dev`, its bundle ID, `exp+forge-fitness` | `forge`, `com.lsaint06.forge`, `exp+forge-fitness` |
| Entitlements | None | Sign in with Apple | Sign in with Apple |
| Supabase | The development project only | The development project only | Production only |

FORGE Preview (`APP_VARIANT=preview`) also exists, for EAS builds later.

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
- **FORGE Dev's Metro:** `npm run start:dev` was run with dummy development values. Its bundle held only those values, with no production URL or key.
- **`eas.json`** validates against EAS's published schema.

## A free Apple ID: what to expect
- **No Sign in with Apple.**
  - Apple doesn't offer Sign in with Apple, push notifications or associated domains to free Apple IDs (Apple's "Supported capabilities" table).
  - So the free build leaves Sign in with Apple out (`FORGE_PERSONAL_TEAM=1` in `app.config.ts`). Forge doesn't use the other two.
  - Google and email sign-in work as usual.
- **7 days.** A free Apple ID's build stops opening 7 days after it was installed. Connect the iPhone and run the same `npm run dev:ios` command again: it installs over the old one, and FORGE Dev keeps its data.
- **Its own bundle ID.**
  - Apple may refuse a paid team an ID that a free Apple ID's team has already registered.
  - So the free build registers `com.lsaint06.forge.dev.personal`. FORGE Dev's own ID (`com.lsaint06.forge.dev`) and production's (`com.lsaint06.forge`) stay untouched for the Apple Developer Program.
  - `npm run dev:ios` never builds the production app.
- **Small limits.** Apple allows a free Apple ID only a few apps per iPhone and a few new app IDs a week. FORGE Dev uses one of each.
- **Not for sharing:** no TestFlight, no App Store, and no other people's phones.

## Debug or Release: does FORGE Dev need the Mac?
| | Debug: `npm run dev:ios` | Release: `npm run dev:ios -- --release` |
|---|---|---|
| JavaScript | Loaded from this Mac: `npm run start:dev`, on the same Wi-Fi | Built into the app |
| Opens without the Mac | No. It opens Expo's development launcher, which needs `start:dev` | **Yes**, like the real app |
| After a code change | Reloads in seconds | Build again |
| Account service | The development project, through `start:dev` | The development project from `.env.forge-dev`, built in; or none, with `--no-cloud` |

## Before the development project exists
Forge needs an account, and FORGE Dev refuses production by design. So until the development Supabase project exists, FORGE Dev stops at **"Accounts aren't available"** after the intro.

**What you can check today** (`npm run dev:ios -- --release --no-cloud`):
- the install, the home-screen name and icon;
- the native launch screen and the REFORGE intro, the fonts, light and dark mode;
- the "Accounts aren't available" screen;
- opening again after a force quit, away from the Mac.

**What needs the development project** and a disposable account: everything behind sign-in. That means the tabs, logging a workout, nutrition and barcode scanning, the rest timer, and sync. Setting up the project takes about 15 minutes in Supabase's dashboard, free (`docs/DEVELOPMENT_ENVIRONMENT.md`).

## Your training stays safe
- **Expo Go keeps your training.**
  - FORGE Dev is a separate app with its own storage. It starts empty and never reads or changes Expo Go's training.
  - Keep using Expo Go (`npm start`) for real training, and don't delete it.
- **Production is untouched.** FORGE Dev can't connect to the production project, so your real account and its training never meet FORGE Dev.
- **Separate from the future production app.** FORGE Dev never shares an ID, storage or a link scheme with the future production app.
- **Disposable data only.** FORGE Dev holds development accounts' training. Deleting FORGE Dev deletes only that.
- **No backend comes with the app.** Installing FORGE Dev doesn't create a separate Supabase backend. FORGE Dev uses only the project named in `.env.forge-dev`, or none.

## Path A (no paid membership): build on this Mac with `npm run dev:ios`
**Once, on the Mac:**
1. **Install Xcode.**
   - Install it from the Mac App Store (free). It's a large download: keep at least 40 GB free.
   - Open it once, accept the license, and let it install its components.
   - Run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`.
   - For the simulator, also add the iOS platform (Xcode → Settings → Components). The iPhone doesn't need it.
2. **Add your Apple ID to Xcode.**
   - Xcode → Settings → Accounts → **+** → Apple ID, and sign in.
   - Select your team ("… (Personal Team)") → **Manage Certificates** → **+** → **Apple Development**.
3. **CocoaPods** is already installed. Elsewhere, install it with `brew install cocoapods`.
4. **Check:** `npm run dev:ios -- --check` should show three ✓.

**Once, on the iPhone:**
1. **Connect it to the Mac** with a cable. Unlock it, tap **Trust**, and enter the passcode.
2. **Turn on Developer Mode:** Settings → Privacy & Security → **Developer Mode** → On → Restart. After the restart, tap **Turn On** and enter the passcode.
   - If the option isn't there yet, it appears once Xcode has seen the iPhone (Xcode → Open Developer Tool → Device Hub) or after the first install.

**Build and install** (roughly 10–20 minutes the first time), in the project folder:
1. **Choose the build:**
   - **Today, without the development project:** `npm run dev:ios -- --release --no-cloud`. It opens without the Mac; accounts are unavailable.
   - **With the development project:**
     - `npm run dev:ios -- --release`, to open without the Mac;
     - or `npm run dev:ios`, then `npm run start:dev` for live reloading.
   - It asks which device: choose the iPhone. If the Mac has more than one signing certificate, it also asks for the team: choose your Personal Team.
2. **First install only: trust the developer.** Settings → General → **VPN & Device Management** → your Apple ID under Developer App → **Trust**.
3. **Open FORGE Dev** from the home screen.
   - **A Debug build** first shows Expo's development launcher. Choose this Mac's server, or scan the QR code `npm run start:dev` shows. If iOS asks about the local network, allow it.

**What `npm run dev:ios` does:**
1. Checks the Mac.
2. Refuses `.env.local`, `.env.development` and `.env.development.local`, like `start:dev`.
3. For `--release`, reads only `.env.forge-dev`, checked as `start:dev` checks it.
4. Regenerates the git-ignored `ios/` folder for this exact build (`expo prebuild --clean`) and installs the pods.
5. Builds, installs and opens it with `expo run:ios --device --no-bundler`.

- It never reads `.env` (production).
- If Expo changes `app.json` or `package.json` during the build (for example, saving your signing team), it puts them back, including after Ctrl+C.
- Ctrl+C cancels cleanly: the running step stops, no later step starts, and it says "Cancelled", never success.

**Build with `npm run dev:ios`, not Xcode's Run button.**
- Xcode's own build steps run without FORGE Dev's settings: no `APP_VARIANT`, and with Expo's `.env` read.
- A Release build from Xcode would therefore carry the production app's configuration and production's settings.
- FORGE Dev then refuses to connect ("Accounts aren't available"): that's the safe failure, but not a usable build.

## Path B (paid Apple Developer Program): EAS development build
For when the founder joins the paid program. The installed app becomes FORGE Dev (`com.lsaint06.forge.dev`) with Sign in with Apple.

1. **Install EAS and sign in.** Install the EAS CLI (`npm install -g eas-cli`) and run `eas login` with your Expo account.
2. **Link the project.** `eas init` adds `owner` and `extra.eas.projectId` to the app config; review and commit that change.
3. **Register the iPhone.** Run `eas device:create`, then open the link it gives on the iPhone to install the registration profile.
4. **Build.** Run `eas build --profile development --platform ios`.
   - EAS signs in to your Apple account, creates the App ID `com.lsaint06.forge.dev` with Sign in with Apple, and makes an ad hoc profile that includes your iPhone.
   - A build takes roughly 15–25 minutes.
5. **Install.** Install FORGE Dev from the build's link or QR code. When iOS asks, turn on **Developer Mode** (Settings → Privacy & Security).
6. **Start Metro on the Mac.** Run `npm run start:dev` (same Wi-Fi as the iPhone). Open FORGE Dev, then pick the Mac's server or scan the QR code that `start:dev` shows.
7. **Sign in** with a disposable development account.

**Other paid-team options:**
- **Local paid-team build:** `npm run dev:ios -- --paid-team` builds the same app locally.
- **Simulator:** the `development-simulator` profile builds for the iOS simulator, with no Apple membership. Running it needs Xcode.

**Delete the free build** once the paid one is installed. Both answer `forge-dev` links, and the free build's data is disposable.

## Sign-in and links in FORGE Dev
- **Return addresses:** `forge-dev:///welcome` (Google), `forge-dev:///sign-in` (email confirmation) and `forge-dev:///account` (password reset). They are allowed in the development project only.
- **Google** uses the same Supabase-hosted sign-in in the system sheet. It works on the local network with no tunnel, because a custom scheme has no IP address.
- **Email links** opened in Mail on the iPhone open FORGE Dev, which registers `forge-dev`. The production app registers only `forge`, so the two never catch each other's links.
- **Apple** appears in the paid team's FORGE Dev once the development project enables Apple with `com.lsaint06.forge.dev` among its Client IDs. The free Apple ID build has no Sign in with Apple: leave Apple off in the development project until then, or its button would appear and fail.
- **Always start Metro with `npm run start:dev`.**
  - **Plain `npx expo start --dev-client`:** reads `.env`, and the JavaScript carries the production scheme. FORGE Dev then refuses to connect, by design, and Metro's log says why.
  - **`npm start`:** serves Expo Go only.
  - **Other settings files:** `start:dev` refuses to start while `.env.local`, `.env.development` or `.env.development.local` exists, because Expo would add their values to FORGE Dev's JavaScript. Move them out of the project first.

## Apple Developer capabilities
| Capability | FORGE Dev, free Apple ID | FORGE Dev (paid team) and FORGE | Why |
|---|---|---|---|
| Sign in with Apple | **No**: not offered to free Apple IDs | Yes (EAS turns it on for each App ID) | `expo-apple-authentication` |
| Push Notifications | No | **No** | Remote notifications are off; local notifications need no capability. Turn both back on only if remote push is ever added |
| Camera | Usage text only | Usage text only | Barcode scanning |
| Others (associated domains, iCloud, App Groups) | None | None | |

## Physical-device checklist (FORGE Dev)
**Today in Expo Go:** the workout-continuity walkthrough (7.8E report, section 17).

**With FORGE Dev, before the development project** (`npm run dev:ios -- --release --no-cloud`):
1. **Install.** FORGE Dev appears beside Expo Go under its own name, with the white placeholder icon (until C-00b).
2. **Launch.** A charcoal native launch screen, then the REFORGE intro, exactly as approved, in light and dark mode.
3. **No account service.** "Accounts aren't available"; training already on the phone is mentioned as kept.
4. **Independent of the Mac.** Force-quit FORGE Dev, then open it away from the Mac's Wi-Fi: it opens the same way.
5. **Expo Go unchanged.** Your training is still in Expo Go.

**With FORGE Dev and the development project:**
1. **Install.** A Debug build opens Expo's development launcher; a Release build opens straight into Forge.
2. **Launch.** A charcoal native launch screen, then the REFORGE intro, exactly as approved.
3. **Environment guard.**
   - With `npm run start:dev` (Debug) or `--release`: Welcome offers sign-in (email and Google; no Apple in the free Apple ID build).
   - With Metro started any other way (for example, plain `npx expo start --dev-client`): "Accounts aren't available", and Metro's log explains why.
4. **Google.** Sign in with a throwaway Google account; it returns to FORGE Dev.
5. **Links.** A password-reset or confirmation email link (custom SMTP, or a team address) opens FORGE Dev.
6. **Camera.** The permission prompt shows Forge's own text, and a barcode scans.
7. **Notifications.** With Forge in the background, the rest-timer notification still arrives.
8. **Workout continuity** (7.8E section 17). With the development project's 5-minute access tokens, the wait is minutes, not an hour.
9. **Account deletion** end to end, on the development project only (`docs/DEVELOPMENT_ENVIRONMENT.md`).
10. **Expo Go unchanged.** `npm start` with Expo Go still opens today's setup.
11. **After 7 days (free Apple ID).** FORGE Dev stops opening. Run the same `npm run dev:ios` command again with the iPhone connected: FORGE Dev opens again with its data.

## Known limits and decisions for later
- **App icon:** a white placeholder until the C-00b decision.
- **Shared dev-client scheme.** Every build registers `exp+forge-fitness`: `expo-dev-client` derives it from the shared slug, and Expo's CLI builds dev-client links from it.
  - With two apps installed, a dev-client QR code may open the other one. Open FORGE Dev first and pick the server.
  - Release builds contain no development launcher, so this is a convenience issue, not a security one.
  - Revisit before FORGE ships beside FORGE Dev.
- **Two FORGE Dev builds** (free Apple ID and paid team) both register `forge-dev`. Keep only one installed.
- **Xcode's Run button** builds without FORGE Dev's settings (its Release JavaScript would read `.env`), so that app refuses to connect. Use `npm run dev:ios`.
- **Android:** `userInterfaceStyle: automatic` needs `expo-system-ui` on Android (pre-existing; reported by prebuild). The iPhone doesn't need it.
- **Updates:** `expo-doctor` (Nov 2, 2026) passes every check except 15 patch updates, including `expo` 58.0.22 (58.0.17 installed) and `react-native` 0.88.1 (0.88.0 installed).
  - Their changelogs list no iOS build fix that Forge needs. The installed set is consistent: its precompiled iOS binaries are all built against React Native 0.88.0.
  - Updating changes Expo Go's and Windows' installs too, so it is a separate, approved step (`npx expo install --fix`). Not applied here.
- **Build numbers:** before the first production build, set `cli.appVersionSource` in `eas.json` (EAS recommends `remote`).
- **EAS environment variables:** precedence between `eas.json` `env` and an EAS environment isn't documented, so each variable is set in one place only. `APP_VARIANT` lives in `eas.json`; the `EXPO_PUBLIC_` values live in the EAS environments (expo.dev → project → Environment variables):
  - **`preview`:** the development project's four values;
  - **`production`:** production's four values, with `EXPO_PUBLIC_FORGE_ENV=production` and its ref.
