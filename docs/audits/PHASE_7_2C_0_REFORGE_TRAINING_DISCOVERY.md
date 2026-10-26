# Project REFORGE — Phase 7.2C-0: Forge Paths, Templates & Discovery Audit

**Status:** proposal for founder approval. No application code was changed in 7.2C-0.

**Baseline:**

- Branch `feat/forge-paths-foundation` at `cb34d4e` (Phase 7.2B), identical to `origin`; the working tree was clean.
- Earlier commits: `dba0781` (7.2A), `c6344f0` (7.1B), `027adfc` (7.1A).

**Inputs:**

- The five approved references.
- [PHASE_7_0_REFORGE_ARCHITECTURE.md](PHASE_7_0_REFORGE_ARCHITECTURE.md) §4.2 and §13 (WP 7.2-6, 7.2-7).
- [PHASE_7_2B_0_REFORGE_TRAIN_HUB.md](PHASE_7_2B_0_REFORGE_TRAIN_HUB.md).
- [REFORGE_FOUNDATION.md](../redesign/REFORGE_FOUNDATION.md).
- The screens listed below.

---

## 1. Screen and route inventory

Every screen below still uses the Design System 2.0 frame (`Screen`: back button, eyebrow, 32 pt system-font title, tonal `Card`/`ListSection`). LegacyPath also still uses the older `Label` primitives.

| # | Route | Screen (lines) | Reached from | What it shows |
| --- | --- | --- | --- | --- |
| P1 | `/forge-paths` | [programs/Library.tsx](../../src/screens/programs/Library.tsx) (197) | Train hero and tools, Home ⋯, You, Dashboard, LegacyPath | Current plan row; recommendation card (profile-based); 6 program families grouped by goal (18 published programs); dev-only draft previews |
| P2 | `/forge-paths/[programId]` | [programs/Details.tsx](../../src/screens/programs/Details.tsx) (281) | Library, recommendation, Dashboard | Experience · goal; days-a-week variant switch; `ProgramStats`; your week (`WeekStrip`); phases (`PhaseTimeline` + phase sheet); workouts (`WorkoutList`, expandable exercise lines); About (progression, description sheets); footer **Start program** (start-date sheet) or **Open your program** |
| P3 | `/forge-paths/current` | [programs/Dashboard.tsx](../../src/screens/programs/Dashboard.tsx) (424) | Train hero *View plan*, Home, You, Library plan row | Week · phase, completion bar, sessions done; **Next session card** (suggested day, Standard / Lower-fatigue choice, exercise count, Start / Resume, Skip); program complete card; Coming up (3); Recent sessions (3, Restore skipped) + all-sessions sheet; Program: details, browse, **End program** |
| P4 | `/paths` | [LegacyPath.tsx](../../src/screens/LegacyPath.tsx) (660) | Train hero (Path), PlanRow, Templates "Manage Path session" | Existing generated Path: status and completion; "Ready for a Forge program?" card; selected session card (state, exercises, Start/Review, Workout options sheet: skip, reschedule, swap); weekly calendar with week stepper and day markers; Manage Path sheet (pause, resume, archive); Earlier Paths |
| T1 | `/templates` | [app/templates.tsx](../../app/templates.tsx) (290) | Train *Workout templates*, Home ⋯, template sheet *Edit or schedule* (`?edit=`) | In-progress banner; template rows (exercise names, **Start**, ⋯ Edit / Schedule / Duplicate / Delete); Scheduled list (Start, ⋯ remove or Manage Path session); footer **Create template**; `TemplateEditor` sheet; `DateSheet` |
| T2 | (sheet) | [TemplateEditor.tsx](../../src/components/TemplateEditor.tsx) (363) | T1 | Name, notes, exercises with `Stepper`/`LoadControl`, rep range, reorder, Add exercise (`ExercisePicker`) |
| E1 | `/explore` (`?search=1`) | [app/explore.tsx](../../app/explore.tsx) (197) | Train *Exercise library* | Search; All / Favorites / Recent; filters (muscle, equipment, sort); **Create custom exercise**; 367 exercises in a `FlatList` of `ExerciseCard`s |
| E2 | `/exercise?id=` / `?custom=new` | [app/exercise.tsx](../../app/exercise.tsx) (495) | E1, Progress, Records, logger | Detail: illustration, Add to workout, instructions/mistakes/safety, strength chart, records, recent sessions, Edit custom. Custom form: name, muscle/equipment selects, category, sides, notes |
| C1 | `/calendar` | [TrainingCalendar.tsx](../../src/screens/TrainingCalendar.tsx) (278) | Train tools, Home ⋯, Progress | Month grid with markers and legend; selected day list (review or rest) |

