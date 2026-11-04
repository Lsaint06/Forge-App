import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLOCK_TOLERANCE_MS,
  entitlementAccess,
  hasAccess,
  previewAllowed,
  trustedNow,
  type Access,
} from "../src/billing/access";
import {
  ENTITLEMENT_STATUSES,
  parseEntitlementResponse,
  type CachedEntitlement,
} from "../src/billing/entitlement";
import type { EntitlementRow } from "../supabase/functions/_shared/entitlement";
import {
  A,
  B,
  DAY,
  HOUR,
  MIN,
  PRODUCT,
  T0,
  answer,
  fakeServer,
  rowFor,
  type Sub,
} from "./billing-fixture";

// Phase 9.1: the access decision, state by state. Access lasts exactly to
// the verified end (the trial, the paid month, or Apple's billing grace
// period): never cut short by a cancellation, never extended by any window,
// on the server's clock however this phone's is set.

/** The answer as this phone would hold it, received at `receivedAt`. */
function held(
  row: EntitlementRow | undefined,
  options: {
    serverNow?: number;
    receivedAt?: number;
    checkedAt?: number;
    userId?: string;
  } = {},
): CachedEntitlement {
  const serverNow = options.serverNow ?? T0;
  const receivedAt = options.receivedAt ?? serverNow;
  const parsed = parseEntitlementResponse(
    answer(options.userId ?? A, serverNow, row),
  );
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.problem);
  return {
    ...parsed.value,
    receivedAt,
    checkedAt: options.checkedAt ?? receivedAt,
  };
}

const at = (subs: Record<string, Sub>, now = T0) => rowFor(A, now, subs);
const membership = (sub: Sub) => at({ [PRODUCT]: sub });
const decide = (h: CachedEntitlement | undefined, now = T0) =>
  entitlementAccess(A, h, now);

const TRIAL = membership({
  purchased: T0 - DAY,
  expires: T0 + 6 * DAY,
  trial: true,
});
const PAID = membership({ purchased: T0 - 10 * DAY, expires: T0 + 20 * DAY });

test("never a member: no access, and the Forge Path preview is allowed", () => {
  for (const h of [held(undefined), held(at({}))]) {
    const access = decide(h);
    assert.deepEqual(access, { kind: "denied", reason: "never" });
    assert.equal(hasAccess(access), false);
    assert.equal(previewAllowed(access), true);
  }
});

test("a verified free week grants everything until it ends, and no preview", () => {
  const h = held(TRIAL);
  const access = decide(h);
  assert.deepEqual(access, {
    kind: "granted",
    status: "trial",
    until: T0 + 6 * DAY,
    renews: true,
  });
  assert.equal(previewAllowed(access), false);
  assert.equal(hasAccess(decide(h, T0 + 6 * DAY - 1)), true);
  // At the verified end, the server must say whether it renewed.
  assert.deepEqual(decide(h, T0 + 6 * DAY), {
    kind: "unverified",
    reason: "renewal",
  });
});

test("cancelling never ends access early: it runs to the end of the period", () => {
  const cases: [Sub, number][] = [
    [
      {
        purchased: T0 - DAY,
        expires: T0 + 6 * DAY,
        trial: true,
        unsubscribed: T0 - HOUR,
      },
      T0 + 6 * DAY,
    ],
    [
      {
        purchased: T0 - 10 * DAY,
        expires: T0 + 20 * DAY,
        unsubscribed: T0 - 9 * DAY,
      },
      T0 + 20 * DAY,
    ],
  ];
  for (const [sub, end] of cases) {
    const h = held(membership(sub));
    assert.deepEqual(decide(h), {
      kind: "granted",
      status: sub.trial ? "trial" : "active",
      until: end,
      renews: false,
    });
    assert.equal(hasAccess(decide(h, end - 1)), true);
    assert.deepEqual(decide(h, end), { kind: "denied", reason: "expired" });
    assert.equal(previewAllowed(decide(h, end)), false);
  }
});

test("a paid month grants access; after its end only the server can renew it", () => {
  const h = held(PAID);
  assert.deepEqual(decide(h), {
    kind: "granted",
    status: "active",
    until: T0 + 20 * DAY,
    renews: true,
  });
  assert.deepEqual(decide(h, T0 + 20 * DAY + MIN), {
    kind: "unverified",
    reason: "renewal",
  });
});

