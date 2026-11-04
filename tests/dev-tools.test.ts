import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BUNDLED_IN_DEVELOPMENT,
  EXPO_ENV_FILES,
  checkDevProject,
  devClientEnv,
  isSecretKey,
  parseEnvFile,
  readEnvFiles,
} from "../scripts/dev/env-files";
import {
  REFUSED_REDIRECTS,
  jwtClaims,
  redirectAccepted,
  schemaState,
} from "../scripts/dev/probes";
import { readOptions, throwawayEmail } from "../scripts/dev/verify-stage3";

// Phase 8: the development tooling. FORGE Dev's Metro only ever gets the
// development project's settings, and every script refuses anything that
// isn't clearly that project. No network here.

const DEV = "devprojectrefaaaaaaa";
const PROD = "prodprojectrefbbbbbb";
const jwt = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const devFile = {
  EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_devkey",
  EXPO_PUBLIC_FORGE_ENV: "development",
  EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV,
};
const today = {
  EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prodkey",
};

test("env files: values, comments, export, quotes, CRLF; nothing else", () => {
  assert.deepEqual(
    parseEnvFile(
      [
        "# the development project",
        "EXPO_PUBLIC_A=one",
        "export EXPO_PUBLIC_B = two ",
        'EXPO_PUBLIC_C="three # kept"',
        "EXPO_PUBLIC_D='four'",
        "EXPO_PUBLIC_E=five # dropped",
        "EXPO_PUBLIC_F=",
        "1BAD=x",
        "no equals sign",
        "=nothing",
      ].join("\r\n"),
    ),
    {
      EXPO_PUBLIC_A: "one",
      EXPO_PUBLIC_B: "two",
      EXPO_PUBLIC_C: "three # kept",
      EXPO_PUBLIC_D: "four",
      EXPO_PUBLIC_E: "five",
      EXPO_PUBLIC_F: "",
    },
  );
});

test("secret keys are recognized and never accepted for an app", () => {
  assert.equal(isSecretKey("sb_secret_abc"), true);
  assert.equal(isSecretKey(jwt({ role: "service_role" })), true);
  for (const key of [
    "sb_publishable_abc",
    jwt({ role: "anon" }),
    "not.a.jwt!",
    "",
    "a.b",
  ])
    assert.equal(isSecretKey(key), false, key);
  const check = checkDevProject({
    ...devFile,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc",
  });
  assert.equal(check.ok, false);
});

test("the development file must be complete, development, its own project, and no Expo settings file's", () => {
  assert.deepEqual(checkDevProject(devFile, { ".env": today }), {
    ok: true,
    url: `https://${DEV}.supabase.co`,
    key: "sb_publishable_devkey",
    ref: DEV,
  });
  const sameAsDev = { EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co` };
  const refused: [
    Record<string, string>,
    Record<string, Record<string, string>>?,
  ][] = [
    [{}],
    [{ ...devFile, EXPO_PUBLIC_FORGE_ENV: "" }],
    [{ ...devFile, EXPO_PUBLIC_FORGE_ENV: "production" }],
    [{ ...devFile, EXPO_PUBLIC_SUPABASE_PROJECT_REF: PROD }],
    [{ ...devFile, EXPO_PUBLIC_SUPABASE_URL: `http://${DEV}.supabase.co` }],
    [
      {
        ...devFile,
        EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co.evil.co`,
      },
    ],
    // The same project as one of Expo's own settings files, by address or ref.
    [devFile, { ".env": sameAsDev }],
    [devFile, { ".env": { ...today, EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV } }],
    [
      devFile,
      {
        ".env": {
          EXPO_PUBLIC_SUPABASE_URL: `https://${DEV.toUpperCase()}.SUPABASE.CO`,
        },
      },
    ],
    [devFile, { ".env": today, ".env.local": sameAsDev }],
    [devFile, { ".env.production": { EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV } }],
  ];
  for (const [dev, others] of refused) {
    const check = checkDevProject(dev, others);
    assert.equal(check.ok, false, JSON.stringify([dev, others]));
    if (!check.ok)
      for (const problem of check.problems)
        for (const value of [DEV, PROD, "devkey", "prodkey", "evil"])
          assert.ok(!problem.includes(value), problem);
  }
  const named = checkDevProject(devFile, {
    ".env.development.local": sameAsDev,
  });
  assert.ok(
    !named.ok &&
      named.problems.some((p) => p.includes(".env.development.local")),
  );
});

test("every Expo settings file is compared; the development set is never bundled", () => {
  assert.deepEqual([...EXPO_ENV_FILES].sort(), [
    ".env",
    ".env.development",
    ".env.development.local",
    ".env.local",
    ".env.production",
    ".env.production.local",
  ]);
  assert.deepEqual(
    [...BUNDLED_IN_DEVELOPMENT],
    [".env.local", ".env.development", ".env.development.local"],
  );
  const files: Record<string, string> = {
    "/p/.env": "EXPO_PUBLIC_A=1",
    "/p/.env.local": "EXPO_PUBLIC_B=2",
  };
  assert.deepEqual(
    readEnvFiles("/p", EXPO_ENV_FILES, (f) => files[f]),
    { ".env": { EXPO_PUBLIC_A: "1" }, ".env.local": { EXPO_PUBLIC_B: "2" } },
  );
});

