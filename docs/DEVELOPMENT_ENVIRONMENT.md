# Development and production environments (Phase 8)

Forge is moving from one Supabase project to two: a **development** project for disposable accounts, experiments and destructive tests, and the existing **production** project for real accounts and training. This guide is the setup and verification procedure. Nothing here has been applied to any Supabase project yet: the steps marked **Founder** need your dashboard access.

## The two environments

| | Development | Production |
|---|---|---|
| Supabase project | A new project (`forge-dev`), created by you | The existing project, unchanged |
| Accounts and data | Disposable test accounts and workouts only | Real Forge accounts and training history |
| Allowed | Account deletion tests, recovery tests, experimental migrations, PKCE and email-code trials, device testing | Nothing experimental or destructive |
| Apps that may use it | FORGE Dev (the development build), FORGE Preview | FORGE (the production app), FORGE Preview |
| Settings file on the Mac | `.env.forge-dev` (from `.env.forge-dev.example`) | `.env`, as today |
| EAS environment | `development` (and `preview`) | `production` |

**Today nothing changes.** Expo Go (`npm start`) still reads `.env` and still connects to the production project exactly as before; the separation only applies to Forge's own builds.

## How Forge keeps them apart

### Three apps, one codebase (`app.config.ts`)
| App | `APP_VARIANT` | iOS bundle ID / Android package | Link scheme | May use |
|---|---|---|---|---|
| FORGE | unset or `production` | `com.lsaint06.forge` | `forge` | only `production` |
| FORGE Dev | `development` | `com.lsaint06.forge.dev` | `forge-dev` | only `development` |
| FORGE Dev, free Apple ID (iOS) | `development` and `FORGE_PERSONAL_TEAM=1` | `com.lsaint06.forge.dev.personal` | `forge-dev` | only `development` |
| FORGE Preview | `preview` | `com.lsaint06.forge.preview` | `forge-preview` | either, named explicitly |

- **Side by side.** Each app installs beside the others, and sign-in and email links (`<scheme>:///welcome`, `/sign-in`, `/account`) can only ever open the app that asked for them.
- **Same look.** Name, IDs and scheme are all that differ: icon, splash, plugins and permissions are identical (tested in `tests/app-variants.test.ts`).
- **Free Apple ID build.** `npm run dev:ios` (Phase 8.1) builds FORGE Dev for a free Apple ID's Personal Team under its own bundle ID, without Sign in with Apple, which Apple doesn't offer free Apple IDs (`docs/NATIVE_BUILDS.md`). The runtime treats it exactly as FORGE Dev.
- **Unset means production.** With `APP_VARIANT` unset, the config is `app.json` exactly, which is what Expo Go uses today.

### The runtime rule (`src/cloud/environment.ts`)
When a client is created, Forge checks which app is running and what it was given:
- **Expo Go** (and tests and scripts): unchanged. With neither `EXPO_PUBLIC_FORGE_ENV` nor `EXPO_PUBLIC_SUPABASE_PROJECT_REF` set, today's behavior.
- **Forge's own builds**, recognized by their native application ID:
  - the app ID must be one of those above;
  - the JavaScript must carry that app's own link scheme;
  - the build must name its environment, and only its own (FORGE Dev: `development`; FORGE: `production`);
  - the environment must pin its project's ref, and the Supabase address must be exactly `https://<ref>.supabase.co`.
