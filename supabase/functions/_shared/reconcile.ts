// Forge's membership Edge Functions (Phase 9.3), as pure handlers. Every
// outside party (Supabase Auth, the database, RevenueCat, the clock, the
// log) is handed in, so the Node tests drive them against the draft schema
// in PGlite with RevenueCat faked (tests/billing-functions.test.ts), and
// Deno runs the same code: ../entitlement-refresh and ../entitlement-webhook
// wire in the real parties (rest.ts). Nothing here reads the environment
// itself, and no secret is ever logged or answered. Not deployed.
//
// The trust chain (docs/SUBSCRIPTIONS.md): a refresh reads the account's
// customer record from RevenueCat with the server's secret, normalizes it
// (entitlement.ts) and keeps it in forge_entitlements as the service role;
// the guard there keeps the newest reading. A webhook only names the
// accounts to refresh: its own fields never grant or end anything.
//
// entitlement-refresh: POST, with the signed-in account's Supabase token.
//   200 { user_id, server_now, entitlement }: forge_entitlement()'s answer,
//       read with the caller's own session after the refresh.
//   401 { error: "unauthorized" }: no valid caller (no token, an invalid or
//       expired one, a session that ended, an anonymous sign-in, an
//       account that no longer exists).
//   405 { error: "method_not_allowed" } (Allow: POST).
//   502 { error: "store_unavailable" | "store_unreadable" }: RevenueCat
//       couldn't be read; nothing was written.
//   503 { error: "not_configured" | "unavailable" }: the function's
//       configuration is incomplete, or Supabase failed.
// entitlement-webhook: POST from RevenueCat; any non-2xx makes it retry.
//   200 { event_id, outcome: "processed", refreshed } or
//       { event_id, outcome: "duplicate" }: done, or done before.
//   400 { error: "bad_request" }: genuine, but not a RevenueCat event.
//   401 { error: "unauthorized" }: the header, the signature or its time
//       is wrong (the same answer for each, so none can be probed alone).
//   405, 413 { error: "too_large" }.
//   502/503 { error, event_id }: not processed, so RevenueCat retries.
//   503 { error: "not_configured" }.

import type {
  EntitlementPolicy,
  EntitlementRow,
  ForgeEnvironment,
  WebhookEvent,
  WebhookSecrets,
} from "./entitlement.ts";
// Deno loads modules only by their full name. The app's tsc checks these
// files too and allows the extension on type imports alone, so each value
// import in the functions carries this one directive.
// @ts-expect-error TS5097: allowImportingTsExtensions is off for the app.
import * as contract from "./entitlement.ts";

export type Env = (name: string) => string | undefined;
/** Where the functions note what went wrong: fixed words, never a secret. */
export type Log = (line: string) => void;

/** A failure the real services describe safely: no secret, no body. */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export type Saved = "saved" | "no_account";

/** What the functions need from Supabase and RevenueCat (rest.ts). */
export type Services = {
  /**
   * The Forge account a Supabase access token belongs to; undefined when
   * the token is invalid or expired, its session has ended, or it is an
   * anonymous sign-in. Throws when Supabase Auth can't answer.
   */
  userFromToken(jwt: string): Promise<string | undefined>;
  /**
   * RevenueCat's customer record (GET /v1/subscribers/{app_user_id} with
   * the secret key). Throws when RevenueCat can't be reached or answers
   * with an error.
   */
  fetchSubscriber(appUserId: string): Promise<unknown>;
  /**
   * Writes the account's row as the service role (an upsert); the guard
   * keeps the newest reading. "no_account" when the account is gone.
   */
  saveEntitlement(row: EntitlementRow): Promise<Saved>;
  /**
   * forge_entitlement(), called with the caller's own session (its token),
   * so row level security applies and the server's clock comes with it.
   */
  readEntitlement(userId: string, jwt: string): Promise<unknown>;
  /**
   * Records a webhook event on first receipt (a retry adds nothing) and
   * says whether it has already been processed.
   */
  receiveEvent(event: WebhookEvent): Promise<{ processed: boolean }>;
  /** Marks the event processed, once; linked to an account still on record. */
  markProcessed(eventId: string, userId: string | null): Promise<void>;
};

