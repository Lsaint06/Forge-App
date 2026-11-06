import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  FORGE_DEV_ID,
  MIN_XCODE,
  PREBUILD,
  appPathFromBuildSettings,
  buildFailureHints,
  builtAppProblems,
  chooseIphone,
  chooseSimulator,
  chooseTeam,
  developerDir,
  iosBuildEnv,
  iosReadiness,
  parseDevices,
  parseIdentities,
  parseIosArgs,
  parseSimulators,
  productionMarkers,
  signingTeams,
  teamFromSubject,
  WWDR_G3,
  xcodeVersion,
  xcodebuildArgs,
  type BuiltApp,
  type Iphone,
} from "../scripts/dev/ios-build";

// Phase 8.1: `npm run dev:ios` builds FORGE Dev with Xcode, signed by the
// founder's Apple Developer Program team, for one physical iPhone, or, with
// --simulator (Phase 8.4C-1), for one iOS Simulator. It never reads Expo's
// own .env files, and refuses to install a build that isn't FORGE Dev as
// intended or that holds a production value. No Xcode here.

const DEV = "devprojectrefaaaaaaa";
const PROD = "prodprojectrefbbbbbb";
const TEAM = "ABCDE12345";

test("FORGE Dev's bundle ID comes from the runtime guard's table", () => {
  assert.equal(FORGE_DEV_ID, "com.lsaint06.forge.dev");
});

