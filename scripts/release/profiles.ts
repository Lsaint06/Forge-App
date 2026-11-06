// Forge's EAS build profiles (Phase 8.4B) and the checks that keep every
// build on its own app identity and its own Supabase project: eas.json, the
// app config each variant resolves to (identity and native policy), and an
// EAS builder's environment. FORGE (production) has no profile until the
// founder approves production release (Phase 8.4C-0 until 8.4F); its exact
// profile waits in PRODUCTION_PROFILE. Pure functions over parsed files;
// check.ts reads them. Problems name profiles, files and variables, never a
// value. See docs/RELEASE.md.

import type { ConfigContext, ExpoConfig } from "expo/config";
import appConfig from "../../app.config";
import {
  APP_ENVIRONMENTS,
  APP_IDS,
  APP_SCHEMES,
  checkEnvironment,
  type AppVariant,
  type ForgeEnvironment,
} from "../../src/cloud/environment";
import { DEV_ENV_FILE, isSecretKey } from "../dev/env-files";
import { PROJECT_FINGERPRINTS, fingerprint } from "./projects";

export type Profile = {
  /** The app it builds (APP_VARIANT, app.config.ts). */
  variant: AppVariant;
  /** The EAS environment whose variables the build gets. */
  environment: "development" | "preview" | "production";
  /** internal: installed directly (ad hoc or APK); store: TestFlight and Google Play. */
  distribution: "internal" | "store";
  /** Its JavaScript comes from Metro (npm run start:dev): none is built in. */
  developmentClient: boolean;
  /** An installable APK, or the App Bundle Google Play takes. */
  androidBuildType: "apk" | "app-bundle";
  /** For the iOS Simulator rather than devices. */
  simulator: boolean;
};

export const PROFILES = {
  development: {
    variant: "development",
    environment: "development",
    distribution: "internal",
    developmentClient: true,
    androidBuildType: "apk",
    simulator: false,
  },
  "development-simulator": {
    variant: "development",
    environment: "development",
    distribution: "internal",
    developmentClient: true,
    androidBuildType: "apk",
    simulator: true,
  },
  "development-release": {
    variant: "development",
    environment: "development",
    distribution: "internal",
    developmentClient: false,
    androidBuildType: "apk",
    simulator: false,
  },
  preview: {
    variant: "preview",
    environment: "preview",
    distribution: "store",
    developmentClient: false,
    androidBuildType: "app-bundle",
    simulator: false,
  },
} as const satisfies Record<string, Profile>;

export type ProfileName = keyof typeof PROFILES;

export const isProfile = (name: string | undefined): name is ProfileName =>
  name !== undefined && Object.prototype.hasOwnProperty.call(PROFILES, name);

const UNTIL_PRODUCTION_RELEASE =
  "until the founder approves production release (Phase 8.4F, docs/RELEASE.md §6)";

/** Why FORGE (production) can't be built yet. */
export const PRODUCTION_LOCKED = `production builds are locked: eas.json has no production profile ${UNTIL_PRODUCTION_RELEASE}`;

/**
 * FORGE's production profile, kept out of eas.json since Phase 8.4C-0 until
 * the founder approves production release (Phase 8.4F). With no production
 * profile, EAS CLI stops `eas build --profile production`, and `eas build`
 * with no profile (EAS's default is production), as soon as it reads
 * eas.json: before it evaluates the app config, sets a build number, touches
 * credentials or uploads anything. Restoring it is one reviewed commit
 * (docs/RELEASE.md §6): `eas` back into eas.json as build.production, `rule`
 * back into PROFILES, and production's pin in projects.ts.
 */
export const PRODUCTION_PROFILE = {
  rule: {
    variant: "production",
    environment: "production",
    distribution: "store",
    developmentClient: false,
    androidBuildType: "app-bundle",
    simulator: false,
  },
  eas: {
    distribution: "store",
    autoIncrement: true,
    environment: "production",
    node: "24.22.0",
    android: { buildType: "app-bundle" },
    env: { APP_VARIANT: "production" },
  },
} as const satisfies { rule: Profile; eas: Json };

