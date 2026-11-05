# Releasing FORGE: build profiles, checks and beta procedures (Phase 8.4B)

How FORGE's beta and store builds are made for **iOS and Android together**: which app each build is, which Supabase project it may use, the checks that stop a wrong build, and the procedures for TestFlight and Google Play internal testing.

**Status (Nov 4, 2026): repository only.**

- Nothing external exists yet: no EAS project is linked, there are no store records, no signing credentials, and nothing has been uploaded.
- The manual account and store steps are in [STORE_SETUP.md](STORE_SETUP.md). Every one of them needs the founder's approval first.
- **Production builds are locked** until the founder approves production release readiness. Since Phase 8.4C-0, `eas.json` has no `production` profile at all (§6).
- The readiness audit behind this design is [PHASE_8_4A_BETA_READINESS.md](audits/PHASE_8_4A_BETA_READINESS.md).

## 1. Three apps, three identities

| App | `APP_VARIANT` | iOS bundle ID and Android package | Link scheme | Supabase project | Distributed through | Profiles |
|---|---|---|---|---|---|---|
| **FORGE** | `production` (or unset) | `com.lsaint06.forge` | `forge` | Production only | App Store, Google Play | None until 8.4F (§6) |
| **FORGE Preview** | `preview` | `com.lsaint06.forge.preview` | `forge-preview` | FORGE DEV only | TestFlight, Google Play internal testing | `preview` |
| **FORGE Dev** | `development` | `com.lsaint06.forge.dev` | `forge-dev` | FORGE DEV only | `npm run dev:ios` on the Mac; EAS internal builds | `development`, `development-simulator`, `development-release` |

- **Side by side.** The three apps install next to each other and next to Expo Go. A sign-in or email link only ever opens the app that asked for it.
- **Same app.** The icon, splash, plugins and permissions are identical. The one difference: only FORGE Dev answers `exp+forge-fitness` development-client links, the links in `expo start` QR codes. The store apps don't register that scheme.
- **One environment each.** FORGE Preview is locked to FORGE DEV, the development project (founder decision, Phase 8.4B). It is a beta of the app, not a beta of production data:
  - testers' accounts and training live in FORGE DEV;
  - FORGE DEV is a project for disposable data.
- **Where it is defined:**
  - the identities in `app.config.ts`;
  - the runtime rules in `src/cloud/environment.ts`;
  - the profiles in `eas.json`;
  - the checks in `scripts/release/`.

## 2. Build profiles (`eas.json`)

| Profile | App | EAS environment | Distribution | JavaScript | Android output | iOS output | Build number |
|---|---|---|---|---|---|---|---|
| `development` | FORGE Dev | `development` | Internal | From Metro (`npm run start:dev`) | Debug APK | Development client for registered devices | EAS counter, not incremented |
| `development-simulator` | FORGE Dev | `development` | Internal | From Metro | Debug APK | iOS Simulator app | EAS counter, not incremented |
| `development-release` | FORGE Dev | `development` | Internal | Built in | Release APK (installed directly) | Ad hoc IPA for registered devices | EAS counter, not incremented |
| `preview` | FORGE Preview | `preview` | Store | Built in | App Bundle (AAB) | App Store-signed IPA for TestFlight | `autoIncrement` |

**No `production` profile until 8.4F.** FORGE's store profile is kept out of `eas.json` (Phase 8.4C-0) and restored only after production release approval (§6). FORGE itself is unchanged: its identity and its runtime rule (production only) are as in §1.

**Shared by every profile:**

- **Node `24.22.0`**, matching `package.json` `engines`. The food-catalogue build uses `node:sqlite`, which needs Node 24.
- **`cli.requireCommit: true`.** Every build is a commit: EAS uploads a clone of the last commit, not this folder. A clean tree alone isn't the whole guarantee, though (below).
- **`cli.appVersionSource: remote`.** EAS stores and increments the build numbers (§3).
- **`cli.promptToConfigurePushNotifications: false`.** EAS never offers to create an Apple push key. Forge schedules only local notifications, and no app has the push entitlement.
- **Signing.** Credentials are EAS-managed: no `credentials.json` or local keystore in the repository (`.gitignore` covers them).
- **No `submit` section yet.** Uploading to the stores is a separate, approved step (§7, §8).
- **Never in a profile:** custom builds (`config`), `gradleCommand` and `buildConfiguration`. Custom builds skip the npm hooks, so they would skip the builder check; the other two override the build type.
- **`env` sets only `APP_VARIANT`.** Every value lives in the EAS environment the profile names (§4).

`release:check` and `tests/release-check.test.ts` enforce all of this (§5). Changing a profile means changing `scripts/release/profiles.ts` deliberately, in a reviewed commit.