test("options: flags, --team and --device values, nothing else", () => {
  assert.deepEqual(parseIosArgs([]), {
    ok: true,
    options: { release: false, noCloud: false, check: false, buildOnly: false },
  });
  assert.deepEqual(
    parseIosArgs([
      "--release",
      "--no-cloud",
      "--team",
      "abcde12345",
      "--device=Gym iPhone",
      "--check",
    ]),
    {
      ok: true,
      options: {
        release: true,
        noCloud: true,
        check: true,
        buildOnly: false,
        team: TEAM,
        device: "Gym iPhone",
      },
    },
  );
  assert.deepEqual(parseIosArgs(["--team=ABCDE12345"]), {
    ok: true,
    options: {
      release: false,
      noCloud: false,
      check: false,
      buildOnly: false,
      team: TEAM,
    },
  });
  // Build and sign without the iPhone.
  const buildOnly = parseIosArgs(["--release", "--no-cloud", "--build-only"]);
  assert.equal(buildOnly.ok && buildOnly.options.buildOnly, true);
  // A Simulator instead of the iPhone (Phase 8.4C-1): Release only.
  assert.deepEqual(parseIosArgs(["--release", "--simulator=iPhone 17"]), {
    ok: true,
    options: {
      release: true,
      noCloud: false,
      check: false,
      buildOnly: false,
      simulator: "iPhone 17",
    },
  });
  for (const [args, said] of [
    [["--team"], /--team needs a value/],
    [["--team", "--release"], /--team needs a value/],
    [["--device="], /--device needs a value/],
    [["--team", "ABC"], /10-character Team ID/],
    [["--team", "ABCDE-1234"], /10-character Team ID/],
    // Expo's own options don't apply: this command runs Xcode itself.
    [["--configuration", "Release"], /--configuration isn't an option/],
    [["--paid-team"], /--paid-team isn't an option/],
    // A Debug build's JavaScript comes from start:dev: --no-cloud can't apply.
    [["--no-cloud"], /--no-cloud is for --release builds/],
    [
      ["--build-only", "--device", "Gym iPhone"],
      /--build-only installs on no iPhone/,
    ],
    [["--simulator"], /--simulator needs a value/],
    [["--release", "--simulator", "--check"], /--simulator needs a value/],
    // Debug builds open in the development launcher: Release only.
    [["--simulator", "iPhone 17"], /--simulator is for --release builds/],
    [
      ["--release", "--simulator", "iPhone 17", "--device", "Gym iPhone"],
      /--simulator installs on no iPhone/,
    ],
    [
      ["--release", "--simulator", "iPhone 17", "--build-only"],
      /--simulator installs on the Simulator/,
    ],
  ] as const) {
    const parsed = parseIosArgs([...args]);
    assert.equal(parsed.ok, false, args.join(" "));
    if (!parsed.ok) assert.match(parsed.problem, said, args.join(" "));
  }
});

test("Xcode: DEVELOPER_DIR, then xcode-select's Xcode, then an installed Xcode used directly", () => {
  const XCODE = "/Applications/Xcode.app";
  const DIR = `${XCODE}/Contents/Developer`;
  assert.deepEqual(
    developerDir({
      env: "/Custom/Xcode.app/Contents/Developer",
      xcodeApps: [XCODE],
    }),
    { dir: "/Custom/Xcode.app/Contents/Developer", setEnv: false },
  );
  assert.deepEqual(developerDir({ selected: DIR, xcodeApps: [] }), {
    dir: DIR,
    setEnv: false,
  });
  // This Mac on Nov 3, 2026: xcode-select still names the Command Line Tools.
  assert.deepEqual(
    developerDir({
      selected: "/Library/Developer/CommandLineTools",
      xcodeApps: [XCODE, "/Applications/Xcode-beta.app"],
    }),
    { dir: DIR, setEnv: true },
  );
  assert.equal(
    developerDir({
      selected: "/Library/Developer/CommandLineTools",
      xcodeApps: [],
    }),
    undefined,
  );
  assert.deepEqual(xcodeVersion("Xcode 27.2"), [27, 2]);
  assert.deepEqual(xcodeVersion("Xcode 26.4.1"), [26, 4]);
  assert.equal(
    xcodeVersion(
      "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance",
    ),
    undefined,
  );
});

const hash = (c: string) => c.repeat(40);
const subject = (team: string, name = "Forge Developer") =>
  `UID=Z9Y8X7W6V5\nCN=Apple Development: ${name} (Q1W2E3R4T5)\nOU=${team}\nO=${name}\nC=US`;

test("signing: the team comes from the development certificate's OU, not its name", () => {
  const output = `  1) ${hash("A")} "Apple Development: Forge Developer (Q1W2E3R4T5)"\n  2) ${hash("B")} "Apple Distribution: Forge Developer (${TEAM})"\n     2 valid identities found`;
  const identities = parseIdentities(output);
  assert.deepEqual(identities, [
    {
      sha1: hash("A"),
      name: "Apple Development: Forge Developer (Q1W2E3R4T5)",
    },
    { sha1: hash("B"), name: `Apple Distribution: Forge Developer (${TEAM})` },
  ]);
  assert.deepEqual(parseIdentities("     0 valid identities found"), []);
  assert.deepEqual(teamFromSubject(subject(TEAM)), {
    id: TEAM,
    name: "Forge Developer",
  });
  assert.equal(teamFromSubject("CN=Something\nOU=not a team"), undefined);
  // Only development identities with a certificate count; one entry per team.
  assert.deepEqual(
    signingTeams(identities, [
      { sha1: hash("A"), subject: subject(TEAM) },
      { sha1: hash("B"), subject: subject("ZZZZZ99999") },
    ]),
    [{ id: TEAM, name: "Forge Developer" }],
  );
  assert.deepEqual(signingTeams(identities, []), []);
});

test("signing: one team is used; several or none need --team", () => {
  const ours = { id: TEAM, name: "Forge Developer" };
  assert.deepEqual(chooseTeam([ours]), {
    ok: true,
    team: ours,
    certificate: true,
  });
  // Today: no certificate yet. --team lets Xcode create it during the build.
  const none = chooseTeam([]);
  assert.equal(none.ok, false);
  if (!none.ok) {
    assert.match(none.problem, /--team <your Team ID>/);
    assert.match(none.problem, /Manage Certificates/);
    assert.match(none.problem, /not "Personal Team"/);
  }
  assert.deepEqual(chooseTeam([], TEAM), {
    ok: true,
    team: { id: TEAM },
    certificate: false,
  });
  const two = chooseTeam([ours, { id: "ZZZZZ99999" }]);
  assert.equal(two.ok, false);
  if (!two.ok) assert.match(two.problem, /ABCDE12345.*ZZZZZ99999/);
  assert.deepEqual(chooseTeam([ours, { id: "ZZZZZ99999" }], "ZZZZZ99999"), {
    ok: true,
    team: { id: "ZZZZZ99999" },
    certificate: true,
  });
});

test("signing: a certificate that isn't trusted yet says to add Apple's intermediate", () => {
  // This Mac on Nov 3, 2026: the founder's new certificate, but only the
  // expired 2013 WWDR intermediate was installed, so no identity was valid.
  const ours = { id: TEAM, name: "Forge Developer" };
  const missing = chooseTeam([], undefined, [ours]);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(
      missing.problem,
      /Forge Developer \(ABCDE12345\) isn't trusted/,
    );
    assert.ok(missing.problem.includes(WWDR_G3));
  }
  assert.equal(
    WWDR_G3,
    "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer",
  );
  // A valid identity wins; --team still works (Xcode can create its own).
  assert.equal(chooseTeam([ours], undefined, [ours]).ok, true);
  assert.equal(chooseTeam([], TEAM, [ours]).ok, true);
});

// The shape `xcrun devicectl list devices --json-output` writes (Xcode 27).
const devicectl = (...devices: unknown[]) => ({
  info: { jsonVersion: 3 },
  result: { devices },
});
const phone = (o: {
  name?: string;
  udid?: string;
  tunnel?: string;
  pairing?: string;
  developerMode?: string;
  reality?: string;
  platform?: string;
}) => ({
  hardwareProperties: {
    udid: o.udid ?? "00008150-000A1B2C3D4E5F60",
    marketingName: "iPhone 17",
    platform: o.platform ?? "iOS",
    reality: o.reality ?? "physical",
  },
  deviceProperties: {
    name: o.name ?? "Gym iPhone",
    osVersionNumber: "26.6.2",
    developerModeStatus: o.developerMode ?? "enabled",
  },
  connectionProperties: {
    pairingState: o.pairing ?? "paired",
    tunnelState: o.tunnel ?? "disconnected",
    transportType: o.tunnel === "unavailable" ? undefined : "wired",
  },
});

test("the iPhone: physical, paired and reachable, with Developer Mode on", () => {
  const [ling] = parseDevices(devicectl(phone({})));
  assert.deepEqual(ling, {
    name: "Gym iPhone",
    udid: "00008150-000A1B2C3D4E5F60",
    model: "iPhone 17",
    os: "26.6.2",
    reachable: true,
    developerMode: "enabled",
  });
  // Simulators, Macs and malformed entries are never candidates.
  assert.deepEqual(
    parseDevices(
      devicectl(
        phone({ reality: "simulated", udid: "SIM" }),
        phone({ platform: "macOS", udid: "MAC" }),
        { hardwareProperties: {} },
        null,
      ),
    ),
    [],
  );
  assert.deepEqual(parseDevices({}), []);
  assert.deepEqual(parseDevices("not json"), []);
  assert.deepEqual(chooseIphone([ling!]), { ok: true, device: ling });
});

test("the iPhone: unplugged, several, by name, Developer Mode off", () => {
  const offline = parseDevices(devicectl(phone({ tunnel: "unavailable" })));
  // This Mac on Nov 3, 2026: paired, but not connected.
  const unplugged = chooseIphone(offline);
  assert.equal(unplugged.ok, false);
  if (!unplugged.ok)
    assert.match(
      unplugged.problem,
      /"Gym iPhone" isn't connected right now: plug it into this Mac/,
    );
  const nothing = chooseIphone([]);
  assert.equal(nothing.ok, false);
  if (!nothing.ok) assert.match(nothing.problem, /^Connect your iPhone/);
  const two: Iphone[] = parseDevices(
    devicectl(phone({}), phone({ name: "Spare", udid: "00008150-AAAA" })),
  );
  const both = chooseIphone(two);
  assert.equal(both.ok, false);
  if (!both.ok)
    assert.match(both.problem, /--device "<name>" \("Gym iPhone", "Spare"\)/);
  for (const wanted of ["spare", "00008150-aaaa", "Spare"]) {
    const chosen = chooseIphone(two, wanted);
    assert.equal(chosen.ok && chosen.device.name, "Spare", wanted);
  }
  const unknown = chooseIphone(two, "Work Phone");
  assert.equal(unknown.ok, false);
  if (!unknown.ok)
    assert.match(unknown.problem, /No paired iPhone is called "Work Phone"/);
  const off = chooseIphone(
    parseDevices(devicectl(phone({ developerMode: "disabled" }))),
  );
  assert.equal(off.ok, false);
  if (!off.ok) assert.match(off.problem, /Developer Mode/);
  const unpaired = chooseIphone(
    parseDevices(devicectl(phone({ pairing: "unpaired" }))),
  );
  assert.equal(unpaired.ok, false);
});

// The shape `xcrun simctl list devices available --json` prints (Xcode 27).
const simctl = {
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-4": [
      {
        name: "iPhone 17",
        udid: "SIM-26",
        state: "Shutdown",
        isAvailable: true,
        deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
      },
    ],
    "com.apple.CoreSimulator.SimRuntime.iOS-27-2": [
      {
        name: "iPhone 17",
        udid: "SIM-27",
        state: "Booted",
        isAvailable: true,
        deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
      },
      {
        name: "iPad Pro 13-inch (M5)",
        udid: "IPAD",
        state: "Shutdown",
        isAvailable: true,
        deviceTypeIdentifier:
          "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB",
      },
      {
        name: "iPhone Air",
        udid: "UNAVAILABLE",
        state: "Shutdown",
        isAvailable: false,
        deviceTypeIdentifier:
          "com.apple.CoreSimulator.SimDeviceType.iPhone-Air",
      },
    ],
    "com.apple.CoreSimulator.SimRuntime.watchOS-26-0": [
      {
        name: "Apple Watch Series 11 (46mm)",
        udid: "WATCH",
        state: "Shutdown",
        isAvailable: true,
        deviceTypeIdentifier:
          "com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-11-46mm",
      },
    ],
  },
};

