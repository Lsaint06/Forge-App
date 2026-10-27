# REFORGE foundation (Phase 7.1A)

This is the premium presentation layer for the five approved references. It is **additive and opt-in**: Design System 2.0 tokens and components ([DESIGN_SYSTEM_2.md](DESIGN_SYSTEM_2.md)) keep their values, so screens not yet transformed look as they did. Screens adopt REFORGE components as each phase transforms them (Home in 7.1B).

- **Plan and measurements:** [PHASE_7_0_REFORGE_ARCHITECTURE.md](../audits/PHASE_7_0_REFORGE_ARCHITECTURE.md)
- **Tokens:** [src/theme.ts](../../src/theme.ts), in the REFORGE palette keys, `forgeText`, `forge` and `DISPLAY_FONT`
- **Components:** [src/components/reforge/](../../src/components/reforge/index.ts)
- **Live reference (development builds):** You → Design system → *REFORGE foundation*
- **Assets and licences:** [reforge/ASSETS.md](reforge/ASSETS.md)

## Navigation

There are five tabs: **Home · Train · Nutrition · Progress · You**. Route names are unchanged (`index`, `train`, `progress`, `profile`); `nutrition` is new.

| Element | Treatment |
| --- | --- |
| Tab bar | A raised panel (`tabBar`) with 22 pt top corners and a hairline border. Line icons. The selected tab's icon and label are solid ember, and the label is bolder, so selection never relies on colour alone. A faint halo (`emberGlow`, 20% dark / 11% light) sits behind the selected icon only, confined to a 44 × 32 pt box. Each target is at least 56 pt tall; the bottom safe area is respected |
| Resume strip | While a workout is in progress, a strip with an ember outline appears above the tabs on every tab except Home |
| Nutrition tab | Renders the existing Nutrition screen (`<Nutrition tab />`) with no Back control. `/journal?kind=nutrition` still opens the same screen, with Back; when nothing is underneath it, Back lands on the tab. You → *Nutrition log* and Progress → *Nutrition* switch to the tab |

## Colour (dark / light)

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `cardBg` | `#0C0D0F` | `#FFFFFF` | Card fill |
| `cardBorder` | `#26282B` | `#D5DAE1` | 0.5 pt card hairline |
| `cardRaised` | `#15171A` | `#F2F3F5` | Tiles, chips, inputs inside cards |
| `cardDivider` | `#1E2023` | `#E3E7EC` | Card header rule, strip dividers |
| `emberHot` | `#F47522` | `#C2410C` | REFORGE accent: overlines, icons, selected tab, progress |
| `emberTop` → `emberBottom` | `#F77620` → `#D8511F` | `#CC4A10` → `#B23A0A` | Call-to-action gradient; the label is `onEmber` |
| `emberMuted` | `#B2581D` | `#D0612A` | Active card outline |
| `emberTint` / `emberTintStrong` | `#2A1408` / `#4E1F0A` | `#FDF0E8` / `#F8D9C6` | Selected fills, ring track |
| `positive` | `#4ADE80` | `#19724F` | Changes that are unambiguously good |
| `tabBar` | `#0C0E0F` | `#FFFFFF` | Tab bar panel |
| `sheen` / `emberGlow` | rgba | rgba | Card top-light; selected-tab glow |

All pairs are AA-tested in [tests/reforge-tokens.test.ts](../../tests/reforge-tokens.test.ts):

- text and `emberHot` reach at least 4.5:1 on every surface;
- the CTA label reaches at least 4.5:1 at both gradient stops;
- outlines reach at least 3:1.

## Type

**Body text stays in the system face.** Condensed uppercase titles use **Barlow Condensed** (SIL OFL), via `FText`:

- the variants with a `display` cut;
- loaded in the background by [src/fonts.ts](../../src/fonts.ts), which never delays startup or the intro;
- shown in the system face at the same size and weight until the font has loaded.

| Role | Size / line | Notes |
| --- | --- | --- |
| `heroTitle` | 26 / 30 / 32 by size class | Barlow Condensed ExtraBold, uppercase; growth capped at 1.3× |
| `displayLabel` | 22 / 24 | Barlow Condensed Bold, uppercase |
| `screenTitle` / `greeting` | 30 / 36 · 26 / 32 | System 800 / 700 |
| `subtitle` · `cardTitle` · `body` · `label` | 16 · 17 · 15 · 13 | Scale fully with Dynamic Type |
| `overline` | 11 / 14, +2.2, uppercase | Card headers; spoken in natural case |
| `tagline` | 8 / 10, +3.2, uppercase | Decorative brand line, hidden from screen readers |
| `heroMetric` · `cardMetric` · `statMetric` | 44 · 24 · 20, tabular | |
| `button` · `tabLabel` | 17 · 11 | |

## Layout

| Token | Values |
| --- | --- |
| Margin | 16 |
| Card gap | 12 |
| Card padding | 16 |
| Radii | card 8, tile 8, CTA 10, tab bar 22 |
| Borders | card 0.5, active 1 |
| Heights | CTA 54, button 48, compact 44, tab 56 |

The minimum heights apply even where a reference draws a smaller control (Phase 7.0 §3.2).

## Components (`src/components/reforge`)

| Component | Purpose |
| --- | --- |
| `ForgeScreen` | Tab frame: background glow, `BrandHeader`, scrolling cards at the 16 pt margin, optional pinned footer |
| `BrandHeader`, `Wordmark` | Vector wordmark (2 KB, steel gradient) and brand line; header controls on the right |
| `ForgeCard` (`default` / `active` / `raised`), `CardHeader` | Hairline panels. The header is a heading, or a button with a chevron when it navigates |
| `HeroCard` | Right-hand artwork with scrims and a decorative tagline; without artwork, a graphical ember glow |
| `CtaButton`, `OutlineButton` (`ember` / `neutral`), `SquareIconButton` | Gradient primary action, outline actions, bordered icon control (44 pt minimum) |
| `Metric`, `StatStrip` | Value, unit, label and optional delta text, read as one element. Strips wrap to two columns, then one |
| `Tile`, `InfoChip`, `BadgePill`, `SectionLabel` | Small panels, facts, an ember pill, letter-spaced section labels |
| `ForgeListRow` | Navigation row from the You reference's *Tools & Settings*: ember icon, bold title with its description beside it (below when space is short), optional value, chevron; 56 pt. Rows sit in a `ForgeCard` with no padding (Phase 7.2B). `destructive` draws an irreversible action in the error colour without a chevron (7.2C) |
| `RowDivider` | The inset hairline between rows of a list card (7.2C) |
| `ForgeSubHeader`, `ForgeTopGlow` | The secondary-screen heading and top glow on their own, for screens that scroll a virtualised list (the Exercise Library) instead of a `ForgeSubScreen` (7.2C-3C) |
| `ForgeSegments` | Bordered segmented switch with the chosen segment in ember; 44 pt tabs with `tab` semantics. The shared `SegmentedControl` is unchanged (C5) (7.2C-3C) |
| `ForgeSearchField` | Raised, bordered search input with a search icon and a 44 pt clear control (7.2C-2; reused by the Exercise Library) |
| `ForgeSubScreen`, `ForgeEmpty` | Frame for pushed screens: 44 pt Back, overline, condensed `heroTitle` heading (up to three lines), optional pinned footer; no brand header (founder decision C1). `ForgeEmpty` is the matching honest empty state (7.2C) |
| `ForgeProgress`, `ForgeRing` | Progress bar and ring with `progressbar` semantics |
| `Gradient` | Linear or radial SVG gradient layer (react-native-svg; works in Expo Go). react-native-svg ignores a stop colour's alpha, so `Gradient` moves it into `stopOpacity` (`stopPaint`) |
| `artwork` | Registry of licensed artwork slots (empty until 7.1B) |
| `stripColumns`, `pairFits` | Pure responsive rules |

