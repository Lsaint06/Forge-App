// Forge's server side of membership (Phase 9.1): pure logic for the Edge
// Functions still to come (Phase 9.3: entitlement-refresh and
// entitlement-webhook). Self-contained, with no imports, so Deno runs the
// same file the Node tests check (tests/billing-server.test.ts). It holds
// and reads no secret: the functions pass theirs in. Not deployed.
//
// - normalizeSubscriber: RevenueCat's customer record (GET /v1/subscribers/
//   {app_user_id}, read with the secret key, server only) becomes the
//   account's one forge_entitlements row (supabase/drafts).
// - verifyWebhook: a RevenueCat webhook is genuine only with the configured
//   Authorization header and a fresh HMAC signature over its raw body.
// - webhookEvent: which Forge accounts an event concerns. Each is refreshed
//   from RevenueCat; an event's own fields never grant anything.
//
// The app receives a record only through forge_entitlement(), called with
// the account's own session, which also gives the server's clock.

export type ForgeEnvironment = "production" | "development";
export type StoreEnvironment = "production" | "sandbox";
export type EntitlementStatus =
  | "none"
  | "trial"
  | "active"
  | "grace"
  | "billing_retry"
  | "expired"
  | "revoked";
export type PeriodType = "trial" | "intro" | "normal";

/** What may grant access in one Forge project. */
export type EntitlementPolicy = {
  /** The approved membership's App Store product IDs (founder decision F16). */
  productIds: readonly string[];
  environments: readonly StoreEnvironment[];
};

/**
 * The store environments a Forge project accepts. App Review and TestFlight
 * buy in Apple's sandbox, even in the production app, so production accepts
 * sandbox purchases too (as Apple advises); FORGE DEV never accepts a real
 * purchase.
 */
export function acceptedEnvironments(
  env: ForgeEnvironment,
): StoreEnvironment[] {
  return env === "production" ? ["production", "sandbox"] : ["sandbox"];
}

/** One forge_entitlements row, as the service role writes it (ISO times). */
export type EntitlementRow = {
  user_id: string;
  status: EntitlementStatus;
  product_id: string | null;
  store: "app_store" | null;
  environment: StoreEnvironment | null;
  period_type: PeriodType | null;
  purchased_at: string | null;
  expires_at: string | null;
  grace_expires_at: string | null;
  access_until: string | null;
  will_renew: boolean;
  billing_issue_at: string | null;
  revoked_at: string | null;
  first_entitled_at: string | null;
  source_event_id: string | null;
  refreshed_at: string;
};

export type Result<T> = { ok: true; value: T } | { ok: false; problem: string };
const refuse = (problem: string) => ({ ok: false, problem }) as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forge accounts are Supabase users; RevenueCat knows them by that ID. */
export const isAccountId = (v: unknown): v is string =>
  typeof v === "string" && UUID.test(v);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** RevenueCat's customer record for an account (secret key, server only). */
export const subscriberUrl = (appUserId: string) =>
  `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`;

// ---- RevenueCat's record → forge_entitlements --------------------------------

class Malformed extends Error {}

const ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

function optionalTime(s: Record<string, unknown>, key: string) {
  const v = s[key];
  if (v === null || v === undefined) return undefined;
  const ms = typeof v === "string" && ISO.test(v) ? Date.parse(v) : NaN;
  if (!Number.isFinite(ms)) throw new Malformed(`${key} isn't a time`);
  return ms;
}

function requiredTime(s: Record<string, unknown>, key: string) {
  const ms = optionalTime(s, key);
  if (ms === undefined) throw new Malformed(`${key} is missing`);
  return ms;
}

type Held = {
  productId: string;
  environment: StoreEnvironment;
  periodType: PeriodType;
  purchasedAt: number;
  originalPurchaseAt: number;
  expiresAt: number;
  graceExpiresAt?: number;
  billingIssueAt?: number;
  unsubscribedAt?: number;
  refundedAt?: number;
};

/**
 * A subscription that counts: the approved product, bought in the App Store
 * by the Apple Account itself (not shared), in an accepted environment.
 * Anything else is skipped; a counted one with unreadable dates refuses the
 * whole record, so the last good row is kept.
 */
