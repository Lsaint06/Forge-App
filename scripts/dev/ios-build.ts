// FORGE Dev on the founder's iPhone, built by Xcode on this Mac and signed by
// the founder's Apple Developer Program team (Phase 8.1): the decisions
// behind `npm run dev:ios`, kept free of side effects so they can be tested.
// See docs/NATIVE_BUILDS.md.

import { APP_IDS, APP_SCHEMES } from "../../src/cloud/environment";
import { devClientEnv } from "./env-files";

/** FORGE Dev's bundle ID: the one development app in the runtime guard's table. */
export const FORGE_DEV_ID = Object.keys(APP_IDS).find(
  (id) => APP_IDS[id] === "development",
)!;

/** An Apple Developer team ID. */
export const TEAM_ID = /^[A-Z0-9]{10}$/;

export type IosBuildOptions = {
  /** The JavaScript is built into the app (Release): it opens without this Mac. */
  release: boolean;
  /** A Release build without the account service: accounts unavailable. */
  noCloud: boolean;
  /** Only report whether this Mac and the iPhone are ready. */
  check: boolean;
  /** Build, sign and check FORGE Dev without an iPhone; install nothing. */
  buildOnly: boolean;
  /** The team that signs FORGE Dev, when this Mac can't tell on its own. */
  team?: string;
  /** The iPhone, by name or UDID, when more than one is connected. */
  device?: string;
};

const FLAGS = {
  "--release": "release",
  "--no-cloud": "noCloud",
  "--check": "check",
  "--build-only": "buildOnly",
} as const;
const VALUES = { "--team": "team", "--device": "device" } as const;
const has = <T extends object>(
  table: T,
  key: string,
): key is keyof T & string => Object.prototype.hasOwnProperty.call(table, key);

export function parseIosArgs(
  argv: string[],
): { ok: true; options: IosBuildOptions } | { ok: false; problem: string } {
  const options: IosBuildOptions = {
    release: false,
    noCloud: false,
    check: false,
    buildOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (has(FLAGS, arg)) {
      options[FLAGS[arg]] = true;
      continue;
    }
    const eq = arg.indexOf("=");
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    if (has(VALUES, name)) {
      const value = (eq > 0 ? arg.slice(eq + 1) : argv[++i])?.trim();
      if (!value || value.startsWith("-"))
        return { ok: false, problem: `${name} needs a value` };
      options[VALUES[name]] = value;
      continue;
    }
    return {
      ok: false,
      problem: `${name} isn't an option: use --release, --no-cloud, --team <Team ID>, --device <iPhone name>, --build-only or --check`,
    };
  }
  if (options.team !== undefined) {
    options.team = options.team.toUpperCase();
    if (!TEAM_ID.test(options.team))
      return {
        ok: false,
        problem:
          "--team needs your 10-character Team ID (developer.apple.com → Account → Membership details)",
      };
  }
  if (options.buildOnly && options.device !== undefined)
    return {
      ok: false,
      problem: "--build-only installs on no iPhone: leave out --device",
    };
  if (options.noCloud && !options.release)
    return {
      ok: false,
      problem:
        "--no-cloud is for --release builds: a Debug build's JavaScript comes from npm run start:dev",
    };
  return { ok: true, options };
}

// ---- Xcode ----

/** Expo SDK 58's minimum (docs.expo.dev/versions, "Xcode version"). */
export const MIN_XCODE: readonly [number, number] = [26, 4];

/** "Xcode 27.2" → [27, 2]. */
export function xcodeVersion(line?: string): [number, number] | undefined {
  const match = /^Xcode (\d+)(?:\.(\d+))?/.exec(line?.trim() ?? "");
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : undefined;
}

/**
 * The Xcode to build with: DEVELOPER_DIR if it's set; otherwise the one
 * `xcode-select` chose, when that's a full Xcode; otherwise an installed
 * Xcode, used directly through DEVELOPER_DIR (`setEnv`), which needs no
 * administrator password, unlike `sudo xcode-select -s`.
 */