test("the Simulator (--simulator): an available iPhone Simulator, by name (newest iOS) or UDID", () => {
  const all = parseSimulators(simctl);
  // iPhones on an iOS runtime only: no iPad, watch or unavailable one.
  assert.deepEqual(all, [
    { name: "iPhone 17", udid: "SIM-26", os: "26.4", booted: false },
    { name: "iPhone 17", udid: "SIM-27", os: "27.2", booted: true },
  ]);
  for (const nothing of [{}, { devices: [] }, "not json", null])
    assert.deepEqual(parseSimulators(nothing), []);
  // One name per iOS version: the newest, the one to check iOS 27 on.
  assert.deepEqual(chooseSimulator(all, "iphone 17"), {
    ok: true,
    simulator: all[1],
  });
  assert.deepEqual(chooseSimulator(all, "sim-26"), {
    ok: true,
    simulator: all[0],
  });
  const unknown = chooseSimulator(all, "iPhone 16");
  assert.equal(unknown.ok, false);
  if (!unknown.ok)
    assert.match(
      unknown.problem,
      /No iPhone Simulator is called "iPhone 16" \(this Mac has "iPhone 17"\)/,
    );
  const none = chooseSimulator([], "iPhone 17");
  assert.equal(none.ok, false);
  if (!none.ok) assert.match(none.problem, /Settings → Components/);
});

