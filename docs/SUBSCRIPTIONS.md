# Forge membership (subscriptions)

**Status (2026-11-06): Phase 9.3 (RevenueCat, Forge Premium after the reveal, redesigned to the founder's "Reference 3" direction, and the membership Edge Functions) is implemented and tested behind a development-only gate ([below](#phase-93-forge-premium-in-development-builds)).** Every build that doesn't opt in, production included, behaves exactly as before: no purchase SDK is loaded, no paywall shows, nothing is sold. The Edge Functions and the entitlement SQL are drafts deployed nowhere, so no build can confirm a membership yet, and no real or sandbox purchase has been made. Phase 9.1, the foundation, is `e9d3e59`; Phase 9.2's onboarding ([`docs/ONBOARDING.md`](ONBOARDING.md)) leads into the paywall through `afterReveal`. History and decisions: [`docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md`](audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md) and [`docs/execution/PHASE_9_WINDOWS_HANDOFF.md`](execution/PHASE_9_WINDOWS_HANDOFF.md).

## The approved product

- **One plan:** an auto-renewable monthly subscription, **$6.99 USD a month**, with **Apple's seven-day free introductory trial** for eligible subscribers. No annual plan, no tiers, no permanent free tier. One subscription or trial unlocks everything.
- **Apple bills; Forge's server decides access.** RevenueCat validates the store's transactions; Forge's Supabase backend keeps one verified record per account; the app trusts only that record.
- **A one-time, read-only personalized Forge Path preview** before the paywall, only while the account has never had a trial or a subscription.
- **Access ends at the verified expiration, and the athlete's data is always kept.** Cancelling never ends access early. There is no offline window and no extra time to finish a workout (founder decisions F4 and F5 are open: until they are made there is none). A workout in progress stays saved on the phone and resumes after renewing.

## Trust chain

```
Apple App Store (bills; source of truth)
  → RevenueCat (validates; App User ID = the Supabase user ID)
  → Forge Edge Functions (Phase 9.3 drafts, deployed nowhere; read RevenueCat with a server-only secret)
  → public.forge_entitlements (one row per account; only the service role writes)
  → forge_entitlement() (the account's own row and the server's clock)
  → this phone's cache (per account) → entitlementAccess() → entry state (Phase 9.4)
```

Never trusted for access: the purchase SDK's own answers (in Expo Go and with RevenueCat's Test Store they are simulated), any local flag, the device clock on its own, or anything the app sends to the server.

## Modules (Phase 9.1)

| File | Role |
| --- | --- |
| [`src/billing/plan.ts`](../src/billing/plan.ts) | The approved plan, and `membershipProductProblems`: a store product other than the $6.99 monthly membership with a free week (an annual plan, another trial, a paid intro) is refused before any paywall describes it |
| [`src/billing/entitlement.ts`](../src/billing/entitlement.ts) | The entitlement model and the server's answer format; `parseEntitlementResponse` checks every answer field by field and as a whole, and refuses anything malformed or inconsistent |
| [`src/billing/access.ts`](../src/billing/access.ts) | `entitlementAccess`: the one, pure access decision; `trustedNow`; `previewAllowed` |
| [`src/billing/cache.ts`](../src/billing/cache.ts) | The account-safe cache of the server's latest answer; one instance per secure store |
| [`src/billing/secure-cache.ts`](../src/billing/secure-cache.ts) | The app's one cache, on the secure store (Keychain/Keystore), chunked like the account session |
| [`src/billing/provider.ts`](../src/billing/provider.ts) | Interfaces: `PurchaseProvider` (the store; RevenueCat's SDK in Phase 9.3) and `EntitlementVerifier` (Forge's server) |
| [`src/billing/service.ts`](../src/billing/service.ts) | The flows: purchase, restore, verify, sign-in, sign-out. Only the server's checked answer about the asking account reaches the cache. `followAccount` takes the session's changes one at a time: the store's log-out and log-in in turn, and an answer that arrives once its account has gone is not kept |
| [`supabase/functions/_shared/entitlement.ts`](../supabase/functions/_shared/entitlement.ts) | Server contracts, no imports (Deno and Node run the same file): RevenueCat normalization, webhook verification, webhook events |
| [`supabase/drafts/`](../supabase/drafts/) | The draft migration, its rollback and its read-only checks |