/** A profile set: Forge's, or (tests, the 8.4F restore) one with production. */
type Profiles = Readonly<Record<string, Profile>>;

const ruleIn = (profiles: Profiles, name: string): Profile | undefined =>
  Object.prototype.hasOwnProperty.call(profiles, name)
    ? profiles[name]
    : undefined;

/** Each app's native ID: its iOS bundle ID and Android package. */
export const APP_ID = Object.fromEntries(
  Object.entries(APP_IDS).map(([id, variant]) => [variant, id]),
) as Readonly<Record<AppVariant, string>>;

/** The public values a build's JavaScript is made with (EAS environment variables). */
export const PUBLIC_VALUES = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_FORGE_ENV",
  "EXPO_PUBLIC_SUPABASE_PROJECT_REF",
] as const;

/** The only variable eas.json sets itself: values live in EAS environments. */
const PROFILE_ENV = ["APP_VARIANT"];

/** Shared storage: Forge only writes inside its own app folders. */
export const BLOCKED_PERMISSIONS = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
] as const;

/** The EAS hook that makes every build check itself before anything else. */
export const BUILDER_HOOK = "npm run release:check -- --builder";

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const objectAt = (value: Json, key: string): Json => {
  const found = value[key];
  return isObject(found) ? found : {};
};

/** Nested settings merged the way EAS merges a profile it extends. */
function merge(base: Json, over: Json): Json {
  const merged: Json = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const below = merged[key];
    merged[key] =
      isObject(below) && isObject(value) ? merge(below, value) : value;
  }
  return merged;
}

/** A profile with every profile it extends merged in; undefined if broken. */
export function resolveProfile(
  build: Json,
  name: string,
  seen: readonly string[] = [],
): Json | undefined {
  const own = build[name];
  if (!isObject(own) || seen.includes(name)) return undefined;
  const { extends: parentName, ...settings } = own;
  if (parentName === undefined) return settings;
  if (typeof parentName !== "string") return undefined;
  const parent = resolveProfile(build, parentName, [...seen, name]);
  return parent && merge(parent, settings);
}

const PLATFORMS = ["ios", "android"] as const;
type Platform = (typeof PLATFORMS)[number];

/** What EAS builds for one platform: shared settings, then the platform's own. */
function forPlatform(profile: Json, platform: Platform): Json {
  const { ios: _ios, android: _android, ...shared } = profile;
  return merge(shared, objectAt(profile, platform));
}

function profileProblems(name: string, rule: Profile, profile: Json): string[] {
  const problems: string[] = [];
  const views = PLATFORMS.map((platform) => ({
    platform,
    view: forPlatform(profile, platform),
  }));
  const expect = (
    what: string,
    ok: (view: Json) => boolean,
    only?: Platform,
  ) => {
    const failing = views
      .filter(({ platform }) => (only ?? platform) === platform)
      .filter(({ view }) => !ok(view))
      .map(({ platform }) => platform);
    if (!failing.length) return;
    const where =
      only || failing.length === 1 ? `${name} (${failing.join(", ")})` : name;
    problems.push(`eas.json: ${where} ${what}`);
  };
  const env = (view: Json) => objectAt(view, "env");

  expect(
    `must build APP_VARIANT=${rule.variant}`,
    (view) => env(view).APP_VARIANT === rule.variant,
  );
  expect(
    `may set only ${PROFILE_ENV.join(", ")} in env: values belong in the EAS ${rule.environment} environment`,
    (view) => Object.keys(env(view)).every((key) => PROFILE_ENV.includes(key)),
  );
  expect(
    `must use the EAS ${rule.environment} environment`,
    (view) => view.environment === rule.environment,
  );
  expect(
    `must be ${rule.distribution} distribution`,
    (view) => view.distribution === rule.distribution,
  );
  expect(
    rule.developmentClient
      ? "must be a development client"
      : "must not be a development client: its JavaScript is built in",
    (view) => (view.developmentClient === true) === rule.developmentClient,
  );
  if (rule.distribution === "store")
    expect(
      "must number every build (autoIncrement: true)",
      (view) => view.autoIncrement === true,
    );
  expect(
    'must pin Node 24 (node: "24.x.y", package.json engines)',
    (view) => typeof view.node === "string" && /^24\.\d+\.\d+$/.test(view.node),
  );
  expect(
    "must sign with EAS-managed credentials, never a local credentials.json",
    (view) =>
      view.credentialsSource === undefined ||
      view.credentialsSource === "remote",
  );
  expect(
    "must not be a custom build (config): custom builds skip the release check",
    (view) => view.config === undefined,
  );
  expect(
    `must build ${rule.androidBuildType === "apk" ? "an APK" : "an App Bundle"} (buildType: ${rule.androidBuildType}, no gradleCommand)`,
    (view) =>
      view.buildType === rule.androidBuildType &&
      view.gradleCommand === undefined,
    "android",
  );
  expect(
    rule.simulator
      ? "must build for the iOS Simulator (simulator: true, no buildConfiguration)"
      : "must build for devices (no simulator, no buildConfiguration)",
    (view) =>
      (view.simulator === true) === rule.simulator &&
      view.buildConfiguration === undefined,
    "ios",
  );
  return problems;
}

