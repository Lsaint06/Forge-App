# Phase 7.7A: First-time athlete experience — audit and architecture

Planning only. No code was changed. Baseline: `feat/forge-paths-foundation` at `4951e23` (Phase 7.6), clean and in sync with `origin`. Every statement below was checked against the code at that commit; assumptions are marked.

## A. Existing onboarding inventory

| Piece                             | Where                                                                                                                                                                                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native splash and cinematic intro | `app/_layout.tsx`, `components/splash/ForgeSplash.tsx`, `splash/session.ts`                                                                                                                  | Every cold start: the intro plays over the app while the database opens; skippable; reduced motion shortens it; no "seen" flag (a new process plays it again). Not part of onboarding                                                                                                                                                                                                                                           |
| First-launch guard                | `src/screens/Home.tsx:152`                                                                                                                                                                   | Home's effect: `if (!p.onboarded) router.replace("/onboarding")`. The initial route is Home, so a new install renders Home once, then replaces it                                                                                                                                                                                                                                                                               |
| Onboarding route                  | `app/onboarding.tsx`                                                                                                                                                                         | The Design System 2.0 `Screen`: eyebrow "WELCOME TO FORGE", title "Made by your effort.", "A private training log… Start as a guest, without an account.", then `ProfileForm onboarding`                                                                                                                                                                                                                                        |
| Steps                             | `ProfileForm` `sections`                                                                                                                                                                     | **1 Your foundation:** display name, units (kg/lb chips), height (required), starting weight (required), body fat % (optional). **2 Your training journey:** experience (3), goal (2), rest day (7). **3 Your training:** target muscle groups, default rest, progression increment, min and max reps (weekly workout goal is `settingsOnly`, so **not asked**). **4 Make it yours:** appearance, calories, protein, carbs, fat |
| Controls                          | `ProfileForm`                                                                                                                                                                                | "STEP n / 4 · SAVED ON THIS DEVICE" and a progress bar; **Next**; **Enter FORGE** on the last step; **Skip remaining optional setup** on every step; **Enable local notifications** (asks permission) on every step; a guest-data note. **No Back between steps**                                                                                                                                                               |
| Validation                        | `requiredProfileSchema`                                                                                                                                                                      | Next on step 1 validates name, height and weight; Skip and Enter validate the whole profile (height and weight required; failures return to step 1 with an alert)                                                                                                                                                                                                                                                               |
| Persistence                       | `ProfileForm` `commit`, Next, choices                                                                                                                                                        | Incremental: each valid field is saved as it changes; experience, goal and rest day save on tap; step 1 saves name, height, weight on Next; `onboardingStep` setting saved on Next. Completion saves the form with `onboarded: true` (notifications preserved)                                                                                                                                                                  |
| Resume                            | `ProfileForm` `step`                                                                                                                                                                         | Reopens at the saved step only if height and weight are saved, else step 1                                                                                                                                                                                                                                                                                                                                                      |
| Completion                        | `app/onboarding.tsx`                                                                                                                                                                         | `router.replace("/(tabs)")` → Home                                                                                                                                                                                                                                                                                                                                                                                              |
| Re-entry                          | `you/account.tsx` `DeleteLocalData`                                                                                                                                                          | Delete all local data → `clearData()` → `/onboarding`                                                                                                                                                                                                                                                                                                                                                                           |
| Account                           | `app/account.tsx` (You → Account & privacy)                                                                                                                                                  | Sign in / Create account / Reset password only when `EXPO_PUBLIC_SUPABASE_URL` and key are set (`.env.example` has both empty; the Expo Go builds tested so far are guest-only). **Not reachable from onboarding**                                                                                                                                                                                                              |
| Forge Paths                       | `src/programs` (18 published, hand-written), `domain/programs/recommend.ts`, `screens/programs/*`, `data/programs.ts`                                                                        | Library at `/forge-paths` (recommendation hero, families), Details at `/forge-paths/[programId]` with a Start sheet (start date) → `enrollProgram`. **Nothing is generated**; the older generated Paths can no longer be created, only continued or archived. **Not part of onboarding**                                                                                                                                        |
| Tests                             | `tests/ui/profile.test.tsx` (journey choices saved on tap; height/weight not bypassable by Next or Skip; per-field saves), `home.test.tsx` and `you.test.tsx` (un-onboarded → `/onboarding`) | No test of the onboarding route itself, resume after restart, or the full first run                                                                                                                                                                                                                                                                                                                                             |

**Profile fields and who reads them.**