**Shared pieces these screens use:**

- `components/programs.tsx`: `ProgramStats`, `WeekStrip`, `PhaseTimeline`, `ExerciseLines`, `WorkoutRow`, `WorkoutList`.
- `PlanRow`, `ExercisePicker`, `DateSheet`, `ReorderSheet`, `Stepper`.
- From `ui.tsx`: `Sheet`, `Field`, `SegmentedControl`, `FilterChips`, `Button`.
- From `design.tsx`: `ExerciseCard`, `ExerciseVisual`, `ChartContainer`.

**Shared with other tabs (blast radius):**

- `ExercisePicker`: Goals and Progress.
- `DateSheet`: Nutrition, Recovery, Measurements, Goals.
- `Sheet`, `Field`, `SegmentedControl`, `Button`: every screen.

## 2. Protected functionality and dependencies

These are presentation-only phases. Each screen keeps exactly the calls it makes today.

| Area | Calls that must not change |
| --- | --- |
| Discovery | `recommendProgram`, `programFamilies`, `preferredVariant`, `familyKey`, `libraryPrograms`, draft preview gating |
| Enrolment | `enrollProgram` (start-date sheet, replace confirmation), `trainingWeekdays` around the rest day |
| Program progress | `programProgress`, `programNext`, `startProgramSession({ lowerFatigue })`, `skipProgramSession`, `restoreProgramSession`, `endProgram`, `sessionSetReduction` |
| Existing Paths | `pathSessions`, `pathSummary`, `pathFocus`, `startPathSession`, skip/reschedule/swap, pause/resume/archive, `calendarWeek` |
| One workout at a time | `blockIfTraining`, `otherWorkout`, `resumeWorkout` and every disabled-start state |
| Templates | `saveTemplate`, `deleteTemplate`, duplicate, `templateFromWorkout`, scheduling (`notifyAt`), `startScheduledSession`, `?edit=` deep link |
| Exercises | `r.exercises(q, muscle, equipment)`, favourites, Recent (last 10 workouts), custom create/edit validation, `exerciseProgress`, records, *Add to workout* |
| Navigation | All routes and params above; `dismissTo` behaviour between Details and Dashboard; `useAfterSheet` ordering (iOS modal timing) |

**Protected in tests:**

| Suite | Tests | Covers |
| --- | --- | --- |
| `forge-paths` | 8 | Programs, enrolment, recommendation |
| `program-details` | 7 | Program details and dashboard |
| `legacy-path` | 7 | Existing Paths |
| `legacy-workouts` | 6 | Path workouts and templates |
| `templates` + `templates-wp3` | 17 | Templates screen and editor |
| `wp5` | 11 | Explore, exercise detail, custom exercises |
| `progress` | 11 | Includes calendar and exercise detail |
| `redesign` | — | Explore search, fallback media label |
| `wp6` | — | Picker double-tap, 44 pt targets |

Logic suites `curated-programs`, `program-enrollment`, `program-presentation`, `legacy-paths` and `today` cover the engines.

**Only one existing assertion touches styling:** `program-details` checks that *Skip this session* is a quiet text action (`text2`, not ember). It encodes a hierarchy rule that REFORGE keeps. Every other assertion is behavioural, so 7.2C needs no test weakening.

## 3. Proposed REFORGE component reuse

**One new primitive** covers the frame of every secondary screen:

| New | Purpose |
| --- | --- |
| `ForgeSubScreen` | The REFORGE frame for pushed screens: 44 pt back control, letter-spaced overline (eyebrow), **condensed `screenTitle`**, optional pinned footer (CTA), 16 pt margin, card rhythm and the faint top glow of `ForgeScreen`. **No brand header**: the wordmark belongs to tabs and the logger, and repeating it on every pushed screen would crowd them. Optional `list` mode renders a `FlatList` (for the Exercise library). |

**Reused as built:**

