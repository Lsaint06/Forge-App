// The real parties of Forge's membership Edge Functions (Phase 9.3), over
// fetch alone, with no SDK and nothing from npm or jsr: Supabase Auth,
// Forge's database through Supabase's Data API (PostgREST), and RevenueCat's
// REST API. reconcile.ts decides; this file only speaks their formats. Each
// key goes only where it belongs: RevenueCat's to RevenueCat; the project's
// secret key to its Supabase, on `apikey` (a legacy JWT key also as the
// bearer, a new sb_secret_ key never); a caller's token to Supabase Auth and
// forge_entitlement(), with the publishable key and never the secret one.
// Only forge_entitlement()'s answer is passed on (it is entitlement-refresh's
// answer); no other body is, and none is logged. Not deployed.

import type { Connect, Env, Log, Services } from "./reconcile.ts";
// @ts-expect-error TS5097: Deno needs the extension (see reconcile.ts).
import * as contract from "./entitlement.ts";
// @ts-expect-error TS5097: Deno needs the extension (see reconcile.ts).
import { ServiceError, serveRefresh, serveWebhook } from "./reconcile.ts";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The longest any one call may take. RevenueCat waits about a minute for a
 * webhook's answer; one that comes later is retried and found processed.
 */
export const CALL_TIMEOUT_MS = 10_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Lets go of an answer whose body isn't needed. */
async function discard(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

async function json(response: Response, who: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ServiceError(`${who}'s answer isn't JSON`);
  }
}

async function failed(response: Response, who: string): Promise<never> {
  await discard(response);
  throw new ServiceError(`${who} answered ${response.status}`);
}

/**
 * The Forge account in Supabase Auth's answer about a token's user: never
 * an anonymous sign-in, which holds no membership (as in the draft's row
 * level security).
 */
function accountOf(user: unknown): string | undefined {
  if (!isRecord(user) || user.is_anonymous === true) return undefined;
  return contract.isAccountId(user.id) ? user.id.toLowerCase() : undefined;
}

const LATEST = Date.UTC(9999, 11, 31);
const eventTime = (ms: number | null) =>
  ms !== null && ms >= 0 && ms <= LATEST ? new Date(ms).toISOString() : null;

