# Phase 8.4: readiness milestones M1–M6, completion audit

**Date:** Nov 5, 2026.

**Branches** (pushed; nothing merged):
- `feat/sdk58-alignment` (M1), from `f7734fe`;
- `feat/phase8-readiness` (M2–M6), stacked on it.

**CI:** "Validate FORGE" ran on every pushed commit.

**Evidence rule (from the 8.4A audit §7):** a gate passes only on evidence from the device or build it names. Code and automated tests make a gate *ready to verify*, never *passed*.

## 1. What was delivered

| Milestone | Commit | What | Verified by |
| --- | --- | --- | --- |
| **M1:** Expo SDK 58 alignment | `5760abd` | The 16 packages at SDK 58's own versions; Expo Doctor 20/20; one copy of each | Typecheck, lint, format; logic and UI suites; iOS and Android exports; Expo's pipeline: no native change; CI #108 |
| **M1:** iOS 27 status bar | `a08dfd0` | `UIViewControllerBasedStatusBarAppearance`, plus every native-stack screen stating Forge's style (iOS builds only; Expo Go and Android unchanged) | New logic and UI tests, mutation-checked; the plist key is the only native change; CI #108 |
| **M2:** iOS tooling and guards | `7290b5f` | `dev:ios --release --simulator`; the SDK-alignment test; the status bar's System case; [the post-update device checklist](../FORGE_DEV_SDK58_CHECKLIST.md) | Tests, mutation-checked; the command refuses safely on Windows. **Not run on a Mac**; CI #109 |
| **M3:** Android readiness | `989c11f` | Keyboard padding on Android (screens, sheets, sign-in); Android release-config guards; [ANDROID.md](../ANDROID.md) | Tests, mutation-checked; exports; no native change; CI #110. **No Android device or emulator** |
| **M4:** Store infrastructure | `e5baa6e` | Store policy in the release check; the app-icon note; the iOS privacy manifest guard | Tests; `release:check` |
| **M5:** Production and privacy | `413b0bd` | The data inventory, draft store answers, gaps and the G-PROD checklist ([M5 review](PHASE_8_4_M5_PRODUCTION_PRIVACY.md)) | Review of code and earlier audits |
| **M6:** This audit | This commit | The matrix below, the 8.4A roadmap update | — |

**Corrections to earlier records:**
- **Phase 8.4C-0** said R8 is off for Android release builds. Expo SDK 58's template turns it on (RELEASE.md §11 and ANDROID.md §1, corrected).
- **Phase 7B WP6** recorded Android keyboard avoidance as off "(window resize)". That predates enforced edge-to-edge; fixed in M3.

## 2. Readiness matrix

Status keys:
- **Ready to verify:** the repository side is done.
- **Open:** work or a decision remains.
- **Blocked:** it needs something external first.
- **Passed:** device evidence exists.

| Gate | iOS | Android | Next evidence |
| --- | --- | --- | --- |
| **G-SIGN** Signing and identity | Ready to verify (8.4B + M4 store policy). No credentials or builds | Ready to verify. No upload key or builds | The first `preview` builds (approvals: EAS link, Apple credentials, upload key) |
| **G-ENV** Environment isolation | Ready to verify: preview bundles carry no production value (re-scanned at M1 and M3) | Same | FORGE Preview signs in to FORGE DEV only, on each platform |
| **G-PLAT** Platform behaviour (new) | **Ready to verify:** iOS 27 status bar; Release builds only. The iPhone on iOS 26.6.2 and an iOS 27 Simulator | **Open:** the keyboard fixed in code; back, edge-to-edge and notifications to check; large screens (D-A3) | [FORGE_DEV_SDK58_CHECKLIST.md](../FORGE_DEV_SDK58_CHECKLIST.md) Part 3 and Part 6; [ANDROID.md](../ANDROID.md) §6 |
| **G-AUTH** Sign-in and session recovery | Partly passed: FORGE Dev email sign-in (8.3). Re-check after SDK 58 (K1) | None | Checklists; Android A1–A3 |
| **G-OFF / G-SYNC / G-WORK** Offline, sync, workouts | Partly passed before SDK 58 (8.3C). **Re-verify on the updated build** | None | SDK 58 checklist Part 4; Android A8 and A10 |
| **G-NOTIF** Notifications | Defined (8.3C RT1–RT6); re-check after SDK 58 | **Open:** inexact alarms and default importance (D-A1, D-A2) | Device checks; Android A4 |
| **G-DEL** Deletion | Implemented in the app; live test pending (A2). **Blocked for the App Store:** Apple-only deletion and revocation (E8, D3) | Implemented in the app. **Open:** Play's web deletion page | M5 §4 |
| **G-PRIV** Privacy | **Open:** no policy and no in-app link. Inventory and drafts ready (M5 §2–§3). Privacy manifest gathered by the build and pinned; confirm on the first upload | **Open:** policy, link, Data safety form | M5 §6 |
| **G-POLICY** Store policy | Export compliance enforced; iPhone only | Target API 36 (tested). 16 KB: `node_modules` libraries fine, Maven libraries on the first AAB. Health declaration and content rating open; the 12-tester closed test if the account is personal | First AAB; Play forms |
| **G-DIAG** Diagnostics | Store consoles only; decision open | Same | M5 §5 |
| **G-A11Y** Accessibility and layout | Unchanged since 8.4A | Unchanged | Device passes |
| **G-MON** Monetization | Engineer #2 | Engineer #2 | RELEASE.md §10 |
| **G-PROD** Production | Not started; builds locked | Same | M5 §6 |

