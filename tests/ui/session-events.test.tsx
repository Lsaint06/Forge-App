import React from "react";
import { render, act, waitFor } from "@testing-library/react-native";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SESSION_ENDED_NOTICE, useAuthSession } from "../../src/auth/session";

// Phase 7.8E, Stage 4: whether a sign-out was asked for or not, told apart
// with the real supabase-js client (the version Forge ships), not a mock.
// Only the account service is simulated, in memory; nothing reaches a
// network. The mocks elsewhere assume supabase-js announces SIGNED_OUT while
// signOut() is still running; this checks that assumption, and how the
// library ends a sign-in it can no longer use.

const mockStore = new Map<string, string>();
jest.mock("../../src/platform/sessionStorage", () => ({
  sessionStorage: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) =>
      void mockStore.set(key, value),
    removeItem: async (key: string) => void mockStore.delete(key),
  },
}));
jest.mock("expo-linking", () => ({
  useURL: () => null,
  createURL: (p: string) => `forge://${p.replace(/^\//, "")}`,
}));

const URL_ = "https://devprojectrefaaaaaaa.supabase.co";
const KEY = "sb-devprojectrefaaaaaaa-auth-token";
const user = {
  id: "user-a",
  aud: "authenticated",
  role: "authenticated",
  email: "a@example.com",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
const token = (session: string) => {
  const now = Math.floor((realNow() + skewMs) / 1000);
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: user.id,
    role: "authenticated",
    session_id: session,
    iat: now,
    exp: now + 3600,
  })}.c2lnbmF0dXJl`;
};

// The clock supabase-js reads (Date.now). Each request that finds no
// connection moves it 31 seconds on, past supabase-js's ~30-second retry
// budget, so a refresh is tried once instead of for 25 real seconds.
let skewMs = 0;
const realNow = Date.now.bind(Date);
/** The clock as if `seconds` had passed. */
const later = (seconds: number) => {
  skewMs += seconds * 1000;
};

/** The simulated account service: what each request gets, and the log. */
function service() {
  const s = {
    /** No connection at all. */
    offline: false,
    /** This sign-in was ended elsewhere (all devices, revoked, deleted). */
    revoked: false,
    requests: [] as string[],
  };
  const reply = (status: number, body?: object) =>
    new Response(body ? JSON.stringify(body) : null, {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetch = async (input: unknown, init?: { method?: string }) => {
    const url = new URL(String(input));
    const what = `${init?.method ?? "GET"} ${url.pathname}${url.search}`;
    s.requests.push(what);
    if (s.offline) {
      later(31);
      throw new TypeError("Network request failed");
    }
    if (url.pathname === "/auth/v1/user")
      return s.revoked
        ? reply(403, {
            error_code: "session_not_found",
            msg: "Session from session_id claim in JWT does not exist",
          })
        : reply(200, user);
    if (url.pathname === "/auth/v1/logout") return reply(204);
    if (url.pathname === "/auth/v1/token")
      return s.revoked
        ? reply(400, {
            error_code: "refresh_token_not_found",
            msg: "Invalid Refresh Token: Refresh Token Not Found",
          })
        : reply(200, {
            access_token: token("session-2"),
            refresh_token: "refresh-2",
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor((realNow() + skewMs) / 1000) + 3600,
            user,
          });
    throw new Error(`unexpected request ${what}`);
  };
  return { s, fetch };
}

type Session = ReturnType<typeof useAuthSession>;
let latest: Session | undefined;
/** Renders Forge's session hook and reports each value it returns. */
function Probe({
  client,
  report,
}: {
  client: SupabaseClient;
  report: (session: Session) => void;
}) {
  report(useAuthSession(client));
  return null;
}

/** Forge's real session hook on a real client, signed in as user-a. */
async function signedIn() {
  const { s, fetch } = service();
  // As Forge's own client is made (src/cloud/client.ts), without timers.
  const { sessionStorage } = jest.requireMock(
    "../../src/platform/sessionStorage",
  ) as { sessionStorage: object };
  const client = createClient(URL_, "public-key", {
    auth: {
      storage: sessionStorage as never,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetch as typeof globalThis.fetch },
  });
  const { error } = await client.auth.setSession({
    access_token: token("session-1"),
    refresh_token: "refresh-1",
  });
  expect(error).toBeNull();
  expect(mockStore.has(KEY)).toBe(true);
  const view = await render(
    <Probe
      client={client}
      report={(session) => {
        latest = session;
      }}
    />,
  );
  await waitFor(() => expect(latest?.session?.id).toBe("user-a"));
  s.requests.length = 0;
  return { s, client, view };
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = URL_;
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
});
beforeEach(() => {
  mockStore.clear();
  latest = undefined;
  skewMs = 0;
  jest.spyOn(Date, "now").mockImplementation(() => realNow() + skewMs);
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("asked: Sign out ends this phone's sign-in, and nothing continues", async () => {
  const { s, view } = await signedIn();
  await act(async () => latest!.signOut());
  expect(s.requests).toEqual(["POST /auth/v1/logout?scope=local"]);
  expect(latest!.session).toBeNull();
  expect(latest!.ended).toBeUndefined();
  expect(latest!.notice).toBeUndefined();
  expect(mockStore.has(KEY)).toBe(false);
  await view.unmount();
});

test("asked: Sign out of all devices, and nothing continues here", async () => {
  const { s, view } = await signedIn();
  await act(async () => latest!.signOut({ everywhere: true }));
  expect(s.requests).toEqual(["POST /auth/v1/logout?scope=global"]);
  expect(latest!.session).toBeNull();
  expect(latest!.ended).toBeUndefined();
  expect(latest!.notice).not.toBe(SESSION_ENDED_NOTICE);
  await view.unmount();
});

test("asked, offline: the library announces nothing; Forge removes the sign-in itself, and nothing continues or comes back", async () => {
  const { s, client, view } = await signedIn();
  s.offline = true;
  await act(async () => latest!.signOut());
  expect(s.requests).toEqual(["POST /auth/v1/logout?scope=local"]);
  expect(latest!.session).toBeNull();
  expect(latest!.ended).toBeUndefined();
  expect(latest!.notice).not.toBe(SESSION_ENDED_NOTICE);
  expect(mockStore.has(KEY)).toBe(false);
  // Back online: the removed sign-in is gone for the library too, and
  // nothing announces it again.
  s.offline = false;
  await act(async () => {
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect((await client.auth.refreshSession()).data.session).toBeNull();
  });
  expect(latest!.session).toBeNull();
  expect(latest!.ended).toBeUndefined();
  await view.unmount();
});

test("not asked: a refused refresh ends the sign-in once its access token has expired, and the account is kept as ended", async () => {
  const { s, client, view } = await signedIn();
  s.revoked = true;
  // Its access token still works: supabase-js 2.118 keeps the sign-in.
  await act(async () => {
    await client.auth.refreshSession();
  });
  expect(latest!.session?.id).toBe("user-a");
  expect(latest!.ended).toBeUndefined();
  expect(mockStore.has(KEY)).toBe(true);
  // An hour on, the token has expired: the next use of the sign-in tries
  // to renew it, is refused, and supabase-js ends it.
  later(3700);
  await act(async () => {
    await client.auth.getSession();
  });
  expect(s.requests).toEqual([
    "POST /auth/v1/token?grant_type=refresh_token",
    "POST /auth/v1/token?grant_type=refresh_token",
  ]);
  expect(latest!.session).toBeNull();
  expect(latest!.ended?.id).toBe("user-a");
  expect(latest!.notice).toBe(SESSION_ENDED_NOTICE);
  expect(mockStore.has(KEY)).toBe(false);
  // Signing in again (the same account) clears it.
  s.revoked = false;
  await act(async () => {
    await client.auth.setSession({
      access_token: token("session-3"),
      refresh_token: "refresh-3",
    });
  });
  expect(latest!.session?.id).toBe("user-a");
  expect(latest!.ended).toBeUndefined();
  expect(latest!.notice).toBeUndefined();
  await view.unmount();
});

test("not asked: the account service no longer knows this sign-in (ended on another device), so it ends here too", async () => {
  const { s, client, view } = await signedIn();
  s.revoked = true;
  await act(async () => {
    await client.auth.getUser();
  });
  expect(s.requests).toEqual(["GET /auth/v1/user"]);
  expect(latest!.session).toBeNull();
  expect(latest!.ended?.id).toBe("user-a");
  expect(latest!.notice).toBe(SESSION_ENDED_NOTICE);
  await view.unmount();
});

test("a refresh that fails only for want of a connection ends nothing, even past the token's expiry", async () => {
  const { s, client, view } = await signedIn();
  s.offline = true;
  await act(async () => {
    await client.auth.refreshSession();
  });
  later(3700);
  await act(async () => {
    await client.auth.getSession();
  });
  expect(latest!.session?.id).toBe("user-a");
  expect(latest!.ended).toBeUndefined();
  expect(latest!.notice).toBeUndefined();
  expect(mockStore.has(KEY)).toBe(true);
  // Back online: the same sign-in is renewed and carries on.
  s.offline = false;
  later(61);
  await act(async () => {
    await client.auth.getSession();
  });
  expect(s.requests.at(-1)).toBe(
    "POST /auth/v1/token?grant_type=refresh_token",
  );
  expect(latest!.session?.id).toBe("user-a");
  expect(latest!.ended).toBeUndefined();
  await view.unmount();
});
