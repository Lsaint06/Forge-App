// Which Supabase project a build may use (Phase 7.8E, Stage 5, E6; Phase 8).
// Expo Go (today's workflow) keeps today's behavior: with neither variable
// below set, nothing changes. Forge's own native builds always name their
// environment, and each app may use only its own:
// - FORGE Dev (the development build): only `development`;
// - FORGE (the production app): only `production`;
// - FORGE Preview: either, named explicitly.
// A named environment must also pin its project's ref, and the address must
// be that project's own. Anything missing or mismatched refuses to connect
// (the "misconfigured" entry: no sign-in, training on the phone kept), so a
// build can never silently sign athletes in to another project. Setup:
// docs/DEVELOPMENT_ENVIRONMENT.md.

export const FORGE_ENVIRONMENTS = ["development", "production"] as const;
export type ForgeEnvironment = (typeof FORGE_ENVIRONMENTS)[number];

/** Forge's own apps (app.config.ts). */
export type AppVariant = "development" | "preview" | "production";

/** Each app by its native application ID (iOS bundle ID, Android package). */
export const APP_IDS: Readonly<Record<string, AppVariant>> = {
  "com.lsaint06.forge": "production",
  "com.lsaint06.forge.dev": "development",
  // FORGE Dev signed by a free Apple ID's Personal Team (iOS; Phase 8.1).
  "com.lsaint06.forge.dev.personal": "development",
  "com.lsaint06.forge.preview": "preview",
};

/** Each app's link scheme: where its sign-in and email links return. */
export const APP_SCHEMES: Readonly<Record<AppVariant, string>> = {
  production: "forge",
  development: "forge-dev",
  preview: "forge-preview",
};

export type BuildEnvironment = {
  /** EXPO_PUBLIC_FORGE_ENV */
  name?: string;
  /** EXPO_PUBLIC_SUPABASE_PROJECT_REF */
  projectRef?: string;
  /** EXPO_PUBLIC_SUPABASE_URL */
  url?: string;
  /** Running in Expo Go. */
  expoGo?: boolean;
  /** The running app's native application ID (expo-application). */
  appId?: string | null;
  /** The link scheme the running JS was given (its app config). */
  scheme?: string;
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
 * In Expo Go (or with no app at all: tests, scripts), a build that names no
 * environment and no project keeps today's behavior. Problems name
 * variables, never their values.
 */
export function checkEnvironment(env: BuildEnvironment): EnvironmentCheck {
  const name = given(env.name);
  const ref = given(env.projectRef);
  const appId = env.expoGo ? undefined : given(env.appId ?? undefined);
  if (appId !== undefined) {
    const variant = Object.prototype.hasOwnProperty.call(APP_IDS, appId)
      ? APP_IDS[appId]
      : undefined;
    if (!variant)
      return {
        ok: false,
        problem: "This app's ID isn't one of Forge's builds (app.config.ts)",
      };
    const scheme = APP_SCHEMES[variant];
    if (given(env.scheme) !== scheme)
      return {
        ok: false,
        problem: `This build's JavaScript isn't ${variant}'s: start Metro with APP_VARIANT=${variant}`,
      };
    const own = variant === "preview" ? undefined : variant;
    if (name === undefined)
      return {
        ok: false,
        problem: `This build must name its environment (EXPO_PUBLIC_FORGE_ENV${own ? `=${own}` : ""})`,
      };
    if (own && name !== own)
      return {
        ok: false,
        problem: `The ${variant} app can only use the ${own} environment (EXPO_PUBLIC_FORGE_ENV)`,
      };
  }
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
