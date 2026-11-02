import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReauthError,
  adoptIfSameAccount,
  reauthWithPassword,
  type Tokens,
} from "../src/auth/reauth";

// Phase 7.8E, Stage 2: confirming it's you before the account is deleted.
// A check in the app (the account service's own check is Stage 3): only a
// fresh sign-in to the same account is accepted, and anything else leaves
// this phone's session exactly as it was.

const A = "user-a";
const fresh: Tokens = { access_token: "new-access", refresh_token: "new-r" };

/** The account service as one client sees it: who each token belongs to. */
function client(owners: Record<string, string | Error>, current = "old") {
  const calls: string[] = [];
  const auth = {
    async getUser(jwt?: string) {
      calls.push(`getUser ${jwt}`);
      const owner = owners[jwt ?? ""];
      if (owner instanceof Error)
        return { data: { user: null }, error: owner } as never;
      return {
        data: { user: owner ? { id: owner } : null },
        error: owner ? null : new Error("unknown token"),
      } as never;
    },
    async getSession() {
      return {
        data: { session: current ? { access_token: current } : null },
        error: null,
      } as never;
    },
    async setSession(tokens: Tokens) {
      calls.push(`setSession ${tokens.access_token}`);
      return { data: {}, error: null } as never;
    },
    admin: {
      async signOut(jwt: string, scope?: string) {
        calls.push(`signOut ${jwt} ${scope}`);
        return { data: null, error: null };
      },
    } as never,
  };
  return { client: { auth }, calls };
}

test("the same account: its fresh session replaces this phone's, and the old one ends", async () => {
  const { client: c, calls } = client({ "new-access": A });
  await adoptIfSameAccount(c, A, fresh);
  assert.deepEqual(calls, [
    "getUser new-access",
    "setSession new-access",
    "signOut old local",
  ]);
});

test("a different account is refused, its new sign-in ended, and this phone's session kept", async () => {
  const { client: c, calls } = client({ "new-access": "user-b" });
  await assert.rejects(
    adoptIfSameAccount(c, A, fresh),
    (e: unknown) => e instanceof ReauthError && e.reason === "wrong_account",
  );
  assert.deepEqual(calls, ["getUser new-access", "signOut new-access local"]);
});

test("tokens the account service won't vouch for change nothing", async () => {
  const refused = Object.assign(new Error("Invalid JWT"), { status: 403 });
  const { client: c, calls } = client({ "new-access": refused });
  await assert.rejects(adoptIfSameAccount(c, A, fresh), /Invalid JWT/);
  assert.deepEqual(calls, ["getUser new-access"]);
});

test("password: checked by a client that stores nothing, then adopted only for the same account", async () => {
  const { client: c, calls } = client({ "new-access": A });
  const asked: unknown[] = [];
  const verifier = {
    auth: {
      async signInWithPassword(credentials: unknown) {
        asked.push(credentials);
        return { data: { session: fresh, user: { id: A } }, error: null };
      },
    },
  };
  await reauthWithPassword(
    c,
    verifier as never,
    { id: A, email: "a@example.com" },
    "correct horse",
  );
  assert.deepEqual(asked, [
    { email: "a@example.com", password: "correct horse" },
  ]);
  assert.deepEqual(calls, [
    "getUser new-access",
    "setSession new-access",
    "signOut old local",
  ]);
  // The password went to the account service once and nowhere else.
  assert.doesNotMatch(calls.join(" "), /correct horse/);
});

test("a wrong password, or no connection, leaves this phone's session untouched", async () => {
  for (const error of [
    Object.assign(new Error("Invalid login credentials"), {
      code: "invalid_credentials",
      status: 400,
    }),
    new TypeError("Network request failed"),
  ]) {
    const { client: c, calls } = client({});
    const verifier = {
      auth: {
        signInWithPassword: async () => ({
          data: { session: null, user: null },
          error,
        }),
      },
    };
    await assert.rejects(
      reauthWithPassword(c, verifier as never, { id: A, email: "a@x.co" }, "x"),
      (e: unknown) => e === error,
    );
    assert.deepEqual(calls, []);
  }
});

test("an account without an email can't be confirmed by password", async () => {
  const { client: c, calls } = client({});
  const verifier = {
    auth: {
      signInWithPassword: async () => {
        throw new Error("must not be asked");
      },
    },
  };
  await assert.rejects(
    reauthWithPassword(c, verifier as never, { id: A }, "x"),
    (e: unknown) => e instanceof ReauthError && e.reason === "no_session",
  );
  assert.deepEqual(calls, []);
});
