import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Phase 9.2: every route is protected, and setup can't start anything.
// The route stack (src/auth/AppStack.tsx) is the one place Forge decides
// what may be shown; "every route file must be listed there; an unlisted
// route would be reachable unprotected" (REFORGE foundation). This holds it
// for every file in app/, including Phase 9.2's. Which entry state may open
// which route: tests/ui/route-protection.test.tsx.

const root = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
const name = (file: string) => relative(root, file).replaceAll("\\", "/");

/** Route names, as Expo Router names them, from the files in app/. */
function routeFiles() {
  return files(join(root, "app"))
    .map((f) =>
      relative(join(root, "app"), f)
        .replaceAll("\\", "/")
        .replace(/\.tsx?$/, ""),
    )
    .filter((r) => !/(^|\/)_layout$/.test(r) && r !== "+not-found");
}

/** Each Stack.Screen in AppStack and whether it sits in a Stack.Protected. */
function registered() {
  const source = readFileSync(join(root, "src/auth/AppStack.tsx"), "utf8");
  const tokens = [
    ...source.matchAll(
      /<Stack\.Protected\b|<\/Stack\.Protected>|<Stack\.Screen\s+name="([^"]+)"/g,
    ),
  ];
  let depth = 0;
  const screens: { name: string; protected: boolean }[] = [];
  for (const t of tokens) {
    if (t[0].startsWith("<Stack.Protected")) depth++;
    else if (t[0] === "</Stack.Protected>") depth--;
    else screens.push({ name: t[1]!, protected: depth > 0 });
  }
  assert.equal(depth, 0, "Stack.Protected blocks are balanced");
  return screens;
}

test("every route file is registered once in the route stack, inside a protected group", () => {
  const routes = routeFiles();
  const screens = registered();
  // The tabs are one group: each tab file is behind the "(tabs)" screen.
  const expected = [
    ...new Set(routes.map((r) => (r.startsWith("(tabs)/") ? "(tabs)" : r))),
  ].sort();
  assert.deepEqual(screens.map((s) => s.name).sort(), expected);
  assert.equal(new Set(screens.map((s) => s.name)).size, screens.length);
  for (const s of screens) assert.ok(s.protected, `${s.name} is unprotected`);
  // Phase 9.2's routes are among them.
  for (const r of ["onboarding", "welcome", "onboarding-preview"])
    assert.ok(routes.includes(r), r);
});

test("the tabs layout keeps its guard, so a stale tab can't show training", () => {
  const tabs = readFileSync(join(root, "app/(tabs)/_layout.tsx"), "utf8");
  assert.match(tabs, /<TabsGuard>/);
  assert.match(tabs, /<\/TabsGuard>/);
});

// ---- Setup starts nothing ------------------------------------------------------

const ONBOARDING = [
  ...files(join(root, "src/domain/onboarding")),
  ...files(join(root, "src/screens/onboarding")),
];
/** Source without comments, so prose about later phases doesn't count. */
const code = (file: string) =>
  readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const imports = (file: string) =>
  [...code(file).matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]!);

test("setup can't enroll, start or log training, or touch membership", () => {
  assert.ok(ONBOARDING.length >= 12, "the onboarding modules are scanned");
  const actions =
    "enrollProgram|startProgramSession|startWorkout|startPrescribedWorkout|addSet|editSet|finishWorkout|endProgram|clearData|importBackup\\w*|synchronize|deleteAccount";
  const called = new RegExp(`\\b(${actions})\\s*\\(`);
  const imported = new RegExp(`import\\s*\\{[^}]*\\b(${actions})\\b[^}]*\\}`);
  for (const file of ONBOARDING) {
    assert.doesNotMatch(code(file), called, name(file));
    assert.doesNotMatch(code(file), imported, name(file));
    for (const spec of imports(file))
      assert.doesNotMatch(
        spec,
        /billing|cloud\/|data\/programs/,
        `${name(file)} imports ${spec}`,
      );
  }
});

test("the reveal and the setup steps never navigate; only finishing setup does", () => {
  for (const file of ONBOARDING) {
    const navigates = imports(file).includes("expo-router");
    const allowed = [
      "src/screens/onboarding/store.ts",
      "src/screens/onboarding/Preview.tsx",
      // Home's card once setup is done (the ready state), never in setup.
      "src/screens/onboarding/Arrival.tsx",
    ];
    assert.equal(navigates, allowed.includes(name(file)), name(file));
  }
  // Finishing setup opens Forge; nothing else does.
  const store = code(join(root, "src/screens/onboarding/store.ts"));
  assert.deepEqual(
    [...store.matchAll(/router\.(\w+)\(("[^"]*")\)/g)].map(
      (m) => `${m[1]}(${m[2]})`,
    ),
    ['replace("/(tabs)")'],
  );
  assert.equal([...store.matchAll(/router\./g)].length, 1);
  // Home's card only opens the program's page in Forge Paths, and no setup
  // screen renders it.
  const arrival = code(join(root, "src/screens/onboarding/Arrival.tsx"));
  assert.deepEqual(
    [...arrival.matchAll(/router\.(\w+)\(/g)].map((m) => m[1]),
    ["push"],
  );
  assert.match(arrival, /pathname: "\/forge-paths\/\[programId\]"/);
  for (const file of ONBOARDING)
    assert.ok(
      !imports(file).some((spec) => /(^|\/)Arrival$/.test(spec)),
      `${name(file)} renders Home's card`,
    );
  assert.match(
    readFileSync(join(root, "src/screens/Home.tsx"), "utf8"),
    /<ForgePathArrival \/>/,
  );
});

test("Welcome, the account screen, is unchanged: the intro only comes before it", () => {
  const route = readFileSync(join(root, "app/welcome.tsx"), "utf8");
  assert.match(route, /screens\/onboarding\/WelcomeRoute/);
  const wrapper = code(join(root, "src/screens/onboarding/WelcomeRoute.tsx"));
  assert.match(wrapper, /return <Intro onAccount=\{leave\} \/>/);
  assert.match(wrapper, /<Welcome \/>/);
});