/** Supabase and RevenueCat, for one function's configuration. */
export function supabaseServices(
  fetchImpl: Fetch,
  options: { timeoutMs?: number; now?: () => number } = {},
): Connect {
  const timeoutMs = options.timeoutMs ?? CALL_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  return (settings): Services => {
    const call = (url: string, init: RequestInit) =>
      fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const auth = `${settings.supabaseUrl}/auth/v1`;
    const rest = `${settings.supabaseUrl}/rest/v1`;
    // The Edge Functions' own role (service_role): the project's secret key,
    // on apikey. A legacy key is a JWT and also goes as the bearer; a new
    // key (sb_…) is no JWT and never goes in Authorization, where anything
    // verifying it as one fails. The role bypasses row level security, but
    // only reads, adds and updates (the draft's grants).
    const secretKey = settings.serviceRoleKey;
    const service: Record<string, string> = { apikey: secretKey };
    if (!secretKey.startsWith("sb_"))
      service.authorization = `Bearer ${secretKey}`;
    // A request made as the caller: the publishable key, with their own
    // token as the bearer. Never the secret key, which would make it the
    // service role's.
    const asCaller = (jwt: string) => ({
      apikey: settings.publishableKey,
      authorization: `Bearer ${jwt}`,
    });
    const eventUrl = (id: string) =>
      `${rest}/forge_entitlement_events?id=eq.${encodeURIComponent(id)}`;

    return {
      async userFromToken(jwt) {
        const res = await call(`${auth}/user`, {
          method: "GET",
          headers: { ...asCaller(jwt), accept: "application/json" },
        });
        // Supabase Auth refuses a bad, expired or signed-out token, or a
        // deleted user's, with one of these.
        if ([400, 401, 403, 404].includes(res.status)) {
          await discard(res);
          return undefined;
        }
        if (!res.ok) return failed(res, "Supabase Auth");
        return accountOf(await json(res, "Supabase Auth"));
      },

      async fetchSubscriber(appUserId) {
        const res = await call(contract.subscriberUrl(appUserId), {
          method: "GET",
          headers: {
            authorization: `Bearer ${settings.revenueCatKey}`,
            accept: "application/json",
          },
        });
        // 200, or 201 when RevenueCat first meets the App User ID.
        if (!res.ok) return failed(res, "RevenueCat");
        return json(res, "RevenueCat");
      },

      async saveEntitlement(row) {
        // PostgREST's upsert: insert ... on conflict (user_id) do update,
        // under the draft's guard.
        const res = await call(
          `${rest}/forge_entitlements?on_conflict=user_id`,
          {
            method: "POST",
            headers: {
              ...service,
              "content-type": "application/json",
              prefer: "resolution=merge-duplicates,return=minimal",
            },
            body: JSON.stringify(row),
          },
        );
        if (res.ok) {
          await discard(res);
          return "saved";
        }
        // PostgREST answers a constraint violation with 409 and Postgres's
        // code: 23503 is the row's account (auth.users) being gone.
        if (res.status === 409) {
          const problem = await res.json().catch(() => undefined);
          if (isRecord(problem) && problem.code === "23503")
            return "no_account";
          throw new ServiceError("the database answered 409");
        }
        return failed(res, "the database");
      },

      async readEntitlement(_userId, jwt) {
        const res = await call(`${rest}/rpc/forge_entitlement`, {
          method: "POST",
          headers: {
            ...asCaller(jwt),
            "content-type": "application/json",
            accept: "application/json",
          },
          body: "{}",
        });
        if (!res.ok) return failed(res, "forge_entitlement()");
        return json(res, "forge_entitlement()");
      },

      async receiveEvent(event) {
        const found = await call(`${eventUrl(event.id)}&select=processed_at`, {
          method: "GET",
          headers: { ...service, accept: "application/json" },
        });
        if (!found.ok) return failed(found, "the database");
        const rows = await json(found, "the database");
        if (!Array.isArray(rows))
          throw new ServiceError("the database's answer isn't a list");
        if (rows.length)
          return {
            processed: isRecord(rows[0]) && rows[0].processed_at != null,
          };
        // First receipt: insert ... on conflict (id) do nothing, so two
        // deliveries arriving together record it once.
        const res = await call(`${rest}/forge_entitlement_events`, {
          method: "POST",
          headers: {
            ...service,
            "content-type": "application/json",
            prefer: "resolution=ignore-duplicates,return=minimal",
          },
          body: JSON.stringify({
            id: event.id,
            type: event.type,
            environment: event.environment,
            event_at: eventTime(event.eventAt),
          }),
        });
        if (!res.ok) return failed(res, "the database");
        await discard(res);
        return { processed: false };
      },

      async markProcessed(eventId, userId) {
        // Only an unprocessed event: the first to finish marks it.
        const res = await call(`${eventUrl(eventId)}&processed_at=is.null`, {
          method: "PATCH",
          headers: {
            ...service,
            "content-type": "application/json",
            prefer: "return=minimal",
          },
          body: JSON.stringify({
            processed_at: new Date(now()).toISOString(),
            user_id: userId,
          }),
        });
        if (!res.ok) return failed(res, "the database");
        await discard(res);
      },
    };
  };
}

const logError: Log = (line) => console.error(line);

/** entitlement-refresh, wired: `Deno.serve(entitlementRefresh(env, fetch))`. */
export const entitlementRefresh = (
  env: Env,
  fetchImpl: Fetch,
  log: Log = logError,
) => serveRefresh(env, supabaseServices(fetchImpl), log);

/** entitlement-webhook, wired the same way. */
export const entitlementWebhook = (
  env: Env,
  fetchImpl: Fetch,
  log: Log = logError,
) => serveWebhook(env, supabaseServices(fetchImpl), log);
