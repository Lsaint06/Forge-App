# Phase 8.4A: beta distribution readiness audit (record)

**Recorded:** Nov 4, 2026, during Phase 8.4B, from the read-only Phase 8.4A audit of the same day. **Baseline:** `155d0dd` on `feat/forge-paths-foundation`, clean and equal to origin. Nothing external was created or changed.

**About this record:**

- It restates the audit's verified findings, the founder's decisions on it (Phase 8.4B brief), and the corrections 8.4B made.
- Open decisions are listed by topic (§9), not in the original report's numbering.
- Where 8.4B changed something, the section says so. The working procedures are in [RELEASE.md](../RELEASE.md) and [STORE_SETUP.md](../STORE_SETUP.md).

**Requirement:** iOS and Android are both required for FORGE's initial public launch. Android is not a post-launch feature.

## 1. Repository state at the audit

| Item | Found |
|---|---|
| Expo, React Native | Expo SDK 58 (`expo` 58.0.17); React Native 0.88.0, Fabric and Hermes |
| iOS | Minimum iOS 16.4. Built on the founder's MacBook Air with Xcode 27.2 |
| Android (React Native 0.88 defaults) | Min SDK 24, target SDK 36, compile SDK 37, NDK 27.1, AGP 9.2.1. **No native Android build of Forge has been made** |
| Identities (`app.config.ts`) | FORGE `com.lsaint06.forge`/`forge`; FORGE Dev `.dev`/`forge-dev`; FORGE Preview `.preview`/`forge-preview` |
| Runtime environment rule | FORGE: production only. FORGE Dev: development only. **FORGE Preview: either, if named** (changed in 8.4B, §5) |
| `eas.json` | `development`, `development-simulator`, `preview` (internal), `production` (`autoIncrement`). No `appVersionSource`, no `submit`, no EAS project or owner. EAS CLI not installed |
| `app.json` | No icon (branding decision C-00b); `ITSAppUsesNonExemptEncryption: false`; iPhone only; remote push off; Android `allowBackup` at its default (true); no blocked permissions |
| Local iOS builds | `npm run dev:ios` builds FORGE Dev only, with development signing. Apple team: the founder's paid Individual team, Apple Development certificate only |
| This Windows PC | No JDK, Android SDK, `adb` or Android Studio |
| Android permissions (main manifest and native libraries) | `INTERNET`, `CAMERA`, `VIBRATE`, `SYSTEM_ALERT_WINDOW` (template), `READ`/`WRITE_EXTERNAL_STORAGE` (to Android 12: template and `expo-file-system`), `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED` (`expo-notifications`) |
| Rest alerts on Android | `expo-notifications` schedules inexact alarms (`setAndAllowWhileIdle`, no exact-alarm permission) |

**Founder-verified on the iPhone 17 before the audit (Phase 8.3C):**

- the standalone FORGE Dev Release build installs and opens;
- FORGE DEV email sign-in works;
- workouts can be logged in Airplane mode;
- sync reports success after reconnecting;
- a workout can be resumed after a force-quit;
- the logger's safe-area defect is fixed.

The founder also reported that the 8.3C-3 reliability changes look right on the device. **Nothing has been verified on Android.**

## 2. iOS: TestFlight readiness

**Already supported by the repository:**

- Three identities.
- Sign in with Apple as the only entitlement.
- The camera usage text and the encryption declaration.
- A Release configuration without the development launcher.
- The charcoal launch screen.

**Gaps:**

- **Apple, manual:**
  - the App ID for `com.lsaint06.forge.preview` (and later `com.lsaint06.forge`), with Sign in with Apple;
  - an App Store Connect record for each;
  - a distribution certificate and App Store provisioning profiles (no distribution credentials exist).
- **Build system:** EAS isn't linked; there is no TestFlight-capable profile (`preview` was internal) and no managed build numbering.
- **Assets and metadata:**
  - no app icon (C-00b): Expo's white placeholder would upload;
  - TestFlight test information;
  - for external testing, a privacy policy URL and Beta App Review.
- **Apple's rules (verified Nov 2026):**
  - Xcode 26 or later with the iOS 26 SDK has been required for uploads since Apr 28, 2026;
  - external testing allows up to 10,000 testers after Beta App Review.

