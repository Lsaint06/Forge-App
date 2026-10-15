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

New plans retain their workload when the time allowance increases. If the prescription cannot fit a shorter allowance, preview explains the conflict; it does not silently reduce sets. Every movement slot is optional. Equipment limits and explicit exercise or movement exclusions can omit any slot, including a main lift. No excluded movement is restored to satisfy a fixed split. If a session has no permitted exercises, preview explains that instead of creating an empty workout. The preview exposes coverage gaps rather than pretending that rows and vertical pulls, or hinges and leg curls, are identical.

The preview shows total weekly working sets and primary-target counts, explicitly excluding compound assistance from a second full-set count. Counts are planning information, not an exact biological dose model. Effort, warm-up, progression and recovery guidance is visible. Muscle priorities redistribute a fixed session set budget instead of increasing every muscle's workload. No automatic load progression or clinical limitation interpretation has been added.

## Saved data and phases

Programming version 2 applies to newly accepted plans. Version 1 retains its validation rules so old schedules can still start and be edited. SQLite schema, backup format, completed workout snapshots and explicit schedule/workout links are retained. Existing pause/resume, move, skip/restore and archive behavior remains in place.

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

Validation for this revision: **70 domain/data tests** and **18 native UI tests** passed; TypeScript, ESLint and source formatting checks passed. The additional independent-phase regression also passed all 18 Path tests after changing an Evolution exercise while retaining Foundation workout snapshots. The final revision exported successfully for both iOS and Android (Hermes bundles). Physical iPhone/Android testing remains outstanding.
