import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { APP_ENVIRONMENTS } from "../src/cloud/environment";
import {
  BUILDER_HOOK,
  PRODUCTION_LOCKED,
  PRODUCTION_PROFILE,
  PROFILES,
  appConfigFor,
  builderCheck,
  devSettingsProblem,
  easJsonProblems,
  hookProblems,
  identityProblems,
  isSettingsFile,
  nativePolicyProblems,
  projectLock,
  resolveProfile,
  storePolicyProblems,
  trackedFileProblems,
  uploadProblems,
  type ProfileName,
} from "../scripts/release/profiles";
import { PROJECT_FINGERPRINTS, fingerprint } from "../scripts/release/projects";

// Phase 8.4B: every build keeps its own app identity and its own Supabase
// project. FORGE Preview builds only with FORGE DEV, production builds stay
// locked until the founder approves, and every check fails closed.
// Phase 8.4C-0: eas.json has no production profile until Phase 8.4F, so EAS
// CLI stops before any build number, credential or upload; the exact profile
// to restore is PRODUCTION_PROFILE.

const eas = JSON.parse(readFileSync("eas.json", "utf8"));
const expo = JSON.parse(readFileSync("app.json", "utf8")).expo;
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;

const DEV = "devprojectrefaaaaaaa";
const PROD = "prodprojectrefbbbbbb";
const KEY = "sb_publishable_testkeyvalue";
const at = (ref: string) => `https://${ref}.supabase.co`;
const PINS = { development: fingerprint(DEV), production: fingerprint(PROD) };
const values = (environment: string, ref: string) => ({
  EXPO_PUBLIC_SUPABASE_URL: at(ref),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY,
  EXPO_PUBLIC_FORGE_ENV: environment,
  EXPO_PUBLIC_SUPABASE_PROJECT_REF: ref,
});
const build = (
  profile: ProfileName,
  extra: Record<string, string | undefined> = {},
) => ({
  EAS_BUILD_PROFILE: profile,
  APP_VARIANT: PROFILES[profile].variant,
  ...extra,
});
/** A production build's environment, as EAS would set it (Phase 8.4F on). */
const productionBuild = (extra: Record<string, string | undefined> = {}) => ({
  EAS_BUILD_PROFILE: "production",
  APP_VARIANT: "production",
  ...extra,
});
/** Forge's profiles once production is restored (Phase 8.4F). */
const RESTORED = { ...PROFILES, production: PRODUCTION_PROFILE.rule };
/** A service-role JWT's shape (never a real key). */
const serviceRole = [
  "eyJhbGciOiJIUzI1NiJ9",
  Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
  "signature",
].join(".");
const VALUES = [DEV, PROD, KEY, "sb_secret_", serviceRole];
const noValues = (problems: readonly string[]) => {
  for (const value of VALUES)
    assert.ok(!problems.join(" ").includes(value), "a problem printed a value");
};

const refuses = (problems: readonly string[], said: RegExp) => {
  assert.ok(
    problems.some((problem) => said.test(problem)),
    `${said}: ${problems.join(" | ") || "no problems"}`,
  );
  noValues(problems);
};

// ---- eas.json ----

test("eas.json builds exactly Forge's four profiles, each as intended", () => {
  assert.deepEqual(easJsonProblems(eas), []);
  assert.deepEqual(Object.keys(eas.build).sort(), Object.keys(PROFILES).sort());
  // Only FORGE Preview goes to the stores until 8.4F, numbered by EAS.
  const store = (Object.keys(PROFILES) as ProfileName[]).filter(
    (name) => PROFILES[name].distribution === "store",
  );
  assert.deepEqual(store, ["preview"]);
  assert.equal(eas.cli.appVersionSource, "remote");
  for (const name of store) assert.equal(eas.build[name].autoIncrement, true);
});

test("the simulator profile inherits FORGE Dev's settings, as EAS merges them", () => {
  const simulator = resolveProfile(eas.build, "development-simulator")!;
  assert.equal(simulator.developmentClient, true);
  assert.equal(simulator.environment, "development");
  assert.deepEqual(simulator.env, { APP_VARIANT: "development" });
  assert.deepEqual(simulator.ios, { simulator: true });
  assert.equal(simulator.extends, undefined);
  // A profile that extends itself, in a loop, or nothing usable.
  assert.equal(
    resolveProfile({ a: { extends: "b" }, b: { extends: "a" } }, "a"),
    undefined,
  );
  assert.equal(resolveProfile({ a: { extends: 7 } }, "a"), undefined);
});