export function developerDir(p: {
  env?: string;
  selected?: string;
  xcodeApps: string[];
}): { dir: string; setEnv: boolean } | undefined {
  const env = p.env?.trim();
  if (env) return { dir: env, setEnv: false };
  const selected = p.selected?.trim();
  if (selected && /\.app\/Contents\/Developer\/?$/.test(selected))
    return { dir: selected, setEnv: false };
  const app = p.xcodeApps[0]?.replace(/\/+$/, "");
  return app ? { dir: `${app}/Contents/Developer`, setEnv: true } : undefined;
}

// ---- Signing ----

export type Identity = { sha1: string; name: string };

/** The identities in `security find-identity -v -p codesigning` output. */
export function parseIdentities(output: string): Identity[] {
  return [...output.matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"([^"]+)"/gm)].map(
    (m) => ({ sha1: m[1]!, name: m[2]! }),
  );
}

export type SigningTeam = { id: string; name?: string };
export const describeTeam = (t: SigningTeam) =>
  t.name ? `${t.name} (${t.id})` : t.id;

/** A development certificate's team (OU) and its name (O), from its subject. */
export function teamFromSubject(subject: string): SigningTeam | undefined {
  const field = (key: string) =>
    new RegExp(`^${key}=(.*)$`, "m").exec(subject)?.[1]?.trim() || undefined;
  const id = field("OU");
  return id && TEAM_ID.test(id) ? { id, name: field("O") } : undefined;
}

/** The teams this Mac can sign development builds for, one each. */
export function signingTeams(
  identities: Identity[],
  certificates: { sha1: string; subject: string }[],
): SigningTeam[] {
  const teams = new Map<string, SigningTeam>();
  for (const identity of identities) {
    if (!/^(Apple Development|iPhone Developer):/.test(identity.name)) continue;
    const certificate = certificates.find((c) => c.sha1 === identity.sha1);
    const team = certificate && teamFromSubject(certificate.subject);
    if (team && !teams.has(team.id)) teams.set(team.id, team);
  }
  return [...teams.values()];
}

/** Apple's current developer intermediate certificate (WWDR G3). */
export const WWDR_G3 =
  "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer";

export type TeamChoice =
  | { ok: true; team: SigningTeam; certificate: boolean }
  | { ok: false; problem: string };

/**
 * The team named with --team, or the one team this Mac has a valid
 * certificate for. `untrusted`: teams whose certificate is here but not
 * trusted yet (its Apple intermediate certificate is missing).
 */
export function chooseTeam(
  teams: SigningTeam[],
  wanted?: string,
  untrusted: SigningTeam[] = [],
): TeamChoice {
  if (wanted) {
    const known = teams.find((t) => t.id === wanted);
    return { ok: true, team: known ?? { id: wanted }, certificate: !!known };
  }
  if (teams.length === 1)
    return { ok: true, team: teams[0]!, certificate: true };
  if (teams.length > 1)
    return {
      ok: false,
      problem: `This Mac can sign for more than one team: choose yours with --team <Team ID> (${teams.map(describeTeam).join(", ")})`,
    };
  if (untrusted.length)
    return {
      ok: false,
      problem: `The Apple Development certificate for ${untrusted.map(describeTeam).join(", ")} isn't trusted on this Mac yet: Apple's intermediate certificate is missing. Download ${WWDR_G3}, double-click it to add it to your login keychain, then run this again`,
    };
  return {
    ok: false,
    problem:
      'No signing certificate yet. Either add --team <your Team ID> (developer.apple.com → Account → Membership details), and Xcode creates the certificate during the build; or in Xcode: Settings → Accounts → your Apple ID → your paid team (not "Personal Team") → Manage Certificates → + → Apple Development',
  };
}

// ---- The iPhone ----

export type Iphone = {
  name: string;
  udid: string;
  model?: string;
  os?: string;
  /** Paired and reachable now, as Expo decides. */
  reachable: boolean;
  developerMode?: string;
};

const record = (x: unknown): Record<string, unknown> =>
  x && typeof x === "object" ? (x as Record<string, unknown>) : {};
