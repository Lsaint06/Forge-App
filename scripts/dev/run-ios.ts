// npm run dev:ios [-- --release [--no-cloud]] [--team <Team ID>]
// [--device <iPhone name>] [--check]: builds FORGE Dev with Xcode, signed by
// your Apple Developer Program team, then installs and opens it on the iPhone
// connected to this Mac (Phase 8.1).
// - Debug (the default): its JavaScript comes from `npm run start:dev`.
// - --release: the JavaScript is built in, so FORGE Dev opens without this
//   Mac. It uses the development project in .env.forge-dev, or, with
//   --no-cloud, no account service at all (accounts unavailable).
// - --team: the Team ID, if this Mac doesn't have exactly one development
//   certificate yet (Xcode then creates it during the build).
// - --device: the iPhone's name, if more than one is connected.
// - --simulator: an iOS Simulator on this Mac instead of the iPhone, by name
//   or UDID (Release only), for an iOS version the iPhone doesn't run
//   (Phase 8.4C-1). Still signed by your team, with the same checks.
// - --build-only: builds, signs and checks FORGE Dev without an iPhone, and
//   installs nothing (Apple must already know the iPhone: one earlier
//   install with it connected registers it).
// - --check: only checks this Mac and the iPhone (or the Simulator).
// It never reads Expo's own .env files, checks the built app before
// installing it (FORGE Dev's ID and link scheme, your team, no production
// values), and puts app.json and package.json back if a step changed them.
// See docs/NATIVE_BUILDS.md.

import { spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BUNDLED_IN_DEVELOPMENT,
  DEV_ENV_FILE,
  EXPO_ENV_FILES,
  checkDevProject,
  maskRef,
  parseEnvFile,
  readEnvFiles,
} from "./env-files";
import { runGuarded, type GuardedResult, type Step } from "./guarded-run";
import {
  FORGE_DEV_ID,
  PREBUILD,
  appPathFromBuildSettings,
  buildFailureHints,
  builtAppProblems,
  chooseIphone,
  chooseSimulator,
  chooseTeam,
  describeTeam,
  developerDir,
  iosBuildEnv,
  iosReadiness,
  parseDevices,
  parseIdentities,
  parseIosArgs,
  parseSimulators,
  productionMarkers,
  signingTeams,
  xcodebuildArgs,
  type BuiltApp,
  type Simulator,
} from "./ios-build";

const root = process.cwd();
const read = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8") : undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function probe(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", env });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

const parsed = parseIosArgs(process.argv.slice(2));
if (!parsed.ok) fail(`npm run dev:ios: ${parsed.problem}`);
const options = parsed.options;

// ---- This Mac and the iPhone ----

const xcodeApps = [
  "/Applications/Xcode.app",
  ...(probe("mdfind", ["kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'"])
    ?.split("\n")
    .filter(Boolean) ?? []),
].filter(
  (app, i, all) =>
    all.indexOf(app) === i && existsSync(path.join(app, "Contents/Developer")),
);
const developer = developerDir({
  env: process.env.DEVELOPER_DIR,
  selected: probe("xcode-select", ["-p"]),
  xcodeApps,
});
const toolEnv: NodeJS.ProcessEnv = developer?.setEnv
  ? { ...process.env, DEVELOPER_DIR: developer.dir }
  : process.env;
const xcode = developer
  ? probe("xcodebuild", ["-version"], toolEnv)?.split("\n")[0]
  : undefined;

function keychainCertificates() {
  return ["Apple Development", "iPhone Developer"].flatMap((name) =>
    (
      probe("security", ["find-certificate", "-a", "-p", "-c", name])?.match(
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
      ) ?? []
    ).flatMap((pem) => {
      try {
        const certificate = new X509Certificate(pem);
        return [
          {
            sha1: certificate.fingerprint.replace(/:/g, ""),
            subject: certificate.subject,
          },
        ];
      } catch {
        return [];
      }
    }),
  );
}

