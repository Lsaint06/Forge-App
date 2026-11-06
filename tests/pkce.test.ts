import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  AuthRetryableFetchError,
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  exchangeOnce,
  pkceAuthOptions,
  pkceSupported,
  readAuthCallback,
} from "../src/auth/pkce";

// Phase 7.8E, Stage 5 (E5): PKCE callback handling, prepared and switched
// off. Simulated account services only; nothing reaches a network.

const CODE = "6f1a1d4e-0b6f-4a8c-9a8e-2c6c9d3f6b1a";
const FLOW = "0123456789abcdef0123456789abcdef";

test("callbacks: a code in the query with its flow, an error, or nothing", () => {
  assert.deepEqual(readAuthCallback(`forge:///welcome?code=${CODE}`), {
    kind: "code",
    code: CODE,
  });
  assert.deepEqual(
    readAuthCallback(`forge:///welcome?code=${CODE}&sb_flow_id=${FLOW}`),
    { kind: "code", code: CODE, flowId: FLOW },
  );
  assert.deepEqual(
    readAuthCallback(
      `exps://c-x.on.expo.app/--/welcome?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`,
    ),
    {
      kind: "error",
      code: "otp_expired",
      description: "Email link is invalid",
    },
  );
  assert.deepEqual(readAuthCallback("forge:///welcome#error=server_error"), {
    kind: "error",
    code: "server_error",
    description: undefined,
  });
  for (const url of [
    // A code is never taken from the fragment.
    `forge:///welcome#code=${CODE}`,
    // Implicit-flow tokens aren't a PKCE callback.
    "forge:///welcome#access_token=a&refresh_token=b",
    "forge:///welcome?code=short",
    `forge:///welcome?code=${"x".repeat(600)}`,
    "forge:///welcome?code=has%20space",
    "forge:///welcome?code=<script>",
    // A malformed flow ID would spend the code on another flow's verifier.
    `forge:///welcome?code=${CODE}&sb_flow_id=short`,
    `forge:///welcome?code=${CODE}&sb_flow_id=${"f".repeat(65)}`,
    `forge:///welcome?code=${CODE}&sb_flow_id=../../etc`,
    `forge:///welcome?code=${CODE}&sb_flow_id=`,
    "not a url",
    "",
  ])
    assert.deepEqual(readAuthCallback(url), { kind: "none" }, url);
});

test("PKCE is switched on only where Web Crypto makes it real", () => {
  const subtle = { digest: async () => new ArrayBuffer(32) };
  const full = {
    crypto: { getRandomValues: (a: unknown) => a, subtle },
    TextEncoder,
  };
  assert.equal(pkceSupported(full), true);
  assert.deepEqual(pkceAuthOptions(full), { flowType: "pkce" });
  for (const runtime of [
    {},
    { TextEncoder },
    // No secure random: supabase-js would use Math.random.
    { crypto: { subtle }, TextEncoder },
    // No digest: supabase-js would send the verifier as a "plain" challenge.
    { crypto: { getRandomValues: () => undefined }, TextEncoder },
    { crypto: { getRandomValues: () => undefined, subtle: {} }, TextEncoder },
    { crypto: full.crypto },
  ]) {
    assert.equal(pkceSupported(runtime), false, JSON.stringify(runtime));
    assert.throws(() => pkceAuthOptions(runtime));
  }
  // Node has Web Crypto; whether Forge's phone runtime does is checked on
  // the device before activation (report, section 13).
  assert.equal(pkceSupported(), true);
});

function starter(answer: () => Promise<unknown>) {
  const calls: unknown[][] = [];
  return {
    calls,
    client: {
      auth: {
        exchangeCodeForSession: async (...args: unknown[]) => {
          calls.push(args);
          return answer();
        },
      },
    } as never,
  };
}
const session = {
  data: {
    session: {
      access_token: "at",
      refresh_token: "rt",
      user: { id: "user-a" },
    },
  },
  error: null,
};

test("a code is exchanged once, with its flow; a duplicate callback is ignored", async () => {
  const s = starter(async () => session);
  const code = `${CODE}-once`;
  assert.deepEqual(await exchangeOnce(s.client, { code, flowId: FLOW }), {
    kind: "exchanged",
    tokens: { access_token: "at", refresh_token: "rt" },
    userId: "user-a",
  });
  assert.deepEqual(await exchangeOnce(s.client, { code, flowId: FLOW }), {
    kind: "duplicate",
  });
  assert.deepEqual(s.calls, [[code, { flowId: FLOW }]]);
  const plain = starter(async () => session);
  await exchangeOnce(plain.client, { code: `${CODE}-noflow` });
  assert.deepEqual(plain.calls, [[`${CODE}-noflow`, undefined]]);
});

test("any failure means starting again, never retrying the same code", async () => {
  const cases: [() => Promise<unknown>, string][] = [
    ...[
      "flow_state_expired",
      "flow_state_not_found",
      "bad_code_verifier",
      "pkce_code_verifier_not_found",
      "otp_expired",
    ].map((code): [() => Promise<unknown>, string] => [
      async () => ({ data: { session: null }, error: { code } }),
      "expired",
    ]),
    [
      async () => ({
        data: { session: null },
        error: { code: "unexpected_failure" },
      }),
      "refused",
    ],
    [async () => ({ data: { session: null }, error: null }), "refused"],
    // supabase-js answers a lost connection with an error, not a throw.
    [
      async () => ({
        data: { session: null },
        error: new AuthRetryableFetchError("Failed to fetch", 0),
      }),
      "network",
    ],
    [() => Promise.reject(new TypeError("Network request failed")), "network"],
  ];
  for (const [i, [answer, reason]] of cases.entries()) {
    const s = starter(answer);
    const code = `${CODE}-failure-${i}`;
    assert.deepEqual(await exchangeOnce(s.client, { code }), {
      kind: "restart",
      reason,
    });
    assert.deepEqual(await exchangeOnce(s.client, { code }), {
      kind: "duplicate",
    });
    assert.equal(s.calls.length, 1);
  }
});

