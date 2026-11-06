# Phase 8.5 M7: Phase 9 integration readiness (read-only)

Read-only analysis of Engineer #2's `feat/phase9-3-revenuecat` worktree on Nov 6, 2026: HEAD `74789a4` plus uncommitted Phase 9.3 work. It was read with `git --no-optional-locks` and by reading files. Nothing in that worktree, or in any shared branch, was changed. Merges were simulated with `git merge-file` on temporary copies.

## 1. Branches

| Branch | Base | Contents |
| --- | --- | --- |
| `feat/phase8-5-forge-hardening` (this) | `d208e4e` (Phase 9.2 onboarding + 8.4C-0) | Merge of `feat/phase8-readiness` (SDK 58 alignment and 8.4 M1–M6, `f82e31b`), then 8.5: M4 `d057730`, M2 `b892b5f`, M3 `f413e1d`, M6 `ac619de` and the documents |
| `feat/phase9-3-revenuecat` (Engineer #2, local only) | `d208e4e` | `b513070` (9.0 audit), `74789a4` (9.1 billing foundation, inactive). Uncommitted 9.3: RevenueCat, membership screens, entitlement functions, sandbox plan |

The merge base is `d208e4e`. Neither branch is merged anywhere; integrating them needs the founder's approval.

## 2. Overlapping files

Only three files change on both sides. The simulated three-way merge of each is **clean**:

| File | This branch | Phase 9.3 | Merge |
| --- | --- | --- | --- |
| `package.json` | SDK 58 alignment: 16 versions, including `react-native` 0.88.0 → 0.88.1, `expo` 58.0.17 → 58.0.23 | Adds `react-native-purchases` 10.16.0 | Clean |
| `package-lock.json` | SDK 58 lock | RevenueCat's packages (`@revenuecat/purchases-js` 1.73.1, `purchases-js-hybrid-mappings` and `purchases-typescript-internal` 19.17.0) | Textually clean, **not proof of a valid lock**: run `npm install`, `npm ci`, `npx expo install --check` and Expo Doctor after merging |
| `src/auth/AppStack.tsx` | The native stack's status bar (8.4C-1) | `membership` and `membership-preview` screens | Clean, in separate hunks |

Phase 9.3 doesn't touch `app.config.ts`, `app.json`, `eas.json`, `scripts/release/` or any file 8.5 changed. 8.5 didn't touch any of Phase 9's files: billing, onboarding, membership, `Preferences.tsx`, `you/account.tsx`, `entry/Setup.tsx`, `cloud/client.ts`, Supabase functions.

## 3. Compatibility

| Item | Finding | Action at integration |
| --- | --- | --- |
| `react-native-purchases` 10.16.0 | Peers: `react-native >= 0.73` (0.88.1 satisfies it) and `react >= 16.6.3`. In the merged lock it resolves against Expo 58.0.23 and React Native 0.88.1 | Expo Doctor and `expo install --check` must stay clean |
| Native module | RevenueCat is native: FORGE Dev must be rebuilt (`npm run dev:ios`), and every EAS build after the merge includes it. In Expo Go, Phase 9.3 uses RevenueCat's Test Store only | Rebuild FORGE Dev; the iPhone checklist after the rebuild |
| Android | The Google Play Billing library (from Maven) adds `com.android.vending.BILLING` when the bundle is built. FORGE's release checks block only shared storage, the microphone and alarm-app permissions, so nothing breaks. Its native code's 16 KB alignment is unverified | If `android-readiness.test.ts` reports a permission from RevenueCat's own manifest, review it for the Data safety answers. Billing's shows only in the built bundle (V6): check the first App Bundle (ANDROID.md A12) |
| iOS | Privacy manifests from every library are gathered (enforced by the release checks), so RevenueCat's is included | App Privacy: add purchase history (founder, with 9.x) |
| Release builds | Phase 9.3 notes that RevenueCat crashes a release-compiled build that carries a Test Store key. Membership runs only in development builds with `EXPO_PUBLIC_FORGE_MEMBERSHIP=development` | Release-check rules, §4 |

## 4. Shared configuration and who owns it

| Area | Owner | Needed at integration |
| --- | --- | --- |
| `app.config.ts`, `eas.json`, `scripts/release/`, build identities | Engineer #1 | **New release-check rules** (Engineer #1, after the merge): refuse a secret key (`sk_`) in any `EXPO_PUBLIC_` variable for every profile; refuse a Test Store key (`EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY`) in `preview` and `production`; keep membership off (`EXPO_PUBLIC_FORGE_MEMBERSHIP` unset) in `production` until approved; extend the bundle scan to look for `sk_` |
| Billing configuration, RevenueCat keys, membership screens, entitlement functions | Engineer #2 | The EAS environment variables for each profile (names only in RELEASE.md §4) |
| Terms of Use and Privacy Policy URLs | Founder (F15), both engineers | One pair of variables (`EXPO_PUBLIC_TERMS_OF_USE_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL`) for the paywall and the in-app privacy link the stores require (8.4 M5) |
| About, in Account & privacy (`src/screens/you/account.tsx`) | Engineer #2's file in Phase 9 | Show `currentBuildLine()` (`src/diagnostics.ts`, 8.5 M6) instead of `FORGE ${version}`: today every build reads "FORGE 1.0.0" |
| Supabase entitlement table and functions | Engineer #2; deploys need the founder | FORGE DEV first; production only with approval |

## 5. Tests at integration

**Automated (all must pass):**

- typecheck, lint, format;
- logic and UI suites, including `billing-*.test.ts` and `membership.test.tsx`;
- `render-cost` and `accessibility-sweep` (8.5): consider adding the membership screens to the sweep;
- `release:check` for every profile, with the new rules (§4);
- both exports, and the bundle scan;
- Expo Doctor and `expo install --check`.

**iOS, sandbox, on FORGE Dev rebuilt:**

1. Buy; restore on a reinstall; restore on a second device with the same account.
2. Cancel in Manage Subscriptions; let it expire (the sandbox accelerates renewals); renew.
3. A refund or revocation through the webhook removes access.
4. Offline launch with a cached entitlement, then reconnect.
5. Sign out and in as another account: no entitlement crosses accounts.
6. Delete the account with an active subscription: what the lifter is told.

**Android:** no approved Google Play product yet, so only the Test Store can be exercised. Play Billing tests (licence testers, internal testing track, purchase, cancel, restore, grace period and account hold) wait for an approved product.

**Entitlements:** the webhook and refresh functions agree with RevenueCat. The client cache expires as designed. A mismatch resolves to the server's answer.

## 6. Risk matrix

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Lock file inconsistent after the textual merge | Medium | Builds fail or resolve unexpected versions | Run `npm install` to regenerate, then `npm ci`, `expo install --check` and Doctor; review only RevenueCat and Expo entries changing | Integrator |
| R2 | A release build carries a Test Store key and crashes | Low (runtime refuses it) | A crash on launch for testers | Release-check rule (§4) before any Phase 9 EAS build | Engineer #1 |
| R3 | A secret key in the client bundle | Low | Credential exposure | Runtime refusal (9.3) plus release-check and bundle-scan rules | Both |
| R4 | FORGE Dev not rebuilt after the merge | Medium | The native module is missing and membership fails on the iPhone | Rebuild with `dev:ios`; checklist | Founder, Engineer #1 |
| R5 | RevenueCat's Android library fails 16 KB or adds permissions unseen | Low | Play rejects the bundle, or the Data safety answers are wrong | Check the first bundle (A12) | Engineer #1 |
| R6 | Two privacy-policy links diverge (paywall and settings) | Medium | A store review finding | One pair of variables (§4) | Both |
| R7 | Phase 9 screens edited while 8.5 changes land | Low (no overlap today) | Merge conflicts | 8.5 left Phase 9 files untouched; About change handed over (§4) | Both |
