import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_ENVIRONMENTS,
  APP_SCHEMES,
  checkEnvironment,
} from "../src/cloud/environment";

// Phase 7.8E, Stage 5 (E6): each build may use only its own Supabase
// project, once development and production are separate. Prepared: no
// build sets these variables yet, so today's behavior must not change.

const DEV = "devprojectrefaaaaaaa";
const PROD = "prodprojectrefbbbbbb";
const at = (ref: string) => `https://${ref}.supabase.co`;

test("a build that names no environment and no project is unchanged", () => {
  assert.deepEqual(checkEnvironment({ url: at(PROD) }), { ok: true });
  assert.deepEqual(checkEnvironment({}), { ok: true });
  // Empty or blank values, as an .env copied from .env.example leaves them.
  assert.deepEqual(
    checkEnvironment({ name: "", projectRef: "  ", url: at(PROD) }),
    { ok: true },
  );
});

test("a named environment connects only to its own project", () => {
  assert.deepEqual(
    checkEnvironment({ name: "development", projectRef: DEV, url: at(DEV) }),
    { ok: true, environment: "development" },
  );
  assert.deepEqual(
    checkEnvironment({
      name: " production ",
      projectRef: PROD,
      url: `${at(PROD)}/`,
    }),
    { ok: true, environment: "production" },
  );
  // A development build pointed at production, and the reverse.
  for (const [name, ref, url] of [
    ["development", DEV, at(PROD)],
    ["production", PROD, at(DEV)],
  ]) {
    const check = checkEnvironment({ name, projectRef: ref, url });
    assert.equal(check.ok, false, `${name} → ${url}`);
  }
});

test("anything unclear refuses to connect; problems never carry values", () => {
  const refused = [
    // Unknown names, including near misses.
    { name: "prod", projectRef: PROD, url: at(PROD) },
    { name: "Production", projectRef: PROD, url: at(PROD) },
    { name: "staging", projectRef: PROD, url: at(PROD) },
    // A name with no project to check against.
    { name: "production", url: at(PROD) },
    // A pinned project, alone, is still checked.
    { projectRef: PROD, url: at(DEV) },
    // Addresses that merely contain the project's name.
    { name: "production", projectRef: PROD, url: `https://${PROD}.evil.co` },
    {
      name: "production",
      projectRef: PROD,
      url: `https://${PROD}.supabase.co.evil.co`,
    },
    {
      name: "production",
      projectRef: PROD,
      url: `https://x.${PROD}.supabase.co`,
    },
    {
      name: "production",
      projectRef: PROD,
      url: `https://evil.co/${PROD}.supabase.co`,
    },
    {
      name: "production",
      projectRef: PROD,
      url: `https://${PROD}.supabase.co@evil.co`,
    },
    // Not an address at all.
    { name: "production", projectRef: PROD, url: "not an address" },
    { name: "production", projectRef: PROD },
  ];
  for (const env of refused) {
    const check = checkEnvironment(env);
    assert.equal(check.ok, false, JSON.stringify(env));
    if (!check.ok) {
      assert.ok(!check.problem.includes(PROD), check.problem);
      assert.ok(!check.problem.includes("evil"), check.problem);
    }
  }
  assert.deepEqual(checkEnvironment({ projectRef: PROD, url: at(PROD) }), {
    ok: true,
  });
});

// ---- Phase 8: Forge's own builds, by their native application ID ----

const DEV_APP = {
  expoGo: false,
  appId: "com.lsaint06.forge.dev",
  scheme: "forge-dev",
};
const PROD_APP = {
  expoGo: false,
  appId: "com.lsaint06.forge",
  scheme: "forge",
};
const PREVIEW_APP = {
  expoGo: false,
  appId: "com.lsaint06.forge.preview",
  scheme: "forge-preview",
};
const todayEnv = { url: at(PROD) };
const devEnv = { name: "development", projectRef: DEV, url: at(DEV) };
const prodEnv = { name: "production", projectRef: PROD, url: at(PROD) };

