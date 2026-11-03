# Native development builds (Phase 8)

The goal: install Forge on the iPhone as its own app, **FORGE Dev**, instead of running it inside Expo Go, connected only to the development Supabase project (`docs/DEVELOPMENT_ENVIRONMENT.md`).

## Where things stand (verified on the Mac, Nov 2, 2026)
- **Dependencies:**
  - `expo-dev-client` is installed.
  - `npm start` still opens **Expo Go**: it now runs `expo start --go`, and Metro's own link was checked to be `exp://`.
  - `npm run start:dev` serves FORGE Dev.
- **Three apps** (`app.config.ts`), generated with `npx expo prebuild` in throwaway copies (no Xcode needed):

| | FORGE Dev | FORGE |
|---|---|---|
| Bundle ID and package | `com.lsaint06.forge.dev` | `com.lsaint06.forge` |
| Home-screen name | FORGE Dev | FORGE |
| Link schemes registered | `forge-dev`, `com.lsaint06.forge.dev`, `exp+forge-fitness` | `forge`, `com.lsaint06.forge`, `exp+forge-fitness` |
| Entitlements | Sign in with Apple only | Sign in with Apple only |

- **Shared by both apps:**
  - iOS 16.4 or later, with the Hermes engine.
  - The camera text and the encryption declaration.
  - The native launch screen: charcoal `#101216` in light and dark mode, with the transparent launch mark. Then the approved REFORGE intro plays, as in Expo Go.
- **No push entitlement.** Remote push is switched off (`enableRemoteNotifications: false` in `app.json`), because Forge only schedules local notifications (the rest timer and planned reminders).
- **App icon:** Expo's placeholder. No icon is configured yet; that is a deferred branding decision (C-00b; see `docs/SPLASH.md`). Development builds can use the placeholder; the production app needs the approved 1024×1024 master.
- **FORGE Dev's Metro:** `npm run start:dev` was run with dummy development values. Metro served FORGE Dev's name, IDs and scheme, and the bundle held only the development values: no production URL or key.
- **`eas.json`** validates against EAS's published schema.

**Not possible yet on this Mac:**
- **No local builds:** Xcode isn't installed (only the Command Line Tools), so there is no simulator either.
- **No EAS:** the EAS CLI isn't installed and the project isn't linked to EAS.
- **Apple membership:** Apple Developer Program membership hasn't been confirmed.

## What you need
| Need | For | Notes |
|---|---|---|
| Expo account (`lstamand`) | EAS Build | The free tier includes a limited number of builds a month |
| **Apple Developer Program** | Installing FORGE Dev on the iPhone through EAS; Sign in with Apple; TestFlight and the App Store | Paid, yearly: needs your approval |
| Xcode 27 (Mac App Store) and an iOS simulator runtime, plus CocoaPods (`brew install cocoapods`) | Local builds (`npx expo run:ios`) and the simulator | SDK 58 is built for iOS 27 and Xcode 27 |
| The development Supabase project and `.env.forge-dev` | FORGE Dev connects only to it, and refuses production | `docs/DEVELOPMENT_ENVIRONMENT.md` |

## Path A (recommended): EAS development build on the iPhone
1. **Install EAS and sign in.** Install the EAS CLI (`npm install -g eas-cli`) and run `eas login` with your Expo account.
2. **Link the project.** `eas init` adds `owner` and `extra.eas.projectId` to the app config; review and commit that change.
3. **Register the iPhone.** Run `eas device:create`, then open the link it gives on the iPhone to install the registration profile.
4. **Build.** Run `eas build --profile development --platform ios`.
   - EAS signs in to your Apple account, creates the App ID `com.lsaint06.forge.dev` with Sign in with Apple, and makes an ad hoc profile that includes your iPhone.
   - A build takes roughly 15–25 minutes.
5. **Install.** Install FORGE Dev from the build's link or QR code. When iOS asks, turn on **Developer Mode** (Settings → Privacy & Security).
6. **Start Metro on the Mac.** Run `npm run start:dev` (same Wi-Fi as the iPhone). Open FORGE Dev, then pick the Mac's server or scan the QR code that `start:dev` shows.
7. **Sign in** with a disposable development account.

The `development-simulator` profile builds the same app for the iOS simulator, with no Apple membership needed. Running it still needs Xcode.

## Path B: local build with Xcode
1. **Install Xcode.**
   - Install **Xcode 27** from the App Store and open it once.
   - Add the iOS platform (Xcode → Settings → Components).
   - Run `sudo xcode-select -s /Applications/Xcode.app`, then `brew install cocoapods`.
2. **Build FORGE Dev without its own Metro:** `APP_VARIANT=development npx expo run:ios --no-bundler`.
   - This generates the git-ignored `ios/` folder, installs pods, builds and installs to the simulator.
   - `--no-bundler` matters: a Metro started by `run:ios` would read `.env`, and FORGE Dev would refuse to connect.
