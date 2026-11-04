# Phase 8.3C: real-device results

**A running record** of what FORGE Dev did on the founder's iPhone. Results are the founder's observations unless marked otherwise. They are **not certification** of the data-preservation or sync behaviour underneath. The tests are defined in [PHASE_8_3A_DEVICE_VALIDATION.md](PHASE_8_3A_DEVICE_VALIDATION.md) §5 and the [first-install checklist](../FORGE_DEV_IPHONE_CHECKLIST.md); a failure follows §7 of the plan.

| Item | Value |
| --- | --- |
| Device | iPhone 17, iOS 26.6.2 |
| App | FORGE Dev, standalone Release build (`npm run dev:ios -- --release` on the MacBook Air) from `feat/forge-paths-foundation` |
| Project | FORGE DEV (`gmyo…`), the development project only |
| Expo Go | Kept; not uninstalled or reset |

## 1. Founder-observed results (Nov 4, 2026)

| # | Observed | Tests | Not yet shown |
| --- | --- | --- | --- |
| 1 | FORGE Dev installs and opens on its own, beside Expo Go | T1, T2 | T3–T6: reopening offline, after a restart, in both appearances; Expo Go unchanged |
| 2 | The founder created one disposable FORGE DEV email account on the iPhone and signed in with it in FORGE Dev | S1 (part) | S1's details (signed in at once, no confirmation email); S2–S9 |
| 3 | A workout can be logged in Airplane mode | O1 (part) | O1's food entry and offline force-quit; each set checked against what was typed |
| 4 | After reconnecting, **Synchronize now** reports success | O1 (part) | That the records reached FORGE DEV, complete and without duplicates (O1, O3) |
| 5 | After a force-quit, the workout in progress can be resumed on reopening | W5 (part) | W5's set-by-set check, mid-typing and during rest; W6 (restart) |
| 6 | Train shows **Resume workout** where the Forge Paths card normally is | — | Nothing: this is the design (an active workout replaces the plan's Start, Phase 7.2B) |

**Implied, not separately checked:** reopening after the force-quit reached the tabs (Train showed **Resume workout**), which only a signed-in athlete reaches. So the stored sign-in survived the force-quit.

**Accounts: approval A1 is limited to that one account** (the plan, §9). It covers the disposable account the founder created and nothing else. Creating any other account and deleting any account still need approval, so S7 (account B), S8 (deletion, A2) and V1 (A4) wait.

## 2. Open defects

### 8.3C-1 (priority P1): the logger's header sits under the status bar

**Found** Nov 4 by the founder, in a FREESTYLE workout. The back arrow is inside the status bar, over the clock, and can't be tapped. The FORGE wordmark and tagline overlap the status bar too. Not seen in Expo Go.

**Where.** Every way into the logger opens the same route, `/workout`, so it isn't specific to resuming:

- starting a workout from Train, Home or a template;
- **Resume workout** on Train, Home or the tab bar;
- reviewing a finished workout from History, the calendar, Records or Progress;
- **Return to your workout** on Welcome.

**Cause.**

1. The logger opens as a native full-screen modal (`presentation: "fullScreenModal"` in `src/auth/AppStack.tsx`). On iOS that's a separate view controller, outside the native view of the app's root `SafeAreaProvider` (`app/_layout.tsx`).
2. So the logger's `SafeAreaView`s find no provider above them and measure themselves. In `react-native-safe-area-context` 5.10.1, the version FORGE Dev compiles, such a view reads its insets once, when it's attached to the window. A modal is attached before iOS gives it its safe area, so the view reads zero, and nothing makes it read again. The header's top padding stays 0.
3. Expo Go ships the version Expo SDK 58 expects, 5.11.1. That version follows late insets: "Without a provider above it (e.g. in a native sheet), the view is its own provider and no provider notification reaches it, so follow its own insets here." That's why Expo Go laid the logger out correctly. Expo Go's exact native version wasn't inspected; this explanation fits everything observed.

The logger's bottom dock (the rest timer and **Finish workout**) has the same cause. In this build it probably sat on the home-indicator bar: its padding falls back to its own 10 pt.

**Fix.** `app/workout.tsx` gives the logger its own `SafeAreaProvider`, the library's documented pattern for modals. The provider sits inside the modal and re-reads its insets whenever iOS sets or changes them, in 5.10.1 too; the logger's safe-area views follow it.

Nothing else changes: not the logger's code or design, the workout data, sync, or any dependency. The back control was already 44 × 44 pt at minimum, plus a 4 pt touch margin.

**Regression tests** (`tests/ui/workout-safe-area.test.tsx`, 5 tests):

- The header (back arrow, wordmark, tagline) and the dock read a provider the logger owns, under the app's. The same holds for a paused workout, a finished one under review and the no-workout screen.
- **Back to training** is at least 44 pt, and leaves the workout in progress and untouched.

Without the fix, 4 of the 5 fail.

**Status:** fixed in source; approved and committed Nov 4. Awaiting the new build and the re-test below. **Not yet verified on the iPhone.**

**Re-test** (after `git pull` and `npm run dev:ios -- --release` on the Mac). The new build installs over the existing FORGE Dev and keeps its data; don't delete the app first.

| # | Do | Expected |
| --- | --- | --- |
| R1 | Train → start an empty workout | The back arrow, FORGE and the tagline are fully below the clock and the Dynamic Island, and the arrow is easy to tap. **Finish workout** sits clear of the home-indicator bar |
| R2 | Log a set, then tap the back arrow | Train, with **Resume workout**. Resume opens the same workout with the set |
| R3 | Force-quit mid-workout, reopen, Resume | As R1, and the set is still there |
| R4 | Pause, go back, Resume | As R1 |
| R5 | History → a finished workout | Its header below the clock; nothing under the home indicator |
| R6 | In the logger: **⋯** (Workout options), then **Add exercise** | Their lowest buttons sit clear of the home-indicator bar (see below) |
| R7 | Expo Go | The logger looks as before |

### Related, not observed: sheets and menus

Forge's sheets and **⋯** menus are React Native modals: `Sheet` in `src/components/ui.tsx` and `OverflowMenu` in `src/components/system.tsx`. They are also presented outside the root provider, with a safe-area view on their bottom edge. On 5.10.1 that edge may also read zero, putting their lowest buttons on the home-indicator bar.

Nobody has reported it; R6 checks it. If R6 shows it, the complete fix is to align `react-native-safe-area-context` with SDK 58's 5.11.1. That is a native dependency change, so it needs:

- approval;
- a rebuild;
- coordination with Engineer #2, whose branch may also change `package.json` and the lockfile.

## 3. Next

1. On the Mac: `git pull`, then `npm run dev:ios -- --release`; then R1–R7.
2. Continue with Session 2 of the plan (§6): W1–W9, O1–O3, D4.

## 4. Statements

- **Changed (committed together, Nov 4, with the founder's approval):**
  - `app/workout.tsx`;
  - `tests/ui/workout-safe-area.test.tsx`;
  - this record;
  - pointers and status in the 8.3A plan (including A1) and `IMPLEMENTATION_STATUS.md`.
- **Not done from Windows:** no build, install or device action; no account created or deleted; no FORGE DEV, production or Expo Go data or setting changed. No dependency changed. Engineer #2's worktree and the Phase 9 files were not touched.
