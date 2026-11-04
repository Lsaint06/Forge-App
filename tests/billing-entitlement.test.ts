import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAccountId,
  parseEntitlementResponse,
  toEntitlementResponse,
  type EntitlementResponse,
} from "../src/billing/entitlement";
import {
  MEMBERSHIP_PLAN,
  membershipProductProblems,
  type StoreProduct,
} from "../src/billing/plan";
import {
  A,
  DAY,
  HOUR,
  MEMBERSHIP,
  PRODUCT,
  T0,
  answer,
  rowFor,
  type Sub,
} from "./billing-fixture";

// Phase 9.1: the server's answer is the only door to access, so it is
// checked whole before anything uses it; and the store's product must be
// exactly the approved membership before a paywall may describe it.

const rows: Record<string, Sub | undefined> = {
  none: undefined,
  trial: { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true },
  cancelledTrial: {
    purchased: T0 - DAY,
    expires: T0 + 6 * DAY,
    trial: true,
    unsubscribed: T0 - HOUR,
  },
  active: { purchased: T0 - DAY, expires: T0 + 29 * DAY },
  grace: {
    purchased: T0 - 31 * DAY,
    expires: T0 - DAY,
    billingIssue: T0 - DAY,
    grace: T0 + 15 * DAY,
  },
  billingRetry: {
    purchased: T0 - 31 * DAY,
    expires: T0 - DAY,
    billingIssue: T0 - DAY,
  },
  expired: { purchased: T0 - 31 * DAY, expires: T0 - DAY },
  revoked: { purchased: T0 - DAY, expires: T0 + 29 * DAY, refunded: T0 },
};
const valid = Object.fromEntries(
  Object.entries(rows).map(([name, sub]) => [
    name,
    answer(A, T0, rowFor(A, T0, sub ? { [PRODUCT]: sub } : {})),
  ]),
) as Record<string, EntitlementResponse>;

test("every answer the server can give is accepted, and kept as it came", () => {
  for (const [name, json] of Object.entries(valid)) {
    const parsed = parseEntitlementResponse(json);
    assert.ok(parsed.ok, `${name}: ${parsed.ok ? "" : parsed.problem}`);
    assert.equal(parsed.value.userId, A);
    assert.equal(parsed.value.serverNow, T0);
    assert.deepEqual(toEntitlementResponse(parsed.value), json, name);
  }
  // No record at all: never a member.
  const none = parseEntitlementResponse(answer(A, T0));
  assert.deepEqual(none, {
    ok: true,
    value: {
      userId: A,
      serverNow: T0,
      entitlement: { status: "none", willRenew: false },
    },
  });
  assert.deepEqual(
    toEntitlementResponse(none.ok ? none.value : never()),
    answer(A, T0),
  );
});

function never(): never {
  throw new Error("unreachable");
}

test("fields a later server adds are ignored", () => {
  const json = structuredClone(valid.trial!) as unknown as Record<
    string,
    unknown
  >;
  json.extra = 1;
  (json.entitlement as Record<string, unknown>).store = "app_store";
  assert.equal(parseEntitlementResponse(json).ok, true);
});

