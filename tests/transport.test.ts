import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { cloudFailure, transport, withTimeout } from "../src/cloud/transport";
import { stopReason, SyncStopError } from "../src/cloud/errors";
import { cloudTime } from "../src/cloud/sync";
import type { Outbox } from "../src/domain/types";

// Phase 7.8B, H3: how the Supabase transport reports failures to sync,
// using the response shapes supabase-js 2.118 produces (`status` 0 when no
// reply arrived, PostgREST's error body otherwise). Phase 7.8C: incremental
// and by-id reads, against an in-memory table that evaluates the same
// filters PostgREST would.

const me = "user-a";
type Reply = { data: unknown; error: unknown; status: number };
type Session = {
  data: { session: { user: { id: string } } | null };
  error: unknown;
};
const signedIn = (id = me): Session => ({
  data: { session: { user: { id } } },
  error: null,
});
const op: Outbox = {
  id: "record-1",
  kind: "journal",
  payload: JSON.stringify({ id: "record-1" }),
  revision: 0,
  attempts: 0,
  nextAttempt: 0,
  deleted: 0,
};
type Stored = {
  id: string;
  kind: string;
  payload: unknown;
  revision: number;
  deleted: boolean;
  updated_at?: string;
};
type Query = {
  count?: string;
  since?: string;
  after?: { at: string; id: string };
  ids?: string[];
  order: string[];
  range?: [number, number];
};
const timeKey = (t: string | undefined) => (t ? (cloudTime(t)?.key ?? "") : "");
function fake(
  options: {
    sessions?: (() => Promise<Session>)[];
    rpc?: () => Promise<Reply>;
    /** The account's rows, as the table holds them. */
    rows?: Stored[];
    /** Replies that replace the next reads, in order (failures). */
    failures?: Reply[];
    pageSize?: number;
  } = {},
) {
  const calls = { sessions: 0, rpc: 0, queries: [] as Query[] };
  // A thenable query like supabase-js's: filters chain, `await` runs it.
  function query() {
    const q: Query = { order: [] };
    const builder = {
      select(_columns: string, opts?: { count?: string }) {
        if (opts?.count) q.count = opts.count;
        return builder;
      },
      gte(column: string, value: string) {
        assert.equal(column, "updated_at");
        q.since = value;
        return builder;
      },
      or(filter: string) {
        const m =
          /^updated_at\.gt\."(.+)",and\(updated_at\.eq\."(.+)",id\.gt\."(.+)"\)$/.exec(
            filter,
          );
        assert.ok(m && m[1] === m[2], filter);
        q.after = { at: m[1]!, id: m[3]! };
        return builder;
      },
      in(column: string, ids: string[]) {
        assert.equal(column, "id");
        q.ids = ids;
        return builder;
      },
      order(column: string) {
        q.order.push(column);
        return builder;
      },
      range(from: number, to: number) {
        q.range = [from, to];
        return builder;
      },
      then(
        resolve: (value: unknown) => unknown,
        reject: (e: unknown) => unknown,
      ) {
        calls.queries.push(q);
        const failure = options.failures?.shift();
        if (failure) return Promise.resolve(failure).then(resolve, reject);
        let rows = [...(options.rows ?? [])];
        if (q.ids) rows = rows.filter((r) => q.ids!.includes(r.id));
        if (q.since)
          rows = rows.filter((r) => timeKey(r.updated_at) >= timeKey(q.since));
        if (q.after) {
          const a = timeKey(q.after.at);
          rows = rows.filter((r) => {
            const k = timeKey(r.updated_at);
            return k > a || (k === a && r.id > q.after!.id);
          });
        }
        if (q.order.length)
          rows.sort((x, y) => {
            const kx = timeKey(x.updated_at);
            const ky = timeKey(y.updated_at);
            if (kx !== ky) return kx < ky ? -1 : 1;
            return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
          });
        const total = rows.length;
        if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
        return Promise.resolve({
          data: rows.map((r) => structuredClone(r)),
          error: null,
          status: 200,
          count: q.count ? total : null,
        }).then(resolve, reject);
      },
    };
    return builder;
  }
  const client = {
    auth: {
      getSession: () => {
        const next =
          options.sessions?.[calls.sessions] ?? (async () => signedIn());
        calls.sessions++;
        return next();
      },
    },
    rpc: async () => {
      calls.rpc++;
      return (
        options.rpc ??
        (async () => ({ data: { revision: 1 }, error: null, status: 200 }))
      )();
    },
    from: () => query(),
  };
  return {
    cloud: transport(client as unknown as SupabaseClient, me, {
      ...(options.pageSize ? { pageSize: options.pageSize } : {}),
    }),
    calls,
  };
}
const at = (second: number, micro = 0) =>
  `2026-10-31T07:00:${String(second).padStart(2, "0")}.${String(micro).padStart(6, "0")}+00:00`;
