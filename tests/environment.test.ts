import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEnvironment } from "../src/cloud/environment";

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