test("a malformed or inconsistent answer is refused whole", () => {
  type Mutation = (
    a: Record<string, unknown>,
    e: Record<string, unknown>,
  ) => void;
  const refusals: [string, string, Mutation][] = [
    [
      "trial",
      "an empty answer",
      (a) => Object.keys(a).forEach((k) => delete a[k]),
    ],
    ["trial", "no account", (a) => delete a.user_id],
    ["trial", "not an account ID", (a) => (a.user_id = "user-a")],
    [
      "trial",
      "server time in seconds",
      (a) => (a.server_now = Math.floor(T0 / 1000)),
    ],
    ["trial", "server time as text", (a) => (a.server_now = String(T0))],
    ["trial", "fractional time", (a) => (a.server_now = T0 + 0.5)],
    ["trial", "unknown status", (_, e) => (e.status = "lifetime")],
    ["trial", "will_renew as text", (_, e) => (e.will_renew = "true")],
    ["trial", "in force without an end", (_, e) => (e.access_until = null)],
    ["trial", "in force without a product", (_, e) => (e.product_id = null)],
    [
      "trial",
      "in force without an environment",
      (_, e) => (e.environment = null),
    ],
    ["trial", "unknown environment", (_, e) => (e.environment = "staging")],
    [
      "trial",
      "end past the period",
      (_, e) => (e.access_until = (e.expires_at as number) + DAY),
    ],
    ["trial", "without a start", (_, e) => (e.first_entitled_at = null)],
    ["trial", "without a time", (_, e) => (e.refreshed_at = null)],
    [
      "trial",
      "a date in seconds",
      (_, e) => (e.expires_at = Math.floor((e.expires_at as number) / 1000)),
    ],
    ["trial", "an empty product", (_, e) => (e.product_id = "")],
    [
      "grace",
      "grace without a billing issue",
      (_, e) => (e.billing_issue_at = null),
    ],
    [
      "grace",
      "grace without its end",
      (_, e) => {
        e.grace_expires_at = null;
        e.access_until = e.expires_at;
      },
    ],
    [
      "billingRetry",
      "a retry without a billing issue",
      (_, e) => (e.billing_issue_at = null),
    ],
    [
      "billingRetry",
      "access while retrying",
      (_, e) => (e.access_until = T0 + DAY),
    ],
    ["expired", "access after expiry", (_, e) => (e.access_until = T0 + DAY)],
    [
      "revoked",
      "a revocation without its time",
      (_, e) => (e.revoked_at = null),
    ],
    [
      "revoked",
      "access after a refund",
      (_, e) => (e.access_until = T0 + 29 * DAY),
    ],
    [
      "expired",
      "an ended membership without a start",
      (_, e) => (e.first_entitled_at = null),
    ],
    [
      "none",
      "access without a membership",
      (_, e) => (e.access_until = T0 + DAY),
    ],
    ["trial", "the entitlement as a list", (a) => (a.entitlement = [])],
  ];
  for (const [base, name, mutate] of refusals) {
    const json = structuredClone(valid[base]!) as unknown as Record<
      string,
      unknown
    >;
    mutate(json, json.entitlement as Record<string, unknown>);
    const parsed = parseEntitlementResponse(json);
    assert.equal(parsed.ok, false, name);
  }
  for (const json of [null, undefined, "{}", 42, []])
    assert.equal(parseEntitlementResponse(json).ok, false);
});

test("account IDs are Supabase user IDs", () => {
  assert.equal(isAccountId(A), true);
  assert.equal(isAccountId(A.toUpperCase()), true);
  for (const id of [
    "",
    "user-a",
    `${A} `,
    `${A}0`,
    "$RCAnonymousID:abc",
    7,
    null,
  ])
    assert.equal(isAccountId(id), false);
});

test("the approved plan: $6.99 a month with Apple's free week, nothing else", () => {
  assert.deepEqual(MEMBERSHIP_PLAN, {
    usdCents: 699,
    billingPeriod: { unit: "month", count: 1 },
    freeTrialDays: 7,
  });
  assert.deepEqual(membershipProductProblems(MEMBERSHIP), []);
  // App Store Connect's "1 week" may also come as seven days.
  assert.deepEqual(
    membershipProductProblems({
      ...MEMBERSHIP,
      introOffer: { price: 0, period: { unit: "day", count: 7 }, cycles: 1 },
    }),
    [],
  );
  // Other storefronts show Apple's equivalent price.
  assert.deepEqual(
    membershipProductProblems({
      ...MEMBERSHIP,
      price: 6.49,
      currency: "EUR",
      priceString: "6,49 €",
    }),
    [],
  );
});

test("a store product other than the approved membership is refused", () => {
  const refused: [string, Partial<StoreProduct>][] = [
    ["annual", { period: { unit: "year", count: 1 } }],
    ["every two months", { period: { unit: "month", count: 2 } }],
    ["weekly", { period: { unit: "week", count: 1 } }],
    ["another US price", { price: 9.99, priceString: "$9.99" }],
    ["free", { price: 0, priceString: "Free" }],
    ["no local price", { priceString: " " }],
    ["no free week", { introOffer: undefined }],
    [
      "a paid introductory price",
      {
        introOffer: {
          price: 0.99,
          period: { unit: "week", count: 1 },
          cycles: 1,
        },
      },
    ],
    [
      "three days free",
      {
        introOffer: { price: 0, period: { unit: "day", count: 3 }, cycles: 1 },
      },
    ],
    [
      "a free month",
      {
        introOffer: {
          price: 0,
          period: { unit: "month", count: 1 },
          cycles: 1,
        },
      },
    ],
    [
      "two free weeks",
      {
        introOffer: { price: 0, period: { unit: "week", count: 1 }, cycles: 2 },
      },
    ],
  ];
  for (const [name, change] of refused)
    assert.notDeepEqual(
      membershipProductProblems({ ...MEMBERSHIP, ...change }),
      [],
      name,
    );
});
