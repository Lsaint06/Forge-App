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

/** expo-dev-client's addGeneratedScheme option in a config's plugins. */
function devClientLink(config: { plugins?: unknown[] }) {
  const entry = config.plugins?.find(
    (p) => Array.isArray(p) && p[0] === "expo-dev-client",
  ) as [string, { addGeneratedScheme?: boolean }] | undefined;
  return entry?.[1]?.addGeneratedScheme;
}

test("only the name, IDs and scheme change (and FORGE Dev's dev-client link): icon, splash, plugins and permissions stay", () => {
  for (const variant of ["development", "preview"]) {
    const config = configFor(variant);
    const strip = (c: object) => {
      const {
        name: _n,
        scheme: _s,
        ios,
        android,
        plugins,
        ...rest
      } = c as {
        name: unknown;
        scheme: unknown;
        ios: Record<string, unknown>;
        android: Record<string, unknown>;
        plugins: unknown[];
      };
      const { bundleIdentifier: _b, ...iosRest } = ios;
      const { package: _p, ...androidRest } = android;
      // The same plugins, in order, whatever the dev-client link option.
      const samePlugins = plugins.map((p) =>
        Array.isArray(p) && p[0] === "expo-dev-client" ? p[0] : p,
      );
      return {
        ...rest,
        plugins: samePlugins,
        ios: iosRest,
        android: androidRest,
      };
    };
    assert.deepEqual(strip(config), strip(base), variant);
    assert.match(config.name, /^FORGE /);
  }
  // Phase 8.4B: only FORGE Dev answers exp+ development-client links;
  // FORGE and FORGE Preview, the store apps, leave them out.
  assert.equal(devClientLink(configFor("development")), true);
  assert.equal(devClientLink(configFor("preview")), false);
  assert.equal(devClientLink(configFor("production")), false);
  assert.equal(devClientLink(base), false);
});

test("an unknown variant stops the build instead of guessing", () => {
  for (const variant of ["staging", "dev", "Development", "constructor"])
    assert.throws(() => configFor(variant), /APP_VARIANT must be/, variant);
});

type Introspected = {
  ios: {
    bundleIdentifier: string;
    entitlements?: Record<string, unknown>;
    infoPlist?: { CFBundleURLTypes?: { CFBundleURLSchemes?: string[] }[] };
  };
  _internal?: {
    modResults?: {
      android?: {
        manifest?: {
          manifest: {
            "uses-permission"?: { $: Record<string, string> }[];
            application?: {
              $: Record<string, string>;
              activity?: {
                "intent-filter"?: { data?: { $: Record<string, string> }[] }[];
              }[];
            }[];
          };
        };
      };
    };
  };
};

const introspected = new Map<string, Introspected>();

/** The native settings Expo's own pipeline produces (no native folder needed). */
function introspectAll(variant: string): Introspected {
  const known = introspected.get(variant);
  if (known) return known;
  const cli = createRequire(path.resolve("package.json")).resolve(
    "expo/bin/cli",
  );
  const result = spawnSync(
    process.execPath,
    [cli, "config", "--type", "introspect", "--json"],
    {
      encoding: "utf8",
      env: { ...process.env, APP_VARIANT: variant, EXPO_NO_DOTENV: "1" },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout) as Introspected;
  introspected.set(variant, config);
  return config;
}

const introspect = (variant: string) => introspectAll(variant).ios;

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

const STORAGE = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

test("in Expo's own pipeline (Phase 8.4B): no shared storage, sign-in out of backups, dev-client links on FORGE Dev only", () => {
  for (const [variant, scheme] of [
    ["", "forge"],
    ["development", "forge-dev"],
    ["preview", "forge-preview"],
  ] as const) {
    const config = introspectAll(variant);
    const manifest = config._internal?.modResults?.android?.manifest?.manifest;
    if (!manifest) throw new Error(`${variant}: no Android manifest`);
    const permissions: { $: Record<string, string> }[] =
      manifest["uses-permission"] ?? [];
    // Shared-storage permissions (added by the template) are removed:
    // Forge writes only to its own files and uses system pickers.
    for (const permission of STORAGE) {
      const entries = permissions.filter(
        (p) => p.$["android:name"] === permission,
      );
      assert.ok(entries.length > 0, `${variant} ${permission}`);
      for (const entry of entries)
        assert.equal(
          entry.$["tools:node"],
          "remove",
          `${variant} ${permission}`,
        );
    }
    // Android backups use expo-secure-store's rules (below).
    const app = manifest.application?.[0]?.$ ?? {};
    assert.equal(
      app["android:fullBackupContent"],
      "@xml/secure_store_backup_rules",
      variant,
    );
    assert.equal(
      app["android:dataExtractionRules"],
      "@xml/secure_store_data_extraction_rules",
      variant,
    );
    // Each app answers its own links; only FORGE Dev answers exp+ links
    // (expo start's development-client QR codes).
    const android = new Set(
      (manifest.application?.[0]?.activity ?? []).flatMap((a) =>
        (a["intent-filter"] ?? []).flatMap((f) =>
          (f.data ?? []).map((d) => d.$["android:scheme"]),
        ),
      ),
    );
    const ios = new Set(
      (config.ios.infoPlist?.CFBundleURLTypes ?? []).flatMap(
        (t) => t.CFBundleURLSchemes ?? [],
      ),
    );
    for (const schemes of [android, ios]) {
      assert.ok(schemes.has(scheme), `${variant} ${scheme}`);
      for (const other of ["forge", "forge-dev", "forge-preview"])
        if (other !== scheme)
          assert.ok(!schemes.has(other), `${variant} ${other}`);
      assert.equal(
        schemes.has("exp+forge-fitness"),
        variant === "development",
        `${variant} exp+forge-fitness`,
      );
    }
  }
});

test("Android backups carry no sign-in and no training data: only plain preferences", () => {
  // expo-secure-store's rules, which every Forge app uses (above). An
  // include list: nothing else (the SQLite training database, the food
  // catalogue, files, caches) is backed up or moved to a new device.
  const folder = path.join(
    path.dirname(
      createRequire(path.resolve("package.json")).resolve(
        "expo-secure-store/package.json",
      ),
    ),
    "android/src/main/res/xml",
  );
  for (const [file, sections] of [
    ["secure_store_backup_rules.xml", ["full-backup-content"]],
    [
      "secure_store_data_extraction_rules.xml",
      ["cloud-backup", "device-transfer"],
    ],
  ] as const) {
    const xml = readFileSync(path.join(folder, file), "utf8").replace(
      /<!--[\s\S]*?-->/g,
      "",
    );
    for (const section of sections) {
      const body = new RegExp(`<${section}>([\\s\\S]*?)</${section}>`).exec(
        xml,
      )?.[1];
      assert.ok(body, `${file} ${section}`);
      const rules = [...body.matchAll(/<(include|exclude)\s+([^>]*?)\/>/g)].map(
        ([, kind, attributes]) => `${kind} ${attributes!.trim()}`,
      );
      assert.deepEqual(
        rules,
        [
          'include domain="sharedpref" path="."',
          'exclude domain="sharedpref" path="SecureStore"',
        ],
        `${file} ${section}`,
      );
    }
  }
});
