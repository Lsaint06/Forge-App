import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Phase 9.1 guarantees that hold by construction, checked in the source:
// membership code can't reach the athlete's training data, the access
// decision can't see what the store says, nothing in the app uses any of it
// yet (no gate, no paywall), and no purchase SDK or secret has arrived.

const root = join(__dirname, "..");
const BILLING = join(root, "src", "billing");
const SERVER = join(root, "supabase", "functions", "_shared", "entitlement.ts");

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

test("membership code imports only membership code (and the secure store)", () => {
  const files = sources(BILLING);
  assert.deepEqual(files.map(name).sort(), [
    "src/billing/access.ts",
    "src/billing/cache.ts",
    "src/billing/entitlement.ts",
    "src/billing/plan.ts",
    "src/billing/provider.ts",
    "src/billing/secure-cache.ts",
    "src/billing/service.ts",
  ]);
  for (const file of files)
    for (const spec of imports(file)) {
      const allowed =
        /^\.\/(access|cache|entitlement|plan|provider|service)$/.test(spec) ||
        (name(file) === "src/billing/secure-cache.ts" &&
          spec === "../platform/sessionStorage");
      assert.ok(allowed, `${name(file)} imports ${spec}`);
    }
});

test("membership code can't reach anything that changes training data", () => {
  const destructive =
    /\b(clearData|importBackup\w*|deleteWorkout|discardWorkout|finishWorkout|endProgram|enrollProgram|signOut|setSetting|clearSetting|outbox|synchronize|forge_write|forge_delete_account|Repository)\b/;
  for (const file of sources(BILLING))
    assert.doesNotMatch(readFileSync(file, "utf8"), destructive, name(file));
});

test("the access decision can't see the store's answers", () => {
  assert.deepEqual(imports(join(BILLING, "access.ts")), ["./entitlement"]);
  assert.deepEqual(imports(join(BILLING, "entitlement.ts")), []);
  // The cache keeps only server answers: it knows nothing of the store.
  assert.deepEqual(imports(join(BILLING, "cache.ts")), ["./entitlement"]);
});

test("Phase 9.1 changes nothing the athlete sees: no gate, no paywall yet", () => {
  const app = [
    ...sources(join(root, "app")),
    ...sources(join(root, "src")).filter((f) => !f.startsWith(BILLING)),
  ];
  const users = app.filter((file) =>
    imports(file).some((spec) => /(^|\/)billing(\/|$)/.test(spec)),
  );
  assert.deepEqual(users.map(name), []);
  // Nor does any of it reach the server module.
  assert.deepEqual(
    app
      .filter((f) => /supabase\/functions/.test(readFileSync(f, "utf8")))
      .map(name),
    [],
  );
});

test("no purchase SDK or native dependency arrives in Phase 9.1", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const sdk of [
    "react-native-purchases",
    "react-native-purchases-ui",
    "expo-iap",
    "react-native-iap",
  ])
    assert.equal(all[sdk], undefined, sdk);
});

test("the server module stands alone and is handed its secrets", () => {
  const source = readFileSync(SERVER, "utf8");
  assert.deepEqual(imports(SERVER), []);
  assert.doesNotMatch(source, /\b(Deno\.env|process\.env)\b/);
});

test("no key or secret is written into membership code", () => {
  const files = [
    ...sources(BILLING),
    SERVER,
    ...readdirSync(join(root, "supabase", "drafts")).map((f) =>
      join(root, "supabase", "drafts", f),
    ),
  ];
  // RevenueCat's secret (sk_) and public SDK (appl_, goog_) keys, JWTs.
  const secret =
    /\b(sk_|appl_|goog_|rcb_)[A-Za-z0-9]{8,}|eyJ[A-Za-z0-9_-]{20,}\./;
  for (const file of files)
    assert.doesNotMatch(readFileSync(file, "utf8"), secret, name(file));
});
