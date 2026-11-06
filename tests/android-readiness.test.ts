import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Phase 8.4 M3: Android release facts that can be checked without an Android
// toolchain. How Forge behaves on Android still needs devices
// (docs/ANDROID.md).

const read = (file: string) => readFileSync(path.resolve(file), "utf8");

test("Google Play's target API: React Native 0.88 builds for Android 16 (API 36)", () => {
  const catalog = read("node_modules/react-native/gradle/libs.versions.toml");
  const level = (name: string) => {
    const value = new RegExp(`^${name}\\s*=\\s*"(\\d+)"`, "m").exec(
      catalog,
    )?.[1];
    assert.ok(value, name);
    return Number(value);
  };
  // New apps and updates must target API 36 or higher since Aug 31, 2026.
  assert.ok(level("targetSdk") >= 36, `targetSdk ${level("targetSdk")}`);
  assert.ok(level("compileSdk") >= level("targetSdk"));
  // Android 7.0 and later.
  assert.equal(level("minSdk"), 24);
});

test("native libraries ask only for the permissions Forge's privacy answers cover", () => {
  // Library manifests merge into the app when Gradle builds it, so Expo's
  // own pipeline never shows them. A new permission changes Play's Data
  // safety answers (docs/RELEASE.md §9). Libraries from Maven, such as
  // Firebase Messaging, show only in a built bundle (V6).
  const cli = createRequire(path.resolve("package.json")).resolve(
    "expo-modules-autolinking/bin/expo-modules-autolinking.js",
  );
  const result = spawnSync(
    process.execPath,
    [cli, "resolve", "--platform", "android", "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  const resolved = JSON.parse(
    result.stdout.slice(result.stdout.indexOf("{")),
  ) as {
    modules: { packageName: string; projects?: { sourceDir: string }[] }[];
  };
  // Expo modules, as Expo links them, and the React Native libraries Forge
  // depends on directly.
  const projects = new Map<string, string>();
  for (const m of resolved.modules)
    for (const p of m.projects ?? [])
      projects.set(path.resolve(p.sourceDir), m.packageName);
  const pkg = JSON.parse(read("package.json")) as {
    dependencies: Record<string, string>;
  };
  for (const name of Object.keys(pkg.dependencies)) {
    const dir = path.resolve("node_modules", name, "android");
    if (existsSync(dir)) projects.set(dir, name);
  }
  assert.ok(projects.size >= 30, `${projects.size} native projects`);
  const declared = new Map<string, Set<string>>();
  for (const [dir, name] of projects) {
    const manifest = path.join(dir, "src", "main", "AndroidManifest.xml");
    if (!existsSync(manifest)) continue;
    const xml = readFileSync(manifest, "utf8").replace(/<!--[\s\S]*?-->/g, "");
    for (const m of xml.matchAll(
      /<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"/g,
    ))
      declared.set(m[1]!, (declared.get(m[1]!) ?? new Set()).add(name));
  }
  assert.deepEqual(
    [...declared.keys()].sort(),
    [
      "android.permission.CAMERA",
      "android.permission.INTERNET",
      "android.permission.POST_NOTIFICATIONS",
      // expo-file-system's; Forge's manifest removes both
      // (tests/app-variants.test.ts).
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.VIBRATE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    [...declared].map(([p, from]) => `${p}: ${[...from]}`).join("; "),
  );
});
