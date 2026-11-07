# Phase 9.3: sandbox purchase testing (prerequisites and script)

**Status (2026-11-05): nothing on this page has been done.** Every step needs the founder (agreements, accounts, keys) or an explicit approval (deploying to FORGE DEV). Production is never touched. What was tested so far is simulated: Node and UI tests, and Expo Go on the Android emulator with no store key ([`docs/SUBSCRIPTIONS.md`](../SUBSCRIPTIONS.md#phase-93-forge-premium-in-development-builds)). No real or sandbox purchase has been made.

Keys and secrets go only into the dashboards, `.env.forge-dev` (ignored by Git) and Supabase's secret store. Never into the repository, a chat or a log.

## 1. Founder decisions first

- **F16:** the product ID and its display name, for each app record.
- **F3:** RevenueCat's restore behaviour (one Apple subscription across Forge accounts).
- **F15:** Terms of Use and Privacy Policy URLs (the paywall says they're missing until set).
- **F7:** Billing Grace Period on or off.
- **F11:** purchase testing in FORGE Dev.
- **F12:** complimentary access for the founder, testers and App Review.

## 2. App Store Connect (founder)

- **Agreement:** the Paid Applications Agreement is active (tax and banking). Without it, no in-app purchase works, not even in the sandbox.
- **The product:** one auto-renewable subscription in a subscription group, on the app record whose bundle ID the build uses.
  - FORGE Dev is `com.lsaint06.forge.dev`; production is `com.lsaint06.forge`, with its own product.
  - Duration: 1 month. Price: $6.99 USD.
  - A display name and a review screenshot.
- **Introductory offer:** free, 1 week, for new subscribers.
- **Billing Grace Period:** as F7 decides (off until then).
- **Keys for RevenueCat:** an In-App Purchase key (`.p8`) under Users and Access → Integrations. Optionally, an App Store Connect API key, for RevenueCat's product import.
- **Sandbox Apple Accounts:** under Users and Access → Sandbox. On the iPhone, sign in under Settings › Developer › Sandbox Apple Account (the Developer menu appears once a development build is installed).

## 3. RevenueCat (founder)

- **Project and app:** the Forge project, and an App Store app for FORGE Dev (`com.lsaint06.forge.dev`) with the In-App Purchase key. Production's app comes later.
- **Product and offering:** add or import the product. The `default` offering is marked current, with a **Monthly** package holding it.
  - Forge's server decides by product ID (`FORGE_MEMBERSHIP_PRODUCT_IDS`), so no RevenueCat entitlement is needed. One may be attached for RevenueCat's own dashboards.
- **Restore behaviour (F3):** under Project settings. RevenueCat's default is "Transfer to new App User ID".
- **Keys:**

  | Key | Format | Goes in |
  | --- | --- | --- |
  | The app's public SDK key | `appl_…` | `.env.forge-dev` |
  | The Test Store key, for simulated purchases only | `test_…` | `.env.forge-dev` |
  | A secret API key (v1) | `sk_…` | Supabase's secret store only; never in the app |

- **Webhook** (sandbox events, for FORGE DEV):
  - URL: `https://<FORGE DEV project ref>.supabase.co/functions/v1/entitlement-webhook`.
  - An Authorization header value: a long random string.
  - **Enable HMAC signing**, and keep its signing secret (shown once). It is optional in RevenueCat, but Forge refuses every delivery without it.
  - Webhooks are a paid RevenueCat feature (Pro at the time of research); confirm it on Forge's plan.

## 4. FORGE DEV's Supabase (Opus 1's review and the founder's approval; never production)

1. **Promote the draft migration** ([`docs/SUBSCRIPTIONS.md`](../SUBSCRIPTIONS.md), "Promotion"), apply it to FORGE DEV, then run [`forge_entitlements_checks.sql`](../../supabase/drafts/forge_entitlements_checks.sql).
2. **Set the functions' secrets**, in the Dashboard (Edge Functions → Secrets) or with `supabase secrets set --env-file <a file outside the repository>`:
   - `REVENUECAT_SECRET_API_KEY`;
   - `FORGE_ENVIRONMENT=development`;
   - `FORGE_MEMBERSHIP_PRODUCT_IDS` (FORGE Dev's product ID);
   - `REVENUECAT_WEBHOOK_AUTHORIZATION`;
   - `REVENUECAT_WEBHOOK_SIGNING_SECRET`.

   Supabase injects its URL and keys itself (`SUPABASE_URL`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`).
3. **Deploy both functions:**
   - `supabase functions deploy entitlement-refresh --project-ref <FORGE DEV ref>`.
   - `supabase functions deploy entitlement-webhook --no-verify-jwt --project-ref <FORGE DEV ref>`. The webhook carries no Supabase token: it checks RevenueCat's header and signature itself.
4. **Check the deployment:**
   - a GET answers 405;
   - a POST to `entitlement-refresh` without a token answers 401;
   - a missing setting answers 503, and the function's log names the setting, never its value.

## 5. The FORGE Dev build (founder's Mac, or EAS with approval)

- **Rebuild first:** `react-native-purchases` adds native code, so the FORGE Dev build on the iPhone must be rebuilt.
  - Locally: `npm run dev:ios` (Mac and Xcode).
  - Or with EAS: the `development` profile.

  The `development-release` profile is compiled for release, so membership never runs in it.
- **`.env.forge-dev`:**
  - `EXPO_PUBLIC_FORGE_MEMBERSHIP=development`;
  - `EXPO_PUBLIC_REVENUECAT_APPLE_KEY=appl_…`;
  - `EXPO_PUBLIC_TERMS_OF_USE_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL`, once F15 provides them.

  Then start Metro with `npm run start:dev`.
- **Simulated only:** with `EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY=test_…` instead, Expo Go and debug builds use RevenueCat's Test Store. Its purchases are simulated, and Forge's server never counts them.

## 6. Verification script (FORGE DEV, Apple's sandbox)

1. **The paywall:** a new FORGE DEV account → setup → the reveal → **Continue**. Forge Premium shows:
   - the plan card: $6.99 per month, marked **7 DAYS FREE**, and the free week's timeline;
   - the floating action: "$6.99 /month after 7 days free" and **Start free trial**;
   - the terms ("Free for 7 days, then $6.99 a month…") and both links;
   - **Restore**.
2. **The purchase:** **Start free trial** → Apple's sandbox sheet → "Confirming your membership…" → "Your free week has started" → **Enter Forge**. Then check:
   - `forge_entitlements` has the account's row (`trial`, environment `sandbox`);
   - `forge_entitlement_events` has the webhook's event, processed.
3. **The card:** You → Account shows "Free week until …". **Manage subscription** opens Apple's subscription settings.
4. **Renewal:** sandbox renewals are accelerated (Settings › Developer › Sandbox Apple Account sets the rate). After the trial, the card shows "Renews …" (through the webhook, or **Check again**).
5. **Cancelling:** cancel in the sandbox subscription settings. The card shows "Ends …", and access continues until then. Afterwards the server says `expired`, and the card "Your membership has ended". Phase 9.4, not 9.3, closes Forge.
6. **Restore across accounts:** a second FORGE DEV account, on the same sandbox Apple Account → **Restore purchases**. What happens follows F3: a transfer, or "belongs to another Forge account".
7. **Account switching:** sign out, then in as the other account. The card never shows the other account's membership.
8. **Offline:** in airplane mode while confirming, the paywall says "You're offline…" and nothing opens. Back online, **Check again**.
9. **No free week:** a sandbox account that already used its free week sees **Subscribe** and no trial wording.
10. **Optional (Xcode's StoreKit configuration, on a Mac):** Ask to Buy ("Waiting for approval"), purchase failures, and refunds ("Refunded").

## Undo

- Remove the opt-in from `.env.forge-dev`, then restart Metro.
- On FORGE DEV:
  - delete both functions (`supabase functions delete <name> --project-ref <FORGE DEV ref>`);
  - remove their secrets;
  - run [`forge_entitlements_rollback.sql`](../../supabase/drafts/forge_entitlements_rollback.sql).
- Disable the webhook in RevenueCat.