| Need | Component |
| --- | --- |
| Plan and session heroes (Dashboard next session, Path session, program header) | `HeroCard` (ember-glow fallback, no artwork), `CtaButton`, `OutlineButton`, `ForgeProgress`, `InfoChip` |
| Lists of destinations and actions (About, Program, Manage) | `ForgeListRow` (7.2B) in a `ForgeCard` |
| Record lists (program families, sessions, templates, exercises) | `ForgeCard` (padding 0) with hairline rows. The `ListRow` behaviour is kept; its surface becomes the card |
| Section titles | `SectionLabel` (replaces `ListSection` titles and ad-hoc overlines) |
| Stats (program facts, exercise records) | `StatStrip` / `Metric` |
| Week strip and selected day | Existing `WeekStrip` / calendar markers with REFORGE colours (ember = planned or today, ember disc = completed, as in the logger) |
| Menus | `OverflowMenu` with the `SquareIconButton` trigger (as Home and the logger) |

**Deliberately left on Design System 2.0:**

- `Sheet`, `Field`, `SegmentedControl`, `FilterChips`, `DateSheet`, `ExercisePicker` and `Stepper`.
- These are shared with Nutrition, Goals, Recovery, Measurements and Progress. Restyling them here would change unfinished tabs. They are already token-driven and dark, and get one global pass with Phase 7.6 (or earlier if approved, decision C5).

## 4. Recommended visual simplifications

The goal is "what am I following, where am I, what's next".

**Forge Paths library (P1):**

- The plan row becomes a slim *Your program* `ForgeListRow` at the top, not a section.
- The recommendation becomes the hero: overline "Recommended for you", condensed name, facts, at most three reasons, **View program**.
- The six families become two grouped cards (by goal), with `ForgeListRow`s showing name, facts and chevron.
- Removes three section headers and one card layer.

**Program details (P2):**

- **Header:** condensed title, facts, then a `StatStrip` of the existing `ProgramStats`.
- **Days a week:** the variant switch stays directly under the header.
- **Your week:** `WeekStrip` with one caption, merging the two caption lines.
- **Phases and Workouts:** as two collapsible `ForgeCard`s. Workouts start collapsed to their row list (today they render fully).
- **About:** two `ForgeListRow`s.
- **Footer:** keep the pinned **Start program** CTA (gradient) or *Open your program* (outline).

**Program dashboard (P3):**

- **Header:** condensed program name, then "Week 2 of 8 · Accumulation" with the ember progress bar and session count. This replaces the headline/bar/caption stack.
- **Next session:** becomes a `HeroCard` with the session name, suggested day, the Standard / Lower-fatigue choice only when available, the exercise preview row, **Start session** CTA and the quiet *Skip this session*.
- **Coming up:** a compact card of three rows.
- **Recent sessions:** a compact card with three rows and *All sessions*.
- **Program:** a `ForgeListRow` card (Program details, Browse programs, **End program** last in error colour).
- One fewer nested border in the next-session card (the exercise row loses its own hairline box).

**Existing Path (P4):** the same skeleton as P3, so both plan types read alike:

- **Header:** status and progress.
- **Selected-session hero:** state overline, name, facts, Start or Review, *Workout options*.
- **Week card:** stepper and day markers.
- **Manage Path:** `ForgeListRow`.
- **Earlier Paths:** the list.
- The "Ready for a Forge program?" card becomes one `ForgeListRow` ("Browse Forge programs · Keep this Path or switch any time") instead of a full card.

**Templates (T1):**

- **List:** one compact card with a row per template (name, "5 exercises · 15 sets", first exercise names on one line), an outline **Start** and the ⋯ menu.
- **Search field:** shown only with more than 8 templates. It filters by name or exercise, presentation only, so many templates stay quick to browse.
- **Scheduled:** keeps its own card.
- **In progress:** the banner becomes the Train-style *Resume* row.
- **Footer:** CTA **Create template**.

**Template editor (T2):** content restyled (exercise blocks as `Tile`s, Add exercise as an outline button) inside the existing `Sheet`.

**Exercise library (E1):**

