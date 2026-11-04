import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseEntitlementResponse } from "../src/billing/entitlement";
import {
  WEBHOOK_TOLERANCE_MS,
  acceptedEnvironments,
  normalizeSubscriber,
  subscriberUrl,
  verifyWebhook,
  webhookEvent,
  type EntitlementPolicy,
} from "../supabase/functions/_shared/entitlement";
import {
  A,
  B,
  DAY,
  HOUR,
  PRODUCT,
  POLICY,
  T0,
  answer,
  rcCustomer,
  rcSubscription,
  rowFor,
  type Sub,
} from "./billing-fixture";

// Phase 9.1: Forge's server contracts, before any Edge Function exists.
// RevenueCat's customer record becomes one row per account; only the
// approved product, bought in the App Store by the Apple Account itself, in
// an environment this project accepts, can put a membership in force. A
// webhook counts only with the configured header and a fresh signature.

const row = (subs: Record<string, Sub>, policy = POLICY, now = T0) =>
  rowFor(A, now, subs, policy);
const one = (sub: Sub, policy = POLICY) => row({ [PRODUCT]: sub }, policy);

test("no subscription on record: no membership", () => {
  assert.deepEqual(row({}), {
    user_id: A,
    status: "none",
    product_id: null,
    store: null,
    environment: null,
    period_type: null,
    purchased_at: null,
    expires_at: null,
    grace_expires_at: null,
    access_until: null,
    will_renew: false,
    billing_issue_at: null,
    revoked_at: null,
    first_entitled_at: null,
    source_event_id: null,
    refreshed_at: new Date(T0).toISOString(),
  });
});

test("the free week, a paid month, and a cancellation that keeps the period", () => {
  const trial = one({
    purchased: T0 - DAY,
    expires: T0 + 6 * DAY,
    trial: true,
  });
  assert.equal(trial.status, "trial");
  assert.equal(trial.period_type, "trial");
  assert.equal(trial.access_until, new Date(T0 + 6 * DAY).toISOString());
  assert.equal(trial.will_renew, true);
  assert.equal(trial.first_entitled_at, new Date(T0 - DAY).toISOString());
  assert.equal(trial.environment, "production");
  assert.equal(trial.store, "app_store");

  const paid = one({
    purchased: T0 - DAY,
    expires: T0 + 29 * DAY,
    original: T0 - 60 * DAY,
  });
  assert.equal(paid.status, "active");
  assert.equal(paid.first_entitled_at, new Date(T0 - 60 * DAY).toISOString());

  const cancelled = one({
    purchased: T0 - DAY,
    expires: T0 + 29 * DAY,
    unsubscribed: T0 - HOUR,
  });
  assert.equal(cancelled.status, "active");
  assert.equal(cancelled.will_renew, false);
  assert.equal(cancelled.access_until, new Date(T0 + 29 * DAY).toISOString());
});

test("after a failed renewal: Apple's grace period, then Apple's retries", () => {
  const base = {
    purchased: T0 - 31 * DAY,
    expires: T0 - DAY,
    billingIssue: T0 - DAY,
  };
  const grace = one({ ...base, grace: T0 + 15 * DAY });
  assert.equal(grace.status, "grace");
  assert.equal(grace.access_until, new Date(T0 + 15 * DAY).toISOString());
  assert.equal(grace.grace_expires_at, new Date(T0 + 15 * DAY).toISOString());
  assert.equal(grace.billing_issue_at, new Date(T0 - DAY).toISOString());

  const graceOver = one({ ...base, grace: T0 - HOUR });
  assert.equal(graceOver.status, "billing_retry");
  assert.equal(graceOver.access_until, null);

  const retry = one(base);
  assert.equal(retry.status, "billing_retry");
  assert.equal(retry.will_renew, true);

  // Apple gave up, or the athlete cancelled: it has expired.
  const gaveUp = one({ ...base, unsubscribed: T0 - HOUR });
  assert.equal(gaveUp.status, "expired");
  assert.equal(gaveUp.will_renew, false);

  // An issue Apple charged early for, before the period's end: still active.
  const early = one({
    purchased: T0 - 29 * DAY,
    expires: T0 + HOUR,
    billingIssue: T0 - HOUR,
    grace: T0 + 16 * DAY,
  });
  assert.equal(early.status, "active");
  assert.equal(early.access_until, new Date(T0 + 16 * DAY).toISOString());

  // A billing issue from an earlier period is over once a renewal went through.
  const recovered = one({
    purchased: T0 - DAY,
    expires: T0 + 29 * DAY,
    billingIssue: T0 - 3 * DAY,
  });
  assert.equal(recovered.status, "active");
  assert.equal(recovered.billing_issue_at, null);
});

