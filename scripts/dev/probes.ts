// Reading what a Supabase project answers, for Forge's development tooling
// (Phase 8). Pure: no network here, so each reading is unit-tested.

/** Which Forge schema a project has, from what anon may do with the table. */
export type SchemaState = "hardened" | "baseline" | "missing" | "unknown";

/**
 * Anonymous `select` on forge_records: the hardening (Stage 3) revokes every
 * table privilege from anon, so it is refused (42501); the baseline lets anon
 * read and row-level security returns nothing; a project without the
 * migration has no such table.
 */
export function schemaState(
  error: { code?: string } | null | undefined,
): SchemaState {
  if (!error) return "baseline";
  if (error.code === "42501") return "hardened";
  if (error.code === "PGRST205" || error.code === "42P01") return "missing";
  return "unknown";
}

/** A JWT's claims, read without checking its signature. */
export function jwtClaims(token: string): Record<string, unknown> | undefined {
  const part = token.split(".")[1];
  if (!part) return undefined;
  try {
    const claims = JSON.parse(
      Buffer.from(
        part.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as unknown;
    return claims && typeof claims === "object" && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether Supabase Auth accepted `requested` as a return address, from where
 * /authorize sent the browser: the `state` it hands the provider records the
 * address it will return to (`referrer`), which is the Site URL whenever the
 * requested one isn't allowed. Undefined when the answer can't be read.
 */
export function redirectAccepted(
  location: string | null | undefined,
  requested: string,
): boolean | undefined {
  if (!location) return undefined;
  let state: string | null;
  try {
    state = new URL(location).searchParams.get("state");
  } catch {
    return undefined;
  }
  const referrer = state ? jwtClaims(state)?.referrer : undefined;
  return typeof referrer === "string" ? referrer === requested : undefined;
}

/** FORGE Dev's return addresses (the development project's allow list). */
export const DEV_REDIRECTS = [
  "forge-dev:///welcome",
  "forge-dev:///sign-in",
  "forge-dev:///account",
] as const;

/**
 * Addresses the development project must refuse: the production app's own
 * scheme, an arbitrary Expo tunnel, and the `@` trick from Stage 0.
 */
export const REFUSED_REDIRECTS = [
  "forge:///welcome",
  "exps://attacker-0123456789abcdef.on.expo.app/--/welcome",
  "exps://c-lstamand-97rrx8-x@attacker.example/--/welcome",
] as const;
