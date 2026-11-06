// npm run release:check -- --profile <name> [--allow-dirty]
//   Before an EAS build, on this computer: eas.json's profiles (none for
//   production until Phase 8.4F); every app's identity and native policy;
//   whether the profile's project is pinned; .env.forge-dev against its pin;
//   the EAS build hook; git (no settings files or signing credentials
//   committed, nothing uncommitted); and that EAS will upload the last commit
//   rather than this folder (no EAS_NO_VCS, no .easignore). `--profile
//   production` only reports that production builds are locked.
// npm run release:check -- --builder
//   On EAS Build, first in eas-build-post-install: the build's profile, app
//   and public values, and no .env file however it arrived. A failure stops
//   the build before anything is bundled, compiled or signed; it can't undo
//   EAS CLI's own steps before upload (build numbers, credential prompts).
// npm run release:check -- --fingerprint <env file>
//   A project's pin for scripts/release/projects.ts, without printing its ref.
// Prints names, never values. See docs/RELEASE.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { APP_ENVIRONMENTS, type AppVariant } from "../../src/cloud/environment";
import { DEV_ENV_FILE, maskRef, parseEnvFile } from "../dev/env-files";
import {
  APP_ID,
  PRODUCTION_LOCKED,
  PROFILES,
  appConfigFor,
  builderCheck,
  devSettingsProblem,
  easJsonProblems,
  hookProblems,
  identityProblems,
  isProfile,
  isSettingsFile,
  nativePolicyProblems,
  projectLock,
  storePolicyProblems,
  trackedFileProblems,
  uploadProblems,
  type ProfileName,
} from "./profiles";
import { PROJECT_FINGERPRINTS, fingerprint } from "./projects";

const root = process.cwd();
const readText = (file: string) => {
  const full = path.resolve(root, file);
  return existsSync(full) ? readFileSync(full, "utf8") : undefined;
};
const readJson = (file: string): unknown => {
  const text = readText(file);
  if (text === undefined) throw new Error(`No ${file}`);
  return JSON.parse(text);
};
const expoOf = (appJson: unknown) =>
  (appJson as { expo: Record<string, unknown> }).expo;

type Line = [ok: boolean | undefined, text: string];

function group(lines: Line[], passed: string, problems: readonly string[]) {
  if (!problems.length) lines.push([true, passed]);
  else for (const problem of problems) lines.push([false, problem]);
}

function print(lines: readonly Line[]) {
  for (const [ok, text] of lines)
    console.log(`${ok === undefined ? "•" : ok ? "✓" : "✗"} ${text}`);
  const failed = lines.filter(([ok]) => ok === false).length;
  console.log(failed ? `${failed} check(s) failed.` : "All checks passed.");
  process.exitCode = failed ? 1 : 0;
}

const VARIANTS: readonly AppVariant[] = [
  "production",
  "development",
  "preview",
];

