# Testing FORGE on an iPhone

## What is available now

The repository contains an Expo SDK 57 application. Dependency installation, automated checks and native JavaScript exports can be run in a development environment. **A GitHub repository alone is not a live Expo Go app.** No public development-server address, signed iOS build, TestFlight release or physical-device test is claimed by this delivery.

The Codex cloud machine can run Metro for internal checks. Its loopback endpoint cannot be opened by your iPhone, and this onboarding interface does not automatically expose a phone-accessible server. Do not try scanning a localhost URL from the phone.

## Expo Go: initial testing without a Mac

1. Install **Expo Go** from the iPhone App Store. Confirm it supports SDK 57. iOS generally offers the current Expo Go release; if your installed release and this SDK differ, use a compatible development build or upgrade the project deliberately. Do not mix React Native/native package versions by hand.
2. On a reachable development host, install Node.js **24**, Git and the repository. Windows 11 works. Before the feature branch is merged, checkout `feat/forge-app`.
3. In `Forge-App`, run:

   ```sh
   npm ci
   npx expo start --go
   ```

4. Put the host and phone on the same Wi-Fi network. Allow Node/Metro through Windows Firewall on **private networks**. Avoid guest-network client isolation. Scan the terminal QR code with the iPhone Camera and open it in Expo Go.
5. Keep the host, terminal and development server running while testing. A phone cannot load a development bundle from a sleeping or disconnected host.

No Supabase configuration is needed. Skip optional onboarding fields to start as a guest. Your first launch has no fabricated workouts or performance numbers.

## When local-network access is unavailable

On a host that permits outbound tunnel access:

```sh
npm install --save-dev @expo/ngrok
npx expo start --go --tunnel
```

Use the **new tunnel QR code**, not a LAN/localhost QR. Expo may prompt to install its supported tunnel helper. Internet access must permit Expo/tunnel services, and both host and phone must stay online for bundle loading. Tunnel provisioning may fail on restricted networks; inspect its actual error rather than assuming a URL exists.

Tunnel reachability has **not** been verified in the Codex cloud environment. A tunnel URL must be actually created and tested before it can be presented as a phone-accessible app. When you have only the iPhone and no running reachable host, installing this repository does not solve hosting: use an already running permitted remote host, or prepare a signed build with EAS.

## Guest-mode device checklist

- Skip optional onboarding, open each of Home, Train, Explore, Progress and Profile.
- Start an empty workout; search for Barbell Bench Press; add two sets.
- Enter kg/reps, mark one set complete, inspect rest countdown and skip/extend.
- Edit RPE/RIR, tempo, warmup/working/drop/failure kind and notes.
- Reorder/substitute/remove an exercise. Verify only the intended row changes.
- Background the app and return. Duration should use elapsed timestamps.
- Force-close and reopen. Resume the same active workout and check saved sets.
- Pause, wait, resume and finish. Finish should not produce duplicate history.
- Edit the completed workout and repeat it as a new session.
- Save a template, schedule it, or adopt a starter program. Start a deload session from the calendar and verify fewer sets.
- Turn off network access **after the bundle has loaded** and continue logging. Expo Go may need the server again after a full reload; a standalone build is the correct way to validate cold-start offline distribution.
- Nutrition: Add → + on a saved or recent food (one entry, Undo removes it); tap a food, set 1.5 servings and a meal; Create food from a label (try a comma decimal such as 17,5); edit an entry's servings, meal and day; Copy to today from yesterday; confirm the day's totals. With the keyboard open, the sheet's Add/Save button must stay visible. In a comma-decimal region (Settings → General → Language & Region), confirm the decimal key types "," and the value saves.
- Nutrition targets: a new profile shows "Not set" in You and no "of 2,000"; saving targets once in You → Nutrition targets shows them against the day.
- Food library (WP4A.1), in airplane mode after FORGE has loaded: Add shows Common foods on a fresh profile; search "chicken breast", open the baked result, type 150 g (values update as you type), add it, and confirm 242 kcal on the day. Search "egg", choose "1 egg · 50 g", set 2 and add (143 kcal). + on a library food logs 100 g; Undo removes it. Save to my foods once, then find the copy under Saved foods. Reopen a logged library entry: it reads "From USDA FNDDS · FDC … · 1 serving = 150 g". With the keyboard open on a small iPhone, at least one result stays visible and Create food moves to the end of the list. VoiceOver reads each result's name, portion, calories and protein, and the + and Undo labels.
- Log historical weight/measurements, recovery inputs and goals; inspect date ranges.
- Change to imperial units/light theme/large text and verify labels and layouts.
- Export a backup to Files, change data, then import with confirmation. Try a malformed file; existing data should remain.
- Test notification permission denial and enabling. Confirm timers still function in-app.
- Test VoiceOver, reduced motion and larger text on the actual phone. These checks have not yet been performed.

