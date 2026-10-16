> Updated by the [Planner 3 audit and gym-flow simplification](research/PROGRAMMING_AUDIT_2026_10_15.md). The current screen shows one session; details and management open on request.

# Forge Paths: phone-first rework

This update supersedes the browser requirements in the historical Phase A report. At the user's request, supported targets are now **iOS and Android**. Windows remains a suitable computer for running Expo and connecting an iPhone; the application itself runs on the phone.

## What changed

The Paths dashboard now has a Monday–Sunday calendar, previous/next arrows, dated training/rest markers, selectable days, and descriptions of each training week's purpose. Calendar weeks and training weeks are deliberately distinguished: a cycle can start midweek, and rescheduling can move a session into a later calendar week. Sessions retain their original week, phase, identity and workout link. Navigation extends to the latest scheduled date, including recovery sessions beyond eight weeks. Missed and skipped sessions are visible and never count as completed.

New sessions use descriptive training focuses instead of Push A / Push B. Earlier saved schedules receive readable display names without rewriting their records. Earlier programming remains available until the user explicitly accepts a replacement through **Rebuild this Path**. Replacing archives the previous schedule and preserves logged workouts.

## Programming

The defaults are starting prescriptions, not a claim that a questionnaire discovers everyone's optimal training dose. The design follows the distinctions and limitations documented in [the research review](research/TRAINING_RESEARCH_REVIEW.md) and [continuing research](research/CONTINUING_RESEARCH.md).

| Path              | Training emphasis                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start Strong      | Spaced full-body practice, two working sets per movement, repeatable technique and gradual progression                                                    |
| Build Muscle      | Full body, upper/lower, or complementary muscle-group sessions according to availability; explicit chest/back, hamstring, shoulder, calf and arm coverage |
| Get Strong        | Primary lift practice with lower repetitions and longer rests, followed by lower-volume assistance                                                        |
| Lean & Strong     | Substantial resistance training with controlled volume and core work; no short-rest fat-loss promise                                                      |
| Athlete Mode      | Unilateral leg strength, posterior-chain work and trunk control; clearly labeled general foundation rather than sport-specific power/conditioning         |
| Advanced Physique | More complementary exercises and working sets, including direct isolation work, for experienced lifters                                                   |

Paths have no session-time limit: there is no 30/60/90-minute choice, and workouts are never built, padded or cut to fit a duration. Volume comes from each goal's session, exercise and weekly-muscle set caps; users train at their own pace with the listed rests. Every movement slot is optional. Equipment limits and explicit exercise or movement exclusions can omit any slot, including a main lift. No excluded movement is restored to satisfy a fixed split. If a session has no permitted exercises, preview explains that instead of creating an empty workout. The preview exposes coverage gaps rather than pretending that rows and vertical pulls, or hinges and leg curls, are identical.

The preview shows total weekly working sets and primary-target counts, explicitly excluding compound assistance from a second full-set count. Counts are planning information, not an exact biological dose model. Effort, warm-up, progression and recovery guidance is visible. Muscle priorities redistribute a fixed session set budget instead of increasing every muscle's workload. No automatic load progression or clinical limitation interpretation has been added.

## Saved data and phases

### Planner 5: purposeful rep ranges

New Build Muscle and Advanced Physique plans for experienced trainees use coaching defaults rather than identical fixed compound targets: a main press/squat/hinge uses 6–8, horizontal pulls and vertical presses use 8–10, vertical pulls use 10–12, and secondary presses and unilateral lower-body work generally use 8–12. Isolation work, beginner plans and other Paths retain their existing targets. Set counts are not randomized or replaced with a universal three-set rule. Existing weekly-volume and recovery safeguards still constrain additional sets.