export type RefreshDeps = Pick<
  Services,
  "userFromToken" | "fetchSubscriber" | "saveEntitlement" | "readEntitlement"
> & { policy: EntitlementPolicy; log?: Log };

export type WebhookDeps = Pick<
  Services,
  "fetchSubscriber" | "saveEntitlement" | "receiveEvent" | "markProcessed"
> & {
  policy: EntitlementPolicy;
  secrets: WebhookSecrets;
  now?: () => number;
  log?: Log;
};

// ---- Configuration ----------------------------------------------------------

/** What both functions need. Never logged, never answered. */
export type Settings = {
  supabaseUrl: string;
  /**
   * The project's secret key, which makes a request the service role's:
   * SUPABASE_SECRET_KEYS' "default" (sb_secret_…), else the legacy
   * SUPABASE_SERVICE_ROLE_KEY (a JWT).
   */
  serviceRoleKey: string;
  /**
   * The project's publishable key, which goes with a caller's own token:
   * SUPABASE_PUBLISHABLE_KEYS' "default" (sb_publishable_…), else the
   * legacy SUPABASE_ANON_KEY (a JWT). Never the secret key.
   */
  publishableKey: string;
  revenueCatKey: string;
  policy: EntitlementPolicy;
};
export type WebhookSettings = Settings & { secrets: WebhookSecrets };
/** Checked settings, or the names (never the values) of what's wrong. */
export type Checked<T> =
  { ok: true; value: T } | { ok: false; problems: string[] };

// Product IDs as App Store Connect allows them (letters, digits, periods,
// underscores), and hyphens; a stray space or quote is a configuration
// problem, never part of an ID.
const PRODUCT_ID = /^[A-Za-z0-9._-]{1,200}$/;

// Values are used exactly as set: surrounding whitespace would never match
// an HTTP header or a key, so it counts as a configuration problem.
const exact = (v: string) => (v === v.trim() ? v : undefined);