- **Row:** a compact 56 pt `ForgeCard` row with name, "Chest · Barbell" and the favourite star. **The per-row muscle illustration and the "Muscle illustration" caption are dropped.** They draw an SVG for every one of 367 rows and say nothing about the exercise.
- **Header:** search stays first. The All / Favorites / Recent chips and a single *Filters* outline button sit in one row, with an active-filter count.
- **Create custom exercise:** becomes a `ForgeListRow` at the top of the list.

**Exercise detail (E2):**

- **Header:** condensed name, facts and *Add to workout*.
- **Records:** a `StatStrip` (heaviest set, estimated 1RM, most reps).
- **Strength history:** a `ForgeCard` chart.
- **Instructions, mistakes and safety:** collapsible cards.
- **Recent sessions:** rows.
- **Media:** the illustration stays on this page with its honesty label.

**Custom exercise form (E2):** grouped field cards. The fields and validation are unchanged.

**Calendar (C1):** see decision C4.

## 5. Implementation order

Each step ends with full verification and a stop for iPhone review.

| Step | Scope | Main files |
| --- | --- | --- |
| **7.2C-1** | `ForgeSubScreen`; Forge Paths library, program details, program dashboard, existing Path; restyle of `components/programs.tsx` | `reforge/SubScreen.tsx`, `screens/programs/*`, `LegacyPath.tsx`, `components/programs.tsx` |
| **7.2C-2** | Templates screen and editor content | `app/templates.tsx` → `screens/Templates.tsx` (route re-exports), `TemplateEditor.tsx` |
| **7.2C-3** | Exercise library, exercise detail, custom form, `ExerciseCard` → `ExerciseRow` | `app/explore.tsx`, `app/exercise.tsx` (→ `screens/`), `components/design.tsx` |
| **7.2C-4** | Integration QA: back fallbacks, compact and 200 % text pass, light mode, performance check (Exercise library scroll, Dashboard with long history), and the Calendar (if approved, C4) | All of the above |

**Out of scope throughout:**

- History: You owns it; its restyle comes with You in 7.5.
- Shared sheets and controls (see §3).
- Nutrition, Progress and You.
- Home artwork.

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| **Program screens are the most behaviour-dense UI in Forge** (lower-fatigue choice, skip/restore, one-workout guard, start-date sheet, `dismissTo` between Details and Dashboard) | Rework presentation only. Event handlers are moved verbatim. The existing 22 program and Path tests must pass unchanged. Add tests for each restyled state (complete, unavailable version, draft, paused/archived Path) |
| LegacyPath is 660 lines of older code with many states | Restyle by section without restructuring state. No change to its sheets' actions |
| Exercise-list performance | Drop per-row SVG; keep `FlatList` with stable keys; memoised row; check `initialNumToRender` and scroll on device. Do not add images or animation |
| Accessible labels relied on by tests (`View {name}`, `Start {name}`, `Options for …`, `Start session`, `Skip this session`, `Resume current workout`, `Browse programs`, `End program`, …) | Kept verbatim. New tests guard the restyled states |
| `useAfterSheet` / iOS modal timing (sheet → navigation) | Untouched call sites |
| Shared components | `ExercisePicker`, `DateSheet`, `Sheet` unchanged (§3) |
| Light mode | REFORGE light tokens; one device check per step |

**Functional observations (documented, not changed):**

| # | Observation | Proposed handling |
| --- | --- | --- |
| F1 | You's "No active plan" row hard-codes "Browse 18 Forge Paths programs" ([You.tsx](../../src/screens/You.tsx)). Correct today (18 published) but will go stale | Small separate fix: use `libraryPrograms().length` |
| F2 | Program dashboard's Back falls back to Home (`/(tabs)`); since 7.2B the plan lives on Train | Change the fallback to `/(tabs)/train` (decision C3) |
| F3 | A template row opens the **editor** on the Templates screen but the **details sheet** on Train | Keep as is (both reach Start and Edit); revisit only if the founder finds it confusing |
| F4 | `PathSummary` and `WorkoutCard` are not rendered anywhere | Leave; remove in a separate cleanup if approved |

## 7. Testing strategy

**Every step:**

- Typecheck, lint, format.
- Logic tests, including curated-program integrity.
- Full UI suite.
- Food-library check.
- iOS and Android export.

**Added per step:**

