import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Phase 8.4C-1: Forge's Expo and React Native packages stay at Expo SDK 58's
// own versions, the ones `npx expo install --check` and Expo Doctor expect.
// The lockfile is what `npm ci` installs, here, in CI and on EAS. Mixing
// versions risks native mismatches: some packages ship iOS binaries built
// against one React Native version (docs/RELEASE.md §11, V5).

const json = (file: string) =>
  JSON.parse(readFileSync(path.resolve(file), "utf8"));
const pkg = json("package.json") as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const lock = json("package-lock.json") as {
  packages: Record<string, { version?: string }>;
};
/** Expo SDK 58's own versions, from the installed `expo`. */
const sdk = json("node_modules/expo/bundledNativeModules.json") as Record<
  string,
  string
>;
const declared = { ...pkg.dependencies, ...pkg.devDependencies };
const managed = Object.keys(declared).filter((name) => name in sdk);

const plain = (version: string) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`Not a plain version: ${version}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
};

/** `version` is within `range`: exact, ~ or ^, the forms Expo uses. */
function within(version: string, range: string): boolean {
  const op = operator(range);
  const [a, b, c] = plain(range.slice(op.length));
  const [x, y, z] = plain(version);
  if (!op) return x === a && y === b && z === c;
  const atLeast = x !== a ? x > a : y !== b ? y > b : z >= c;
  if (!atLeast) return false;
  if (op === "~") return x === a && y === b;
  // ^: the leftmost non-zero part stays the same.
  if (a > 0) return x === a;
  if (b > 0) return x === 0 && y === b;
  return x === 0 && y === 0 && z === c;
}

function operator(range: string): "" | "~" | "^" {
  return range[0] === "~" || range[0] === "^" ? range[0] : "";
}
/** How much a range lets through: exact, then ~, then ^. */
const WIDTH = { "": 0, "~": 1, "^": 2 } as const;

/** Every installed copy of `name` in the lockfile, at any depth. */
const copies = (name: string) =>
  Object.keys(lock.packages).filter(
    (key) =>
      key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`),
  );

test("the version rule matches Expo's: exact, ~ and ^", () => {
  assert.ok(within("0.88.1", "0.88.1"));
  assert.ok(!within("0.88.0", "0.88.1"));
  assert.ok(within("58.0.30", "~58.0.23"));
  assert.ok(!within("58.0.22", "~58.0.23"));
  assert.ok(!within("58.1.0", "~58.0.23"));
  assert.ok(within("15.1.1", "^15.0.2"));
  assert.ok(!within("16.0.0", "^15.0.2"));
  assert.ok(!within("15.0.1", "^15.0.2"));
  assert.ok(within("0.5.9", "^0.5.2"));
  assert.ok(!within("0.6.0", "^0.5.2"));
  assert.throws(() => within("1.0.0-rc.1", "^1.0.0"), /Not a plain version/);
});

test("Expo itself: SDK 58, the same version in the lockfile and installed", () => {
  assert.match(declared.expo!, /^~58\.0\.\d+$/);
  const locked = lock.packages["node_modules/expo"]?.version;
  assert.equal(json("node_modules/expo/package.json").version, locked);
  assert.ok(within(locked!, declared.expo!));
});

test("every Expo-managed package Forge uses is at SDK 58's own version", () => {
  // react-native, the Expo modules, safe-area, screens, jest-expo…
  assert.ok(managed.length >= 30, `${managed.length} managed packages`);
  for (const name of ["react-native", "react", "jest-expo"])
    assert.ok(managed.includes(name), name);
  for (const name of managed) {
    const pin = sdk[name]!;
    const range = declared[name]!;
    // package.json asks for SDK 58's version, or a narrower range within it
    // (`npx expo install` keeps a newer compatible one, such as ^15.1.0).
    assert.match(range, /^[~^]?\d+\.\d+\.\d+$/, name);
    assert.ok(
      range === pin ||
        (WIDTH[operator(range)] <= WIDTH[operator(pin)] &&
          within(range.slice(operator(range).length), pin)),
      `${name}: package.json ${range}, SDK 58 ${pin}`,
    );
    const locked = lock.packages[`node_modules/${name}`]?.version;
    assert.ok(locked, `${name} is in the lockfile`);
    assert.ok(within(locked, pin), `${name}: locked ${locked}, SDK 58 ${pin}`);
  }
});

test("one copy of each: no second React Native or Expo module", () => {
  for (const name of [...managed, "expo", "expo-modules-core", "react-native"])
    assert.equal(copies(name).length, 1, `${name}: ${copies(name).join(", ")}`);
});
