# FORGE 2 implementation status

This is a cohesive first redesign pass, not a claim of completed physical-device acceptance of the entire brief.

## Before → after

- Repeated bright accents, rounded dashboard cards, long Home page → brief-aligned typed tokens, restrained 12-point cards, neutral secondary actions, compact today-first hierarchy.
- Text-only exercise rows and star glyphs → original offline muscle-category diagrams, Ionicons, honest media labels, extensible bundled-image/licensed-video metadata.
- Workout inside a ScrollView and picker FlatList inside another vertical ScrollView → single workout FlatList, non-scrolling sheet container around the picker FlatList. Horizontal filter lists retain their distinct orientation. No warning suppression.
- Always-expanded notes, progression and exercise management → compact common entry with exercise options and advanced set disclosure. Warmup/working distinction, unilateral sides, duration/distance, effort, tempo, notes, grouping and rest fields remain available.
- Timer scrolled away and footer actions required reaching the end → persistent session timer/name header and fixed Add exercise/Finish controls. Timer updates are isolated from exercise-list rendering. Completion and discard still require confirmation.
- Profile and scattered wellness shortcuts → You with Personal, Training & wellness, Milestones, Account & data. Existing native privacy, export/import and deletion paths retained.
- Dense programs → Templates/Programs selection and expandable prescriptions. Train has quick template starts and direct programs entry.
- Unlabeled trend scale → visible bounds, dates and units, neutral green lines, weekly completed-day visualization, exercise-specific recorded load history.

## Preservation

No dependency, app identifier, SQLite schema, backup format, repository, domain calculation, authentication or sync changes. Existing data files are never reset by this redesign. Guest/offline remains the default. Scheduled starts use real saved templates and preserve planned deload set reductions; missing templates send the user to replacement selection. Display-unit conversion does not change stored kilograms.

## Component map

`src/theme.ts` supplies typed colors, spacing, radii, typography, motion, border and shadow values. `src/components/design.tsx` provides AppScreen, ScreenHeader, SectionHeader, PrimaryButton, SecondaryButton, IconButton, MetricCard, StatRow, ProgressRing, ProgressBar, ExerciseCard, WorkoutCard, ProgramCard, EmptyState, ErrorState, LoadingSkeleton, FilterChips, SearchField, SegmentedControl, BottomSheet, ConfirmationDialog, FormField, NumericStepper, AchievementCard, ChartContainer and WeeklyConsistency. Some names adapt the established primitives rather than duplicating implementations; some new primitives are available for subsequent refinement but not used on every screen. SetRow lives in WorkoutExerciseCard; RestTimer lives in Workout. Existing destructive actions keep native confirmation alerts.

## Media and motion limits

The media registry is intentionally empty. No demonstration photographs or videos have been sourced. Original SVG category diagrams are illustrations, not movement demos or precise anatomical diagrams. To add imagery, register a bundled `require(...)` source, accessible label and credit by existing exercise ID. Licensed video entries take an HTTPS URL and attribution, opening the external player; no embedded player or video caching has been implemented. Review rights before adding assets.

Press-state feedback, existing reduced-motion-aware bottom sheets and progress animation, and existing important-action haptics remain. Completion gains semantic visual feedback. Animated card expansion, specialized rest/tab transitions, and app-icon assets are not implemented. System fonts and bundled icon fonts need no network.

## Remaining acceptance work

Physical iPhone/Android testing, smaller-screen and largest Dynamic Type layout inspection, keyboard interactions, VoiceOver traversal, background reminders, long-workout frame-rate profiling and live Supabase are unverified. Native share-sheet export/import and program adoption navigation need device acceptance. Modal list nesting is removed structurally and UI-tested; absence of the warning on a physical phone must still be confirmed. No public Codespaces URL was created or verified in this execution. Existing cloud tunnel constraints are unchanged.

## Phone preview

In your existing Codespace, stop Metro with Ctrl+C, then run:

```sh
git fetch origin feat/forge-2-redesign
git switch feat/forge-2-redesign
git pull --ff-only origin feat/forge-2-redesign
bash scripts/start-codespaces-phone.sh
```

If the branch is not local yet, use `git switch -c feat/forge-2-redesign FETCH_HEAD` in place of the switch command. Use Safari's Request Desktop Website and landscape mode if the terminal is cramped. In the Ports panel, make 8080 and 8081 Public; retain HTTP for the internal port protocol (the public URL uses HTTPS). In a second terminal run `python3 scripts/check-codespaces-phone.py`. Only proceed when its manifest/bundle checks pass. Open the printed 8080 launch-page HTTPS URL in Safari and tap **Open FORGE in Expo Go**. Use SDK 57-compatible Expo Go. Reload the existing project after switching branches; do not delete app data. Keep the Codespace running while testing, within your existing free allowance; this work creates no service or purchase. Stop it afterward.

See `docs/PHONE_ONLY_TESTING.md` for the existing full Safari workflow. Test: start → add exercise → enter load/reps → complete → start/skip rest → return to tabs → resume → finish → review history. Then search/favorite an exercise, open templates/programs, inspect Progress, save preferences, and export a backup. Test empty and populated data, light/dark, reduced motion and keyboard visibility.