| Step | New tests |
| --- | --- |
| 7.2C-1 | `ForgeSubScreen` (back, title header, footer, 44 pt). Library hero for recommended / incomplete profile / no match; family rows open the preferred variant. Details: variant switch, start vs open, start-date sheet. Dashboard: every next-session state (ready, in progress, busy with another workout, lower-fatigue available/planned, complete, unavailable version). LegacyPath: active, paused, archived, rest day, missed. Large text and 320 pt layouts |
| 7.2C-2 | Compact rows, Start disabled while training, menu actions unchanged, empty state, search shown above 8 templates and filtering by name and exercise, scheduled list |
| 7.2C-3 | Row content and labels, favourites, filters and count, empty states with Clear, custom create and edit, detail records strip; a render-count check that rows are not re-rendered by unrelated state |
| 7.2C-4 | Back fallbacks for every screen, deep links (`/forge-paths/[programId]?version=`, `/paths?programId=&week=`, `/templates?edit=`, `/explore?search=1`, `/exercise?custom=new`) |

**Screenshots:** none can be captured from this environment. Every step ends with the founder's iPhone review, reported separately from automated coverage.

## 8. Founder decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| C1 | Secondary screens use `ForgeSubScreen` with **no brand header** (back, overline, condensed title) | **Approve** · alternative: wordmark on every screen |
| C2 | Exercise library rows drop the per-row muscle illustration and its caption (illustration stays on the detail page) | **Approve** (speed, density) · keep a smaller illustration |
| C3 | Program dashboard Back falls back to **Train** instead of Home (F2) | **Approve** |
| C4 | Restyle the **Training calendar** in 7.2C-4 (it is a Training tool since 7.2B) | **Include in 7.2C-4** · leave for Progress (7.4) |
| C5 | Shared controls (`Sheet`, `Field`, segmented controls, chips, pickers) stay on DS 2.0 until a single global pass | **Keep for now; global pass in 7.6** · restyle during 7.2C (touches every tab) |
| C6 | Template search field, shown only with more than 8 templates | **Approve** · no search |
| C7 | Fix F1 (hard-coded "18 programs" in You) as a one-line change inside 7.2C-1 | **Approve** · leave for 7.5 |

---

## 9. Exercise Library rebuild and anatomy atlas (founder directive, 7.2C-3)

The founder rejected the current exercise illustrations (`MuscleIllustration`: doodle figure with a highlighted rectangle). This section replaces C2 and the E1/E2 notes in §4. The library is rebuilt, not reskinned.

**Prototype renders** are kept in the session workspace, not the repository, until approved:

- `proto_list.png` (library list).
- `proto_bench.png`, `proto_lat.png`, `proto_squat.png` (exercise detail).

### 9.1 Library list (no illustrations)

**Row content** (one compact `ForgeCard` list, about 76 pt per row):

| Line | Content | Source field |
| --- | --- | --- |
| 1 | **Exercise name** (bold) | `name` |
| 2 | ● **Primary muscle** (ember dot, white) · secondary muscles (grey) | `muscle`, `secondary` |
| 3 | Equipment · movement pattern | `equipment`, `pattern` |
| Right | Favourite star (44 pt) | favourites |

**Screen layout:**

- **Header:** "367 exercises" overline and condensed title.
- **Search** first.
- **All / Favorites / Recent** as one segmented control.
- **Filters** outline button with an active-filter count. Active filters show as removable ember pills.
- **Create custom exercise:** a `ForgeListRow`.
- **Sort** (Name / Muscle) moves into the Filters sheet.

**What changes and what doesn't:**

- **Kept:** search, filter and sort logic, unchanged.
- **Dropped from the list:** the per-row SVG illustration and the "Muscle illustration" / "Media available" caption.
- **Speed:** rows become plain text and are memoised. No images or animation.

**Data fields carrying browsing:** `name`, `muscle`, `secondary`, `equipment`, `pattern` (all existing). Optional (decision A4): `difficulty` as a filter.

### 9.2 Exercise detail: the Forge anatomy atlas

**Composition (approved for prototyping):**

- **Header:** overline "Chest · Horizontal push", condensed title, equipment and difficulty, chips.
- **"Muscles worked" card:** front and back figures side by side, then a legend:
  - **Primary** (ember swatch): group name and named muscles.
  - **Secondary** (copper swatch): the same.
- **Add to workout** CTA.
- The page also keeps:
  - instructions, mistakes and safety;
  - strength history;
  - records strip;
  - recent sessions.

