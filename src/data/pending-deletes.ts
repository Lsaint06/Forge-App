import type { Repository } from "./repository";

// Phase 7B WP6 D15: durable pending deletions. A goal or check-in deleted
// with Undo is hidden for six seconds before it is written. The intent is
// kept in a local settings marker, so it survives FORGE being closed by the
// system: the marker is written before the item disappears, removed before
// Undo shows it again, and removed in the same transaction as the delete.
// Settings are local (never synced or backed up) and cleared with local data.

export type PendingKind = "goal" | "recovery";
export const UNDO_MS = 6000;

export type PendingMarker = {
  v: 1;
  kind: PendingKind;
  id: string;
  /** The version the lifter confirmed; a changed record is kept. */
  updatedAt: number;
  createdAt: number;
  expiresAt: number;
  /** The account that owned the local data ("" in guest mode). */
  owner: string;
};

const KINDS: PendingKind[] = ["goal", "recovery"];
const key = (kind: PendingKind) => `pendingDelete.${kind}`;
const owner = (r: Repository) => r.setting("cloudOwner") ?? "";
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

function parse(kind: PendingKind, raw: string): PendingMarker | undefined {
  try {
    const m = JSON.parse(raw) as Partial<PendingMarker>;
    return m &&
      m.v === 1 &&
      m.kind === kind &&
      typeof m.id === "string" &&
      m.id.length > 0 &&
      m.id.length <= 100 &&
      finite(m.updatedAt) &&
      finite(m.createdAt) &&
      finite(m.expiresAt) &&
      m.expiresAt - m.createdAt === UNDO_MS &&
      typeof m.owner === "string"
      ? (m as PendingMarker)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The valid marker for a kind, if any. A corrupted or unreadable marker is
 * removed; no record is ever touched because of it.
 */
export function readPending(
  r: Repository,
  kind: PendingKind,
): PendingMarker | undefined {
  const raw = r.setting(key(kind));
  if (!raw) return undefined;
  const marker = parse(kind, raw);
  if (!marker) r.clearSetting(key(kind));
  return marker;
}

/** Remaining Undo time after a restart. A clock set back counts as expired. */
export function remainingMs(m: PendingMarker, now = Date.now()) {
  if (now < m.createdAt) return 0;
  return Math.max(0, Math.min(UNDO_MS, m.expiresAt - now));
}

/** Records the intent durably. Call before hiding the item. */
export function markPending(
  r: Repository,
  kind: PendingKind,
  record: { id: string; updatedAt: number },
  now = Date.now(),
): PendingMarker {
  const marker: PendingMarker = {
    v: 1,
    kind,
    id: record.id,
    updatedAt: record.updatedAt,
    createdAt: now,
    expiresAt: now + UNDO_MS,
    owner: owner(r),
  };
  r.setSetting(key(kind), JSON.stringify(marker));
  return marker;
}

/** Undo: removes the intent durably. Call before showing the item again. */
export function cancelPending(r: Repository, kind: PendingKind, id: string) {
  if (readPending(r, kind)?.id === id) r.clearSetting(key(kind));
}

export type CommitResult =
  "deleted" | "missing" | "changed" | "other-account" | "none";

/**
 * Writes a pending deletion: in one transaction, the record (only this id
 * and kind, and only the confirmed version) is deleted with its sync
 * tombstone and the marker is removed. Safe to repeat. A marker from another
 * account, or for a record that has since changed, is discarded instead.
 */
export function commitPending(
  r: Repository,
  kind: PendingKind,
  id: string,
): CommitResult {
  return r.transaction(() => {
    const m = readPending(r, kind);
    if (!m || m.id !== id) return "none";
    r.clearSetting(key(kind));
    if (m.owner !== owner(r)) return "other-account";
    const row = r.db.all<{ updated_at: number }>(
      "SELECT updated_at FROM journal WHERE id=? AND kind=?",
      [m.id, kind],
    )[0];
    if (!row) return "missing";
    if (row.updated_at !== m.updatedAt) return "changed";
    r.deleteJournal(m.id);
    return "deleted";
  });
}

/**
 * At launch: completes expired deletions and returns the ones still inside
 * their window (their screen can offer Undo for the time left; the caller
 * completes them at the original deadline).
 */
export function reconcilePendingDeletes(r: Repository, now = Date.now()) {
  const open: PendingMarker[] = [];
  for (const kind of KINDS) {
    const m = readPending(r, kind);
    if (!m) continue;
    if (remainingMs(m, now) > 0) open.push(m);
    else commitPending(r, kind, m.id);
  }
  return open;
}
