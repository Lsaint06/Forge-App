import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import appConfig from "../app.config";
import { APP_IDS, APP_SCHEMES } from "../src/cloud/environment";

// Phase 8: each FORGE app's identity (app.config.ts) and the runtime rules
// that keep it on its own Supabase environment (src/cloud/environment.ts)
// must describe the same apps.

const base = JSON.parse(readFileSync("app.json", "utf8")).expo;

function configFor(variant: string | undefined) {
  const saved = process.env.APP_VARIANT;
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  try {
    return appConfig({
      config: structuredClone(base),
      projectRoot: process.cwd(),
      staticConfigPath: "app.json",
      packageJsonPath: "package.json",
    });
  } finally {
    if (saved === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = saved;
  }
}

test("unset, blank or production: app.json exactly, as Expo Go uses today", () => {
  for (const variant of [undefined, "", "  ", "production"])
    assert.deepEqual(configFor(variant), base, String(variant));
});

test("every variant matches the runtime rules: its IDs and its link scheme", () => {
  for (const variant of ["production", "development", "preview"] as const) {
    const config = configFor(variant);
    assert.equal(APP_IDS[config.ios!.bundleIdentifier!], variant);
    assert.equal(APP_IDS[config.android!.package!], variant);
    assert.equal(config.scheme, APP_SCHEMES[variant]);
  }
  // Every ID the runtime knows is one of these apps, and no two share one.
  const ids = new Set(
    (["production", "development", "preview"] as const).flatMap((v) => [
      configFor(v).ios!.bundleIdentifier!,
      configFor(v).android!.package!,
    ]),
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

/** The iOS settings Expo's own pipeline produces (no native folder needed). */
function introspect(variant: string) {
  const cli = createRequire(path.resolve("package.json")).resolve(
    "expo/bin/cli",
  );
  const result = spawnSync(
    process.execPath,
    [cli, "config", "--type", "introspect", "--json"],
    {
      encoding: "utf8",
      env: { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: "1" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).ios as {
    bundleIdentifier: string;
    entitlements?: Record<string, unknown>;
    infoPlist?: { CFBundleURLTypes?: { CFBundleURLSchemes?: string[] }[] };
  };
}

test("in Expo's own pipeline, FORGE and FORGE Dev sign exactly Sign in with Apple, each with its own link scheme", () => {
  for (const [variant, id, scheme] of [
    ["", "com.lsaint06.forge", "forge"],
    ["development", "com.lsaint06.forge.dev", "forge-dev"],
  ] as const) {
    const ios = introspect(variant);
    assert.equal(ios.bundleIdentifier, id);
    // Sign in with Apple for both (Phase 8.1: the paid team signs it); no
    // push (Forge only schedules local notifications).
    assert.deepEqual(
      ios.entitlements,
      { "com.apple.developer.applesignin": ["Default"] },
      id,
    );
    const schemes = (ios.infoPlist?.CFBundleURLTypes ?? []).flatMap(
      (t) => t.CFBundleURLSchemes ?? [],
    );
    assert.ok(schemes.includes(scheme), id);
    assert.ok(
      !schemes.includes(scheme === "forge" ? "forge-dev" : "forge"),
      id,
    );
  }
});