3. **Start Metro** with `npm run start:dev`.
4. **Switching between apps** in local builds needs `npx expo prebuild --clean` first, because `ios/` is generated per app.
5. **On a device with a free Apple ID (Personal Team)?** Not recommended:
   - provisioning lasts 7 days, and only up to 3 devices;
   - Sign in with Apple isn't available to personal teams, so its entitlement would have to be removed for such a build.

## Sign-in and links in FORGE Dev
- **Return addresses:** `forge-dev:///welcome` (Google), `forge-dev:///sign-in` (email confirmation) and `forge-dev:///account` (password reset). They are allowed in the development project only.
- **Google** uses the same Supabase-hosted sign-in in the system sheet. It works on the local network with no tunnel, because a custom scheme has no IP address.
- **Email links** opened in Mail on the iPhone open FORGE Dev, which registers `forge-dev`. The production app registers only `forge`, so the two never catch each other's links.
- **Apple** appears in FORGE Dev once the development project enables Apple with `com.lsaint06.forge.dev` among its Client IDs (paid membership).
- **Always start Metro with `npm run start:dev`.**
  - **Plain `npx expo start --dev-client`:** reads `.env`, and the JavaScript carries the production scheme. FORGE Dev then refuses to connect, by design, and Metro's log says why.
  - **`npm start`:** serves Expo Go only.
  - **Other settings files:** `start:dev` refuses to start while `.env.local`, `.env.development` or `.env.development.local` exists, because Expo would add their values to FORGE Dev's JavaScript. Move them out of the project first.

## Apple Developer capabilities
| Capability | FORGE Dev / FORGE | Why |
|---|---|---|
| Sign in with Apple | Yes (EAS turns it on for each App ID) | `expo-apple-authentication` |
| Push Notifications | **No** | Remote notifications are off; local notifications need no capability. Turn both back on only if remote push is ever added |
| Camera | Usage text only | Barcode scanning |
| Others (associated domains, iCloud, App Groups) | None | |

## Physical-device checklist (FORGE Dev)
**Today in Expo Go:** the workout-continuity walkthrough (7.8E report, section 17).

**With FORGE Dev and the development project:**
1. **Install.** FORGE Dev appears beside Expo Go under its own name, with the placeholder icon. Opening it shows the development launcher.
2. **Launch.** A charcoal native launch screen, then the REFORGE intro, exactly as approved.
3. **Environment guard.**
   - With `npm run start:dev`: Welcome offers sign-in.
   - With Metro started any other way (for example, plain `npx expo start --dev-client`): "Accounts aren't available", and Metro's log explains why.
4. **Google.** Sign in with a throwaway Google account; it returns to FORGE Dev.
5. **Links.** A password-reset or confirmation email link (custom SMTP, or a team address) opens FORGE Dev.
6. **Camera.** The permission prompt shows Forge's own text, and a barcode scans.
7. **Notifications.** With Forge in the background, the rest-timer notification still arrives.
8. **Workout continuity** (7.8E section 17). With the development project's 5-minute access tokens, the wait is minutes, not an hour.
9. **Account deletion** end to end, on the development project only (`docs/DEVELOPMENT_ENVIRONMENT.md`).
10. **Expo Go unchanged.** `npm start` with Expo Go still opens today's setup.

## Known limits and decisions for later
- **App icon:** a placeholder until the C-00b decision.
- **Shared dev-client scheme.** Both apps register `exp+forge-fitness`: `expo-dev-client` derives it from the shared slug, and Expo's CLI builds dev-client links from it.
  - With both apps installed, a dev-client QR code may open FORGE instead. Open FORGE Dev first and pick the server.
  - Release builds contain no development launcher, so this is a convenience issue, not a security one.
  - Revisit before FORGE ships beside FORGE Dev.
- **Android:** `userInterfaceStyle: automatic` needs `expo-system-ui` on Android (pre-existing; reported by prebuild). The iPhone doesn't need it.
- **Updates:** Metro reports `expo` 58.0.22 (58.0.17 installed) and 14 other patch updates. Run `npx expo install --check` when convenient; not applied here.
- **Build numbers:** before the first production build, set `cli.appVersionSource` in `eas.json` (EAS recommends `remote`).
- **EAS environment variables:** precedence between `eas.json` `env` and an EAS environment isn't documented, so each variable is set in one place only. `APP_VARIANT` lives in `eas.json`; the `EXPO_PUBLIC_` values live in the EAS environments (expo.dev → project → Environment variables):
  - **`preview`:** the development project's four values;
  - **`production`:** production's four values, with `EXPO_PUBLIC_FORGE_ENV=production` and its ref.
