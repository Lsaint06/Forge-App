// SDK 57's sync bridge counts spin iterations. On browsers with Atomics.pause,
// that budget expires during ordinary schema/transaction work. Keep Expo's
// async protocol and serialization, but give synchronous calls a real deadline.
import {
  deserialize,
  serialize,
} from "../../node_modules/expo-sqlite/web/SyncSerializer";
import type {
  SQLiteWorkerMessageType,
  MessageTypeMap,
  ResultTypeMap,
} from "../../node_modules/expo-sqlite/web/web.types";
// Require the runtime module without pulling its upstream source TypeScript
// into this app's stricter compiler settings. Metro resolves the literal path.
/* eslint-disable @typescript-eslint/no-require-imports -- Runtime-only import avoids compiling upstream TS with app compiler flags. */
const upstream =
  require("../../node_modules/expo-sqlite/web/WorkerChannel") as {
    invokeWorkerAsync: <T>(
      worker: Worker,
      type: string,
      data: unknown,
    ) => Promise<T>;
    workerMessageHandler: (event: MessageEvent) => void;
    sendWorkerResult: (message: unknown) => void;
  };
/* eslint-enable @typescript-eslint/no-require-imports */
export const { invokeWorkerAsync, workerMessageHandler } = upstream;

export function sendWorkerResult(message: {
  id: number;
  result: unknown;
  error: Error | null;
  syncTrait?: {
    lockBuffer: SharedArrayBuffer;
    resultBuffer: SharedArrayBuffer;
  };
}) {
  if (!message.syncTrait) {
    upstream.sendWorkerResult(message);
    return;
  }
  const { lockBuffer, resultBuffer } = message.syncTrait;
  let bytes = new TextEncoder().encode(
    serialize(
      message.error
        ? { error: message.error.message }
        : { result: message.result },
    ),
  );
  if (bytes.length > resultBuffer.byteLength - 4) {
    bytes = new TextEncoder().encode(
      serialize({
        error:
          "Browser database response exceeds the worker limit. Use a smaller backup or the phone app for large histories.",
      }),
    );
  }
  // Write all four length bytes; Uint8Array.set(Uint32Array) truncates to one.
  new DataView(resultBuffer).setUint32(0, bytes.length, true);
  new Uint8Array(resultBuffer).set(bytes, 4);
  Atomics.store(new Int32Array(lockBuffer), 0, 2);
}

// Expo's async IDs are nonnegative. Sync responses go through shared memory.
let messageId = -1;
export function invokeWorkerSync<
  T extends SQLiteWorkerMessageType & keyof ResultTypeMap,
>(worker: Worker, type: T, data: MessageTypeMap[T]["data"]): ResultTypeMap[T] {
  const lockBuffer = new SharedArrayBuffer(4);
  const lock = new Int32Array(lockBuffer);
  const resultBuffer = new SharedArrayBuffer(1024 * 1024);
  Atomics.store(lock, 0, 1);
  worker.postMessage({
    type,
    id: messageId--,
    data,
    isSync: true,
    lockBuffer,
    resultBuffer,
  });
  const deadline = performance.now() + 30_000;
  while (Atomics.load(lock, 0) === 1) {
    if (performance.now() >= deadline)
      throw new Error(
        "Browser database worker timed out. Close other FORGE tabs and reload.",
      );
  }
  const length = new Uint32Array(resultBuffer, 0, 1)[0]!;
  if (length > resultBuffer.byteLength - 4)
    throw new Error(
      "Browser database response exceeds the worker limit. Export a backup and use the phone app for large histories.",
    );
  // TextDecoder rejects views backed by SharedArrayBuffer in browsers.
  const copy = new Uint8Array(length);
  copy.set(new Uint8Array(resultBuffer, 4, length));
  const resultJson = new TextDecoder().decode(copy);
  const { result, error } = deserialize<{
    result: ResultTypeMap[T];
    error?: string;
  }>(resultJson);
  if (error) throw new Error(error);
  return result;
}