function origin(v: string) {
  try {
    const url = new URL(v);
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

const forgeEnvironment = (v: string): ForgeEnvironment | undefined =>
  v === "production" || v === "development" ? v : undefined;

/** FORGE_MEMBERSHIP_PRODUCT_IDS: comma-separated (founder decision F16). */
function productIds(v: string) {
  const ids = v
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length && ids.every((id) => PRODUCT_ID.test(id))
    ? [...new Set(ids)]
    : undefined;
}

function read<T>(
  env: Env,
  name: string,
  parse: (v: string) => T | undefined,
  problems: string[],
) {
  const raw = env(name);
  const value = typeof raw === "string" && raw.trim() ? parse(raw) : undefined;
  if (value === undefined) problems.push(name);
  return value;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const exactKey = (v: unknown) =>
  typeof v === "string" && v !== "" && v === v.trim() ? v : undefined;

/**
 * One of the project's API keys. Hosted Edge Functions get them as JSON
 * dictionaries by key name (SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS),
 * and Forge uses the one named "default". When that is absent or
 * malformed: the legacy JWT key (deprecated by the end of 2026). Neither:
 * a problem, under the dictionary's name alone.
 */
function apiKey(env: Env, keys: string, legacy: string, problems: string[]) {
  const raw = env(keys);
  let named: unknown;
  try {
    named = raw === undefined ? undefined : JSON.parse(raw);
  } catch {
    // Malformed: as if absent. Its text, and the parser's message quoting
    // it, go nowhere.
  }
  const key =
    (isRecord(named) ? exactKey(named.default) : undefined) ??
    exactKey(env(legacy));
  if (key === undefined) problems.push(keys);
  return key;
}

/**
 * entitlement-refresh's configuration: SUPABASE_URL, the project's secret
 * and publishable keys (apiKey), REVENUECAT_SECRET_API_KEY,
 * FORGE_ENVIRONMENT and FORGE_MEMBERSHIP_PRODUCT_IDS.
 */
export function refreshSettings(env: Env): Checked<Settings> {
  const problems: string[] = [];
  const supabaseUrl = read(env, "SUPABASE_URL", origin, problems);
  const serviceRoleKey = apiKey(
    env,
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
    problems,
  );
  const publishableKey = apiKey(
    env,
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
    problems,
  );
  // It goes with callers' tokens, so it may never be a secret key.
  if (
    publishableKey !== undefined &&
    (publishableKey === serviceRoleKey ||
      publishableKey.startsWith("sb_secret_"))
  )
    problems.push("SUPABASE_PUBLISHABLE_KEYS");
  const revenueCatKey = read(env, "REVENUECAT_SECRET_API_KEY", exact, problems);
  const environment = read(
    env,
    "FORGE_ENVIRONMENT",
    forgeEnvironment,
    problems,
  );
  const ids = read(env, "FORGE_MEMBERSHIP_PRODUCT_IDS", productIds, problems);
  if (
    problems.length ||
    supabaseUrl === undefined ||
    serviceRoleKey === undefined ||
    publishableKey === undefined ||
    revenueCatKey === undefined ||
    environment === undefined ||
    ids === undefined
  )
    return { ok: false, problems };
  return {
    ok: true,
    value: {
      supabaseUrl,
      serviceRoleKey,
      publishableKey,
      revenueCatKey,
      policy: {
        productIds: ids,
        environments: contract.acceptedEnvironments(environment),
      },
    },
  };
}

/**
 * entitlement-webhook's configuration: entitlement-refresh's, and both
 * webhook secrets, REVENUECAT_WEBHOOK_AUTHORIZATION and
 * REVENUECAT_WEBHOOK_SIGNING_SECRET. Signing is optional in RevenueCat's
 * dashboard: until it is turned on there, every delivery is refused.
 */
export function webhookSettings(env: Env): Checked<WebhookSettings> {
  const base = refreshSettings(env);
  const problems = base.ok ? [] : [...base.problems];
  const authorization = read(
    env,
    "REVENUECAT_WEBHOOK_AUTHORIZATION",
    exact,
    problems,
  );
  const signingSecret = read(
    env,
    "REVENUECAT_WEBHOOK_SIGNING_SECRET",
    exact,
    problems,
  );
  if (!base.ok || authorization === undefined || signingSecret === undefined)
    return { ok: false, problems };
  return {
    ok: true,
    value: { ...base.value, secrets: { authorization, signingSecret } },
  };
}

// ---- Answers ------------------------------------------------------------------

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...HEADERS, ...headers },
  });
}

const methodNotAllowed = () =>
  reply(405, { error: "method_not_allowed" }, { allow: "POST" });
const notConfigured = () => reply(503, { error: "not_configured" });
const unauthorized = (headers: Record<string, string> = {}) =>
  reply(401, { error: "unauthorized" }, headers);

/** What a failure may say in the log: never a message it didn't write. */
const describe = (e: unknown) =>
  e instanceof ServiceError
    ? e.message
    : e instanceof Error
      ? e.name
      : "unknown failure";

const usable = (policy: EntitlementPolicy) =>
  policy.productIds.length > 0 && policy.environments.length > 0;

/** The caller's Supabase access token: `Authorization: Bearer <token>`. */
function bearer(request: Request) {
  const match = /^Bearer ([A-Za-z0-9\-._~+/]{1,16384}=*)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  return match?.[1];
}

// ---- Refreshing one account ---------------------------------------------------

type Failure = {
  ok: false;
  status: 502 | 503;
  error: "store_unavailable" | "store_unreadable" | "unavailable";
};
type Refreshed = { ok: true; saved: Saved } | Failure;

/**
 * The account's row, read afresh from RevenueCat and kept. When RevenueCat
 * can't be reached, or its record can't be read, nothing is written: the
 * last good row stays (normalizeSubscriber refuses a record whole).
 */
async function refreshAccount(
  deps: Pick<
    RefreshDeps,
    "fetchSubscriber" | "saveEntitlement" | "policy" | "log"
  >,
  fn: string,
  userId: string,
  eventId: string | null,
): Promise<Refreshed> {
  let record: unknown;
  try {
    record = await deps.fetchSubscriber(userId);
  } catch (e) {
    deps.log?.(`${fn}: RevenueCat unavailable (${describe(e)})`);
    return { ok: false, status: 502, error: "store_unavailable" };
  }
  const row = contract.normalizeSubscriber(
    userId,
    record,
    deps.policy,
    eventId,
  );
  if (!row.ok) {
    deps.log?.(`${fn}: RevenueCat's record refused (${row.problem})`);
    return { ok: false, status: 502, error: "store_unreadable" };
  }
  try {
    return { ok: true, saved: await deps.saveEntitlement(row.value) };
  } catch (e) {
    deps.log?.(`${fn}: the record wasn't kept (${describe(e)})`);
    return { ok: false, status: 503, error: "unavailable" };
  }
}