test("readiness: Xcode 26.4 or later, CocoaPods, a signing team and the iPhone", () => {
  const device = parseDevices(devicectl(phone({})))[0]!;
  const ready = {
    platform: "darwin",
    xcode: "Xcode 27.2",
    cocoapods: "1.17.0",
    team: chooseTeam([{ id: TEAM, name: "Forge Developer" }]),
    iphone: chooseIphone([device]),
  };
  const items = iosReadiness(ready);
  assert.ok(items.every((r) => r.ok));
  assert.deepEqual(
    items.map((r) => r.item),
    [
      "Xcode 27.2",
      "CocoaPods 1.17.0",
      `Signing team: Forge Developer (${TEAM})`,
      "iPhone: Gym iPhone (iPhone 17, iOS 26.6.2), Developer Mode on",
    ],
  );
  assert.match(
    iosReadiness({ ...ready, team: chooseTeam([], TEAM) })[2]!.item,
    /Xcode creates its certificate during the build/,
  );
  // This Mac before the founder connects the iPhone: no team, no iPhone.
  const today = iosReadiness({
    ...ready,
    team: chooseTeam([]),
    iphone: chooseIphone(
      parseDevices(devicectl(phone({ tunnel: "unavailable" }))),
    ),
  });
  assert.deepEqual(
    today.map((r) => r.ok),
    [true, true, false, false],
  );
  for (const [xcode, ok] of [
    ["Xcode 26.3", false],
    ["Xcode 26.4", true],
    ["Xcode 27", true],
    [undefined, false],
  ] as const) {
    const item = iosReadiness({ ...ready, xcode })[0]!;
    assert.equal(item.ok, ok, String(xcode));
    if (!ok && xcode)
      assert.match(item.fix!, new RegExp(MIN_XCODE.join("\\.")));
  }
  const buildOnly = iosReadiness({ ...ready, iphone: "not needed" });
  assert.ok(buildOnly.every((r) => r.ok));
  assert.equal(buildOnly[3]!.item, "iPhone: not needed (--build-only)");
  // --simulator: the Simulator instead of the iPhone; the team still signs.
  const onSimulator = iosReadiness({
    ...ready,
    iphone: "not needed",
    simulator: chooseSimulator(parseSimulators(simctl), "iPhone 17"),
  });
  assert.ok(onSimulator.every((r) => r.ok));
  assert.deepEqual(
    onSimulator.slice(2).map((r) => r.item),
    [
      `Signing team: Forge Developer (${TEAM})`,
      "Simulator: iPhone 17 (iOS 27.2)",
    ],
  );
  const noSimulator = iosReadiness({
    ...ready,
    iphone: "not needed",
    simulator: chooseSimulator([], "iPhone 17"),
  })[3]!;
  assert.equal(noSimulator.ok, false);
  assert.match(noSimulator.fix!, /no iPhone Simulator/);
  const windows = iosReadiness({ ...ready, platform: "win32" });
  assert.deepEqual(
    windows.map((r) => r.ok),
    [false],
  );
});