Components never compute metrics: deltas and values are display text supplied by the screen.

**Worklets.** Code inside `useAnimatedStyle` and other worklets runs on the UI thread. It may only use inline maths or other worklets. Calling a plain module function there crashed the Design System screen on iPhone in 7.1A. [tests/worklets.test.ts](../../tests/worklets.test.ts) compiles every source file that contains worklets with the app's Babel preset and fails on such a call.

## Home (Phase 7.1B)

[Home.tsx](../../src/screens/Home.tsx) follows the approved Home reference. It is built from these primitives plus [home/sections.tsx](../../src/screens/home/sections.tsx) and a read-only model ([home/model.ts](../../src/screens/home/model.ts)). Every value comes from existing code; Home adds no metric.

| Reference | FORGE source |
| --- | --- |
| Wordmark and brand line | `BrandHeader` with "BUILT THROUGH DISCIPLINE" |
| Notification bell | Omitted: FORGE has no notification centre |
| Streak pill | `summary().streak` (consecutive days with a completed workout, as on Progress); opens Progress |
| Greeting | Time of day and the profile's first name |
| Subtitle | Static line from the reference |
| Date | Today |
| "Week 8 · Build Phase" | The current plan's week and phase (program phase name without its week range; Path Foundation/Evolution). Opens the plan |
| Readiness strip | Today's recovery check-in exactly as recorded: self-rated readiness word, sleep, soreness, energy. No score; **HRV is not shown** (no data). Without a check-in: "How are you today? · Check in". Opens Recovery |
| Today's session | `nextSession()`, unchanged, in all seven states. Exercise count and program level where known. The "…" menu lists existing destinations only. The "~60 min" chip and pager dots are omitted (no data) |
| Progress snapshot | Latest weigh-in (else profile weight) with its date; this week's volume (Monday–Sunday), in Progress's compact form above 10,000 ("12.5k", spoken in full); day streak; this week's sessions against the weekly target, with days trained. **No comparison percentages.** Opens Progress |
| Nutrition today | Today's totals; the ring and macro bars against targets only once they are the lifter's own. Opens the Nutrition tab |
| Next target | Goals' own evaluation (`evaluate`): name, state, current value, target, progress bar. Opens Goals |
| Below the reference | Last session (review) and Workout history |

**Next-target rule** (`nextTarget`):

1. Among active target goals (not weekly habits) with measured progress that are not yet reached, show the one closest to its target.
2. Otherwise, show the newest active goal with a recorded value.
3. Ties go to the most recently created goal.
4. With no such goal, show "No active target" and a *Set a goal* button.

**Responsive rules:**

- The snapshot and nutrition cards sit side by side only where both fit: `pairFits(content, fontScale, 170)`, which means standard and large iPhones at default text size. Otherwise they stack, with the ring beside the macros.
- The hero's decorative tagline appears only with at least 340 pt of content and text no larger than 1.2×.
- Strips wrap to two columns.

**Artwork:** `homeSession` and `homeTarget` have no approved artwork yet, so the hero and target cards show the graphical ember glow ([reforge/ASSETS.md](reforge/ASSETS.md)).

## Active workout (Phase 7.2A)

[Workout.tsx](../../src/screens/Workout.tsx) follows the approved Train reference, which shows the active workout rather than the Train hub. The frame is built from [workout/sections.tsx](../../src/screens/workout/sections.tsx) and a read-only model ([workout/model.ts](../../src/screens/workout/model.ts)). Logging stays in [WorkoutExerciseCard](../../src/components/WorkoutExerciseCard.tsx) and [SetGrid](../../src/components/SetGrid.tsx); only their presentation changed.

| Reference | FORGE source |
| --- | --- |
| Wordmark and brand line | Top bar: back, `Wordmark`, the workout menu (bordered square). Bell and streak omitted inside the logger (D14, D22) |
| Plate photograph | `workoutHero` has no approved artwork: ember glow behind the top of the screen |
| "WORKOUT IN PROGRESS" | Overline for the state: in progress, paused, completed session or editing session |
| "PUSH — CHEST & BACK" | `workoutTitle(name)` in the condensed hero face, up to two lines |
| "Week 8 · Build Phase" | Program workouts: session week and phase; existing Paths: scheduled week and phase. Not a link (the logger is a full-screen modal). Absent for freestyle and template workouts |
| (not in the reference) | The existing status line, kept: sets done, volume, Paused, Lower-fatigue, Completed date |
| Session timer 32:18 | The live clock (`elapsedSeconds`, its own 1 s render) |
| "Est. time left ~27 min" | **Omitted** (no estimator, D21). Replaced by the session's start time |
| Pause (ember outline) | `pauseWorkout`. While paused the card shows a Paused badge and **Resume** takes the rest timer's place in the dock |
| Workout progress, "3 / 6 exercises", "50%" | Exercises with every set completed (D23: the reference's unit). Sets stay in the status line |
| Numbered exercise card, ember outline | The open exercise is `ForgeCard` `active`, with its number in an ember ring |
| "Barbell • Chest" | `Exercise.equipment` and `muscle`, then the existing target line (sets × reps, RIR, rest) |
| ⋮ and collapse chevron | The existing exercise menu (bordered square when open) and expand state |
| SET / WEIGHT (KG) / REPS / STATUS | The existing grid, **all columns kept**: SET / PREV / KG / REPS / RIR / ✓ in wide, compact and stacked modes |
| Bordered input boxes | Inputs are boxed. The set to log next is outlined in ember and focus is bright ember. Completed sets keep their values in an outline |
| Ember check discs | Completion is an ember disc with a check (D7); green is no longer used for completed rows |
| Rest timer ring beside the table | **In the dock** (D22): ring, "REST TIMER", remaining / full length, +30s and Skip. Beside the table it would force the grid out of its wide layout on every iPhone |
| Add set (full width) | Bordered full-width row; copies the last set as before |
| "Notes (optional)" | The exercise's notes row; opens Exercise settings, where notes are edited as before |
| Collapsed exercise rows | Same card, collapsed: number, name, equipment · muscle, target line, sets done or an ember check, chevron, menu |
| Finish Workout bar | `CtaButton` "Finish Workout" (54 pt; 48 pt on screens under 700 pt tall) opening the existing finish sheet |
| Tab bar | Not shown: the logger stays a full-screen modal (D22) |

**Rest length** (D24): starting rest also stores `restTotal` (a local settings key beside `restDeadline`; not synced or backed up) so the ring can show the fraction left. +30s adds exactly 30 s to the stored deadline and to the total. A missing or stale total starts the ring full.

**Kept from the logger, not in the reference:**

- Add exercise, Start rest (idle panel), default rest, the iOS keyboard toolbar (rest, Next, Done), reorder, rename, workout notes, save as template, discard or delete.
- Advice and progression rows, Use previous, Set Details (set type, side, RPE, RIR, rest, tempo, notes, remove).
- Paused, lower-fatigue, review and edit modes.

## Train hub (Phase 7.2B)

[Train.tsx](../../src/screens/Train.tsx) follows the approved 7.2B-0 hierarchy ([PHASE_7_2B_0_REFORGE_TRAIN_HUB.md](../audits/PHASE_7_2B_0_REFORGE_TRAIN_HUB.md)). It is built from [train/sections.tsx](../../src/screens/train/sections.tsx) and a read-only model ([train/model.ts](../../src/screens/train/model.ts)). There is no Train-hub reference: the brand header and hero follow Home, and the tools list follows You's *Tools & Settings*.

**1. Hero.** Exactly one state, in priority order:

| State | Shows | Actions |
| --- | --- | --- |
| Workout in progress / paused | "Workout in progress" or "Workout paused", the workout title, its plan, and sets done | **Resume workout** only |
| Current program or Path | "Your program" or "Your Path", the plan name, week and phase (or Program complete / Cycle complete / Paused), the program's level, real session progress, and an *Up next* tile with when it is due | **Start workout** (due or missed) or **Start early** (upcoming), through `startNextSession` as on Home; **View plan** |
| Plan without a next session | As above | **View plan** |
| No plan | "No active plan" and "Find your program" | **Browse Forge Paths** |

- The plan's next session comes from `programNext` and `pathSession` (the functions behind Home's `nextSession`). Train always shows the plan's own next session, even when Home leads with a calendar template due today.
- Progress counts the plan's sessions: "7 of 36 sessions", or "7 sessions completed" for open-ended programs.

