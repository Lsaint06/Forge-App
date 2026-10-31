import { isHeldRecord, type Repository } from "../data/repository";
import type { Outbox } from "../domain/types";
import { queuedVersion, sameRecord, type RecordVersion } from "./compare";
import { stopReason, type SyncStop } from "./errors";
import {
  recordSyncOutcome,
  saveSyncCursor,
  saveSyncRetry,
  syncCursor,
  syncRetryIds,
  type SyncOutcome,
} from "./sync-state";
export { SyncStopError, stopReason, type SyncStop } from "./errors";
export type CloudRecord = {
  id: string;
  kind: string;
  payload: unknown;
  revision: number;
  deleted: boolean;
  /** When the cloud last wrote it, in the cloud's own time (ISO 8601). */
  updatedAt?: string;
};
/** What to download (Phase 7.8C). With neither filter: everything. */
export type ListOptions = {
  /** Only records the cloud changed at or after this time (its clock). */
  since?: string;
  /** Only these records. */
  ids?: string[];
  /** As pages arrive: records so far, and the total once the cloud says. */
  onPage?: (received: number, total?: number) => void;
};
export interface CloudTransport {
  /** Records oldest change first (by cloud time, then id). */
  list: (options?: ListOptions) => Promise<CloudRecord[]>;
  write: (
    op: Outbox,
  ) => Promise<{ revision: number } | { conflict: CloudRecord }>;
}

export type SyncResult = {
  uploaded: number;
  downloaded: number;
  /** Records whose cloud copy already matched this phone: no choice needed. */
  matched: number;
  /** Changes the cloud refused this time; they stay on this phone. */
  rejected: number;
  /** Cloud records this phone couldn't read; the cloud copy is untouched. */
  failed: number;
  /**
   * Cloud records this phone can't take yet, untouched and tried again next
   * time: from a newer Forge (`update`), or a workout in progress elsewhere
   * while another is in progress here (`active`).
   */
  held: { update: number; active: number };
  /** Set when the sync stopped early; the rest waits for the next sync. */
  stopped?: SyncStop;
  /** Conflicts waiting for a choice. */
  conflicts: number;
  /** Changes still waiting on this phone. */
  pending: number;
  /** Technical details for the developer log, never shown as they are. */
  errors: string[];
  /** Records received from the cloud (Phase 7.8C). */
  fetched?: number;
  /** Whether everything was downloaded, rather than recent changes. */
  full?: boolean;
};

/** Where a sync has got to, for progress shown while it runs. */
export type SyncProgress =
  | { step: "uploading"; done: number; total: number }
  | { step: "downloading"; received: number; total?: number }
  | { step: "applying"; total: number };
export type SyncOptions = {
  onProgress?: (progress: SyncProgress) => void;
  /** This phone's clock (tests). */
  now?: () => number;
};

const DAY = 86_400_000;
/**
 * Each incremental download reaches this far back before its checkpoint.
 * The cloud stamps a record with the time its write began, not when the
 * write became visible, so a slow write can land with a time just before
 * a checkpoint already taken. Writes are limited to seconds by the cloud's
 * statement timeout; a day of margin re-reads a day of changes (skipped by
 * revision, so applied once) and can't miss one.
 */
export const SYNC_OVERLAP_MS = DAY;
/** A full download at least this often, as a safety net. */
export const FULL_SYNC_EVERY_MS = 7 * DAY;

const TIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
/**
 * A cloud time as a fixed-width UTC key with microseconds, so two times
 * compare exactly as text ("2026-10-31T07:47:26.179123Z"); and in
 * milliseconds. Undefined when it isn't a time.
 */
export function cloudTime(text: string) {
  const m = TIME.exec(text);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s, fraction = "", zone] = m;
  const digits = `${fraction}000000`.slice(0, 6);
  let ms = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!, +digits.slice(0, 3));
  if (zone !== "Z") {
    const z = zone!.slice(1).replace(":", "");
    const offset = (+z.slice(0, 2) * 60 + +(z.slice(2, 4) || 0)) * 60_000;
    ms += zone!.startsWith("-") ? offset : -offset;
  }
  if (!Number.isFinite(ms)) return undefined;
  const iso = new Date(ms).toISOString();
  return { ms, key: `${iso.slice(0, 23)}${digits.slice(3)}Z` };
}

const running = new WeakSet<Repository>();
const detail = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;
const version = (row: CloudRecord): RecordVersion => ({
  kind: row.kind,
  payload: row.payload,
  deleted: !!row.deleted,
});
const isCloudRecord = (row: unknown): row is CloudRecord =>
  !!row &&
  typeof row === "object" &&
  typeof (row as CloudRecord).id === "string" &&
  typeof (row as CloudRecord).kind === "string" &&
  typeof (row as CloudRecord).revision === "number";
function savedRecord(text: string) {
  try {
    const row = JSON.parse(text) as unknown;
    return isCloudRecord(row) ? row : undefined;
  } catch {
    return undefined;
  }
}
/** Lets a screen draw before work that runs without pausing. */
const nextTurn = () => new Promise<void>((done) => setTimeout(done, 0));

