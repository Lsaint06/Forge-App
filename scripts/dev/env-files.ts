// The development project's settings for Forge's tooling (Phase 8): parsed
// from .env.forge-dev, a file Expo never loads on its own, so `npm start`
// (Expo Go) keeps today's .env. Every check here names variables and files,
// never their values. See docs/DEVELOPMENT_ENVIRONMENT.md.

import { checkEnvironment } from "../../src/cloud/environment";

export const DEV_ENV_FILE = ".env.forge-dev";
/** Every settings file Expo itself reads (.env: Expo Go today, production). */
export const EXPO_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
] as const;
/**
 * The files Expo's development env module would put into FORGE Dev's
 * JavaScript, over the development project's values (metro.config.js also
 * keeps them out of Metro while EXPO_NO_DOTENV is set).
 */
export const BUNDLED_IN_DEVELOPMENT = [
  ".env.local",
  ".env.development",
  ".env.development.local",
] as const;

const REQUIRED = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_FORGE_ENV",
  "EXPO_PUBLIC_SUPABASE_PROJECT_REF",
] as const;

/** KEY=value lines; `#` comments, optional `export`, optional quotes. */
export function parseEnvFile(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quote = value[0];
    if (
      (quote === '"' || quote === "'") &&
      value.length > 1 &&
      value.endsWith(quote)
    )
      value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars[key] = value;
  }
  return vars;
}

/** A Supabase secret or service-role key: never allowed in an app. */
export function isSecretKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const claims = JSON.parse(
      Buffer.from(
        parts[1].replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8"),
    ) as { role?: unknown };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

const hostOf = (url?: string) => {
  try {
    return url ? new URL(url).hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
};

export type DevProject =
  | { ok: true; url: string; key: string; ref: string }
  | { ok: false; problems: string[] };

/**
 * Whether `dev` is a usable development project for FORGE Dev: complete,
 * named `development`, pinned to its own project, HTTPS, a public key, and
 * not the project any of Expo's own settings files (`others`, by file name:
 * .env is production today) points at.
 */
export function checkDevProject(
  dev: Record<string, string>,
  others: Record<string, Record<string, string>> = {},
): DevProject {
  const problems: string[] = [];
  for (const name of REQUIRED)
    if (!dev[name]?.trim()) problems.push(`${DEV_ENV_FILE} needs ${name}`);
  if (problems.length) return { ok: false, problems };
  const url = dev.EXPO_PUBLIC_SUPABASE_URL!.trim();
  const key = dev.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();
  const ref = dev.EXPO_PUBLIC_SUPABASE_PROJECT_REF!.trim();
  if (!url.startsWith("https://"))
    problems.push("EXPO_PUBLIC_SUPABASE_URL must use HTTPS");
  const check = checkEnvironment({
    name: dev.EXPO_PUBLIC_FORGE_ENV,
    projectRef: ref,
    url,
    expoGo: false,
    appId: "com.lsaint06.forge.dev",
    scheme: "forge-dev",
  });
  if (!check.ok) problems.push(check.problem);
  if (isSecretKey(key))
    problems.push(
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is a secret key: use the publishable (or anon) key",
    );
  for (const [file, vars] of Object.entries(others)) {
    const otherHost = hostOf(vars.EXPO_PUBLIC_SUPABASE_URL);
    const otherRef = vars.EXPO_PUBLIC_SUPABASE_PROJECT_REF?.trim();
    if (
      (otherHost && otherHost === hostOf(url)) ||
      (otherRef && otherRef === ref)
    )
      problems.push(`${DEV_ENV_FILE} points at the same project as ${file}`);
  }
  return problems.length
    ? { ok: false, problems }
    : { ok: true, url, key, ref };
}

/**
 * The environment Metro runs with for FORGE Dev: only the development
 * project's values (`.env` switched off with EXPO_NO_DOTENV, and any
 * EXPO_PUBLIC_ value inherited from the shell dropped), and APP_VARIANT so
 * the JavaScript carries FORGE Dev's own link scheme.
 */
export function devClientEnv(
  base: Record<string, string | undefined>,
  dev: Record<string, string>,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(base))
    if (!name.startsWith("EXPO_PUBLIC_") && name !== "APP_VARIANT")
      env[name] = value;
  return { ...env, ...dev, APP_VARIANT: "development", EXPO_NO_DOTENV: "1" };
}

/** The settings files among `files` that exist in `root`, parsed. */
export function readEnvFiles(
  root: string,
  files: readonly string[],
  read: (file: string) => string | undefined,
): Record<string, Record<string, string>> {
  const found: Record<string, Record<string, string>> = {};
  for (const file of files) {
    const text = read(`${root}/${file}`);
    if (text !== undefined) found[file] = parseEnvFile(text);
  }
  return found;
}

/** A ref shown without being written out in full. */
export const maskRef = (ref: string) => `${ref.slice(0, 4)}…`;
