// FORGE Dev on the founder's iPhone, built by Xcode on this Mac (Phase 8.1):
// the decisions behind `npm run dev:ios`, kept free of side effects so they
// can be tested. See docs/NATIVE_BUILDS.md.

import { devClientEnv } from "./env-files";

export type IosBuildOptions = {
  /** The JavaScript is built into the app (Release): it opens without this Mac. */
  release: boolean;
  /** A Release build without the account service: accounts unavailable. */
  noCloud: boolean;
  /** Signed by a paid Apple Developer Program team: keeps Sign in with Apple. */
  paidTeam: boolean;
  /** Only report whether this Mac is ready. */
  check: boolean;
  /** Passed on to `expo run:ios`, for example `--device "My iPhone"`. */
  rest: string[];
};

const FLAGS = {
  "--release": "release",
  "--no-cloud": "noCloud",
  "--paid-team": "paidTeam",
  "--check": "check",
} as const;

// Set by dev:ios itself, so FORGE Dev's JavaScript always matches the build.
const RESERVED = /^(--configuration|--no-bundler|--bundler|--binary)(=|$)/;

export function parseIosArgs(
  argv: string[],
): { ok: true; options: IosBuildOptions } | { ok: false; problem: string } {
  const options: IosBuildOptions = {
    release: false,
    noCloud: false,
    paidTeam: false,
    check: false,
    rest: [],
  };
  for (const arg of argv) {
    if (Object.prototype.hasOwnProperty.call(FLAGS, arg))
      options[FLAGS[arg as keyof typeof FLAGS]] = true;
    else if (RESERVED.test(arg))
      return {
        ok: false,
        problem: `${arg.split("=")[0]} is set by this command: add --release for a build that opens without this Mac`,
      };
    else options.rest.push(arg);
  }
  if (options.noCloud && !options.release)
    return {
      ok: false,
      problem:
        "--no-cloud is for --release builds: a Debug build's JavaScript comes from npm run start:dev",
    };
  return { ok: true, options };
}

/** What dev:ios reads from this Mac before building. */
export type MacProbes = {
  platform: string;
  /** The first line of `xcodebuild -version`; undefined when it fails. */
  xcode?: string;
  /** `pod --version`; undefined when CocoaPods is missing. */
  cocoapods?: string;
  /** Code-signing identities from `security find-identity -v -p codesigning`. */
  identities: string[];
};

/** Expo SDK 58's minimum (docs.expo.dev/versions, "Xcode version"). */
export const MIN_XCODE: readonly [number, number] = [26, 4];

/** "Xcode 27.0" → [27, 0]. */
export function xcodeVersion(line?: string): [number, number] | undefined {
  const match = /^Xcode (\d+)(?:\.(\d+))?/.exec(line?.trim() ?? "");
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : undefined;
}

/** The quoted names in `security find-identity` output. */
export function parseIdentities(output: string): string[] {
  return [...output.matchAll(/^\s*\d+\)\s+[0-9A-F]{40}\s+"([^"]+)"/gm)].map(
    (m) => m[1]!,
  );
}

export type ReadinessItem = { item: string; ok: boolean; fix?: string };

/** Each thing a device build needs on this Mac, and how to fix what's missing. */
export function iosReadiness(p: MacProbes): ReadinessItem[] {
  if (p.platform !== "darwin")
    return [
      {
        item: "A Mac",
        ok: false,
        fix: "iPhone builds need Xcode on a Mac (see docs/NATIVE_BUILDS.md)",
      },
    ];
  const version = xcodeVersion(p.xcode);
  const [major, minor] = MIN_XCODE;
  const recent =
    !!version &&
    (version[0] > major || (version[0] === major && version[1] >= minor));
  return [
    {
      item: version ? `Xcode ${version.join(".")}` : "Xcode",
      ok: recent,
      fix: version
        ? `Expo SDK 58 needs Xcode ${major}.${minor} or later: update Xcode in the App Store`
        : "Install Xcode from the Mac App Store (free), open it once, then run: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
    },
    {
      item: p.cocoapods ? `CocoaPods ${p.cocoapods}` : "CocoaPods",
      ok: !!p.cocoapods,
      fix: "Install it with: brew install cocoapods",
    },
    {
      item: "An Apple Development certificate",
      ok: p.identities.some((name) =>
        /^(Apple Development|iPhone Developer):/.test(name),
      ),
      fix: "In Xcode: Settings → Accounts → + to add your Apple ID; select its team, Manage Certificates → + → Apple Development",
    },
  ];
}

/**
 * The environment for prebuild and the build: FORGE Dev (APP_VARIANT), none
 * of Expo's own .env files (EXPO_NO_DOTENV) and no EXPO_PUBLIC_ value from
 * the shell, only `cloud` (the development project's values, for a Release
 * build), plus the Personal Team switch.
 */
export function iosBuildEnv(
  base: Record<string, string | undefined>,
  cloud: Record<string, string>,
  personalTeam: boolean,
): Record<string, string | undefined> {
  const env = devClientEnv(base, cloud);
  delete env.FORGE_PERSONAL_TEAM;
  if (personalTeam) env.FORGE_PERSONAL_TEAM = "1";
  // `prebuild --clean` replaces ios/, which is generated and git-ignored:
  // skip its question about uncommitted files.
  env.EXPO_NO_GIT_STATUS = "1";
  return env;
}

/** The Expo CLI commands, in order. */
export function iosCommands(o: IosBuildOptions): string[][] {
  const pickDevice = o.rest.some((a) => /^(-d|--device)(=|$)/.test(a))
    ? []
    : ["--device"];
  return [
    // ios/ always matches this build: its ID, entitlements and plugins.
    ["prebuild", "--platform", "ios", "--clean"],
    [
      "run:ios",
      "--no-bundler",
      ...(o.release ? ["--configuration", "Release"] : []),
      ...o.rest,
      ...pickDevice,
    ],
  ];
}