const text = (x: unknown) => (typeof x === "string" ? x : undefined);

/** The physical iOS devices in `xcrun devicectl list devices --json-output`. */
export function parseDevices(json: unknown): Iphone[] {
  const devices = record(record(json).result).devices;
  if (!Array.isArray(devices)) return [];
  return devices.flatMap((device): Iphone[] => {
    const hardware = record(record(device).hardwareProperties);
    const properties = record(record(device).deviceProperties);
    const connection = record(record(device).connectionProperties);
    const udid = text(hardware.udid);
    if (
      !udid ||
      hardware.reality === "simulated" ||
      hardware.platform !== "iOS"
    )
      return [];
    return [
      {
        name: text(properties.name) ?? text(hardware.marketingName) ?? "iPhone",
        udid,
        model: text(hardware.marketingName),
        os: text(properties.osVersionNumber),
        reachable:
          connection.pairingState === "paired" &&
          connection.tunnelState !== "unavailable",
        developerMode: text(properties.developerModeStatus),
      },
    ];
  });
}

export type IphoneChoice =
  { ok: true; device: Iphone } | { ok: false; problem: string };

/** The iPhone to install on: the one connected, or the one named with --device. */
export function chooseIphone(devices: Iphone[], wanted?: string): IphoneChoice {
  const quoted = (list: Iphone[]) => list.map((d) => `"${d.name}"`).join(", ");
  let candidates = devices;
  if (wanted) {
    const w = wanted.trim().toLowerCase();
    candidates = devices.filter(
      (d) => d.udid.toLowerCase() === w || d.name.toLowerCase() === w,
    );
    if (!candidates.length)
      return {
        ok: false,
        problem: `No paired iPhone is called "${wanted}"${devices.length ? ` (this Mac knows ${quoted(devices)})` : ""}`,
      };
  }
  const reachable = candidates.filter((d) => d.reachable);
  if (reachable.length > 1)
    return {
      ok: false,
      problem: `More than one iPhone is connected: choose one with --device "<name>" (${quoted(reachable)})`,
    };
  const device = reachable[0];
  if (!device)
    return {
      ok: false,
      problem: candidates.length
        ? `${quoted(candidates)} ${candidates.length > 1 ? "aren't" : "isn't"} connected right now: plug it into this Mac with a cable, unlock it, and tap Trust if it asks`
        : "Connect your iPhone to this Mac with a cable, unlock it, and tap Trust if it asks",
    };
  if (device.developerMode !== "enabled")
    return {
      ok: false,
      problem: `Turn on Developer Mode on "${device.name}": Settings → Privacy & Security → Developer Mode, then restart it`,
    };
  return { ok: true, device };
}

// ---- Readiness ----

export type ReadinessItem = { item: string; ok: boolean; fix?: string };

/** Each thing the build needs, and how to fix what's missing. */
export function iosReadiness(p: {
  platform: string;
  xcode?: string;
  cocoapods?: string;
  team: TeamChoice;
  /** "not needed" for --build-only. */
  iphone: IphoneChoice | "not needed";
}): ReadinessItem[] {
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
  const iphone = p.iphone;
  const device =
    iphone !== "not needed" && iphone.ok ? iphone.device : undefined;
  return [
    {
      item: version ? `Xcode ${version.join(".")}` : "Xcode",
      ok: recent,
      fix: version
        ? `Expo SDK 58 needs Xcode ${major}.${minor} or later: update Xcode in the App Store`
        : "Install Xcode from the Mac App Store and open it once",
    },
    {
      item: p.cocoapods ? `CocoaPods ${p.cocoapods}` : "CocoaPods",
      ok: !!p.cocoapods,
      fix: "Install it with: brew install cocoapods",
    },
    p.team.ok
      ? {
          item: `Signing team: ${describeTeam(p.team.team)}${p.team.certificate ? "" : " (Xcode creates its certificate during the build)"}`,
          ok: true,
        }
      : { item: "Signing team", ok: false, fix: p.team.problem },
    iphone === "not needed"
      ? { item: "iPhone: not needed (--build-only)", ok: true }
      : device
        ? {
            item: `iPhone: ${device.name} (${[device.model, device.os && `iOS ${device.os}`].filter(Boolean).join(", ")}), Developer Mode on`,
            ok: true,
          }
        : {
            item: "iPhone",
            ok: false,
            fix: iphone.ok ? undefined : iphone.problem,
          },
  ];
}