### What EAS uploads (checked against EAS CLI's source, Nov 4, 2026)

| Situation | What EAS CLI does |
|---|---|
| Forge's setting (`requireCommit: true`) | Uploads a shallow `git clone` of the current commit, with its `.git` folder. Untracked and ignored files are never in it: `.env`, `.env.forge-dev`, signing files, `assets/catalog/`, `ios/`, `android/`, `node_modules`. A `.easignore`, if one existed, could only delete files from the clone |
| Uncommitted changes, including untracked files | Stops. Interactively it first asks **"Commit changes to git?"**. **Yes** runs `git add -A`, which commits *every* untracked file that isn't ignored, and uploads them. **Always answer No**; commit deliberately, after `release:check` |
| `EAS_NO_VCS` set, to any value (even `0`) | Skips Git and the commit requirement. Copies this folder minus `.git`, `node_modules` and the ignore rules: every `.gitignore`, or, if a `.easignore` exists, that file alone. A `.easignore`'s `!` rules can even add files that were never committed |

**Whatever was uploaded, a build also receives:**

- the variables of the profile's EAS environment;
- `eas.json`'s `env`, which wins over an EAS variable of the same name (EAS CLI warns about the overlap).

**EAS build logs** show the resolved app config and `eas.json`. EAS CLI prints the names, never the values, of the variables it loaded. Neither file holds a secret: the app config holds no environment values (`tests/app-variants.test.ts`), and profiles may set only `APP_VARIANT`.

**Guards:**

- **Before a build** (`release:check --profile`):
  - a clean tree;
  - no committed settings files or signing credentials;
  - no `EAS_NO_VCS` in the shell, and no `.easignore`.
- **On the builder** (`--builder`): it refuses any `.env` file at the project root, however it arrived, before anything is bundled.
- **`.gitignore`:** it also covers settings files and common signing-file names in the copy made with `EAS_NO_VCS`.

**Remaining limits:**

- **Anything committed is uploaded.** The checks recognize settings files and signing-file names, not a secret pasted into some other file.
- **`EAS_NO_VCS` set only for the `eas` command** escapes the local check. Settings and signing files are still excluded by `.gitignore`, and the builder still refuses `.env` files, but any other file in the folder would be uploaded.
- **The builder check stops a build; it can't take back an upload.** It looks only for `.env` files, because `node_modules` and the generated native folders legitimately hold certificates and keystores (such as React Native's public debug keystore). If a credential is ever uploaded or committed, revoke and replace it.
- **Credential files live outside the repository folder.** Keystores, `.p8` keys and Play service-account JSON belong in a password manager or a folder elsewhere, never inside it, ignored or not.
- **Seeing the archive itself** waits for linking (8.4C): `eas build:inspect --platform android --stage archive --output <folder outside the repository>` copies exactly what EAS would upload.
  - It doesn't start a build, change a build number or touch credentials.
  - Use only `--stage archive`: the other stages run a full local build.

## 3. Versions and build numbers

- **Store version:** `expo.version` in `app.json`, today `1.0.0`. It is `MAJOR.MINOR.PATCH` and changes only in a reviewed commit. It becomes iOS `CFBundleShortVersionString` and Android `versionName`.
- **Build numbers:** iOS `buildNumber` and Android `versionCode` are EAS's (remote version source). The check refuses them in `app.json`.

### One counter per app and platform (from EAS CLI's source; to confirm on the first builds)

EAS stores build numbers per EAS project, platform and **application identifier**. EAS CLI takes the identifier from the app config it evaluates with the profile's `APP_VARIANT`. `eas.json` sets `APP_VARIANT`, and it wins over any EAS variable of the same name.

| Counter | Moved by | Never moved by |
|---|---|---|
| `com.lsaint06.forge.preview`, iOS and Android | Each `preview` build, incremented before upload | FORGE's or FORGE Dev's builds |
| `com.lsaint06.forge`, iOS and Android | Nothing until 8.4F: no profile builds FORGE (§6) | FORGE Preview's builds |
| `com.lsaint06.forge.dev`, iOS and Android | Created at 1 by the first EAS `development*` build, then read but not incremented | FORGE Preview's or FORGE's builds |

**How FORGE Preview's numbers increase:**

- **First values.** With no build number in the app config, EAS starts from the default of 1:
  - **iOS:** the first FORGE Preview build is 1, then 2, 3…;
  - **Android:** the first `versionCode` is 2, because EAS reads the default 1 and increments it.