## The access decision

`entitlementAccess(userId, held, now)`:

| Server status | Access | Notes |
| --- | --- | --- |
| No record, or `none` with no first membership | **denied: `never`** | Onboarding, the Forge Path preview and the paywall (`previewAllowed`) |
| `trial`, `active` (renewing or cancelled) | **granted** until `accessUntil` | Cancelling (`renews: false`) keeps access to the period's end |
| `grace` | **granted** until the end of Apple's billing grace period | Only if Apple grants one (founder decision F7, App Store Connect) |
| `billing_retry` | denied: `billingIssue` | Apple is retrying the charge |
| `expired`, or `none` after a membership (moved to another account) | denied: `expired` | No preview again |
| `revoked` | denied: `revoked` | Refunded or revoked through Apple |
| In force, but the period ended since the answer | renewing: **unverified: `renewal`**; otherwise denied | Only the server can say whether it renewed; no access meanwhile |
| No answer for this account on this phone | unverified: `missing` | Another account's answer never counts |
| The phone's clock set back since the answer | unverified: `clock` | Until the server answers again |

- **Granted exactly while** the status is in force **and** the server-anchored time is before `accessUntil`. Tests sweep the moments after the end (1 ms, 1 min, 1 h, 12 h, 72 h, 30 days): none grants access.
- **Time is the server's.** `trustedNow` = the server's clock at its answer plus the time this phone's clock has run since. A phone clock that is wrong but steady changes nothing. A clock set back more than 5 minutes (`CLOCK_TOLERANCE_MS`) below the latest reading makes the answer unusable; within 5 minutes, time never runs backwards (the latest reading, `checkedAt`, is kept).
- **The preview** is allowed only for `denied: never`: the server says this account never had a trial or subscription. The server's `first_entitled_at` is never cleared once set.
- If the founder later approves an offline or workout window (F4, F5), `entitlementAccess` is the one place to add it, with its tests.

## The cache

- One entry per account, under `forge.entitlement.<account ID>` in the secure store; only Supabase user IDs make keys. Each entry also names its account and is checked against it on every read.
- Only answers that passed `parseEntitlementResponse` are written, and every read checks them again: anything unreadable, altered or another account's is discarded, and then only the server can grant access.
- An older answer arriving late never replaces a newer one. There is one cache per secure store, whoever asks for it, and its operations run one at a time, so a slow write can't bring back a replaced answer.
- The newest answer per account is also kept in memory. When the secure store refuses a write (a locked phone), this run still decides from the newer answer, and the older stored answer is removed, so a restart can't use it either.
- `noteClock` keeps the latest reading of the phone's clock (at most once a minute; never backwards).
- `forget` on sign-out and account deletion. Training data never lives here, and nothing here touches it.
- **Known limits (accepted in the audit, 8.9):** a jailbroken or patched phone could forge a consistent entry, or keep its clock stopped while offline. If the secure store refuses both the write and the removal, a restart can read the older answer until the server answers again: the same as a phone that never saw the change. The next server answer ends each of these, and cloud features get server-side enforcement in Phase 9.4 if the founder approves F10.

## Server contracts

**The answer** (`forge_entitlement()`, and the `entitlement-refresh` Edge Function in 9.3): `{ user_id, server_now, entitlement }`, times in milliseconds since the epoch; `entitlement` is null when the account has no record. Fields: `status`, `product_id`, `environment`, `period_type`, `purchased_at`, `expires_at`, `grace_expires_at`, `access_until`, `will_renew`, `billing_issue_at`, `revoked_at`, `first_entitled_at`, `refreshed_at`.