// ---- The build ----

/**
 * The environment for prebuild and the build: FORGE Dev (APP_VARIANT), none
 * of Expo's own .env files (EXPO_NO_DOTENV) and no EXPO_PUBLIC_ value from
 * the shell, only `cloud` (the development project's values, for a Release
 * build).
 */
export function iosBuildEnv(
  base: Record<string, string | undefined>,
  cloud: Record<string, string>,
  developer?: string,
): Record<string, string | undefined> {
  const env = devClientEnv(base, cloud);
  // `prebuild --clean` replaces ios/, which is generated and git-ignored:
  // skip its question about uncommitted files.
  env.EXPO_NO_GIT_STATUS = "1";
  // Xcode's build must never start a Metro of its own: it would read .env.
  env.RCT_NO_LAUNCH_PACKAGER = "1";
  if (developer) env.DEVELOPER_DIR = developer;
  return env;
}

/** Expo's prebuild: ios/ always matches this build (its ID, entitlements, plugins). */
export const PREBUILD = ["prebuild", "--platform", "ios", "--clean"];

/**
 * xcodebuild's options for FORGE Dev on one physical iPhone, or, without a
 * UDID (--build-only), for any iPhone: still signed for real devices.
 */
export function xcodebuildArgs(o: {
  workspace: string;
  scheme: string;
  release: boolean;
  udid?: string;
  team: string;
}): string[] {
  return [
    "-workspace",
    o.workspace,
    "-scheme",
    o.scheme,
    "-configuration",
    o.release ? "Release" : "Debug",
    // The iPhone itself, by its UDID, or any iPhone: never a simulator.
    "-destination",
    o.udid ? `id=${o.udid}` : "generic/platform=iOS",
    // Xcode's automatic signing for this team: it creates the App ID, the
    // certificate and the profile, and registers the iPhone, as needed.
    "-allowProvisioningUpdates",
    "-allowProvisioningDeviceRegistration",
    `DEVELOPMENT_TEAM=${o.team}`,
    "COMPILER_INDEX_STORE_ENABLE=NO",
  ];
}

/** The built app's path, from `xcodebuild -showBuildSettings -json`. */
export function appPathFromBuildSettings(json: unknown): string | undefined {
  if (!Array.isArray(json)) return undefined;
  for (const entry of json) {
    const settings = record(record(entry).buildSettings);
    const dir = text(settings.TARGET_BUILD_DIR);
    const name = text(settings.FULL_PRODUCT_NAME);
    if (settings.WRAPPER_EXTENSION === "app" && dir && name)
      return `${dir}/${name}`;
  }
  return undefined;
}

// ---- Checking the built app before it's installed ----

/**
 * Values that identify the project in Expo's own settings files (`.env` is
 * production today): its address, ref and key. Never printed.
 */