test("any eas.json change that would cross apps, environments or signing is refused", () => {
  type Eas = typeof eas;
  const changes: [(e: Eas) => void, RegExp][] = [
    [
      (e) => (e.cli.appVersionSource = "local"),
      /appVersionSource must be remote/,
    ],
    [(e) => delete e.cli.requireCommit, /requireCommit must be true/],
    [
      (e) => delete e.cli.promptToConfigurePushNotifications,
      /promptToConfigurePushNotifications must be false/,
    ],
    // The wrong app.
    [
      (e) => (e.build.preview.env.APP_VARIANT = "production"),
      /preview must build APP_VARIANT=preview/,
    ],
    [
      (e) => (e.build["development-release"].env.APP_VARIANT = "production"),
      /development-release must build APP_VARIANT=development/,
    ],
    [
      (e) => (e.build.preview.ios = { env: { APP_VARIANT: "production" } }),
      /preview \(ios\) must build APP_VARIANT=preview/,
    ],
    // Another environment's variables.
    [
      (e) => (e.build.preview.environment = "production"),
      /preview must use the EAS preview environment/,
    ],
    [
      (e) => (e.build.preview.android.environment = "production"),
      /preview \(android\) must use the EAS preview environment/,
    ],
    [
      (e) => (e.build["development-release"].environment = "preview"),
      /development-release must use the EAS development environment/,
    ],
    // Values and secrets never live in eas.json.
    [
      (e) => (e.build.preview.env.EXPO_PUBLIC_SUPABASE_URL = at(PROD)),
      /preview may set only APP_VARIANT in env/,
    ],
    [
      (e) =>
        (e.build["development-release"].env.SUPABASE_SERVICE_ROLE_KEY = "x"),
      /development-release may set only APP_VARIANT in env/,
    ],
    // Store builds, numbered by EAS; development clients only for FORGE Dev.
    [
      (e) => (e.build.preview.distribution = "internal"),
      /preview must be store distribution/,
    ],
    [
      (e) => delete e.build.preview.autoIncrement,
      /preview must number every build/,
    ],
    [
      (e) => (e.build.preview.developmentClient = true),
      /preview must not be a development client/,
    ],
    [
      (e) => delete e.build.development.developmentClient,
      /development must be a development client/,
    ],
    [
      (e) => (e.build.preview.android.buildType = "apk"),
      /preview \(android\) must build an App Bundle/,
    ],
    [
      (e) => (e.build.preview.android.gradleCommand = ":app:assembleDebug"),
      /preview \(android\) must build an App Bundle/,
    ],
    [
      (e) =>
        (e.build["development-release"].ios = { buildConfiguration: "Debug" }),
      /development-release \(ios\) must build for devices/,
    ],
    [
      (e) => (e.build.preview.ios = { simulator: true }),
      /preview \(ios\) must build for devices/,
    ],
    [(e) => (e.build.preview.node = "22.11.0"), /preview must pin Node 24/],
    // Signing stays with EAS; custom builds would skip this check.
    [
      (e) => (e.build.preview.credentialsSource = "local"),
      /preview must sign with EAS-managed credentials/,
    ],
    [
      (e) => (e.build.preview.config = "preview.yml"),
      /preview must not be a custom build/,
    ],
    // Exactly Forge's profiles.
    [
      (e) => (e.build.staging = structuredClone(e.build.preview)),
      /staging isn't one of Forge's profiles/,
    ],
    [
      (e) => (e.build.production = structuredClone(PRODUCTION_PROFILE.eas)),
      /the production profile must stay out until the founder approves production release/,
    ],
    [
      (e) => delete e.build["development-release"],
      /no development-release profile/,
    ],
    [
      (e) => (e.build["development-simulator"].extends = "nothing"),
      /development-simulator extends a profile that doesn't exist/,
    ],
    // A mistake in a profile reaches every profile that extends it.
    [
      (e) => (e.build.development.env.APP_VARIANT = "preview"),
      /development-simulator must build APP_VARIANT=development/,
    ],
  ];
  for (const [change, said] of changes) {
    const changed = structuredClone(eas);
    change(changed);
    refuses(easJsonProblems(changed), said);
  }
  assert.deepEqual(easJsonProblems(null), ["eas.json isn't a JSON object"]);
  assert.deepEqual(easJsonProblems(eas), [], "the repository's eas.json");
});