- **Requirements met.** Google Play needs each upload of a package to have a higher `versionCode`; App Store Connect needs a new build number within a version. Gaps are harmless.
- **Failed builds use a number.** EAS CLI increments on this computer before it uploads, so a build that fails later, even at the builder check, still uses its number.
- **Separate store records.** FORGE Preview is its own App Store Connect app and its own Play app. Its TestFlight and internal-testing builds never appear in FORGE's store history, whatever their numbers.
- **One shared store version.** `app.json`'s `version` belongs to all three apps. Raising it for a beta also raises the version FORGE's first production build will carry. Each store record still keeps its own history.

### Keeping production's counter untouched

- **`eas build` without `--profile` uses `production`,** EAS's default. Since Phase 8.4C-0 there is no such profile:
  - EAS CLI stops when it reads `eas.json` ("Missing build profile in eas.json: production");
  - so does `eas build --profile production`;
  - **in EAS CLI's source** (`runBuildAndSubmitAsync`), that comes right after the clean-tree check: before it evaluates the app config or its EAS variables, sets any build number, offers credentials or uploads anything.
- **Why it mattered, and will again after 8.4F.** With a production profile, EAS CLI does all of this before the build reaches the builder check:
  - creates or increments `com.lsaint06.forge`'s counter;
  - offers to create production signing credentials. On Android the keystore question defaults to **Yes**, and with `--non-interactive` EAS creates a missing keystore without asking.
- **Rules, now and after 8.4F:**
  - **Always pass `--profile`:** `preview`, or a `development*` profile.
  - **Never pass `--non-interactive`** for a profile whose credentials don't exist yet.
  - **Decline any credential prompt** for `com.lsaint06.forge` (no `.preview` or `.dev`).
  - **Don't use `npx testflight`.** Expo built it around the `production` profile, with its own Apple sign-in, credential and App Store Connect API-key steps; Forge's route to TestFlight is §7.
- **`eas build:version:set`** changes the counter of the profile it's given, `production` when none is given, which now fails the same way. Use it only with `--profile preview`, and only with approval. `eas build:version:get` and `eas build:version:sync` only read counters.
- **If production's counter or credentials are ever touched by mistake** (after 8.4F):
  - nothing has reached a store;
  - the counter's gap is harmless, and `eas build:version:set --profile production` can reset it before the first real production build (approval);
  - credentials created by mistake can be removed with `eas credentials` (approval).
- **To confirm on the first builds (8.4C, 8.4D):** `eas build:version:get --profile preview` before and after a `preview` build shows only FORGE Preview's counter moving.

## 4. Environments and data protection

### What each EAS environment holds (later, at linking; names only)

| EAS environment | Used by | Holds |
|---|---|---|
| `development` | `development`, `development-simulator`, `development-release` | FORGE DEV's four public values (below) |
| `preview` | `preview` | **The same four FORGE DEV values.** Never production's |
| `production` | `production` | Nothing until production readiness is approved. The build is locked anyway (§6) |

**The four variables:**

- `EXPO_PUBLIC_SUPABASE_URL`;
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- `EXPO_PUBLIC_FORGE_ENV` (`development` for both FORGE Dev and FORGE Preview);
- `EXPO_PUBLIC_SUPABASE_PROJECT_REF`.

`EXPO_PUBLIC_SUPPORT_EMAIL` is optional, once a real address exists.

**Rules:**

- **Project-wide variables only, never account-wide.** EAS applies account-wide variables to every project and every environment.
- **Plain text or sensitive visibility.** These values are built into the app anyway; secret visibility adds nothing for them.
- **Never a secret key.** A Supabase secret or service-role key never goes into any EAS environment as an `EXPO_PUBLIC_` value: the builder check stops it.
- **The same four values come from `.env.forge-dev`** on the Mac and on Windows. That file never travels through Git (`docs/DEVELOPMENT_ENVIRONMENT.md`).

### Three layers, each failing closed

1. **The runtime rule** (`src/cloud/environment.ts`):
   - each app may use exactly one environment: FORGE `production`, FORGE Dev and FORGE Preview `development`;
   - the address must be exactly that project's;
   - anything else shows "Accounts aren't available", signs nobody in and keeps the phone's training.