test("expiry and refunds: no access, and the membership's start is kept", () => {
  const expired = one({ purchased: T0 - 31 * DAY, expires: T0 - DAY });
  assert.equal(expired.status, "expired");
  assert.equal(expired.access_until, null);
  assert.equal(expired.will_renew, false);
  assert.equal(
    expired.first_entitled_at,
    new Date(T0 - 31 * DAY).toISOString(),
  );

  const refunded = one({
    purchased: T0 - DAY,
    expires: T0 + 29 * DAY,
    refunded: T0,
  });
  assert.equal(refunded.status, "revoked");
  assert.equal(refunded.revoked_at, new Date(T0).toISOString());
  assert.equal(refunded.access_until, null);

  // A refund of an earlier period, then a new subscription: in force.
  const again = one({
    purchased: T0 - DAY,
    expires: T0 + 29 * DAY,
    refunded: T0 - 40 * DAY,
  });
  assert.equal(again.status, "active");
  assert.equal(again.revoked_at, null);
});

test("only the approved product, bought by this Apple Account in the App Store, counts", () => {
  const sub = { purchased: T0 - DAY, expires: T0 + 29 * DAY };
  for (const [name, subs] of [
    ["another product (an annual plan)", { "forge.membership.annual": sub }],
    ["a promotional grant", { [PRODUCT]: { ...sub, store: "promotional" } }],
    ["another store", { [PRODUCT]: { ...sub, store: "play_store" } }],
    ["Family Sharing", { [PRODUCT]: { ...sub, ownership: "FAMILY_SHARED" } }],
    [
      "an unknown period type",
      { [PRODUCT]: { ...sub, periodType: "prepaid" } },
    ],
  ] as [string, Record<string, Sub>][])
    assert.equal(row(subs).status, "none", name);
  // A product named like an object's built-in property isn't a product.
  assert.equal(
    row(
      {},
      {
        productIds: ["constructor", "__proto__"],
        environments: ["production"],
      },
    ).status,
    "none",
  );
});

test("sandbox purchases count in production (App Review, TestFlight), never real ones in FORGE DEV", () => {
  assert.deepEqual(acceptedEnvironments("production"), [
    "production",
    "sandbox",
  ]);
  assert.deepEqual(acceptedEnvironments("development"), ["sandbox"]);
  const dev: EntitlementPolicy = {
    productIds: [PRODUCT],
    environments: acceptedEnvironments("development"),
  };
  const sandbox = {
    purchased: T0,
    expires: T0 + 7 * DAY,
    trial: true,
    sandbox: true,
  };
  const real = { ...sandbox, sandbox: false };
  assert.equal(one(sandbox).status, "trial");
  assert.equal(one(sandbox).environment, "sandbox");
  assert.equal(one(sandbox, dev).status, "trial");
  assert.equal(one(real, dev).status, "none");
});

test("the latest-ending subscription is current; the earliest start is kept", () => {
  const policy: EntitlementPolicy = {
    productIds: [PRODUCT, "forge.membership.monthly.v2"],
    environments: ["production"],
  };
  const r = row(
    {
      [PRODUCT]: {
        purchased: T0 - 90 * DAY,
        expires: T0 - 60 * DAY,
        original: T0 - 120 * DAY,
      },
      "forge.membership.monthly.v2": {
        purchased: T0 - DAY,
        expires: T0 + 29 * DAY,
      },
    },
    policy,
  );
  assert.equal(r.status, "active");
  assert.equal(r.product_id, "forge.membership.monthly.v2");
  assert.equal(r.first_entitled_at, new Date(T0 - 120 * DAY).toISOString());
});