function held(
  productId: string,
  s: unknown,
  policy: EntitlementPolicy,
): Held | undefined {
  if (!isRecord(s)) throw new Malformed(`${productId} isn't a subscription`);
  if (s.store !== "app_store" || s.ownership_type !== "PURCHASED")
    return undefined;
  if (typeof s.is_sandbox !== "boolean")
    throw new Malformed("is_sandbox isn't true or false");
  const environment: StoreEnvironment = s.is_sandbox ? "sandbox" : "production";
  if (!policy.environments.includes(environment)) return undefined;
  const periodType = s.period_type;
  if (
    periodType !== "trial" &&
    periodType !== "intro" &&
    periodType !== "normal"
  )
    return undefined;
  return {
    productId,
    environment,
    periodType,
    purchasedAt: requiredTime(s, "purchase_date"),
    originalPurchaseAt: requiredTime(s, "original_purchase_date"),
    expiresAt: requiredTime(s, "expires_date"),
    graceExpiresAt: optionalTime(s, "grace_period_expires_date"),
    billingIssueAt: optionalTime(s, "billing_issues_detected_at"),
    unsubscribedAt: optionalTime(s, "unsubscribe_detected_at"),
    refundedAt: optionalTime(s, "refunded_at"),
  };
}

const iso = (ms: number | undefined) =>
  ms === undefined ? null : new Date(ms).toISOString();

/**
 * The forge_entitlements row for `userId` from RevenueCat's customer record,
 * as of the record's own time (`request_date_ms`). Access is in force only
 * during the current trial or paid period, or Apple's billing grace period
 * after a failed renewal; cancelling keeps it to the period's end, and a
 * refund of the current period ends it at once.
 */
export function normalizeSubscriber(
  userId: string,
  body: unknown,
  policy: EntitlementPolicy,
  sourceEventId: string | null = null,
): Result<EntitlementRow> {
  if (!isAccountId(userId)) return refuse("Not a Forge account");
  if (!isRecord(body) || !isRecord(body.subscriber))
    return refuse("Not a RevenueCat customer record");
  const now = body.request_date_ms;
  if (typeof now !== "number" || !Number.isSafeInteger(now) || now <= 0)
    return refuse("The record has no time");
  const subscriptions = body.subscriber.subscriptions;
  if (!isRecord(subscriptions))
    return refuse("The record has no subscriptions");
  let all: Held[];
  try {
    all = policy.productIds.flatMap((id) => {
      if (!Object.prototype.hasOwnProperty.call(subscriptions, id)) return [];
      const h = held(id, subscriptions[id], policy);
      return h ? [h] : [];
    });
  } catch (e) {
    return refuse(
      e instanceof Malformed ? e.message : "The record is unreadable",
    );
  }
  const row = {
    user_id: userId,
    source_event_id: sourceEventId,
    refreshed_at: new Date(now).toISOString(),
  };
  if (!all.length)
    return {
      ok: true,
      value: {
        ...row,
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
      },
    };
  // The current subscription: the one whose period ends last.
  const c = all.reduce((a, b) => (b.expiresAt > a.expiresAt ? b : a));
  // A refund or billing issue counts only for the current period.
  const revoked = c.refundedAt !== undefined && c.refundedAt >= c.purchasedAt;
  const billingIssue =
    c.billingIssueAt !== undefined && c.billingIssueAt >= c.purchasedAt;
  const grace =
    billingIssue &&
    c.graceExpiresAt !== undefined &&
    c.graceExpiresAt > c.expiresAt
      ? c.graceExpiresAt
      : undefined;
  const cancelled = c.unsubscribedAt !== undefined;
  const status: EntitlementStatus = revoked
    ? "revoked"
    : c.expiresAt > now
      ? c.periodType === "trial"
        ? "trial"
        : "active"
      : grace !== undefined && grace > now
        ? "grace"
        : billingIssue && !cancelled
          ? "billing_retry"
          : "expired";
  const inForce =
    status === "trial" || status === "active" || status === "grace";
  return {
    ok: true,
    value: {
      ...row,
      status,
      product_id: c.productId,
      store: "app_store",
      environment: c.environment,
      period_type: c.periodType,
      purchased_at: iso(c.purchasedAt),
      expires_at: iso(c.expiresAt),
      grace_expires_at: iso(grace),
      access_until: inForce ? iso(Math.max(c.expiresAt, grace ?? 0)) : null,
      will_renew: !cancelled && status !== "expired" && status !== "revoked",
      billing_issue_at: billingIssue ? iso(c.billingIssueAt) : null,
      revoked_at: revoked ? iso(c.refundedAt) : null,
      first_entitled_at: iso(Math.min(...all.map((h) => h.originalPurchaseAt))),
    },
  };
}

