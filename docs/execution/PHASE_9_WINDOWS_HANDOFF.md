# Phase 9 — Windows handoff (Opus 2)

**Update (2026-11-04, Phase 9.2):** the founder approved Phase 9.2 (onboarding and the Forge Path reveal, no subscription restriction) after reviewing it on his iPhone, and authorized its commit and push to this branch: see [`docs/ONBOARDING.md`](../ONBOARDING.md). It is committed **on its own**. At the founder's instruction, Opus 1's verified `5f07c9b` was integrated earlier as a **staged merge, not committed** (no conflicts; the nine files are identical to `5f07c9b`). It stays staged and uncommitted in the worktree: no merge was authorized with Phase 9.2.

**Update (2026-11-04, Phase 9.1):** the founder approved Phase 9.1, the independent local foundation (RevenueCat + Forge Supabase server-verified entitlements; no offline or workout window). Committed and pushed as `e9d3e59`: see [`docs/SUBSCRIPTIONS.md`](../SUBSCRIPTIONS.md). Still nothing is wired into the app, no dependency was added, nothing remote was touched, and the entitlement SQL is a draft (`supabase/drafts/`) never applied anywhere.

**Status (2026-11-03):** Phase 9.0 (audit and architecture) is complete. **Phase 9.1 implementation is NOT approved.** Nothing in Phase 9 has been implemented: no application code, dependency, database migration, Supabase project, App Store Connect, RevenueCat or Expo setting has been created or changed.

**This document and the audit are the complete record.** The Copilot conversation history, session files and research notes from the Mac do **not** travel through Git. A new session on Windows must start from this file, [`AGENTS.md`](../../AGENTS.md) and the audit, and must confirm anything else with the founder.

## 1. Git baseline

| | |
| --- | --- |
| Repository | `https://github.com/Lsaint06/Forge-App` (public) |
| Phase 9 branch | `agents/forge-phase9-agent-init-check`, published to `origin` with this commit (upstream `origin/agents/forge-phase9-agent-init-check`) |
| Baseline | `c509a69a2e65ee2ea0a2340727e72bdbf0c4a397` — "fix(splash): charcoal native root view, no flash before the REFORGE intro (Phase 8.1)", the founder-verified commit on `feat/forge-paths-foundation` |
| Phase 9 commits | One: the Phase 9.0 documentation commit that adds this file and the audit, directly on top of `c509a69`. Find it with `git log -1 -- docs/execution/PHASE_9_WINDOWS_HANDOFF.md` |
| Difference from the baseline | Exactly two new files: `docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md` and this file. No application file differs from `c509a69` |
| Opus 1 (Phase 8) | Branch `feat/forge-paths-foundation`, at `5f07c9b` — "fix(dev): honest schema checks on new Supabase projects, FORGE DEV preparation (Phase 8.2)", pushed. **Integrated into the Phase 9 worktree on 2026-11-04 as a staged, uncommitted merge**, at the founder's instruction (Phase 9.2) |
| `main` | `16993bd` (initial README). Never push to it |
| Mac worktree (history) | Phase 9 ran in its own Git worktree (`Forge-App.worktrees/forge-phase9-agent-init-check`) beside Opus 1's checkout; Opus 1's worktree was never modified |
| CI | `.github/workflows/ci.yml` runs on pushes to `main` and `feat/**` and on pull requests to `main`; it does **not** run on `agents/**` branches |

**Rule for updating the Phase 9 branch:** take in Opus 1's work only after the founder confirms a specific commit as verified and pushed, by fast-forward or a founder-approved merge. Never rebase onto, or merge, unfinished Phase 8 work.

## 2. Current Phase 9 status

| Stage | Status |
| --- | --- |
| 9.0 Audit and architecture | **Complete** — `docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md` |
| 9.1 Subscription foundation | **Approved 2026-11-04; committed and pushed (`e9d3e59`)** — `docs/SUBSCRIPTIONS.md`. F3, F4, F5, F7, F10 remain open; F4 and F5 apply as "none" meanwhile |
| 9.2 Onboarding and Forge Path reveal | **Approved 2026-11-04 (F2, F13, F14, F15); premium redesign founder-approved and committed 2026-11-04.** Stage A (the landing page) redesigned the same day without statistics; the founder chose **Emergence** from three concepts, and its typography was unified and the headline's period removed (the other concepts and the picker deleted) — `docs/ONBOARDING.md`. No paywall or restriction |
| Android visual testing | **Operational 2026-11-04** — `docs/execution/PHASE_9_VISUAL_TESTING.md`. It found an Android Expo Go guard bug for Opus 1 (section 1 there) |
| 9.3 – 9.5 | Not started; the order and scope are proposals (section 5) |

