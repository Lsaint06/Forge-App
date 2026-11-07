import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { parseEntitlementResponse } from "../src/billing/entitlement";
import {
  acceptedEnvironments,
  subscriberUrl,
  type EntitlementPolicy,
  type EntitlementRow,
} from "../supabase/functions/_shared/entitlement";
import {
  MAX_WEBHOOK_BYTES,
  ServiceError,
  handleRefresh,
  handleWebhook,
  refreshSettings,
  serveRefresh,
  serveWebhook,
  webhookSettings,
  type Services,
} from "../supabase/functions/_shared/reconcile";
import {
  entitlementRefresh,
  entitlementWebhook,
  supabaseServices,
  type Fetch,
} from "../supabase/functions/_shared/rest";
import {
  A,
  B,
  DAY,
  HOUR,
  MIN,
  POLICY,
  PRODUCT,
  T0,
  answer,
  rcCustomer,
  rcWebhook,
  rowFor,
  signWebhook,
  type Sub,
} from "./billing-fixture";

// Phase 9.3: Forge's membership Edge Functions, end to end. The handlers
// (supabase/functions/_shared/reconcile.ts) run against the entitlement
// draft in PGlite, set up the way Supabase sets up a project: records and
// webhook events are written as the service role, and the answer is read
// with the caller's own session through forge_entitlement(). RevenueCat is
// faked, deterministically. Then the real wiring (_shared/rest.ts) is
// checked call by call on a fake network, with Supabase's new API keys and
// with the legacy ones: each key goes only where it belongs, and none ever
// comes back in an answer or a log line.

const MIGRATIONS = [
  "supabase/migrations/202610140001_forge.sql",
  "supabase/migrations/202611020001_forge_security_hardening.sql",
  "supabase/drafts/forge_entitlements.sql",
];
const C = "00000000-0000-4000-8000-00000000000c";
/** Account IDs, in the shape Supabase gives them (A and B are 0xa, 0xb). */
const account = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
/** A well-formed account ID that no account has (deleted, or elsewhere). */
const NOBODY = account(0xff);
const sessionOf = (user: string) => `1${user.slice(1)}`;
/** Stands in for the account's Supabase access token. */
const tokenOf = (user: string) => `test-token-${user}`;

const SUPABASE = "https://forge-test.supabase.co";
const SECRETS = {
  authorization: "Bearer test-webhook-header-not-real",
  signingSecret: "test-webhook-signing-secret-not-real",
};
/** The project's API keys, as hosted Edge Functions get them (fakes). */
const SECRET_KEY = "sb_secret_test-key-not-real";
const PUBLISHABLE_KEY = "sb_publishable_test-key-not-real";
/** The legacy JWT keys, deprecated by the end of 2026 (JWT-shaped fakes). */
const LEGACY_SERVICE_KEY = "eyJ-legacy-service-role-jwt.not-real.not-signed";
const LEGACY_ANON_KEY = "eyJ-legacy-anon-jwt.not-real.not-signed";
const RC_KEY = "test-revenuecat-secret-key-not-real";
/** A hosted function's environment: the new keys by name, and the legacy. */
const ENV: Record<string, string> = {
  SUPABASE_URL: SUPABASE,
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }),
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_KEY }),
  SUPABASE_SERVICE_ROLE_KEY: LEGACY_SERVICE_KEY,
  SUPABASE_ANON_KEY: LEGACY_ANON_KEY,
  REVENUECAT_SECRET_API_KEY: RC_KEY,
  REVENUECAT_WEBHOOK_AUTHORIZATION: SECRETS.authorization,
  REVENUECAT_WEBHOOK_SIGNING_SECRET: SECRETS.signingSecret,
  FORGE_ENVIRONMENT: "production",
  FORGE_MEMBERSHIP_PRODUCT_IDS: PRODUCT,
};
/** A project on the legacy keys alone. */
const LEGACY_ENV: Record<string, string | undefined> = {
  ...ENV,
  SUPABASE_SECRET_KEYS: undefined,
  SUPABASE_PUBLISHABLE_KEYS: undefined,
};
const env =
  (vars: Record<string, string | undefined>) =>
  (name: string): string | undefined =>
    vars[name];
/** Never in an answer, its headers or a log line. */
const HIDDEN = [
  SECRETS.authorization,
  SECRETS.signingSecret,
  "test-webhook-header-not-real",
  "sb_secret_",
  PUBLISHABLE_KEY,
  LEGACY_SERVICE_KEY,
  LEGACY_ANON_KEY,
  RC_KEY,
  "test-token-",
];

function assertHidden(text: string, where: string) {
  for (const secret of HIDDEN)
    assert.ok(!text.includes(secret), `${where} shows "${secret}"`);
}
async function assertNothingShown(res: Response) {
  const lines = [await res.clone().text()];
  res.headers.forEach((value, name) => lines.push(`${name}: ${value}`));
  assertHidden(lines.join("\n"), `a ${res.status} answer`);
}

const TRIAL: Sub = { purchased: T0 - DAY, expires: T0 + 6 * DAY, trial: true };
const PAID: Sub = {
  purchased: T0 - DAY,
  expires: T0 + 29 * DAY,
  original: T0 - 60 * DAY,
};
const iso = (ms: number) => new Date(ms).toISOString();

// ---- Forge's project, in PGlite -------------------------------------------------

type Defaults = "earlier" | "2026";

/** Supabase's roles and defaults, Forge's migrations, then the draft. */
async function project(defaults: Defaults, users: readonly string[]) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions(
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      not_after timestamptz
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `);
  await db.exec(
    defaults === "earlier"
      ? `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
         ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;`
      : `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;`,
  );
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  for (const user of users) {
    await db.query("INSERT INTO auth.users(id) VALUES ($1)", [user]);
    await db.query("INSERT INTO auth.sessions(id, user_id) VALUES ($1, $2)", [
      sessionOf(user),
      user,
    ]);
  }
  return db;
}

type Caller = {
  role: "authenticated" | "service_role";
  claims: Record<string, unknown>;
};
/** The Edge Functions' role (SUPABASE_SERVICE_ROLE_KEY). */
const SERVICE: Caller = {
  role: "service_role",
  claims: { role: "service_role" },
};
const seconds = () => Math.floor(Date.now() / 1000);
/** The account's own session, with the claims Supabase Auth issues. */
const sessionClaims = (user: string): Caller => ({
  role: "authenticated",
  claims: {
    sub: user,
    role: "authenticated",
    is_anonymous: false,
    session_id: sessionOf(user),
    amr: [{ method: "password", timestamp: seconds() - 60 }],
    iat: seconds(),
    exp: seconds() + 3600,
  },
});

/** One Data API request: a transaction in the caller's role, with its claims. */
async function request<T = Record<string, unknown>>(
  db: PGlite,
  caller: Caller,
  sql: string,
  params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${caller.role}`);
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(caller.claims),
    ]);
    return (await tx.query<T>(sql, params)).rows;
  });
}

const COLUMNS = [
  "user_id",
  "status",
  "product_id",
  "store",
  "environment",
  "period_type",
  "purchased_at",
  "expires_at",
  "grace_expires_at",
  "access_until",
  "will_renew",
  "billing_issue_at",
  "revoked_at",
  "first_entitled_at",
  "source_event_id",
  "refreshed_at",
] as const satisfies readonly (keyof EntitlementRow)[];

/** PostgREST's upsert (Prefer: resolution=merge-duplicates), as SQL. */
const UPSERT = `INSERT INTO public.forge_entitlements (${COLUMNS.join(", ")})
  VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(", ")})
  ON CONFLICT (user_id) DO UPDATE SET ${COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ")}`;

/** The stored row, as the database owner sees it (times as ISO text). */
async function storedRow(db: PGlite, user: string) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT ${COLUMNS.join(", ")} FROM public.forge_entitlements WHERE user_id = $1`,
    [user],
  );
  const r = rows[0];
  if (!r) return undefined;
  return Object.fromEntries(
    COLUMNS.map((c) => {
      const v = r[c];
      return [c, v instanceof Date ? v.toISOString() : v];
    }),
  ) as EntitlementRow;
}

type EventRow = {
  id: string;
  type: string;
  environment: string | null;
  user_id: string | null;
  processed: boolean;
};
const eventsIn = async (db: PGlite) =>
  (
    await db.query<EventRow>(
      `SELECT id, type, environment, user_id, processed_at IS NOT NULL AS processed
       FROM public.forge_entitlement_events ORDER BY id`,
    )
  ).rows;
const countOf = async (db: PGlite, table: string, user: string) =>
  (
    await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${table === "auth.users" ? "id" : "user_id"} = $1`,
      [user],
    )
  ).rows[0]!.n;

// ---- RevenueCat, faked -----------------------------------------------------------

type RcFault = "down" | "timeout" | "unreadable" | "not a record";

/** A record RevenueCat might send that can't be read: a garbled expiry. */
function unreadable(now: number) {
  const record = rcCustomer(now, { [PRODUCT]: PAID });
  record.subscriber.subscriptions[PRODUCT]!.expires_date = "next month";
  return record;
}

/**
 * RevenueCat's customer records: each account's subscriptions as of `now`
 * (its request time), and faults for the next reads, in order.
 */
