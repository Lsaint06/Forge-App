// Which Supabase project a build may use (Phase 7.8E, Stage 5, E6): PREPARED.
// Forge has one Supabase project today and sets neither variable below, so
// nothing changes. Once development and production are separate projects,
// each build names its environment and pins its own project's ref. A build
// whose address points at any other project then refuses to connect (the
// "misconfigured" entry: no sign-in, training on the phone kept) instead of
// signing athletes in to the wrong project. Setup: 7.8E report, section 13.

export const FORGE_ENVIRONMENTS = ["development", "production"] as const;
export type ForgeEnvironment = (typeof FORGE_ENVIRONMENTS)[number];

export type BuildEnvironment = {
  /** EXPO_PUBLIC_FORGE_ENV */
  name?: string;
  /** EXPO_PUBLIC_SUPABASE_PROJECT_REF */
  projectRef?: string;
  /** EXPO_PUBLIC_SUPABASE_URL */
  url?: string;
};

export type EnvironmentCheck =
  { ok: true; environment?: ForgeEnvironment } | { ok: false; problem: string };

/** This build's variables. Expo inlines each one only where it is named in full. */
export function buildEnvironment(): BuildEnvironment {
  return {
    name: process.env.EXPO_PUBLIC_FORGE_ENV,
    projectRef: process.env.EXPO_PUBLIC_SUPABASE_PROJECT_REF,
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  };
}

const given = (value?: string) => value?.trim() || undefined;

/**
 * Whether this build's Supabase address is the project it was built for.
 * A build that names no environment and no project keeps today's behavior.
 * Problems name variables, never their values.
 */
export function checkEnvironment(env: BuildEnvironment): EnvironmentCheck {
  const name = given(env.name);
  const ref = given(env.projectRef);
  if (name === undefined && ref === undefined) return { ok: true };
  const environment = FORGE_ENVIRONMENTS.find((e) => e === name);
  if (name !== undefined && !environment)
    return {
      ok: false,
      problem: "EXPO_PUBLIC_FORGE_ENV must be development or production",
    };
  if (ref === undefined)
    return {
      ok: false,
      problem: "A named environment needs EXPO_PUBLIC_SUPABASE_PROJECT_REF",
    };
  let host: string;
  try {
    host = new URL(given(env.url) ?? "").hostname;
  } catch {
    return { ok: false, problem: "EXPO_PUBLIC_SUPABASE_URL isn't an address" };
  }
  // Exactly the project's own address. A custom domain would need this
  // comparison changed deliberately, not loosened.
  if (host !== `${ref}.supabase.co`)
    return {
      ok: false,
      problem:
        "EXPO_PUBLIC_SUPABASE_URL isn't EXPO_PUBLIC_SUPABASE_PROJECT_REF",
    };
  return environment ? { ok: true, environment } : { ok: true };
}
