# FORGE Design System 2.0

The app's interior should match the splash: black steel, white type, a single ember. **One action. One number. One line.**

Status: **Phase 1 (foundations) committed; Phase 2 (workout logging) implemented, in review.** Screens adopt the system progressively; see [Roadmap](#roadmap).

- Tokens: [`src/theme.ts`](../../src/theme.ts)
- Primitives: [`src/components/ui.tsx`](../../src/components/ui.tsx)
- Composites: [`src/components/system.tsx`](../../src/components/system.tsx)
- Live reference (development builds): **You → Design system (development only)** (`app/design-system.tsx`)

## Tokens

### Color (dark first; light keeps parity)

| Token                           | Dark                              | Light                             | Use                                                                       |
| ------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| `bg`                            | `#0A0B0D`                         | `#F2F3F5`                         | App background                                                            |
| `surface`                       | `#141619`                         | `#FFFFFF`                         | Cards, grouped sections (tonal, no border)                                |
| `surfaceRaised`                 | `#1E2125`                         | `#E9ECF0`                         | Inputs, secondary buttons, pressed rows                                   |
| `selected`                      | `#33373E`                         | `#FFFFFF`                         | Selected segment                                                          |
| `hairline`                      | `#2A2E34`                         | `#D5DAE1`                         | Row separators, sheet grabber                                             |
| `text` / `text2` / `text3`      | `#F4F2EE` / `#A4A9B0` / `#6E747C` | `#111418` / `#4E5864` / `#6B7480` | Primary / secondary / tertiary text                                       |
| `ember`                         | `#F46B35`                         | `#C2410C`                         | **Only** the screen's primary action, selection indicators, live progress |
| `success` / `error` / `warning` | `#43B88C` / `#EE7A75` / `#E5AE58` | `#19724F` / `#A52C32` / `#8A5A00` | Completed sets / destructive / caution                                    |
| `successSubtle`                 | `#1B2D29`                         | `#E3EEEA`                         | Completed set rows (an opaque tint, so its contrast can be tested)        |

Light-mode ember shares dark ember's hue (17°), darkened to `#C2410C` for AA contrast. The earlier `#B83215` read brick red on device.

Disabled buttons keep their variant colours at 40% opacity, so an unavailable action still reads as a button and never as an empty field.

Contrast is enforced by `tests/design-tokens.test.ts` for both palettes:

- Text, secondary text and error text reach at least 4.5:1 on every surface.
- Tertiary text and ember reach at least 3:1. Tertiary text is for non-essential content only; placeholders use `text2`.
- The primary button label and the selected segment and chip reach at least 4.5:1.

Earlier color names (`background`, `elevated`, `muted`, `accent`, `border`, …) are aliases of these tokens. Existing screens therefore use the new palette without code changes.

### Typography (system font)

| Role       | Size / line                                        | Weight       | Tracking        | Use                                                   |
| ---------- | -------------------------------------------------- | ------------ | --------------- | ----------------------------------------------------- |
| `display`  | 28 / 32 compact · 32 / 36 standard · 34 / 40 large | 800          | −0.5            | The screen title (one per screen)                     |
| `title`    | 22 / 27                                            | 700          | −0.2            | Section and sheet titles, card heroes                 |
| `headline` | 17 / 22                                            | 600          | 0               | Row titles, exercise names                            |
| `body`     | 15 / 21                                            | 400          | 0               | Supporting text (one line where possible)             |
| `caption`  | 13 / 17                                            | 500          | 0               | Meta lines, units, field labels                       |
| `overline` | 11 / 14                                            | 700          | +1.6, uppercase | Section labels and screen context, echoing the splash |
| `metricXL` | 40 / 44 compact · 44 / 48 otherwise                | 700, tabular | −1              | Timers, hero numbers                                  |
| `metric`   | 22 / 26                                            | 600, tabular | −0.3            | Weights, reps, stats                                  |

`Txt` renders a role (`<Txt variant="metric">`). The earlier `Label` snaps arbitrary sizes onto these roles (≤11 overline, ≤13 caption, ≤16 body, ≤19 headline, ≤24 title, larger display). This replaces the 17 sizes in use before. Numeric inputs use tabular figures.

#### Responsive and accessible text

- **Size classes** (`sizeClass` in `src/theme.ts`) follow iPhone logical widths:
  - **compact:** under 390 pt (iPhone SE, 12/13 mini);
  - **standard:** 390–427 pt (iPhone 13–17, Pro);
  - **large:** 428 pt and wider (Plus, Pro Max).
- **Only `display` and `metricXL` respond to the size class.** Every other role is the same on all devices.
- **Screen titles** fit within two lines. On tight widths they shrink slightly (to 80% at most) instead of clipping.
- **Dynamic Type** scales all text. Growth is capped only for `display` (1.3×), `metricXL` (1.2×), `title` and `metric` (1.5×), so headings and hero numbers stay on screen. Body, caption, headline and overline text scale without a cap.
- **Uppercase is visual only.** Overline text keeps its source spelling for screen readers. All-caps source strings ("NEXT SESSION") are spoken in sentence case ("Next session"). A `Stat` is read as one element, for example "12 Working sets".

### Space, shape, size, elevation

- **Spacing:** a 4 pt grid. Screen margin `20`, section gap `32`, group gap `12`, row padding `16`.
- **Radii:** control `12`, card `16`, sheet `24`, pill.
- **Minimum heights:** primary `54`, control `48`, compact and text `44`, row `56` (`64` with a subtitle). Every tap target is at least 44 pt.
- **Elevation is tonal.** Only sheets and menus float (`elevation.floating`) above a scrim. No borders on surfaces.

## Components

| Component                      | Where  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screen`                       | ui     | 20 pt margins, safe areas, keyboard avoidance and interactive dismissal. Overline context plus a `display` title (announced as a header)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Txt`, `Label`                 | ui     | Role-based text; `Label` is legacy-compatible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Button`                       | ui     | `variant`: `primary` (flat ember, one per screen), `secondary` (tonal), `text`, `destructive`. Legacy `secondary` and `danger` props still work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `TextButton`, `IconButton`     | ui     | Low-emphasis inline actions; icon actions always carry a spoken label and a 44 pt target. `filled` gives a circular tonal background                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Card`                         | ui     | Tonal surface; `compact` for dense content, `raised` inside other surfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Field`, `NumberField`         | ui     | Tonal input, ember focus ring, error text; tabular numerals for numbers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Chips` / `FilterChips`        | ui     | Pills with inverted selection (text-coloured pill). `FilterChips` bleeds to the screen edge; pass `bleed` inside cards                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SegmentedControl`             | ui     | 2–5 exclusive options, exposed as tabs with selection state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Choices`                      | ui     | Descriptive radio options (onboarding, profile)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Stat`, `ProgressBar`, `Empty` | ui     | Tabular stat; 6 pt ember bar; quiet empty state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Sheet`, `SheetHeader`         | ui     | Grabber, `title` heading, circular × labelled "Close", scrollable body, optional pinned `footer` for the sheet's single action. The ×, Android back and the VoiceOver escape gesture close it. **Tapping the backdrop closes only sheets that pass `dismissOnBackdrop`.** Use it for information and action lists. Never use it for sheets holding form input or confirmations, so a stray tap cannot discard work. **Pass `unsaved` while a form holds changes.** Every close path then asks "Discard changes?" ("Keep editing" / "Discard"). Saving hides the sheet directly, so it never prompts. Sheets have no swipe-to-dismiss gesture |
| `ListRow`, `ListSection`       | system | Grouped rows (title, subtitle, value, icon, chevron, destructive) on one surface with hairlines. They replace navigation buttons                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `OverflowMenu`                 | system | "•••" opens an action list: non-destructive first, destructive last in red, disabled states, and Cancel. The chosen action runs **once, after the menu has closed**, so it can open a sheet, a confirmation or a screen. On iOS it waits for the menu's dismissal event (with a 700 ms fallback) because iOS cannot present a new modal while one is still closing. Repeat taps and re-opening while an action is pending are ignored                                                                                                                                                                                                        |
| `InfoButton`, `InfoSheet`      | system | Educational and methodology text one tap away instead of inline paragraphs. Information sheets close on a backdrop tap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Usage rules

1. **One ember fill per screen:** the dominant action. Everything else is tonal or text.
2. **Navigation is a `ListRow`, not a button.** Infrequent actions go in an `OverflowMenu`. Critical logging actions stay visible.
3. **At most one supporting line per block.** Explanations go behind `InfoButton`, and nothing is deleted.
4. **Headings are factual labels** ("Progress", "This week"), not slogans. FORGE branding comes from type, color and the overline rhythm.
5. **Numbers use `metric`/`metricXL`** (tabular).
6. **Swipes and long-presses may supplement visible actions,** never replace them.
7. **Every control has a spoken label** and a target of at least 44 pt. Dynamic Type scales text within the limits above.
8. **Ember is for primary actions, selected progress and meaningful emphasis.** Selected filter chips are white pills with dark text.

## Phase 1 changes to existing screens

Foundations only; no screen was restructured.

- **All screens:** the new palette, type scale, tonal surfaces without borders, button variants, field focus states and the v2 sheet header come through the shared components. Screen titles are responsive.
- **Progress, Forge Paths and Explore:** the chip rows that sat directly on the screen became `FilterChips`, so they run edge to edge instead of clipping at the margin. The chip rows inside Progress cards bleed to the card edge, and Explore uses the standard 20 pt margin.
- **Existing Path (LegacyPath):** "Manage your Path" and "Workout options" are action lists, so they close on a backdrop tap. Their pause, resume and skip actions still ask for confirmation. "Reschedule session" holds input, so it does not close on a backdrop tap.
- **Forms never lose input silently.** Only × or back closes the template editor, journal entry, preferences and Reschedule sheets, and once they hold changes, closing asks "Discard changes?" first.
  - Template editor: compares against its opening state, so reverting an edit leaves nothing to discard.
  - Journal entry: asks after any edit.
  - Preferences: uses the form's own change tracking.
  - Reschedule: asks when the date has changed.
  - Exercise picker: no prompt; its search box is navigation, not work.
  - Workout screen: no prompt needed. The name, notes and sets save as you type, and the full-screen workout can't be swiped away. Android back leaves the workout active and resumable.
- **You:** a development-only "Design system" entry opens the live reference.

## Device QA plan

Automated tests cover tokens, contrast, responsive roles, sheet dismissal and the menu's ordering and single-run behavior. The following needs physical devices (Expo Go). The **Device QA** section of the design-system reference shows the viewport, size class and text-size multiplier, plus a "Menu chaining" test menu with a run counter.

| Device class | Example                      | Check                                                                                                        |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Compact      | iPhone SE (3rd gen), 13 mini | Screen titles fit on two lines or fewer; chip rows scroll; sheets fit with the keyboard open; tab bar labels |
| Standard     | iPhone 15/16/17              | Baseline review of every screen in dark and light                                                            |
| Large        | iPhone 16/17 Pro Max         | Title scale (34 pt) and line lengths look intentional                                                        |

On each device:

1. **Menu chaining.** Each action opens its sheet, confirmation or screen exactly once, and the run counter increases by one per action. Fast double taps run nothing extra.
2. **Sheets.** Information sheets close on a backdrop tap. The input sheets ("Open sheet", Reschedule) do not, and their text survives a backdrop tap. After typing, ×, Android back and the VoiceOver escape gesture each ask "Discard changes?". "Keep editing" keeps the text.
   - Also check Workout options → Move: the actions sheet closes and Reschedule opens immediately. This flow predates Phase 1; if Reschedule fails to appear on iOS, it moves to `OverflowMenu` chaining in Phase 4.
3. **Keyboard.** Fields stay visible above the keyboard in screens and sheets, and dragging the content dismisses the keyboard.
4. **Safe areas.** Content clears the notch or Dynamic Island and the home indicator. Sheet footers sit above the home indicator.
5. **Text size.** At Settings → Accessibility → Larger Text, check the default size, the largest standard size and AX3. Body text grows, titles stay on screen, and nothing clips.
6. **VoiceOver.** Overlines and stats read naturally ("Next session", "12 Working sets"); headers are announced; the escape gesture (two-finger Z) closes sheets.
7. **Light mode.** Set You → Edit profile & preferences → Appearance to Light. Contrast is verified automatically, but review surfaces, chips and sheets visually.
8. **Landscape.** The app is portrait-only (`app.json`), so landscape needs no check.
9. **Workout logger (Phase 2).** Start a curated program session, an existing Path session and a freestyle workout.
   - **Set grid:** the layout is wide on standard and Pro Max phones and compact on the SE or mini. Turn on Larger Text (AX sizes) to see the stacked layout. Numbers are never clipped and the grid never scrolls sideways.
   - **Keyboard:** tap a weight. The value is selected, the decimal pad shows, and the keyboard bar shows **Next/Done** (plus the rest countdown while resting). **Next** walks weight → reps → RIR → the next set. The focused input stays above the keyboard.
   - **Dock and rest:** completing a set starts the rest timer in the dock, and the dock stays visible while scrolling. +30 and Skip work. The rest notification arrives with the app in the background.
   - **Finish:** never covered by the keyboard bar or the home indicator. On Android it hides while typing.
   - **Set Details:** tap a set number. Change the set type (the W tag appears), side, RPE, tempo and notes, then remove a set.
   - **Menus:** every workout and exercise menu action opens its sheet or confirmation once.
   - **Resume:** leave mid-workout, then return from Train → Resume. Every value is kept.

## Phase 2 — Workout logging (implemented)

Goals: set rows reachable without scrolling past guidance; compact targets; inline RIR for program workouts; simple weight and rep entry; clear completion; persistent, unobtrusive rest timing; one clear finish control.

```
Header (sticky):  ‹  Lower A (Squat Strength)              32:14   •••
                     4 of 18 sets · 2,480 kg
Exercise card:    Back Squat                          1/4  ⌄   •••
                  4 × 4-6 reps · 2–3 RIR · rest 3–5 min
                  ⓘ Program note (2 lines, tap for the full note)
                  ↗ Increase to 102.5 kg            Apply  ⓘ   (only when useful)
                  SET  PREV     KG     REPS   RIR    ✓
                  1    100×6  [102.5]  [ 6 ]  [2-3]  ◯     (set number opens Set Details)
                  + Add set
Dock (sticky):    [⏱ 1:32  +30  ✕]  [          ✓ Finish          ]
iOS keyboard bar: ⏱ 1:32                              Next   Done
```

- **Files:**
  - Workout screen: `src/screens/Workout.tsx`
  - Exercise card: `src/components/WorkoutExerciseCard.tsx`
  - Set grid: `src/components/SetGrid.tsx`
  - Layout rules: `src/components/set-grid-layout.ts`
  - Display helpers: `src/domain/workout-display.ts`
- **Header:**
  - Back button, title and status, tabular clock (`4:05`, `24:00`, `1:04:00`) and the workout menu. The slogan title and the "Session details" panel are gone.
  - The title is the session name ("Lower A (Squat Strength)"); the full program name stays in the menu title and Train history.
  - Status is one short line: sets done and volume; "Paused" or "Lower-fatigue session" when relevant; "Completed Oct 20 · 9,635 kg" in review.
- **Dock:** the rest timer and the single primary action, **Finish**, announced to VoiceOver as "Finish workout". Finish keeps its confirmation and the "No completed sets" check.
  - The dock sits below the scrolling list, so it never covers content, and it clears the home indicator.
  - Completed sessions have no dock, and ticking a set while reviewing one never starts a rest timer or reminder.
  - **Paused:** a tonal **Resume** button replaces the rest timer beside Finish, so resuming never means searching the menu and Finish stays the only orange action.
  - On Android the list and dock move above the keyboard (Android draws edge to edge, so the window does not resize). Finish hides while typing; the rest timer stays. On iOS the keyboard covers the dock, and the keyboard bar shows the rest countdown.
- **Exercise card:**
  - Tapping the name expands or collapses the card; the first unfinished exercise opens first.
  - A one-line target, then the program note and your exercise notes (tap for the full text or to edit).
  - An advice row only when it changes or explains this session: a different suggested load, a lower-fatigue session, a performance check, or choosing a starting load. Assisted movements never get a load suggestion.
  - The advice icon follows the meaning: up for an increase, down for a reduction, repeat for "Stay at", plus distinct icons for lower fatigue, the performance check and choosing a starting load.
  - Target lines wrap only between segments, so "rest 3–5 min" never splits.
  - **Apply** changes only unfinished working sets.
  - **Progression sheet:**
    - **This session:** the action ("Increase the load"), the suggested load, the first sentence of the reason and **Apply suggested load**.
    - **How this is decided** expands to the full reason, the program's progression rules, the Path guidance or the lower-fatigue baseline.
    - The wording comes from the existing progression output; nothing is recalculated.
- **Set grid:** previous result (same set type, same order, from the last session of that exercise); weight and reps, or seconds and meters for duration and distance exercises; **inline RIR for curated programs and existing Paths** (placeholder shows the target RIR; saves to the existing `rir` field with the same 0–20 rule); and a completion check.
  - Completing a set tints the row, gives a light haptic and starts that set's rest, as before.
  - Freestyle and template workouts keep RIR in Set Details.
- **Set Details** opens from the set number. The dots under the number, or a W/D/F/L/R tag, show that it opens. It contains set type, side, RPE, RIR, rest, tempo, notes and **Remove set** (confirmed). Each field has its own full-width row.
- **Inputs:**
  - Number pad for reps; decimal pad for weight, RIR, seconds and meters.
  - The value is selected on focus.
  - Invalid entries are outlined in red, never saved, and explained to VoiceOver.
  - **Next** (iOS keyboard bar, Android return key) walks weight → reps → RIR → next set → next exercise.
  - The list scrolls the focused input above the keyboard.

### Responsive set grid

Column minimum widths at the default text size: set 32, previous 56, weight 64, reps 48, RIR 44, check 44, gaps 4. A grid measures itself and picks a layout (`setGridLayout`). The thresholds were checked on Android at 375, 393 and 430 dp, and with Android text size at 1.3×:

| Layout  | When                                                                            | Shows                                                         |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Wide    | Everything fits (every iPhone from the SE, 375 pt, up at the default text size) | SET · PREV · KG · REPS · RIR · ✓                              |
| Compact | Without PREV it fits (larger text, or a first-generation SE)                    | SET · KG · REPS · RIR · ✓, with "Previous 60×8" below the row |
| Stacked | Even that does not fit (largest text on small phones)                           | Set number, previous and ✓ on one line; labelled inputs below |

Numbers in inputs grow with Dynamic Type up to 1.4×. There is no horizontal scrolling, clipping or crushed numbers.

### Where everything went

| Earlier control                                                     | Now                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Back to tabs                                                        | ‹ in the header                                                                                       |
| Session details: name, notes, pause/resume                          | Workout menu → Rename workout, Workout notes, Pause/Resume workout                                    |
| Rest settings → default rest                                        | Workout menu → Default rest                                                                           |
| Make this repeatable → Save as template                             | Workout menu → Save as template (asks before discarding a typed name)                                 |
| Discard workout / Delete session                                    | Workout menu, last, in red, confirmed                                                                 |
| Exercise options: move, substitute, remove                          | Exercise menu → Move up/down (disabled at the ends), Substitute exercise, Remove exercise (confirmed) |
| Exercise options: notes, superset group, default rest               | Exercise menu → Notes, rest & superset                                                                |
| Exercise options: progression text, Next load, Apply suggested load | Advice row (when useful) and Exercise menu → Progression                                              |
| Optional set tracking (set chips + fields)                          | Tap the set number → Set Details                                                                      |
| "Previous:" line                                                    | PREV column, or the line under each set on compact layouts                                            |

Unchanged: progression calculations, RIR interpretation, prescriptions, scheduling, workout data, autosave and resume.

## Phase 3 — Today, Train and navigation (implemented)

Goals: Today and Train have distinct jobs. Today answers "what do I train next?" with one primary action; Train is the hub for every way to train; navigation has four tabs and no orange.

```
Today                          Train                          History
WEDNESDAY, OCT 22              Train                          ‹
Today                          PLAN                           12 WORKOUTS
┌───────────────────────────┐  ⛰ Forge Strength        ›     History
│ NEXT SESSION              │    Week 2 · 4 of 36 sessions   OCTOBER 2026
│ Lower A (Squat Strength)  │  🧭 Forge Paths           ›     Lower A           •••
│ Forge Strength · Week 2   │    18 curated programs           Tue, Oct 21 · 52 min · 9,635 kg
│ 📅 Suggested for tomorrow │  WORKOUTS                      Upper A           •••
│ [ ▶ Start early         ] │  ⊕ Empty workout          ›     …
└───────────────────────────┘    Push day   [Start]   ›     SEPTEMBER 2026
YOUR PLAN · THIS WEEK ·        ⧉ Workout templates   3  ›     …
RECOVERY · LAST SESSION        EXERCISES · HISTORY
```

- **Files:**
  - Today: `src/screens/Home.tsx`; next-session choice: `src/data/today.ts`
  - Train: `app/(tabs)/train.tsx`; plan row: `src/components/PlanRow.tsx`
  - History: `src/screens/History.tsx` (`/history`)
  - Exercise library: `app/explore.tsx` (moved out of the tabs; `/explore` links still work, `?search=1` focuses search)
  - Tabs and resume banner: `app/(tabs)/_layout.tsx`
  - Shared date and history lines: `src/domain/training-display.ts`
  - `Screen onBack` and `BackButton` (‹ for pushed screens); `Sheet onDismiss` (navigate only after an iOS sheet has closed)
- **Tabs:** Today · Train · Progress · You. The selected tab is white with a filled icon; the others are `text2` with outline icons. The resume banner above the tabs is a tonal row ("In progress" or "Paused", the session name, Resume ›) and is still announced as "Resume active workout". It shows on Train, Progress and You; on Today the hero already says Resume, so it is hidden there.
- **Today:**
  - The heading is **Today** under the date. The greeting, the Completed sessions and Day streak cards, the weekly ring and the motivational paragraph are gone; streak and session counts stay on Progress.
  - **Next workout**, in this order:
    1. The workout in progress: **Resume workout**.
    2. A session due today (program, then Path, then a planned template): **Start workout**.
    3. The next program or Path session, with its date ("Suggested for tomorrow" for programs, "Scheduled for Thu, Oct 24" for Paths): **Start early**. A missed Path session shows "Originally scheduled for …".
    4. Nothing planned: **Start workout** (freestyle) and the text action **Choose a Forge Path**.
  - Starting uses the existing program, Path and calendar start functions; nothing is rescheduled. After a program session is finished today, the next one is suggested from tomorrow. A planned template already trained today is not offered again. A paused Path offers no session.
  - Below: **Your plan** (one row to the program dashboard or Path), **This week** (sessions against the weekly goal and the Monday–Sunday dots), **Recovery** (check-in with today's readiness) and **Last session** (review) plus **Workout history**.
- **Train:** grouped rows only; no orange.
  - **Plan:** the current program or Path, and Forge Paths with the number of curated programs.
  - **Workouts:** Empty workout (disabled with "Finish your current workout first" while one is in progress; the banner resumes it), up to three templates, and Workout templates. Tapping a template opens its details (exercises, sets, reps, rest, notes, Start workout, Edit or schedule); the compact tonal **Start** begins it directly.
  - **Exercises:** Search exercises, Exercise library, Create custom exercise.
  - **History:** the three most recent workouts (tap to review) and All history.
- **History:** completed workouts grouped by month, newest first. Each row shows the session name (the full name is spoken and titles the menu), date, duration and volume; tapping opens the review. The row's ••• menu has **Repeat workout** and **Delete workout** (red, confirmed). Reached from Train, You → Training history, and Today's Last session.

| Earlier control                                          | Now                                                       |
| -------------------------------------------------------- | --------------------------------------------------------- |
| Explore tab                                              | Train → Exercise library / Search exercises               |
| Home program and Path cards (Start, Open)                | Today's next-workout hero and Your plan row; Train → Plan |
| Home Completed sessions, Day streak, weekly ring         | Progress (sessions, day streak); Today → This week        |
| Train Forge Paths, freestyle and template buttons        | Train rows; template Start; Today owns the primary action |
| Train full history cards (Review / edit, Repeat, Delete) | History rows (tap to review; ••• → Repeat, Delete)        |
| You → Training history (opened Train)                    | You → Training history (opens History)                    |

## Phase 4 — Forge Paths (implemented)

Goals: browse, compare, inspect and enroll in the 18 curated programs without scrolling through repeated workouts; one clear action per screen; a program dashboard that leads with what to do next.

```
Library /forge-paths            Details /forge-paths/[id]       Your program /forge-paths/current
‹                               ‹                               ‹
18 PROGRAMS                     INTERMEDIATE · STRENGTH         YOUR PROGRAM
Forge Paths                     Intermediate Strength · 4 Days  Intermediate Strength · 4 Days
YOUR PROGRAM  row ›             [ 3 days | 4 days | 5 days ]    Week 2 of 8 · Weeks 1–3 · Accumulation
┌ RECOMMENDED FOR YOU ┐         4 DAYS A WEEK  8 WEEKS  32      ▬▬▬───── 7 of 32 sessions
│ Intermediate Strength · 4 Days│YOUR WEEK  M T W T F S S       ┌ NEXT SESSION ────────────┐
│ ✓ reasons            │        PHASES ▬▬▬ ▬ ▬▬▬ ▬              │ Upper B · Suggested today │
│ [ View program ]     │        Weeks 1–3 · Accumulation  ›     │ [Standard|Lower fatigue]  │
└──────────────────────┘        WORKOUTS  Lower A · 6 ex.   ⌄   │ 6 exercises           ⌄   │
STRENGTH                        ABOUT  How progression works ›  │ [ ▶ Start session ]       │
Beginner Strength  3, 4 or 5 › ─────────────────────────────── │ Skip this session         │
MUSCLE BUILDING                 [ ▶ Start program ]  (pinned)   COMING UP · RECENT · PROGRAM
```

- **Files:**
  - Screens: `src/screens/programs/Library.tsx`, `Details.tsx`, `Dashboard.tsx`; routes in `app/forge-paths/` (`index`, `[programId]`, `current`). The `/forge-paths` link is unchanged.
  - Components: `src/components/programs.tsx` (stats, week strip, phase timeline and sheets, expandable workouts, exercise lines).
  - Presentation (read-only): `src/domain/programs/presentation.ts` (families, distinct workouts, phase timeline, prescription lines).
  - Shared: `Screen footer` (pinned action above the home indicator and keyboard) and `useAfterSheet` (run navigation or an alert after a sheet closes; Train's template sheet uses it too).
  - Existing Path: `src/screens/LegacyPath.tsx` (light restyle).
- **Navigation:** Train → Forge Paths opens the library. Today's and Train's **Your program** row opens the dashboard directly; an existing generated Path still opens `/paths`. Library → Details pushes; back returns. Starting a program returns to the dashboard (`dismissTo`), so back from the dashboard reaches the library or the tab you came from. Screens opened from a link fall back to Train, the library or Today.
- **Library:**
  - The heading is **Forge Paths** with the program count; no slogan or "Back to Train" button.
  - **Your program** or **Your Path** row first, when there is one.
  - **Recommended for you:** the exact program for the lifter's experience, goal and weekly workout goal, its facts and the reasons. **View program** is the screen's one orange action. Incomplete profile and no-match states are kept.
  - **Families:** Strength and Muscle Building sections with Beginner, Intermediate and Advanced rows ("3, 4 or 5 days · 8 weeks"). A family opens the recommended program, or the variant closest to the lifter's weekly goal. Authored summaries (which contain internal codes) are not shown in the list.
  - Development builds keep the draft preview.
- **Details:**
  - The title is the program's own name. **3 / 4 / 5 days** switches between the family's distinct authored programs; nothing is adapted.
  - Stats (days a week, weeks or "Ongoing", workouts), **Your week** with the rest day marked and the suggested days, and the rest-day sentence.
  - **Phases:** a proportional bar and one row per phase with primary effort and any planned volume reduction ("RIR 1–3 · about 30% fewer working sets"). A phase opens its notes, effort by lift type and the lower-fatigue details.
  - **Workouts:** each distinct workout once, collapsed to "name · N exercises"; expanding shows every exercise with sets × reps, per side, role, rest and notes.
  - **No-loss safeguard:** workouts are only combined when every authored field is identical (exercises, order, sets, reps, rest, role, loading, notes, names). If any phase changes anything, every version is listed with the phases that use it, and the footnote says so. Tests cover this for all 18 programs and for deliberate changes to reps, sets, rest, exercise, notes, order and added exercises.
  - **About:** How progression works and About this program (summary, description, equipment, version) are information sheets.
  - **Start program** is pinned. Its sheet keeps Today / Tomorrow / Next Monday, shows the suggested days and, if a plan is active, that it will be archived; confirming still asks **Replace your current plan?**. The current program shows **Open your program** instead.
- **Your program:** week and phase, progress; **Next session** (overline, name, week and phase, suggested date matching Today, Standard / Lower fatigue when available with its explanation, the planned-reduction note, collapsed exercises with the sets that will be used, **Start / Resume session**, **Skip this session**); Coming up (three); Recent sessions (three, with **All program sessions** in a sheet; completed rows open the review, skipped rows have **Restore**); Program (Program details, Browse programs, End program in red, confirmed). Complete and unavailable-version states are kept.
- **Existing Path:** the Path's name as the title with a back control; readable dates ("Mon, Oct 12") instead of ISO dates; day cells with labelled icons (completed, in progress, missed, skipped, planned, rest) instead of "✓ ! ↷ –" glyphs and orange borders; the session card uses Today's wording ("Scheduled today", "Next session", "Missed session", "Originally scheduled for …") and opens on the same session Today offers. Manage Path and Earlier Paths are rows. Calendar logic, start, pause, resume, skip, restore, reschedule and read-only earlier Paths are unchanged.

Unchanged: the 18 programs and their publication fingerprints, enrollment, scheduling, progression, workout tracking, history, sync and backups.

## Roadmap

| Phase                                | Scope                                                                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Foundations                      | **Done:** tokens, primitives, composites, reference screen, tests                                                                                                 |
| 2 · Workout logging                  | **Done:** see above                                                                                                                                               |
| 3 · Today, Train, navigation         | **Done:** see above                                                                                                                                               |
| 4 · Forge Paths                      | **Implemented, in review:** see above                                                                                                                             |
| 5 · Progress, You, secondary screens | Grouped settings, info sheets for methodology and privacy, Templates, Journal, Account, Exercise                                                                  |
| 6 · Onboarding visuals and polish    | Motion, haptics, light-theme parity, Dynamic Type and VoiceOver, device QA (compact, standard and large iPhones, keyboard, safe areas, landscape where supported) |