function revenueCat() {
  const state = {
    now: T0,
    subs: new Map<string, Record<string, Sub>>(),
    faults: [] as RcFault[],
    reads: [] as string[],
  };
  async function fetchSubscriber(appUserId: string): Promise<unknown> {
    state.reads.push(appUserId);
    switch (state.faults.shift()) {
      case "down":
        throw new ServiceError("RevenueCat answered 503");
      case "timeout":
        throw new DOMException("The operation timed out.", "TimeoutError");
      case "unreadable":
        return unreadable(state.now);
      case "not a record":
        return "<html>502 Bad Gateway</html>";
    }
    return rcCustomer(state.now, state.subs.get(appUserId) ?? {});
  }
  return { state, fetchSubscriber };
}

// ---- Forge's server: the handlers with real SQL ------------------------------------

type Op = "auth" | "save" | "read" | "receive" | "mark";
/** When webhook deliveries arrive (and are signed). */
const NOW = T0;

/**
 * Forge's project with the handlers wired to it: the service role writes
 * (PostgREST's statements, as SQL), forge_entitlement() answers with the
 * caller's session, Supabase Auth knows each account's token. Every answer
 * is checked for secrets, and so is every log line on close.
 */
async function forge(
  options: {
    defaults?: Defaults;
    policy?: EntitlementPolicy;
    users?: readonly string[];
  } = {},
) {
  const users = options.users ?? [A, B, C];
  const db = await project(options.defaults ?? "2026", users);
  const rc = revenueCat();
  const tokens = new Map<string, { user: string; anonymous?: boolean }>(
    users.map((user) => [tokenOf(user), { user }]),
  );
  /** Operations whose next call fails, as when the network drops. */
  const failing = new Set<Op>();
  const fail = (op: Op) => {
    if (failing.delete(op)) throw new Error("connection reset");
  };
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);
  const services: Services = {
    async userFromToken(jwt) {
      fail("auth");
      const t = tokens.get(jwt);
      return t && !t.anonymous ? t.user : undefined;
    },
    fetchSubscriber: rc.fetchSubscriber,
    async saveEntitlement(row) {
      fail("save");
      try {
        await request(
          db,
          SERVICE,
          UPSERT,
          COLUMNS.map((c) => row[c]),
        );
        return "saved";
      } catch (e) {
        if ((e as { code?: unknown }).code === "23503") return "no_account";
        throw e;
      }
    },
    async readEntitlement(_userId, jwt) {
      fail("read");
      const t = tokens.get(jwt);
      if (!t) throw new Error("JWT invalid");
      const rows = await request<{ answer: unknown }>(
        db,
        sessionClaims(t.user),
        "SELECT public.forge_entitlement() AS answer",
      );
      return rows[0]!.answer;
    },
    async receiveEvent(event) {
      fail("receive");
      const found = await request<{ processed: boolean }>(
        db,
        SERVICE,
        "SELECT processed_at IS NOT NULL AS processed FROM public.forge_entitlement_events WHERE id = $1",
        [event.id],
      );
      if (found[0]) return { processed: found[0].processed };
      await request(
        db,
        SERVICE,
        `INSERT INTO public.forge_entitlement_events (id, type, environment, event_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [
          event.id,
          event.type,
          event.environment,
          event.eventAt === null ? null : iso(event.eventAt),
        ],
      );
      return { processed: false };
    },
    async markProcessed(eventId, userId) {
      fail("mark");
      await request(
        db,
        SERVICE,
        `UPDATE public.forge_entitlement_events SET processed_at = now(), user_id = $2
         WHERE id = $1 AND processed_at IS NULL`,
        [eventId, userId],
      );
    },
  };
  const policy = options.policy ?? POLICY;
  const shown = async (res: Response) => {
    await assertNothingShown(res);
    return res;
  };
  return {
    db,
    rc: rc.state,
    tokens,
    failing,
    logs,
    refresh: async (req: Request) =>
      shown(await handleRefresh(req, { ...services, policy, log })),
    webhook: async (req: Request) =>
      shown(
        await handleWebhook(req, {
          ...services,
          policy,
          secrets: SECRETS,
          now: () => NOW,
          log,
        }),
      ),
    row: (user: string) => storedRow(db, user),
    events: () => eventsIn(db),
    async close() {
      assertHidden(logs.join("\n"), "the log");
      await db.close();
    },
  };
}
type Forge = Awaited<ReturnType<typeof forge>>;

/** Runs a test against a fresh project, closing it whatever happens. */
async function withForge(
  options: Parameters<typeof forge>[0],
  body: (f: Forge) => Promise<void>,
) {
  const f = await forge(options);
  try {
    await body(f);
  } finally {
    await f.close();
  }
}

const FUNCTIONS = `${SUPABASE}/functions/v1`;

/** entitlement-refresh, asked with the account's token (or as given). */
function asking(
  user?: string,
  init: { method?: string; authorization?: string; body?: string } = {},
) {
  const headers: Record<string, string> = {};
  const authorization =
    init.authorization ?? (user ? `Bearer ${tokenOf(user)}` : undefined);
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request(`${FUNCTIONS}/entitlement-refresh`, {
    method: init.method ?? "POST",
    headers,
    body: init.body,
  });
}

/** A RevenueCat delivery: signed at NOW with the real secrets unless given. */
function deliver(
  event: Record<string, unknown>,
  options: {
    authorization?: string | null;
    signature?: string | null;
    signedAt?: number;
    body?: string;
    method?: string;
  } = {},
) {
  const body = options.body ?? rcWebhook(event);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const authorization =
    options.authorization === undefined
      ? SECRETS.authorization
      : options.authorization;
  if (authorization !== null) headers.authorization = authorization;
  const signature =
    options.signature === undefined
      ? signWebhook(
          body,
          Math.floor((options.signedAt ?? NOW) / 1000),
          SECRETS.signingSecret,
        )
      : options.signature;
  if (signature !== null) headers["x-revenuecat-webhook-signature"] = signature;
  const method = options.method ?? "POST";
  return new Request(`${FUNCTIONS}/entitlement-webhook`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

/** RevenueCat's event about one account; its own claims are never used. */
const purchase = (
  id: string,
  user: string = A,
  extra: Record<string, unknown> = {},
) => ({
  id,
  type: "INITIAL_PURCHASE",
  app_user_id: user,
  original_app_user_id: user,
  aliases: [user],
  product_id: PRODUCT,
  period_type: "TRIAL",
  purchased_at_ms: T0,
  expiration_at_ms: T0 + 7 * DAY,
  entitlement_ids: ["forge"],
  ...extra,
});

const body = async (res: Response) =>
  (await res.json()) as Record<string, unknown>;

// ---- entitlement-refresh ---------------------------------------------------------

const GRACE: Sub = {
  purchased: T0 - 31 * DAY,
  expires: T0 - DAY,
  billingIssue: T0 - DAY,
  grace: T0 + 15 * DAY,
};
const STATUSES: [string, Sub | undefined, string][] = [
  ["no subscription on record", undefined, "none"],
  ["the free week", TRIAL, "trial"],
  ["a paid month", PAID, "active"],
  [
    "cancelled, to the period's end",
    { ...PAID, unsubscribed: T0 - HOUR },
    "active",
  ],
  ["Apple's billing grace period", GRACE, "grace"],
  [
    "Apple retrying the charge",
    { ...GRACE, grace: undefined },
    "billing_retry",
  ],
  ["expired", { purchased: T0 - 31 * DAY, expires: T0 - DAY }, "expired"],
  ["refunded", { ...PAID, refunded: T0 }, "revoked"],
];

test("a refresh reads RevenueCat afresh, keeps the row, and answers as forge_entitlement() does", async () => {
  const users = STATUSES.map((_, i) => account(0x100 + i));
  for (const defaults of ["earlier", "2026"] as const)
    await withForge({ defaults, users }, async (f) => {
      for (const [i, [name, sub, status]] of STATUSES.entries()) {
        const user = users[i]!;
        const subs: Record<string, Sub> = sub ? { [PRODUCT]: sub } : {};
        f.rc.subs.set(user, subs);
        const res = await f.refresh(asking(user));
        assert.equal(res.status, 200, name);
        assert.equal(res.headers.get("cache-control"), "no-store");
        assert.match(
          res.headers.get("content-type") ?? "",
          /^application\/json/,
        );
        const got = await body(res);
        const expected = rowFor(user, T0, subs);
        // The draft's own answer, read with the caller's session after the
        // write, with the server's clock (not RevenueCat's).
        const serverNow = got.server_now as number;
        assert.ok(Math.abs(serverNow - Date.now()) < 60_000, name);
        assert.deepEqual(
          got,
          answer(user, serverNow, expected),
          `${defaults}: ${name}`,
        );
        assert.deepEqual(await f.row(user), expected, name);
        const parsed = parseEntitlementResponse(got);
        assert.ok(parsed.ok, name);
        assert.equal(parsed.value.entitlement.status, status, name);
      }
      assert.deepEqual(f.rc.reads, users);
      // A cancelled month keeps its access to the end, without renewing;
      // the grace period extends it.
      const cancelled = (await f.row(users[3]!))!;
      assert.equal(cancelled.will_renew, false);
      assert.equal(cancelled.access_until, iso(PAID.expires));
      assert.equal((await f.row(users[4]!))!.access_until, iso(T0 + 15 * DAY));
      assert.deepEqual(await f.events(), []);
      assert.deepEqual(f.logs, []);
    });
});

test("only a signed-in account's own token asks, and only for itself", async () => {
  await withForge({}, async (f) => {
    f.tokens.set("test-token-anonymous", { user: C, anonymous: true });
    for (const [name, req] of [
      ["no token", asking()],
      ["an empty token", asking(undefined, { authorization: "Bearer " })],
      [
        "another scheme",
        asking(undefined, { authorization: `Basic ${tokenOf(A)}` }),
      ],
      [
        "an unknown token",
        asking(undefined, { authorization: "Bearer test-token-x" }),
      ],
      [
        "an anonymous sign-in",
        asking(undefined, { authorization: "Bearer test-token-anonymous" }),
      ],
    ] as const) {
      const res = await f.refresh(req);
      assert.equal(res.status, 401, name);
      assert.equal(res.headers.get("www-authenticate"), "Bearer", name);
      assert.deepEqual(await body(res), { error: "unauthorized" }, name);
    }
    assert.deepEqual(f.rc.reads, []);
    assert.equal(await f.row(A), undefined);
    assert.equal(await f.row(C), undefined);
    // The body is never read: the token alone names the account.
    f.rc.subs.set(B, { [PRODUCT]: PAID });
    const res = await f.refresh(
      asking(A, { body: JSON.stringify({ user_id: B }) }),
    );
    assert.equal(res.status, 200);
    assert.equal((await body(res)).user_id, A);
    assert.deepEqual(f.rc.reads, [A]);
    assert.equal(await f.row(B), undefined);
    // An account deleted while it asked: refused, and nothing is kept.
    f.tokens.set(tokenOf(NOBODY), { user: NOBODY });
    assert.equal((await f.refresh(asking(NOBODY))).status, 401);
    assert.equal(await f.row(NOBODY), undefined);
    // Supabase Auth unreachable isn't the caller's fault: 503, not 401.
    f.failing.add("auth");
    const down = await f.refresh(asking(A));
    assert.equal(down.status, 503);
    assert.deepEqual(await body(down), { error: "unavailable" });
  });
});

test("both functions take POST only", async () => {
  await withForge({}, async (f) => {
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])
      for (const res of [
        await f.refresh(asking(A, { method })),
        await f.webhook(deliver(purchase("evt-1"), { method })),
      ]) {
        assert.equal(res.status, 405, method);
        assert.equal(res.headers.get("allow"), "POST", method);
      }
    assert.deepEqual(f.rc.reads, []);
    assert.equal(await f.row(A), undefined);
    assert.deepEqual(await f.events(), []);
  });
});

test("RevenueCat unreachable or unreadable: 502, and the last good row stays", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: TRIAL });
    assert.equal((await f.refresh(asking(A))).status, 200);
    const kept = await f.row(A);
    // The free week was cancelled since, but RevenueCat can't say so yet.
    f.rc.now = T0 + HOUR;
    f.rc.subs.set(A, { [PRODUCT]: { ...TRIAL, unsubscribed: T0 + MIN } });
    for (const [fault, error] of [
      ["down", "store_unavailable"],
      ["timeout", "store_unavailable"],
      ["unreadable", "store_unreadable"],
      ["not a record", "store_unreadable"],
    ] as const) {
      f.rc.faults.push(fault);
      const res = await f.refresh(asking(A));
      assert.equal(res.status, 502, fault);
      assert.deepEqual(await body(res), { error }, fault);
      assert.deepEqual(await f.row(A), kept, fault);
    }
    // Forge's database refusing the write: 503, and still the last good row.
    f.failing.add("save");
    const unsaved = await f.refresh(asking(A));
    assert.equal(unsaved.status, 503);
    assert.deepEqual(await body(unsaved), { error: "unavailable" });
    assert.deepEqual(await f.row(A), kept);
    // RevenueCat back: the cancellation arrives.
    const res = await f.refresh(asking(A));
    assert.equal(res.status, 200);
    const e = (await body(res)).entitlement as Record<string, unknown>;
    assert.equal(e.status, "trial");
    assert.equal(e.will_renew, false);
    assert.equal(e.refreshed_at, T0 + HOUR);
    // Kept, but the answer couldn't be read: 503; the next one has it.
    f.failing.add("read");
    assert.equal((await f.refresh(asking(A))).status, 503);
    assert.deepEqual(f.logs, [
      "entitlement-refresh: RevenueCat unavailable (RevenueCat answered 503)",
      "entitlement-refresh: RevenueCat unavailable (TimeoutError)",
      "entitlement-refresh: RevenueCat's record refused (expires_date isn't a time)",
      "entitlement-refresh: RevenueCat's record refused (Not a RevenueCat customer record)",
      "entitlement-refresh: the record wasn't kept (Error)",
      "entitlement-refresh: forge_entitlement() unavailable (Error)",
    ]);
  });
});

test("an older reading of RevenueCat never replaces a newer row", async () => {
  await withForge({}, async (f) => {
    // Read at 13:00: the free week, cancelled.
    f.rc.now = T0 + HOUR;
    f.rc.subs.set(A, { [PRODUCT]: { ...TRIAL, unsubscribed: T0 + MIN } });
    assert.equal((await f.refresh(asking(A))).status, 200);
    const newer = (await f.row(A))!;
    // A reading from 12:00 arriving late (two refreshes crossing)...
    f.rc.now = T0;
    f.rc.subs.set(A, { [PRODUCT]: TRIAL });
    const res = await f.refresh(asking(A));
    assert.equal(res.status, 200);
    const got = await body(res);
    // ...changes nothing, and the answer is the newer row as kept.
    assert.deepEqual(got, answer(A, got.server_now as number, newer));
    assert.deepEqual(await f.row(A), newer);
    assert.equal(newer.will_renew, false);
    // The membership moved away: none here, and its start is kept.
    f.rc.now = T0 + 2 * HOUR;
    f.rc.subs.set(A, {});
    const moved = (await body(await f.refresh(asking(A))))
      .entitlement as Record<string, unknown>;
    assert.equal(moved.status, "none");
    assert.equal(moved.first_entitled_at, TRIAL.purchased);
  });
});

/** Services that always succeed, for checks that need no database. */
const stub = (over: Partial<Services> = {}): Services => ({
  userFromToken: async () => A,
  fetchSubscriber: async () => rcCustomer(T0, {}),
  saveEntitlement: async () => "saved",
  readEntitlement: async () => answer(A, T0),
  receiveEvent: async () => ({ processed: false }),
  markProcessed: async () => undefined,
  ...over,
});

test("only an answer about the caller is ever given", async () => {
  for (const wrong of [
    answer(B, T0),
    null,
    { ...answer(A, T0), server_now: "now" },
    { user_id: A, server_now: T0 },
  ]) {
    const logs: string[] = [];
    const res = await handleRefresh(asking(A), {
      ...stub({ readEntitlement: async () => wrong }),
      policy: POLICY,
      log: (line) => logs.push(line),
    });
    assert.equal(res.status, 503);
    assert.deepEqual(logs, [
      "entitlement-refresh: forge_entitlement()'s answer isn't the caller's",
    ]);
  }
  const res = await handleRefresh(asking(A), { ...stub(), policy: POLICY });
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), answer(A, T0));
});

// ---- entitlement-webhook ---------------------------------------------------------

const done = (id: string, refreshed: number) => ({
  event_id: id,
  outcome: "processed",
  refreshed,
});

test("a genuine event refreshes its account from RevenueCat, never from the event", async () => {
  await withForge({}, async (f) => {
    // The event speaks of a new free week; RevenueCat's record says the
    // membership ended.
    const ended = {
      [PRODUCT]: { purchased: T0 - 31 * DAY, expires: T0 - DAY },
    };
    f.rc.subs.set(A, ended);
    const res = await f.webhook(deliver(purchase("evt-1")));
    assert.equal(res.status, 200);
    assert.deepEqual(await body(res), done("evt-1", 1));
    assert.deepEqual(f.rc.reads, [A]);
    assert.deepEqual(await f.row(A), {
      ...rowFor(A, T0, ended),
      source_event_id: "evt-1",
    });
    assert.equal((await f.row(A))!.status, "expired");
    assert.deepEqual(await f.events(), [
      {
        id: "evt-1",
        type: "INITIAL_PURCHASE",
        environment: "production",
        user_id: A,
        processed: true,
      },
    ]);
    assert.deepEqual(f.logs, []);
  });
});

test("a webhook without RevenueCat's Authorization header is refused, and nothing happens", async () => {
  await withForge({}, async (f) => {
    for (const authorization of [
      null,
      "",
      "Bearer test-webhook-header-not-rea",
      `${SECRETS.authorization}x`,
      SECRETS.authorization.toLowerCase(),
      SECRETS.signingSecret,
      `Bearer ${SECRETS.signingSecret}`,
    ]) {
      const res = await f.webhook(
        deliver(purchase("evt-1"), { authorization }),
      );
      assert.equal(res.status, 401, String(authorization));
      assert.deepEqual(await body(res), { error: "unauthorized" });
    }
    assert.deepEqual(f.rc.reads, []);
    assert.deepEqual(await f.events(), []);
    assert.equal(await f.row(A), undefined);
    assert.deepEqual(
      new Set(f.logs),
      new Set(["entitlement-webhook: refused (authorization)"]),
    );
  });
});

test("a webhook without a valid, fresh signature over its exact body is refused", async () => {
  await withForge({}, async (f) => {
    const event = purchase("evt-1");
    const raw = rcWebhook(event);
    const at = Math.floor(NOW / 1000);
    const signed = signWebhook(raw, at, SECRETS.signingSecret);
    for (const [name, options] of [
      ["no signature", { signature: null }],
      ["a malformed signature", { signature: "t=soon,v1=abc" }],
      [
        "another secret",
        { signature: signWebhook(raw, at, "another-not-real") },
      ],
      ["a tampered body", { body: raw.replace(A, B), signature: signed }],
      [
        "the body written out again",
        { body: JSON.stringify(JSON.parse(raw), null, 1), signature: signed },
      ],
      ["signed 6 minutes ago", { signedAt: NOW - 6 * MIN }],
      ["signed 6 minutes ahead", { signedAt: NOW + 6 * MIN }],
    ] as [string, Parameters<typeof deliver>[1]][]) {
      const res = await f.webhook(deliver(event, options));
      assert.equal(res.status, 401, name);
      assert.deepEqual(await body(res), { error: "unauthorized" }, name);
    }
    assert.deepEqual(f.rc.reads, []);
    assert.deepEqual(await f.events(), []);
    assert.equal(await f.row(A), undefined);
    assert.equal(await f.row(B), undefined);
    assert.deepEqual(f.logs, [
      ...Array(5).fill("entitlement-webhook: refused (signature)"),
      ...Array(2).fill("entitlement-webhook: refused (stale)"),
    ]);
    // Within RevenueCat's five minutes, the same delivery is genuine.
    const res = await f.webhook(deliver(event, { signedAt: NOW - 4 * MIN }));
    assert.equal(res.status, 200);
  });
});

test("a delivery is processed once; RevenueCat's retries are acknowledged without work", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: TRIAL });
    const event = purchase("evt-1");
    const first = await f.webhook(deliver(event));
    assert.deepEqual(await body(first), done("evt-1", 1));
    const kept = await f.row(A);
    // Refunded since; RevenueCat retries evt-1 (signed anew, same event ID).
    f.rc.now = T0 + HOUR;
    f.rc.subs.set(A, { [PRODUCT]: { ...TRIAL, refunded: T0 + HOUR } });
    for (const signedAt of [NOW, NOW + MIN]) {
      const again = await f.webhook(deliver(event, { signedAt }));
      assert.equal(again.status, 200);
      assert.deepEqual(await body(again), {
        event_id: "evt-1",
        outcome: "duplicate",
      });
    }
    assert.deepEqual(f.rc.reads, [A]);
    assert.deepEqual(await f.row(A), kept);
    // The refund's own event is new, and is processed.
    const refund = await f.webhook(
      deliver({ ...purchase("evt-2"), type: "CANCELLATION" }),
    );
    assert.deepEqual(await body(refund), done("evt-2", 1));
    assert.equal((await f.row(A))!.status, "revoked");
    assert.deepEqual(f.rc.reads, [A, A]);
    assert.deepEqual(
      (await f.events()).map((e) => [e.id, e.type, e.user_id, e.processed]),
      [
        ["evt-1", "INITIAL_PURCHASE", A, true],
        ["evt-2", "CANCELLATION", A, true],
      ],
    );
  });
});

test("two deliveries of one event at once: both acknowledged, recorded once", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: TRIAL });
    const event = purchase("evt-1");
    const answers = await Promise.all([
      f.webhook(deliver(event)),
      f.webhook(deliver(event)),
    ]);
    for (const res of answers) {
      assert.equal(res.status, 200);
      assert.match(
        String((await body(res)).outcome),
        /^(processed|duplicate)$/,
      );
    }
    assert.deepEqual(await f.events(), [
      {
        id: "evt-1",
        type: "INITIAL_PURCHASE",
        environment: "production",
        user_id: A,
        processed: true,
      },
    ]);
    assert.deepEqual(await f.row(A), {
      ...rowFor(A, T0, { [PRODUCT]: TRIAL }),
      source_event_id: "evt-1",
    });
  });
});

test("a delivery that fails stays unprocessed, so RevenueCat's retry processes it", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: PAID });
    const event = purchase("evt-1");
    const attempt = async (status: number, error: string) => {
      const res = await f.webhook(deliver(event));
      assert.equal(res.status, status, error);
      assert.deepEqual(await body(res), { error, event_id: "evt-1" });
    };
    const pending = {
      id: "evt-1",
      type: "INITIAL_PURCHASE",
      environment: "production",
      user_id: null,
      processed: false,
    };
    // The delivery can't even be recorded: nothing else is tried.
    f.failing.add("receive");
    await attempt(503, "unavailable");
    assert.deepEqual(f.rc.reads, []);
    assert.deepEqual(await f.events(), []);
    // RevenueCat unreachable, then unreadable; then the write refused.
    f.rc.faults.push("down");
    await attempt(502, "store_unavailable");
    f.rc.faults.push("unreadable");
    await attempt(502, "store_unreadable");
    f.failing.add("save");
    await attempt(503, "unavailable");
    assert.equal(await f.row(A), undefined);
    assert.deepEqual(await f.events(), [pending]);
    // Kept this time, but the event couldn't be marked: still pending.
    f.failing.add("mark");
    await attempt(503, "unavailable");
    assert.equal((await f.row(A))!.status, "active");
    assert.deepEqual(await f.events(), [pending]);
    // RevenueCat's next retry goes through; the one after is a duplicate.
    assert.deepEqual(
      await body(await f.webhook(deliver(event))),
      done("evt-1", 1),
    );
    assert.deepEqual(await body(await f.webhook(deliver(event))), {
      event_id: "evt-1",
      outcome: "duplicate",
    });
    assert.deepEqual(f.rc.reads, [A, A, A, A, A]);
    assert.deepEqual(await f.events(), [
      { ...pending, user_id: A, processed: true },
    ]);
    assert.deepEqual(f.logs, [
      "entitlement-webhook: the event wasn't recorded (Error)",
      "entitlement-webhook: RevenueCat unavailable (RevenueCat answered 503)",
      "entitlement-webhook: RevenueCat's record refused (expires_date isn't a time)",
      "entitlement-webhook: the record wasn't kept (Error)",
      "entitlement-webhook: the event wasn't marked processed (Error)",
    ]);
  });
});

test("a transfer refreshes the accounts on both sides", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: PAID });
    assert.equal((await f.webhook(deliver(purchase("evt-1")))).status, 200);
    // Restored on another Forge account: RevenueCat moves it from A to B.
    f.rc.now = T0 + HOUR;
    f.rc.subs.set(A, {});
    f.rc.subs.set(B, { [PRODUCT]: PAID });
    const res = await f.webhook(
      deliver({
        id: "evt-2",
        type: "TRANSFER",
        transferred_from: [A],
        transferred_to: [B],
        store: "APP_STORE",
      }),
    );
    assert.deepEqual(await body(res), done("evt-2", 2));
    assert.deepEqual(f.rc.reads, [A, A, B]);
    const from = (await f.row(A))!;
    assert.equal(from.status, "none");
    // A's membership is over, not forgotten: no Forge Path preview again.
    assert.equal(from.first_entitled_at, iso(PAID.original!));
    assert.equal(from.source_event_id, "evt-2");
    const to = (await f.row(B))!;
    assert.equal(to.status, "active");
    assert.equal(to.source_event_id, "evt-2");
    // Each account reads its own record, as the app checks it.
    for (const [user, status] of [
      [A, "none"],
      [B, "active"],
    ] as const) {
      const [row] = await request<{ answer: unknown }>(
        f.db,
        sessionClaims(user),
        "SELECT public.forge_entitlement() AS answer",
      );
      const parsed = parseEntitlementResponse(row!.answer);
      assert.ok(parsed.ok);
      assert.equal(parsed.value.entitlement.status, status);
    }
    assert.deepEqual(
      (await f.events()).map((e) => [e.id, e.type, e.user_id, e.processed]),
      [
        ["evt-1", "INITIAL_PURCHASE", A, true],
        ["evt-2", "TRANSFER", A, true],
      ],
    );
  });
});

test("RevenueCat's anonymous App User IDs are left out", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: TRIAL });
    f.rc.subs.set(B, { [PRODUCT]: PAID });
    const anonymous = "$RCAnonymousID:8b1e0f5c2a7d4e6b9c3a1f0e2d4c6b8a";
    const as = { app_user_id: anonymous, original_app_user_id: anonymous };
    // Bought before signing in: the anonymous ID is now an alias of A's.
    const aliased = await f.webhook(
      deliver({ ...purchase("evt-1"), ...as, aliases: [anonymous, A] }),
    );
    assert.deepEqual(await body(aliased), done("evt-1", 1));
    // A transfer from an anonymous customer to B.
    const moved = await f.webhook(
      deliver({
        id: "evt-2",
        type: "TRANSFER",
        transferred_from: [anonymous],
        transferred_to: [B],
      }),
    );
    assert.deepEqual(await body(moved), done("evt-2", 1));
    // Only anonymous IDs: nothing to refresh; recorded and acknowledged.
    const nobody = await f.webhook(
      deliver({ ...purchase("evt-3"), ...as, aliases: [anonymous] }),
    );
    assert.deepEqual(await body(nobody), done("evt-3", 0));
    assert.deepEqual(f.rc.reads, [A, B]);
    assert.deepEqual(
      (await f.events()).map((e) => [e.id, e.user_id, e.processed]),
      [
        ["evt-1", A, true],
        ["evt-2", B, true],
        ["evt-3", null, true],
      ],
    );
  });
});

test("the project's store environments decide what counts; an event's never grants", async () => {
  const sandboxTrial: Sub = { ...TRIAL, sandbox: true };
  // Production accepts App Review's and TestFlight's sandbox purchases.
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: sandboxTrial });
    const res = await f.webhook(
      deliver({ ...purchase("evt-1"), environment: "SANDBOX" }),
    );
    assert.equal(res.status, 200);
    const row = (await f.row(A))!;
    assert.equal(row.status, "trial");
    assert.equal(row.environment, "sandbox");
  });
  // FORGE DEV never accepts a real purchase.
  const dev: EntitlementPolicy = {
    productIds: [PRODUCT],
    environments: acceptedEnvironments("development"),
  };
  await withForge({ policy: dev }, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: sandboxTrial });
    f.rc.subs.set(B, { [PRODUCT]: PAID });
    f.rc.subs.set(C, { [PRODUCT]: PAID });
    for (const user of [A, B]) {
      const event = {
        ...purchase(`evt-${user}`, user),
        environment: "SANDBOX",
      };
      assert.equal((await f.webhook(deliver(event))).status, 200);
    }
    assert.equal((await f.row(A))!.status, "trial");
    assert.equal((await f.row(B))!.status, "none");
    // The refresh applies the same policy.
    const refreshed = await body(await f.refresh(asking(B)));
    assert.equal(
      (refreshed.entitlement as Record<string, unknown>).status,
      "none",
    );
    // A production event reaching FORGE DEV: acknowledged; nothing read.
    const prod = await f.webhook(deliver(purchase("evt-prod", C)));
    assert.deepEqual(await body(prod), done("evt-prod", 0));
    assert.deepEqual(f.rc.reads, [A, B, B]);
    assert.equal(await f.row(C), undefined);
    assert.deepEqual(
      (await f.events()).find((e) => e.id === "evt-prod"),
      {
        id: "evt-prod",
        type: "INITIAL_PURCHASE",
        environment: "production",
        user_id: null,
        processed: true,
      },
    );
    assert.deepEqual(f.logs, [
      "entitlement-webhook: production event not accepted here",
    ]);
  });
});

test("products other than the approved membership are ignored", async () => {
  await withForge({}, async (f) => {
    const annual = "forge.membership.annual";
    const year: Sub = { purchased: T0 - DAY, expires: T0 + 364 * DAY };
    f.rc.subs.set(A, { [annual]: year });
    f.rc.subs.set(B, { [annual]: year, [PRODUCT]: PAID });
    const res = await f.webhook(
      deliver({ ...purchase("evt-1"), product_id: annual }),
    );
    assert.deepEqual(await body(res), done("evt-1", 1));
    const a = (await f.row(A))!;
    assert.equal(a.status, "none");
    assert.equal(a.product_id, null);
    assert.equal(a.first_entitled_at, null);
    const b = (await body(await f.refresh(asking(B)))).entitlement as Record<
      string,
      unknown
    >;
    assert.equal(b.status, "active");
    assert.equal(b.product_id, PRODUCT);
    assert.equal(b.access_until, PAID.expires);
  });
});

test("an event naming no Forge account, or a deleted one, is acknowledged and changes nothing", async () => {
  await withForge({}, async (f) => {
    // RevenueCat's dashboard test.
    const dashboard = await f.webhook(
      deliver({
        id: "evt-test",
        type: "TEST",
        app_user_id: "test-user",
        environment: "SANDBOX",
      }),
    );
    assert.deepEqual(await body(dashboard), done("evt-test", 0));
    // A renewal for an account that no longer exists here.
    f.rc.subs.set(NOBODY, { [PRODUCT]: PAID });
    const gone = await f.webhook(
      deliver({ ...purchase("evt-gone", NOBODY), type: "RENEWAL" }),
    );
    assert.deepEqual(await body(gone), done("evt-gone", 0));
    assert.deepEqual(f.rc.reads, [NOBODY]);
    assert.equal(await f.row(NOBODY), undefined);
    assert.deepEqual(await f.events(), [
      {
        id: "evt-gone",
        type: "RENEWAL",
        environment: "production",
        user_id: null,
        processed: true,
      },
      {
        id: "evt-test",
        type: "TEST",
        environment: "sandbox",
        user_id: null,
        processed: true,
      },
    ]);
  });
});

test("a genuine body that isn't a RevenueCat event is refused; too large a body isn't read", async () => {
  await withForge({}, async (f) => {
    for (const [name, raw] of [
      ["not JSON", "event=INITIAL_PURCHASE"],
      ["no event", JSON.stringify({ api_version: "1.0" })],
      ["no event ID", rcWebhook({ type: "RENEWAL", app_user_id: A })],
      ["an unknown type", rcWebhook({ id: "evt-1", type: "renewal" })],
    ]) {
      const res = await f.webhook(deliver({}, { body: raw }));
      assert.equal(res.status, 400, name);
      assert.deepEqual(await body(res), { error: "bad_request" }, name);
    }
    const huge = rcWebhook({
      ...purchase("evt-1"),
      padding: "x".repeat(MAX_WEBHOOK_BYTES),
    });
    const res = await f.webhook(deliver({}, { body: huge }));
    assert.equal(res.status, 413);
    assert.deepEqual(await body(res), { error: "too_large" });
    assert.deepEqual(f.rc.reads, []);
    assert.deepEqual(await f.events(), []);
  });
});

test("deleting the account still removes its record and its events", async () => {
  await withForge({}, async (f) => {
    f.rc.subs.set(A, { [PRODUCT]: PAID });
    f.rc.subs.set(B, { [PRODUCT]: TRIAL });
    for (const [id, user] of [
      ["evt-a", A],
      ["evt-b", B],
    ] as const)
      assert.equal((await f.webhook(deliver(purchase(id, user)))).status, 200);
    assert.equal((await f.refresh(asking(A))).status, 200);
    // A deletes the account, with a recent, genuine sign-in.
    await request(
      f.db,
      sessionClaims(A),
      "SELECT public.forge_delete_account()",
    );
    const tables = [
      "auth.users",
      "public.forge_entitlements",
      "public.forge_entitlement_events",
    ];
    for (const table of tables) {
      assert.equal(await countOf(f.db, table, A), 0, table);
      assert.equal(await countOf(f.db, table, B), 1, table);
    }
    // A late retry of A's event brings nothing of A's back.
    const late = await f.webhook(deliver(purchase("evt-a", A)));
    assert.deepEqual(await body(late), done("evt-a", 0));
    assert.equal(await countOf(f.db, "public.forge_entitlements", A), 0);
    assert.deepEqual(
      (await f.events()).map((e) => [e.id, e.user_id]),
      [
        ["evt-a", null],
        ["evt-b", B],
      ],
    );
  });
});

// ---- Configuration ------------------------------------------------------------------

/**
 * What each function needs: the name a missing setting is reported by, and
 * the variables it may come from.
 */
const REFRESH_NEEDS: [string, string[]][] = [
  ["SUPABASE_URL", ["SUPABASE_URL"]],
  [
    "SUPABASE_SECRET_KEYS",
    ["SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"],
  ],
  [
    "SUPABASE_PUBLISHABLE_KEYS",
    ["SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"],
  ],
  ["REVENUECAT_SECRET_API_KEY", ["REVENUECAT_SECRET_API_KEY"]],
  ["FORGE_ENVIRONMENT", ["FORGE_ENVIRONMENT"]],
  ["FORGE_MEMBERSHIP_PRODUCT_IDS", ["FORGE_MEMBERSHIP_PRODUCT_IDS"]],
];
const WEBHOOK_NEEDS: [string, string[]][] = [
  ...REFRESH_NEEDS,
  ["REVENUECAT_WEBHOOK_AUTHORIZATION", ["REVENUECAT_WEBHOOK_AUTHORIZATION"]],
  ["REVENUECAT_WEBHOOK_SIGNING_SECRET", ["REVENUECAT_WEBHOOK_SIGNING_SECRET"]],
];

/** The complete configuration, checked. */
function settings(vars: Record<string, string | undefined> = ENV) {
  const checked = webhookSettings(env(vars));
  assert.ok(checked.ok);
  return checked.value;
}

test("the policy comes from the configuration, never from the code", () => {
  assert.deepEqual(
    webhookSettings(
      env({
        ...ENV,
        SUPABASE_URL: `${SUPABASE}/`,
        FORGE_MEMBERSHIP_PRODUCT_IDS: ` ${PRODUCT} , forge.membership.v2,,${PRODUCT}`,
      }),
    ),
    {
      ok: true,
      value: {
        supabaseUrl: SUPABASE,
        serviceRoleKey: SECRET_KEY,
        publishableKey: PUBLISHABLE_KEY,
        revenueCatKey: RC_KEY,
        policy: {
          productIds: [PRODUCT, "forge.membership.v2"],
          environments: ["production", "sandbox"],
        },
        secrets: SECRETS,
      },
    },
  );
  const dev = refreshSettings(
    env({ ...ENV, FORGE_ENVIRONMENT: "development" }),
  );
  assert.ok(dev.ok);
  assert.deepEqual(dev.value.policy.environments, ["sandbox"]);
  // entitlement-refresh needs neither webhook secret.
  const refreshOnly = Object.fromEntries(
    REFRESH_NEEDS.flatMap(([, names]) => names).map((n) => [n, ENV[n]]),
  );
  assert.ok(refreshSettings(env(refreshOnly)).ok);
  for (const [name, value] of [
    ["SUPABASE_URL", "forge-test.supabase.co"],
    ["SUPABASE_URL", "ftp://forge-test.supabase.co"],
    ["SUPABASE_URL", "https://user:pass@forge-test.supabase.co"],
    ["REVENUECAT_SECRET_API_KEY", ` ${RC_KEY}`],
    ["FORGE_ENVIRONMENT", "staging"],
    ["FORGE_ENVIRONMENT", "Production"],
    ["FORGE_MEMBERSHIP_PRODUCT_IDS", " , "],
    ["FORGE_MEMBERSHIP_PRODUCT_IDS", "forge membership"],
    ["FORGE_MEMBERSHIP_PRODUCT_IDS", `${PRODUCT},"annual"`],
    ["REVENUECAT_WEBHOOK_AUTHORIZATION", `${SECRETS.authorization} `],
    ["REVENUECAT_WEBHOOK_SIGNING_SECRET", "   "],
  ] as [string, string][])
    assert.deepEqual(
      webhookSettings(env({ ...ENV, [name]: value })),
      { ok: false, problems: [name] },
      `${name}=${JSON.stringify(value)}`,
    );
  // Nothing set: every name is listed, and no value ever is.
  assert.deepEqual(webhookSettings(env({})), {
    ok: false,
    problems: WEBHOOK_NEEDS.map(([name]) => name),
  });
});

test("Supabase's keys: by name from SUPABASE_SECRET_KEYS and SUPABASE_PUBLISHABLE_KEYS, else the legacy keys, else refused by name", () => {
  const keys = (vars: Record<string, string | undefined>) => {
    const checked = refreshSettings(env(vars));
    return checked.ok
      ? {
          secret: checked.value.serviceRoleKey,
          publishable: checked.value.publishableKey,
        }
      : checked.problems;
  };
  const NEW = { secret: SECRET_KEY, publishable: PUBLISHABLE_KEY };
  // Hosted functions get both kinds: the new keys win, "default" by name.
  assert.deepEqual(keys(ENV), NEW);
  assert.deepEqual(
    keys({
      ...ENV,
      SUPABASE_SECRET_KEYS: JSON.stringify({
        ci: "sb_secret_ci-key-not-real",
        default: SECRET_KEY,
      }),
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
        web: "sb_publishable_web-key-not-real",
        default: PUBLISHABLE_KEY,
      }),
    }),
    NEW,
  );
  // Absent or malformed, each on its own: its legacy key.
  const malformed = (key: string) => [
    undefined,
    "",
    key,
    `{"default": "${key}"`,
    "null",
    JSON.stringify(key),
    JSON.stringify([key]),
    JSON.stringify({ secret: key }),
    JSON.stringify({ default: 42 }),
    JSON.stringify({ default: "" }),
    JSON.stringify({ default: ` ${key}` }),
  ];
  for (const value of malformed(SECRET_KEY))
    assert.deepEqual(
      keys({ ...ENV, SUPABASE_SECRET_KEYS: value }),
      { ...NEW, secret: LEGACY_SERVICE_KEY },
      `SUPABASE_SECRET_KEYS=${value}`,
    );
  for (const value of malformed(PUBLISHABLE_KEY))
    assert.deepEqual(
      keys({ ...ENV, SUPABASE_PUBLISHABLE_KEYS: value }),
      { ...NEW, publishable: LEGACY_ANON_KEY },
      `SUPABASE_PUBLISHABLE_KEYS=${value}`,
    );
  assert.deepEqual(keys(LEGACY_ENV), {
    secret: LEGACY_SERVICE_KEY,
    publishable: LEGACY_ANON_KEY,
  });
  // Neither: refused, under the dictionary's name alone.
  for (const [name, legacy] of [
    ["SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY"],
    ["SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY"],
  ] as const)
    for (const [value, legacyValue] of [
      [undefined, undefined],
      ["", ""],
      ['{"default": ""}', " "],
      ["{", "key-not-real\n"],
    ] as const)
      assert.deepEqual(
        keys({ ...ENV, [name]: value, [legacy]: legacyValue }),
        [name],
        `${name}=${value}, ${legacy}=${legacyValue}`,
      );
  // It goes with callers' tokens, so the publishable key is never a secret.
  for (const vars of [
    { ...ENV, SUPABASE_PUBLISHABLE_KEYS: ENV.SUPABASE_SECRET_KEYS },
    {
      ...ENV,
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({
        default: "sb_secret_another-key-not-real",
      }),
    },
    { ...LEGACY_ENV, SUPABASE_ANON_KEY: LEGACY_SERVICE_KEY },
  ])
    assert.deepEqual(keys(vars), ["SUPABASE_PUBLISHABLE_KEYS"]);
});

test("without its whole configuration, a function refuses everything and does nothing", async () => {
  for (const [fn, serve, needs, ask] of [
    ["entitlement-refresh", serveRefresh, REFRESH_NEEDS, () => asking(A)],
    [
      "entitlement-webhook",
      serveWebhook,
      WEBHOOK_NEEDS,
      () => deliver(purchase("evt-1")),
    ],
  ] as const)
    for (const [name, from] of needs)
      for (const value of [undefined, "", " "]) {
        const connected: unknown[] = [];
        const logs: string[] = [];
        const missing = Object.fromEntries(from.map((n) => [n, value]));
        const served = serve(
          env({ ...ENV, ...missing }),
          (s) => {
            connected.push(s);
            return stub();
          },
          (line) => logs.push(line),
        );
        const res = await served(ask());
        assert.equal(res.status, 503, `${fn} without ${name}`);
        await assertNothingShown(res);
        assert.deepEqual(await body(res), { error: "not_configured" });
        assert.deepEqual(connected, [], "nothing runs");
        // The setting's name, never a value.
        assert.deepEqual(logs, [`${fn}: not configured (${name})`]);
        const get = await served(new Request(FUNCTIONS, { method: "GET" }));
        assert.equal(get.status, 405);
      }
  // The bare key where its dictionary belongs, and no legacy key: refused
  // by name; the key shows nowhere, though the parser's message quotes it.
  const lines: string[] = [];
  const refused = await serveRefresh(
    env({
      ...ENV,
      SUPABASE_SECRET_KEYS: SECRET_KEY,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    }),
    () => assert.fail("connected"),
    (line) => lines.push(line),
  )(asking(A));
  assert.equal(refused.status, 503);
  await assertNothingShown(refused);
  assert.deepEqual(lines, [
    "entitlement-refresh: not configured (SUPABASE_SECRET_KEYS)",
  ]);
  // The handlers refuse alike without a webhook secret or a product.
  const untouched = (): Services =>
    stub({
      userFromToken: async () => assert.fail("asked Supabase Auth"),
      receiveEvent: async () => assert.fail("recorded an event"),
    });
  for (const secrets of [
    { ...SECRETS, authorization: "" },
    { ...SECRETS, signingSecret: "" },
  ]) {
    const res = await handleWebhook(deliver(purchase("evt-1")), {
      ...untouched(),
      policy: POLICY,
      secrets,
      now: () => NOW,
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await body(res), { error: "not_configured" });
  }
  const noProduct = { productIds: [], environments: POLICY.environments };
  for (const res of [
    await handleRefresh(asking(A), { ...untouched(), policy: noProduct }),
    await handleWebhook(deliver(purchase("evt-1")), {
      ...untouched(),
      policy: noProduct,
      secrets: SECRETS,
      now: () => NOW,
    }),
  ]) {
    assert.equal(res.status, 503);
    assert.deepEqual(await body(res), { error: "not_configured" });
  }
});

// ---- The real services, on a fake network ------------------------------------------

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  timed: boolean;
};

/** A network answering each call with `answer`, and keeping every call. */
function network(answer: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl: Fetch = async (url, init) => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => {
      headers[name] = value;
    });
    const call: Call = {
      url,
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
      timed: init.signal instanceof AbortSignal,
    };
    calls.push(call);
    return answer(call);
  };
  return { calls, fetchImpl };
}
const reply = (status: number, value?: unknown) =>
  new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: value === undefined ? {} : { "content-type": "application/json" },
  });
/** Answers in order, for one service at a time. */
function scripted(
  options?: Parameters<typeof supabaseServices>[1],
  vars: Record<string, string | undefined> = ENV,
) {
  const answers: Response[] = [];
  const net = network(() => answers.shift() ?? reply(599));
  const services = supabaseServices(net.fetchImpl, options)(settings(vars));
  /** The next answers; forgets the calls so far. */
  const next = (...responses: Response[]) => {
    answers.push(...responses);
    net.calls.length = 0;
  };
  return { services, calls: net.calls, next };
}
/** The service role, with a new secret key: on apikey alone. */
const SERVICE_HEADERS = { apikey: SECRET_KEY };
/** The headers that carry keys and tokens. */
const credentials = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name === "apikey" || name === "authorization",
    ),
  );

test("which key goes where: the secret key on apikey (a legacy JWT key also as the bearer); a caller's token with the publishable key", async () => {
  const event = {
    id: "evt-1",
    type: "RENEWAL",
    environment: null,
    eventAt: null,
    accounts: [A],
  };
  for (const [vars, service, publishable] of [
    [ENV, { apikey: SECRET_KEY }, PUBLISHABLE_KEY],
    [
      LEGACY_ENV,
      {
        apikey: LEGACY_SERVICE_KEY,
        authorization: `Bearer ${LEGACY_SERVICE_KEY}`,
      },
      LEGACY_ANON_KEY,
    ],
  ] as const) {
    const { services, calls, next } = scripted({}, vars);
    next(
      reply(200, { id: A }),
      reply(201),
      reply(200, answer(A, T0)),
      reply(200, []),
      reply(201),
      reply(204),
      reply(200, rcCustomer(T0, {})),
    );
    assert.equal(await services.userFromToken(tokenOf(A)), A);
    assert.equal(await services.saveEntitlement(rowFor(A, T0)), "saved");
    await services.readEntitlement(A, tokenOf(A));
    await services.receiveEvent(event);
    await services.markProcessed(event.id, A);
    await services.fetchSubscriber(A);
    const caller = {
      apikey: publishable,
      authorization: `Bearer ${tokenOf(A)}`,
    };
    assert.deepEqual(
      calls.map((c) => [
        `${c.method} ${new URL(c.url).pathname}`,
        credentials(c.headers),
      ]),
      [
        ["GET /auth/v1/user", caller],
        ["POST /rest/v1/forge_entitlements", service],
        ["POST /rest/v1/rpc/forge_entitlement", caller],
        ["GET /rest/v1/forge_entitlement_events", service],
        ["POST /rest/v1/forge_entitlement_events", service],
        ["PATCH /rest/v1/forge_entitlement_events", service],
        [`GET /v1/subscribers/${A}`, { authorization: `Bearer ${RC_KEY}` }],
      ],
      publishable,
    );
    // A new key (sb_…) is never anyone's bearer.
    for (const c of calls)
      assert.doesNotMatch(c.headers.authorization ?? "", /\bsb_/, c.url);
  }
});

test("Supabase Auth: the caller's token, and only a real account's, decides", async () => {
  const { services, calls, next } = scripted();
  const ask = (res: Response) => {
    next(res);
    return services.userFromToken(tokenOf(A));
  };
  assert.equal(
    await ask(reply(200, { id: A.toUpperCase(), is_anonymous: false })),
    A,
  );
  // As the draft's row level security reads it: absent isn't anonymous.
  assert.equal(await ask(reply(200, { id: A })), A);
  assert.equal(await ask(reply(200, { id: A, is_anonymous: true })), undefined);
  assert.equal(await ask(reply(200, { id: "user-a" })), undefined);
  for (const status of [400, 401, 403, 404])
    assert.equal(await ask(reply(status, { msg: "invalid JWT" })), undefined);
  await assert.rejects(ask(reply(500, { msg: "down" })), {
    name: "ServiceError",
    message: "Supabase Auth answered 500",
  });
  await assert.rejects(ask(new Response("<html>")), {
    name: "ServiceError",
    message: "Supabase Auth's answer isn't JSON",
  });
  assert.deepEqual(calls, [
    {
      url: `${SUPABASE}/auth/v1/user`,
      method: "GET",
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${tokenOf(A)}`,
        accept: "application/json",
      },
      body: undefined,
      timed: true,
    },
  ]);
});

