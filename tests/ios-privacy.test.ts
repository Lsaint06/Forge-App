import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Phase 8.4 M4: Apple asks for a reason for every "required reason" API an
// app calls, and emails ITMS-91053 after an upload that lacks one. Forge's
// own code is JavaScript: the calls come from React Native's and Expo's iOS
// libraries, which declare them in their own privacy manifests. Expo SDK
// 58's Podfile has React Native gather those into the app's manifest when
// the pods install; the release check refuses turning that off. This pins
// what they declare: a new API, reason or collected data type means
// reviewing the App Store privacy answers (docs/STORE_SETUP.md §3).

const fromExpo = createRequire(
  createRequire(path.resolve("package.json")).resolve("expo/package.json"),
);
const plistModule = fromExpo("@expo/plist") as {
  default?: { parse(xml: string): Record<string, unknown> };
  parse?(xml: string): Record<string, unknown>;
};
const parse = (plistModule.default ?? plistModule).parse!;

const SKIP = new Set([
  ".bin",
  ".cache",
  "__tests__",
  "example",
  "examples",
  "fixtures",
  "template",
  "templates",
  "test",
  "tests",
]);

/** Every privacy manifest the installed libraries ship. */
function manifests(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) manifests(path.join(dir, entry.name), found);
    } else if (entry.name === "PrivacyInfo.xcprivacy")
      found.push(path.join(dir, entry.name));
  }
  return found;
}

type ApiType = {
  NSPrivacyAccessedAPIType: string;
  NSPrivacyAccessedAPITypeReasons: string[];
};

test("iOS libraries declare exactly these required-reason APIs, and track nothing", () => {
  const files = manifests(path.resolve("node_modules"));
  // React Native's and Expo's own, among them.
  assert.ok(files.length >= 10, `${files.length} privacy manifests`);
  const declared = new Map<string, Set<string>>();
  for (const file of files) {
    const manifest = parse(readFileSync(file, "utf8"));
    const name = path.relative(path.resolve("node_modules"), file);
    assert.notEqual(manifest.NSPrivacyTracking, true, name);
    assert.deepEqual(manifest.NSPrivacyTrackingDomains ?? [], [], name);
    assert.deepEqual(manifest.NSPrivacyCollectedDataTypes ?? [], [], name);
    for (const api of (manifest.NSPrivacyAccessedAPITypes ?? []) as ApiType[]) {
      const category = api.NSPrivacyAccessedAPIType.replace(
        "NSPrivacyAccessedAPICategory",
        "",
      );
      const reasons = declared.get(category) ?? new Set<string>();
      for (const reason of api.NSPrivacyAccessedAPITypeReasons)
        reasons.add(reason);
      declared.set(category, reasons);
    }
  }
  assert.deepEqual(
    Object.fromEntries(
      [...declared]
        .map(([category, reasons]) => [category, [...reasons].sort()] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
    {
      // expo-file-system: free space before writing files.
      DiskSpace: ["85F4.1", "E174.1"],
      // React Native, its libraries, expo-application and expo-file-system.
      FileTimestamp: ["0A2A.1", "3B52.1", "C617.1"],
      // React Native's timing.
      SystemBootTime: ["35F9.1"],
      // React Native, expo-constants, expo-notifications, expo-system-ui.
      UserDefaults: ["CA92.1"],
    },
  );
});
