# Phase 9.0: Subscription architecture, onboarding and implementation plan — audit

**Status:** audit and plan for founder review. Nothing implemented. No application file, dependency, database, remote system or App Store Connect setting was changed.
**Author:** Opus 2 (Phase 9 agent), isolated worktree. **Baseline:** `c509a69`.
**Citations:** `path:Lx-Ly` refer to the repository at `c509a69`. External sources are listed in section 7 and section 11.

## 1. Executive summary

- **Forge has no monetization code today.** The only touchpoints are a "free plan" placeholder (`src/domain/membership.ts`, `MembershipCard`), and there is no purchase dependency, entitlement storage or feature flag. Privacy Policy, Terms of Use and a support address do not exist yet; Apple requires all three for a subscription.
- **The architecture is well suited to a hard gate.** One pure entry decision (`entryState`) and one route table with `Stack.Protected` redirects (`AppStack`) already decide everything that may be shown, including deep links. A subscription gate is an additional fact and a few new states there: a cross-agent change to Opus 1's files, kept to one reviewed diff.
- **A genuine Forge Path reveal is feasible without a second engine.** `recommendProgram` is pure, the 18 programs ship in the app, and the existing program views render the week, workouts, exercises and sets/reps read-only. Onboarding must start asking **days a week** (never asked today). Equipment is not an engine input and should not become one without approval.
- **Data preservation is achievable by construction.** Workouts, plans and journals live in SQLite, the sync outbox never drops refused changes, backups exclude settings, and `clearData` is only reachable through explicit account deletion or backup import. Expiry will be a routing decision only, with a Stage 4-style window to finish an in-progress workout.
- **Recommended architecture: RevenueCat + a Forge-owned entitlement mirror in Supabase.** Apple → RevenueCat (account bound through `appAccountToken` = Supabase user UUID) → Forge Edge Functions (authenticated, idempotent webhooks; server-side pull) → `forge_entitlements` (RLS read-own) → the app. Verified: `react-native-purchases` supports React Native ≥ 0.80 and Expo SDK 54+ in development builds; it runs mocked in Expo Go, so **only server-verified entitlements may grant access**. Free up to $2,500 monthly tracked revenue, then 1 %. **Version caveat (RevenueCat 11.0.0 release notes): its iOS pod can't be installed through CocoaPods until after the Nov 1–7 trunk freeze, and "Expo apps should stay on 10.x for now" (10.16.0); CocoaPods trunk becomes read-only on Dec 2, 2026 and a later major will drop CocoaPods**, so Forge's iOS build (Opus 1's pipeline) will eventually need Swift Package Manager support for this dependency. The do-it-yourself alternative is weaker today: Apple's official JWS verifier does not run on hosted Supabase Edge Functions (`edge-runtime` issue #761).
- **Apple constraints that change the design:** the billing amount must be the most prominent price element (so "7 DAYS FREE" can't outrank "$6.99/month"); Restore Purchases must be on the paywall; account deletion must stay reachable for expired users and warn that billing continues through Apple; requiring sign-in before purchase is defensible but carries review risk; the first subscription ships with the first binary; Family Sharing is irreversible.
- **Proposed order:** 9.1 foundation → 9.2 onboarding and reveal → **9.3 purchase integration and paywall → 9.4 hard gate** (swapped so a gate is never enabled before it can be satisfied) → 9.5 adversarial testing and launch.
- **Next step:** approve the architecture and Phase 9.1, and decide F1, F3, F4, F5, F7 and F10 (section 15).

## 2. Worktree, branch, HEAD and status

| | |
| --- | --- |
| Worktree | `/Users/lsaint/Forge App/Forge-App.worktrees/forge-phase9-agent-init-check` (linked worktree; separate from the primary worktree `/Users/lsaint/Forge App/Forge-App`) |
| Branch | `agents/forge-phase9-agent-init-check` (no upstream; never pushed) |
| HEAD | `c509a69a2e65ee2ea0a2340727e72bdbf0c4a397` (approved baseline) |
| Status | Clean: no staged, unstaged or untracked files; no stashes; no diff against `c509a69` |
| Opus 1 since baseline | `5f07c9b` "fix(dev): honest schema checks on new Supabase projects, FORGE DEV preparation (Phase 8.2)", pushed (`origin/feat/forge-paths-foundation`), descendant of `c509a69`. Touches `scripts/dev/*`, `supabase/verify/schema_checks.sql`, `tests/server-hardening.test.ts`, `tests/verify-sql.test.ts`, `tests/dev-tools.test.ts`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `IMPLEMENTATION_STATUS.md` (overlap rows X2, X6, X11). **Not merged into the Phase 9 branch**: awaiting the founder's confirmation that it is verified; a fast-forward is possible. |
| This report | Written outside the repository (session files). It can be added as `docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md` once approved. |

## 3. Approved Phase 9 product requirements (restated, not redesigned)

| Area | Approved requirement |
| --- | --- |
| Model | Subscription-only. One auto-renewable monthly subscription, **$6.99 USD/month**. **7-day introductory free trial** for eligible new subscribers. No free tier, no annual plan, no tiers. One subscription or trial unlocks everything. |
| Trial | Started only through Apple's purchase flow; access only after the resulting entitlement is verified. No locally timed trial (local storage, device clock or a bare database timestamp). |
| Source of truth | Apple's subscription system for billing status; Forge's backend interprets and enforces entitlements. |
| Disclosure | Price, trial terms, renewal and cancellation disclosed before purchase confirmation. |
| Onboarding | A. Welcome and brand ("BUILT THROUGH DISCIPLINE") → B. feature discovery (real features only) → C. personalization (existing preferences and engine inputs) → D. **genuine** personalized Forge Path reveal → E. premium paywall ("7 DAYS FREE · Then $6.99/month unless canceled") → F. enter Forge. |
| Reveal | Real engine output: the program, why it fits, weekly structure, workout days, exercises and prescribed sets/reps. Inspectable but no logging, no tabs before a valid entitlement. Survives interruptions and restarts. No second Paths engine. |
| Hard gate | No access without an active trial or subscription: Home, Train, Nutrition, Progress, You, Forge Paths, active logging and every other subscriber feature. Expired screen with subscribe and restore. **No preview after the trial ends.** No bypass through onboarding, deep links, tabs, old sessions, restarts or local state. Subscription management, restore, support, privacy and account deletion stay reachable. |
| Data | Expiry never deletes or resets data (workouts, sets, Paths and plans, progress, measurements, nutrition, settings, preferences, anything user-created). Resubscribing restores access to all of it. Expiry is distinct from an explicit deletion request. An active workout at expiry must not lose or corrupt data. |

## 4. Existing onboarding architecture and actual user journey

### 4.1 The journey today (verified in code)

1. **Cold start.** `Ready()` opens SQLite (`initializeRepository`) behind the REFORGE intro (`app/_layout.tsx:236-306`). `Navigation()` computes **one** entry decision from verifiable facts (`app/_layout.tsx:88-100` → `entryState()`, `src/auth/entry.ts:67-90`) and renders the route stack for that state only (`app/_layout.tsx:232`, `src/auth/AppStack.tsx:27-82`).
2. **Signed out → Welcome** (`src/screens/entry/Welcome.tsx:28-133`): wordmark, tagline `BRAND_TAGLINE = "Built through discipline"` (`src/components/reforge/Brand.tsx:18`), "Your training starts here.", then Continue with Apple (iOS, Forge's own build only), Google, or Email. There is no guest mode (7.7B addendum, `docs/audits/PHASE_7_7A_ONBOARDING_AUDIT.md:190-226`).
3. **Signed in, not onboarded → `setup` → `/onboarding`** (`src/screens/entry/Setup.tsx`):
   - On a phone with no data of its own, a read-only check for cloud records (`Setup.tsx:40-46`, `57-71`). If records exist: "Welcome back · Restore my training" (one run of the existing manual sync). Offline: "Couldn't check your account" with Try again or set up now.
   - Otherwise the **unchanged 4-step `ProfileForm`** (`Setup.tsx:285-294`, `src/components/ProfileForm.tsx:55-112`):

     | Step | Fields asked |
     | --- | --- |
     | 1 Your foundation | name, units, height (required), starting weight (required), body fat % |
     | 2 Your training journey | experience, goal, rest day |
     | 3 Your training | target muscles, default rest, increment, rep range. **Weekly frequency is `settingsOnly` and never asked** (`ProfileForm.tsx:79-86`) |
     | 4 Make it yours | appearance, calories, protein, carbs, fat |

   - Each valid value is saved the moment it changes (`ProfileForm.tsx:345-356`); the step index is kept in the `onboardingStep` setting (`ProfileForm.tsx:306-313`, `705`), so setup **already survives restarts**.
   - "Enter FORGE" saves `onboarded: true` (`ProfileForm.tsx:368-378`); the entry state becomes `ready`; `router.replace("/(tabs)")`.
4. **Ready → the five tabs** and every training route (`AppStack.tsx:42-65`).

### 4.2 Completion flag and persistence

- `Profile.onboarded` (`src/domain/types.ts:3`, default `false` at `:131`) lives in the SQLite profile row and travels with the **profile cloud record**, so a restored onboarded profile skips setup on a new phone.
- Onboarding progress: `onboardingStep` in the local `settings` table (local only; not in backups, see 6.5).
- An empty phone is claimed for the signed-in account as setup begins (`claimIfEmpty`, `src/data/ownership.ts:65-70`; effect in `app/_layout.tsx`), so setup data is the athlete's own.

### 4.3 What exists, what is partial, what is missing

| Capability | State | Evidence |
| --- | --- | --- |
| Single entry decision with route protection | **Implemented** | `src/auth/entry.ts:67-90`, `src/auth/AppStack.tsx:42-79` |
| Account required before setup | **Implemented** | 7.7B addendum; `entryState` returns `signedOut` without a session |
| Setup that survives restarts | **Implemented** | `ProfileForm.tsx:306-313`, `345-356`, `705` |
| Returning athlete restore before setup | **Implemented** | `Setup.tsx:57-243` |
| Brand introduction | **Partial** | Welcome shows wordmark and tagline only; the cinematic intro is the splash |
| Feature discovery | **Missing** | No education screens |
| Weekly frequency asked during setup | **Missing** | `settingsOnly` (`ProfileForm.tsx:82-86`); 7.7A decision **D3** recommended asking it |
| Equipment preference | **Missing** (legacy unused field) | `Profile.equipment` default `"Barbell, dumbbells, bodyweight"` (`types.ts:140`); not asked, not an engine input |
| Personalized Forge Path reveal | **Missing** (proposed in 7.7A §C step 5, never built) | `PHASE_7_7A_ONBOARDING_AUDIT.md:52-116` |
| Paywall, entitlement, expired state | **Missing** | No purchase code anywhere (section 6.9) |
| REFORGE-styled setup | **Partial** | Setup still uses the Design System 2.0 `Screen` ("Made by your effort.", `Setup.tsx:285-294`) |

## 5. Forge Paths recommendation and preview feasibility

### 5.1 The engine as it is

- **Curated-only.** 18 human-authored programs (Strength and Muscle Building × Beginner/Intermediate/Advanced × 3/4/5 days) are **bundled in the app** (`src/programs/index.ts:10-27`, `programLibrary` `:61`, `libraryPrograms()` `:71`, `publishedPrograms()` `src/domain/programs/model.ts:295-312`). They work offline and before sign-in or purchase.
- **Recommendation is pure and deterministic:** `recommendProgram(profile, library)` (`src/domain/programs/recommend.ts:25-63`). Inputs: `experience`, `goal`, `frequency` (and `restDay` for scheduling only). It filters published programs whose author-assigned experience and goal match, prefers the day count nearest the weekly goal, then fewer days. Output: `match` (program, honest `reasons` `:49-58`, `alternatives` `:60`), `none`, or `incomplete` (missing experience/goal). With today's library every experience × goal pair has programs, so `none` cannot occur once both are answered.
- **Weekly structure:** `trainingWeekdays(pattern, restDay)` rotates the authored train/rest pattern so the rest day stays free (`src/domain/programs/schedule.ts:8-26`).
- **Content available for a preview** (`curatedProgramSchema`, `model.ts:92-174`): name, summary, description, phases (weeks, block, RIR), sessions, and every exercise's sets, reps, rest, role, per-side, notes (`model.ts:48-89`), plus the program's `equipment` list (`model.ts:104`) and progression text.

### 5.2 Existing presentation that can be reused read-only

- Recommendation hero with reasons: `Recommendation()` (`src/screens/programs/Library.tsx:48-112`).
- Full program view: `ProgramDetails` (`src/screens/programs/Details.tsx:135-258`): `ProgramStats`, "Your week" (`WeekStrip`, `:215`), `PhaseTimeline` (`:228`), `WorkoutList` (`:232`) whose rows expand into `ExerciseLines` (`src/components/programs.tsx:200-245`): each exercise's catalog name and prescription line (sets × reps, rest).
- Exercise names come from the local catalog (`r.exercise(id)`), available before sign-in.

### 5.3 Enrollment boundary

- The **only** writer is `enrollProgram()` (`src/data/programs.ts:169-204`), reached only from the Start sheet (`Details.tsx:68-133`). It writes an active `program` journal record in one transaction (archiving any previous plan); that record syncs like other journals.
- Sessions are never marked missed automatically (`src/domain/programs/enrollment.ts:20-22`), so a subscription lapse cannot damage a plan's progress.

### 5.4 Feasibility verdict

**High, without a second engine.** The reveal is a read-only composition of `recommendProgram` + `trainingWeekdays` + the existing `ProgramStats` / `WeekStrip` / `PhaseTimeline` / `WorkoutList` / `ExerciseLines`, with the Start button omitted. Requirements this implies:

1. Onboarding must collect **experience, goal and days a week** (frequency is not asked today; 7.7A **D3**) and the rest day for the weekly layout. These are existing profile fields: **no engine change**.
2. Persist the revealed program's key (`id@version`) and the onboarding stage in local settings so the reveal is stable across restarts and app updates; the program itself is recomputed from the bundled library.
3. No `enrollProgram` call before a verified entitlement. After entitlement, starting the plan goes through the existing Start sheet (7.7A **D6**: never an automatic enrollment), unless the founder decides otherwise (section 15).
4. **Equipment** is not an engine input. Collecting it would either be decorative or require an engine change, which needs approval. Recommended: show the program's own `equipment` list in the reveal ("What you'll need") and do not ask an equipment question (section 15).

## 6. Existing authentication, navigation and persistence architecture

### 6.1 Account session (Opus 1 domain)

- Supabase client with the **publishable key only**, session in chunked SecureStore (`src/cloud/client.ts:45-71`); each app variant is pinned to its own project (`checkEnvironment`, `src/cloud/environment.ts:69-127`).
- `useAuthSession` (`src/auth/session.ts:141-296`): restores the stored session; **offline use is first-class**: when refresh fails only for lack of network, the stored user keeps the app open (`storedUser`, `:65-96`; `:166-172`). An unexpected `SIGNED_OUT` is recorded as `ended` (`:177-203`). Sign-out is local, global or offline-local (`:260-288`).
- Providers: Apple (Forge's own iOS build only), Google (Supabase OAuth), email/password.

### 6.2 Navigation and route protection (Opus 1 domain)

- `entryState()` kinds: `initializing`, `unconfigured`, `misconfigured`, `signedOut`, `continuing`, `recovery`, `otherAccount`, `unlinked`, `setup`, `ready` (`src/auth/entry.ts:49-90`); `entryRoute()` maps each to its screen (`:92-104`).
- `AppStack` groups every route under `Stack.Protected` with `redirectTo` (`src/auth/AppStack.tsx:42-79`): tabs and `workout` for `ready || continuing`; all training, Paths, **`account` and `delete-account`** for `ready` only (`:49-65`); `onboarding` for `setup`; welcome/sign-in/create-account for `signedOut || continuing`; `account-check` otherwise. `TabsGuard` (`:21-25`) blocks the tabs while continuing. **Deep links to protected routes already redirect.**
- Governance rule: "Every route file must be listed there; an unlisted route would be reachable unprotected" (`docs/redesign/REFORGE_FOUNDATION.md:787-789`). No test enforces it today.

### 6.3 Ownership and continuation

- The phone's data belongs to the account in the `cloudOwner` setting (`src/data/ownership.ts:8-11`); another account's data is never shown (`otherAccount`), unowned data must be linked explicitly (`unlinked`).
- **Stage 4 continuation** (`src/auth/continuation.ts`): after an unexpected sign-out mid-workout, only that owner's workout may be finished, for up to 12 h (`:19`, `:63-76`), with its summary for 10 min (`:84-107`). This is the proven pattern for "entitlement lapsed mid-workout" (section 9).

### 6.4 Workout logging and recovery

- SQLite is the source of truth; each set edit saves immediately. `active()` is any non-completed workout (`src/data/repository.ts:573-577`); `startWorkout` / `startPrescribedWorkout` write and queue at once (`:757-785`); `finishWorkout` is idempotent (`:849-863`). One workout at a time (`src/startGuard.ts`). The recovery screen (`ErrorBoundary`) never deletes data. **A subscription change cannot affect stored workout data; only the UI path to finishing can be blocked.**

### 6.5 Local persistence boundaries

- `settings` key/value table (`repository.ts:315-329`) holds markers such as `cloudOwner`, `onboardingStep`, `sessionEnded`.
- **Backups exclude settings** (`exportBackup`, `repository.ts:1202-1244`).
- `clearData()` wipes everything and resets the profile (`repository.ts:1347-1367`); it is called only by explicit account deletion after the server confirms (`src/auth/account-deletion.ts:350`) and by backup import (`repository.ts:1299`). **No subscription code may ever call it.**

### 6.6 Cloud sync and backend (Opus 1 domain for schema)

- Manual sync through a durable outbox (`src/cloud/sync.ts`). Failures never drop changes: a refused upload stays in the outbox with back-off (`sync.ts:249-296`, `r.retry` at `:259-269`); stop reasons (`offline`, `unavailable`, `auth`, `deleted`) end the run (`src/cloud/errors.ts:10`; mapping in `cloudFailure`, `src/cloud/transport.ts:50-77`).
- Backend: one table `forge_records` (owner-keyed, RLS read-own, writes only through `forge_write`, cascade on account deletion) and `forge_delete_account` (`supabase/migrations/202610140001_forge.sql:3-50`). The Stage 3 hardening migration is written and PGlite-tested but **not deployed** (`supabase/migrations/202611020001_forge_security_hardening.sql`); it re-defines both RPCs and tightens grants (`:90-149`). No Edge Functions exist.

### 6.7 Existing premium code, placeholders, dependencies, flags

- `membership()` always returns `{ tier: "free", premiumAvailable: false }` (`src/domain/membership.ts:1-16`, "every lifter has the full free app").
- `MembershipCard` on Account & privacy: "Forge Premium · Free plan · Membership is on the way … There's nothing to buy yet." (`src/screens/you/account.tsx:55-97`, rendered at `app/account.tsx:514-515`).
- **No** purchase dependency (`package.json`), **no** StoreKit/RevenueCat/IAP code, **no** entitlement storage, **no** subscription feature flag. `DESIGN_SYSTEM_2.md:380` documents the free-plan card.
- No Privacy Policy or Terms of Use URL exists anywhere; the support e-mail (`EXPO_PUBLIC_SUPPORT_EMAIL`, `src/support.ts:1-13`) is unset.

### 6.8 Design system and references

- REFORGE layer (`src/components/reforge/index.ts`): `ForgeScreen`, `ForgeSubScreen`, `HeroCard`, `ForgeCard`, `CtaButton`/`OutlineButton`, `FText`, `Wordmark`, `BRAND_TAGLINE`, choices/fields, charts, `ForgeTopGlow`; entry frame `EntryFrame`/`EntryMessage` (`src/screens/entry/EntryFrame.tsx`). Dark charcoal `#101216` base (`app.json`).
- Approved references: Nutrition, Progress, You (`docs/redesign/reforge/references/README.md`). **There is no approved onboarding or paywall reference**; AI reference imagery must never be reused in the product (`ASSETS.md`).

### 6.9 Tests and CI

- 88 Node test files (~796 cases: domain, real SQLite, sync protocol, PGlite Postgres with Supabase roles and claims, e.g. `tests/server-hardening.test.ts:19-25`) and 73 UI test files (~779 cases, jest-expo; `entry-gate.test.tsx` renders the real root layout with a mocked session and real SQLite).
- CI (`.github/workflows/ci.yml`): `npm ci`, `branded:ensure`, typecheck, lint, format check, `npm test`, `test:ui`, iOS/Android export; on pushes to `main` and `feat/**` and PRs to `main`. The Phase 9 branch `agents/forge-phase9-agent-init-check` does not trigger CI. `docs/VALIDATION.md` (44 tests) is historical.
- Known flake M-1: two Progress UI tests fail on Mondays (`docs/MAINTENANCE.md`).

### 6.10 Expo SDK 58 / React Native 0.88 considerations

- **Expo Go cannot purchase.** Every StoreKit library is native code. RevenueCat's SDK detects Expo Go and runs in **"Preview API Mode", replacing native calls with JavaScript mocks; real purchases require a development build** (package README, verified 2026-11-03). Purchases therefore need FORGE Dev, FORGE Preview or the production app; Expo Go stays useful for UI work only. **Mocked results must never unlock anything**: access is granted only from the server-verified entitlement (section 8).
- **Versions (npm registry, 2026-11-03):** `react-native-purchases` 11.0.0 (peer `react-native >= 0.80.0`; latest 10.x is 10.16.0), `react-native-purchases-ui` 11.0.0, `expo-iap` 6.4.2 (peer `expo *`), `react-native-iap` 17.3.2 (requires `react-native-nitro-modules >= 0.36.5`). RevenueCat's Expo guide supports Expo SDK 54+ in a development build; its Xcode 27 CocoaPods workaround applies only to SDK 56 or earlier (Forge: SDK 58, Xcode 27.2). Peer ranges admit RN 0.88, but **New Architecture compatibility is only proven by compiling and running a FORGE Dev build** (RevenueCat publishes no New Architecture statement); that is the first gate of the purchase stage (section 13).
- **CocoaPods transition (time-sensitive).** RevenueCat 11.0.0's release notes: the `PurchasesHybridCommon` pod is unpublished until after the CocoaPods trunk freeze (Nov 1–7, 2026); "Expo apps should stay on 10.x for now"; **CocoaPods trunk becomes permanently read-only on December 2, 2026, and a later major release will drop CocoaPods support** in favour of Swift Package Manager (experimental now, React Native 0.88+). Forge's iOS builds install pods (`npm run dev:ios`), so pin the newest version installable through CocoaPods at 9.3 time and plan the SPM question with Opus 1 (X6, R19).
- **StoreKit configuration files only apply when the app is launched from Xcode.app** (RevenueCat sandbox guide), not from a command-line `xcodebuild` install such as `dev:ios`; local StoreKit testing therefore means opening the generated workspace in Xcode.
- **StoreKit 2** needs iOS 15+; Forge targets iOS 16.4+ (`docs/NATIVE_BUILDS.md`).
- **Native changes are regenerated per build:** `npm run dev:ios` runs `expo prebuild --clean` and installs pods, so the SDK is linked by autolinking (no hand edits to `ios/`, which is git-ignored).
- **Entitlements:** in-app purchase is expected to add no signing entitlement; the first FORGE Dev build must confirm it passes `builtAppProblems` unchanged (Sign in with Apple required, push forbidden).
- **Android** (package names exist; not shipped): RevenueCat and `expo-iap` both support Google Play Billing; nothing in this plan blocks it.

### 6.11 Phase 8 native-build safeguards that Phase 9 will meet

- `npm run dev:ios` checks the built app before installing (`scripts/dev/ios-build.ts:470-527`): FORGE Dev ID and scheme, team signature, **Sign in with Apple required**, **push forbidden**, provisioning profile, built-in JavaScript, and no production value in the JavaScript or app config.
- The production-value scan covers **only** the Supabase URL, ref and publishable key (`productionMarkers`, `scripts/dev/ios-build.ts:429-452`). A production purchase-SDK key would not be detected.
- FORGE Dev's Metro receives only `.env.forge-dev` values (`devClientEnv`, `scripts/dev/env-files.ts:144-151`); its validation checks only the four Supabase variables (`checkDevProject`, `:96-133`). An extra purchase key would flow into FORGE Dev **unvalidated**.
- Expo Go (`npm start`) reads `.env`, which points at the **production** project today (`docs/DEVELOPMENT_ENVIRONMENT.md`).

## 7. Subscription integration options and recommendation

### 7.1 Options

| | **A. RevenueCat + Forge entitlement mirror** | **B. `expo-iap` (or `react-native-iap`) + Forge server on Apple's APIs** | **C. Custom StoreKit 2 Expo module + Forge server** |
| --- | --- | --- | --- |
| Client | `react-native-purchases` (10.x until its 11.x iOS pod is installable; StoreKit 2, purchase, restore, eligibility, offline cache) | `expo-iap` 6.4 / `react-native-iap` 17 (Nitro); purchase and transaction listeners | Swift module written and maintained by Forge |
| Who validates with Apple | RevenueCat (App Store Server API and Notifications V2), then Forge's backend pulls and stores the result | Forge: verify signed JWS transactions against Apple's certificate chain, call the App Store Server API with the In-App Purchase key, process Notifications V2 | Same as B |
| Forge server work | Two small Edge Functions (refresh and webhook) + one table; webhook verification is plain HMAC (Web Crypto) | Notification receiver, JWS verification, App Store Server API client, full lifecycle state machine, retry/ordering, sandbox/production routing. **Apple's official verifier (`@apple/app-store-server-library` 3.1.0) fails on hosted Supabase Edge Functions** (`X509Certificate` methods not implemented, `supabase/edge-runtime` #761; fix unmerged): needs a separate Node service or an unofficial `jose` + `@peculiar/x509` verifier | Same as B, plus native code |
| Security-critical code owned by Forge | Small: webhook authentication (header + HMAC), idempotency, mapping | Large: JWS chain validation, key handling, every lifecycle edge | Largest |
| Lifecycle coverage (trial, grace, billing retry, refund, revocation, family) | Provided and maintained by RevenueCat | Built and tested by Forge | Built and tested by Forge |
| Account binding | App User ID = Supabase user UUID; RevenueCat **sets `appAccountToken` automatically for UUID IDs**; configurable restore/transfer behaviour | `appAccountToken` set by Forge | Same as B |
| Restore | SDK restore + project transfer policy | `AppStore.sync()` + Forge's own ownership rules | Same as B |
| Expo Go | Loads with mocks (Preview API Mode) | Not loadable without guards | Not loadable |
| Sandbox / StoreKit testing | Sandbox, StoreKit configuration files, dashboard test webhooks, sandbox-only restore override | Sandbox and StoreKit configuration files | Same |
| Android later | Same SDK and entitlement | Second server integration (Play Developer API, RTDN) | Second native module and server integration |
| Cost | Free up to **$2,500 monthly tracked revenue, then 1 %** (pricing page, 2026-11-03) | No vendor fee; engineering and hosting time | Highest engineering cost |
| Vendor risk | Third-party processor (privacy label, availability) | Library maintenance (OpenIAP, active) | None, all on Forge |

### 7.2 Recommendation: Option A

**RevenueCat for purchase execution and store validation, with Forge's backend as the only authority the app trusts for access.**

1. **Safety for real users.** Subscription lifecycle edge cases (grace, billing retry, refunds, revocation, Ask to Buy, renewal ordering) are where homemade systems fail. A maintained service removes most security-critical code from Forge; Forge's remaining server code is small enough to test exhaustively in PGlite and unit tests.
2. **Backend enforcement as required.** Apple → RevenueCat → Forge's Edge Function (pulls `GET /subscribers` with a server-only secret) → `forge_entitlements` (service-role writes only) → the app reads its own row. Webhooks are authenticated (authorization header and **HMAC signature**), retried **up to 5 times over about 80 minutes**, carry an event `id` reused on retries, and RevenueCat recommends re-reading the subscriber after every webhook, which removes ordering problems.
3. **Account binding matches Forge's mandatory accounts.** The Supabase user UUID is the App User ID; RevenueCat writes it to Apple's `appAccountToken`; `logOut()` clears the SDK's cached customer. Restore behaviour **"Transfer if there are no active subscriptions"** stops one active Apple subscription unlocking several Forge accounts while still letting a churned customer subscribe again with a new account. The stricter **"Keep with original App User ID"** (allowed because every customer must have an account) never moves a purchase, but then a churned customer who returns under a new Forge account can pay Apple again yet not gain access, because the same Apple receipt stays tied to the original account (F3).
4. **Environment separation fits Phase 8.** Multiple webhook integrations per project, each filtered to production or sandbox, map to the production project and FORGE DEV respectively; FORGE Dev uses its own RevenueCat app and key.
5. **Cost at Forge's scale is low:** nothing until $2,500 MTR (about 360 monthly subscribers at $6.99), then 1 %.
6. **Android later** reuses the same SDK and entitlement.

**What would change the recommendation:** the SDK failing to build or run on React Native 0.88 in FORGE Dev (first gate of 9.3); the founder declining a third-party processor; or scale where 1 % outweighs owning the code. The fallback is **Option B with `expo-iap`** (built on the Expo Modules API; its stated validated baseline is Expo SDK 57 / RN 0.86, one step behind Forge; maintained in the `hyodotdev/openiap` monorepo largely by one maintainer), keeping the same `forge_entitlements` contract so the app side does not change. Option B also needs a JWS verification path that works outside Apple's Node-only library on Supabase.

**Not recommended now:** RevenueCat's remotely configured paywall UI (`react-native-purchases-ui`). Forge's paywall must match REFORGE and Apple's disclosure rules exactly; it will be a Forge screen. No dependency is installed during this audit.

**Sources (verified 2026-11-03):** npm registry (`npm view` for the packages above); RevenueCat 11.0.0 release notes (CocoaPods freeze, "Expo apps should stay on 10.x", CocoaPods read-only on Dec 2) <https://github.com/RevenueCat/react-native-purchases/releases/tag/11.0.0>; RevenueCat Expo installation <https://www.revenuecat.com/docs/getting-started/installation/expo>; package README (Preview API Mode) <https://www.npmjs.com/package/react-native-purchases>; webhooks <https://www.revenuecat.com/docs/integrations/webhooks>; restore behaviour <https://www.revenuecat.com/docs/projects/restore-behavior>; Apple server notifications and `appAccountToken` <https://www.revenuecat.com/docs/platform-resources/server-notifications/apple-server-notifications>; pricing <https://www.revenuecat.com/pricing>; Supabase edge-runtime `X509Certificate` gap <https://github.com/supabase/edge-runtime/issues/761>. Corroborating secondary research (RevenueCat offline entitlements up to 3 days; StoreKit configuration files only from Xcode.app; `expo-iap` baseline SDK 57) is recorded in the session's research notes.

## 8. Proposed trusted entitlement lifecycle and access-control model

### 8.1 Trust chain

```
Apple App Store (source of truth: StoreKit transaction, Server Notifications V2)
   │  validated by
RevenueCat (App User ID = Supabase user UUID = appAccountToken)
   │  pulled by Forge's backend only (server secret), on demand and after each webhook
Supabase Edge Functions: entitlement-refresh (caller's JWT) · entitlement-webhook (header + HMAC, idempotent)
   │  service-role writes only
public.forge_entitlements  (RLS: the signed-in user reads only their own row)
   │  read with the user's session, together with server time
App: cached snapshot (SecureStore, per user) → pure entitlementAccess() → entryState() → AppStack
```

**Never trusted for access:** SDK `CustomerInfo` on its own (including Expo Go mocks), any local flag, the device clock on its own, or entitlement data sent from the app to the backend.

### 8.2 Normalized entitlement record (one per account)

`user_id` (PK, FK `auth.users` on delete cascade) · `status` · `product_id` · `store` · `environment` (production/sandbox) · `period_type` (trial/normal) · `purchased_at` · `expires_at` · `grace_expires_at` · `access_until` (= the later of `expires_at` and `grace_expires_at` while active) · `will_renew` · `billing_issue_at` · `revoked_at` · `first_entitled_at` (**ever had a trial or subscription**: ends the onboarding preview for good) · `source_event_id` · `refreshed_at` (server time). The read call also returns `server_now`.

Privileges follow the Stage 3 pattern: RLS select-own for `authenticated`; **revoke all from `anon` and `authenticated` except that select**, because Supabase grants new objects to `anon` by default (7.8E Stage 3 "remaining risks"). An event table (`forge_entitlement_events`: event `id` primary key, type, received time, user) gives idempotency and an audit trail with no client access.

### 8.3 States, access and screens

| State | Meaning (from Apple via RevenueCat) | Access | Screen |
| --- | --- | --- | --- |
| `none` | Never had a trial or subscription (`first_entitled_at` empty) | No | Onboarding → reveal → paywall |
| `trial` | Introductory offer active, `expires_at` in the future | **Yes** | App |
| `active` | Paid period active (renewing or cancelled) | **Yes** | App |
| `cancelled_active` | Auto-renew off, still before `expires_at` | **Yes** (cancellation never ends access early) | App; Membership shows the end date |
| `grace` | Billing failed, inside Apple's Billing Grace Period | **Yes** | App + banner "Update your payment method" |
| `billing_retry` | Billing failed, no grace (Apple retries up to 60 days) | No | "We couldn't renew your membership": Manage subscription / billing, Restore |
| `expired` | Past `access_until`, not renewing | No | **Membership ended** (no onboarding, no preview) |
| `revoked` | Refunded or revoked (`revoked_at`) | No, immediately | Membership ended |
| `pending` | Purchase awaiting approval (Ask to Buy, SCA) | No (client-only state) | Paywall shows "Waiting for approval" |
| `unverified` | No usable snapshot and the backend can't be reached | Depends on 8.6 | "Connect to confirm your membership" |

### 8.4 Required scenarios

| Scenario | Behaviour |
| --- | --- |
| Intro eligibility | StoreKit decides; paywall shows the trial only if eligible; Forge never stores or invents eligibility |
| Active trial / paid | Granted until `access_until` |
| Cancel during trial or paid period | `will_renew=false`; access continues to `expires_at`; Membership shows "Ends on …" |
| Trial or subscription expires | `expired` at `access_until`; data untouched (section 9) |
| Billing retry and grace | `grace` keeps access to `grace_expires_at`; then `billing_retry` (no access) until recovery (`DID_RECOVER` → active) |
| Refund / revocation | Webhook → refresh → `revoked`; next foreground or launch closes access; an open workout may be finished (8.7) |
| Restore purchases | Explicit button only (`AppStore.sync()` via SDK); then backend refresh; transfer policy F3 decides cross-account cases and the app explains "This Apple ID's membership belongs to another Forge account" |
| Pending / interrupted / failed purchase | Pending: wait for the transaction update; failed or cancelled: stay on paywall, nothing granted; interrupted (app killed): StoreKit redelivers the unfinished transaction at next launch, the SDK posts it, Forge refreshes; RevenueCat's "Track new purchases from server-to-server notifications" is a second path |
| Reinstall | Sign in → backend row → access; training restored by the existing restore offer |
| Different Forge account | Entitlement is per account; ownership rules for local data unchanged; another account never sees this account's entitlement or data |
| Sign out and return | Sign-out resets the SDK identity and hides the cached snapshot of that user; on return the snapshot is re-read after sign-in |
| Temporary connectivity loss | Cached snapshot valid to `access_until`; then 8.6 |
| App killed during purchase | As "interrupted" above; no access until verified |
| Cross-device | One row per account: every signed-in device (and Android later) reads the same entitlement |
| Multiple Forge accounts, one Apple Account | Apple allows one intro offer per subscription group per Apple Account; F3 stops an active subscription unlocking several accounts |

### 8.5 Access decision (pure function; integrates into `entryState`)

Evaluated only after the existing account checks (configured, session, recovery, otherAccount, unlinked), so ownership protection keeps precedence:

1. Signed out → existing behaviour (Welcome; auth continuation unchanged).
2. Entitlement grants access → existing `setup` (restore offer / profile) or `ready`.
3. No access and a workout started while entitled is in progress within its window → `lapsedWorkout` (only `/workout`, then summary) (8.7).
4. No access and `first_entitled_at` set → `expired` or `billingIssue` screen. Onboarding, reveal and paywall-with-trial are unreachable.
5. No access and never entitled → onboarding (`setup` steps + reveal) until complete, then `paywall`.
6. Snapshot unknown and verification impossible → `verifying` / `unverified` (never the tabs).

`AppStack` gains groups for `paywall`, `expired`/`billingIssue` (with `delete-account`, a membership screen and the essential account actions) and `lapsedWorkout`. Every route stays listed; a new test fails if any `app/**` route is missing from the groups.

### 8.6 Offline, clock and verification-outage policy (no unlimited access)

- **Within the verified period:** offline use is allowed until `access_until` from the last server snapshot (up to a month for paid, 7 days for a trial). Gym use offline keeps working. (RevenueCat's own SDK applies a similar rule: an entitlement active when the device went offline stays active for up to 3 days.)
- **After `access_until`, offline:** if the last snapshot had `will_renew=true` and no billing issue, a **provisional window** (recommended **72 hours**, F4) lets training continue while renewal can't be checked; otherwise access ends at `access_until`. The window is bound to the account, recorded once, and never renewable offline.
- **Clock rollback:** the snapshot stores `server_now`; if the device time is earlier than the latest server time seen (minus 5 minutes), the cache is treated as unverified until a server read succeeds.
- **Backend or RevenueCat outage while online:** the same bounded provisional window applies only when the SDK reports a store-verified active transaction for this account; it is re-verified as soon as the service answers. Never unlimited, never for an account with a server-recorded expiry or revocation.
- **No verification ever succeeded on this phone for this account:** no access (paywall or verifying screen).

### 8.7 Active workout when access ends

Mirrors Stage 4 (`src/auth/continuation.ts`): a marker `{owner, workout, at}` written when access ends while that owner's workout is in progress; `/workout` stays open for up to **12 hours** (F5), then the summary for 10 minutes; tabs and every other route redirect to the membership screen; Finish, Pause, Discard remain the athlete's choices; no sync. After the window the workout remains in progress in SQLite and resumes after resubscribing.

### 8.8 How the app receives updates

On launch and foreground (online, throttled), after purchase or restore, and when the SDK's customer-info listener fires (it triggers a backend refresh; the SDK value itself is not used for access). Realtime subscriptions are unnecessary. Webhooks keep the server current for other devices and for expirations that happen while the app is closed.

### 8.9 Bypass analysis

| Vector | Control |
| --- | --- |
| Deep link to a protected route | `Stack.Protected` redirect (existing) + route-inventory test + per-state routing tests |
| Reopening onboarding / preview after expiry | `first_entitled_at` is server data; onboarding and reveal routes exist only in the never-entitled group |
| Switching tabs, restoring an old session, restarting | Single entry decision recomputed at every start from server-backed facts; no "unlocked" flag |
| Editing local state (settings, SecureStore) | Snapshot is only a cache of server data with server time; tampering can at most reach the provisional window on a compromised device; server-side sync enforcement (F10) limits cloud use |
| Device clock changes | Server-time anchor (8.6) |
| Expo Go mocks / fake SDK results | SDK results never grant access |
| Webhook spoofing or replay | Authorization header + HMAC with timestamp tolerance; event-id idempotency; re-read from RevenueCat |
| Sharing one subscription across accounts | Apple's one intro per Apple Account; transfer policy F3 |
| Refund then keep using | Revocation via webhook; access ends at next launch/foreground; offline at most until the cached `access_until` |
| Development or test bypass leaking to production | No client bypass exists; testers get server-granted entitlements (F12); FORGE Dev keys and webhooks point only at FORGE DEV/sandbox |
| Jailbroken, patched client | Out of scope for a local-first app; cloud features protected server-side (F10) |

## 9. Exact data-preservation strategy

**Principle: a subscription state is an access decision, never a data operation.** Entitlement changes select which routes may be shown; they never write, move or delete training data.

### 9.1 Rules

1. **No destructive call paths.** The billing/entitlement modules may not import or call `clearData`, `importBackup`, `deleteWorkout`, `endProgram`, `signOut`, outbox or journal mutations. Enforced by a test that scans `src/billing/**` imports, plus code review.
2. **Entitlement state lives outside training data.** The cached, server-verified snapshot is stored per user in SecureStore (or a namespaced setting `entitlement:<userId>`), never in profile, journals, workouts or the outbox. Settings are excluded from backups (`repository.ts:1202-1244`), so entitlement never travels in a backup or onto another account.
3. **Expiry keeps everything in place.** SQLite is untouched; the outbox keeps any unsent changes; sync simply isn't reachable while expired. If the founder approves server-side write enforcement (section 15), a refusal maps to a new, non-destructive stop reason (`subscription`) so the outbox is kept and nothing is shown as a sign-in problem.
4. **Active workout at expiry** (proposed behaviour): a workout started while entitled may be finished on this phone, like Stage 4: only `/workout` opens, for at most 12 h from the lapse, with the summary afterwards; Finish, Pause and Discard stay the athlete's own choices. Nothing is auto-finished or discarded. If the window passes, the workout stays "in progress" in SQLite and resumes after resubscribing. No sync during the window.
5. **Cloud data is never deleted for non-payment.** Cascade deletion of `forge_records` happens only through explicit account deletion (`202610140001_forge.sql:4`). Entitlement rows are separate tables; Apple/the purchase service keep purchase history.
6. **Explicit deletion stays separate and reachable.** The expired screen links to the existing Delete Forge account flow, which gains a notice that deleting the account does not cancel the Apple subscription, with a Manage subscription link (cross-agent, section 12).
7. **Data portability while expired (recommended):** Export backup stays available from the expired screen (it reads only; `exportBackup`).
8. **Resubscribing restores access instantly.** No migration or re-download is needed on the same phone; enrollment and schedule journals are intact and missed sessions are never marked automatically (`enrollment.ts:20-22`).

### 9.2 Interaction with existing mechanisms

| Mechanism | Effect of expiry | Safeguard |
| --- | --- | --- |
| SQLite records | None | Gate is routing only |
| Outbox / sync | Paused (UI unreachable) | Outbox retained; optional server refusal is a stop, not a record failure |
| Auth session | Unchanged | Expired ≠ signed out; sign-out remains available |
| Ownership (`cloudOwner`) | Unchanged | Account switching rules unchanged; entitlement is per account |
| Stage 4 continuation | Composes | Auth continuation keeps precedence when signed out; entitlement lapse uses its own marker |
| Pending deletions (D15) | Unchanged | User-initiated deletions with Undo still commit at their own deadline |
| Backup import | Not reachable while expired | Import replaces data; it stays behind entitlement |
| Account deletion | Reachable | Separate explicit flow with subscription notice |

### 9.3 Tests that will prove it

- For every entitlement transition (trial → expired, paid → billing retry, refund → revoked, expired → resubscribed, mid-workout lapse), snapshot every SQLite table before and after: identical except an allow-listed set of entitlement keys.
- Outbox rows survive an entitlement refusal from the server (PGlite + transport tests).
- An active workout started before expiry can be finished after it; a different route cannot be opened.

## 10. Proposed onboarding and paywall user journey

**Placement of the account.** Keep today's architecture: the athlete creates or signs into a Forge account **before** personalization. Reasons: the subscription must be bound to the Forge account (cross-device, restore, account switching, deletion), Opus 1 owns the account lifecycle, and moving sign-in after the reveal would require anonymous onboarding state plus new ownership rules. The App Review question this raises is covered in section 11 and decided in section 15.

| # | Screen (state) | Content | Persists | Back |
| --- | --- | --- | --- | --- |
| A | **Welcome** (signed out) | Wordmark, "BUILT THROUGH DISCIPLINE", one premium hero line (smarter training, consistency, measurable progress) | nothing | — |
| B | **What Forge does** (signed out, 3–4 pages, skippable) | Home overview, Forge Paths, workout logger, Progress and records, Nutrition with the offline USDA library, history and personalization. Only implemented features, described as README describes them | nothing | to A |
| — | **Account** (existing) | Continue with Apple / Google / Email; returning athletes sign in here | session (existing) | to B |
| C1 | **About you** (setup) | Name, units, bodyweight (optional) | profile fields as typed (existing) | — |
| C2 | **Your training** (setup) | Experience, goal, **days a week**, rest day. "Forge uses these to recommend your Forge Path." | profile fields on tap | to C1 |
| D | **Your Forge Path** (setup, reveal) | Recommended program, the engine's reasons, "Your week" with the training days, phases, every workout with exercises and sets/reps, "What you'll need" (program equipment), alternatives (other day counts). No Start, no logging | `onboardingStage=reveal`, revealed program key | to C2 |
| E | **Membership** (paywall) | "7 DAYS FREE · Then $6.99/month unless canceled", in StoreKit's localized price; what's included; auto-renewal and how to cancel; Start free trial; Restore purchases; Terms and Privacy; "Not you? Sign out". Ineligible users see the price without a trial | `onboardingStage=paywall` | to D (reveal stays reviewable until the first entitlement) |
| — | **Verifying** | "Confirming your membership…" until the backend verifies; pending/Ask to Buy explained | — | — |
| F | **Enter Forge** | Optional "Start your Forge Path" via the existing Start sheet (start date), or go to Home | `onboarded: true`; enrollment only if chosen | — |

**Returning paths.**
- Existing subscriber, new phone or reinstall: Account → entitlement verified → restore offer (existing) → Home. No onboarding, no reveal, no paywall.
- Expired subscriber: Account → **Membership ended** screen. No onboarding or reveal again. Actions: Subscribe, Restore purchases, Manage subscription, Export backup, Contact support, Privacy, Terms, Sign out, Delete account. Reassurance: "Your training is safe on this phone" with counts.
- Billing retry without grace: "We couldn't renew your membership" with Manage subscription (update payment) and Restore.
- Grace period: full access plus a quiet banner to update payment.

## 11. Apple subscription configuration and testing prerequisites

Sources are Apple's own pages as of 2026-11-03 (listed at the end of this section). Items marked *interpretation* are judgement, not Apple's wording.

### 11.1 App Review and disclosure requirements that shape the design

| Requirement | Apple source | Consequence for Forge |
| --- | --- | --- |
| Subscriptions must provide ongoing value, last **at least 7 days**, be available on all the user's devices; free trials allowed | Guideline 3.1.2(a) | Monthly plan qualifies; cross-device access through the account is consistent |
| Before asking to subscribe, describe what the user gets; disclose **title, length, price (and price per unit if appropriate)**; **Privacy Policy and Terms of Use links inside the app** | 3.1.2(c); Schedule 2 §3.8(b) (v127, 13 Oct 2026) | Paywall checklist (11.2); legal pages must exist first |
| The **billing amount must be the most prominent pricing element**; for a free trial, state how long it lasts and the price billed afterwards | Auto-renewable Subscriptions page and HIG (In-App Purchase) | The approved "7 DAYS FREE" message must not visually outrank "$6.99/month" (founder design decision F9) |
| Restore mechanism; `AppStore.sync()` only on an explicit user action | 3.1.1; `AppStore.sync()` docs | Restore Purchases button on the paywall and expired screen; never on launch |
| Apps with account creation must offer in-app deletion; with an active auto-renewable subscription, tell the user billing continues through Apple and point to **Manage Subscriptions** (`showManageSubscriptions` or `https://apps.apple.com/account/subscriptions/`) | 5.1.1(v) and its guideline reference page | Delete Forge account must stay reachable when expired and gain a subscription notice (X4) |
| "Apps may not require users to enter personal information to function, except when directly relevant to the core functionality" | 5.1.1(v); review practice quoted on Apple's forums | Sign-in before purchase is defensible because the subscription is account-based (cross-device sync, restore); **non-zero review risk** to explain in Review Notes (F2) |
| No misleading marketing or false price; screenshots and description must say a subscription is required | 2.3.1, 2.3.2, 3.1.2(a) | Feature discovery must show only real features; store listing states "subscription required" |
| Reviewer needs a working login | 2.1 | Demo account **with an active entitlement** in the production environment, explained in Review Notes |
| Sign in with Apple parity when other social logins exist | 4.8 (not deep-researched) | Already offered in Forge's own build (`Welcome.tsx`) |

### 11.2 Paywall disclosure checklist (from 3.1.2(c), Schedule 2 §3.8(b), HIG)

1. Subscription name ("Forge Membership" or similar) and duration (1 month).
2. What it unlocks (all of Forge; no tiers).
3. Full renewal price in the user's storefront currency, taken from StoreKit (never a hard-coded "$6.99"), **as the most prominent price element**.
4. Trial length (7 days) and the price billed when it ends, shown only to eligible users; ineligible users see the price without trial copy.
5. Auto-renewal statement and how to cancel (Settings or Manage Subscriptions, at least 24 h before renewal per Apple's standard terms; exact wording to be confirmed with the founder's Terms).
6. Restore Purchases and a way for the signed-in user to switch account.
7. Links to Privacy Policy and Terms of Use (Apple's standard EULA or a custom one).

### 11.3 Introductory offer rules (verified)

- **One introductory offer per subscription group per Apple Account.** New subscribers are always eligible; lapsed subscribers only if they never used an intro offer in the group; existing subscribers never. Creating more Forge accounts on the same Apple Account does **not** create new trials.
- Eligibility comes from StoreKit (`Product.SubscriptionInfo.isEligibleForIntroOffer`), evaluated before the paywall renders.
- Configure in App Store Connect: offer type **Free**, duration **1 Week**.

### 11.4 Lifecycle semantics Apple defines

- **Cancellation** turns off auto-renew (`DID_CHANGE_RENEWAL_STATUS` / `AUTO_RENEW_DISABLED`); access continues until the period's expiration.
- **Billing retry:** Apple retries for up to **60 days** (`DID_FAIL_TO_RENEW`; recovery `DID_RECOVER`).
- **Billing Grace Period:** opt-in, app-wide, **3, 16 or 28 days** for a monthly plan; can apply to **"All Renewals"** (including trial conversions) or "Only Paid to Paid". Apple recommends uninterrupted access during grace; outside grace, prompt to fix billing (`https://apps.apple.com/account/billing`).
- **Refunds/revocation:** `REFUND` notification; `revocationDate` and `revocationReason` on the transaction; access must end. Refund request in-app: `beginRefundRequest` (Apple decides within up to 48 h).
- **Family Sharing:** optional, and **cannot be turned off once enabled** (F8).
- **Ask to Buy:** purchase result `pending`; the transaction arrives later through the updates stream.
- **Price increases:** consent may be required; without it the subscription expires at the end of the period.
- `appAccountToken` (a UUID) binds a transaction to an account; never an e-mail.

### 11.5 App Store Connect prerequisites (founder tasks)

1. Paid Applications Agreement (Schedule 2), banking and tax.
2. **Small Business Program** enrollment (15 % commission from day one for new developers; otherwise 30 %, 15 % after a subscriber's first paid year).
3. App record for `com.lsaint06.forge`; one **subscription group** (Apple's best practice for single-plan apps) with one monthly product (e.g. `forge.membership.monthly`), $6.99 USD price point with Apple's equalized prices elsewhere (to review per territory).
4. Introductory offer: Free, 1 Week, all territories.
5. Localized display name and description; **App Review screenshot** of the paywall.
6. Decide Billing Grace Period (F7) and Family Sharing (F8).
7. **In-App Purchase key** (downloadable once) for server-side APIs and offer signing; store only in the purchase service or backend secrets.
8. App Store Server Notifications **V2** production and sandbox URLs (to the purchase service recommended in section 7; without a sandbox URL, sandbox notifications go to the production URL).
9. Privacy Policy URL (required), Terms of Use / EULA, support URL; App Privacy answers include **Purchases** (linked to the user, App Functionality) and the purchase service as a third party.
10. The **first subscription must be submitted together with the first app binary**.
11. For real sandbox/TestFlight tests of FORGE Dev or Preview: separate app records for `com.lsaint06.forge.dev` / `.preview` with mirrored products, **or** use local StoreKit configuration files for those builds and reserve sandbox/TestFlight for the production bundle ID (F11).

### 11.6 Testing ladder

| Level | What it proves | Needs |
| --- | --- | --- |
| Unit and PGlite tests | Access decisions, normalization, RLS/privileges, webhook idempotency, data preservation | Nothing external |
| Xcode StoreKit configuration file (`.storekit`, `StoreKitTest`) | Purchase UI, eligibility, interrupted and failed purchases, Ask to Buy, refunds, renewals, offline | A dev build **launched from Xcode.app** (not a command-line install); no App Store Connect |
| Sandbox Apple Accounts | Real server round trip, notifications, receipts/JWS; renewal speed default **1 month = 5 min**, up to **12 renewals**; billing retry 10 min, grace 5 min at that speed; **Clear Purchase History** resets trial eligibility | App record and products for the bundle ID; FORGE DEV backend |
| TestFlight | Release-like build in sandbox (no charges); renews **daily, up to 6 times** in a week regardless of duration | EAS or Xcode archive, production bundle ID |
| Production smoke after approval | Real purchase and immediate refund on the founder's Apple Account | Live app |

**Sources (Apple, 2026-11-03):** App Review Guidelines (2.1, 2.3, 3.1.1, 3.1.2, 4.8, 5.1.1) <https://developer.apple.com/app-store/review/guidelines/>; 5.1.1(v) account-deletion reference <https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/>; Schedule 2 & 3 (v127) <https://developer.apple.com/support/downloads/terms/schedules/Schedule-2-and-3-English.pdf>; Auto-renewable Subscriptions <https://developer.apple.com/app-store/subscriptions/>; HIG In-App Purchase <https://developer.apple.com/design/human-interface-guidelines/apple-in-app-purchase>; introductory offers <https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions> and <https://developer.apple.com/documentation/storekit/implementing-introductory-offers-in-your-app>; Billing Grace Period <https://developer.apple.com/help/app-store-connect/manage-subscriptions/enable-billing-grace-period-for-auto-renewable-subscriptions>; Reducing involuntary churn <https://developer.apple.com/documentation/storekit/reducing-involuntary-subscriber-churn>; notification types <https://developer.apple.com/documentation/appstoreservernotifications/notificationtype>; Family Sharing <https://developer.apple.com/documentation/storekit/supporting-family-sharing-in-your-app>; `AppStore.sync()`, `showManageSubscriptions`, `beginRefundRequest`, `appAccountToken` (StoreKit documentation); server notification URLs <https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/enter-server-urls-for-app-store-server-notifications>; In-App Purchase keys <https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases>; Small Business Program <https://developer.apple.com/app-store/small-business-program/>; subscription submission <https://developer.apple.com/documentation/appstoreconnectapi/submitting-subscriptions-and-subscription-groups-for-app-review>; StoreKit testing in Xcode <https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode>; sandbox settings <https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings>; TestFlight purchases <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight>; App privacy <https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy>.

## 12. Phase 8.2 cross-agent dependencies and conflicts

| # | Area / files | Owner | What Phase 9 needs | Risk if uncoordinated | Proposed contract |
| --- | --- | --- | --- | --- | --- |
| X1 | `src/auth/entry.ts`, `src/auth/AppStack.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` | Opus 1 | New entry kinds (`paywall`, `expired`, `verifying`, `lapsedWorkout`), new route groups, entitlement fact input | Two agents editing the one gate; a route left unprotected | Phase 9 supplies a pure `entitlementAccess()` and a typed `EntitlementFacts` input; Opus 1 reviews the single integration diff; a new route-inventory test guards every `app/**` route |
| X2 | Supabase schema and migrations (`supabase/migrations`) | Opus 1 | `forge_entitlements` (+ event log), a read RPC with server time, optional `forge_write` entitlement check | Migration ordering and privileges; touching the hardened `forge_write` | Phase 9 authors migration files and PGlite tests in its worktree; numbered after Opus 1's 8.2 files; Opus 1 applies to FORGE DEV only after founder approval; production only with E7-style approval |
| X3 | Edge Functions and secrets | Opus 1 / founder (remote) | Webhook receiver and entitlement refresh; purchase-service secret and webhook secret | Secrets in the wrong project; deploying to production early | Phase 9 writes and unit-tests the code; deployment by the approved owner, FORGE DEV first |
| X4 | Account deletion (`src/screens/you/DeleteAccount.tsx`, `src/auth/account-deletion.ts`, AppStack group) | Opus 1 | Subscription notice + Manage subscription link; reachable from the expired state; delete the purchase-service customer record | Expired users unable to delete their account (App Store requirement) | Opus 1 adds the route to the expired group and the copy slot; Phase 9 provides copy and the server cleanup hook |
| X5 | Sign-in / sign-out (`src/auth/session.ts`) | Opus 1 | Identify the purchase SDK with the Supabase user ID at sign-in; reset at sign-out | Entitlement of one account shown to another | Event hooks (`onSignedIn(userId)`, `onSignedOut()`) exposed by the session layer; billing module subscribes |
| X6 | Native build safeguards (`scripts/dev/ios-build.ts`, `scripts/dev/env-files.ts`, `scripts/dev/run-ios.ts`) | Opus 1 | Purchase SDK native module; purchase key in `.env.forge-dev`; production purchase key added to `productionMarkers` | dev:ios rejecting a valid build, or a production purchase key shipping in FORGE Dev unnoticed | Opus 1 extends the checks; Phase 9 documents the variable names and per-variant rules |
| X7 | Environment guard (`src/cloud/environment.ts`) | Opus 1 | Per-variant purchase configuration (FORGE Dev never uses production purchase keys/projects) | Sandbox and production mixed | Phase 9 adds `src/billing/environment.ts` reusing `APP_IDS`; no change to the Supabase guard |
| X8 | Sync engine (`src/cloud/errors.ts`, `transport.ts`, `sync.ts`) | Shared | `subscription` stop reason if server enforcement is approved | Misleading "sign-in" errors; retries hammering the server | Small additive change, reviewed by Opus 1 |
| X9 | `package.json` / `package-lock.json`, `app.json` plugins | Shared | Purchase SDK dependency (and plugin, if any); the version installable through CocoaPods at the time (10.x today) and, later, Swift Package Manager once RevenueCat drops CocoaPods | Lockfile conflicts; prebuild changes; iOS build breaking when CocoaPods support ends | Dependency added in one isolated commit after approval; integrated only onto verified Opus 1 commits; SPM migration planned jointly with Opus 1 (build pipeline owner) |
| X10 | FORGE DEV project and test accounts | Opus 1 | Disposable accounts for sandbox purchase tests; test entitlements | Tests against production | Phase 9 never touches FORGE DEV remotely; requests specific setup steps |
| X11 | Docs (`README.md`, `IMPLEMENTATION_STATUS.md`, `DEVELOPMENT_ENVIRONMENT.md`, `NATIVE_BUILDS.md`) | Split | Subscription sections; FORGE DEV now exists | Contradictory docs | Opus 1 updates environment docs; Phase 9 adds `docs/SUBSCRIPTIONS.md` and its own status rows |
| X12 | Expo Go daily use on production `.env` | Founder / Opus 1 | Gate must not lock the founder out before launch | Founder loses access to his own training in Expo Go | Gate enforced in Forge's own builds; founder and testers receive server-granted test or complimentary entitlements (section 15) |
| X13 | Entry screens `src/screens/entry/Welcome.tsx`, `Setup.tsx` | Opus 1 | Brand intro and feature pages before sign-in; new setup steps and the reveal after the restore offer | Conflicting edits to sign-in and restore flows | Phase 9 adds its own screens and routes; Welcome gains one entry seam ("Get started" → intro) and Setup one seam (the post-restore branch); Opus 1 reviews both seams |

**Integration rules.** Phase 9 work stays on its own branch based on `c509a69`. It is never rebased onto unfinished Opus 1 work; it is updated only to commits the founder marks verified and pushed, by fast-forward or an approved merge. Each Phase 9 stage that touches an X-row file lands only after Opus 1 has reviewed that diff.

## 13. Staged Phase 9 implementation roadmap

### 13.1 Order (one change from the preliminary structure)

| Stage | Preliminary | **Proposed** |
| --- | --- | --- |
| 9.0 | Audit and architecture | Audit and architecture (this report) |
| 9.1 | Subscription foundation | Subscription foundation (no native SDK, no UI change) |
| 9.2 | Onboarding and reveal | Onboarding and Forge Path reveal (no gate) |
| 9.3 | Paywall and access gate | **Apple purchase integration and paywall** (FORGE Dev, sandbox) |
| 9.4 | Apple purchase integration | **Hard access gate and expired experience** |
| 9.5 | Adversarial testing and launch readiness | Adversarial testing and launch readiness |

**Why swap 9.3 and 9.4.** (1) A gate must never be enabled before it can be satisfied by a verified purchase; otherwise testers (and the founder's Expo Go training on the production project) are locked out. (2) The paywall's required disclosures need live StoreKit data (localized price, trial eligibility); building it against fakes risks non-compliant copy. (3) The trusted pipeline (purchase → RevenueCat → Edge Function → `forge_entitlements`) is proven with real sandbox transactions before routing depends on it. (4) The gate changes Opus 1's entry architecture; doing it later lets Phase 8.2 (FORGE DEV, hardening) settle first.

Every stage: full suite (typecheck, lint, format, `npm test`, `test:ui`, export; food-library and branded checks), focused new tests, Opus 1 review of any cross-agent file (section 12), and **founder approval before commit**. Nothing reaches production until 9.5's checklist is approved.

### 13.2 Phase 9.1: Subscription foundation

- **Objective:** the entitlement contract and decision logic, fully tested, with no native dependency and no visible change.
- **New files:** `src/billing/entitlement.ts` (types, snapshot validation), `src/billing/access.ts` (pure `entitlementAccess()` with states, offline/clock rules), `src/billing/cache.ts` (per-user SecureStore snapshot), `src/billing/service.ts` (provider interface + in-memory fake), `src/billing/lapse.ts` (lapsed-workout marker, Stage 4 pattern), `supabase/functions/_shared/entitlement.ts` (pure normalization of RevenueCat subscriber JSON), draft `supabase/migrations/<after 8.2>_forge_entitlements.sql` with rollback and verify checks **(authored and PGlite-tested only; not applied anywhere)**, `docs/SUBSCRIPTIONS.md`.
- **Files changed:** none in the app.
- **Phase 8 dependencies:** X2 (migration numbering and review by Opus 1), X3 (deployment later).
- **Security risks:** default privileges exposing the table to `anon`; normalization mistakes granting access; clock logic errors.
- **Acceptance (automated):** decision-table tests for every state in 8.3 and scenario in 8.4 (including clock rollback, provisional window expiry, cancelled-but-active, grace, revoked); normalization tests from recorded RevenueCat payload fixtures; PGlite: RLS select-own, no insert/update/delete for `anon`/`authenticated`, cascade on account deletion, event idempotency; import-scan test proving `src/billing/**` cannot reach destructive repository calls.
- **Regression:** whole suite green; no snapshot or route changes.
- **Founder decisions before start:** F1, F3, F4, F5, F7, F10.
- **Done when:** all tests pass, Opus 1 has reviewed the migration draft, founder approves the commit.

### 13.3 Phase 9.2: Onboarding and Forge Path reveal

- **Objective:** the approved journey A–D on top of today's entry architecture, still ending in Home (no paywall yet).
- **New files:** `src/screens/onboarding/` (intro and feature pages, About you, Your training, Path reveal), `src/domain/onboarding/stage.ts` (stage machine, persisted `onboardingStage` and revealed program key), route files listed in `AppStack`.
- **Files changed:** `src/screens/entry/Welcome.tsx` and `Setup.tsx` (X13: Opus 1 review), `src/components/ProfileForm.tsx` onboarding mode (or retired in favour of the new steps), `src/auth/AppStack.tsx` route listing only (X1).
- **Reused unchanged:** `recommendProgram`, `trainingWeekdays`, `ProgramStats`, `WeekStrip`, `PhaseTimeline`, `WorkoutList`, `ExerciseLines`.
- **Security risks:** the reveal accidentally linking into `/forge-paths/*` (which offers Start); enrollment before entitlement.
- **Acceptance:** reveal equals `recommendProgram` output for every experience × goal × days combination (18 programs); no `enrollProgram` call anywhere in onboarding (test); restart at every step resumes at the same step with the same program; REFORGE visual review against a founder-approved onboarding reference (F15); VoiceOver order, Dynamic Type 200 %, compact 320 pt, light and dark.
- **Regression:** `setup-restore`, `entry-*`, `program-*`, `forge-paths`, `you-*` suites unchanged in behaviour.
- **Founder decisions:** F2, F13, F14, F15 (onboarding reference), 7.7A D1/D2/D5 if still open.
- **Done when:** device walkthrough on FORGE Dev and Expo Go accepted; founder approval.

### 13.4 Phase 9.3: Apple purchase integration and paywall (FORGE Dev, sandbox)

- **Objective:** real sandbox purchases verified end to end; paywall at the end of onboarding in FORGE Dev; **no gate for existing users yet**.
- **Prerequisites (founder / Opus 1):** App Store Connect items 11.5 for the chosen bundle IDs (F11), RevenueCat project and apps, In-App Purchase key, sandbox testers; FORGE DEV project live (8.2); Edge Functions deployed to FORGE DEV only by the approved owner; the SDK version chosen by what CocoaPods can install at that date (10.x until RevenueCat's pod publishes after Nov 7) or an agreed SPM path.
- **New files:** `src/billing/revenuecat.ts` (provider), `src/billing/environment.ts` (per-variant keys, mirroring `APP_IDS`), `src/screens/membership/Paywall.tsx`, `Verifying.tsx`, `supabase/functions/entitlement-refresh/`, `supabase/functions/entitlement-webhook/`.
- **Files changed:** `package.json`/lock (`react-native-purchases` only, after approval; X9), `src/auth/session.ts` sign-in/sign-out hooks (X5), `.env.example` / `.env.forge-dev.example` variable names (X11), `src/domain/membership.ts` and `MembershipCard` (real status, Manage subscription), `scripts/dev/*` extensions by Opus 1 (X6).
- **Security risks:** production keys in FORGE Dev; sandbox events written to production; trusting SDK results; finishing transactions before the backend records them (SDK posts first; refresh confirms).
- **Acceptance (automated):** provider fake/real contract tests; paywall disclosure tests (price most prominent, trial copy only when eligible, Restore, Terms, Privacy); Expo Go renders the paywall but can never grant access.
- **Acceptance (manual, sandbox on FORGE Dev):** first gate: the SDK builds and runs on RN 0.88; purchase with trial; ineligible account sees no trial; cancel during trial keeps access; Ask to Buy pending; interrupted purchase (kill app) recovers; restore on reinstall; restore under a second Forge account follows F3; accelerated renewals; refund via StoreKit testing.
- **Regression:** all entry, setup and account suites; `dev:ios` checks pass with the SDK.
- **Founder decisions:** F1 confirmation after the build gate, F9, F11, F12, F16.
- **Done when:** sandbox matrix passed and recorded; founder approval.

### 13.5 Phase 9.4: Hard access gate and expired experience

- **Objective:** enforce the approved rules for every state, with data preserved.
- **Files changed (cross-agent):** `src/auth/entry.ts`, `src/auth/AppStack.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` (X1); `src/screens/you/DeleteAccount.tsx` and deletion flow (X4: subscription notice, reachable when expired); optional `forge_write` enforcement and `subscription` stop reason (X2, X8; F10).
- **New files:** `src/screens/membership/Ended.tsx`, `BillingIssue.tsx`, grace banner, lapsed-workout notice; `tests/ui/route-inventory.test.tsx`.
- **Security risks:** a route left outside the groups; a start-up flash of the tabs before the decision; interplay with Stage 4 continuation; offline/clock logic.
- **Acceptance (automated):** routing tests for every route in every state (deep links included); entry-gate tests with real SQLite per state; data-preservation snapshot tests (9.3); lapsed-workout tests; expired screen actions (Restore, Manage, Export, Support, Privacy, Terms, Sign out, Delete account) reachable; sync refusal keeps the outbox.
- **Manual:** FORGE Dev sandbox lifecycle: trial → expire; paid → cancel → expire; billing retry with and without grace; refund; resubscribe restores everything; offline gym session across expiry; clock changes.
- **Founder decisions:** F4, F5, F6, F10 confirmed in behaviour.
- **Done when:** all of the above pass and Opus 1 has reviewed the gate diff; founder approval.

### 13.6 Phase 9.5: Adversarial testing and launch readiness

- **Objective:** prove no bypass and no data loss; prepare submission; production rollout under approval.
- **Work:** bypass matrix (8.9) executed on devices; purchase interruptions at each step; connectivity loss; account switching; reinstall; deep links from Mail/Safari; App Review package (demo account with server-granted entitlement and review notes explaining the account requirement; subscription review screenshot; "subscription required" in description; working Privacy/Terms/support URLs; App Privacy "Purchases" + RevenueCat); production checklist mirroring E7 (migration and functions to production, secrets, webhook URLs per environment, App Store Server Notifications to RevenueCat, rollback plan, monitoring of webhook failures); founder/tester complimentary entitlements in production (F12).
- **Done when:** founder signs off the checklist; first subscription submitted with the first binary.

## 14. Risk register and test strategy

### 14.1 Risk register

| ID | Risk | L | I | Mitigation | Proven by |
| --- | --- | --- | --- | --- | --- |
| R1 | A protected route reachable without entitlement (unlisted route, deep link, start-up flash) | M | H | Single entry decision; every route in a `Stack.Protected` group; `initializing` until the snapshot is known | Route-inventory test; per-state routing tests; device deep-link tests |
| R2 | Preview or onboarding re-entered after expiry | M | M | `first_entitled_at` from the server; never-entitled group only | Entry tests with expired snapshots |
| R3 | Training data lost or altered by expiry | L | **Critical** | Section 9 rules; billing modules can't reach destructive APIs | Table-snapshot tests per transition; import-scan test |
| R4 | Active workout lost at expiry | M | H | Lapsed-workout window (8.7) | UI tests; device walkthrough |
| R5 | Unauthorized long offline access via cache or clock | M | M | `access_until` + 72 h provisional cap + server-time anchor | Decision-table tests with skewed clocks |
| R6 | Paying users locked out by outages (RevenueCat, Supabase, network) | M | H | Cached snapshot valid to `access_until`; bounded provisional window; retries | Fault-injection tests; manual airplane-mode runs |
| R7 | Webhook spoofing, replay or out-of-order events | M | H | Header + HMAC with timestamp tolerance; event-id idempotency; always re-read subscriber | Edge Function unit tests with forged and replayed requests |
| R8 | Entitlement table readable or writable by clients | L | H | RLS select-own; revoke defaults; service-role writes only | PGlite privilege tests (Stage 3 pattern) |
| R9 | Sandbox and production crossed (keys, webhooks, projects) | M | H | Per-variant keys; webhook per environment; `productionMarkers` extended | dev:ios checks; config tests |
| R10 | App Review rejection (account before purchase, price prominence, missing links, reviewer blocked) | M | H | Section 11 checklist; Review Notes; demo account with entitlement | Pre-submission checklist sign-off |
| R11 | Account deletion unreachable or misleading for subscribers | M | H | Expired group includes deletion; Apple's subscription notice | UI tests in expired state |
| R12 | Subscription shared across Forge accounts | M | M | Apple intro rule; transfer policy F3 | Sandbox test with two accounts |
| R13 | RN 0.88 / SDK incompatibility | L–M | M | Build gate first in 9.3; fallback Option B | FORGE Dev build |
| R14 | Merge conflicts with Phase 8.2 (gate, session, scripts, lockfile) | H | M | Section 12 contracts; seams; isolated dependency commit | Opus 1 reviews; full suite on the integrated branch |
| R15 | Founder locked out of his own Expo Go training (production `.env`) | M | H | Gate off until 9.4 in Forge's own builds; complimentary entitlement before enabling | Pre-enable checklist |
| R16 | Misleading copy: "free app" texts, invented features | M | M | Replace `MembershipCard` copy and `membership.ts` comment; feature pages from README facts only | Copy review; UI tests |
| R17 | Vendor dependency (RevenueCat) policy or availability change | L | M | Forge-owned `forge_entitlements` contract; Option B fallback | Documented fallback |
| R18 | Privacy compliance (Purchases data, third-party processor) | M | M | App Privacy answers; Privacy Policy update; delete RevenueCat customer on account deletion | Checklist; deletion test |
| R19 | iOS dependency tooling shift: CocoaPods trunk read-only from Dec 2, 2026; RevenueCat 11.0.0 not installable through CocoaPods until after Nov 7; a later RevenueCat major drops CocoaPods | H | M | Pin a CocoaPods-installable version at 9.3 time; plan Swift Package Manager support with Opus 1 before any upgrade that requires it | 9.3 build gate; Opus 1 review of the build pipeline |

### 14.2 Test strategy

| Layer | Tooling (existing) | Phase 9 coverage |
| --- | --- | --- |
| Pure logic | `tsx --test` | Access decision table, normalization, onboarding stage machine, lapse marker |
| Database | PGlite with Supabase roles and claims (`tests/server-hardening.test.ts` pattern) | Entitlement tables, RLS, privileges, idempotency, cascade, optional `forge_write` enforcement |
| Edge Function logic | Pure modules tested under Node; thin Deno wrappers | Header/HMAC verification, replay window, event mapping, refresh |
| UI (jest-expo, real SQLite) | `entry-gate`, `entry-routing` patterns | Every state × every route; paywall disclosures; expired actions; lapsed workout; onboarding resume |
| Native | FORGE Dev with StoreKit configuration file | Purchase, pending, failure, refund, renewal speeds |
| Sandbox | Sandbox Apple Accounts, accelerated renewals, Clear Purchase History | Full lifecycle with webhooks into FORGE DEV |
| TestFlight | Release build in sandbox | Pre-submission rehearsal |
| Adversarial (9.5) | Manual + scripted | Bypass matrix (8.9), interruptions, clock, offline, account switching |

CI (`.github/workflows/ci.yml`) runs on `feat/**`; if the founder wants CI on Phase 9 work, the branch should be renamed or published as `feat/forge-phase9-…` (no push without approval).

## 15. Open founder decisions (only those genuinely required)

| # | Decision | Recommendation | Needed before |
| --- | --- | --- | --- |
| **F1** | Purchase architecture | **RevenueCat + Forge-owned entitlement mirror in Supabase** (section 7); fallback `expo-iap` + own server | 9.1 |
| **F2** | Where the account sits | **Keep account creation before personalization** (A → B → account → C → D → E → F) and accept the documented 5.1.1(v) review risk, explained in Review Notes | 9.2 |
| **F3** | One Apple subscription ↔ Forge accounts | RevenueCat restore behaviour **"Transfer if there are no active subscriptions"** (an active subscription never moves; a churned customer can subscribe again under a new account). Alternative: **"Keep with original App User ID"**, the strictest anti-sharing, at the cost of locking out a returning customer who uses a new Forge account on the same Apple Account | 9.3 |
| **F4** | Offline / outage tolerance after `access_until` | **72 h provisional window**, only when renewal was expected; none after cancellation, expiry or refund | 9.1 |
| **F5** | Workout in progress when access ends | **Allow finishing it** (12 h, Stage 4 parity), no sync, nothing auto-finished | 9.1 |
| **F6** | Expired users' own data | **Allow Export backup** from the expired screen (read-only) besides the mandatory account deletion | 9.4 |
| **F7** | Billing Grace Period | **Enable, 16 days, "Only Paid to Paid Renewals"** (protects paying members; doesn't extend free trials) | 9.3 (App Store Connect) |
| **F8** | Family Sharing (irreversible once on) | **Off at launch** | 9.3 |
| **F9** | Paywall presentation vs Apple's "billing amount most prominent" rule | Keep the approved offer, but render **"$6.99/month" as the most prominent price** with "7 days free" as the clear, secondary trial line (e.g. "Start your 7-day free trial · then $6.99/month, cancel anytime"); approve a paywall visual reference | 9.3 |
| **F10** | Server-side enforcement on cloud sync for non-entitled accounts | **Yes, in 9.4**, writes only, non-destructive `subscription` stop; deletion never gated | 9.4 |
| **F11** | Purchase testing for FORGE Dev | StoreKit configuration file for daily work **and** a separate App Store Connect record for `com.lsaint06.forge.dev` with a mirrored product for sandbox end-to-end tests | 9.3 |
| **F12** | Founder, testers and App Review | **Server-granted complimentary entitlements** (never a client switch); demo account with one for App Review, plus instructions to create a new account to see onboarding and the paywall | 9.4 / 9.5 |
| **F13** | Equipment | **No new question, no engine change**; show the program's own equipment list in the reveal | 9.2 |
| **F14** | After purchase | **Offer "Start your Forge Path"** through the existing Start sheet (start date); never automatic (7.7A D6) | 9.2 |
| **F15** | Legal and design inputs | Publish **Privacy Policy** and **Terms of Use** (Apple standard EULA or custom) and a **support** address/URL; approve onboarding and paywall visual references | 9.2 (design) / 9.3 (legal) |
| **F16** | Commercial setup | Product name ("Forge Membership"), product ID, $6.99 USD with Apple's equalized international prices, **Small Business Program** enrollment | 9.3 |

## 16. Final recommendation and proposed first implementation stage

**Recommendation.** Build Forge's subscription as **Option A**: RevenueCat executes purchases and validates with Apple, Forge's Supabase backend holds the only entitlement the app trusts, and the existing single entry decision enforces it. Reuse the existing Forge Paths engine and program views for a genuine, read-only reveal. Keep accounts before personalization. Treat expiry strictly as a routing decision, never a data operation, with a bounded way to finish an in-progress workout.

**First stage: Phase 9.1, Subscription foundation** (section 13.2): pure entitlement model and access decision, per-user snapshot cache, provider interface with a fake, lapsed-workout marker, server normalization module, and a **draft** entitlements migration verified only in PGlite. No native dependency, no UI change, no remote access, no migration applied. It requires decisions **F1, F3, F4, F5, F7, F10** and Opus 1's review of the migration draft.

## Statements

- **Application files modified:** none. The repository worktree is byte-identical to `c509a69`.
- **Remote systems:** no Supabase project (FORGE DEV or production), App Store Connect, RevenueCat or Expo account was accessed or changed. Read-only public web pages and npm registry metadata were consulted for research; `git` remote-tracking refs were only read (no fetch, push or write).
- **Commits or pushes:** none.
- **Worktree clean:** yes (`git status` empty, no stashes). The primary engineering worktree was not touched.
- **Ready for Phase 9.1 approval:** yes, subject to the founder decisions listed for 9.1.
