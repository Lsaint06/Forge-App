# FORGE — Phase 7A Product Audit

**Mode:** audit only. No production code, tests, data model, or published programs were changed.
**Audited build:** `867e8ee` (branch `feat/forge-paths-foundation`), Expo SDK 58, React Native 0.88.
**Date:** 2026-10-23.

Evidence locations (outside the repository, kept for review):

- Phase 7A screenshots: `C:\Users\LStAm\forge-visual-harness\shots\android\p7\` (contact sheets are named `S-*.png`).
- Earlier verified captures: `...\shots\android\p3\` (Today/Train), `p4\` (Forge Paths), `p5\` (Progress), `p6\` (You).
- Disposable fixtures: `...\forge-visual-harness\dbs\p7-*.db`, produced by `seed7.ts` and `seed7b.ts` in the harness folder.

Labels used throughout:

- **Verified:** reproduced on the emulator, in a test, or proven directly from code.
- **Risk:** plausible from the code but not reproduced.
- **Unverified:** not tested in this audit.

---

## A. Executive summary

The five redesigned tab screens (Today, Train, Forge Paths, Progress, You) and the live workout logger are coherent, readable and reliable. They render cleanly from compact to large phones, in dark and light mode, and at 130 % system text.

Interrupted-workout recovery was verified:

- A weight committed to the database and a reps value still being typed both survived a force-stop.
- On relaunch, Today showed one **Resume workout** action.

Below that layer, Forge is still a different, older app:

- The journal screens (Nutrition, Measurements, Recovery, Goals, Saved foods), Workout templates, Exercise detail and custom exercise, and Account still use the pre-2.0 pattern:
  - a slogan title ("Fuel your effort.");
  - a full-width **Back** button;
  - long stacks of text boxes;
  - typed `YYYY-MM-DD` dates;
  - typed 1–5 scales;
  - four or five equal buttons on every card.
- These screens are where a beginner or an older adult is most likely to give up.

**Most serious concerns, in order:**

1. **Workout history has no automatic safety net (P0, launch blocker).**
   - No build can enable cloud sync: there is no Supabase configuration, and `.env` is absent.
   - Backups are manual exports that nothing ever prompts for.
   - Uninstalling the app, losing the phone, or clearing app data permanently deletes all history.
   - During Expo Go testing, the database belongs to Expo Go itself, so removing or clearing Expo Go deletes the tester's real training log.
2. **Release configuration is incomplete (P0 for store release).**
   - There is no app icon or Android adaptive icon in `app.json` or `assets/`.
   - `ios.supportsTablet: true` is declared, but iPad layouts have never been inspected.
   - The app has never been checked on a physical iPhone. This covers notifications, the share-sheet backup export and import, SecureStore, and keyboard behaviour.
3. **Two verified correctness defects (P1):**
   - Template weights are always stored and labelled in **kg**, even for pound users. A pound user typing "135" creates a 135 kg (≈298 lb) prescription.
   - A **bodyweight goal reads only measurements named exactly "Bodyweight"**. With no match, the value is 0, so a weight-loss goal is shown as **100 % complete**.
4. **Set logging is the costliest repeated interaction (P1).**
   - A weight typed for set 1 is not carried to the following empty sets.
   - The "Prev" value cannot be tapped to reuse it.
   - Curated program sessions start at 0 kg unless an **Apply** suggestion exists.
   - A typical 20-set session needs about 20 separate weight entries.
5. **Finishing a workout can quietly omit work (P1).** Sets with entered values that weren't ticked are excluded from Progress. The confirmation only reports the ticked count, and it uses a red destructive "Confirm" button.
6. **The journal suite and Templates are outdated, keyboard-heavy forms (P1).** Details are in section C.

**Readiness:** suitable for continued personal and beta use **if users export backups regularly**. It is not ready for public release until the P0 items are closed and the P1 correctness defects are fixed.

---

## B. Screen inventory

Column key:

- **Verified (emulator):** **7A** means captured in this audit; **P3–P6** means captured during that phase's visual pass; **No** means it has not been inspected on screen.
- **Design 2.0:** **Yes**, **Partial**, or **Legacy** (pre-2.0 layout).

### B1. Routes and screens

| Screen | Source · route | Reached from | Purpose | Design 2.0 | Interaction | Navigation | Accessibility | Functional notes | Verified (emulator) |
|---|---|---|---|---|---|---|---|---|---|
| Splash | [ForgeSplash.tsx](../../src/components/splash/ForgeSplash.tsx) · root | Cold start | Brand intro | Yes | Good | N/A | Reduced-motion handled | Protected; unchanged | P3–P6 |
| Error boundary | [_layout.tsx](../../app/_layout.tsx) · root | Database startup failure | Recovery message | **Legacy** | Poor | **Retry** rethrows the same error | Unlabelled Pressable; hard-coded colours | No way to export or rescue data from this screen | No (cannot be triggered safely) |
| Onboarding | [onboarding.tsx](../../app/onboarding.tsx), [ProfileForm.tsx](../../src/components/ProfileForm.tsx) · `/onboarding` | First launch; Delete all local data | Profile setup (4 steps) | Partial | Text-heavy | Linear | Fields labelled | Height in feet/inches only; **Enable local notifications** on step 1; **Skip remaining optional setup** on step 1 | 7A (standard, SE, large) |
| Today | [Home.tsx](../../src/screens/Home.tsx) · `/(tabs)` | Tab | Next workout hero, week, recovery, last session | Yes | Excellent | Good | Good | Verified resume after force-stop | P3, 7A (130 % text) |
| Train | [train.tsx](../../app/(tabs)/train.tsx) · `/(tabs)/train` | Tab | Training hub | Yes | Good | Good | Template **Start** is a compact button | Template **Start** isn't disabled while a workout is active (C-17) | P3 |
| Progress | [Progress.tsx](../../src/screens/Progress.tsx) · `/(tabs)/progress` | Tab | Analytics | Yes | Good | Good | Charts adjustable | — | P5 |
| You | [You.tsx](../../src/screens/You.tsx) · `/(tabs)/profile` | Tab | Profile and settings hub | Yes | Good | Good | Good | — | P6, 7A (130 % text) |
| Active-workout banner and tab bar | [(tabs)/_layout.tsx](../../app/(tabs)/_layout.tsx) | Any tab while a workout is active | Resume | Yes | Good | Good | Labelled | — | P3 |
| Workout logger (live) | [Workout.tsx](../../src/screens/Workout.tsx), [WorkoutExerciseCard.tsx](../../src/components/WorkoutExerciseCard.tsx), [SetGrid.tsx](../../src/components/SetGrid.tsx) · `/workout` | Today, Train, banner, Dashboard, History | Logging | Yes | Good layout; **repetitive weight entry** | Full-screen modal | Labelled cells; Next-key focus chain | Writes on every edit; survived force-stop | 7A (8 exercises, 31 sets; keyboard; menus; SE, large, 130 %) |
| Workout review (completed) | Same · `/workout?id=` | History, Today last session, Dashboard, Calendar, Records | Review and edit | Yes | Editable with no edit mode | Good | — | Accidental edits to history are possible (C-18) | 7A |
| Workout templates | [templates.tsx](../../app/templates.tsx) · `/templates` | Train → Workout templates | Templates and schedule | **Legacy** | **Poor** | Full-width **Back** | 5 equal buttons per card | Global `YYYY-MM-DD` schedule field; weight always kg (C-01) | 7A (standard, SE, large, light lb) |
| History | [History.tsx](../../src/screens/History.tsx) · `/history` | Train, Today, You, Progress | Month-grouped log | Yes | Good | Good | Overflow labelled | Repeat is guarded against an active workout | P3, 7A (populated, empty) |
| Records | [Records.tsx](../../src/screens/Records.tsx) · `/records` | Progress | Personal records | Yes | Good | Good | Good | — | P5 |
| Training calendar | [TrainingCalendar.tsx](../../src/screens/TrainingCalendar.tsx) · `/calendar` | Progress | Month grid | Yes | Good | Good | 44 pt day cells | — | P5 |
| Exercise library | [explore.tsx](../../app/explore.tsx) · `/explore` | Train → Search / Exercise library | Browse, search, favourites | Partial (custom header) | Good | Chevron back | Filter chips 40 pt high | "Muscle illustration" caption on every row | 7A (standard, light) |
| Exercise detail | [exercise.tsx](../../app/exercise.tsx) · `/exercise?id=` | Library, Records, Progress | Guide, history, records | **Legacy** | Fair | Full-width **Back** | — | Exposes the Epley formula text; repeats the Progress chart | 7A (standard, large) |
| Custom exercise create/edit | Same · `/exercise?custom=new` | Train, Library, detail **Edit custom exercise** | Create or edit a movement | **Legacy** | Free-text muscle and equipment | Full-width **Back**; no unsaved-changes guard | — | A deep link while the screen is open shows "Exercise not found" (C-30) | 7A (in-app) |
| Journal: Nutrition | [Journal.tsx](../../src/screens/Journal.tsx) · `/journal?kind=nutrition` | You → Health & body; Progress → More | Daily food log | **Legacy** | **Poor** | Full-width **Back**; "PROGRESS /" eyebrow even when opened from You | 4 buttons per entry | Totals for today only; flat multi-day list | 7A (populated, empty, SE, large, light lb, 130 %) |
| Journal: Saved foods | Same · `kind=food` | Nutrition → Manage saved foods | Food library | **Legacy** | Poor | Full-width **Back** | — | No search | 7A |
| Journal: Measurements | Same · `kind=measurement` | You; Progress → More | Body measurements | **Legacy** | Poor | Full-width **Back** | — | Free-text names split a series ("Bodyweight" vs "Body weight") | 7A (populated, empty, light lb) |
| Journal: Recovery | Same · `kind=recovery` | Today recovery row; You | Readiness check-in | **Legacy** | **Poor** (7 typed numbers) | Full-width **Back** | — | Methodology paragraph repeated on every entry | 7A |
| Journal: Goals | Same · `kind=goal` | You | Goals | **Legacy** | Poor | Full-width **Back** | Metric chips clipped | Bodyweight goal defect (C-02) | 7A (standard, SE, large) |
| Forge Paths library | [Library.tsx](../../src/screens/programs/Library.tsx) · `/forge-paths` | Train, Today, You | Browse 18 programs | Yes | Good | Good | Good | — | P4 |
| Program details | [Details.tsx](../../src/screens/programs/Details.tsx) · `/forge-paths/[programId]` | Library | Inspect and enrol | Yes | Good | Good | Good | On Sundays "Next Monday" equals "Tomorrow" (C-29) | P4 |
| Your program dashboard | [Dashboard.tsx](../../src/screens/programs/Dashboard.tsx) · `/forge-paths/current` | Today, Train, You | Active program | Yes | Good | Good | Good | — | P4, 7A |
| Legacy generated Path | [LegacyPath.tsx](../../src/screens/LegacyPath.tsx) · `/paths` | Plan row for a legacy Path | Continue an old Path | Partial | Fair | Chevron back | 44 pt week controls | Reschedule is a typed `YYYY-MM-DD` date | P4, 7A |
| Account and cloud sync | [account.tsx](../../app/account.tsx) · `/account` | You → Account & cloud sync | Sign in, sync, conflicts | **Legacy** | Poor | Full-width **Back** | — | **Shows developer environment-variable names and "See README" to users** | 7A (guest: standard, SE, light); signed-in states **Unverified** (no backend) |
| Design system | [design-system.tsx](../../app/design-system.tsx) · `/design-system` | You → About (development builds only) | Component reference | Yes | — | — | — | Development only | P1 |

### B2. Sheets, menus and dialogs

| Component | Where | Notes | Verified (emulator) |
|---|---|---|---|
| Template details sheet | Train | **Start workout** and **Edit or schedule** | P3 |
| Workout options menu | Workout header **⋯** | Rename, Notes, Pause, Default rest, Save as template, Discard/Delete | 7A |
| Exercise menu | Exercise card **⋯** | Move up, Move down, Substitute, Notes/rest/superset, Progression, Remove | 7A |
| Set Details sheet | Tap a set number (shown with a small "…" under it) | Type, side, RPE, RIR, rest, tempo, notes, Remove set. **Discoverability is low**: the "…" is the only hint. | P2 |
| Exercise picker | Add exercise, Substitute, template editor | Search plus muscle chips (40 pt) | P2 |
| Rest timer | Workout footer | Start, +30 sec, Skip | P2 |
| Finish / Discard dialogs | Workout | Finish uses the red destructive "Confirm" style (C-13) | Code |
| Template editor sheet | Templates | 5 number boxes per exercise; **Move up** only; **Remove** has no confirmation (acceptable inside a guarded sheet) | 7A |
| Journal entry editor | All journals | 5–10 stacked fields; on SE the Save button sits below the fold | 7A |
| History overflow | History row | Repeat; Delete (confirmed) | P3 |
| Progress exercise picker, milestones and info sheets | Progress | — | P5 |
| Start-program sheet, info sheets | Program details | Today / Tomorrow / Next Monday | P4 |
| All program sessions sheet | Dashboard | — | P4 |
| Manage Path, session options, reschedule | Legacy Path | Typed date | P4 |
| You editors (Edit profile, Training focus, Training preferences, Nutrition targets) and Privacy InfoSheet | You | Preferences use typed numbers | P6 |
| Conflict resolution | Account | Keep local / Use cloud, both confirmed | **Unverified** (needs a backend) |
| Backup share sheet and document picker | You → Export / Import | System UI | **Unverified on device** |

---

## C. UX issue register

Each entry notes how it was verified (in brackets) and gives a proposed resolution. Severity follows the brief's P0–P3 definitions.

### P0 — Launch blockers

| ID | Issue | User impact | Files | Proposed resolution |
|---|---|---|---|---|
| C-00a | **No automatic protection for workout history.** <br>• `cloudClient()` returns null in every build because `EXPO_PUBLIC_SUPABASE_*` is not configured. <br>• Export is manual, and nothing prompts for it or records when it last happened. <br>• Uninstalling, losing the device, or clearing app data loses everything. <br>• In Expo Go the database is `/data/data/host.exp.exponent/files/SQLite/forge.db`, owned by Expo Go, not by Forge. [Verified: code, `.env` absent, emulator file path] | Permanent loss of years of training data through ordinary behaviour | [client.ts](../../src/cloud/client.ts), [backup.ts](../../src/platform/backup.ts), [You.tsx](../../src/screens/You.tsx) | 1. Decide on the backend: configure Supabase for release, or ship local-only with explicit backup tooling. <br>2. Store and show **Last backup: date**. <br>3. Remind after N workouts or N days without a backup. <br>4. Offer **Back up now** on the finish summary and on You. <br>5. Add an **Export backup** action to the error boundary. <br>None of this changes the schema; a `settings` key is enough. |
| C-00b | **No app icon or adaptive icon**; `app.json` has no `icon`, `android.adaptiveIcon` or iOS icon set. [Verified: `app.json`, `assets/`] | Builds ship the generic Expo icon; store submission is not presentable | [app.json](../../app.json) | Produce the icon set (iOS 1024, Android adaptive foreground and background, monochrome) and add it to `app.json`. |
| C-00c | **Never run on physical devices**, and **`supportsTablet: true` is unverified**. [Verified: docs and test logs] | Unknown iOS keyboard, safe-area, notification and share-sheet behaviour; untested iPad layouts | [app.json](../../app.json) | Do a device pass on a physical iPhone (see checklist I), and either verify iPad layouts or set `supportsTablet: false`. |

### P1 — Major user-experience or reliability issues

| ID | Issue | User impact | Files | Proposed resolution |
|---|---|---|---|---|
| C-01 | **Template weights are always kg.** <br>• The editor labels the column "kg" and stores the raw value. <br>• Workouts started from the template convert it to the user's units for display. [Verified: code, emulator in light mode with pounds, `standard-light-template-edit-*.png`] | A pound user's "135" becomes a 135 kg (≈298 lb) target: an incorrect and potentially unsafe prescription | [templates.tsx](../../app/templates.tsx) | Label the field in profile units and convert lb to kg on save (storage stays kg). Use a stepper with the user's increment. |
| C-02 | **Bodyweight goal reads only measurements named exactly `"Bodyweight"`.** <br>• With no match the value is 0. <br>• `goalProgress` (0−84)/(80−84) caps at 1, so the goal shows 100 % complete with "0.0 / 80 bodyweight". [Verified: emulator `standard-goal-0.png`, [Journal.tsx](../../src/screens/Journal.tsx) `goalValue`] | False success on a body-composition goal | [Journal.tsx](../../src/screens/Journal.tsx), [analytics.ts](../../src/domain/analytics.ts) | Match `/^body\s*weight$/i` (the same rule as validation). Show "No bodyweight logged yet" instead of 0, and display the value in profile units. |
| C-03 | **Set weight entry is repeated for every set.** <br>• Typing set 1's weight doesn't carry to the empty sets after it. <br>• "Prev" can't be tapped. <br>• Program sets start at 0 unless **Apply** is offered. [Verified: code ([SetGrid.tsx](../../src/components/SetGrid.tsx) `save`), emulator `standard-active-0.png`] | Done 15–25 times per session; the most frequent friction in the app | [SetGrid.tsx](../../src/components/SetGrid.tsx), [WorkoutExerciseCard.tsx](../../src/components/WorkoutExerciseCard.tsx) | When a weight is saved, copy it to the following sets in that exercise that are not completed and still at 0. Make the Prev cell a button ("Use 45×8"). Optionally show a long-press ±increment stepper on the weight cell. Keep direct typing. |
| C-04 | **Unticked sets that have values are silently left out at Finish.** The dialog says "N completed sets will be included" and doesn't mention the others. [Verified: code ([Workout.tsx](../../src/screens/Workout.tsx) `finish`)] | Logged work disappears from Progress and Records without the user knowing | [Workout.tsx](../../src/screens/Workout.tsx) | Replace the dialog with a Finish sheet: "2 sets have values but aren't marked done", with **Mark them done** or **Leave them out**, then **Finish**. |
| C-05 | **Journal suite is legacy, keyboard-heavy forms.** Each item below is verified on the emulator. <br>• Nutrition: 10 stacked fields (date typed as `YYYY-MM-DD`; meal typed; 4 macro boxes; servings; description; notes). <br>• Recovery: 7 typed numbers for 1–5 scales and "Rest day: yes / no" as text. <br>• Goals: raw "Exercise ID" text. <br>• Measurements: free-text names that split series. | Slow, error-prone, intimidating for beginners and older adults | [Journal.tsx](../../src/screens/Journal.tsx) | See work package 4: date picker; meal segmented control; servings stepper; 1–5 segmented controls; sleep stepper; rest-day switch; exercise picker; measurement-name picker with "Custom". Stored data shapes stay unchanged. |
| C-06 | **Nutrition has no day view.** <br>• Totals cover today only. <br>• Entries from all days form one flat list with raw ISO dates. <br>• There is no food search: saved foods appear as a growing column of full-width "Log X" buttons. [Verified: emulator `S-nutrition.png`] | Can't review yesterday; quick-log doesn't scale | [Journal.tsx](../../src/screens/Journal.tsx) | Day navigator (‹ Today ›) with per-day totals against targets; entries grouped by meal as ListRows with an overflow menu (Edit, Repeat today, Save as food, Delete); a "Quick add" sheet with saved-food search. |
| C-07 | **Templates screen is legacy.** <br>• A global "Schedule date (YYYY-MM-DD)" field sits at the top of the screen. <br>• Each card has 5 equal buttons (Train, Edit, Duplicate, Schedule, Delete) that wrap to 2 rows, with an orange **Train** on every card. <br>• The editor has 5 number boxes per exercise and **Move up** only. [Verified: emulator, all sizes] | Cluttered; several competing primary actions; scheduling is opaque | [templates.tsx](../../app/templates.tsx) | Grouped ListRows (tap for details) with one compact Start and an overflow menu (Edit, Duplicate, Schedule…, Delete). Schedule via a date-picker sheet per template. Editor: steppers for sets, reps and rest; unit-aware weight; reorder. |
| C-08 | **Account screen shows developer text to users**: "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY are configured… See README". It wraps mid-identifier on SE. [Verified: emulator `standard-account-0.png`, `se-account-0.png`] | Confusing and unprofessional | [account.tsx](../../app/account.tsx) | User copy: "Cloud sync isn't available in this version. Your data stays on this device; export backups regularly." Move setup notes to the README. Restyle with Design System 2.0 (header back chevron, ListSections). |
| C-09 | **Inconsistent navigation chrome on secondary screens.** Journals, Templates, Exercise and Account use: <br>• slogan titles; <br>• "PROGRESS / …" eyebrows (even when opened from You); <br>• a full-width **Back** button that takes the first content slot. <br>Design 2.0 screens use a header back chevron. [Verified: emulator] | Feels like two apps; wastes the most valuable screen area | Same files | `Screen onBack={goBack(...)}` with plain titles ("Nutrition", "Measurements", "Recovery", "Goals", "Templates", "Account"). |
| C-10 | **The error boundary is a dead end.** **Retry** clears the state and the same initialisation error is thrown again; there is no export path and the styling is hard-coded. [Verified: code] | A user facing a corrupt database has no self-rescue | [_layout.tsx](../../app/_layout.tsx) | Restyle with design tokens. Add **Export a copy of my data** (raw database share) and **Contact support** information. Retry should re-run `initializeRepository`. |

### P2 — Moderate issues

| ID | Issue | Files | Proposed resolution |
|---|---|---|---|
| C-11 | Reordering moves one step per menu trip: moving the 8th exercise to 1st takes 14 taps. Templates offer **Move up** only. [Verified] | [WorkoutExerciseCard.tsx](../../src/components/WorkoutExerciseCard.tsx), [templates.tsx](../../app/templates.tsx) | A "Reorder exercises" sheet with drag handles, or Move to top / Move to bottom. |
| C-12 | No post-workout summary: Finish returns straight to Today. [Verified: code] | [Workout.tsx](../../src/screens/Workout.tsx) | Summary sheet showing duration, sets, volume, new records, **Back up now** (see C-00a) and **Done**. |
| C-13 | Finish confirmation uses `confirm()`, which styles **Confirm** as destructive red. [Verified: [state.ts](../../src/state.ts)] | [Workout.tsx](../../src/screens/Workout.tsx) | Non-destructive "Finish" button (folds into C-04). |
| C-14 | Onboarding: <br>• height in feet/inches only, even with kg selected; <br>• **Enable local notifications** prompt on step 1; <br>• **Skip remaining optional setup** on the step with the required fields; <br>• long privacy paragraph; <br>• **Next** below the fold on SE. [Verified: emulator, code] | [ProfileForm.tsx](../../src/components/ProfileForm.tsx) | A cm/ft-in toggle that follows units; move the notifications ask to the first finished workout; show Skip only after step 1; put the privacy text in an InfoSheet. |
| C-15 | Recovery and Goal cards repeat the methodology paragraph on **every** entry. [Verified] | [Journal.tsx](../../src/screens/Journal.tsx) | One ⓘ InfoSheet per screen. |
| C-16 | Journal entries show raw ISO dates, "1 servings", and a trailing "·" when the meal or description is empty. [Verified] | [Journal.tsx](../../src/screens/Journal.tsx) | `dayLabel()`, pluralisation, and joining only the parts that are present. |
| C-17 | Train's template **Start** isn't disabled while a workout is active. `startWorkout` returns the active workout, so the user silently lands in a different workout. The Templates **Train** button behaves the same way. [Verified: code] | [train.tsx](../../app/(tabs)/train.tsx), [templates.tsx](../../app/templates.tsx), [repository.ts](../../src/data/repository.ts) | Disable with "Finish your current workout first", as Empty workout already does. |
| C-18 | Completed-workout review is directly editable (ticks, menus, Add exercise) with no edit mode, and shows duration as a running-clock style "1:02:00". [Verified] | [Workout.tsx](../../src/screens/Workout.tsx) | Read-only review with an **Edit workout** action; show duration as "62 min". |
| C-19 | Goal metric chips overflow and are clipped ("stre…") on standard and SE. [Verified] | [Journal.tsx](../../src/screens/Journal.tsx) | Selection list or segmented control (part of C-05). |
| C-20 | Exercise detail uses the legacy header, repeats "Muscle illustration · not a demonstration", and exposes the Epley formula text. **Add to workout** silently starts a new workout when none is active. [Verified] | [exercise.tsx](../../app/exercise.tsx) | Design 2.0 restyle; formula in an InfoSheet; label the action "Start workout with this exercise" when nothing is active. |
| C-21 | Custom exercise: primary muscle and equipment are free text, and there is no unsaved-changes guard. [Verified: code, emulator] | [exercise.tsx](../../app/exercise.tsx) | Pickers drawn from the catalogue's muscles and equipment; the shared unsaved-changes guard. |
| C-22 | Legacy Path reschedule is a typed `YYYY-MM-DD` date. [Verified: code] | [LegacyPath.tsx](../../src/screens/LegacyPath.tsx) | Date-picker sheet (calendar logic unchanged). |
| C-23 | Training preferences use typed numbers for frequency (1–7), rest seconds and increment. [Verified: P6] | [ProfileForm.tsx](../../src/components/ProfileForm.tsx) | Segmented control for frequency; steppers for rest (±15 s) and increment. |
| C-24 | Filter and muscle chips are 40 pt high, below the 44 pt target. [Verified: code] | [ui.tsx](../../src/components/ui.tsx) | `minHeight: 44` or extra hit slop. |
| C-25 | The Set Details sheet is reachable only by tapping the set number, marked by a small "…". [Verified] | [SetGrid.tsx](../../src/components/SetGrid.tsx) | Add "Set options" to the accessibility hint and an onboarding tip; consider a long-press on the row. |

### P3 — Cosmetic or optional polish

| ID | Issue | Files |
|---|---|---|
| C-26 | Converted measurements show awkward precision ("33.23 in", "180.23 lb"). | [Journal.tsx](../../src/screens/Journal.tsx) |
| C-27 | Every Exercise library row repeats the caption "Muscle illustration". | [explore.tsx](../../app/explore.tsx) |
| C-28 | Default nutrition targets (2,000 kcal) display as if the user had chosen them ("0 / 2000 kcal today"). | [Journal.tsx](../../src/screens/Journal.tsx) |
| C-29 | On Sundays, "Next Monday" and "Tomorrow" are the same date in the start-program sheet. | [Details.tsx](../../src/screens/programs/Details.tsx) |
| C-30 | A deep link to `/exercise?custom=new` while an exercise screen is mounted shows "Exercise not found" (the editing flag initialises once). It wasn't reproduced through in-app navigation. | [exercise.tsx](../../app/exercise.tsx) |
| C-31 | Documentation drift: <br>• `docs/PULL_REQUEST.md` says SDK 57. <br>• `DESIGN_SYSTEM_2.md` says Phase 6 is "in review" (it is committed). <br>• The README says "Profile → Account". | docs |
| C-32 | Measurement screen copy reads like developer documentation: "Values are stored in kg, cm and percent…". | [Journal.tsx](../../src/screens/Journal.tsx) |

### Explorer-agent claims that were checked and rejected

| Claim | Why it was rejected |
|---|---|
| Journal dates and numbers are unvalidated and can corrupt data | `putJournal` validates both the ISO date and the numeric ranges, and rejects bad input with a "Could not save" alert. The problem is the input experience (C-05), not data integrity. |
| "Next Monday" can equal today | It cannot. The real edge case is Sunday (C-29). |
| Custom exercises can't be edited | **Edit custom exercise** exists on the detail screen. |

---

## D. Workflow analysis

Counts are taps from the stated start. "Typing" means keyboard entry is needed.

### D1. Workout journeys

| Journey | Start | Taps | Typing | Problems | Recommendation |
|---|---|---|---|---|---|
| Start today's recommended workout | Today | 1 | None | None | Keep |
| Log a working set (program session, first time) | Workout | 3 (weight, Next, complete) | Weight on every set | No copy-forward; Prev not tappable (C-03) | Copy-forward plus tappable Prev: about 1 tap per later set |
| Log a working set (freestyle, Add set) | Workout | 2 (Add set, complete) | Only if the value changes | Fine | Keep |
| Change weight or reps | Workout | 1 | Yes | Fine; the value is selected on focus | Optional ± stepper |
| Add an exercise | Workout | 3 (Add exercise, search or chip, result) | Optional search | **Add exercise** is at the bottom of a long list | Also add "Add exercise" to the header menu |
| Remove an exercise | Workout | 3 (⋯, Remove, Confirm) | None | Fine | Keep |
| Reorder exercises | Workout | 2 per position (14 for 8th to 1st) | None | C-11 | Reorder sheet |
| Edit a completed workout | Today | 1 to open, then edit directly | Depends | No edit mode (C-18) | Explicit Edit |
| Complete a session | Workout | 2 (Finish, Confirm) | None | Red Confirm; unticked sets silently dropped; no summary (C-04, C-12, C-13) | Finish sheet with summary |
| Review previous results | Today | 1 (Last session) or 2 (Workout history, row) | None | Fine | Keep |
| Recover after the app is killed mid-workout | Relaunch | 1 (Resume) | None | **Verified: no data lost** | Keep |

### D2. Program journeys

| Journey | Start | Taps | Typing | Notes |
|---|---|---|---|---|
| Find an appropriate Forge Path | Today (no plan) | 1–2 (**Choose a Forge Path**, recommendation) | None | Good |
| Compare weekly variants | Details | 1 per variant (3 / 4 / 5 segmented control) | None | Good. Make it clearer that each variant is a separate authored program; the details screen covers this. |
| Review program details | Details | 1 per workout expansion | None | Good |
| Enrol | Details | 3 (Start program, date, Start …), +1 if replacing a plan | None | Good; replacement warning preserved |
| Resume a session | Any tab | 1 (Today hero or banner) | None | Good |
| Program history | Today | 2 (plan row, All program sessions) | None | Good |

### D3. Progress journeys

| Journey | Start | Taps | Typing | Notes |
|---|---|---|---|---|
| Exercise progression | Progress | 2 (picker, exercise) | Optional search | Good |
| Personal records | Progress | 1 (All records) | None | Good |
| Workout consistency | Progress | 0 (it's the first card) | None | Good |
| Training history | Today | 1 (Workout history) | None | Good |

### D4. Profile and settings journeys

| Journey | Start | Taps | Typing | Notes |
|---|---|---|---|---|
| Change training preferences | You | 3 + fields | **Yes**: frequency, rest, increment, reps | C-23 |
| Update experience or goal | You | 4 (Training focus, 2 choices, Save) | None | Good |
| Appearance and units | You | 1 (instant) plus a scroll | None | Good |
| Membership status | You | 0 (visible card) | None | Good |

### D5. Nutrition journeys

| Journey | Start | Taps | Typing | Problems |
|---|---|---|---|---|
| Search for a food | — | **Not supported** | — | No food database; saved foods are not searchable (C-06) |
| Log a new food | You | 2 to reach + Add meal + **6–8 fields** + Save | **Heavy** | 10-field form; typed date; Save below the fold on SE (C-05) |
| Log a saved food | You | 3 (Nutrition log, scroll, Log X) | None | Always 1 serving; changing it needs Edit (3 more taps plus typing) |
| Edit a serving quantity | Nutrition | 3 (Edit, servings field, Save) | Yes | Needs a stepper |
| Review daily consumption | You | 2 | None | **Today only**; earlier days have no totals (C-06) |

---

## E. Visual evidence

All files are in `C:\Users\LStAm\forge-visual-harness\shots\android\p7\`.

| Sheet | States | Observations |
|---|---|---|
| `S-nutrition.png` | Populated nutrition (dark, standard), Add meal sheet, saved foods | Column of "Log X" buttons; four buttons per entry with Delete wrapping; ISO dates; "1 servings ·"; 10-field editor |
| `S-journals.png` | Measurements, Recovery, Goals and their editors | "Bodyweight" vs "Body weight" split; 7 typed recovery numbers; "Rest day: yes / no" typed; **Reach 80 kg goal at 0.0 / 80 with a full bar**; metric chips clipped; repeated paragraphs |
| `S-train1.png` | Templates, template editor, Exercise library and filters | Global schedule date; 5-button cards; orange Train repeated; "kg" columns |
| `S-train2.png` | Exercise detail, Account (guest), History, workout review | Legacy headers; developer environment text on Account; review is editable |
| `S-workout.png`, `S-workout2.png`, `S-workout3.png` | Live 8-exercise workout, keyboard, scroll, menus; custom exercise (in-app) | Logger is polished; about 3 set rows stay visible with the keyboard open; menus are clear |
| `S-recovery.png` | Before force-stop, Today after relaunch, workout after relaunch | **52.5 kg and 7 reps survived**; single Resume action |
| `S-prog.png` | Legacy Path and Your program dashboard | Consistent with the Phase 4 restyle |
| `S-empty.png` | Empty nutrition, measurements, templates, history; onboarding | Empty states are plain text cards; onboarding is long |
| `S-light.png` | Light theme in pounds: nutrition, template editor, measurements, account, library | **Template editor shows kg for a pound user (C-01)**; light parity otherwise good |
| `S-se.png` | Compact (iPhone SE size) | Save below the fold in editors; Account text wraps mid-identifier; chips clipped |
| `S-large.png` | Large (Pro Max size) | No layout defects |
| `S-font130.png` | 130 % system text: Today, workout, nutrition, templates, You | No clipping; the set grid holds |

**Not captured:**

- System share sheet and document picker (backup export and import). These are system UI and need a device.
- Signed-in Account and conflict resolution (no backend).
- Notification delivery.
- iPad and landscape.

---

## F. Functional and data-safety findings

### F1. Verified behaviour

| Area | Finding | Evidence |
|---|---|---|
| Persistence | Every set edit is a synchronous SQLite transaction (WAL). A force-stop mid-workout lost nothing, including a value still being typed. | Emulator `S-recovery.png`; [repository.ts](../../src/data/repository.ts) `transaction` |
| Interrupted workout | On relaunch, Today shows **In progress · Resume workout**, and the banner shows on other tabs. | Emulator; P3 tests |
| Single active workout | `startWorkout` returns the existing active workout, and `duplicateWorkout` and `startPrescribedWorkout` refuse to start a second. No duplicate active workouts are possible. | Code; tests |
| Backups | Export covers profile, workouts, exercises, sets, templates, journals (including **program enrollments and schedules**, which are stored as journals), custom exercises and favourites. The `settings` table holds only transient keys (rest timer, onboarding step, cloud owner) and is correctly excluded. | Code; `repository.test.ts` |
| Import | Validated by schema; duplicate IDs and multiple active workouts are rejected; data is replaced atomically inside one transaction after confirmation. | Code; tests |
| Delete all local data | Confirmed; one transaction; notifications cancelled; returns to onboarding. | P6 UI test |
| Journal validation | Invalid dates and out-of-range numbers are rejected before writing. | Code ([validation.ts](../../src/domain/validation.ts)) |
| Unit conversion | Workout sets and measurements convert lb to kg on save. **Templates do not (C-01).** | Code; emulator |
| Analytics | Progress engines are covered by 3 logic suites. The **bodyweight goal is wrong when no measurement is named exactly "Bodyweight" (C-02).** | Emulator; code |
| Curated programs | The publication lock and tests pass (212 logic tests, including `curated-programs`). | `npm test` |

### F2. Risks

- **R-1 (P0, see C-00a): permanent loss on reinstall or device change.** iOS iCloud device backups probably include the app's SQLite file (expo-sqlite stores it in the app's Documents directory), but this was not verified, and Android Auto Backup behaviour is unconfigured.
- **R-2: Expo Go testing.** The current tester's real log lives inside Expo Go's sandbox. Uninstalling Expo Go, clearing its storage, or switching to a standalone build will **not** carry it over. **Export a backup from You → Export backup now and regularly.**
- **R-3: rest timer.** It is computed from a stored deadline. Behaviour while the app is in the background, and notification delivery, have not been verified on a device. Expo Go on Android doesn't support remote-notification modules (already guarded by `isRunningInExpoGo`).
- **R-4: sync.** The sync and conflict code is unit-tested (`sync.test.ts`) but has never run against a real backend. Signing in with a different account is blocked by the `cloudOwner` check, which is good.
- **R-5: error boundary.** A failed database open leaves the user with no way to rescue their data (C-10).
- **R-6: editable history.** Completed workouts can be edited accidentally (C-18).

### F3. Untested

- Physical iOS and Android devices.
- Backup export through the share sheet, and import through the document picker.
- Upgrading from an older store build.
- Low-storage conditions.
- Timezone and daylight-saving boundaries on device.
- Landscape and iPad.
- TalkBack and VoiceOver full passes.

---

## G. Testing coverage

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Pass |
| `npm test` (logic) | **212 / 212 pass** |
| `npx jest --runInBand` (UI) | **135 / 135 pass** across 16 suites |
| `npm run lint` | Pass (0 problems) |
| `npm run format:check` | Pass |
| `npx expo-doctor` | **20 / 20** |
| iOS and Android export | Passed at `867e8ee` earlier today (6.9 MB each). Not re-run in 7A because no code changed. |

**UI-test coverage gaps:**

| Screen | UI tests |
|---|---|
| Account | None |
| Journal (all kinds) | Only the unsaved-changes guard |
| Onboarding | Through `ProfileForm` only |
| Custom exercise create/edit | None |
| Finish flow with unticked sets | None |
| Error boundary | None |

**Emulator inspection performed in 7A:**

- Android AVD "forge" with Expo Go 58.0.5, using seeded disposable databases.
- Sizes: compact 375×667 dp, standard 393×852, large 430×932.
- Themes and text: dark and light; font scale 1.0 and 1.3.
- States covered: new user; user with history; enrolled in a curated program; legacy Path; no program; long in-progress workout (8 exercises, 31 sets); completed-workout review; empty and populated nutrition; light theme with pounds; force-stop recovery.

**Not inspected:** listed in E and F3. No claim is made that every screen state was inspected. Today, Train, Forge Paths, Progress and You rely on their Phase 3–6 visual passes, re-sampled here at 130 % text.

---

## H. Phase 7B roadmap

Each package below lists its scope, the existing behaviour that must not change, the risk, the expected improvement, the tests to add, and the visual acceptance criteria. Complexity is relative: S, M or L.

| # | Package | Priority | Complexity | Depends on |
|---|---|---|---|---|
| WP1 | Data safety and release essentials | P0 | M | Backend decision (sync now or later) |
| WP2 | Workout logging efficiency and finish flow | P1 | M | — |
| WP3 | Templates rebuild (including the kg fix) | P1 | M | WP2 helpers (steppers) are optional |
| WP4 | Journals and nutrition rebuild | P1 | L | Shared date-picker and stepper primitives (built in WP2 or WP3) |
| WP5 | Secondary-screen consistency | P1 / P2 | M | — |
| WP6 | Accessibility and device QA | P2 | M | WP2–WP5 landed |
| WP7 | Visual polish | P3 | S | — |

### WP1 — Data safety and release essentials

- **Scope:**
  - Last-backup status and reminders on You, after Finish, and every N days, stored as a `settings` key (no schema change).
  - A **Back up now** shortcut.
  - Restyle the error boundary and add an **Export a copy** action that shares the raw database file.
  - User-facing Account copy for guest mode (C-08).
  - App icon and adaptive icon (C-00b).
  - An iPad decision (C-00c).
  - Configure Supabase if sync is in scope for launch.
  - A README note on the Expo Go data location.
- **Must not change:** backup format, import validation, sync engine, schema.
- **Risk:** low.
- **Expected improvement:** users are told, and helped, before they lose data.
- **Tests to add:** last-backup recorded on export; reminder thresholds; boundary renders and exports; Account guest copy.
- **Visual acceptance:** You shows "Last backup: Oct 23" or "Never backed up"; the error screen uses design tokens; no developer identifiers anywhere in the UI.

### WP2 — Workout logging efficiency and finish flow

- **Scope:**
  - Copy-forward of weight to following untouched sets (C-03).
  - Tappable Prev.
  - A Finish sheet that warns about unticked sets with values and offers **Mark done** (C-04, C-13), plus a post-workout summary (C-12).
  - A reorder sheet (C-11).
  - Disable template Start while a workout is active (C-17).
  - Read-only review with an explicit Edit (C-18).
- **Must not change:** set persistence semantics, progression calculations, curated prescriptions, rest timer.
- **Risk:** medium; this is the core logging path. Mitigate with focused tests and an emulator pass.
- **Expected improvement:** roughly 40–60 % fewer weight keystrokes per session; no silent data omission.
- **Tests to add:** copy-forward only fills sets that are not completed and still at 0; Prev applies; the Finish sheet lists unticked sets; reorder persists positions; review is read-only until Edit.
- **Visual acceptance:** compact, standard, large, dark, light and 130 % text pass; the keyboard never hides the focused cell.

### WP3 — Templates rebuild

- **Scope:**
  - Design 2.0 list with one Start and an overflow menu per template.
  - Per-template scheduling via a date picker; remove the global date field.
  - Editor: steppers for sets, reps and rest; unit-aware weight (**fixes C-01**); reorder.
  - Calendar section as ListRows.
- **Must not change:** template storage shape, schedule journal records, planned-session behaviour.
- **Risk:** low to medium.
- **Tests to add:** pound user saves 135 lb, which is stored as 61.23 kg and displays as 135 lb; schedule creates the same journal record as today; unsaved-changes guard.
- **Visual acceptance:** at most one orange action on screen; no button rows that wrap; SE fits a template card in one view.

### WP4 — Journals and nutrition rebuild

- **Scope:**
  - Shared Design 2.0 shell with header back and plain titles.
  - Date picker.
  - **Nutrition:** day navigator with totals, meals as ListRows, quick-add sheet with saved-food search, servings stepper, meal segmented control.
  - **Measurements:** name picker (Body weight, Waist, Chest, …, plus Custom), unit follows profile, trend chart reused from Progress.
  - **Recovery:** 1–5 segmented controls, sleep stepper, rest-day switch, methodology in an InfoSheet.
  - **Goals:** metric list, exercise picker, **bodyweight goal fix (C-02)**.
- **Must not change:** journal data shapes and validation, Progress body section, readiness calculation.
- **Risk:** medium (largest UI surface); no data changes.
- **Tests to add:** each editor saves the same payload as before; day totals; bodyweight goal with no measurement, a matching name, and a variant name.
- **Visual acceptance:** recovery check-in in ≤ 8 taps with no keyboard; logging a saved food takes ≤ 2 taps from Nutrition.

### WP5 — Secondary-screen consistency

- **Scope:**
  - Account restyle.
  - Exercise detail and custom exercise (pickers, unsaved-changes guard).
  - Legacy Path reschedule date picker.
  - Onboarding polish (cm option, later notifications ask, Skip placement, privacy InfoSheet).
  - Training preferences steppers (C-23).
  - Documentation drift (C-31).
- **Risk:** low.
- **Tests to add:** custom exercise guard; onboarding with cm; reschedule writes the same date.

### WP6 — Accessibility and device QA

- **Scope:**
  - 44 pt chips (C-24).
  - Set-options discoverability (C-25).
  - TalkBack pass on Android and VoiceOver pass on iPhone.
  - 200 % Dynamic Type.
  - Contrast check of tertiary text in light mode.
  - Physical iPhone checklist (section I).

### WP7 — Visual polish

- C-26 to C-30 and C-32.

---

## I. Launch-blocker checklist

- [ ] **C-00a:** an off-device backup path users actually use: configured sync, or reminders plus last-backup status, plus an export path from the error screen. *(WP1: confirmed folder save on Android, truthful share status, reminders and recovery export are done; an iPhone confirmed-save path is still open.)*
- [ ] **Reliable device migration and recovery** (decision 6: cloud sync stays unchanged for now): a tested way to move a lifter's full history to a new or reinstalled phone, on both platforms, before public launch.
- [ ] **C-00b:** app icon and adaptive icon *(deferred to a separate branding decision)*.
- [ ] **C-00c:** physical iPhone pass covering:
  - workout logging with the keyboard;
  - safe areas on a notch and a Dynamic Island device;
  - rest notifications;
  - backup export through the share sheet and import through Files;
  - SecureStore session;
  - splash and launch.
- [ ] **iPhone backup and recovery checks (outstanding after WP1):**
  - Share a copy to Files, iCloud Drive and Mail, then import that file through Files on the same and a different iPhone;
  - test the iOS folder picker (`Directory.pickDirectoryAsync`) with read-back before enabling Save to a folder on iPhone, which is currently Android-only;
  - the Finish and backup sheets with the keyboard and safe areas;
  - the recovery screen in an installed build, including the raw database-copy fallback (Expo Go blocks it on both platforms);
  - Email support once a real address is configured.
- [x] **C-00c:** iPad verified, or `supportsTablet` set to `false` *(set to `false`: iPhone-first)*.
- [x] **C-01:** template weights respect profile units *(WP1; tests and emulator)*.
- [x] **C-02:** bodyweight goal never reports false completion *(WP1; tests and emulator)*.
- [x] **C-04:** Finish cannot silently drop entered sets *(WP1; tests and emulator)*.
- [x] **C-08:** no developer configuration text in the UI *(WP1)*.
- [x] **C-10:** the error boundary offers a data-rescue path *(WP1; Android emulator verified; the iPhone and installed-build checks are above)*.
- [ ] A dedicated FORGE support address, configured through `EXPO_PUBLIC_SUPPORT_EMAIL`.
- [ ] Privacy-policy and store privacy disclosures reviewed (health data is local; sync is opt-in).

---

## J. Recommended first implementation package

**Start with WP1 plus the three P1 correctness fixes (C-01, C-02, C-04).**

**Why:**

1. **Data safety comes first.** Today one reinstall erases a lifter's entire history, and the current tester is logging real data inside Expo Go. Last-backup status, reminders and an error-screen export are small, need no schema change, and protect every user immediately.
2. **Correctness before convenience.**
   - C-01 can prefill unsafe loads for pound users.
   - C-02 tells users a goal is complete when it isn't.
   - C-04 silently removes logged work from Progress.
   Each is a small, well-contained change with clear tests. Shipping them before the larger redesigns stops wrong numbers from accumulating in user history.
3. **It unblocks WP2.** The Finish sheet built for C-04 is the same surface as the post-workout summary and the **Back up now** prompt, so WP2's efficiency work builds directly on it.

WP2 (set copy-forward and tappable Prev) should follow immediately: it is the highest-frequency interaction in the app.

---

## Phase 7B progress — WP1 (approved)

| Item | Status | Verified on |
|---|---|---|
| **New P0 found during WP1: backup files could be shared before they were written.** Since Expo SDK 58, `File.write()` is asynchronous and `downloadBackup` didn't wait for it. Now awaited ([backup.ts](../../src/platform/backup.ts)). | Fixed | A unit test fails on the old code and passes on the new; on the emulator, the shared file was a complete backup (2 workouts, 9 sets). |
| **New defect found during WP1: Try again could never recover.** SQLite caches connections by name, so a failed startup connection was reused on every retry. Failed connections are now closed, and recovery reads through its own uncached connection ([native.ts](../../src/data/native.ts)). | Fixed | Emulator: with a corrupt database, the recovery screen showed; after a valid database was restored, Try again opened Today. Before the fix it failed again. |
| C-00a: backup status on You → Export backup; after-workout reminder when due (never backed up, or 3+ new workouts, or 7+ days with new workouts); "Not now" snoozes for 3 days. Stored in device settings, with no schema change. | Done | Unit and UI tests; emulator ("Last backup Oct 14 · 3 workouts since"; prompt after finishing). |
| **Decision 1: backup status is truthful.** A *confirmed* backup is only (a) Save to a folder: Forge writes the file into a folder the lifter picks, reads it back and compares it, or (b) importing a backup file, counted up to its export time. Share a copy is recorded separately as "Shared · not confirmed saved": it never counts as a backup or clears "due", and only pauses the after-workout prompt for the 3-day snooze. Save to a folder is Android only: iOS keeps share-only until its folder picker is verified on an iPhone. | Done | Logic tests (status, share vs confirmed, folder names); platform tests (write, read-back and record; cancel and mismatch record nothing; share records only a share); UI tests (You sheet, finish prompt, cancel stays open, share-only layout). **Emulator (Android):** the system folder picker opened, Documents was chosen and access allowed; the file was written and checked (a complete backup: 4 workouts, 12 sets); the alert read "Saved to Documents and checked"; You showed "Last backup today". Cancelling the picker recorded nothing. A share then showed "Shared today · not confirmed saved · last backup today". |
| Decision 7: support contact. Set `EXPO_PUBLIC_SUPPORT_EMAIL` and the recovery screen shows "Email support" with the error details pre-filled. Unset or invalid: no contact is shown. | Done | UI tests (unset, invalid, configured). |
| Decision 5: iPhone-first. `ios.supportsTablet` is `false`. | Done | `app.json`; exports. |
| C-10: recovery screen with Try again and Save a copy of my data (a JSON backup first, falling back to a raw copy of the database). Its message no longer claims the shared file was saved. | Done | Emulator: when startup failed but the database was readable, it shared a complete JSON backup (4 workouts, 12 sets). The raw-copy fallback **can't run in Expo Go** (Expo Go blocks file access to the database folder) and needs an installed build to verify. |
| C-01: template loads shown and entered in the profile's units; storage stays kg. | Done | UI tests (135 lb is stored as 61.235 kg and shown as 135; kg unchanged); emulator, light theme in pounds. |
| C-02: bodyweight goals match any spelling of body weight and never report completion without a logged weight. | Done | Logic and UI tests; emulator (81.8 kg with partial progress; "No bodyweight logged yet" with no progress). |
| C-04 and C-13: Finish opens a review sheet. Sets with a recordable result (reps, time or distance) that weren't ticked are listed per exercise. They stay out unless switched on (approved default), and the button is a non-destructive "Save workout". | Done | Logic and UI tests; emulator (the included set saved as completed, the rows not switched on kept their values, the empty set was untouched); standard and SE sizes, dark and light. |
| C-08: guest Account copy without developer configuration text. | Done | UI test; emulator. |
| C-00b app icon | **Deferred** to a separate branding decision | — |
| Cloud sync | **Unchanged by decision.** Reliable device migration and recovery are pre-launch priorities (see checklist I). | — |

## Phase 7B progress — WP2 (approved)

Starting commit `a8daf09`. The storage schema is unchanged: two repository methods were added (`workoutSnapshot` and `restoreWorkout`, used only to undo an edit), and edit copies live in device settings.

| Item | What changed | Verified on |
|---|---|---|
| **C-03: weight copy-forward** | Entering a working set's load fills the following working sets in that exercise that are not done, still hold 0, and were not typed into. Copying stops at the first set that doesn't qualify, so a set with its own load (and everything after it) is never touched. Loads Forge copied can be updated again by editing the source set; reps, rest, set counts and completion never change. It only runs in workouts in progress, never when editing history. Rules: [copy-forward.ts](../../src/domain/copy-forward.ts). | Logic tests; UI tests (pounds, typed loads kept, completed sets kept, no cross-exercise, edit mode off); emulator (100 kg filled set 2, stopped at set 3's 75 kg, verified in the device database; compact keyboard). |
| **C-03: tappable previous result** | An open set's previous result is an outlined button ("Use previous 135 pounds for 8 reps") that fills that one set with the previous load and reps (time or distance for those exercises), converted to the profile's units. It never completes the set or touches others. Done sets show plain text. | UI tests; emulator. |
| **C-04, C-13: finish review** | WP1's review sheet is kept unchanged in behaviour (unticked sets stay out unless switched on). Repeated values are condensed ("10 reps each"). Save is guarded against double taps. | UI test (two taps in one frame → one save). |
| **C-12: post-workout summary** | After a durable save, the sheet shows "Workout complete": name, date, working sets, exercises, duration (when at least a minute was recorded), volume (when any load was lifted) and new records from the Progress records engine (never on a first session). The WP1 backup reminder sits inside the summary and appears at most once; **Done** leaves, and leaving without backing up counts as "Not now". *Ordering:* the review, save, summary and reminder all live in one sheet rather than separate sheets, because chained modals on iOS can drop the second presentation. | Logic and UI tests; emulator (2,840 kg and a heaviest-set record matched the stored sets; force-stop on the summary → the workout was already saved and no duplicate existed). |
| **C-11: reorder** | ••• → Reorder exercises (on the workout or any exercise) opens a sheet: pick an exercise, then To top, Up, Down or To bottom. Every move saves at once; rows, sets and values move intact. Screen readers get the same moves as row actions. Moving the 8th exercise to the top takes 2 taps instead of 14. Drag-and-drop was not added: it needs a gesture dependency and is harder to make accessible. | Logic and UI tests; emulator (order verified in the device database). |
| **C-17: one workout at a time** | Train template Start (disabled), the template sheet (offers Resume), the templates screen (in-progress row, Train disabled), program Dashboard (Resume current workout), legacy Path Start (disabled with a note) and History → Repeat (alert offering Resume) all go through one guard ([startGuard.ts](../../src/startGuard.ts)). A session can still resume its own workout. Today already resumes. Exercise detail's "Add to workout" adds to the workout in progress, as before. | UI tests (Train, History, Templates, Dashboard). |
| **C-18: read-only review** | Finished workouts open read-only: values, completion state and notes, with no inputs, menus or Add buttons. **Edit** unlocks the logger with a Cancel / Save dock. Cancel (and the back button or Android back) asks before discarding, then restores the workout exactly, with the same identities. The pre-edit copy is kept in device settings, so an edit interrupted by FORGE closing reopens in edit mode. Durations show as "64 min". | Logic tests (exact restore, interrupted edit, refusal of foreign copies); UI tests; emulator (review has 0 inputs; edit → Cancel → Discard restored 80 kg; edit → Save kept 9 reps). |

**Emulator coverage (Android, Expo Go 58):**

- Sizes: compact, standard and large.
- Themes and text: dark; light with pounds; 130 % text.
- Workouts: empty, short, long (8 exercises), partly completed, finished (review and edit).
- Interactions: keyboard during weight entry; the finish review, summary and backup offer; the reorder sheet.
- Screenshots: `forge-visual-harness\shots\android\p10\`.

**Issues found on the emulator and fixed:**

- At 130 % text the review header cut off the duration and volume; the status now wraps to two lines.
- The summary's backup buttons blended into a filled card; the card is now outlined.
- Repeated values in the finish review ("10 reps, 10 reps, 10 reps") now read "10 reps each".

**Known limitations:**

- Copy-forward remembers typed-versus-copied sets only while the logger is open. After FORGE restarts, copies are treated like any other non-zero load and are not updated.
- In review mode, completed loads in pounds show with two decimals (176.37 lb), as before.

**iPhone checks outstanding:**

- Keyboard and the iOS input toolbar with the copy-forward cells.
- The summary sheet and its backup buttons on notched and Dynamic Island phones.
- Leaving mid-edit on iOS: the workout screen is a full-screen modal, so there should be no back-swipe that skips the Cancel prompt; confirm on a device. If an edit is ever left pending, it reopens in edit mode and can still be cancelled.
- VoiceOver row actions in the reorder sheet.

## Phase 7B progress — WP3 (approved)

Starting commit `3e387d2`. No schema, storage or dependency change: templates are still saved through `saveTemplate` with the same prescription shape, and scheduling writes the same `schedule` journal record (`{ name, templateId }` on a local date, with the same 9 AM reminder).

| Area | Before | After |
|---|---|---|
| **Library** | Cards with a row of wrapping buttons (Start, Edit, Duplicate, Delete, Schedule) and a global `YYYY-MM-DD` date field. | Design 2.0 rows: name, "3 exercises · 11 sets", the first exercises. One compact **Start** per row and a ••• menu (Edit, Schedule…, Duplicate, Delete). The footer **Create template** is the only orange action. Tapping a row opens its editor. The empty state explains templates. A Resume row and disabled Starts appear while a workout is in progress (WP2 guard). |
| **Editor (C-01)** | Free-text fields; loads entered as kilograms whatever the profile used. | A sheet with name and notes, and one expandable row per exercise: steppers for Sets, Reps, "Up to reps" and Rest (15 s), plus a load field with ± in the **profile's units** (5 lb or the profile increment). 135 lb is stored as about 61.23 kg and reopens as 135 lb. Remove asks first; Reorder uses the WP2 reorder list; Add exercise uses the exercise picker. Cancel, close or back asks before discarding changes. Saving is one atomic call guarded against double taps. |
| **Scheduling** | One global text date field applied to whichever template you scheduled. | ••• → Schedule… opens a month calendar (Monday first; today outlined; past days unavailable). The button reads "Schedule · Sun, Oct 25". |
| **Scheduled list** | Mixed cards. | ListRows with Today / Tomorrow / day / "Past · day" and the deload note, plus Start and a ••• menu ("Remove from schedule", or "Manage Path session" for Path entries). The confirmation text is unchanged. |
| **Train link** | "Edit or schedule" opened the templates list. | It opens that template's editor directly (`/templates?edit=<id>`). |

New: [TemplateEditor.tsx](../../src/components/TemplateEditor.tsx), [DateSheet.tsx](../../src/components/DateSheet.tsx), [Stepper.tsx](../../src/components/Stepper.tsx), [calendar-dates.ts](../../src/domain/calendar-dates.ts), [templates.ts](../../src/domain/templates.ts). [ReorderSheet.tsx](../../src/components/ReorderSheet.tsx) now exposes a generic `ReorderList`; the workout reorder sheet is unchanged.

**Tests:**

- Logic tests: calendar grids and year boundaries, prescription text, unit round trip, summaries, moves.
- UI tests: empty state; row actions; delete confirm; active-workout guard; create with steppers (single save); 135 lb → 61.23 kg; remove and reorder; unsaved guard; Train's edit link; schedule writes the same record; closing the picker schedules nothing; planned Start and remove.

**Emulator coverage (Android, Expo Go 58):**

- Sizes: compact, standard and large.
- Themes and text: dark; light with pounds at 130 % text.
- Library states: empty, one, many, long (8 exercises), scheduled (past, today and future), active workout.
- Editing: create, edit, expanded exercise, keyboard on the load field, unsaved prompt, reorder, remove confirm, save persisted (sets and order), menu, calendar, schedule end to end (the new entry appears in date order).
- Screenshots: `forge-visual-harness\shots\android\p11\`.

**Issue found on the emulator and fixed:** on compact phones "Save template" wrapped to two lines. The save button now takes two-thirds of the footer.

**Issue found on the owner's iPhone and fixed:** Add exercise did nothing. The exercise picker and reorder sheet were rendered next to the editor sheet; iOS cannot present a second modal from outside one that is already showing (Android can, so the emulator missed it). Both are now rendered inside the editor sheet. A UI test checks that each opens nested inside the editor, and it fails on the old layout. Android re-verified: the picker opens over the editor and the picked exercise is added.

**Behaviour changes (approved by the owner):**

- Past dates can no longer be scheduled; the old text field accepted any date. Existing past entries still show as "Past · day" and can be started or removed.
- A newly added exercise starts with the profile's default rest (it was always 90 s).

**iPhone checks outstanding:**

- Keyboard and the input toolbar on the load field inside the editor sheet.
- The calendar and reorder sheets stacked over the editor (iOS modal presentation).
- VoiceOver on the steppers and calendar days.

## Phase 7B progress — WP4A Nutrition (implemented, in review)

WP4 is split into WP4A (Nutrition), WP4B (Measurements), WP4C (Recovery) and WP4D (Goals), each reviewed separately. The WP4A audit, the founder's decisions (D1–D10), the implementation, tests, emulator results and outstanding iPhone checks are in [PHASE_7B_WP4A_NUTRITION_AUDIT.md](PHASE_7B_WP4A_NUTRITION_AUDIT.md). WP4A resolves C-06 and the nutrition part of C-05.

## Phase 7B progress — WP4A.1 Built-in food library (implemented, in review)

A curated, offline USDA FoodData Central library (3,730 foods) inside Nutrition's Add food, built reproducibly from pinned USDA releases. Research, decisions, implementation results, measurements and outstanding iPhone checks are in [PHASE_7B_WP4A1_FOOD_LIBRARY_PLAN.md](PHASE_7B_WP4A1_FOOD_LIBRARY_PLAN.md).

## Phase 7B progress — WP4B Measurements (implemented, in review)

A dedicated Measurements screen on the same route (overview with ranges and date-spaced charts, other measurements, day-grouped history, a log/edit sheet) plus the approved, narrowly scoped Progress → Body chart fix. Same journal records; no schema, backup or sync change. Audit, founder decisions, specification, results and iPhone checks: [PHASE_7B_WP4B_MEASUREMENTS_AUDIT.md](PHASE_7B_WP4B_MEASUREMENTS_AUDIT.md). Resolves the Measurements part of C-05.

## Phase 7B progress — WP4C Recovery (implemented, in review)

A dedicated Recovery screen on the same route: a Today summary of what was recorded (no score), a keyboard-free check-in with labelled 1–5 scales and a last-night's-sleep stepper (nothing prefilled), real-date trends with plain summaries, and month-grouped history with change-only edits and delete with Undo. Same journal records and storage validation; no schema, backup or sync change; nothing feeds training. Audit, decisions D1–D12, results and iPhone checks: [PHASE_7B_WP4C_RECOVERY_AUDIT.md](PHASE_7B_WP4C_RECOVERY_AUDIT.md). Resolves the Recovery part of C-05 and C-15.

## Phase 7B progress — WP4D Goals (implemented, in review)

A dedicated Goals screen on the same route. All six goal types stay creatable, each with an exact, stated measurement:
- bodyweight up or down;
- the heaviest working-set lift at N reps;
- volume from a chosen day;
- workouts per week;
- session length at most or at least over 4 weeks;
- daily logged calories at most or at least.

Bars appear only with a real starting point. Confirmed achievements keep their real dates permanently. Legacy goals keep their meaning, with opt-in conversion. Units follow the profile (M-15). The last generic journal form is retired. Same journal records and storage validation; no schema, backup or sync change. Audit, decisions D1–D23, results and iPhone checks: [PHASE_7B_WP4D_GOALS_AUDIT.md](PHASE_7B_WP4D_GOALS_AUDIT.md). Resolves C-05's goal part, C-15, C-19 and M-15.

## Phase 7B progress — WP5 Secondary-screen consistency (implemented, in review)

Four batches:
- **A:** named destructive confirmations; friendly save errors with developer logs; guest-mode About row.
- **B:** profile editors in the lifter's units, with commas, steppers and field messages; onboarding intact.
- **C:** exercise library, detail and custom-exercise form using catalogue values; the shared picker's Add/Choose.
- **D:** Account chrome; the legacy Path reschedule calendar; History paging; a not-found page.

Presentation only: no schema, backup, sync, auth, programming or calculation change. Audit, decisions D1–D14, results and iPhone checks: [PHASE_7B_WP5_SECONDARY_SCREEN_CONSISTENCY_AUDIT.md](PHASE_7B_WP5_SECONDARY_SCREEN_CONSISTENCY_AUDIT.md).

*End of report. Phase 7B WP1, WP2 and WP3 are approved and committed (WP2 and WP3 verified on the owner's iPhone); WP4A, WP4A.1, WP4B and WP4C are committed and awaiting the owner's iPhone review; WP4D is committed and approved on the owner's iPhone; WP5 is implemented, uncommitted and awaiting review; WP6–WP7 have not begun.*
