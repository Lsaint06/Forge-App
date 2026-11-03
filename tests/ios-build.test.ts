import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  MIN_XCODE,
  iosBuildEnv,
  iosCommands,
  iosReadiness,
  parseIdentities,
  parseIosArgs,
  xcodeVersion,
  type IosBuildOptions,
} from "../scripts/dev/ios-build";

// Phase 8.1: `npm run dev:ios` builds FORGE Dev for the iPhone with Xcode.
// It never reads Expo's own .env files, never takes a value from the shell's
// EXPO_PUBLIC_ variables, and chooses the build configuration itself, so the
// JavaScript always matches the app it's built for. No Xcode needed here.

const DEV = "devprojectrefaaaaaaa";
const PROD = "prodprojectrefbbbbbb";

const options = (o: Partial<IosBuildOptions> = {}): IosBuildOptions => ({
  release: false,
  noCloud: false,
  paidTeam: false,
  check: false,
  rest: [],
  ...o,
});

test("flags: its own are read, Expo's pass through, the ones it sets are refused", () => {
  assert.deepEqual(parseIosArgs([]), { ok: true, options: options() });
  assert.deepEqual(
    parseIosArgs(["--release", "--no-cloud", "--device", "My iPhone"]),
    {
      ok: true,
      options: options({
        release: true,
        noCloud: true,
        rest: ["--device", "My iPhone"],
      }),
    },
  );
  assert.deepEqual(parseIosArgs(["--paid-team", "--check"]), {
    ok: true,
    options: options({ paidTeam: true, check: true }),
  });
  for (const arg of [
    "--configuration",
    "--configuration=Debug",
    "--no-bundler",
    "--bundler",
    "--binary=/tmp/FORGE.app",
  ]) {
    const parsed = parseIosArgs(["--release", arg, "Release"]);
    assert.equal(parsed.ok, false, arg);
    if (!parsed.ok) {
      assert.match(parsed.problem, /--release/, arg);
      assert.ok(!parsed.problem.includes("="), arg);
    }
  }
  // A Debug build's JavaScript comes from start:dev: --no-cloud can't apply.
  const noCloud = parseIosArgs(["--no-cloud"]);
  assert.equal(noCloud.ok, false);
  if (!noCloud.ok) assert.match(noCloud.problem, /start:dev/);
});

test("readiness: Xcode 26.4 or later, CocoaPods and an Apple Development certificate", () => {
  const ready = {
    platform: "darwin",
    xcode: "Xcode 27.0",
    cocoapods: "1.16.2",
    identities: ["Apple Development: athlete@example.com (ABCDE12345)"],
  };
  assert.ok(iosReadiness(ready).every((r) => r.ok));
  // This Mac on Nov 2, 2026: Command Line Tools only.
  const today = iosReadiness({ platform: "darwin", identities: [] });
  assert.deepEqual(
    today.map((r) => r.ok),
    [false, false, false],
  );
  assert.match(today[0]!.fix!, /App Store.*xcode-select -s/);
  assert.match(today[1]!.fix!, /brew install cocoapods/);
  assert.match(today[2]!.fix!, /Apple ID.*Apple Development/);
  for (const [xcode, ok] of [
    ["Xcode 26.3", false],
    ["Xcode 25.9", false],
    ["Xcode 26.4", true],
    ["Xcode 26.10", true],
    ["Xcode 27", true],
  ] as const) {
    const item = iosReadiness({ ...ready, xcode })[0]!;
    assert.equal(item.ok, ok, xcode);
    if (!ok) assert.match(item.fix!, new RegExp(MIN_XCODE.join("\\.")));
  }
  // Distribution certificates can't install a development build.
  assert.equal(
    iosReadiness({ ...ready, identities: ["Apple Distribution: X (AB)"] })[2]!
      .ok,
    false,
  );
  assert.ok(
    iosReadiness({ ...ready, identities: ["iPhone Developer: X (AB)"] })[2]!.ok,
  );
  // Not a Mac (the Windows PC): one plain answer.
  const windows = iosReadiness({ platform: "win32", identities: [] });
  assert.equal(windows.length, 1);
  assert.equal(windows[0]!.ok, false);
});