test("the build's environment: FORGE Dev, no .env files, nothing from the shell's EXPO_PUBLIC_", () => {
  const shell = {
    PATH: "/usr/bin",
    APP_VARIANT: "production",
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "prodkey",
    EXPO_PUBLIC_FORGE_ENV: "production",
  };
  const debug = iosBuildEnv(shell, {});
  assert.equal(debug.APP_VARIANT, "development");
  assert.equal(debug.EXPO_NO_DOTENV, "1");
  assert.equal(debug.EXPO_NO_GIT_STATUS, "1");
  // Xcode's build never starts a Metro of its own (which would read .env).
  assert.equal(debug.RCT_NO_LAUNCH_PACKAGER, "1");
  assert.equal(debug.PATH, "/usr/bin");
  assert.ok(!("DEVELOPER_DIR" in debug));
  assert.deepEqual(
    Object.keys(debug).filter((k) => k.startsWith("EXPO_PUBLIC_")),
    [],
  );
  assert.equal(
    iosBuildEnv(shell, {}, "/Applications/Xcode.app/Contents/Developer")
      .DEVELOPER_DIR,
    "/Applications/Xcode.app/Contents/Developer",
  );
  const dev = {
    EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "devkey",
    EXPO_PUBLIC_FORGE_ENV: "development",
    EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV,
  };
  const release = iosBuildEnv(shell, dev);
  for (const [name, value] of Object.entries(dev))
    assert.equal(release[name], value, name);
  const all = JSON.stringify(release);
  for (const value of [PROD, "prodkey", "production"])
    assert.ok(!all.includes(value), value);
});

