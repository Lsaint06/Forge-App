// Failures that stop a synchronization (Phase 7.8B, H3). None of them is
// about one record, so trying the remaining records would only repeat it.

/**
 * Why a sync stopped early: no connection or no reply in time (`offline`),
 * the cloud not answering (`unavailable`), or the sign-in not confirmed
 * (`auth`). Nothing further is tried until the next sync.
 */
export type SyncStop = "offline" | "unavailable" | "auth";

/** Thrown by a transport when a sync should stop (see `SyncStop`). */
export class SyncStopError extends Error {
  constructor(
    readonly reason: SyncStop,
    message: string,
  ) {
    super(message);
    this.name = "SyncStopError";
  }
}

/** The stop an error means, or undefined when it's about one record. */
export function stopReason(e: unknown): SyncStop | undefined {
  if (!e || typeof e !== "object") return undefined;
  const { name, reason, message } = e as {
    name?: unknown;
    reason?: unknown;
    message?: unknown;
  };
  if (
    name === "SyncStopError" &&
    (reason === "offline" || reason === "unavailable" || reason === "auth")
  )
    return reason;
  if (name === "AbortError" || name === "TimeoutError") return "offline";
  if (
    e instanceof TypeError &&
    typeof message === "string" &&
    /network|fetch|internet|offline|timed? ?out/i.test(message)
  )
    return "offline";
  return undefined;
}