test("FORGE Dev's Metro gets only the development project, its variant, and no .env", () => {
  const base = {
    PATH: "/usr/bin",
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    EXPO_PUBLIC_SUPPORT_EMAIL: "kept-out@example.com",
    APP_VARIANT: "production",
  };
  const env = devClientEnv(base, devFile);
  assert.deepEqual(env, {
    PATH: "/usr/bin",
    ...devFile,
    APP_VARIANT: "development",
    EXPO_NO_DOTENV: "1",
  });
  assert.equal(base.APP_VARIANT, "production");
});

test("probes: the schema from anon's answer; a return address from Auth's redirect", () => {
  // Refused tells only that anon can't read: on a project created since
  // Supabase's 2026 change, the baseline is refused too.
  assert.equal(schemaState(null), "open");
  assert.equal(schemaState({ code: "42501" }), "closed");
  assert.equal(schemaState({ code: "PGRST205" }), "missing");
  assert.equal(schemaState({ code: "42P01" }), "missing");
  assert.equal(schemaState({ code: "PGRST301" }), "unknown");
  const location = (referrer: unknown) =>
    `https://accounts.google.com/o/oauth2/auth?client_id=x&state=${jwt({ referrer })}`;
  assert.equal(
    redirectAccepted(location("forge-dev:///welcome"), "forge-dev:///welcome"),
    true,
  );
  assert.equal(
    redirectAccepted(location("http://localhost:3000"), "forge-dev:///welcome"),
    false,
  );
  for (const answer of [
    null,
    "",
    "not a url",
    "https://accounts.google.com/o/oauth2/auth",
    "https://accounts.google.com/?state=garbage",
    location(42),
  ])
    assert.equal(redirectAccepted(answer, "forge-dev:///welcome"), undefined);
  assert.deepEqual(jwtClaims(jwt({ a: 1 })), { a: 1 });
  assert.equal(jwtClaims(jwt([1])), undefined);
  // The production app's scheme is among the addresses dev must refuse.
  assert.ok(REFUSED_REDIRECTS.some((url) => url.startsWith("forge:///")));
});

test("the destructive check needs an explicit project and mailbox; its accounts are throwaway aliases", () => {
  assert.deepEqual(
    readOptions(["--confirm", DEV, "--email", "me@example.com", "--stale"]),
    { confirm: DEV, email: "me@example.com", stale: true },
  );
  for (const argv of [
    [],
    ["--email", "me@example.com"],
    ["--confirm", "--email", "me@example.com"],
    ["--confirm", DEV],
    ["--confirm", DEV, "--email", "not-an-address"],
  ])
    assert.ok("problem" in readOptions(argv), argv.join(" "));
  assert.equal(
    throwawayEmail("me+forge@example.com", "run1", "a"),
    "me+forgeverifyrun1a@example.com",
  );
});

test("the FORGE Dev launcher refuses before Metro starts", () => {
  const launcher = path.resolve("scripts/dev/start-dev-client.ts");
  const tsx = require.resolve("tsx/cli");
  const cases: [string, Record<string, Record<string, string>>][] = [
    ["no development file", { ".env": today }],
    [
      "production named",
      {
        ".env.forge-dev": { ...devFile, EXPO_PUBLIC_FORGE_ENV: "production" },
        ".env": today,
      },
    ],
    [
      "the same project as .env",
      {
        ".env.forge-dev": devFile,
        ".env": { EXPO_PUBLIC_SUPABASE_URL: devFile.EXPO_PUBLIC_SUPABASE_URL },
      },
    ],
    [
      "the same project as .env.production",
      {
        ".env.forge-dev": devFile,
        ".env.production": { EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV },
      },
    ],
    [
      "incomplete",
      {
        ".env.forge-dev": {
          EXPO_PUBLIC_SUPABASE_URL: devFile.EXPO_PUBLIC_SUPABASE_URL,
        },
      },
    ],
    // A file Expo would bundle into FORGE Dev, whatever it holds.
    ...BUNDLED_IN_DEVELOPMENT.map(
      (file): [string, Record<string, Record<string, string>>] => [
        file,
        {
          ".env.forge-dev": devFile,
          ".env": today,
          [file]: { EXPO_PUBLIC_SUPPORT_EMAIL: "x@example.com" },
        },
      ],
    ),
  ];
  for (const [name, files] of cases) {
    const dir = mkdtempSync(path.join(tmpdir(), "forge-launcher-"));
    try {
      for (const [file, vars] of Object.entries(files))
        writeFileSync(
          path.join(dir, file),
          Object.entries(vars)
            .map(([k, v]) => `${k}=${v}`)
            .join("\n"),
        );
      const result = spawnSync(process.execPath, [tsx, launcher], {
        cwd: dir,
        encoding: "utf8",
        timeout: 60000,
      });
      assert.equal(result.status, 1, name);
      assert.doesNotMatch(result.stdout, /FORGE Dev →/, name);
      if ((BUNDLED_IN_DEVELOPMENT as readonly string[]).includes(name))
        assert.ok(result.stderr.includes(`move ${name}`), name);
      for (const value of [DEV, PROD, "devkey", "prodkey", "x@example.com"])
        assert.ok(!result.stderr.includes(value), `${name}: ${value}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