test("production can't enter an EAS build until 8.4F: eas.json has no profile for it", () => {
  // EAS CLI resolves `--profile production`, and `eas build` with no profile
  // (its default is production), from eas.json first: with no such profile
  // it stops there, before any build number, credential or upload.
  assert.equal("production" in eas.build, false);
  assert.equal(resolveProfile(eas.build, "production"), undefined);
  // No profile builds FORGE, and none uses the production environment.
  for (const rule of Object.values(PROFILES)) {
    assert.notEqual(rule.variant, "production");
    assert.notEqual(rule.environment, "production");
  }
  assert.equal(JSON.stringify(eas.build).includes("production"), false);
  // Putting one back is refused, whatever its shape.
  for (const production of [
    structuredClone(PRODUCTION_PROFILE.eas),
    { extends: "preview", env: { APP_VARIANT: "production" } },
    {},
  ]) {
    const changed = structuredClone(eas);
    changed.build.production = production;
    refuses(easJsonProblems(changed), /the production profile must stay out/);
  }
  // The builder refuses production outright, values and pins or not.
  for (const env of [values("production", PROD), {}])
    for (const pins of [undefined, PINS])
      refuses(
        builderCheck(productionBuild(env), [], pins).problems,
        /EAS_BUILD_PROFILE: production builds are locked until the founder approves production release/,
      );
  assert.match(
    PRODUCTION_LOCKED,
    /^production builds are locked: eas.json has no production profile/,
  );
});

test("the 8.4F restore: the documented profile passes once approved, and only then", () => {
  // eas.json with build.production put back exactly as RELEASE.md §6 says.
  const restored = structuredClone(eas);
  restored.build.production = structuredClone(PRODUCTION_PROFILE.eas);
  // Valid as FORGE's store profile once PROFILES takes production back...
  assert.deepEqual(easJsonProblems(restored, RESTORED), []);
  // ...refused until then.
  refuses(easJsonProblems(restored), /the production profile must stay out/);
  // A restored profile is still locked on the builder until production is
  // pinned (projects.ts)...
  refuses(
    builderCheck(
      productionBuild(values("production", PROD)),
      [],
      undefined,
      RESTORED,
    ).problems,
    /production builds are locked: no production project is pinned/,
  );
  // ...and once pinned (here a test pin), builds only with production's own
  // project, named production.
  assert.deepEqual(
    builderCheck(
      productionBuild(values("production", PROD)),
      [],
      PINS,
      RESTORED,
    ).problems,
    [],
  );
  refuses(
    builderCheck(productionBuild(values("production", DEV)), [], PINS, RESTORED)
      .problems,
    /isn't the pinned production project/,
  );
  refuses(
    builderCheck(
      productionBuild(values("development", DEV)),
      [],
      PINS,
      RESTORED,
    ).problems,
    /The production app can only use the production environment/,
  );
  // The restore changes nothing else: every other profile stays as it is.
  const { production: _production, ...others } = RESTORED;
  assert.deepEqual(others, PROFILES);
  // And it stays current: preview's store settings (Node pin, numbering,
  // App Bundle), with production's environment and app instead.
  assert.deepEqual(
    {
      ...structuredClone(PRODUCTION_PROFILE.eas),
      environment: "preview",
      env: { APP_VARIANT: "preview" },
    },
    eas.build.preview,
  );
});

// ---- Each app's config ----

test("every app keeps its own identity, no shared storage, sign-in out of backups", () => {
  for (const variant of ["production", "development", "preview"] as const) {
    const config = appConfigFor(variant, expo, process.cwd());
    assert.deepEqual(identityProblems(config, variant), [], variant);
    assert.deepEqual(nativePolicyProblems(config, variant), [], variant);
    assert.deepEqual(storePolicyProblems(config, variant), [], variant);
  }
});

