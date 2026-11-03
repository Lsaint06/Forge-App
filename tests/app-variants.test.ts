import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import appConfig, { PERSONAL_TEAM_ID } from "../app.config";
import { APP_IDS, APP_SCHEMES } from "../src/cloud/environment";

// Phase 8: each FORGE app's identity (app.config.ts) and the runtime rules
// that keep it on its own Supabase environment (src/cloud/environment.ts)
// must describe the same apps.

const base = JSON.parse(readFileSync("app.json", "utf8")).expo;

function configFor(variant: string | undefined, personalTeam?: string) {
  const saved = {
    APP_VARIANT: process.env.APP_VARIANT,
    FORGE_PERSONAL_TEAM: process.env.FORGE_PERSONAL_TEAM,
  };
  const set = (name: keyof typeof saved, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  set("APP_VARIANT", variant);
  set("FORGE_PERSONAL_TEAM", personalTeam);
  try {
    return appConfig({
      config: structuredClone(base),
      projectRoot: process.cwd(),
      staticConfigPath: "app.json",
      packageJsonPath: "package.json",
    });
  } finally {
    set("APP_VARIANT", saved.APP_VARIANT);
    set("FORGE_PERSONAL_TEAM", saved.FORGE_PERSONAL_TEAM);
  }
}

test("unset, blank or production: app.json exactly, as Expo Go uses today", () => {
  for (const variant of [undefined, "", "  ", "production"])
    for (const personalTeam of [undefined, "", "  "])
      assert.deepEqual(
        configFor(variant, personalTeam),
        base,
        `${variant} ${personalTeam}`,
      );
});

test("every variant matches the runtime rules: its IDs and its link scheme", () => {
  for (const variant of ["production", "development", "preview"] as const) {
    const config = configFor(variant);
    assert.equal(APP_IDS[config.ios!.bundleIdentifier!], variant);
    assert.equal(APP_IDS[config.android!.package!], variant);
    assert.equal(config.scheme, APP_SCHEMES[variant]);
  }
  // FORGE Dev signed with a free Apple ID: its own iOS ID, FORGE Dev's rules.
  const personal = configFor("development", "1");
  assert.equal(APP_IDS[personal.ios!.bundleIdentifier!], "development");
  assert.equal(APP_IDS[personal.android!.package!], "development");
  assert.equal(personal.scheme, APP_SCHEMES.development);
  // Every ID the runtime knows is one of these apps, and no two share one.
  const configs = [
    ...(["production", "development", "preview"] as const).map((v) =>
      configFor(v),
    ),
    personal,
  ];
  const ids = new Set(
    configs.flatMap((c) => [c.ios!.bundleIdentifier!, c.android!.package!]),
  );
  assert.deepEqual([...ids].sort(), Object.keys(APP_IDS).sort());
  assert.equal(new Set(Object.values(APP_SCHEMES)).size, 3);
});

test("only the name, IDs and scheme change: icon, splash, plugins and permissions stay", () => {
  for (const variant of ["development", "preview"]) {
    const config = configFor(variant);
    const strip = (c: object) => {
      const {
        name: _n,
        scheme: _s,
        ios,
        android,
        ...rest
      } = c as {
        name: unknown;
        scheme: unknown;
        ios: Record<string, unknown>;
        android: Record<string, unknown>;
      };
      const { bundleIdentifier: _b, ...iosRest } = ios;
      const { package: _p, ...androidRest } = android;
      return { ...rest, ios: iosRest, android: androidRest };
    };
    assert.deepEqual(strip(config), strip(base), variant);
    assert.match(config.name, /^FORGE /);
  }
});

test("an unknown variant stops the build instead of guessing", () => {
  for (const variant of ["staging", "dev", "Development", "constructor"])
    assert.throws(() => configFor(variant), /APP_VARIANT must be/, variant);
});

// ---- Phase 8.1: FORGE Dev signed with a free Apple ID (Personal Team) ----

test("a free Apple ID's FORGE Dev: its own iOS ID, without Sign in with Apple, nothing else changed", () => {
  const dev = configFor("development");
  const personal = configFor("development", "1");
  assert.equal(personal.ios!.bundleIdentifier, PERSONAL_TEAM_ID);
  assert.notEqual(PERSONAL_TEAM_ID, dev.ios!.bundleIdentifier);
  assert.equal(personal.android!.package, dev.android!.package);
  // The plugin list is untouched: the Apple sign-in plugin is stood in for
  // (it runs once), not removed.
  assert.deepEqual(personal.plugins, base.plugins);
  const internal = (personal as { _internal?: { pluginHistory?: object } })
    ._internal;
  assert.ok(
    internal?.pluginHistory?.hasOwnProperty("expo-apple-authentication"),
  );
  const plain = (c: object) => {
    const {
      mods: _m,
      _internal: _i,
      ios,
      ...rest
    } = c as {
      mods?: unknown;
      _internal?: unknown;
      ios: Record<string, unknown>;
    };
    const { bundleIdentifier: _b, ...iosRest } = ios;
    return { ...rest, ios: iosRest };
  };
  assert.deepEqual(plain(personal), plain(dev));
});

test("FORGE_PERSONAL_TEAM builds FORGE Dev only, and only as 1", () => {
  for (const variant of [undefined, "", "production", "preview"])
    assert.throws(
      () => configFor(variant, "1"),
      /FORGE_PERSONAL_TEAM=1 builds FORGE Dev only/,
      String(variant),
    );
  for (const value of ["true", "0", "yes", "2", "1 1"])
    assert.throws(
      () => configFor("development", value),
      /FORGE_PERSONAL_TEAM must be 1 or unset/,
      value,
    );
});

/** The iOS settings Expo's own pipeline produces (no native folder needed). */
function introspect(env: Record<string, string>) {
  const cli = createRequire(path.resolve("package.json")).resolve(
    "expo/bin/cli",
  );
  const result = spawnSync(
    process.execPath,
    [cli, "config", "--type", "introspect", "--json"],
    {
      encoding: "utf8",
      env: { ...process.env, ...env, EXPO_NO_DOTENV: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const ios = JSON.parse(result.stdout).ios as {
    bundleIdentifier: string;
    entitlements?: Record<string, unknown>;
    infoPlist?: Record<string, unknown>;
  };
  return ios;
}

test("in Expo's own pipeline, only the free Apple ID build leaves out Sign in with Apple", () => {
  const APPLE = "com.apple.developer.applesignin";
  for (const [env, id, apple] of [
    [{ APP_VARIANT: "", FORGE_PERSONAL_TEAM: "" }, "com.lsaint06.forge", true],
    [
      { APP_VARIANT: "development", FORGE_PERSONAL_TEAM: "" },
      "com.lsaint06.forge.dev",
      true,
    ],
    [
      { APP_VARIANT: "development", FORGE_PERSONAL_TEAM: "1" },
      PERSONAL_TEAM_ID,
      false,
    ],
  ] as const) {
    const ios = introspect(env);
    assert.equal(ios.bundleIdentifier, id);
    assert.equal(APPLE in (ios.entitlements ?? {}), apple, id);
    // Expo adds this capability on its own whenever the package is
    // installed: the stand-in must keep it out, not just the plugin list.
    if (!apple) assert.deepEqual(ios.entitlements ?? {}, {});
    // The plugin's other setting is kept in every build.
    assert.equal(ios.infoPlist?.CFBundleAllowMixedLocalizations, true, id);
  }
});