export function productionMarkers(
  files: Record<string, Record<string, string>>,
): string[] {
  const markers = new Set<string>();
  for (const vars of Object.values(files)) {
    const url = vars.EXPO_PUBLIC_SUPABASE_URL?.trim();
    if (url) {
      markers.add(url.replace(/\/+$/, ""));
      try {
        markers.add(new URL(url).hostname.split(".")[0]!);
      } catch {
        // Not an address: the value itself is enough.
      }
    }
    for (const name of [
      "EXPO_PUBLIC_SUPABASE_PROJECT_REF",
      "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]) {
      const value = vars[name]?.trim();
      if (value) markers.add(value);
    }
  }
  return [...markers].filter((value) => value.length >= 8);
}

export type BuiltApp = {
  bundleId?: string;
  urlSchemes: string[];
  /** The code signature's TeamIdentifier. */
  team?: string;
  entitlements: Record<string, unknown>;
  /** main.jsbundle: present only when the JavaScript is built in. */
  javascript?: Buffer;
  /** EXConstants.bundle/app.config: the app configuration built in. */
  appConfig?: Buffer;
  /** The embedded provisioning profile. */
  profile?: { team?: string; expires?: string; devices: string[] };
};

/** Why the built app must not be installed; empty when it's FORGE Dev as intended. */
export function builtAppProblems(
  app: BuiltApp,
  expected: {
    team: string;
    release: boolean;
    production: string[];
    /** The iPhone it's for (its UDID); none for --build-only. */
    device?: string;
  },
): string[] {
  const problems: string[] = [];
  const id = app.bundleId;
  if (!id || !has(APP_IDS, id) || APP_IDS[id] !== "development")
    problems.push(`Its bundle ID isn't FORGE Dev's (${id ?? "none"})`);
  if (!app.urlSchemes.includes(APP_SCHEMES.development))
    problems.push(
      `It doesn't answer FORGE Dev's ${APP_SCHEMES.development}: links`,
    );
  if (app.urlSchemes.includes(APP_SCHEMES.production))
    problems.push(
      `It answers the production app's ${APP_SCHEMES.production}: links`,
    );
  if (app.team !== expected.team)
    problems.push(`It's signed by another team (${app.team ?? "none"})`);
  if (app.entitlements["application-identifier"] !== `${expected.team}.${id}`)
    problems.push("Its signature doesn't match its bundle ID and team");
  if (!("com.apple.developer.applesignin" in app.entitlements))
    problems.push("It's missing the Sign in with Apple capability");
  if ("aps-environment" in app.entitlements)
    problems.push("It has the push capability, which Forge doesn't use");
  if (!app.profile) problems.push("It has no provisioning profile");
  else {
    if (app.profile.team !== expected.team)
      problems.push(
        `Its provisioning profile is another team's (${app.profile.team ?? "none"})`,
      );
    if (
      expected.device &&
      !app.profile.devices.some(
        (udid) => udid.toLowerCase() === expected.device!.toLowerCase(),
      )
    )
      problems.push("Its provisioning profile doesn't include this iPhone");
  }
  if (expected.release && !app.javascript)
    problems.push("Its JavaScript isn't built in, so it would need this Mac");
  for (const [what, content] of [
    ["JavaScript", app.javascript],
    ["app configuration", app.appConfig],
  ] as const)
    if (content && expected.production.some((value) => content.includes(value)))
      problems.push(
        `Its ${what} holds a value from Expo's own .env files (production)`,
      );
  return problems;
}

/** Plain next steps for the usual reasons a signed device build fails. */
export function buildFailureHints(log: string): string[] {
  const hints: string[] = [];
  if (
    /No Accounts?\b|No Account for Team|session has expired|sign in again/i.test(
      log,
    )
  )
    hints.push(
      "Xcode isn't signed in to your Apple Developer account: Xcode → Settings → Accounts, sign in, then run this again.",
    );
  if (/Personal development teams/i.test(log))
    hints.push(
      "That team is a Personal Team, which can't sign Sign in with Apple: use your paid team's ID with --team.",
    );
  if (
    /cannot be registered to your development team|is not available/i.test(log)
  )
    hints.push(
      `Apple refused the bundle ID ${FORGE_DEV_ID} for this team: another team may already own it. Nothing was installed; FORGE Dev needs a decision on its ID.`,
    );
  if (
    /errSecInternalComponent|User interaction is not allowed|unable to build chain/i.test(
      log,
    )
  )
    hints.push(
      "macOS didn't let Xcode use the signing key: unlock the Mac, answer its keychain dialog with Always Allow, then run this again.",
    );
  if (/no devices|no registered devices|Connect a device/i.test(log))
    hints.push(
      "Apple needs your iPhone registered with the team before it can sign: connect it and run this without --build-only (that registers it).",
    );
  if (/Developer Mode/i.test(log))
    hints.push(
      "Turn on Developer Mode on the iPhone: Settings → Privacy & Security → Developer Mode.",
    );
  return hints;
}