/**
 * Whether eas.json builds exactly Forge's profiles, each as intended, and
 * nothing for production until Phase 8.4F. `profiles` is Forge's set; tests
 * pass the set the 8.4F restore will have.
 */
export function easJsonProblems(
  eas: unknown,
  profiles: Profiles = PROFILES,
): string[] {
  if (!isObject(eas)) return ["eas.json isn't a JSON object"];
  const problems: string[] = [];
  const cli = objectAt(eas, "cli");
  if (cli.appVersionSource !== "remote")
    problems.push(
      "eas.json: cli.appVersionSource must be remote (EAS numbers every build)",
    );
  if (cli.requireCommit !== true)
    problems.push(
      "eas.json: cli.requireCommit must be true (every build is a commit, and nothing uncommitted is uploaded)",
    );
  if (cli.promptToConfigurePushNotifications !== false)
    problems.push(
      "eas.json: cli.promptToConfigurePushNotifications must be false (Forge sends no push notifications)",
    );
  const build = objectAt(eas, "build");
  for (const name of Object.keys(build))
    if (!ruleIn(profiles, name))
      problems.push(
        name === "production"
          ? `eas.json: the production profile must stay out ${UNTIL_PRODUCTION_RELEASE}`
          : `eas.json: ${name} isn't one of Forge's profiles (scripts/release/profiles.ts)`,
      );
  for (const [name, rule] of Object.entries(profiles)) {
    if (!isObject(build[name])) {
      problems.push(`eas.json: no ${name} profile`);
      continue;
    }
    const profile = resolveProfile(build, name);
    if (!profile)
      problems.push(
        `eas.json: ${name} extends a profile that doesn't exist (or itself)`,
      );
    else problems.push(...profileProblems(name, rule, profile));
  }
  return problems;
}

/** The app config a variant resolves to: app.config.ts over app.json's expo. */
export function appConfigFor(
  variant: AppVariant,
  expo: Json,
  root: string,
): ExpoConfig {
  const saved = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    return appConfig({
      config: structuredClone(expo) as Partial<ExpoConfig>,
      projectRoot: root,
      staticConfigPath: `${root}/app.json`,
      packageJsonPath: `${root}/package.json`,
    } as ConfigContext);
  } finally {
    if (saved === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = saved;
  }
}

function pluginOptions(config: ExpoConfig, name: string): Json | undefined {
  for (const plugin of (config.plugins ?? []) as unknown[]) {
    if (plugin === name) return {};
    if (Array.isArray(plugin) && plugin[0] === name)
      return isObject(plugin[1]) ? plugin[1] : {};
  }
  return undefined;
}

