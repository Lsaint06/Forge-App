// Whether two versions of a synchronized record hold the same content
// (Phase 7.8B, H1). Postgres `jsonb` stores object keys in its own order, so
// versions are compared key-order-independently. The time a record was last
// saved (`updatedAt`) is metadata: two versions that differ only there hold
// the same training, so they never need a choice.

export type RecordVersion = {
  kind: string;
  payload: unknown;
  deleted: boolean;
};

/** JSON with object keys sorted at every level, so key order never matters. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** The payload without the record's own save time. */
function content(kind: string, payload: unknown) {
  if (!isObject(payload)) return payload;
  if (kind === "workout" && isObject(payload.workout)) {
    const { updatedAt: _saved, ...workout } = payload.workout;
    void _saved;
    return { ...payload, workout };
  }
  if (kind === "template" || kind === "journal") {
    const { updatedAt: _saved, ...rest } = payload;
    void _saved;
    return rest;
  }
  return payload;
}

/**
 * Same record kind and same content: both deleted, or both present with
 * equal payloads apart from key order and the save time.
 */
export function sameRecord(a: RecordVersion, b: RecordVersion) {
  if (a.kind !== b.kind) return false;
  if (a.deleted || b.deleted) return a.deleted && b.deleted;
  return (
    canonical(content(a.kind, a.payload)) ===
    canonical(content(b.kind, b.payload))
  );
}

/** A queued change as a version: its payload is stored as JSON text. */
export function queuedVersion(op: {
  kind: string;
  payload: string;
  deleted: number | boolean;
}): RecordVersion {
  return {
    kind: op.kind,
    payload: JSON.parse(op.payload) as unknown,
    deleted: !!op.deleted,
  };
}