test("a record that can't be read is refused, so the last good row stays", () => {
  const sub = rcSubscription({ purchased: T0 - DAY, expires: T0 + 29 * DAY });
  const customer = (s: Record<string, unknown>) => {
    const c = rcCustomer(T0, {});
    (c.subscriber.subscriptions as Record<string, unknown>)[PRODUCT] = s;
    return c;
  };
  const refused: [string, unknown][] = [
    ["not an object", null],
    ["no subscriber", { request_date_ms: T0 }],
    ["no request time", { ...rcCustomer(T0, {}), request_date_ms: undefined }],
    [
      "request time as text",
      { ...rcCustomer(T0, {}), request_date_ms: String(T0) },
    ],
    ["no subscriptions", { request_date_ms: T0, subscriber: {} }],
    ["no expiry", customer({ ...sub, expires_date: null })],
    ["an unreadable expiry", customer({ ...sub, expires_date: "next month" })],
    [
      "a date without a zone",
      customer({ ...sub, purchase_date: "2026-11-03T12:00:00" }),
    ],
    [
      "no original purchase",
      customer({ ...sub, original_purchase_date: null }),
    ],
    ["sandbox unknown", customer({ ...sub, is_sandbox: "no" })],
    [
      "a subscription that isn't one",
      customer("monthly" as unknown as Record<string, unknown>),
    ],
  ];
  for (const [name, body] of refused)
    assert.equal(normalizeSubscriber(A, body, POLICY).ok, false, name);
  assert.equal(
    normalizeSubscriber("user-a", rcCustomer(T0, {}), POLICY).ok,
    false,
  );
  // Fractions of a second and offsets are read exactly.
  const precise = normalizeSubscriber(
    A,
    customer({ ...sub, expires_date: "2026-12-03T13:00:00.123456+01:00" }),
    POLICY,
  );
  assert.ok(precise.ok);
  assert.equal(precise.value.expires_at, "2026-12-03T12:00:00.123Z");
});

test("every row the server writes reads back as an answer the app accepts", () => {
  const subs: Sub[] = [
    { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true },
    { purchased: T0 - DAY, expires: T0 + 29 * DAY, unsubscribed: T0 },
    {
      purchased: T0 - 31 * DAY,
      expires: T0 - DAY,
      billingIssue: T0 - DAY,
      grace: T0 + DAY,
    },
    { purchased: T0 - 31 * DAY, expires: T0 - DAY, billingIssue: T0 - DAY },
    { purchased: T0 - 31 * DAY, expires: T0 - DAY },
    { purchased: T0 - DAY, expires: T0 + 29 * DAY, refunded: T0 },
    {
      purchased: T0 - 29 * DAY,
      expires: T0 + HOUR,
      billingIssue: T0 - HOUR,
      grace: T0 + 16 * DAY,
    },
  ];
  for (const sub of subs) {
    const r = one(sub);
    const parsed = parseEntitlementResponse(answer(A, T0, r));
    assert.ok(parsed.ok, `${r.status}: ${parsed.ok ? "" : parsed.problem}`);
    assert.equal(parsed.value.entitlement.status, r.status);
  }
});

test("RevenueCat's customer address encodes the App User ID", () => {
  assert.equal(
    subscriberUrl(A),
    `https://api.revenuecat.com/v1/subscribers/${A}`,
  );
  assert.equal(
    subscriberUrl("$RCAnonymousID:a/b"),
    "https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3Aa%2Fb",
  );
});

// ---- Webhooks -------------------------------------------------------------------

const SECRETS = {
  authorization: "Bearer forge-test-header",
  signingSecret: "test-signing-secret-not-real",
};
const BODY = JSON.stringify({
  api_version: "1.0",
  event: {
    id: "evt-1",
    type: "INITIAL_PURCHASE",
    app_user_id: A,
    original_app_user_id: A,
    aliases: [A, "$RCAnonymousID:8b1e"],
    environment: "SANDBOX",
    event_timestamp_ms: T0,
    product_id: PRODUCT,
    period_type: "TRIAL",
  },
});

/** RevenueCat's signature, computed independently (node:crypto). */
function sign(body: string, seconds: number, secret = SECRETS.signingSecret) {
  const v1 = createHmac("sha256", secret)
    .update(`${seconds}.${body}`)
    .digest("hex");
  return `t=${seconds},v1=${v1}`;
}
const NOW_S = Math.floor(T0 / 1000);
const check = (
  request: Partial<Parameters<typeof verifyWebhook>[0]>,
  now = T0,
  secrets = SECRETS,
) =>
  verifyWebhook(
    {
      authorization: SECRETS.authorization,
      signature: sign(BODY, NOW_S),
      body: BODY,
      ...request,
    },
    secrets,
    now,
  );

