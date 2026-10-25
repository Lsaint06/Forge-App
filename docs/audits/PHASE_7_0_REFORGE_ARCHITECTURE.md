# Project REFORGE — Phase 7.0: Reference Mapping & Architecture

| | |
| --- | --- |
| Phase | 7.0 — planning and auditing only. No application code, styles, assets, dependencies or tests were changed. |
| Date | 2026-10-24 |
| Branch / HEAD | `feat/forge-paths-foundation` @ `b05cd89` ("WP6 Batch C + D15: screen-reader semantics and durable pending deletions") |
| Working tree at start | Clean (`git status --short` empty) |
| Baseline checks run | `npm test` 351/351 pass · `npm run test:ui` 28 suites, 299/299 pass · `npm run typecheck` clean |
| Status | **Awaiting founder review. Phase 7.1 has not started.** |

> **Naming note.** The repository already has `PHASE_7A_*` and `PHASE_7B_*` audits (product audit, WP4–WP6). REFORGE uses dotted numbers (7.0–7.6) to keep the two series apart. See decision D32.

---

## 1. Executive summary

FORGE has a solid, well-tested functional core and a coherent but deliberately austere **Design System 2.0** ("one action, one number, one line"; a single ember; tonal, borderless surfaces). The five approved REFORGE mockups describe a different visual language: near-black hairline-bordered cards, frequent ember accents and gradients, condensed heavy display type, a brand header on every tab, photographic and rendered imagery, and denser dashboard-style composition.

The most important findings:

1. **All five references were accessible and inspected** (Home, Train, Nutrition, Progress, You; 768 × 1365 px each). Nothing had to be skipped.
2. **The app has four tabs; the references have five.** The current tabs are *Today, Train, Progress, You*. Nutrition is a secondary screen reached at `/journal?kind=nutrition`. Adding it as a tab, and renaming *Today* to *Home*, is an information-architecture change (D2).
3. **The references contradict rules that DS 2.0 documents and tests enforce**: the selected tab must be white ("never orange"), Train must contain no ember, Today must have no streak or duplicated metrics, the screen margin is 20 pt, and surfaces have no borders. Faithful reproduction requires the founder to formally supersede those rules (D1, D27). The affected tests are listed in §5.3.
4. **The "Train" reference is the active workout logger, not the Train hub.** There is no reference for the Train hub, the Forge Paths library, program details or the plan dashboard. They have to be derived from the shared visual language and approved separately (D28).
5. **Many mockup elements have no data behind them.** These include HRV, hydration, XP and level, location, a profile photo, a notification centre, a nutrition streak, meal photos and times, an "est. time left", a 7-day range, period-over-period percentages and a "primary goal". §4 classifies every visible element as reusable, derived, new functionality or omitted. Nothing fictional is planned as real data.
6. **The mockup canvas is not a phone.** At 768 × 1365 it is a 9:16 frame; an iPhone is about 393 × 852 pt (roughly 9:19.5). Mapped by width (1.954 px per pt), the mockup's *Start workout* button is about 31 pt tall, *Finish Workout* about 29 pt, collapsed exercise rows about 28 pt and set inputs about 19 pt. All of these are below the 44 pt minimum that the app enforces. Fidelity must therefore be **proportional, not literal**: match widths, margins, hierarchy, colour and type ratios, and let heights grow to meet touch-target rules (§3.2).
7. **The workout reference removes existing functionality.** It drops the PREV and RIR columns and puts a rest-timer ring beside the set grid. On a 393 pt phone that pushes the existing responsive set grid ([set-grid-layout.ts](../../src/components/set-grid-layout.ts)) out of its "wide" mode. The recommendation is to keep the columns and move the ring (D22).
8. **No imagery pipeline exists for in-app use.** The exercise-media registry is intentionally empty, `expo-image` is not installed, and the only bitmaps are splash assets. The plates, athlete and food in the mockups look AI-generated and must be replaced (§8).
9. **Typography is system-only.** `expo-font` is installed but unused. The mockup display face is a heavy, squared, condensed sans, so a licensed (SIL OFL) display family is needed (D4).
10. **Gradients and shadows need a technical spike.** There is no gradient library. `react-native-svg` gradients work today. React Native's core `experimental_backgroundImage` and `boxShadow` probably work on RN 0.88 in Expo Go (New Architecture), but this is **unverified** (§11).

**Recommendation:** run Phase 7.1 as eight small work packages (§12). The first package (7.1-0) closes the blocking decisions and proves fonts, gradients and the asset pipeline in Expo Go before any Home pixels change. All new presentation is *additive*: new components are opted into screen by screen, so the 16–40 screens that import the shared primitives are not restyled by accident.

---

## 2. Verified current architecture

### 2.1 Platform and dependencies (from [package.json](../../package.json) and [app.json](../../app.json))

| Area | Verified version / state |
| --- | --- |
| Expo SDK | `expo ~58.0.17` |
| React / React Native | `react 19.3.0`, `react-native 0.88.0` (New Architecture only, since RN 0.82 removed the legacy architecture) |
| Router | `expo-router ~58.0.25`, `typedRoutes: false`, scheme `forge`, entry `expo-router/entry` |
| Animation | `react-native-reanimated 4.7.1`, `react-native-worklets 0.13.0`, `react-native-gesture-handler ~3.3.0` |
| Haptics | `expo-haptics ~58.0.7` |
| Vector / charts | `react-native-svg 15.16.0`; **no chart library** (custom SVG and View charts) |
| Icons | `@expo/vector-icons ^15.1.0` (Ionicons only in practice) |
| Fonts | `expo-font ~58.0.9` installed, **not used**; system font everywhere |
| Images | React Native `Image` only. Not installed: `expo-image`, `expo-linear-gradient`, `expo-blur` |
| State / data | `zustand`, `expo-sqlite` (schema v1), optional Supabase sync, `zod` validation |
| Platforms | iOS and Android, portrait, `supportsTablet: false`, `userInterfaceStyle: automatic` |
| Test tooling | `node:test` via `tsx` (33 files), Jest with `jest-expo` and Testing Library (28 suites) |
| Device tooling on this PC | Node 24.22. Not available: `adb`, Android emulator, Maestro, iOS simulator (Windows). [maestro/workout.yaml](../../maestro/workout.yaml) exists but is not runnable here and refers to older labels. |
| Preview workflow | Expo Go on the founder's phone, via QR code. Browser preview is retired ([docs/WEB.md](../WEB.md)). |

### 2.2 Navigation structure

The root stack is [app/_layout.tsx](../../app/_layout.tsx). It initialises the repository, reconciles pending deletes, plays the in-app intro ([ForgeSplash](../../src/components/splash/ForgeSplash.tsx)) and then renders a `Stack` with `headerShown: false`:

| Route | Presentation | Screen implementation |
| --- | --- | --- |
| `(tabs)` | stack root | [app/(tabs)/_layout.tsx](<../../app/(tabs)/_layout.tsx>), custom tab bar |
| `workout` | **fullScreenModal** | [src/screens/Workout.tsx](../../src/screens/Workout.tsx) (active, review and edit modes) |
| `journal?kind=…` | push | [src/screens/Journal.tsx](../../src/screens/Journal.tsx) dispatches to `nutrition`, `food` (Saved foods), `recovery` (Check-ins), `goal` (Goals) or Measurements (default) |
| `templates`, `history`, `records`, `calendar`, `explore`, `exercise` | push | `app/*.tsx` → `src/screens/*` or inline |
| `forge-paths/index`, `forge-paths/[programId]`, `forge-paths/current` | push | [Library](../../src/screens/programs/Library.tsx), [Details](../../src/screens/programs/Details.tsx), [Dashboard](../../src/screens/programs/Dashboard.tsx) |
| `paths` | push | [LegacyPath](../../src/screens/LegacyPath.tsx) (existing generated Paths only) |
| `onboarding`, `account`, `design-system` (dev), `+not-found` | push | inline in `app/` |

The tab layout has **four tabs** (`index` "Today", `train`, `progress`, `profile` "You"). The custom `tabBar` renders:

- a **resume banner** above the tabs while a workout is active, on every tab except Today;
- Ionicons that are filled when selected and outlined when idle;
- `text` (white) for the selected tab and `text2` for idle tabs. **No ember** is used in navigation.

### 2.3 Tab routes and the screens that belong to them

| Tab (current label) | Route file | Screen | Secondary screens reached from it |
| --- | --- | --- | --- |
| Today | `app/(tabs)/index.tsx` | [Home.tsx](../../src/screens/Home.tsx) | `/workout`, `/forge-paths`, plan dashboard (`PlanRow`), `/journal?kind=recovery`, `/history`, `/onboarding` redirect |
| Train | [app/(tabs)/train.tsx](<../../app/(tabs)/train.tsx>) (screen inline) | `Train` + `TemplateSheet` | `/forge-paths/*`, `/paths`, `/templates`, `/explore`, `/exercise`, `/history`, `/workout` |
| Progress | `app/(tabs)/progress.tsx` | [Progress.tsx](../../src/screens/Progress.tsx) | `/records`, `/history`, `/calendar`, `/exercise`, `/journal?kind=measurement\|nutrition\|recovery\|goal`, Milestones sheet |
| You | `app/(tabs)/profile.tsx` | [You.tsx](../../src/screens/You.tsx) | ProfileForm sheets (`?edit=profile\|focus\|training\|nutrition`), `/history`, `/journal?kind=…`, `/account`, Backup sheet, `/design-system` (dev) |
| *(Nutrition — not a tab)* | `app/journal.tsx` | [Nutrition.tsx](../../src/screens/Nutrition.tsx) | QuickAddSheet, FoodEditorSheet, `/journal?kind=food` (Saved foods), targets editor on You |

Nutrition is reached from **You → Nutrition log** and **Progress → More → Nutrition**. Its back button falls back to `/(tabs)/profile`.

### 2.4 Shared UI layer and blast radius

