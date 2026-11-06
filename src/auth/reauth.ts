import type { SupabaseClient } from "@supabase/supabase-js";

// Confirming it's you before the account is deleted (Phase 7.8E, Stage 2):
// a fresh sign-in to the same account, so the deletion request carries a
// just-issued session. This is a check in the app. The account service
// doesn't yet require a recent sign-in for `forge_delete_account` (planned
// for Stage 3), so on its own it is not a security boundary. No password is
// kept: it goes to the account service once, from a client that stores
// nothing.
//
// A different account (D4): choosing another Google account in Google's
// sheet signs that account in, and Supabase creates a Forge account for it
// if it has none, before Forge sees anything. Forge only refuses it: that
// sign-in is never adopted, its own new session is ended (never this
// phone's), and the account and its records are never deleted or changed.

export type Tokens = { access_token: string; refresh_token: string };

/**
 * How long a confirmation counts for the deletion that follows it. Checked
 * in the app only (Stage 3 plans the account service's own check).
 */
export const RECENT_SIGN_IN_MS = 5 * 60_000;

/** Why the athlete couldn't be confirmed, beyond account-service errors. */
export class ReauthError extends Error {
  constructor(
    readonly reason: "wrong_account" | "no_session" | "invalid_code",
    /** The account the sign-in turned out to be, for the athlete's words. */
    readonly other?: { email?: string },
  ) {
    super(
      reason === "wrong_account"
        ? "That's a different account."
        : reason === "invalid_code"
          ? "That code isn't the right shape."
          : "The account service didn't start a sign-in.",
    );
    this.name = "ReauthError";
  }
}

type Auth = Pick<
  SupabaseClient["auth"],
  "getUser" | "getSession" | "setSession" | "admin"
>;
/**
 * Asks the account service about freshly issued tokens and ends them: a
 * client that stores no session (see verifierClient), so nothing about
 * another sign-in can touch this phone's own.
 */
export type Checker = Pick<SupabaseClient["auth"], "getUser" | "admin">;

/**
 * Makes freshly issued tokens this phone's session only when the account
 * service confirms they belong to `userId`. Tokens it doesn't confirm as
 * `userId`'s are never kept: only their own new session is ended, and
 * nothing else is changed. Once adopted, the session they replace is ended.
 */
export async function adoptIfSameAccount(
  client: { auth: Auth },
  userId: string,
  tokens: Tokens,
  checker: Checker = client.auth,
) {
  const end = () =>
    checker.admin.signOut(tokens.access_token, "local").catch(() => {});
  const { data, error } = await checker.getUser(tokens.access_token);
  if (error || !data.user) {
    await end();
    throw error ?? new ReauthError("no_session");
  }
  if (data.user.id !== userId) {
    await end();
    throw new ReauthError("wrong_account", { email: data.user.email });
  }
  const previous = (await client.auth.getSession()).data.session?.access_token;
  const { error: adopted } = await client.auth.setSession(tokens);
  if (adopted) throw adopted;
  if (previous && previous !== tokens.access_token)
    await client.auth.admin.signOut(previous, "local").catch(() => {});
}

/**
 * Confirms an email account with its password, through `verifier` (a
 * client that stores nothing, so this phone's session is untouched until
 * the result is checked).
 */
export async function reauthWithPassword(
  client: { auth: Auth },
  verifier: Pick<SupabaseClient, "auth">,
  user: { id: string; email?: string },
  password: string,
) {
  if (!user.email) throw new ReauthError("no_session");
  const { data, error } = await verifier.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) throw error;
  if (!data.session) throw new ReauthError("no_session");
  await adoptIfSameAccount(
    client,
    user.id,
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    verifier.auth,
  );
}

// Email one-time code (Phase 7.8E, Stage 5): prepared, not yet offered in
// the app. For accounts without a password (Google-only, later Apple-only).
// The code goes to the signed-in account's own email, and the request can
// never create an account (`shouldCreateUser: false`: Supabase refuses an
// email with no account, `otp_disabled`). The session the code starts is
// adopted only for the same account, as with every other confirmation.
// Needs the project's email template to show the code ({{ .Token }}) and
// custom SMTP for athletes outside the team: see section 13 of the 7.8E
// report.

/** Sends a one-time code to the account's own email. */
export async function sendEmailCode(
  verifier: Pick<SupabaseClient, "auth">,
  user: { email?: string },
) {
  if (!user.email) throw new ReauthError("no_session");
  const { error } = await verifier.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

/**
 * Confirms the code the athlete typed: checked by `verifier` (a client that
 * stores nothing), then adopted only for the same account.
 */
export async function reauthWithEmailCode(
  client: { auth: Auth },
  verifier: Pick<SupabaseClient, "auth">,
  user: { id: string; email?: string },
  code: string,
) {
  if (!user.email) throw new ReauthError("no_session");
  const token = code.replace(/\s+/g, "");
  if (!/^\d{6,10}$/.test(token)) throw new ReauthError("invalid_code");
  const { data, error } = await verifier.auth.verifyOtp({
    email: user.email,
    token,
    type: "email",
  });
  if (error) throw error;
  if (!data.session) throw new ReauthError("no_session");
  await adoptIfSameAccount(
    client,
    user.id,
    {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
    verifier.auth,
  );
}