/** Its own IDs and link scheme, the store version, and EAS's build numbers. */
export function identityProblems(
  config: ExpoConfig,
  variant: AppVariant,
): string[] {
  const label = `app config (${variant})`;
  const id = APP_ID[variant];
  const problems: string[] = [];
  if (config.ios?.bundleIdentifier !== id)
    problems.push(`${label}: the iOS bundle ID must be ${id}`);
  if (config.android?.package !== id)
    problems.push(`${label}: the Android package must be ${id}`);
  if (config.scheme !== APP_SCHEMES[variant])
    problems.push(`${label}: the link scheme must be ${APP_SCHEMES[variant]}`);
  if (!/^\d+\.\d+\.\d+$/.test(config.version ?? ""))
    problems.push(
      `${label}: version must be MAJOR.MINOR.PATCH (the store version)`,
    );
  if (
    config.ios?.buildNumber !== undefined ||
    config.android?.versionCode !== undefined
  )
    problems.push(
      `${label}: build numbers come from EAS (remove ios.buildNumber and android.versionCode)`,
    );
  return problems;
}

/** No shared storage, sign-in out of backups, dev-client links on FORGE Dev only. */
export function nativePolicyProblems(
  config: ExpoConfig,
  variant: AppVariant,
): string[] {
  const label = `app config (${variant})`;
  const problems: string[] = [];
  for (const permission of BLOCKED_PERMISSIONS) {
    if (!(config.android?.blockedPermissions ?? []).includes(permission))
      problems.push(`${label}: Android must block ${permission}`);
    if ((config.android?.permissions ?? []).includes(permission))
      problems.push(`${label}: Android must not request ${permission}`);
  }
  if (
    pluginOptions(config, "expo-secure-store")?.configureAndroidBackup !== true
  )
    problems.push(
      `${label}: sign-in must stay out of Android backups (expo-secure-store configureAndroidBackup: true)`,
    );
  const link = variant === "development";
  if (pluginOptions(config, "expo-dev-client")?.addGeneratedScheme !== link)
    problems.push(
      link
        ? `${label}: FORGE Dev must answer its development-client links (expo-dev-client addGeneratedScheme: true)`
        : `${label}: only FORGE Dev answers development-client links (expo-dev-client addGeneratedScheme: false)`,
    );
  return problems;
}

/** Google Play allows these only for alarm-clock and calendar apps. */
export const ALARM_APP_PERMISSIONS = ["android.permission.USE_EXACT_ALARM"];

/**
 * What App Store review and Google Play need from every app's config
 * (Phase 8.4 M4, docs/STORE_SETUP.md): export compliance answered; iPhone
 * only; the iOS 27 status bar; iOS privacy reasons gathered from every
 * library; no microphone; Android's classic back events; no permission
 * reserved for alarm apps; no library that breaks 16 KB pages.
 */
export function storePolicyProblems(
  config: ExpoConfig,
  variant: AppVariant,
): string[] {
  const label = `app config (${variant})`;
  const problems: string[] = [];
  const plist: Json = isObject(config.ios?.infoPlist)
    ? config.ios.infoPlist
    : {};
  if (plist.ITSAppUsesNonExemptEncryption !== false)
    problems.push(
      `${label}: export compliance must be answered (ios.infoPlist.ITSAppUsesNonExemptEncryption: false; Forge uses standard HTTPS only)`,
    );
  if (plist.UIViewControllerBasedStatusBarAppearance !== true)
    problems.push(
      `${label}: the iOS 27 status bar needs ios.infoPlist.UIViewControllerBasedStatusBarAppearance: true`,
    );
  if (config.ios?.supportsTablet !== false)
    problems.push(
      `${label}: FORGE is an iPhone app (ios.supportsTablet: false); an iPad app needs iPad layouts and screenshots`,
    );
  const build = pluginOptions(config, "expo-build-properties");
  if (
    isObject(build?.ios) &&
    build.ios.privacyManifestAggregationEnabled === false
  )
    problems.push(
      `${label}: iOS privacy reasons must be gathered from every library (expo-build-properties ios.privacyManifestAggregationEnabled)`,
    );
  const camera = pluginOptions(config, "expo-camera");
  const android = config.android?.permissions ?? [];
  if (
    camera?.microphonePermission !== false ||
    camera?.recordAudioAndroid !== false ||
    android.includes("android.permission.RECORD_AUDIO")
  )
    problems.push(
      `${label}: the barcode scanner records no sound (expo-camera microphonePermission: false, recordAudioAndroid: false)`,
    );
  if (config.android?.predictiveBackGestureEnabled === true)
    problems.push(
      `${label}: Android keeps classic back events until predictive back is validated (docs/ANDROID.md)`,
    );
  for (const permission of ALARM_APP_PERMISSIONS)
    if (android.includes(permission))
      problems.push(
        `${label}: Google Play allows ${permission} only for alarm-clock and calendar apps`,
      );
  const sqlite = pluginOptions(config, "expo-sqlite");
  if (
    sqlite?.withSQLiteVecExtension === true ||
    (isObject(sqlite?.android) &&
      sqlite.android.withSQLiteVecExtension === true)
  )
    problems.push(
      `${label}: expo-sqlite's sqlite-vec extension isn't 16 KB-aligned on Android, which Google Play requires`,
    );
  return problems;
}

