// Which account a Supabase access token names (Phase 7.8E). Read without
// checking the signature: Supabase verifies every token it receives, so this
// is never trusted on its own. Forge only uses it to make sure a request goes
// out as the account it means, and that an answer is about that account.

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** The token's `sub` claim (the account's ID), when it can be read. */
export function tokenSubject(token: string | undefined): string | undefined {
  const payload = token?.split(".")[1];
  if (!payload) return undefined;
  let bits = 0;
  let buffer = 0;
  let text = "";
  for (const char of payload
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) return undefined;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      text += String.fromCharCode((buffer >> bits) & 0xff);
      buffer &= (1 << bits) - 1;
    }
  }
  try {
    const sub = (JSON.parse(text) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : undefined;
  } catch {
    return undefined;
  }
}