// ---- Webhooks ------------------------------------------------------------------

/** How far a signature's time may be from the server's (RevenueCat: 5 min). */
export const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export type WebhookSecrets = {
  /** The Authorization header value set on the webhook in RevenueCat. */
  authorization: string;
  /** The webhook's HMAC signing secret. */
  signingSecret: string;
};

export type WebhookRequest = {
  authorization: string | null;
  /** X-RevenueCat-Webhook-Signature: `t=<unix seconds>,v1=<hex HMAC>`. */
  signature: string | null;
  /** The body exactly as received, before any parsing. */
  body: Uint8Array | string;
};

export type WebhookCheck =
  | { ok: true }
  | {
      ok: false;
      problem: "configuration" | "authorization" | "signature" | "stale";
    };

const encoder = new TextEncoder();

/** Equal, compared in constant time. */
function same(a: Uint8Array, b: Uint8Array) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function hmacHex(secret: string, data: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether a webhook request is RevenueCat's: the configured Authorization
 * header, and an HMAC-SHA256 signature of `<t>.<raw body>` with the signing
 * secret, signed within WEBHOOK_TOLERANCE_MS of `now`. Without both secrets
 * configured, nothing is accepted.
 */
export async function verifyWebhook(
  request: WebhookRequest,
  secrets: WebhookSecrets,
  now: number,
): Promise<WebhookCheck> {
  if (!secrets.authorization || !secrets.signingSecret)
    return { ok: false, problem: "configuration" };
  if (
    request.authorization === null ||
    !same(
      encoder.encode(request.authorization),
      encoder.encode(secrets.authorization),
    )
  )
    return { ok: false, problem: "authorization" };
  const parts = (request.signature ?? "").split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const v1 = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3).toLowerCase());
  if (
    !t ||
    !/^\d{1,12}$/.test(t) ||
    !v1.length ||
    v1.some((s) => !/^[0-9a-f]{64}$/.test(s))
  )
    return { ok: false, problem: "signature" };
  const prefix = encoder.encode(`${t}.`);
  const body =
    typeof request.body === "string"
      ? encoder.encode(request.body)
      : request.body;
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);
  const expected = encoder.encode(await hmacHex(secrets.signingSecret, signed));
  if (!v1.some((s) => same(encoder.encode(s), expected)))
    return { ok: false, problem: "signature" };
  if (Math.abs(now - Number(t) * 1000) > WEBHOOK_TOLERANCE_MS)
    return { ok: false, problem: "stale" };
  return { ok: true };
}

export type WebhookEvent = {
  /** RevenueCat's event ID: the same on every retry of a delivery. */
  id: string;
  type: string;
  environment: StoreEnvironment | null;
  /** When RevenueCat generated the event (ms), if given. */
  eventAt: number | null;
  /** Every Forge account the event names; each is refreshed. */
  accounts: string[];
};

const ids = (v: unknown) =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];

/**
 * A verified webhook's event: what to record, and whom to refresh. A
 * transfer names the accounts on both sides; App User IDs that aren't Forge
 * accounts (RevenueCat's anonymous IDs) are left out.
 */
export function webhookEvent(body: unknown): Result<WebhookEvent> {
  if (!isRecord(body) || !isRecord(body.event))
    return refuse("Not a RevenueCat webhook");
  const e = body.event;
  if (typeof e.id !== "string" || e.id.length < 1 || e.id.length > 200)
    return refuse("The event has no ID");
  if (typeof e.type !== "string" || !/^[A-Z_]{1,64}$/.test(e.type))
    return refuse("The event has no type");
  const named = [
    ...ids(e.app_user_id),
    ...ids(e.original_app_user_id),
    ...ids(e.aliases),
    ...ids(e.transferred_from),
    ...ids(e.transferred_to),
  ];
  return {
    ok: true,
    value: {
      id: e.id,
      type: e.type,
      environment:
        e.environment === "PRODUCTION"
          ? "production"
          : e.environment === "SANDBOX"
            ? "sandbox"
            : null,
      eventAt:
        typeof e.event_timestamp_ms === "number" &&
        Number.isSafeInteger(e.event_timestamp_ms)
          ? e.event_timestamp_ms
          : null,
      accounts: [
        ...new Set(named.filter(isAccountId).map((id) => id.toLowerCase())),
      ],
    },
  };
}
