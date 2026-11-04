# Phase 7.6A: REFORGE design-system inventory and migration plan

**Audit only.** No application code, test, dependency or setting changed. Baseline: `feat/forge-paths-foundation` at `5f07c9b` (Nov 3, 2026). Nothing here was checked on a device.

**Status: implementation deferred (founder decision, Nov 4, 2026).** Forge's current look is approved as it is. Phases 7.6B–7.6E don't go ahead as a programme. This inventory is kept as the reference for targeted changes, made only when a specific usability, accessibility, performance or functional issue justifies one.

**Purpose.** Forge still runs two design systems: Design System 2.0 (DS 2.0, Phase 6) and REFORGE (Phases 7.1–7.5). This report lists every DS 2.0 component still in use, maps each to the approved REFORGE language and sets the order for Phases 7.6B–7.6E. The goal is one premium product, not a mixture of two systems.

**Sources.**

- The approved references: [Nutrition, Progress and You](../redesign/reforge/references/README.md). The Home and Train references were approved in Phase 7.0 but aren't stored in the repository.
- [REFORGE_FOUNDATION.md](../redesign/REFORGE_FOUNDATION.md), [DESIGN_SYSTEM_2.md](../redesign/DESIGN_SYSTEM_2.md), and the Phase 7.0 plan ([PHASE_7_0_REFORGE_ARCHITECTURE.md](PHASE_7_0_REFORGE_ARCHITECTURE.md), §5–§7, §13).
- Decision C5 ([PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md](PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md)): shared sheets, fields, segmented controls, chips and pickers stay on DS 2.0 "until a single global pass in 7.6". This is that pass.

## 1. Summary

1. **DS 2.0 is still drawn in 50 product files.**
   - 37 of them already mix in REFORGE: a REFORGE screen that opens a DS 2.0 sheet, menu, field or button.
   - 13 have no REFORGE at all. Three of those are dead code.
   - REFORGE is imported by 58 product screens and components.
2. **Four DS 2.0 components draw every floating surface.** `Sheet`, `OverflowMenu`, `InfoSheet` and `InfoButton` render all 58 of them: 37 sheets, 11 "•••" menus, 6 information sheets and 4 information buttons. They are the most visible inconsistency, because every REFORGE screen opens them. Restyling those four converts all 58 at once.
3. **Migrate centrally, as Phase 7.0 planned.** Restyle the DS 2.0 components in place to REFORGE tokens, with the same props and behaviour.
   - Phase 7.0 §7: the primitives "stay as they are until 7.6. They are then restyled to REFORGE tokens, so that secondary screens converge in one deliberate pass".
   - Per-screen replacement would touch about 50 files and still leave two implementations of every control.
4. **REFORGE has no equivalent for six things the app relies on:**
   - sheets, menus and information sheets;
   - grouped lists with information-only or disabled rows (`ForgeListRow` must be tappable and have an icon);
   - text and destructive buttons;
   - a plain icon button;
   - large-text layout in segmented controls (`ForgeSegments` is one row only);
   - optional ("nullable") number fields.

   These must be designed from REFORGE rules, because no reference shows them (§6). They need your approval (§8).
5. **Some legacy surfaces escape the central pass:**
   - **Drawn directly with DS 2.0 colours and spacing:** 18 files. The worst are the workout finish sheet, reorder sheet, goal sheet and crash-recovery screen.
   - **The first-run profile steps:** a DS 2.0 screen frame, progress bar, titles and buttons. The same form opened from Preferences already uses REFORGE.

   Both get explicit per-file work in 7.6C.
6. **Behaviour is protected by existing tests.** The DS 2.0 components carry real behaviour: close paths that never lose unsaved input, actions that run only once a menu has closed (an iOS constraint), screen-reader focus and announcements, large-text layouts. None of it changes.
   - **Tests pinning DS 2.0 looks on shared controls:** only five assertions, all in [design-system.test.tsx](../../tests/ui/design-system.test.tsx).
   - **The token tests** keep passing, because token values don't change, only which tokens the components use.

