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

Selected duration is primarily a time budget, not a requirement to fill every minute. Extra time can accommodate productive sets within the existing goal and weekly-volume limits, but does not require filler. If the base prescription cannot fit a shorter allowance, preview explains the conflict; it does not silently reduce sets. Every movement slot is optional. Equipment limits and explicit exercise or movement exclusions can omit any slot, including a main lift. No excluded movement is restored to satisfy a fixed split. If a session has no permitted exercises, preview explains that instead of creating an empty workout. The preview exposes coverage gaps rather than pretending that rows and vertical pulls, or hinges and leg curls, are identical.

The preview shows total weekly working sets and primary-target counts, explicitly excluding compound assistance from a second full-set count. Counts are planning information, not an exact biological dose model. Effort, warm-up, progression and recovery guidance is visible. Muscle priorities redistribute a fixed session set budget instead of increasing every muscle's workload. No automatic load progression or clinical limitation interpretation has been added.

## Saved data and phases

### Planner 5: purposeful rep ranges

New Build Muscle and Advanced Physique plans for experienced trainees use coaching defaults rather than identical fixed compound targets: a main press/squat/hinge uses 6–8, horizontal pulls and vertical presses use 8–10, vertical pulls use 10–12, and secondary presses and unilateral lower-body work generally use 8–12. Isolation work, beginner plans and other Paths retain their existing targets. Set counts are not randomized or replaced with a universal three-set rule. Existing weekly-volume, recovery and session-time safeguards still constrain additional sets. Duration accounts for the **upper** rep boundary, so a range cannot hide work from the time estimate.

These exact exercise-role ranges are practical defaults, not demonstrated biological optima. [Loading research](https://pubmed.ncbi.nlm.nih.gov/33433148/) supports hypertrophy across multiple loading zones; [repetition-versus-load progression research](https://pmc.ncbi.nlm.nih.gov/articles/PMC9528903/) supports repetition progression as an alternative to increasing load. Neither establishes that variation itself is superior or that these exact ranges minimize fatigue.

Path and standalone template editors expose lower and upper targets; equal values mean a fixed target. Starting a template snapshots its rep boundaries and working-set count on each workout exercise, while logged reps remain actual numeric performance. Editing the template later cannot rewrite that workout's target. Substituting an exercise clears the old target. Repeating a workout and creating a template from it retain its targets.

Target-based suggestions use complete, comparable finished sessions. A load increase needs two sessions at the same load, every working set at the upper target, and explicit manageable effort on every set (RIR ≥2 or RPE ≤8, with neither entry contradicting the other). Missing effort is not proof of readiness. No history or incomparable loads means manual selection, not an inferred zero load. Suggestions never apply automatically and applying them leaves completed sets and warm-ups unchanged. Technique and recovery still require the user's judgment. Freestyle workouts without targets retain the existing generic progression behavior; old Path workouts without a snapshot show manual guidance.

Programming version 5 is opt-in through accepting or rebuilding a Path; existing versions 1–4 are not regenerated. SQLite schema 2 adds nullable range/snapshot fields. Backups remain envelope version 1 with optional fields, and cloud workout aggregates carry those fields without changing the remote SQL schema. Old fixed-target backups remain readable; importing new backups into older app builds is not supported.

### Planner 6: weekly session balance

New plans review session purpose, working sets, duration, compound/isolation demands and overlapping muscle exposure, rather than requiring equal exercise counts. Explicit focus roles and lower-set-first allocation correct positional set bias; conservative redistribution moves existing work without adding exercises or increasing the previous weekly set budget. Goal-specific limits are enforced on new-plan edits as well as generation. Optional **Plan details** explains broad versus focused sessions and restriction-driven omissions.

The [weekly balance audit](research/WEEKLY_SESSION_BALANCE.md) contains the 525-request before/after evaluation, all supported full-equipment weekly structures, muscle coverage and limitations. Existing versions 1-5 are retained until an explicit rebuild. The underlying duration model, rep ranges, saved workout snapshots and supported frequencies remain intact.

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
