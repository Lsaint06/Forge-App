import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  ARBITRARY_SITE,
  DEV_REDIRECTS,
  REFUSED_REDIRECTS,
  TUNNEL_EXAMPLE,
  authSettingsResults,
  checkReturnAddresses,
  landedOn,
  schemaState,
  unmatchedVerifyPath,
  type Landing,
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

test("probes: the schema from anon's answer; where Auth sends an unmatched email link", () => {
  // Refused tells only that anon can't read: on a project created since
  // Supabase's 2026 change, the baseline is refused too.
  assert.equal(schemaState(null), "open");
  assert.equal(schemaState({ code: "42501" }), "closed");
  assert.equal(schemaState({ code: "PGRST205" }), "missing");
  assert.equal(schemaState({ code: "42P01" }), "missing");
  assert.equal(schemaState({ code: "PGRST301" }), "unknown");
  // A verification with a random token: Auth's GET link endpoint, nothing else.
  assert.equal(
    unmatchedVerifyPath("forge-dev:///welcome", "abc123"),
    "/auth/v1/verify?type=signup&token=abc123&redirect_to=forge-dev%3A%2F%2F%2Fwelcome",
  );
  const to = "forge-dev:///welcome";
  assert.equal(
    landedOn({ status: 303, location: `${to}#error=access_denied` }, to),
    true,
  );
  assert.equal(landedOn({ status: 303, location: `${to}?x=1` }, to), true);
  assert.equal(
    landedOn({ status: 303, location: "http://localhost:3000#error=x" }, to),
    false,
  );
  // A longer address that merely starts the same way is a different one.
  assert.equal(
    landedOn({ status: 303, location: "forge-dev:///welcome-other" }, to),
    false,
  );
  for (const answer of [
    { status: 200 },
    { status: 429 },
    { status: 500, location: to },
    { status: 303 },
    { status: 303, location: "" },
  ])
    assert.equal(landedOn(answer, to), undefined, JSON.stringify(answer));
  // The production app's scheme is among the addresses dev must refuse.
  assert.ok(REFUSED_REDIRECTS.some((r) => r.to.startsWith("forge:///")));
});

/**
 * Supabase Auth's redirect rule for a link it can't match: the requested
 * address when its host is the Site URL's or an allow-list entry matches it,
 * otherwise the Site URL. Entries ending in `**` match by prefix here.
 */
function fakeAuth(o: {
  site?: string;
  allow?: readonly string[];
  status?: number;
  /** Auth changed: every answer goes to the Site URL. */
  alwaysSite?: boolean;
}) {
  const site = o.site ?? "http://localhost:3000";
  const allow = o.allow ?? DEV_REDIRECTS;
  const calls: string[] = [];
  const host = (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return undefined;
    }
  };
  const valid = (to: string) =>
    (!!host(to) && host(to) === host(site)) ||
    allow.some((entry) =>
      entry.endsWith("**") ? to.startsWith(entry.slice(0, -2)) : entry === to,
    );
  const probe = async (to: string): Promise<Landing> => {
    calls.push(to);
    if (o.status) return { status: o.status };
    const target = !o.alwaysSite && valid(to) ? to : site;
    return {
      status: 303,
      location: `${target}#error=access_denied&error_code=otp_expired`,
    };
  };
  return { probe, calls };
}
const failed = (results: [boolean | undefined, string][]) =>
  results.filter(([ok]) => ok === false).map(([, text]) => text);
const passed = (results: [boolean | undefined, string][]) =>
  results.filter(([ok]) => ok === true).length;

test("return addresses: the development project's list passes, read without Google", async () => {
  const auth = fakeAuth({});
  const results = await checkReturnAddresses(auth.probe);
  assert.deepEqual(failed(results), []);
  // 3 allowed, 6 refused, and any website refused.
  assert.equal(passed(results), 10);
  assert.ok(
    results.some(
      ([ok, t]) => ok === undefined && /localhost, Supabase's default/.test(t),
    ),
  );
  assert.ok(
    results.some(([, t]) => t === "Expo Go tunnel entry (optional): absent"),
  );
  // Two controls, 3 + 6 addresses, the tunnel: nothing else is asked.
  assert.equal(auth.calls.length, 12);
  assert.equal(auth.calls[0], ARBITRARY_SITE);
  assert.equal(auth.calls[1], "http://localhost:3000/forge-probe");
});