const stored = (id: string, updated_at: string, revision = 1): Stored => ({
  id,
  kind: "journal",
  payload: {},
  revision,
  deleted: false,
  updated_at,
});
const failure = (status: number, message: string, code = ""): Reply => ({
  data: null,
  error: { message, code, details: "", hint: "" },
  status,
});
async function reason(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (e) {
    return {
      stop: stopReason(e),
      message: e instanceof Error ? e.message : "",
    };
  }
  throw new Error("expected a failure");
}

test("no reply at all, or no reply in time, stops the sync as offline", async () => {
  for (const message of [
    "TypeError: Network request failed",
    "AbortError: Aborted",
  ]) {
    const { cloud } = fake({ rpc: async () => failure(0, message) });
    assert.equal((await reason(cloud.write(op))).stop, "offline");
  }
});

test("a sign-in the cloud doesn't accept stops the sync as auth", async () => {
  for (const reply of [
    failure(400, "Authentication required", "P0001"),
    failure(401, "JWT expired", "PGRST301"),
    failure(403, "permission denied for function forge_write", "42501"),
  ]) {
    const { cloud } = fake({ rpc: async () => reply });
    assert.equal((await reason(cloud.write(op))).stop, "auth");
  }
});

test("a cloud that isn't answering stops the sync as unavailable", async () => {
  for (const status of [408, 429, 502, 503, 504, 520]) {
    const { cloud } = fake({ rpc: async () => failure(status, "Unavailable") });
    assert.equal(
      (await reason(cloud.write(op))).stop,
      "unavailable",
      String(status),
    );
  }
});

test("the cloud refusing one record doesn't stop the sync", async () => {
  for (const reply of [
    failure(400, "Invalid identity", "P0001"),
    failure(400, "new row violates check constraint", "23514"),
    failure(500, "Internal error"),
  ]) {
    const { cloud } = fake({ rpc: async () => reply });
    const result = await reason(cloud.write(op));
    assert.equal(result.stop, undefined);
    assert.ok(
      result.message.includes(
        String((reply.error as { message: string }).message),
      ),
    );
  }
});

test("the sign-in is checked before anything is read or sent", async () => {
  const cases: [() => Promise<Session>, string][] = [
    [
      async () => ({
        data: { session: null },
        error: new AuthRetryableFetchError("Failed to fetch", 0),
      }),
      "offline",
    ],
    [async () => signedIn("user-b"), "auth"],
    [async () => ({ data: { session: null }, error: null }), "auth"],
    [
      async () => {
        throw new Error("Keychain unavailable");
      },
      "auth",
    ],
  ];
  for (const [session, expected] of cases) {
    const write = fake({ sessions: [session] });
    assert.equal((await reason(write.cloud.write(op))).stop, expected);
    assert.equal(write.calls.rpc, 0, "nothing sent");
    const list = fake({ sessions: [session] });
    assert.equal((await reason(list.cloud.list())).stop, expected);
    assert.deepEqual(list.calls.queries, [], "nothing read");
  }
});

test("a change of account during a write stops the sync after the reply", async () => {
  const { cloud, calls } = fake({
    sessions: [async () => signedIn(), async () => signedIn("user-b")],
  });
  assert.equal((await reason(cloud.write(op))).stop, "auth");
  assert.equal(calls.rpc, 1);
});

test("replies: the new revision, or the cloud's copy on a conflict", async () => {
  const saved = fake({
    rpc: async () => ({ data: { revision: 3 }, error: null, status: 200 }),
  });
  assert.deepEqual(await saved.cloud.write(op), { revision: 3 });
  const copy = {
    id: "record-1",
    kind: "journal",
    payload: {},
    revision: 2,
    deleted: false,
  };
  const conflict = fake({
    rpc: async () => ({ data: { conflict: copy }, error: null, status: 200 }),
  });
  assert.deepEqual(await conflict.cloud.write(op), { conflict: copy });
  const odd = fake({
    rpc: async () => ({ data: null, error: null, status: 200 }),
  });
  const result = await reason(odd.cloud.write(op));
  assert.equal(result.stop, undefined);
  assert.match(result.message, /Invalid synchronization response/);
});

// Phase 7.8C: incremental and by-id reads.

