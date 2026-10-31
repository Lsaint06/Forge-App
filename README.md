# FORGE — Fitness Tracker

A dark-first, offline fitness log for iPhone and Android phones (iPad support is disabled until it is tested). Workouts, templates, measurements, nutrition and recovery live in SQLite. Guest mode requires no account, API key, online food database or AI service; a curated USDA food library ships inside the app and works offline. Dashboard statistics come from your own recorded workouts.

FORGE Paths is **curated-only**: open **Train → Forge Paths** for a recommended program and the library of 18 human-authored Strength and Muscle Building programs (Beginner, Intermediate and Advanced; 3, 4 and 5 days a week). Each comes with enrollment, scheduling around your rest day and progression built from your logged sets. The earlier workout generator was retired in Phase 6B. Lifters who already have a generated Path can keep training it and review its history. See [docs/CURATED_PROGRAMS.md](docs/CURATED_PROGRAMS.md) and [docs/PHASE_6.md](docs/PHASE_6.md).

**Cinematic intro:** each genuine cold start opens with a 2.6-second FORGE intro: embers, molten letters and cooling steel. It always plays through, respects Reduce Motion, and never replays when returning to an app that is still running. See [docs/SPLASH.md](docs/SPLASH.md) for the architecture, Expo Go testing and needed brand assets.

