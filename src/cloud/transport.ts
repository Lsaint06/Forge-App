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
/** Ids per by-id request: keeps the address well under PostgREST's limit. */
const ID_CHUNK = 100;
const COLUMNS = "id,kind,payload,revision,deleted,updated_at";
type Row = Omit<CloudRecord, "updatedAt"> & { updated_at?: unknown };
const record = ({ updated_at, ...row }: Row): CloudRecord =>
  typeof updated_at === "string" ? { ...row, updatedAt: updated_at } : row;
/** A filter value in double quotes: cloud times and ids hold `.` and `:`. */
const quoted = (v: string) => `"${v.replace(/[\\"]/g, (c) => `\\${c}`)}"`;

export function transport(
  client: SupabaseClient,
  userId: string,
  { pageSize = PAGE }: { pageSize?: number } = {},
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
    /**
     * The account's records, oldest change first. Pages follow the last
     * record received (its cloud time, then its id) rather than an offset,
     * so records sharing a time are never skipped and a record changed
     * mid-download moves to a later page instead of shifting others.
     */
    async list({ since, ids, onPage } = {}) {
      await requireOwner();
      const records: CloudRecord[] = [];
      if (ids) {
        for (let i = 0; i < ids.length; i += ID_CHUNK) {
          const { data, error, status } = await client
            .from("forge_records")
            .select(COLUMNS)
            .in("id", ids.slice(i, i + ID_CHUNK));
          if (error) throw cloudFailure(error, status);
          await requireOwner();
          records.push(...((data ?? []) as Row[]).map(record));
        }
        return records;
      }
      let after: { at: string; id: string } | undefined;
      let total: number | undefined;
      for (;;) {
        let query = client
          .from("forge_records")
          .select(COLUMNS, after ? undefined : { count: "exact" });
        if (since) query = query.gte("updated_at", since);
        if (after) {
          const at = quoted(after.at);
          query = query.or(
            `updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${quoted(after.id)})`,
          );
        }
        const { data, error, status, count } = await query
          .order("updated_at")
          .order("id")
          .range(0, pageSize - 1);
        if (error) throw cloudFailure(error, status);
        await requireOwner();
        const page = ((data ?? []) as Row[]).map(record);
        if (!after && typeof count === "number") total = count;
        records.push(...page);
        onPage?.(records.length, total);
        if (page.length < pageSize) break;
        const last = page[page.length - 1]!;
        // Without the cloud's time the next page can't be found safely.
        if (!last.updatedAt)
          throw new Error("Invalid synchronization response");
        after = { at: last.updatedAt, id: last.id };
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
