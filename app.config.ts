import type { ConfigContext, ExpoConfig } from "expo/config";

// Which FORGE app a build is (Phase 8). app.json is the production app.
// APP_VARIANT=development is FORGE Dev and APP_VARIANT=preview FORGE Preview,
// each with its own bundle ID, package and link scheme: they install beside
// the production app, and a sign-in or email link only ever opens the app
// that asked for it. Every variant keeps the same icon, splash and plugins.
// Unset or "production": app.json exactly (Expo Go today).
// At runtime each app may use only its own Supabase environment; the IDs and
// schemes here are mirrored by src/cloud/environment.ts (and tested to match).

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

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = process.env.APP_VARIANT?.trim() || "production";
  if (variant === "production") return config as ExpoConfig;
  if (!Object.prototype.hasOwnProperty.call(VARIANTS, variant))
    throw new Error(
      `APP_VARIANT must be development, preview or production, not "${variant}"`,
    );
  const app = VARIANTS[variant as keyof typeof VARIANTS];
  return {
    ...config,
    name: app.name,
    scheme: app.scheme,
    ios: { ...config.ios, bundleIdentifier: app.id },
    android: { ...config.android, package: app.id },
  } as ExpoConfig;
};