These exact exercise-role ranges are practical defaults, not demonstrated biological optima. [Loading research](https://pubmed.ncbi.nlm.nih.gov/33433148/) supports hypertrophy across multiple loading zones; [repetition-versus-load progression research](https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/) supports repetition progression as an alternative to increasing load. Neither establishes that variation itself is superior or that these exact ranges minimize fatigue.

Path and standalone template editors expose lower and upper targets; equal values mean a fixed target. Starting a template snapshots its rep boundaries and working-set count on each workout exercise, while logged reps remain actual numeric performance. Editing the template later cannot rewrite that workout's target. Substituting an exercise clears the old target. Repeating a workout and creating a template from it retain its targets.

Target-based suggestions use complete, comparable finished sessions. A load increase needs two sessions at the same load, every working set at the upper target, and explicit manageable effort on every set (RIR ≥2 or RPE ≤8, with neither entry contradicting the other). Missing effort is not proof of readiness. No history or incomparable loads means manual selection, not an inferred zero load. Suggestions never apply automatically and applying them leaves completed sets and warm-ups unchanged. Technique and recovery still require the user's judgment. Freestyle workouts without targets retain the existing generic progression behavior; old Path workouts without a snapshot show manual guidance.

Programming version 5 is opt-in through accepting or rebuilding a Path; existing versions 1–4 are not regenerated. SQLite schema 2 adds nullable range/snapshot fields. Backups remain envelope version 1 with optional fields, and cloud workout aggregates carry those fields without changing the remote SQL schema. Old fixed-target backups remain readable; importing new backups into older app builds is not supported.

### Planner 8: evidence-based prescriptions and customization

Every prescription now comes from a central policy (`src/domain/paths/policy.ts`), based on the movement's purpose (heavy main lift, session-anchor compound, other compound, machine/cable, isolation, core), the Path's goal and the lifter's experience. Sets are no longer filled up to a session cap. Each muscle is brought into an evidence-informed weekly range instead, and advanced lifters get closer proximity to failure and more targeted exercises rather than more sets per lift. Every non-strength exercise has a rep range and an effort target (reps in reserve), so double progression applies. Load increases now require about one rep in reserve (logged RPE ≤ 9 or RIR ≥ 1), matching the prescribed effort. The rules, sources and before/after programs are in the [programming specification](research/PROGRAMMING_SPEC_V2.md).

`src/domain/paths/programQuality.ts` is the single validation engine for generation, saved-plan validation and live customization. Errors (integrity rules) block starting or saving a plan; warnings (for example a fifth set, volume modestly above a ceiling, short rest on a heavy lift, or a fixed rep target) inform without overriding the user.

The pre-commitment preview is a week overview: one collapsible card per day with its focus, exercise count, sets and main muscles. Exercises are compact rows that expand to set and rep steppers, rest chips, effort and progression guidance, a ranked swap list that preserves the slot's purpose, and an optional starting load. Findings update as the user edits, and **Start this Path** is disabled until errors are resolved. The dashboard's workout editor uses the same components and checks. Saved plans from Planners 1–7 keep their own rules and stay usable.

A final quality audit (spec §3a, §3b and §7) made the following changes:
- Direct sets are now separated from estimated secondary involvement. Only direct sets count toward floors; the 0.5 secondary weight feeds ceilings and fatigue warnings and is labelled as a heuristic in the plan details.
- Weekly floors are capped by training frequency. Three-day plans are designed for three days, with seven exercises and about 21 sets per full-body session.
- Generated defaults stop at about 60% of each weekly range.
- Load-limited lifts keep 6+ reps and hinges 5+.
- Repeated core work is removed from 4-day athletic and recomposition splits.
- Foundation (weeks 1–4) and Evolution (weeks 5–8) now differ. Evolution keeps the same exercises; experienced hypertrophy, recomposition and athletic plans add bounded accessory volume, and strength main lifts move one rep heavier. Beginners repeat Foundation. Edits to a current plan re-derive Evolution.

### Planner 7: balanced weeks without time limits

The 30/60/90-minute duration selection, duration-based generation and the session-time estimator are removed. Saved programs and backups that still contain a `duration` preference load normally; the value is ignored. The profile's former "preferred workout duration" field is no longer shown but stays stored for older backups. Rest timers and recorded workout durations are unchanged.

Each week is planned as one split before any prescriptions are written. The five-day split's opening upper day now carries six movements (incline and rear-delt work live on the chest and back days), so full-gym weeks stay within one or two exercises per day. When equipment or exclusions empty a planned slot, short days first take a same-role alternative for that slot (never an unrelated filler); otherwise the longest days drop their least essential movement, preferring work already trained elsewhere that week and never a main lift, focus or priority movement, or below three exercises. Working sets are then evened out within goal caps.

A reusable week audit (`src/domain/paths/weekAudit.ts`) flags any program where one day has at least twice the exercises of another, exercise counts differ by more than two, one day carries at least twice the working-set load of another (heavy low-rep compound sets weigh 1.5×), or a session has more than three exercises for the same primary muscle. Version 7 plans that fail the audit cannot be accepted or saved by an edit. If a request cannot be balanced, preview explains why and lists the training frequencies that would work. When the cause is that no pulling exercise is possible (for example bodyweight only at five or six days), the message also names affordable home equipment that would fix it, such as a resistance band with a door anchor or a doorway pull-up bar. Each item is only suggested after verifying it produces a balanced week.

Saved version 1–6 plans keep their rules so recorded training and schedules are never blocked. The dashboard flags an unbalanced older plan and points to **Rebuild this Path**; rebuilding archives the old plan with all history intact. If three of the last four completed Path workouts finish well short of the prescribed sets and reps, the dashboard suggests a lower experience level. Forge never changes the level automatically, and session duration plays no part.

### Planner 6: weekly session balance

New plans review session purpose, working sets, compound/isolation demands and overlapping muscle exposure. Explicit focus roles and lower-set-first allocation correct positional set bias; conservative redistribution moves existing work without adding exercises or increasing the previous weekly set budget. Goal-specific limits are enforced on new-plan edits as well as generation. Optional **Plan details** explains broad versus focused sessions and restriction-driven omissions.

The [weekly balance audit](research/WEEKLY_SESSION_BALANCE.md) contains the 525-request before/after evaluation, all supported full-equipment weekly structures, muscle coverage and limitations. Existing versions 1-5 are retained until an explicit rebuild. Rep ranges, saved workout snapshots and supported frequencies remain intact.

The following describes the earlier Planner 3 release:

Programming version 3 applies to newly accepted plans. Versions 1 and 2 retain their validation rules so old schedules can still start and be edited. SQLite schema, backup format, completed workout snapshots and explicit schedule/workout links are retained. Existing pause/resume, move, skip/restore and archive behavior remains in place.

Foundation (weeks 1–4) and Evolution (weeks 5–8) still own independent template references. Accepted exercises remain consistent through all eight weeks. Week descriptions provide guidance; they do not silently alter prescriptions or introduce an exercise rotation engine.

## Desktop retirement

Removed the dedicated web export/server commands, browser-only storage/alert/backup/notification adapters, SQLite worker patch, Playwright configuration and browser test jobs. Native share-sheet backups, SecureStore sessions, notifications and SQLite use their existing native implementations. Expo explicitly targets iOS and Android.

Removing browser code does not transfer or delete a previous browser database. See [browser retirement and data recovery](WEB.md) before importing any old browser backup; imports replace the receiving database.

## Run on iPhone from Windows

In PowerShell, inside the checkout:

```powershell
git checkout feat/forge-paths-foundation
git pull
npm ci
npx expo start --go
```

Scan the QR code with the iPhone camera and open it in the matching Expo Go version. Keep the computer and phone on the same network; if local connectivity fails, try `npx expo start --go --tunnel`. Open **Train → Forge Paths**. Existing Paths can be retained or explicitly rebuilt.

## Verification

The domain suite covers goal-specific prescriptions, coverage, time constraints, specialization, every advertised frequency, equipment limitations, legacy program compatibility, calendar dates across daylight saving, session links, pause/resume, rescheduling, snapshots and backups. Native UI tests exercise the real personalization flow and calendar interaction, including a moved session beyond week eight. iOS/Android exports verify bundle compatibility; they do not establish physical-device behavior or real-world training outcomes.

Planner 5 validation: **108 targeted domain/data tests** and **31 Path/workout UI tests** passed, including range persistence, migration rollback, legacy backups, frozen targets, range editing, conservative progression and explicit load application. TypeScript, changed-file ESLint, formatting and both iOS/Android bundle exports passed. Physical iPhone/Android testing remains outstanding.

Historical Planner 3 validation: **70 domain/data tests** and **18 native UI tests** passed; TypeScript, ESLint and source formatting checks passed. The additional independent-phase regression also passed all 18 Path tests after changing an Evolution exercise while retaining Foundation workout snapshots. That revision exported successfully for both iOS and Android (Hermes bundles).
