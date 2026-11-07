import {
  VerifierError,
  type EntitlementVerifier,
  type VerifierProblem,
} from "./provider";

// Forge's server, as the app asks it (Phase 9.3): the Edge Function
// `entitlement-refresh`, which reads RevenueCat with a server-only secret and
// keeps the account's row, and `forge_entitlement()`, the row it already
// keeps. Both run as the signed-in account through the app's own Supabase
// client (runtime.ts passes them in). What they answer is only raw data here:
// service.ts checks it field by field before anything decides access.
//
// Neither exists on a Supabase project yet (the migration is a draft and the
// functions aren't deployed: docs/SUBSCRIPTIONS.md), so today every call ends
// as `unavailable`, and nothing is ever granted.

export type ServerReply = { data: unknown; error: unknown };

export type VerifierClient = {
  /** supabase.functions.invoke(name, { method: "POST" }) */
  invoke: (name: string) => Promise<ServerReply>;
  /** supabase.rpc(name) */
  rpc: (name: string) => PromiseLike<ServerReply>;
};

const OFFLINE = /network|fetch|internet|offline|abort|timed? ?out|timeout/i;

/** Why a reply carried an error: the connection, the sign-in or the service. */
export function replyProblem(error: unknown): VerifierProblem {
  const e = (error ?? {}) as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    context?: { status?: unknown };
  };
  const name = typeof e.name === "string" ? e.name : "";
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : "";
  const status =
    typeof e.context?.status === "number"
      ? e.context.status
      : typeof e.status === "number"
        ? e.status
        : undefined;
  // supabase-js: the request never reached the function.
  if (name === "FunctionsFetchError") return "offline";
  if (status === 401 || status === 403) return "auth";
  // PostgREST: an expired or refused sign-in, or no privilege.
  if (code === "42501" || /^PGRST30\d$/.test(code)) return "auth";
  if (name === "AbortError" || name === "TimeoutError") return "offline";
  if (!status && !code && OFFLINE.test(`${name} ${message}`)) return "offline";
  // Not deployed (404, PGRST202), failing (5xx) or relayed badly.
  return "unavailable";
}

const missing = () =>
  new VerifierError(
    "unavailable",
    "Forge's server isn't configured in this build",
  );

export function serverVerifier(
  client: () => VerifierClient | undefined,
): EntitlementVerifier {
  async function ask(call: (c: VerifierClient) => PromiseLike<ServerReply>) {
    const c = client();
    if (!c) throw missing();
    let reply: ServerReply;
    try {
      reply = await call(c);
    } catch (e) {
      throw new VerifierError(
        replyProblem(e),
        "Forge's server couldn't be reached",
      );
    }
    if (reply.error)
      throw new VerifierError(
        replyProblem(reply.error),
        "Forge's server didn't answer",
      );
    return reply.data;
  }
  return {
    refresh: () => ask((c) => c.invoke("entitlement-refresh")),
    read: () => ask((c) => c.rpc("forge_entitlement")),
  };
}
