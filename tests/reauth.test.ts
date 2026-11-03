import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ReauthError,
  adoptIfSameAccount,
  reauthWithEmailCode,
  reauthWithPassword,
  sendEmailCode,
  type Tokens,
} from "../src/auth/reauth";
import { tokenSubject } from "../src/auth/jwt";

// Phase 7.8E, Stage 2: confirming it's you before the account is deleted.
// A check in the app (the account service's own check is Stage 3): only a
// fresh sign-in to the same account is accepted. Anything else is refused:
// never adopted, never deleted or changed; only its own new session ends,
// and this phone's session stays exactly as it was.

const A = "user-a";
const fresh: Tokens = { access_token: "new-access", refresh_token: "new-r" };

/** The account service as one client sees it: who each token belongs to. */
function client(
  owners: Record<string, string | Error | object>,
  current = "old",
) {
  const calls: string[] = [];
  const auth = {
    async getUser(jwt?: string) {
      calls.push(`getUser ${jwt}`);
      const owner = owners[jwt ?? ""];
      if (owner instanceof Error)
        return { data: { user: null }, error: owner } as never;
      const user = typeof owner === "string" ? { id: owner } : owner;
      return {
        data: { user: user ?? null },
        error: user ? null : new Error("unknown token"),
      } as never;
    },
    async getSession() {
      calls.push("getSession");
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
const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => undefined,
    (err: unknown) => err,
  );
  assert.ok(e instanceof ReauthError, String(e));
  return e;
};

test("the same account: its fresh session replaces this phone's, and the old one ends", async () => {
  const { client: c, calls } = client({ "new-access": A });
  await adoptIfSameAccount(c, A, fresh);
  assert.deepEqual(calls, [
    "getUser new-access",
    "getSession",
    "setSession new-access",
    "signOut old local",
  ]);
});

test("a different account is refused, its new sign-in ended, and this phone's session kept", async () => {
  const { client: c, calls } = client({ "new-access": "user-b" });
  const e = await refusal(adoptIfSameAccount(c, A, fresh));
  assert.equal(e.reason, "wrong_account");
  assert.deepEqual(calls, ["getUser new-access", "signOut new-access local"]);
});

test("tokens the account service won't vouch for are ended, never adopted", async () => {
  const refused = Object.assign(new Error("Invalid JWT"), { status: 403 });
  const phone = client({});
  const checker = client({ "new-access": refused });
  await assert.rejects(
    adoptIfSameAccount(phone.client, A, fresh, checker.client.auth),
    /Invalid JWT/,
  );
  assert.deepEqual(checker.calls, [
    "getUser new-access",
    "signOut new-access local",
  ]);
  assert.deepEqual(phone.calls, []);
});

test("password: checked by a client that stores nothing, then adopted only for the same account", async () => {
  const phone = client({});
  const verifier = client({ "new-access": A });
  const asked: unknown[] = [];
  const verifierClient = {
    auth: {
      ...verifier.client.auth,
      async signInWithPassword(credentials: unknown) {
        asked.push(credentials);
        return { data: { session: fresh, user: { id: A } }, error: null };
      },
    },
  };
  await reauthWithPassword(
    phone.client,
    verifierClient as never,
    { id: A, email: "a@example.com" },
    "correct horse",
  );
  assert.deepEqual(asked, [
    { email: "a@example.com", password: "correct horse" },
  ]);
  // Checked by the client that stores nothing; adopted by this phone's.
  assert.deepEqual(verifier.calls, ["getUser new-access"]);
  assert.deepEqual(phone.calls, [
    "getSession",
    "setSession new-access",
    "signOut old local",
  ]);
  // The password went to the account service once and nowhere else.
  assert.doesNotMatch([...phone.calls, ...verifier.calls].join(" "), /horse/);
});

test("a wrong password, or no connection, leaves this phone's session untouched", async () => {
  for (const error of [
    Object.assign(new Error("Invalid login credentials"), {
      code: "invalid_credentials",
      status: 400,
    }),
    new TypeError("Network request failed"),
  ]) {
    const phone = client({});
    const verifier = client({});
    const verifierClient = {
      auth: {
        ...verifier.client.auth,
        signInWithPassword: async () => ({
          data: { session: null, user: null },
          error,
        }),
      },
    };
    await assert.rejects(
      reauthWithPassword(
        phone.client,
        verifierClient as never,
        { id: A, email: "a@x.co" },
        "x",
      ),
      (e: unknown) => e === error,
    );
    assert.deepEqual(phone.calls, []);
    assert.deepEqual(verifier.calls, []);
  }
});

test("an account without an email can't be confirmed by password", async () => {
  const phone = client({});
  const verifier = {
    auth: {
      signInWithPassword: async () => {
        throw new Error("must not be asked");
      },
    },
  };
  const e = await refusal(
    reauthWithPassword(phone.client, verifier as never, { id: A }, "x"),
  );
  assert.equal(e.reason, "no_session");
  assert.deepEqual(phone.calls, []);
});

// ---- D4: a different Google account chosen in Google's sheet --------------

/** The account service's record of the account a sign-in turned out to be. */
const existing = {
  id: "user-b",
  email: "b@gmail.com",
  created_at: "2025-01-01T00:00:00Z",
  last_sign_in_at: "2026-11-02T19:45:00.389012Z",
  identities: [{ provider: "google" }, { provider: "email" }],
};
const createdJustNow = {
  id: "user-c",
  email: "c@gmail.com",
  created_at: "2026-11-02T19:45:00.123456Z",
  last_sign_in_at: "2026-11-02T19:45:00.389012Z",
  identities: [{ provider: "google" }],
};

test("a different Google account, existing or created just now, is refused: never adopted, deleted or changed", async () => {
  for (const other of [existing, createdJustNow]) {
    const phone = client({});
    const checker = client({ theirs: other });
    const e = await refusal(
      adoptIfSameAccount(
        phone.client,
        A,
        { access_token: "theirs", refresh_token: "r" },
        checker.client.auth,
      ),
    );
    assert.equal(e.reason, "wrong_account");
    assert.deepEqual(e.other, { email: other.email });
    // Only its own new session ends. The checker can ask and sign out; it
    // has no way to delete or change an account, and nothing else is asked.
    assert.deepEqual(checker.calls, ["getUser theirs", "signOut theirs local"]);
    assert.ok(!("rpc" in checker.client) && !("from" in checker.client));
    // This phone's sign-in is never read, replaced or ended.
    assert.deepEqual(phone.calls, []);
  }
});

test("repeated attempts: each wrong sign-in is refused and ended on its own; the right one is then adopted", async () => {
  const phone = client({});
  const checker = client({ b1: "user-b", b2: createdJustNow, a1: A });
  for (const token of ["b1", "b2", "b1"])
    assert.equal(
      (
        await refusal(
          adoptIfSameAccount(
            phone.client,
            A,
            { access_token: token, refresh_token: "r" },
            checker.client.auth,
          ),
        )
      ).reason,
      "wrong_account",
    );
  assert.deepEqual(phone.calls, []);
  await adoptIfSameAccount(
    phone.client,
    A,
    { access_token: "a1", refresh_token: "r" },
    checker.client.auth,
  );
  assert.deepEqual(checker.calls, [
    "getUser b1",
    "signOut b1 local",
    "getUser b2",
    "signOut b2 local",
    "getUser b1",
    "signOut b1 local",
    "getUser a1",
  ]);
  // Only now, for the same account: the fresh session replaces the old one.
  assert.deepEqual(phone.calls, [
    "getSession",
    "setSession a1",
    "signOut old local",
  ]);
});

test("tokenSubject reads the account a token names, and nothing else", () => {
  const jwt = (
    claims: object,
    encoding: "base64url" | "base64" = "base64url",
  ) => `h.${Buffer.from(JSON.stringify(claims)).toString(encoding)}.s`;
  assert.equal(tokenSubject(jwt({ sub: A, role: "authenticated" })), A);
  for (const bad of [
    undefined,
    "",
    "abc",
    "a.b.c",
    "h.!!!.s",
    `h.${Buffer.from("[1]").toString("base64url")}.s`,
    jwt({ role: "authenticated" }),
  ])
    assert.equal(tokenSubject(bad), undefined);
  // Standard base64 and padding are read the same way.
  assert.equal(tokenSubject(jwt({ sub: "x-1" }, "base64")), "x-1");
});

// ---- Stage 5: email one-time code (prepared, not offered in the app yet) ----

/** The verifier (stores nothing) as Supabase answers email codes. */
function emailVerifier(
  f: {
    owner?: string | object;
    sendError?: Error;
    verifyError?: Error;
  } = {},
) {
  const checker = client({ "code-access": f.owner ?? A });
  const asked: unknown[] = [];
  const verifier = {
    auth: {
      ...checker.client.auth,
      async signInWithOtp(params: unknown) {
        asked.push(["send", params]);
        return { data: {}, error: f.sendError ?? null };
      },
      async verifyOtp(params: unknown) {
        asked.push(["verify", params]);
        return f.verifyError
          ? { data: { session: null }, error: f.verifyError }
          : {
              data: {
                session: {
                  access_token: "code-access",
                  refresh_token: "code-refresh",
                },
              },
              error: null,
            };
      },
    },
  };
  return { verifier, asked, checks: checker.calls };
}

test("email code: sent to the account's own email, never creating an account", async () => {
  const { verifier, asked } = emailVerifier();
  await sendEmailCode(verifier as never, { email: "a@example.com" });
  assert.deepEqual(asked, [
    ["send", { email: "a@example.com", options: { shouldCreateUser: false } }],
  ]);
  // Supabase's answer for an email with no account is passed on, unchanged.
  const noAccount = Object.assign(new Error("Signups not allowed for otp"), {
    code: "otp_disabled",
  });
  const refused = emailVerifier({ sendError: noAccount });
  await assert.rejects(
    sendEmailCode(refused.verifier as never, { email: "nobody@example.com" }),
    (e: unknown) => e === noAccount,
  );
  // No email: nothing is sent.
  const none = emailVerifier();
  await assert.rejects(
    sendEmailCode(none.verifier as never, {}),
    (e: unknown) => e instanceof ReauthError && e.reason === "no_session",
  );
  assert.deepEqual(none.asked, []);
});

test("email code: the right code for the same account is adopted; spaces are ignored", async () => {
  const phone = client({});
  const { verifier, asked, checks } = emailVerifier();
  await reauthWithEmailCode(
    phone.client,
    verifier as never,
    { id: A, email: "a@example.com" },
    " 123 456 ",
  );
  assert.deepEqual(asked, [
    ["verify", { email: "a@example.com", token: "123456", type: "email" }],
  ]);
  assert.deepEqual(checks, ["getUser code-access"]);
  assert.deepEqual(phone.calls, [
    "getSession",
    "setSession code-access",
    "signOut old local",
  ]);
});

test("email code: malformed, wrong or expired codes, or another account, change nothing here", async () => {
  for (const code of ["", "12345", "abcdef", "12345678901", "1234-56"]) {
    const phone = client({});
    const { verifier, asked } = emailVerifier();
    const e = await refusal(
      reauthWithEmailCode(
        phone.client,
        verifier as never,
        { id: A, email: "a@x.co" },
        code,
      ),
    );
    assert.equal(e.reason, "invalid_code", code);
    assert.deepEqual(asked, []);
    assert.deepEqual(phone.calls, []);
  }
  const expired = Object.assign(new Error("Token has expired or is invalid"), {
    code: "otp_expired",
  });
  const phone = client({});
  const wrong = emailVerifier({ verifyError: expired });
  await assert.rejects(
    reauthWithEmailCode(
      phone.client,
      wrong.verifier as never,
      { id: A, email: "a@x.co" },
      "123456",
    ),
    (e: unknown) => e === expired,
  );
  assert.deepEqual(phone.calls, []);
  // A code that somehow signs in another account is refused like any other.
  const other = emailVerifier({ owner: "user-b" });
  const e = await refusal(
    reauthWithEmailCode(
      phone.client,
      other.verifier as never,
      { id: A, email: "a@x.co" },
      "123456",
    ),
  );
  assert.equal(e.reason, "wrong_account");
  assert.deepEqual(other.checks, [
    "getUser code-access",
    "signOut code-access local",
  ]);
  assert.deepEqual(phone.calls, []);
});
