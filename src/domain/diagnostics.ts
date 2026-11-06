import { APP_IDS, type AppVariant } from "../cloud/environment";

// Phase 8.5 (M6): what a beta report needs to find the build and the kind of
// failure, and nothing about the athlete. The build line names the app
// (FORGE, FORGE Dev or FORGE Preview), its version and build, and the
// platform. The failure code says where a failure happened and what kind it
// was, and fingerprints the error's wording with quoted text, IDs and
// numbers taken out, so reports of the same failure match. Neither holds
// training data, account details, addresses, keys or the error's own text.

const APP_NAMES: Readonly<Record<AppVariant, string>> = {
  production: "FORGE",
  development: "FORGE Dev",
  preview: "FORGE Preview",
};

export type BuildFacts = {
  /** The native application ID (iOS bundle ID, Android package). */
  appId?: string | null;
  /** The native app's store version and build number. */
  version?: string | null;
  build?: string | null;
  /** In Expo Go the native app is Expo Go: the project's version is shown. */
  expoGo?: boolean;
  projectVersion?: string | null;
  os: string;
  /** iOS: its version; Android: its release, e.g. "16". */
  osVersion?: string | number | null;
  /** Android's API level. */
  apiLevel?: number | null;
};

/** "FORGE Preview 1.0.0 (14) · iOS 27.0" */
export function buildLine(b: BuildFacts) {
  const variant =
    b.appId && Object.prototype.hasOwnProperty.call(APP_IDS, b.appId)
      ? APP_IDS[b.appId]
      : undefined;
  const app = b.expoGo
    ? ["FORGE in Expo Go", b.projectVersion]
    : [
        variant ? APP_NAMES[variant] : "FORGE (unrecognised build)",
        b.version && (b.build ? `${b.version} (${b.build})` : b.version),
      ];
  const platform =
    b.os === "ios"
      ? ["iOS", b.osVersion]
      : b.os === "android"
        ? ["Android", b.osVersion, b.apiLevel && `(API ${b.apiLevel})`]
        : [b.os];
  return [app, platform]
    .map((parts) => parts.filter((p) => p || p === 0).join(" "))
    .join(" · ");
}

export type FailureStage = "start" | "screen";

/** The database, a check on stored data, or the app itself. */
function kindOf(e: unknown) {
  const name = e instanceof Error ? e.name : "";
  if (
    name === "ZodError" ||
    Array.isArray((e as { issues?: unknown } | null)?.issues)
  )
    return "DATA";
  const text = `${name} ${e instanceof Error ? e.message : String(e)}`;
  return /sqlite|database|disk|no such (table|column)|constraint|readonly|locked/i.test(
    text,
  )
    ? "DB"
    : "APP";
}

/** The error's wording without its particulars. */
export function errorShape(e: unknown) {
  const name = e instanceof Error ? e.name : typeof e;
  const message = e instanceof Error ? e.message : String(e);
  return `${name}: ${message}`
    .replace(/"[^"]*"|`[^`]*`/g, "…")
    .replace(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, "#")
    .replace(/\d+/g, "#");
}

function fnv1a(text: string) {
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * "S-DB-4F2A91": S when FORGE couldn't start (its data didn't open), R once
 * it was running; DB, DATA or APP; then the wording's fingerprint.
 */
export function failureCode(e: unknown, stage: FailureStage) {
  const print = fnv1a(errorShape(e)).toString(16).toUpperCase();
  return `${stage === "start" ? "S" : "R"}-${kindOf(e)}-${print.padStart(8, "0").slice(0, 6)}`;
}

/** What the support email and the recovery screen carry about the build. */
export function diagnosticLines(build: string, code?: string) {
  return code ? [build, `Code ${code}`] : [build];
}