test("store policy mistakes are refused (Phase 8.4 M4)", () => {
  const refused = (change: (e: typeof expo) => void, said: RegExp) => {
    const e = structuredClone(expo);
    change(e);
    for (const variant of ["production", "development", "preview"] as const)
      refuses(
        storePolicyProblems(appConfigFor(variant, e, process.cwd()), variant),
        said,
      );
  };
  const plugin = (e: typeof expo, name: string, entry: unknown) => {
    const i = e.plugins.findIndex(
      (p: unknown) => p === name || (Array.isArray(p) && p[0] === name),
    );
    if (i < 0) e.plugins.push(entry);
    else e.plugins[i] = entry;
  };
  // Without the answer, every TestFlight build waits for it by hand.
  refused(
    (e) => delete e.ios.infoPlist.ITSAppUsesNonExemptEncryption,
    /export compliance must be answered/,
  );
  refused(
    (e) => (e.ios.infoPlist.UIViewControllerBasedStatusBarAppearance = false),
    /iOS 27 status bar/,
  );
  refused((e) => (e.ios.supportsTablet = true), /an iPhone app/);
  refused(
    (e) =>
      plugin(e, "expo-build-properties", [
        "expo-build-properties",
        { ios: { privacyManifestAggregationEnabled: false } },
      ]),
    /privacy reasons must be gathered/,
  );
  refused(
    (e) =>
      plugin(e, "expo-camera", [
        "expo-camera",
        { cameraPermission: "Scan food barcodes." },
      ]),
    /records no sound/,
  );
  refused(
    (e) =>
      (e.android.permissions ??= []).push("android.permission.RECORD_AUDIO"),
    /records no sound/,
  );
  refused(
    (e) => (e.android.predictiveBackGestureEnabled = true),
    /classic back events/,
  );
  refused(
    (e) =>
      (e.android.permissions ??= []).push("android.permission.USE_EXACT_ALARM"),
    /only for alarm-clock and calendar apps/,
  );
  for (const options of [
    { withSQLiteVecExtension: true },
    { android: { withSQLiteVecExtension: true } },
  ])
    refused(
      (e) => plugin(e, "expo-sqlite", ["expo-sqlite", options]),
      /sqlite-vec extension isn't 16 KB-aligned/,
    );
});

test("app config mistakes are refused", () => {
  const config = (
    variant: "production" | "development" | "preview",
    e = expo,
  ) => appConfigFor(variant, e, process.cwd());
  const changed = (change: (e: typeof expo) => void) => {
    const e = structuredClone(expo);
    change(e);
    return e;
  };
  const preview = config("preview");
  refuses(
    identityProblems(
      {
        ...preview,
        ios: { ...preview.ios, bundleIdentifier: "com.lsaint06.forge" },
      },
      "preview",
    ),
    /iOS bundle ID must be com\.lsaint06\.forge\.preview/,
  );
  refuses(
    identityProblems({ ...preview, scheme: "forge" }, "preview"),
    /link scheme must be forge-preview/,
  );
  refuses(
    identityProblems(
      config(
        "production",
        changed((e) => (e.ios.buildNumber = "7")),
      ),
      "production",
    ),
    /build numbers come from EAS/,
  );
  refuses(
    identityProblems(
      config(
        "production",
        changed((e) => (e.android.versionCode = 7)),
      ),
      "production",
    ),
    /build numbers come from EAS/,
  );
  refuses(
    identityProblems(
      config(
        "production",
        changed((e) => (e.version = "1.0")),
      ),
      "production",
    ),
    /MAJOR\.MINOR\.PATCH/,
  );
  refuses(
    nativePolicyProblems(
      config(
        "preview",
        changed((e) => delete e.android.blockedPermissions),
      ),
      "preview",
    ),
    /must block android\.permission\.READ_EXTERNAL_STORAGE/,
  );
  refuses(
    nativePolicyProblems(
      config(
        "production",
        changed(
          (e) =>
            (e.android.permissions = [
              "android.permission.WRITE_EXTERNAL_STORAGE",
            ]),
        ),
      ),
      "production",
    ),
    /must not request android\.permission\.WRITE_EXTERNAL_STORAGE/,
  );
  const plugin = (e: typeof expo, name: string, entry: unknown) => {
    const i = e.plugins.findIndex(
      (p: unknown) => p === name || (Array.isArray(p) && p[0] === name),
    );
    if (entry === undefined) e.plugins.splice(i, 1);
    else e.plugins[i] = entry;
  };
  for (const entry of [
    "expo-secure-store",
    ["expo-secure-store", { configureAndroidBackup: false }],
    undefined,
  ])
    refuses(
      nativePolicyProblems(
        config(
          "production",
          changed((e) => plugin(e, "expo-secure-store", entry)),
        ),
        "production",
      ),
      /sign-in must stay out of Android backups/,
    );
  // expo-dev-client's default would give every app the dev-client link.
  const withoutDevClient = changed((e) =>
    plugin(e, "expo-dev-client", undefined),
  );
  refuses(
    nativePolicyProblems(config("production", withoutDevClient), "production"),
    /only FORGE Dev answers development-client links/,
  );
  refuses(
    nativePolicyProblems(
      config("development", withoutDevClient),
      "development",
    ),
    /FORGE Dev must answer its development-client links/,
  );
});

