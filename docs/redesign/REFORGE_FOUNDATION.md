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
