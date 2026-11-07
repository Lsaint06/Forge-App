# Phase 9.5: the Phase 9.3 checkpoint and its integration handoff

From Engineer #2 (onboarding and monetization) to Engineer #1 (core integration), 7 November 2026. The founder reviewed it and authorized the checkpoint (§7) and its push that day. **Nothing has been merged into another branch or deployed.**

Read it with Engineer #1's package:
- **His M7 analysis:** `docs/audits/PHASE_8_5_PHASE9_INTEGRATION.md`, at `dcd6f63`.
- **His Phase 9.5 drafts** (in his checkout, uncommitted when this was written):
  - `docs/SHARED_CONTRACTS.md`, the contracts between the two tracks;
  - `docs/audits/PHASE_9_5_INTEGRATION_READINESS.md`, his integration plan.

His rehearsal merged this worktree as it stood at 01:29. §4.2 repeats it on the checkpoint's final content. §6.6 follows his plan, and §10 answers his eleven questions in the handoff format he proposed.

## 1. Where the work is

| | |
| --- | --- |
| Branch | `feat/phase9-3-revenuecat`, published to `origin` as a new branch with the checkpoint, never force-pushed |
| Worktree | `C:\Users\LStAm\source\repos\Forge-App.worktrees\forge-phase9-3-revenuecat` |
| Base | `d208e4e`, the Phase 9.2 integration (`origin/integration/phase9-2-premium-onboarding`) |
| `b513070` | Phase 9.0: the subscription audit and Windows handoff. Same patch as `a3935e4` |
| `74789a4` | Phase 9.1: the subscription foundation, inactive. Same patch as `e9d3e59` |
| The checkpoint | Phase 9.3, its Phase 9.5 fixes and this handoff: three commits on `74789a4`, 50 files (24 changed, 26 new; §7). The last one adds this file |
| Engineer #1 | `feat/phase8-5-forge-hardening` at `dcd6f63`: 18 commits on the same base, `d208e4e` |

`agents/forge-phase9-agent-init-check` (`5d37c4f`) is superseded. Its Phase 9.2 work reached `d208e4e` as `3ef77dc`, and its 9.0 and 9.1 commits are re-applied here with identical patches. **Integrate from this branch only.** That branch's worktree (`forge-phase9-new`) still holds an unfinished merge of `5f07c9b` (Phase 8.2, already in the base). It holds nothing unique, and is left untouched for the founder to decide (§10, Q10).

## 2. Scope (deliverable A)

**Phase 9.1, committed in `74789a4`:**

| Area | Files |
| --- | --- |
| The access decision | `src/billing/access.ts`, `src/billing/entitlement.ts` |
| The per-account cache | `src/billing/cache.ts`, `src/billing/secure-cache.ts` |
| Contracts and the approved plan | `src/billing/provider.ts`, `src/billing/plan.ts` |
| Flows through Forge's server | `src/billing/service.ts` |
| The server record (drafts, deployed nowhere) | `supabase/drafts/forge_entitlements.sql`, `forge_entitlements_checks.sql`, `forge_entitlements_rollback.sql`; `supabase/functions/_shared/entitlement.ts` |
| Tests | `tests/billing-access`, `-cache`, `-entitlement`, `-service`, `-server`, `-schema` and `-safety.test.ts`; `tests/billing-fixture.ts` |

**Phase 9.3, to be checkpointed:**

| Area | Files |
| --- | --- |
| RevenueCat and the development-only gate | `src/billing/config.ts`, `offer.ts`, `paywall.ts`, `revenuecat.ts`, `runtime.ts`, `verifier.ts`; additions to `provider.ts` and `plan.ts`; `followAccount` in `service.ts`; `react-native-purchases` in `package.json` and `package-lock.json`; variable names in `.env.forge-dev.example` |
| Forge Premium (V3) | `src/screens/membership/`: `Premium.tsx`, `Paywall.tsx`, `MembershipScreen.tsx`, `Preview.tsx`, `StatusCard.tsx`, `usePaywall.ts`; `src/domain/onboarding/premium.ts` |
| Onboarding | `src/screens/onboarding/week.tsx` (new), `Reveal.tsx`, `Flow.tsx`, `Preview.tsx`; `src/domain/onboarding/reveal.ts`, `journey.ts`; `src/screens/entry/Setup.tsx` |
| Routes and settings | `app/membership.tsx`, `app/membership-preview.tsx`, `app/onboarding-preview.tsx`; `src/auth/AppStack.tsx`; `src/screens/Preferences.tsx` (development rows); `src/screens/you/account.tsx` (the membership card) |
| Edge Functions (drafts, deployed nowhere) | `supabase/functions/entitlement-refresh/`, `entitlement-webhook/`, `_shared/reconcile.ts`, `_shared/rest.ts` |
| Tests | New: `tests/billing-membership.test.ts`, `tests/billing-functions.test.ts`, `tests/ui/membership.test.tsx`, `tests/ui/premium-dock.test.tsx`. Changed: `tests/billing-fixture.ts`, `tests/billing-safety.test.ts`, `tests/onboarding-journey.test.ts`, `tests/ui/onboarding-flow.test.tsx` |
| Docs | [`SUBSCRIPTIONS.md`](../SUBSCRIPTIONS.md), [`ONBOARDING.md`](../ONBOARDING.md), [`PHASE_9_3_SANDBOX.md`](PHASE_9_3_SANDBOX.md), [`PHASE_9_WINDOWS_HANDOFF.md`](PHASE_9_WINDOWS_HANDOFF.md), `IMPLEMENTATION_STATUS.md`, this file |