Forge today has no paywall, purchase library, entitlement storage or subscription flag. The only premium touchpoints are the "free plan" placeholder `src/domain/membership.ts` and `MembershipCard` (audit section 6.7).

## 3. The full audit

- **Path:** [`docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md`](../audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md)
- **Preserved verbatim** from the original report written on the Mac: 616 lines, 84,597 bytes, LF line endings.
  - SHA-256 of the file (LF): `6e9d379da00aaf2ae6538276383eeb8796952e3be19b2cbeab5535108227d266`
  - Git blob id (independent of Windows line-ending conversion): `178a98018d842894ec100928bd800888aaf706f5` — check with `git rev-parse HEAD:docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md`
- **Two statements in it describe the moment it was written:** section 2 says the report was "written outside the repository", and "Statements" says no commits or pushes had been made. Both were true then; the only later change is this founder-authorized documentation commit.
- **Section map:**

  | # | Section | # | Section |
  | --- | --- | --- | --- |
  | 1 | Executive summary | 9 | Data-preservation strategy |
  | 2 | Worktree, branch, HEAD, status | 10 | Onboarding and paywall journey |
  | 3 | Approved product requirements | 11 | Apple configuration and testing |
  | 4 | Existing onboarding | 12 | Phase 8.2 cross-agent dependencies (X1–X13) |
  | 5 | Forge Paths reveal feasibility | 13 | Staged roadmap |
  | 6 | Auth, navigation, persistence (6.1–6.11) | 14 | Risk register (R1–R19) and test strategy |
  | 7 | Integration options and recommendation | 15 | Open founder decisions (F1–F16) |
  | 8 | Entitlement lifecycle and access control | 16 | Final recommendation; then Statements |

## 4. Founder requirements (approved — authoritative)

1. Subscription-only: **one auto-renewable monthly subscription at $6.99 USD/month**. No annual plan, no tiers; one subscription or trial unlocks everything.
2. **Seven-day Apple introductory free trial for eligible subscribers**, started only through Apple's purchase flow and granted only after the entitlement is verified. No locally timed trial (local storage, device clock or a bare database timestamp).
3. **No permanent free tier.**
4. Apple is the source of truth for billing; **Forge's backend interprets and enforces entitlements**.
5. Price, trial terms, renewal and cancellation are disclosed before purchase confirmation.
6. **Personalized onboarding and a real Forge Path preview before subscription**: welcome and brand ("BUILT THROUGH DISCIPLINE"), discovery of real features only, personalization through existing preferences, and the genuine output of the existing engine (no second Paths engine; no engine redesign without approval). The preview can be inspected but allows no logging and no tabs.
7. **No main application access without a valid entitlement**: Home, Train, Nutrition, Progress, You, Forge Paths, active workout logging and every other subscriber feature. No bypass through onboarding, deep links, tabs, old sessions, restarts or local state.
8. **No Forge Path preview after confirmed subscription expiration**; the preview belongs only to the original onboarding journey.
9. **Preserve all user data on subscription expiration** (workouts, sets, plans, progress, measurements, nutrition, settings, everything user-created). Expiration is never deletion; data is available again after resubscribing.
10. Subscription management, purchase restoration, support, privacy and account deletion stay reachable.
11. **No automatic 12-hour workout extension and no 72-hour offline entitlement extension without founder approval.**

**Behaviour until the founder decides otherwise:** access ends at the verified expiration (`access_until`); a workout in progress at that moment stays saved and untouched in SQLite and resumes after resubscribing; offline use is allowed only until the server-verified expiration; no extra window of any kind.

## 5. Recommended roadmap (proposal, not approved)

