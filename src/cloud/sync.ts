import type { Repository } from "../data/repository";
import type { Outbox } from "../domain/types";
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
const running = new WeakSet<Repository>();
export async function synchronize(
  r: Repository,
  cloud: CloudTransport,
  userId: string,
) {
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
    downloaded = 0;
  const errors: string[] = [];
  try {
    const blocked = new Set(r.conflicts().map((c) => c.id));
    for (const op of r.outbox()) {
      ensureCurrent();
      if (blocked.has(op.id) || op.nextAttempt > Date.now()) continue;
      try {
        const result = await cloud.write(op);
        ensureCurrent();
        if ("conflict" in result) {
          r.conflict(
            op.id,
            op.payload,
            JSON.stringify(result.conflict),
            result.conflict.revision,
          );
          blocked.add(op.id);
        } else {
          r.acknowledge(op.id, result.revision, op.payload);
          uploaded++;
        }
      } catch (e) {
        ensureCurrent();
        r.retry(op.id, op.attempts + 1);
        errors.push(e instanceof Error ? e.message : "Upload failed");
      }
    }
    try {
      ensureCurrent();
      const rows = await cloud.list();
      ensureCurrent();
      rows.sort((a, b) => priority(a.kind) - priority(b.kind));
      for (const row of rows) {
        const local = r.outbox().find((o) => o.id === row.id);
        if (local) {
          if (row.revision !== local.revision && !blocked.has(row.id)) {
            r.conflict(
              row.id,
              local.payload,
              JSON.stringify(row),
              row.revision,
            );
            blocked.add(row.id);
          }
          continue;
        }
        const revision =
          r.db.all<{ revision: number }>(
            "SELECT revision FROM sync_meta WHERE id=?",
            [row.id],
          )[0]?.revision ?? 0;
        if (row.revision <= revision) continue;
        try {
          r.applyRemote(
            row.id,
            row.kind,
            row.payload,
            row.revision,
            row.deleted,
          );
          downloaded++;
        } catch (e) {
          errors.push(e instanceof Error ? e.message : "Download rejected");
        }
      }
    } catch (e) {
      ensureCurrent();
      errors.push(
        e instanceof Error ? e.message : "Could not fetch remote data",
      );
    }
    return {
      uploaded,
      downloaded,
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