// ---- On the EAS builder ----

test("each build passes with its own app's values and pinned project", () => {
  for (const [profile, environment, ref] of [
    ["development-release", "development", DEV],
    ["preview", "development", DEV],
  ] as const) {
    const result = builderCheck(
      build(profile, values(environment, ref)),
      [],
      PINS,
    );
    assert.deepEqual(result.problems, [], profile);
    assert.equal(result.profile, profile);
  }
  // A development client builds no JavaScript in: no values needed.
  for (const profile of ["development", "development-simulator"] as const) {
    const result = builderCheck(build(profile), [], PINS);
    assert.deepEqual(result.problems, [], profile);
    assert.match(result.notes.join(" "), /npm run start:dev/);
  }
});

test("FORGE Preview never builds with production: by name, project or address", () => {
  // Named production.
  refuses(
    builderCheck(build("preview", values("production", PROD)), [], PINS)
      .problems,
    /The preview app can only use the development environment/,
  );
  // Named development, but production's project throughout: only the pin knows.
  refuses(
    builderCheck(build("preview", values("development", PROD)), [], PINS)
      .problems,
    /EXPO_PUBLIC_SUPABASE_PROJECT_REF isn't the pinned development project/,
  );
  // FORGE DEV's project, but production's address.
  refuses(
    builderCheck(
      build("preview", {
        ...values("development", DEV),
        EXPO_PUBLIC_SUPABASE_URL: at(PROD),
      }),
      [],
      PINS,
    ).problems,
    /EXPO_PUBLIC_SUPABASE_URL isn't EXPO_PUBLIC_SUPABASE_PROJECT_REF/,
  );
  // And FORGE Dev builds, with values or without, never production either.
  for (const profile of ["development", "development-release"] as const)
    refuses(
      builderCheck(build(profile, values("production", PROD)), [], PINS)
        .problems,
      /The development app can only use the development environment/,
    );
});

test("production builds stay locked: no profile until 8.4F, and no pin", () => {
  assert.equal(PROJECT_FINGERPRINTS.production, null);
  assert.match(PROJECT_FINGERPRINTS.development ?? "", /^[0-9a-f]{64}$/);
  assert.match(projectLock("production") ?? "", /production builds are locked/);
  assert.equal(projectLock("preview"), undefined);
  assert.equal(projectLock("development"), undefined);
  // FORGE Preview uses FORGE DEV's pin: it has no project of its own.
  assert.equal(APP_ENVIRONMENTS.preview, "development");
  // FORGE itself is still one of Forge's apps, using production only.
  assert.equal(APP_ENVIRONMENTS.production, "production");
  // A test project is never the pinned FORGE DEV project.
  refuses(
    builderCheck(build("preview", values("development", DEV)), []).problems,
    /isn't the pinned development project/,
  );
});