Membership runs only in a development build that opts in. Every other build, production included, behaves as before:
- the purchase SDK's code never runs (`runtime.ts` loads it only when membership runs, although its native module is linked into every native build);
- no paywall shows;
- nothing is sold.

The behaviour in full is in [`SUBSCRIPTIONS.md`](../SUBSCRIPTIONS.md#phase-93-forge-premium-in-development-builds).

## 3. The approved paywall (deliverable B)

The founder approved Forge Premium V3 and wrote the final words of its four tiles. Its composition, words and motion are protected: any visible change needs the founder.

1. **The invitation:** the FORGE wordmark over PREMIUM. The headline is **ALL 8 WEEKS / ALL OF FORGE**, with the path's length in Forge's ember. It reads **EVERY WEEK / ALL OF FORGE** for an ongoing path, and **ONE MEMBERSHIP / ALL OF FORGE** without one (You → Account). Under it: "Your Forge Path is ready. Forge Premium carries it from the first set to the last."
2. **The pass:**
   - "Built for Jordan", the program's family ("Intermediate Strength") and "4 days a week · 32 sessions · Sunday rest";
   - each training day with its focus and its number of exercises;
   - "Every exercise, set and rep comes with Forge Premium".
3. **Included in Forge Premium**, final words:

   | Title | Sentence |
   | --- | --- |
   | Personalized Training | Programs tailored to your goals, experience, and schedule. |
   | Workout Tracking | Log sets, monitor performance, and track every workout. |
   | Performance Analytics | Visualize strength progression, personal records, and training consistency. |
   | Nutrition Tracking | Track calories and macronutrients with an extensive food database. |

4. **Your membership:** "Every Forge Path and every tool, in one plan. Cancel anytime. Your training always stays yours." Then:
   - the brushed-steel plan card: Forge Premium, Monthly, "Renews monthly · cancel anytime", the store's price at 36 pt and "per month";
   - **7 DAYS FREE** and the free-week timeline, only when Apple says the account is eligible;
   - **Start free trial**, or **Subscribe** without the free week;
   - **Not now · Restore · Terms · Privacy**;
   - the terms in full.
5. **Also part of the approved design:**
   - the floating action and its hand-over on scroll;
   - every state;
   - the molten-to-steel confirmation;
   - the transition from the reveal;
   - Home's arrival card;
   - the development previews.

**The content boundary** (founder rule): before a membership, the reveal and the pass show only each training day, its focus and its number of exercises. They never show an exercise, set, rep, RIR or prescription. Three tests enforce it:

| Test | What it proves |
| --- | --- |
| `tests/onboarding-journey.test.ts`: "before a membership, each training day shows its focus and size only…" | Every program and every rest day |
| `tests/ui/onboarding-flow.test.tsx`: "every one of the 18 published programs is revealed by its shape…" | The rendered reveal has no catalogue exercise name, ×, RIR, set or rep |
| `tests/ui/membership.test.tsx`: "the pass never shows an exercise, set or rep…" | The rendered pass, for all 18 programs |

The approved words are pinned in the rendered paywall by `tests/ui/membership.test.tsx`: "the store's price is the most prominent price…". The design lives in:
- `src/screens/membership/Premium.tsx` and `Paywall.tsx`;
- `src/screens/onboarding/week.tsx`;
- `src/domain/onboarding/premium.ts`.

## 4. Verification (deliverable C)

### 4.1 The checkpoint (this worktree)

The checkpoint's content, checked in the worktree on 7 November 2026 before it was committed (Windows, Node 24):

| Check | Result |
| --- | --- |
| Typecheck (`npm run typecheck`) | Passes |
| ESLint (`npm run lint`) | 0 errors. One warning was already there, in `tests/ui/templates-wp3.test.tsx`, which Phase 9 doesn't touch |
| Prettier (`app`, `src` and `tests`, then `supabase/functions`) | Passes |
| Node tests (`npm test`) | 1,012 tests: 1,010 passed, 0 failed, 2 skipped. The skipped two need POSIX signals, which Windows lacks; that is pre-existing |
| UI tests (`npm run test:ui`) | 865 of 865 passed, in 81 suites |
| Exports (`npm run export`) | iOS and Android both bundle |
| `npm run release:check` | Development and preview pass with `--allow-dirty`. Without it, the only failure is "uncommitted changes", which the checkpoint removes. Production stays locked by design (Phase 8.4F) |
| Expo Doctor | 19 of 20. The one failure is the base's SDK 58 version drift, which Engineer #1's `5760abd` fixes: 20 of 20 merged (§4.2) |
| Secrets | None. Of the 50 files, 10 lines hold key-shaped strings, all fakes in the tests (such as `appl_AbCdEfGh…` and `sb_secret_test…`). The only local `.env` value present is the word `development`. No conflict markers, no debug leftovers |

**Each commit on its own** (§7). Each commit's exact tree was built from a temporary index into a disposable folder, with the locally built food catalogue, and checked there before it was committed:
- **Commit 1** (tree `9c74dd0`): typecheck passes; Node 974 tests (972 passed, 0 failed, 2 skipped); UI 837 of 837, in 79 suites.
- **Commit 2** (tree `5c80e5b`): typecheck passes; Node 1,012 tests (1,010 passed, 0 failed, 2 skipped); UI 865 of 865, in 81 suites.
- **Commit 3** adds only documents, which no test reads.

### 4.2 Integrated with Engineer #1's hardening (dry run)

**How the dry run was built:**
1. The checkpoint's tree became an unreferenced commit object. No branch, index or worktree changed.
2. `git merge-tree` merged it with `dcd6f63`.
3. The result was written to a disposable folder with its own `npm ci`.
4. Every check ran there.
5. The folder was deleted afterwards.

| Check | Result |
| --- | --- |
| `git merge-tree --write-tree` with `dcd6f63` | No conflicts. Candidate tree `692c625`, merged tree `9e82ee6` |
| `npm ci` | Accepts the merged lock |
| `npx expo install --check` | "Dependencies are up to date" |
| Expo Doctor | 20 of 20 |
| Typecheck, ESLint, Prettier | Pass. ESLint: 0 errors, and the same single warning |
| Node tests | 1,044 tests: 1,042 passed, 0 failed, 2 skipped (POSIX signals) |
| UI tests | 893 of 893 passed, in 85 suites |
| Exports | iOS and Android both bundle (Hermes, about 10 MB each) |
| `release:check`, committed (no `--allow-dirty`) | Development and preview pass. Production stays locked by design |

The extra 32 Node tests and 28 UI tests are Engineer #1's hardening suites, all passing beside membership's.

**Findings:**
- The merge has no conflicts. The three files both tracks change (`package.json`, `package-lock.json` and `src/auth/AppStack.tsx`) merge in separate hunks.
- The textually merged lock is valid: `npm ci` refuses an out-of-sync lock, and it accepted this one. Engineer #1's first risk (R1) is therefore answered.
- One release-check test runs `git ls-files`, so it needs a git checkout. In the dry-run folder it was run inside a throwaway repository.
- The documents edited after this run, this file's results among them, change no test. The checkpoint's final tree differs from `692c625` only in documents.

### 4.3 Review and fixes

An independent, read-only review of the Phase 9.1 and 9.3 billing code found no blocker and no major issue. It confirmed the following line by line:
- access comes only from Forge's server;
- RevenueCat's App User ID is the Supabase user ID;
- the cache is per account and never answers for another account;
- `entitlement-refresh` acts only for the caller's own token;
- the webhook checks its header, its HMAC and its time, and processes each delivery once;
- no secret reaches the app or the logs.

Three defects were fixed on 7 November, each with a test that failed before the fix. The third was found by Engineer #1's review (his Q11).

| | Defect | Fix | Test |
| --- | --- | --- | --- |
| F1 | Arriving from the reveal, the floating action could be pressed for about 0.9 s while still invisible. A second tap on **Continue** could land on **Not now**, skipping Forge Premium, or on **Start free trial** | It can be pressed only once it has appeared, and not once it starts to step aside. Nothing visible changed | `tests/ui/premium-dock.test.tsx` |
| Identity race | A sign-out landing during a slow RevenueCat log-in could leave the SDK anonymous while the adapter still remembered the account. A later purchase by that account would then go to an anonymous customer | `identify` always compares the SDK's own App User ID, a local call, before every purchase and restore | `tests/billing-membership.test.ts`: "a sign-out during a slow sign-in…" |
| Account transitions (Q11) | Each change of account started its own task. An answer the server sent for an account that had just signed out was saved after the sign-out had forgotten it. A slow RevenueCat log-in could finish after the next account's, leaving the store on the wrong customer | `followAccount` (`service.ts`): this phone forgets the account that left at once, and the store's log-out and log-in take turns. The server is asked outside the turns, and an answer for an account that has gone isn't kept. `watchMembershipSession` only passes it each account the session reports | `tests/billing-membership.test.ts`: "signing out or switching while the server answers…" and "the store's log-out and log-in take turns…" |

The final verification also caught a lint error (`react-hooks/set-state-in-effect`) in the first version of the F1 fix. That state is now adjusted while rendering, as React recommends, and the same tests pass.

Known and not fixed (deliberately, for Phase 9.4): see §8, "Known issues".

**Coverage.** Every scenario the founder listed for Phase 9.5 has an automated test:
- onboarding: new user, generation, reveal, boundary, Premium after the reveal, Not now, returning users, membership off, Home's arrival;
- membership: loading (added on 7 November), unavailable, eligible, ineligible, started, cancelled, pending, unconfirmed, confirmed, restore found, restore none, restore failure, refresh, identity isolation, expiry, cancellation, refund and grace, and the webhook and refresh authorization.

### 4.4 Limits of this verification

- **No real purchase of any kind has run:** none on the App Store or its sandbox, none through RevenueCat (not even its Test Store) and none on Google Play.
- **Backend:** the Edge Functions and the entitlement SQL have run only against PGlite, with RevenueCat faked. They are deployed nowhere.
- **Visual checks:**
  - V3 was checked on the Android emulator in Expo Go on 6 November.
  - The final tile words and their row alignment are checked by UI tests only, because the emulator's FORGE DEV sign-in has expired.
  - The founder reviewed on an iPhone in Expo Go. I hold no iPhone capture.
- **Expo Go can't use StoreKit:** it never shows Apple's sheet or a real free-week eligibility.

## 5. Real versus simulated (deliverable D)

✅ done · ✗ not yet · — not applicable.

| Membership feature | Code and automated tests | Android emulator (Expo Go) | iPhone | Live store or backend | Still needed to prove it live |
| --- | --- | --- | --- | --- | --- |
| V3 paywall: words, motion, states (previews) | ✅ | ✅ 6 Nov. The 7 Nov words: tests only | Founder's review (Expo Go) | — | — |
| Reveal → Premium → Home; the content boundary | ✅ (18 programs) | ✅ recorded | Founder's review | — | — |
| Membership off outside opted-in development builds | ✅ | ✅ | — | — | Release-check rules (§6.6) |
| RevenueCat configure and identity (App User ID = Supabase user) | ✅ fake SDK | ✗ | ✗ | ✗ | Native development build; RevenueCat project |
| Offering, monthly package, product check | ✅ fake SDK | ✗ | ✗ | ✗ | RevenueCat offering; App Store Connect product (F16) |
| Free-week eligibility | ✅ fake SDK | ✗ (Expo Go can't) | ✗ | ✗ | Native build; App Store sandbox |
| Purchase: started, cancelled, pending, errors | ✅ | Simulated only | Simulated only | ✗ | Native build; sandbox; FORGE DEV backend |
| Server confirmation (`entitlement-refresh`, `forge_entitlement()`) | ✅ PGlite and fakes | ✗ | ✗ | ✗ | FORGE DEV deployment; RevenueCat secret key |
| Restore: found, none, failure, another account | ✅ | Simulated only | Simulated only | ✗ | Sandbox; F3 |
| Renewal, cancellation, expiry, refund, billing retry and grace | ✅ (access decision) | — | — | ✗ | Sandbox renewals; the webhook; F7 |
| Webhook: header, HMAC, freshness, replay, transfers | ✅ PGlite and signed fakes | — | — | ✗ | RevenueCat webhook to FORGE DEV |
| Per-account cache, switching accounts, sign-out, offline | ✅ | ✗ | ✗ | ✗ | Native build; sandbox script steps 7–8 |
| You → Account card; Manage subscription | ✅ | ✅ with membership off | ✗ | ✗ | Native build (Apple's sheet) |
| RevenueCat Test Store in Expo Go | ✅ adapter | ✗ (no test key yet) | ✗ | ✗ | A Test Store key (sells nothing) |
| Google Play purchases | ✗ Not implemented: a Google key and Play's product format are refused | — | — | ✗ | Founder decision; Play product; internal testing |
| The gate after expiry; expired screens; the revealed path after a purchase (F14); complimentary access (F12) | ✗ Not implemented (Phase 9.4 and later) | — | — | ✗ | Phase 9.4; founder decisions |

**Phase 9.3 is implemented and automated-test verified. It is not live-verified:** no real store test has run.

## 6. Integration contract (deliverable E)

### 6.1 Dependencies and native configuration

- **`react-native-purchases` 10.16.0, pinned exactly.** Do not use `^`, and do not move to 11.x: 11.0.1's iOS pod wasn't on the CocoaPods CDN, and RevenueCat advises Expo apps to stay on 10.x. The lock adds `@revenuecat/purchases-js`, `purchases-js-hybrid-mappings` and `purchases-typescript-internal`.
- **No configuration plugin,** and no change to `app.config.ts`, `app.json` or `eas.json`: autolinking adds the native module.
  - Every native build after the merge carries it.
  - **FORGE Dev must be rebuilt** before membership can run on the iPhone.
- **iOS:** RevenueCat's pod brings its own privacy manifest at build time. None ships in `node_modules`, so `tests/ios-privacy.test.ts` is unaffected. App Privacy needs Purchases → Purchase History.
- **Android:** Play Billing adds `com.android.vending.BILLING` to the built bundle only. RevenueCat's package declares no permission, so `tests/android-readiness.test.ts` is unaffected. Data safety needs Financial info → Purchase history.

### 6.2 Environment variables (names only)

**The app** (`EXPO_PUBLIC_`; public by nature):

| Variable | Use |
| --- | --- |
| `EXPO_PUBLIC_FORGE_ENV` (existing) | Must be `development` for membership to run |
| `EXPO_PUBLIC_FORGE_MEMBERSHIP` | `development` opts a development build in. Leave it unset everywhere else |
| `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` | `appl_`: FORGE Dev's App Store app (sandbox) |
| `EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY` | `test_`: RevenueCat's Test Store (Expo Go and debug builds; it sells nothing) |
| `EXPO_PUBLIC_TERMS_OF_USE_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL` | HTTPS only (F15) |

**The Edge Functions** (Supabase secrets, never in the app):

| Variable | Use |
| --- | --- |
| `REVENUECAT_SECRET_API_KEY` | Reads subscribers from RevenueCat |
| `FORGE_ENVIRONMENT` | `development` or `production` |
| `FORGE_MEMBERSHIP_PRODUCT_IDS` | The approved product (F16) |
| `REVENUECAT_WEBHOOK_AUTHORIZATION`, `REVENUECAT_WEBHOOK_SIGNING_SECRET` | The webhook only |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS` | Set by Supabase. The legacy `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are fallbacks |

A secret key (`sk_`, `sb_secret_`) must never be in an `EXPO_PUBLIC_` variable. The runtime already refuses a RevenueCat secret key.

### 6.3 Routes and the onboarding seam

| Route or seam | Behaviour |
| --- | --- |
| `/membership` (the ready group) | You → Account's Forge Premium. Without membership it says "Not in this build" |
| `/membership-preview` (the ready group; `__DEV__` only) | Every state: `?state=<name>`, plus `path=none` for You → Account's version |
| `/onboarding-preview?premium=1` | The whole first-time journey with the simulated step after the reveal |
| `src/auth/AppStack.tsx` | The two screens sit beside Engineer #1's `statusBarStyle` |
| `Setup.tsx` | Hands `membershipStep(userId)` to `SetupOnboarding` only when `membershipEnabled()`. Without it, the reveal ends with **Enter Forge** exactly as in Phase 9.2 |

### 6.4 Shared interfaces

| Interface | Contract |
| --- | --- |
| Supabase identity → RevenueCat | The App User ID is the Supabase `auth.users` ID. `watchMembershipSession()` (`runtime.ts`) passes each account Supabase's `onAuthStateChange` reports to `followAccount()` (`service.ts`). A sign-out or an account switch forgets the previous account on this phone at once, and in RevenueCat in its turn, before the next one is bound |
| Entitlement state | Access comes only from `forge_entitlement()` (refreshed through `entitlement-refresh`), decided by `access.ts` with server-anchored time. It is cached per account in SecureStore and never taken from the store's own answer |
| Membership lifecycle | `PaywallState` in `src/billing/paywall.ts`: loading, unavailable, ready, busy (purchasing, restoring, verifying), pending, unconfirmed, member |
| Navigation after onboarding | The reveal leads to Forge Premium (with membership), then `store.finish`, then `router.replace("/(tabs)")`. Home shows the arrival card |
| Persistence | Only the local onboarding record gains the `membership` stage. Membership code never reaches training data (`tests/billing-safety.test.ts`) |
| Feature flag | `membershipEnabled()` = `__DEV__`, `EXPO_PUBLIC_FORGE_ENV=development` and `EXPO_PUBLIC_FORGE_MEMBERSHIP=development`. A release build can't opt in |

### 6.5 Where the hardening meets membership

| Engineer #1's change | Effect on Phase 9.3 | Rule |
| --- | --- | --- |
| SDK 58 alignment (`5760abd`) | `package.json` and the lock merge cleanly. Combined: `npm ci`, `expo install --check` and Expo Doctor (20/20) all pass | Keep Engineer #1's versions and add `react-native-purchases` 10.16.0 |
| The native stack's status bar (`a08dfd0`, `AppStack.tsx`) | Separate hunks. The membership screens inherit `statusBarStyle` | Keep both |
| Offline sign-in restore (`07893b9`, `session.ts`) | RevenueCat identity follows Supabase's own auth events, not the stored offline user. Offline, the paywall says so and grants nothing | Never route RevenueCat's log-in through `storedUser()` |
| Store policy checks and the privacy manifest (`e5baa6e`) | The combined application passes `release:check` for development and preview | Add the key rules (§6.6) |
| Diagnostics (`ac619de`) | `currentBuildLine()` exists only on Engineer #1's branch | Use it in `account.tsx` after the merge (§6.6) |
| Accessibility sweep and render cost (`f413e1d`, `b892b5f`) | The membership screens aren't included. They have their own accessibility tests | Optionally add them after the merge |
| `Home.tsx` performance work (`b892b5f`) | The arrival card (`ForgePathArrival`) is kept | Keep it |
| `EntryFrame`, `Screen`, `SubScreen`, `ui.tsx` | No signature the membership screens use has changed | — |

### 6.6 Reconciliation rules (proposed)

1. **Engineer #1's plan** (his readiness document, §G):
   - a new integration branch from `d208e4e`;
   - his `dcd6f63` merged first, then this checkpoint, each a normal `--no-ff` merge;
   - no rebase, squash or force-push of either track.
2. **Phase 9.3 keeps its version** of everything below. A conflict there goes to Engineer #2:
   - `src/billing/`, `src/screens/membership/`, `src/screens/onboarding/` and `src/domain/onboarding/`;
   - `app/membership.tsx`, `app/membership-preview.tsx` and `app/onboarding-preview.tsx`;
   - `supabase/functions/` and `supabase/drafts/`;
   - `tests/billing-*`, `tests/ui/membership.test.tsx` and `tests/ui/premium-dock.test.tsx`;
   - `docs/SUBSCRIPTIONS.md` and `docs/ONBOARDING.md`.
3. **Engineer #1 keeps his version** of:
   - package versions (except `react-native-purchases`);
   - `app.config.ts`, `app.json` and `eas.json`;
   - `scripts/` and the release documents;
   - `src/auth/session.ts`;
   - diagnostics, the status bar, the logger and data.
4. **`package-lock.json`, as in Engineer #1's policy:** never edited by hand.
   - Keep the integration branch's lock (his), then run `npm install`.
   - Check that only RevenueCat's four packages differ from `dcd6f63`.
   - Both rehearsals agree: `npm ci` accepted the textual merge, and his `npm install` changed nothing.
5. **Never weaken** the content-boundary tests, the approved-words test or `billing-safety`. A failure there is a regression to fix, not a test to update.

**Engineer #1's requests (his M7 audit, §3–§5), answered:**

| Request | Answer |
| --- | --- |
| Release-check rules: refuse `sk_` in any `EXPO_PUBLIC_` variable; refuse the Test Store key in preview and production; keep membership off in production; scan the bundle for `sk_` | Agreed. Engineer #1 owns `scripts/release/`; Engineer #2 reviews. The runtime already refuses `sk_`, and refuses a Test Store key outside development builds |
| The About line in `account.tsx` should show `currentBuildLine()` | Agreed, after the merge: `src/diagnostics.ts` exists only on Engineer #1's branch, and copying it here would duplicate it. A one-line change: mine, reviewed by Engineer #1 (§10, Q7) |
| One pair of legal URL variables, for the paywall and the store-required privacy link | Agreed: `EXPO_PUBLIC_TERMS_OF_USE_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL`. The values are F15 |
| Add the membership screens to the accessibility sweep | Agreed, after the merge |

### 6.7 After the merge

1. Install and check dependencies: `npm ci`, `npx expo install --check` and `npx expo-doctor`.
2. Run the code checks: `npm run typecheck`, `npm run lint` and `npm run format:check`.
3. Run the test suites: `npm test` and `npm run test:ui`. Expect at least the dry run's counts (§4.2) with no failure.
4. Run `npm run export` and `npm run release:check -- --profile development`, then `preview`.
5. Rebuild FORGE Dev so the native module is present, then run the iPhone checklist.

## 7. The checkpoint (deliverable F)

The checkpoint is three commits on `feat/phase9-3-revenuecat`, in this order. Together they hold the 50 files exactly. Each state passes typecheck and both test suites (§4.1).

**1. `feat(billing): membership Edge Functions, deployed nowhere (Phase 9.3)`**, 8 files:
- `src/billing/plan.ts` and `src/billing/provider.ts` (the contract's additions);
- `supabase/functions/_shared/reconcile.ts` and `_shared/rest.ts`;
- `supabase/functions/entitlement-refresh/index.ts` and `entitlement-webhook/index.ts`;
- `tests/billing-fixture.ts` and `tests/billing-functions.test.ts`.

**2. `feat(billing): Forge Premium, development builds only (Phase 9.3)`**, 36 files:
- **Dependencies and variable names:** `package.json`, `package-lock.json` and `.env.forge-dev.example`.
- **Routes:**
  - `app/membership.tsx`, `app/membership-preview.tsx` and `app/onboarding-preview.tsx`;
  - `src/auth/AppStack.tsx`.
- **RevenueCat:**
  - `src/billing/config.ts`, `offer.ts`, `paywall.ts`, `revenuecat.ts`, `runtime.ts` and `verifier.ts`;
  - `src/billing/service.ts` (the account follower).
- **Forge Premium:**
  - the six files in `src/screens/membership/`;
  - `src/domain/onboarding/premium.ts`.
- **Onboarding:**
  - `src/domain/onboarding/journey.ts` and `reveal.ts`;
  - `src/screens/onboarding/Flow.tsx`, `Preview.tsx`, `Reveal.tsx` and `week.tsx`;
  - `src/screens/entry/Setup.tsx`.
- **Settings:** `src/screens/Preferences.tsx` and `src/screens/you/account.tsx`.
- **Tests:**
  - `tests/billing-membership.test.ts`, `tests/billing-safety.test.ts` and `tests/onboarding-journey.test.ts`;
  - `tests/ui/membership.test.tsx`, `tests/ui/onboarding-flow.test.tsx` and `tests/ui/premium-dock.test.tsx`.

**3. `docs: Forge Premium (Phase 9.3) and its integration handoff (Phase 9.5)`**, 6 files:
- `docs/SUBSCRIPTIONS.md` and `docs/ONBOARDING.md`;
- `docs/execution/PHASE_9_3_SANDBOX.md`, `PHASE_9_WINDOWS_HANDOFF.md` and this file;
- `IMPLEMENTATION_STATUS.md`.

**Why this split:**
- Commit 1 is the server side and the contract: it can be reviewed, and passes, alone.
- Commit 2 can't be split further: `tests/billing-safety.test.ts` ties `runtime.ts` to the screens that use it.
- No test reads the documents in commit 3.

**Authorized by the founder on 7 November:**
1. The three commits, each one's exact state checked before it was committed (§4.1).
2. The checks, re-run on the last commit.
3. The branch, published with `git push -u origin feat/phase9-3-revenuecat`: a new remote branch, never force-pushed.
4. For Engineer #1, the tip: the commit that adds this file.
5. It is never merged into `main`.

**Excluded, and confirmed absent:**
- **No testing-only patch:** `src/cloud/client.ts` and `src/screens/onboarding/frame.tsx` are identical to HEAD.
- **No `.env` file and no secret:** the 10 key-shaped strings are fakes in the tests, and no local environment value appears except the word "development".
- **No artifact:** screenshots, recordings, bundles and logs are all kept outside the repository.

## 8. Remaining blockers (deliverable G)

- **Founder decisions:**
  - F3: restore across Forge accounts;
  - F7: Billing Grace Period;
  - F11: purchase testing in FORGE Dev;
  - F12: complimentary access for the founder, testers and App Review;
  - F15: Terms, Privacy and support URLs;
  - F16: the product ID;
  - what **Not now** leads to in a release build;
  - whether membership runs in FORGE Preview, the TestFlight app (today it can't: it is a release build, with its own App Store Connect record and products);
  - whether production accepts sandbox purchases (App Review and TestFlight);
  - Google Play.
- **Store accounts:**
  - the Paid Applications Agreement;
  - the subscription, its group and the free-week offer;
  - the In-App Purchase key for RevenueCat;
  - the RevenueCat project, its offering and its keys;
  - sandbox Apple Accounts.
- **Backend:** the entitlement SQL has not been promoted to a migration, and the functions, their secrets and the webhook are not deployed. FORGE DEV first, and only with approval.
- **Native:** FORGE Dev lacks the RevenueCat module until it is rebuilt. Play Billing is not approved. The 16 KB alignment of RevenueCat's Android library is unverified (first App Bundle, `ANDROID.md` A12).
- **Integration:** §6.6 (release-check rules, the About line, one pair of legal links, the accessibility sweep) and App Privacy and Data safety answers that include purchases.
- **QA environment:** the emulator's FORGE DEV test sign-in has expired. Signing in again with a FORGE DEV test account allows new captures.
- **Known issues** (no data or billing effect; planned for Phase 9.4):
  - **F2:** Android's hardware Back, and the iOS back swipe on `/membership`, don't wait while Apple or the server answers. Only the screen is left: the answer still reaches the server and this phone.
  - **X5 (Engineer #1's Q2):** RevenueCat's session watcher starts when a paywall or the You → Account card first mounts. Forge's own sign-outs (offline, or after deleting the account) raise no Supabase event at all. Either way, the previous account's cached answer and store customer stay until the next sign-in. That is harmless: the cache is per account, and every purchase and restore checks the SDK's own customer first. The fix is Engineer #1's sign-out signal (contract A9) and the watcher started at launch (§10).
  - **Deleting an account with an active subscription:** Forge's record goes with the account, but nothing yet tells the athlete that the Apple subscription continues until it is cancelled in Settings.
- **To confirm live** (static review can't):
  - RevenueCat's signature header format;
  - whether RevenueCat re-signs retries with a fresh timestamp (if not, retries after 5 minutes are refused, although the app's own refresh still converges);
  - the Test Store's `store` value;
  - `TEMPORARY_ENTITLEMENT_GRANT`;
  - that renewals and Ask to Buy approvals reach Forge while the app is closed.

## 9. Phase 10 readiness (deliverable H)

Nothing below activates billing in production. FORGE DEV first; production only with the founder's approval. Detailed steps are in [`PHASE_9_3_SANDBOX.md`](PHASE_9_3_SANDBOX.md).

1. **Founder: decisions and legal.**
   - Decide F3, F7, F11, F12, F15 and F16, the release-build decline, FORGE Preview, the production rule and Google Play.
   - Publish the Terms of Use and Privacy Policy, with their URLs.
2. **Founder: App Store Connect.**
   - Activate the Paid Applications Agreement.
   - On FORGE Dev's app record (`com.lsaint06.forge.dev`), create a subscription group and the monthly auto-renewable subscription at $6.99, with a free one-week introductory offer.
   - Set Billing Grace Period (F7).
   - Create the In-App Purchase key (`.p8`) and sandbox Apple Accounts.
   - Add Purchases → Purchase History to App Privacy.
   - Production's record comes later.
3. **Founder: RevenueCat.**
   - Create the project, and the App Store app for FORGE Dev with the `.p8`.
   - Import the product, then mark the `default` offering current, with a Monthly package.
   - Set the restore behaviour (F3).
   - Collect the keys: the public `appl_` key (and optionally a `test_` key for Expo Go) for the app, and the secret key for the functions only.
   - Point the webhook at FORGE DEV's `entitlement-webhook`, with an Authorization header and **HMAC signing enabled**.
4. **Engineer #2: FORGE DEV's backend, after approval.**
   - Promote `supabase/drafts/forge_entitlements.sql` to a migration after review, apply it to FORGE DEV, and run `forge_entitlements_checks.sql`.
   - Set the function secrets (§6.2) from a file outside the repository.
   - Deploy `entitlement-refresh`, and deploy `entitlement-webhook` with `--no-verify-jwt` (`verify_jwt = false`: RevenueCat sends no Supabase token).
5. **Engineer #1: the native development build.** Integrate (§6.6–6.7), then rebuild FORGE Dev (`npm run dev:ios`, or the EAS development profile with approval), with `.env.forge-dev` carrying the membership variables.
6. **Both: App Store sandbox purchase testing** on the rebuilt FORGE Dev with a sandbox Apple Account, following `PHASE_9_3_SANDBOX.md` §6:
   - purchase and the free week;
   - the trial ending and renewals (sandbox renewals are accelerated);
   - cancellation (access to the end of the period, then ended);
   - restore on a reinstall, on a second device, and across Forge accounts (F3);
   - switching accounts;
   - offline, then **Check again**;
   - no free week for an account that used one;
   - Ask to Buy, failures and a refund (StoreKit configuration on a Mac).
7. **Engineer #2: real webhook testing.**
   - Send RevenueCat's test event, then real sandbox events.
   - Confirm signatures, retries and their timestamps, idempotency, transfers and the environment filter.
   - Confirm the server's record matches RevenueCat after each step.
8. **Engineer #2: Phase 9.4, entitlement-based access.**
   - Agree the gate's invariants with Engineer #1 (his M8; §10, Q8), then build the hard gate.
   - Build the expired, billing-retry and grace screens.
   - Enforce the one-time preview (`previewAllowed`, his contract O6).
   - Add the deletion notice for subscribers (Q3).
   - Build server-side sync enforcement (F10) and the offer to start the revealed path (F14).
   - Fix F2.
   - Then test: expiry closes Forge, renewal reopens it, and offline invents no window.
9. **Both: TestFlight, with the founder's approval.**
   - FORGE Preview (`com.lsaint06.forge.preview`) is the TestFlight app. It is a release build with its own App Store Connect record, so membership can't run in it today.
   - Testing membership there needs:
     - the founder's decision to open the gate to FORGE Preview (Engineer #2 changes the gate);
     - the subscription and its free week on FORGE Preview's own record;
     - a RevenueCat app for it;
     - the release-check key rules and the bundle scan for `sk_` (Engineer #1).
   - TestFlight's purchases, like App Review's, are sandbox purchases. Production stays locked until 8.4F.
10. **Google Play, only if approved:**
    - Create the Play Console subscription, its base plan and its free-trial offer.
    - Create a RevenueCat Play app with service-account credentials, and set up real-time developer notifications.
    - Add licence testers and run purchases on the internal testing track (purchase, cancel, restore, grace period, account hold).
    - It needs code first: Google keys and Play's product format are refused today.
11. **Store submission readiness:**
    - legal URLs in the app and in the listings;
    - Restore visible on the paywall;
    - the subscription terms before purchase (done in the app);
    - App Review notes with a sandbox or complimentary account (F12);
    - paywall screenshots;
    - App Privacy and Data safety answers that include purchases.

## 10. Answers to Engineer #1 (his `SHARED_CONTRACTS.md` §7)

**His contracts.** I agree with A1–A9, O1–O6, M1–M8, L1–L6 and N1–N8 as drafted, with three notes:
- **A7** is now also held by `tests/billing-membership.test.ts` (the account follower, Q11).
- **O5:** in the approved V3, the way on is **Not now** (spoken "Not now: continue without membership"). "Continue without membership" is the button only when Forge Premium isn't available.
- **L3:** `src/screens/ProfileForm.tsx` also writes an `onboardingStep` setting, which neither track's list names.

| # | Answer |
| --- | --- |
| Q1. Offline launch | **Safe.** The paywall and the card read the account from `useEntry()` (`entry.user.id`), and every purchase and restore binds the store to it first (`identify`). Offline, the log-in or the server fails and nothing is granted. The card shows that account's own cached answer, or that Forge couldn't confirm it. **I'll add the test after the merge:** the offline launch (A3) exists only on Engineer #1's branch |
| Q2. Sign-outs the watcher can't see | **Agreed.** After the merge, in one reviewed commit: Engineer #1's sign-out signal (A9); my listener, which gives the same `followAccount` no account; and the watcher started at launch while membership runs, through the line in `app/_layout.tsx` that Engineer #1 adds. **Test:** an offline sign-out with an expired token forgets the store's customer and the cached answer |
| Q3. Deleting an account with an active subscription | **Agreed:** in Phase 9.4, while membership runs, Delete Forge account always says that Apple keeps billing until the subscription is cancelled, and links to `manageMembership()`, verified or not. **RevenueCat's customer record:** I recommend deleting it in the server-side deletion (RevenueCat's REST API can), once the founder covers it in the privacy policy (F15). Apple's subscription is unaffected either way |
| Q4. Release guards | **They fit.** Sandbox purchases use FORGE Dev's debug build (Q5), so `preview` and `production` never need the Test Store key or the membership flag. FORGE Preview carries membership only after the founder decides it (§8), with its own products and RevenueCat app. N7 then changes for `preview` only, in the same reviewed change as the gate |
| Q5. iPhone sandbox builds | **Confirmed.** Membership needs `__DEV__`, so only the debug build (`npm run dev:ios`, with `npm run start:dev`) runs it. `PHASE_9_3_SANDBOX.md` §5 says the same |
| Q6. Android keyboard in onboarding | **Agreed, behaviour only:** `src/screens/onboarding/frame.tsx:102` avoids the keyboard on iOS only. **After the merge**, so it can use Engineer #1's Phase 8.4 M3 pattern and `android-keyboard.test.tsx`. **Who:** I make it and Engineer #1 reviews, with About You checked on an emulator without a window |
| Q7. About's build line | **Agreed:** after the merge, a one-line change in `account.tsx` to `currentBuildLine()`. Mine, reviewed by Engineer #1 |
| Q8. The Phase 9.4 gate | **Agreed** with the four invariants. **I propose two more:** only a verified `denied` closes Forge (`unverified` follows founder decisions F4 and F5, never an invented window); and the one-time preview (O6) is enforced in the same change |
| Q9. Schema checks | **Agreed:** when the draft is promoted, Engineer #1 extends `supabase/verify/` for both tables (X2 in `SUBSCRIPTIONS.md`), and I review |
| Q10. The checkpoint | **Done** (§7): three commits, authorized by the founder and pushed on 7 November. **The stale merge, verified read-only:** `forge-phase9-new` holds 8 staged files identical to `5f07c9b`'s, and a merged `IMPLEMENTATION_STATUS.md` whose two sources both survive. **Proposed, with the founder's approval:** `git merge --abort` there, then remove that worktree |
| Q11. Overlapping account transitions | **Fixed in this checkpoint** (§4.3): `followAccount`. Both tests failed before the fix. **One narrower case remains:** an answer the paywall itself asked for (a purchase, restore or check) is saved without that check. It needs the athlete to leave the paywall while it waits (F2), sign out, and only then receive the answer. It closes with F2 and the sign-out signal in Phase 9.4 |

**This handoff in Engineer #1's format** (his §6):

1. **Branch and commit:** `feat/phase9-3-revenuecat`, pushed. The checkpoint is its three commits on `74789a4` (§7); the tip is the commit that adds this file.
2. **Baseline:** `d208e4e`, with Phase 9.0 (`b513070`) and 9.1 (`74789a4`) already committed on it.
3. **Files owned:**
   - `src/billing/`;
   - `src/screens/membership/`, `src/screens/onboarding/` and `src/domain/onboarding/`;
   - `app/membership.tsx`, `app/membership-preview.tsx` and `app/onboarding-preview.tsx`;
   - the entitlement functions and drafts in `supabase/`;
   - `tests/billing-*` and the membership and onboarding UI tests;
   - `docs/SUBSCRIPTIONS.md` and `docs/ONBOARDING.md`.
4. **Files changed since the baseline:** Phase 9.0's and 9.1's (committed), then the 50 in §7.
5. **Shared interfaces affected:**
   - A1 and A7: the account follower;
   - A4 and N1: two routes in the ready group;
   - O2 to O5: the membership stage and the content boundary;
   - M1 to M7;
   - N2, N3 (`react-native-purchases` 10.16.0), N5 and N8.
6. **Tests executed:** §4.
7. **Known blockers:** §8.
8. **Decisions requiring Engineer #1:**
   - the sign-out signal and the watcher at launch (Q2);
   - the release guards (Q4);
   - reviews of Q6 and Q7;
   - the schema checks (Q9);
   - the gate's invariants (Q8).
9. **Decisions requiring the founder:** those in §8, plus authorizing the integration.