| Stage | Proposed scope |
| --- | --- |
| **9.1 Subscription foundation** | Pure entitlement model and access decision (`src/billing/*`), per-user snapshot cache, provider interface with a fake, server normalization module, a **draft** entitlements migration tested only in PGlite (never applied). No native dependency, no UI change, no remote access |
| 9.2 Onboarding and Forge Path reveal | New REFORGE onboarding steps (asking days a week), read-only reveal built from `recommendProgram` and the existing program components; no gate |
| 9.3 Apple purchase integration and paywall | RevenueCat SDK in FORGE Dev, sandbox purchases verified end to end through FORGE DEV, compliant paywall; still no gate |
| 9.4 Hard access gate and expired experience | Entry states and route groups, expired and billing-issue screens, account deletion reachable, data-preservation tests |
| 9.5 Adversarial testing and launch readiness | Bypass matrix, lifecycle sandbox runs, App Review package, production checklist |

The audit proposes running purchase integration (9.3) **before** the gate (9.4), the reverse of the founder's preliminary order, so that a gate is never enabled before it can be satisfied (audit 13.1). This reordering is itself a proposal.

**If 9.1 is approved before F4/F5 are decided:** build the provisional-offline and finish-workout windows as parameters that default to **off (zero)**, matching section 4.

## 6. Unresolved founder decisions (proposals only)

| # | Decision | Opus 2's proposal | Needed before |
| --- | --- | --- | --- |
| F1 | Purchase architecture | RevenueCat + Forge-owned entitlement mirror in Supabase; fallback `expo-iap` + own server | 9.1 |
| F2 | Account placement | Keep account creation before personalization; explain in App Review notes | 9.2 |
| F3 | One Apple subscription across Forge accounts | RevenueCat "Transfer if there are no active subscriptions"; alternative "Keep with original App User ID" | 9.3 |
| F4 | Offline/outage window after expiration | **Proposal:** 72 h only when renewal was expected. **Not approved**; default none | 9.1 |
| F5 | Workout in progress when access ends | **Proposal:** finish it within 12 h (Stage 4 pattern). **Not approved**; default: saved and resumed after resubscribing | 9.1 |
| F6 | Expired users' own data | Allow Export backup from the expired screen | 9.4 |
| F7 | Apple Billing Grace Period | Enable, 16 days, paid-to-paid renewals only | 9.3 |
| F8 | Family Sharing (irreversible) | Off at launch | 9.3 |
| F9 | Paywall layout vs Apple's "billing amount most prominent" rule | "$6.99/month" most prominent, "7 days free" secondary; approve a visual reference | 9.3 |
| F10 | Server-side refusal of cloud sync for lapsed accounts | Yes in 9.4, non-destructive, never blocking deletion | 9.4 |
| F11 | Purchase testing for FORGE Dev | StoreKit file plus a separate App Store Connect record for `com.lsaint06.forge.dev` | 9.3 |
| F12 | Founder, testers, App Review access | Server-granted complimentary entitlements, never a client switch | 9.4/9.5 |
| F13 | Equipment | No new question or engine change; show the program's equipment in the reveal | 9.2 |
| F14 | After purchase | Offer "Start your Forge Path" through the existing Start sheet | 9.2 |
| F15 | Legal and design inputs | Privacy Policy, Terms of Use, support address; onboarding and paywall references | 9.2/9.3 |
| F16 | Commercial setup | Product name and ID, $6.99 price point, Small Business Program | 9.3 |

Decisions required to start 9.1: **F1, F3, F4, F5, F7, F10**, plus explicit approval of 9.1 itself.

## 7. RevenueCat and Supabase integration considerations

Verified on 2026-11-03; re-check versions before installing anything.

