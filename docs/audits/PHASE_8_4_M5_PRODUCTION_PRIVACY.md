# Phase 8.4, M5: production and privacy readiness

A review of the repository (Nov 5, 2026). It covers what blocks TestFlight and Google Play testers, and later the stores. It changes no backend, store record or account; those steps are the founder's, listed in §6.

**Sources:**
- the code at `feat/phase8-readiness`;
- the 7.8A cloud audit (data inventory, server rules);
- the 7.8E account lifecycle report (deletion, Apple, SMTP);
- the 8.4A readiness audit (gates G-DEL, G-PRIV, G-DIAG and G-PROD).

## 1. Summary

| Gate | Status | Blocks |
| --- | --- | --- |
| **G-PRIV: privacy** | The data inventory and draft store answers are below (§2). **Missing:** a privacy policy, and **a link to it inside the app**, which both stores require (§3) | External testing; store review |
| **G-DEL: deletion** | **In the app:** deletion exists, tested by the suites, not yet live (needs A2). **Apple-only accounts can't delete yet** (7.8E E8, D3). **Google Play** also wants a web page for deletion requests: none exists (§4) | App Store and Play review |
| **G-DIAG: diagnostics** | No crash reporter. TestFlight and Play Console show basic crashes (§5) | Desirable before external testers |
| **G-PROD: production** | Not started; production builds stay locked (RELEASE.md §6). Checklist in §6 | Production builds (8.4F) |

**Repository fixes in M5:** none were needed beyond M1–M4. Each remaining item needs a decision, an external account or legal text.

## 2. What Forge collects, and where it goes

**One destination: Forge's Supabase project** (FORGE DEV for testers; production later), over HTTPS. Nothing else leaves the phone:
- **no analytics, advertising, crash or location SDK** (checked in `package.json` and `src`);
- **barcodes** are looked up in the catalogue bundled in the app; the one USDA web link opens only when the athlete taps it;
- **camera frames** are read on the phone for barcodes and never stored or sent;
- **no log line** carries emails, tokens, sessions or training data (checked again for M5).

| Data | Stored | Synced (record kind) | In a backup file |
| --- | --- | --- | --- |
| Account: email, user ID; Google or Apple sign-in identity | Supabase Auth; the session in the phone's secure storage | Auth only | No |
| Profile: name, height, weight, body fat, experience, goal, training days and equipment, nutrition and hydration targets, settings | SQLite | `profile` | Yes |
| Workouts with exercises and sets; templates; custom exercises | SQLite | `workout`, `template`, `exercise` | Yes |
| Journal: body measurements, food log, recovery, goals, personal foods, hydration, Forge Path enrollments and schedule | SQLite | `journal` | Yes |
| Favorites, settings, rest timer state, drafts | SQLite | No | Favorites only |

The server holds these five kinds only (`supabase/migrations/202610140001_forge.sql`). Row-level security lets each account read only its own rows, and writes go through `forge_write` as that account (7.8A §5).

