import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { cloudFailure, transport, withTimeout } from "../src/cloud/transport";
import { stopReason, SyncStopError } from "../src/cloud/errors";
import type { Outbox } from "../src/domain/types";

// Phase 7.8B, H3: how the Supabase transport reports failures to sync,
// using the response shapes supabase-js 2.118 produces (`status` 0 when no
// reply arrived, PostgREST's error body otherwise).

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
function fake(
  options: {
    sessions?: (() => Promise<Session>)[];
    rpc?: () => Promise<Reply>;
    pages?: Reply[];
  } = {},
) {
  const calls = { sessions: 0, rpc: 0, ranges: [] as [number, number][] };
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
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            calls.ranges.push([from, to]);
            return (
              options.pages?.shift() ?? { data: [], error: null, status: 200 }
            );
          },
        }),
      }),
    }),
  };
  return { cloud: transport(client as unknown as SupabaseClient, me), calls };
}
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
    assert.deepEqual(list.calls.ranges, [], "nothing read");
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

test("every page of the account's records is read", async () => {
  const page = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => ({
      id: `r${from + i}`,
      kind: "journal",
      payload: {},
      revision: 1,
      deleted: false,
    }));
  const { cloud, calls } = fake({
    pages: [
      { data: page(500), error: null, status: 200 },
      { data: page(1, 500), error: null, status: 200 },
    ],
  });
  assert.equal((await cloud.list()).length, 501);
  assert.deepEqual(calls.ranges, [
    [0, 499],
    [500, 999],
  ]);
  const offline = fake({
    pages: [failure(0, "TypeError: Network request failed")],
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