**2. Start a workout.**

- Empty workout.
- Up to three template shortcuts, each opening the template sheet, with a Start button.
- *Workout templates* with the count, or "Save a workout you repeat" when there are none.
- Shortcut order: the template trained most recently first (from the workouts' existing `templateId`); untrained templates follow in name order. Nothing new is tracked.
- While a workout is in progress, every start here is disabled ("Finish your current workout first"); the template sheet offers Resume.

**3. Training tools.** Forge Paths ("N curated programs"), Exercise library (count) and Training calendar, as `ForgeListRow`s. Forge Paths stays listed even when the hero offers it, so the tools list never changes shape.

**Moved or removed:**

- Training history is in **You → Training snapshot**, with the completed count. Home (*Last session*, *Workout history*) and Progress (*More*) keep their links.
- History's Back falls back to You.
- *Search exercises* and *Create custom exercise* are inside the Exercise library. Their deep links (`/explore?search=1`, `/exercise?custom=new`) are unchanged.
- The tab bar's resume strip is hidden on Train as on Home, because both heroes offer Resume.

## Forge Paths and programs (Phase 7.2C-1)

The four program screens use `ForgeSubScreen` ([PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md](../audits/PHASE_7_2C_0_REFORGE_TRAINING_DISCOVERY.md)). Only their presentation changed. Shared sheets, fields and segmented controls stay on Design System 2.0 until Phase 7.6 (C5).

| Screen | Hierarchy |
| --- | --- |
| [Library](../../src/screens/programs/Library.tsx) (`/forge-paths`) | "N programs" overline · **Forge Paths** title. Your plan as one `ForgeListRow` · the recommendation as a `HeroCard` (reasons with ember checks, **View program**) or an honest card when the profile is incomplete or nothing matches · families by goal as `ForgeListRow`s (barbell icon for Strength, body for Muscle Building) · development-only draft preview |
| [Program details](../../src/screens/programs/Details.tsx) (`/forge-paths/[programId]`) | Experience · goal overline (ember) · condensed program title · days-a-week variants · stats strip (days, weeks, sessions) · *Your week* (ember training days, the day list and rest-day note) · *Phases* (ember bar, rows) · *Workouts* (collapsed rows that expand to their prescriptions) · *About* rows · pinned **Start program** (gradient) or *Open your program* (outline) |
| [Program dashboard](../../src/screens/programs/Dashboard.tsx) (`/forge-paths/current`) | "Your program" overline · program title · progress card (week of weeks · phase, ember bar, sessions) · **next session as the hero** (overline, condensed name, suggested day, Standard / Lower-fatigue choice, exercises in a raised panel, **Start session** / Resume session / Resume current workout, quiet *Skip this session*) · program complete or unavailable cards · *Coming up* · *Recent sessions* with *All program sessions* · *Program* rows (details, browse, **End program** in error colour). Back falls back to **Train** (C3) |
| [Existing Path](../../src/screens/LegacyPath.tsx) (`/paths`) | "Your Path" overline · Path name · status and progress card · selected session as the hero (state overline, condensed name, facts, Start / Review, exercises, *Workout options*) or a rest-day card · training calendar card (week stepper with bordered squares, ember selected day, ember completion markers) · one card with *Manage Path* and *Ready for a Forge program?* · *Earlier Paths* |

You's "No active plan" row counts the published programs (`libraryPrograms()`) instead of a fixed "18" (C7).

## Workout templates (Phase 7.2C-2)

[Templates.tsx](../../src/screens/Templates.tsx) (`/templates`) uses `ForgeSubScreen`, with **Create template** pinned as the screen's one primary action.

| Part | Presentation |
| --- | --- |
| Workout in progress | One `ForgeListRow` (*Resume*), above everything; every Start waits until it is finished |
| Empty | "No templates yet", what a template holds, and that any workout can be saved as one from its ••• menu |
| Search | `ForgeSearchField` only with **more than eight** templates (C6). Matches the name or any exercise, every word, ignoring case and accents; keeps the existing name order; "N of M" beside the heading; no matches offers *Show all templates* |
| Your templates | One compact card. Each row: **name** (bold), "N exercises · N sets" and the first exercise names (tap to edit), an outline **Start** and the ••• menu (Edit, Schedule…, Duplicate, Delete). Actions move under the text when the row is too narrow |
| Scheduled | Planned sessions in their own card: when, deload note, Start, and the row menu (remove, or manage the Path session) |

**Editor** ([TemplateEditor.tsx](../../src/components/TemplateEditor.tsx)): the shared sheet, fields and steppers are unchanged (C5).

- **Content:** numbered exercise cards; the open one has an ember outline and number ring, and only one is open at a time.
- **Heading:** "Exercises · N" overline with *Reorder*.
- **Buttons:** *Add exercise* as an outline button; footer *Cancel* (outline) and *Save template* (gradient).

## Exercise detail and anatomy atlas (Phase 7.2C-3B)

[Exercise.tsx](../../src/screens/Exercise.tsx) (`/exercise?id=`, `?custom=new`) uses `ForgeSubScreen`, with **Add to workout** pinned.

| Part | Presentation |
| --- | --- |
| Header | Overline (ember): primary group · movement pattern. Condensed name. Difficulty · sides |
| Chips | Always three, always in this order: **equipment · movement pattern · measured by** (Strength / Timed / Distance), as in the approved prototype. A blank field is left out, never shown empty |
| Muscles worked | [MuscleAtlas](../../src/components/anatomy/MuscleAtlas.tsx): front and back figures side by side (up to 300 pt tall, smaller on compact iPhones), then the legend. Each figure stacks the flat body, the lit regions (ember primary, copper secondary) and the lighting overlay as plain images; no SVG filters, no animation |
| Legend | Primary and Secondary rows: group labels and named muscles. A muscle the figures cannot show is named with "Not highlighted on the figures", or "*name* not highlighted" when the rest of the row is drawn (7.2C-3D). Swatches have a 1 pt edge in the highlight's darker tone for 3:1 contrast |
| Full body | No highlight; "Full body · conditioning. Muscle use depends on the machine and technique, so no single group is highlighted." |
| No muscle recorded | "No muscle group recorded for this exercise." |
| Guide | Numbered steps (ember numbers), common mistakes, safety |
| History | Strength chart, *Your records* rows with the Epley note, *Recent sessions* rows; unchanged labels and values |
| Custom | *Edit custom exercise* (outline). The custom form uses the same frame; its fields and validation are unchanged (shared controls, C5) |
| Credit | "Anatomy illustration credits" link at the end of the page: authors, CC BY-SA 4.0, the original OpenStax figure (CC BY 4.0) and links ([credits.ts](../../src/anatomy/credits.ts)) |

**Accessibility:** the two figures are one image whose label is the full text equivalent ("Muscle diagram, front and back. Primary: Chest, pectoralis major. Secondary: …"). Each legend row is one element. Colour is never the only cue.

Mapping and assets: [PHASE_7_2C_3A_ANATOMY_FOUNDATION.md](../audits/PHASE_7_2C_3A_ANATOMY_FOUNDATION.md).

## Exercise Library (Phase 7.2C-3C)

[Explore.tsx](../../src/screens/Explore.tsx) (`/explore`, `?search=1`) follows the approved list prototype. It is a virtualised list, so it uses `ForgeSubHeader` at the top of its `FlatList` instead of `ForgeSubScreen`.

| Part | Presentation |
| --- | --- |
| Header | "N exercises" overline (counted from the catalogue) · **Exercise library** |
| Search | `ForgeSearchField` |
| Views and filters | `ForgeSegments` (All / Favorites / Recent) beside an outline **Filters** button ("Filters · 1" when a filter is active). Active muscle or equipment filters show as ember pills that remove themselves when tapped. The filter panel (Muscle, Equipment, Sort by) is a card with the shared chips; search, filter and sort logic are unchanged |
| Create custom exercise | `ForgeListRow` |
| List | "A – Z" or "By muscle", with "N of M" while a search or filter is active. One continuous card of text rows: **name** (two lines max), ember dot + **primary group** · secondary muscles, equipment · movement pattern, and a 52 pt favourite star. Rows are at least 72 pt, memoised, and only the visible screens are mounted |
| Empty | "No favorites yet", "No recent exercises" or "No matching exercises", with *Clear search and filters* when something is applied |

**Muscles:**

- The primary is the anatomy legend's own wording (`primaryLabel`), shared with the detail heading, for example "Side deltoids" or "Adductors" (7.2C-3D). The Muscle filter and sort still use the catalogue group.
- Secondary muscles come from the reviewed anatomy map ([explore/model.ts](../../src/screens/explore/model.ts)), so a row never lists a muscle its detail screen excludes. For example, a fly lists front deltoids, not triceps.

**Removed:** `MuscleIllustration`, `ExerciseVisual`, `ExerciseCard` and the empty `exerciseMedia` registry. That means no doodle figures, green highlights, "Muscle illustration" / "Media available" captions or thumbnail containers. Anatomy appears only on the exercise detail screen.

## Training calendar (Phase 7.2C-4)

[TrainingCalendar.tsx](../../src/screens/TrainingCalendar.tsx) (`/calendar`, a Training tool) uses `ForgeSubScreen` ("Training calendar"; Back falls back to Train). Presentation rules live in [calendar/model.ts](../../src/screens/calendar/model.ts). The day details (`dayDetail`), scheduling and recorded workouts are unchanged.

| Part | Presentation |
| --- | --- |
| Month card | 44 pt square Previous / Next buttons around the condensed month title (Previous is hidden before the first month with training; Next stops two months ahead, as before) |
| Grid | Whole Monday–Sunday weeks; 56 pt day buttons using half the card inset, as in the Path week. Days outside the month are dimmed. Today's date is ember; the selected day has an ember outline and tint |
| Marks | One shape per state, the same as the Path week: completed = ember check, planned = dot, missed = amber alert, skipped = grey skip. Rest days carry no mark |
| Key and summary | Inline key with the four marks and "No mark · Rest"; "N workouts this month · n skipped · n missed" |
| Selected day | Section label with the date (and an ember "Today"), then one card: completed workouts open their review; planned, missed and skipped sessions say where they come from ("Planned · Path"); otherwise "Rest day" |
| Training history | A row at the end opens `/history` |

Day numbers and weekday letters use the `statMetric` role, so they stop growing at 1.5× with Larger Text and always fit a column.

**Integration (7.2C-4):**

- The training screens all use the REFORGE frame: Train, Forge Paths, program details and dashboard, the existing Path, templates, the Exercise Library and detail, the active workout and the calendar.
- Back fallbacks:

  | Screen | Falls back to |
  | --- | --- |
  | Forge Paths library, dashboard, templates, Exercise Library, calendar | Train |
  | Program details, existing Path | Forge Paths |
  | Exercise detail | Exercise Library |

- The workout screen's "No active workout" state now uses `ForgeSubScreen` / `ForgeEmpty`, and its **Back to Train** lands on Train even from a deep link. Before, it fell back to Home.

## Nutrition dashboard (Phase 7.3B)

[Nutrition.tsx](../../src/screens/Nutrition.tsx) follows the approved Nutrition reference ([references/](reforge/references/README.md)). Presentation lives in [nutrition/sections.tsx](../../src/screens/nutrition/sections.tsx). A read-only view model, [nutrition/model.ts](../../src/screens/nutrition/model.ts), formats the unchanged `domain/nutrition.ts` values.

| Part | Presentation |
| --- | --- |
| Frame | Tab: `ForgeScreen` with the shared training-streak badge. `/journal?kind=nutrition`: `ForgeSubScreen` with Back (no brand header) |
| Title block | Home's `TitleBlock`: "Nutrition", "Fuel your progress. Consistency compounds.", today's date, and week and phase when a plan is active |
| Day | `DaySwitcher` (REFORGE; Nutrition only): square ‹ › buttons, the day in a bordered pill opening the past-day calendar |
| Hero | Full-width `HeroCard` with the ember glow (`nutritionHero` has no artwork; the decorative tagline was removed in the 7.3B refinement because it competed with the numbers). Contents: "Today's nutrition"; the kcal eaten (`heroMetric`) and "of N kcal"; the bar and an ember % on their own row; then three equal macro columns divided by hairlines, each with the grams (`statMetric`), the full label, and a mini bar with "of N g" (protein ember). Goal, bar, % and macro bars appear only against the lifter's **own** targets. At large text the macros stack |
| Calorie goal | Only what the hero does not show: "N kcal left / over", and an ember **Edit targets** line. The whole card opens the target editor. Without own targets: "No daily targets yet" and **Set targets** |
| Nutrition streak | Days logged in a row (alive until today ends) and this week's M–S dots: logged = ember disc, today unlogged = ember ring, past unlogged = grey ring, future = faint ring. Derived from entries only; not scored against targets |
| Meals | One card of separate meal panels, 8 pt apart. Each has an ember-tinted meal icon, the name (bold), the foods (one line), and right-aligned kcal and "35P 45C 12F". A meal with food **expands in place** (ember outline, chevron up): its entries indented under the name (name and serving, kcal right-aligned, options menu), then, set apart on a darker strip, **Add to meal**. An empty default meal shows **+**; older meal names and "Other" stay. No times or photos |
| Quick add | Up to four of the lifter's recent, then saved, foods as roomy cards (two columns at full width; one at large text, on narrow screens, and beside the Hydration card from 7.3C). Each card shows the name (up to two lines), "portion · kcal" and an ember +. A line under the header says where a tap logs ("Adds to Lunch · Today"). One tap logs, with Undo and double-tap protection. The header ("All foods") opens Add food. Its own full-width card after the meals |
| Hydration (7.3C) | Screen order (founder correction): title, day, calorie hero, **Hydration**, calorie goal and streak, meals, Quick add, Saved foods, pinned Add food. `HydrationCard` is compact, full width and sized to its content (never stretched). One row: blue drop tile, "HYDRATION", the amount drunk with "of goal" or "logged", the blue % or a small **Set goal** chip, and a chevron. Below it, only with the lifter's **own** goal: a slim blue bar and "N to go". The whole card opens the [HydrationSheet](../../src/components/nutrition/HydrationSheet.tsx) and never logs by itself (H4). Sheet: the day's water; presets (250 / 500 / 750 mL or 8 / 16 / 24 fl oz) and a typed amount, each with feedback and Undo; the day's drinks with Edit and Delete (confirm); goal and units (`HydrationSettings`, also in You → Hydration: the same profile fields). The hydration blue (`hydration`, `hydrationTint`; AA in both themes) is used only here. No bottle photo; the tagline is omitted because it competes with the figures (H6) |
| Footer | Undo toast (6 s, announced) above the pinned ember **Add food** |

Unchanged:

- Totals, targets and the personalised rule.
- Grouping, entry actions, saved foods, the sheets, storage, sync and the 3,730-food library.

## Food discovery and logging (Phase 7.3D)

The Add food sheet ([QuickAddSheet.tsx](../../src/components/nutrition/QuickAddSheet.tsx)), the food editor ([FoodEditorSheet.tsx](../../src/components/nutrition/FoodEditorSheet.tsx)) and the food fields ([FoodForm.tsx](../../src/components/nutrition/FoodForm.tsx)) use REFORGE inside the shared sheet. Details and the branded and barcode integration points: [PHASE_7_3D_FOOD_DISCOVERY.md](../audits/PHASE_7_3D_FOOD_DISCOVERY.md).

| Part | Presentation |
| --- | --- |
| Search | "Adding to *day*", meal segments, `ForgeSearchField`. Sections: Recent / Eaten before, Saved foods, Common foods or Food library · USDA (with the match count) |
| Result row | Name (two lines); brand line only when a source has one; "portion · kcal" with a provenance pill; 44 pt ember **+**, then "✓ Added · Undo" |
| Selected food | Plain serving line; **Amount** `ForgeStepper` with its unit; a values card headed "For *amount*" (kcal, then protein / carbs / fat); meal segments; "Logs to *meal* · *day*"; outline **Back** and ember **Add to *meal*** |
| New food / Edit entry | `ForgeField`s, the "Per serving" card, servings stepper with a live total, meal segments, day row, notes; **Cancel** / **Save** |
| States | First use explains; zero results: "No matches" with **Create**; library error with **Try again** |

New REFORGE primitives in [reforge/Field.tsx](../../src/components/reforge/Field.tsx): `ForgeField`, `ForgeNumberField`, `ForgeStepper`, `ForgeChips`. They behave exactly like the 2.0 controls, which remain for other screens.

## Branded foods (Phase 7.3E)

Branded products from the bundled USDA Branded Foods catalogue (about 405,000 products, offline) extend the 7.3D Add food sheet without a new screen. Architecture and measurements: [PHASE_7_3E_BRANDED_FOOD_ARCHITECTURE.md](../audits/PHASE_7_3E_BRANDED_FOOD_ARCHITECTURE.md) §0.

| Part | Presentation |
| --- | --- |
| Order | Recent / Eaten before → Saved foods → Common foods or Food library · USDA → **Brands · USDA Branded** (with "N products" or "1,000+ products") |
| Branded row | Product name as published (two lines); **brand line**; "label serving · kcal" (for example "1 BAR (60 g) · 210 kcal"); "USDA Branded" pill; 44 pt ember **+** logs one label serving, then "✓ Added · Undo" |
| Paging | 30 at a time, then **Show more products**; "Searching branded foods…" while a search runs; "No matches" only once the search has answered |
| Selected product | The 7.3D selected-food step: brand line; "Per 100 g" or "Per 100 ml"; portion chips **Grams** or **Millilitres** plus the label serving; values card "For 110 ml"; meal, "Logs to …", **Add to *meal***; source line with release, FDC ID and barcode |
| Failure | "Branded foods couldn't be opened. Your logs are safe; try again." with **Try again**; the rest of the sheet keeps working |
| Reopened entry | "FAIRLIFE · From USDA Branded Foods · FDC … · 1 serving = 110 ml · barcode …" |

## Barcode scanner (Phase 7.3F)

A step of the Add food sheet (no new screen), opened by the **Scan barcode** button beside the search field: a 48 pt raised square with the ember `barcode-outline` icon. Details: [PHASE_7_3F_BARCODE_SCANNER.md](../audits/PHASE_7_3F_BARCODE_SCANNER.md).

| Part | Presentation |
| --- | --- |
| Camera | Dark viewport in a REFORGE card (radius `card`), four ember corner guides, no animation; torch toggle (44 pt) in the corner; one line: "Line up the barcode inside the frame. It scans on its own." |
| Match | The 7.3D/7.3E food step; Back returns to the camera; after adding, "Added … to *meal*" with **Undo** above the results |
| Not found | "Product not found" with the barcode, **Create food from this barcode** (primary, Phase 7.3F.2 M2), **Scan again**, **Search foods** |
| Unreadable | "That barcode couldn't be read" with how to retry |
| No camera | "Camera access is off" (**Allow camera** or **Open Settings**) or "Camera unavailable"; **Or type the barcode** with **Look up** always available |

## Smart servings (Phase 7.3F.1)

Branded foods open on one manufacturer serving by name, the same from search and scan. Details: [PHASE_7_3F_1_SMART_SERVINGS.md](../audits/PHASE_7_3F_1_SMART_SERVINGS.md) §0.

| Part | Presentation |
| --- | --- |
| Row | "1 stick (32 g) · 90 kcal", "1 serving (240 ml) · 101 kcal"; + logs one serving |
| Serving chips | The serving first ("1 Stick · 32 g"), then "Whole package · 591 ml" when offered, then Grams or Millilitres |
| Quick amounts | **½ · 1 · 1½ · 2** chips above the stepper ("Servings", or "Packages" for the whole package) |
| Explanation | "1 serving = 1 stick (32 g)" or "Whole package = 591 ml · about 2.46 servings"; a secondary note when the name comes from the package, another listing, an "about" count, or when the label only states a weight ("Label serving: 1.15 oz") |
| Values card | "For 1½ × 1 stick · 48 g", then kcal and protein, carbs, fat for that amount |
| Generic foods | Unchanged ("Portions", Grams first) |

## Personal barcode foods and corrections (Phase 7.3F.2 M2)

Unknown barcodes become the lifter's own foods, entered once from the package label; a branded product's values can be corrected for the lifter alone. Both are saved foods, inside the Add food sheet. Details: [PHASE_7_3F_2_PERSONAL_FOODS.md](../audits/PHASE_7_3F_2_PERSONAL_FOODS.md).

| Part | Presentation |
| --- | --- |
| Label form | Sheet title "New food from barcode", "Correct nutrition", "Edit food" or "Edit correction". The barcode as printed with an ember `barcode-outline` icon and "From your scan" (never typed); **Food name**, **Brand (optional)**; a **Serving size** card (Serving name, Amount with **g / ml** segments, "1 serving = 1 can (355 ml)"); a **Nutrition facts** card with **Per serving / Per 100 ml** segments, calories, protein, carbs, fat, and the saved serving previewed ("1 can (355 ml): 150 kcal · P 0 g · C 41 g · F 0 g"); an ember note when calories look far from the macros. Footer: **Back**, **Save food** / **Save correction** |
| Personal food step | Brand line; ember origin line "Your food · values from your package label" or "Your correction · used instead of USDA's values"; barcode; **½ · 1 · 1½ · 2** chips and the **Servings** stepper "× 1 can"; "1 serving = 1 can (355 ml)"; values card "For 1½ × 1 can · 532.5 ml"; meal and **Add to *meal***; action rows **Edit food / Edit correction**, **Remove correction**, **Use USDA values** |
| Branded product step | Adds a **Correct nutrition** action row under **Save to my foods** |
| Rows | Provenance pill "Your label" or "Your correction"; Saved foods subtitle "Your label · Dr Pepper · 1 can (355 ml) · P 0 g …" |

## Progress (Phase 7.4B: frame)

[Progress.tsx](../../src/screens/Progress.tsx) follows the approved Progress reference ([progress-approved-2026-10-24.png](reforge/references/progress-approved-2026-10-24.png)) with the 7.4A decisions ([PHASE_7_4A_REFORGE_PROGRESS_AUDIT.md](../audits/PHASE_7_4A_REFORGE_PROGRESS_AUDIT.md)). 7.4B builds the frame. The sections keep their earlier styling until 7.4C–F.

| Reference | FORGE source |
| --- | --- |
| Wordmark and brand line | `ForgeScreen` / `BrandHeader` |
| Notification bell | Omitted (D14) |
| Streak pill | `summary().streak`, the same day streak as Home and Nutrition. Not a link on Progress itself |
| Title, subtitle | "Progress", "Evidence of a stronger you. Keep building." (P11), in Home's `TitleBlock` |
| Date, "Week 8 · Build Phase" | Today; the current plan's week and phase when one is active (opens the plan). Nothing without a plan |
| Range 7D \| 4W \| 12W \| 1Y \| All | `ForgeSegments`, labelled "4W · 12W · 1Y · All" and spoken "4 weeks … All time"; **12 weeks by default** (P3); no 7D (P2) |
| (Not in the reference) Overview | The range's workouts, on-plan % or active weeks, records and volume, in a `ForgeCard` `StatStrip` (four columns, then two, then one with larger text) |
| Section headings | `SectionLabel` overlines with each section's existing information button |

**Lifetime totals (PD-1).** Workouts, total volume and the streak are computed once per data change (`revision`) and per day, not on every render. Range taps read no workout sets: at 300 workouts the median tap fell from 69 to 23 ms in tests.

### Charts (Phase 7.4C)

[Charts.tsx](../../src/components/reforge/Charts.tsx) (`ForgeLineChart`, `ForgeBarChart`) draws Progress and Exercise detail charts to the reference and the Phase 7.0 conventions (§6.9). The Design System 2.0 [charts.tsx](../../src/components/charts.tsx) is unchanged: **Goals keeps it until 7.5**.

| Element | Presentation |
| --- | --- |
| Line | 2 pt `emberHot` line; a vertical ember gradient area (28 % → 0) under each joined run; 2.5 pt ember dots up to 40 points; gaps over `breakOver` stay unjoined |
| Bars | `emberHot` bars with 3 pt top corners (selected 100 %, others 70 %); planned amounts as `text3` outlines behind them; legend "Completed" in ember |
| Grid and axis | Four gridlines (bars: whole round steps from 0), the floor solid and the rest dashed (`cardBorder`); values on the left in the new `axis` text role (12 pt, tabular; text size capped at 1.5×), in the lifter's units (`axisValue`), without units; "12K" above 10,000 |
| Dates | Up to four short dates under the plot ("Oct 5"; months "Oct"; "Mar 25" when body data spans over a year); bars without dates keep their start and end labels |
| Selection | The selected point in an ember ring with a soft glow and a dashed drop line; its value in a raised callout above it ("112.5 kg", "3 workouts"); its description above the chart |
| Unchanged | Data, aggregation, ranges, the 10 % minimum axis span, tap selection, the adjustable role, spoken label and value, swipe up and down |

### Bodyweight and Training volume (Phase 7.4D)

[progress/sections.tsx](../../src/screens/progress/sections.tsx) holds the two cards; the bodyweight change is [presentation/bodyweight.ts](../../src/domain/presentation/bodyweight.ts) (decision P1, unit-tested). Order (P4): range → Overview → **Bodyweight** → **Training volume** → Strength → Consistency → Saved plans → Records → Sets by primary muscle → Training time → Measurements → More.

| Card | Presentation |
| --- | --- |
| Bodyweight | Header "BODYWEIGHT ›" (opens Measurements) with the change in ember on the right: "−1.2 kg (−1.4%)", whichever way (a gain is not shown as failure). **Current** (latest weigh-in, its date) and **Start** (where the range began: the last weigh-in before it, else the first in it); the range's weigh-ins as an ember line (gaps over 30 days unjoined). 4W / 12W / 1Y follow the range; **All** is every weigh-in. No weigh-in in the range: "No weigh-ins in the last 4 weeks." with the latest still shown; one weigh-in: no change, "Your trend line appears after your next weigh-in."; none ever: "Log bodyweight" |
| Training volume | Header with "How volume is counted"; **Volume · Workouts** segments. Volume: the range's load (Σ weight × reps of working sets with external load) in the lifter's unit, its working sets beneath, ember bars per week or month ("14.2k kg"). Workouts: finished workouts, per week or month. Empty ranges say so |
| Measurements | Other measurement series (bodyweight has its card), with chips, within the range (PD-2); All is every entry |
| Sets by primary muscle | Unchanged content, its own section (7.4E restyles it) |

### PR highlight, all-time stats and analytics cards (Phase 7.4E)

**Final order** (supersedes the 7.4D list): range → Bodyweight → Training volume → **PR highlight | All-time stats** (side by side where both keep 170 pt at the current text size, otherwise stacked) → Strength → Consistency → Saved plans (legacy only) → Records → Sets by primary muscle → Training time → Measurements → More.

**Overview removed (presentation only).** Each of its four range figures was already shown, or now is, by the card it belongs to:

| Overview figure | Now in |
| --- | --- |
| Workouts | Consistency ("Workouts: 3"); Training volume's Workouts view |
| Active weeks / On plan | Consistency, beside its own sentence and bars |
| Records | Records ("Records: 2", "Set in the last 12 weeks") |
| Volume | Training volume |

The spoken labels are unchanged, and no statistic lost a place.

| Card | Presentation |
| --- | --- |
| PR highlight | Ember-bordered card with a soft ember glow (no artwork, P6) and a trophy. Shows the exercise, the record's own number ("105 kg", "11 reps", an estimate), its gain over the best it beat in ember ("+5 kg", "+3 reps", P1), the record type ("Heaviest set · 5 reps", "Rep record · at 60 kg") and "New personal record · day". Tapping it opens the exercise; the header opens Records. **Choice ([presentation/records.ts](../../src/domain/presentation/records.ts)):** the newest record; same-workout ties go to heaviest set, then estimated 1RM, then reps at a weight, then most reps, then exercise id. The gain is read from the exercise's earlier session bests, the same way the records are found. With no record: "No records yet…" |
| All-time stats | Lifetime figures, whatever the range: workouts (as You counts them), total volume (Progress's load volume, equal to Training volume over All) and total training time ("7h 32m", summed as You sums it), each with an ember icon. The header opens Training history |
| Strength | One `ForgeCard`. Header with its information sheet; the exercise as an ember-chevron selector (picker sheet with REFORGE rows and search); **Est. 1RM · Heaviest set** segments; the chart; Latest and Previous; the change in ember when there is one; an "Exercise details" row |
| Consistency | Header and information sheet, the **Workouts** and **On plan / Active weeks** strip, its sentence, bars against the plan, legend |
| Records | Header and information sheet, the range's count, up to three record rows (each opens its workout), **All records** |
| Sets by primary muscle | Ember bars against the most-trained muscle; Show all / Show fewer |
| Training time | Average workout, total for the range, day streak |
| Measurements | REFORGE chips and chart; the header opens Measurements |

### Milestones, Next goals, Records and More (Phase 7.4F)

**Final Progress order:** range → Bodyweight → Training volume → PR highlight | All-time stats → Strength → Consistency → Saved plans (legacy) → Records → **Milestones** → **Next goals** → Sets by primary muscle → Training time → Measurements. (The **More** card was removed after 7.5D, below.)

| Part | Presentation |
| --- | --- |
| Milestones | Header "MILESTONES · 2 of 5 ›" opens the sheet. Up to four tiles: earned ones (ember tint and border, the milestone's icon, a check, "Earned"), then the next one still ahead (outlined, lock, "Next milestone"). Two per row; one per row with large text. The **sheet** lists "Earned · n" and "Still ahead · n" as the same tiles. Definitions and thresholds are unchanged: `milestoneList` returns every milestone with whether it is earned, and `achievements` is exactly its earned ones. No new milestone types (P7); no goal ring in the tiles, because Next goals already shows goal progress |
| PD-3 | The volume milestone reads "22,046 lb lifted" for pound lifters and "10,000 kg lifted" in kilograms. The threshold is still 10,000 kg ([presentation/milestones.ts](../../src/domain/presentation/milestones.ts)) |
| Next goals | Header "NEXT GOALS · See all ›" opens Goals. Up to three active goals as Goals evaluates them, in Home's next-target order (the first is always Home's next target): name, state, current value and target, and an ember bar **only where Goals gives a real ratio**. Each row opens Goals. No goals: "No active goals…" with "Set a goal" |
| Records screen | `ForgeSubScreen` "Records" with "n records set" in ember; **Recent records** (trophy rows: type, value, date; each opens its workout) and **Your bests** (one row per exercise, opening it); "How records work"; `ForgeEmpty` "No records yet" |
| More (removed after 7.5D) | Was one card of links: Training history, Training calendar, Body measurements, Nutrition (today), Recovery, Goals. The founder removed it as unrelated to Progress. Each destination is still reachable: Training history (You performance strip, Home *Last session*), Training calendar (Train tools, Home session menu), Body measurements (You *Tools & settings* and *My stats*), Nutrition (tab bar), Recovery (You *Tools & settings*), Goals (Progress *Next goals*, Home *Next target*, You *Primary goal* and *Tools & settings*) |

## You (Phase 7.5B–7.5B.1: athlete identity)

[You.tsx](../../src/screens/You.tsx) follows the approved You reference ([you-approved-2026-10-24.png](reforge/references/you-approved-2026-10-24.png)), the 7.5A audit and the founder's 7.5B direction: the top of the tab is the athlete's identity and training, and the settings sit below. 7.5B builds the identity and the current-plan card ([you/sections.tsx](../../src/screens/you/sections.tsx), [you/model.ts](../../src/screens/you/model.ts)). 7.5B.1 refines the composition after the founder's iPhone review, rebuilds the *Edit profile* presentation and puts the lower sections on REFORGE surfaces so the screen reads as one design; their full redesign stays with 7.5C–D.

| Reference | FORGE source |
| --- | --- |
| Wordmark and brand line | `ForgeScreen` |
| Notification bell | Omitted (D14) |
| Streak pill | The shared day streak (`summary().streak`), as Home and Nutrition show it; opens Progress |
| Photo avatar with ember ring and pencil | **Monogram** (up to two initials of the display name), drawn in SVG: a faint ember halo, a 3 pt ember-gradient ring and a softly lit charcoal disc, with a soft radial ember light behind it. A pencil badge cut out of the ring (at least 44 pt touch) opens *Edit profile*. Decorative to screen readers. There is no photo storage |
| Name | The saved display name (the profile default "Athlete" when not set), `screenTitle`, up to two lines, **the screen's header** |
| Tagline | The saved experience as an ember overline under the name ("INTERMEDIATE LIFTER"); omitted when not set |
| "Strength Focus" | The saved training goal ("Strength focus", "Muscle building focus"). When not set: an ember "Set your training focus ›" that opens the Training focus editor |
| Location | Omitted (no such data) |
| "Member since" | "Training since {month year}" from the first finished workout, else "No workouts yet" |
| **Level / XP** (rejected) | **Current plan card**, a `HeroCard` with ember glow and the same `planOverview` as Train. Shows: "YOUR PROGRAM" or "YOUR PATH" (an earlier generated Path, named as such) over the plan's name, beside a forged hexagon emblem (ember when active); "Week n · phase" or its state (complete, paused, unavailable); one quiet meta line, "Forge Paths · level · days a week" (the *Forge Paths* source only for library programs); an 8 pt progress bar with "n of N sessions" and its percentage (or "n sessions completed", with no bar or percentage, for open-ended programs); a divided footer with *Up next* ("session · when") and "View plan ›". The whole card opens the plan, as the plan row did. Without a plan: "YOUR TRAINING · No active plan", the published Forge Paths count, **Browse Forge Paths** |
| (Not in the reference) | "Complete your training profile" as a REFORGE row when experience, goal or rest day is missing |

**Layout:** monogram (108 pt) beside the name block; stacked, with a 92 pt monogram, below 360 pt or above 1.4× text.

**Edit profile and the focused editors (7.5B.1).** The You tab's four editors (*Edit profile*, *Training focus*, *Training preferences*, *Nutrition targets*) use [ProfileForm](../../src/components/ProfileForm.tsx) with `fields`, which now draws in REFORGE: fields grouped under section labels (Identity, Body, Schedule, Focus, Progression, Daily targets), `ForgeField` inputs with their help and error text, `ForgeChoices` for choices, and a *Cancel* beside the save action (Cancel asks before discarding unsaved changes, as the sheet's close does). *Edit profile* asks for the name, height and weight, with a live preview of the monogram and name while typing; a blank name previews as "Athlete" and is still refused on save. Body fat is not asked there: a saved value is kept unchanged, and body composition is tracked as the *Body fat* measurement. Field definitions, binding, validation, saving and unsaved-change handling are unchanged; first-time setup and the full settings form keep their presentation.

**Lower sections (cohesion only, 7.5B.1).** Membership and the settings groups (Training, Health & body, Notifications, App, Account & data, About) sit on REFORGE section labels and hairline cards (`SettingsGroup`), with `ForgeSegments` for units and appearance. Rows, labels, destinations and behaviour are unchanged. Their redesign is 7.5D; History, Goals, Measurements, Recovery and Account follow in 7.5E–G. (The 7.5B.1 *Training snapshot* was replaced in 7.5C, below.)

### Performance strip, primary goal and My stats (Phase 7.5C)

Below the approved identity and plan card (unchanged), in this order: performance strip, primary goal, My stats, then (since 7.5D) the Tools & settings card. The *Training snapshot* is removed. Its working sets and time trained remain in Progress (Training volume, All-time stats). Its *Training history* row moves into the strip. Its *View progress* row is dropped: Progress is a tab, and the streak pill opens it. Helpers: [presentation/you.ts](../../src/domain/presentation/you.ts). Components: [you/sections.tsx](../../src/screens/you/sections.tsx).

| Section | Content and source |
| --- | --- |
| **Performance strip** | One card, three equal columns (ember outline icon, `statMetric` number, quiet label), wrapping by `StatStrip` on narrow screens and large text. **Workouts completed** = `summary().count` (completed workouts only). **Day streak** = `summary().streak`, the same figure as the brand pill, at the same size as its neighbours rather than repeated larger. **Weeks consistent** (definition below). The card's one action is a *Training history* row. With no workouts: an invitation instead of a row of zeros |
| **Primary goal** | Home's next target: `nextTarget` over `evaluate` with `goalSources`, so it is the same goal, values and wording as Home's *Next target* and Progress's first *Next goal*. Shows the name, `state`, the recorded value against the target, and a bar with "n% complete" only when Goals gives a `ratio`. The whole card opens Goals. With no active goal: "Set a goal". With active goals but none with a recorded value: "View goals" ("Your next target appears here once a goal has a recorded value"). Never a generated goal or 0% |
| **My stats** | "MY STATS" label with a *Measurements ›* link. **Bodyweight**: the latest weigh-in, else the profile weight (Home's `bodyweight`), in the lifter's units, with its source ("Logged today", "Logged Thu, Oct 22", "From your profile"). **Height**: the saved profile height, whole cm for kilogram users and ft/in for pound users. Missing values read "Not logged" or "Not set" with where to add them. **No body fat** (founder direction, 7.5B.1), no estimated 1RM and no deltas: trends belong to Progress |

**Weeks consistent.** Consecutive calendar weeks (Monday to Sunday, local dates) that each contain at least one completed workout, dated by its local finish day as the day streak dates it.

- The run is counted back from the current week if it already has a workout.
- Otherwise it is counted back from the previous week, so a week still in progress never breaks it.
- A fully elapsed week with no workout ends the run.
- Unfinished workouts and planned sessions do not count. This is activity, not plan adherence.
- No other streak or consistency calculation changed.

**Performance.** The lifetime figures and the goal evaluation are memoised on the store revision (and the day, and units for goals), as on Progress, so they refresh whenever data changes.

### Tools & settings, Preferences and Account & privacy (Phase 7.5D)

The You tab now ends after My stats with one **Tools & settings** card: a "TOOLS & SETTINGS" label and five `ForgeListRow`s (ember icon, bold title, short description, chevron, hairline dividers).

1. **Goals** (journal `goal`)
2. **Body measurements** (journal `measurement`)
3. **Recovery** (journal `recovery`)
4. **Preferences** (`/preferences`, new)
5. **Account & privacy** (`/account`). Its description is the real state: "Guest mode · backups, privacy and membership", "n changes waiting to sync", or "Sync, backups, privacy and membership".

*Training history* is not repeated in the card: it is the performance strip's own row directly above.

**Destination inventory.** Every control from the old lower You tab and where it is now:

| Before (You tab) | Now |
| --- | --- |
| Membership card ("Free plan", "Membership is on the way", nothing to buy) | Account & privacy, same card and copy (`you/account.tsx` `MembershipCard`) |
| Training · Training focus | Preferences · Training (same editor). Still opened on You by "Set your training focus", the profile prompt and `?edit=focus` |
| Training · Training preferences | Preferences · Training (same editor; `?edit=training` on You still works) |
| Training · Nutrition targets | Preferences · Nutrition (same editor and `TARGETS_SAVED` rule; `?edit=nutrition` on You still works; Nutrition's own targets sheet unchanged) |
| Training · Hydration | Preferences · Nutrition (same `HydrationSettings` sheet; also on the Nutrition tab) |
| Health & body · Body measurements, Recovery, Goals | Tools & settings rows, same routes |
| Health & body · Nutrition log | Removed as a row: it only switched to the Nutrition tab, which is always in the tab bar |
| Notifications · Training reminders (switch and footer) | Preferences · Notifications, same `toggleNotifications` (permission request, cancel on off) and footer |
| App · Units, Appearance | Preferences · Display & units, same segments and instant saves |
| Account & data · Account & cloud sync | Tools & settings · Account & privacy (`/account`) |
| Account & data · Export backup, Import backup, Privacy & training guidance, Delete all local data | Account & privacy · Data & privacy: the same rows, copy, sheets and confirmations (`DataPrivacy`) |
| About · FORGE version, local schema and sync count | Account & privacy · About (`AboutForge`), same text and spoken label |
| About · Replay intro, Design system (development builds only) | Preferences · Development (development builds only) |

**Preferences** ([Preferences.tsx](../../src/screens/Preferences.tsx)) is a `ForgeSubScreen` ("YOU" / "Preferences", Back to You). Groups:

- **Training:** Training focus, Training preferences.
- **Nutrition:** Nutrition targets, Hydration.
- **Display & units:** Units, Appearance.
- **Notifications:** Training reminders.
- **Development:** development builds only.

The focused editors are one shared `EditorSheet` ([you/editors.tsx](../../src/screens/you/editors.tsx)), used by You and Preferences, so validation, saving and unsaved-change confirmation are identical in both.

**Account & privacy** ([app/account.tsx](../../app/account.tsx)) keeps its sign-in, sync, sign-out, account deletion and conflict handling exactly as they were. Below them it gains the membership card, Data & privacy and About. The title is now "Account & privacy". The guest-mode text points to "Data & privacy below" instead of "You → Export backup". The screen's REFORGE redesign remains Phase 7.5G.

## Workout history (Phase 7.5E)

[History.tsx](../../src/screens/History.tsx) (`/history`) is a `ForgeSubScreen`: the header is "Workout history" with the real count ("65 workouts"), and Back goes to You. Row presentation lives in [presentation/history.ts](../../src/domain/presentation/history.ts).

| Part | Presentation |
| --- | --- |
| Months | Completed workouts only, newest first in the same order as before, grouped by month: a "OCTOBER 2026" section label over one hairline card per month |
| Row | Date block (ember weekday overline, day number); the title (a program session's own name, as in the logger; up to two lines); one quiet detail line of only what was recorded. Duration appears only when it is at least a minute, the exercise count only when there are exercises ("No exercises logged" otherwise), and volume only when above zero, in the lifter's units. When another workout finished the same day, the finish time leads the details so same-day sessions stay distinct. Every workout keeps its own row and key; nothing is merged or inferred |
| Actions | The row opens the existing review (`/workout?id=`). Its menu keeps **Repeat workout** (blocked while another workout is active; starts one copy and opens the logger) and **Delete workout** (the same confirmation; refreshes through the store revision). Spoken: "Review {name}, {day}", with the details as the hint, and "Options for {name}, {day}" |
| Paging | The newest 60, then "Show earlier (n)" pages of 60, as before. Only the shown page is summarised |
| Empty | `ForgeEmpty` "No workouts yet" with **Go to Train** |

**Review (workout details).** The finished-workout review is the Phase 7.2A logger in read-only mode, unchanged except for one thing. A collapsed exercise in review now summarises **what was logged** ("2 of 3 sets · top set 80 kg × 5", "2 sets · best 15 reps", "1 set · longest 45 s"; `loggedSummary`) instead of the plan target, which could be mistaken for logged data. Editing and the live logger keep the target summary. Sets were already hairline rows of plain values, not boxes. Edit (with Save and Cancel), Save as template and Delete session are unchanged.

## Goals (Phase 7.5F)

[Goals.tsx](../../src/screens/Goals.tsx) (`/journal?kind=goal`) is a `ForgeSubScreen` over the unchanged Phase 7B WP4D goal engine ([domain/goals.ts](../../src/domain/goals.ts)). Evaluation, creation and editing rules, Undo, durable deletes, Mark as achieved, Archive / Restore and legacy-goal conversion are unchanged; 7.5F changed the presentation only.

**Goal types and statuses (existing).** Targets: Bodyweight, Lift, Training volume. Habits: Workouts per week, Session length, Daily calories. Statuses: active, achieved (confirmed, with its real date and value), archived. A deleted goal is held for Undo, then removed.

| Part | Presentation |
| --- | --- |
| Header | "Goals" with the real active count ("2 active"); Back to You; **New goal** pinned in the footer |
| Overview | "ACTIVE" label (or "NO ACTIVE GOALS" with a line pointing to New goal and past goals) and *How goals are measured*. One `GoalCard` per active goal; a reached target offers **Mark as achieved** beneath it. **Past goals (n)**: a *Show past goals* row, then achieved (trophy) and archived rows with their menus |
| Goal card | The engine's own words: the measure as an overline, the name (up to two lines), the recorded value with its basis ("82 kg · Yesterday"), the target (and target date), an ember bar with "n% · From 84 kg to 80 kg" **only when Goals gives a ratio**, and the state sentence (green with a check when reached or achieved). An "Achieved" or "Archived" pill. Spoken as the engine's `spoken` text, as before |
| Detail | The goal's name is the header, with "Active goal", "Achieved goal" or "Archived goal" above it. Full card (all notes, a habit's **Recent** weeks or days, the lifter's note); **Mark as achieved**; the chart; **Details** ("Counts from" or "Set on", target date); **Actions** as REFORGE rows (Edit, Archive / Restore or Set a new target, Delete) |
| Chart | `ForgeLineChart` (the 7.4C chart) for bodyweight goals (weigh-ins since the goal was set) and lift goals (the heaviest qualifying set each day), in the lifter's units, on real dates; days far apart are not joined and nothing is interpolated; the target is stated below. One day of records says "The chart appears from the second"; other types have no chart. *Limitation:* the chart has no target line (`ForgeLineChart` has none, and Progress shares it) |
| Sheet | The same type-first `GoalSheet` and fields, drawn with `ForgeChoices`, `ForgeField`, `ForgeStepper`, `CtaButton` / `OutlineButton` and REFORGE text. Labels, validation messages, confirmations ("Check this goal"), the unsaved-change prompt and saving are unchanged |

**Consistency.** Home's *Next target*, Progress's *Next goals* and You's *Primary goal* all use `evaluate` and Home's `nextTarget` order; Goals shows the same `evaluate` output, so one goal reads the same everywhere. Goals now evaluates against one `goalSources` per data change (its lift and volume caches serve every card and the chart).