Phase 9.2 onboarding (Engineer #2's integration branch, read-only check) asks for the same profile fields and keeps its progress on the phone, so this inventory holds. **Phase 9's subscriptions will add purchase data** (RevenueCat), which both forms must then include.

### Draft answers for the stores (for the founder's review, not legal advice)

**App Store Connect → App Privacy.** Every item below is linked to the user, used for App Functionality only, and not used for tracking:

| Apple's category | Data type | Forge's data |
| --- | --- | --- |
| Contact Info | Email Address | The account's email |
| Contact Info | Name | The profile name, if entered |
| Health & Fitness | Health | Height, weight, body fat, measurements, food log, hydration, recovery |
| Health & Fitness | Fitness | Workouts, sets, templates, Paths |
| User Content | Other User Content | Personal foods, custom exercises, goals |
| Identifiers | User ID | The account's ID |

Not collected:
- location, contacts, photos, browsing data;
- usage data and diagnostics (Forge itself collects none; §5);
- purchases (until Phase 9).

**Google Play → Data safety:**
- **Collected, not shared:**
  - Personal info: email address, name, user IDs;
  - Health and fitness: health info and fitness info;
  - Other user-generated content.
- Supabase processes the data on Forge's behalf (a service provider), which Play doesn't count as sharing.
- **Encrypted in transit:** yes (HTTPS).
- **Deletion:** users can request it, in the app and on the web page (§4).
- **Required or optional:** the account's email is required. For the profile's body details, follow the onboarding as it ships (Phase 9.2 asks for height and weight), and mark journal data optional.

**Google Play → Health apps declaration:** fitness tracking (workouts), nutrition (food log) and body measurements. Forge doesn't use Health Connect.

## 3. The privacy policy and the in-app link

**Both stores require a privacy policy inside the app as well as in the store listing.**
- **Apple:** guideline 5.1.1(i).
- **Google:** the User Data policy.

Forge has no policy yet, and no link to one.

**Proposal** (needs the URL and the founder's approval of the placement):
- a public `EXPO_PUBLIC_PRIVACY_POLICY_URL`, read like `EXPO_PUBLIC_SUPPORT_EMAIL` (`src/support.ts`), so nothing shows until it is set;
- a **Privacy policy** row in You → Account & privacy;
- the same link on Create account.

The policy itself:
- can follow §2's inventory;
- names Supabase as the processor;
- gives the deletion paths (§4) and the support contact;
- says that the phone's database and backup files aren't encrypted at rest beyond iOS's own file protection (7.8A L8).

**Support contact:** `EXPO_PUBLIC_SUPPORT_EMAIL` is shown on Forge's recovery screen when set. App Store Connect also needs a support URL.

## 4. Account and data deletion

- **In the app:** You → Account & privacy → Delete Forge account (7.8E Stage 2).
  - It deletes every cloud record of the account, then the local data.
  - The live test with throwaway accounts (A2) hasn't run.
- **Apple-only accounts can't confirm deletion yet (7.8E D3, E8).** Apple also requires revoking the account's Sign in with Apple authorization when it's deleted, which needs Apple's client secret on the server (for example, an Edge Function).
  - **When it matters:** Apple sign-in was off in FORGE DEV at the 7.8E report. While it stays off, testers can't create Apple-only accounts.
  - **The App Store needs Apple sign-in:** Forge offers Google sign-in, so guideline 4.8 requires an equivalent option. Apple's is the expected one.
  - **So E8 and D3 must be done before the App Store submission.** That's server and app work, for its own approval.
- **Google Play's web deletion page:** apps with accounts must also let people ask for deletion outside the app.
  - The page says how to delete in the app.
  - It offers a request by email to the support address, for someone who no longer has the app.
  - It lists what is deleted, and when.
  - It needs a public HTTPS address (founder's choice of host).

## 5. Diagnostics

- **Today:**
  - TestFlight shows crashes and testers' feedback;
  - Play Console's Android vitals shows crashes and ANRs.
  - JavaScript errors in release builds appear only as native crashes with the error message, and Forge's recovery screen catches startup errors.
- **Symbol files:**
  - **iOS:** check at the first TestFlight build that App Store Connect symbolicates crashes (EAS uploads the archive's symbols).
  - **Android:** R8's mapping travels in the App Bundle ([ANDROID.md](../ANDROID.md) §1).
- **Decision (8.4A §9): a crash reporter, or store consoles only.**
  - A reporter (for example, Sentry) is a new dependency and a privacy disclosure (Diagnostics in both forms).
  - **Recommendation:** store consoles for internal testers. Decide before external testers.

## 6. The founder's checklist

**Before external testers (TestFlight external, Play closed testing):**
1. **Privacy policy:** written (from §2), published at an HTTPS address. Then approve the in-app link (§3).
2. **App Privacy and Data safety** answered from §2, after reviewing it.
3. **Play:**
   - the Health apps declaration;
   - content rating and target audience;
   - the web deletion page (§4).
4. **The real app icon** (C-00b). The release check notes its absence.
5. **Crash reporting decision** (§5).
6. **Live tests on FORGE DEV with throwaway accounts** (approval A2):
   - deletion;
   - two-account isolation.

**Before the App Store and Google Play (G-PROD, 8.4F), on the production project:**
1. **Stage 3 server hardening** (7.8E E7), as applied to FORGE DEV: `npm run dev:verify-stage3` shows what's checked.
2. **Custom SMTP** (7.8E M7). The built-in sender reaches only the team, with very low limits. Register the sender for Apple's private relay too.
3. **Site URL:** a real HTTPS page, replacing `http://localhost:3000`.
4. **Redirect list:** remove the tunnel entry. Production keeps only FORGE's `forge:///…` entries; FORGE Dev and FORGE Preview use FORGE DEV.
5. **Sign in with Apple for FORGE:**
   - the Services ID and key on production;
   - confirmation and revocation (E8);
   - deletion for Apple-only accounts (D3).
6. **Google:** production's own OAuth client, and its consent screen with FORGE's name, privacy policy and support links.
7. **Support:** the support address and support URL; the privacy policy URL in both stores.
8. **Then the production pin and profile** in one reviewed commit (RELEASE.md §6).

**Out of scope here:** RevenueCat, App Store subscriptions and Google Play Billing (Engineer #2's Phase 9; RELEASE.md §10). Their purchase data joins §2's answers when they ship.