test("Xcode's options: the iPhone by UDID, automatic signing for the team, Release only when asked", () => {
  assert.deepEqual(PREBUILD, ["prebuild", "--platform", "ios", "--clean"]);
  const o = {
    workspace: "ios/FORGEDev.xcworkspace",
    scheme: "FORGEDev",
    release: false,
    udid: "00008150-000A1B2C3D4E5F60",
    team: TEAM,
  };
  const debug = xcodebuildArgs(o);
  assert.deepEqual(debug, [
    "-workspace",
    "ios/FORGEDev.xcworkspace",
    "-scheme",
    "FORGEDev",
    "-configuration",
    "Debug",
    "-destination",
    "id=00008150-000A1B2C3D4E5F60",
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    `DEVELOPMENT_TEAM=${TEAM}`,
    "COMPILER_INDEX_STORE_ENABLE=NO",
  ]);
  const release = xcodebuildArgs({ ...o, release: true });
  assert.equal(release[release.indexOf("-configuration") + 1], "Release");
  // Never a simulator, and never Xcode's "any device".
  for (const args of [debug, release])
    assert.ok(!args.join(" ").match(/simulator|generic/i));
  // --build-only: any iPhone (still a real-device build, signed), no simulator.
  const anyIphone = xcodebuildArgs({ ...o, udid: undefined, release: true });
  assert.equal(
    anyIphone[anyIphone.indexOf("-destination") + 1],
    "generic/platform=iOS",
  );
  assert.ok(!anyIphone.join(" ").match(/simulator/i));
  assert.ok(anyIphone.includes("-allowProvisioningUpdates"));
  // --simulator: that Simulator by UDID, still signed by the team (Sign in
  // with Apple needs it there too).
  const onSimulator = xcodebuildArgs({
    ...o,
    udid: undefined,
    simulator: "SIM-27",
    release: true,
  });
  assert.equal(
    onSimulator[onSimulator.indexOf("-destination") + 1],
    "platform=iOS Simulator,id=SIM-27",
  );
  assert.equal(
    onSimulator[onSimulator.indexOf("-configuration") + 1],
    "Release",
  );
  assert.ok(onSimulator.includes(`DEVELOPMENT_TEAM=${TEAM}`));
  assert.ok(onSimulator.includes("-allowProvisioningUpdates"));
});

test("the built app's path comes from Xcode's build settings", () => {
  const settings = [
    { target: "Pods", buildSettings: { WRAPPER_EXTENSION: "bundle" } },
    {
      target: "FORGEDev",
      buildSettings: {
        WRAPPER_EXTENSION: "app",
        TARGET_BUILD_DIR: "/DerivedData/Build/Products/Release-iphoneos",
        FULL_PRODUCT_NAME: "FORGEDev.app",
      },
    },
  ];
  assert.equal(
    appPathFromBuildSettings(settings),
    "/DerivedData/Build/Products/Release-iphoneos/FORGEDev.app",
  );
  assert.equal(appPathFromBuildSettings([]), undefined);
  assert.equal(appPathFromBuildSettings({}), undefined);
});

