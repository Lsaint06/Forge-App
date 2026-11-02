import type { SupabaseClient } from "@supabase/supabase-js";

// Confirming it's you before the account is deleted (Phase 7.8E, Stage 2):
// a fresh sign-in to the same account, so the deletion request carries a
// just-issued session. This is a check in the app. The account service
// doesn't yet require a recent sign-in for `forge_delete_account` (planned
// for Stage 3), so on its own it is not a security boundary. No password is
// kept: it goes to the account service once, from a client that stores
// nothing.

export type Tokens = { access_token: string; refresh_token: string };

/**
 * How long a confirmation counts for the deletion that follows it. Checked
 * in the app only (Stage 3 plans the account service's own check).
 */
export const RECENT_SIGN_IN_MS = 5 * 60_000;

/** Why the athlete couldn't be confirmed, beyond account-service errors. */
export class ReauthError extends Error {
  constructor(readonly reason: "wrong_account" | "no_session") {
    super(
      reason === "wrong_account"
        ? "That's a different account."
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
 * Makes freshly issued tokens this phone's session only when the account
 * service confirms they belong to `userId`. Tokens for any other account
 * are ended at once and never kept; the session they replace is ended too.
 */
export async function adoptIfSameAccount(
  client: { auth: Auth },
  userId: string,
  tokens: Tokens,
) {
  const { data, error } = await client.auth.getUser(tokens.access_token);
  if (error) throw error;
  if (data.user?.id !== userId) {
    await client.auth.admin
      .signOut(tokens.access_token, "local")
      .catch(() => {});
    throw new ReauthError("wrong_account");
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
  await adoptIfSameAccount(client, user.id, {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}