**RevenueCat (`react-native-purchases`)**
- Latest is 11.0.0 (peer `react-native >= 0.80`), but its iOS pod is unpublished until after the CocoaPods trunk freeze (Nov 1–7, 2026); RevenueCat's release notes say **"Expo apps should stay on 10.x for now"** (latest 10.x: 10.16.0).
- **CocoaPods trunk becomes read-only on December 2, 2026**, and a later RevenueCat major drops CocoaPods for Swift Package Manager. Forge's iOS build pipeline (Opus 1) installs pods, so this needs a joint plan (audit R19, X9).
- No published New Architecture statement: the first 9.3 gate is a FORGE Dev build that compiles and runs on React Native 0.88.
- In Expo Go the SDK runs in **Preview API Mode** (JavaScript mocks); real purchases need a development build. **SDK results must never grant access.**
- App User ID = the Supabase user UUID (`logIn` at sign-in; `logOut` at sign-out clears the cached customer). RevenueCat then sets Apple's `appAccountToken` automatically.
- Webhooks: authorization header plus HMAC (`X-RevenueCat-Webhook-Signature`, over the raw body), up to 5 retries over about 80 minutes, event `id` reused on retries for idempotency; after each webhook re-read `GET /v1/subscribers/{app_user_id}` with the secret key (server only). Separate webhook integrations per environment: sandbox → FORGE DEV, production → production.
- App Store Server Notifications V2 can be pointed at RevenueCat for both environments; the In-App Purchase key is required.
- Pricing: free up to $2,500 monthly tracked revenue, then 1 %.

