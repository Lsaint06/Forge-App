import { createHmac } from "node:crypto";
import { entitlementCache, type KeyValueStore } from "../src/billing/cache";
import type { EntitlementResponse } from "../src/billing/entitlement";
import type { StoreProduct } from "../src/billing/plan";
import {
  VerifierError,
  type EntitlementVerifier,
  type PurchaseOutcome,
  type PurchaseProvider,
  type RestoreOutcome,
} from "../src/billing/provider";
import type { BillingDeps } from "../src/billing/service";
import {
  acceptedEnvironments,
  normalizeSubscriber,
  type EntitlementPolicy,
  type EntitlementRow,
} from "../supabase/functions/_shared/entitlement";

// Phase 9.1 test doubles: an in-memory secure store; RevenueCat's customer
// records; Forge's server (RevenueCat's state per account, the
// forge_entitlements rows built from it under the draft migration's rules,
// and forge_entitlement()'s answers); and the App Store through the purchase
// SDK, which either settles purchases for real or, like the SDK in Expo Go,
// only pretends to.

export const A = "00000000-0000-4000-8000-00000000000a";
export const B = "00000000-0000-4000-8000-00000000000b";
/** A placeholder: the real product ID is founder decision F16. */
export const PRODUCT = "forge.membership.monthly";
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** Wednesday 4 November 2026, 12:00 UTC. */
export const T0 = Date.UTC(2026, 10, 4, 12);

export const POLICY: EntitlementPolicy = {
  productIds: [PRODUCT],
  environments: acceptedEnvironments("production"),
};

const iso = (ms: number | undefined) =>
  ms === undefined ? null : new Date(ms).toISOString();

/** One subscription, as RevenueCat's customer record describes it. */
export type Sub = {
  purchased: number;
  expires: number;
  original?: number;
  trial?: boolean;
  periodType?: string;
  sandbox?: boolean;
  store?: string;
  ownership?: string;
  unsubscribed?: number;
  billingIssue?: number;
  grace?: number;
  refunded?: number;
};

export function rcSubscription(s: Sub): Record<string, unknown> {
  return {
    auto_resume_date: null,
    billing_issues_detected_at: iso(s.billingIssue),
    expires_date: iso(s.expires),
    grace_period_expires_date: iso(s.grace),
    is_sandbox: s.sandbox ?? false,
    original_purchase_date: iso(s.original ?? s.purchased),
    ownership_type: s.ownership ?? "PURCHASED",
    period_type: s.periodType ?? (s.trial ? "trial" : "normal"),
    purchase_date: iso(s.purchased),
    refunded_at: iso(s.refunded),
    store: s.store ?? "app_store",
    store_transaction_id: "2000000123456789",
    unsubscribe_detected_at: iso(s.unsubscribed),
  };
}

/** RevenueCat's answer to GET /v1/subscribers/{app_user_id}, at `now`. */
export function rcCustomer(now: number, subscriptions: Record<string, Sub>) {
  return {
    request_date: new Date(now).toISOString(),
    request_date_ms: now,
    subscriber: {
      entitlements: {},
      first_seen: iso(T0 - 30 * DAY),
      management_url: null,
      non_subscriptions: {},
      original_app_user_id: A,
      original_application_version: "1.0",
      original_purchase_date: null,
      other_purchases: {},
      subscriptions: Object.fromEntries(
        Object.entries(subscriptions).map(([id, s]) => [id, rcSubscription(s)]),
      ),
    },
  };
}

/** The account's row from RevenueCat's record; it must normalize. */
export function rowFor(
  userId: string,
  now: number,
  subscriptions: Record<string, Sub> = {},
  policy = POLICY,
): EntitlementRow {
  const r = normalizeSubscriber(userId, rcCustomer(now, subscriptions), policy);
  if (!r.ok) throw new Error(r.problem);
  return r.value;
}

const ms = (v: string | null) => (v === null ? null : Date.parse(v));

