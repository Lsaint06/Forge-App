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

## 2. Defects

### 8.3C-1 (priority P1, resolved): the logger's header sat under the status bar

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

**Status: resolved, founder-verified on the iPhone 17 (Nov 4)** in the updated FORGE Dev build (`5398dc9`). The founder reports the logger's header below the status bar, and back navigation, resuming the workout and the exercise menus working.

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

**Re-test results (founder, Nov 4):** R1, R2 and R6 pass: the header, back to Train and Resume, and the exercise menus. Not reported separately, so not counted as verified: R3 (a force-quit in the new build), R4 (pause), R5 (a finished workout from History) and R7 (Expo Go).

### Related, not observed: sheets and menus

Forge's sheets and **⋯** menus are React Native modals: `Sheet` in `src/components/ui.tsx` and `OverflowMenu` in `src/components/system.tsx`. They are also presented outside the root provider, with a safe-area view on their bottom edge. On 5.10.1 that edge may also read zero, putting their lowest buttons on the home-indicator bar.

Nobody has reported it, and the founder reports the exercise menus working in the updated build. If a sheet's lowest button is ever seen on the home-indicator bar, the complete fix is to align `react-native-safe-area-context` with SDK 58's 5.11.1. That is a native dependency change, so it needs:

- approval;
- a rebuild;
- coordination with Engineer #2, whose branch may also change `package.json` and the lockfile.

## 3. Workout reliability: audit (8.3C-2) and hardening (8.3C-3)

**Audit (Nov 4, read-only, founder-approved).** Logging, rest timing, finishing, sync and leaving or resuming a workout were reviewed, and every suspected defect was checked against the real repository and sync engine. Confirmed protections:

- **Saving:**
  - every valid keystroke is saved before the field closes;
  - every write is one SQLite transaction, with the database in WAL mode;
  - migrations are transactional and repeatable;
  - only one workout can be in progress.
- **Rest timer:**
  - the deadline is stored and recalculated from the clock, so locking, other apps and force-quits don't shift it;
  - the alert is scheduled with iOS for that time.
- **Finishing:**
  - finishing needs a completed set, is one transaction, is guarded against double taps and is saved before the summary;
  - History, Progress, records and Forge Paths progress are derived from finished workouts, so nothing is counted twice.
- **Sync:**
  - a set logged while a sync downloads is kept and uploads next;
  - another device's change to the workout being logged becomes a conflict, never an overwrite.

No sync data-loss path was found.

**Changes (8.3C-3).** Each change has a regression test, and each test was confirmed to fail without its fix.

| # | Weakness | Change |
| --- | --- | --- |
| W-1 | Discarding a workout during a rest left the rest running: its alert still came, and the next workout inherited the countdown | Discarding ends the rest and cancels its alert. Deleting a finished session leaves another workout's rest alone. A new workout never starts mid-countdown |
| W-1 (import) | Importing a backup during a rest left that rest's alert scheduled | The alert's id is read before the import, which clears local settings, and the alert is cancelled only once the backup is in. A cancelled, refused or failed import (rolled back whole) leaves the rest and its alert as they were |
| W-2 | Rest alerts are off by default, so a locked phone stayed silent at the end of a rest | During a rest with alerts off, a quiet card above the rest timer reads **"Know when you're ready."** / "Get a notification when your rest ends, even when your phone is locked." with **Enable notifications** and **Not now**. The phone is asked for permission only after **Enable notifications** is tapped, and that also covers the rest already running. Any answer, or a choice in Preferences, is remembered. Left unanswered, the card appears only in the workout where it first showed |
| W-4 | An edit could leave a finished workout with no completed set, still counted as a session | **Save** then shows "No sets marked done" with **Keep editing** or **Delete session**. Deleting needs the usual confirmation; nothing is removed otherwise |
| W-5 | Import backup and Delete all local data didn't mention a workout in progress | Both confirmations now begin with "Your workout in progress, *name* (*n* sets done), is replaced/deleted too." |