test("every record is read once, oldest change first, even when a page ends inside a run of equal times", async () => {
  // Seven of ten records share one time; pages of three.
  const rows = ["j", "e", "a", "i", "c", "g", "b"]
    .map((id) => stored(id, at(5, 123456)))
    .concat([stored("z", at(1)), stored("y", at(9)), stored("x", at(9, 1))]);
  const { cloud, calls } = fake({ rows, pageSize: 3 });
  const got = await cloud.list();
  assert.deepEqual(
    got.map((r) => r.id),
    ["z", "a", "b", "c", "e", "g", "i", "j", "y", "x"],
  );
  assert.equal(got[0]!.updatedAt, at(1), "the cloud's time comes with it");
  // The total is asked for once; later pages follow the last record.
  assert.equal(calls.queries[0]!.count, "exact");
  assert.ok(calls.queries.slice(1).every((q) => q.after && !q.count));
  assert.ok(calls.queries.every((q) => q.range?.join() === "0,2"));
  assert.deepEqual(calls.queries[0]!.order, ["updated_at", "id"]);
});

test("only records changed since a time are read; progress counts toward the reported total", async () => {
  const rows = [
    stored("old", at(1)),
    stored("a", at(30)),
    stored("b", at(31)),
    stored("c", at(32)),
    stored("d", at(33)),
  ];
  const { cloud } = fake({ rows, pageSize: 3 });
  const progress: [number, number | undefined][] = [];
  const got = await cloud.list({
    since: "2026-10-31T07:00:10.000Z",
    onPage: (received, total) => progress.push([received, total]),
  });
  assert.deepEqual(
    got.map((r) => r.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(progress, [
    [3, 4],
    [4, 4],
  ]);
});

test("held records are fetched by id, in groups small enough for the address", async () => {
  const rows = Array.from({ length: 300 }, (_, i) => stored(`r${i}`, at(1)));
  const { cloud, calls } = fake({ rows });
  const got = await cloud.list({ ids: rows.slice(0, 250).map((r) => r.id) });
  assert.equal(got.length, 250);
  assert.deepEqual(
    calls.queries.map((q) => q.ids?.length),
    [100, 100, 50],
  );
});

test("a full page without cloud times stops the download rather than skip records", async () => {
  const rows = [0, 1, 2].map((i) => ({
    ...stored(`r${i}`, at(1)),
    updated_at: undefined,
  }));
  const result = await reason(fake({ rows, pageSize: 3 }).cloud.list());
  assert.equal(result.stop, undefined);
  assert.match(result.message, /Invalid synchronization response/);
  const offline = fake({
    failures: [failure(0, "TypeError: Network request failed")],
  });
  assert.equal((await reason(offline.cloud.list())).stop, "offline");
});

test("cloudFailure keeps the record's own error code for the developer log", () => {
  const e = cloudFailure({ message: "Invalid identity", code: "P0001" }, 400);
  assert.ok(!(e instanceof SyncStopError));
  assert.equal(e.message, "P0001: Invalid identity");
  assert.equal(cloudFailure({}, 400).message, "Request failed (400)");
});

// The request time limit (every Supabase request goes through it).

function never() {
  const signals: AbortSignal[] = [];
  const base = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init!.signal!;
    signals.push(signal);
    return new Promise<Response>((_, reject) =>
      signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      ),
    );
  }) as typeof fetch;
  return { base, signals };
}

test("a request that never answers gives up: writes sooner than reads", async () => {
  const { base } = never();
  const timed = withTimeout(base, { read: 60, write: 10 });
  const order: string[] = [];
  const read = timed("https://x/rest/v1/forge_records").catch((e: unknown) => {
    order.push("read");
    return e;
  });
  const write = timed("https://x/rest/v1/rpc/forge_write", {
    method: "POST",
  }).catch((e: unknown) => {
    order.push("write");
    return e;
  });
  const [r, w] = await Promise.all([read, write]);
  assert.deepEqual(order, ["write", "read"]);
  assert.equal(stopReason(r), "offline");
  assert.equal(stopReason(w), "offline");
});

test("a caller's own cancellation still applies", async () => {
  const { base } = never();
  const caller = new AbortController();
  const pending = withTimeout(base, { read: 10_000, write: 10_000 })(
    "https://x",
    {
      signal: caller.signal,
    },
  );
  caller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});

test("an answer in time passes through, and its time limit is cleared", async () => {
  const signals: AbortSignal[] = [];
  const reply = new Response("[]", { status: 200 });
  const base = ((_input: RequestInfo | URL, init?: RequestInit) => {
    signals.push(init!.signal!);
    return Promise.resolve(reply);
  }) as typeof fetch;
  const result = await withTimeout(base, { read: 20, write: 20 })("https://x");
  assert.equal(result, reply);
  await new Promise((done) => setTimeout(done, 40));
  assert.equal(signals[0]!.aborted, false);
});
