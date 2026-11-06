import {
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { Tokens } from "./reauth";

// PKCE for links back into Forge (Phase 7.8E, Stage 5, E5): PREPARED, NOT
// ACTIVE. Forge's sign-ins still use Supabase's implicit flow (tokens in the
// link's fragment). With PKCE a link carries only a one-time code, which only
// the client that started the flow can exchange: it holds the matching
// verifier. A copied link is then useless anywhere else.
//
// supabase-js saves an exchanged session in the starting client's storage and
// announces it to that client's listeners. A confirmation must therefore start
// on a client that stores nothing (verifierClient), never on this phone's own
// client: otherwise a different account would be signed in here before
// anyone checked it (adoptIfSameAccount).
//
// Nothing here logs a code, a token or a verifier. Activation: 7.8E report,
// section 13.

type Runtime = { crypto?: unknown; TextEncoder?: unknown };

/**
 * Whether this runtime can do PKCE properly. Without Web Crypto, supabase-js
 * quietly makes the verifier with Math.random and sends it as a "plain"
 * challenge, which anyone who sees the sign-in address can read.
 */
export function pkceSupported(runtime: Runtime = globalThis): boolean {
  const crypto = runtime.crypto as
    { getRandomValues?: unknown; subtle?: { digest?: unknown } } | undefined;
  return (
    typeof crypto?.getRandomValues === "function" &&
    typeof crypto.subtle?.digest === "function" &&
    typeof runtime.TextEncoder === "function"
  );
}

/** The client options that switch PKCE on, only where it is real PKCE. */
export function pkceAuthOptions(runtime: Runtime = globalThis) {
  if (!pkceSupported(runtime))
    throw new Error("PKCE needs Web Crypto, which this runtime lacks");
  return { flowType: "pkce" } as const;
}

/** What a link back into Forge carries. */
export type AuthCallback =
  | { kind: "code"; code: string; flowId?: string }
  | { kind: "error"; code: string; description?: string }
  | { kind: "none" };

// Supabase's codes are opaque URL-safe strings, and flow IDs have the shape
// supabase-js gives them (`sb_flow_id`). Anything else isn't a callback.
const CODE = /^[A-Za-z0-9._~-]{8,512}$/;
const FLOW_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Reads a PKCE callback: a code in the query (never the fragment), with its
 * flow ID when there is one, or the account service's error. Implicit-flow
 * tokens and anything unreadable are "none".
 */
export function readAuthCallback(url: string): AuthCallback {
  try {
    const u = new URL(url);
    const hash = new URLSearchParams(u.hash.replace(/^#/, ""));
    const get = (key: string) => u.searchParams.get(key) ?? hash.get(key);
    const error = get("error_code") ?? get("error");
    if (error)
      return {
        kind: "error",
        code: error,
        description: get("error_description") ?? undefined,
      };
    const code = u.searchParams.get("code");
    if (!code || !CODE.test(code)) return { kind: "none" };
    const flowId = u.searchParams.get("sb_flow_id");
    if (flowId === null) return { kind: "code", code };
    // A malformed flow ID is refused, not dropped: without it supabase-js
    // would try the latest flow's verifier and spend the single-use code.
    return FLOW_ID.test(flowId)
      ? { kind: "code", code, flowId }
      : { kind: "none" };
  } catch {
    return { kind: "none" };
  }
}

/** The account service's answers for a used, expired or foreign flow. */
const EXPIRED = new Set([
  "flow_state_expired",
  "flow_state_not_found",
  "bad_code_verifier",
  "pkce_code_verifier_not_found",
  "otp_expired",
]);

export type ExchangeOutcome =
  | { kind: "exchanged"; tokens: Tokens; userId: string }
  /** This code was already handled here: a duplicate callback, ignored. */
  | { kind: "duplicate" }
  /**
   * The code can't be used: start the sign-in or confirmation again.
   * supabase-js discards a flow's verifier after any failed exchange, so not
   * even a lost answer ("network") can be retried with the same code.
   */
  | { kind: "restart"; reason: "expired" | "network" | "refused" };

// Codes this runtime has handled. Kept only in memory.
const handled = new Set<string>();

/**
 * Exchanges a code once, on `starter`: the client that started the flow,
 * which holds its verifier. The tokens are returned for the caller to check;
 * this module keeps none of them.
 */
export async function exchangeOnce(
  starter: Pick<SupabaseClient, "auth">,
  callback: { code: string; flowId?: string },
): Promise<ExchangeOutcome> {
  const { code, flowId } = callback;
  if (handled.has(code)) return { kind: "duplicate" };
  handled.add(code);
  try {
    const { data, error } = await starter.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    if (error) {
      if (isAuthRetryableFetchError(error))
        return { kind: "restart", reason: "network" };
      const reason = (error as { code?: unknown }).code;
      return {
        kind: "restart",
        reason:
          typeof reason === "string" && EXPIRED.has(reason)
            ? "expired"
            : "refused",
      };
    }
    if (!data.session) return { kind: "restart", reason: "refused" };
    return {
      kind: "exchanged",
      tokens: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      userId: data.session.user.id,
    };
  } catch {
    return { kind: "restart", reason: "network" };
  }
}