/** forge_entitlement()'s answer for a row: the draft's function, in TS. */
export function answer(
  userId: string,
  serverNow: number,
  row?: EntitlementRow,
): EntitlementResponse {
  return {
    user_id: userId,
    server_now: serverNow,
    entitlement: row
      ? {
          status: row.status,
          product_id: row.product_id,
          environment: row.environment,
          period_type: row.period_type,
          purchased_at: ms(row.purchased_at),
          expires_at: ms(row.expires_at),
          grace_expires_at: ms(row.grace_expires_at),
          access_until: ms(row.access_until),
          will_renew: row.will_renew,
          billing_issue_at: ms(row.billing_issue_at),
          revoked_at: ms(row.revoked_at),
          first_entitled_at: ms(row.first_entitled_at),
          refreshed_at: Date.parse(row.refreshed_at),
        }
      : null,
  };
}

/**
 * The secure store, in memory. Each operation can fail or be slowed. Its
 * `data` outlives the app: a new store on the same data is a restart.
 */
export function memoryStore(data = new Map<string, string>()) {
  const fail = { get: false, set: false, remove: false };
  /** Delays (ms) for the next writes, in order. */
  const slowWrites: number[] = [];
  const store: KeyValueStore = {
    async getItem(key) {
      if (fail.get) throw new Error("Keychain unavailable");
      return data.get(key) ?? null;
    },
    async setItem(key, value) {
      if (fail.set) throw new Error("Keychain unavailable");
      const delay = slowWrites.shift();
      if (delay) await new Promise((r) => setTimeout(r, delay));
      data.set(key, value);
    },
    async removeItem(key) {
      if (fail.remove) throw new Error("Keychain unavailable");
      data.delete(key);
    },
  };
  return { store, data, fail, slowWrites };
}

export type Fault =
  "offline" | "unavailable" | "auth" | "malformed" | "otherAccount";

/**
 * Forge's server, with its own clock. `rc` is RevenueCat's state per
 * account; a refresh reads it into the account's row under the draft's
 * guard (an older reading never wins; a first membership is never
 * forgotten). `faults` fail the next requests, in order.
 */
export function fakeServer(start = T0) {
  const rc = new Map<string, Record<string, Sub>>();
  const rows = new Map<string, EntitlementRow>();
  const faults: Fault[] = [];
  const calls = { refresh: 0, read: 0 };
  const server = {
    now: start,
    rc,
    rows,
    faults,
    calls,
    /** The account's row, from RevenueCat's state now. */
    sync(userId: string) {
      const next = rowFor(userId, server.now, rc.get(userId) ?? {});
      const kept = rows.get(userId);
      if (kept && Date.parse(next.refreshed_at) < Date.parse(kept.refreshed_at))
        return kept;
      const firsts = [kept?.first_entitled_at, next.first_entitled_at]
        .filter((v): v is string => typeof v === "string")
        .map(Date.parse);
      const row: EntitlementRow = {
        ...next,
        first_entitled_at: firsts.length
          ? new Date(Math.min(...firsts)).toISOString()
          : null,
      };
      rows.set(userId, row);
      return row;
    },
    answer: (userId: string) => answer(userId, server.now, rows.get(userId)),
    /** What the app's verifier reaches, for whoever is signed in. */
    verifier(session: () => string): EntitlementVerifier {
      const reply = (fresh: boolean): unknown => {
        const fault = faults.shift();
        const userId = session();
        if (fault === "offline") throw new TypeError("Network request failed");
        if (fault === "unavailable")
          throw new VerifierError("unavailable", "Service unavailable");
        if (fault === "auth") throw new VerifierError("auth", "JWT expired");
        if (fault === "otherAccount") {
          const other = userId === A ? B : A;
          if (fresh) server.sync(other);
          return server.answer(other);
        }
        if (fresh) server.sync(userId);
        if (fault === "malformed")
          return { ...server.answer(userId), server_now: "soon" };
        return server.answer(userId);
      };
      return {
        async refresh() {
          calls.refresh++;
          return reply(true);
        },
        async read() {
          calls.read++;
          return reply(false);
        },
      };
    },
  };
  return server;
}
export type FakeServer = ReturnType<typeof fakeServer>;

