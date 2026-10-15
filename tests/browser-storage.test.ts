import test from "node:test";
import assert from "node:assert/strict";
import {
  invokeWorkerSync,
  sendWorkerResult,
} from "../src/platform/sqliteWorkerChannel.web";

function workerReply(result: unknown, error: Error | null = null) {
  return {
    postMessage(message: {
      id: number;
      lockBuffer: SharedArrayBuffer;
      resultBuffer: SharedArrayBuffer;
    }) {
      sendWorkerResult({ id: message.id, result, error, syncTrait: message });
    },
  } as unknown as Worker;
}

test("browser SQLite bridge preserves responses longer than 255 bytes", () => {
  const rows = Array.from({ length: 366 }, (_, i) => ({
    id: i,
    name: "Exercise " + i,
  }));
  assert.deepEqual(
    invokeWorkerSync(workerReply(rows), "getAll", {
      nativeDatabaseId: 1,
      nativeStatementId: 1,
    }),
    rows,
  );
});

test("browser SQLite bridge preserves binary results and reports SQL errors", () => {
  const bytes = new Uint8Array([0, 255, 128, 12]);
  assert.deepEqual(
    invokeWorkerSync(workerReply(bytes), "serialize", {
      nativeDatabaseId: 1,
      schemaName: "main",
    }),
    bytes,
  );
  assert.throws(
    () =>
      invokeWorkerSync(
        workerReply(null, new Error("SQL constraint failed")),
        "exec",
        {
          nativeDatabaseId: 1,
          source: "invalid SQL",
        },
      ),
    /SQL constraint failed/,
  );
});

test("oversized browser SQLite responses fail explicitly instead of hanging", () => {
  assert.throws(
    () =>
      invokeWorkerSync(workerReply("x".repeat(1_100_000)), "getAll", {
        nativeDatabaseId: 1,
        nativeStatementId: 1,
      }),
    /exceeds the worker limit/,
  );
});