| Module | Contents | Importers (files in `app/` and `src/`) |
| --- | --- | --- |
| [src/theme.ts](../../src/theme.ts) | Dark and light palettes, legacy aliases, 8 text roles, size classes, Dynamic Type caps, spacing, radii, heights, elevation, motion | All UI |
| [src/components/ui.tsx](../../src/components/ui.tsx) (1316 lines) | `useColors`, `Txt`, `Label`, `Screen`, `Card`, `Button`/`TextButton`/`IconButton`/`BackButton`, `Field`/`NumberField`, `Chips`/`FilterChips`, `SegmentedControl`, `Choices`, `Stat`, `Empty`, `ProgressBar`, `Sheet`, `SheetHeader`, `confirmDiscard`, `Loading` | `Txt` 40 · `Button` 26 · `useColors` 26 · `Sheet` 20 · `Card` 19 · `Screen` 16 · `TextButton` 16 · `SegmentedControl` 10 · `Empty` 10 · `ProgressBar` 6 · `Chips` 6 |
| [src/components/system.tsx](../../src/components/system.tsx) | `ListRow`, `ListSection`, `OverflowMenu`, `useAfterSheet`, `InfoSheet`, `InfoButton` | `ListRow` 20 · `ListSection` 16 · `OverflowMenu` 8 |
| [src/components/design.tsx](../../src/components/design.tsx) | Aliases plus `MetricCard`, `ProgressRing` (unused), `MuscleIllustration`, `exerciseMedia` (empty), `ExerciseVisual`, `WeeklyConsistency`, `AchievementCard`, `ChartContainer`, `ErrorState`, `LoadingSkeleton`, … | `WeeklyConsistency` 1 · `ProgressRing` 0 |
| [src/components/charts.tsx](../../src/components/charts.tsx) | `BarChart` (View bars, planned-target outline, success-green fill), `LineChart` (SVG polyline, gaps, x-positions), `Legend`; adjustable for screen readers | `LineChart` 4 · `BarChart` 1 |
| Feature components | `WorkoutExerciseCard`, `SetGrid` and `set-grid-layout`, `FinishSheet`, `ReorderSheet`, `ExercisePicker`, `PlanRow`, `programs.tsx`, nutrition/*, goals/*, measurements/*, checkins/*, `ProfileForm`, `Backup`, `Recovery` (ErrorBoundary) | Feature-local |

**Implication:** a change to `Screen`, `Card`, `ListRow`, `ListSection`, `Button` or `Txt` reaches 16–40 files, including secondary screens that REFORGE does not reach until 7.6. REFORGE should introduce **new opt-in components** and leave those primitives unchanged until the convergence pass (§7).

### 2.5 Typography and theme

- **Tokens** ([theme.ts](../../src/theme.ts)): `bg #0A0B0D`, `surface #141619`, `surfaceRaised #1E2125`, `hairline #2A2E34`, text `#F4F2EE` / `#A4A9B0` / `#6E747C`, `ember #F46B35`, `success #43B88C`. There is a light palette with the same keys. `useColors()` follows the profile's `theme` (dark, light or system).
- **Text roles:** display 32/36 (800), title 22/27, headline 17/22, body 15/21, caption 13/17, overline 11/14 (+1.6, uppercase), metricXL 44/48, metric 22/26 (tabular). Display and metricXL respond to the size class (compact under 390 pt, large 428 pt or wider). Dynamic Type caps apply only to display, metricXL, title and metric.
- **Spacing:** 4 pt grid; screen margin 20; section gap 24 (the `Screen` children gap is `spacing.lg`). **Radii:** control 12, card 16, sheet 24. **Heights:** primary 54, control 48, compact 44, row 56/64.
- **Elevation:** tonal only. The only shadow is `floating`, used on sheets.
- **Doctrine** ([DESIGN_SYSTEM_2.md](../redesign/DESIGN_SYSTEM_2.md)): "One action. One number. One line." The ember is **only** for the primary action, selection indicators and live progress. Surfaces have **no borders**.

### 2.6 Animation and haptics (current)

| Where | What |
| --- | --- |
| `ui.tsx` `ProgressBar` | Reanimated width animation (300 ms); respects reduce motion |
| `Sheet`, `system.tsx` menus | `Modal` fade, or none when reduce motion is on |
| `ForgeSplash` | Full intro choreography (not in REFORGE scope) |
| [state.ts](../../src/state.ts) `mutate()` | `Haptics.selectionAsync()` on **every** successful mutation, including per-keystroke saves such as workout rename and notes, which call `mutate` in `onChangeText` |
| `SetGrid` | Light impact on set completion |
| `Workout` `RestTimer` | Success notification when rest ends |

There are no layout animations, shared-element transitions, count-ups or chart draw-ins.

### 2.7 Charts and visualisation

- `BarChart`: flex bars in `success` green at 70% (100% when selected), a planned-target outline, a description line above the chart and start and end labels. No y-axis and no gridlines.
- `LineChart`: SVG polyline with points and a selected point, optional breaks over gaps, and real date spacing.
- `WeeklyConsistency`: dots for the week. `ProgressBar`: 6 pt ember bar. `ProgressRing`: SVG ring, **unused**. The muscle-sets breakdown uses inline View bars in `text2`.
- All charts are **adjustable** for screen readers (swipe up or down to step through points). This must be preserved.

### 2.8 Images and assets

- Assets are limited to `assets/splash/**` (wordmark letters, molten and steel plates, effects) and [forge-wordmark.svg](../../assets/splash/brand/forge-wordmark.svg). The SVG is a 639.8 × 100 master vector, 2 KB, which is ideal for an in-app brand header.
- `exerciseMedia` is empty by design. `MuscleIllustration` provides original SVG category diagrams. No photography exists.
- No asset register exists outside [docs/SPLASH.md](../SPLASH.md) (splash provenance).

### 2.9 Responsive layout patterns

`sizeClass` and `textRoleFor` (type), `segmentLayout`/`textWidth` (segmented controls: one row, wrapped, two columns, then stacked), `setGridLayout` (wide, compact or stacked), the `MacroSummary` three-column to stacked fallback, and `Txt fit` (shrinks to at most 80%). The REFORGE two-column card rows (Home snapshot and nutrition, Nutrition goal and streak, Progress PR and all-time stats) need the **same kind of measured fallback**.

### 2.10 Accessibility baseline (WP6)

The WP6 baseline provides:

- roles and labels on all controls;
- uppercase text that is visual only (`spokenText`);
- 44 pt minimum targets;
- tested contrast for both palettes (`design-tokens.test.ts`, `wp6-contrast.test.ts`);
- sheets that are modal and move focus to their title;
- rest-timer announcements at start and end only;
- adjustable charts;
- large-text layouts (segments, set grid, macro columns).

REFORGE must not regress any of these.

### 2.11 Test coverage relevant to REFORGE

| Suite | What it protects |
| --- | --- |
| `tests/*.test.ts` (33 files, 351 tests) | Domain and data: calculations, programs, goals, nutrition, measurements, progress, sync, backup, tokens and contrast |
| `tests/ui/*.test.tsx` (28 suites, 299 tests) | Screen behaviour: navigation, Today/Train, workout logger, nutrition, progress, you, goals, check-ins, measurements, Forge Paths, design system, WP5/WP6 accessibility, splash |
| `app/design-system.tsx` (dev) | Live component reference; `design-system.test.tsx` checks that it renders every component |

### 2.12 Data and behaviour guardrails (unchanged by REFORGE)

- SQLite schema v1 and the validated journal kinds: `measurement | nutrition | recovery | goal | food | schedule | program`.
- The backup format, sync outbox, pending deletes (D15), the one-active-workout start guard and confirmations.
- Unsaved-sheet guards, unit conversion at display only, and the rule that nutrition targets are personalised only once saved.
- Onboarding redirect, and the splash and intro behaviour.

---

## 3. Reference inventory and fidelity method

### 3.1 Availability

| Tab | Reference file (session attachment, not in the repository) | Size | Inspected |
| --- | --- | --- | --- |
| Home | `ChatGPT Image Oct 24, 2026, 09_17_58 PM-1.png` | 768 × 1365 | ✅ visually, with pixel sampling |
| Train | `ChatGPT Image Oct 24, 2026, 09_17_58 PM-2.png` | 768 × 1365 | ✅ |
| Nutrition | `ChatGPT Image Oct 24, 2026, 09_17_59 PM-3.png` | 768 × 1365 | ✅ |
| Progress | `ChatGPT Image Oct 24, 2026, 09_17_59 PM-4.png` | 768 × 1365 | ✅ |
| You | `ChatGPT Image Oct 24, 2026, 09_17_59 PM-5.png` | 768 × 1365 | ✅ |

**No reference is missing.** The references are not in the repository. Adding them under `docs/redesign/reforge/references/` would let future phases cite them (D31). Phase 7.0 did not add them, because only this document may be created.

### 3.2 Canvas mapping and measurements

The mockups are 9:16. A 393 pt-wide iPhone is 393 × 852 pt. **Horizontal mapping** is reliable at **1.954 px per pt**. Vertical proportions are compressed and cannot be mapped literally. The values below were obtained by sampling luminance and colour edges in the PNGs (PowerShell `System.Drawing`). Values marked "est." carry roughly ±2 pt uncertainty from anti-aliasing.

| Measurement | Mockup (px) | ≈ pt at 393 pt width | Current app |
| --- | --- | --- | --- |
| Screen side margin (card edge) | 32 | **16** | 20 (`spacing.screen`, test-enforced) |
| Vertical gap between cards | 15–16 | **8** | 24 (`Screen` gap) |
| Card border | 1 px at about `#272727` | hairline | none (tonal) |
| Card corner radius | about 10–14 (est.) | **about 5–7 (est.)** | 16 |
| Card inner padding (Home hero text inset) | 26 | **about 13** | 16 |
| Home hero card height | 406 | 208 | content-driven |
| Home *Start workout* button | 345 × 61 | 177 × **31** | full width × 52 |
| Home hero title cap height / line pitch | 36 / 50 | 18.4 / 25.6 → **about 26 pt font, line height about 1.0** | title 22/27 |
| Train set input box | 144 × 37 | 74 × **19** | at least 64 wide, at least 44 tall |
| Train collapsed exercise row | 55 tall | **28** | (card header at least 44) |
| Train *Finish Workout* | 706 × 56 | 361 × **29** | dock button 52 |
| Tab bar (top edge to screen bottom) | 1212 → 1365 = 153 | **78** including home indicator | 56 + safe-area inset |
| FORGE wordmark width | 224 | **about 115** | not shown in app |

**Consequence:** controls and rows must keep the existing minimums (primary at least 52–54 pt, controls at least 44–48 pt). Screens will therefore be taller than the mockups and scroll more. Founder review should judge proportion and hierarchy, not absolute heights.

### 3.3 Sampled colours

| Sample | Value | Notes |
| --- | --- | --- |
| Background | `#040506` to `#0A0B0B` | Slightly lighter toward the top centre (vignette) |
| Card fill | `#08090A` to `#101112` | About the same as the background; the hairline defines the card |
| Card border | `#272727` | Neutral grey hairline |
| Primary button | `#F77620` (top) → `#D8511F` (bottom) | Vertical gradient. The label is dark (about `#0A0B0D`). Computed contrast at the darkest stop is ≈ 4.8:1 (AA) |
| Ember text and progress | `#F47522`, `#F8671C`–`#FB761E` | More saturated and yellower than the current `#F46B35`. Ember text on the background is ≈ 7:1 |
| Active card border (workout) | `#B2581D` | Ember at reduced intensity |
| Selected segment (Progress) | `#4E1F0A` → `#301609` with an ember border | Tinted selected state |
| Ring track | `#1A1514` | Warm dark track |
| Tab bar panel | `#0C0E0F` | Raised panel with a rounded top and a hairline |
| Hydration bar | `#36ABEF` | **Off-palette blue** (D11) |
| Positive delta | bright green on dark | Distinct from the current teal `success` |

### 3.4 Cross-tab visual language (consistent in all five references)

1. **Brand header:** steel FORGE wordmark (about 115 pt wide) with a letter-spaced tagline, "DISCIPLINE BUILDS FREEDOM", underneath. On the right are a notification bell with an ember dot and an ember-outlined **streak pill** (flame and number).
2. **Title block:** a large title or greeting (about 26–30 pt), a one-line grey subtitle, and a right-aligned date ("FRI, APR 25") and "Week 8 · Build Phase" in grey. *You* replaces this block with a profile header, and *Train* with a workout hero.
3. **Cards:** near-black fill, hairline border, small radius and an 8 pt gap. Each card has an **overline header** (letter-spaced caps, grey or ember), a hairline under the header and a chevron when it navigates.
4. **Metrics:** large white numbers with small grey unit and label text. Comparisons appear as small coloured deltas (green ↑, ember ↓ or neutral).
5. **Ember is used for:** primary CTAs (gradient), progress bars and rings, active states, small icons, overlines on hero cards, chart lines and bars, completion checks and the selected tab.
6. **Imagery:** right-aligned photographic or rendered objects (plates, food, athlete) that fade into the card through a dark gradient, often with small, vertical, letter-spaced taglines ("STRONGER / DISCIPLINED / FURTHER") and a short ember underline.
7. **Tab bar:** five tabs (Home, Train, Nutrition, Progress, You) on a raised panel with a rounded top. Line icons; the selected icon and label are ember.

---

## 4. Screen-to-reference mapping

**Classification used in every table**

| Code | Meaning | Needs approval? |
| --- | --- | --- |
| **R** | Existing data and behaviour, restyled | No (visual only) |
| **P** | New presentation component over existing data; no new formula | No, beyond the design itself |
| **D** | *Derived* presentation: a new aggregation or comparison computed from stored data, with nothing new stored | **Yes**: it creates a new displayed metric. Must be a pure, unit-tested function and must not change existing calculations. |
| **F** | New functionality or new stored data | **Yes**, and out of REFORGE scope by default |
| **X** | Fictional or not reproducible; omit or replace | Yes, if the founder wants it kept |

### 4.1 Home (reference 1) — current tab "Today"

**A. Existing implementation.** [Home.tsx](../../src/screens/Home.tsx), using the `Screen` title "Today" with a long-date eyebrow. Its sections are:

- `NextWorkout` hero card, driven by `nextSession()` in [today.ts](../../src/data/today.ts). It has seven states: active, paused, program today/upcoming, Path today/upcoming/missed, planned template (present or missing) and none. It has one primary button and a "Choose a Forge Path" text button when nothing is planned.
- "Your plan" `PlanRow`.
- "This week" (`weekGoalText` and `WeeklyConsistency`).
- "Recovery" check-in row.
- "Last session", plus a Workout history row.
- An onboarding redirect.

**B. Reference.** Brand header → greeting "Good afternoon, Alex." with a subtitle, date and "Week 8 · Build Phase" → **readiness strip** (87% Readiness, 7h 32m Sleep, 62 bpm HRV, High Energy) → **Today's Session hero**:

- ember overline, two-line condensed title, description;
- chips: 6 Exercises, ~60 min, Intermediate;
- gradient *Start workout* button and a bordered "…" button;
- plate photograph, vertical tagline and four pager dots.

Below the hero: a **Progress snapshot** card (bodyweight with delta, weekly volume with delta, day streak with dots) beside a **Nutrition today** ring card (kcal of target, macros with bars), then a **Next target** card (Bench Press, 95 / 100 kg, progress bar, plate image).

**C. Element mapping**

| Reference element | FORGE source | Class | Notes |
| --- | --- | --- | --- |
| Brand wordmark and tagline | `forge-wordmark.svg` | P | Tagline copy conflicts with the splash's "BUILT THROUGH DISCIPLINE" (D3) |
| Bell with unread dot | none (no notification centre) | X / F | Omit (D14) |
| Streak pill "🔥 12" | `summary().streak`, [metrics.ts](../../src/domain/metrics.ts): consecutive *calendar days* with a completed workout | R, with a semantics concern | A 3×/week lifter almost never exceeds 1. Consider a weekly streak (D) or hide (D8) |
| Greeting "Good afternoon, Alex." | `profile.name` and local time | P | Replaces the "Today" heading. The test asserts the "Today" header and no "Ready, " text (§5.3) |
| Subtitle "Consistent effort compounds…" | static copy | P | Copy approval (D29) |
| Date "FRI, APR 25" | `longDayLabel()` | R | |
| "Week 8 · Build Phase" | `NextSession.week` (program or Path) and the program phase `name` ([programs/model.ts](../../src/domain/programs/model.ts)) | R / P | Shown only with an active plan. Uses the real phase name |
| Readiness 87% | Check-in self-rated `readiness` (1–5, "Not at all … Fully") in [checkins.ts](../../src/domain/checkins.ts); legacy `readiness()` score exists in metrics.ts | R (text) / **D** (%) | WP4C deliberately computes no score. Recommend showing the self-rated word ("Mostly ready") (D9) |
| Sleep 7h 32m | Check-in `sleep` and `sleepText()` | R | Only when today's check-in exists |
| HRV 62 bpm | none (and HRV is measured in ms, not bpm) | X / F | Needs a Health integration (D10). Possible substitute: Soreness (R) |
| Energy "High" | Check-in `energy` scale ("Drained … Energised"; "High" is a real word) | R | |
| Strip with no check-in today | `onDay()` empty | P | One "Check in" call to action (`/journal?kind=recovery`) replaces the strip |
| Hero overline, title, description | `hero()` overline and title; program session `notes` or template `notes` | R / P | Mockup copy ("Build strength. Add quality volume…") is generic; use real notes or omit |
| Chip "6 Exercises" | Session or template exercise count | P | |
| Chip "~60 min" | none (`profile.duration` is a preference, not an estimate) | X / D | D21 |
| Chip "Intermediate" | `CuratedProgram.experience` | R | Program sessions only |
| *Start workout* | `startNextSession()` and `blockIfTraining` | R | All seven states must be designed. Labels: Resume / Start / Start early / Choose a template |
| "…" button | `OverflowMenu` with existing actions: open plan, choose a template, Forge Paths | P | No new actions |
| Pager dots | no multi-session carousel | X | Omit (or F) |
| Plate image and vertical tagline | asset, copy | P | §8 |
| Snapshot: bodyweight 82.4 kg | Latest `measurement` weight series ([measurements.ts](../../src/domain/measurements.ts)), else `profile.weight` | R | |
| "−1.2 kg vs 4 weeks ago" | — | **D** | D19 |
| Weekly volume 12,480 | `summary().weeklyVolume` (kg, display-unit converted) | R | The mockup omits the unit; FORGE must show it |
| "+18% vs last week" | — | **D** | D19 |
| Day streak 12, "Keep it going", dots | `summary().streak` | R / X | Dot meaning unclear; omit or show this week's days (`WeeklyConsistency`, R) |
| Nutrition ring 1,940 / 2,400 kcal and macros | `totalsOf(entriesOn(…, today))`, `targetsPersonalized()` | R / P | `ProgressRing` exists (unused). Without personalised targets, show only kcal eaten and "Set targets" (existing rule) |
| Next target: Bench Press 95 → 100 kg | `evaluate()` → `GoalView` in [goals.ts](../../src/domain/goals.ts) | R / D | Which goal to show is a new rule (D18). Empty state: "Set a goal" |

**Existing Home content absent from the reference that must stay reachable:** "Your plan" row, "This week" goal text and consistency, Recovery check-in row, Last session (review), Workout history, "Choose a Forge Path" and the onboarding redirect. Recommendation: keep plan and week context inside the hero, and place **This week, Last session and History** below Next target in the REFORGE card style (D30).

**D. Risks.** The `nextSession` priority and start paths must be unchanged (today-train tests). The hero must handle long names (three-line title limit today), paused and missed states, and compact widths. The two-column snapshot and nutrition row needs a stacked fallback on compact devices or large text. Image decoding must not delay first paint.

### 4.2 Train (reference 2) — the active workout logger

**A. Existing implementation.**

*Train hub* ([train.tsx](<../../app/(tabs)/train.tsx>)): plain rows with no ember (test-enforced):

- **Plan:** `PlanRow`, Forge Paths.
- **Workouts:** Empty workout, three templates with tonal Start buttons, Templates.
- **Exercises:** Search, Library, Create custom.
- **History:** three recent workouts, All history.
- A `TemplateSheet` for template details.

*Workout logger* ([Workout.tsx](../../src/screens/Workout.tsx), a fullScreenModal without the tab bar):

- A header with back, title, a status line ("x of y sets · volume"), the live clock and an overflow menu.
- A `ScrollView` of [WorkoutExerciseCard](../../src/components/WorkoutExerciseCard.tsx). Each card is collapsible and contains [SetGrid](../../src/components/SetGrid.tsx) with SET | PREV | KG | REPS | RIR | ✓ in wide, compact or stacked mode, "Use previous", set details (kind, RPE/RIR, side, tempo, notes), advice and progression rows, and exercise settings.
- An *Add exercise* button.
- A dock with `RestTimer` (idle pill, or countdown with +30 and Skip) and *Finish*. *Resume* replaces the timer when paused, and the dock adapts to the keyboard on Android.
- An iOS keyboard toolbar (rest, Next, Done).
- Sheets for rename, notes, default rest, save as template, `FinishSheet` and `ReorderSheet`.
- Review mode and edit mode (Save / Cancel) for completed workouts.

*Other Train screens:* Forge Paths Library, Details and Dashboard, LegacyPath, Templates, Explore, Exercise, History, Calendar.

> Note: [docs/redesign/STATUS.md](../redesign/STATUS.md) says the workout uses a FlatList; the code uses a `ScrollView`. This matters for long-workout performance (§11).

**B. Reference.**

- A full-bleed **hero** behind the brand header: plate photograph, ember overline "WORKOUT IN PROGRESS", condensed title "PUSH — CHEST & BACK", and "Week 8 • Build Phase >".
- A **session timer card**: stopwatch icon, "32:18", "EST. TIME LEFT ~27 min" and an ember-outlined *Pause* button.
- A **Workout progress** card: ember bar, "3 / 6 exercises", "50%" pill.
- An **expanded exercise card** with an ember border:
  - a numbered circle, name, "Barbell • Chest", a bordered ⋮ and a collapse chevron;
  - a table SET | WEIGHT (KG) | REPS | STATUS with bordered input boxes; the next set's inputs have ember borders and completed sets have ember check discs;
  - a **REST TIMER ring** (1:24 / 2:00, *+30s*) to the right of the table;
  - *Add set* and an inline "Notes (optional)" field.
- **Collapsed rows** for the other exercises: number, name, equipment • muscle, "3 × 8–10", a status circle and a chevron.
- A full-width gradient *Finish Workout* bar **above a visible tab bar** with Train selected.

**C. Element mapping**

| Reference element | FORGE source | Class | Notes |
| --- | --- | --- | --- |
| Hero image, overline, title | `workoutTitle(w.name)`, status | R / P | Hero must **collapse on scroll**: about 280 pt of hero would push logging below the fold (D22) |
| "Week 8 • Build Phase >" | `programWorkoutContext()` week and phase; link to the plan | R / P | Program or Path workouts only |
| Brand header, bell and streak on the logger | — | P | Recommend omitting them inside the logger to keep focus and space (D22) |
| Session timer 32:18 | `SessionClock` (isolated 1 s re-render) | R | Keep it isolated from the list |
| "Est. time left ~27 min" | none | X / D | D21 |
| *Pause* (prominent) | `r.pauseWorkout()`, currently in the overflow menu | R | Promotion is visual; *Resume* state must be designed |
| Progress "3 / 6 exercises, 50%" | Count of rows whose sets are all completed | **D** (light) | The current status uses *sets* ("4 of 18 sets"). Choose the unit (D23) |
| Numbered exercise card, name, "Barbell • Chest" | `Exercise.equipment`, `muscle` | R | |
| ⋮ exercise menu, collapse chevron | Existing exercise menu and expand state | R | |
| Table SET / WEIGHT / REPS / STATUS | `SetGrid` SET / PREV / KG / REPS / RIR / ✓ | R, with a **conflict** | The reference drops **PREV** (previous performance, "Use previous") and **RIR** (program effort targets). Both are functional: keep and restyle (D22) |
| Bordered input boxes; ember borders on the next set | `NumberCell`; the next unfinished set is derivable | P | Inputs at least 44 pt tall (the mockup's are 19 pt) |
| Ember check discs | Completed state (currently a `successSubtle` green row tint) | R, with a colour change | Completion colour change (D7) |
| Rest ring 1:24 / 2:00, *+30s* | `RestTimer`: `restDeadline` setting, +30, Skip | R / P / small F | The ring needs the rest *total*, but only the deadline is stored. Adding a `restTotal` settings key is a small, non-schema addition (D24). **Placement beside the grid** removes about 150 pt of width and forces the grid out of "wide" mode on every phone. Recommend the dock or above the active card (D22) |
| *Add set* | Existing | R | |
| Inline "Notes (optional)" | Exercise `row.notes` (in exercise settings today) | R / P | Inline field means more vertical space per card; consider showing it only when it has content plus an "Add note" action |
| Collapsed rows with "3 × 8–10" | `row.target` (`RepTarget`) or set count; summary exists | R | Row height at least 56 pt (the mockup's is 28 pt) |
| Status circle per row | All sets completed | P | |
| *Finish Workout* bar | `finish()` → `FinishSheet` | R | Keep the dock with rest timer and Finish. The tab bar is not shown (fullScreenModal) (D22) |

**Logger functionality absent from the reference that must remain:**

- *Add exercise*, the idle rest pill, the default-rest sheet, the keyboard toolbar (Next / Done / rest), reorder, rename, workout notes, save as template, discard or delete.
- Paused, lower-fatigue, review and edit modes.
- Advice and progression rows, set kinds (warm-up, drop, failure), RPE/RIR, unilateral sides, tempo and set notes, and the stacked grid at large text sizes.

**Train hub, Forge Paths and Templates have no reference.** The plan is to derive them from §3.4: a *Current plan* hero card with plate imagery and week/phase progress, quick-start tiles (Empty workout and templates), program cards in the library, exercise library and history cards. A derived mock or screenshot must be approved before 7.2 implementation (D28).

**D. Risks.**

- Logging speed is the top priority. Do not add per-second renders to the list. The hero collapse must be driven by Reanimated `useAnimatedScrollHandler` on the UI thread.
- Keyboard handling (iOS `InputAccessoryView`, Android `KeyboardAvoidingView`) is fragile.
- The responsive set grid is covered by WP6 tests.
- Tests: `redesign`, `workout-logger`, `workout-wp2`, `wp6`, `legacy-workouts`.

### 4.3 Nutrition (reference 3) — currently a secondary screen

**A. Existing implementation.** [Nutrition.tsx](../../src/screens/Nutrition.tsx) is reached at `/journal?kind=nutrition`, with back falling back to You. It contains:

- `DaySwitcher` (past days);
- an undo banner;
- [MacroSummary](../../src/components/nutrition/MacroSummary.tsx): kcal against the target only when targets are personalised, then remaining kcal, a calories bar and protein, carbs and fat with bars, falling back from three columns to stacked rows;
- an empty-day hint;
- `MealSection` per meal (Breakfast, Lunch, Dinner, Snacks, then legacy meal names and unassigned entries). Each section shows a kcal total and an *Add* button, and each entry row has an overflow menu (Edit, Copy to today, Save as food, Delete);
- "Dated after today" entries;
- a Saved foods row;
- an *Add food* footer that opens [QuickAddSheet](../../src/components/nutrition/QuickAddSheet.tsx) (recent and saved foods, one-tap logging with Undo, food library search);
- `FoodEditorSheet`.

Targets are edited on You (`?edit=nutrition`).

**B. Reference.**

- Brand header, title "Nutrition", subtitle "Fuel your progress…", date and week/phase.
- **Today's Nutrition** hero: "1,940 of 2,400 kcal", an ember bar at 81%, and protein, carbs and fat with mini bars. A food-bowl photograph fades in from the right, with a vertical tagline.
- Two half-width cards: **Calorie goal** (2,400 daily goal; consumed, remaining and % complete) and **Nutrition streak** (12 days "On track", M–S dots).
- **Today's meals** timeline: time, meal icon, food photo, meal name, food names, kcal and P/C/F per meal, and a chevron.
- **Quick add** tiles (Apple, Banana, Egg, Chicken, each with kcal).
- **Hydration** (2.1 of 3.0 L, a blue bar at 70%, a bottle photograph).
- The Nutrition tab is selected.

**C. Element mapping**

| Reference element | FORGE source | Class | Notes |
| --- | --- | --- | --- |
| Nutrition as the third tab | `/journal?kind=nutrition` today | **IA change** | Add `app/(tabs)/nutrition.tsx`. The screen gains a tab mode without Back. The existing `/journal?kind=nutrition` links (You, Progress, tests) keep working (D2) |
| Title, subtitle, date, week/phase | — | P / R | Copy (D29) |
| Hero: kcal of target, bar, % | `totalsOf`, `p.calories`, `targetsPersonalized` | R | % is presentation of existing numbers. Never show a target that is not personal; keep the "Set your daily targets" state |
| Hero macros with bars | `MacroSummary` | R | Keep the stacked large-text fallback |
| Hero food photograph | — | Asset | §8; not a photo of the user's food |
| Calorie goal card (goal, consumed, remaining, %) | Same data | R / P | Duplicates the hero; consider merging (D29) |
| Nutrition streak "12 days On track" | No streak exists. **A goal of type `nutrition` (daily calories at least or at most) has per-day history in `evaluate()`** | **D** / R | Recommend showing it only when a nutrition goal exists ("days on target this week", from goal history). Otherwise "Days logged this week" (D) or omit (D12) |
| Week dots M–S | Per-day logged or on-target status | D | Same decision |
| Meal rows: Breakfast, Lunch, Dinner, Snack | `groupByMeal()`; `MEALS` uses "Snacks" | R | Legacy and unassigned groups must still render |
| Meal time "7:00 AM" | No eating time; `createdAt` is logging time | X / D | Omit (D13) |
| Meal photo | No food images exist | X | Replace with meal-type icon tiles (sun or moon, etc.) |
| Food names "Greek Yogurt Bowl" | Entry names joined | P | |
| Per-meal kcal and P/C/F | `group.totals` | R | |
| Meal chevron → detail | Entries are listed inline today | P | Meal detail could expand inline or open a sheet. Edit, copy, save as food and delete must stay reachable per entry; *Add to meal* must stay |
| Quick add tiles | QuickAddSheet recent and saved foods (one tap, Undo) | R / P | Tiles show the user's **real** recent or saved foods, never hard-coded "Apple / Banana" (X) |
| Hydration | No data | **F** | Would need a new journal kind (validation, sync, backup) or a setting. The blue is off-brand. Omit unless approved (D11) |
| (Not in reference) DaySwitcher, "Dated after today", Saved foods, *Add food* | Existing | R | Must stay; DaySwitcher belongs under the title block |

**D. Risks.** Nutrition tests are heavy (`tests/ui/nutrition.test.tsx`, `food-library.test.tsx`, `nutrition.test.ts`). The food-library warm-up timing must be preserved. Accessibility labels for entries are rich today and must be carried into any meal summary. The undo banner announces itself. Back-navigation semantics change when the screen becomes a tab.

### 4.4 Progress (reference 4)

**A. Existing implementation.** [Progress.tsx](../../src/screens/Progress.tsx) shows:

- a range `SegmentedControl` (4 weeks, 12 weeks, 1 year, All; default 12w);
- an Overview card (Workouts, On plan % or Active weeks, Records, Volume);
- Consistency (bars of completed against planned, with a legend);
- Saved plans adherence (legacy);
- Strength (exercise picker, Est. 1RM / Heaviest set, line chart, latest against previous);
- Records (three in range, plus All records);
- Volume (working sets, load, bars, sets by primary muscle);
- Training time (average, total, day streak);
- Body (measurement series chips and a line chart);
- More (History, Calendar, Milestones sheet, Measurements, Nutrition, Recovery, Goals);
- an empty state for new lifters;
- `InfoButton` explanations on each section.

**B. Reference.**

- Brand header, title "Progress", subtitle, date and week/phase.
- Range segments 7D | 4W | 12W | 1Y | All, with 4W selected in ember.
- **Bodyweight** card: current 82.4 kg, start value (Apr 1), end value (Apr 25), "−1.2 kg (−1.4%)" in ember, and a line chart with an area gradient, y-axis labels, gridlines, x dates and a callout bubble on the last point.
- **Training volume** card: 12,480 kg, "↗ +18% vs last 4 weeks" in green, a *Total Volume | Workouts* toggle, and about 28 daily ember bars with a "14.2K kg" callout.
- **PR highlight** (Bench Press 95 kg, "+5 kg New Personal Record", plate image) beside **All-time stats** (48 workouts, 12,480 kg total volume, 7h 32m total training time).
- **Milestones** tiles: 4-Week Streak, 95 kg Bench Press, +18% Training Volume, and an 80 kg bodyweight target ring at 60%.
- **Next goals**: Bench Press, 95 → 100 kg, with a bar.

**C. Element mapping**

| Reference element | FORGE source | Class | Notes |
| --- | --- | --- | --- |
| Range 4W / 12W / 1Y / All | `rangeWindow`, `rangeLabels` | R | Labels shortened visually; spoken labels stay full |
| Range **7D** | — | **D** | Needs a new range key and daily bucketing in [range.ts](../../src/domain/progress/range.ts), which is a domain change (D20) |
| Bodyweight current, start and end of range | Measurement weight series (`seriesOf`) | R | Today's Body card supports any measurement series via chips; keep that ability (bodyweight first) |
| "−1.2 kg (−1.4%)" | First against last in range | **D** | Neutral or ember colour, not green or red: weight loss is not inherently good (D19) |
| Line chart with area, grid, y labels, callout | `LineChart` | P | Restyle by props (stroke colour, area fill, grid, callout). Keep gaps (`breakOver`) and adjustable accessibility |
| Training volume total | `volumeBuckets(...).loadVolume` | R | |
| "+18% vs last 4 weeks" | — | **D** | Needs the previous equal-length window (D19) |
| Toggle *Total Volume / Workouts* | `volumeBuckets` and `bucketSummaries().completed` | R / P | Both series exist |
| ~28 daily bars | Buckets are weekly or monthly today | **D** | Daily buckets for 4W are a new aggregation. Weekly bars (R) are the safe default (D20) |
| PR highlight: Bench 95 kg | Latest `RecordEvent` and `recordHeadline()` | R | |
| "+5 kg" over the previous best | `RecordEvent` has no previous value | **D** | Previous best of the same category from the event history (D19) |
| All-time: workouts, total volume, total time | `summary().count`, `.totalVolume`, `elapsedSeconds` sum (as in You) | R | |
| Milestones tiles | `achievements()`: five fixed (First spark, 10, 100, 10,000 kg, first PR) | R / X | Reference tiles (4-week streak, +18% volume) don't exist. Show real achievements and goal progress; new milestone types are F |
| Bodyweight target ring 60% | Bodyweight goal `GoalView` progress | R | `ProgressRing` exists |
| Next goals | `evaluate()` over active goals | R | |
| (Not in reference) Overview, Consistency against plan, Strength chart and picker, Records list, Sets by muscle, Training time, Saved plans, More links, `InfoButton` explanations, empty state | Existing | R | **Must remain.** These carry the calculation-backed value of Progress. Proposed order: Range → Bodyweight → Volume → PR and All-time → Strength → Consistency → Records → Milestones and Goals → More |

**D. Risks.**

- Calculation accuracy: no edits to `src/domain/progress/**` without approval; derived metrics go in new pure functions.
- Colour semantics: bars move from green to ember, and the planned-target outline and legend must stay legible.
- Charts with 52+ bars at 1Y.
- `progressModel` memoisation stays.
- Tests: `progress.test.tsx`, `progress-*.test.ts`.

### 4.5 You (reference 5)

**A. Existing implementation.** [You.tsx](../../src/screens/You.tsx) shows:

- a profile card (initials avatar with an ember ring, name, "experience · goal", "Training since", a plan row or "No active plan", a complete-training-profile prompt and *Edit profile*);
- a Training snapshot (Workouts, Working sets, Records, Time trained, View progress);
- a Forge Premium placeholder card;
- **Training:** Training focus, Training preferences, Nutrition targets, Training history;
- **Health & body:** Measurements, Nutrition log, Recovery, Goals;
- **Notifications:** reminders switch;
- **App:** Units and Appearance segments;
- **Account & data:** account and sync, export, import, privacy, delete all data;
- **About:** version, plus Replay intro and Design system in development builds;
- ProfileForm sheets.

**B. Reference.**

- Brand header.
- **Profile header:** large photo avatar with an ember ring and edit badge, "Alex Carter", tagline "BUILDS STRENGTH. LIVES FREER.", "Strength Focus", "Austin, TX" and "Member since Jan 2024".
- **FORGE ATHLETE LEVEL 4** card (1,250 / 2,000 XP).
- **Stats strip:** 12 Day Streak, 28 Workouts Completed, 7 Weeks Consistent, 3 Personal Records, each with a chevron.
- **Primary goal** hero: "GET STRONGER AND LEANER", description, 78% complete, *View Goals*, athlete photograph.
- **My stats:** Bodyweight 82.4 kg (↓ −1.2 kg vs 4 weeks), Height 178 cm (no change), Body fat 18.6% (↓ −2.4% vs 8 weeks), Bench Press 1RM 95 kg (↑ +10 kg vs 12 weeks).
- **Tools & settings:** Goals, Recovery, Preferences, Account.

**C. Element mapping**

| Reference element | FORGE source | Class | Notes |
| --- | --- | --- | --- |
| Photo avatar and edit badge | Initials `Avatar` | R / **F** | A photo needs `expo-image-picker`, file storage and a backup-format decision. Recommend a monogram (D16) |
| Name | `profile.name` | R | |
| Tagline "BUILDS STRENGTH…" | — | X | Omit or use the training goal (D17) |
| "Strength Focus" | `trainingGoal(p)` | R | |
| "Austin, TX" | — | X | Omit (D17) |
| "Member since Jan 2024" | "Training since" (first completed workout) | R | Copy stays truthful: "Training since" |
| Level 4, XP bar | — | **F** | Gamification is out of scope (D15). Proposed substitute in the same slot: **Current plan** card (program name, Week x of y, phase, progress bar) from `planStatus`/enrollment (R) |
| Stats strip: day streak, workouts, PRs | `summary().streak`, `done.length`, `model.events.length` | R | Chevrons → History, Records |
| "7 Weeks Consistent" | `consistency().activeWeeks` (range-relative) | **D** | Needs a lifetime or consecutive definition (D19) |
| Primary goal hero, % complete | Goals `evaluate()` | R / **D** | No "primary" concept exists. Most recently created active goal (D), or pinning via a settings key (F) (D18) |
| Athlete photograph | — | Asset | §8; avoid a stranger's face on the user's personal page |
| My stats: bodyweight, height, body fat | Measurements or `profile.weight`/`height`/`bodyFat` | R | |
| Deltas "vs 4 / 8 / 12 weeks ago" | — | **D** | Three different windows in the reference; standardise (D19) |
| Bench Press 1RM 95 kg | `ExerciseRecords.e1rm` for `barbell-bench-press` | R / D | Which lift? Bench by default, or the user's most-trained barbell lift (D19) |
| Tools: Goals, Recovery, Account | `/journal?kind=goal`, `?kind=recovery`, `/account` | R | |
| Tools: Preferences | Units, Appearance, Notifications and Training preferences, inline today | P / nav | A new Preferences screen or sheet that groups the existing controls |
| (Not in reference) Edit profile, plan row, complete-profile prompt, training focus, nutrition targets, measurements, history, membership card, export, import, privacy, delete data, about/version, dev rows | Existing | R | **Must stay reachable** (enforced by `you.test.tsx`). Proposal: extend *Tools & settings* (Measurements, Nutrition targets, Training focus) and add *Data & privacy* and *About* groups below |

**D. Risks.** Destructive confirmations and import/export flows must stay unchanged. `?edit=` deep links (from Library and Nutrition) open editors. Theme switching. Light mode (D5). Large-text layouts for the four-column stats strip and four-column My stats (wrap to 2 × 2 on compact widths and large text).

---

## 5. Existing design-system assessment

### 5.1 Strengths to keep

- **Typed tokens** with legacy aliases, **tested contrast** in both palettes, a 4 pt grid and 44 pt targets.
- **Responsive and accessible typography:** size classes, Dynamic Type caps and uppercase handling for screen readers.
- **Mature primitives:** the `Sheet` unsaved-input guard, `OverflowMenu`, adjustable charts and responsive set grid. These are behaviour, not just looks, and must be reused.
- **A development design-system screen** with a render test. This is the natural place to preview REFORGE components.

### 5.2 Gaps against the references

| Topic | DS 2.0 today | REFORGE references | Gap |
| --- | --- | --- | --- |
| Accent use | One ember action per screen; none in navigation or Train | Ember on CTAs, overlines, icons, bars, rings, checks, selected tab, borders | Doctrine change (D1) |
| Ember hue | Flat `#F46B35` | `#F77620` → `#D8511F` gradient; text and bars about `#F47522` | New ember scale |
| Surfaces | Tonal `#141619`, no border | About background-coloured fill with a `#272727` hairline border | New card variants |
| Radius | Card 16 | About 5–7 pt (est.) | New radius token |
| Margin and gaps | 20 / 24 | 16 / 8 | Spacing change (D6) |
| Display type | System 800, 32 pt, mixed case | Condensed heavy uppercase hero titles (about 26–30 pt); large mixed-case screen titles | Display font (D4) |
| Overlines | 11 pt grey | 11 pt, about +2.5 tracking, grey or **ember** on hero cards | Token variant |
| Imagery | None | On every tab | Asset pipeline (§8) |
| Brand presence | None inside the app | Wordmark header on every tab | New `BrandHeader` |
| Tab bar | Flat, hairline, white selection | Raised rounded panel, ember selection, five tabs | Restyle, IA (D2) |
| Charts | Green bars and lines, no axes | Ember line and area, gridlines, y labels, callouts | Chart props |
| Completion | Green `successSubtle` row | Ember check disc | Semantics (D7) |
| Depth | Tonal | Gradients, glow, vignette | Gradient primitive (§11) |

### 5.3 Rules and tests that REFORGE would supersede (approval needed: D1, D27)

| Test (file → test name) | Current assertion | REFORGE conflict |
| --- | --- | --- |
| `tests/ui/navigation.test.tsx` → "four destinations navigate…" | 4 tabs; label "Today" | 5 tabs; "Home" |
| `tests/ui/navigation.test.tsx` → "the selected tab is white, never orange" | Selected tab color = `dark.text` | Ember selection |
| `tests/ui/today-train.test.tsx` → "Today is a plain heading with one primary action and no duplicated metrics" | Header "Today"; no "Day streak"; no "Ready, " | Greeting; streak and metrics on Home |
| `tests/ui/today-train.test.tsx` → "Train is a hub of rows with no orange primary button" | No `dark.ember` anywhere in Train | Ember accents on Train |
| `tests/design-tokens.test.ts` → "interactive sizes … spacing follows the 4 pt grid" | `spacing.screen === 20` | 16 pt margin (if D6 is approved) |
| `tests/design-tokens.test.ts` → "the type scale has six text roles and two tabular numeric roles" | Exact role key list | New display or hero roles must be added deliberately |
| Contrast tests (`design-tokens`, `wp6-contrast`) | AA rules | **Keep.** New tokens must pass the same rules |
| `tests/ui/you.test.tsx` → "account, history, journals and data actions stay reachable" | Reachability | **Keep** (it guards preservation) |

---

## 6. Proposed visual architecture (REFORGE layer)

**Principle: additive tokens, opt-in components.** REFORGE tokens are *added* to `theme.ts` under new keys (for example `palette.reforge.*`, or new keys alongside the existing ones), and existing keys keep their values until 7.6. Nothing in `withLegacyAliases` changes. This lets a REFORGE screen and an untouched secondary screen coexist without regressions.

All values below are **proposals** derived from §3.2–3.3. They are to be confirmed on device in 7.1-0 and must pass the existing contrast tests.

### 6.1 Ember usage rules (replacing "one ember per screen")

Ember means **action, progress and live state**:

- the primary CTA (gradient);
- progress fills (bars, rings);
- the selected tab and selected segment;
- hero overlines;
- the active or next-set focus border;
- completed-set checks (if D7 is approved);
- chart series.

**Never** use ember for:

- destructive actions;
- negative or positive judgement of numbers (bodyweight down is not "good");
- body text;
- more than one *filled* gradient CTA per viewport.

Positive deltas use a dedicated `positive` green, and only where "up" is unambiguously good (volume, records, workouts).

### 6.2 Colour tokens (dark)

| Token (proposed) | Value | Use |
| --- | --- | --- |
| `bg` | `#07080A` (sampled `#040506`–`#0A0B0B`) | App background |
| `bgGlow` | Radial `#101214` → transparent, top centre | Subtle vignette behind the header (optional, D-spike) |
| `card` | `#0C0D0F` | Standard card fill |
| `cardBorder` | `#26282B` | 1 hairline on every card |
| `cardRaised` | `#141619` | Tiles, chips and inputs inside cards (≈ current `surface`) |
| `inputBorder` | `#2C2F33` | Bordered numeric inputs |
| `divider` | `#1E2023` | In-card dividers (under card headers, between strip columns) |
| `text` / `text2` / `text3` | Keep `#F4F2EE` / `#A4A9B0` / `#6E747C` | Already AA-tested |
| `emberTop` / `ember` / `emberBottom` | `#F77620` / `#F26A1F` / `#D8511F` | CTA gradient; `ember` for flat fills, text and icons |
| `emberMuted` | `#B2581D` | Active-card border |
| `emberTint` | `#2A1408` to `#4E1F0A` | Selected segment and tab fill, ring track glow |
| `onEmber` | `#0A0B0D` | CTA label (≈ 4.8:1 at `#D8511F`) |
| `positive` | About `#4ADE80`-family green, tuned for AA | Upward good deltas |
| `success` / `warning` / `error` | Keep | Status |

The light palette has no reference (D5). The recommended interim is a mechanically mapped light palette that keeps every screen usable and AA-compliant at lower fidelity.

### 6.3 Typography

- **Display family (new, D4):** a licensed SIL OFL condensed or semi-condensed heavy sans. Candidates to proof on device:
  - **Saira Semi Condensed** (ExtraBold / Bold)
  - **Barlow Semi Condensed** (ExtraBold / Bold)
  - **Rajdhani** (Bold)
  - **Oswald** (SemiBold / Bold)
- Bundle two weights only, in `assets/fonts/`, loaded with `expo-font` (already a dependency; works in Expo Go). Confirm that the family's tabular figures work for metrics.
- **Body and UI text stay on the system font** (SF Pro / Roboto) for legibility and Dynamic Type.

| Role (proposed) | Face | Size / line (est.) | Use |
| --- | --- | --- | --- |
| `heroTitle` | Display, 800, uppercase | 26–30 / about 1.0× | Session and workout titles, primary goal |
| `screenTitle` | System 700–800 | 28–30 / 34 | "Nutrition", "Progress", greeting |
| `heroMetric` | Display or system 700, tabular | 40–44 / 46 | 1,940 kcal, 82.4 kg, 32:18 |
| `cardMetric` | System 700, tabular | 20–24 / 26 | Card numbers |
| `overline` | System 600–700, uppercase, +2.4 tracking | 11 / 14 | Card headers (grey) and hero overlines (ember) |
| `brandTagline` | System 600, uppercase, about +3 tracking | 8–9 / 11 | Under the wordmark (decorative, hidden from screen readers) |
| `body`, `caption` | Keep existing roles | | |

Existing `maxFontScale` caps extend to the new roles. A condensed display face at about 1.3× still needs a two-line limit and `fit`.

### 6.4 Spacing, radii, sizes

- **Margin** 16 (D6) · **card gap** 8–12 · **card padding** 14–16 · **in-card group gap** 8–12 · **section header to card** 8.
- **Radii:** card 8 (the reference estimate is 5–7; 8 is the proposal pending device proofs), tile and input 8, CTA 10, pill 999, sheet 24 (unchanged).
- **Heights unchanged:** primary 54, control 48, compact 44, rows at least 56. The reference's smaller heights are not adopted (§3.2).

### 6.5 Surfaces, elevation, gradients

| Variant | Construction |
| --- | --- |
| `Card` | `card` fill, 1 hairline `cardBorder`, radius 8, optional very subtle top-to-bottom gradient (2–3% lighter at the top) |
| `Card.header` | Overline, optional trailing value or "See all" and chevron, hairline divider beneath. The whole header is pressable when it navigates |
| `HeroCard` | Image layer (right-aligned, `resizeMode: cover`) + left-to-right scrim gradient (`bg` at 100% → 0% at about 55% width) + bottom scrim, content on the left, optional vertical tagline and ember underline |
| `ActiveCard` | `emberMuted` 1 pt border + faint ember glow (shadow or `boxShadow` if verified) |
| `Tile` | `cardRaised` fill + hairline, radius 8 (chips, quick-add tiles, milestone tiles) |
| `Strip` | One card divided by vertical `divider` lines (readiness strip, stats strip) |
| Elevation | Only the tab-bar panel, sheets and menus float (`floating` shadow). Cards stay flat with a hairline |

Gradient implementation is decided in the 7.1-0 spike (§11). The default is `react-native-svg` `LinearGradient`/`RadialGradient`, because it is already installed and works in Expo Go.

### 6.6 Buttons and inputs

| Control | Style |
| --- | --- |
| Primary CTA | Ember vertical gradient, `onEmber` label 16–17 pt / 700, leading icon, radius 10, height 54. Pressed: darker gradient and scale 0.98 (reduce motion: colour only) |
| Outline (ember) | Transparent, 1 pt ember border, ember label (*Pause*) |
| Outline (neutral) | Transparent, 1 pt `inputBorder`, white label (*View goals*, "…" square icon button) |
| Segmented | `card` track with hairline; selected = `emberTint` fill + ember border + white label |
| Numeric input | `cardRaised` fill + `inputBorder`, radius 8, centred tabular metric, at least 44 pt tall. Focus or next set: ember border |
| Text field | Same frame; placeholder `text2` (existing rule) |
| Check (set status) | 28 pt disc inside a 44 pt target. Empty: hairline ring. Done: ember fill and dark check (D7) |
| Disabled | Keep the 40% opacity rule |

### 6.7 Tab navigation

- Five tabs (D2): **Home, Train, Nutrition, Progress, You**. Line icons at 24 pt:
  - `home-outline`
  - `barbell-outline` (or a custom horizontal dumbbell)
  - `restaurant-outline`
  - `stats-chart-outline` (or a custom bars glyph)
  - `person-outline`
- **Selected:** ember icon and label (with a filled variant where it reads well). **Idle:** `text2`.
- **Container:** a raised panel (`#0C0E0F`) with 20–24 pt top radii, a hairline top border and the `floating` shadow. Height at least 56 plus the bottom safe area.
- The **resume banner** stays above the tabs and is restyled as an `ActiveCard` strip with an ember live dot.
- Keep `accessibilityRole="tab"`, the selected state, and `maxFontSizeMultiplier` on labels. The 11 pt label must not truncate at five tabs on a 375 pt phone: "Nutrition" is the widest label and must be checked.

### 6.8 Icons

Ionicons covers most needs: flame, notifications, time, bed, heart, flash, trophy, ribbon, water, scale, body, restaurant, sunny and moon. **Custom SVG** (a small `src/components/reforge/icons.tsx` with `react-native-svg`) is needed for the horizontal dumbbell, plate and FORGE flame badge if the founder wants the reference glyphs exactly. Sizes:

- 16 pt inline with captions
- 20 pt in card headers and strips
- 24 pt in the tab bar and leading icons
- 28–32 pt for hero and stat icons

### 6.9 Chart conventions

| Element | Convention |
| --- | --- |
| Line | 2 pt ember stroke. Area fill: ember 28% → 0% vertical gradient. Points: 3 pt dots. Last or selected point: ring with a callout bubble (value) |
| Bars | Ember at 85% (selected or latest 100%, with a brighter top), radius 3. The planned-target outline stays (`text3`), with a legend |
| Grid | Three to four dashed hairlines (`divider`), y labels caption `text3`, x labels at up to four evenly spaced dates |
| Interaction | Existing tap or scrub to select. Selection haptic on change (new). The adjustable screen-reader role and per-point descriptions are kept |
| Motion | Draw-in once on first view (400–600 ms); none with reduce motion |

### 6.10 Motion and haptics conventions

| Token | Duration | Easing | Use |
| --- | --- | --- | --- |
| `press` | 100 ms | standard | Press scale and colour |
| `quick` | 160 ms | standard `cubic(0.2,0,0,1)` | Icon and colour swaps, tab change, check fill |
| `expand` | 240 ms | emphasised decelerate | Card expand or collapse, hero collapse |
| `progress` | 300–600 ms | decelerate | Bars, rings, count-ups (first appearance only) |
| `sheet` | Existing `Modal` fade | — | Unchanged |

All motion runs on the UI thread (Reanimated) and checks `useReducedMotion()`.

**Haptics (proposed rules):**

| Haptic | When |
| --- | --- |
| selection | Discrete choices: segments, tabs (optional), chart scrub step |
| light impact | Set completion (exists), quick-add logged |
| success | Rest finished (exists), workout saved, PR achieved, goal achieved |
| warning | Never automatic; only before destructive confirmations, if desired |

Never fire haptics on scroll or per keystroke. Note: `mutate()` currently emits a selection haptic on every save, including text fields saved per keystroke. Changing this is a **behavioural** change (D27a).

### 6.11 States

| State | Treatment |
| --- | --- |
| Loading | Card-shaped skeletons (`LoadingSkeleton` restyled). No shimmer when reduce motion is on |
| Empty | The card keeps its frame and header, with one honest sentence and one CTA (for example "Log a check-in", "Set targets", "Set a goal"). Never placeholder numbers |
| Success | Inline confirmation or toast with Undo where it exists today, plus a success haptic |
| Error | `ErrorState` / `ErrorBoundary` restyled. Messages unchanged |
| Disabled | 40% opacity, role and state unchanged |

---

## 7. Component reuse and replacement strategy

New presentation components live in **`src/components/reforge/`**, are exported individually and are used only by screens being transformed. The existing primitives (`Screen`, `Card`, `ListRow`, `Button`, `Txt`) stay as they are until 7.6. They are then restyled to REFORGE tokens, so that secondary screens converge in one deliberate pass.

| Need | Reuse or extend | New (proposed) | Notes |
| --- | --- | --- | --- |
| Tab screen frame (brand header + title block + scroll) | `Screen` stays for secondary screens | `TabScreen` | Safe area, `ScrollView`, 16 pt margin, optional `footer`. Accepts a hero slot for the workout |
| Brand header | `forge-wordmark.svg` (inline SVG paths) | `BrandHeader`, `StreakBadge` | Wordmark as SVG (2 KB), not the 383 KB PNG. Hidden from screen readers except one label "FORGE" |
| Title block | `longDayLabel`, plan week | `TitleBlock` | Greeting or title, subtitle, date, week/phase |
| Cards | `Card` (keeps API) | `ForgeCard` (`variant: default \| active \| hero`), `CardHeader` | |
| Hero with image | — | `HeroCard` | Image, scrims, vertical tagline |
| Metrics | `Txt` metric roles | `Metric` (value + unit + label + optional delta) | Handles unit spacing, tabular numerals and one accessible label |
| Strips | — | `StatStrip` | Columns with dividers; wraps to 2 × 2 on compact widths or large text |
| Progress | `ProgressBar`, `ProgressRing` | Props: `tone`, `height`, `track`; ring sizes | Keep progressbar roles |
| Buttons | `Button` | `CtaButton` (gradient), `OutlineButton`, `SquareIconButton` | Same accessibility API as `Button` |
| Tiles and chips | `Chips` | `Tile`, `InfoChip` | Quick add, milestones, session chips |
| Segmented | `SegmentedControl` (keeps the layout algorithm) | `tone="ember"` variant | Reuse `segmentLayout` |
| Tab bar | Custom `tabBar` in the layout | `ForgeTabBar` | Same `emitter` and `navigateToTab` logic and resume banner |
| Charts | `LineChart`, `BarChart` | New optional props: `accent`, `area`, `grid`, `callout`, `yTicks` | No chart library |
| Workout | `WorkoutExerciseCard`, `SetGrid`, `RestTimer`, `FinishSheet` | Restyle in place (7.2), plus `RestRing` | Logic untouched; styling only |
| Lists | `ListRow`, `ListSection` | `ForgeRow` (navigation rows inside cards) | Used by *Tools & settings* and *More* |
| Icons | Ionicons | `reforge/icons.tsx` (custom SVG glyphs) | Only for glyphs Ionicons lacks |

**Derived metrics (class D)** belong in a new pure module, for example `src/domain/presentation/` (`deltas.ts`, `streaks.ts`, `snapshot.ts`), with `node:test` unit tests. They read existing outputs (`summary`, `seriesOf`, `volumeBuckets`, `evaluate`, `RecordEvent[]`) and **never modify** existing functions.

---

## 8. Authentic imagery and asset strategy

### 8.1 Rules

1. **No AI-generated imagery ships.** The reference images are not reused, traced or cropped.
2. **No asset is added without a licence record.** Introduce an asset register, for example `docs/redesign/reforge/ASSETS.md`, with: file, source, author, licence, URL or receipt, date and usage. Do this in 7.1-0, with approval of the location (D25).
3. **No text baked into images.** All copy stays live and accessible. Decorative images use `accessible={false}`.
4. **Formats and budgets:**
   - WebP (or high-quality JPEG) for bundled images, at @2x and @3x, or a single @3x of about 1170 px width for full-width heroes.
   - About 150 KB per hero and about 40 KB per thumbnail.
   - **About 1.5 MB total** for new REFORGE images (D25).
   - Colour-graded to the palette: desaturated steel with ember highlights.
5. **People in imagery** need model releases (paid stock includes them; free licences generally do not guarantee them). Avoid identifiable faces on the user's own profile.
6. **The imagery must be usable offline**, so bundle it. No network images.

### 8.2 Sourcing options

| Option | Authenticity | Licence risk | Cost | Notes |
| --- | --- | --- | --- | --- |
| A. Commissioned photography (gym, food, athlete) | Highest | Lowest (work-for-hire) | High | Best for the primary-goal athlete and nutrition hero |
| B1. Free stock (Unsplash or Pexels licence) | Medium | Medium: no model or property release guarantee; brands or trademarks may appear | Free | Founder must approve each image; record URL and author |
| B2. Paid stock (Adobe Stock or Getty standard licence) | Medium | Low (releases available) | Per image | Good for food and gym atmosphere |
| C. Brand-owned 3D renders (Blender) | High as *brand objects* | None (owned) | Time | FORGE-embossed plates, dumbbells, chalk, steel textures. **The Blender tooling available in this environment can produce these in 7.1 if approved** |
| D. Graphic or procedural (SVG, gradients, existing splash embers and smoke) | Brand-consistent | None (existing assets are FORGE-owned per SPLASH.md) | Low | Backgrounds, glows, dividers, empty states |

### 8.3 Per-tab plan

| Tab | Slot | Recommended source | Fallback |
| --- | --- | --- | --- |
| Home | Today's session hero (plate) | **C** FORGE plate render | D (steel texture and ember glow) |
| Home | Next target strip (plate or dumbbell) | **C** | D |
| Train | Workout hero (plate or rack) | **C** | B2 gym atmosphere (no faces) |
| Train | Hub, Paths and program cards (Strength / Muscle) | **C** (barbell or plates for Strength, dumbbells for Muscle) | B2 |
| Nutrition | Today's nutrition hero (food bowl) | **A** or **B2** food photography | D (graphic without a photo) |
| Nutrition | Meal thumbnails | **None.** Meal-type icon tiles (no per-food images exist) | — |
| Nutrition | Quick-add tiles | Icons only (no food photos) | — |
| Nutrition | Hydration bottle | Only if D11 is approved: C | — |
| Progress | PR highlight (plate) | **C** | D |
| You | Avatar | **User monogram** (D16) | — |
| You | Primary goal hero (athlete) | **A** (commissioned, released) or B2 (back view, no face) | C or D abstract steel |

### 8.4 Technical approach

- **Bundled `require()` assets with React Native `Image`** are sufficient (local, offline). `expo-image` adds caching and transitions but is a new dependency (D26), and is not needed for bundled files.
- Preload hero images when the tab mounts (they are local, so this is cheap). On Android, set `fadeDuration={0}` for heroes so they don't flash.
- Images sit in absolutely positioned layers behind content, so text layout never depends on image size.
- In-app wordmark: render `forge-wordmark.svg` paths with a subtle steel gradient fill (SVG `LinearGradient`), not the 383 KB `wordmark-steel@3x.png`.

---

## 9. Interaction and animation opportunities (plan only; nothing implemented in 7.0)

| Flow | Opportunity | Technical considerations |
| --- | --- | --- |
| Starting a workout | CTA press (scale 0.98, light haptic). Logger presents as today (fullScreenModal). The hero title reappears as the logger hero for continuity | The start guard (`blockIfTraining`) and navigation order are unchanged. No shared-element transition (complex with modal stacks) |
| Logging sets | Check fill 160 ms with light haptic (exists). Next-set ember border moves to the next row. Auto-focus Next (exists) | All animation stays local to the row. Never re-render the whole list per keystroke. Preserve `SetFocusProvider` and `WeightFillProvider` |
| Rest timer | Ring countdown driven by `withTiming` from the stored deadline on the UI thread. +30 s bump animation. Success haptic at zero (exists) | Needs a stored total for the ring (D24). Keep one JS tick per second for the text, isolated from the list |
| Navigating exercises | Expand and collapse with Reanimated layout transitions (240 ms). Hero collapses on scroll | Layout animations in a long `ScrollView` can drop frames; profile with 10+ exercises. Disable with reduce motion |
| Completing workouts | `FinishSheet` summary: count-up of volume, sets and time (once), success haptic | No change to finish logic or records computation |
| Personal records | When the finish summary includes a record (existing records engine): ember glow pulse on the PR row, success haptic, "New personal record" overline | A one-time celebration; no confetti or sound. Records come only from `RecordEvent` |
| Recording meals | Quick-add tile press → logged toast with Undo (exists), ring and bar animate to the new total, light haptic | The QuickAddSheet one-tap and Undo semantics are unchanged |
| Reviewing trends | Chart draw-in on first view. Scrub with a selection haptic per point. Range switch crossfade (160 ms) | Keep the adjustable screen-reader role. Avoid recomputing models on scrub (memoised already) |
| Goals | Progress bar fill and achieved state (existing `canAchieve` confirmation), success haptic on confirmation | Goal evaluation unchanged |
| Tab navigation | Icon and label colour crossfade 160 ms. Optional selection haptic | Must not delay `navigateToTab` |
| Errors | Inline, announced (existing `useAnnouncedError`). No shake animations | Copy unchanged |
| Saved actions | One consistent toast or banner pattern (as in Nutrition's Undo banner) | Announce via `announceForAccessibility` (existing pattern) |

**Pre-existing concern (no change in 7.0):** the `mutate()` haptic fires on every successful mutation, including per-keystroke saves (workout rename and notes `onChangeText`). This conflicts with the "no haptics on typing" rule (D27a).

---

## 10. Functionality and data preservation boundaries

**Off-limits in REFORGE (any change needs explicit approval):**

- `src/data/**`: repository, schema, today, programs, paths, progress, backup, pending deletes, workout session
- `src/domain/**`: all calculations, including `metrics`, `nutrition`, `goals`, `measurements`, `checkins`, `progress/*`, `programs/*`, `paths/*`, `validation`
- `src/programs/**` (curated program library and publication lock) and `scripts/publish-programs.ts`
- `src/cloud/**` and `supabase/**`
- `src/components/splash/**`, the `app.json` splash configuration, `app/onboarding.tsx` and [ProfileForm](../../src/components/ProfileForm.tsx) validation
- `src/startGuard.ts`, `src/notifications.ts`, `src/state.ts` (except a separately approved D27a change)

**Allowed (presentation):** `src/screens/**`, `src/components/**` (new `reforge/` folder, then restyles), `src/theme.ts` (additive tokens), `app/(tabs)/_layout.tsx` (styling; the fifth tab only after D2), new `assets/` folders (after D25), the new `src/domain/presentation/**` for approved class-D helpers, and tests.

**Behavioural invariants (from the existing suites):**

- Only one active workout at a time.
- Every start goes through the guarded paths. The Resume banner appears on non-Home tabs.
- Every edit saves immediately.
- Destructive actions confirm.
- Sheets with input never close silently.
- Units convert only for display.
- Nutrition targets count as personal only after they are saved.
- Progress numbers are derived on demand.
- Review mode is read-only until *Edit*.
- Pending deletes complete correctly across restarts.
- Onboarding redirect.
- The intro plays once per cold start.

**No fictional metrics:** every number on a REFORGE screen must trace to stored data via a named function. Empty data shows empty states, never sample values.

---

## 11. Technical risks and dependencies

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| T1 | Gradients: RN core `experimental_backgroundImage` (linear since RN 0.76, radial since 0.80) and `boxShadow` should work on RN 0.88 (New Architecture only) in Expo Go SDK 58. **Unverified on device** | Medium | Medium | 7.1-0 spike on the founder's phone. Fallback: `react-native-svg` gradients (installed). `expo-linear-gradient` only with approval (D26) |
| T2 | Custom font loading delays first paint or interacts with the intro | Medium | High (splash must not change silently) | Load fonts in parallel with `initializeRepository()` inside `Ready`, with no change to the intro timing. Show the system font until loaded, or gate `ready` on fonts only if approved (D4) |
| T3 | Test churn: tests encoding DS 2.0 rules (§5.3) | Certain | Low | Update only the listed assertions, with D27 approval. Keep behavioural assertions |
| T4 | Shared primitive changes leak into un-redesigned screens | High if primitives are edited | Medium | Opt-in `reforge/` components (§7) |
| T5 | Logging performance regressions (hero, ring, borders, shadows in a long `ScrollView`) | Medium | High | Isolated timers, UI-thread animation, no shadows on list rows, a 10-exercise profiling script, and a possible later `FlatList` migration (separately approved) |
| T6 | Image memory and bundle size | Medium | Medium | Budgets (§8.1), WebP, a few large images per screen |
| T7 | Small screens and large text (two-column cards, five-tab labels, four-column strips) | High | Medium | Measured fallbacks as in `MacroSummary` and `segmentLayout`. Test at 375 pt and AX sizes |
| T8 | Light mode has no reference | Certain | Medium | D5 |
| T9 | Android differences: elevation vs shadow, hairline rendering, gradient banding, ripple, haptics strength | Medium | Medium | Android pass in each phase's QA. Avoid hairlines under 1 px on Android |
| T10 | Fifth tab changes back behaviour and deep links for Nutrition | Medium | Medium | Keep `/journal?kind=nutrition` working. Update entry points deliberately in 7.3 |
| T11 | Expo Go compatibility of any new native dependency | Low (Expo SDK modules are included) | High | Only Expo SDK modules, approved via D26 |
| T12 | No simulator or emulator here, so visual fidelity can't be machine-verified | Certain | Medium | Founder screenshots (§14) |
| T13 | Display-face legibility for numbers (condensed figures) | Medium | Medium | Proof tabular numbers on device; keep the system face for inputs |

---

## 12. Phase 7.1 — Home tab transformation: detailed work packages

**Goal:** establish the REFORGE visual standard on Home, at reference fidelity, with zero behavioural change beyond the approved decisions.

**Entry criteria:**

- These decisions are resolved: D1, D3, D4, D5, D6, D8, D9, D18, D19 (Home items), D25 (Home assets), D26, D27, D29, D30.
- D2 is decided, even if the fifth tab lands in 7.3.

Each work package below is independently reviewable, ends green on `npm test`, `npm run test:ui`, `npm run typecheck` and `npm run lint`, and is reviewed by founder screenshot.

### 7.1-0 Foundation spike and decisions (no user-visible change)

- **Scope:** prove on the founder's phone (Expo Go):
  - gradient options (SVG vs `experimental_backgroundImage`);
  - `boxShadow` vs `shadow*`;
  - the shortlisted display fonts (two weights) with tabular numbers;
  - a hairline-bordered card at 8 pt radius;
  - the wordmark SVG header.

  All of this goes on the **development-only** `/design-system` screen.
- **Also:** create the asset register (location per D25), and agree the reference image location (D31).
- **Files:** `app/design-system.tsx` (dev), `assets/fonts/*` (after D4), new register doc.
- **Acceptance:** founder picks a font and gradient approach from screenshots; nothing changes outside development screens.
- **Out of scope:** any Home change.

### 7.1-1 REFORGE tokens and primitives (additive)

- **Scope:**
  - additive palette keys and text roles (§6.2–6.3);
  - `src/components/reforge/`: `ForgeCard`, `CardHeader`, `Metric`, `StatStrip`, `Tile`/`InfoChip`, `CtaButton`, `OutlineButton`, `SquareIconButton`, ring and bar tone props, icons;
  - a REFORGE section in `/design-system`.
- **Tests:** contrast tests extended to the new tokens (same AA rules), render and role tests for each component, and the design-system render test updated.
- **Acceptance:** no existing screen changes; the token test still passes, or is updated only for the deliberate role additions (D27).

### 7.1-2 Brand header, tab bar and screen frame

- **Scope:** `BrandHeader` (wordmark SVG and tagline per D3), `StreakBadge` (per D8; hidden if not approved), bell omitted (D14), `TabScreen`, and `ForgeTabBar` restyle (ember selection, raised panel, resume banner restyle).
- **Labels:** "Today" becomes "Home" if approved. Four tabs remain until 7.3, unless the founder approves adding Nutrition now; in that case the Nutrition tab shows the existing screen until 7.3.
- **Tests:** `navigation.test.tsx` updated for colour, label and tab count (D27). Behaviour assertions unchanged (`navigateToTab`, prevented press, Resume).
- **Acceptance:** tab switching latency unchanged; the Resume banner works on every non-Home tab.

### 7.1-3 Home title block

- **Scope:** greeting (time-of-day + `profile.name`, which falls back gracefully when the name is "Athlete" or empty), subtitle copy (D29), date, and week/phase when a plan is active.
- **Tests:** `today-train` header assertions updated (D27). The onboarding redirect test is unchanged.
- **Acceptance:** the greeting is the screen's accessibility header; compact width wraps to two lines at most.

### 7.1-4 Readiness strip

- **Scope:** a `StatStrip` from today's check-in: Ready (self-rated word, per D9), Sleep, Energy, and Soreness in place of HRV (per D10). Without a check-in, a single "How are you today? Check in" row (`/journal?kind=recovery`).
- **Tests:** the strip with and without a check-in, and partial answers (optional readiness absent).
- **Acceptance:** no score is computed unless D9 approves one; values match the Check-ins screen exactly.

### 7.1-5 Today's session hero

- **Scope:** `HeroCard` for **all seven `nextSession` states** (active, paused, program today/upcoming, Path today/upcoming/missed, planned with or without template, none):
  - overline, condensed title, detail line;
  - chips (exercise count, level when known);
  - `CtaButton` with the existing labels and actions;
  - "…" overflow with existing actions only;
  - plate asset (D25).
- **Tests:** existing `today-train` behaviours (start, resume, start early, missed, choose template, Forge Path link), plus labels.
- **Acceptance:** identical behaviour to the current `NextWorkout`; long names wrap to three lines at most; reduce motion is respected.

### 7.1-6 Progress snapshot and Nutrition today

- **Scope:** a two-column row with a measured stacked fallback.
  - **Snapshot:** bodyweight (R) and weekly volume (R), each with a delta only if D19 approves; day streak (D8).
  - **Nutrition ring:** kcal against personal target, macros with bars, or "Set targets" when not personalised.
  - Card headers navigate: Progress tab, and Nutrition (journal route until 7.3).
- **Tests:** new unit tests for approved class-D helpers in `src/domain/presentation/`, UI tests for empty and populated states, and units (kg/lb).
- **Acceptance:** numbers equal the Progress, Nutrition and You figures for the same data.

### 7.1-7 Next target and preserved sections

- **Scope:**
  - the Next target card (goal selection per D18; empty state "Set a goal");
  - the preserved content below it in REFORGE style (D30): This week (goal text and `WeeklyConsistency`), Last session (review), Workout history, and the plan row if not represented in the hero.
- **Tests:** existing assertions on recovery, last session and history routes (moved, not removed).

### 7.1-8 QA and fidelity review

- **Scope:**
  - founder screenshots per §14 (iPhone default text, large text, compact width if available, Android if available);
  - a side-by-side against reference 1;
  - an accessibility pass (VoiceOver order: brand → greeting → strip → hero → cards);
  - a performance sanity check (Home mount with 200+ workouts);
  - a short `docs/audits/PHASE_7_1_*` report.
- **Exit:** founder approval of Home as **the visual standard** for 7.2–7.6.

---

## 13. Phases 7.2–7.6 — high-level work packages

**7.2 Train and workout experiences**

| WP | Scope |
| --- | --- |
| 7.2-0 | Approve a derived Train hub and Forge Paths design (D28) |
| 7.2-1 | Logger frame: collapsing hero, session timer card with prominent Pause/Resume, progress card (D23) |
| 7.2-2 | Exercise card and set grid restyle: borders, ember next-set focus, check discs (D7). All columns and modes kept (D22) |
| 7.2-3 | `RestRing` in the dock (D24), +30 s and Skip, idle state |
| 7.2-4 | Collapsed rows, Add exercise, Finish dock, `FinishSheet` summary and PR moment |
| 7.2-5 | Train hub |
| 7.2-6 | Forge Paths Library, Details, Dashboard and LegacyPath |
| 7.2-7 | Templates, Explore, Exercise, History, Calendar |
| QA | Logging-performance profiling with 10 exercises × 5 sets, and keyboard flows on iOS and Android |

**7.3 Nutrition**

| WP | Scope |
| --- | --- |
| 7.3-1 | Nutrition tab IA: route, tab mode, entry points, back behaviour (D2) |
| 7.3-2 | Today's nutrition hero and calorie-goal card |
| 7.3-3 | Meals timeline, meal detail and entry actions |
| 7.3-4 | Quick-add tiles from real recent and saved foods |
| 7.3-5 | Streak (D12) and hydration (D11), only if approved |
| 7.3-6 | QuickAddSheet, FoodEditorSheet and SavedFoods restyle |

**7.4 Progress**

| WP | Scope |
| --- | --- |
| 7.4-1 | Range control (D20) |
| 7.4-2 | Bodyweight card and `LineChart` restyle (area, grid, callout) |
| 7.4-3 | Training volume card with toggle and `BarChart` restyle |
| 7.4-4 | PR highlight and All-time stats |
| 7.4-5 | Strength, Consistency, Records and muscle sets in REFORGE cards |
| 7.4-6 | Milestones and Next goals |
| 7.4-7 | Records, History and Calendar consistency |

**7.5 You**

| WP | Scope |
| --- | --- |
| 7.5-1 | Profile header (monogram, D16/D17) and Current plan card in the Level slot (D15) |
| 7.5-2 | Stats strip |
| 7.5-3 | Primary goal hero (D18) |
| 7.5-4 | My stats with approved deltas |
| 7.5-5 | Tools & settings, Preferences screen, Data & privacy, About (reachability preserved) |
| 7.5-6 | Goals, Recovery, Measurements and Account restyle |

**7.6 Cross-app finishing and visual QA**

| WP | Scope |
| --- | --- |
| 7.6-1 | Converge the shared primitives (`Screen`, `Card`, `ListRow`, `Button`, `Sheet`) onto REFORGE tokens for all remaining secondary screens |
| 7.6-2 | Light mode (D5) |
| 7.6-3 | Motion and haptics pass, including D27a |
| 7.6-4 | Accessibility audit (VoiceOver, TalkBack, Dynamic Type AX sizes, reduce motion, bold text) |
| 7.6-5 | Small-screen and Android parity |
| 7.6-6 | Performance and bundle-size review |
| 7.6-7 | Final five-tab fidelity review and DS documentation (`DESIGN_SYSTEM_3.md` / REFORGE spec) |

---

## 14. Visual QA methodology

### 14.1 What can and cannot be verified

| Check | How | Automated? |
| --- | --- | --- |
| Structure, roles, labels, navigation, states (empty, populated, paused, …) | Jest and Testing Library suites | ✅ |
| Token contrast (AA) for every new colour pair | `design-tokens.test.ts`, `wp6-contrast.test.ts`, extended | ✅ |
| Layout fallbacks (two-column → stacked, strips 4 → 2 × 2) | Pure layout helpers with unit tests, as `setGridLayout` / `segmentLayout` are tested | ✅ |
| Class-D numbers equal the source calculations | `node:test` unit tests against fixtures | ✅ |
| Types, lint, format | `typecheck`, `lint`, `format:check` | ✅ |
| Pixel fidelity, typography rendering, imagery, gradients, motion feel, haptics | Founder device screenshots and screen recordings | ❌ Founder approval |
| VoiceOver and TalkBack traversal, Dynamic Type at AX sizes | Manual on device | ❌ Founder or tester |

**Phase 7.0 has verified no visual fidelity.** No application screenshots were captured, because no device, simulator or emulator is available in this environment.

### 14.2 Screenshot protocol (founder phone, Expo Go)

1. Run `npm.cmd start` and scan the QR code with Expo Go. Use a seeded data state: a populated test profile created through the app. Never use fabricated database edits.
2. For each screen, capture: **top**, **mid-scroll** and **bottom**; with and without an active workout (the Resume banner); and for the workout, with the keyboard open.
3. Variants:
   - default text size;
   - largest standard Dynamic Type;
   - one AX size;
   - reduce motion on (for motion checks);
   - dark (and light, after D5).
4. Name files `7.1_home_<state>_<variant>_<device>.png`. Record the device model, OS version and display zoom.
5. Store the files in `docs/redesign/reforge/screens/<phase>/` (D31) or in a shared folder if the founder prefers to keep the repository lean.

### 14.3 Comparison method

- **Normalise widths.** Scale the device screenshot to 768 px wide (the reference width). Compare **horizontally**: margins, column splits, element widths and type sizes relative to width. Compare **vertically by order and proportion**, not by absolute position (§3.2).
- **Fidelity checklist per screen:**
  1. section order;
  2. margins (16) and gaps;
  3. card frame (fill, hairline, radius);
  4. header and overline style;
  5. type roles and weights;
  6. ember usage against §6.1;
  7. icon set and sizes;
  8. imagery placement and scrims;
  9. tab bar;
  10. empty and long-text states.
- **Overlay** (optional, no installs): a PowerShell `System.Drawing` script, like the one used for the §3 measurements, can composite the reference and screenshot at 50% opacity. It would be added under `scripts/` only with approval.
- **Device classes:** compact (iPhone SE / mini, 375 pt), standard (393–402 pt), large (430–440 pt), and Android (about 412 dp) if available.

### 14.4 Performance and regression

- Logging: a 10-exercise × 5-set workout. Check the time from tapping *Complete set* to visual feedback, typing latency, and scroll smoothness, using the Expo Go performance monitor.
- Progress: 1Y and All with more than 200 workouts. Check the time to first render and chart scrubbing.
- Every work package must keep `npm test`, `npm run test:ui`, `npm run typecheck` and `npm run lint` green.

### 14.5 Platform differences to check each phase

- Shadows and elevation.
- Gradient banding.
- Hairline visibility.
- Font rendering of the display face.
- Ripple vs highlight press states.
- Tab bar safe-area insets (iOS home indicator vs Android gesture bar).
- Keyboard behaviour (iOS accessory bar vs Android dock).
- Haptic strength.

---

## 15. Decisions requiring founder approval

Each decision lists the recommended option first. Items marked **(7.1)** block Phase 7.1.

| # | Decision | Options (recommended first) |
| --- | --- | --- |
| **D1 (7.1)** | Supersede DS 2.0 doctrine (single ember, tonal borderless surfaces, white tab selection, no ember on Train) | **Adopt the REFORGE ember rules (§6.1) and the hairline-card surfaces** · keep DS 2.0 (lower fidelity) |
| **D2 (7.1)** | Five tabs with Nutrition; rename Today → Home | **Approve; rename in 7.1, add the Nutrition tab in 7.3** · add both in 7.1 · keep four tabs |
| **D3 (7.1)** | Header tagline "DISCIPLINE BUILDS FREEDOM" vs the splash's "BUILT THROUGH DISCIPLINE" | **Use one brand line in both places (founder's choice; changing the splash is a separate, explicit change)** · different lines · no in-app tagline |
| **D4 (7.1)** | Display typeface and bundling | **Proof Saira Semi Condensed, Barlow Semi Condensed and Rajdhani (all OFL) in 7.1-0; bundle two weights with `expo-font`** · system font only |
| **D5 (7.1)** | Light mode under REFORGE | **Keep it usable with a mapped light palette; full fidelity is dark only** · remove the Light option (behaviour change) · full light design later |
| **D6 (7.1)** | Screen margin 16 pt (reference) vs 20 pt | **16 pt for REFORGE screens** · keep 20 |
| D7 | Completed-set colour | **Ember check discs (reference); green kept for positive deltas** · keep green completion |
| **D8 (7.1)** | Streak in the header and on Home | **Weekly streak: consecutive weeks meeting the weekly frequency (class D)** · existing daily streak · hide streaks |
| **D9 (7.1)** | Readiness display | **Self-rated readiness word from the check-in; no %** · compute a % from the legacy `readiness()` (class D) |
| D10 | HRV and wearable data | **Omit; show Soreness instead** · scope a HealthKit / Health Connect integration (F, separate project) |
| D11 | Hydration | **Omit** · build it as a new feature (new journal kind, sync and backup review) |
| D12 | Nutrition streak | **Show only with a nutrition goal (days on target, from goal history); otherwise days logged this week** · omit |
| D13 | Meal times | **Omit; meal-type icons only** · show "logged at" times (class D) |
| D14 | Notification bell | **Omit (no notification centre)** · build a notification centre (F) |
| D15 | Level / XP | **Omit; use the Current plan card in that slot** · design gamification (F) |
| D16 | Profile photo | **Monogram** · photo picker (new dependency, storage and backup decision) |
| D17 | Profile tagline and location | **Omit; show training goal and "Training since"** · add profile fields (F) |
| **D18 (7.1)** | Which goal is "Next target" or "Primary goal" | **The active goal nearest to completion (class D); pinning later** · most recently created · user pin (settings key) |
| **D19 (7.1, Home items)** | Approve the class-D formulas: bodyweight Δ vs 4 weeks; weekly volume Δ vs last week; range Δ and %; volume vs the previous equal period; PR Δ vs the previous best; weeks consistent; body-fat Δ; 1RM Δ and which lift | **Approve a single standard window per metric (the same on Home, Progress and You), unit-tested** · approve individually · omit deltas |
| D20 | Progress 7D range and daily bars | **Omit 7D; keep weekly and monthly bars** · add 7D and daily bucketing (domain change) |
| D21 | "~60 min" and "Est. time left" | **Omit** · define an estimator (class D, needs validation) |
| D22 | Workout layout | **Keep the fullScreenModal (no tab bar), collapsing hero, no brand header in the logger; keep the PREV and RIR columns; rest ring in the dock** · reproduce the reference literally (loses columns and tab focus) |
| D23 | Workout progress unit | **Sets (existing status semantics), with the exercise count as secondary text** · exercises (reference) |
| D24 | Store the rest total for the ring | **Add a `restTotal` key beside `restDeadline` (settings key/value, no schema change)** · ring without total (shrinking arc unknown) |
| **D25 (7.1)** | Imagery sourcing, budget and register | **Brand renders (Blender) for plates and objects; paid stock or commissioned work for food and athlete; register at `docs/redesign/reforge/ASSETS.md`; about 1.5 MB budget** · free stock · no imagery |
| **D26 (7.1)** | New dependencies | **None initially (SVG gradients); revisit `expo-linear-gradient` / `expo-image` after the spike** · approve now |
| **D27 (7.1)** | Update tests that encode superseded design rules (§5.3) | **Approve the targeted updates; behavioural assertions stay** |
| D27a | `mutate()` haptic on every save (fires per keystroke) | **Limit to discrete actions in 7.6 (behaviour change)** · keep |
| D28 | Train hub, Forge Paths and Templates (no reference) | **Approve a derived mock before 7.2-5** · commission a sixth reference |
| **D29 (7.1)** | Copy: greeting, subtitles, decorative taglines, merged nutrition cards | **Founder supplies or approves final strings** |
| **D30 (7.1)** | Placement of Home content not in the reference (plan, This week, Last session, History) | **Below Next target, in REFORGE cards** · move to Train or Progress |
| D31 | Store references and QA screenshots in the repository | **`docs/redesign/reforge/references/` and `/screens/`** · outside the repository |
| D32 | Phase naming alongside the existing 7A/7B audits | **Keep REFORGE as 7.0–7.6 with `PHASE_7_x_REFORGE_*` file names** |

---

## 16. Files changed in Phase 7.0

| File | Change |
| --- | --- |
| `docs/audits/PHASE_7_0_REFORGE_ARCHITECTURE.md` | **New** (this document) |

No application source, stylesheet, asset, dependency, configuration or test file was modified. No commit or push was made. Phase 7.1 has not been started.

