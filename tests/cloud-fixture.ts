import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { Repository, type SqlDatabase } from "../src/data/repository";
import {
  cloudTime,
  synchronize,
  SyncStopError,
  type CloudRecord,
  type CloudTransport,
} from "../src/cloud/sync";

// Phase 7.8D test fixture: an account in the cloud that follows
// `forge_write`'s rules (revision-checked writes; on a mismatch the cloud
// copy comes back, deletions included), stores objects the way Postgres
// `jsonb` does (keys reordered), and stamps every write with its own clock
// so phones download incrementally, as they do in Forge.

export const ME = "user-a";

/** jsonb keeps object keys shortest first, then in byte order. */
export function jsonb(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonb);
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
        .map((k) => [k, jsonb(o[k])]),
    );
  }
  return value;
}

export type Fault =
  | "ok"
  | "drop-request" // never reached the cloud
  | "drop-reply" // the cloud acted; its reply was lost
  | "unavailable"
  | "auth";

type Row = CloudRecord & { updatedAt: string };
const key = (time: string) => cloudTime(time)!.key;

export function cloud() {
  const rows = new Map<string, Row>();
  // Microseconds, like Postgres.
  let clock = Date.UTC(2026, 10, 1) * 1000;
  const iso = (us: number) =>
    `${new Date(Math.floor(us / 1000)).toISOString().slice(0, 23)}${String(us % 1000).padStart(3, "0")}Z`;
  const writes: Fault[] = [];
  const lists: Fault[] = [];
  const calls = { writes: 0, lists: 0 };
  const store = (
    id: string,
    kind: string,
    payload: unknown,
    deleted: boolean,
  ) => {
    clock += 1000;
    const row: Row = {
      id,
      kind,
      payload: jsonb(payload),
      revision: (rows.get(id)?.revision ?? 0) + 1,
      deleted,
      updatedAt: iso(clock),
    };
    rows.set(id, row);
    return structuredClone(row);
  };
  const fail = (fault: Fault): never => {
    if (fault === "auth") throw new SyncStopError("auth", "JWT expired");
    if (fault === "unavailable")
      throw new SyncStopError("unavailable", "Service unavailable");
    throw new SyncStopError("offline", "Network request failed");
  };
  const transport: CloudTransport = {
    async list(options = {}) {
      calls.lists++;
      const fault = lists.shift();
      if (fault && fault !== "ok") fail(fault);
      let out = [...rows.values()];
      if (options.ids) out = out.filter((r) => options.ids!.includes(r.id));
      else if (options.since) {
        const since = key(options.since);
        out = out.filter((r) => key(r.updatedAt) >= since);
      }
      out.sort((a, b) =>
        key(a.updatedAt) !== key(b.updatedAt)
          ? key(a.updatedAt) < key(b.updatedAt)
            ? -1
            : 1
          : a.id < b.id
            ? -1
            : 1,
      );
      options.onPage?.(out.length, out.length);
      return out.map((r) => structuredClone(r));
    },
    async write(op) {
      calls.writes++;
      const fault = writes.shift() ?? "ok";
      if (["drop-request", "unavailable", "auth"].includes(fault)) fail(fault);
      const existing = rows.get(op.id);
      let reply: { revision: number } | { conflict: CloudRecord };
      if ((existing?.revision ?? 0) !== op.revision)
        reply = {
          conflict: existing
            ? structuredClone(existing)
            : ({
                id: null,
                kind: null,
                payload: null,
                revision: null,
                deleted: null,
              } as unknown as CloudRecord),
        };
      else {
        if (existing && existing.kind !== op.kind)
          throw new Error("Record kind cannot change");
        reply = {
          revision: store(
            op.id,
            op.kind,
            JSON.parse(op.payload) as unknown,
            !!op.deleted,
          ).revision,
        };
      }
      if (fault === "drop-reply") fail(fault);
      return reply;
    },
  };
  return {
    transport,
    rows,
    /** Faults for the next writes and downloads, in order. */
    writes,
    lists,
    calls,
    /** Another device's change, saved straight to the cloud. */
    put: (id: string, kind: string, payload: unknown, deleted = false) =>
      store(id, kind, payload, deleted),
    row: (id: string) => structuredClone(rows.get(id)),
  };
}
export type Cloud = ReturnType<typeof cloud>;

export function sqlite(db: DatabaseSync): SqlDatabase {
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params = []) => {
      db.prepare(sql).run(...params);
    },
    all: <T>(sql: string, params: (string | number | null)[] = []) =>
      db.prepare(sql).all(...params) as T[],
  };
}

/** A phone signed in to `owner`'s account (a fresh install by default). */
export function phone(owner = ME, db = new DatabaseSync(":memory:")) {
  const r = new Repository(sqlite(db));
  r.migrate();
  r.setSetting("cloudOwner", owner);
  return r;
}

/** Synchronizes as Forge does when the athlete taps Sync. */
export const sync = (r: Repository, c: Cloud, owner = ME) =>
  synchronize(r, c.transport, owner);

/** The real `forge_records` table and `forge_write`, in Postgres (PGlite). */
export async function postgres() {
  const db = new PGlite();
  await db.exec(
    `CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.user_id',true),'')::uuid $$;GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`,
  );
  await db.exec(
    readFileSync("supabase/migrations/202610140001_forge.sql", "utf8"),
  );
  const user = "00000000-0000-0000-0000-00000000000a";
  await db.exec(
    `INSERT INTO auth.users(id) VALUES('${user}');SET ROLE authenticated;SET test.user_id='${user}';`,
  );
  type Row = {
    id: string;
    kind: string;
    payload: unknown;
    revision: number | string;
    deleted: boolean;
    updated_at: Date;
  };
  const record = (r: Row): CloudRecord => ({
    id: r.id,
    kind: r.kind,
    payload: r.payload,
    revision: Number(r.revision),
    deleted: r.deleted,
    updatedAt: r.updated_at.toISOString(),
  });
  const transport: CloudTransport = {
    async list({ since, ids } = {}) {
      const where = ids
        ? "WHERE id = ANY($1)"
        : since
          ? "WHERE updated_at >= $1"
          : "";
      const params = ids ? [ids] : since ? [since] : [];
      const { rows } = await db.query<Row>(
        `SELECT id,kind,payload,revision,deleted,updated_at FROM public.forge_records ${where} ORDER BY updated_at,id`,
        params,
      );
      return rows.map(record);
    },
    async write(op) {
      const { rows } = await db.query<{
        result: { revision?: number; conflict?: CloudRecord };
      }>("SELECT public.forge_write($1,$2,$3::jsonb,$4,$5) AS result", [
        op.id,
        op.kind,
        op.payload,
        op.revision,
        !!op.deleted,
      ]);
      const result = rows[0]!.result;
      if (result.conflict) return { conflict: result.conflict };
      return { revision: Number(result.revision) };
    },
  };
  return { db, transport, user };
}