test("missing, partial or insecure values stop the build; nothing fails open", () => {
  for (const key of Object.keys(values("development", DEV))) {
    const env: Record<string, string | undefined> = values("development", DEV);
    delete env[key];
    refuses(
      builderCheck(build("preview", env), [], PINS).problems,
      new RegExp(`${key} isn't set in the EAS preview environment`),
    );
    // A development client with some values must have them all.
    refuses(
      builderCheck(build("development", env), [], PINS).problems,
      new RegExp(`${key} isn't set in the EAS development environment`),
    );
  }
  refuses(
    builderCheck(
      build("preview", {
        ...values("development", DEV),
        EXPO_PUBLIC_SUPABASE_URL: `http://${DEV}.supabase.co`,
      }),
      [],
      PINS,
    ).problems,
    /must use HTTPS/,
  );
  for (const [key, secret] of [
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_abcdef"],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", serviceRole],
    ["EXPO_PUBLIC_SUPPORT_EMAIL", "sb_secret_abcdef"],
  ] as const)
    refuses(
      builderCheck(
        build("preview", { ...values("development", DEV), [key]: secret }),
        [],
        PINS,
      ).problems,
      new RegExp(`${key} is a Supabase secret key`),
    );
});

test("only a known profile building its own app, with no settings file uploaded", () => {
  refuses(
    builderCheck({ ...values("development", DEV) }, [], PINS).problems,
    /EAS_BUILD_PROFILE isn't set/,
  );
  refuses(
    builderCheck(build("preview", { EAS_BUILD_PROFILE: "staging" }), [], PINS)
      .problems,
    /staging isn't one of Forge's profiles/,
  );
  for (const variant of ["production", "development", undefined, ""])
    refuses(
      builderCheck(
        build("preview", {
          ...values("development", DEV),
          APP_VARIANT: variant,
        }),
        [],
        PINS,
      ).problems,
      /APP_VARIANT must be preview for the preview profile/,
    );
  refuses(
    builderCheck(build("development"), [".env", ".env.forge-dev"], PINS)
      .problems,
    /\.env reached the build/,
  );
});

// ---- This computer and the repository ----

test("this computer's FORGE DEV settings must be the pinned project", () => {
  const ref = (r: string) => ({ EXPO_PUBLIC_SUPABASE_PROJECT_REF: r });
  assert.equal(devSettingsProblem(ref(DEV), PINS), undefined);
  assert.equal(devSettingsProblem(ref(` ${DEV} `), PINS), undefined);
  refuses(
    [devSettingsProblem(ref(PROD), PINS)!],
    /isn't the pinned development project/,
  );
  refuses(
    [devSettingsProblem({}, PINS)!],
    /names no EXPO_PUBLIC_SUPABASE_PROJECT_REF/,
  );
});

test("every EAS build checks itself first", () => {
  assert.equal(scripts["release:check"], "tsx scripts/release/check.ts");
  assert.deepEqual(hookProblems(scripts), []);
  assert.ok(
    scripts["eas-build-post-install"].startsWith(`${BUILDER_HOOK} && `),
  );
  for (const hook of [
    undefined,
    "npm run branded:ensure",
    `npm run branded:ensure && ${BUILDER_HOOK}`,
    `${BUILDER_HOOK}; npm run branded:ensure`,
    `${BUILDER_HOOK} || true`,
  ])
    refuses(
      hookProblems({ "eas-build-post-install": hook }),
      /eas-build-post-install must start with/,
    );
});

test("no settings file or signing credential may be committed", () => {
  assert.deepEqual(
    trackedFileProblems([
      "app.json",
      ".env.example",
      ".env.forge-dev.example",
      "docs/RELEASE.md",
      "src/cloud/environment.ts",
    ]),
    [],
  );
  for (const file of [
    ".env",
    ".env.local",
    ".env.forge-dev",
    "config/.env.production",
    "credentials.json",
    "android/app/release.keystore",
    "upload.jks",
    "AuthKey_ABC123.p8",
    "distribution.p12",
    "FORGE.mobileprovision",
    "play-service-account.json",
    "key.pem",
  ])
    assert.equal(trackedFileProblems([file]).length, 1, file);
  for (const name of [
    ".env",
    ".env.local",
    ".env.forge-dev",
    ".env.production",
  ])
    assert.ok(isSettingsFile(name), name);
  for (const name of [
    ".env.example",
    ".env.forge-dev.example",
    ".envrc",
    "env.ts",
  ])
    assert.ok(!isSettingsFile(name), name);
});