## 2. Method

- **Scope:** the 117 `.tsx` files in `app/` and `src/`. Excluded: the DS 2.0 modules themselves, the REFORGE kit and the development-only design-system screen.
- **Two read-only scripts,** kept outside the repository, produced every count here:
  - **Import resolution:** which DS 2.0 and REFORGE exports each file uses, and how often it references each system's colours and tokens.
  - **A JSX scan:** which props every use of each DS 2.0 component passes, so the gaps in §4 are measured rather than estimated.
- **Read in full:** the three DS 2.0 modules ([ui.tsx](../../src/components/ui.tsx), [system.tsx](../../src/components/system.tsx), [design.tsx](../../src/components/design.tsx)), the REFORGE kit ([reforge/](../../src/components/reforge/index.ts)) and the theme ([theme.ts](../../src/theme.ts)).
- **Out of scope:** behaviour of screens, data, sync, accounts, Forge Paths and nutrition logic. Nothing in this plan touches them.

## 3. The two systems side by side

| | DS 2.0 (`theme`) | REFORGE (`forge` and the REFORGE colour names) |
| --- | --- | --- |
| Surfaces | Tonal fills (`surface #141619`, `surfaceRaised #1E2125`), no borders | Near-black panels (`cardBg #0C0D0F`) defined by a 0.5 pt hairline (`cardBorder #26282B`), faint top sheen; `cardRaised #15171A` inside cards |
| Corners | Control 12, card 16, sheet 24 | Card, tile and input 8, call to action 10, tab bar 22 |
| Margin and rhythm | 20 pt margin, 24 pt gaps | 16 pt margin, 12 pt card gap |
| Accent | Flat ember `#F46B35`, one per screen | Brighter ember `#F47522` (`emberHot`) for text, icons and borders; `#F77620 → #D8511F` gradient for the primary button; ember tint for selections |
| Selection | White pill (chips); grey fill and outline (segments) | Ember tint, ember border, ember label |
| Type | System face; display 32/800, title 22/700, body 15, caption 13, overline 11 (+1.6 tracking) | System face, with condensed uppercase Barlow for heroes and secondary-screen titles; body 15, label 13, overline 11 (+2.2 tracking), card title 17 |
| Lists | Rows on one tonal surface, grey icons, hairline dividers | Rows inside a bordered card, ember icons, bold titles |
| Light mode | Mapped palette, AA-tested | Mapped palette with REFORGE names, AA-tested ("same roles, no separate aesthetic", D5) |

Both systems share the background colour, the text colours, the status colours and the theme hook (`useColors`). References to those are neutral and need no migration.

## 4. Inventory: DS 2.0 components still in use

Counts are product uses (development screen excluded): **uses / files**.

### 4.1 Floating surfaces (the biggest visible gap)

| Component | Uses | What callers rely on | REFORGE equivalent | Approach |
| --- | --- | --- | --- | --- |
| `Sheet` (with `SheetHeader`) | **37 / 24** | A pinned footer (18); closes on a backdrop tap (15, information and action lists only); asks before discarding unsaved input (11); `onDismiss` for iOS sequencing (3); a non-scrolling body (2) | None | **Central restyle** of the frame, header and close control. Behaviour code unchanged (§7) |
| `OverflowMenu` | **11 / 10** | Destructive actions last; the action runs once, after the menu has closed; disabled items; a custom trigger (3, already REFORGE squares) | None | **Central restyle** of the menu panel, rows and Cancel |
| `InfoSheet`, `InfoButton` | **6 / 5**, **4 / 4** | Educational paragraphs one tap away; closes on a backdrop tap | None | **Central restyle** (they build on `Sheet`) |
| `useAfterSheet`, `confirmDiscard` | 3, 6 | Run an action after a sheet has closed; native "Discard changes?" alert | Not visual | **Keep unchanged** |

**Where they appear.** Every sheet, by area:

| Area | Sheets and menus |
| --- | --- |
| **Workout logger** | Set details; Exercise settings; Progression; Rename workout; Workout notes; Default rest; Save as template; Finish workout and Workout complete; Reorder exercises; Choose your movement; the exercise and workout "•••" menus |
| **Train, Paths and templates** | Home's session menu; the template sheet; Program sessions; the program sheet; How progression works; program information; Manage your Path; Path workout options; the template editor; the Templates menus; the custom exercise form's pickers |
| **Nutrition** | Add food; a food's details (two sheets); New food; Scan barcode; New food from barcode and Correct nutrition; the food editor (two); Daily targets; Hydration (twice); the Nutrition and Saved foods menus |
| **Progress and You** | Choose an exercise; Milestones; How volume is counted; the Progress information; How records work; Goals and Measurements (sheets and menus); Check-ins (sheet, menu and information); History menu; profile editors; Back up your data; Privacy & training guidance; the anatomy credit; date pickers in several of these |

### 4.2 Actions and text

| Component | Uses | Detail | REFORGE equivalent | Approach |
| --- | --- | --- | --- | --- |
| `Button` | **27 / 12** | About 12 primary, 11 secondary, 3 text, 1 destructive ("Remove set") | `CtaButton`, `OutlineButton` | **Central restyle:**<ul><li>primary → ember gradient call to action;</li><li>secondary → neutral outline;</li><li>destructive → outline in the error colour (new, D3);</li><li>text → ember text (D3).</li></ul>Same props |
| `TextButton` | **17 / 7** | 2 neutral, 2 compact | None | **Central restyle** (D3) |
| `IconButton` (and `BackButton`) | **8 / 4** | Calendar month arrows, stepper − and +, the set-details information icon, a back arrow; the sheet close control ("filled") | `SquareIconButton` (bordered) | **Central restyle:** REFORGE colours; the sheet's close control becomes a bordered square (D1) |
| `Txt` | **87 / 14** | Caption 35, body 27, overline 11, headline 10, metric 3, title 1 | `FText` | **Central restyle:** keep the sizes (each within 1 pt of the matching REFORGE role); adopt REFORGE colours, the +2.2 overline tracking and the ember tone. Titles that matter move to REFORGE roles explicitly (sheet titles, D2) |
| `Label` (older text) | **10 / 3** | Onboarding steps (live); `PathSummary` (dead) | `FText` | **Central restyle** with `Txt`; onboarding moves to `FText` in 7.6C |

### 4.3 Lists, cards and states

| Component | Uses | Detail | REFORGE equivalent | Approach |
| --- | --- | --- | --- | --- |
| `ListRow` | **23 / 11** | **8 information-only** (no `onPress`), **13 without an icon**, 5 with a trailing control, 3 that can be disabled, 4 with the chevron turned off | `ForgeListRow` (tappable, icon required: none of the above) | **Central restyle to the `ForgeListRow` look, keeping the full `ListRow` API.** Then `ForgeListRow` becomes a thin wrapper (7.6E) |
| `ListSection` | **2 / 2** | Grouped rows with a title and footer | `ForgeCard` + `RowDivider` + `SectionLabel` | **Central restyle** |
| `Card` | Onboarding (live); `PathSummary` (dead) | | `ForgeCard` | **Central restyle** |
| `ProgressBar` | Onboarding progress (live); `PathSummary` (dead) | | `ForgeProgress` | **Central restyle** |
| `Empty` | **1 / 1** ("Page not found") | | `ForgeEmpty` | **Central restyle** |
| `Screen` | **2 / 2** | "Page not found"; the first-run profile steps | `ForgeSubScreen`, `EntryFrame` | **Per screen** (7.6C) |
| `Loading` | **2 / 1** | "Opening FORGE…" while starting up (`app/_layout.tsx`) | None | **Per screen** (7.6C) |
| `Stat` | Development screen only | | `Metric` | Leave; remove in 7.6E (D11) |
| `Row` | Layout helper | | Not visual | Keep |

### 4.4 Inputs