test("RevenueCat: read with the secret key, which goes nowhere else", async () => {
  const { services, calls, next } = scripted();
  const read = (res: Response) => {
    next(res);
    return services.fetchSubscriber(A);
  };
  const record = rcCustomer(T0, { [PRODUCT]: TRIAL });
  assert.deepEqual(await read(reply(200, record)), record);
  // 201: RevenueCat met the App User ID just now.
  assert.deepEqual(await read(reply(201, record)), record);
  for (const status of [401, 429, 500])
    await assert.rejects(read(reply(status, { message: `key ${RC_KEY}` })), {
      name: "ServiceError",
      message: `RevenueCat answered ${status}`,
    });
  await assert.rejects(read(new Response("<html>")), {
    name: "ServiceError",
    message: "RevenueCat's answer isn't JSON",
  });
  assert.deepEqual(calls, [
    {
      url: subscriberUrl(A),
      method: "GET",
      headers: {
        authorization: `Bearer ${RC_KEY}`,
        accept: "application/json",
      },
      body: undefined,
      timed: true,
    },
  ]);
});

test("the database: written as the service role, answered with the caller's session", async () => {
  const { services, calls, next } = scripted({ now: () => T0 + MIN });
  const row = {
    ...rowFor(A, T0, { [PRODUCT]: TRIAL }),
    source_event_id: "evt-1",
  };
  // PostgREST's upsert, under the draft's guard.
  next(reply(201));
  assert.equal(await services.saveEntitlement(row), "saved");
  assert.deepEqual(calls, [
    {
      url: `${SUPABASE}/rest/v1/forge_entitlements?on_conflict=user_id`,
      method: "POST",
      headers: {
        ...SERVICE_HEADERS,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
      timed: true,
    },
  ]);
  next(reply(409, { code: "23503", message: "violates foreign key" }));
  assert.equal(await services.saveEntitlement(row), "no_account");
  next(reply(409, { code: "23514", message: "violates check" }));
  await assert.rejects(services.saveEntitlement(row), {
    name: "ServiceError",
    message: "the database answered 409",
  });
  next(reply(503));
  await assert.rejects(services.saveEntitlement(row), {
    name: "ServiceError",
    message: "the database answered 503",
  });

  // forge_entitlement(), with the caller's own token.
  next(reply(200, answer(A, T0, row)));
  assert.deepEqual(
    await services.readEntitlement(A, tokenOf(A)),
    answer(A, T0, row),
  );
  assert.deepEqual(calls, [
    {
      url: `${SUPABASE}/rest/v1/rpc/forge_entitlement`,
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${tokenOf(A)}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: "{}",
      timed: true,
    },
  ]);

  // A new event: looked up, then recorded (insert ... on conflict do nothing).
  const event = {
    id: "evt 1/ü?&",
    type: "RENEWAL",
    environment: "sandbox" as const,
    eventAt: T0,
    accounts: [A],
  };
  const byId = `${SUPABASE}/rest/v1/forge_entitlement_events?id=eq.evt%201%2F%C3%BC%3F%26`;
  next(reply(200, []), reply(201));
  assert.deepEqual(await services.receiveEvent(event), { processed: false });
  assert.deepEqual(calls, [
    {
      url: `${byId}&select=processed_at`,
      method: "GET",
      headers: { ...SERVICE_HEADERS, accept: "application/json" },
      body: undefined,
      timed: true,
    },
    {
      url: `${SUPABASE}/rest/v1/forge_entitlement_events`,
      method: "POST",
      headers: {
        ...SERVICE_HEADERS,
        "content-type": "application/json",
        prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: event.id,
        type: "RENEWAL",
        environment: "sandbox",
        event_at: iso(T0),
      }),
      timed: true,
    },
  ]);
  // Seen before, processed or not: nothing more is written.
  next(reply(200, [{ processed_at: iso(T0) }]));
  assert.deepEqual(await services.receiveEvent(event), { processed: true });
  next(reply(200, [{ processed_at: null }]));
  assert.deepEqual(await services.receiveEvent(event), { processed: false });
  assert.equal(calls.length, 1);
  // Marked once: only while still unprocessed.
  next(reply(204));
  await services.markProcessed(event.id, A);
  assert.deepEqual(calls, [
    {
      url: `${byId}&processed_at=is.null`,
      method: "PATCH",
      headers: {
        ...SERVICE_HEADERS,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify({ processed_at: iso(T0 + MIN), user_id: A }),
      timed: true,
    },
  ]);
  next(reply(500));
  await assert.rejects(services.markProcessed(event.id, null), {
    name: "ServiceError",
  });
});

type Keys = { secret: string; publishable: string };

/**
 * Supabase and RevenueCat on a fake network, strict about who sends what,
 * as Supabase's keys work: the secret key on apikey is the service role (a
 * legacy JWT key also comes as the bearer; a new key as a bearer fails, as
 * no JWT), and the publishable key with a user's token is that user.
 */
function fakeCloud(keys: Keys) {
  const rows = new Map<string, EntitlementRow>();
  const events = new Map<
    string,
    { processed_at: string | null; user_id: string | null }
  >();
  const subs = new Map<string, Record<string, Sub>>();
  /** RevenueCat's next answers, before its records. */
  const rcAnswers: Response[] = [];
  const problems: string[] = [];
  const legacy = !keys.secret.startsWith("sb_");
  const asService = (h: Record<string, string>) =>
    h.apikey === keys.secret &&
    h.authorization === (legacy ? `Bearer ${keys.secret}` : undefined);
  const caller = (h: Record<string, string>) =>
    h.apikey === keys.publishable
      ? /^Bearer test-token-(.+)$/.exec(h.authorization ?? "")?.[1]
      : undefined;
  const net = network(({ url, method, headers, body: sent }) => {
    const u = new URL(url);
    const call = `${method} ${u.pathname}`;
    const all = JSON.stringify(headers);
    if (/^Bearer sb_/.test(headers.authorization ?? ""))
      problems.push(`${call}: a new API key as the bearer`);
    if (headers.authorization?.startsWith("Bearer test-token-")) {
      if (all.includes(keys.secret))
        problems.push(`${call}: the secret key with a caller's token`);
      if (headers.apikey !== keys.publishable)
        problems.push(`${call}: a caller's token without the publishable key`);
    }
    if (u.origin === "https://api.revenuecat.com") {
      if (
        !isDeepStrictEqual(headers, {
          accept: "application/json",
          authorization: `Bearer ${RC_KEY}`,
        })
      )
        problems.push(`${call}: RevenueCat was sent more than its key`);
      const id = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      return (
        rcAnswers.shift() ?? reply(200, rcCustomer(T0, subs.get(id) ?? {}))
      );
    }
    if (u.origin !== SUPABASE) problems.push(`called ${u.origin}`);
    if (all.includes(RC_KEY))
      problems.push("Supabase was sent RevenueCat's key");
    const id = u.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
    switch (call) {
      case "GET /auth/v1/user": {
        const user = caller(headers);
        return user && [A, B].includes(user)
          ? reply(200, { id: user, is_anonymous: false })
          : reply(401, { msg: "invalid JWT" });
      }
      case "POST /rest/v1/forge_entitlements": {
        if (!asService(headers)) break;
        const row = JSON.parse(sent ?? "") as EntitlementRow;
        rows.set(row.user_id, row);
        return reply(201);
      }
      case "POST /rest/v1/rpc/forge_entitlement": {
        const user = caller(headers);
        return user
          ? reply(200, answer(user, T0 + MIN, rows.get(user)))
          : reply(401);
      }
      case "GET /rest/v1/forge_entitlement_events": {
        if (!asService(headers)) break;
        const e = events.get(id);
        return reply(200, e ? [{ processed_at: e.processed_at }] : []);
      }
      case "POST /rest/v1/forge_entitlement_events": {
        if (!asService(headers)) break;
        const e = JSON.parse(sent ?? "") as { id: string };
        if (!events.has(e.id))
          events.set(e.id, { processed_at: null, user_id: null });
        return reply(201);
      }
      case "PATCH /rest/v1/forge_entitlement_events": {
        if (!asService(headers)) break;
        const e = events.get(id);
        if (e && e.processed_at === null)
          Object.assign(e, JSON.parse(sent ?? ""));
        return reply(204);
      }
    }
    problems.push(`${call} refused`);
    return reply(403);
  });
  const paths = () => {
    const seen = net.calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    net.calls.length = 0;
    return seen;
  };
  return {
    rows,
    events,
    subs,
    rcAnswers,
    problems,
    paths,
    fetchImpl: net.fetchImpl,
  };
}

/** Both functions as Deno serves them, on the fake cloud with these keys. */
async function wired(
  label: string,
  vars: Record<string, string | undefined>,
  keys: Keys,
) {
  const cloud = fakeCloud(keys);
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);
  const shown = async (res: Promise<Response>) => {
    const r = await res;
    await assertNothingShown(r);
    return r;
  };
  const refresh = (req: Request) =>
    shown(entitlementRefresh(env(vars), cloud.fetchImpl, log)(req));
  const webhook = (req: Request) =>
    shown(entitlementWebhook(env(vars), cloud.fetchImpl, log)(req));
  cloud.subs.set(A, { [PRODUCT]: TRIAL });

  const res = await refresh(asking(A));
  assert.equal(res.status, 200, label);
  assert.deepEqual(
    await body(res),
    answer(A, T0 + MIN, rowFor(A, T0, { [PRODUCT]: TRIAL })),
  );
  assert.deepEqual(cloud.paths(), [
    "GET /auth/v1/user",
    `GET /v1/subscribers/${A}`,
    "POST /rest/v1/forge_entitlements",
    "POST /rest/v1/rpc/forge_entitlement",
  ]);
  // A token Supabase Auth refuses: nothing else is asked.
  assert.equal((await refresh(asking(NOBODY))).status, 401);
  assert.deepEqual(cloud.paths(), ["GET /auth/v1/user"]);
  // RevenueCat failing with an answer that repeats its key: kept to itself.
  cloud.rcAnswers.push(reply(500, { message: `invalid key ${RC_KEY}` }));
  const failed = await refresh(asking(A));
  assert.equal(failed.status, 502);
  assert.deepEqual(await body(failed), { error: "store_unavailable" });
  cloud.paths();

  // RevenueCat's delivery (the real clock checks its signature's time).
  const event = purchase("evt-1");
  const delivered = await webhook(deliver(event, { signedAt: Date.now() }));
  assert.deepEqual(await body(delivered), done("evt-1", 1));
  assert.deepEqual(cloud.paths(), [
    "GET /rest/v1/forge_entitlement_events",
    "POST /rest/v1/forge_entitlement_events",
    `GET /v1/subscribers/${A}`,
    "POST /rest/v1/forge_entitlements",
    "PATCH /rest/v1/forge_entitlement_events",
  ]);
  assert.equal(cloud.events.get("evt-1")?.user_id, A);
  assert.equal(cloud.rows.get(A)?.source_event_id, "evt-1");
  const again = await webhook(deliver(event, { signedAt: Date.now() }));
  assert.deepEqual(await body(again), {
    event_id: "evt-1",
    outcome: "duplicate",
  });
  assert.deepEqual(cloud.paths(), ["GET /rest/v1/forge_entitlement_events"]);
  // Not RevenueCat: refused before a single call.
  const forged = await webhook(
    deliver(purchase("evt-2"), {
      authorization: "Bearer a-guess",
      signedAt: Date.now(),
    }),
  );
  assert.equal(forged.status, 401);
  assert.deepEqual(cloud.paths(), []);

  assert.deepEqual(cloud.problems, [], label);
  assertHidden(logs.join("\n"), "the log");
  assert.deepEqual(logs, [
    "entitlement-refresh: RevenueCat unavailable (RevenueCat answered 500)",
    "entitlement-webhook: refused (authorization)",
  ]);
}

