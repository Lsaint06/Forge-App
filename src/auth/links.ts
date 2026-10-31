import { useEffect, useState } from "react";
import { useEntry } from "./session";

// What an email link from the account service did (Phase 7.7B). Supabase
// verifies a confirmation or reset link itself, then redirects to Forge
// with the result in the URL fragment: tokens on success, or an error code.
// Recovery tokens are handled by the session (`src/cloud/recovery.ts`); a
// confirmation only leads to signing in. Tokens are never shown or logged.

export type LinkStatus = { tone: "positive" | "error"; text: string };

/**
 * Where Supabase returns from Continue with Google (Phase 7.7B.1). The
 * sign-in call reads that result itself; it is never an email link.
 */
export const OAUTH_RETURN_PATH = "/welcome";
const isOAuthReturn = (u: URL) =>
  u.hostname === "welcome" || u.pathname.endsWith(OAUTH_RETURN_PATH);

function linkParams(url: string) {
  try {
    const u = new URL(url);
    if (isOAuthReturn(u)) return undefined;
    const hash = new URLSearchParams(u.hash.slice(1));
    return (key: string) => hash.get(key) ?? u.searchParams.get(key);
  } catch {
    return undefined;
  }
}

export function authLinkStatus(
  url: string | null | undefined,
): LinkStatus | undefined {
  const get = url ? linkParams(url) : undefined;
  if (!get) return undefined;
  const error = get("error_code") ?? get("error");
  if (error)
    return {
      tone: "error",
      text:
        error === "otp_expired"
          ? "That email link has expired or was already used. If you've confirmed your email, sign in. Otherwise create your account again, or use Forgot password, to get a new link."
          : "That email link couldn't be used. Sign in, or request a new link.",
    };
  const type = get("type");
  if ((type === "signup" || type === "email") && get("access_token"))
    return {
      tone: "positive",
      text: "Your email is confirmed. Sign in to continue.",
    };
  return undefined;
}

const shown = new Set<string>();

/**
 * The result of the email link Forge was opened with, shown once: a later
 * visit to the same screen (after signing out, say) doesn't repeat it.
 */
export function useAuthLinkStatus() {
  const { link } = useEntry();
  const [current, setCurrent] = useState<string>();
  if (link && link !== current && !shown.has(link) && authLinkStatus(link))
    setCurrent(link);
  useEffect(() => {
    if (current) shown.add(current);
  }, [current]);
  return current ? authLinkStatus(current) : undefined;
}