test("Expo Go, tests and scripts keep today's behavior", () => {
  for (const app of [
    { expoGo: true, appId: "host.exp.Exponent", scheme: "exp" },
    { expoGo: true, appId: "host.exp.exponent" },
    // Expo Go is recognized by how it runs, whatever ID it reports.
    { expoGo: true, appId: "com.lsaint06.forge.dev", scheme: "forge" },
    // No app at all.
    {},
    { expoGo: false, appId: null },
    { expoGo: false, appId: "  " },
  ]) {
    assert.deepEqual(checkEnvironment({ ...todayEnv, ...app }), { ok: true });
    assert.deepEqual(checkEnvironment({ ...devEnv, ...app }), {
      ok: true,
      environment: "development",
    });
  }
});

test("FORGE Dev never connects with today's settings, or to production", () => {
  for (const env of [
    // Today's .env: production, nothing named.
    todayEnv,
    {},
    // Named, but production.
    prodEnv,
    // Development named, but no project, or another project's address.
    { name: "development", url: at(DEV) },
    { name: "development", projectRef: DEV, url: at(PROD) },
    { name: " ", projectRef: DEV, url: at(DEV) },
  ]) {
    const check = checkEnvironment({ ...env, ...DEV_APP });
    assert.equal(check.ok, false, JSON.stringify(env));
  }
  assert.deepEqual(checkEnvironment({ ...devEnv, ...DEV_APP }), {
    ok: true,
    environment: "development",
  });
});

test("each app needs JavaScript built for it: its own link scheme", () => {
  for (const [app, env] of [
    [DEV_APP, devEnv],
    [PROD_APP, prodEnv],
    [PREVIEW_APP, devEnv],
  ] as const)
    for (const scheme of [
      undefined,
      "",
      "forge",
      "forge-dev",
      "forge-preview",
      "exp",
    ]) {
      const check = checkEnvironment({ ...env, ...app, scheme });
      assert.equal(check.ok, scheme === app.scheme, `${app.appId} ${scheme}`);
    }
});

test("the production app uses only production", () => {
  for (const env of [todayEnv, devEnv, { ...prodEnv, name: "Production" }])
    assert.equal(checkEnvironment({ ...env, ...PROD_APP }).ok, false);
  assert.deepEqual(checkEnvironment({ ...prodEnv, ...PROD_APP }), {
    ok: true,
    environment: "production",
  });
});

test("FORGE Preview uses only FORGE DEV, never production (Phase 8.4B)", () => {
  for (const env of [
    todayEnv,
    {},
    prodEnv,
    // Named development, but production's address.
    { name: "development", projectRef: DEV, url: at(PROD) },
    { ...devEnv, name: "Development" },
  ]) {
    const check = checkEnvironment({ ...env, ...PREVIEW_APP });
    assert.equal(check.ok, false, JSON.stringify(env));
  }
  // Which project is FORGE DEV's is pinned at build time instead (the
  // release check's project fingerprints, tests/release-check.test.ts).
  const refused = checkEnvironment({ ...prodEnv, ...PREVIEW_APP });
  assert.deepEqual(refused, {
    ok: false,
    problem:
      "The preview app can only use the development environment (EXPO_PUBLIC_FORGE_ENV)",
  });
  assert.deepEqual(checkEnvironment({ ...devEnv, ...PREVIEW_APP }), {
    ok: true,
    environment: "development",
  });
});

test("every app has exactly one environment, and only Forge's apps have one", () => {
  assert.deepEqual(APP_ENVIRONMENTS, {
    production: "production",
    development: "development",
    preview: "development",
  });
  assert.deepEqual(
    Object.keys(APP_ENVIRONMENTS).sort(),
    Object.keys(APP_SCHEMES).sort(),
  );
});

test("an app that isn't one of Forge's builds never connects; problems carry no values", () => {
  for (const appId of [
    "com.lsaint06.forge.staging",
    "com.example.forge",
    "constructor",
    "__proto__",
    "toString",
  ]) {
    for (const [env, scheme] of [todayEnv, devEnv, prodEnv].flatMap((env) =>
      [undefined, "", "forge", "forge-dev"].map(
        (scheme) => [env, scheme] as const,
      ),
    )) {
      const check = checkEnvironment({ ...env, expoGo: false, appId, scheme });
      assert.equal(check.ok, false, appId);
      if (!check.ok)
        for (const value of [PROD, DEV, "supabase.co"])
          assert.ok(!check.problem.includes(value), check.problem);
    }
  }
});