test("EAS uploads the last commit only: EAS_NO_VCS or a .easignore is refused", () => {
  const files = [
    "app.json",
    "eas.json",
    ".gitignore",
    ".env",
    ".env.forge-dev",
  ];
  assert.deepEqual(uploadProblems({}, files), []);
  // EAS CLI treats any value as set, even "0"; empty is unset.
  assert.deepEqual(uploadProblems({ EAS_NO_VCS: "" }, files), []);
  for (const value of ["1", "true", "0"])
    refuses(
      uploadProblems({ EAS_NO_VCS: value }, files),
      /EAS_NO_VCS is set: EAS would skip Git and upload this folder/,
    );
  // With EAS_NO_VCS, a .easignore replaces .gitignore and its "!" rules can
  // add uncommitted files, such as .env.
  refuses(uploadProblems({}, [...files, ".easignore"]), /\.easignore exists/);
  assert.equal(
    uploadProblems({ EAS_NO_VCS: "1" }, [...files, ".easignore"]).length,
    2,
  );
});

// ---- The command itself ----

const tsx = createRequire(path.resolve("package.json")).resolve("tsx/cli");
const checkScript = path.resolve("scripts/release/check.ts");
function run(
  args: string[],
  cwd = process.cwd(),
  extra: Record<string, string> = {},
) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (
      value !== undefined &&
      !key.startsWith("EXPO_PUBLIC_") &&
      !key.startsWith("EAS_BUILD") &&
      key !== "EAS_NO_VCS" &&
      key !== "APP_VARIANT"
    )
      env[key] = value;
  const result = spawnSync(process.execPath, [tsx, checkScript, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...env, ...extra } as NodeJS.ProcessEnv,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

test("release:check: the preview profile passes; production stops on its lock", () => {
  const preview = run(["--profile", "preview", "--allow-dirty"]);
  assert.equal(preview.status, 0, preview.out);
  assert.match(preview.out, /FORGE Preview \(com\.lsaint06\.forge\.preview\)/);
  assert.match(preview.out, /✓ Store policy: export compliance answered/);
  // A note, not a failure, until FORGE has its icon (C-00b).
  if (expo.icon === undefined)
    assert.match(preview.out, /• App icon: none configured/);
  else assert.doesNotMatch(preview.out, /App icon: none configured/);
  const production = run(["--profile", "production", "--allow-dirty"]);
  assert.equal(production.status, 1, production.out);
  assert.match(
    production.out,
    /✗ production builds are locked: eas.json has no production profile/,
  );
  // Locked whether or not the tree is clean.
  assert.equal(run(["--profile", "production"]).status, 1);
  const usage = run(["--profile", "staging"]);
  assert.equal(usage.status, 1);
  assert.match(usage.out, /Usage: npm run release:check/);
  // EAS_NO_VCS in this shell would make EAS upload the folder, not the commit.
  const noVcs = run(["--profile", "preview", "--allow-dirty"], process.cwd(), {
    EAS_NO_VCS: "1",
  });
  assert.equal(noVcs.status, 1, noVcs.out);
  assert.match(noVcs.out, /✗ EAS_NO_VCS is set/);
});

test("release:check --builder stops a build on the builder, printing no values", () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), "forge-release-"));
  try {
    for (const file of ["app.json", "eas.json", "package.json"])
      copyFileSync(file, path.join(folder, file));
    const devClient = run(
      ["--builder"],
      folder,
      build("development") as Record<string, string>,
    );
    assert.equal(devClient.status, 0, devClient.out);
    const preview = run(
      ["--builder"],
      folder,
      build("preview", values("development", DEV)) as Record<string, string>,
    );
    assert.equal(preview.status, 1, preview.out);
    assert.match(preview.out, /isn't the pinned development project/);
    for (const value of [DEV, KEY]) assert.ok(!preview.out.includes(value));
    writeFileSync(path.join(folder, ".env"), "EXPO_PUBLIC_FORGE_ENV=\n");
    const uploaded = run(
      ["--builder"],
      folder,
      build("development") as Record<string, string>,
    );
    assert.equal(uploaded.status, 1, uploaded.out);
    assert.match(uploaded.out, /✗ \.env reached the build/);
    // The pin for a project's settings file, without its ref.
    writeFileSync(
      path.join(folder, "project.env"),
      `EXPO_PUBLIC_SUPABASE_PROJECT_REF=${DEV}\n`,
    );
    const pin = run(["--fingerprint", "project.env"], folder);
    assert.equal(pin.status, 0, pin.out);
    assert.ok(pin.out.includes(fingerprint(DEV)));
    assert.ok(!pin.out.includes(DEV));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
