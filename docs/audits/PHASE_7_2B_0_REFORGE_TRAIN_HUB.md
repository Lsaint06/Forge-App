# Project REFORGE — Phase 7.2B-0: Train Hub Audit & Proposed Hierarchy

**Status:** proposal for founder approval. No application code was changed in 7.2B-0.

**Inputs:**

- The five approved references, specifically Home (hero, cards), Train (header, active workout) and You ("Tools & Settings" list, stat strip).
- [PHASE_7_0_REFORGE_ARCHITECTURE.md](PHASE_7_0_REFORGE_ARCHITECTURE.md) §4.2 and decision D28.
- [REFORGE_FOUNDATION.md](../redesign/REFORGE_FOUNDATION.md).
- The current code: [train.tsx](<../../app/(tabs)/train.tsx>), [History.tsx](../../src/screens/History.tsx), [You.tsx](../../src/screens/You.tsx) and [the tab layout](<../../app/(tabs)/_layout.tsx>).

---

## 1. Inventory and classification

**A** = essential on the hub · **B** = secondary, still reachable from the hub · **C** = relocate · **D** = redundant shortcut (the feature itself stays).

### 1.1 What the Train hub shows today

| # | Feature (current location) | Purpose | Also reachable from | Class | Proposal |
| --- | --- | --- | --- | --- | --- |
| 1 | Current plan row (`PlanRow`, Plan section) | Program/Path name, week, sessions; opens the dashboard or LegacyPath | Home hero and ⋯ menu, You profile card | **A** | Becomes the hub's **plan hero** |
| 2 | Forge Paths row (Plan section) | Opens the curated program library | Home ⋯ menu and "none" hero, You (no plan) | **A** | Hero when there is no plan; otherwise a Training-tools row |
| 3 | Empty workout row (disabled while training) | Starts a freestyle workout | — | **A** | First row of *Start a workout* |
| 4 | Three template rows with Start (+ details sheet) | Start a saved workout in one tap; details, edit or schedule | Templates screen | **A** | Kept in *Start a workout* |
| 5 | Workout templates row (count) | Create, edit, schedule templates | Home ⋯ menu | **A/B** | Footer row of *Start a workout* ("All templates") |
| 6 | `TemplateSheet` (Start / Resume / Edit or schedule) | Template details, one-workout guard | — | **A** (support) | Unchanged behaviour |
| 7 | Search exercises row | Opens Explore with the search focused | Explore itself has the search field | **D** | Remove the shortcut. `/explore?search=1` still works |
| 8 | Exercise library row (count) | Browse exercises and their details | Logger's exercise picker, Progress | **B** | Training-tools row |
| 9 | Create custom exercise row | New custom exercise | Explore's own *Create custom exercise* row | **D** | Remove the shortcut. `/exercise?custom=new` still works |
| 10 | Three recent workouts (History section) | Review the last sessions | Home *Last session* card | **C** | Moves with History to You |
| 11 | All history row (count) | The full History screen | Home, Progress *More*, You *Training* | **C** | **Training History → You** (§3) |

### 1.2 Training features that are not on the hub today

| # | Feature | Today | Class | Proposal |
| --- | --- | --- | --- | --- |
| 12 | Resume the workout in progress | Tab-bar resume strip (all tabs except Home); Empty workout shows "Finish your current workout first" | **A** | The hero shows *Resume workout*; the strip is hidden on Train, as on Home |
| 13 | Training calendar | Home ⋯ menu, Progress *More* | **B** | Add a Training-tools row (Train is its natural home; nothing is removed elsewhere) |
| 14 | Program library, details and dashboard; LegacyPath | Via Forge Paths and the plan | **B** | Reached from the hero and the Forge Paths row (restyle in 7.2C) |
| 15 | Templates screen, Explore, Exercise detail, History | Their own routes | **B** | Unchanged routes (restyle in 7.2C) |
| 16 | Records, Milestones | Progress | — | Stay on Progress (not Train) |

Nothing in this audit deletes a screen, route, record or data path. Category D removes two duplicate rows only.

## 2. Proposed Train hub (7.2B-1)

The hub has three blocks under the shared brand header:

1. A state-driven hero.
2. *Start a workout*.
3. *Training tools*.

On a standard iPhone that is about 1.3 screens, against the current five sections and up to fifteen rows.

