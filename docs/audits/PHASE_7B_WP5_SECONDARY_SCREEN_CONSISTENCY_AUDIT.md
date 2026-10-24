# FORGE — Phase 7B WP5: Secondary Screen Consistency Audit

**Status: audit only. Nothing implemented. Awaiting founder decisions (section 15). Not committed.**

Audit date: 2026-10-24 (Pacific).

Evidence labels:
- **[Code]** read at the baseline.
- **[Device]** reproduced on the Android emulator (Expo Go 58).
- **[Calc]** run against the app's own validation code in Node.
- **Proposed** describes a design, not existing behaviour.

---

## 1. Verified baseline

### Stage 1: WP4D finalization

| Check | Result |
| --- | --- |
| Branch | `feat/forge-paths-foundation` |
| HEAD | `578faef83cdbeb81dd5db68113b36202fb1dfabd`: "WP4D: Goals rebuild with exact measurements, achievements and history" |
| Remote | `origin/feat/forge-paths-foundation` at the same commit after `git fetch`. **WP4D was already pushed**, so no duplicate commit was made. |
| Working tree | Clean before the audit |
| Founder iPhone review | WP4D approved ("works great"), 2026-10-24 |

Final verification was re-run at `578faef` on 2026-10-24:
- typecheck passes; lint shows 0 errors and 1 warning (the existing WP3 test warning); format passes;
- 334 logic tests pass, including the 18 curated program locks; 251 UI tests pass across 26 suites;
- `food-library:check` is reproducible (3,730 foods);
- the iOS and Android export passes.

### Documents read

[Phase 7A product audit](PHASE_7A_PRODUCT_AUDIT.md) (C-05, C-09, C-15, C-19 and the WP5 notes), and the WP4A, WP4A.1, WP4B, WP4C and WP4D audits and results.

### Design System 2.0 conventions (as practised by WP2–WP4D)

- **Screens:** `Screen` with a plain title, an optional factual eyebrow, and `onBack` (a ‹ chevron, never a full-width **Back** button).
- **Primary action:** pinned with `footer`.
- **Text:** `Txt` roles (display, title, headline, body, caption, overline).
- **Containers:** `Card`, and `ListSection`/`ListRow` for records and settings.
- **Actions:** `OverflowMenu` for row actions. Sheets use `Sheet` with `unsaved` and a pinned `footer`.
- **Inputs:** `SegmentedControl` and `Choices` for choices; `Stepper`/`NumberControl` for small numbers; `DateSheet` for days; `Field` with inline `error` text.
- **Feedback:** an Undo banner after saves and deletes; `InfoButton`/`InfoSheet` for explanations; `Empty` for empty states.
- **Validation:** friendly, never raw schema text.

### Navigation (unchanged by WP5)

- **Tabs:** Today · Train · Progress · You.
- **Pushed routes:** `/workout`, `/templates`, `/history`, `/records`, `/calendar`, `/explore`, `/exercise`, `/journal?kind=…` (Nutrition, Saved foods, Measurements, Recovery, Goals), `/forge-paths`, `/forge-paths/[programId]`, `/forge-paths/current`, `/paths` (legacy Path), `/account`, `/onboarding`, `/design-system` (development only).

### Accessibility and UI test coverage of secondary screens

| Screen or component | UI tests |
| --- | --- |
| Account | [data-safety.test.tsx](../../tests/ui/data-safety.test.tsx) |
| Templates | `templates*.test.tsx`, `decimal-input`, `unsaved-input`, `legacy-workouts`, `workout-wp2` |
| Explore | `redesign.test.tsx` |
| Exercise detail, Records, Calendar | `progress.test.tsx` |
| History | `today-train`, `workout-wp2` |
| Program library, details, dashboard | `forge-paths`, `program-details`, `workout-wp2` |
| Legacy Path | `legacy-path`, `legacy-workouts` |
| ProfileForm | `profile`, `unsaved-input` |
| You | `you.test.tsx` |

The custom-exercise form, ExercisePicker, Backup sheet copy and the unknown-route screen have **no** dedicated tests.

---

## 2. Secondary screen inventory

There are **24 secondary surfaces**. Of these, **19 were inspected on the emulator** and 5 from code: ExercisePicker, the legacy reschedule sheet, the error screen, onboarding and the development page. Areas rebuilt in WP2–WP4D (workout logger, finish sheet, Today, Train, Progress, Nutrition, food library, Measurements, Recovery, Goals) are out of scope except where they share a component.