- **Anything missing or mismatched** refuses to connect. The app shows "Accounts aren't available", signs nobody in and keeps the training on the phone, and Metro's log says why (`[FORGE] Accounts aren't available: …`). The reason names variables, never values.

So a development build can't silently reach production: with today's `.env` (nothing named) it refuses, and with production named it refuses.

### Metro for FORGE Dev (`npm run start:dev`)
- **Reads only `.env.forge-dev`.**
  - Expo's own settings files are switched off (`EXPO_NO_DOTENV`).
  - `metro.config.js` keeps the root `.env*` files out of Metro then, because Expo's development env module would otherwise bundle `.env.local`, `.env.development` and `.env.development.local` over the launcher's values.
  - `APP_VARIANT=development` gives the JavaScript FORGE Dev's own scheme.
  - Tests with real Metro bundles: FORGE Dev's bundle carried the development values and none of the production URL or key, and none of a `.env.local`'s values.
- **Refuses to start** unless `.env.forge-dev`:
  - is complete;
  - names `development`;
  - pins its own project's ref;
  - uses HTTPS and a publishable (never a secret) key;
  - is not the project any of Expo's own settings files (`.env`, `.env.local`, `.env.development`, `.env.production` and their `.local` forms) points at.
- **Also refuses while `.env.local`, `.env.development` or `.env.development.local` exists.** Move it out of the project while using FORGE Dev.
- **`.env.forge-dev` is git-ignored.** Only the example file is tracked.

### What the checks can't catch
- **A deliberate mislabel:** putting the production project's values into `.env.forge-dev` while `.env` points elsewhere.
- **EAS settings:** the variables you set in EAS environments.

The rule is simple: the development project's values live only in `.env.forge-dev` and in the EAS `development` environment.

## Creating the development project (Founder)
1. **New project.** Supabase dashboard → **New project**:
   - **Name:** `forge-dev`.
   - **Organization and region:** the same as production.
   - **Database password:** generate a strong one and keep it in your password manager, never in the repository.
2. **Plan.** The Free plan is fine:
   - You get two free projects in total.
   - A free project pauses after about 7 days of low activity. Restore it from the dashboard; paused projects can be restored for a year.
   - Check whether the production project is also on the Free plan: a paused production project would stop sign-in and sync.
3. **Settings file.** When the project is ready, copy `.env.forge-dev.example` to `.env.forge-dev` and fill it in from **Project Settings → API keys** and **Data API**:
   - `EXPO_PUBLIC_SUPABASE_URL`: the project URL;
   - `EXPO_PUBLIC_SUPABASE_PROJECT_REF`: the ref (the URL's first part);
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the **publishable** key (or the legacy anon key). Never the secret or service-role key; the tools refuse one.
   - `EXPO_PUBLIC_FORGE_ENV=development`.

## Database: apply the schema, in this order (Founder)
**SQL editor (recommended, as production was set up).** In the development project's **SQL editor**:
1. New query: paste `supabase/migrations/202610140001_forge.sql`, then **Run**.
2. New query: paste `supabase/migrations/202611020001_forge_security_hardening.sql`, then **Run**. Development only; production needs E7 approval.
3. New query: paste `supabase/verify/schema_checks.sql`, then **Run**. Every result should match its **HARDENED** note. These read-only checks are tested against both schemas.

**Supabase CLI (optional).**
1. Install it with `brew install supabase/tap/supabase`, then run `supabase login`.
2. `supabase init` creates `supabase/config.toml`; review it before committing it.
3. `supabase link --project-ref <development ref>` asks for the development database password.
4. `supabase db push` applies both files in `supabase/migrations` in order. Their 12-digit versions are accepted; keep any new migration to the same 12-digit form.
5. **Never link the production project from this repository** until production deployment is approved (E7).

## Authentication settings, development project (Founder)
- **Email** (Authentication → Sign In / Providers → Email):
  - **Enabled**, with **Confirm email off**: disposable accounts can sign in at once, and `dev:verify-stage3` needs this.
  - To test the confirmation-link flow later, turn it on with custom SMTP. Supabase's built-in sender only reaches your team's addresses, at 2 emails an hour.
- **URL Configuration** (Authentication → URL Configuration):
  - **Site URL:** any page you control. Supabase sends refused redirects there; Forge never uses it.
  - **Redirect URLs, exactly:**
    - `forge-dev:///welcome`
    - `forge-dev:///sign-in`
    - `forge-dev:///account`
  - **Optional, Expo Go:** to try the development project in Expo Go, add the tunnel entry from the README (`exps://c-lstamand-97rrx8-????????????????.on.expo.app/--/**`).
  - **Never add** `forge:///…` (the production app's scheme), `exp://**`, `exps://**` or `forge-dev://**`.
- **Sessions** (Authentication → Sessions): set the access-token (JWT) expiry to **300 seconds** in development only. Then a sign-in ended on another device ends here within about 6 minutes instead of an hour, which shortens the workout-continuity test. Supabase advises against less than 5 minutes. Production keeps its value.
- **Hooks** (Authentication → Hooks): none. Stage 3 assumes no custom access token hook.
- **CAPTCHA** (Attack Protection): off in development; the verification script signs accounts up.
- **Google**, for the Google tests:
  1. In Google Cloud → APIs & Services → Credentials, create an **OAuth client ID** of type **Web application** named "Forge Dev". Its authorized redirect URI is `https://<development ref>.supabase.co/auth/v1/callback`.
  2. If the consent screen is in **Testing**, add your throwaway Google accounts as test users.
  3. Paste the client ID and secret into the development project → Authentication → Providers → Google. The secret lives only in Supabase.
  4. Production's Google client isn't touched.
- **Apple:** later, with the paid Apple Developer Program (see `docs/NATIVE_BUILDS.md`). The development project's Apple provider will need `com.lsaint06.forge.dev` among its Client IDs. Leave Apple off until then: the free Apple ID build has no Sign in with Apple, so its button would appear and fail.

## Connect and check (Founder, then Forge)
1. `npm run dev:check` runs read-only checks of the development project from `.env.forge-dev`. It creates and changes nothing, refuses any project Expo's own settings files point at, and prints no key or address. Expected:
   - **✓** Auth answers, settings are readable, email sign-in is enabled and sign-ups are allowed.
   - **✓** Google is enabled, once you have set it up.
   - **✓** "Forge schema with the Stage 3 hardening (anon can't read)".
   - **✓** Each `forge-dev:///…` address is allowed.
   - **✓** The production app's `forge:///welcome`, an arbitrary Expo tunnel and the `@` trick are refused.
2. `npm run start:dev`, then open FORGE Dev (see `docs/NATIVE_BUILDS.md`). Sign in with a disposable account.

## Disposable accounts
- **Email and password:**
  - Create them in Authentication → Users → **Add user** → **Create new user**, with your own mailbox's plus-address (`you+forgedev1@…`), a password, and **Auto Confirm User** ticked.
  - Or sign up in FORGE Dev while email confirmation is off.
- **Google:** a spare Google account, added as a test user on the "Forge Dev" consent screen if that screen is in Testing.
- **Keep them disposable.** Never use your real Forge account or your real training with the development project, and never copy production data into it.
- **Delete them** in the app (Account & privacy → Delete Forge account) or in Authentication → Users → **Delete user**.

## Stage 3 on the development project: verification procedure
**1. Schema.** Apply both migrations, then run `supabase/verify/schema_checks.sql`. Expected: the HARDENED notes (function settings, execute rights, exact privileges, the policy, `auth.sessions` readable by the function owner).

**2. Automated.** Run `npm run dev:verify-stage3 -- --confirm <development ref> --email you@yourdomain`.
- **Safeguards:**
  - it refuses unless `.env.forge-dev` passes the checks above;
  - `--confirm` must repeat the development ref, so it can't run against production by accident;
  - email confirmation must be off and the hardening applied.
- **Accounts:** it signs up two throwaway plus-addressed accounts, never signs in to an existing one, and deletes only those two, through `forge_delete_account`, which can only delete the caller's own account. Any it couldn't delete are listed for removal in Authentication → Users.
- **What it checks:**
  - each account reads only its own record under the same record ID;
  - anon can't read the table or call `forge_write`, and signed-in accounts can't insert or update directly;
  - a fresh sign-in deletes, and the deleted account's still-valid token reads and writes nothing;
  - deleting again is harmless, and the other account's records are untouched;
  - a signed-out session's token is asked to sign in again (`reauthentication_needed`);
  - both deleted accounts can no longer sign in.
- **`--stale`** also waits 11 minutes, then checks that a refreshed but old sign-in is refused.

**3. By hand, in FORGE Dev**, with disposable accounts:
1. **Password.** Sign in, log a workout, then **Synchronize now**. Within 10 minutes, Account & privacy → **Delete Forge account**. Expected: deleted, with this phone's training removed after the export choice.
2. **Stale.** Sign in, wait more than 10 minutes, then delete. Expected: "Confirm it's you"; after confirming, deleted.
3. **Google.** Sign in with a throwaway Google account, then delete, confirming with Google. Also choose a *different* Google account at the confirmation: it's refused, and nothing changes (D4).
4. **Revoked.** Sign the account out of all devices on another device, then delete with the old sign-in. Expected: asked to sign in again.
5. **Sync and ownership.**
   - With two devices on the same account: sync on one, download on the other.
   - Another account on the same device: "This phone's training belongs to another account".

**4. Rollback rehearsal (development only).**
1. Paste `supabase/rollback/202611020001_forge_security_hardening.sql` into the SQL editor and **Run**.
2. Run `schema_checks.sql`. The functions and policy now match the BASELINE notes. The privileges stay hardened unless you run the restore statements at the end of the rollback file.
3. Apply the hardening migration again; `schema_checks.sql` shows HARDENED once more.
4. Run `npm run dev:check`.

**5. Record and approve.** Record the results in `docs/audits/PHASE_7_8E_ACCOUNT_LIFECYCLE.md`. Deploying to production remains a separate, approved step (E7; checklist in section 11 of that report).

## Authentication integration readiness
| Item | State | Before switching it on |
|---|---|---|
| Google in development builds | **Ready to try** once the development project has its Google client | Same Supabase-hosted flow; returns to `forge-dev:///welcome`. Works over the local network: the scheme has no IP address, so no tunnel is needed |
| PKCE links | **Prepared, off** (`src/auth/pkce.ts`) | Hermes (React Native's engine) has no Web Crypto, so supabase-js would quietly use a "plain" challenge; `pkceAuthOptions()` refuses. First: provide `crypto.getRandomValues` and `crypto.subtle.digest("SHA-256")` (expo-crypto, or `expo-standard-web-crypto` for randomness plus a digest shim). Check `pkceSupported()` on the phone, then switch on in development only (7.8E report, section 13) |
| Email one-time code | **Prepared, not offered** (`src/auth/reauth.ts`) | In development: show `{{ .Token }}` in the email template, set the OTP expiry, add custom SMTP; then approve the screen option |
| Custom SMTP | **Not configured** | A sending domain with SPF, DKIM and DMARC, and a provider. Configure it in Authentication → SMTP Settings; its password lives only in Supabase. Raise the rate limits. Test in development first. Required before real athletes |
| Deletion confirmation | **Password and Google** in the app (5-minute window) | Server freshness (Stage 3) verified in development, then approved for production |
| Apple sign-in and token revocation | **Blocked** on the Apple Developer Program | Sign in with Apple on both App IDs; Supabase's Apple provider; the revocation Edge Function (7.8E report, section 13); the private email relay; a deletion path for Apple-only accounts |

## Rules for production
- **SQL:** no SQL, migration or rollback runs against production without explicit approval (E7).
- **Tests:** no deletion, recovery or experimental test runs against production or real accounts.
- **Settings:** production values never go into `.env.forge-dev` or the EAS `development` environment.
- **CLI:** the Supabase CLI in this repository stays linked to the development project, or to none.