New tests also pin that a typed value is saved before the field closes (T-1), and the two sync timing cases above (T-2).

**Not changed:**
- time-sensitive alerts for Focus modes (W-3), which wait for a device test;
- dependencies, design, cloud, subscriptions, production.

**Device checks for the next build** (FORGE Dev, with the one approved account). I1–I2 need alerts off with the Preferences switch untouched since this build, which is FORGE Dev's default: a choice made there counts as the lifter's answer, and the invitation then stays away. Turn alerts on for RT1–RT6 afterwards.

| # | Do | Expected |
| --- | --- | --- |
| I1 | Complete a set (alerts off) | The invitation appears above the rest timer; no system prompt yet. It fits without hiding Finish Workout |
| I2 | **Enable notifications**, allow; lock the phone | iOS asks once. The alert arrives when this rest ends; the invitation doesn't return |
| I3 | Optional, only from a fresh state (after the plan's reinstall, D3): **Not now**; more rests; another workout | No invitation again (the automated tests cover this) |
| RT1 | Alerts on: complete a set, lock the phone | One alert with sound at the deadline |
| RT2 | Complete a set, switch to another app | A banner at the deadline; the countdown is right back in Forge |
| RT3 | +30s twice, then Skip | No alert |
| RT4 | Do Not Disturb on, complete a set, lock | Note whether the alert appears (decides W-3) |
| RT5 | Force-quit during a rest, reopen | The countdown continues; the alert still arrives |
| RT6 | Discard a workout during a rest; start another | No alert from the old rest; the new workout shows Start rest |
| P1 | Type `102,5`, don't tap Done, force-quit | 102.5 is kept |
| P2 | Pause, force-quit or restart the phone mid-workout | Still paused or in progress; the duration excludes the pause |
| F1 | Finish, tapping Save twice quickly | One History entry; Progress and records updated |
| F2 | Edit a finished workout, untick every set, Save | "No sets marked done"; Keep editing keeps it; Delete session asks before deleting |
| D5 | With a workout in progress: You → Account & privacy → Delete all local data (and Import backup) | The dialog names the workout first. **Tap Cancel** |
| D6 | When running the plan's import test (D2, FORGE Dev test data only, never the Expo Go backup), start a rest first, then confirm the import | The backup is in, and no "Rest complete" alert follows. Cancelling at the confirmation instead leaves the rest and its alert running |
| Y1 | Start Synchronize now, go straight back to the logger, log a set | The set stays; the next sync succeeds with no conflict |

## 4. Next

1. Founder review of 8.3C-3; commit and push on approval; a new FORGE Dev build; the device checks above.
2. Continue with Session 2 of the plan (§6): W1–W9, O1–O3, D4.

## 5. Statements

- **Phase 8.3C-1, committed in `5398dc9`:**
  - `app/workout.tsx`;
  - `tests/ui/workout-safe-area.test.tsx`;
  - this record;
  - pointers and status in the 8.3A plan (including A1) and `IMPLEMENTATION_STATUS.md`.
- **Phase 8.3C-3:**
  - `src/screens/Workout.tsx`, `src/screens/workout/sections.tsx`, `src/domain/rest-alerts.ts` (new);
  - `src/components/ProfileForm.tsx`, `src/notifications.ts`, `src/data/repository.ts` (one guard);
  - `src/domain/presentation/account.ts`, `src/screens/you/account.tsx`;
  - tests in `tests/ui/workout-reliability.test.tsx` (new), `tests/ui/data-safety.test.tsx`, `tests/ui/profile.test.tsx`, `tests/rest-alerts.test.ts` (new), `tests/sync-safety.test.ts`, `tests/repository.test.ts` and `tests/account-display.test.ts`;
  - this record and `IMPLEMENTATION_STATUS.md`.
- **Not done from Windows:** no build, install or device action; no account created or deleted; no FORGE DEV, production or Expo Go data or setting changed. No dependency changed. Engineer #2's worktree and the Phase 9 files were not touched.
