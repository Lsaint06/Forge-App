import { isHeldRecord, type Repository } from "../data/repository";
import type { Outbox } from "../domain/types";
import { queuedVersion, sameRecord, type RecordVersion } from "./compare";
import { stopReason, type SyncStop } from "./errors";
export { SyncStopError, stopReason, type SyncStop } from "./errors";
export type CloudRecord = {
  id: string;
  kind: string;
  payload: unknown;
  revision: number;
  deleted: boolean;
};
export interface CloudTransport {
  list: () => Promise<CloudRecord[]>;
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
};

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

/**
 * Manual synchronization: uploads this phone's waiting changes one by one,
 * then downloads the account's records. Conflicts keep both versions until
 * the athlete chooses; nothing is last-write-wins. Phase 7.8B: versions that
 * turn out to be the same settle without a choice (H1), the first failure
 * that isn't about one record stops the sync with its reason (H3), and cloud
 * records this phone can't take yet are held, untouched (M3, M5).
 */
export async function synchronize(
  r: Repository,
  cloud: CloudTransport,
  userId: string,
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
  running.add(r);
  let uploaded = 0,
    downloaded = 0,
    matched = 0,
    rejected = 0,
    failed = 0;
  const held = { update: 0, active: 0 };
  let stopped: SyncStop | undefined;
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
    upload: for (const queued of r.outbox()) {
      ensureCurrent();
      if (blocked.has(queued.id)) continue;
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
    }
    if (!stopped) {
      let rows: CloudRecord[] | undefined;
      try {
        ensureCurrent();
        rows = await cloud.list();
        ensureCurrent();
      } catch (e) {
        ensureCurrent();
        stopped = stopReason(e) ?? "unavailable";
        errors.push(detail(e, "Could not fetch remote data"));
      }
      if (rows) {
        rows.sort((a, b) => priority(a.kind) - priority(b.kind));
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
        for (const row of rows) {
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
            if (isHeldRecord(e)) held[e.reason]++;
            else {
              failed++;
              errors.push(detail(e, "Download rejected"));
            }
          }
        }
      }
    }
    return {
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
    };
  } finally {
    running.delete(r);
  }
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