/** Why a variant's builds can't be made yet: its project isn't pinned. */
export function projectLock(
  variant: AppVariant,
  fingerprints: Readonly<
    Record<ForgeEnvironment, string | null>
  > = PROJECT_FINGERPRINTS,
): string | undefined {
  const environment = APP_ENVIRONMENTS[variant];
  return fingerprints[environment]
    ? undefined
    : `${variant} builds are locked: no ${environment} project is pinned in scripts/release/projects.ts (founder approval first: docs/RELEASE.md)`;
}

/** Whether this computer's FORGE DEV settings are the pinned development project. */
export function devSettingsProblem(
  dev: Readonly<Record<string, string>>,
  fingerprints: Readonly<
    Record<ForgeEnvironment, string | null>
  > = PROJECT_FINGERPRINTS,
): string | undefined {
  const ref = dev.EXPO_PUBLIC_SUPABASE_PROJECT_REF?.trim();
  if (!ref) return `${DEV_ENV_FILE} names no EXPO_PUBLIC_SUPABASE_PROJECT_REF`;
  if (!fingerprints.development)
    return "No development project is pinned in scripts/release/projects.ts";
  return fingerprint(ref) === fingerprints.development
    ? undefined
    : `${DEV_ENV_FILE} isn't the pinned development project (scripts/release/projects.ts changes only if FORGE DEV is deliberately replaced)`;
}

/** Whether package.json makes every EAS build run the builder check first. */
export function hookProblems(scripts: Readonly<Record<string, unknown>>) {
  const hook = scripts["eas-build-post-install"];
  return hook === BUILDER_HOOK ||
    (typeof hook === "string" && hook.startsWith(`${BUILDER_HOOK} && `))
    ? []
    : [`package.json: eas-build-post-install must start with ${BUILDER_HOOK}`];
}

/** A settings file Expo reads into the JavaScript (examples aside). */
export const isSettingsFile = (name: string) =>
  name === ".env" || (name.startsWith(".env.") && !name.endsWith(".example"));

const SIGNING =
  /(^|\/)(credentials\.json|[^/]*service-account[^/]*\.json)$|\.(jks|keystore|p8|p12|mobileprovision|pem)$/i;

/** Committed files that must never be: settings files and signing credentials. */
export function trackedFileProblems(paths: readonly string[]): string[] {
  const problems: string[] = [];
  for (const file of paths) {
    if (isSettingsFile(file.split("/").pop() ?? ""))
      problems.push(
        `${file} is committed: settings files stay on this computer`,
      );
    if (SIGNING.test(file))
      problems.push(
        `${file} is committed: signing and store credentials stay with EAS and the stores`,
      );
  }
  return problems;
}

/**
 * Whether EAS would upload this folder instead of the last commit. With
 * requireCommit, EAS CLI uploads a clone of the commit, and a .easignore can
 * only remove files from it. EAS_NO_VCS (any value, as EAS CLI reads it)
 * skips Git and the commit requirement: EAS copies the folder, filtered by
 * .gitignore or, when one exists, by .easignore alone, whose "!" rules can
 * add files that were never committed.
 */