| # | Surface | Route / owner | Entry point | Pattern today | Tests |
| --- | --- | --- | --- | --- | --- |
| 1 | Exercise library | `/explore`, [explore.tsx](../../app/explore.tsx) | Train → Exercise library / Search | 2.0 header; legacy `Label` empty state | redesign |
| 2 | Exercise detail | `/exercise?id=`, [exercise.tsx](../../app/exercise.tsx) | Library, Progress, workout | **Legacy**: eyebrow "EXPLORE / EXERCISE", full-width Back, `Label` text | progress |
| 3 | Custom exercise (create/edit) | `/exercise?custom=new`, same file | Library → Create custom exercise; detail → Edit | **Legacy**: slogan "Your movement.", free-text fields | none |
| 4 | Account & cloud sync | `/account`, [account.tsx](../../app/account.tsx) | You → Account & cloud sync | **Legacy**: slogan "Your data. Your choice.", eyebrow "PROFILE / ACCOUNT", full-width Back | data-safety |
| 5 | You (tab content) | [You.tsx](../../src/screens/You.tsx) | Tab | 2.0 | you |
| 6 | Edit profile sheet | [ProfileForm.tsx](../../src/components/ProfileForm.tsx) in You | You → Edit profile | Mixed: `Field`s with legacy `Label` headings | profile, unsaved-input |
| 7 | Training focus sheet | ProfileForm | You → Training focus | 2.0 `Choices` | profile |
| 8 | Training preferences sheet | ProfileForm | You → Training preferences | **Typed numbers and text** | profile |
| 9 | Nutrition targets sheet | ProfileForm | You → Nutrition targets | Typed numbers (appropriate) | nutrition |
| 10 | Backup sheet | [Backup.tsx](../../src/components/Backup.tsx) | You → Export backup | 2.0 (WP1) | backup-file |
| 11 | Privacy & guidance | `InfoSheet` in You | You | 2.0 | — |
| 12 | Delete all local data / Replace from backup | `confirm()` in You | You | System alert with a generic "Confirm" button | you |
| 13 | History | `/history`, [History.tsx](../../src/screens/History.tsx) | Train, Today | 2.0; **no paging** | today-train, workout-wp2 |
| 14 | Records | `/records` | Progress | 2.0 | progress |
| 15 | Training calendar | `/calendar` | Progress | 2.0 | progress |
| 16 | Templates | `/templates` (WP3) | Train | 2.0; a scheduling success uses an alert | several |
| 17 | Forge Paths library / details / dashboard | `/forge-paths…`, [programs/](../../src/screens/programs/) | Train, Today, You | 2.0 | forge-paths, program-details |
| 18 | Legacy Path and its sheets (Manage, Workout options, Reschedule) | `/paths`, [LegacyPath.tsx](../../src/screens/LegacyPath.tsx) | Train/You for legacy users | Mixed; sheets use legacy `Label`; **typed `YYYY-MM-DD` reschedule** | legacy-path |
| 19 | No active workout | `/workout`, [Workout.tsx](../../src/screens/Workout.tsx) | Deep link, stale navigation | 2.0 card; no ‹ back | workout tests |
| 20 | Exercise picker sheet | [ExercisePicker.tsx](../../src/components/ExercisePicker.tsx) | Workout, template editor, exercise card swap, Progress, Goals | **Legacy** `Label` rows; every row reads "Add …" | indirect |
| 21 | Shared dialogs | `confirm()` in [state.ts](../../src/state.ts), `confirmDiscard` in [ui.tsx](../../src/components/ui.tsx), `Alert` | everywhere | System alerts; generic "Confirm" | indirect |
| 22 | Startup error / rescue | [Recovery.tsx](../../src/components/Recovery.tsx) | Root error | 2.0 (WP1) | data-safety |
| 23 | Unknown route | expo-router default | Bad deep link | **Developer page "Unmatched Route · Sitemap"** (seen during WP4C) | none |
| 24 | Onboarding / splash / design-system page | protected or development only | — | Out of scope | onboarding, splash, design-system |

### Navigation and dependency map (shared pieces)

```text
ProfileForm ──► You sheets (6–9) and Onboarding (protected)
ExercisePicker ──► Workout logger (WP2), TemplateEditor (WP3), WorkoutExerciseCard swap, Progress, GoalSheet (WP4D)
confirm() ──► 18 call sites: You, Account, History, Templates, Measurements, Nutrition, SavedFoods, programs, LegacyPath, workout card
mutate() ──► every write; on failure shows Alert "Could not save" with the raw error message
Screen/ListSection/Sheet/DateSheet/OverflowMenu ──► all 2.0 screens
```

---

## 3. Shared component inventory (reuse candidates)

| Component | File | Notes |
| --- | --- | --- |
| `Screen` (title, eyebrow, `onBack`, `footer`) | ui.tsx | Standard for every pushed screen |
| `Card`, `ListSection`, `ListRow`, `OverflowMenu` | ui.tsx, system.tsx | Records and settings |
| `Sheet` (`unsaved`, `footer`), `confirmDiscard` | ui.tsx | Unsaved-change protection |
| `Field` (`error`), `NumberControl`, `Stepper` | ui.tsx, Stepper.tsx | Inline validation; small numbers |
| `SegmentedControl`, `Choices`, `Chips`/`FilterChips` | ui.tsx | Choices. `SegmentedControl` is 38 pt with tab semantics, so use it for views, not answers. |
| `DateSheet` (`range="past"`/`"future"`) | DateSheet.tsx | Replaces typed dates |
| `Empty`, `InfoButton`/`InfoSheet` | ui.tsx, system.tsx | Empty and explanatory states |
| Undo banner | inline pattern in Measurements, Recovery, Goals, Nutrition | Not extracted. Four copies is the threshold to consider a small shared `UndoBanner` (D12). |
| `ConfirmationDialog` | design.tsx | **Unused**. Leave it, or delete it in WP7. |

---

## 4. Screenshot references

