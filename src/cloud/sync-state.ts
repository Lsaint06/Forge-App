import type { Repository } from "../data/repository";

// What this phone remembers about its syncs with an account (Phase 7.8C).
// Kept in device settings: never synced, never in backups, removed with the
// rest of the phone's data. Each record names the account it describes, and
// a record for any other account is ignored, so one athlete's sync history
// can never be shown or used for another.

const CURSOR = "syncCursor";
const RETRY = "syncRetry";
const STATUS = "syncStatus";

function read(
  r: Repository,
  key: string,
  owner: string,
): Record<string, unknown> | undefined {
  const raw = r.setting(key);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return !!value &&
      typeof value === "object" &&
      (value as { owner?: unknown }).owner === owner
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
const time = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;

/**
 * How far downloads have reached: the cloud's own time of the latest change
 * received (`at`, exactly as the cloud wrote it), and when this phone last
 * downloaded everything (`fullAt`, this phone's clock).
 */
export type SyncCursor = { at?: string; fullAt: number };

export function syncCursor(
  r: Repository,
  owner: string,
): SyncCursor | undefined {
  const c = read(r, CURSOR, owner);
  const fullAt = time(c?.fullAt);
  if (!c || fullAt === undefined) return undefined;
  return typeof c.at === "string" && c.at ? { at: c.at, fullAt } : { fullAt };
}

export function saveSyncCursor(r: Repository, owner: string, c: SyncCursor) {
  r.setSetting(CURSOR, JSON.stringify({ owner, ...c }));
}

/**
 * Cloud records this phone couldn't take yet (they need a newer Forge, a
 * workout in progress elsewhere, or couldn't be read). Incremental syncs
 * fetch them again by id, so an update brings them in.
 */
export function syncRetryIds(r: Repository, owner: string): string[] {
  const ids = read(r, RETRY, owner)?.ids;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string" && !!id)
    : [];
}

export function saveSyncRetry(r: Repository, owner: string, ids: string[]) {
  if (ids.length) r.setSetting(RETRY, JSON.stringify({ owner, ids }));
  else r.clearSetting(RETRY);
}

/**
 * How a sync ended. `complete`: it ran to the end and this phone and the
 * cloud agree: nothing waiting to upload, nothing refused, held, unreadable
 * or in conflict. `partial`: it ran to the end with any of those left.
 * `stopped`: no connection, the cloud not answering, or the sign-in not
 * confirmed.
 */
export type SyncOutcome = "complete" | "partial" | "stopped";
export type SyncStatus = {
  /** When the latest sync ended, and how. */
  at: number;
  outcome: SyncOutcome;
  /** When a sync last ended `complete`. Only ever set by one. */
  completeAt?: number;
};

export function syncStatus(
  r: Repository,
  owner: string,
): SyncStatus | undefined {
  const s = read(r, STATUS, owner);
  const at = time(s?.at);
  const outcome = s?.outcome;
  if (
    at === undefined ||
    (outcome !== "complete" && outcome !== "partial" && outcome !== "stopped")
  )
    return undefined;
  const completeAt = time(s?.completeAt);
  return completeAt === undefined
    ? { at, outcome }
    : { at, outcome, completeAt };
}

/** Records how a sync ended; the last complete time moves only on success. */
export function recordSyncOutcome(
  r: Repository,
  owner: string,
  outcome: SyncOutcome,
  at: number,
) {
  const completeAt =
    outcome === "complete" ? at : syncStatus(r, owner)?.completeAt;
  r.setSetting(
    STATUS,
    JSON.stringify({
      owner,
      at,
      outcome,
      ...(completeAt === undefined ? {} : { completeAt }),
    }),
  );
}