test("production markers: the address, ref and key of Expo's own .env files", () => {
  const markers = productionMarkers({
    ".env": {
      EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co/`,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prodkeyvalue",
      EXPO_PUBLIC_SUPPORT_EMAIL: "help@example.com",
    },
    ".env.local": { EXPO_PUBLIC_SUPABASE_PROJECT_REF: "short" },
  });
  assert.deepEqual(
    markers.sort(),
    [`https://${PROD}.supabase.co`, PROD, "sb_publishable_prodkeyvalue"].sort(),
  );
  assert.deepEqual(productionMarkers({}), []);
});

const goodApp = (o: Partial<BuiltApp> = {}): BuiltApp => ({
  bundleId: FORGE_DEV_ID,
  urlSchemes: ["forge-dev", FORGE_DEV_ID, "exp+forge-fitness"],
  team: TEAM,
  entitlements: {
    "application-identifier": `${TEAM}.${FORGE_DEV_ID}`,
    "com.apple.developer.team-identifier": TEAM,
    "com.apple.developer.applesignin": ["Default"],
    "get-task-allow": true,
  },
  javascript: Buffer.from("…Accounts aren't available…"),
  appConfig: Buffer.from('{"name":"FORGE Dev","scheme":"forge-dev"}'),
  profile: {
    team: TEAM,
    expires: "2027-11-03T22:29:46Z",
    devices: ["00008150-000A1B2C3D4E5F60"],
  },
  ...o,
});
const expected = {
  team: TEAM,
  release: true,
  production: [PROD, "sb_publishable_prodkeyvalue"],
};

test("before installing: FORGE Dev as intended passes", () => {
  assert.deepEqual(builtAppProblems(goodApp(), expected), []);
  // A Debug build loads its JavaScript from start:dev: none is built in.
  assert.deepEqual(
    builtAppProblems(goodApp({ javascript: undefined }), {
      ...expected,
      release: false,
    }),
    [],
  );
});

test("before installing: any other app, team, capability or a production value is refused", () => {
  const refused = (
    app: BuiltApp,
    said: RegExp,
    e: Parameters<typeof builtAppProblems>[1] = expected,
  ) => {
    const problems = builtAppProblems(app, e);
    assert.ok(
      problems.some((p) => said.test(p)),
      `${said}: ${problems.join(" | ")}`,
    );
    // Problems never print a production value.
    for (const value of e.production)
      assert.ok(!problems.join(" ").includes(value), value);
  };
  for (const bundleId of [
    "com.lsaint06.forge",
    "com.lsaint06.forge.preview",
    "com.lsaint06.forge.dev.personal",
    "constructor",
    undefined,
  ])
    refused(goodApp({ bundleId }), /bundle ID isn't FORGE Dev's/);
  refused(
    goodApp({ urlSchemes: ["forge-dev", "forge"] }),
    /production app's forge: links/,
  );
  refused(
    goodApp({ urlSchemes: [] }),
    /doesn't answer FORGE Dev's forge-dev: links/,
  );
  refused(goodApp({ team: "ZZZZZ99999" }), /signed by another team/);
  refused(
    goodApp({
      entitlements: {
        ...goodApp().entitlements,
        "application-identifier": `ZZZZZ99999.${FORGE_DEV_ID}`,
      },
    }),
    /signature doesn't match/,
  );
  const withoutApple = { ...goodApp().entitlements };
  delete withoutApple["com.apple.developer.applesignin"];
  refused(goodApp({ entitlements: withoutApple }), /Sign in with Apple/);
  refused(
    goodApp({
      entitlements: {
        ...goodApp().entitlements,
        "aps-environment": "development",
      },
    }),
    /push capability/,
  );
  refused(goodApp({ javascript: undefined }), /JavaScript isn't built in/);
  refused(goodApp({ profile: undefined }), /no provisioning profile/);
  refused(
    goodApp({ profile: { team: "ZZZZZ99999", devices: [] } }),
    /provisioning profile is another team's/,
  );
  // Installing on an iPhone the profile doesn't include would fail.
  refused(goodApp(), /doesn't include this iPhone/, {
    ...expected,
    device: "00008150-AAAAAAAAAAAAAAAA",
  });
  assert.deepEqual(
    builtAppProblems(goodApp(), {
      ...expected,
      device: "00008150-000a1b2c3d4e5f60",
    }),
    [],
  );
  refused(
    goodApp({ javascript: Buffer.from(`url https://${PROD}.supabase.co`) }),
    /JavaScript holds a value from Expo's own .env files/,
  );
  refused(
    goodApp({
      appConfig: Buffer.from('{"extra":"sb_publishable_prodkeyvalue"}'),
    }),
    /app configuration holds a value/,
  );
});

test("before installing on the Simulator: FORGE Dev with no device signing, and still no production value", () => {
  // A Simulator app runs only on this Mac: no team signature, no profile.
  const simulatorApp = goodApp({
    team: undefined,
    entitlements: {},
    profile: undefined,
  });
  const onSimulator = { ...expected, simulator: true };
  assert.deepEqual(builtAppProblems(simulatorApp, onSimulator), []);
  // Every other check stays.
  const cases: [Partial<BuiltApp>, RegExp][] = [
    [{ bundleId: "com.lsaint06.forge" }, /bundle ID isn't FORGE Dev's/],
    [{ urlSchemes: ["forge-dev", "forge"] }, /production app's forge: links/],
    [{ javascript: undefined }, /JavaScript isn't built in/],
    [
      { javascript: Buffer.from(`url https://${PROD}.supabase.co`) },
      /JavaScript holds a value from Expo's own .env files/,
    ],
    [
      { appConfig: Buffer.from('{"extra":"sb_publishable_prodkeyvalue"}') },
      /app configuration holds a value/,
    ],
    [{ entitlements: { "aps-environment": "development" } }, /push capability/],
  ];
  for (const [app, said] of cases) {
    const problems = builtAppProblems({ ...simulatorApp, ...app }, onSimulator);
    assert.ok(
      problems.some((p) => said.test(p)),
      `${said}: ${problems.join(" | ")}`,
    );
  }
  // An iPhone build is never judged by the Simulator's rules.
  assert.ok(builtAppProblems(simulatorApp, expected).length >= 3);
});

test("a failed build explains the usual signing problems in plain words", () => {
  assert.deepEqual(buildFailureHints("** BUILD SUCCEEDED **"), []);
  for (const [log, said] of [
    ['error: No Account for Team "ABCDE12345".', /Xcode → Settings → Accounts/],
    [
      'error: Personal development teams, including "Forge Developer", do not support the Sign In with Apple capability.',
      /Personal Team/,
    ],
    [
      'error: Failed Registering Bundle Identifier: The app identifier "com.lsaint06.forge.dev" cannot be registered to your development team because it is not available.',
      /refused the bundle ID com\.lsaint06\.forge\.dev/,
    ],
    ["errSecInternalComponent", /Always Allow/],
    ["error: Developer Mode disabled", /Developer Mode/],
    [
      "error: Your team has no devices from which to generate a provisioning profile. Connect a device to use or manually add device IDs in Certificates, Identifiers & Profiles.",
      /registered with the team/,
    ],
  ] as const)
    assert.match(buildFailureHints(log).join(" "), said, log);
});

test("the command refuses a bad option before touching anything", () => {
  const tsx = require.resolve("tsx/cli");
  const runner = path.resolve("scripts/dev/run-ios.ts");
  for (const [args, said] of [
    [["--configuration", "Release"], /--configuration isn't an option/],
    [["--no-cloud"], /--no-cloud is for --release builds/],
    [["--team", "nope"], /10-character Team ID/],
    [["--simulator", "iPhone 17"], /--simulator is for --release builds/],
  ] as const) {
    const result = spawnSync(process.execPath, [tsx, runner, ...args], {
      encoding: "utf8",
      timeout: 60000,
    });
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, said);
    assert.doesNotMatch(result.stdout, /FORGE Dev \(/);
  }
});
