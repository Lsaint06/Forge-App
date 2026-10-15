/** Extract only valid recovery callbacks. Never log a URL containing session tokens. */
export function recoveryTokens(
  url: string,
): { access_token: string; refresh_token: string } | null {
  try {
    const u = new URL(url);
    if (!["forge:", "exp:", "exps:"].includes(u.protocol)) return null;
    if (u.hostname !== "account" && !u.pathname.endsWith("/account"))
      return null;
    const values = new URLSearchParams(u.hash.slice(1));
    if (values.get("type") !== "recovery") return null;
    const access_token = values.get("access_token");
    const refresh_token = values.get("refresh_token");
    return access_token && refresh_token
      ? { access_token, refresh_token }
      : null;
  } catch {
    return null;
  }
}
