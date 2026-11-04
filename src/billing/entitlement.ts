// The verified entitlement (Phase 9.1): what Forge's server says about one
// account's membership. Apple bills; RevenueCat validates the store's
// transactions; Forge's server reads RevenueCat with its own secret, keeps
// one record per account (forge_entitlements, supabase/drafts) and answers
// with that record and its own clock. For access the app trusts nothing
// else: never the purchase SDK's answers (Expo Go only mocks them), a local
// flag, or the device clock alone. Every answer is checked here before
// anything uses it; a malformed or inconsistent answer is refused whole.

export const ENTITLEMENT_STATUSES = [
  "none", // no trial or subscription on record
  "trial", // Apple's free week, in force
  "active", // a paid month, in force (renewing or cancelled)
  "grace", // a renewal failed; Apple's billing grace period, in force
  "billing_retry", // a renewal failed and Apple is retrying: no access
  "expired",
  "revoked", // refunded or revoked through Apple
] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/** The statuses in force: access until `accessUntil`. */
export const IN_FORCE = ["trial", "active", "grace"] as const;
export type InForce = (typeof IN_FORCE)[number];
export const inForce = (s: EntitlementStatus): s is InForce =>
  (IN_FORCE as readonly string[]).includes(s);

export const STORE_ENVIRONMENTS = ["production", "sandbox"] as const;
export type StoreEnvironment = (typeof STORE_ENVIRONMENTS)[number];
export const PERIOD_TYPES = ["trial", "intro", "normal"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

/** One account's membership as the server keeps it (times in ms). */
export type Entitlement = {
  status: EntitlementStatus;
  /** The App Store product: the approved monthly membership. */
  productId?: string;
  environment?: StoreEnvironment;
  periodType?: PeriodType;
  purchasedAt?: number;
  /** The end of the current trial or paid month. */
  expiresAt?: number;
  /** The end of Apple's billing grace period, after a failed renewal. */
  graceExpiresAt?: number;
  /** Where access ends; set only while in force (the later of the two). */
  accessUntil?: number;
  /** Auto-renew is on. Off means cancelled: access still runs its course. */
  willRenew: boolean;
  billingIssueAt?: number;
  revokedAt?: number;
  /**
   * When this account first had a trial or a subscription. Never cleared:
   * once set, the onboarding's Forge Path preview never returns.
   */
  firstEntitledAt?: number;
  /** When the store's state was read; absent when there is no record. */
  refreshedAt?: number;
};

/** A server answer: about one account, at the server's time. */
export type VerifiedEntitlement = {
  userId: string;
  /** The server's clock when it answered. */
  serverNow: number;
  entitlement: Entitlement;
};

/** A verified answer as this phone keeps it (cache.ts). */
export type CachedEntitlement = VerifiedEntitlement & {
  /** This phone's clock when the answer arrived. */
  receivedAt: number;
  /** The latest time this phone's clock has shown since (access.ts). */
  checkedAt: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Forge accounts are Supabase users: their IDs are UUIDs. */
export const isAccountId = (v: unknown): v is string =>
  typeof v === "string" && UUID.test(v);

// The server's times are milliseconds since the epoch, within reason: a time
// in seconds, or garbage, is refused.
const EARLIEST = Date.UTC(2020, 0, 1);
const LATEST = Date.UTC(2100, 0, 1);
export const isServerTime = (v: unknown): v is number =>
  typeof v === "number" &&
  Number.isSafeInteger(v) &&
  v >= EARLIEST &&
  v < LATEST;

/**
 * The answer as it travels. forge_entitlement() and the entitlement-refresh
 * Edge Function both return it; `entitlement` is null when the server has no
 * record for the account (it never had a trial or subscription).
 */
export type EntitlementResponse = {
  user_id: string;
  server_now: number;
  entitlement: EntitlementRecord | null;
};
export type EntitlementRecord = {
  status: EntitlementStatus;
  product_id: string | null;
  environment: StoreEnvironment | null;
  period_type: PeriodType | null;
  purchased_at: number | null;
  expires_at: number | null;
  grace_expires_at: number | null;
  access_until: number | null;
  will_renew: boolean;
  billing_issue_at: number | null;
  revoked_at: number | null;
  first_entitled_at: number | null;
  refreshed_at: number;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };
const refuse = (problem: string) => ({ ok: false, problem }) as const;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === "string" && (values as readonly string[]).includes(v);
const isText = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 200;

/** Without its undefined members, so equal records compare equal. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as T;
}

/**
 * A server answer, checked field by field and then as a whole. Unknown
 * fields are ignored; anything else unexpected refuses the answer.
 */
export function parseEntitlementResponse(
  json: unknown,
): Parsed<VerifiedEntitlement> {
  if (!isRecord(json)) return refuse("The answer isn't an object");
  const { user_id: userId, server_now: serverNow, entitlement: raw } = json;
  if (!isAccountId(userId)) return refuse("The answer names no account");
  if (!isServerTime(serverNow)) return refuse("The answer has no server time");
  if (raw === null)
    return {
      ok: true,
      value: {
        userId,
        serverNow,
        entitlement: { status: "none", willRenew: false },
      },
    };
  if (!isRecord(raw)) return refuse("The entitlement isn't an object");
  const entitlement = parseRecord(raw);
  if (!entitlement.ok) return entitlement;
  return {
    ok: true,
    value: { userId, serverNow, entitlement: entitlement.value },
  };
}

function parseRecord(r: Record<string, unknown>): Parsed<Entitlement> {
  if (!oneOf(ENTITLEMENT_STATUSES)(r.status))
    return refuse("The status is unknown");
  if (typeof r.will_renew !== "boolean")
    return refuse("will_renew isn't true or false");
  let problem: string | undefined;
  // A missing field reads as null: absence can only take access away.
  const field = <T>(key: string, check: (v: unknown) => v is T) => {
    const v = r[key];
    if (v === null || v === undefined) return undefined;
    if (check(v)) return v;
    problem ??= `${key} is invalid`;
    return undefined;
  };
  const e = compact<Entitlement>({
    status: r.status,
    productId: field("product_id", isText),
    environment: field("environment", oneOf(STORE_ENVIRONMENTS)),
    periodType: field("period_type", oneOf(PERIOD_TYPES)),
    purchasedAt: field("purchased_at", isServerTime),
    expiresAt: field("expires_at", isServerTime),
    graceExpiresAt: field("grace_expires_at", isServerTime),
    accessUntil: field("access_until", isServerTime),
    willRenew: r.will_renew,
    billingIssueAt: field("billing_issue_at", isServerTime),
    revokedAt: field("revoked_at", isServerTime),
    firstEntitledAt: field("first_entitled_at", isServerTime),
    refreshedAt: field("refreshed_at", isServerTime),
  });
  problem ??= inconsistency(e);
  return problem ? refuse(problem) : { ok: true, value: e };
}

/** The rules forge_entitlements' checks also enforce. */
function inconsistency(e: Entitlement): string | undefined {
  if (e.refreshedAt === undefined) return "The record has no time";
  if (inForce(e.status)) {
    if (
      e.productId === undefined ||
      e.environment === undefined ||
      e.expiresAt === undefined ||
      e.accessUntil === undefined ||
      e.firstEntitledAt === undefined
    )
      return "A membership in force names its product, environment and dates";
    if (e.accessUntil !== Math.max(e.expiresAt, e.graceExpiresAt ?? 0))
      return "access_until isn't the end of the period or grace period";
  } else if (e.accessUntil !== undefined)
    return "Only a membership in force has access_until";
  if (
    e.status === "grace" &&
    (e.billingIssueAt === undefined || e.graceExpiresAt === undefined)
  )
    return "A grace period follows a billing issue";
  if (e.status === "billing_retry" && e.billingIssueAt === undefined)
    return "A billing retry follows a billing issue";
  if (e.status === "revoked" && e.revokedAt === undefined)
    return "A revocation has a time";
  if (e.status !== "none" && e.firstEntitledAt === undefined)
    return "A membership has a start";
  return undefined;
}

/** The answer in its travelling form: how this phone keeps it. */
export function toEntitlementResponse(
  v: VerifiedEntitlement,
): EntitlementResponse {
  const e = v.entitlement;
  return {
    user_id: v.userId,
    server_now: v.serverNow,
    entitlement:
      e.refreshedAt === undefined
        ? null
        : {
            status: e.status,
            product_id: e.productId ?? null,
            environment: e.environment ?? null,
            period_type: e.periodType ?? null,
            purchased_at: e.purchasedAt ?? null,
            expires_at: e.expiresAt ?? null,
            grace_expires_at: e.graceExpiresAt ?? null,
            access_until: e.accessUntil ?? null,
            will_renew: e.willRenew,
            billing_issue_at: e.billingIssueAt ?? null,
            revoked_at: e.revokedAt ?? null,
            first_entitled_at: e.firstEntitledAt ?? null,
            refreshed_at: e.refreshedAt,
          },
  };
}