test("return addresses: a missing entry, the production scheme and broad patterns fail", async () => {
  const missing = await checkReturnAddresses(
    fakeAuth({ allow: DEV_REDIRECTS.slice(0, 2) }).probe,
  );
  assert.deepEqual(failed(missing), [
    "Return address allowed: forge-dev:///account",
  ]);
  const broad = await checkReturnAddresses(
    fakeAuth({
      allow: [
        ...DEV_REDIRECTS,
        "forge:///welcome",
        "forge-dev://**",
        "exp://**",
      ],
    }).probe,
  );
  assert.deepEqual(
    failed(broad).map((t) => t.replace(/ \(.*$/, "")),
    [
      "Return address refused: forge:///welcome",
      "Return address refused: forge-dev:///elsewhere",
      "Return address refused: forge-dev://welcome",
      "Return address refused: exp://forge-probe.invalid/--/welcome",
    ],
  );
  const anything = await checkReturnAddresses(
    fakeAuth({ allow: [...DEV_REDIRECTS, "https://**"] }).probe,
  );
  assert.ok(failed(anything)[0]!.includes("any website"));
  const tunnel = await checkReturnAddresses(
    fakeAuth({ allow: [...DEV_REDIRECTS, TUNNEL_EXAMPLE] }).probe,
  );
  assert.deepEqual(failed(tunnel), []);
  assert.ok(
    tunnel.some(([, t]) => t === "Expo Go tunnel entry (optional): present"),
  );
  const https = await checkReturnAddresses(
    fakeAuth({ site: "https://forge.example/home" }).probe,
  );
  assert.ok(https.some(([, t]) => /\(an https page\)/.test(t)));
});

test("return addresses: when Auth doesn't answer as expected, nothing passes or fails", async () => {
  for (const [name, auth] of [
    ["rate-limited", fakeAuth({ status: 429 })],
    ["unavailable", fakeAuth({ status: 503 })],
    ["every answer to the Site URL", fakeAuth({ alwaysSite: true })],
  ] as const) {
    const results = await checkReturnAddresses(auth.probe);
    assert.equal(results.length, 1, name);
    assert.equal(results[0]![0], undefined, name);
    assert.match(results[0]![1], /^Return addresses not checked/, name);
    assert.ok(auth.calls.length <= 2, name);
  }
  const limited = await checkReturnAddresses(fakeAuth({ status: 429 }).probe);
  assert.match(limited[0]![1], /5 minutes/);
});

test("Auth settings: email sign-in and sign-ups are needed; Google is optional in development", () => {
  const forgeDev = { external: { email: true }, mailer_autoconfirm: true };
  const results = authSettingsResults(forgeDev);
  assert.deepEqual(failed(results), []);
  assert.deepEqual(results[2], [
    undefined,
    "Google sign-in not set up (optional: needed only to test Google in FORGE Dev)",
  ]);
  assert.deepEqual(
    authSettingsResults({ external: { email: true, google: true } })[2],
    [true, "Google sign-in enabled"],
  );
  assert.deepEqual(
    failed(
      authSettingsResults({ external: { email: false }, disable_signup: true }),
    ),
    ["Email sign-in enabled", "Sign-ups allowed"],
  );
  assert.equal(
    authSettingsResults({ external: { email: true } })[3]![1],
    "Email confirmation is ON (dev:verify-stage3 needs it off)",
  );
});

test("dev:check only reads: no sign-up, sign-in, write or administrative request", () => {
  const source = readFileSync("scripts/dev/check-project.ts", "utf8");
  for (const forbidden of [
    "signUp",
    "signIn",
    ".rpc(",
    ".insert(",
    ".update(",
    ".upsert(",
    ".delete(",
    "method:",
    "/signup",
    "/otp",
    "/recover",
    "/admin",
    "/token",
  ])
    assert.ok(!source.includes(forbidden), forbidden);
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
