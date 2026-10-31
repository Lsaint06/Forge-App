// Forge's entry state (Phase 7.7B): one decision, made from facts the app can
// verify, about which screens may be shown. There is no guest mode and no
// local "logged in" flag: a person is signed in only while the account
// service's session (Supabase, kept in the secure store) says so.

/** The signed-in person, as the account service reports them. */
export type AuthUser = {
  id: string;
  email?: string;
  /** How this account signs in ("Email", "Google"…), when known. */
  methods?: string[];
};

export type EntryFacts = {
  /** A cloud account service is configured in this build. */
  configured: boolean;
  /** The configured address is unusable (e.g. not HTTPS). */
  misconfigured?: boolean;
  /** The session: undefined while it is restored, null when signed out. */
  session: AuthUser | null | undefined;
  /**
   * When the session couldn't be refreshed only because the network is
   * unavailable, the still-stored session's user (offline use).
   */
  offline?: AuthUser;
  /** A password-reset link was opened and a new password is due. */
  recovering?: boolean;
  /** The account this phone's data belongs to (`cloudOwner`), if any. */
  owner?: string;
  /** This phone holds training, journals, templates or a finished setup. */
  hasLocalData: boolean;
  /**
   * This phone has synchronized with an account, or holds a conflict from
   * one (sync bookkeeping, even with no records left).
   */
  syncHistory?: boolean;
  /** The athlete finished first-time setup. */
  onboarded: boolean;
};

export type Entry =
  | { kind: "initializing" }
  | { kind: "unconfigured" }
  | { kind: "misconfigured" }
  | { kind: "signedOut" }
  | { kind: "recovery"; user: AuthUser }
  /** This phone's data belongs to a different account. */
  | { kind: "otherAccount"; user: AuthUser }
  /** This phone holds data that belongs to no account yet. */
  | { kind: "unlinked"; user: AuthUser }
  | { kind: "setup"; user: AuthUser; offline: boolean }
  | { kind: "ready"; user: AuthUser; offline: boolean };

export function entryState(f: EntryFacts): Entry {
  if (f.misconfigured) return { kind: "misconfigured" };
  if (!f.configured) return { kind: "unconfigured" };
  if (f.session === undefined && !f.offline) return { kind: "initializing" };
  const user = f.session ?? f.offline;
  if (!user) return { kind: "signedOut" };
  const offline = !f.session;
  if (f.recovering && !offline) return { kind: "recovery", user };
  // Another account's claim protects whatever it has here. A claim with
  // nothing behind it (an account signed in, entered nothing and left:
  // Phase 7.7C, P4) doesn't lock the phone; this account sets it up.
  if (f.owner && f.owner !== user.id && (f.hasLocalData || f.syncHistory))
    return { kind: "otherAccount", user };
  if (!f.owner && f.hasLocalData) return { kind: "unlinked", user };
  if (!f.onboarded) return { kind: "setup", user, offline };
  return { kind: "ready", user, offline };
}

/** The screen each state belongs on. */
export function entryRoute(kind: Entry["kind"]) {
  switch (kind) {
    case "ready":
      return "/" as const;
    case "setup":
      return "/onboarding" as const;
    case "signedOut":
      return "/welcome" as const;
    default:
      return "/account-check" as const;
  }
}