/**
 * Manual synchronization: uploads this phone's waiting changes one by one,
 * then downloads the account's records. Conflicts keep both versions until
 * the athlete chooses; nothing is last-write-wins. Phase 7.8B: versions that
 * turn out to be the same settle without a choice (H1), the first failure
 * that isn't about one record stops the sync with its reason (H3), and cloud
 * records this phone can't take yet are held, untouched (M3, M5).
 *
 * Phase 7.8C: after a first full download, only records the cloud changed
 * since the last checkpoint (less a day of margin) are downloaded; records
 * held earlier are fetched again by id; everything is downloaded again at
 * least weekly. How each sync ended is recorded for this account.
 */
export async function synchronize(
  r: Repository,
  cloud: CloudTransport,
  userId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  if (running.has(r)) throw new Error("A sync is already in progress");
  const owner = r.setting("cloudOwner");
  if (owner && owner !== userId)
    throw new Error(
      "This local database belongs to a different account. Export it, then clear local data before switching accounts.",
    );
  r.setSetting("cloudOwner", userId);
  const generation = r.generation;
  function ensureCurrent() {
    if (r.generation !== generation || r.setting("cloudOwner") !== userId)
      throw new Error(
        "Local data changed during synchronization. Restart sync explicitly when ready.",
      );
  }
  const { onProgress } = options;
  const now = options.now ?? Date.now;
  running.add(r);
  let uploaded = 0,
    downloaded = 0,
    matched = 0,
    rejected = 0,
    failed = 0,
    fetched = 0;
  const held = { update: 0, active: 0 };
  let stopped: SyncStop | undefined;
  let full = false;
  const errors: string[] = [];

  /**
   * The cloud copy isn't at this change's base revision. The same content
   * (a reply that never arrived, or the same edit made twice) is settled at
   * the cloud's revision. A copy this phone itself sent means the waiting
   * change was made on top of it, so it moves onto that revision. Anything
   * else is a real conflict: both versions are kept for the athlete.
   */
  function settle(op: Outbox, remote: CloudRecord) {
    const cloudVersion = version(remote);
    if (sameRecord(queuedVersion(op), cloudVersion)) {
      r.acknowledge(op.id, remote.revision, op.payload);
      return "matched" as const;
    }
    if (
      remote.revision > op.revision &&
      r
        .sentVersions(op.id, op.revision)
        .some((sent) =>
          sameRecord(queuedVersion({ kind: op.kind, ...sent }), cloudVersion),
        )
    ) {
      r.rebase(op.id, remote.revision);
      return "rebased" as const;
    }
    r.conflict(op.id, op.payload, JSON.stringify(remote), remote.revision);
    return "conflict" as const;
  }

  try {
    // Saved conflicts whose two versions are in fact the same (replies lost
    // before Phase 7.8B) settle without a choice.
    for (const c of r.conflicts()) {
      const op = r.outboxRow(c.id);
      const remote = savedRecord(c.remote);
      if (
        op &&
        remote?.id === c.id &&
        sameRecord(queuedVersion(op), version(remote))
      ) {
        r.settleConflict(c.id, remote.revision, op.payload);
        matched++;
      }
    }
    const blocked = new Set(r.conflicts().map((c) => c.id));
    // Every waiting change is tried on each manual sync: a sync the athlete
    // asked for never sits out an earlier failure's back-off.
    const queue = r.outbox().filter((op) => !blocked.has(op.id));
    let sent = 0;
    if (queue.length)
      onProgress?.({ step: "uploading", done: 0, total: queue.length });
    upload: for (const queued of queue) {
      ensureCurrent();
      let op: Outbox | undefined = queued;
      // At most once more, after moving onto the cloud's copy of this
      // phone's own earlier write.
      for (let attempt = 0; op && attempt < 2; attempt++) {
        r.markSent(op);
        let reply: Awaited<ReturnType<CloudTransport["write"]>>;
        try {
          reply = await cloud.write(op);
        } catch (e) {
          ensureCurrent();
          r.retry(op.id, op.attempts + 1);
          errors.push(detail(e, "Upload failed"));
          const reason = stopReason(e);
          if (reason) {
            stopped = reason;
            break upload;
          }
          rejected++;
          break;
        }
        ensureCurrent();
        if (!("conflict" in reply)) {
          r.acknowledge(op.id, reply.revision, op.payload);
          uploaded++;
          break;
        }
        if (!isCloudRecord(reply.conflict)) {
          // The cloud holds no copy at all (not even a deletion): nothing
          // there can be replaced, so the change goes up as a new record.
          r.rebase(op.id, 0);
        } else {
          const outcome = settle(op, reply.conflict);
          if (outcome === "matched") {
            matched++;
            break;
          }
          if (outcome === "conflict") {
            blocked.add(op.id);
            break;
          }
        }
        op = r.outboxRow(op.id);
      }
      onProgress?.({ step: "uploading", done: ++sent, total: queue.length });
    }
    if (!stopped) {
      // Everything on the first sync, after the weekly interval, or when
      // the checkpoint can't be read (or this phone's clock went back);
      // otherwise only what changed since the checkpoint, less a day.
      const previous = syncCursor(r, userId);
      const checkpoint = previous?.at ? cloudTime(previous.at) : undefined;
      const started = now();
      full =
        !previous ||
        !checkpoint ||
        started - previous.fullAt >= FULL_SYNC_EVERY_MS ||
        previous.fullAt > started + DAY;
      const since =
        full || !checkpoint
          ? undefined
          : new Date(checkpoint.ms - SYNC_OVERLAP_MS).toISOString();
      const retry = full ? [] : syncRetryIds(r, userId);
      let rows: CloudRecord[] | undefined;
      let again: CloudRecord[] = [];
      try {
        ensureCurrent();
        rows = await cloud.list({
          ...(since ? { since } : {}),
          onPage: (received, total) =>
            onProgress?.({
              step: "downloading",
              received,
              ...(total === undefined ? {} : { total }),
            }),
        });
        ensureCurrent();
        if (retry.length) again = await cloud.list({ ids: retry });
        ensureCurrent();
      } catch (e) {
        ensureCurrent();
        rows = undefined;
        stopped = stopReason(e) ?? "unavailable";
        errors.push(detail(e, "Could not fetch remote data"));
      }
      if (rows) {
        fetched = rows.length + again.length;
        // The newest cloud time received becomes the next checkpoint. A
        // record without one (an older transport) means none is kept.
        let latest: { key: string; text: string } | undefined;
        let timed = true;
        for (const row of rows) {
          const t = row.updatedAt ? cloudTime(row.updatedAt) : undefined;
          if (!t) timed = false;
          else if (!latest || t.key > latest.key)
            latest = { key: t.key, text: row.updatedAt! };
        }
        // One record per id, its newest revision (a record changed during
        // the download can arrive twice).
        const unique = new Map<string, CloudRecord>();
        for (const row of [...rows, ...again]) {
          const seenRow = unique.get(row.id);
          if (!seenRow || row.revision > seenRow.revision)
            unique.set(row.id, row);
        }
        const incoming = [...unique.values()].sort(
          (a, b) => priority(a.kind) - priority(b.kind),
        );
        if (onProgress && incoming.length) {
          onProgress({ step: "applying", total: incoming.length });
          await nextTurn();
          ensureCurrent();
        }
        // Read once: nothing else runs while the records below apply.
        const waiting = new Map(r.outbox().map((o) => [o.id, o]));
        const seen = new Map(
          r.db
            .all<{
              id: string;
              revision: number;
            }>("SELECT id,revision FROM sync_meta")
            .map((m) => [m.id, m.revision]),
        );
        const unapplied = new Set<string>();
        for (const row of incoming) {
          const local = waiting.get(row.id);
          if (local) {
            if (row.revision !== local.revision && !blocked.has(row.id)) {
              const outcome = settle(local, row);
              if (outcome === "matched") matched++;
              else if (outcome === "conflict") blocked.add(row.id);
            }
            continue;
          }
          if (row.revision <= (seen.get(row.id) ?? 0)) continue;
          try {
            r.applyRemote(
              row.id,
              row.kind,
              row.payload,
              row.revision,
              row.deleted,
            );
            seen.set(row.id, row.revision);
            downloaded++;
          } catch (e) {
            unapplied.add(row.id);
            if (isHeldRecord(e)) held[e.reason]++;
            else {
              failed++;
              errors.push(detail(e, "Download rejected"));
            }
          }
        }
        // Records not taken yet are fetched again by id next time; ids the
        // cloud no longer returned are gone from it.
        saveSyncRetry(r, userId, [...unapplied]);
        const at = latest?.text ?? (full ? undefined : previous?.at);
        if (timed && (full || previous))
          saveSyncCursor(r, userId, {
            ...(at ? { at } : {}),
            fullAt: full ? started : previous!.fullAt,
          });
      }
    }
    const result: SyncResult = {
      uploaded,
      downloaded,
      matched,
      rejected,
      failed,
      held,
      ...(stopped ? { stopped } : {}),
      conflicts: r.conflicts().length,
      pending: r.outbox().length,
      errors,
      fetched,
      full,
    };
    recordSyncOutcome(r, userId, syncOutcome(result), now());
    return result;
  } finally {
    running.delete(r);
  }
}

/**
 * The rule for "complete": the sync ran to the end, and nothing is left
 * waiting to upload, refused, held, unreadable or in conflict.
 */
export function syncOutcome(s: SyncResult): SyncOutcome {
  if (s.stopped) return "stopped";
  return s.pending ||
    s.conflicts ||
    s.rejected ||
    s.failed ||
    s.held.update ||
    s.held.active
    ? "partial"
    : "complete";
}

function priority(kind: string) {
  return kind === "exercise"
    ? 0
    : kind === "template"
      ? 1
      : kind === "workout"
        ? 2
        : 3;
}
