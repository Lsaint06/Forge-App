# Phase 8.5 M5: TestFlight and Google Play readiness

Branch `feat/phase8-5-forge-hardening`. An update of the Phase 8.4 matrix ([completion audit](PHASE_8_4_READINESS_COMPLETION.md) §2) for 8.5. The founder's steps are in [STORE_SETUP.md](../STORE_SETUP.md), builds and checks in [RELEASE.md](../RELEASE.md); neither is repeated here.

**Nothing external was done:** no EAS link, signing credential, store record, upload or production change. The production profile is still absent from `eas.json`. Verified again: `release:check --profile production` refuses; `preview` and `development-release` pass; preview bundles carry no production address or key.

## 1. iOS: FORGE Preview to TestFlight

| Item | Status | Evidence or what's needed |
| --- | --- | --- |
| Bundle IDs (`com.lsaint06.forge`, `.dev`, `.preview`), link schemes | **Ready** | `app-variants`, `release-check` tests |
| Versions and build numbers | **Ready**; EAS's counter **awaiting external setup** | Store version in the config; build numbers from EAS (RELEASE.md §3) |
| EAS profiles | **Ready** | `development`, `development-simulator`, `development-release`, `preview`; production locked (8.4C-0) |
| Preview on FORGE DEV only | **Ready**; on a device **requires native verification** | Release check, bundle scan; G-ENV on the first build |
| Entitlements | **Ready** | Sign in with Apple's entitlement from `expo-apple-authentication` |
| Signing | **Awaiting external setup** | Apple Developer account; EAS-managed credentials (STORE_SETUP.md §3) |
| App icon | **Missing** | C-00b: needed before external testers and the store listing |
| Launch screen | **Ready**; **requires native verification** | Splash configured; the status-bar polish D-P4 |
| Privacy manifest | **Ready**; **requires native verification** | Gathered from every library (release check); confirm on the first upload |
| Privacy policy and its in-app link | **Missing** | D-P1. Phase 9 adds `EXPO_PUBLIC_PRIVACY_POLICY_URL`: use one for both (PHASE_8_5_PHASE9_INTEGRATION.md §4) |
| Support contact | **Missing** | A real address for `EXPO_PUBLIC_SUPPORT_EMAIL`; until then none is shown |
| Account deletion | Implemented; **missing** for the App Store | Apple-only account deletion and revocation (E8, D3) |
| Diagnostics | **Ready** (local) | Build line and failure codes on Recovery (8.5 M6); crash reporting is a decision (PHASE_8_5_DIAGNOSTICS.md) |
| Membership | **Awaiting monetization integration** | Phase 9.3 runs only in development builds |
| The app on iOS 27 and the iPhone after SDK 58 | **Requires native verification** | FORGE_DEV_SDK58_CHECKLIST.md |

## 2. Android: FORGE Preview to Google Play internal testing

| Item | Status | Evidence or what's needed |
| --- | --- | --- |
| Package names | **Ready** | Same tests as iOS |
| Version codes | **Ready**; EAS's counter **awaiting external setup** | RELEASE.md §3 |
| App Bundle | **Awaiting external setup** | EAS build of `preview` (RELEASE.md §8) |
| Target SDK | **Ready** | API 36, compile 37 (`android-readiness.test.ts`) |
| Permissions | **Ready**; Maven libraries' **require native verification** | Four in the manifest; shared storage, microphone and alarm-app permissions blocked (tests); V6 |
| 16 KB pages | Libraries in `node_modules` **ready**; Maven libraries **require native verification** | ANDROID.md §1, A12 |
| Upload key | **Awaiting external setup** | EAS-held; creating it needs approval (STORE_SETUP.md §5) |
| Backups | **Ready** | Sign-in kept out of backups (`app-variants`) |
| Play forms | **Awaiting external setup** | Data safety, health apps declaration, content rating, web deletion page; a 12-tester closed test if the account is personal |
| Notifications | **Missing** (decisions) | D-A1 timing, D-A2 visibility (ANDROID.md §4) |
| Large screens | **Missing** (decision) | D-A3 |
| Billing | **Awaiting monetization integration** | No approved Play product; Phase 9.3 uses the Test Store only |
| Everything on screen | **Requires native verification** | No build has run (PHASE_8_5_ANDROID_VALIDATION.md) |

## 3. The founder's checklist

### Can be done now

1. **Approve the first builds:**
   - link EAS (STORE_SETUP.md §1–2);
   - Apple credentials through EAS (§3);
   - the Android upload key (§5);
   - Android: EAS builds, or the tooling on this PC (PHASE_8_5_ANDROID_VALIDATION.md §4).
2. **Apple:** Developer membership; App Store Connect records for FORGE Preview and FORGE (§3); internal testers (§6).
3. **Google Play:** developer account; the app records; internal testing track and testers (§4, §6).
4. **Write and host:** the privacy policy and support address (D-P1), and the web account-deletion page.
5. **Decide:**
   - D-A1 to D-A5 (Android);
   - D-P2 (crash reporting, PHASE_8_5_DIAGNOSTICS.md);
   - D-P3 and D-P4;
   - P3-1 (placeholder contrast, PHASE_8_5_UI_QA.md).
6. **Commission the app icon** (C-00b).
7. **Run the FORGE Dev checklists** on the iPhone: SDK 58, M2's logger speed, M3's Set Details target, M6's recovery details.

### Waits for Phase 9 (monetization)

1. In-app purchase products and RevenueCat projects, App Store first, Play when approved (Engineer #2).
2. The Terms of Use URL (F15), shared with the privacy policy link.
3. Store privacy answers for purchase history (both stores).
4. Integration: the merge and the new release-check rules (PHASE_8_5_PHASE9_INTEGRATION.md).