2. **The builder check** (`npm run release:check -- --builder`). It runs first in `eas-build-post-install` on every EAS build.
   - **When it runs** (EAS's build-tools source):
     - after packages are installed, `expo-doctor` runs and prebuild generates the native folders;
     - on iOS, also after `pod install`, and after the signing credentials are restored into the build machine's keychain;
     - **before** the JavaScript bundle, Gradle or Xcode, signing and any upload. So nothing has been bundled, compiled, signed or produced.
   - **What it requires:**
     - a known profile building its own app (`APP_VARIANT`);
     - no `.env` file in the build, however it arrived;
     - wherever JavaScript is built in, all four values, naming this app's own environment;
     - the address belonging to the project ref;
     - HTTPS, and no secret key in any `EXPO_PUBLIC_` variable;
     - **the project ref being the pinned project** for that environment (`scripts/release/projects.ts`, by SHA-256: the public repository never names a project).

   A FORGE Preview build given production's values stops, even when they are consistently labelled `development`.
3. **The local preflight** (`npm run release:check -- --profile <name>`, §5). It checks the repository before a build is started.

**What the checks can't catch:**

- **A deliberate change to a pin** in `scripts/release/projects.ts`. That is a reviewed commit, by design.
- **Values changed after a build.** A built app keeps the values it was built with. Changing an EAS environment affects only later builds.
- **The data inside FORGE DEV.** It is a disposable project; testers must be told that beta data can be reset.

### Existing installs are untouched

- **Expo Go and the founder's training history:**
  - Expo Go is its own app;
  - `npm start` still reads `.env` and connects to production exactly as before;
  - Phase 8.4B changes neither.
- **The standalone FORGE Dev on the iPhone:**
  - its identity is unchanged: `com.lsaint06.forge.dev`, `forge-dev`, Sign in with Apple only, and still the `exp+forge-fitness` development-client link;
  - `npm run dev:ios` is unchanged;
  - a rebuild installs over it, keeping its data, as before;
  - an EAS-built FORGE Dev (`development-release`) would also replace it (same app ID). Export a backup first, as with any reinstall.
- **FORGE Preview** is a new, separate app. It starts empty and has its own data.

## 5. Release checks

```powershell
npm run release:check -- --profile preview      # before a build: must pass on a clean tree
npm run release:check -- --profile preview --allow-dirty   # while editing: notes uncommitted work
npm run release:check -- --fingerprint .env.forge-dev      # a project's pin, without printing its ref
```

**`--profile <name>`, on this computer:**

- `eas.json`: exactly Forge's four profiles, each as in §2, and no `production` profile until 8.4F.
- Every app's identity: its own IDs and link scheme, a `MAJOR.MINOR.PATCH` version, and no local build numbers.
- The native policy for every app: no shared-storage permissions, sign-in kept out of Android backups, and development-client links on FORGE Dev only (§9).
- Whether the profile's project is pinned.
- That `.env.forge-dev`, if present, is the pinned FORGE DEV project.
- That `eas-build-post-install` starts with the builder check.
- Git: no settings files or signing credentials committed, and nothing uncommitted.
- The upload: EAS will send the last commit, not this folder. No `EAS_NO_VCS` in the shell, no `.easignore` (§2).

**`--profile production`** prints only that production builds are locked (§6) and exits with code 1.

**`--builder`:** run automatically on EAS (§4). Run by hand, it refuses: `EAS_BUILD_PROFILE` isn't set.

**Output:** ✓ and ✗ lines that name files, profiles and variables, never values. Any ✗ exits with code 1.

**Tests:**

- `tests/release-check.test.ts`: profiles, mutations, crossover cases, the upload safeguards, the CLI itself and the builder check in a clean folder;
- `tests/app-variants.test.ts`: identities, and Expo's own native pipeline (permissions, backup rules, link schemes);
- `tests/environment.test.ts`: the runtime rule.

## 6. The production lock

**Two independent locks until production release is approved:**

| Lock | Since | What it stops |
|---|---|---|
| **No `production` profile in `eas.json`** | Phase 8.4C-0 | EAS CLI itself. `eas build --profile production`, and `eas build` without a profile, stop when EAS reads `eas.json`: before any app config with EAS variables, build number, credential or upload (§3). The local check refuses a production profile added back, and the builder refuses `EAS_BUILD_PROFILE=production` |
| **No production pin** (`PROJECT_FINGERPRINTS.production` is `null`) | Phase 8.4B | Any production build that still reached the builder: it stops before anything is bundled, compiled or signed |

**What stays as it is:**

- FORGE's identity (`com.lsaint06.forge`, `forge`, `app.json`);
- its runtime rule: production only, `src/cloud/environment.ts`;
- Expo Go and `npm start`;
- the production backend.

Nothing about the production app itself was removed, only its EAS build profile.

### Restoring the profile (Phase 8.4F, after the founder's approval)

**One reviewed commit, in this order:**

1. **Production readiness.** The production-backend items in the [audit](audits/PHASE_8_4A_BETA_READINESS.md) §7 (gate G-PROD) are done, and the founder approves production release.
2. **The profile.** Add `build.production` back to `eas.json`, after `preview`, exactly as `PRODUCTION_PROFILE.eas` in `scripts/release/profiles.ts`. It's the profile removed in Phase 8.4C-0:

   ```json
   "production": {
     "distribution": "store",
     "autoIncrement": true,
     "environment": "production",
     "node": "24.22.0",
     "android": {
       "buildType": "app-bundle"
     },
     "env": {
       "APP_VARIANT": "production"
     }
   }
   ```

   A test keeps `PRODUCTION_PROFILE.eas` in step with `preview`'s settings (Node pin, numbering, App Bundle), so it's current whenever it's restored.
3. **The check.** In `scripts/release/profiles.ts`, add `production: PRODUCTION_PROFILE.rule` to `PROFILES`, so the local and builder checks expect it.
4. **The pin.** Run `npm run release:check -- --fingerprint <production settings file>`, then put the printed SHA-256 in `scripts/release/projects.ts` as `production`. The ref itself never appears.
5. **The tests** in `tests/release-check.test.ts`: the absence tests become presence tests, and "the 8.4F restore" test already shows the result must pass. Run every check.
6. **Review and commit.** Then, as separate approvals, set production's four values in the EAS `production` environment and create FORGE's store records ([STORE_SETUP.md](STORE_SETUP.md) §7).

`tests/release-check.test.ts` ("the 8.4F restore") already checks that this exact profile, with `PRODUCTION_PROFILE.rule` added back, passes the `eas.json` check. On the builder, it still refuses until production is pinned, and then accepts only production's own project.

The production app's runtime rule (production only) applies from its first build. From then on, `eas build` without `--profile` builds production again, so the rules in §3 apply.

## 7. iOS beta: TestFlight (Phase 8.4C, after approval)

**Prerequisites** (manual, [STORE_SETUP.md](STORE_SETUP.md) §1–§3):

- Apple Developer Program membership: the founder's paid Individual team exists.
- The App ID `com.lsaint06.forge.preview` with the Sign in with Apple capability.
- An App Store Connect app record for FORGE Preview.
- An Expo account, and the EAS project linked (`eas init`) in a reviewed commit.
- The four FORGE DEV values in the EAS `preview` environment.

**Steps:**

1. **Check.** `npm run release:check -- --profile preview` on a clean, pushed commit.
2. **Build.** `eas build --profile preview --platform ios`.
   - EAS creates or reuses the distribution certificate and App Store provisioning profile. **Creating credentials needs approval.**
   - EAS builds with Xcode 26 or later, which Apple has required since Apr 28, 2026. Expo SDK 58's default image qualifies; confirm it in the build log.
3. **Upload.** Use `eas submit --platform ios` (a `submit` profile is added at 8.4C) or Transporter. **Uploading needs approval.**
4. **Internal testing first:** App Store Connect users on the team, without Beta App Review.
5. **External testing later.** It needs Beta App Review, a privacy policy URL and test information.

**On the device, before any tester:** follow [audit](audits/PHASE_8_4A_BETA_READINESS.md) §7. The checks: sign-in through `forge-preview:` links, offline logging, sync, rest alerts while locked, and that the build reaches FORGE DEV only.

## 8. Android beta: Google Play internal testing (Phase 8.4D, after approval)

**This Windows PC can drive everything through EAS's cloud builds.** It has no JDK, Android SDK or Android Studio, and needs none for EAS. Local Android builds would need JDK 17 or later and the Android SDK (compile SDK 37, NDK 27.1); they are optional.

**Prerequisites** (manual, [STORE_SETUP.md](STORE_SETUP.md) §4–§5):

- **A Google Play developer account.** Decision: personal or organization. Personal accounts created after Nov 13, 2023 must run a closed test with at least 12 testers for 14 consecutive days before production access. Plan for this, because Android launches with iOS.
- **An app record for `com.lsaint06.forge.preview`**, later one for `com.lsaint06.forge`, with Play App Signing:
  - Google holds the app signing key;
  - EAS holds the upload key, whose generation needs approval.
- **The four FORGE DEV values** in the EAS `preview` environment.

**Steps:**

1. **Check.** `npm run release:check -- --profile preview`.
2. **Build.** `eas build --profile preview --platform android` produces an AAB. EAS offers to generate the upload keystore: **approval**.
3. **First upload by hand.** Google Play takes a new app's first bundle only through Play Console. Upload it to the internal testing track; later uploads can use `eas submit`. **Approval.**
4. **Physical Android testing without Play.** `eas build --profile development-release --platform android` builds FORGE Dev as an APK to install directly, with FORGE DEV. It needs an Android phone with installs from this source allowed. **This is the recommended first Android device build.**

**Play policy items to complete before testers:**

- the target API level: 36 required from Aug 31, 2026, and React Native 0.88's default is 36;
- 16 KB page support, required since Nov 1, 2025: confirm it in Play Console's App bundle explorer;
- the Data safety form;
- the Health apps declaration;
- an account-deletion web URL;
- the content rating.

**Android behaviour to verify on a device (8.4D):**

- **Rest alerts.** They use inexact alarms (`setAndAllowWhileIdle`, no exact-alarm permission), so Doze may delay them.
- **Notification permission.** `POST_NOTIFICATIONS` is a runtime permission on Android 13 and later.
- **Backups.** A backup and restore keeps preferences only (§9); after a restore to a new phone, no stale rest alert should fire.

## 9. Android backup and permission policy

### Backups: conservative, by explicit include list

- **Forge keeps Android Auto Backup on**, with expo-secure-store's rules. `configureAndroidBackup: true` in `app.json` makes them explicit.
  - Android 11 and earlier: `@xml/secure_store_backup_rules`.
  - Android 12 and later: `@xml/secure_store_data_extraction_rules`, for cloud backup and device transfer.
  - **Both include only `sharedpref` and exclude the `SecureStore` preferences.**
- **Not backed up or transferred:**
  - **sign-in:** the Supabase session lives in SecureStore, encrypted with an Android Keystore key, which never leaves the device;
  - **training and health data:** the SQLite database `forge.db`;
  - the food catalogue database, files and caches.
- **Backed up:** only plain, non-sensitive preferences, such as expo-notifications' schedule records.
- **Moving to a new phone:** an athlete's data moves through their Forge account (sync) or Forge's own backup file, never silently through Google's backup.
- **Disabling backups entirely** (`allowBackup: false`) wasn't needed: selective exclusion is practical and in effect. It remains an option if the founder prefers.
- **Guarded by tests:**
  - Expo's own pipeline must still point both manifest attributes at those rules;
  - the rule files must still include exactly `sharedpref` minus `SecureStore` (`tests/app-variants.test.ts`).

  If another plugin ever set its own backup rules, expo-secure-store would only warn, and these tests would fail.

### Permissions

- **Removed** (`android.blockedPermissions`, written as `tools:node="remove"`): `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`.
  - The template and `expo-file-system` add them (to Android 12).
  - Forge never uses shared storage: it writes only to its own folders (`Paths.cache` and SQLite's directory), and backups use the system's folder and document pickers.
- **Kept, each needed:**
  - `INTERNET`;
  - `CAMERA`, for the barcode scanner, with a runtime prompt;
  - `VIBRATE`, for haptics;
  - `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`, for rest and reminder alerts, which come back after a restart.
- **Proposed, not done:** blocking `SYSTEM_ALERT_WINDOW`. The Expo template adds it to release builds, where Forge doesn't use it. It waits for the founder's approval.
- **Added at the Gradle merge**, so they are visible only in a built bundle: Firebase Messaging, which expo-notifications depends on, and ShortcutBadger, for launcher badges, add their own permissions. **Read the merged list from the first App Bundle (8.4D)** before completing the Data safety form, and propose blocking what Forge doesn't use then.

## 10. Monetization prerequisites (Engineer #2, Phase 9: coordination only)

This repository work doesn't add, configure or test purchases. What Phase 9's plan (RevenueCat, `react-native-purchases`) will need from the build foundation:

- **Development builds.** Purchases are native code: Expo Go can't test them.
  - Adding the dependency changes the native app: rebuild FORGE Dev (`npm run dev:ios`) and any EAS builds.
  - No profile change is needed.
- **Google Play Billing:**
  - **The permission.** `com.android.vending.BILLING` comes from the Billing library's manifest at the Gradle merge. Forge blocks only storage permissions; never block BILLING.
  - **Products need an uploaded bundle.** Play Console allows subscription products only after an App Bundle containing the BILLING permission has been uploaded. So the first `preview` AAB with purchases inside gates product setup.
  - **Timing.** Android purchases must be ready for launch together with iOS. Phase 9's plan lists Android billing as "later"; that needs aligning.
- **Store identities:**
  - **Separate products and keys per app.** Products and their RevenueCat apps belong to a bundle ID or package. FORGE Preview (`.preview`) and FORGE are different store apps, each with its own products and public SDK keys per platform.
  - **Founder decision: which app carries sandbox purchases.** TestFlight builds of FORGE Preview use Apple's sandbox automatically. Phase 9's note F11 proposes an App Store Connect record for `.dev` instead.
- **Keys:**
  - **Public SDK keys** go in the EAS environments, never in `eas.json`, because profiles may set only `APP_VARIANT`.
  - **RevenueCat secret keys** (`sk_…`) never go in an app. Today's builder check knows Supabase's secret formats only; extending it to RevenueCat's (and validating the new public keys per environment) belongs to Phase 9, in `scripts/release/profiles.ts`.
- **Native configuration:** a new config plugin must keep §9's policy (no storage permissions, no change to backup rules). `release:check` and `tests/app-variants.test.ts` will say if it doesn't.
- **iOS:** CocoaPods trunk becomes read-only on Dec 2, 2026. Pods already published keep installing; any SPM-only update needs a joint plan.
- **Accounts:**
  - **Sandbox and test accounts** (Apple sandbox testers, Google license testers) are created only with approval.
  - **The entitlement mirror** (`forge_entitlements`) and its webhook go to FORGE DEV first; production is a separate approval.

## 11. Open verification items

Checked in EAS's source or locally in Phase 8.4B; still to confirm on real builds or to decide:

| # | Item | How it's confirmed | When |
|---|---|---|---|
| V1 | **What EAS uploads** (§2) | `eas build:inspect --platform android --stage archive --output <folder outside the repository>`: no `.env*`, credential files, `assets/catalog/`, `ios/` or `android/` | 8.4C, after linking, before the first build |
| V2 | **Separate build counters** (§3) | `eas build:version:get --profile preview` before and after the first `preview` builds: only FORGE Preview's counter moves, iOS from 1 and Android from 2; production has none | 8.4C, 8.4D |
| V3 | **The builder check's place** (§4) | The build log shows "Release check on EAS Build", every line ✓, before the JavaScript bundle and Gradle or Xcode. A deliberately wrong value stops a build there | 8.4C, 8.4D |
| V4 | **The EAS build image's Xcode** (§7) | `auto` (no `image` in `eas.json`) selects the `sdk-58` images: Xcode 27.1 RC on iOS, JDK 17 and NDK 27.1 on Android (EAS docs, Oct 8, 2026). Confirm in the first build logs | 8.4C, 8.4D |
| V5 | **Expo Doctor's dependency check** | Assessed in Phase 8.4C-0; updated in Phase 8.4C-1 on `feat/sdk58-alignment` (below): Expo Doctor passes 20 of 20. Still to do: the FORGE Dev rebuild, the iPhone and iOS 27 Simulator checks, then merging after approval | Before the first iOS beta build |
| V6 | **The merged Android permissions** (§9) | Play Console's App bundle explorer on the first App Bundle | 8.4D |
| V7 | **A client-side production lock** (§6) | Done in Phase 8.4C-0: `eas.json` has no `production` profile until 8.4F; tested in `tests/release-check.test.ts` | Done |

**V5, Expo Doctor (assessed in Phase 8.4C-0, Nov 5, 2026; nothing installed).** `npx expo-doctor` passes 19 of 20 checks. The failing one, "packages match versions required by the installed Expo SDK", lists 16 packages:

- 15 patch updates, including `expo` 58.0.23 (58.0.17 installed) and `react-native` 0.88.1 (0.88.0 installed);
- one minor update, `react-native-safe-area-context` 5.11.1 (5.10.1 installed; dependencies kept unchanged at the founder's instruction since Phase 8.3C).

**The source.** Every expected version is exactly Expo SDK 58's own pin (`bundledNativeModules.json`), and npm's latest for each package. Each package's changelog was read, and the findings were checked against Forge's code.

**What it means for builds:** EAS runs `expo-doctor` on every build. A failure is recorded as a warning and doesn't stop the build (EAS's build-tools source), so each build log will show this warning until the packages are updated.

**One set, not à la carte.** The installed packages are consistent: their precompiled iOS binaries are built against React Native 0.88.0. From `expo` 58.0.21 on, Expo moves to React Native 0.88.1:

- it rebuilds those binaries against it (`expo-camera` 58.0.14, `expo-file-system` 58.0.13, `expo-font` 58.0.11);
- `jest-expo` 58.0.13 follows it.

Mixing the two sets risks native mismatches. The update is therefore all 16 packages together (`npx expo install --fix`), or none.

| Class | Packages | Why |
|---|---|---|
| **Required before the first iOS beta build** | `react-native` 0.88.1 and `expo` 58.0.23, with the set | **The iOS 27 status bar.** Forge's builds use the iOS 27 SDK (Xcode 27.2 on the Mac, Xcode 27.1 on EAS). That SDK makes the status-bar calls Forge relies on do nothing ([expo/expo#52723](https://github.com/expo/expo/issues/52723)). On iOS 27, a default (dark-theme) athlete whose iPhone is in light mode gets dark clock and battery icons on Forge's charcoal screens; the splash is affected too. The fix needs both packages **and** `ios.infoPlist.UIViewControllerBasedStatusBarAppearance: true` in `app.json` (prebuild writes `false` today). The founder's iPhone (iOS 26.6.2) is unaffected; testers on iOS 27 would be |
| **Recommended, deferrable** | `react-native-safe-area-context` 5.11.1 | Android: respects window insets a parent adjusts. Forge's Android layouts haven't been validated yet, so updating before that validation means validating once. iOS: a fix for native sheets after rotation, which Forge (portrait, full-screen logger) doesn't use. The Phase 8.3C header fix must be re-verified on the iPhone either way |
| **Recommended, deferrable** | `expo-router` 58.0.30 | Navigation and deep-link fixes (Back and dismissal after a deep link, `<Link>` addresses with parentheses) relevant to email links. One labelled breaking change, implicit group anchors, shouldn't affect Forge: its only group is `(tabs)`, with no route of the same name, and no `unstable_settings`. Re-test sign-in and password-reset links |
| **Recommended, deferrable** | `expo-file-system` 58.0.13 | Android: `Paths.availableDiskSpace` stops counting space reserved for the system. The branded food catalogue's space check uses it |
| **Unnecessary for 8.4C** | `expo-camera` 58.0.14 | Its fixes are for Android release builds with R8 minification, which Forge doesn't enable (SDK 58's default is off), plus the iOS rebuild above |
| **Unnecessary for 8.4C** | `react-native-screens` 4.30.1 | iOS native tabs on foldable iPhones, search tabs, zoom transitions: none used by Forge |
| **Unnecessary for 8.4C** | `expo-notifications` 58.1.8 | Only an Android Expo Go import fix; nothing about scheduling, channels or permissions |
| **Unnecessary for 8.4C** | `expo-sqlite` 58.0.15 | iOS internals and a smaller Android library; its data-integrity fixes are already in 58.0.13 |
| **Unnecessary for 8.4C** | `expo-font` 58.0.11, `jest-expo` 58.0.14 | Web font loading, the iOS rebuild above, and Jest only (Forge's suites pass without them) |
| **Unnecessary for 8.4C** | `expo-constants`, `expo-linking`, `expo-sharing`, `expo-splash-screen`, `@expo/metro-runtime` | Dependency bumps only |

**Updating them** (`npx expo install --fix`) is a separate, approved dependency change. It also changes Expo Go's and the Mac's installs. It needs:

- the `app.json` status-bar setting above;
- every check;
- a FORGE Dev rebuild on the Mac;
- the founder's iPhone re-verification, with the logger header and status bar in both themes;
- an iOS 27 Simulator check.

Doing it before the first Android device build means Android is validated once, on the final set.

**V5, the update (Phase 8.4C-1, Nov 5, 2026; branch `feat/sdk58-alignment`, not merged).**

- **The packages.** All 16 are at SDK 58's pins (`npx expo install --check`: up to date). `npx expo-doctor` passes 20 of 20. The lockfile changes only Expo and React Native packages, with one copy of each.
- **`expo-sharing`'s config plugin: not added.** `npx expo install --fix` offers to add it. It sets up *receiving* shares (an iOS share extension, Android share intents), both off by default. Forge only shares files out, which needs no plugin. Expo's own pipeline produces the same native settings as before for all three apps.
- **The status bar.** Three parts, all required:
  1. `app.json`: `ios.infoPlist.UIViewControllerBasedStatusBarAppearance: true`, in every app. iOS then asks the app's view controllers for the style.
  2. `react-native` 0.88.1 and `expo` 58.0.23: their root view controller answers with the style `StatusBar` last set. It applies before the screens mount: the launch, loading and recovery screens.
  3. The screens: `react-native-screens` passes iOS's question to the top screen of the navigation stack. Without a stated style, that screen follows the phone's light or dark appearance, not Forge's theme. So `src/auth/AppStack.tsx` states Forge's style on every screen, the full-screen workout logger included. Tab screens inherit the style from their parent screen.

  The style comes from `src/domain/presentation/status-bar.ts`:
  - light icons on the dark theme, dark icons on the light theme;
  - light whenever the intro is on screen.

  The screens state it only in Forge's own iOS builds:
  - Expo Go keeps the setting off in its own Info.plist, and react-native-screens reports a stated style there as an error;
  - Android keeps `StatusBar`, as before.
- **Checks passed:**
  - typecheck, lint and formatting;
  - the logic and UI suites, with new tests for the rule, the screens' style on iOS, Expo Go and Android, and the intro;
  - iOS and Android exports;
  - the release check;
  - Expo's own pipeline, where the Info.plist key is the only native difference.
- **Still to verify on devices, not by these checks** (step by step in [FORGE_DEV_SDK58_CHECKLIST.md](FORGE_DEV_SDK58_CHECKLIST.md)):
  - **The FORGE Dev rebuild on the Mac (Release) and the founder's iPhone:**
    - the status bar in both Forge themes, with the phone in light and in dark mode;
    - the intro;
    - the logger's header (the Phase 8.3C fix);
    - the workout, sync and backup flows.
  - **An iOS 27 Simulator check, on a Release build.** Debug development builds use `expo-dev-launcher`'s root view controller, which doesn't relay `StatusBar`.
  - **Expo Go,** whose status bar should be unchanged.
  - **Android,** in 8.4D.
