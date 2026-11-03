import type { ConfigContext, ExpoConfig } from "expo/config";
import {
  createRunOncePlugin,
  withInfoPlist,
  type ConfigPlugin,
} from "expo/config-plugins";

// Which FORGE app a build is (Phase 8). app.json is the production app.
// APP_VARIANT=development is FORGE Dev and APP_VARIANT=preview FORGE Preview,
// each with its own bundle ID, package and link scheme: they install beside
// the production app, and a sign-in or email link only ever opens the app
// that asked for it. Every variant keeps the same icon, splash and plugins.
// Unset or "production": app.json exactly (Expo Go today).
// At runtime each app may use only its own Supabase environment; the IDs and
// schemes here are mirrored by src/cloud/environment.ts (and tested to match).
//
// FORGE_PERSONAL_TEAM=1 (Phase 8.1, `npm run dev:ios`): FORGE Dev signed by a
// free Apple ID's Personal Team. Apple doesn't offer Sign in with Apple to
// Personal Teams, so this build leaves that capability out. It also registers
// its own bundle ID, because an ID a Personal Team has registered may be
// refused to a paid team later: FORGE Dev's and production's IDs stay free for
// the Apple Developer Program. FORGE Dev only; never the production app.

const VARIANTS = {
  development: {
    name: "FORGE Dev",
    id: "com.lsaint06.forge.dev",
    scheme: "forge-dev",
  },
  preview: {
    name: "FORGE Preview",
    id: "com.lsaint06.forge.preview",
    scheme: "forge-preview",
  },
} as const;

/** FORGE Dev's iOS bundle ID when a free Apple ID's Personal Team signs it. */
export const PERSONAL_TEAM_ID = "com.lsaint06.forge.dev.personal";

/**
 * Stands in for expo-apple-authentication's config plugin in a Personal Team
 * build: the same Info.plist setting, without the Sign in with Apple
 * entitlement. Registered under that plugin's name, so Expo applies the real
 * one neither from `plugins` nor automatically (a plugin runs only once).
 */
export const withoutSignInWithApple: ConfigPlugin = createRunOncePlugin(
  (config) =>
    withInfoPlist(config, (c) => {
      c.modResults.CFBundleAllowMixedLocalizations =
        c.modResults.CFBundleAllowMixedLocalizations ?? true;
      return c;
    }),
  "expo-apple-authentication",
);

function personalTeam() {
  const value = process.env.FORGE_PERSONAL_TEAM?.trim();
  if (!value) return false;
  if (value === "1") return true;
  throw new Error(`FORGE_PERSONAL_TEAM must be 1 or unset, not "${value}"`);
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT?.trim() || "production";
  const personal = personalTeam();
  if (personal && variant !== "development")
    throw new Error(
      "FORGE_PERSONAL_TEAM=1 builds FORGE Dev only (APP_VARIANT=development)",
    );
  if (variant === "production") return config as ExpoConfig;
  if (!Object.prototype.hasOwnProperty.call(VARIANTS, variant))
    throw new Error(
      `APP_VARIANT must be development, preview or production, not "${variant}"`,
    );
  const app = VARIANTS[variant as keyof typeof VARIANTS];
  const own = {
    ...config,
    name: app.name,
    scheme: app.scheme,
    ios: { ...config.ios, bundleIdentifier: app.id },
    android: { ...config.android, package: app.id },
  };
  if (!personal) return own as ExpoConfig;
  return withoutSignInWithApple({
    ...own,
    ios: { ...own.ios, bundleIdentifier: PERSONAL_TEAM_ID },
  } as ExpoConfig);
};