```text
FORGE                                  [🔥 12]   BrandHeader, identical to Home
BUILT THROUGH DISCIPLINE
Train                                            screenTitle
Week 2 · Accumulation                            plan context (only with a plan)

┌──────────────────────────────────────────────┐ HeroCard (ember-glow fallback)
│ YOUR PROGRAM                                 │ overline, ember
│ FORGE STRENGTH                               │ heroTitle (condensed)
│ Intermediate · 3 days a week                 │
│ ▓▓▓▓▓▓░░░░░░░░  7 of 36 sessions             │ ForgeProgress
│ Up next · Push A · Today                     │
│ [▶  Start Push A          ]  [ View plan ]   │ CtaButton + OutlineButton
└──────────────────────────────────────────────┘

START A WORKOUT                                  SectionLabel
┌──────────────────────────────────────────────┐ ForgeCard (rows)
│ ⊕  Empty workout · Log freely       [Start]  │
│    Upper A · 5 exercises            [Start]  │ up to 3 templates, as today
│    Lower A · 4 exercises            [Start]  │
│    Full body · 6 exercises          [Start]  │
│    All templates                     12  ›   │
└──────────────────────────────────────────────┘

TRAINING TOOLS                                   SectionLabel
┌──────────────────────────────────────────────┐ You reference "Tools & Settings" list
│ 🧭 Forge Paths        18 curated programs  › │
│ 📚 Exercise library   412 exercises        › │
│ 📅 Training calendar  Schedule and sessions› │
└──────────────────────────────────────────────┘
```

### 2.1 Hero states (exactly one)

Each state uses existing data and actions.

| State | Overline · title | Facts | Primary | Secondary |
| --- | --- | --- | --- | --- |
| Workout in progress / paused | WORKOUT IN PROGRESS / WORKOUT PAUSED · workout title | Sets done, elapsed minutes | **Resume workout** | — |
| Active program or Path | YOUR PROGRAM / YOUR PATH · plan name | Level/frequency, sessions progress bar, "Up next · session · when" (`nextSession`) | **Start {session}** (`startNextSession`, as on Home) | View plan |
| Plan complete, or Path paused | Same overline · plan name | "Program complete" / "Paused" | **View plan** | Browse Forge Paths |
| No plan | FORGE PATHS · FIND YOUR PROGRAM | "{n} curated programs" | **Browse Forge Paths** | — |

- **One ember CTA per screen:** the hero's. Template *Start* buttons are neutral outline buttons.
- **No duplicate Forge Paths row:** when the hero is the Forge Paths card, the tools list leaves out its Forge Paths row.
- **Empty workout while training:** it stays disabled with "Finish your current workout first". Template rows and the sheet keep the one-workout guard.

## 3. Training History → You

### 3.1 Now (7.2B-1, minimal and functional)

- **Move the row:** the existing *Training history* row moves from the *Training* settings list up into **Training snapshot**, directly under the lifetime stats (Workouts · Working sets · Records · Time trained) and above *View progress*.
- **Row content:** the subtitle reads "Review, edit or repeat past workouts" and the value shows the completed count.
- **Same screen and route:** the same `/history` route and `History` screen, with no duplicate screen or data.
- **Back fallback:** History's Back fallback changes from `/(tabs)/train` to `/(tabs)/profile` (You). Back still returns to the previous screen whenever there is one.

### 3.2 Later (7.5 You transformation)

The reference's stat tile "**28 Workouts Completed ›**" becomes the History entry point, which is where the approved You design places it.

### 3.3 Contextual links that stay

- **Home:** the *Last session* card (review) and its *Workout history* row.
- **Progress:** *More → Training history*.
- **Training calendar:** past days open their workout review.
- **Deep links:** `/history` and `/workout?id=…` are unchanged.

## 4. Navigation changes (complete list)

1. **Train hub:** remove the History section, *Search exercises* and *Create custom exercise*. Add *Training calendar* (`/calendar`). Every other destination keeps its route.
2. **Tab bar:** hide the resume strip on Train as well as Home, because Train's hero offers Resume (`_layout.tsx`: `name !== "index" && name !== "train"`).
3. **History:** Back fallback becomes `/(tabs)/profile`.
4. **You:** move the *Training history* row (§3.1).

No route is renamed or removed. Expo Router deep links (`/history`, `/explore`, `/explore?search=1`, `/exercise?custom=new`, `/templates`, `/forge-paths/*`, `/paths`, `/calendar`) all keep working.

## 5. Removed from Train without deleting functionality

| Removed from the hub | Still available at |
| --- | --- |
| History section (three recent workouts) | Home *Last session*; History via You, Home, Progress |
| *All history* row | You → Training snapshot → *Training history* |
| *Search exercises* row | Exercise library (search field) |
| *Create custom exercise* row | Exercise library → *Create custom exercise* |
| *Plan* section header and the separate *Workout templates* row | Plan hero; *All templates* inside *Start a workout* |

