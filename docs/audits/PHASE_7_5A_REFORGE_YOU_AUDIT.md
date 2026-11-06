# Phase 7.5A — REFORGE You and Goals: roadmap audit and plan

**Status:** read-only audit for founder review. No application code is changed.
**Branch:** `feat/forge-paths-foundation` at `3366cdc` (after 7.4G).
**Date:** 26 October 2026.

This audit compares the original Phase 7.5 plan with the current You, Goals, History and related screens, and with the approved You reference, and proposes the remaining work. The five-tab architecture (Home · Train · Nutrition · Progress · You) is unchanged.

## 0. Sources reviewed

- **Phase 7.0 plan** ([PHASE_7_0_REFORGE_ARCHITECTURE.md](PHASE_7_0_REFORGE_ARCHITECTURE.md)):
  - §4.5: the You reference mapping;
  - §10: preservation boundaries;
  - §13: 7.5-1 to 7.5-6;
  - §15: decisions D5, D14–D19 and D30.
- **Later decisions:**

  | Source | Decision |
  | --- | --- |
  | 7.1 entry criteria | D18 resolved: the active goal nearest completion |
  | 7.2B T3 | History lives in You; the "Workouts Completed" tile in 7.5 |
  | 7.2C | History is restyled with You in 7.5 |
  | 7.3G G2 | The You targets editor stays until its REFORGE milestone |
  | 7.4A P5 | The Goals chart adopts the REFORGE chart in 7.5 |
  | 7.4F | Progress "Next goals" uses Home's next-target order |

- **Goals:** WP4D Goals audit, and the WP6 D15 pending-deletions plan (deferred goal and check-in deletes).
- **Approved You reference:** `ChatGPT Image Oct 24, 2026, 09_17_59 PM-5.png` from the founder's Downloads. 941 × 1672 px, 1,608,106 bytes, SHA-256 `6116C3C3…13AB61`. It is the fifth file of the approved set (`-3` Nutrition and `-4` Progress are already stored in [references/](../redesign/reforge/references/README.md)). **It is not yet in the repository.**
- **Code:**
  - screens: [You.tsx](../../src/screens/You.tsx) (664 lines), [Goals.tsx](../../src/screens/Goals.tsx) (500), [History.tsx](../../src/screens/History.tsx) (98), [Measurements.tsx](../../src/screens/Measurements.tsx) (284), [Checkins.tsx](../../src/screens/Checkins.tsx) (385, Recovery), [account.tsx](../../app/account.tsx) (314);
  - components: `GoalCard`, `GoalSheet`, [ProfileForm.tsx](../../src/components/ProfileForm.tsx) (668), [Backup.tsx](../../src/components/Backup.tsx);
  - the `membership` foundation and `Journal.tsx` routing.
- **Tests:**

  | Suite | Tests |
  | --- | --- |
  | `you` | 6 |
  | `goals` (UI / logic) | 13 / 18 |
  | `measurements` (UI / logic) | 11 / 14 |
  | `checkins` (UI / logic) | 11 / 10 |
  | `profile` | 12 |
  | `data-safety` | 18 |
  | `backup-file` | 6 |
  | `wp5` | 11 |
  | `sync` (logic) | 7 |
  | `unsaved-input` | 3 |

## 1. Original Phase 7.5 scope (7.0 §13)

| WP | Scope | Notes now |
| --- | --- | --- |
| 7.5-1 | Profile header (monogram, D16 / D17) and the Current plan card in the Level slot (D15) | D15–D17 still open |
| 7.5-2 | Stats strip | Includes the History entry point (7.2B T3) |
| 7.5-3 | Primary goal hero (D18) | D18 resolved for Home: nearest completion |
| 7.5-4 | My stats with approved deltas | Delta windows open (D19) |
| 7.5-5 | Tools & settings, a Preferences screen, Data & privacy, About (everything stays reachable) | |
| 7.5-6 | Goals, Recovery, Measurements and Account restyle | Plus History (7.2C) and the Goals chart (P5) |

**Reference** (top to bottom):

