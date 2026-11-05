# Store and account setup: the founder's manual steps (Phase 8.4)

The steps outside this repository that FORGE's beta and store builds need: Expo (EAS), Apple, and Google Play. The repository side is in [RELEASE.md](RELEASE.md); the reasons are in the [8.4A audit](audits/PHASE_8_4A_BETA_READINESS.md).

**Nothing on this page has been done.**

- **Every step needs the founder's explicit approval first** (Phase 8.4B brief). Most are irreversible or create credentials.
- **Engineers prepare and verify; the founder approves each step, and performs those that need the founder's own accounts.**
- **Never paste a key, password, keystore or service-account file into chat, an issue or the repository.** `.gitignore` covers signing files, and `release:check` refuses them if committed.
- **Credential files never go inside the repository folder,** ignored or not. Keep downloaded keystores, `.p8` keys and service-account JSON in a password manager or a folder outside it ([RELEASE.md](RELEASE.md) §2).
- **Every `eas build` names its profile:** `preview`, or a `development*` profile.
  - Without `--profile`, EAS looks for `production`. Until 8.4F there's none, so it stops before anything; after 8.4F it would build production.
  - Never use `npx testflight`: it is built around the `production` profile ([RELEASE.md](RELEASE.md) §3).

| Step | Where | Creates | Phase | Approval |
|---|---|---|---|---|
| §1 Expo account and EAS project | expo.dev, the Windows PC | An EAS project; `owner` and the project ID in `app.json` | 8.4C | Required |
| §2 EAS environment variables | expo.dev | FORGE DEV's public values for `development` and `preview` | 8.4C | Required |
| §3 Apple: App IDs, App Store Connect, signing | developer.apple.com, appstoreconnect.apple.com, EAS | App IDs, app records, distribution certificate, provisioning profiles | 8.4C | Required |
| §4 Google Play: account and app records | play.google.com/console | Developer account, app records, store forms | 8.4D | Required |
| §5 Android signing and the first upload | EAS, Play Console | Upload key; Play App Signing; the first App Bundle | 8.4D | Required |
| §6 Testers | App Store Connect, Play Console | Tester groups and lists | 8.4E | Required |
| §7 Production (later) | Supabase, EAS, stores | Production readiness, the production pin | 8.4F | Required |

## 1. Expo account and EAS project (8.4C)

1. **Account.** Decide which Expo account owns the project (personal or organization; it can be transferred later, but plan for it). Enable two-factor authentication.
2. **Install the EAS CLI.** On the Windows PC: `npm install -g eas-cli`, then `eas login`. A global install, not a project dependency.
3. **Link.** `eas init` in the repository. It adds `owner` and `extra.eas.projectId` to `app.json`.
   - **Review that diff; it must change nothing else.**
   - Then run `npm run release:check -- --profile preview --allow-dirty` and the tests, and commit the change.
   - FORGE Dev's identity is unchanged by linking.
4. **Leave alone:**
   - the CLI's offers to create credentials or to configure push notifications (push prompts are off in `eas.json`);
   - **"Commit changes to git?"**: answer **No**. Yes would commit every untracked file. Commit yourself after `release:check` passes.
5. **See what EAS would upload** before the first build: `eas build:inspect --platform android --stage archive --output <a folder outside the repository>`.
   - It starts no build and touches no credentials or build numbers.
   - Confirm that the copy holds no `.env` file, credential file, `assets/catalog/`, `ios/` or `android/`, then delete it ([RELEASE.md](RELEASE.md) §2).

## 2. EAS environment variables (8.4C)

On expo.dev → the project → Environment variables. **Project-wide, never account-wide.**

| Variable | `development` | `preview` | `production` |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | FORGE DEV's | FORGE DEV's (the same) | Leave empty until §7 |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | FORGE DEV's publishable key | The same | Leave empty |
| `EXPO_PUBLIC_FORGE_ENV` | `development` | `development` | Leave empty |
| `EXPO_PUBLIC_SUPABASE_PROJECT_REF` | FORGE DEV's ref | The same | Leave empty |

- **Copy the values from `.env.forge-dev`** on the Mac or Windows. Visibility: plain text or sensitive.
- **Never a secret or service-role key, anywhere in EAS.**
- **`APP_VARIANT` is not an EAS variable:** `eas.json` sets it per profile.
- **Check:** the first build's log starts its post-install step with "Release check on EAS Build"; every line must be ✓.