// ---- entitlement-refresh ----------------------------------------------------------

/** The answer is forge_entitlement()'s, and about this account. */
const answersFor = (answer: unknown, userId: string) =>
  isRecord(answer) &&
  typeof answer.user_id === "string" &&
  answer.user_id.toLowerCase() === userId &&
  typeof answer.server_now === "number" &&
  Number.isSafeInteger(answer.server_now) &&
  (answer.entitlement === null || isRecord(answer.entitlement));

/**
 * The signed-in account's membership, read afresh from RevenueCat, kept,
 * and answered as forge_entitlement() answers it. The account comes only
 * from the caller's token; the request's body is never read.
 */
export async function handleRefresh(
  request: Request,
  deps: RefreshDeps,
): Promise<Response> {
  const fn = "entitlement-refresh";
  if (request.method !== "POST") return methodNotAllowed();
  if (!usable(deps.policy)) {
    deps.log?.(`${fn}: no membership product configured`);
    return notConfigured();
  }
  const challenge = { "www-authenticate": "Bearer" };
  const jwt = bearer(request);
  if (!jwt) return unauthorized(challenge);
  let caller: string | undefined;
  try {
    caller = await deps.userFromToken(jwt);
  } catch (e) {
    deps.log?.(`${fn}: Supabase Auth unavailable (${describe(e)})`);
    return reply(503, { error: "unavailable" });
  }
  if (!contract.isAccountId(caller)) return unauthorized(challenge);
  const userId = caller.toLowerCase();

  const refreshed = await refreshAccount(deps, fn, userId, null);
  // RevenueCat unreachable or its record unreadable: 502, and no row is
  // written ("a record that can't be read is refused, so the last good row
  // stays"). Not the kept record with a fresh server_now: that would pass
  // for a fresh reading, and right after a purchase the app would take "no
  // membership" as the server's word instead of "not confirmed yet". On
  // 502 the app keeps what it holds (its verifier reports `unavailable`)
  // and can still read the kept record through forge_entitlement().
  if (!refreshed.ok) return reply(refreshed.status, { error: refreshed.error });
  // The account was deleted while it asked.
  if (refreshed.saved === "no_account") return unauthorized(challenge);

  let answer: unknown;
  try {
    answer = await deps.readEntitlement(userId, jwt);
  } catch (e) {
    deps.log?.(`${fn}: forge_entitlement() unavailable (${describe(e)})`);
    return reply(503, { error: "unavailable" });
  }
  if (!answersFor(answer, userId)) {
    deps.log?.(`${fn}: forge_entitlement()'s answer isn't the caller's`);
    return reply(503, { error: "unavailable" });
  }
  return reply(200, answer);
}

// ---- entitlement-webhook ----------------------------------------------------------

/** Far above any RevenueCat event; a larger body isn't read further. */
export const MAX_WEBHOOK_BYTES = 256 * 1024;

/**
 * A RevenueCat webhook. Genuine only with the configured Authorization
 * header and a fresh signature over the exact body; then every Forge
 * account the event names is refreshed from RevenueCat (never from the
 * event's fields), once per event ID:
 *
 * - The event is recorded on first receipt, unprocessed. Only when every
 *   named account has been refreshed (or no longer exists) is it marked
 *   processed, and only then is the answer 2xx.
 * - Any failure leaves it unprocessed and answers 502/503, so RevenueCat
 *   retries with the same event ID and the refresh runs again; a refresh
 *   only re-reads RevenueCat, so running it again is harmless.
 * - A processed event delivered again is acknowledged (200) without work.
 * - Two deliveries of one event at once (a retry while the first still
 *   runs) may both refresh: the guard keeps the newest reading, and the
 *   event is marked processed once.
 */