| Field                                    | Asked in onboarding       | Read by                                                                                                           |
| ---------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| name                                     | Step 1                    | You header (default "Athlete")                                                                                    |
| units                                    | Step 1                    | Every screen                                                                                                      |
| height                                   | Step 1, **required**      | You _My stats_ only                                                                                               |
| weight                                   | Step 1, **required**      | Bodyweight fallback when no weigh-in (Home, You, goal start suggestion)                                           |
| bodyFat                                  | Step 1, optional          | **Nothing** (removed from Edit profile in 7.5B.1)                                                                 |
| experience, goal                         | Step 2                    | Program recommendation; You identity                                                                              |
| restDay                                  | Step 2                    | Program session weekdays (`enrollProgram`), calendar                                                              |
| **frequency**                            | **Not asked** (default 3) | Which program variant (3/4/5 days) is recommended; Home's weekly goal; Goals' suggestion                          |
| muscles, rest, increment, repMin, repMax | Step 3                    | Rest timer default, progression and template defaults; `muscles` is read by nothing                               |
| theme, calories, protein, carbs, fat     | Step 4                    | Appearance; nutrition (targets count as the lifter's own only after `TARGETS_SAVED`, which onboarding never sets) |
| equipment, duration                      | Never                     | Nothing                                                                                                           |

## B. Current user journeys

| Journey                                | Entry                                                                      | Screens                                                   | Required                       | Persistence                                                              | Back                                                       | Completion                                                                                                       | Known failure modes                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. New, no account**                 | Splash → Home (one frame) → `/onboarding`                                  | 4 steps                                                   | Name (default), height, weight | Incremental, as above                                                    | None between steps; Android back leaves the app            | Enter FORGE or Skip → Home                                                                                       | Home flashes and computes before the redirect; height and weight block a guest who doesn't want to give them; frequency never asked (3-day recommendation by default); 17 inputs across 4 dense old-style screens; a notification permission prompt offered before any value is shown                                                                                                          |
| **B. New, creating an account**        | Not possible in onboarding                                                 | —                                                         | —                              | —                                                                        | —                                                          | Later: You → Account & privacy → Create account (when configured)                                                | Cloud-unconfigured builds have no account at all (true today)                                                                                                                                                                                                                                                                                                                                  |
| **C. Returning, onboarded**            | Splash → Home                                                              | —                                                         | —                              | —                                                                        | —                                                          | Immediate                                                                                                        | —                                                                                                                                                                                                                                                                                                                                                                                              |
| **D. Existing account signing in**     | Onboarding first, then You → Account & privacy → Sign in → Synchronize now | —                                                         | —                              | Onboarding answers are queued for upload at revision 0                   | —                                                          | —                                                                                                                | **Confirmed:** the first sync uploads the onboarding profile against the account's existing cloud profile → a "Your profile" conflict (nothing lost; _Keep local_ / _Use cloud_ choice). Workouts logged on the device before signing in upload to that account and bind the device (`cloudOwner`). Signing into a different account later is refused until local data is exported and cleared |
| **E. Abandoning setup**                | Reopen → Home → `/onboarding`                                              | Resumes at the saved step if height and weight were saved | —                              | Answers kept                                                             | —                                                          | —                                                                                                                | Before height and weight are saved, everything else typed on step 1 except valid fields is lost; the step resets to 1                                                                                                                                                                                                                                                                          |
| **F. Changing answers**                | —                                                                          | —                                                         | —                              | —                                                                        | **No Back**; earlier steps can't be revisited during setup | Change later in You / Preferences                                                                                | —                                                                                                                                                                                                                                                                                                                                                                                              |
| **G. Selecting or skipping a program** | Not in onboarding                                                          | —                                                         | —                              | —                                                                        | —                                                          | Skipping is the default: the athlete lands on Home with no plan; Home offers _Choose a Forge Path_ and freestyle | —                                                                                                                                                                                                                                                                                                                                                                                              |
| **H. No cloud configured**             | Same as A                                                                  | Same                                                      | Same                           | Local only; the outbox still queues every change (harmless until a sync) | —                                                          | Same                                                                                                             | None beyond A                                                                                                                                                                                                                                                                                                                                                                                  |

## C. Recommended flow

Six screens at most, three for a guest who skips everything optional. Only shown while `profile.onboarded` is false. The splash intro is unchanged and precedes the Welcome screen.

**1. Welcome**

- _Purpose:_ say what Forge is; one way in.
- _Copy:_ Wordmark, "BUILT THROUGH DISCIPLINE.", then "Log your training, follow a hand-written program and see your progress. Everything is saved on this phone; no account needed."
- _Primary:_ **Get started** → 3.
- _Secondary_ (only when a cloud backend is configured): **I already use Forge** → 2.
- _Persists:_ nothing. _Back:_ none (Android back leaves the app).

**2. Sign in (configured builds only)**

- _Purpose:_ let a returning athlete restore before creating anything locally.
- Reuse the existing Account sign-in (email, password, reset).
- _Copy:_ "Sign in, then synchronize to bring your training to this phone. Synchronizing is manual; nothing is uploaded until you choose."
- After sign-in: **Synchronize now** (existing `synchronize`).
  - If the downloaded profile is onboarded → Home.
  - Otherwise → 3.
- _Secondary:_ **Continue without signing in** → 3.
- _Back:_ → 1.
- _Persists:_ the session (existing). The local profile is untouched until sync, which avoids journey D's profile conflict.

**3. About you**

- _Fields:_ display name (optional; default "Athlete"); units (Kilograms / Pounds); bodyweight (optional, in units; saved as the profile weight).
- _Removed from this step_ (still in Edit profile): height and body fat. See **D1** and **D2**.
- _Primary:_ **Continue**. _Back:_ → 1.
- _Validation:_ existing rules (blank name → "Athlete"; weight 0 or within limits).
- _Persists:_ each valid value as it changes (existing behaviour).

**4. Your training**

- _Fields:_ experience (3 cards), goal (2 cards), **days a week** (frequency; see **D3**), rest day (7 day pills, with "No preference").
- _Copy:_ "Forge uses these to recommend a program. Change them any time in You."
- _Primary:_ **Continue** (enabled always; nothing required).
- _Secondary:_ **Skip** (same as Continue with no answers).
- _Back:_ → 3.
- _Persists:_ each choice on tap (existing).

**5. Forge Paths**

- _Purpose:_ explain Forge Paths and show the honest recommendation.
- _Copy:_ "Forge Paths are hand-written programs for your experience, goal and week." Then:
  - **Match:** `recommendProgram`'s program as a REFORGE hero with its reasons and facts.
  - **Incomplete:** "Answer the training questions to get a recommendation."
  - **None:** "No program is written for that combination yet."
- _Primary:_ **View this program**. It completes onboarding, then opens `/forge-paths/[programId]` over Home; the athlete starts it there with the existing Start sheet (start date).
- _Secondary:_ **Browse all Forge Paths** (completes, then opens `/forge-paths`).
- _Tertiary:_ **I'll build my own workouts** → 6.
- _Back:_ → 4.
- _Persists:_ `onboarded: true` before any navigation out.
- _Skip:_ always possible; no plan is ever created without the Start sheet.

**6. Ready**

- _Copy:_ "Your Forge is ready."
- _Summary of only what was chosen:_ name, units, experience · goal · days, and "No program yet. Start a workout any time, or choose a Forge Path from Train."
- _Primary:_ **Go to Home**.
- _Secondary:_ **Start a workout** → Train.
- _Persists:_ `onboarded: true`, then `router.replace("/(tabs)")`.

**Not asked (defaults stay, editable in Preferences):** rest, progression increment, rep range, target muscles, appearance (default Dark), nutrition targets (stay "not set" until saved, as now) and reminders (asked when first turned on, in Preferences). See **D5**.

## D. Existing versus proposed

| Area                                                           | Reuse as is                   | Visual modernization                                                                                                           | Narrow functional change                                                                                                                              |
| -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Splash                                                         | ✓                             | —                                                                                                                              | —                                                                                                                                                     |
| Guard                                                          | —                             | —                                                                                                                              | Move the redirect from Home's effect to a declarative guard (a `Redirect` in the tabs layout or `app/index`), so Home never renders for a new profile |
| Profile saving, `commit`, journey saves, `profileSchema`       | ✓                             | —                                                                                                                              | —                                                                                                                                                     |
| Required height/weight                                         | —                             | —                                                                                                                              | Onboarding stops requiring them (D1); `requiredProfileSchema` stays for Edit profile                                                                  |
| Resume                                                         | —                             | —                                                                                                                              | Resume from `onboardingStep` alone (today it needs height and weight)                                                                                 |
| Steps UI                                                       | —                             | New REFORGE onboarding frame: `ForgeChoices`, `ForgeField`, `ForgeSegments`, `CtaButton`, `OutlineButton`, `FText`, `Wordmark` | Back between steps                                                                                                                                    |
| Frequency                                                      | —                             | —                                                                                                                              | Asked in step 4 (D3), same field and range                                                                                                            |
| Recommendation, Library, Details, Start sheet, `enrollProgram` | ✓                             | —                                                                                                                              | —                                                                                                                                                     |
| Account sign-in, `synchronize`                                 | ✓ (the Account screen's flow) | —                                                                                                                              | Reachable from Welcome when configured; "onboarded profile downloaded → Home" check after sync                                                        |
| Sync engine, repository, schema, backups, logger, catalogue    | ✓ unchanged                   | —                                                                                                                              | —                                                                                                                                                     |

## E. Architecture map

| Step          | Existing pieces                                                                                      | New (presentation)                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frame         | `ForgeSubHeader` (Back), safe-area pattern of `ForgeSubScreen`, `ForgeProgress`                      | `OnboardingFrame`: no tab bar, "Step n of 4" text plus a thin progress bar (text first, never colour alone), footer CTA |
| 1 Welcome     | `Wordmark`, `BRAND_TAGLINE`, `cloudConfigured()`                                                     | `Welcome`                                                                                                               |
| 2 Sign in     | `app/account.tsx` auth handlers, `synchronize`, `transport`                                          | A thin wrapper or route reusing them; no new auth                                                                       |
| 3 About you   | `ProfileForm` field rules (units, weight conversion, friendly errors), `ForgeField`, `ForgeSegments` | Step component; or `ProfileForm` with `fields` (its REFORGE focused mode) plus `onboarding` incremental saves           |
| 4 Training    | `experienceChoices`, `goalChoices`, `restDayNames`, `ForgeChoices`                                   | Step component                                                                                                          |
| 5 Forge Paths | `recommendProgram`, `programTitle`, `programFacts`, `openProgram`, `libraryPrograms`                 | Step component                                                                                                          |
| 6 Ready       | `experienceText`, `focusText`, `displayName`                                                         | Step component                                                                                                          |
| Progress      | `onboardingStep` setting                                                                             | Same setting, now covering steps 1–6                                                                                    |

## F. Data-safety assessment

| Risk                                                                                                  | Today                                                                                       | After 7.7                                                                                                                                |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Returning account holder reinstalls and answers setup before syncing → profile conflict on first sync | **Confirmed** (onboarding queues the profile at revision 0; the cloud has a newer revision) | Welcome's _I already use Forge_ signs in and syncs **before** any local answers; the conflict UI still protects the rare case            |
| Guest data uploaded to the first account that syncs; device bound to it                               | Existing behaviour, not explained at first run                                              | Stated plainly where account options appear: "Training already on this phone is uploaded to the account the first time you synchronize." |
| Different account later                                                                               | Sync refuses with export-and-clear guidance                                                 | Unchanged                                                                                                                                |
| Interrupted setup                                                                                     | Answers kept; resume needs height and weight                                                | Answers kept; resume from `onboardingStep`                                                                                               |
| Duplicate profiles                                                                                    | Impossible (one `profile` row, `id='local'`)                                                | Unchanged                                                                                                                                |
| A plan created without consent                                                                        | Impossible (only the Start sheet enrolls)                                                   | Unchanged: onboarding never enrolls                                                                                                      |
| Changing frequency after starting a program                                                           | Program weekdays are fixed at enrollment; frequency only affects future recommendations     | Unchanged; say so in Preferences later if needed                                                                                         |
| Account creation failing / offline                                                                    | Account screen shows the error; guest use unaffected                                        | Same, plus _Continue without signing in_                                                                                                 |
| Home computing for an empty, un-onboarded profile                                                     | Yes (one render)                                                                            | Guard removes it                                                                                                                         |

**Truthful copy (for 7.7B):**

- **On this phone:** "Your training is saved on this phone. You don't need an account."
- **Account:** "An account lets you synchronize to your own cloud storage. Synchronizing is manual: nothing is uploaded until you choose."
- **First sync:** "Training already on this phone is uploaded to the account the first time you synchronize, and this phone then stays with that account."
- **Returning:** "Sign in and synchronize to bring your training here."

## G. Implementation roadmap

Each stage runs the full verification (TypeScript, ESLint, Prettier, logic and UI suites, catalogue checks, iOS and Android exports) and stops for founder review on the iPhone.

| Stage                               | Scope                                                                                                                                                                                             | Depends on               | Tests                                                                                                                                                                                                                                      | Acceptance                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **7.7B Welcome, account and guest** | `OnboardingFrame`; Welcome; the guard moved out of Home; _I already use Forge_ (configured builds only) reusing sign-in and sync, with the "onboarded profile downloaded → Home" check            | Founder decisions D4, D6 | Guard (Home never renders un-onboarded); Welcome in guest and configured builds; sign-in → sync → Home, or → setup; no account UI when unconfigured; no profile write before sign-in                                                       | A new install shows Welcome after the splash; guest path is one tap; configured builds restore a returning athlete without a profile conflict |
| **7.7C Profile and preferences**    | Steps 3 and 4 in REFORGE; Back; frequency; incremental saves kept; resume from `onboardingStep`; height and body fat out of onboarding                                                            | D1, D2, D3, D5           | Each value saved on change; units convert weight; Back keeps answers; resume after restart at the right step; frequency within 1–7; no height or body fat asked; `profile.test` onboarding assertions updated only where D1/D2 change them | Setup in under a minute; nothing required except what the founder keeps                                                                       |
| **7.7D Forge Paths and completion** | Step 5 using `recommendProgram`; Ready screen; completion writes `onboarded` before navigating; links to Details / Library / Home / Train                                                         | 7.7C                     | Match, incomplete and none states; _View this program_ lands on Details with Start available and **no enrollment yet**; _build my own_ reaches Home with no plan; summary shows only chosen values                                         | A program is never started without the Start sheet; Home is reached in all paths                                                              |
| **7.7E End-to-end QA**              | Full first run on compact and large phones, Dynamic Type, VoiceOver, light and dark, reduced motion, interruption at every step, offline, delete-all → onboarding again, configured-build sign-in | 7.7B–D                   | An end-to-end UI test of the guest first run; restart-resume tests per step; regression of `home`, `you`, `profile`, `account-reforge`, `sync`                                                                                             | Founder iPhone acceptance                                                                                                                     |

## H. Open founder decisions

| #      | Decision                                                                                                                                             | Recommendation                                                                                                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Keep height and starting weight **required** at first run? Today they block a guest; height is display-only                                          | **Neither required.** Ask bodyweight as optional; leave height to Edit profile. `requiredProfileSchema` stays for Edit profile                                                                                                                          |
| **D2** | Remove body fat % from onboarding (already removed from Edit profile in 7.5B.1)?                                                                     | **Remove.** The stored value is kept; body fat is a Measurement                                                                                                                                                                                         |
| **D3** | Ask **days a week** (frequency) during setup? It is the one preference that changes which program variant is recommended, and it's never asked today | **Ask it** in step 4: the existing 1–7 range; the recommendation picks the nearest 3/4/5-day program, as now                                                                                                                                            |
| **D4** | Offer account sign-in at first run?                                                                                                                  | **Only in cloud-configured builds, and only "I already use Forge" (sign in and synchronize).** Account **creation** stays in You → Account & privacy, where the first-sync consequence is explained, so a new athlete is never pushed toward an account |
| **D5** | Drop the advanced and optional questions from first run (rest, increment, rep range, target muscles, appearance, nutrition targets, reminders)?      | **Drop them.** Defaults are unchanged; all remain in Preferences. Nutrition stays "not set" until the athlete saves targets, as today                                                                                                                   |
| **D6** | Where does setup end?                                                                                                                                | **Forge Paths step with the honest recommendation**, then Home; starting a program always goes through the existing Details and Start sheet, never an automatic enrollment                                                                              |

No other decision is needed: the visual language, copy tone, no gamification, guest-first and engine boundaries are established.

## Addendum: Phase 7.7B decisions (mandatory account)

The founder superseded **D4** and the guest-first premise of this audit:

- **Forge requires an account.** There is no guest mode, no skip and no local "logged in" flag. Someone is signed in only while the account service's own session (Supabase, kept in the secure store) says so.
- **Offline use** continues for an athlete who has signed in on this phone before: when the session can't be refreshed only because the network is unavailable, the stored session keeps training open. A session the service rejects (for example a revoked refresh token) is signed out.
- **Legacy data** (training from before accounts, with no owner) is never attached silently. After signing in, the athlete sees "Link this phone's training" and chooses "Link to {email}" or "Sign out". Linking only records the owner (`cloudOwner`, the same marker the first synchronization writes). Nothing is uploaded until they synchronize.
- **Another account's data** on this phone is never shown. The options are to sign out, or delete this phone's data through the existing confirmation.
- **An empty phone** is claimed for the signed-in account as setup begins, so the profile entered during setup is the athlete's own and never appears as unlinked data.

**The entry gate.** One decision in `src/auth/entry.ts`, enforced by `Stack.Protected` in `src/auth/AppStack.tsx`. It replaces Home's onboarding redirect. A deep link to a protected route redirects to the screen of the current state.

| State                         | Screen                                         |
| ----------------------------- | ---------------------------------------------- |
| unconfigured or misconfigured | Account check: "Accounts aren't available"     |
| initializing                  | Loading, behind the intro                      |
| signed out                    | Welcome, Sign in, Create account               |
| recovery                      | Account check: Set a new password              |
| other account                 | Account check: Sign out or delete local data   |
| unlinked                      | Account check: Link or Sign out                |
| setup                         | Onboarding                                     |
| ready                         | Home and every training screen                 |

**Configuration this requires (not in the repository):**

- `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the local `.env` (HTTPS only).
- `supabase/migrations/202610140001_forge.sql` applied to the project.
- The project's email-confirmation setting decides whether sign-up returns a session. Both cases are handled: when no session comes back, Forge says to confirm the email, then sign in.

Without the configuration, the build shows "Accounts aren't available", and training on the phone is kept but not shown.

**Still open, for 7.7C to 7.7E:**

- A returning account holder on a fresh install still answers setup before the first synchronization, which conflicts with the cloud profile (finding §F).
- The Account screen's guest-mode branch and the You row subtitle "Guest mode · …" are now unreachable (Account is shown only when signed in). They are left in place for the 7.7 Account pass.
- Onboarding keeps its older `Screen` frame until 7.7C.

### Linking safety (7.7B follow-up)

**What synchronization does with two histories.** The engine (`src/cloud/sync.ts`, unchanged) has no merge step.

- On the first synchronization after linking, every queued local record is uploaded into the signed-in account and every cloud record is downloaded onto the phone.
- Workouts, templates, journal entries and custom exercises have random identifiers, so they never collide: the two histories are simply combined, with no way to separate them afterwards.
- Only the profile (fixed id `profile`) conflicts.
- `tests/link.test.ts` characterizes this behavior.

**Rule.** This phone's unowned training is linked only to an account with **no Forge cloud records**.

- `linkChecked` (`src/cloud/link.ts`) first makes one read-only, row-level-secured query: at most one record identifier, never a payload, never a write. Records marked deleted count too.
- If the account holds anything, linking is refused and nothing changes. The athlete sees "This account already has training", with *Export backup*, *Sign out* and the existing confirmed *Delete all local data*.
- If the check can't run (offline, the migration isn't applied, the account changed, or local data changed during the check), nothing is linked: it fails closed.

**Related fixes:**

- Anything waiting to be synchronized (for example a queued deletion) now counts as local history, so it can't be claimed automatically as an empty phone.
- Restoring a backup in Account & privacy keeps the signed-in athlete's ownership. `importBackup` clears every setting; before 7.7B, the next sync re-claimed the data. Without this fix, a restore would have sent the athlete to the link check, which would then refuse.

**Limitations requiring an architectural decision:**

- Combining a phone's separate history with an account that already has training needs a merge design (de-duplication, profile choice, undo). It is blocked rather than built.
- Restoring a backup while signed in is a deliberate, confirmed import; it keeps the existing behavior that the next synchronization uploads its contents into the account.
- The check and the link aren't atomic with another device's first upload; the window is the duration of one request.

### Email links in Expo Go (7.7B, connected project)

- **Confirmation:** sign-up passes `emailRedirectTo: Linking.createURL("/sign-in")`, which is `exp://<host>:8081/--/sign-in` in Expo Go and `forge://sign-in` in a native build. Previously no redirect was passed, so the link fell back to the Site URL (`http://localhost:3000`). Supabase confirms the email before redirecting either way. Sign in then says "Your email is confirmed. Sign in to continue." The tokens in that link are not used: the athlete signs in explicitly.
- **Expired or used links** show a plain message on Sign in or Welcome, once per link.
- **Signing in before confirming** explains what to do instead of showing "Email not confirmed".
- **Password reset** keeps its redirect `Linking.createURL("/account")`. Each link is handled once, only after the stored session is restored, and only while signed out. A link that arrives while signed in is left to the Account screen; signing out never replays a link.
- **No flash during reset:** while a reset link's session is being started, the arriving session is treated as a recovery, so neither setup nor Home appears on the way to *Set a new password*.
- **Dashboard:** the allow-list entries `exp://**` and `forge://account` cover Expo Go. A native build also needs `forge://sign-in`. Leaving the Site URL at localhost is harmless while those are allowed; set it to a real HTTPS page before release.

## Addendum: Phase 7.7B.1 (frictionless sign-in)

**Founder decisions:**
- **D1, accepted with safeguards:** Supabase links verified-email identities to one account. Identity linking never merges, uploads, downloads or reassigns local training: the entry gate compares the account ID with `cloudOwner`, exactly as for email.
- **D2, modified:** Apple is never shown in Expo Go, and `host.exp.Exponent` is not added to the production project. Apple is implemented and waits for Forge's own signed build.
- **D3:** Google uses Supabase's browser OAuth flow.
- **D4:** Apple is iOS-only.
- **D5:** name pre-fill is deferred to 7.7C. Apple's first-time name is kept in the account's metadata, because Apple never sends it again.

**Built:**
- `src/auth/providers.ts`: enabled providers from Supabase's public settings. The last answer stands while offline.
- `src/auth/social.ts`: the Google and Apple flows. Cancelling is quiet; failures show plain words; a double tap is guarded.
- `src/auth/methods.ts`: the account's linked sign-in methods, listed in Account & privacy.
- `src/screens/entry/ProviderButtons.tsx`.
- Welcome: Apple, Google, Email. Email is the ember CTA when it's the only option, the outline otherwise.

**Open before release:**
- A signed development build (Apple Developer Program, App ID with Sign in with Apple, `com.lsaint06.forge` in Supabase's Apple Client IDs, `forge://**` redirects).
- Apple token revocation when an account is deleted (App Store requirement; needs the `.p8` key and a server function).
- Google brand verification or a custom domain, so the consent screen doesn't show `<ref>.supabase.co`.
- Publishing the Google consent screen beyond its test users.

### 7.7B.1 fix: Google ended on "localhost" in Expo Go

**Cause.** Supabase Auth refuses any return address whose host is an IP address other than loopback, before it reads the allow list, and silently uses the Site URL (`http://localhost:3000`). See `IsRedirectURLValid` in supabase/auth, `internal/utilities/request.go`. Expo Go on a local network returns to `exp://<the computer's IP>:8081/--/welcome`.

**Observed on the project** (read-only, through `/verify` with an invalid token, which redirects using the same check):

| Return address | Verdict |
|---|---|
| `exp://anything` | accepted |
| `exp://abc-anonymous-8081.exp.direct/--/welcome` | accepted |
| `exp://my-pc.local:8081/--/welcome` | accepted |
| `exp://127.0.0.1:8081/--/welcome` | accepted |
| `forge://account` | accepted |
| `exp://192.168.1.23:8081/--/welcome` | refused: Site URL |
| `exp://10.0.0.5:8081/--/welcome` | refused: Site URL |
| `exps://…exp.direct/--/welcome` | refused: Site URL (no `exps://**` entry yet) |
| `forge://welcome` | refused: Site URL (no `forge://**` entry yet) |

The same rule affected email confirmation and password-reset links opened in Expo Go on a local network. Confirmation still confirms the email on Supabase's side.

**Fix:**
- `src/auth/redirects.ts` applies Supabase's IP rule to the return address that Expo's `Linking.createURL` produces.
- Welcome hides Google where Supabase would refuse the address (and logs why in development), and `signInWithGoogle` never opens a sheet that couldn't come back.
- No IP address and no hand-written return address anywhere.
- Expo Go testing uses a tunnel (a hostname).

**Dashboard:** add `exps://**` and `forge://**` to Redirect URLs; keep `exp://**`.

**Tests:** `tests/oauth-redirect.test.ts` (the rule, and the real supabase-js authorization URL) and the "Expo Go return address" cases in `tests/ui/social-auth.test.tsx`.

### 7.7B.1 fix 2: Google still hidden with `--tunnel` (SDK 58 tunnel)

**Report:** Metro ran a tunnel at `exp://c-lstamand-97rrx8-mvvws2xi04jjituc.on.expo.app`, yet Welcome showed only Email, and the log said Google was hidden because of an IP address.

**Verified:**
- Expo SDK 58's CLI tunnels with `@expo/ws-tunnel` on `*.on.expo.app`, not ngrok on `exp.direct`.
- `Linking.createURL` takes its host from where Expo Go downloaded the bundle (`NativeSourceCode.scriptURL`), not from Metro's banner.
- Through the tunnel, `exp://` is 301-redirected to `https://`, and the manifest's bundle is `https://<name>.on.expo.app/…`. The return address is therefore `exps://<name>.on.expo.app/--/welcome`, which Supabase accepted (read-only check).
- Metro keeps serving the local network while tunnelling, and Expo Go's Home "Development servers" list (found via Bonjour) and Recents open `exp://<IP>:8081`. A copy of Forge opened that way returns to an IP address, which Supabase refuses, so the copy on the phone had not been opened through the tunnel.
- Expo Go registers both `exp` and `exps` (expo-linking's `EXPO_CLIENT_SCHEMES`), so the secure sign-in sheet's callback scheme belongs to Expo Go itself.

**Fix:**
- The development log names the exact return address and why it is or isn't usable.
- The opening instructions now say: close Forge in Expo Go, then scan the tunnel's QR code.
- `tests/ui/expo-go-return.test.tsx` runs Expo's real `createURL` for the tunnel, local-network and build cases.
- No behavior change: the rule was right.

**Reliability:** Expo Go can do this only while Forge is opened through the tunnel. A development build (`forge://`) is the production-like route and is still required for Apple.

## Addendum: Phase 7.7C (account experience)

**Bug fixes and polish (approved):**
- Account & privacy takes the signed-in account from the entry gate. Previously it briefly showed the old sign-in form on every open, and while offline it said "Not signed in" with a raw network error.
- Account-service errors are mapped by code to plain wording, and unknown codes show a fallback. Raw messages never reach the athlete, and only the code reaches the developer log.
- Confirmation emails can be resent from the confirmation screen and from Sign in (an unconfirmed email), waiting a minute between sends.
- Progress has specific names ("Signing in…", "Sending reset link…", "Restoring your training…"), and every place says "Sign out" (no more "Log out").
- Password fields have show/hide, and the Return key moves to the next field and submits.

**P1, restore your training (approved with safeguards):**
- On a phone with nothing of its own, setup first makes a read-only check for Forge cloud records.
- If there are records, it offers **Restore my training**: the existing `synchronize`, run once, only when chosen. On an empty phone the upload queue is empty, so it only downloads.
- The restored profile is the one the old phone synchronized, `onboarded` included, so Home opens and setup isn't repeated.
- Repeated restores skip what is already here (record IDs and revisions), so nothing is duplicated. An interrupted restore changes nothing; a partial one keeps what arrived and resumes.
- Once anything is entered in setup, no restore is offered (the next sync would conflict).
- Offline or after a failed check: Try again, or a confirmed "Set up this phone now".
- No ownership semantics changed.

**P2, owner hints (approved):**
- The owner's email is stored already masked (`l•••@gmail.com`), with their sign-in methods, in `cloudOwnerHint`.
- It is recorded only while the owner is signed in, tied to the owner's account ID, and ignored for anyone else or if unreadable.
- It is used only for wording on the conflict screen, never for authorization.

**P4, wrong account during setup (approved):**
- Setup shows "Setting up Forge for {email}" with **Not you? Sign out**.
- An owner claim with nothing behind it (no data, nothing waiting to sync, no sync history) no longer blocks another account; that account sets the phone up.
- Any data, including a setup draft, keeps strict protection.

**P5, offline sign-out (approved with safeguards):**
- When Supabase can't be reached, Forge removes the stored session from this phone itself, because Supabase keeps it when the token has expired.
- Welcome then says the sign-in wasn't ended on the server and will expire on its own.
- Training and ownership are untouched, and ownership is checked again at the next sign-in.

**Conflict screen:**
- It says who you're signed in as, and who owns the training: masked, or "a different Forge account" without a reliable hint.
- It explains why accounts are kept separate and how to return (sign out, then sign in with that account).
- It lists exactly what deleting would remove, including changes never synchronized.
- Sign out is the main action. Deletion is secondary, behind a confirmation written for this situation.

**P6:** deferred (separate email screens kept).

### Proposal P3: deleting a cloud account (awaiting approval; not implemented)

**Today:** deleting the cloud account signs out, and the phone's training stays owned by the deleted account. Every later sign-in sees the conflict screen; the training can only be deleted.

**Proposed workflow.** "Delete cloud account" becomes a short, explicit flow:
1. **Explain.** The account and every cloud record are deleted. The training on this phone belongs to this account, and no other account will ever be able to open it.
2. **Keep a copy (recommended).** Export a backup now. A backup file is the only way to bring this training to another account later: after setting up the new account, import it in Account & privacy.
3. **Choose what happens on this phone:**
   - (a) **Remove it too:** after the account is deleted, the phone's data is deleted, with its own confirmation.
   - (b) **Leave it here, locked:** today's behavior. The conflict screen then says the owning account was deleted, and recommends importing a backup or deleting.
4. **Final confirmation:** the existing "Delete account permanently?".

**Security:**
- Ownership is never transferred. A different account never gains access because an identity was deleted.
- Continuity only comes from a file the athlete exported while signed in, which they then import, signed in, on a phone their account owns.

**Recovery limits:**
- With (b) and no backup, the training can't be moved to another account, only deleted.
- An exported backup holds training up to the moment of export.
- **Before release:** Apple Sign in tokens must also be revoked when an account is deleted (needs the `.p8` key and a server function).

**Small supporting change:** record which owner was deleted (`cloudAccountDeleted = <owner ID>` instead of `"true"`), so the conflict screen can say so precisely.