**Supabase**
- Proposed objects: `forge_entitlements` (one row per account, RLS select-own only, all default privileges revoked from `anon`/`authenticated`, service-role writes), an event table for idempotency, Edge Functions `entitlement-refresh` (caller's JWT) and `entitlement-webhook` (no Supabase JWT from RevenueCat, so its own verification; check current Supabase docs for how to disable JWT verification per function).
- **Apple's official verifier (`@apple/app-store-server-library`) fails on hosted Edge Functions** (`supabase/edge-runtime` issue #761); irrelevant with RevenueCat, critical for the `expo-iap` fallback.
- Migrations and remote deployment belong to Opus 1 and the founder; production needs explicit approval (E7-style).

**Testing**
- StoreKit configuration files only apply when the app is launched from Xcode.app (not from `npm run dev:ios`).
- Sandbox: 1 month renews every 5 minutes, up to 12 times; Clear Purchase History resets trial eligibility.
- TestFlight renews daily, up to 6 times.

**Apple rules that shape the work:** billing amount most prominent; Restore Purchases on the paywall; Privacy Policy and Terms links in the app and metadata; account deletion reachable with a notice that Apple billing continues; App Review needs a demo account with an active entitlement; the first subscription is submitted with the first binary; Family Sharing can't be turned off.

## 8. Dependencies on Opus 1's Phase 8.2 work

- **FORGE DEV Supabase project** (exists; configured by Opus 1): needed for any end-to-end entitlement test; Phase 9 never changes it remotely.
- **Schema and migrations:** Phase 9 migrations are authored after Opus 1's and reviewed by Opus 1; Stage 3 hardening was not deployed at `c509a69`. Commit `5f07c9b` changed `supabase/verify/schema_checks.sql`, `tests/server-hardening.test.ts`, `tests/verify-sql.test.ts`, `scripts/dev/*`, `docs/DEVELOPMENT_ENVIRONMENT.md` and `IMPLEMENTATION_STATUS.md`.
- **Edge Function deployment and secrets** (RevenueCat secret, webhook secrets): by the approved owner, FORGE DEV first.
- **Native build pipeline** (`npm run dev:ios`, Mac only): built-app checks, production-value scan, `.env.forge-dev` validation, CocoaPods → Swift Package Manager.
- **Authentication and account infrastructure:** sign-in/sign-out hooks, entry gate, account deletion copy and reachability.
- **On Windows:** iOS builds need macOS and Xcode, or EAS (not yet linked). Purchase integration (9.3) depends on one of them; 9.1 does not.

## 9. Files and modules requiring cross-agent coordination

| Row | Files | Why Phase 9 needs them |
| --- | --- | --- |
| X1 | `src/auth/entry.ts`, `src/auth/AppStack.tsx`, `app/_layout.tsx`, `app/(tabs)/_layout.tsx` | Entitlement fact and new entry states and route groups |
| X2 | `supabase/migrations/*`, `supabase/verify/schema_checks.sql`, `supabase/rollback/*` | Entitlement tables; optional `forge_write` enforcement |
| X3 | `supabase/functions/*` (new) and project secrets | Webhook and refresh functions |
| X4 | `src/screens/you/DeleteAccount.tsx`, `src/auth/account-deletion.ts` | Subscription notice; reachable when expired |
| X5 | `src/auth/session.ts` | Purchase SDK identify/reset on sign-in/sign-out |
| X6 | `scripts/dev/ios-build.ts`, `scripts/dev/env-files.ts`, `scripts/dev/run-ios.ts` | Native SDK, purchase keys in `.env.forge-dev`, production-key scan |
| X7 | `src/cloud/environment.ts` (unchanged; reused) | Per-variant purchase configuration |
| X8 | `src/cloud/errors.ts`, `src/cloud/transport.ts`, `src/cloud/sync.ts` | Non-destructive `subscription` stop reason (if F10) |
| X9 | `package.json`, `package-lock.json`, `app.json` | Purchase dependency, CocoaPods/SPM |
| X10 | FORGE DEV project, test accounts | Sandbox tests |
| X11 | `README.md`, `IMPLEMENTATION_STATUS.md`, `docs/DEVELOPMENT_ENVIRONMENT.md`, `docs/NATIVE_BUILDS.md` | Subscription documentation; FORGE DEV now exists |
| X12 | Expo Go on the production `.env` | The founder must never be locked out of his own training. Android Expo Go is refused today (`docs/execution/PHASE_9_VISUAL_TESTING.md`, section 1) |
| X13 | `src/screens/entry/Welcome.tsx`, `src/screens/entry/Setup.tsx` | Intro, feature pages and new setup steps |

Phase 9-owned new modules (proposed): `src/billing/*`, `src/screens/onboarding/*`, `src/screens/membership/*`, `src/domain/onboarding/*`, `docs/SUBSCRIPTIONS.md`.

## 10. Resuming on Windows (new Opus session)

1. **Read first:** `AGENTS.md`, this file, then audit sections 1, 3, 8, 9, 12, 13 and 15.
2. **Ask the founder** whether Phase 9.1 is approved, which of F1, F3, F4, F5, F7 and F10 are decided, and which Opus 1 commit is the latest verified one. Do not infer any of these.
3. **Get the branch without disturbing anyone's checkout.** In PowerShell, in the existing clone (`C:\Users\LStAm\source\repos\Forge-App`, per `AGENTS.md`):
   ```powershell
   git status                      # read only; never discard or reset anyone's changes
   git fetch origin
   git worktree add --track -b agents/forge-phase9-agent-init-check ..\Forge-App.worktrees\forge-phase9 origin/agents/forge-phase9-agent-init-check
   cd ..\Forge-App.worktrees\forge-phase9
   ```
   If that local branch already exists, use `git worktree add ..\Forge-App.worktrees\forge-phase9 agents/forge-phase9-agent-init-check` instead. Alternatively clone into a separate folder and run `git switch agents/forge-phase9-agent-init-check`.
4. **Verify before doing anything:**
   ```powershell
   git status                                                  # clean
   git log --oneline -2                                        # Phase 9.0 docs commit, then c509a69
   git diff --stat c509a69 HEAD                                # only the two docs files
   git rev-parse HEAD:docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md   # 178a98018d842894ec100928bd800888aaf706f5
   git rev-parse --abbrev-ref --symbolic-full-name "@{u}"     # origin/agents/forge-phase9-agent-init-check
   ```
   If anything differs, stop and report to the founder.
5. **Only after approval, set up the toolchain:** Node 24 (`engines`: `>=24 <25`; CI uses 24) and `npm.cmd ci`. Then run the checks: `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd test`, `npm.cmd run test:ui`, `npm.cmd run export`. The first start or export downloads the branded-food catalogue (about 204 MB). Prettier expects LF line endings; if `format:check` flags every file, check `git config core.autocrlf` before changing anything.
6. **Platform limits:** Phase 9.1 (pure logic, SQLite and PGlite tests) works on Windows. iOS builds (`npm run dev:ios`) need a Mac; purchases can't be tested in Expo Go.

**Guardrails (unchanged):**
- **Process:** no implementation until approved; no dependency installs without approval; commit only with founder approval, as Conventional Commits ending in `(Phase 9.x)`.
- **Git:** never touch Opus 1's worktree or branch; never push to `main` or `feat/forge-paths-foundation`; no force pushes; no merges or rebases onto unverified work.
- **Systems and secrets:** no remote database, App Store Connect, RevenueCat or production configuration changes; no secrets or keys in the repository.

At the end of every significant update, follow `AGENTS.md` (the PowerShell boot command and the Expo Go note).