test("nothing is ever logged: no code, token or error detail", async () => {
  const logged: unknown[] = [];
  const original = { ...console };
  for (const level of ["log", "info", "warn", "error", "debug"] as const)
    console[level] = (...args: unknown[]) => void logged.push(args);
  try {
    readAuthCallback(`forge:///welcome?code=${CODE}`);
    await exchangeOnce(starter(async () => session).client, {
      code: `${CODE}-log`,
    });
    await exchangeOnce(starter(() => Promise.reject(new Error(CODE))).client, {
      code: `${CODE}-log2`,
    });
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

// ---- With the real supabase-js client and a simulated account service ----

const base64url = (b: Buffer) =>
  b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const jwt = (claims: object) =>
  `${base64url(Buffer.from('{"alg":"HS256","typ":"JWT"}'))}.${base64url(
    Buffer.from(JSON.stringify(claims)),
  )}.signature`;

/** A storage-less client in PKCE mode, as a confirmation would use. */
function realStarter(service: {
  challenges: Map<string, string>;
  down?: boolean;
}) {
  const tokenRequests: { auth_code: string; code_verifier: string }[] = [];
  const fetch = async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    if (!url.includes("/token?grant_type=pkce"))
      throw new Error(`unexpected request ${url}`);
    if (service.down) throw new TypeError("Network request failed");
    const body = JSON.parse(String(init?.body)) as {
      auth_code: string;
      code_verifier: string;
    };
    tokenRequests.push(body);
    const challenge = service.challenges.get(body.auth_code);
    service.challenges.delete(body.auth_code);
    const reply = (status: number, json: object) =>
      new Response(JSON.stringify(json), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (challenge === undefined)
      return reply(404, { error_code: "flow_state_not_found", msg: "no" });
    const hashed = base64url(
      createHash("sha256").update(body.code_verifier).digest(),
    );
    if (hashed !== challenge)
      return reply(400, { error_code: "bad_code_verifier", msg: "no" });
    const now = Math.floor(Date.now() / 1000);
    return reply(200, {
      access_token: jwt({ sub: "user-a", exp: now + 3600, iat: now }),
      refresh_token: "refresh-a",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: {
        id: "user-a",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      },
    });
  };
  const client = createClient(
    "https://devprojectrefaaaaaaa.supabase.co",
    "public-key",
    {
      auth: {
        ...pkceAuthOptions(),
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetch as typeof globalThis.fetch },
    },
  );
  return { client, tokenRequests };
}

/** Starts a Google flow; the simulated service issues `code` for it. */
async function startFlow(
  client: SupabaseClient,
  service: { challenges: Map<string, string> },
  code: string,
) {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: "forge:///welcome", skipBrowserRedirect: true },
  });
  assert.equal(error, null);
  const authorize = new URL(data.url);
  // The real S256 method, never "plain".
  assert.equal(authorize.searchParams.get("code_challenge_method"), "s256");
  service.challenges.set(code, authorize.searchParams.get("code_challenge")!);
  return data.flowId ?? undefined;
}

test("real supabase-js: the verifier proves the flow; one exchange per code", async () => {
  const service = { challenges: new Map<string, string>() };
  const { client, tokenRequests } = realStarter(service);
  const code = `${CODE}-real`;
  const flowId = await startFlow(client, service, code);
  assert.match(flowId ?? "", /^[A-Za-z0-9_-]{8,64}$/);
  const outcome = await exchangeOnce(client, { code, flowId });
  assert.equal(outcome.kind, "exchanged");
  if (outcome.kind === "exchanged") assert.equal(outcome.userId, "user-a");
  // The exchanged session is held by the starting client: which is why a
  // confirmation must start on one that stores nothing.
  const held = await client.auth.getSession();
  assert.equal(held.data.session?.user.id, "user-a");
  assert.deepEqual(await exchangeOnce(client, { code, flowId }), {
    kind: "duplicate",
  });
  assert.equal(tokenRequests.length, 1);
});

test("real supabase-js: a lost answer discards the verifier, so the flow restarts", async () => {
  const service = {
    challenges: new Map<string, string>(),
    down: true,
  };
  const { client, tokenRequests } = realStarter(service);
  const code = `${CODE}-lost`;
  const flowId = await startFlow(client, service, code);
  assert.deepEqual(await exchangeOnce(client, { code, flowId }), {
    kind: "restart",
    reason: "network",
  });
  // Even bypassing exchangeOnce, the same code can't be tried again.
  service.down = false;
  const again = await client.auth.exchangeCodeForSession(code, { flowId });
  assert.equal(again.error?.code, "pkce_code_verifier_not_found");
  assert.equal(tokenRequests.length, 0);
});

test("real supabase-js: an unknown flow fails without spending the code", async () => {
  const service = { challenges: new Map<string, string>() };
  const { client, tokenRequests } = realStarter(service);
  const code = `${CODE}-foreign`;
  await startFlow(client, service, code);
  assert.deepEqual(
    await exchangeOnce(client, { code, flowId: "ffffffffffffffffffffffff" }),
    { kind: "restart", reason: "expired" },
  );
  assert.equal(tokenRequests.length, 0);
  assert.ok(service.challenges.has(code), "the code is still unused");
});