## 3. Apple (8.4C)

The founder's paid **Individual** team exists. Decide first whether FORGE ships under the Individual membership (the App Store shows the founder's name as seller) or an Organization (it needs a D-U-N-S number, and transferring an app later is possible but slow).

1. **App ID `com.lsaint06.forge.preview`** with the **Sign in with Apple** capability. `com.lsaint06.forge` is needed only at 8.4F.
   - EAS can register App IDs during the first build. Either way, Sign in with Apple must be on.
   - No Push Notifications capability: Forge sends no push.
2. **App Store Connect record** for FORGE Preview:
   - platform iOS;
   - bundle ID `com.lsaint06.forge.preview`;
   - a name testers will recognize (store names must be unique, and a beta record's name never ships);
   - an SKU of your choice.
3. **Signing.** The first `eas build --profile preview --platform ios` offers to create an Apple distribution certificate and an App Store provisioning profile. **Approve explicitly.**
   - EAS keeps them. Download a backup only if you choose to hold one; never commit it.
4. **Export compliance.** `ITSAppUsesNonExemptEncryption` is `false` in `app.json`: Forge uses only standard HTTPS. Confirm that this stays true.
5. **TestFlight internal testing** (§6) can start once a build is processed.
6. **Before external testing:**
   - test information;
   - a privacy policy URL;
   - Beta App Review.

## 4. Google Play (8.4D)

1. **Developer account.** Decide between personal and organization.
   - **Personal accounts created after Nov 13, 2023 must run a closed test with at least 12 testers for 14 consecutive days before production access.** Start the closed test early, because Android launches with iOS.
   - Identity verification and the one-time fee apply.
2. **App record** for FORGE Preview: package `com.lsaint06.forge.preview` (the package is fixed by the first uploaded bundle). FORGE's own record (`com.lsaint06.forge`) waits for 8.4F.
3. **App content forms, before external testers:**
   - Data safety;
   - the **Health apps declaration** (Forge records training, body and nutrition data);
   - content rating;
   - target audience;
   - the account-deletion web URL (one doesn't exist yet);
   - the privacy policy URL.
4. **Permissions.** Answer the Data safety form from the **merged** permission list of the first App Bundle (Play Console → App bundle explorer). Libraries add some at build time ([RELEASE.md](RELEASE.md) §9).

## 5. Android signing and the first upload (8.4D)

1. **Upload key.** The first `eas build --profile preview --platform android` offers to generate an upload keystore. **Approve explicitly.**
   - EAS keeps it. You may download a backup into your password manager; never commit it.
2. **Play App Signing:** accept Google-managed app signing for the new app (recommended). Google holds the app signing key; a lost upload key can be reset through Play support.
3. **First upload by hand:** Play Console → the app → Testing → Internal testing → create a release → upload the AAB from EAS. Later uploads can use `eas submit` with a Play service account, set up then; its JSON key never enters the repository.
4. **Physical Android device:** `eas build --profile development-release --platform android` builds FORGE Dev (with FORGE DEV) as an APK.
   - Install it from the build page on an Android phone, allowing installs from that source.
   - No Play account is needed for this.

## 6. Testers (8.4E)

- **Internal first:**
  - TestFlight internal testers are App Store Connect users on the team, with no Beta App Review;
  - Play internal testing takes an email list of up to 100 testers.
- **Tester data:** testers sign in to **FORGE DEV**. Tell them their beta accounts and training may be reset, and never invite them into production.
- **Accounts:** creating test accounts for testers needs approval (approval A1 covered one disposable account only).
- **External testers:** TestFlight external groups and Play closed testing, after the gates in the [audit](audits/PHASE_8_4A_BETA_READINESS.md) §7.

## 7. Production (8.4F, later)

1. **Production readiness, gate G-PROD:**
   - the Stage 3 hardening on production;
   - custom SMTP;
   - Site URL and redirect list (no tunnel addresses);
   - Apple revocation and Apple-only deletion;
   - privacy policy and support contact.
2. **Restore the production profile and pin production** in one reviewed commit ([RELEASE.md](RELEASE.md) §6). Then fill in the `production` EAS environment.
3. **Production records:** App ID and App Store Connect record for `com.lsaint06.forge`; Play record for `com.lsaint06.forge`; store listings and screenshots; the real app icon (C-00b).