test("Apple's billing grace period keeps access to its end, then it stops", () => {
  const sub = {
    purchased: T0 - 31 * DAY,
    expires: T0 - DAY,
    billingIssue: T0 - DAY,
    grace: T0 + 15 * DAY,
  };
  const h = held(membership(sub));
  assert.deepEqual(decide(h), {
    kind: "granted",
    status: "grace",
    until: T0 + 15 * DAY,
    renews: true,
  });
  assert.deepEqual(decide(h, T0 + 15 * DAY), {
    kind: "unverified",
    reason: "renewal",
  });
  // Cancelled during the grace period: a billing issue once it ends.
  const cancelled = held(membership({ ...sub, unsubscribed: T0 - HOUR }));
  assert.equal(hasAccess(decide(cancelled)), true);
  assert.deepEqual(decide(cancelled, T0 + 15 * DAY), {
    kind: "denied",
    reason: "billingIssue",
  });
});

test("a failed renewal without grace, an expiry and a refund deny access at once", () => {
  const cases: [Sub, Access][] = [
    [
      { purchased: T0 - 31 * DAY, expires: T0 - DAY, billingIssue: T0 - DAY },
      { kind: "denied", reason: "billingIssue" },
    ],
    [
      { purchased: T0 - 31 * DAY, expires: T0 - DAY, unsubscribed: T0 - DAY },
      { kind: "denied", reason: "expired" },
    ],
    [
      {
        purchased: T0 - DAY,
        expires: T0 + 29 * DAY,
        refunded: T0 - HOUR,
      },
      { kind: "denied", reason: "revoked" },
    ],
  ];
  for (const [sub, expected] of cases) {
    const access = decide(held(membership(sub)));
    assert.deepEqual(access, expected);
    // Ended, so the onboarding preview never returns.
    assert.equal(previewAllowed(access), false);
  }
});

test("a membership moved to another account ends here, without a preview", () => {
  const server = fakeServer();
  server.rc.set(A, {
    [PRODUCT]: { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true },
  });
  server.sync(A);
  // Restored under another Forge account: RevenueCat no longer lists it.
  server.now += HOUR;
  server.rc.delete(A);
  const row = server.sync(A);
  assert.equal(row.status, "none");
  assert.equal(row.first_entitled_at, new Date(T0 - DAY).toISOString());
  const access = decide(held(row, { serverNow: server.now }), server.now);
  assert.deepEqual(access, { kind: "denied", reason: "expired" });
  assert.equal(previewAllowed(access), false);
});

test("only this account's own verified answer counts", () => {
  assert.deepEqual(decide(undefined), {
    kind: "unverified",
    reason: "missing",
  });
  const other = held(
    rowFor(B, T0, {
      [PRODUCT]: { purchased: T0, expires: T0 + 7 * DAY, trial: true },
    }),
    { userId: B },
  );
  assert.deepEqual(decide(other), { kind: "unverified", reason: "missing" });
  assert.equal(hasAccess(entitlementAccess(B, other, T0)), true);
});

test("no window of any kind: access ends exactly at the verified end", () => {
  const subs: Sub[] = [
    { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true },
    {
      purchased: T0 - DAY,
      expires: T0 + 6 * DAY,
      trial: true,
      unsubscribed: T0,
    },
    { purchased: T0 - 10 * DAY, expires: T0 + 20 * DAY },
    { purchased: T0 - 10 * DAY, expires: T0 + 20 * DAY, unsubscribed: T0 },
    {
      purchased: T0 - 31 * DAY,
      expires: T0 - DAY,
      billingIssue: T0 - DAY,
      grace: T0 + 15 * DAY,
    },
  ];
  // Moments after the end: none of them is access (offline, outage or a
  // workout in progress alike; F4 and F5 grant nothing until decided).
  const after = [1, MIN, HOUR, 12 * HOUR, 72 * HOUR, 30 * DAY];
  for (const sub of subs) {
    const h = held(membership(sub));
    const until = h.entitlement.accessUntil!;
    for (const before of [until - T0, 1, DAY])
      assert.equal(hasAccess(decide(h, until - before)), true);
    for (const d of after) assert.equal(hasAccess(decide(h, until + d)), false);
  }
  // Statuses not in force never grant, at any time.
  for (const sub of [
    { purchased: T0 - 31 * DAY, expires: T0 - DAY, billingIssue: T0 - DAY },
    { purchased: T0 - 31 * DAY, expires: T0 - DAY, unsubscribed: T0 - DAY },
    { purchased: T0 - DAY, expires: T0 + 29 * DAY, refunded: T0 - HOUR },
  ]) {
    const h = held(membership(sub));
    for (const d of [-30 * DAY, -HOUR, 0, HOUR, 30 * DAY])
      assert.equal(hasAccess(decide(h, T0 + d)), false);
  }
});