export const MEMBERSHIP: StoreProduct = {
  id: PRODUCT,
  priceString: "$6.99",
  price: 6.99,
  currency: "USD",
  period: { unit: "month", count: 1 },
  introOffer: { price: 0, period: { unit: "week", count: 1 }, cycles: 1 },
};

/**
 * The App Store through the purchase SDK, for one Apple Account. With
 * `settles` (a real store) a completed purchase reaches RevenueCat for the
 * identified account: the free week if this Apple Account never had it,
 * otherwise a paid month. Without it (the SDK in Expo Go, Preview API mode)
 * every purchase "completes" and nothing reaches RevenueCat.
 */
export function fakeStore(server: FakeServer, settles = true) {
  const listeners = new Set<() => void>();
  const control = {
    log: [] as string[],
    /** Outcomes of the next purchases (completed by default); an Error throws. */
    purchases: [] as (PurchaseOutcome | Error)[],
    restores: [] as (RestoreOutcome | Error)[],
    trialUsed: false,
    failIdentify: false,
    identified: undefined as string | undefined,
    /** A renewal, refund or approval reached the store. */
    change: () => listeners.forEach((l) => l()),
    provider: undefined as unknown as PurchaseProvider,
  };
  control.provider = {
    async identify(userId) {
      control.log.push(`identify ${userId}`);
      if (control.failIdentify) throw new Error("Store unavailable");
      control.identified = userId;
    },
    async reset() {
      control.log.push("reset");
      control.identified = undefined;
    },
    async products(ids) {
      return ids.includes(PRODUCT) ? [MEMBERSHIP] : [];
    },
    async introEligibility() {
      return control.trialUsed ? "ineligible" : "eligible";
    },
    async purchase(productId) {
      control.log.push(`purchase ${productId}`);
      const next = control.purchases.shift() ?? { kind: "completed" };
      if (next instanceof Error) throw next;
      if (next.kind === "completed" && settles && control.identified) {
        const trial = !control.trialUsed;
        control.trialUsed = true;
        server.rc.set(control.identified, {
          [PRODUCT]: {
            purchased: server.now,
            expires: server.now + (trial ? 7 : 30) * DAY,
            trial,
          },
        });
      }
      return next;
    },
    async restore() {
      control.log.push("restore");
      const next = control.restores.shift() ?? { kind: "completed" };
      if (next instanceof Error) throw next;
      return next;
    },
    onStoreChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return control;
}

/**
 * One phone signed in to `user` (A by default), with Forge's server and the
 * App Store. `wait` moves the server's and the phone's clocks together; the
 * phone's clock can also be moved alone.
 */
export function billing(options: { settles?: boolean; start?: number } = {}) {
  const start = options.start ?? T0;
  const server = fakeServer(start);
  const phone = { now: start, user: A };
  const memory = memoryStore();
  const store = fakeStore(server, options.settles ?? true);
  const deps: BillingDeps = {
    provider: store.provider,
    verifier: server.verifier(() => phone.user),
    cache: entitlementCache(memory.store),
    productId: PRODUCT,
    now: () => phone.now,
  };
  const wait = (ms: number) => {
    server.now += ms;
    phone.now += ms;
  };
  /** The app restarted: a new process on the same secure store contents. */
  const restart = () => {
    const next = memoryStore(memory.data);
    return {
      memory: next,
      deps: { ...deps, cache: entitlementCache(next.store) },
    };
  };
  return { server, phone, memory, store, deps, wait, restart };
}

// ---- Phase 9.3: RevenueCat's webhooks ---------------------------------------

/**
 * RevenueCat's webhook signature, computed independently (node:crypto):
 * `t=<unix seconds>,v1=<HMAC-SHA256 hex of "<t>.<raw body>">`.
 */
export function signWebhook(body: string, seconds: number, secret: string) {
  const v1 = createHmac("sha256", secret)
    .update(`${seconds}.${body}`)
    .digest("hex");
  return `t=${seconds},v1=${v1}`;
}

/** A RevenueCat webhook's body, as it travels. */
export function rcWebhook(event: Record<string, unknown>) {
  return JSON.stringify({
    api_version: "1.0",
    event: {
      environment: "PRODUCTION",
      event_timestamp_ms: T0,
      ...event,
    },
  });
}
