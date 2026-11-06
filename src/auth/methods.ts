// The ways into an account (Phase 7.7B.1). Supabase links a Google or Apple
// identity to the account with the same verified email, so one account can
// have several; Account & privacy lists them, so that is never hidden.

const NAMES: Record<string, string> = {
  email: "Email",
  google: "Google",
  apple: "Apple",
};

export function signInMethods(user: {
  app_metadata?: { provider?: unknown; providers?: unknown };
}): string[] {
  const meta = user.app_metadata ?? {};
  const list = Array.isArray(meta.providers)
    ? meta.providers
    : typeof meta.provider === "string"
      ? [meta.provider]
      : [];
  const names = list
    .filter((p): p is string => typeof p === "string" && !!p)
    .map((p) => NAMES[p] ?? p.charAt(0).toUpperCase() + p.slice(1));
  return [...new Set(names)];
}