## 3. Android: internal testing readiness

**Already supported by the repository:** the identities and package names. Expo's prebuild generates the Android project.

**Gaps:**

- **Accounts:**
  - no Google Play developer account or app records;
  - no upload key, no Play App Signing.
- **Build system:** no Android build has ever been made, and this PC has no Android toolchain. EAS cloud builds remove that need.
- **Physical testing:** no Android device build exists. Recommended: a FORGE Dev APK built in the cloud (`development-release`, added in 8.4B).
- **Play's rules (verified Nov 2026):**
  - target API 36 for new apps and updates from Aug 31, 2026;
  - 16 KB page support since Nov 1, 2025;
  - **new personal developer accounts need a closed test with at least 12 testers for 14 days** before production access;
  - account deletion needs an in-app path and a web URL;
  - Health apps declaration;
  - Data safety form;
  - an App Bundle containing the BILLING permission must be uploaded before subscription products can be created.
- **Behaviour to verify on a device:**
  - rest-alert timing under Doze, with inexact alarms;
  - the notification permission on Android 13 and later;
  - layout on small and tall Android screens;
  - back-button behaviour in the logger.

## 4. Recommended build and distribution architecture (adopted in 8.4B)

- **EAS Build** for iOS and Android, cloud-built, with EAS-managed signing. The local `npm run dev:ios` stays for FORGE Dev.
- **Three identities:**
  - FORGE Dev for development;
  - FORGE Preview for TestFlight and Play internal testing;
  - FORGE for the stores.
- **Remote build numbering** with `autoIncrement` on store profiles.
- **Every build is a commit** (`requireCommit`). Every build checks itself before compiling (the builder check).

Details: [RELEASE.md](../RELEASE.md) §2–§5.

## 5. Environment and production safety

**Findings:**

- **FORGE Preview could name either environment.** A Preview build given production's values would have connected to production. **8.4B:** Preview is locked to FORGE DEV, at runtime and on the builder.
- **No build-time check existed.** EAS environment variables were outside every check. **8.4B:**
  - the builder check refuses wrong, incomplete or secret values, and any project but the pinned one;
  - production builds are locked until approved.
- **The development-client link scheme `exp+forge-fitness` was registered by every app,** so a QR code could open the wrong one. **8.4B:** only FORGE Dev registers it.
- **Shared-storage permissions** were requested though Forge never uses shared storage. **8.4B:** removed (blocked).

**Existing environments, all untouched:**

- Expo Go with the founder's training history (production);
- the standalone FORGE Dev on the iPhone (FORGE DEV);
- the FORGE DEV project;
- the production project.

### Correction (8.4B): Android backups