test("wired as Deno serves them: each key goes only where it belongs, and none comes back", async () => {
  // Hosted: the new keys, preferred to the legacy ones injected alongside.
  await wired("the new keys", ENV, {
    secret: SECRET_KEY,
    publishable: PUBLISHABLE_KEY,
  });
  await wired("the legacy keys alone", LEGACY_ENV, {
    secret: LEGACY_SERVICE_KEY,
    publishable: LEGACY_ANON_KEY,
  });
});

// ---- The functions' source ----------------------------------------------------------

const IMPORT =
  /(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const importsOf = (source: string) =>
  [...source.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3]!);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sources(path)
      : name.endsWith(".ts")
        ? [path.replaceAll("\\", "/")]
        : [];
  });
}

test("the functions import nothing but each other, and only their entrypoints read the environment", () => {
  const files = sources("supabase/functions");
  for (const file of [
    "_shared/entitlement.ts",
    "_shared/reconcile.ts",
    "_shared/rest.ts",
    "entitlement-refresh/index.ts",
    "entitlement-webhook/index.ts",
  ])
    assert.ok(files.includes(`supabase/functions/${file}`), file);
  // RevenueCat's secret (sk_) and SDK keys, Supabase's new keys, and JWTs.
  const secret =
    /\b(sk_|appl_|goog_|rcb_)[A-Za-z0-9]{8,}|\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{20,}\./;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Relative, with the extension Deno needs: no npm:, jsr: or URL.
    for (const spec of importsOf(source))
      assert.match(spec, /^\.\.?\/[\w./-]+\.ts$/, `${file} imports ${spec}`);
    assert.equal(
      /\bDeno\.env\b/.test(source),
      file.endsWith("/index.ts"),
      file,
    );
    assert.doesNotMatch(
      source,
      /\bprocess\.env\b|\bDeno\.(?!env\b|serve\b)/,
      file,
    );
    assert.doesNotMatch(source, secret, file);
  }
  for (const fn of ["entitlement-refresh", "entitlement-webhook"]) {
    const source = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
    assert.deepEqual(importsOf(source), ["../_shared/rest.ts"], fn);
    assert.equal(source.match(/\bDeno\.serve\(/g)?.length, 1, fn);
  }
});