Do not use irreplaceable training records until this checklist and backup recovery are validated on your device.

## Expo Go versus development builds

| Capability | Intended Expo Go support | Additional validation/build requirement |
| --- | --- | --- |
| Guest profiles, SQLite workouts/history/templates/journals | Yes, on matching SDK | Test persistence and force-close on your phone |
| Reanimated UI, haptics, charts, file import/export | Yes, matching SDK | Device permissions/share sheet behavior unverified |
| SecureStore cloud sessions | Supported module | Configure Supabase and test restoration on iPhone |
| Local rest/planned notifications | Local notifications only, where supported | OS permissions/background delivery must be tested |
| Remote push notifications | Not implemented | Requires development build and backend infrastructure; Android remote push is unavailable in Expo Go |
| HealthKit, Health Connect, background sync, photo storage, barcode lookup | Not implemented | Native/backend work is still required |

SDK compatibility does not prove device execution. Native bundle exports are not installable IPA files.

## EAS Build for iOS

An Expo account and CLI access on a host are needed to create a cloud build. EAS does not require Xcode on your Windows machine. Apple signing/distribution requirements still apply.

```sh
npx eas-cli login
npx eas-cli build:configure
# For a standalone internally distributed build, using committed eas.json:
npx eas-cli build --platform ios --profile preview
```

For a custom development client, first add the SDK-compatible client module and commit the resulting dependency changes:

```sh
npx expo install expo-dev-client
npx eas-cli build --platform ios --profile development
npx expo start --dev-client
```

Adding `expo-dev-client` changes Expo CLI's default launch target; continue using `--go` when you intend Expo Go. Set the public Supabase variables in the EAS build environment when enabling cloud features.

A signed **physical-device** iOS preview/development build typically needs membership in the Apple Developer Program and device registration for internal/ad hoc distribution. EAS guides credential creation and signing. TestFlight/App Store distribution also requires Apple's developer program and App Store Connect setup. Do not confuse an iOS simulator build with an iPhone install; simulator use normally requires a Mac. Expo Go does not require your own Apple developer membership.

No EAS build, Apple signing, UDID registration or TestFlight upload was run here. Do not share Apple credentials or private keys in chat or commit them.

## Supabase and password recovery on the phone

Follow README database setup. Put only the public project URL and publishable key in `.env`, restart Metro, and register/login through Profile → Account. The app does not accept service-role credentials.

Configure Auth allowed redirect URLs for the actual account callback. Signed builds use `forge://account`; Expo Go uses `exp://<host>:<port>/--/account` or its current tunnel equivalent. The reset-password request generates the current redirect using Expo Linking. Open the recovery email on the phone while the app/server is available, return to the account screen, and set a new password. Email delivery and redirect handling need a real project/device test.

Use two test accounts to verify isolation before trusting cloud data. Switching accounts requires exporting and clearing the local database; this prevents uploading one user's retained records into another account. Cloud synchronization is currently manual. Export a local backup before resolving a cloud conflict or deleting an account.
