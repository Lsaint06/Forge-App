// npm run dev:ios [-- --release] [--no-cloud] [--paid-team] [--check]
// [expo run:ios options]: builds FORGE Dev with Xcode and installs it on the
// iPhone connected to this Mac (Phase 8.1).
// - By default, a Debug build signed with a free Apple ID (Personal Team):
//   FORGE Dev under its own bundle ID, without Sign in with Apple. Its
//   JavaScript comes from `npm run start:dev` on this Mac.
// - --release: the JavaScript is built in, so FORGE Dev opens without this
//   Mac. It uses the development project in .env.forge-dev, or, with
//   --no-cloud, no account service at all (accounts unavailable).
// - --paid-team: signed by an Apple Developer Program team instead
//   (com.lsaint06.forge.dev, with Sign in with Apple).
// - --check: only checks this Mac (Xcode, CocoaPods, a signing certificate).
// Like start:dev, it never reads Expo's own .env files, so production's
// values can't reach FORGE Dev. See docs/NATIVE_BUILDS.md.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PERSONAL_TEAM_ID } from "../../app.config";
import {
  BUNDLED_IN_DEVELOPMENT,
  DEV_ENV_FILE,
  EXPO_ENV_FILES,
  checkDevProject,
  maskRef,
  parseEnvFile,
  readEnvFiles,
} from "./env-files";
import { runGuarded } from "./guarded-run";
import {
  iosBuildEnv,
  iosCommands,
  iosReadiness,
  parseIdentities,
  parseIosArgs,
} from "./ios-build";

const root = process.cwd();
const text = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8") : undefined;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function probe(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

const parsed = parseIosArgs(process.argv.slice(2));
if (!parsed.ok) fail(`npm run dev:ios: ${parsed.problem}`);
const options = parsed.options;

const readiness = iosReadiness({
  platform: process.platform,
  xcode: probe("xcodebuild", ["-version"])?.split("\n")[0],
  cocoapods: probe("pod", ["--version"])?.split("\n").pop(),
  identities: parseIdentities(
    probe("security", ["find-identity", "-v", "-p", "codesigning"]) ?? "",
  ),
});
const ready = readiness.every((r) => r.ok);
if (options.check || !ready) {
  console.log("FORGE Dev on the iPhone: this Mac");
  for (const r of readiness)
    console.log(
      `${r.ok ? "✓" : "✗"} ${r.item}${r.ok || !r.fix ? "" : `\n    → ${r.fix}`}`,
    );
}
if (options.check) process.exit(ready ? 0 : 1);
if (!ready) fail("Not building: fix the items above, then run this again.");

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
  const devText = text(path.join(root, DEV_ENV_FILE));
  if (devText === undefined)
    fail(
      `A Release build needs ${DEV_ENV_FILE} (the development project: docs/DEVELOPMENT_ENVIRONMENT.md), or --no-cloud for a build without accounts.`,
    );
  const dev = parseEnvFile(devText);
  const project = checkDevProject(
    dev,
    readEnvFiles(root, EXPO_ENV_FILES, text),
  );
  if (!project.ok)
    fail(`FORGE Dev won't build:\n- ${project.problems.join("\n- ")}`);
  cloud = dev;
  javascript = `Release: JavaScript built in, development project ${maskRef(project.ref)}`;
}

const personal = !options.paidTeam;
console.log(
  `FORGE Dev → ${
    personal
      ? `free Apple ID (Personal Team): ${PERSONAL_TEAM_ID}, without Sign in with Apple`
      : "paid team: com.lsaint06.forge.dev, with Sign in with Apple"
  }\n${javascript} (Expo's own .env files not read)`,
);

const env = iosBuildEnv(process.env, cloud, personal) as NodeJS.ProcessEnv;
const cli = createRequire(path.join(root, "package.json")).resolve(
  "expo/bin/cli",
);
// Expo may write to app.json or package.json during a build (for example,
// saving the chosen signing team): both are put back as committed.
void runGuarded(
  iosCommands(options).map((args) => ({
    command: process.execPath,
    args: [cli, ...args],
    env,
  })),
  ["app.json", "package.json"].map((file) => path.join(root, file)),
).then(({ status, cancelled, restored }) => {
  for (const file of restored)
    console.log(
      `Restored ${path.basename(file)}: Expo changed it during the build.`,
    );
  if (cancelled) {
    console.log("Cancelled: no further step ran.");
    process.exit(130);
  }
  if (status === 0) {
    const steps = [
      "If FORGE Dev doesn't open on the iPhone: Settings → General → VPN & Device Management → your Apple ID → Trust, and Settings → Privacy & Security → Developer Mode → On.",
    ];
    if (!options.release)
      steps.push(
        existsSync(path.join(root, DEV_ENV_FILE))
          ? "Next: npm run start:dev, then in FORGE Dev choose this Mac's server (same Wi-Fi)."
          : `Next: npm run start:dev, which needs ${DEV_ENV_FILE} (the development project). Until it exists, npm run dev:ios -- --release --no-cloud shows FORGE Dev without accounts.`,
      );
    if (personal)
      steps.push(
        "A free Apple ID's build stops opening after 7 days: connect the iPhone and run this again. FORGE Dev keeps its data.",
      );
    console.log(`\n${steps.join("\n")}`);
  }
  process.exit(status);
});