function local(profile: ProfileName, allowDirty: boolean) {
  const rule = PROFILES[profile];
  const expo = expoOf(readJson("app.json"));
  const configs = VARIANTS.map(
    (variant) => [variant, appConfigFor(variant, expo, root)] as const,
  );
  const environment = APP_ENVIRONMENTS[rule.variant];
  const own = configs.find(([variant]) => variant === rule.variant)![1];
  console.log(
    `Release check: ${profile} → ${own.name} (${APP_ID[rule.variant]}), ${rule.distribution} distribution, EAS ${rule.environment} environment, ${environment} project`,
  );
  const lines: Line[] = [];
  group(
    lines,
    "eas.json: Forge's four profiles, none for production until 8.4F; EAS numbers every build; every build is a commit",
    easJsonProblems(readJson("eas.json")),
  );
  group(
    lines,
    "Identities: FORGE, FORGE Dev and FORGE Preview, each with its own ID and link scheme",
    configs.flatMap(([variant, config]) => identityProblems(config, variant)),
  );
  group(
    lines,
    "Native policy: no shared-storage permissions; sign-in kept out of Android backups; development-client links on FORGE Dev only",
    configs.flatMap(([variant, config]) =>
      nativePolicyProblems(config, variant),
    ),
  );
  group(
    lines,
    "Store policy: export compliance answered; iPhone only; the iOS 27 status bar; iOS privacy reasons gathered; no microphone; Android's classic back; no alarm-app permission; 16 KB pages",
    configs.flatMap(([variant, config]) =>
      storePolicyProblems(config, variant),
    ),
  );
  if (
    rule.distribution === "store" &&
    !own.icon &&
    !own.ios?.icon &&
    !own.android?.adaptiveIcon
  )
    lines.push([
      undefined,
      "App icon: none configured, so builds carry the template's white placeholder. External testers and the store listings need FORGE's icon (decision C-00b)",
    ]);
  const lock = projectLock(rule.variant);
  group(
    lines,
    `Project pin: ${profile} builds may use only the pinned ${environment} project`,
    lock ? [lock] : [],
  );
  if (environment === "development") {
    const devText = readText(DEV_ENV_FILE);
    if (devText === undefined)
      lines.push([
        undefined,
        `No ${DEV_ENV_FILE} on this computer: the pin is checked on the builder`,
      ]);
    else {
      const problem = devSettingsProblem(parseEnvFile(devText));
      group(
        lines,
        `${DEV_ENV_FILE} is the pinned development project`,
        problem ? [problem] : [],
      );
    }
  }
  const scripts =
    (readJson("package.json") as { scripts?: Record<string, unknown> })
      .scripts ?? {};
  group(
    lines,
    "EAS build hook: every build checks itself on the builder first",
    hookProblems(scripts),
  );
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  group(
    lines,
    "Git: no settings files or signing credentials committed",
    trackedFileProblems(git("ls-files", "-z").split("\0").filter(Boolean)),
  );
  if (!git("status", "--porcelain").trim())
    lines.push([true, "Git: nothing uncommitted (EAS builds the last commit)"]);
  else
    lines.push([
      allowDirty ? undefined : false,
      `Git: uncommitted changes; EAS builds only the last commit${allowDirty ? " (--allow-dirty)" : " (commit first, or --allow-dirty to check anyway)"}`,
    ]);
  group(
    lines,
    "EAS upload: the last commit, not this folder (no EAS_NO_VCS, no .easignore)",
    uploadProblems(process.env, readdirSync(root)),
  );
  print(lines);
}

function builder() {
  const result = builderCheck(
    process.env,
    readdirSync(root).filter(isSettingsFile),
  );
  console.log(
    `Release check on EAS Build: ${result.profile ?? "unknown profile"} (${process.env.EAS_BUILD_PLATFORM ?? "unknown platform"})`,
  );
  const lines: Line[] = [];
  if (result.rule) {
    const variant = result.rule.variant;
    const config = appConfigFor(variant, expoOf(readJson("app.json")), root);
    group(
      lines,
      `App: ${config.name} (${APP_ID[variant]}), its own link scheme, native and store policy`,
      [
        ...identityProblems(config, variant),
        ...nativePolicyProblems(config, variant),
        ...storePolicyProblems(config, variant),
      ],
    );
    group(
      lines,
      "eas.json: Forge's four profiles, none for production until 8.4F",
      easJsonProblems(readJson("eas.json")),
    );
  }
  for (const note of result.notes) lines.push([undefined, note]);
  group(
    lines,
    "Public values: this app's own environment and pinned project, a publishable key, no settings files",
    result.problems,
  );
  print(lines);
}

function printFingerprint(file: string) {
  const text = readText(file);
  if (text === undefined) throw new Error(`No ${file}`);
  const ref = parseEnvFile(text).EXPO_PUBLIC_SUPABASE_PROJECT_REF?.trim();
  if (!ref)
    throw new Error(`${file} names no EXPO_PUBLIC_SUPABASE_PROJECT_REF`);
  const pin = fingerprint(ref);
  const pinned = Object.entries(PROJECT_FINGERPRINTS).find(
    ([, known]) => known === pin,
  )?.[0];
  console.log(
    `${file}: project ${maskRef(ref)} → ${pin} (${pinned ? `pinned for ${pinned}` : "not pinned"})`,
  );
}

const USAGE = `Usage: npm run release:check -- --profile <${Object.keys(PROFILES).join("|")}> [--allow-dirty] | --builder | --fingerprint <env file>`;

function main(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--builder") return builder();
  if (args.length === 2 && args[0] === "--fingerprint")
    return printFingerprint(args[1]!);
  const at = args.indexOf("--profile");
  const profile = at >= 0 ? args[at + 1] : undefined;
  const rest = args.filter((_, i) => i !== at && i !== at + 1);
  const allowDirty = rest.length === 1 && rest[0] === "--allow-dirty";
  if (profile === "production" && (!rest.length || allowDirty)) {
    console.log(`Release check: production → FORGE (${APP_ID.production})`);
    return print([[false, PRODUCTION_LOCKED]]);
  }
  if (!isProfile(profile) || (rest.length && !allowDirty))
    throw new Error(USAGE);
  local(profile, allowDirty);
}

try {
  main(process.argv.slice(2));
} catch (e: unknown) {
  console.error(`release:check stopped: ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
}