export async function handleWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Response> {
  const fn = "entitlement-webhook";
  if (request.method !== "POST") return methodNotAllowed();
  if (!usable(deps.policy)) {
    deps.log?.(`${fn}: no membership product configured`);
    return notConfigured();
  }
  if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES)
    return reply(413, { error: "too_large" });
  let body: Uint8Array;
  try {
    body = new Uint8Array(await request.arrayBuffer());
  } catch {
    return reply(400, { error: "bad_request" });
  }
  if (body.length > MAX_WEBHOOK_BYTES)
    return reply(413, { error: "too_large" });

  const check = await contract.verifyWebhook(
    {
      authorization: request.headers.get("authorization"),
      signature: request.headers.get("x-revenuecat-webhook-signature"),
      body,
    },
    deps.secrets,
    (deps.now ?? Date.now)(),
  );
  if (!check.ok) {
    if (check.problem === "configuration") {
      deps.log?.(`${fn}: webhook secrets not configured`);
      return notConfigured();
    }
    deps.log?.(`${fn}: refused (${check.problem})`);
    return unauthorized();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    deps.log?.(`${fn}: the body isn't JSON`);
    return reply(400, { error: "bad_request" });
  }
  const event = contract.webhookEvent(parsed);
  if (!event.ok) {
    deps.log?.(`${fn}: not a RevenueCat event (${event.problem})`);
    return reply(400, { error: "bad_request" });
  }
  const { id } = event.value;

  let received: { processed: boolean };
  try {
    received = await deps.receiveEvent(event.value);
  } catch (e) {
    deps.log?.(`${fn}: the event wasn't recorded (${describe(e)})`);
    return reply(503, { error: "unavailable", event_id: id });
  }
  if (received.processed)
    return reply(200, { event_id: id, outcome: "duplicate" });

  // An event from a store environment this project never accepts (a
  // production purchase reaching FORGE DEV) can't count here: nothing to
  // refresh. It is still recorded, so its retries are acknowledged.
  const { environment } = event.value;
  const accepted =
    environment === null || deps.policy.environments.includes(environment);
  if (!accepted) deps.log?.(`${fn}: ${environment} event not accepted here`);

  let failure: Failure | undefined;
  let linked: string | null = null;
  let refreshed = 0;
  for (const account of accepted ? event.value.accounts : []) {
    const r = await refreshAccount(deps, fn, account, id);
    if (!r.ok) failure ??= r;
    else if (r.saved === "saved") {
      refreshed++;
      linked ??= account;
    }
  }
  if (failure)
    return reply(failure.status, { error: failure.error, event_id: id });

  try {
    await deps.markProcessed(id, linked);
  } catch (e) {
    deps.log?.(`${fn}: the event wasn't marked processed (${describe(e)})`);
    return reply(503, { error: "unavailable", event_id: id });
  }
  return reply(200, { event_id: id, outcome: "processed", refreshed });
}

// ---- The functions, configured --------------------------------------------------

/** The real services for a configuration (rest.ts; PGlite in the tests). */
export type Connect = (settings: Settings) => Services;

function refuse(fn: string, problems: string[], log?: Log) {
  // The variables' names only, never their values.
  log?.(`${fn}: not configured (${problems.join(", ")})`);
  return notConfigured();
}

/**
 * entitlement-refresh as served: its configuration is checked on every
 * request, and without all of it nothing else runs.
 */
export function serveRefresh(env: Env, connect: Connect, log?: Log) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return methodNotAllowed();
    const settings = refreshSettings(env);
    if (!settings.ok)
      return refuse("entitlement-refresh", settings.problems, log);
    return handleRefresh(request, {
      ...connect(settings.value),
      policy: settings.value.policy,
      log,
    });
  };
}

/** entitlement-webhook as served, the same way. */
export function serveWebhook(env: Env, connect: Connect, log?: Log) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return methodNotAllowed();
    const settings = webhookSettings(env);
    if (!settings.ok)
      return refuse("entitlement-webhook", settings.problems, log);
    return handleWebhook(request, {
      ...connect(settings.value),
      policy: settings.value.policy,
      secrets: settings.value.secrets,
      log,
    });
  };
}