test("a genuine webhook passes, as text or as raw bytes", async () => {
  assert.deepEqual(await check({}), { ok: true });
  assert.deepEqual(await check({ body: new TextEncoder().encode(BODY) }), {
    ok: true,
  });
  // Within the tolerance either way.
  assert.deepEqual(await check({}, T0 + WEBHOOK_TOLERANCE_MS), { ok: true });
  assert.deepEqual(await check({}, T0 - WEBHOOK_TOLERANCE_MS), { ok: true });
  // A signature in capitals, and a second signature during a rotation.
  const v1 = sign(BODY, NOW_S).split("v1=")[1]!;
  assert.deepEqual(
    await check({ signature: `t=${NOW_S},v1=${v1.toUpperCase()}` }),
    { ok: true },
  );
  assert.deepEqual(
    await check({ signature: `t=${NOW_S},v1=${"0".repeat(64)},v1=${v1}` }),
    { ok: true },
  );
});

test("a webhook without the configured header is refused", async () => {
  for (const authorization of [
    null,
    "",
    "Bearer forge-test-heade",
    "Bearer forge-test-header ",
    "bearer forge-test-header",
  ])
    assert.deepEqual(await check({ authorization }), {
      ok: false,
      problem: "authorization",
    });
});

test("a webhook without a valid signature over its exact body is refused", async () => {
  const reserialized = JSON.stringify(JSON.parse(BODY), null, 1);
  const forged = BODY.replace(A, B);
  for (const [name, request] of [
    ["no signature", { signature: null }],
    ["an empty signature", { signature: "" }],
    ["no time", { signature: `v1=${sign(BODY, NOW_S).split("v1=")[1]}` }],
    ["no v1", { signature: `t=${NOW_S}` }],
    ["a short v1", { signature: `t=${NOW_S},v1=abc` }],
    [
      "a time that isn't a number",
      { signature: sign(BODY, NOW_S).replace(`t=${NOW_S}`, "t=soon") },
    ],
    [
      "another secret",
      { signature: sign(BODY, NOW_S, "another-test-secret-not-real") },
    ],
    ["a forged body", { body: forged }],
    ["the body parsed and written again", { body: reserialized }],
    [
      "the signature's time changed",
      { signature: sign(BODY, NOW_S).replace(`t=${NOW_S}`, `t=${NOW_S + 1}`) },
    ],
  ] as [string, Partial<Parameters<typeof verifyWebhook>[0]>][])
    assert.deepEqual(
      await check(request),
      { ok: false, problem: "signature" },
      name,
    );
});

test("a replayed webhook outside the tolerance is refused", async () => {
  const old = { signature: sign(BODY, NOW_S - 6 * 60) };
  assert.deepEqual(await check(old), { ok: false, problem: "stale" });
  const future = { signature: sign(BODY, NOW_S + 6 * 60) };
  assert.deepEqual(await check(future), { ok: false, problem: "stale" });
});

test("without both secrets configured, nothing is accepted", async () => {
  for (const secrets of [
    { ...SECRETS, authorization: "" },
    { ...SECRETS, signingSecret: "" },
  ])
    assert.deepEqual(
      await check({ authorization: secrets.authorization }, T0, secrets),
      {
        ok: false,
        problem: "configuration",
      },
    );
});

test("an event names the Forge accounts to refresh, and only those", () => {
  const purchase = webhookEvent(JSON.parse(BODY));
  assert.deepEqual(purchase, {
    ok: true,
    value: {
      id: "evt-1",
      type: "INITIAL_PURCHASE",
      environment: "sandbox",
      eventAt: T0,
      accounts: [A],
    },
  });
  const transfer = webhookEvent({
    api_version: "1.0",
    event: {
      id: "evt-2",
      type: "TRANSFER",
      transferred_from: [A.toUpperCase()],
      transferred_to: [B, "$RCAnonymousID:x"],
      environment: "PRODUCTION",
      event_timestamp_ms: T0,
    },
  });
  assert.ok(transfer.ok);
  assert.deepEqual(transfer.value.accounts, [A, B]);
  assert.equal(transfer.value.environment, "production");
  const dashboard = webhookEvent({
    event: {
      id: "evt-3",
      type: "TEST",
      app_user_id: "test-user",
      environment: "SANDBOX",
    },
  });
  assert.ok(dashboard.ok);
  assert.deepEqual(dashboard.value.accounts, []);
  assert.equal(dashboard.value.eventAt, null);
  for (const body of [
    null,
    {},
    { event: { type: "EXPIRATION" } },
    { event: { id: "", type: "EXPIRATION" } },
    { event: { id: "evt", type: "expiration" } },
    { event: { id: "x".repeat(201), type: "EXPIRATION" } },
  ])
    assert.equal(webhookEvent(body).ok, false);
});