Captures: `forge-visual-harness\p21.ps1`. Screenshots: `C:\Users\LStAm\forge-visual-harness\shots\android\p21\`, 66 frames plus contact sheets `_sheet-a…d.png`.

The harness reuses earlier seeded databases:
- `p5-long-dark` / `p5-long-light-lb`: 265 workouts and 129 records;
- `p11-many`: templates and schedule;
- `p3-new-dark`, `p3-program-dark`, `p3-path-dark`: programs and the legacy Path;
- `p19-empty`.

Coverage:
- **Sizes and themes:** standard, SE and large; dark and light (pounds).
- **130% text:** exercise detail, account, library, legacy Path.
- **States:** keyboard open (library search); empty search; validation (custom exercise); destructive confirmations (delete all data, delete workout).

**Two surfaces couldn't be automated:** the exercise picker and the legacy reschedule sheet. A live workout timer keeps UI Automator from reaching an idle state, so both are documented from code.

---

## 5. Prioritized consistency matrix

Severity scale:
- **P0:** data loss, blocked navigation, or a critical accessibility failure.
- **P1:** broken or seriously confusing.
- **P2:** an important consistency or usability fix.
- **P3:** cosmetic; defer to WP7.

| ID | Sev | Surface | Current state and problem | Recommended improvement | Reuse | Files | Data or behaviour risk | Size | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S-01 | **P1** | Training preferences (also onboarding "Your training") | **Progression increment is always typed in kg** ("Progression increment (kg)"), yet You shows it in the lifter's units ("+5.51 lb"). A pound user typing "5" stores 5 kg (11 lb steps) in the value that suggestions and load steppers use. **[Code]** | Enter and show it in display units and store kg, as WP4B/WP4D do. Stored values and suggestion maths are unchanged. | `NumberControl`, conversion helpers | ProfileForm.tsx | Display and entry only; existing values unchanged | S | D4 (shared with onboarding) |
| S-02 | **P1** | Profile editors (sheets 6, 8, 9) | **Raw schema messages** under fields: "Too big: expected number to be <=7", "Invalid input: expected number, received NaN" (from a comma decimal). **[Calc]** | Field-level friendly messages, with comma decimals accepted (`decimalText`), as WP4A did | `Field error`, `decimalText` | ProfileForm.tsx | None (validation rules unchanged) | S | D4 |
| S-03 | **P1** | Any write, via `mutate()` | An unexpected validation failure shows "Could not save" with **raw JSON**. Reproducible on the custom exercise: clear "Primary muscle" and Save. **[Code]** | `mutate()` shows "Some values couldn't be saved. Check the form and try again." for schema errors, and keeps plain-language errors. Rules are unchanged. | — | state.ts | None | XS | D3 |
| S-04 | **P1** | Destructive confirmations | `confirm()` always labels the action **"Confirm"**, including "Delete all local data", "Replace local data from backup", "Delete workout", "Delete template", "End program" and "Delete cloud account". **[Device]** `standard-confirm-delete-all`, `standard-confirm-delete-workout` | Add an optional action label ("Delete everything", "Replace data", "Delete workout", …), destructive-styled. The default is unchanged for other callers. | `confirm` | state.ts plus the destructive call sites | None (copy only) | S | D2 |
| S-05 | P2 | Exercise detail | Legacy chrome (eyebrow "EXPLORE / EXERCISE", full-width Back) and `Label` text throughout. Records and history are long text lines ("Session 94: 105.14 kg × 6 · …" ×10); the formula paragraph is inline. **[Device]** `standard-exercise-0..3`, `se-text130-exercise` | `Screen onBack`; sections (About, Movement guide, Strength history chart, Your records as `ListRow`s, Recent sessions as rows); method in an `InfoButton`; "Add to workout" pinned in the footer | Screen, ListSection, InfoButton | exercise.tsx | Read-only display | M | D1 |
| S-06 | P2 | Custom exercise form | Slogan "Your movement."; **free-text muscle and equipment**, which split library filters; raw lower-case category chips; Save disabled with no reason; Save not pinned. **The default equipment "Bodyweight" silently makes new custom lifts non-load**, so no load records, e1RM or lift goals. **[Device]** `standard-custom-*`, **[Code]** `loadKind` | `Screen onBack` with title "New exercise"/"Edit exercise"; pick muscle and equipment from the existing catalogue values (with "Other…"); `SegmentedControl` for Strength/Duration/Distance; friendly inline errors; pinned Save; equipment **not preselected** | Choices/Chips, Sheet footer | exercise.tsx | Only new or edited custom exercises; stored shape unchanged | M | D7 |
| S-07 | P2 | Account | Legacy chrome (slogan title, eyebrow, full-width Back, `Label` cards) **[Device]** `standard-account`, `se-text130-account` | Plain title "Account", `onBack`, `Txt` and `ListSection`. **Auth and sync logic untouched.** | Screen, ListSection | account.tsx | None (presentation only; protected logic stays) | S | D1 |
| S-08 | P2 | Training preferences | Weekly goal (1–7), rest (seconds) and rep range are typed; "Target muscle groups" is free text **[Device]** `standard-sheet-prefs` | Steppers for weekly goal and reps; rest shown as m:ss with ±15 s steps (stored seconds); muscle groups unchanged unless D6 is approved | Stepper, NumberControl | ProfileForm.tsx | Stored values unchanged | S | D4, D6 |
| S-09 | P2 | Edit profile | "Body fat % (optional; 0 to skip)" **[Device]** `standard-sheet-profile`. Height is **always feet and inches**, even for kg users **[Code]**. | Show body fat empty when 0 and save empty as 0 (same storage). Height in cm when units are kg (storage stays cm), per D5. | Field | ProfileForm.tsx | Storage unchanged | S | D4, D5 |
| S-10 | P2 | Exercise picker (shared) | Legacy `Label` rows; every row's accessible name is "Add {exercise}", even when choosing for Goals or Progress; fixed 350 pt list; a muscle chip subset; no way to create a custom exercise from it **[Code]** | `ListRow` rows (name plus muscle and equipment); a contextual action label prop (default "Add", so the logger is unchanged); list height that flexes with the sheet | ListRow | ExercisePicker.tsx | Used by the WP2 logger and WP3 templates, so their regression tests must pass | S | D8 |
| S-11 | P2 | Legacy Path sheets | Sheets use legacy `Label`; **reschedule is a typed "New session date (YYYY-MM-DD)"** **[Code]** | `DateSheet range="future"` for reschedule; `Txt` in sheets. Path generation and rescheduling logic untouched. | DateSheet | LegacyPath.tsx | None (same `reschedulePathSession` call) | S | D1 |
| S-12 | P2 | Unknown route | Expo's developer "Unmatched Route" page with a Sitemap link | A simple "Page not found" screen with "Go to Today" | Screen, Empty | new `app/+not-found.tsx` | Adds a route file (navigation-adjacent) | XS | D9 |
| S-13 | P2 | History | Renders every workout and computes its volume on every render (265 rows in the seed); no paging **[Device]** `standard-history-*` | Show 60, then "Show earlier (n)", as WP4B/WP4C do | — | History.tsx | None | XS | D10 |
| S-14 | P3 | Exercise library | The filter panel shows three untitled chip rows (muscle, equipment, sort); the empty state uses legacy `Label` **[Device]** `standard-explore-filters`, `-empty` | Row captions ("Muscle", "Equipment", "Sort by"); `Empty` component | Txt, Empty | explore.tsx | None | XS | D1 |
| S-15 | P3 | You → About | Guest mode shows "Local schema v1 · 296 pending sync records" (the outbox grows without sync) **[Device]** `standard-you-*` | Show the pending count only when cloud sync is configured | — | You.tsx | None | XS | D11 |
| S-16 | P3 | Templates | A "Scheduled" success uses a blocking alert; other screens use banners | Defer to WP7 | — | templates.tsx | — | XS | — |
| S-17 | P3 | No active workout | No ‹ back on a pushed route (has "Back to Train") | Defer | — | Workout.tsx | — | XS | — |
| S-18 | P3 | Onboarding (ProfileForm) | Legacy step label "STEP 1 / 3 · SAVED ON THIS DEVICE" | **Protected**; defer to WP7 | — | — | — | — | — |

**No P0 issues** were found: no data loss, blocked navigation or critical accessibility failure.

---

## 6. Functional and accessibility issues (beyond chrome)

1. **Units:** S-01 (pound users enter kg into the progression increment) and S-09 (height in feet only for metric users).
2. **Raw errors:**
   - S-02: field schema text;
   - S-03: the `mutate` JSON fallback;
   - Account still shows raw Supabase error text in its status card. That text comes from protected auth logic, so the wording is left as is; only the card's presentation changes.
3. **Destructive safety:** S-04, generic "Confirm" on irreversible actions.
4. **Silent classification:** S-06, a custom lift defaulting to "Bodyweight" equipment and therefore excluded from load records and lift goals.
5. **Accessibility:**
   - picker rows read "Add …" in choose contexts (S-10);
   - Explore's filter rows have no group labels (S-14);
   - legacy `Label` text has no header roles on exercise detail and Account (S-05, S-07);
   - at 130% text on SE, the legacy screens stay legible but lose their first screen to the full-width Back button.
6. **Performance:** S-13, History without paging.

---

## 7. Screens that should remain unchanged

- **Already consistent (2.0):** Templates, Records, Training calendar, Forge Paths library/details/dashboard, You's layout, Backup and Privacy sheets, Training focus sheet, the startup error screen, `DateSheet`, `OverflowMenu`, `InfoSheet`.
- **Rebuilt in WP2–WP4D:** workout logger and finish sheet, Today, Train, Progress, Nutrition, food library, Measurements, Recovery, Goals.
- **Protected:** onboarding flow, splash, main tabs, the design-system development page.
- **Better left to WP7 (visual redesign):** typography and colour changes, card styling, iconography, animations, the "Membership" card, the generated Path names' all-caps style ("GET STRONG", which is stored data).

---

## 8. Recommended implementation batches

Four batches. Each is independently reviewable, ends with tests, emulator captures and an iPhone check, and leaves protected logic untouched.

### Batch A: Safety and feedback (cross-cutting, low risk)

| | |
| --- | --- |
| **Fixes** | S-03 friendly `mutate` fallback · S-04 explicit destructive labels · S-15 guest-mode pending count |
| **Files** | [state.ts](../../src/state.ts) (`mutate`; `confirm` gains an optional action label) · destructive `confirm` call sites in You, account, History, templates, programs Dashboard/Details, LegacyPath, Measurements, Nutrition, SavedFoods, WorkoutExerciseCard (label argument only) · You.tsx (About row) |
| **Protected** | No validation, data, auth or sync logic changes |
| **Tests** | `mutate` shows no `{`/`"code"` for schema errors; each destructive confirm offers its named action; existing suites unchanged |
| **Emulator** | Delete all data, Replace from backup, Delete workout, End program dialogs; custom exercise with an empty field |
| **iPhone** | Each destructive dialog names its action ("Delete everything"); no raw error text anywhere |

### Batch B: Profile and preferences editors

| | |
| --- | --- |
| **Fixes** | S-01 increment in units · S-02 friendly field messages and comma decimals · S-08 steppers (and muscle groups if D6) · S-09 body fat empty-for-none, height in cm for kg users (D5) |
| **Files** | [ProfileForm.tsx](../../src/components/ProfileForm.tsx) (also renders onboarding fields), You.tsx (subtitle unchanged) |
| **Protected** | `profileSchema`, stored units (kg, cm, seconds), onboarding steps and order, progression maths |
| **Tests** | `profile`, `unsaved-input`, `you` and the onboarding tests stay green. New: lb increment round-trip (type 5 lb → stored 2.268 kg → shows 5 lb); comma decimals; friendly messages; untouched save keeps values; height cm/ft round-trips. |
| **Emulator** | All four You sheets in kg and lb, SE at 130%, keyboard open; onboarding step 3 still works |
| **iPhone** | Pound user sets a 5 lb increment and You shows "+5 lb"; no schema text; steppers usable with VoiceOver |

### Batch C: Exercise library, detail, custom exercise and picker

| | |
| --- | --- |
| **Fixes** | S-05 detail layout · S-06 custom exercise form (D7) · S-10 picker (D8) · S-14 library filters and empty state |
| **Files** | [explore.tsx](../../app/explore.tsx), [exercise.tsx](../../app/exercise.tsx), [ExercisePicker.tsx](../../src/components/ExercisePicker.tsx) |
| **Protected** | Exercise catalogue, `loadKind`, progress engines, the workout logger's add-exercise behaviour, stored exercise shape |
| **Tests** | `progress` (exercise detail, records), `redesign` (explore), the WP2/WP3 logger and template suites (picker); new tests for custom exercise validation and picker labels |
| **Emulator** | Library (filters, empty, keyboard), detail (long history, light, 130%, SE), custom create and edit, picker from workout and Goals |
| **iPhone** | Create a custom barbell exercise; it appears in the library under its muscle and gets load records after a workout |

### Batch D: Account, legacy Path, History and routing

| | |
| --- | --- |
| **Fixes** | S-07 Account chrome · S-11 legacy Path sheets and reschedule DateSheet · S-13 History paging (D10) · S-12 not-found screen (D9) |
| **Files** | [account.tsx](../../app/account.tsx), [LegacyPath.tsx](../../src/screens/LegacyPath.tsx), [History.tsx](../../src/screens/History.tsx), new `app/+not-found.tsx` |
| **Protected** | Auth, sync and conflict logic; Path generation, pause/resume and reschedule logic; tab layout |
| **Tests** | `data-safety` (account), `legacy-path`, `legacy-workouts`, `today-train`, `workout-wp2`, `navigation`; new tests for reschedule via calendar, History paging, and the not-found route |
| **Emulator** | Account (guest), legacy Path sheets and reschedule, 265-workout History, an unknown deep link |
| **iPhone** | Reschedule a legacy session from the calendar; History scrolls smoothly; a bad link shows "Page not found" |

**Order:** A → B → C → D. A is smallest and protects every later batch.

---

## 9. Exact file scope per batch

| Batch | New | Modified | Not touched |
| --- | --- | --- | --- |
| A | — | state.ts; destructive call sites (label argument only); You.tsx | validation.ts, repository, cloud/*, programs, paths |
| B | — | ProfileForm.tsx | profileSchema, onboarding.tsx flow, metrics/progression |
| C | — | app/explore.tsx, app/exercise.tsx, components/ExercisePicker.tsx | data/exercises.json, progress/*, Workout.tsx, TemplateEditor.tsx (beyond picker props) |
| D | app/+not-found.tsx | app/account.tsx, screens/LegacyPath.tsx, screens/History.tsx | cloud/*, data/paths.ts, (tabs)/_layout.tsx |

No dependencies, schema or migration changes in any batch.

---

## 10. Regression test strategy

- **Every batch runs the full suite:**
  - typecheck, lint, format;
  - 334+ logic tests (with the 18 program locks) and 251+ UI tests;
  - `food-library:check`; iOS and Android export.
- **Navigation and deep links:**
  - the `navigation` test;
  - `/journal?kind=…` dispatch;
  - `/exercise?id=` and `?custom=new`;
  - `/paths?programId=&week=`;
  - an unknown route (D).
- **Data preservation:**
  - untouched profile edits save identical values (B);
  - a custom exercise keeps its stored shape (C);
  - legacy reschedule writes the same record as before (D);
  - backup round trip unchanged.
- **Accessibility:**
  - header roles on titles;
  - labelled filter groups;
  - picker action names;
  - steppers as adjustable;
  - no raw error strings (assert absence of `{`, `"code"`, `expected number`).
- **Large text, keyboard and compact:** emulator SE at 130% with the keyboard open on every changed form.
- **Confirmation and Undo:** each destructive dialog's action label; existing Undo flows (Measurements, Recovery, Goals, Nutrition) untouched.
- **Light and dark:** captures of every changed screen in both.
- **Existing features:** the workout logging, templates, nutrition and food library, Measurements, Recovery, Goals, programs and backup/sync suites stay green with no assertion changes, except where a batch deliberately changes shared copy (listed in that batch's report).

---

## 11. Emulator verification requirements

Per batch:
- **Sizes and themes:** SE, standard and large; dark and light (pounds).
- **Text:** 130% text on SE.
- **States:** keyboard open on each form; empty and populated; long list (265 workouts, 367 exercises); validation errors; each destructive confirmation.
- **Database check:** for edited forms, prove an untouched save writes nothing (the WP4B–WP4D method).
- **Evidence:** screenshots in `forge-visual-harness\shots\android\p22…`, with contact sheets reviewed visually.

---

## 12. Founder iPhone acceptance checklist (after implementation)

1. Every destructive dialog names what it does. Nothing says only "Confirm".
2. No error anywhere shows code-like text.
3. With pounds selected, Training preferences shows the increment in lb, and You shows the same value.
4. Training preferences uses steppers. A comma decimal works in Nutrition targets.
5. The exercise detail reads as clear sections. "Add to workout" stays at the bottom.
6. A new custom barbell exercise asks for its equipment, appears under its muscle, and shows load records after a workout.
7. Account and the legacy Path look like the rest of Forge, with a ‹ back at top left and no full-width Back button.
8. A legacy Path session is rescheduled from a calendar.
9. History opens quickly with a long log, and "Show earlier" works.
10. VoiceOver, Larger Text, light mode and a small iPhone all work on every changed screen.

---

## 13. Known risks

1. **ProfileForm also renders onboarding.** Field-level presentation changes (units, steppers, messages) will appear in onboarding's "Your training" step. The onboarding flow, steps and saving must not change (D4).
2. **ExercisePicker is shared with the WP2 logger and WP3 templates.** Its default behaviour and labels must stay the same for them (D8).
3. **The custom equipment default change (D7)** affects only new or edited custom exercises. Existing custom exercises keep their stored equipment.
4. **Height in cm (D5)** changes what metric users see in onboarding too. Storage stays cm.
5. **The not-found route (D9)** adds a file to `app/`. It is navigation-adjacent but not a tab change.
6. **Not automated on the emulator:** ExercisePicker, the legacy reschedule sheet and the error screen (UI Automator can't idle on live timers). They are verified by unit and UI tests and manual review.

---

## 14. Necessary repairs versus aesthetic work

- **Necessary (WP5):**
  - S-01–S-04 (units, raw errors, destructive labels);
  - S-06's silent load classification;
  - S-11's typed date;
  - S-13 performance;
  - the chrome consistency of the three legacy screens (S-05, S-07, S-11), so navigation behaves the same everywhere.
- **Aesthetic (WP7):** S-14 (partly), S-16, S-17, S-18; any typography, colour or card styling; Membership card styling; icon refresh.

---

## 15. Founder decisions

**D1: Approve the WP5 batches A–D in order.**
- **Recommended:** yes.
- **Alternatives:**
  - only A and B now;
  - merge C and D.
- **Trade-offs:** smaller batches mean more reviews but lower risk.
- **Data:** none.

**D2: Explicit destructive labels.**
- **Proposed rule:** `confirm()` takes an optional action label; every irreversible action uses a named verb: "Delete everything", "Replace data", "Delete workout", "Delete template", "End program", "Delete account".
- **Recommended:** approve, keeping a single confirmation (no typing to confirm).
- **Alternative:** require typing "DELETE" for Delete all local data.
- **Trade-offs:** typed confirmation is safer but heavier.
- **Data:** none.

**D3: Friendly fallback for unexpected validation errors.**
- **Proposed rule:** `mutate()` replaces raw schema errors with "Some values couldn't be saved. Check the form and try again." Plain-language errors are still shown as written.
- **Recommended:** approve.
- **Alternatives:** fix each screen only.
- **Trade-offs:** the global fallback catches everything, including future screens.
- **Data:** none.

**D4: ProfileForm presentation changes, which also show in onboarding.**
- **Proposed rule:**
  - increment in display units;
  - friendly field messages and comma decimals;
  - steppers for weekly goal and reps; rest as m:ss;
  - body fat empty-for-none.
  
  Onboarding's steps, order and saving are untouched.
- **Recommended:** approve.
- **Alternatives:** change the You sheets only by forking the form (duplicates code).
- **Trade-offs:** a fork diverges over time.
- **Data:** none; storage is unchanged.

**D5: Height in centimetres for kg users.**
- **Proposed rule:** height shows as a cm field when units are kg, and as feet and inches when they're lb. It is stored as cm, as today.
- **Recommended:** approve.
- **Alternatives:** keep feet and inches for everyone.
- **Trade-offs:** none.
- **Data:** none.

**D6: Target muscle groups.**
- **Proposed rule:** keep it as text in WP5 (it doesn't drive programming).
- **Recommended:** keep.
- **Alternatives:** multi-select chips saved as the same comma-separated text (legacy values preserved).
- **Trade-offs:** chips are nicer, but the field is little used.
- **Data:** none.

**D7: Custom exercise muscle, equipment and default.**
- **Proposed rule:** pick muscle and equipment from the catalogue's existing values (with "Other…" free text). Equipment is **not preselected**, so a new custom lift can't silently become non-load.
- **Recommended:** approve.
- **Alternatives:** keep "Bodyweight" as the default and add a note.
- **Trade-offs:** one extra required choice.
- **Data:** new and edited custom exercises only; the stored shape is unchanged.

**D8: Shared ExercisePicker restyle.**
- **Proposed rule:** use `ListRow` rows, a contextual action label (default "Add", so the logger and templates are unchanged), and a flexible list height.
- **Recommended:** approve.
- **Alternatives:** leave it for WP7.
- **Trade-offs:** it touches a component the logger uses; covered by WP2/WP3 tests.
- **Data:** none.

**D9: A friendly not-found screen.**
- **Proposed rule:** add `app/+not-found.tsx` ("Page not found · Go to Today").
- **Recommended:** approve.
- **Alternatives:** keep Expo's developer page.
- **Trade-offs:** it is a new route file, but tabs are unchanged.
- **Data:** none.

**D10: History paging.**
- **Proposed rule:** 60 workouts, then "Show earlier (n)".
- **Recommended:** approve.
- **Alternatives:** none.
- **Data:** none.

**D11: Hide the pending sync count in guest mode.**
- **Recommended:** approve.
- **Alternatives:** show it with an explanation.
- **Data:** none.

**D12: A shared `UndoBanner` component.**
- **Proposed rule:** extract it only if Batch A or C adds a fifth copy. Otherwise leave the four working copies alone, per the brief.
- **Recommended:** don't extract unless needed.
- **Data:** none.

**D13: P3 items (S-16, S-17, S-18, Membership card, typography).**
- **Recommended:** defer to WP7.

**D14: Out of scope for WP5.** Protected areas stay untouched: programming, Paths generation, curated programs, nutrition, measurement, recovery and goal calculations, the food catalogue, schemas, backup and sync, authentication, the onboarding flow, splash and main tabs. No new palette, typography, navigation architecture or feature removal.
- **Recommended:** confirm.

---

## Founder approval (WP5)

- **Approved:** D1–D14 with the recommended options, and the four batches A → D.
- **Clarifications:**
  1. Implement A, B, C and D in order, each tested and visually verified before the next. Report unexpected scope or protected-area conflicts instead of expanding the work.
  2. **Batch A:** destructive confirmations name the action and its consequences. Friendly errors keep developer diagnostics. Hiding the guest-mode sync count doesn't change synchronization.
  3. **Batch B:** the progression increment keeps its canonical storage (kg). Test conversion, unit switching, comma decimals and unchanged saves. ProfileForm is shared with onboarding, so verify onboarding behaviour and data integrity.
  4. **Batch C:** preserve every existing custom exercise, including legacy free-text and equipment values. Selectors use existing catalogue values. Exercise identity, load classification, workout data and Lift goal maths don't change. The picker keeps "Add" where workflows need it.
  5. **Batch D:** preserve account/authentication behaviour, Forge Paths scheduling rules, workout-history ordering and existing routes. Paging never hides or reorders saved workouts.
  6. P3 refinements stay deferred to WP7 and the full redesign.

---

## Implementation results (WP5)

All four batches are implemented, tested and checked on the Android emulator. **Not committed.** Evidence is in `forge-visual-harness/shots/android/p22/`.

### Batch A: safety and feedback (S-03, S-04, S-15)

| File | Change |
| --- | --- |
| [state.ts](../../src/state.ts) | `confirm(title, message, fn, { action, destructive })` names the action ("Delete workout", "Replace data" …). The default stays "Confirm", destructive. `destructive: false` gives a normal button (Pause/Resume Path, Keep local version). Schema failures in `mutate` show "Some values couldn't be saved. Check the form and try again. Your existing data is unchanged." and log `[FORGE] Save rejected by validation` with the full error. Plain-language errors are shown as before. |
| Call sites | Every `confirm` names its action, and each message states the consequence: Account, Templates, Measurements, Nutrition, Saved foods, You, legacy Path, workout logger (Delete vs Discard by state), History, exercise card (Remove set/exercise), program details and dashboard. |
| [You.tsx](../../src/screens/You.tsx) | "Delete everything" and "Replace data" say it can't be undone. An unreadable or invalid backup reads "This file isn't a valid FORGE backup. Nothing was changed." (with `console.warn` details). In guest mode, About reads "Local schema v1 · guest mode". The outbox is untouched. |

### Batch B: profile editors (S-01, S-02, S-08, S-09)

| File | Change |
| --- | --- |
| [ProfileForm.tsx](../../src/components/ProfileForm.tsx) | The progression increment is typed and shown in the lifter's units and stored in kg (unchanged storage). Commas are accepted, and fields keep what you type. Raw schema text is replaced by field messages. Steppers for weekly goal (1–7), rep range (min ≤ max) and rest (m:ss, 15 s steps, stored in seconds). Body fat is empty when 0 ("optional"). Height is in cm for kg users and in ft/in for lb users (stored in cm). Onboarding keeps its per-field saves. |
| [Stepper.tsx](../../src/components/Stepper.tsx) | Labels wrap to two lines at large text sizes instead of truncating. |

### Batch C: exercise library, detail, custom exercises and picker (S-05, S-06, S-10, S-14)

| File | Change |
| --- | --- |
| [exercise.tsx](../../app/exercise.tsx) | **Detail:** `Screen` with a ‹ back control (to the library); the muscle and equipment eyebrow; the movement guide card; the strength chart; "Your records" as rows (each read as "Heaviest set: 225 lb × 5"); "Recent sessions" as rows with the same data ("Session N" and its completed sets); "Add to workout" pinned in the footer. The 1RM method is the records section's footnote, not an `InfoButton`: a button inside a row is unreachable to screen readers. **Custom form:** titles "New exercise"/"Edit exercise" with a ‹ back control; Main muscle and Equipment chosen from the catalogue's own values in a list sheet, with "Other…" for free text; equipment is never preselected; Strength/Duration/Distance and Both sides/One side segmented controls; field messages that clear as you fix them; Save pinned. |
| Legacy custom exercises | Values outside the catalogue open as "Other…" with their text. Name and lines are stored as typed (no trimming). `tracking` is kept unless the category changes. An existing empty equipment can stay empty. **An untouched Save writes nothing** (no outbox entry). The id and stored shape are unchanged, and `loadKind` is unchanged. |
| [ExercisePicker.tsx](../../src/components/ExercisePicker.tsx) | `action` prop: "Add" by default (logger, templates, substitute unchanged); GoalSheet passes "Choose". Muscle filter chips use every catalogue muscle (adds Calves, Tibialis, Full body). The list grows to fill the sheet. Search and chips no longer shrink under the keyboard (they overlapped on Android). `Txt` rows with the muscle and equipment as a hint. |
| [explore.tsx](../../app/explore.tsx) | Filter rows captioned Muscle, Equipment and Sort by. Empty results use `Empty` with specific copy (no favorites, no recent, no match) and "Clear search and filters". |

Progress keeps its own local exercise chooser, which is unchanged.

### Batch D: Account, legacy Path, History and routing (S-07, S-11, S-12, S-13)

| File | Change |
| --- | --- |
| [account.tsx](../../app/account.tsx) | Title "Account" with a ‹ back control (to You); `Txt` roles. The Login/Register/Reset chips become a segmented control labelled "Sign in / Create account / Reset password", with the same internal values. Conflicts show "Sync conflict" with the record id as a caption. **Auth, sync and conflict handlers are unchanged.** |
| [LegacyPath.tsx](../../src/screens/LegacyPath.tsx) | Reschedule uses `DateSheet range="future"` ("Move · {day}") instead of a typed YYYY-MM-DD field, and calls the same `reschedulePathSession` with all its rules. If a date is refused (an occupied day or a missing recovery day), the alert explains and the calendar closes; Move reopens it. Sheets use `Txt`. |
| [History.tsx](../../src/screens/History.tsx) | Shows the newest 60, then "Show earlier (n)" in steps of 60. The order and month grouping are the same, and the eyebrow keeps the full count. |
| [+not-found.tsx](../../app/+not-found.tsx) (new) | "Page not found · This page doesn't exist" with "Go to Today", instead of Expo's developer page. Tabs and the root stack are unchanged. |

**Unchanged:**
- programming, progression, Forge Paths generation and scheduling rules, and the 18 curated programs;
- nutrition, the food catalogue, and measurement, recovery and goal calculations;
- `validation.ts`, `repository.ts`, schemas, backup and sync;
- authentication;
- the onboarding flow (only ProfileForm's fields, which it shares);
- splash and main tabs.

No dependencies were added. No `UndoBanner` was extracted (D12): no batch added a fifth copy.

### Tests

- **New:** [wp5.test.tsx](../../tests/ui/wp5.test.tsx) (11 tests, using the real state module), covering:
  - friendly schema errors with developer logging;
  - named confirmations and the unchanged default;
  - You delete-all and invalid-backup wording, and the guest-mode About row with an unchanged outbox;
  - a new custom exercise: messages, nothing saved until valid, catalogue values stored, errors clearing;
  - a legacy custom exercise: free text shown as Other…; an untouched save writes nothing; an edit preserves the other fields and the id;
  - detail record and session rows;
  - picker Add vs Choose, and all catalogue muscles;
  - library captions and the empty state with Clear;
  - Account title, back control and guest mode;
  - History 60 + "Show earlier (5)", with every workout listed once in stored order;
  - the not-found route.
- **[profile.test.tsx](../../tests/ui/profile.test.tsx) (+6):** lb increment conversion and unit switching; an unchanged save is exact; commas and friendly errors; steppers and limits; body fat empty; onboarding per-field saves intact.
- **[legacy-path.test.tsx](../../tests/ui/legacy-path.test.tsx) (+1):** reschedule from the calendar, past days disabled, the same rule applied.
- **Updated, with the same guarantees:**
  - `confirm` gains its fourth argument in forge-paths, workout-logger, templates-wp3, measurements and you;
  - goals presses "Choose Barbell Bench Press";
  - progress reads the record and session rows by their spoken labels.

### Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (only the existing WP3 warning in templates-wp3.test.tsx) |
| `npm run format:check` | Pass |
| `npm test` (logic, including program locks) | 334 / 334 |
| `npm run test:ui` | 27 suites, 269 / 269 (251 before WP5) |
| `npm run food-library:check` | Reproducible: 3,730 foods, same catalogue hash |
| `npm run export` (iOS and Android) | Pass |

### Emulator verification (Android, p22)

Compact (SE), standard and large; light and dark; 130 % text; keyboard open:

- **A:** named dialogs (Delete everything, Replace data, Delete workout, End program, Delete template) and the guest-mode About row.
- **B:** the profile, preferences and targets sheets in kg and lb, with comma entry; SE at 130 % with wrapped stepper labels; onboarding step 1 with the cm field.
- **C:**
  - library, filters and empty state;
  - bench detail with 94 sessions;
  - new custom exercise: errors, the muscle and equipment sheets, save, the saved detail and Edit;
  - Goals → Lift picker with and without the keyboard;
  - all of the above at SE and large 130 %, and in light lb.
- **D:**
  - Account (guest) at standard, SE 130 % and light;
  - legacy Path options, the reschedule calendar (past days greyed), the result (calendar follows the session) and Manage;
  - History with 265 workouts ("Show earlier (205)" and expanded);
  - `forge://no-such-page` → Page not found → Go to Today.

Found and fixed during review:
- picker search and chips overlapping with the keyboard open;
- custom-form selections hidden off-screen in long chip rows, now list sheets;
- errors that stayed after a field was fixed.

### Remaining limitations

- The workout picker inside a live workout can't be captured by UI Automator (its timer keeps the screen busy). The same component was verified through Goals, and the logger and templates tests cover "Add".
- At SE size with 130 % text, the shared `DateSheet` needs a scroll to reach the last calendar rows; Move stays pinned. Pre-existing and shared with WP3 scheduling.
- On Android, the strip under a modal sheet shows the screen behind. This is pre-existing and doesn't occur on iOS (WP7).
- P3 items stay deferred (D13): S-16, S-17, S-18, the Membership card and typography.
- **iPhone review outstanding.** See [IPHONE_TESTING.md](../../IPHONE_TESTING.md).

---

*End of WP5. Not committed. WP6 has not begun.*