1. Brand header with bell and streak.
2. Profile header: photo avatar with ember ring and edit badge, name, tagline, "Strength Focus", location, "Member since".
3. FORGE ATHLETE LEVEL 4 with XP bar.
4. Stats strip: Day Streak · Workouts Completed · Weeks Consistent · Personal Records, each with a chevron.
5. PRIMARY GOAL hero: title, description, "78% complete", View Goals, athlete photograph.
6. MY STATS: Bodyweight, Height, Body Fat, Bench Press 1RM, each with a delta and window, and "View All".
7. TOOLS & SETTINGS: Goals, Recovery, Preferences, Account.

## 2. Already redesigned

- **Shared REFORGE layer:** frames, cards, header, metrics, rows, segments, charts.
- **Hydration sheet** (7.3C): already opened from You.
- **Nutrition `TargetsSheet`** (7.3G G2): the same rules and storage as You's "Nutrition targets" editor, ready to replace it.
- **Home's Next target** (D18), and Progress's Next goals and Milestones (7.4F), already present goals in REFORGE style.
- **Already wired and protected by tests:**
  - You's streak, records and lifetime figures;
  - the plan row;
  - focused editors that save only their own fields;
  - the `?edit=focus` deep link from the Forge Paths Library;
  - units, appearance and reminders saving instantly;
  - every account, history, journal and data action staying reachable.

**Nothing in You, Goals, History, Measurements, Recovery or Account has been transformed yet.**

## 3. Screens still on the earlier design system

| Screen or component | Current state | Phase 7.5 work |
| --- | --- | --- |
| **You** (tab) | `Screen` titled "You": profile `Card` with an initials `Avatar`; Training snapshot; Membership card; grouped `ListSection`s (Training, Health & body, Notifications, App, Account & data, About); `SegmentedControl`, `Switch`; `ProfileForm` sheets | Full transformation (§9) |
| **History** (`/history`) | `Screen` with month `ListSection`s, `ListRow` and an `OverflowMenu` (Repeat, Delete), and "Show earlier" paging | REFORGE sub-screen; `ForgeListRow` has no trailing slot for the menu (needs a small additive slot) |
| **Goals** (`/journal?kind=goal`) | `Screen`, `GoalCard`, `GoalSheet`, the earlier `LineChart`, Undo banner, deferred delete, Mark as achieved, Archive / Restore | REFORGE screen, cards, sheet and `ForgeLineChart` (P5) |
| **Measurements** (`/journal?kind=measurement`) | `Screen`, list and detail with its own ranges, profile-weight offer, Undo | REFORGE restyle |
| **Recovery** (`/journal?kind=recovery`) | `Screen`, keyboard-free check-in sheet, trends, deferred delete | REFORGE restyle |
| **Account** (`/account`) | Earlier `Card`s: sign-in, sync status, Sync now, conflicts | Restyle only. **No authentication or sync change** |
| `ProfileForm` sheets (You, onboarding) | Earlier fields; validation is protected (§10) | Restyle the presentation used by You only, if approved (Y8); onboarding unchanged |

## 4. History (deferred from 7.2C / 7.4)

