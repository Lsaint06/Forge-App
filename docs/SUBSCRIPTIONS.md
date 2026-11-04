# Forge membership (subscriptions)

**Status (2026-11-04): Phase 9.1, the subscription foundation, is implemented in the Phase 9 worktree, uncommitted, awaiting the founder's review.** Nothing is wired into the app: no gate, no paywall, no purchase SDK, no network call, nothing changes on screen. The entitlement SQL is a draft that has never been applied to any project. History and decisions: [`docs/audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md`](audits/PHASE_9_0_SUBSCRIPTION_AUDIT.md) and [`docs/execution/PHASE_9_WINDOWS_HANDOFF.md`](execution/PHASE_9_WINDOWS_HANDOFF.md).

## The approved product

- **One plan:** an auto-renewable monthly subscription, **$6.99 USD a month**, with **Apple's seven-day free introductory trial** for eligible subscribers. No annual plan, no tiers, no permanent free tier. One subscription or trial unlocks everything.
- **Apple bills; Forge's server decides access.** RevenueCat validates the store's transactions; Forge's Supabase backend keeps one verified record per account; the app trusts only that record.
- **A one-time, read-only personalized Forge Path preview** before the paywall, only while the account has never had a trial or a subscription.
- **Access ends at the verified expiration, and the athlete's data is always kept.** Cancelling never ends access early. There is no offline window and no extra time to finish a workout (founder decisions F4 and F5 are open: until they are made there is none). A workout in progress stays saved on the phone and resumes after renewing.

## Trust chain

```
Apple App Store (bills; source of truth)
  → RevenueCat (validates; App User ID = the Supabase user ID)
  → Forge Edge Functions (Phase 9.3; read RevenueCat with a server-only secret)
  → public.forge_entitlements (one row per account; only the service role writes)
  → forge_entitlement() (the account's own row and the server's clock)
  → this phone's cache (per account) → entitlementAccess() → entry state (Phase 9.4)
```

Never trusted for access: the purchase SDK's own answers (in Expo Go it only mocks them), any local flag, the device clock on its own, or anything the app sends to the server.

## Modules (Phase 9.1)

| File | Role |
| --- | --- |
| [`src/billing/plan.ts`](../src/billing/plan.ts) | The approved plan, and `membershipProductProblems`: a store product other than the $6.99 monthly membership with a free week (an annual plan, another trial, a paid intro) is refused before any paywall describes it |
| [`src/billing/entitlement.ts`](../src/billing/entitlement.ts) | The entitlement model and the server's answer format; `parseEntitlementResponse` checks every answer field by field and as a whole, and refuses anything malformed or inconsistent |
| [`src/billing/access.ts`](../src/billing/access.ts) | `entitlementAccess`: the one, pure access decision; `trustedNow`; `previewAllowed` |
| [`src/billing/cache.ts`](../src/billing/cache.ts) | The account-safe cache of the server's latest answer; one instance per secure store |
| [`src/billing/secure-cache.ts`](../src/billing/secure-cache.ts) | The app's one cache, on the secure store (Keychain/Keystore), chunked like the account session |
| [`src/billing/provider.ts`](../src/billing/provider.ts) | Interfaces: `PurchaseProvider` (the store; RevenueCat's SDK in Phase 9.3) and `EntitlementVerifier` (Forge's server) |
| [`src/billing/service.ts`](../src/billing/service.ts) | The flows: purchase, restore, verify, sign-in, sign-out. Only the server's checked answer about the asking account reaches the cache |
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
| `tests/billing-safety.test.ts` | Membership code can't reach training data or destructive calls; the decision can't see store answers; nothing in the app uses it yet; no purchase SDK; no secrets |

Test doubles: [`tests/billing-fixture.ts`](../tests/billing-fixture.ts) (secure store in memory, RevenueCat records, Forge's server, a store that settles purchases or only pretends).

## Before the next stages

- **Founder decisions still open:** F3 (one Apple subscription across Forge accounts), F4 and F5 (no windows meanwhile), F7 (Billing Grace Period), F10 (server-side sync enforcement), F12 (complimentary access for the founder, testers and App Review), F16 (product ID); and the production environment rule above.
- **To verify in the 9.3 sandbox:** how RevenueCat's `TEMPORARY_ENTITLEMENT_GRANT` (an outage grant RevenueCat issues itself) appears in the customer record, and whether it may count at all: it would be a window Forge didn't grant.
- **Integration (Opus 1 reviews each diff):** X1 `entryState` takes the decision as a fact (9.4); X5 the session calls `signedIn` / `signedOut`; X4 account deletion calls `signedOut` and stays reachable; X2 the draft's promotion after Opus 1's `5f07c9b` (which changes `supabase/verify/schema_checks.sql` and `tests/verify-sql.test.ts`, untouched here).
