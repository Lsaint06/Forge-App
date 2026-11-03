import { APP_SCHEMES } from "./environment";

/**
 * Where a reset link can arrive: each of Forge's own apps (FORGE, FORGE Dev,
 * FORGE Preview: each receives only its own scheme) and Expo Go.
 */
const RECOVERY_SCHEMES = new Set(
  [...Object.values(APP_SCHEMES), "exp", "exps"].map((s) => `${s}:`),
);

/** Extract only valid recovery callbacks. Never log a URL containing session tokens. */
export function recoveryTokens(
  url: string,
): { access_token: string; refresh_token: string } | null {
  const values = recoveryValues(url);
  const access_token = values?.get("access_token");
  const refresh_token = values?.get("refresh_token");
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

/**
 * A reset callback that can't start a session (Phase 7.8E, L2): marked as a
 * recovery but missing its tokens, as when a link is cut short. Links that
 * carry an error code (expired, already used) are explained in
 * src/auth/links.ts.
 */
export function brokenRecoveryLink(url: string) {
  const values = recoveryValues(url);
  return (
    !!values &&
    !values.get("error_code") &&
    !values.get("error") &&
    !recoveryTokens(url)
  );
}

/** The fragment of a Forge reset callback (`…/account#…type=recovery`). */
function recoveryValues(url: string) {
  try {
    const u = new URL(url);
    if (!RECOVERY_SCHEMES.has(u.protocol)) return undefined;
    if (u.hostname !== "account" && !u.pathname.endsWith("/account"))
      return undefined;
    const values = new URLSearchParams(u.hash.slice(1));
    return values.get("type") === "recovery" ? values : undefined;
  } catch {
    return undefined;
  }
}
