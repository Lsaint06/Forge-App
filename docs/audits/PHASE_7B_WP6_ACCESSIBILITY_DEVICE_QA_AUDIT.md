# FORGE — Phase 7B WP6: Accessibility and Device QA Audit

**Status: audit only.** No application code was changed. Nothing in this audit is committed. WP7 has not begun.

Evidence lives outside the repository in `forge-visual-harness/shots/android/p23/` (112 captures, 20 accessibility-tree scans as CSV) and `forge-visual-harness/p23.ps1` (the capture script). Every finding is labelled:

- **[Device]:** reproduced on the Android emulator;
- **[Tree]:** read from Android's live accessibility tree, which is what TalkBack consumes;
- **[Code]:** supported by source with file and line;
- **[Calc]:** measured, such as a contrast ratio;
- **[Hypothesis]:** not verified; needs a device check.

---

## 1. Verified branch and baseline

| Item | Value |
| --- | --- |
| Branch | `feat/forge-paths-foundation` |
| Local HEAD | `ac0f6cf59f605e8999526ad79b01d943f7c10f3d`: "WP5: Secondary-screen consistency (batches A-D)" |
| Remote | `origin/feat/forge-paths-foundation` at the same commit after `git fetch` |
| Working tree | Clean at the start of the audit |

| Check (re-run, not assumed) | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (the existing WP3 test warning only) |
| `npm run format:check` | Pass |
| `npm test` (logic, including the 18 curated program locks) | 334 / 334 |
| `npm run test:ui` | 27 suites, 269 / 269 |
| `npm run food-library:check` | Reproducible: 3,730 foods, catalogue hash `2d95151e…6001` |
| `npm run export` (iOS and Android) | Pass |

## 2. WP5 finalization

WP5 was committed and pushed as **`ac0f6cf`** on the founder's instruction before this brief, so no duplicate commit was made. The remote HEAD matches the local HEAD. No protected subsystem appears in the WP5 diff.

**One WP5 regression was found during this audit (F-01).** It is reported here and not silently fixed, because WP6 is audit-only. See D1.

## 3. Device testing capabilities and limitations

| Capability | Status |
| --- | --- |
| Android emulator | Pixel 7 AVD, **API 35 Google APIs** image. Viewports emulate the iPhone SE (375 × 667 dp), standard (393 × 852), large (430 × 932) and a **narrow Android phone (360 × 800 dp)**. |
| Text size | Android `font_scale` 1.0, 1.3, 1.6 and 2.0. React Native applies it **linearly** (Android 14's non-linear scaling doesn't apply to RN text), so 2.0 roughly equals iOS AX3 for body text. |
| Accessibility tree | Captured with UI Automator for 19 screens. A script lists every clickable node with its spoken name, class, state and size in dp. **The active workout logger can't be dumped**: its live clock keeps the screen busy. Its semantics come from code and the existing UI tests. |
| TalkBack | **Installed and run.** TalkBack enabled and drew focus on Forge's controls. **Its speech output couldn't be captured, and stepping or activation through adb wasn't reliable** under touch exploration on this image. Speech, focus order inside sheets and focus restoration are therefore **not verified**. Labels come from the same tree TalkBack reads. |
| VoiceOver (iOS) | **Not exercised.** Every iOS statement here is code-inferred, and the founder checklist (section 21) covers it. |
| Interruptions | Home/background, screen lock, `am force-stop` (process death) and airplane mode, each with the database pulled and inspected after the event. |
| Notifications | Expo Go has **no notification permission** on the emulator, so the rest-end notification couldn't be verified. |
| Performance | Metro in **production mode** (`--no-dev --minify`) with `dumpsys gfxinfo`. Emulator rendering isn't representative of a phone, so the numbers are used **relatively** (section 12). |
| Cutouts | The tall and corner cutout overlays were enabled. They may not apply fully at an overridden resolution, so the evidence is partial. |

All tests used disposable seeded databases. No personal data was touched.

## 4. Accessibility inventory

### Routes and surfaces