function pairedDevices() {
  const dir = mkdtempSync(path.join(tmpdir(), "forge-devices-"));
  const file = path.join(dir, "devices.json");
  try {
    spawnSync(
      "xcrun",
      [
        "devicectl",
        "list",
        "devices",
        "--json-output",
        file,
        "--timeout",
        "10",
      ],
      { encoding: "utf8", env: toolEnv },
    );
    return existsSync(file)
      ? parseDevices(JSON.parse(readFileSync(file, "utf8")))
      : [];
  } catch {
    return [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function simulators() {
  try {
    return parseSimulators(
      JSON.parse(
        probe(
          "xcrun",
          ["simctl", "list", "devices", "available", "--json"],
          toolEnv,
        ) ?? "{}",
      ),
    );
  } catch {
    return [];
  }
}

const certificates = keychainCertificates();
const valid = parseIdentities(
  probe("security", ["find-identity", "-v", "-p", "codesigning"]) ?? "",
);
const untrusted = parseIdentities(
  probe("security", ["find-identity", "-p", "codesigning"]) ?? "",
).filter((identity) => !valid.some((v) => v.sha1 === identity.sha1));
const team = chooseTeam(
  signingTeams(valid, certificates),
  options.team,
  signingTeams(untrusted, certificates),
);
const simulator =
  options.simulator === undefined
    ? undefined
    : xcode
      ? chooseSimulator(simulators(), options.simulator)
      : { ok: false as const, problem: "Needs Xcode first" };
const iphone =
  options.buildOnly || simulator
    ? ("not needed" as const)
    : xcode
      ? chooseIphone(pairedDevices(), options.device)
      : { ok: false as const, problem: "Needs Xcode first" };
const readiness = iosReadiness({
  platform: process.platform,
  xcode,
  cocoapods: probe("pod", ["--version"], toolEnv)?.split("\n").pop(),
  team,
  iphone,
  simulator,
});
const ready = readiness.every((r) => r.ok);
if (options.check || !ready) {
  console.log(
    `FORGE Dev on ${simulator ? "the Simulator" : "the iPhone"}: this Mac`,
  );
  for (const r of readiness)
    console.log(
      `${r.ok ? "✓" : "✗"} ${r.item}${r.ok || !r.fix ? "" : `\n    → ${r.fix}`}`,
    );
}
if (developer?.setEnv)
  console.log(
    `Using ${developer.dir.replace(/\/Contents\/Developer$/, "")} directly: xcode-select points to the Command Line Tools. To make Xcode the default (optional): sudo xcode-select -s ${developer.dir}`,
  );
if (options.check) process.exit(ready ? 0 : 1);
if (
  !ready ||
  !team.ok ||
  (iphone !== "not needed" && !iphone.ok) ||
  (simulator && !simulator.ok)
)
  fail("Not building: fix the items above, then run this again.");

// ---- What goes into the build ----

const bundled = BUNDLED_IN_DEVELOPMENT.filter((file) =>
  existsSync(path.join(root, file)),
);
if (bundled.length)
  fail(
    `FORGE Dev won't build: move ${bundled.join(", ")} out of the project first. Expo would add ${bundled.length > 1 ? "their" : "its"} values to FORGE Dev's JavaScript.`,
  );

let cloud: Record<string, string> = {};
let javascript: string;
if (!options.release)
  javascript = "Debug: its JavaScript comes from npm run start:dev on this Mac";
else if (options.noCloud)
  javascript =
    "Release: JavaScript built in, without the account service (accounts unavailable)";
else {
  const devText = read(path.join(root, DEV_ENV_FILE));
  if (devText === undefined)
    fail(
      `A Release build needs ${DEV_ENV_FILE} (the development project: docs/DEVELOPMENT_ENVIRONMENT.md), or --no-cloud for a build without accounts.`,
    );
  const dev = parseEnvFile(devText);
  const project = checkDevProject(
    dev,
    readEnvFiles(root, EXPO_ENV_FILES, read),
  );
  if (!project.ok)
    fail(`FORGE Dev won't build:\n- ${project.problems.join("\n- ")}`);
  cloud = dev;
  javascript = `Release: JavaScript built in, development project ${maskRef(project.ref)}`;
}

const device = iphone === "not needed" ? undefined : iphone.device;
const sim = simulator?.ok ? simulator.simulator : undefined;
const signer = team.team;
console.log(
  `FORGE Dev (${FORGE_DEV_ID}) → ${sim ? `the ${sim.name} Simulator (iOS ${sim.os})` : device ? device.name : "any iPhone (build only)"}, signed by ${describeTeam(signer)}\n${javascript} (Expo's own .env files not read)`,
);

// ---- Build, check, install, open ----

const env = iosBuildEnv(
  process.env,
  cloud,
  developer?.setEnv ? developer.dir : undefined,
) as NodeJS.ProcessEnv;
const guarded = ["app.json", "package.json"].map((file) =>
  path.join(root, file),
);
const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`;

/** One step at a time: stops the command on Ctrl+C, false when it failed. */
async function run(step: Step): Promise<boolean> {
  const result: GuardedResult = await runGuarded([step], guarded);
  for (const file of result.restored)
    console.log(`Restored ${path.basename(file)}: a step changed it.`);
  if (result.cancelled) {
    console.log("Cancelled: no further step ran.");
    process.exit(130);
  }
  return result.status === 0;
}

function inspect(app: string): BuiltApp {
  const plist = path.join(app, "Info.plist");
  const urlTypes = probe("plutil", [
    "-extract",
    "CFBundleURLTypes",
    "json",
    "-o",
    "-",
    plist,
  ]);
  const signature = spawnSync("codesign", ["-dv", "--verbose=2", app], {
    encoding: "utf8",
  });
  const entitlements = spawnSync(
    "codesign",
    ["-d", "--entitlements", "-", "--xml", app],
    { encoding: "utf8" },
  ).stdout;
  const asJson = entitlements
    ? spawnSync("plutil", ["-convert", "json", "-o", "-", "-"], {
        encoding: "utf8",
        input: entitlements,
      }).stdout
    : "";
  const file = (name: string) =>
    existsSync(path.join(app, name))
      ? readFileSync(path.join(app, name))
      : undefined;
  // The embedded provisioning profile, decoded to a temporary plist.
  let profile: BuiltApp["profile"];
  const embedded = path.join(app, "embedded.mobileprovision");
  if (existsSync(embedded)) {
    const dir = mkdtempSync(path.join(tmpdir(), "forge-profile-"));
    try {
      const plistFile = path.join(dir, "profile.plist");
      spawnSync("security", ["cms", "-D", "-i", embedded, "-o", plistFile]);
      const key = (name: string, as = "raw") =>
        probe("plutil", ["-extract", name, as, "-o", "-", plistFile]);
      const devices = key("ProvisionedDevices", "json");
      profile = {
        team: key("TeamIdentifier.0"),
        expires: key("ExpirationDate"),
        devices: devices ? (JSON.parse(devices) as string[]) : [],
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return {
    bundleId: probe("plutil", [
      "-extract",
      "CFBundleIdentifier",
      "raw",
      "-o",
      "-",
      plist,
    ]),
    urlSchemes: urlTypes
      ? (JSON.parse(urlTypes) as { CFBundleURLSchemes?: string[] }[]).flatMap(
          (t) => t.CFBundleURLSchemes ?? [],
        )
      : [],
    team: /^TeamIdentifier=(.+)$/m.exec(signature.stderr)?.[1]?.trim(),
    entitlements: asJson ? (JSON.parse(asJson) as Record<string, unknown>) : {},
    javascript: file("main.jsbundle"),
    appConfig: file(path.join("EXConstants.bundle", "app.config")),
    profile,
  };
}

/** --simulator: starts the Simulator if needed, then installs and opens FORGE Dev. */
async function openOnSimulator(app: string, sim: Simulator) {
  // -b starts it if it's shut down; this waits until it has started.
  if (
    !(await run({
      command: "xcrun",
      args: ["simctl", "bootstatus", sim.udid, "-b"],
      env,
    }))
  )
    fail(`The ${sim.name} Simulator didn't start (see above).`);
  // Shows its window, with this Xcode's own Simulator app.
  spawnSync(
    "open",
    [
      "-a",
      developer
        ? path.join(developer.dir, "Applications", "Simulator.app")
        : "Simulator",
    ],
    { env: toolEnv },
  );
  if (
    !(await run({
      command: "xcrun",
      args: ["simctl", "install", sim.udid, app],
      env,
    }))
  )
    fail(`Installing on the ${sim.name} Simulator failed (see above).`);
  console.log(`✓ Installed on the ${sim.name} Simulator (iOS ${sim.os})`);
  const opened = await run({
    command: "xcrun",
    args: [
      "simctl",
      "launch",
      "--terminate-running-process",
      sim.udid,
      FORGE_DEV_ID,
    ],
    env,
  });
  console.log(
    opened
      ? `✓ Opened FORGE Dev on the ${sim.name} Simulator`
      : "FORGE Dev is installed but didn't open: open it from the Simulator's home screen.",
  );
  console.log(
    "\nIts JavaScript is built in. Light and dark mode: Simulator → Features → Toggle Appearance. Run the same command again after code changes.",
  );
}

async function main() {
  const cli = createRequire(path.join(root, "package.json")).resolve(
    "expo/bin/cli",
  );
  if (
    !(await run({ command: process.execPath, args: [cli, ...PREBUILD], env }))
  )
    fail("Expo couldn't generate the iOS project (see above).");

  const workspaces = readdirSync(path.join(root, "ios")).filter((f) =>
    f.endsWith(".xcworkspace"),
  );
  if (workspaces.length !== 1)
    fail("Expected exactly one Xcode workspace in ios/.");
  const args = xcodebuildArgs({
    workspace: path.join("ios", workspaces[0]!),
    scheme: workspaces[0]!.replace(/\.xcworkspace$/, ""),
    release: options.release,
    udid: device?.udid,
    simulator: sim?.udid,
    team: signer.id,
  });
  const log = path.join(root, "ios", "xcodebuild.log");
  console.log(
    `Building with Xcode (${options.release ? "Release" : "Debug"}): the first build takes 10–20 minutes. Full log: ios/xcodebuild.log\nIf the Mac asks to use your keychain or signing key, enter your Mac password and choose Always Allow.`,
  );
  const started = Date.now();
  const timer = setInterval(
    () => console.log(`  …still building (${minutes(Date.now() - started)})`),
    60000,
  );
  const built = await run({
    command: "xcodebuild",
    args: [...args, "build"],
    env,
    output: log,
  });
  clearInterval(timer);
  if (!built) {
    const output = read(log) ?? "";
    const errors = output
      .split("\n")
      .filter((line) => /error:|\*\* BUILD FAILED/.test(line))
      .slice(0, 15);
    fail(
      [
        `Xcode's build failed after ${minutes(Date.now() - started)}:`,
        ...errors,
        ...buildFailureHints(output).map((hint) => `→ ${hint}`),
        "Full log: ios/xcodebuild.log",
      ].join("\n"),
    );
  }
  console.log(`✓ Built in ${minutes(Date.now() - started)}`);

  const settings = spawnSync(
    "xcodebuild",
    [
      ...args.filter((arg) => !arg.startsWith("-allowProvisioning")),
      "-showBuildSettings",
      "-json",
    ],
    { encoding: "utf8", env, maxBuffer: 256 * 1024 * 1024 },
  );
  let app: string | undefined;
  try {
    app = appPathFromBuildSettings(JSON.parse(settings.stdout));
  } catch {
    app = undefined;
  }
  if (!app || !existsSync(app)) fail("Couldn't find the built FORGE Dev app.");

  const inspected = inspect(app);
  const problems = builtAppProblems(inspected, {
    team: signer.id,
    release: options.release,
    production: productionMarkers(readEnvFiles(root, EXPO_ENV_FILES, read)),
    device: device?.udid,
    simulator: !!sim,
  });
  if (problems.length)
    fail(
      `${device || sim ? "Not installing" : "Not ready to install"} this build:\n- ${problems.join("\n- ")}`,
    );
  if (sim) {
    console.log(
      "✓ Checked: FORGE Dev's ID and link scheme, no production values, JavaScript built in",
    );
    await openOnSimulator(app, sim);
    return;
  }
  console.log(
    `✓ Checked: FORGE Dev's ID and link scheme, signed by team ${signer.id}, no production values${options.release ? ", JavaScript built in" : ""}`,
  );
  const profile = inspected.profile!;
  console.log(
    `✓ Provisioning profile: team ${profile.team}, ${profile.devices.length} registered iPhone${profile.devices.length === 1 ? "" : "s"}, valid until ${profile.expires?.slice(0, 10) ?? "?"}`,
  );
  if (!device) {
    console.log(
      `\nBuilt, signed and checked, not installed: ${app.replace(process.env.HOME ?? "~", "~")}\nConnect the iPhone and run the same command without --build-only to install and open it.`,
    );
    return;
  }

  if (
    !(await run({
      command: "xcrun",
      args: [
        "devicectl",
        "device",
        "install",
        "app",
        "--device",
        device.udid,
        app,
      ],
      env,
    }))
  )
    fail(
      `Installing on ${device.name} failed (see above). Keep it unlocked and connected, then run this again.`,
    );
  console.log(`✓ Installed on ${device.name}`);

  const opened = await run({
    command: "xcrun",
    args: [
      "devicectl",
      "device",
      "process",
      "launch",
      "--device",
      device.udid,
      "--terminate-existing",
      FORGE_DEV_ID,
    ],
    env,
  });
  console.log(
    opened
      ? `✓ Opened FORGE Dev on ${device.name}`
      : `FORGE Dev is installed but didn't open: unlock ${device.name} and open FORGE Dev from the home screen.`,
  );
  console.log(
    options.release
      ? "\nIts JavaScript is built in: FORGE Dev opens without this Mac. Run the same command again after code changes."
      : existsSync(path.join(root, DEV_ENV_FILE))
        ? "\nNext: npm run start:dev, then in FORGE Dev choose this Mac's server (same Wi-Fi)."
        : `\nThis Debug build loads its JavaScript from npm run start:dev, which needs ${DEV_ENV_FILE} (the development project). Until then, npm run dev:ios -- --release --no-cloud builds one that opens on its own.`,
  );
}

void main();