export function uploadProblems(
  env: Readonly<Record<string, string | undefined>>,
  rootFiles: readonly string[],
): string[] {
  const problems: string[] = [];
  if (env.EAS_NO_VCS)
    problems.push(
      "EAS_NO_VCS is set: EAS would skip Git and upload this folder instead of the last commit (unset it)",
    );
  if (rootFiles.includes(".easignore"))
    problems.push(
      ".easignore exists: EAS would read it instead of .gitignore, and it can add files that aren't committed (Forge uploads commits only: remove it)",
    );
  return problems;
}

export type BuilderCheck = {
  profile?: string;
  rule?: Profile;
  problems: string[];
  notes: string[];
};

/**
 * An EAS build's own check, before anything is compiled or signed: a known
 * profile building its own app; no settings file uploaded; and, wherever
 * JavaScript is built in, complete public values naming this app's own
 * environment and the pinned project, with only a publishable key. No
 * production profile exists until Phase 8.4F, and unpinned environments
 * (production, until approved) refuse every build as well.
 */
export function builderCheck(
  env: Readonly<Record<string, string | undefined>>,
  settingsFiles: readonly string[],
  fingerprints: Readonly<
    Record<ForgeEnvironment, string | null>
  > = PROJECT_FINGERPRINTS,
  profiles: Profiles = PROFILES,
): BuilderCheck {
  const name = env.EAS_BUILD_PROFILE?.trim();
  const rule = name ? ruleIn(profiles, name) : undefined;
  if (!name || !rule)
    return {
      problems: [
        !name
          ? "EAS_BUILD_PROFILE isn't set: --builder runs on EAS Build"
          : name === "production"
            ? `EAS_BUILD_PROFILE: production builds are locked ${UNTIL_PRODUCTION_RELEASE}`
            : `EAS_BUILD_PROFILE: ${name} isn't one of Forge's profiles (eas.json)`,
      ],
      notes: [],
    };
  const problems: string[] = [];
  const notes: string[] = [];
  if ((env.APP_VARIANT?.trim() || "production") !== rule.variant)
    problems.push(
      `APP_VARIANT must be ${rule.variant} for the ${name} profile`,
    );
  for (const file of settingsFiles)
    problems.push(
      `${file} reached the build: Expo would read it into the JavaScript`,
    );
  const lock = projectLock(rule.variant, fingerprints);
  if (lock) problems.push(lock);

  const value = (key: string) => env[key]?.trim() || undefined;
  const missing = PUBLIC_VALUES.filter((key) => !value(key));
  if (rule.developmentClient && missing.length === PUBLIC_VALUES.length)
    notes.push(
      "A development client: its JavaScript comes from npm run start:dev, none is built in",
    );
  else if (missing.length)
    for (const key of missing)
      problems.push(
        `${key} isn't set in the EAS ${rule.environment} environment`,
      );
  else {
    const url = value("EXPO_PUBLIC_SUPABASE_URL")!;
    const ref = value("EXPO_PUBLIC_SUPABASE_PROJECT_REF")!;
    const check = checkEnvironment({
      name: value("EXPO_PUBLIC_FORGE_ENV"),
      projectRef: ref,
      url,
      expoGo: false,
      appId: APP_ID[rule.variant],
      scheme: APP_SCHEMES[rule.variant],
    });
    if (!check.ok) problems.push(check.problem);
    if (!url.startsWith("https://"))
      problems.push("EXPO_PUBLIC_SUPABASE_URL must use HTTPS");
    const environment = APP_ENVIRONMENTS[rule.variant];
    const pinned = fingerprints[environment];
    if (pinned && fingerprint(ref) !== pinned)
      problems.push(
        `EXPO_PUBLIC_SUPABASE_PROJECT_REF isn't the pinned ${environment} project (scripts/release/projects.ts)`,
      );
  }
  for (const [key, found] of Object.entries(env))
    if (key.startsWith("EXPO_PUBLIC_") && found && isSecretKey(found.trim()))
      problems.push(
        `${key} is a Supabase secret key: an app only ever gets the publishable key`,
      );
  return { profile: name, rule, problems, notes };
}