| Component | Uses | Detail | REFORGE equivalent | Approach |
| --- | --- | --- | --- | --- |
| `Field` | **14 / 5** | 5 multi-line (notes) | `ForgeField` (same behaviour) | **Central restyle** to the `ForgeField` frame |
| `NumberField` | **6 / 3** | 2 **nullable** (the logger's optional set fields), 1 compact | `ForgeNumberField` (no nullable, compact or integer option) | **Central restyle** keeping its options; give `ForgeNumberField` the same options (7.6E merge) |
| `SegmentedControl` | **7 / 4** | Set type, Side (logger); Measured by, Sides (custom exercise); Session type (program dashboard); Start date, Days a week (program details) | `ForgeSegments` (**no large-text layout**: one row only) | **Central restyle keeping `segmentLayout`** (row → wrap → grid → stack at large text sizes). `ForgeSegments` then uses the same layout (7.6E), so large text never clips |
| `Chips`, `FilterChips` | **2 / 2**, **3 / 1** | Exercise picker and profile chips; the Exercise Library filters | `ForgeChips` | **Central restyle.** `FilterChips` still bleeds by DS 2.0's 20 pt margin inside REFORGE's 16 pt screens; this fixes it |
| `Choices` | **1 / 1** | Custom exercise form | `ForgeChoices` (same API) | **Alias** to `ForgeChoices` |

### 4.5 Unused or development-only

| Item | Status | Proposal |
| --- | --- | --- |
| [design.tsx](../../src/components/design.tsx) (`ScreenHeader`, `PrimaryButton`, `MetricCard`, `WorkoutCard`, `ConfirmationDialog`…) | No product use; two tests import it | Retire in 7.6E (D11) |
| [PathSummary.tsx](../../src/components/PathSummary.tsx) | Not imported anywhere | Remove (D11) |
| `PlanRow` component | Unused; five screens import only its `planStatus` helper | Remove the component, keep `planStatus` (D11) |
| DS 2.0 `LineChart`, `BarChart` ([charts.tsx](../../src/components/charts.tsx)) | Unused; REFORGE charts import only its `Bar` and `Point` types, and Progress its `Legend` | Remove the two charts, keep the types and `Legend` (D11) |
| [app/design-system.tsx](../../app/design-system.tsx) | Development-only screen (Preferences, "Design system (development only)") | Becomes the **REFORGE reference** in 7.6B: every converged component in both palettes, for your review on the phone |

## 5. Legacy feature surfaces

Forge's own components built directly on DS 2.0. Most of them follow automatically once §4 is done; the "direct" column is what a central pass can't reach.

| Component | Where you see it | DS 2.0 parts | Direct DS 2.0 colours / tokens | Stage |
| --- | --- | --- | --- | --- |
| [FinishSheet](../../src/components/FinishSheet.tsx) | Finish workout and Workout complete | 12 text, 5 buttons, 2 sheets, 2 rows | 8 / 12 | 7.6C |
| [ReorderSheet](../../src/components/ReorderSheet.tsx) | Reorder exercises (logger and templates) | 5 text, 1 button, sheet | 9 / 6 | 7.6C |
| [ExercisePicker](../../src/components/ExercisePicker.tsx) | Choose your movement (logger, templates, goals) | Sheet, field, chips, 3 text | 1 / 3 | 7.6C |
| [DateSheet](../../src/components/DateSheet.tsx) | Every date picker: scheduling, check-ins, goals, measurements, foods, legacy Path, the day switcher | Sheet, 4 text, button, 2 icon buttons | 1 / 1 | 7.6C |
| [Stepper](../../src/components/Stepper.tsx) (`Stepper`, `LoadControl`, `NumberControl`) | Template prescriptions, profile | 4 icon buttons, number field, 2 text | 0 / 2 | 7.6C (REFORGE has `ForgeStepper`) |
| [ProfileForm](../../src/components/ProfileForm.tsx) (first-run mode) and [Setup](../../src/screens/entry/Setup.tsx) | **The first-run profile steps** ("Made by your effort."): step label, progress bar, section titles, Next, Skip, Enter FORGE | `Screen`, `Label`, `ProgressBar`, `Card`, `Chips`, 4 buttons | Indirect | 7.6C (D7) |
| [RecoveryScreen](../../src/components/Recovery.tsx) | "Forge couldn't start" and screen failures | 6 text, 3 buttons | 2 / 6 | 7.6C |
| [+not-found](../../app/+not-found.tsx), `Loading` | A missing page; starting up | `Screen`, `Empty`, button; `Loading` | 2 / 0 | 7.6C |
| [WorkoutExerciseCard](../../src/components/WorkoutExerciseCard.tsx), [Workout](../../src/screens/Workout.tsx) | The logger's sheets: Set details, Exercise settings, Progression, Rename, Notes, Default rest, Save as template | 24 text, fields, number fields, 2 segmented controls, 7 sheets, menus | 2 / 0 | Central (7.6B), then a check in 7.6C |
| [SetGrid](../../src/components/SetGrid.tsx) | The set grid | 8 text (already REFORGE colours) | 1 / 0 | Central (7.6B) |

**Residual direct styling elsewhere.** Small amounts, fixed in 7.6C: [GoalSheet](../../src/components/goals/GoalSheet.tsx), [CheckinSheet](../../src/components/checkins/CheckinSheet.tsx), [MeasurementSheet](../../src/components/measurements/MeasurementSheet.tsx), [QuickAddSheet](../../src/components/nutrition/QuickAddSheet.tsx), [TemplateEditor](../../src/components/TemplateEditor.tsx), [Exercise](../../src/screens/Exercise.tsx) (custom exercise form), [Preferences](../../src/screens/Preferences.tsx). Most of it is spacing that is identical in both systems.

**Deliberately outside the design system (no change):**

- **Native confirmation alerts** (`Alert.alert`, about 30 call sites): platform-standard and accessible (D9).
- **Apple and Google sign-in buttons:** brand rules.
- **The REFORGE intro, the anatomy atlas palette and the barcode camera overlay.**
- **The system share sheet.**

## 6. Target: each family in REFORGE

Visual decisions without a reference are **derived** from REFORGE rules. Each needs your approval (§8). Every component keeps its props, roles, labels, states and sizes (44 pt minimum).

| Family | Target |
| --- | --- |
| **Sheet** (derived, D1, D2) | <ul><li>**Panel:** near-black (`cardBg`) with a hairline top border, the faint top sheen and a 22 pt top radius (the tab bar's raised-panel radius).</li><li>**Grabber:** kept.</li><li>**Header:** the title in the condensed uppercase display face (D2), up to two lines.</li><li>**Close:** a bordered square, 44 pt.</li><li>**Body:** 12 pt rhythm at the 16 pt margin.</li><li>**Footer:** pinned above a hairline, with the gradient call to action.</li><li>**Unchanged:** backdrop, fade (none with Reduce Motion), no swipe-to-dismiss, keyboard avoidance, 90% maximum height.</li></ul> |
| **Menu** (derived, D1) | <ul><li>The actions on a bordered near-black card with hairline dividers and 56 pt rows.</li><li>Icons in the text colour, destructive in the error colour and last.</li><li>The menu title as a letter-spaced overline.</li><li>Cancel on its own card.</li></ul> |
| **Information sheet** | The sheet above, with paragraphs in REFORGE body text |
| **Buttons** (D3) | <ul><li>**Primary:** ember gradient, radius 10, 54 pt (48 compact), 17 pt bold label.</li><li>**Secondary:** neutral outline.</li><li>**Destructive** (derived): outline and label in the error colour.</li><li>**Text** (derived): ember label, no fill (neutral: secondary text colour).</li><li>**Disabled:** 40%, as today.</li><li>**Pressed:** 0.98 scale, off with Reduce Motion (the REFORGE rule).</li></ul> |
| **Icon buttons** | Secondary text colour, ember when selected; the sheet close control as a bordered square |
| **Lists** (D5) | <ul><li>**Section title:** a letter-spaced label above a bordered card, with inset hairlines between rows.</li><li>**Rows:** 17 pt bold title with the subtitle below, **ember leading icons**, value and chevron in the secondary colour, a raised fill when pressed.</li><li>**Kept:** information-only, disabled, trailing and destructive rows.</li></ul> |
| **Text** | Same sizes; REFORGE colours and +2.2 overline tracking; the accent tone becomes the brighter ember |
| **Fields** | Near-black fill, hairline border, radius 8, label above. Focus: a 1 pt ember border. Error: a 1 pt error border with the message below (announced as today) |
| **Chips and segments** (D4) | <ul><li>**Bordered pills and track;** the chosen one with an ember tint, ember border and ember label.</li><li>**Segments keep their large-text layout,** with a check on the chosen option when stacked.</li></ul> |
| **Choices** | REFORGE option cards (already `ForgeChoices`) |
| **States** | Empty, progress and card in their REFORGE versions; "Opening FORGE…" on the REFORGE background |

## 7. Behaviour that must not change

These are the components' contracts. 7.6B–7.6E change appearance only, apart from D6 (haptics).

- **Sheets:**
  - **Closing:** the close control, Android back and the VoiceOver escape gesture close a sheet. A backdrop tap closes only sheets that opt in.
  - **Unsaved input:** with it, every close path asks before discarding. Saving hides the sheet directly.
  - **Screen readers:** focus moves to the title once the sheet is open, the sheet is announced as modal, and nothing behind it is reachable.
  - **iOS sequencing:** `onDismiss` lets the next sheet or alert open only after this one has gone.
- **Menus:** the chosen action runs exactly once, after the menu has closed. On iOS it waits for the dismissal, with a fallback timer. A second tap while closing is ignored. Disabled items stay inert. Roles are menu and menu item.
- **Fields and numbers:**
  - The label is the spoken name.
  - Errors go in the hint, in a polite live region, and are announced together on iOS.
  - Numbers accept comma or point decimals, are applied as soon as they're valid, and an out-of-range error is shown, never applied.
- **Segments, chips and choices:** tab, button and radio roles with their selected and checked states; 44 pt targets; segments wrap, then stack, at large text sizes.
- **Text:** uppercase text is read in natural case; Dynamic Type caps on headings and hero numbers.
- **Buttons:** role, label, disabled state, 40% disabled appearance in the variant's own colour.
- **Progress:** the progress-bar role and its value, with no animation under Reduce Motion.

**Tests that hold these contracts:**

- [design-system.test.tsx](../../tests/ui/design-system.test.tsx): menus, backdrop rules, unsaved input, spoken labels, sheet header and Dynamic Type.
- Feature suites: [unsaved-input](../../tests/ui/unsaved-input.test.tsx), [decimal-input](../../tests/ui/decimal-input.test.tsx), [fields](../../tests/ui/fields.test.tsx), and every screen suite that opens a sheet or menu. "Close" appears in 31 test files and "Discard changes" in 8.

**Tests that pin DS 2.0 looks** (to update in 7.6B, D10): [design-system.test.tsx](../../tests/ui/design-system.test.tsx) lines 56, 61 and 68 (button colours) and 157 and 161 (the 20 pt chip margin), plus its development-screen render test.

**Unaffected:** the token tests ([design-tokens](../../tests/design-tokens.test.ts), [reforge-tokens](../../tests/reforge-tokens.test.ts), [wp6-contrast](../../tests/wp6-contrast.test.ts)) assert token values, which don't change.

## 8. Decisions for founder approval

Recommended option first.

| # | Decision | Options | Needed before |
| --- | --- | --- | --- |
| **D1** | Floating surfaces: sheets, menus and information sheets as specified in §6. There's no reference for them, so this is a derived design, as Train was (Phase 7.0 D28) | **Approve the §6 spec; review it on the phone before committing 7.6B-1** · ask for alternatives first | 7.6B-1 |
| **D2** | Sheet titles | **Condensed uppercase (as on REFORGE secondary screens and exercise titles), up to two lines** · mixed-case bold 20 pt (calmer for long food and template names) | 7.6B-1 |
| **D3** | Button mapping, including two derived variants: destructive as an error-colour outline ("Remove set" today), text buttons in ember | **Approve** · keep DS 2.0 text and destructive buttons | 7.6B-2 |
| **D4** | Selection colour for chips and segments: ember tint instead of the white pill and grey segment. **Visible on approved screens** that still use the shared controls: Exercise Library filters, program Start date and Days a week, logger Set type and Side, the custom exercise form | **Approve (the REFORGE rule)** · keep the white and grey selection | 7.6B-4 |
| **D5** | Lists: ember leading icons and bold titles in every grouped list (Backup, Finish, Train, Paths, Templates) | **Approve** · keep grey icons | 7.6B-3 |
| **D6** | Haptics (Phase 7.0 D27a): typing text or numbers stops buzzing on every keystroke; discrete actions keep their haptics. **A behaviour change** | **Approve** · keep | 7.6C-3 |
| **D7** | First-run profile steps restyled on `EntryFrame` and REFORGE controls, with no field, order or flow change. This is Engineer #2's onboarding seam (Phase 9 X13): they should be told before 9.2 starts | **Approve, in 7.6C, and notify Engineer #2** · leave onboarding visuals to Phase 9.2 | 7.6C-2 |
| **D8** | Light mode (reaffirms Phase 7.0 D5): parity through the mapped light palette, AA-checked; no separate light design | **Reaffirm** · design a full light mode later | 7.6D |
| **D9** | Confirmations stay native alerts (platform look, accessible) | **Keep native** · custom REFORGE dialogs (more work, accessibility risk) | 7.6B |
| **D10** | Update the five test assertions that pin DS 2.0 looks (§7); behaviour assertions unchanged (as Phase 7.0 D27) | **Approve** | 7.6B |
| **D11** | Clean-up in 7.6E: remove the dead code in §4.5, and merge each REFORGE twin into one implementation (`ForgeSegments`, `ForgeChips`, `ForgeChoices`, `ForgeField`, `ForgeNumberField`, `ForgeListRow`) | **Approve** · keep both | 7.6E |
| **D12** | Documentation: [REFORGE_FOUNDATION.md](../redesign/REFORGE_FOUNDATION.md) becomes the single design-system specification, with the derived sheet, menu and button specs; [DESIGN_SYSTEM_2.md](../redesign/DESIGN_SYSTEM_2.md) is marked superseded and kept for history | **Approve** · write a new `DESIGN_SYSTEM_3.md` | 7.6E |

**Optional:** store the approved Home and Train references in `docs/redesign/reforge/references/` (unaltered, with their SHA-256), so the 7.6E fidelity review can compare all five tabs.

## 9. Implementation sequence

Each sub-stage follows the same pattern:

1. Implement.
2. Show the result in the development design-system screen, in both palettes.
3. Run the full checks: TypeScript, ESLint, Prettier, the logic and UI suites, the catalogue checks and both exports.
4. You review it on the iPhone in Expo Go.
5. Commit only after your approval.

There are no new dependencies (the gradient uses the existing `react-native-svg`; the condensed face is already bundled). No data, sync, account, Forge Paths, nutrition or progress logic changes.

| Stage | Scope | Why this order | Size |
| --- | --- | --- | --- |
| **7.6B-1 Floating surfaces** | `Sheet`, `SheetHeader`, `OverflowMenu`, `InfoSheet`, `InfoButton` (D1, D2, D9) | The most visible gap: 58 surfaces, opened from every tab. Behaviour code untouched | M |
| **7.6B-2 Actions and text** | `Button`, `TextButton`, `IconButton`, `BackButton`, `Txt`, `Label` (D3) | Sheet footers and rows use them. Text keeps its sizes, so layouts don't move | M |
| **7.6B-3 Lists, cards, states** | `ListRow` (full API kept), `ListSection`, `Card`, `ProgressBar`, `Empty` (D5) | Grouped lists in Backup, Finish, Train, Paths, Templates | S–M |
| **7.6B-4 Inputs** | `Field`, `NumberField`, `Chips`, `FilterChips`, `SegmentedControl` (large-text layout kept), `Choices` (D4) | The most behaviour-sensitive (validation, announcements, large text), so last, with the most tests | M |
| **7.6C-1 Legacy feature surfaces** | `FinishSheet`, `ReorderSheet`, `ExercisePicker`, `DateSheet`, `Stepper`/`LoadControl`/`NumberControl`; the residual direct styling (§5) | After 7.6B they are mostly converted; this removes what a central pass can't reach | M |
| **7.6C-2 Entry and system screens** | First-run profile steps (D7), crash recovery, Page not found, "Opening FORGE…" | First impressions and rare-but-important screens | M |
| **7.6C-3 Haptics and motion** | D6; one press feedback for every REFORGE control, off with Reduce Motion; sheets keep their fade | The only behaviour change, isolated in its own commit | S |
| **7.6D Accessibility, small screens, light mode** | <ul><li>**Automated, for every converged component:** largest text sizes at 320, 375 and 393 pt widths (no clipped labels, 44 pt targets), roles and states, contrast of every new colour pairing in both palettes (the contrast tests extended).</li><li>**Review:** a light-mode pass (D8).</li><li>**Your iPhone checklist:** VoiceOver on sheets and menus, Dynamic Type, Reduce Motion, light mode.</li></ul> | Verifies the whole converged set at once | M |
| **7.6E Fidelity review, clean-up, documentation** | <ul><li>One implementation per control (D11).</li><li>The dead code removed (D11).</li><li>REFORGE_FOUNDATION as the single specification (D12).</li><li>IMPLEMENTATION_STATUS updated.</li><li>A final review of every tab and secondary screen against the references.</li></ul> | Closes Phase 7 | S–M |

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| **Wide reach:** a central change restyles about 50 files at once | Four sub-stages, each reviewed on the phone before it is committed; props and behaviour unchanged; the full UI suite (783 tests) on every sub-stage |
| **Sheet and menu sequencing on iOS** (an action that opens another sheet or alert) can't be fully shown in tests | No behaviour code changes; an iPhone check of "menu → sheet", "sheet → alert" and "Finish → summary" in 7.6B-1 |
| **Large text:** REFORGE segments and chips were drawn for one row | Keep `segmentLayout` and the chips' sideways scroll; tests at the largest text size on a 320 pt width (7.6D) |
| **Light mode:** new pairings (error outline on near-black, ember tint selection) aren't contrast-tested yet | Extend the AA contrast tests to every new pairing in both palettes before 7.6D sign-off |
| **Derived designs** (sheets, menus, text and destructive buttons) have no reference | Decisions D1–D3; review on the phone before committing |
| **Engineer #2** works on Phase 9 in parallel | <ul><li>No subscription file is touched.</li><li>Shared components keep their APIs, so new Phase 9 screens can't break.</li><li>The onboarding seam (X13) is touched only in 7.6C-2, after Engineer #2 is told (D7).</li><li>Phase 9 should build on REFORGE and the converged sheets.</li></ul> |
| **Performance:** the gradient on every primary button | Primary buttons appear once per sheet or screen, never per set row; the logger's set grid is not restyled beyond text colours |
| **No renderer here** | Every visual result is reviewed by you on the iPhone; nothing is claimed as visually verified |

## 11. Statements

- **Changed:** this document only. No code, test, dependency, configuration, branch or Supabase setting changed.
- **Reproducible:** the counts come from two read-only scripts kept outside the repository; they can be re-run at any commit.
- **Not checked on a device;** no screenshots were taken.
- **Not touched:** Phase 9 files and the Phase 9 worktree.
