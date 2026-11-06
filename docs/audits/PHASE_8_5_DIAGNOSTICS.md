# Phase 8.5 M6: Crash diagnostics and beta observability

Branch `feat/phase8-5-forge-hardening`. Local diagnostics shipped in `ac619de`. The crash-reporting research used primary sources (Sentry, Expo and Firebase documentation, the Sentry repository, the npm registry), read on Nov 6, 2026.

**Nothing was installed or connected:** no SDK, account, DSN or token.

## 1. Recommendation: Sentry, minimal collection, Preview and production only

**Use `@sentry/react-native` 8.34.0 or later, never older than 8.33.0.**

- The Sentry Expo sample at 8.34.0 runs Expo 58 with React Native 0.88. Its core package tests against React Native 0.88.1.
- Expo SDK 58 pins `~8.28.0`, so `npx expo install` would choose 8.28. That version lacks three fixes from 8.33.0:
  - Android fatal JavaScript errors were lost in release builds (sentry-react-native#6918);
  - Expo Router 58 was broken;
  - iOS native start could fail silently.
- Install 8.34.0 explicitly, and exclude it from `expo install` (`expo.install.exclude`), as Sentry's own sample does.

Why Sentry over the alternatives:

| Option | For | Against |
| --- | --- | --- |
| **Sentry** | Native crashes and JavaScript errors. Source maps, dSYMs and (experimental) R8 mappings uploaded by its Expo plugin on EAS builds. Offline cache. Per-environment releases. Free Developer plan for the beta | One more native SDK; an auth token as an EAS secret; changes to the store privacy forms |
| Expo Observe | Lowest effort | Error reporting in preview; native stacks not symbolicated; the Errors dashboard isn't on the free plan |
| Crashlytics | Free | A Firebase project per app identity, Google service files, and dynamic frameworks for the whole iOS app; JavaScript source maps not documented |
| Bugsnag, Embrace | Workable | Native coverage under managed Expo unclear (Bugsnag); 3-day retention on Embrace's free plan |
| No SDK (store consoles) | No new data flow | TestFlight crash reports and Play vitals only: no JavaScript errors, little context |

**Timing:** store consoles are enough for internal testers (decision D-P2). Add Sentry before external testers.

### Configuration FORGE should use

The quickstart's defaults are wrong for FORGE: it turns on personal data, tracing, profiling, replay and logs.

- **Personal data:**
  - `sendDefaultPii: false`;
  - no `setUser` (it would make the data "linked" to a person for Apple);
  - the project's "prevent storing IP addresses" setting on, with geo scrubbed (server-side scrubbing).
- **Off:**
  - tracing, profiling, session replay, logs, screenshots and the view hierarchy;
  - console, XHR and fetch breadcrumbs (`breadcrumbsIntegration({ console: false, xhr: false, fetch: false })`). Console breadcrumbs would attach FORGE's developer warnings, and HTTP breadcrumbs always include URLs. Also set a low `maxBreadcrumbs`.
- **Environment and release:**
  - initialise Sentry only in `preview` and `production` builds, never `__DEV__`;
  - set `environment` explicitly from the app variant. Without it, Preview and FORGE Dev release builds report as "production";
  - keep the default release (`bundleId@version+build`): the three bundle IDs already separate the apps, and EAS's build number comes from the binary;
  - set `SENTRY_DISABLE_AUTO_UPLOAD=true` in development profiles.
- **Upload token:**
  - an organization token as the `SENTRY_AUTH_TOKEN` EAS secret, for the profiles that make release builds;
  - without it, iOS release builds fail by default (intended).
- **Tie-in with 8.5's codes:**
  - in `ErrorBoundary`, `captureException` with the failure code (`S-DB-…`) as a tag, so a tester's recovery screen matches its event;
  - Expo Router's per-route error boundaries need `autoWrapExpoRouterErrorBoundary`.
- **Known gaps to accept:**
  - `beforeSend` doesn't filter native crash events, so server-side scrubbing matters;
  - Jest needs the SDK mocked (sentry-react-native#6953);
  - the AGP 9.2 compatibility of R8 mapping upload is unverified until the first build.

### Privacy and the stores

FORGE today states "no analytics, advertising, crash or location SDK" (8.4 M5). Adding Sentry changes:

- **Apple App Privacy:** Diagnostics → Crash Data, Performance Data, Other Diagnostic Data; not linked, no tracking, App Functionality. Add a Sentry entry to `ios.privacyManifests`.
- **Google Play Data safety:** Crash logs, Diagnostics. Conservatively, Device or other IDs for Sentry's random per-install ID.
- **The privacy policy:** Sentry as a processor, with its region and retention (30 days on Developer, up to 90 on Team). Accept Sentry's DPA.

These mappings follow Apple's and Google's definitions; Sentry publishes no official table.

### Cost

- **Developer, free:** 1 user, 5,000 errors a month, 30 days of history. Enough for a private beta.
- **Team, $26 a month billed annually:** unlimited users, 50,000 errors, up to 90 days. For launch.
- Over-quota events are dropped.

Data residency (US or EU) is chosen when the organization is created and **can't be changed**.

### Approvals needed

1. A Sentry organization (and its region) and project; the plan.
2. The organization token as an EAS secret; the public DSN as an `EXPO_PUBLIC_` variable for `preview` and `production` only.
3. Installing `@sentry/react-native` (≥ 8.33.0), its config plugin and Metro helper (`getSentryExpoConfig`, keeping FORGE's `blockList`). This is a native change: rebuild FORGE Dev, update the plugin assertions in `app-variants` and `release-check` tests, and re-run the 16 KB scan.
4. The privacy policy, the store forms and the DPA.

## 2. Local diagnostics (shipped, `ac619de`)

| What | Where | Privacy |
| --- | --- | --- |
| **Build line**: app (FORGE, FORGE Dev, FORGE Preview, or Expo Go), version and build, platform and OS (e.g. "FORGE Preview 1.0.0 (14) · iOS 27.0") | Recovery screen and its support email | Only what the system reports about the app and OS: no device name, serial or identifier |
| **Failure code** (e.g. `S-DB-4F2A91`): S if FORGE couldn't start (its data didn't open), R once running; DB, DATA or APP; a fingerprint of the error's wording with quoted text, IDs and numbers removed | Same | Reports of one failure share a code without revealing its text |
| **Logging review** | All `console` calls in the app | Already safe: verbose output is development-only; sync and sign-in logs carry error codes, never payloads, tokens or training data |

Tests:
- `tests/diagnostics.test.ts`: the build line for each app, Expo Go and an unknown build; the codes' kinds; matching codes for the same failure; nothing particular in the shape.
- `tests/ui/data-safety.test.tsx`: the line and code on the screen and in the email; a start failure before FORGE started, a screen's after.

**Handed over:** About in Account & privacy shows "FORGE 1.0.0" in every build. It should show the build line, but that file is Engineer #2's in Phase 9 (PHASE_8_5_PHASE9_INTEGRATION.md §4). Until then, testers find the build in TestFlight, or in Play's internal testing details.

## 3. Beta incident procedure

1. **Which build.**
   - The tester's recovery screen gives the build line and code.
   - Without one: TestFlight's build, or Play's version code. Later, Sentry's release.
2. **Which platform.** In the build line ("iOS …" or "Android … (API …)"); FORGE Preview on both.
3. **Reproduce.**
   - Ask what they were doing; try it on FORGE Dev (iPhone) and the Android build.
   - Look for the same failure code in other reports.
   - Keep the tester's data on the phone: deleting the app deletes it.
4. **Severity:**
   - **P0:** data lost or wrong, or FORGE won't open;
   - **P1:** a core flow blocked (logging, finishing, sync, sign-in);
   - **P2:** a workaround exists;
   - **P3:** polish.
5. **Data integrity first.**
   - Ask for a backup before anything else: Recovery → Save a copy, or You → Account & privacy → Export backup.
   - Check it with `npm run backup:check -- <file>`, which reads only the file.
   - Never import a tester's backup into a real profile: use a disposable database.
6. **Prepare the fix** on a `fix/**` branch, with a test that fails without it. For data problems, a stress or fault case in `integrity-stress` or `sync-convergence`.
7. **Validate:**
   - all suites and CI;
   - `release:check` for `preview`;
   - the FORGE Dev device check of the affected flow;
   - for data problems, the tester's backup restored into a disposable database.
8. **Release** through the approved beta process: a new `preview` build (EAS numbers it), to internal testers first, then the testers who reported it. Record the build line it was fixed in.
