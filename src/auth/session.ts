import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import * as Linking from "expo-linking";
import {
  isAuthError,
  isAuthRetryableFetchError,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { cloudClient } from "../cloud/client";
import { recoveryTokens } from "../cloud/recovery";
import { sessionStorage } from "../platform/sessionStorage";
import type { AuthUser, Entry } from "./entry";
import { signInMethods } from "./methods";

// The account session (Phase 7.7B), from the existing Supabase client and
// its secure-store session. Nothing here is a credential of its own.

/** The configured client, or why there is none. */
export function authClient(): {
  client: SupabaseClient | null;
  misconfigured: boolean;
} {
  try {
    return { client: cloudClient(), misconfigured: false };
  } catch {
    // e.g. a non-HTTPS address: refused by the client itself.
    return { client: null, misconfigured: true };
  }
}

const toUser = (u: Pick<User, "id" | "email" | "app_metadata">): AuthUser => {
  const methods = signInMethods(u);
  return {
    id: u.id,
    email: u.email ?? undefined,
    ...(methods.length ? { methods } : {}),
  };
};

/** Supabase's storage key for this project's session (`sb-<project>-auth-token`). */
function sessionKey() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return url
    ? `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
    : undefined;
}

/**
 * The user of the session Supabase keeps in the secure store, for offline
 * use when only the network kept it from being refreshed. The same storage
 * key Supabase uses (`sb-<project>-auth-token`).
 */
export async function storedUser(): Promise<AuthUser | undefined> {
  try {
    const key = sessionKey();
    if (!key) return undefined;
    const raw = await sessionStorage.getItem(key);
    const user = raw
      ? (
          JSON.parse(raw) as {
            user?: { id?: unknown; email?: unknown; app_metadata?: unknown };
          }
        ).user
      : undefined;
    if (typeof user?.id !== "string") return undefined;
    const methods = signInMethods({
      app_metadata:
        user.app_metadata && typeof user.app_metadata === "object"
          ? (user.app_metadata as { provider?: unknown; providers?: unknown })
          : undefined,
    });
    return {
      id: user.id,
      email: typeof user.email === "string" ? user.email : undefined,
      ...(methods.length ? { methods } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Said on Welcome after signing out without a connection (Phase 7.7C, P5;
 * corrected in Phase 7.8E, L1). The sign-in still exists on the account
 * service, but this phone no longer holds it.
 */
export const OFFLINE_SIGN_OUT_NOTICE =
  "You're signed out on this phone. Forge couldn't reach its account service, so it removed the sign-in from this phone only. To end it everywhere, sign in again when you're online and choose Sign out of all devices. Your training stays on this phone.";

/** Said on Welcome after signing out of every device (Phase 7.8E, E3). */
export const ALL_DEVICES_SIGN_OUT_NOTICE =
  "You're signed out on all your devices. Other devices sign out the next time Forge renews their sign-in, usually within an hour. Each keeps its training, including changes not yet synchronized, until you sign in there again.";

/** Said on Welcome when a password-reset link can't be used (Phase 7.8E, L2). */
export const RESET_LINK_FAILED_NOTICE =
  "That password reset link couldn't be used. It may have expired or already been used. Request a new one with Forgot password.";
export const RESET_LINK_OFFLINE_NOTICE =
  "Forge couldn't finish your password reset because it couldn't reach its account service. Check your connection, then request a new link with Forgot password.";

/** A failure only because the network or the account service couldn't be reached. */
export const isNetworkError = (e: unknown) =>
  isAuthRetryableFetchError(e) ||
  (e instanceof TypeError && /network|fetch/i.test(e.message));
const resetLinkProblem = (e: unknown) =>
  isNetworkError(e) ? RESET_LINK_OFFLINE_NOTICE : RESET_LINK_FAILED_NOTICE;

/** Email links already acted on (one JavaScript runtime). */
const handledLinks = new Set<string>();

export type AuthSession = {
  /** undefined while restoring; null when signed out. */
  session: AuthUser | null | undefined;
  offline?: AuthUser;
  recovering: boolean;
};

/** The current session, kept up to date by the account service's events. */
export function useAuthSession(client: SupabaseClient | null) {
  const [state, setState] = useState<AuthSession>({
    session: undefined,
    recovering: false,
  });
  const incoming = Linking.useURL();
  const [notice, setNotice] = useState<string>();
  // A reset link's session is being started: the session that arrives (its
  // SIGNED_IN comes before setSession resolves) is a recovery, so neither
  // setup nor Home is shown on the way to a new password.
  const recoveryPending = useRef(false);
  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (data.session) {
          setState((s) => ({ ...s, session: toUser(data.session!.user) }));
          return;
        }
        // Offline with an expired access token: the session is still
        // stored; it is refreshed when the network returns.
        const offline =
          error && isAuthRetryableFetchError(error)
            ? await storedUser()
            : undefined;
        if (active) setState((s) => ({ ...s, session: null, offline }));
      })
      .catch(() => {
        if (active) setState((s) => ({ ...s, session: null }));
      });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      if (session) setNotice(undefined);
      setState((s) => ({
        session: session ? toUser(session.user) : null,
        // A real session replaces offline use; signing out ends it.
        offline: session || event === "SIGNED_OUT" ? undefined : s.offline,
        recovering:
          event === "PASSWORD_RECOVERY" ||
          (!!session && recoveryPending.current)
            ? true
            : event === "SIGNED_OUT"
              ? false
              : s.recovering,
      }));
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  // A password-reset link opened while signed out: the existing recovery
  // tokens start a session, then a new password is asked for. Each link is
  // handled once, after the stored session is restored: a link that arrived
  // while signed in belongs to the Account screen, and signing out later
  // never replays it.
  const signedIn = !!state.session;
  const restored = state.session !== undefined;
  useEffect(() => {
    if (!client || !incoming || !restored || handledLinks.has(incoming)) return;
    handledLinks.add(incoming);
    if (signedIn) return;
    const tokens = recoveryTokens(incoming);
    // A reset link without tokens is explained on Welcome and Sign in
    // (src/auth/links.ts).
    if (!tokens) return;
    // Not tied to this effect's lifetime: setSession's own SIGNED_IN event
    // re-runs it before this resolves.
    recoveryPending.current = true;
    void client.auth
      .setSession(tokens)
      .then(({ data, error }) => {
        if (error || !data.session) {
          setNotice(resetLinkProblem(error));
          return;
        }
        setState({
          session: toUser(data.session.user),
          offline: undefined,
          recovering: true,
        });
      })
      .catch((e: unknown) => setNotice(resetLinkProblem(e)))
      .finally(() => {
        recoveryPending.current = false;
      });
  }, [client, incoming, restored, signedIn]);
  const finishRecovery = () => setState((s) => ({ ...s, recovering: false }));
  /**
   * Signs out (Phase 7.7C, P5; Phase 7.8E, E3). Ordinarily only this
   * phone's sign-in ends; the account's other devices stay signed in.
   * `everywhere` ends every sign-in of the account. That needs the account
   * service, so when it can't be reached nothing changes and the error is
   * thrown. Without a connection, an ordinary sign-out still happens: Forge
   * removes the stored session from this phone itself and says so plainly,
   * never claiming the server's sign-in ended. `deleted` (Stage 2): the
   * account no longer exists, so its sign-in is removed from this phone
   * whatever the account service answers, without another notice. The
   * training and its owner stay exactly as they are; removing them is the
   * caller's explicit step.
   */
  const signOut = useCallback(
    async (options: SignOutOptions = {}) => {
      if (!client) return;
      setNotice(undefined);
      const everywhere = options.everywhere === true;
      const { error } = await client.auth
        .signOut({ scope: everywhere ? "global" : "local" })
        .catch((e: unknown) => ({ error: e }));
      if (!error) {
        if (everywhere) setNotice(ALL_DEVICES_SIGN_OUT_NOTICE);
        return;
      }
      const removeHere = options.deleted || isAuthRetryableFetchError(error);
      if (everywhere || !removeHere) throw error;
      const key = sessionKey();
      if (key) await sessionStorage.removeItem(key);
      setState({ session: null, offline: undefined, recovering: false });
      if (!options.deleted) setNotice(OFFLINE_SIGN_OUT_NOTICE);
    },
    [client],
  );
  return {
    ...state,
    finishRecovery,
    signOut,
    notice,
    link: incoming ?? undefined,
  };
}

/** How to sign out (Phase 7.8E): this phone, every device, or after deletion. */
export type SignOutOptions = { everywhere?: boolean; deleted?: boolean };

/** The entry state and its actions, for the entry screens. */
export const EntryContext = createContext<{
  entry: Entry;
  client: SupabaseClient | null;
  finishRecovery: () => void;
  /**
   * Signs out of this phone, or of every device with `everywhere`; on this
   * phone alone when offline (see useAuthSession).
   */
  signOut?: (options?: SignOutOptions) => Promise<void>;
  /** Something to say on Welcome, such as an offline sign-out. */
  notice?: string;
  /** What this phone knows about an account deletion, for Welcome. */
  deletion?: string;
  /** The latest link Forge was opened with (email confirmation, reset). */
  link?: string;
}>({
  entry: { kind: "initializing" },
  client: null,
  finishRecovery: () => {},
});
export const useEntry = () => useContext(EntryContext);

export const NETWORK_ERROR_TEXT =
  "Can't reach Forge's account service. Check your connection and try again.";
const SIGNED_OUT_TEXT = "Your sign-in has ended. Sign in again.";

// The account service's error codes, in Forge's words (Phase 7.7C). Its own
// messages are never shown: they are technical and can change.
const CODE_TEXT: Record<string, string> = {
  invalid_credentials:
    "That email and password don't match a Forge account. If you created your account with Google, go back and choose Continue with Google.",
  email_not_confirmed:
    "Confirm your email first: open the link Forge sent you, then sign in.",
  over_email_send_rate_limit:
    "Too many emails have been sent to this address. Wait a few minutes, then try again.",
  over_request_rate_limit: "Too many attempts. Wait a moment, then try again.",
  weak_password:
    "Choose a stronger password: at least 8 characters that aren't easy to guess.",
  same_password: "Choose a password that's different from your current one.",
  user_already_exists:
    "There's already a Forge account with this email. Sign in instead.",
  email_exists:
    "There's already a Forge account with this email. Sign in instead.",
  signup_disabled: "New Forge accounts can't be created right now.",
  email_provider_disabled: "Signing in with email isn't available right now.",
  provider_disabled: "This way of signing in isn't available right now.",
  email_address_invalid: "Enter a valid email address.",
  email_address_not_authorized:
    "Forge's email service can't send to this address yet.",
  validation_failed: "Check what you entered, then try again.",
  otp_expired: "That link has expired. Request a new one.",
  session_not_found: SIGNED_OUT_TEXT,
  session_expired: SIGNED_OUT_TEXT,
  refresh_token_not_found: SIGNED_OUT_TEXT,
  refresh_token_already_used: SIGNED_OUT_TEXT,
  user_not_found: "This Forge account no longer exists.",
};

/** Plain words for an account-service error (never raw responses). */
export function authErrorText(e: unknown, fallback: string) {
  if (
    isAuthRetryableFetchError(e) ||
    (e instanceof TypeError && /network|fetch/i.test(e.message))
  )
    return NETWORK_ERROR_TEXT;
  if (isAuthError(e)) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && CODE_TEXT[code]) return CODE_TEXT[code];
    // The code only: never a message that could hold an address or token.
    console.warn("[FORGE] Account service error", String(code ?? e.name));
    return fallback;
  }
  // Forge's own errors are written for the athlete.
  return e instanceof Error && e.message ? e.message : fallback;
}

/** The account service's error code, when there is one. */
export const authErrorCode = (e: unknown) =>
  isAuthError(e) && typeof (e as { code?: unknown }).code === "string"
    ? ((e as { code: string }).code as string)
    : undefined;