test("time is the server's: a slow or fast phone clock changes nothing", () => {
  // The verified trial ends at T0 + 6 days on the server's clock.
  for (const skew of [-3 * HOUR, 3 * HOUR, -400 * DAY]) {
    const h = held(TRIAL, { receivedAt: T0 + skew });
    assert.equal(hasAccess(decide(h, T0 + skew + 6 * DAY - 1)), true);
    assert.equal(hasAccess(decide(h, T0 + skew + 6 * DAY)), false);
  }
});

test("a phone clock set back is caught, and a little step back regains nothing", () => {
  // Verified at T0, ending at T0 + 2 hours; the phone last read T0 + 2 hours.
  const row = membership({ purchased: T0 - HOUR, expires: T0 + 2 * HOUR });
  const h = held(row, { checkedAt: T0 + 2 * HOUR });
  assert.equal(trustedNow(h, T0 + 2 * HOUR), T0 + 2 * HOUR);
  // Set back further than the tolerance: nothing it says is trusted.
  assert.equal(
    trustedNow(h, T0 + 2 * HOUR - CLOCK_TOLERANCE_MS - 1),
    undefined,
  );
  assert.deepEqual(decide(h, T0), { kind: "unverified", reason: "clock" });
  // Within the tolerance, time doesn't run backwards: still over.
  assert.equal(trustedNow(h, T0 + 2 * HOUR - 4 * MIN), T0 + 2 * HOUR);
  assert.equal(hasAccess(decide(h, T0 + 2 * HOUR - 4 * MIN)), false);
  // A clock that never went back: in force until the end.
  assert.equal(hasAccess(decide(held(row), T0 + 2 * HOUR - 1)), true);
});

test("statuses not in force are decided without consulting the clock", () => {
  const ended = held(
    membership({
      purchased: T0 - 31 * DAY,
      expires: T0 - DAY,
      unsubscribed: T0 - DAY,
    }),
    { checkedAt: T0 + DAY },
  );
  assert.deepEqual(decide(ended, T0 - 30 * DAY), {
    kind: "denied",
    reason: "expired",
  });
});

test("the decision is pure: it changes nothing it is given", () => {
  const h = held(TRIAL);
  const frozen = structuredClone(h);
  const deepFreeze = (o: object) => {
    Object.values(o).forEach(
      (v) => v && typeof v === "object" && deepFreeze(v),
    );
    return Object.freeze(o);
  };
  deepFreeze(h);
  for (const now of [T0, T0 + 6 * DAY, T0 - DAY]) decide(h, now);
  assert.deepEqual(h, frozen);
  assert.deepEqual(decide(h), decide(h));
});

test("every status the server can send is decided", () => {
  const seen = new Set<string>();
  const server = fakeServer();
  const cases: Record<string, Sub | undefined> = {
    none: undefined,
    trial: { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true },
    active: { purchased: T0 - DAY, expires: T0 + 29 * DAY },
    grace: {
      purchased: T0 - 31 * DAY,
      expires: T0 - DAY,
      billingIssue: T0 - DAY,
      grace: T0 + DAY,
    },
    billing_retry: {
      purchased: T0 - 31 * DAY,
      expires: T0 - DAY,
      billingIssue: T0 - DAY,
    },
    expired: { purchased: T0 - 31 * DAY, expires: T0 - DAY },
    revoked: { purchased: T0 - DAY, expires: T0 + 29 * DAY, refunded: T0 },
  };
  for (const [status, sub] of Object.entries(cases)) {
    server.rc.set(A, sub ? { [PRODUCT]: sub } : {});
    server.rows.delete(A);
    const row = server.sync(A);
    assert.equal(row.status, status);
    seen.add(row.status);
    assert.ok(decide(held(row)).kind);
  }
  assert.deepEqual([...seen].sort(), [...ENTITLEMENT_STATUSES].sort());
});
