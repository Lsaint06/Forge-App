import {
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { SyncStopError } from "./errors";
import type { CloudRecord, CloudTransport } from "./sync";

// Synchronization's side of Supabase: the account's records, read through
// row-level security and written only through `forge_write`. Phase 7.8B
// (H3): every failure says whether the sync should stop (no connection or
// reply, the cloud not answering, the sign-in not accepted) or whether only
// this record was refused.

/** How long a request may take before it counts as no reply. */
export const REQUEST_TIMEOUT_MS = { read: 60_000, write: 30_000 };

/**
 * `fetch` that gives up after a time limit. Reads, which can carry hundreds
 * of records, get longer than writes and sign-in requests. A caller's own
 * cancellation still applies.
 */
export function withTimeout(
  base: typeof fetch,
  limits = REQUEST_TIMEOUT_MS,
): typeof fetch {
  return (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const ms =
      method === "GET" || method === "HEAD" ? limits.read : limits.write;
    const controller = new AbortController();
    const outer = init?.signal ?? undefined;
    const abort = () => controller.abort();
    if (outer?.aborted) controller.abort();
    else outer?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, ms);
    return base(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", abort);
    });
  };
}

/**
 * A failed request as sync sees it. Status 0 is no reply at all (no
 * connection, or the time limit passed); 401/403 and the database's own
 * "Authentication required" mean the sign-in wasn't accepted; 408, 429 and
 * gateway errors mean the cloud isn't answering. Anything else is a refusal
 * of this one record.
 */
export function cloudFailure(
  error: { message?: unknown; code?: unknown },
  status: number,
): Error {
  const message =
    typeof error.message === "string" && error.message
      ? error.message
      : `Request failed (${status})`;
  const code = typeof error.code === "string" ? error.code : "";
  if (status === 0) return new SyncStopError("offline", message);
  if (
    status === 401 ||
    status === 403 ||
    code === "42501" ||
    /^PGRST30[1-3]$/.test(code) ||
    /^Authentication required$/i.test(message)
  )
    return new SyncStopError("auth", message);
  if (
    [408, 429, 502, 503, 504].includes(status) ||
    (status >= 520 && status < 600)
  )
    return new SyncStopError("unavailable", message);
  return new Error(code ? `${code}: ${message}` : message);
}

const PAGE = 500;

export function transport(
  client: SupabaseClient,
  userId: string,
): CloudTransport {
  /** The signed-in account is still the one this sync is for. */
  async function requireOwner() {
    let session;
    try {
      session = await client.auth.getSession();
    } catch (e) {
      throw new SyncStopError(
        "auth",
        e instanceof Error ? e.message : "The sign-in couldn't be read.",
      );
    }
    const { data, error } = session;
    if (error)
      throw new SyncStopError(
        isAuthRetryableFetchError(error) ? "offline" : "auth",
        error.message,
      );
    if (data.session?.user.id !== userId)
      throw new SyncStopError(
        "auth",
        "Authenticated account changed. Restart synchronization after logging in.",
      );
  }
  return {
    async list() {
      await requireOwner();
      const records: CloudRecord[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error, status } = await client
          .from("forge_records")
          .select("id,kind,payload,revision,deleted")
          .order("id")
          .range(offset, offset + PAGE - 1);
        if (error) throw cloudFailure(error, status);
        await requireOwner();
        const page = (data ?? []) as CloudRecord[];
        records.push(...page);
        if (page.length < PAGE) break;
      }
      return records;
    },
    async write(op) {
      await requireOwner();
      const { data, error, status } = await client.rpc("forge_write", {
        record_id: op.id,
        record_kind: op.kind,
        record_payload: JSON.parse(op.payload) as unknown,
        base_revision: op.revision,
        is_deleted: !!op.deleted,
      });
      if (error) throw cloudFailure(error, status);
      await requireOwner();
      const result = (data ?? {}) as {
        revision?: number;
        conflict?: CloudRecord;
      };
      if (result.conflict) return { conflict: result.conflict };
      if (typeof result.revision !== "number")
        throw new Error("Invalid synchronization response");
      return { revision: result.revision };
    },
  };
}