| Route | Screen | Sheets and dialogs |
| --- | --- | --- |
| `/(tabs)` Today | Home.tsx | check-in, quick add, start guards |
| `/(tabs)/train` | train.tsx | template sheet, DateSheet |
| `/(tabs)/progress` | Progress.tsx | exercise chooser (local), InfoSheets |
| `/(tabs)/profile` You | You.tsx | ProfileForm sheets, backup sheet, privacy, confirmations |
| `/workout` | Workout.tsx | ExercisePicker, FinishSheet, ReorderSheet, rename/notes/rest/template sheets, confirm discard |
| `/journal?kind=nutrition` | Nutrition.tsx | QuickAddSheet, FoodEditorSheet, DateSheet |
| `/journal?kind=measurement` | Measurements.tsx | MeasurementSheet, DateSheet, overflow menus |
| `/journal?kind=recovery` | Checkins.tsx | CheckinSheet, DateSheet |
| `/journal?kind=goal` | Goals.tsx | GoalSheet, ExercisePicker ("Choose"), DateSheet |
| `/history`, `/records`, `/calendar` | History, Records, TrainingCalendar | overflow menus, InfoSheets, DateSheet |
| `/templates` | templates.tsx | TemplateEditor, DateSheet, menus |
| `/explore`, `/exercise` | explore.tsx, exercise.tsx | SelectRow sheets |
| `/forge-paths`, `/forge-paths/[id]`, `/forge-paths/current` | programs/* | confirmations |
| `/paths` (legacy) | LegacyPath.tsx | manage, options, DateSheet |
| `/account`, `/onboarding`, `+not-found`, `/design-system` (dev) | — | — |

### Shared controls

| Control | Role and state | Target | Notes |
| --- | --- | --- | --- |
| `Button`, `TextButton` | button, disabled | 44–54 | — |
| `BackButton` | button "Back" | 44 × 44 + hitSlop 4 | Clipped to 34 dp wide on Explore **[Tree]** |
| `IconButton` | button, selected/disabled | 44 + hitSlop 4 | Always labelled |
| `ListRow` | button with hint, or one grouped accessible element | 56 / 64 | — |
| `Chips` | button, **selected** | **40** + vertical hitSlop 4 | No role group |
| `SegmentedControl` | tablist / tab, **selected** | **38** | Labels on **one line** |
| `Choices` | radiogroup / radio, checked | 56 | — |
| `Stepper` | adjustable with increment/decrement actions | 44 | — |
| `Field`, `NumberField` | text input labelled by its caption | 48 | Errors as plain text (F-03) |
| `SetGrid` cells | inputs labelled "Set 2 weight" etc.; error in the **hint** | 44 | Check is an `IconButton` ("Complete set 2" / "Mark set 2 incomplete", selected) |
| `DateSheet` days | button, selected/disabled; label "Sat, Oct 24, today" | 44 tall | Header row hidden from readers |
| `LineChart`, `BarChart` | **adjustable**, value text, increment/decrement | — | Selected point described |
| `ProgressBar`, `ProgressRing` | progressbar with min/max/now | — | — |
| `Sheet` | Modal; × "Close"; Android back and VoiceOver escape | — | No explicit modal focus code (F-12) |
| `OverflowMenu` | menu / menuitem, disabled | trigger 44 | — |
| Undo banners | `announceForAccessibility` on show | — | Nutrition, Measurements, Recovery, Goals, quick add |

### Accessibility-tree scan (standard size, 100 % text) **[Tree]**

Across 19 scanned screens (402 controls), **every control has a spoken name**. None is unlabelled.

| Screen | Controls | Under 44 dp | Real cause |
| --- | --- | --- | --- |
| Today, Train, Templates, Exercise, Account, Calendar, Records, Nutrition, Goals | 9–38 each | 0 | — |
| Progress | 20 | 7 | Segmented control 38 dp ×6 |
| You | 29 | 8 | Segmented control 38 dp ×5 |
| Measurements | 36 | 6 | Segmented 38 dp ×5 |
| Recovery | 40 | 11 | Segmented 38 dp; metric chips 40 dp |
| Explore | 39 | 4 | Chips 40 dp; **Back 34 × 44** |
| Forge Paths current | 13 | 2 | Segmented 38 dp |
| Legacy Path | 15 | 6 | Week-day cells **43 × 89** |
| Onboarding | 9 | 3 | kg / lb chips 40 dp |
| History | 59 | 5 | All rows clipped at the viewport edge (not defects) |

Rows with heights such as 4, 6 or 17 dp were cut off by the viewport edge and are excluded.

## 5. Cross-device test matrix (what was captured)

| State | SE 375 | Narrow 360 | Standard 393 | Large 430 |
| --- | --- | --- | --- | --- |
| 100 % text | logger, gym interruption set | Today, logger, Nutrition, Progress, Recovery, program | tree scan (19 screens), perf, pending delete | (WP5 p22) |
| 130 % | logger, Progress | — | — | (WP5 p22) |
| 160 % | 10 screens and 4 sheets | — | — | — |
| 200 % | 10 screens, 4 sheets, logger, keyboard-open measurement and food search | — | — | — |
| Keyboard open | logger set cell, measurement 84,5 (200 %), food search (200 %) | — | — | — |
| Cutout (tall, corner) | Today, logger, sheet | — | — | — |
| Landscape | Today (stays portrait) | — | — | — |
| Airplane mode | logger set completion | — | — | — |
| Light theme | (WP4–WP5 p17–p22) | — | — | — |

Earlier packages already cover light theme and 130 % text per screen (p17–p22). This audit adds the extremes: 160 %, 200 %, narrow widths, interruption and offline.

## 6. Screen reader and focus findings

| ID | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| F-03 | **Field validation errors aren't announced.** `Field` renders its error as separate text with no live region and no announcement (`ui.tsx` ~577–620). SetGrid puts errors in the input's **hint** (`SetGrid.tsx:222`), which is read only when the field is focused. WP4 sheets do announce some outcomes (GoalSheet, CheckinSheet, MeasurementSheet). The older forms don't: ProfileForm, custom exercise, template editor, Account. No `accessibilityLiveRegion` exists anywhere. | [Code] | P2 |
| F-08 | **Rest timer label changes every second** ("Rest, 1:29 remaining", role `timer`) (`Workout.tsx:150–158`). VoiceOver may re-read it while focused; TalkBack behaviour is unknown. **The end of rest is signalled only by a haptic** and a notification (which needs permission). | [Code] / [Hypothesis] | P2 |
| F-12 | **Sheets have no explicit focus management.** They use RN `Modal`, which on iOS (a presented view controller) and Android (a dialog window) confines screen-reader focus natively. Initial focus and focus restoration on close are platform-default and unverified. | [Code] / [Hypothesis] | P2 (verify) |
| F-16 | The sheet close button is "Close" everywhere. The sheet title precedes it, so context exists. | [Code] | P3 |
| F-13 | Goals and Check-ins delete through a raw `Alert` titled "Delete goal?" with a "Delete" button. This is clear, but differs from WP5's `confirm` helper. | [Code] | P3 |

**Confirmed working:**
- **[Tree]** every control is named;
- set completion reads "Complete set 2" / "Mark set 2 incomplete" with selected state;
- the read-only review reads "Set 2 done / not done";
- charts are adjustable, with value text;
- progress bars and rings report min, max and current values;
- the calendar hides decorative weekday headers;
- picker rows read "Add …" or "Choose …" with a muscle and equipment hint;
- Undo banners are announced;
- the elapsed clock reads "Elapsed time 30 minutes" (once a minute).

## 7. Dynamic Type findings

Design System 2.0 caps growth for `display` (1.3×), `metricXL` (1.2×), `title` and `metric` (1.5×). Body, caption and overline scale fully. Tab labels are system-sized.

| ID | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| F-02 | **Segmented controls truncate their options**, so the selected option can't be read. Already at **130 % on SE**: Progress reads "4 wee… · 12 we… · 1 year · All time". At 160–200 %: Nutrition meals "Brea… Lunc… Dinn… Snac…", You → Appearance "Syste…", program "Lower fati…", Progress "4 we.. 12 w.. 1 ye… All ti…". Root cause: `SegmentedControl` options are `flex: 1` with `numberOfLines={1}`, at a fixed 14 px that scales (`ui.tsx` ~800–820). Accessible names stay complete. | [Device] `se-f13-progress`, `se-f16-*`, `se-f20-*`, `se-f20-goal-kb` | **P1** (shared control, common setting) |
| F-07 | **Meaningful text truncates or breaks mid-word** at large sizes. Truncated: Progress detail "16 of 18 se…" (160 %) and "VOLUME (…" (200 %); workout header "8 of 31 sets · 5,360…" (130 %) and "8 of 31 set…" (200 %); the chart's selected description "Sat, Oct 24 · 2 entr…" (200 %). Mid-word breaks: Nutrition macro overline "PROTE / IN" (200 %) and the set grid column caption "SE / T" (200 %). | [Device] `se-f13-logger`, `se-f16-progress`, `se-f20-*` | P2 |
| — | **Holds well:** Today, Train, Recovery, Measurements, Goals, Forge Paths, You, sheets and the set grid at 200 % (it stacks "Previous 45×8" under each set). Primary actions stay pinned and visible. Nothing is off-screen. | [Device] | — |
| F-17 | At 200 % on SE, Add food's list shows about one result with the keyboard closed. It stays usable but is cramped. | [Device] `se-f20-nutrition-add` | P3 |

## 8. Touch target analysis

Design System 2.0 states "Every tap target is at least 44 pt". Android's guideline is 48 dp.

| ID | Control | Measured **[Tree]** | Where |
| --- | --- | --- | --- |
| F-04a | `SegmentedControl` option | **38** dp tall | Progress, You, Measurements, Recovery, Forge Paths, sheets |
| F-04b | `Chips` | **40** dp tall (+4 hitSlop, so a 48 dp touch area but 40 dp a11y bounds) | Explore, Recovery metrics, onboarding kg/lb, sheets |
| F-04c | `BackButton` on Explore | **34 × 44** (the −10 margin is clipped by the list container) | explore.tsx |
| F-04d | Legacy Path week cells | **43 × 89** | LegacyPath.tsx |
| F-04e | Set grid "Use previous" | 32 / 24 tall + vertical hitSlop **[Code]** | SetGrid.tsx ~426 |

**Meets 44:**
- IconButton (with steppers, menus and sheet close), Buttons, ListRows, DateSheet days (44, under Android's 48);
- set check buttons, the rest timer's +30 and Skip, picker rows (64).

**Gestures:** none are required. Reordering has accessibility actions and buttons, charts are adjustable, and sheets have no swipe-to-dismiss. Nothing uses long-press only. **[Code]**

Severity: **P2** (F-04a–e).

## 9. Contrast and theme findings **[Calc]**

| Pair | Dark | Light | WCAG need |
| --- | --- | --- | --- |
| text on bg / surface / raised | 17.6 / 16.2 / 14.5 | 16.6 / 18.5 / 15.6 | 4.5 ✓ |
| text2 on bg / surface / raised | 8.3 / 7.7 / 6.8 | 6.5 / 7.2 / 6.1 | 4.5 ✓ |
| **text3 on bg / surface / raised** | **4.17 / 3.84 / 3.43** | 4.26 / 4.74 / **4.00** | 4.5 for text ✗ |
| ember text on surface | 6.0 | 5.2 | 4.5 ✓ |
| success / warning / error on surface | 7.3 / 9.1 / 6.6 | 5.9 / 5.9 / 7.0 | 4.5 ✓ |
| onEmber on ember (primary label) | 6.6 | 5.2 | 4.5 ✓ |
| selected chip (bg on text) | 17.6 | 16.6 | ✓ |
| **Field fill vs card** (surfaceRaised / surface) | **1.12** | **1.19** | 3.0 for component boundaries (1.4.11) |
| **Selected segment fill vs track** | **1.35** | **1.19** | 3.0 for state indicators |

| ID | Finding | Severity |
| --- | --- | --- |
| F-05 | **Tertiary text carries meaning at 13 px but fails 4.5:1** in dark mode (3.4–4.2:1) and on light raised surfaces (4.0:1). Uses include chart Low/High (`charts.tsx:139,142,332,335`), Progress detail (`Progress.tsx:119,448`), GoalCard and GoalSheet hints (`GoalCard.tsx:54`, `GoalSheet.tsx:390`), You (`You.tsx:283`), Recovery (`Recovery.tsx:93`) and programs (`programs.tsx:213,224`). `tests/design-tokens.test.ts` deliberately allows tertiary at 3:1 because it was intended for indicators and disabled text. Meaningful captions should use `text2`. Lightening `text3` to 4.5:1 would bring it within 1.34:1 of `text2` and collapse the hierarchy. | P2 |
| F-06 | **Fill-only boundaries.** Inputs have no border until focused, and the selected segment differs by fill (1.1–1.4:1). Mitigations: inputs carry a visible caption above them; the selected segment also changes text from `text2` to `text`. | P3 (inputs) / P2 (segment state) |
| — | Colour is never the only status signal: completed sets have a check, the calendar has icons and labels, errors have text, and charts have a legend and a selected description. | — |

## 10. Keyboard and form findings

| ID | Finding | Evidence | Severity |
| --- | --- | --- | --- |
| **F-01** | **WP5 regression: authored validation sentences are hidden.** WP5 (S-03) maps every schema error to "Some values couldn't be saved. Check the form and try again." This also replaces the schema's **authored** messages. The most common case: tapping ✓ on a set without reps now says only "Could not save … Check the form". Before WP5 the (raw) message contained "Enter repetitions, duration or distance before completing a set" (`validation.ts:55–60`). Also affected: "Minimum reps must not exceed maximum reps" and "Rep ranges require positive, ordered bounds". **Reproduced 3 times** during gym tests. No data is affected; nothing is saved. | [Device] `se-gym-offline-set`, `se-gym2-rest`, [Code] `state.ts:37–43` | **P1** |
| F-09 | **No double-submit guard** on custom-exercise Save (`exercise.tsx`, WP5): two taps in one frame can create two exercises with different ids. The **shared picker** (`ExercisePicker.tsx`) calls `onPick` then `onClose`, so a same-frame double tap can add an exercise twice in the logger, templates or substitute. Finish workout, Template save, Goals, Nutrition, Measurements and Check-ins are guarded or tested (`pressTwiceInOneFrame` in 5 suites). | [Code] | P2 |
| F-18 | An **invalid draft** in a set cell is kept only in memory. If the process dies before blur, the cell reopens with the last valid value. **Valid values save on every keystroke:** typing 62.5 was in the database while the keyboard was still open, and survived background and force-stop. | [Device] / [Code] `SetGrid.tsx:170–184` | P3 |
| — | **Confirmed working:** comma decimals (84,5 at 200 %); Save pinned above the keyboard at 200 %; food search results visible with the keyboard open; "Discard changes?" on input sheets (DS2.0, tested); unchanged edits write nothing (WP4B–WP5 tests). | [Device] / [Tests] | — |

## 11. Platform-specific differences

| Area | Android (evidence) | iOS (code-inferred) |
| --- | --- | --- |
| Sheets | `Modal` dialog window; Back closes (asks to discard if unsaved). The strip under the sheet shows the screen behind it (noted in WP5). | Presented modal; VoiceOver escape closes it. |
| Alerts | Native AlertDialog; buttons upper-cased ("CANCEL", "DELETE"). | UIAlertController; destructive red. |
| Keyboard | No accessory bar: `KeyboardBar` returns null on Android; "next" return key moves cells. Gboard occasionally floats (emulator only). | Accessory bar with rest countdown, Next and Done. |
| Keyboard avoidance | `KeyboardAvoidingView` behaviour off on Android (window resize). Verified that pinned footers stay visible. | `padding`; verified on iPhone in WP3–WP5. |
| Orientation | Locked portrait (`app.json`); rotation ignored **[Device]**. Expected. | Same; `supportsTablet: false`. |
| Text scale | Linear `font_scale`. | Dynamic Type sizes (largest standard ≈ 135 %; AX5 ≈ 310 % for body). |
| Notifications | Permission not granted to Expo Go on the emulator; unverified. | Unverified. |
| Deep links | `forge://` and `exp://…/--/route` work; unknown routes show Page not found (WP5). | Same, by router. |
| Haptics | Called; not perceivable on the emulator. | Expected on device. |

## 12. Long lists and performance

Production-mode Metro, standard viewport, 6–8 flings per screen. "Janky" uses Android's frame deadline.

| Surface (seed) | Frames | Janky | p90 | p99 |
| --- | --- | --- | --- | --- |
| Templates (3) | 188 | 6.4 % | 31 ms | 36 ms |
| Recovery (203 check-ins) | 294 | 7.5 % | 34 ms | 53 ms |
| Measurements (169 entries) | 295 | 8.1 % | 34 ms | 46 ms |
| Exercise picker open and scroll (367) | 366 | 10.9 % | 34 ms | 65 ms |
| History "Show earlier" (265) | 314 | 13.7 % | 38 ms | 69 ms |
| History first page (60 of 265) | 356 | 18.0 % | 42 ms | 65 ms |
| Progress (265 workouts) | 259 | 21.6 % | 48 ms | 65 ms |
| Food search typing (3,730) | 240 | 21.7 % | 44 ms | 85 ms |
| Forge Paths current program | 234 | 26.1 % | 65 ms | 117 ms |
| Explore (367 cards) | 321 | 27.7 % | 53 ms | 93 ms |
| **Active workout logger (31 sets, live clock)** | 188 | **46.8 %** | **85 ms** | **150 ms** |

- **Baseline:** simple lists on this emulator run at 6–8 % janky.
- **F-11, relative outliers:** the **logger** (gym-critical), then Explore, the program dashboard, Progress and food search. The clock and rest timer re-render only themselves (`SessionClock`, `RestTimer`), so there's no confirmed code cause yet.
- **Interpretation:** an **observation, not a confirmed defect**. Emulator GPU and CPU differ from an iPhone. Per the brief, **no optimisation without device evidence** (D10). P2 pending measurement.
- Repeated sheet opening and dismissal behaved normally (no leaks observed across about 60 sheet openings in this audit).

## 13. Active workout interruption analysis [Device, SE, database inspected after each step]

| Interruption | Result |
| --- | --- |
| Typing a load (62.5) with the keyboard open | **Saved immediately** (and filled down to later empty sets, as designed). |
| Background with the keyboard open, then return | Value kept. |
| Complete set → rest 1:29 → background 40 s → return | Rest showed **0:45**: derived from the stored deadline, correct. |
| Screen lock 60 s during rest | Rest elapsed and was cleared on return; the clock continued from the stored start. |
| `force-stop` (process death), reopen | **Active workout restored with every set**, including the completed 45×8. `restDeadline` cleared after expiry. |
| Airplane mode, then "Previous 45×8" and complete | **Written** (45×8 ✓ in the database). |
| Completing a set with 0 reps | "Could not save" with the generic text (**F-01**). |
| Rest-end notification while backgrounded | **Not verifiable** (no permission for Expo Go on the emulator). |

**Code:**
- Every set edit is a synchronous SQLite transaction (`repository.ts:573–586`).
- Elapsed time derives from `startedAt` and the pause fields (`Workout.tsx:238–251`).
- The rest deadline is absolute (`SetGrid.tsx:515`).
- Startup reopens the database and retries on app activation (`_layout.tsx:62–91`).

## 14. Offline functionality

**Fully offline (local SQLite, bundled catalogues):**
- workouts (start, sets, finish, edit), templates, Forge Paths and legacy Paths;
- the exercise library and custom exercises;
- nutrition and the 3,730-food library (airplane mode verified in WP4A.1, p14);
- measurements, recovery, goals, history, records, progress;
- backups (local files).

**Needs a service:**
- Account sign-in and sync (Supabase; not configured, so guest mode);
- exercise media links (`Linking`), which open externally.

Startup never needs the network. While offline, writes queue in the outbox, and the outbox is preserved (WP5 tested this in guest mode).

## 15. Data-integrity risk assessment

| Risk | Status |
| --- | --- |
| Set edits lost on process death | **Safe** [Device] |
| Active workout lost on restart | **Safe** [Device] |
| Duplicate workout from double Start | **Safe**: `startWorkout` returns the active workout [Code] |
| Double Finish | **Guarded** (`FinishSheet` `saving` ref) [Code] |
| Double Save: Goals, Nutrition, Measurements, Check-ins, Templates | **Guarded or tested** |
| Double Save: custom exercise; double pick in the shared picker | **Risk** (F-09) [Code] |
| Undo-held deletes (Goals, Check-ins) and process death | **Reproduced:** the deleted goal **comes back** (`standard-pending-*`). Intent is lost, but data is safe. Backgrounding then an OS kill gives the same result. (F-10, D8) |
| Backup restore interrupted | **Safe**: validated before clearing; one SQLite transaction (`repository.ts:789–837`) |
| Invalid backup | **Safe**: rejected with the WP5 message; nothing changes |
| Offline sync queue | **Safe**: outbox preserved; acknowledgement removes only matching payloads |
| Repeated deletion | Confirmations are modal alerts; rows hide on delete [Code] |

**No P0 issue was found.**

## 16. Existing automated coverage

| Area | Covered | Gaps |
| --- | --- | --- |
| Roles and labels | Strong in design-system, goals, measurements, legacy-path, Forge Paths, wp5 | SegmentedControl and Chips role/state assertions per screen; You and Account |
| Selected and disabled states | design-system, Choices, DateSheet | Segmented controls on Progress, Nutrition and You |
| Large text | **None** (RNTL has no layout) | Unit tests for wrap props (`numberOfLines`) on shared controls |
| Touch targets | **None** | Style assertions: `minHeight ≥ 44` for SegmentedControl, Chips and BackButton |
| Keyboard | decimal-input, fields, unsaved-input | — |
| Interruption | Restart via repository reopen (implicit) | AppState background commit (if D8); rest deadline across "time travel" |
| Offline | food-library offline | Workout flow with the network mocked off (trivially local) |
| Double press | goals, nutrition, measurements, check-ins, food library | **custom exercise, picker rows, logger set check** |
| Long lists | History paging (wp5), food library | Explore and Progress render with large seeds |
| Validation messages | wp5 (generic mapping) | **Authored refine messages survive (F-01)** |
| Contrast | design-tokens (palette pairs) | Usage rule: tertiary only for non-essential text |

## 17. Severity table

| ID | Sev. | Type | Area | Summary |
| --- | --- | --- | --- | --- |
| F-01 | **P1** | Reproduced (WP5 regression) | state.ts | Authored validation sentences replaced by generic text (0-rep set) |
| F-02 | **P1** | Reproduced | SegmentedControl | Options truncate from 130 % (SE); 6+ screens |
| F-03 | P2 | Code-supported | Field, SetGrid | Errors not announced; no live region |
| F-04 | P2 | Reproduced (tree) | Segmented, Chips, Back, legacy cells, Use previous | Targets 24–43 pt, under DS2.0's 44 |
| F-05 | P2 | Measured | text3 captions | 3.4–4.2:1 for meaningful 13 px text |
| F-06 | P2/P3 | Measured | Segmented state, inputs | Fill-only indicators 1.1–1.4:1 |
| F-07 | P2 | Reproduced | Progress, logger header, charts, overlines | Truncated or mid-word values at large text |
| F-08 | P2 | Hypothesis | Rest timer | Per-second label; end of rest only by haptic |
| F-09 | P2 | Code-supported | Custom exercise, picker | No double-submit guard |
| F-10 | P3 | Reproduced (safe) | Goals, Check-ins Undo | Delete intent lost on process death |
| F-11 | P2 | Observation | Logger, Explore, program, Progress, food search | Relative jank on the emulator; needs phone profiling |
| F-12 | P2 | Unverified | Sheets | Focus entry and restoration platform-default |
| F-13 | P3 | Code | Goals, Check-ins | Raw Alert vs `confirm` helper |
| F-16 | P3 | Code | Sheet ×, "Close" | Generic but contextual |
| F-17 | P3 | Reproduced | Add food at 200 % | Cramped list |
| F-18 | P3 | Code / Device | SetGrid | Invalid drafts not persisted (valid ones are) |

## 18. Reproduction steps and screenshot references (`shots/android/p23/`)

- **F-01:** in an active workout, tap ✓ on a set with 0 reps. "Could not save … Check the form and try again." Screenshots: `se-gym-offline-set.png`, `se-gym2-rest.png`.
- **F-02:** set text size to 130 % on a 375-pt-wide phone and open Progress (`se-f13-progress.png`). At 160 %: `se-f16-progress.png`, `se-f16-nutrition-add.png`. At 200 %: `se-f20-progress.png`, `se-f20-nutrition-add.png`, `se-f20-goal-kb.png` (You → Appearance), `se-f20-program.png`.
- **F-04:** `scan-*.csv` (columns `name`, `w`, `h` in dp).
- **F-07:** `se-f13-logger.png`, `se-f16-progress.png`, `se-f20-logger-1.png` ("SE / T"), `se-f20-nutrition.png` ("PROTE / IN"), `se-f20-measure.png`.
- **F-10:** `standard-pending-0/confirm/undo/after-kill.png`.
- **Interruptions:** `se-gym-*.png`, `se-gym3-rest.png` → `se-gym3-rest-after40.png` → `se-gym3-after-kill.png`; offline: `se-offline-logger.png`.
- **Narrow 360:** `narrow-*.png`. **Cutouts:** `se-cut-*.png`. **Landscape:** `se-landscape-today.png`.
- **TalkBack focus:** `talkback-probe3.png`, `tb-try-altdown.png`.
- **Performance:** section 12 (from `p23.ps1 perf`).

## 19. Proposed WP6 implementation batches

### Batch A: Feedback, semantics and targets (shared components first)

| | |
| --- | --- |
| **Defects** | F-01, F-02, F-03, F-04, F-09 |
| **Root causes** | One mapping in `saveErrorMessage`; single-line segmented labels; error text without a live region; control minimum heights of 38/40; no once-only guard |
| **Changes** | **F-01:** show the schema's authored (custom-rule) messages; keep the generic sentence for built-in type errors; keep the console diagnostics. **F-02:** options wrap to two lines and grow in height; above about 1.6× (or when an option can't fit), switch to a stacked list using the same `tab` semantics (D2). **F-03:** `Field` and SetGrid errors get `accessibilityLiveRegion="polite"` (Android) and an announcement when an error first appears (iOS). **F-04:** SegmentedControl and Chips at ≥ 44 pt minimum height; fix the BackButton clipping on Explore; "Use previous" at least 44 pt tall where space allows (hitSlop otherwise); legacy cells at 44. **F-09:** once-only refs on custom-exercise Save and picker selection. |
| **Files** | `src/state.ts`, `src/components/ui.tsx` (SegmentedControl, Chips, Field, BackButton), `src/components/SetGrid.tsx`, `app/explore.tsx`, `app/exercise.tsx`, `src/components/ExercisePicker.tsx`, `src/screens/LegacyPath.tsx` |
| **Tests** | Authored sentence shown for a 0-rep set and generic for type errors; segmented options allow wrapping (`numberOfLines` 2) and min heights ≥ 44; Field error announced (mock `AccessibilityInfo`); same-frame double tap on custom Save and picker rows writes once; the logger, templates and goals suites unchanged |
| **Device** | Tree scan again (target 0 under 44 except documented exceptions); 130/160/200 % on SE and narrow 360 for every segmented screen; the 0-rep set message |
| **Protected risk** | None. `state.ts` is shared, so the full suite runs. No schema change: rules are only read, not altered. |
| **Founder acceptance** | At Larger Text, every segmented choice is readable. Tapping ✓ on an empty set says what to enter. VoiceOver hears field errors. |

### Batch B: Large text, contrast and value readability

| | |
| --- | --- |
| **Defects** | F-05, F-06 (segment state), F-07, F-17 |
| **Changes** | Meaningful captions move from tertiary to secondary (D4). Selected segment gets a stronger indicator (weight and/or a hairline outline at ≥ 3:1) (D5). Truncated values wrap to two lines: Progress tile details, the workout header summary, the chart description. Overlines and column captions never break mid-word: either wrap at word boundaries or cap tiny column captions (e.g. 1.3×) where a grid needs fixed columns. |
| **Files** | `charts.tsx`, `Progress.tsx`, `GoalCard.tsx`, `GoalSheet.tsx`, `You.tsx`, `Recovery.tsx`, `programs.tsx`, `MacroSummary.tsx`, `Workout.tsx` (header), `SetGrid.tsx` (captions), `ui.tsx` (SegmentedControl selected style); `tests/design-tokens.test.ts` gains a usage rule |
| **Tests** | Token and usage tests; wrap props on the changed texts; existing UI suites |
| **Device** | 100/130/160/200 % on SE, narrow and large; light and dark |
| **Protected risk** | None (presentation). Palette unchanged if D4 uses `text2`. |
| **Founder acceptance** | At AX3 on the iPhone, Progress, Nutrition and the logger header show full values; captions are clearly readable in both themes. |

### Batch C: Reliability, screen-reader timing and coverage

| | |
| --- | --- |
| **Defects** | F-08, F-10 (if D8), F-11 (measure first), F-12 (verify), F-13 |
| **Changes** | The rest timer reads "Rest timer, 1:29 remaining" on focus without per-second chatter, and announces "Rest over" once (D7). Undo-held deletes commit when the app goes to the background (D8). Goals and Check-ins deletes use `confirm` with a named action. **Logger performance:** profile on the iPhone in production mode; optimise only a confirmed cause (D10). |
| **Files** | `Workout.tsx` (RestTimer), `Goals.tsx`, `Checkins.tsx`; others only per D10 evidence |
| **Tests** | AppState background commits the pending delete; Undo before background still restores; rest announcement once; double-press on the set check; Explore and Progress render with a 265-workout seed |
| **Device** | Background and kill during Undo; rest across lock; production-mode profile of the logger |
| **Protected risk** | **D8 changes when a WP4C/WP4D Undo-held delete is written** (on background, not only on expiry or leaving). Calculations and storage are unchanged. Founder decision. |
| **Founder acceptance** | VoiceOver during rest isn't chatty and announces when rest ends. A deleted goal stays deleted after switching apps. The logger scrolls smoothly on the iPhone. |

## 20. Protected-system implications

**No proposal changes:**
- programming, progression, Forge Paths generation or scheduling, or the 18 curated programs;
- nutrition calculations or food data;
- measurement, recovery or goal calculations;
- schemas, backup or sync;
- authentication, onboarding behaviour (ProfileForm's shared chips grow taller only), splash, or main tabs and routing.

**Items that touch sensitive shared code:**
- `state.ts` `mutate` messages (F-01), which only reads validation messages;
- WP4C/WP4D Undo timing (D8);
- Design System 2.0 controls (Batch A/B), which affect every screen visually (control heights grow by 6–10 pt).

No new dependencies are needed.

## 21. Founder iPhone acceptance checklist

1. **VoiceOver, logger:** start a workout; swipe through an exercise card. Each cell reads "Set 2 weight …", ✓ reads "Complete set 2". Complete a set: is the rest timer chatty? Does anything announce when it ends? Note the current behaviour before WP6 changes.
2. **VoiceOver, sheets:** open Log measurement. Does focus land on the title? Close with two-finger Z. Does focus return to "Log measurement"?
3. **VoiceOver, errors:** in Edit profile, enter a weight of 0 and save. Is the error spoken?
4. **Larger Text**, at the largest standard size, then AX3: Progress range control, Nutrition meal control, You → Appearance, the program session switch, the logger header and Progress tiles. Note anything cut off.
5. **Gym interruptions:** complete a set; lock the phone for 2 minutes; unlock. Rest is correct and the set is kept. Swipe FORGE away mid-workout, reopen: the workout and sets are intact. Turn on Airplane Mode and log a set.
6. **Rest notification:** with notifications allowed, lock during rest. Does the notification arrive on time?
7. **Bold Text, Button Shapes, Increase Contrast, Reduce Motion:** skim Today, the logger and Progress for anything unreadable.
8. **0-rep set:** tap ✓ on an empty set and read the message (F-01).
9. **Delete a goal, then switch apps** within 6 seconds and force-quit FORGE. Does the goal come back? (F-10, current behaviour)

## 22. Founder decisions

**D1: The WP5 friendly-error regression (F-01).**
- **Proposed rule:** schema errors with an authored message (custom rules) show that sentence; built-in type or limit errors keep the generic sentence; developer diagnostics stay in the console.
- **Recommended:** fix it as the **first item of WP6 Batch A**. Alternatively, approve it as a standalone WP5.1 hotfix before WP6.
- **Alternatives:** a per-field message map, which is broader.
- **Trade-offs:** none material. Messages are already plain English.
- **Data impact:** none.
- **Protected area:** no.

**D2: SegmentedControl at large text (F-02).**
- **Proposed rule:** labels wrap to two lines and the control grows; above about 1.6×, or when an option can't fit, it stacks vertically with the same semantics.
- **Recommended:** approve.
- **Alternatives:** shorter labels ("4W, 12W, 1Y, All"), which changes copy and helps only some screens; cap the font scale (rejected: it shrinks text for those who need it).
- **Trade-offs:** taller controls at large sizes.
- **Data impact:** none.
- **Protected area:** no.

**D3: Minimum touch target (F-04).**
- **Proposed rule:** every control is at least 44 pt tall and wide (DS2.0's own rule), with hitSlop toward 48 dp on Android where layout is tight.
- **Recommended:** approve.
- **Alternatives:** 48 dp everywhere (more layout churn).
- **Trade-offs:** segmented controls and chips grow 4–6 pt.
- **Data impact:** none.
- **Protected area:** no (onboarding's kg/lb chips change size only, not behaviour).

**D4: Tertiary text (F-05).**
- **Proposed rule:** meaningful captions use secondary text; tertiary is reserved for disabled, decorative or redundant text; add a usage test.
- **Recommended:** approve. The palette is unchanged.
- **Alternatives:** lighten `text3` in dark mode to `#8B9199` (5.1:1). This collapses the secondary/tertiary hierarchy (1.34:1 apart) and is a palette change.
- **Trade-offs:** some captions get slightly brighter.
- **Data impact:** none.
- **Protected area:** no.

**D5: Selected segment indicator (F-06).**
- **Proposed rule:** the selected option is semibold, with a hairline outline at ≥ 3:1 against the track.
- **Recommended:** approve. A small visual refinement, not a redesign.
- **Alternatives:** defer to WP7.
- **Data impact:** none.
- **Protected area:** no.

**D6: Announcing field errors (F-03).**
- **Proposed rule:** a newly shown field error is announced once (Android live region; iOS announcement); errors in hints stay as context.
- **Recommended:** approve.
- **Alternatives:** announce only on Save.
- **Data impact:** none.
- **Protected area:** no.

**D7: Rest timer for screen readers (F-08).**
- **Proposed rule:** a stable label ("Rest timer") with its remaining time as the value; one announcement, "Rest over", at the end.
- **Recommended:** approve, after the founder notes the current VoiceOver behaviour (checklist item 1).
- **Alternatives:** leave as is.
- **Data impact:** none.
- **Protected area:** no. Workout lifecycle and timing are unchanged.

**D8: Undo-held deletes on backgrounding (F-10).**
- **Proposed rule:** when FORGE goes to the background, any Undo-held delete or achievement in Goals and Check-ins is written at once (as it already is when leaving the screen).
- **Recommended:** approve.
- **Alternatives:** keep the current rule; data stays safe, but a confirmed delete can come back.
- **Trade-offs:** Undo is unavailable after switching apps.
- **Data impact:** writes happen earlier; no shape change.
- **Protected area:** **touches the approved WP4C/WP4D Undo timing** (not calculations).

**D9: Once-only guards (F-09).**
- **Proposed rule:** custom-exercise Save and picker selection act once per opening.
- **Recommended:** approve.
- **Data impact:** prevents duplicates.
- **Protected area:** no. The picker's Add semantics are unchanged.

**D10: Performance work (F-11).**
- **Proposed rule:** no optimisation until the logger, Explore and Progress are profiled on the iPhone in production mode (`expo start --no-dev --minify`) with the 265-workout seed. Optimise only a confirmed cause, within Batch C.
- **Recommended:** approve.
- **Alternatives:** optimise speculatively (rejected by the brief).
- **Data impact:** none.
- **Protected area:** no.

**D11: Orientation.**
- **Proposed rule:** keep portrait-only (current `app.json`).
- **Recommended:** keep.
- **Alternatives:** support landscape (a large layout effort).
- **Data impact:** none.
- **Protected area:** routing and navigation are unaffected.

**D12: Screen-reader verification method.**
- **Proposed rule:** iOS VoiceOver is verified by the founder with the checklist above. Android TalkBack is verified by tree scans plus a manual TalkBack pass if a physical Android device is available.
- **Recommended:** approve; this audit couldn't automate speech capture.
- **Data impact:** none.
- **Protected area:** no.

**D13: Large-text support ceiling.**
- **Proposed rule:** support up to AX3 (about 200 % body) without loss of function; headings and hero numbers keep their DS2.0 caps; no text is shrunk below its role size.
- **Recommended:** approve.
- **Alternatives:** support through AX5 (a much larger layout effort).
- **Data impact:** none.
- **Protected area:** no.

**D14: Scope boundary.** Protected areas stay untouched: programs and Paths, calculations, the food data, schemas, backup and sync, auth, the onboarding flow, splash, tabs and routing. No new dependencies. Purely aesthetic items (the Android sheet strip, generic "Close", Alert styling) are deferred to WP7.
- **Recommended:** confirm.

---

*End of the WP6 audit (sections 1–22, unchanged below this line).*

---

# Batch A — Implementation Results

**Status:** implemented and verified; **not committed**; ready for the founder's iPhone review. Batches B and C and WP7 have not begun.

## A1. Initial branch and commit

`feat/forge-paths-foundation` at `ac0f6cf` (WP5), equal to the remote. The working tree held only this audit (untracked), which is preserved.

## A2. Defects addressed

| ID | Defect | Status |
| --- | --- | --- |
| **F-01** (P1, WP5 regression) | Authored validation sentences replaced by generic text (0-rep set) | **Fixed** |
| **F-02** (P1) | Segmented controls truncate at larger text | **Fixed** |
| F-03 (P2) | Field errors not exposed to screen readers | **Fixed** (shared Field, set cells, standalone errors) |
| F-04a–d (P2) | Segmented 38 pt, chips 40 pt, Explore Back 34 pt wide, legacy day cells 43 pt | **Fixed** |
| F-09 (P2) | No double-submit guard: custom-exercise Save, picker rows | **Fixed** |

Not in Batch A: F-04e ("Use previous", which has a hitSlop; changing it affects the logger grid's density) moves to Batch B. F-05, F-06, F-07 and F-17 are Batch B. F-08, F-10, F-11, F-12 and F-13 are Batch C. The six-second Undo contract is unchanged.

## A3. Files changed

| File | Change |
| --- | --- |
| [state.ts](../../src/state.ts) | `saveErrorMessage` shows a schema's **authored** rule messages (zod `custom` issues); built-in type and limit messages stay generic; the console diagnostics in `mutate` are unchanged |
| [ui.tsx](../../src/components/ui.tsx) | `SegmentedControl`: responsive layout (`segmentLayout`), options ≥ 44 pt. `Chips`: 44 pt. `Field`: error in the hint ("Error: …") and in `FieldError`. New `FieldError`, `useAnnouncedError` and `announceTogether` |
| [SetGrid.tsx](../../src/components/SetGrid.tsx) | Set-cell errors: "Error: …" hint and the same one-time announcement |
| [ProfileForm.tsx](../../src/components/ProfileForm.tsx), [FoodForm.tsx](../../src/components/nutrition/FoodForm.tsx) | Standalone error texts use `FieldError` (no behaviour change) |
| [exercise.tsx](../../app/exercise.tsx) | Once-only Save guard; Main muscle and Equipment rows expose their error and use `FieldError` |
| [ExercisePicker.tsx](../../src/components/ExercisePicker.tsx) | One pick per opening |
| [explore.tsx](../../app/explore.tsx) | The list header's box starts at the screen edge, so Back isn't clipped |
| [LegacyPath.tsx](../../src/screens/LegacyPath.tsx) | Week row uses half the card inset and gap 1, so each day is ≥ 44 pt |
| [wp6.test.tsx](../../tests/ui/wp6.test.tsx) (new) | 12 tests (section A9) |
| [workout-logger.test.tsx](../../tests/ui/workout-logger.test.tsx) | The set-cell hint is now "Error: Enter a number from 0 to 20" (same guarantee, with the error prefix) |

No dependency, schema, repository, validation-rule, programming, calculation, sync, auth or routing change.

## A4. The WP5 validation regression

- **Root cause:** WP5 S-03 mapped *every* zod error to "Some values couldn't be saved. Check the form and try again." This was right for technical messages ("Invalid input: expected number…"). But it also hid the sentences written into the schema's own rules: "Enter repetitions, duration or distance before completing a set", "Minimum reps must not exceed maximum reps" and "Rep ranges require positive, ordered bounds".
- **Fix (centralised, one function):** `saveErrorMessage` now returns the de-duplicated messages of zod `custom` issues, with a full stop added. It falls back to the generic sentence when there are none, or when a rule has zod's default "Invalid input". Plain `Error` messages are unchanged.
- **Unchanged:**
  - `setSchema` and every other rule;
  - `mutate`'s `console.warn("[FORGE] Save rejected by validation", e)`;
  - the set is **not** completed, nothing is written or queued, no rest starts and nothing is filled in.
- **Device:** `p24/se-zero-rep.png` shows "Could not save — Enter repetitions, duration or distance before completing a set."

## A5. Segmented-control responsive rules

`segmentLayout(labels, width, fontScale)` estimates each label's width at the current text size. It uses approximate system-font advance widths plus a 10 % margin; the width is measured with `onLayout`, or the window width minus the screen margins before layout. The control then picks:

| Layout | When | Look |
| --- | --- | --- |
| **row** | Every label fits on one line | Unchanged from before |
| **wrap** | Every label fits in two lines **without breaking a word** | Same row; labels on up to two lines |
| **grid** | 4 or 6 options, each fitting half the width on one line | Two columns |
| **stack** | Otherwise | One option per line, label left; the chosen one also shows a ✓ |

- **Constant across layouts:**
  - `tablist` / `tab` roles, `selected` state, values and `onChange`;
  - the chosen option's fill;
  - options at least 44 pt tall;
  - text is never shrunk.
- **Observed at SE 375 pt (dark and light):**

  | Control | 100 % | 130 % | 160 % | 200 % |
  | --- | --- | --- | --- | --- |
  | Progress range | row | wrap | grid | grid |
  | Nutrition meals | row | stack* | grid | grid |
  | You → Appearance (3 options) | row | row | row | stack |
  | Program session | row | row | wrap | wrap |

  *The 130 % meal stack came from a capture before the grid was added; the rule now gives the grid wherever four meals fit two columns.
- The Add food sheet keeps its recent foods visible: at 200 %, one row stays visible above Create food. It is cramped, which remains F-17 (Batch B).

## A6. Touch targets

The re-scan uses Android's accessibility tree at standard size (`p24/scan-*.csv`). On Progress, Explore, Measurements, Forge Paths, the legacy Path and onboarding, **no control is under 44 dp**. On You and Recovery, the only flags are rows clipped at the viewport edge. Specifically:

- **Segmented options:** 44 dp (were 38).
- **Chips:** 44 dp, with +4 vertical hitSlop (were 40).
- **Explore Back:** 44 × 44 (was 34 × 44).
- **Legacy day cells:** ≥ 44 wide (were 43). This holds on a 375 pt phone, since the row now uses half of the card's 16 pt inset.

Adjacent options remain separate targets: hit areas grow only vertically, and the tests confirm each option is independently selectable. The visual style is unchanged; controls are 4–6 pt taller.

## A7. Form-error accessibility

| Need | Behaviour |
| --- | --- |
| Accessible name | Unchanged: the field's label |
| Invalid state | RN 0.88 has no "invalid" property, so the input's **hint** is "Error: …" while invalid and empty when valid |
| Association | The hint belongs to the input; the visible message sits under it |
| New error discoverable | Android: the message is in an always-mounted **polite live region**, so TalkBack reads it when it appears or changes. iOS: `announceForAccessibility` once per new message |
| Not repetitive | A message is announced only when it changes; the same invalid text while typing isn't repeated. Messages from one failed Save are batched into **one** announcement (for example, all four custom-exercise fields) |
| Cleared | The message and hint disappear when the value is fixed; a later new error is announced again |
| Focus | Never moved |

Applies to `Field` (ProfileForm, onboarding, custom exercise, food forms, measurement values, templates and others), set-grid cells, and the standalone stepper, quantity and select-row errors. WP4 sheets that already announce sheet-level errors (Goals, Check-ins) are unchanged, so there are no double announcements.

**Verification boundary:**
- *Verified:* component tests (hint, live region, one announcement, batching, clearing); on-device visible errors and clearing.
- *Not verified:* actual TalkBack speech of the live region (adb automation is unreliable; see section 3) and actual VoiceOver speech. The iOS behaviour is inferred from code.

## A8. Repeated-action safeguards

- **Custom-exercise Save:** a synchronous `useRef` guard is set only after validation passes. If a save is refused by validation, nothing is locked. If storage fails, the guard is released so the lifter can retry. On success the screen leaves the form.
- **ExercisePicker:** a `useRef` allows one pick per opening and resets each time the sheet opens. The "Add"/"Choose" semantics, the callbacks and the closing behaviour are unchanged. Normal logging has no delays.
- **Proof:** with both guards removed, the three duplicate tests fail (3 / 12); restored, they pass.

## A9. Automated results

| Check | Result |
| --- | --- |
| Typecheck | Pass |
| Lint | Pass (the existing warning: unused `Repo` in `templates-wp3.test.tsx`) |
| Format | Pass |
| Logic tests (including the curated program library lock) | **334 / 334** |
| UI tests | **28 suites, 281 / 281** (269 + 12 new) |
| Food library | Reproducible: 3,730 foods, same catalogue hash |
| iOS and Android export | Pass |

**New tests in `wp6.test.tsx`:**
1. A 0-rep set: exact message; not completed, not stored, not queued, no rest; developer warning kept; entering reps and retrying works.
2. Authored vs technical messages (set, profile rep range, template range; type error, rule without a message, plain errors).
3. `segmentLayout` rules (short and long labels, unbreakable words, two columns, odd counts).
4. Segmented roles, selection, switching and ≥ 44 pt at 100, 130, 200 and 300 %.
5. Chips and Back ≥ 44 pt.
6. Field error: hint, live region, a single announcement, no repeat, clearing, re-announce.
7. An invalid typed number is announced once while it stays invalid.
8. A failed custom-exercise Save: one batched announcement naming all four fields.
9. Rapid custom Save: one exercise.
10. Storage failure then retry.
11. Picker double tap: one pick; the next opening picks again.
12. Logger picker double tap: one row with one set.

## A10. Emulator evidence (`forge-visual-harness/shots/android/p24/`)

- **Segmented controls:** `se-{dark,light}-f{10,13,16,20}-{progress,meals,appearance,program}.png` (grids `_dark-*.png`, `_light-*.png`, `_grid.png`). No clipped or broken labels; the selection is clear in both themes.
- **Validation:** `se-zero-rep.png`. **Custom exercise:** `se-custom-errors.png`, `se-custom-name-fixed.png`. **Picker:** `standard-picker-open.png`, `standard-picker-chosen.png`.
- **Targets:** `scan-*.csv`.
- **TalkBack:** not re-attempted (section 3 limitation).

## A11. Protected-area verification

Unchanged:
- programming, progression and `loadKind`;
- workout completion rules (`setSchema` untouched; a set without a measure still can't be completed);
- Forge Paths scheduling (`reschedulePathSession` untouched; legacy layout only);
- the 18 curated programs (lock test passes);
- nutrition, measurement, recovery and goal calculations and achievement snapshots;
- the Undo timing;
- authentication, backup, sync and the schema;
- onboarding flow (ProfileForm error display only; profile and onboarding tests pass);
- tabs, splash and routes.

## A12. Deferred

- **Batch B:**
  - F-04e "Use previous" height;
  - F-05 tertiary captions;
  - F-06 selected-segment contrast (the stacked layout adds a ✓; the row/grid fill is unchanged);
  - F-07 truncated values ("16 of 18 se…", "VOLUME (…", workout header, "PROTE/IN", "SE/T");
  - F-17 cramped Add food at 200 %.
- **Batch C:** F-08 rest timer speech; F-10 Undo on background (founder decision D8); F-11 performance (D10); F-12 sheet focus verification; F-13 raw delete alerts.

## A13. Founder iPhone acceptance checklist (Batch A)

1. **0-rep set:** in a workout, tap ✓ on a set with no reps. The alert says to enter repetitions, duration or distance; the set stays open. Enter reps and tap ✓: it completes and rest starts.
2. **Larger Text** (Settings → Accessibility → Display & Text Size → Larger Text), at the largest standard size, then the 3rd accessibility size:
   - Progress range: two-line labels, then two columns;
   - Nutrition → Add food meal choice: a row, then two columns; recent foods still visible;
   - You → Appearance: a row, then a stacked list with ✓;
   - the program's Standard / Lower fatigue switch: two-line labels.
   Nothing is cut off; switching works.
3. **Targets:** tap the segmented options, chips and the library's ‹ Back near their edges. Each responds and neighbours aren't triggered.
4. **VoiceOver errors:** Train → Exercise library → Create custom exercise → Save with nothing filled in. VoiceOver should say the four problems once. Fill in the name: its error disappears. In Edit profile, type an invalid weight: the message is spoken once, not on every keystroke.
5. **Double taps:** tap Save twice quickly on a valid custom exercise; the library shows one. In a workout, Add exercise, then double-tap a movement; one row is added.
6. **Regression skim:** log a normal workout (sets, rest, Finish), change units, edit a template, log a food, a measurement and a check-in.

## A14. Working tree

Modified (uncommitted):
- `app/exercise.tsx`, `app/explore.tsx`;
- `src/components/ExercisePicker.tsx`, `ProfileForm.tsx`, `SetGrid.tsx`, `nutrition/FoodForm.tsx`, `ui.tsx`;
- `src/screens/LegacyPath.tsx`, `src/state.ts`;
- `tests/ui/workout-logger.test.tsx`.

New: this audit and `tests/ui/wp6.test.tsx`. Nothing is committed or pushed. The emulator and Metro are stopped, and the emulator's text size is reset to 100 %.

*End of WP6 Batch A (committed as `9dd09b3`).*

---

# Batch B — Implementation Results

**Status:** implemented and verified; **not committed**; ready for the founder's iPhone review. Batch C and WP7 have not begun.

## B1. Baseline

`feat/forge-paths-foundation` at **`9dd09b3`** (WP6 audit + Batch A), equal to `origin`, with a clean working tree. Batch A was already committed and pushed before this brief, so there was no duplicate commit.

## B2. Status

| ID | Finding | Status |
| --- | --- | --- |
| F-04e | "Use previous" under 44 pt | **Fixed** in the wide and stacked grids. **Compact grid: accepted provisional limitation** (founder decision, B8) |
| F-05 | Tertiary captions below 4.5:1 | **Fixed** |
| F-06 | Selected segment relies on a subtle fill | **Fixed** |
| F-07 | Truncated values and mid-word breaks | **Fixed** (confirmed instances) |
| F-17 | Add food cramped at 200 % | **Fixed** |

## B3. Files changed

| File | Change |
| --- | --- |
| [ui.tsx](../../src/components/ui.tsx) | `textWidth` helper. Selected segment: 1 pt outline (`text3`) and weight 700 |
| [charts.tsx](../../src/components/charts.tsx) | Low/High and axis captions in secondary text; selected-point description wraps to two lines |
| [Progress.tsx](../../src/screens/Progress.tsx) | Overview tiles full width (they already sat one per line at half width); label and detail wrap; detail and record dates in secondary text |
| [Workout.tsx](../../src/screens/Workout.tsx) | Header title and summary wrap to two lines |
| [MacroSummary.tsx](../../src/components/nutrition/MacroSummary.tsx) | Three columns while each label fits, otherwise one macro per row (no shrinking in rows) |
| [QuickAddSheet.tsx](../../src/components/nutrition/QuickAddSheet.tsx) | From 130 % text, the day, meal and search are the list's header, so they scroll with the foods |
| [SetGrid.tsx](../../src/components/SetGrid.tsx) | Column captions never break mid-word; "Use previous" uses a 44 pt pressable in 44 pt rows |
| [TrainingCalendar.tsx](../../src/screens/TrainingCalendar.tsx), [programs.tsx](../../src/components/programs.tsx), [LegacyPath.tsx](../../src/screens/LegacyPath.tsx), [You.tsx](../../src/screens/You.tsx), [Recovery.tsx](../../src/components/Recovery.tsx), [GoalCard.tsx](../../src/components/goals/GoalCard.tsx), [GoalSheet.tsx](../../src/components/goals/GoalSheet.tsx), [ScaleRow.tsx](../../src/components/checkins/ScaleRow.tsx), [CheckinSheet.tsx](../../src/components/checkins/CheckinSheet.tsx) | Meaningful captions from tertiary to secondary text |
| [wp6-contrast.test.ts](../../tests/wp6-contrast.test.ts) (new) | 5 logic tests |
| [wp6.test.tsx](../../tests/ui/wp6.test.tsx) | 7 UI tests added |

## B4. Contrast (F-05, F-06)

| Pair | Dark | Light | Need |
| --- | --- | --- | --- |
| Captions, secondary text on bg / surface / raised / completed set / selected | 8.33 / 7.67 / 6.83 / 6.11 / 5.05 | 6.51 / 7.23 / 6.10 / 6.09 / 7.23 | 4.5 ✓ |
| Selected-segment outline (`text3`) vs the track | 3.43 | 4.00 | 3.0 ✓ |
| Selected label (`text`) on its fill | 10.69 | 18.47 | 4.5 ✓ |
| Unselected label (`text2`) on the track | 6.83 | 6.10 | 4.5 ✓ |

**Hierarchy:** captions stay smaller (13 pt caption role), weight 500, in the secondary colour, below primary body text (14.5–18.5:1). Not every caption is equally prominent.

**Tertiary is kept** only for:
- disabled controls (date arrows, unavailable days, "next day", disabled rows and menu items);
- non-text marks (the "–" no-data mark, rest-day icon);
- the large metric placeholder (3:1 suffices for large text);
- the design-system sample.

A logic test pins this list, so a new use needs review. The palette is unchanged.

## B5. Segmented controls (F-06)

The chosen option has its fill, plus a 1 pt outline (≥ 3:1 against the track) and a bolder label (700 vs 600). The stacked layout keeps its ✓. Unselected options carry a transparent 1 pt border, so nothing shifts. The rule applies in the row, wrap, grid and stack layouts (tested at 100 %, 130 %, 200 % and 300 %). The `selected` state, values and callbacks are unchanged. The width estimate's 10 % margin covers the slightly wider bold label.

## B6. Large-text layout (F-07)

| Instance | Before | After |
| --- | --- | --- |
| Progress tiles | "16 of 18 se…", "VOLUME (…" | Full text at 100–200 %. The tiles were already one per line, but at half width because two 50 % tiles plus the card's 12 pt gap never fit one row; they now use the full width |
| Workout header | "8 of 31 set…" / "5,360…" | Title and summary wrap to two lines at 130–200 % |
| Nutrition macros | "PROTE / IN" | Three columns at 100–130 % on SE; one macro per row from 160 % (values no longer shrink in rows) |
| Set grid "SET" caption | "SE / T" | One line, overflowing its narrow column centred (decorative header, hidden from screen readers) |
| Chart description | "2 entr…" | Up to two lines, right-aligned |

Units stay with their numbers ("160 g", "of 180 g", "5,360 kg"). Spoken labels are unchanged. No calculation changed.

## B7. Add food at large text (F-17)

From 130 % text, "Adding to …", the meal choice and Search are the **list's header**, so the whole sheet scrolls and foods get the sheet's full height (up to 90 %). At normal sizes the layout is unchanged, including the WP4A.1 small-phone keyboard behaviour.

Unchanged:
- **Create food** stays pinned (it moves to the list's end while typing, as before);
- **Close** stays in the sheet header;
- search, the library, Recent, Saved, + / Undo, portions, the meal and the 3,730-food catalogue.

Verified on SE at 100–200 % (dark and light), with the keyboard open at 200 %: the query and the first result stay visible.

## B8. "Use previous" (F-04e)

- **Wide grid** (its own Prev column) and **stacked grid** (beside the set number): the pressable is now 44 pt tall and fills its 44 pt row. The 32 or 24 pt bordered chip is drawn inside it, so it looks the same, and the hitSlop is removed, so it can't overlap a neighbour.
- **Compact grid** (a caption row under the cells): unchanged, a 24 pt chip with 10 pt hitSlop above and below (44 pt effective). That slop reaches about 8 pt into the input cells above and about 6 pt into the next set's row.
- **Trade-off, for founder approval (not forced):** a non-overlapping 44 pt target there needs a 44 pt caption row, about **+20 pt per set** in the compact grid. The compact grid is used on narrow phones and at larger text, for example SE at 200 %.
- **Options:**
  - accept +20 pt per set;
  - keep the current slop;
  - move "Use previous" into the set's ⋯ details menu in compact mode (changes the logging flow).
- **Recommended:** keep the current slop until the founder confirms on the iPhone whether taps near the input cells misfire.
- Data and behaviour are unchanged. Using previous and then ✓ in quick succession logs 60 × 8 and completes the set (tested).
- **Founder decision (2026-10-24):** keep the compact-grid layout and its current effective target (24 pt chip plus 10 pt hitSlop above and below). The row is **not** expanded by 20 pt, and the action does **not** move into a menu.
- The overlapping hit area (about 8 pt into the input cells above, about 6 pt into the next set's row) is an **accepted, provisional limitation**, pending the founder's iPhone testing (B13 step 5).
- The wide and stacked improvements stay. No further F-04e code changes are authorized.

## B9. New automated tests

**Logic, `wp6-contrast.test.ts` (5):**
- dark and light secondary-text contrast on every surface;
- dark and light selected-segment outline and labels;
- the tertiary-usage allowlist.

**UI, `wp6.test.tsx` (+7, 19 in total):**
- the chosen segment is outlined and bold in all four layouts, follows taps and keeps its spoken state;
- macros: columns at 100/130 %, rows at 160/200 %, with the same spoken labels and no shrinking in rows;
- the workout header wraps a long title and summary;
- "Use previous" target: 44 pt without slop when wide or stacked; 24 + 10 + 10 when compact;
- "SET" stays on one line at 200 %;
- Use previous then ✓ in one frame logs the previous result;
- Add food at 100 % and 200 %: the controls scroll with the list only at 200 %; the meal choice, search, a library result added to the chosen meal, Create food and Close all work.

## B10. Emulator observations (`forge-visual-harness/shots/android/p25/`)

SE 375 pt, dark and light, 100/130/160/200 %:
- **Progress** (`_progress.png`): the outlined choice is clear in both themes; tile details are complete.
- **Nutrition** (`_nutrition.png`): macros in columns, then rows; "PROTEIN" intact.
- **Add food** (`_addfood.png`, `_addfood-kb.png`): recent foods visible at every size; the search and a result stay visible above the keyboard at 200 %.
- **Logger** (`_logger.png`): the header summary wraps; "SET KG REPS" stays whole at 200 %; "Previous 45×8" captions are intact.
- Not re-captured: Batch A's segmented-control survey, and the standard and large phones (the layouts are proportional; SE is the constraining case).

## B11. Protected-area review

Presentation only. Unchanged:
- programming and progression; set data; workout lifecycle and completion rules;
- Forge Paths; the 18 curated programs (lock test passes);
- nutrition calculations, food records and the catalogue (reproducible, same hash);
- measurement, recovery and goal calculations; achievement snapshots;
- the six-second Undo;
- backup, sync, auth and schemas;
- onboarding (ProfileForm untouched in Batch B);
- splash and navigation.

No dependencies were added.

## B12. Deferred to Batch C (unchanged)

- F-08: rest-timer speech;
- F-10: Undo held across process death (D8);
- F-11: performance (profile on the iPhone first, D10);
- F-12: sheet focus entry and restoration;
- F-13: Goals and Check-ins delete alerts.

F-04e's compact grid is an accepted provisional limitation (B8), to revisit only if iPhone testing shows misfired taps.

## B13. Founder iPhone acceptance (Batch B)

1. **Contrast:** in dark and light, read Progress (record dates, Low/High), Goals (progress lines), You ("Training since…") and a program's exercise notes. Captions should be easy to read and still quieter than headings.
2. **Selected segment:** on Progress, Measurements and You → Appearance, the chosen option is outlined and bold. It's obvious which is chosen even in bright light.
3. **Larger Text** at the largest standard size and AX3:
   - Progress tiles show "16 of 18 sessions" in full;
   - a workout's header shows the sets and volume in full;
   - Nutrition shows PROTEIN, CARBS and FAT whole;
   - the set grid's "SET" is whole.
4. **Add food at AX3:** choose a meal, search "egg", add one, Undo, scroll to Recent, open Create food, close the sheet.
5. **Use previous:**
   - on a standard iPhone, tap "45×8" in the Prev column, then ✓;
   - at a larger text size (compact grid), tap "Previous …" under a set: does it ever catch taps meant for the KG or REPS cells above? Your answer decides B8.
6. **Regression skim:** log a set normally, change a meal, switch Progress ranges.

## B14. Working tree

Modified (uncommitted):
- `src/components/ui.tsx`, `SetGrid.tsx`, `charts.tsx`, `programs.tsx`, `Recovery.tsx`;
- `src/components/nutrition/MacroSummary.tsx`, `QuickAddSheet.tsx`;
- `src/components/checkins/CheckinSheet.tsx`, `ScaleRow.tsx`;
- `src/components/goals/GoalCard.tsx`, `GoalSheet.tsx`;
- `src/screens/Progress.tsx`, `Workout.tsx`, `TrainingCalendar.tsx`, `LegacyPath.tsx`, `You.tsx`;
- `tests/ui/wp6.test.tsx`, this audit.

New: `tests/wp6-contrast.test.ts`. Nothing is committed or pushed. The emulator and Metro are stopped, and the emulator's text size is reset to 100 %.

*End of WP6 Batch B. Not committed. Batch C and WP7 have not begun.*
