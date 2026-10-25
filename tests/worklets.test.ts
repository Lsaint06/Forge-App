import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { transformSync } from "@babel/core";

// Phase 7.1A device report: the Design System screen crashed because a
// Reanimated worklet (UI thread) called a plain module function. On the UI
// runtime such a function is replaced by a guard that throws, which takes the
// app down. The UI tests mock Reanimated and cannot see this, so every source
// file with worklets is compiled here with the app's own Babel preset, and
// any module-level function a worklet captures must itself be a worklet.

const root = join(__dirname, "..");
const preset = require.resolve("babel-preset-expo", {
  paths: [require.resolve("expo/package.json", { paths: [root] })],
});
const WORKLET_HINT =
  /useAnimatedStyle|useAnimatedProps|useDerivedValue|useAnimatedScrollHandler|useAnimatedReaction|runOnUI|["']worklet["']/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const path = join(dir, f);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.tsx?$/.test(f)
        ? [path]
        : [];
  });
}

/** Module-local functions captured by a worklet that are not worklets. */
export function unsafeCaptures(code: string) {
  const problems: string[] = [];
  for (const m of code.matchAll(/code:"([^"\\]*(?:\\.[^"\\]*)*)"/g)) {
    const body = m[1]!;
    const closure = /const\s*[[{]([^\]}]*)[\]}]\s*=\s*this\.__closure/.exec(
      body,
    );
    if (!closure) continue;
    for (const raw of closure[1]!.split(",")) {
      const name = raw.split(":")[0]!.trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      const fn = new RegExp(
        `(?:^|[;\\n}])\\s*(?:function\\s+${name}\\s*\\(|(?:var|let|const)\\s+${name}\\s*=\\s*(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>))`,
      );
      if (fn.test(code) && !code.includes(`${name}.__workletHash`))
        problems.push(name);
    }
  }
  return problems;
}

test("worklets only call worklets (no UI-thread remote-function crash)", () => {
  const candidates = [
    ...files(join(root, "src")),
    ...files(join(root, "app")),
  ].filter((f) => WORKLET_HINT.test(readFileSync(f, "utf8")));
  assert.ok(candidates.length > 0, "found files with worklets");
  const found: Record<string, string[]> = {};
  for (const file of candidates) {
    const out = transformSync(readFileSync(file, "utf8"), {
      filename: file,
      presets: [preset],
      babelrc: false,
      configFile: false,
      caller: {
        name: "metro",
        platform: "ios",
        isDev: true,
        bundler: "metro",
      } as never,
    })!.code!;
    const bad = unsafeCaptures(out);
    if (bad.length) found[relative(root, file).replaceAll("\\", "/")] = bad;
  }
  assert.deepEqual(found, {});
});

test("the check recognises a captured plain function", () => {
  const probe = join(mkdtempSync(join(tmpdir(), "forge-worklet-")), "probe.ts");
  const source = `import { useAnimatedStyle } from "react-native-reanimated";
     const clamp = (v: number) => Math.max(0, Math.min(1, v));
     export function useFill(p: { value: number }) {
       return useAnimatedStyle(() => ({ width: clamp(p.value) * 100 }));
     }`;
  writeFileSync(probe, source);
  const out = transformSync(source, {
    filename: probe,
    presets: [preset],
    babelrc: false,
    configFile: false,
    caller: { name: "metro", platform: "ios", isDev: true } as never,
  })!.code!;
  rmSync(probe);
  assert.deepEqual(unsafeCaptures(out), ["clamp"]);
});