**RevenueCat's customer record → the row** (`normalizeSubscriber`, from `GET /v1/subscribers/{app_user_id}` read with the secret key):

- Counts only the approved product IDs (F16; passed in by the function), sold in the App Store (`store: app_store`), bought by the Apple Account itself (`ownership_type: PURCHASED`; Family Sharing stays off, F8), with a known period type. Promotional grants, other stores and other products never put a membership in force.
- **Environments:** FORGE DEV accepts only sandbox purchases. **Production accepts production and sandbox purchases**, because App Review and TestFlight buy in Apple's sandbox even in the production app (Apple's advice); the record keeps which. *To confirm with the founder before 9.3.*
- Status as of RevenueCat's own request time: a refund of the current period → `revoked`; before the period's end → `trial` or `active`; after it, inside Apple's grace period → `grace`; a billing issue without grace → `billing_retry`; otherwise `expired`. Refunds and billing issues from earlier periods don't count.
- `first_entitled_at` = the earliest original purchase. A record that can't be read is refused, so the last good row stays.

**Webhooks** (`verifyWebhook`, `webhookEvent`): genuine only with the configured `Authorization` header **and** a valid `X-RevenueCat-Webhook-Signature` (`t=<unix seconds>,v1=<HMAC-SHA256 hex>` over `<t>.<raw body>`, compared in constant time) signed within 5 minutes; without both secrets configured nothing is accepted. An event only names the Forge accounts to refresh (both sides of a `TRANSFER`; RevenueCat's anonymous IDs left out): each is refreshed from RevenueCat, never from the event's fields. Retries reuse the event ID: recorded once in `forge_entitlement_events`.

## Draft database objects

[`supabase/drafts/forge_entitlements.sql`](../supabase/drafts/forge_entitlements.sql) (never applied; outside `supabase/migrations/` so no tool applies it by accident):

- `forge_entitlements`: one row per account, deleted only with the account (cascade). Checks enforce the same rules as the app's parser.
- `forge_entitlements_guard` (before update): an older reading of the store never replaces a newer one, a row never moves to another account, and `first_entitled_at` is never cleared and keeps the earliest time.
- `forge_entitlement_events`: webhook deliveries, once each; only the account's ID is kept (and goes with the account).
- Privileges set explicitly, the same on Supabase's earlier and 2026 defaults: `authenticated` reads its own row (row level security; never an anonymous sign-in); `anon` gets nothing; the service role reads, adds and updates, never deletes.
- `forge_entitlement()`: security invoker; the caller's own row and `server_now`.

**Promotion** (after Opus 1's review and the founder's approval): copy it into `supabase/migrations/`, numbered after the latest migration there; add its objects to `supabase/verify/schema_checks.sql` (its query 6 lists every public function); apply to FORGE DEV first, production only with explicit approval. Rollback: [`forge_entitlements_rollback.sql`](../supabase/drafts/forge_entitlements_rollback.sql). Read-only checks: [`forge_entitlements_checks.sql`](../supabase/drafts/forge_entitlements_checks.sql).

<a id="phase-93-forge-premium-in-development-builds"></a>
## Phase 9.3: Forge Premium in development builds

**The gate** ([`src/billing/config.ts`](../src/billing/config.ts)). Membership runs only in a development build (`__DEV__`) that names its environment (`EXPO_PUBLIC_FORGE_ENV=development`) and opts in (`EXPO_PUBLIC_FORGE_MEMBERSHIP=development`, in `.env.forge-dev`, which FORGE Dev's Metro reads). Anywhere else:

- the purchase SDK is never loaded;
- the reveal ends with **Enter Forge**, as in 9.2;
- You → Account shows the free-plan card it always had;
- `/membership` says "Not in this build".

A release build can't opt in, so a RevenueCat Test Store key (which RevenueCat makes crash release builds on purpose) can never reach one.

**Keys** (public SDK keys only; a secret `sk_` key is refused):

| Variable | Use |
| --- | --- |
| `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` (`appl_`) | FORGE Dev's App Store app: Apple's sandbox, in an iPhone development build only |
| `EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY` (`test_`) | RevenueCat's Test Store: simulated purchases. The only store Expo Go can use, and Android's only store (Google Play billing isn't approved) |
| `EXPO_PUBLIC_TERMS_OF_USE_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL` | The paywall's links (HTTPS only). Until F15 provides them, the paywall says they're required before release |

When a build has no usable store, the paywall shows **Forge Premium isn't available here** with the reason (`expoGoKey`, `platform`, `noKey`, `secretKey`, `wrongKey`) and, in setup, **Continue without membership**.

**The SDK:** `react-native-purchases` **10.16.0**, pinned exactly (the lockfile gains four packages; nothing else changed). Not 11.x: 11.0.1's iOS pod (`PurchasesHybridCommon` 20.4.0) wasn't on the CocoaPods CDN, and RevenueCat advises Expo apps to stay on 10.x. No `react-native-purchases-ui`: Forge draws its own paywall. Only `src/billing/runtime.ts` loads the SDK, lazily, once membership is on. CocoaPods trunk becomes read-only on 2 December 2026, so later RevenueCat iOS releases may need Swift Package Manager: check before upgrading.

| File | Role |
| --- | --- |
| [`src/billing/config.ts`](../src/billing/config.ts) | The gate and the keys (pure) |
| [`src/billing/offer.ts`](../src/billing/offer.ts) | `membershipOffer`: what the paywall may say about a store product. StoreKit's localized price, the period, the free week only when Apple says the account is eligible, the action (**Start free trial** or **Subscribe**), the renewal and cancellation terms. Any product but the approved plan is refused |
| [`src/billing/revenuecat.ts`](../src/billing/revenuecat.ts) | `revenueCatProvider`: the `PurchaseProvider` over RevenueCat's SDK. App User ID = the Supabase user ID: configured once, `logIn` when the SDK's own customer isn't the account (checked before every purchase and restore), `logOut` on sign-out. The product comes from RevenueCat's current offering (its monthly package): no product ID is written in the app (F16) |
| [`src/billing/verifier.ts`](../src/billing/verifier.ts) | `serverVerifier`: asks `entitlement-refresh`, reads `forge_entitlement()`, and names a failure offline, auth or unavailable |
| [`src/billing/paywall.ts`](../src/billing/paywall.ts) | The paywall's states and words, and You → Account's lines, from the server's decision (pure) |
| [`src/billing/runtime.ts`](../src/billing/runtime.ts) | The one place that touches React Native, the SDK and Supabase: the gate's values, one provider, the dependencies, following sign-in and sign-out (`watchMembershipSession`, through `followAccount`), Apple's subscription settings |
| [`src/screens/membership/`](../src/screens/membership/) | `Premium.tsx` (the composition: the frame and its floating action, the light, the headline, the pass, the included tiles, the plan card, the free-week timeline, the terms, the forged lockup and the decision's parts), `Paywall.tsx` (`PaywallScreen`: content, the decision and the floating action per state), `MembershipScreen.tsx` (the setup step and `/membership`), `usePaywall.ts`, `StatusCard.tsx` (You → Account), `Preview.tsx` |
| [`src/domain/onboarding/premium.ts`](../src/domain/onboarding/premium.ts) | What the step says, pure: `premiumPath` (the athlete's Forge Path as the reveal showed it: its family, its shape and each training day's focus and size, never its exercises), `premiumStory` (the headline and its accent) and `PREMIUM_KEEPS` (what the membership includes: a title and one sentence each, claiming nothing Forge doesn't do). Setup hands the path in, so membership screens never read the athlete's data |

**The paywall** (redesigned 2026-11-06 to the founder's "Reference 3" direction: spacious, one centerpiece, a designed plan-selection area; screen E′ after the reveal, and `/membership` from You → Account) is a product presentation in two acts, in its own light: cool from above, the forge's warmth behind the pass, two faint beams.

- **The invitation** (it scrolls):
  - the FORGE wordmark over PREMIUM, then a two-line headline in Emergence's style with the athlete's own number in Forge's accent: **ALL 8 WEEKS / ALL OF FORGE**, **EVERY WEEK / ALL OF FORGE** for an ongoing path, or **ONE MEMBERSHIP / ALL OF FORGE** without one (`/membership`). Then one sentence.
  - **The pass**, the centerpiece: the athlete's Forge Path ("Built for Jordan", "Intermediate Strength", "4 days a week · 32 sessions · Sunday rest"), then each training day by its focus and its number of exercises ("Mon · Lower A · Squat Strength · 6 exercises"), closed by "Every exercise, set and rep comes with Forge Premium". It has a steel-to-ember edge, the forge's warmth in its corner and a faint wordmark. Arriving from the reveal, one slow glint crosses it.
  - **Included in Forge Premium:** four quiet tiles, in the founder's words (2026-11-07): **Personalized Training**, **Workout Tracking**, **Performance Analytics** and **Nutrition Tracking**, each with one sentence. Two by two (one by one on a narrow phone with large text). In each row the sentences start level, however the titles wrap.
- **Your membership** (the decision, part of the composition):
  - The plan as one selected brushed-steel card: "Monthly", "Renews monthly · cancel anytime", and StoreKit's localized price at 36 pt (32 on a compact phone), the most prominent price on the screen. A small **7 DAYS FREE** mark appears only when Apple says the account is eligible. There is one plan, so there is no unselected card.
  - When eligible, how the free week runs: **Today** your free week begins; **After 7 days** $6.99, then monthly; **Anytime** cancel in Settings.
  - The action, the screen's one ember fill: **Start free trial**, or **Subscribe** when not eligible (and then nothing mentions a trial).
  - One quiet row: **Not now** (setup only; read out as "Not now: continue without membership"), **Restore**, **Terms**, **Privacy**. The legal links keep to one group, so a narrow line never strands a separator.
  - The terms in full.
- **The floating action:** until the decision scrolls into view, a copy of it waits at the bottom: the price ("$6.99 /month after 7 days free", 22 pt), the action, and **Not now · Restore**. It steps aside exactly where the decision's own action arrives, so one action is on screen at a time. It can be pressed only once it has appeared (arriving from the reveal it waits, then fades in, so a second tap on **Continue** lands on nothing), and not once it starts to step aside. Screen readers meet only the decision itself. Pressing it acts and brings the decision into view.
- **From the reveal:** the reveal fades; the wordmark, the headline, the sentence and the pass arrive in turn, then the floating action, and one glint crosses the pass. With reduced motion, the step simply appears.
- **What the preview shows of the program** (founder rule, 2026-11-06): before a membership, the reveal and the pass show each training day, its focus and how many exercises it holds. They never show an exercise, a set, a rep or an effort. The focus is the session's authored emphasis, so some strength paths name a main lift ("Squat Strength"). With no gate yet, Forge Paths' library still shows every program in full after setup (Phase 9.4).
- **Before anything is bought:**
  - "Forge Premium · auto-renewing, every month", heading the terms;
  - when the Apple Account is charged;
  - cancelling in Settings › Apple Account › Subscriptions at least 24 hours before a renewal;
  - that cancelling keeps Forge Premium to the end of the period, and training is always kept;
  - Terms of Use and Privacy Policy;
  - **Restore purchases**.
- **States:**
  - loading (a plan card placeholder of the same size);
  - unavailable (with Try again when it can help, and in setup **Continue without membership** as a button, since it is then the way on);
  - ready;
  - purchasing ("Opening the App Store…"), restoring, and verifying ("Confirming your membership…");
  - waiting for approval (Ask to Buy) and not confirmed yet, both with **Check again**;
  - member (**Enter Forge**).
- **Nothing can be pressed twice** while Apple or the server answers. The action, Restore and Not now stay in place but wait, and the on-screen Back waits too. A purchase is marked under way the moment it's tapped, so a second quick tap does nothing. **Known issue (Phase 9.4):** Android's hardware Back, and the iOS back swipe on `/membership`, don't wait yet. Leaving then loses only the screen: the answer still reaches Forge's server and this phone, and the paywall or the card shows it next time.
- **The confirmation:** the FORGE lockup, and the dates from the server's decision. Its title depends on how the membership arrived:
  - "Your free week has started" after a purchase;
  - "Your membership is restored" after a restore;
  - "You're a Forge Premium member" for a membership already held.

  A purchase or restore just confirmed cools the letters from molten to steel once, using the launch intro's own letters, with one success haptic. A membership already held is simply shown.
- **Only the server opens Forge.**
  - A purchase, simulated or real, changes nothing until `forge_entitlement()` grants it.
  - A Test Store purchase never counts on the server (only App Store purchases do), so it ends with "Nothing was sold".
  - A restore the server can't confirm yet waits with **Check again**.
  - A member opening the paywall on a new phone is welcomed back after one server read, and never offered the membership again.
- **Not you? Sign out** is the setup account chip.
- **Not now** (continue without membership) finishes setup without one. The approved product has no free tier, so what declining leads to in a release build is a founder decision. With no gate yet, it opens Forge as today.

**You → Account:** the card first shows what this phone holds for the account (never another account's, and an empty phone isn't an answer), then the server's answer:

- free trial, member, ending, payment issue, ended, refunded or not a member;
- or not confirmed, with the reason and **Check again**.

**Manage subscription** opens Apple's subscription settings.

**Development previews** (in every development build, like the onboarding preview; they sell nothing, load no SDK and call no server):

- **Onboarding with Forge Premium:** You → Preferences → Development → **Preview onboarding with Forge Premium (development only)** (`/onboarding-preview?premium=1`). It runs the whole first-time journey, then Forge Premium after the reveal, simulated, and ends on Home. Nothing is saved.
- **Every state:** **Preview Forge Premium (development only)** (`/membership-preview`) uses a stand-in $6.99 product that has a free week.
  - `membership-preview?state=<name>` opens one state: ready, ineligible, loading, unavailable, purchasing, restoring, verifying, pending, unconfirmed, unconfirmed-restore, error, restored-none, member, member-active, restored or held.
  - `&path=none` shows it without a Forge Path, as `/membership` does.

**Which account a review can use.** Forge Premium itself runs only against FORGE DEV (`.env.forge-dev`). FORGE DEV has no Google sign-in, and none of production's accounts; they must never be copied there. So an existing Google account can review only the previews:

- Use production (Expo Go's `.env`, in a PowerShell window where `.env.forge-dev` was never loaded: variables already set in the shell win over `.env`).
- Start Metro through the tunnel (`npm start -- --tunnel`) and open Forge from the tunnel's QR code. Supabase never returns a sign-in to an IP address, so Expo Go on the local network hides Continue with Google (README → Testing in Expo Go).

The real step after the reveal needs a disposable FORGE DEV account.

**Expo Go** (RevenueCat 10.16's browser mode) has these limits:

- only a Test Store key works (`appl_` keys are refused);
- products can't be listed, so the offering's packages are used;
- subscription management can't open, so Apple's subscriptions page opens instead;
- Restore only re-reads the customer;
- intro eligibility is always unknown, so no free week is promised;
- purchases show RevenueCat's "Test Store Purchase" alert;
- the customer-update listener never fires, so the paywall re-checks on **Check again**.

**The Edge Functions** (drafts, deployed nowhere; [`supabase/functions/`](../supabase/functions/)):

| Function | Called by | Answers |
| --- | --- | --- |
| `entitlement-refresh` | the app, with the signed-in account's token | 200: `forge_entitlement()`'s answer after reading RevenueCat afresh. 401: no valid account. 405. 502: RevenueCat unreachable or unreadable; nothing is written and the last good row stays. 503: not configured, or Supabase failed |
| `entitlement-webhook` | RevenueCat | 200: processed, or a duplicate. 400: not a RevenueCat event. 401: wrong header, signature or time (one answer for all). 405. 413. 502/503: not processed, so RevenueCat retries |

- **Code:** the decisions are in `_shared/reconcile.ts` (pure, and tested against the draft in PGlite); the wire formats are in `_shared/rest.ts` (fetch only, 10 s per call).
- **Nothing leaks:** every reply is `no-store`, and no secret or body is logged or answered.
- **Webhooks:**
  - a webhook only names accounts, and each one is re-read from RevenueCat;
  - an event is marked processed only when every refresh succeeded;
  - retries are acknowledged without work.
- **Configuration:** checked on every request. Without all of it, every request gets 503 and nothing runs; only names are logged.

  | Variable | Set by |
  | --- | --- |
  | `REVENUECAT_SECRET_API_KEY` | Forge |
  | `FORGE_ENVIRONMENT` (`development` or `production`) | Forge |
  | `FORGE_MEMBERSHIP_PRODUCT_IDS` | Forge (F16) |
  | `REVENUECAT_WEBHOOK_AUTHORIZATION`, `REVENUECAT_WEBHOOK_SIGNING_SECRET` | Forge, webhook only |
  | `SUPABASE_URL`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS` | Supabase (the legacy `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are fallbacks) |

  Requests made as the caller carry the publishable key, never the secret one.
- **Webhook deployment:** it is deployed with `verify_jwt = false`, because RevenueCat sends no Supabase token, and checks RevenueCat's Authorization header and HMAC signature itself. **HMAC signing is optional in RevenueCat and must be enabled**, or every delivery is refused.

**Not built (Phase 9.4 and later):**

- the hard gate (entry state, X1);
- the expired, billing-retry and grace screens;
- server-side sync enforcement (F10);
- the offer to start the revealed Forge Path after a purchase (F14);
- Google Play billing;
- a rate limit on refresh;
- deciding how `TEMPORARY_ENTITLEMENT_GRANT` counts.

Sandbox prerequisites and the verification script: [`docs/execution/PHASE_9_3_SANDBOX.md`](execution/PHASE_9_3_SANDBOX.md).

## Tests

All Node tests (`npm test`), nothing external:

| File | Proves |
| --- | --- |
| `tests/billing-access.test.ts` | Every status; cancellation keeps the period; no window after the end; server time against slow, fast or set-back phone clocks; the preview rule |
| `tests/billing-entitlement.test.ts` | Every server answer accepted and kept as it came; malformed or inconsistent answers refused; the approved plan; other store products refused |
| `tests/billing-cache.test.ts` | Per-account entries; tampered or unreadable entries discarded; late answers ignored; refused writes never bring back an older answer, before or after a restart; one shared cache; the clock reading; the write race |
| `tests/billing-service.test.ts` | A purchase grants access only through the server; Expo Go's pretend purchase grants nothing; failures; restore; account switching; offline to the exact end; refunds, even ones the phone couldn't store; **through every membership change, no Repository method or database call runs, and every SQLite table is unchanged** |
| `tests/billing-server.test.ts` | RevenueCat normalization; environments; webhook header, signature, tampering, replay; events |
| `tests/billing-schema.test.ts` | The draft in PGlite with Supabase's earlier and 2026 defaults: own-row reads, no client writes, the guard, checks, idempotency, cascade with account deletion, rollback, the checks file |
| `tests/billing-safety.test.ts` | Membership code can't reach training data or destructive calls; the decision can't see store answers; only the named app files use billing, each behind the gate; the SDK is pinned and only `runtime.ts` loads it; the functions' shared modules import only each other and read no environment; no secrets |
| `tests/billing-membership.test.ts` | The gate and the keys; the offer (price, period, the free week and its renewal line only when eligible, other products refused); the verifier's failures; the RevenueCat adapter against a fake SDK (configured once, sign-in and sign-out, a sign-out during a slow sign-in, the offering, every purchase outcome and error code, restore, the listener); following the account (an answer arriving after a sign-out or a switch isn't kept; the store's log-out and log-in take turns); every paywall flow through the 9.1 doubles, including a restore not confirmed yet, a member on a new phone and how each member arrived; You → Account's lines |
| `tests/billing-functions.test.ts` | Both Edge Functions against the draft in PGlite with RevenueCat faked: tokens, refresh, outages (502, the last row kept), ordering, the webhook's header, signature and freshness, retries, transfers, environments, products, deleted accounts, configuration, and each secret going only where it belongs |
| `tests/ui/membership.test.tsx` | The paywall as the athlete sees it: the price the most prominent (here and in the floating action), the free week only with eligibility, the founder-approved words of what's included, the legal links, every state (loading included); nothing pressed twice, and two quick taps buy once (`usePaywall` against the fake store); the athlete's Forge Path as the pass, or the membership; the pass never naming an exercise, set or rep for any of the 18 Forge Paths; one action on screen at a time (the floating copy steps aside where the decision's action arrives, and is hidden from screen readers); the way on without a membership; the confirmation's haptic. The membership step only when Setup hands one in, with the path and how it arrives, resumed, and a stale membership stage; the preview; You → Account's card with membership off and on |
| `tests/ui/premium-dock.test.tsx` | With motion on: the floating action can't be pressed while it waits or fades in, and stops being pressable the moment it steps aside |
| `tests/onboarding-journey.test.ts`, `tests/ui/onboarding-flow.test.tsx` | Before a membership, each training day shows only its focus and number of exercises (every Forge Path, every rest day), on screen too; Forge Premium retells the reveal's facts and claims nothing Forge doesn't do; the onboarding preview with Forge Premium ends on Home and saves nothing |

Test doubles: [`tests/billing-fixture.ts`](../tests/billing-fixture.ts) (secure store in memory, RevenueCat records and signed webhooks, Forge's server, a store that settles purchases or only pretends).

## Before the next stages

- **Founder decisions still open:**
  - F3: one Apple subscription across Forge accounts (RevenueCat's restore behaviour).
  - F4 and F5: there are no windows meanwhile.
  - F7: Billing Grace Period.
  - F9: the paywall's visual approval (the "Reference 3" redesign of 2026-11-06 awaits review).
  - Declining Forge Premium: the approved product has no free tier, so what **Not now** (continue without membership) leads to in a release build is open. Today it opens Forge, as nothing is gated.
  - F10: server-side sync enforcement.
  - F11: purchase testing in FORGE Dev.
  - F12: complimentary access for the founder, testers and App Review.
  - F15: Terms of Use, Privacy Policy and support URLs.
  - F16: the product ID.
  - The production environment rule above.
  - Not in the approved product: Google Play billing.
- **To verify in the sandbox** ([`docs/execution/PHASE_9_3_SANDBOX.md`](execution/PHASE_9_3_SANDBOX.md)):
  - how RevenueCat's `TEMPORARY_ENTITLEMENT_GRANT` (an outage grant RevenueCat issues itself) appears in the customer record, and whether it may count at all (it would be a window Forge didn't grant);
  - Supabase Auth's and PostgREST's exact answers to the functions;
  - that RevenueCat's webhooks are available on Forge's RevenueCat plan.
- **Integration (Opus 1 reviews each diff):**
  - X1: `entryState` takes the decision as a fact (9.4).
  - X5: the session drives `followAccount`. 9.3's `watchMembershipSession` does it in opted-in development builds, once a paywall or You → Account's card has opened. Doing it from launch belongs with the gate, as do Forge's own sign-outs that Supabase doesn't announce (offline, or after deleting the account): Engineer #1's sign-out signal (shared contract A9).
  - X4: account deletion tells membership (through that signal) and stays reachable.
  - X2: promoting the draft. Opus 1's `5f07c9b` (Phase 8.2 schema checks) is now in this branch's history, so promotion adds the draft's objects to his `supabase/verify/schema_checks.sql` and `tests/verify-sql.test.ts`.
