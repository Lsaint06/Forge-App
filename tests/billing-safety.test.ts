import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Membership's guarantees that hold by construction, checked in the source
// (Phases 9.1 and 9.3):
// - its pure modules import only each other; runtime.ts alone reaches React
//   Native, Expo, the Supabase client and RevenueCat's SDK;
// - nothing of it can reach the athlete's training data;
// - the access decision can't see what the store says;
// - the app reaches it only through a few named screens, each behind
//   membershipEnabled(), and no route is gated by it yet (Phase 9.4);
// - exactly one purchase SDK, pinned, loaded in one place; no key or secret
//   is written anywhere.

const root = join(__dirname, "..");
const BILLING = join(root, "src", "billing");
const SCREENS = join(root, "src", "screens", "membership");
const FUNCTIONS = join(root, "supabase", "functions");
const SERVER = join(FUNCTIONS, "_shared", "entitlement.ts");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? sources(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : [];
  });
}

const IMPORT =
  /(?:import|export)\s[^;]*?\bfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;
const imports = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(IMPORT)].map(
    (m) => m[1] ?? m[2] ?? m[3]!,
  );
const name = (file: string) => relative(root, file).replaceAll("\\", "/");

/** Membership's pure modules: tested in Node, no app or SDK. */
const PURE = [
  "access",
  "cache",
  "config",
  "entitlement",
  "offer",
  "paywall",
  "plan",
  "provider",
  "revenuecat",
  "service",
  "verifier",
];

test("membership's pure modules import only each other; runtime.ts alone reaches the app and the SDK", () => {
  const files = sources(BILLING);
  assert.deepEqual(
    files.map(name).sort(),
    [
      ...PURE.map((f) => `src/billing/${f}.ts`),
      "src/billing/runtime.ts",
      "src/billing/secure-cache.ts",
    ].sort(),
  );
  const sibling = new RegExp(`^\\./(${PURE.join("|")})$`);
  for (const file of files)
    for (const spec of imports(file)) {
      const n = name(file);
      const allowed =
        sibling.test(spec) ||
        (n === "src/billing/secure-cache.ts" &&
          spec === "../platform/sessionStorage") ||
        (n === "src/billing/runtime.ts" &&
          [
            "./secure-cache",
            "react-native",
            "expo",
            "react-native-purchases",
            "../cloud/client",
          ].includes(spec));
      assert.ok(allowed, `${n} imports ${spec}`);
    }
});

test("membership code can't reach anything that changes training data", () => {
  const destructive =
    /\b(clearData|importBackup\w*|deleteWorkout|discardWorkout|finishWorkout|endProgram|enrollProgram|signOut|setSetting|clearSetting|outbox|synchronize|forge_write|forge_delete_account|Repository|useRepo)\b/;
  for (const file of [...sources(BILLING), ...sources(SCREENS)])
    assert.doesNotMatch(readFileSync(file, "utf8"), destructive, name(file));
});

test("the access decision can't see the store's answers", () => {
  assert.deepEqual(imports(join(BILLING, "access.ts")), ["./entitlement"]);
  assert.deepEqual(imports(join(BILLING, "entitlement.ts")), []);
  // The cache keeps only server answers: it knows nothing of the store.
  assert.deepEqual(imports(join(BILLING, "cache.ts")), ["./entitlement"]);
});

test("the app reaches membership only through its screens, each behind membershipEnabled(), and gates no route", () => {
  const app = [
    ...sources(join(root, "app")),
    ...sources(join(root, "src")).filter((f) => !f.startsWith(BILLING)),
  ];
  const users = app.filter((file) =>
    imports(file).some((spec) => /(^|\/)billing(\/|$)/.test(spec)),
  );
  assert.deepEqual(users.map(name).sort(), [
    "src/screens/entry/Setup.tsx",
    "src/screens/membership/MembershipScreen.tsx",
    "src/screens/membership/Paywall.tsx",
    "src/screens/membership/Premium.tsx",
    "src/screens/membership/Preview.tsx",
    "src/screens/membership/StatusCard.tsx",
    "src/screens/membership/usePaywall.ts",
    "src/screens/you/account.tsx",
  ]);
  // Where the athlete's own journey reaches it: only while enabled.
  for (const file of [
    "src/screens/entry/Setup.tsx",
    "src/screens/you/account.tsx",
    "src/screens/membership/MembershipScreen.tsx",
  ])
    assert.match(
      readFileSync(join(root, file), "utf8"),
      /membershipEnabled\(\)/,
      file,
    );
  // The development preview shows a stand-in, and Forge Premium's
  // composition only draws what it's handed: never the store or the server.
  for (const file of ["Preview.tsx", "Premium.tsx"])
    assert.doesNotMatch(
      readFileSync(join(SCREENS, file), "utf8"),
      /membershipDeps|usePaywall|FromPaywall\(|verify\(/,
      file,
    );
  // No gate yet: what may be shown never depends on membership (Phase 9.4).
  for (const file of [
    "src/auth/entry.ts",
    "src/auth/AppStack.tsx",
    "app/_layout.tsx",
  ])
    assert.ok(
      !imports(join(root, file)).some((s) => /billing|membership/.test(s)),
      file,
    );
  // Nor does the app reach the server's code.
  assert.deepEqual(
    app
      .filter((f) => /supabase\/functions/.test(readFileSync(f, "utf8")))
      .map(name),
    [],
  );
});

test("one purchase SDK, pinned exactly and loaded only by runtime.ts (Phase 9.3)", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  // RevenueCat's 10.x: 11.x's iOS pod couldn't be installed yet
  // (docs/SUBSCRIPTIONS.md). Forge's own paywall: no RevenueCat UI.
  assert.equal(all["react-native-purchases"], "10.16.0");
  for (const sdk of [
    "react-native-purchases-ui",
    "expo-iap",
    "react-native-iap",
  ])
    assert.equal(all[sdk], undefined, sdk);
  const lock = JSON.parse(
    readFileSync(join(root, "package-lock.json"), "utf8"),
  ) as {
    packages: Record<string, { version?: string }>;
  };
  assert.equal(
    lock.packages["node_modules/react-native-purchases"]?.version,
    "10.16.0",
  );
  const loaders = [...sources(join(root, "app")), ...sources(join(root, "src"))]
    .filter((f) => imports(f).includes("react-native-purchases"))
    .map(name);
  assert.deepEqual(loaders, ["src/billing/runtime.ts"]);
});

test("the server's shared modules stand alone and are handed their secrets", () => {
  const shared = sources(join(FUNCTIONS, "_shared"));
  assert.ok(shared.includes(SERVER));
  for (const file of shared) {
    const local = imports(file).every((spec) => /^\.\/[\w-]+\.ts$/.test(spec));
    assert.ok(local, `${name(file)} imports only its siblings`);
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /\b(Deno\.env|process\.env)\b/,
      name(file),
    );
  }
});

test("no key or secret is written into membership code", () => {
  const drafts = join(root, "supabase", "drafts");
  const files = [
    ...sources(BILLING),
    ...sources(SCREENS),
    ...sources(FUNCTIONS),
    ...readdirSync(drafts).map((f) => join(drafts, f)),
    ...[".env.example", ".env.forge-dev.example"]
      .map((f) => join(root, f))
      .filter((f) => existsSync(f)),
  ];
  // RevenueCat's secret (sk_), public SDK (appl_, goog_, rcb_) and Test Store
  // (test_) keys, and JWTs.
  const secret =
    /\b(sk_|appl_|goog_|rcb_|test_)[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}\./;
  for (const file of files)
    assert.doesNotMatch(readFileSync(file, "utf8"), secret, name(file));
});