| | |
| --- | --- |
| **Routes and entry points** | One `/history` route. Opened from You's Training snapshot, Home's *Workout history*, Progress → More, and Progress's All-time stats header (7.4E). Back falls back to You (7.2B T3) |
| **Function to keep** | Completed workouts newest first, grouped by month. Each row opens the workout review (`/workout?id=`). A row menu offers **Repeat workout** (guarded by `blockIfTraining`) and **Delete workout** (confirmed; removes it from history and progress). "Show earlier (n)" pages 60 at a time |
| **Plan** | `ForgeSubScreen` "History" with the count. A `RowsCard` per month. REFORGE rows with workout title, the existing `workoutLine` (date, duration, volume in the lifter's units) and the overflow menu. A REFORGE "Show earlier" button and `ForgeEmpty` |

## 5. Existing functionality to keep (profile, preferences, account, training identity)

| Area | Today | Storage |
| --- | --- | --- |
| Identity | Name, initials avatar, "experience · training goal", "Training since {month}" (first completed workout), plan row or "No active plan" (Forge Paths), "Complete your training profile" prompt | `profile` |
| Editors (`ProfileForm`) | Edit profile (name, height, weight; body fat removed from this editor in 7.5B.1, its saved value kept); Training focus (journey); Training preferences (frequency, rest, load increment, rep range, priority muscles); Nutrition targets | `profile`; `TARGETS_SAVED` setting |
| Hydration | Water goal and fluid unit (REFORGE sheet) | `profile` |
| Health & body links | Body measurements, Nutrition log (today), Recovery, Goals | journals |
| Notifications | Training reminders switch | settings |
| App | Units (kg / lb), Appearance (dark / light / system) | `profile` |
| Account & data | Account & cloud sync (`/account`: sign-in, Sync now, conflict resolution), Export backup, Import backup (replace, with confirmation), Privacy & training guidance, Delete all local data (confirmed) | backup, sync outbox |
| Membership | Placeholder: "Membership is on the way". `membership()` returns free with no purchase available | none |
| About | Version and schema; Replay intro and Design system (development only) | |
| Deep link | `/(tabs)/profile?edit=focus` from the Forge Paths Library opens Training focus once | params |

**Sync note (correction):** cloud sync **is** reachable, from the Account screen. A sync and a conflict resolution both call `touch()`, so every cached figure refreshes. The Phase 7.4G report previously said sync was not connected; that sentence was corrected during this audit.

## 6. Missing relative to the reference

Classes as in Phase 7.0:

| Class | Meaning |
| --- | --- |
| R | Existing data |
| P | Needs presentation work |
| D | A derived number that needs a decision |
| F | A new feature |
| X | Omitted |

| Reference element | Status | Class |
| --- | --- | --- |
| Brand header, streak pill | Missing on You | R |
| Bell | Omitted everywhere (D14) | X |
| Photo avatar and edit badge | Initials avatar | R / F (D16: monogram) |
| Tagline, location | No such fields | X (D17) |
| "Strength Focus" | `trainingGoal(p)` | R |
| "Member since" | "Training since" (first completed workout; truthful) | R |
| Level 4 / XP | No gamification | F (D15: Current plan card in that slot) |
| Day Streak | `summary().streak` | R |
| Workouts Completed (opens History) | Completed count | R (7.2B T3) |
| **Weeks Consistent** | Only range-relative active weeks exist | **D** (Y4) |
| Personal Records (opens Records) | `model.events.length` | R |
| Primary goal title, description, % complete, View Goals | Goals `evaluate()`; Home's `nextTarget` (D18). A goal has no description; % only where Goals gives a real ratio | R / D (Y5) |
| Athlete photograph | No asset; AI imagery may not be reused | X (ember glow, as P6) |
| My stats: Bodyweight, Height, Body fat | Bodyweight: Measurements, else profile. Height: profile. Body fat: **not a default metric** (7.5B.1); optional, only from an actual Body fat measurement | R / D |
| Bench Press 1RM | `ExerciseRecords.e1rm` | R / D (which lift; Y6) |
| My stats deltas "vs 4 / 8 / 12 weeks" | `bodyweightOver` and measurement helpers exist | D (Y6, D19) |
| Tools: Goals, Recovery, Account | Existing routes | R |
| Tools: Preferences | Settings live inline today | P (Y7) |
| Account "membership and billing" | Account is sign-in and sync; membership is a placeholder; **no billing exists** | X (Y9) |

## 7. Functional gaps versus optional improvements

**Gaps that block reference fidelity** (presentation over existing data):

- REFORGE frame and header on You;
- the Current plan card;
- the stats strip with its entry points;
- the primary goal hero;
- My stats;
- the Tools & settings grouping;
- REFORGE History, Goals, Measurements, Recovery and Account.

**Defects found:** none in the audited behaviour.

**Optional improvements (not proposed unless approved):**

- photo avatar (D16; new dependency, storage and backup format);
- XP and levels (D15);
- goal pinning ("primary" chosen by the lifter; a new setting);
- goal descriptions (a new field);
- location and tagline fields (D17);
- membership purchase or billing;
- notification centre (D14).

**Avoid duplicating Progress.** You's current Training snapshot (Workouts, Working sets, Records, Time trained) overlaps Progress's All-time stats (Workouts, Total volume, Training time). The reference replaces it with the stats strip, which is identity and navigation: streak, workouts, consistency, records. **Proposal:** drop Working sets and Time trained from You. Time trained stays in Progress All-time; working sets stay in Training volume.

## 8. Risks

| Area | Risk | Mitigation |
| --- | --- | --- |
| Profile data | Editors must keep saving only their own fields; validation (`ProfileForm`, `profileSchema`) is protected | Keep `ProfileForm` logic; restyle only its presentation if approved (Y8); keep the `you.test` and `profile.test` assertions |
| Nutrition targets | You's editor and Nutrition's `TargetsSheet` must stay consistent (G2) | Use `TargetsSheet` from You (same rules and storage) |
| Units and theme | Switching re-renders every screen; light mode | Same `saveProfile` path; light-mode tests |
| Destructive actions | Import (replace), Delete all data, Delete workout (History), Delete goal (Undo, deferred), check-in deletes | Keep `confirm` copy and actions unchanged; keep the pending-deletion behaviour (WP6 D15) |
| Navigation | `?edit=focus` deep link; History, Goals and Measurements Back fall back to You; Journal kinds; Nutrition today | Route tests for each; no route renamed |
| Sync and account | Account screen and auth must not change | Restyle only; `sync.test`, `data-safety` and `account` assertions unchanged |
| History | Repeat must keep `blockIfTraining`; Delete must keep its confirmation; paging | Keep handlers; a small additive trailing slot on `ForgeListRow` |
| Goals | Undo timers, deferred writes restored after restart, Mark as achieved, Archive / Restore, legacy-goal conversion | Restyle components only; `goals` UI and logic suites unchanged |
| Duplication | Primary goal equals Home's Next target and Progress's first Next goal | Y5: accept the intentional repetition (identity page) or choose a different presentation |
| Performance | You computes `progressModel` and lifetime figures | Memoise as on Progress (PD-1 / PD-4 patterns) |

## 9. Proposed staged roadmap

Each stage:

- runs the full suite (typecheck, lint, format, logic, UI, food-library and branded checks, iOS / Android export);
- adds focused tests;
- stops for founder approval before committing.

| Stage | Scope | Main files | Protected |
| --- | --- | --- | --- |
| **7.5B Frame and identity** | Store the You reference (unaltered, with its hash). `ForgeScreen` with the streak pill. Profile header: monogram with ember ring, name, training goal and experience, "Training since". **Current plan card** in the Level slot (plan, week and phase, progress, opens the plan) or "Choose a Forge Path". Edit profile; complete-profile prompt | `You.tsx`, new `screens/you/sections.tsx` | Profile storage, `ProfileForm` validation, the `?edit=` link |
| **7.5C Stats, primary goal, My stats** | Stats strip (Day streak, Workouts → History, Weeks consistent (Y4), Records → Records). Primary goal hero from `nextTarget` (name, state, current → target, bar only with a real ratio, View Goals; ember glow, no photo). My stats (Y6) with tested helpers in `domain/presentation/`; body fat is not a default primary metric (7.5B.1 direction below). Training snapshot removed (Y10) | `you/sections.tsx`, `domain/presentation/you.ts` | Goals evaluation, records, measurements |
| **7.5D Tools, Preferences, data** | Tools & settings rows (Goals, Recovery, Measurements, Nutrition targets via `TargetsSheet`, Hydration, Preferences, Account). **Preferences** (Y7): Units, Appearance, Training reminders, Training focus, Training preferences. **Data & privacy**: Export, Import, Privacy, Delete. **About** (and development rows). Membership (Y9) | `You.tsx`, new `/preferences` route if approved | Backup, import, delete, reminders, theme behaviour |
| **7.5E History** | REFORGE History (§4) | `History.tsx`, additive `ForgeListRow` trailing slot | Repeat guard, delete confirmation, paging |
| **7.5F Goals** | REFORGE Goals list and detail, `GoalCard`, `GoalSheet` and `ForgeLineChart` (P5). Undo, Archive / Restore, Mark as achieved, legacy conversion unchanged | `Goals.tsx`, `components/goals/*` | Goal engine, deferred writes, validation |
| **7.5G Measurements, Recovery, Account** | REFORGE restyles of the three screens; Account's auth and sync logic untouched | `Measurements.tsx`, `Checkins.tsx`, `account.tsx` | Measurement validation, check-in scales, auth, sync |
| **7.5H QA** | Compact and large text, VoiceOver, light mode, every link and Back, performance, founder visual review, report | tests, report | |

7.5B–D change the You tab itself; 7.5E–G are independent sub-screens and could be reordered.

## 10. Testing and acceptance

**Behaviour preserved:** the existing suites keep their behavioural assertions: `you`, `profile`, `goals`, `measurements`, `checkins`, `data-safety`, `backup-file`, `wp5`, `sync` and `unsaved-input`. Only design-rule assertions are updated, and each change is listed.

**Parity:** the same fixture gives the same values for:

- streak, workouts and records;
- the plan's week and progress;
- the primary goal (equal to Home's Next target);
- bodyweight and height (body fat only if the optional measurement-sourced metric is approved);
- the best lift;
- every derived delta, with a unit test per helper.

All in kg and lb.

**Navigation:** every row and tile opens its existing route, Back from each sub-screen returns to You, and `?edit=focus` opens Training focus once.

**Acceptance:**

- no fictional values: no XP, invented descriptions, locations or percentages;
- 44 pt targets;
- light mode;
- 320 pt screens and 2× text (the strips wrap to 2 × 2, then one column);
- founder visual review against the reference.

## 11. Decisions requiring founder approval

| # | Decision | Options (recommended first) |
| --- | --- | --- |
| **Y1** | Level / XP slot (D15) | **Current plan card (plan, week and phase, progress) or "Choose a Forge Path"** · design gamification (F) |
| **Y2** | Avatar (D16) | **Monogram with ember ring** · photo picker (new dependency, storage, backup format) |
| **Y3** | Tagline and location (D17) | **Omit; show training goal, experience and "Training since"** · add profile fields (F) |
| **Y4** | "Weeks consistent" | **Consecutive Monday–Sunday weeks with at least one finished workout, ending this week or last (a tested helper)** · weeks meeting the weekly frequency target · omit (three tiles) |
| **Y5** | Primary goal | **Home's next target (D18), shown as the hero; a bar only with a real ratio; no description** · a lifter-pinned goal (new setting) · omit on You (avoid repeating Home and Progress) |
| **Y6** | My stats and deltas (D19) | **Bodyweight (change over 4 weeks, P1 helper), Height (profile, no delta), Body fat (latest, change over 4 weeks; *superseded in 7.5B.1: not a default, optional and measurement-sourced only, §12*), best lift: estimated 1RM of the most-trained barbell lift, change over 4 weeks; one 4-week window for all** · bench press always · no deltas |
| **Y7** | Preferences | **A REFORGE `/preferences` sub-screen** grouping Units, Appearance, Training reminders, Training focus and Training preferences · keep them inline on You |
| **Y8** | `ProfileForm` sheets in You | **Restyle their presentation (fields, labels, buttons) with validation untouched; onboarding unchanged** · leave as is |
| **Y9** | Membership and "billing" | **Move the membership note into Account ("Free · Premium is on the way"); no billing** · keep the card on You · remove it |
| **Y10** | Training snapshot | **Replace with the stats strip; drop Working sets and Time trained from You (they live in Progress)** · keep both |
| **Y11** | Store the You reference in `docs/redesign/reforge/references/` (unaltered, with hash) | **Yes, in 7.5B** |
| **Y12** | Stage order | **B → C → D → E → F → G → H** · sub-screens (E–G) first |

Unchanged without separate approval: authentication, cloud sync and account infrastructure; goal, measurement, check-in and metric calculations; stored data; the five tabs. No implementation starts until these decisions are made.

## 12. Founder direction from 7.5B.1: body fat

The founder removed body fat from the You tab's *Edit profile* editor (7.5B.1).

**Dependency check.** The profile's `bodyFat` is read by no calculation, goal, recommendation, nutrition target or progress metric. It exists only in:

- the profile type (default 0, meaning "not given");
- the validation schema (0–100);
- the onboarding foundation step, which is unchanged;
- the full settings form, which is unchanged.

Body composition is tracked separately as the **Body fat** measurement type (journal records in %), shown in Measurements and Progress. That is unchanged.

**Data.** The field, the schema, stored values, backups and sync are unchanged. Editors save the stored profile with only their shown fields changed, so a saved body fat value is kept (regression test in `tests/ui/you-identity.test.tsx`).

**Effect on 7.5C (supersedes Y6's body fat item).**

- Body fat is **not** a default primary *My stats* metric.
- If shown at all, it is optional and sourced only from an actual *Body fat* measurement, with that measurement's date.
- It is never shown from the profile value, and never as a placeholder.
- The remaining My stats (bodyweight, height, best lift) and their deltas stay with Y6.