This is a substantial first implementation, **not completion of every requirement in the product brief**. Read [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for exact coverage and verification limits. The supplied brief is preserved in [docs/PRODUCT_SPEC.txt](docs/PRODUCT_SPEC.txt).

## Run locally

FORGE now targets iPhone and Android only. The dedicated browser preview has been retired. On Windows, run the Expo development server and open it in Expo Go on your phone.

Use Node.js **24** and npm. The integration tests use Node's built-in SQLite module. The application uses Expo **SDK 58**, React **19.3.0**, and React Native **0.88.0**; compatible native versions and the dependency lockfile are committed.

```sh
git clone https://github.com/Lsaint06/Forge-App.git
cd Forge-App
# Before this feature is merged:
git checkout feat/forge-paths-foundation
npm ci
npm start
```

Install the matching Expo Go version on your phone and follow [IPHONE_TESTING.md](IPHONE_TESTING.md). No Mac or Xcode is needed for the initial Expo Go workflow. The GitHub repository is source code, not a running application or a public development server.

```sh
npm run typecheck
npm run lint
npm run format:check
npm test                 # domain, real SQLite, sync protocol and PostgreSQL migration
npm run test:ui          # React Native Testing Library interaction tests
npm run export           # iOS and Android JavaScript/Hermes export, not signed binaries
```

GitHub Actions runs these checks and retains native export artifacts. CI does not build a signed IPA/APK or run an emulator. `maestro/workout.yaml` is an unexecuted device smoke flow; run it only on a disposable installed build because it clears that app's data.

## What you can do

- Set up a guest profile and edit training, units, theme, rest, progression and nutrition preferences.
- Search/filter/sort 366 exercise definitions; favorite movements, inspect history, and create/edit custom exercises.
- Start an empty workout or a template; add/substitute/reorder/remove exercises and sets; log loads, reps, duration, distance, RPE, RIR, tempo, notes, side and set type.
- Log sets in a responsive grid (set, previous result, weight, reps, and RIR for program workouts) inside collapsible exercise cards. The grid adapts to compact iPhones and large text instead of clipping. The first unfinished exercise opens initially; each card keeps a one-line target (sets, reps, RIR and rest) visible when collapsed. Tap a set number for Set Details (set type, side, RPE, RIR, rest, tempo, notes, remove). Infrequent workout and exercise actions live in their ••• menus; Finish and the rest timer stay in a dock at the bottom.
- Enter a working load once: it fills the empty working sets after it in that exercise (never a set that is done, has its own load, or that you typed into; never reps). Tap the previous result beside a set to fill that set with it. Neither marks a set done, and neither runs when editing a finished workout.
- Reorder exercises from a sheet (••• → Reorder exercises): pick an exercise, then move it to the top, up, down or to the bottom. Sets move with their exercise.
- One workout at a time: every start (Train, templates, program and Path sessions, Repeat in History) is unavailable while another workout is in progress and offers Resume instead.
- Pause/resume, recover an interrupted session, finish once, repeat a workout and save it as a template. Finished workouts open read-only; **Edit** unlocks them, and Cancel restores the workout exactly as it was (the copy is kept on the phone, so an edit interrupted by closing FORGE can still be cancelled).
- Use persistent rest deadlines, manual rest starts, skip/extend and optional local completion notifications.
- Create, edit, duplicate and delete custom workout templates: steppers for sets, reps and rest, loads in your own units, and reorder. Schedule a template from its ••• menu with a calendar. Forge Paths is the only guided-plan offering; the ready-made starter-program catalog has been retired. Previously adopted programs, saved templates, schedules and workout history remain available, including their existing calendar deload behavior.
- Inspect training consistency against your plan, per-exercise strength progression, personal records, volume, primary-muscle set distribution, training time and measurement trends (see [docs/PROGRESS_METRICS.md](docs/PROGRESS_METRICS.md)).
- Log nutrition one day at a time (Nutrition): ‹ Today › with a past-days calendar, the day's calories and protein/carbs/fat (against your targets once you've set them in You; suggested defaults are never shown as targets), and Breakfast, Lunch, Dinner and Snacks with their foods. **Add** opens recent and saved foods with search: **+** logs a food at its usual servings into that meal in one tap (Undo takes it back); tapping a food sets servings (± 0.25 or typed) and meal first; **Create food** logs one from its label and can save it to your foods. Entries can be edited (servings, meal, day, values), copied to today, saved as a food or deleted (confirmed). Older entries keep their original meal text and appear under it. Saved foods has search, edit and delete; logged entries keep their own values. Decimals can be typed with a comma or a point everywhere numbers are entered in workouts, templates and nutrition.
- Find ordinary foods without typing their label (built-in food library): **Add** also offers common foods and searches 3,730 curated USDA FoodData Central foods (FNDDS 2021-2023 and selected SR Legacy ingredients) offline, after your recent and saved foods. Choose grams (100 g is the default) or a household portion with its USDA weight ("1 egg (50 g)", "1 cup, cooked (158 g)"), see calories and macros update, and log it; **+** logs 100 g in one tap with Undo. Raw and cooked, dry and cooked, fat percentages, sweetened and unsweetened stay separate foods. A logged food is an ordinary entry holding its own values (with its USDA source), so library updates never change your history; **Save to my foods** keeps your own editable copy. Source: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central (public domain, CC0); see [docs/food-library/BUILD_REPORT.md](docs/food-library/BUILD_REPORT.md) and rebuild with `npm run food-library:build`.
- Track your body in Measurements (You → Body measurements, or Progress → More): your latest bodyweight leads with the change since your previous weigh-in and over a chosen range (1M, 3M, 6M, 1Y, All), on a chart spaced by real dates (long gaps are not joined, nothing is interpolated, and several weigh-ins on one day show as that day's latest). Every other measurement is one row; history lists every entry by day with edit and delete. **Log measurement** offers Bodyweight, Body fat, Waist, Hips, Chest, Shoulders, Neck, arms, forearms, thighs, calves or a custom name, typed in your units (kg/cm or lb/in, comma or point) on today or a past day, with **Save & add another** and Undo; an unusual value asks before saving but is never blocked. Spellings such as "Body weight" are shown together without renaming anything, and saving an entry you didn't change writes nothing. If you have no weigh-in yet, Forge offers once to log your profile weight as the first one; your profile weight is never changed by Measurements.
- Track recovery (Today → Recovery check-in, You → Recovery or Progress → More): a check-in records last night's sleep (a stepper in 15-minute steps) and four 1–5 answers with both ends named (sleep quality Poor–Great, soreness None–Severe, energy Drained–Energised, stress Calm–Very stressed), plus an optional "Ready to train" self-rating, rest day and note. Nothing is prefilled: Save names what's still unanswered. Today shows what you recorded, in words and numbers; there is no recovery score, and nothing here changes your training. Trends chart sleep and each answer one point per day (the latest check-in that day) on real dates, with gaps left empty and a plain summary (for example "Average 7 h 6 m · 5 h to 9 h · 7 days"). History is grouped by month with edit and delete (confirmed, with Undo); a second check-in on the same day is kept, and saving a check-in you didn't change writes nothing. Older entries, including half-values and unusual text, are shown exactly as recorded.
- Set goals you can measure (You → Goals, or Progress → More → Goals). Choose a type first, then fill in only what it needs, in your units:
  - **Bodyweight**, up or down, starting from your latest weigh-in;
  - **Lift**: the heaviest weight you actually lifted on a completed working set for an exercise you pick, optionally for at least N reps (never an estimated 1RM);
  - **Training volume** counted from a day you choose;
  - **Workouts per week** (Monday to Sunday);
  - **Session length**, at least or at most, averaged over the last 4 weeks;
  - **Daily calories**, at least or at most, by the food you log (days with nothing logged aren't counted).
  
  Progress bars appear only where there's a real starting point, and nothing is estimated. When your records meet a target, **Mark as achieved** keeps the real date of the weigh-in or workout that met it, even if your records change later. A target already met before the goal was set is said so plainly. Goals can have a target date, be archived and restored, or be deleted with Undo. Older goals keep their original meaning ("Lifetime volume", "Today's calories"), and you can switch one to the new measurement from Edit. Saving a goal you didn't change writes nothing.
- Export/import validated JSON backups and delete local records with confirmation. You → Export backup offers **Save to a folder** (Android: Forge writes the file into a folder you pick, reads it back and records a confirmed backup) and **Share a copy** (email, Drive or another app; the share sheet cannot report whether the file was saved, so this is shown as "Shared · not confirmed saved" and never counts as a backup). Importing a backup file also counts as confirmed up to its export time. The row shows the last confirmed backup and how many workouts have been logged since. After a workout Forge offers a backup when one is due (never backed up, three or more new workouts, or a week with new workouts); "Not now", or an unconfirmed share, quiets the prompt for three days. iPhone keeps the share option until the iOS folder picker is verified on a device.
- Finish a workout from a review sheet: sets that hold numbers but were never ticked are listed per exercise, so nothing is left out of progress silently. They stay out unless you switch them on, because a set that was only planned must not be recorded as done. Saving shows a summary of what was recorded (sets, exercises, duration, volume, and new records from the Progress engine, never on a first session), with the backup reminder inside it when one is due.
- If FORGE cannot open its data, a recovery screen offers Try again and Save a copy of my data (a JSON backup, or a raw copy of the database file when the records cannot be read). Nothing is deleted. Set `EXPO_PUBLIC_SUPPORT_EMAIL` (see `.env.example`) to show a support contact there; without a dedicated address none is shown.
- Configure real Supabase email authentication and explicitly requested synchronization. No configured backend means guest mode, not simulated login.

Superset/circuit labels are stored but do not automatically rotate exercise order. Progress photos, barcode scanning, automatic/background cloud sync, advanced progression rules and several achievement/reminder types are not implemented.

## Architecture and data

| Module | Responsibility |
| --- | --- |
| `app/` | Expo Router routes and four-tab navigation |
| `src/components/` | Accessible theme-aware primitives, form and workout controls, SVG chart |
| `src/screens/` | Dashboard, live workout and journal flows |
| `src/domain/` | Typed records, Zod validation, units, overload, analytics and scoring |
| `src/data/schema.ts` | Indexed SQLite schema and migration version |
| `src/data/repository.ts` | Transactional persistence, backups, durable outbox and conflicts |
| `src/data/native.ts` | Expo SQLite adapter, WAL and foreign keys |
| `src/cloud/` | SecureStore session adapter, recovery callbacks and optimistic sync |
| `supabase/migrations/` | Auth-owned PostgreSQL transport, RLS, CAS RPC and deletion RPC |
| `tests/` | Domain, disk/database behavior, protocol, SQL security and UI tests |

Workout, exercise and set tables and template prescriptions are normalized locally with foreign keys. Profiles and lifecycle journals use schema-validated structured payloads. The cloud uses **atomic workout aggregate JSON records**, rather than pretending the full requested normalized PostgreSQL schema exists. Aggregate revisions prevent partially downloaded workouts. An expansion into normalized cloud reporting tables remains future work.

Zustand holds a revision signal and theme/profile snapshot; SQLite owns records. No network cache library is needed for the current explicit sync operation. Forms use React Hook Form and Zod. Charts are interactive, accessible SVG renderers using maintained `react-native-svg`; a large charting package was avoided for this initial scope. Optional native capabilities degrade to actionable errors.

Canonical storage: load/body mass **kg**, body lengths **cm**, distance **meters**, duration **seconds**, calories **kcal**. Imperial measurement entries convert before saving. Volume counts external load × reps for completed working/drop/failure sets; warmups are excluded. Bodyweight work has zero external-load volume unless added weight is logged. Left/right sets each represent separately recorded effort; no implicit doubling occurs. Sets logged with neither reps nor duration nor distance cannot be marked complete.

Epley estimated 1RM = `load × (1 + reps / 30)` for 2–12 reps, actual load for one rep. It is calculated only for exercises whose logged weight is external load; bodyweight and assisted movements track reps instead, because logged assistance cannot be told apart from added weight. Overload suggests an increment after two sessions reaching the upper target with RPE ≤8 / RIR ≥2 when supplied; two sessions below minimum suggest a 10% reduction. Users can override every load. Recovery weights five self-reported factors equally; it is not medical assessment. Secondary muscles are not double-counted in set totals.

Workout durations use saved timestamps and accumulated pause milliseconds. Charts and adherence use current device-local calendar dates; changing timezone can regroup historical workouts. Schedules retain explicit local dates. Repeated dates do not count a session more than once for adherence. Achievements and best records are recomputed from retained history; they can disappear when source records are deleted.

## Supabase configuration

Forge requires an account (Phase 7.7B): without this configuration the app shows "Accounts aren't available" and opens no training. Copy `.env.example` to `.env` and supply your project's **public** URL and publishable/anon client key:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-public-client-key
```

These values are compiled into the mobile bundle. **Never use a service-role key.** Do not commit `.env`. Restart Metro after configuring it.

1. Create your Supabase project and enable email/password authentication.
2. Apply `supabase/migrations/202610140001_forge.sql` in the project's SQL editor, or link your project with the Supabase CLI and run `supabase db push`.
3. In Auth URL Configuration allow `forge://account` and `forge://sign-in` (email confirmation) for signed builds, and `exp://**` for Expo Go, and the exact development URL returned by Expo Linking for Expo Go (normally `exp://<development-host>:8081/--/account`; tunnel URLs differ). Configure Site URL and SMTP/email confirmation as appropriate. The app supplies its actual account redirect to password-reset requests.
4. For a custom EAS build make the same public variables available at build time. Mobile network access must reach that project's HTTPS hostname.
5. Create an account or sign in on the Welcome screen. Training already on a phone with no owner can be linked only to an account with no cloud records (checked first; see `docs/audits/PHASE_7_7A_ONBOARDING_AUDIT.md`). Synchronize from You → Account & privacy and review first-sync conflicts explicitly.

### Sign-in providers (Phase 7.7B.1)

Welcome offers **Continue with Apple**, **Continue with Google** and **Continue with Email**. A provider's button appears only when Supabase Auth reports that provider enabled (its public `/auth/v1/settings`), so nothing is offered that would fail.

- **Google** uses Supabase's OAuth flow in the system's secure sign-in sheet (`expo-web-browser`), so it works in Expo Go. In Google Auth Platform, create a **Web application** OAuth client whose authorized redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`, and add `openid` under Data Access. Paste the client ID and secret into Supabase → Authentication → Providers → Google. **The client secret belongs only in Supabase**, never in `.env` or the app. Google returns to `Linking.createURL("/welcome")`, which is `exp://…/--/welcome` in Expo Go and `forge://welcome` in a build, so allow `exp://**` and `forge://**`.
- **Apple** uses the native sheet (`expo-apple-authentication`, with a one-time nonce) and Supabase's `signInWithIdToken`. It is shown only on iOS, in Forge's own signed build: in Expo Go, Apple would sign in as Expo's app and create an identity Forge's real app could never use. Do **not** add `host.exp.Exponent` to the Apple provider's Client IDs. For a development build, enable Sign in with Apple on the App ID `com.lsaint06.forge`, add that ID to Supabase's Apple Client IDs, then enable the provider (native-only needs no secret key). The `expo-apple-authentication` config plugin adds the entitlement.
- **Testing in Expo Go:** Supabase never sends a sign-in back to an IP address (other than loopback). It quietly uses the Site URL instead (`IsRedirectURLValid` in supabase/auth), whatever the allow list says. Forge's return address comes from where Expo Go downloaded the JavaScript bundle, not from Metro's banner. Opened from the computer's local network address, it is `exp://<IP>:8081/--/…`, so Welcome hides Google and email links end on the Site URL. To test them, run `npm start -- --tunnel` (SDK 58 uses `@expo/ws-tunnel` on `*.on.expo.app`; sign in with `npx expo login` first). Open Forge by scanning the tunnel's QR code: Expo Go's Home "Development servers" list and its Recents open the local network address. Through the tunnel the address is `exps://<name>.on.expo.app/--/…`. The development log prints the return address. Allow `exp://**`, `exps://**` and `forge://**`; Forge's own build returns to `forge:///…`.
- **Branding:** Apple's own button; Google's button follows Google's guidelines, using the "G" cropped unaltered from Google's pre-approved assets (`assets/providers`) and a Latin subset of Google Sans Medium (`assets/fonts/ProviderSans-OFL.txt`).
### Restoring and signing out (Phase 7.7C)

- **Restore your training:** signing in on a phone with nothing of its own checks, read-only, for Forge cloud records. If any exist, setup offers **Restore my training**: one run of the existing manual synchronization, which on an empty phone only downloads. Nothing synchronizes unless the athlete chooses it.
- **Signing out offline:** Forge removes the stored session from this phone and says the sign-in wasn't ended on Supabase's side (it expires on its own). Training and its owner stay as they are.
Session tokens are stored in chunked Expo SecureStore entries, not in SQLite or backups. Recovery links verify a recovery session and expose a new-password action. Email delivery, callback redirects, signed native storage and live authentication still require device/project verification.

### Sync and conflict rules

Every local mutation coalesces an outbox record. The server serializes writes and compares the client's base revision; mismatches return the current record instead of overwriting it. Client retries use exponential backoff capped at one hour, triggered by another explicit sync. Matching revisions upload idempotently; remote records hydrate SQLite inside transactions. In-flight sync is invalidated by clearing or replacing local data. Remote child IDs cannot modify another workout. Switching authenticated users is blocked until local records are exported and cleared.

Conflict records preserve local and cloud snapshots. Choose Keep local or Use cloud with confirmation; export first. Concurrent edits made during network requests are retained in the outbox. Local deletion queues a tombstone. Deleting all local data does **not** delete cloud data: a later sync can restore it. Cloud account deletion is a separate authenticated action and cascades cloud records. Favorites and timer/settings keys are local-only. No automatic sync, server-side incremental cursor, or remote notifications are implemented.

Local databases and JSON exports are not encrypted by FORGE. Use the device lock and keep shared backups private. Do not use this first release for irreplaceable data without regular backups.

**Where your data lives.** Without a configured cloud backend, training history exists only in the app's SQLite database on the phone. Uninstalling the app, clearing its storage, or losing the phone deletes it; export a backup to Files, iCloud Drive, Google Drive or email regularly. While testing in **Expo Go**, that database belongs to Expo Go itself (on Android, `/data/data/host.exp.exponent/files/SQLite/forge.db`): deleting or clearing Expo Go deletes your log, and a later standalone FORGE build will not see it. Export a backup first and import it into the new app.

## Validation and delivery

See [docs/VALIDATION.md](docs/VALIDATION.md) for command results and limitations. Native bundle exports demonstrate build compatibility, not physical-device behavior. No cloud project, Apple credentials or device was provided, so live Supabase, background notifications and physical iPhone tests are outstanding.

The build was reviewed independently for data-integrity defects; regression tests cover the confirmed findings. Additional review before a production release should address the scope gaps in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

### FORGE 2 redesign preview

The dedicated `feat/forge-2-redesign` branch adds the shared athletic theme, today-first Home, visual exercise browsing, streamlined workout logging, and grouped You destination while retaining schema v1 and guest tracking. See [design/status and Safari preview steps](docs/redesign/STATUS.md). Original implementation and `main` remain separate. Real exercise demonstration media and physical-device acceptance remain outstanding.