**The audit's view:** it treated Android Auto Backup as on with Android's default scope (`allowBackup` true, no rules of Forge's own), which could have included the training database.

**What 8.4B found:** `expo-secure-store`'s config plugin (`configureAndroidBackup`, on by default) already replaces the defaults:

- it sets `android:fullBackupContent` and `android:dataExtractionRules`;
- the rule files include only `sharedpref` and exclude the `SecureStore` preferences;
- so the SQLite training database, the food catalogue, files and the sign-in session were already excluded from cloud backup and device transfer.

**8.4B makes this explicit and tested** ([RELEASE.md](../RELEASE.md) §9). Disabling backups wasn't needed.

## 6. Dependencies on Engineer #2 (Phase 9, monetization)

Read from their committed branch (`e9d3e59`) through Git only; nothing of theirs was changed.

**Their plan:**

- RevenueCat (`react-native-purchases` 10.x);
- a Supabase entitlement mirror (`forge_entitlements`);
- note F11: an App Store Connect record for `.dev`;
- Android billing "later".

**Coordination needed:**

- **Android billing:** must ship with iOS.
- **Sandbox app:** which identity carries sandbox purchases.
- **Bundle before products:** Play's "BILLING bundle first" rule.
- **Keys:** RevenueCat keys belong in EAS environments.
- **CocoaPods:** trunk becomes read-only on Dec 2, 2026.

Details: [RELEASE.md](../RELEASE.md) §10.

## 7. Beta release gates

**Rule:** a gate passes only on evidence from the device or build it names. Code or automated tests alone don't pass a gate. "Internal" means TestFlight internal and Play internal testing; "external" means TestFlight external and Play closed testing.

| Gate | Blocks | What passes it | Status (Nov 4, 2026) |
|---|---|---|---|
| **G-SIGN** Build signing and identity | Internal | Signed `preview` builds for both platforms. Each shows FORGE Preview's ID and scheme, and `release:check` passes on the builder | Repository ready (8.4B). No credentials or builds yet |
| **G-ENV** Environment isolation | Internal | On each platform, FORGE Preview signs in to FORGE DEV only. A deliberately wrong build stops on the builder | Automated (8.4B). Device check pending |
| **G-AUTH** Authentication and session recovery | Internal | Sign-in, sign-out, a restart and an expired session on each platform, through `forge-preview:` links | iPhone: FORGE Dev email sign-in only. Android: none |
| **G-OFF** Offline workout persistence | Internal | Logging offline, force-quit and restart keep every set, on each platform | iPhone: founder-verified with FORGE Dev (8.3C), in part. Android: none |
| **G-SYNC** Sync and conflict safety | Internal | After reconnecting, records are in FORGE DEV once, complete. A conflict is presented for review | iPhone: "success" seen (8.3C); completeness not checked. Android: none |
| **G-WORK** Workout reliability | Internal | The 8.3C-3 checklist on each platform: rest cleanup on discard, the invitation, the zero-set safeguard | iPhone: positive founder report, items not individually recorded. Android: none |
| **G-NOTIF** Notification behaviour | Internal | Rest alerts arrive while locked, on time or explainably late. Permission prompts appear only after a tap | iPhone: tests W2, W3 and N1 defined (8.3A), results not yet recorded. Android: none; inexact alarms to assess |
| **G-DEL** Account and data deletion | External | In-app deletion end to end on FORGE DEV; Play's web deletion URL; Apple's revocation | Not run (needs approval, A2). Web URL doesn't exist |
| **G-PRIV** Privacy and security | External | Privacy policy URL; App Privacy answers; Data safety form; no secret in any build (checked) | Builder check in place. Policy and forms don't exist |
| **G-POLICY** Store policy | External (Play: production access) | Target API 36; 16 KB pages; Health apps declaration; content rating; export compliance; Play's 12-tester, 14-day closed test (personal account) | Targets are the defaults; to confirm on the first AAB. Forms not started |
| **G-DIAG** Crash reporting and diagnostics | External (desirable for internal) | A way to see crashes from testers | TestFlight and Play Console show basic crash reports. No in-app reporting; decision §9 |
| **G-A11Y** Accessibility and device layout | External | VoiceOver and TalkBack passes; the largest text; small and tall screens on both platforms | Android: emulator and accessibility-tree audit (7B WP6). iPhone: test X1 defined (8.3A), not yet recorded. No pass on a physical Android phone |
| **G-MON** Monetization compatibility | Launch | Phase 9 purchases work in sandbox on both platforms, without changing the gates above | Engineer #2; coordination §6 |
| **G-PROD** Production readiness | Any production build | Production has the Stage 3 hardening (E7), custom SMTP, the right Site URL and redirect list (no tunnel), Apple revocation and Apple-only deletion handled (7.8E), privacy policy and support contact; then the production pin (RELEASE.md §6) | Not started. Production builds locked |

**Desirable, not blocking an internal beta:**

- the real app icon (C-00b): needed before external testing;
- the Face ID usage text: expo-secure-store adds it by default, though Forge doesn't use biometrics; review in 8.4C;
- blocking `SYSTEM_ALERT_WINDOW`;
- the Expo SDK 58 dependency updates `expo-doctor` reports (open item V5 in [RELEASE.md](../RELEASE.md) §11), a separate approval.

## 8. Phase 8.4 roadmap

| Subphase | Scope | Status |
|---|---|---|
| **8.4A** | Read-only readiness audit and architecture | Done (this record) |
| **8.4B** | Build profiles, identities, environment locks, release checks, Android backup and permission policy, documentation. Repository only | Done (Nov 4, 2026). Final review added the verified EAS upload and build-number behaviour and the open items (RELEASE.md §2, §3, §11) |
| **8.4C-0** | Pre-build safety gate: the `production` profile removed from `eas.json` until 8.4F, with its exact restore documented and tested; the Expo Doctor dependency assessment. Repository only | Done (`f7734fe`, Nov 5, 2026) |
| **8.4C-1 and milestones M1–M6** | SDK 58 alignment and the iOS 27 status bar; iOS Simulator tooling; Android readiness (keyboard fix, guards); store policy checks and the iOS privacy manifest; production and privacy review. Repository only | On `feat/sdk58-alignment` and `feat/phase8-readiness`, not merged; awaiting review and device checks ([completion audit](PHASE_8_4_READINESS_COMPLETION.md)) |
| **8.4C** | iOS beta infrastructure: link EAS, Apple records, credentials, the first `preview` build, TestFlight internal testing | Needs approvals (STORE_SETUP.md §1–§3) |
| **8.4D** | Android beta infrastructure: Play account and records, upload key, the first AAB, internal testing, the FORGE Dev APK on an Android phone | Needs approvals (STORE_SETUP.md §4–§5) |
| **8.4E** | Beta validation and controlled distribution: the gates above on both platforms, release-candidate checks, internal then external testers | After 8.4C and 8.4D |
| **8.4F** | Production readiness: G-PROD on the production backend, legal and store forms, then restoring the `production` profile and pinning production in one reviewed commit (RELEASE.md §6), and the first `production` builds | Founder approval |
| **8.4G** | Store submission: App Review and Play production (after the closed test, for a personal account) | Founder approval |

**Approval boundaries throughout:**

- no store uploads, signing keys, EAS linking, test accounts or production changes without explicit approval;
- Engineer #2's monetization work stays theirs.

## 9. Founder decisions

**Made (Phase 8.4B brief):**

1. **EAS Build** for iOS and Android.
2. **Keep** the local `npm run dev:ios` workflow.
3. **Separate identities** for FORGE, FORGE Dev and FORGE Preview.
4. **FORGE Preview uses FORGE DEV only;** production builds use production only.
5. **iOS and Android** are equal launch requirements.
6. **Managed build numbering** where supported.
7. **No silent fallback** to the wrong backend.
8. **A conservative Android backup policy,** excluding credentials and sensitive data. Selective exclusion proved practical (§5).

**Made (Phase 8.4C-0 brief):** the `production` profile stays out of `eas.json` until production release is approved (8.4F), so EAS CLI can't touch FORGE's build numbers or credentials (RELEASE.md §6).

**Open:**

| Topic | Decision needed | Needed by |
|---|---|---|
| Apple account | Keep the Individual membership (the store shows the founder's name as seller) or move to an Organization (needs a D-U-N-S number) | 8.4C |
| Google Play account | Personal (needs the 12-tester, 14-day closed test) or organization | 8.4D |
| Expo account | Which account owns the EAS project; approval to link (`eas init` adds `owner` and the project ID to `app.json`) | 8.4C |
| Store names | The App Store name and Play title for FORGE (availability unknown); how FORGE Preview is named for testers | 8.4C, 8.4D |
| Credential custody | EAS-managed signing (recommended) or locally held; Play App Signing (recommended); a safe copy of the upload key | 8.4C, 8.4D |
| Test devices | An Android phone (model, Android version); any further iPhones for ad hoc builds | 8.4D |
| Testers and their data | Who tests first; accepting that beta data lives in FORGE DEV and may be reset; tester accounts need approval | 8.4E |
| App icon | The approved 1024×1024 master (C-00b) | Before external testing |
| Crash reporting | Store consoles only, or an in-app reporter (a new dependency and a privacy disclosure) | 8.4E |
| Privacy and legal | Privacy policy URL, support contact, account-deletion web page, Health apps declaration, Data safety and App Privacy answers | External testing |
| Production readiness | When to run G-PROD and pin production | 8.4F |
| Android permissions | Block `SYSTEM_ALERT_WINDOW`; review the merged list after the first AAB | 8.4D |
| Monetization alignment | Android billing at launch; which identity carries sandbox purchases; where RevenueCat keys live | Phase 9, before 8.4E |
| Dependency patches | The Expo SDK 58 updates `expo-doctor` reports (15 patch, including `expo` 58.0.23 and `react-native` 0.88.1, and `react-native-safe-area-context` 5.11.1) before the first store builds, or not (RELEASE.md §11, V5) | 8.4C |