## 3. Blockers, in order

1. **Founder approvals for the first builds:** EAS linking, Apple credentials, the Android upload key, test accounts (A2), Android device or emulators (ANDROID.md §5).
2. **Device verification of M1 and M3:**
   - the updated FORGE Dev on the iPhone;
   - an iOS 27 Simulator;
   - a first Android device build.
3. **Privacy policy and its in-app link** (both stores), the web deletion page (Play), and the store forms.
4. **Apple-only account deletion and Apple revocation** (E8, D3): server and app work, before the App Store.
5. **G-PROD** on the production project, then the production pin (8.4F).

## 4. Decisions for the founder

| # | Decision | Recommendation |
| --- | --- | --- |
| D-M1 | Merge order: `feat/sdk58-alignment`, then `feat/phase8-readiness`, into `feat/forge-paths-foundation` | After the iPhone and Simulator checks. Engineer #2's branch overlaps only in `src/auth/AppStack.tsx`, and a simulated merge is clean |
| D-A1…D-A5 | Android rest-alert timing and visibility, large screens, `SYSTEM_ALERT_WINDOW`, test devices | [ANDROID.md](../ANDROID.md) §4 |
| D-P1 | Privacy policy: text, host and address; then the in-app link | M5 §3 |
| D-P2 | Crash reporting | Store consoles for internal testers; decide before external testers |
| D-P3 | Remove the unused Face ID purpose string: `faceIDPermission: false` on expo-secure-store. Forge never uses biometrics | Yes, in its own reviewed commit with a native-config check |
| D-P4 | The launch screen's status-bar icons follow the phone's mode for a split second (`UIStatusBarStyle` default, unchanged by M1). Light icons always: `UIStatusBarStyleLightContent` | Optional polish; verify on a Release build |
| C-00b | The app icon | Needed before external testers and store listings |

## 5. Engineer #2 (Phase 9)

- **Untouched.** Their worktrees were only read:
  - `forge-phase9-new` is unchanged at HEAD `5d37c4f`, with `MERGE_HEAD` `5f07c9b` and nine entries;
  - `forge-integration-p92` moved to `d208e4e` on its own during this work.
- **Overlap with this work:** only `src/auth/AppStack.tsx`; a simulated merge with `a08dfd0` is clean.
- **Their onboarding** asks for existing profile fields only, so the privacy inventory holds.
- **RevenueCat:** add it after merging the SDK 58 set, so its native pods build against React Native 0.88.1. Purchase data then joins the privacy answers.

## 6. Recommendation on Phase 8

**Phase 8's repository work for a private beta is complete.** Builds, identities, environment locks, release and store checks, SDK alignment, the iOS 27 fix, Android readiness and the documentation are in place. **Phase 8 shouldn't close yet,** because its gates need evidence the repository can't produce:
- the device checks on the updated FORGE Dev and an iOS 27 Simulator;
- the first Android device build;
- the first signed `preview` builds on both platforms.

**Suggested close:** when G-SIGN, G-ENV, G-PLAT and G-WORK pass on both platforms with internal testers. G-PRIV, G-DEL, G-POLICY and G-PROD then carry into store submission (8.4F and 8.4G).