test("reading xcodebuild and the keychain", () => {
  assert.deepEqual(xcodeVersion("Xcode 27.0"), [27, 0]);
  assert.deepEqual(xcodeVersion("Xcode 26.4.1"), [26, 4]);
  assert.deepEqual(xcodeVersion("Xcode 27"), [27, 0]);
  assert.equal(xcodeVersion(undefined), undefined);
  assert.equal(
    xcodeVersion(
      "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance",
    ),
    undefined,
  );
  const hash = "6F1A".repeat(10);
  assert.deepEqual(
    parseIdentities(
      `  1) ${hash} "Apple Development: athlete@example.com (ABCDE12345)"\n  2) ${hash} "Apple Distribution: Forge (TEAM123456)"\n     2 valid identities found`,
    ),
    [
      "Apple Development: athlete@example.com (ABCDE12345)",
      "Apple Distribution: Forge (TEAM123456)",
    ],
  );
  assert.deepEqual(parseIdentities("     0 valid identities found"), []);
});

test("the build's environment: FORGE Dev, no .env files, nothing from the shell's EXPO_PUBLIC_", () => {
  const shell = {
    PATH: "/usr/bin",
    HOME: "/Users/athlete",
    APP_VARIANT: "production",
    FORGE_PERSONAL_TEAM: "1",
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "prodkey",
    EXPO_PUBLIC_FORGE_ENV: "production",
  };
  const debug = iosBuildEnv(shell, {}, true);
  assert.equal(debug.APP_VARIANT, "development");
  assert.equal(debug.EXPO_NO_DOTENV, "1");
  assert.equal(debug.FORGE_PERSONAL_TEAM, "1");
  assert.equal(debug.EXPO_NO_GIT_STATUS, "1");
  assert.equal(debug.PATH, "/usr/bin");
  assert.deepEqual(
    Object.keys(debug).filter((k) => k.startsWith("EXPO_PUBLIC_")),
    [],
  );
  // A paid team's build: the switch is removed, even if the shell set it.
  assert.ok(!("FORGE_PERSONAL_TEAM" in iosBuildEnv(shell, {}, false)));
  // A Release build carries the development project's values, only.
  const dev = {
    EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "devkey",
    EXPO_PUBLIC_FORGE_ENV: "development",
    EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV,
  };
  const release = iosBuildEnv(shell, dev, true);
  for (const [name, value] of Object.entries(dev))
    assert.equal(release[name], value, name);
  const all = JSON.stringify(release);
  for (const value of [PROD, "prodkey", "production"])
    assert.ok(!all.includes(value), value);
});

test("Expo's commands: a fresh ios/ each time, never Metro, Release only when asked", () => {
  assert.deepEqual(iosCommands(options()), [
    ["prebuild", "--platform", "ios", "--clean"],
    ["run:ios", "--no-bundler", "--device"],
  ]);
  assert.deepEqual(iosCommands(options({ release: true }))[1], [
    "run:ios",
    "--no-bundler",
    "--configuration",
    "Release",
    "--device",
  ]);
  // A device already named isn't asked for again.
  assert.deepEqual(
    iosCommands(options({ rest: ["--device", "My iPhone"] }))[1],
    ["run:ios", "--no-bundler", "--device", "My iPhone"],
  );
  for (const rest of [["-d"], ["--device=My iPhone"]])
    assert.equal(
      iosCommands(options({ rest }))[1]!.filter((a) => /^(-d|--device)/.test(a))
        .length,
      1,
    );
  // An explicit Debug configuration would make Expo start its own Metro,
  // with Expo's .env: Debug is never named.
  for (const o of [options(), options({ release: true })])
    assert.ok(!iosCommands(o)[1]!.includes("Debug"));
});

test("the command refuses those flags before touching anything", () => {
  const tsx = require.resolve("tsx/cli");
  const runner = path.resolve("scripts/dev/run-ios.ts");
  for (const [args, said] of [
    [["--configuration", "Release"], /--configuration is set by this command/],
    [["--no-cloud"], /--no-cloud is for --release builds/],
  ] as const) {
    const result = spawnSync(process.execPath, [tsx, runner, ...args], {
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, said);
    assert.doesNotMatch(result.stdout, /FORGE Dev →/);
  }
});