## 6. Mockup fidelity strategy

There is no Train-hub reference (D28), so every hub element is taken from an approved reference rather than invented:

| Hub element | Taken from |
| --- | --- |
| Brand header, streak pill, screen margin, tab bar | Home reference (as built in 7.1B) |
| Plan hero: overline, condensed title, facts, progress, ember CTA + outline secondary, glow in place of artwork | Home reference *Today's Session* (`HeroCard`, `CtaButton`, `OutlineButton`, `ForgeProgress`) |
| *Start a workout* card | Home *Last session* card pattern (`ForgeCard`, hairline rows) |
| *Training tools* list: ember icons, bold title with grey description, chevrons, hairline dividers | You reference *Tools & Settings* |
| Section labels | Home/You references ("MY STATS", "TOOLS & SETTINGS") |

- **No artwork:** none is generated and the `trainHero` slot is not added; the hero uses the existing ember-glow fallback.
- **New component:** one REFORGE primitive, `ForgeListRow` (the *Tools & Settings* row), so the same row serves You in 7.5.
- **Unchanged:** everything else reuses existing REFORGE components. `TemplateSheet` keeps its behaviour and DS 2.0 sheet (sheet restyle belongs to 7.2C).

## 7. Risks and regressions

| Risk | Mitigation |
| --- | --- |
| Lifters who looked for History on Train | Three other entry points remain; You's row sits in the stats section, not buried in settings |
| Tests encode the DS 2.0 hub | Update the design-rule assertions; keep behavioural ones (labels below). Specifically: `today-train` "hub of rows with no orange" (superseded by D1) and its route list; `redesign` "Review Freestyle" on Train (moves to a History/You test); `today-train` History Back fallback |
| Accessible labels other tests rely on | Keep: `Forge Paths`, `Workout templates` (on *All templates*), `Start empty workout`, "Finish your current workout first", `{name} details`, `Start {name}`, `Resume current workout`, `Training history` |
| Hero repeats Home's start action | Intentional and limited to one button. Home leads with *today*, Train with the *plan*. Both use the same `startNextSession` |
| Resume hidden from the strip on Train | The hero always shows *Resume workout* while a workout is in progress (tested) |
| Large text / compact widths | Template rows wrap their Start button below the name. Hero CTAs stack. Strips follow existing `pairFits` rules |
| Performance | `planStatus`, `nextSession` and template reads are the same queries Home already makes. No per-second renders on Train |
| Light mode | REFORGE light tokens; one check on device |

## 8. Recommended 7.2B-1 scope

**In scope:**

- Train hub rewrite: `app/(tabs)/train.tsx` → `src/screens/Train.tsx` plus `src/screens/train/{model,sections}.tsx`, with the route file re-exporting.
- The `ForgeListRow` primitive and its Design System entry.
- The tab-bar strip rule.
- The History Back fallback.
- The You row move.
- Tests:
  - hero in all four states;
  - one-workout guard;
  - template Start and sheet;
  - tools routes;
  - History in You and its Back fallback;
  - 44 pt targets;
  - large text.
- Docs: REFORGE_FOUNDATION Train section.

**Out of scope (7.2C):** Forge Paths library, details and dashboard; LegacyPath; Templates, Explore, Exercise, Calendar and History screens; sheets.

**Unchanged throughout:** training algorithms, programs, data and sync.

## 9. Founder decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| T1 | Approve the three-block hierarchy and wireframe (§2) | Approve |
| T2 | Plan hero primary action | **Start the next session** (secondary: View plan) · alternative: View plan only, leaving Start to Home |
| T3 | Training History placement in You | **Snapshot section row now; "Workouts Completed" stat tile in 7.5** |
| T4 | Remove the *Search exercises* and *Create custom exercise* shortcuts from Train | **Remove** (both live in the Exercise library) |
| T5 | Add *Training calendar* to Train's tools | **Add** |

---

## 10. Founder decisions and implementation notes (7.2B-1)

**Decisions:** approved as recommended (T1 hierarchy, T2 Start the next session with View plan, T3 History in the Training snapshot, T4 remove the two exercise shortcuts, T5 add Training calendar).

**Where 7.2B-1 differs from this proposal:**

- The *Training tools* list always includes **Forge Paths**, as the 7.2B-1 brief lists it unconditionally. The no-plan hero's overline reads "No active plan" rather than "Forge Paths", so the two never share a spoken name.
- Template shortcuts are ordered by the most recently trained template (existing `templateId` on workouts), then by name. The previous order was by name only.