**One or two views:** **two views (front and back) always, side by side.** Pressing and quad movements live on the front, pulling and posterior-chain movements on the back, and many exercises have both (bench: chest front, triceps back). A fixed pair keeps every exercise page identical in layout and lets the lifter compare at a glance. Each figure is about 165 × 318 pt, readable on the smallest iPhone.

**Style (as prototyped):**

| Element | Treatment |
| --- | --- |
| Musculature | Charcoal (`#353940`), sculpted with soft directional light and edge shading |
| Tendons, bone, head | Recede into near-black |
| Fibre and contour lines | Retained at low contrast |
| **Primary** | Ember gradient (`#FF8A3A` → `#D24A14`) with a soft ember glow |
| **Secondary** | Muted copper (`#7A3A1A` → `#55260F`) with a copper edge and no glow, so it never competes with the primary |

**Accessibility:** the figures are one image element hidden from screen readers. The legend is the text equivalent: "Primary: Chest, pectoralis major. Secondary: Triceps, Shoulders, …". Colour is never the only cue (the legend names every highlighted muscle).

### 9.3 Asset source and licence

The prototype uses an existing anatomical illustration as its geometry, recoloured and relit for Forge: ["Muscles front and back.svg"](https://commons.wikimedia.org/wiki/File:Muscles_front_and_back.svg) by **Nefronus**, CC BY-SA 4.0 (342 KB, 176 paths).

- **What it provides:** real muscle shapes (pectoralis major, deltoid, biceps, rectus abdominis segments, obliques, the quadriceps heads, adductors, sartorius, latissimus dorsi, trapezius, infraspinatus/teres, triceps heads, gluteus maximus and medius, hamstrings, gastrocnemius and soleus). Left and right are mirrored copies, so one highlight lights both sides.
- **Not generated:** nothing in the figure is AI-made. Forge adds the palette, lighting, highlight system and composition.

**Licence condition:** CC BY-SA requires credit ("Anatomy based on Nefronus, CC BY-SA 4.0, modified") and that **the adapted atlas file** is shared under the same licence. App code is unaffected; only that one asset carries the licence.

**Production options (decision A1):**

| Option | Result | Cost / time | Risk |
| --- | --- | --- | --- |
| **A. Adopt the CC BY-SA atlas** (recommended for now) | Prototype quality, credible anatomy | Days (clean regions, bake shading) | Credit in About/Licences and ASSETS.md; adapted atlas is CC BY-SA |
| B. Commission an illustrator for a Forge-owned atlas to the same region spec | Fully owned, can be more sculpted | Weeks; budget | None technically: the renderer and mapping are unchanged, so the asset swaps in |
| C. Licence a layered stock anatomy vector | Varies | Purchase | Must verify per-muscle layers and in-app embedding rights |

A and B are compatible: ship A, replace with B later without touching screens.

### 9.4 How it scales to the whole catalogue

One atlas, about 30 named regions (front and back), and a **mapping table**, not per-exercise art.

1. **Region IDs** in the atlas: `pectoralis-major`, `deltoid`, `biceps`, `triceps`, `latissimus-dorsi`, `trapezius`, `rectus-abdominis`, `obliques`, `quadriceps`, `adductors`, `gluteus-maximus`, `gluteus-medius`, `hamstrings`, `gastrocnemius`, `soleus`, `tibialis-anterior`, …
2. **Group → region rules** from existing data (`muscle`, `secondary`), refined only by the existing `pattern` where anatomy is unambiguous:

| Data | Regions highlighted | Basis |
| --- | --- | --- |
| Chest | pectoralis major | direct |
| Back + vertical pull (19) | latissimus dorsi | pattern |
| Back + horizontal pull (31) | latissimus dorsi + trapezius (mid-back) | pattern; rhomboids lie under the trapezius and are not drawn |
| Back + scapular elevation (3) | trapezius | pattern |
| Shoulders + press / push secondary | deltoid (front view) | pattern |
| Shoulders + horizontal pull (face pull) | deltoid (back view) | pattern |
| Shoulders + isolation (20) | **whole deltoid, both views**, labelled "Deltoids" | heads cannot be told apart from data (see 9.5) |
| Quadriceps | rectus femoris + vasti | direct |
| Hamstrings | hamstring group | direct |
| Glutes | gluteus maximus | direct |
| Biceps / Triceps | biceps brachii / triceps (both heads) | direct |
| Core (41) | rectus abdominis + obliques, labelled "Abdominals & obliques" | data does not separate them |
| Calves | gastrocnemius + soleus | direct |
| Tibialis (1) | tibialis anterior | direct |
| **Full body** (18, conditioning) | **no highlight**; the card reads "Full body · conditioning" | lighting the whole figure would say nothing |

3. **Reviewed overrides** (optional, decision A3): a small presentation-only table for named exercises (e.g. lateral raise → lateral deltoid wording), each entry cited and approved. It never changes exercise data.
4. **Custom exercises** use the same rules from the muscle the lifter picked.

### 9.5 Data audit: what the atlas must not overstate

These are reported, not changed:

| Finding | Scope | Effect on the atlas |
| --- | --- | --- |
| Muscle data is **12 broad groups** (Back, Shoulders, Core, …), not individual muscles | All 367 | Named muscles in the legend come only from the rules above; no finer claims |
| **144** exercises have no secondary muscles | 39 % | Primary only; no invented secondaries |
| Secondary vocabulary is only Triceps, Glutes, Biceps, Shoulders, Back, Chest | All | Adductors, spinal erectors, forearms, core and glute medius are never highlighted |
| **14 of 15 fly-type exercises list Triceps as secondary**, including reverse flies (rear deltoid) | Flies | Likely a blanket default; triceps would be highlighted on flies if data is used as-is. **Recommend a data review before 7.2C-3 ships** (decision A2) |
| All 21 hinge movements read Hamstrings > Glutes; no spinal erectors | Deadlifts, RDLs | Erectors not shown; acceptable but incomplete |
| 20 shoulder-isolation exercises mix front, side and rear raises | Shoulders | Whole deltoid shown; legend says "Deltoids" |
| Squats list no adductors | Squats | Not shown |

### 9.6 Performance and production technique

- **No runtime filters:** react-native-svg does not support the lighting filters used in the prototype renders. Production bakes the look into layers:
  1. A **lit charcoal base** per view (PNG, about 60–120 KB at 3×).
  2. The **highlight layer**: about 30 region paths as SVG with gradient fills, drawn only for the regions that are lit.
  3. A **shading and fibre overlay** (transparent PNG) on top, so highlighted muscles keep their sculpted form.
- **Budget:** roughly 0.5 MB total, bundled locally (offline).
- **Rendering cost:** one exercise detail draws two images and a handful of paths. The list draws no artwork at all.
- **Memory:** images load only on the detail page; the atlas regions are parsed once and cached.

### 9.7 Where else the atlas could appear (later, if approved)

- **Most useful:** a workout or program summary, e.g. "This session trains" on the Program details workout preview.
- **Possible:** a weekly muscle-coverage view on Progress (Phase 7.4), only with the same honest group-level data.
- **Not in the list rows, the logger or the exercise picker:** too small to read and it would slow them.

### 9.8 Revised 7.2C-3 order

1. **Atlas asset:** clean the regions, name the region IDs, bake base and overlay per view. Credit and licence go into ASSETS.md.
2. **Mapping module:** pure, unit-tested. Every catalogue exercise resolves to regions and legend text. The audit table (9.5) is generated by a test.
3. **`MuscleAtlas` component:** two views plus legend, with accessibility text.
4. **Exercise detail rebuild.**
5. **Library list rebuild.**
6. **Remove** `MuscleIllustration` and its list usage, and update the one test that names its caption.

### 9.9 Decisions (replace C2)

| # | Decision | Recommendation |
| --- | --- | --- |
| A1 | Atlas source: CC BY-SA adaptation now, a commissioned Forge-owned atlas, or licensed stock | **Adopt the CC BY-SA atlas now; commission later only if desired** |
| A2 | Review exercise muscle data before 7.2C-3 (flies' triceps, erectors on hinges, deltoid heads) | **Approve a reviewed data pass as a separate, explicit change** |
| A3 | Allow a small, reviewed per-exercise override table for legend wording | **Approve** |
| A4 | Add difficulty as a library filter | Optional |
| A5 | Approve the prototype composition (two views side by side, legend, copper secondary) | Founder review |
