import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

// Which social sign-in providers Forge's account service has enabled (Phase
// 7.7B.1), read from Supabase Auth's public settings endpoint with the
// publishable key. A provider's button is shown only when it is enabled
// there: nothing is offered that the account service would refuse.

export type AuthProviders = { apple: boolean; google: boolean };
export const NO_PROVIDERS: AuthProviders = { apple: false, google: false };

type Config = { url?: string; key?: string };
const config = (): Config => ({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

/**
 * The enabled providers, or undefined when they can't be read (offline,
 * not configured, an unexpected answer). Public settings only: no session,
 * no secret.
 */
export async function fetchAuthProviders(
  { url, key }: Config = config(),
  timeoutMs = 8000,
): Promise<AuthProviders | undefined> {
  if (!url || !key || !/^https:\/\//.test(url)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${url.replace(/\/+$/, "")}/auth/v1/settings`,
      { headers: { apikey: key }, signal: controller.signal },
    );
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      external?: Record<string, unknown>;
    };
    if (!body || typeof body.external !== "object" || !body.external)
      return undefined;
    return {
      apple: body.external.apple === true,
      google: body.external.google === true,
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// The last answer this launch. A failed read keeps it: being offline for a
// moment never hides a working provider, and never shows one that wasn't.
let known: AuthProviders | undefined;
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();

export function refreshAuthProviders() {
  pending ??= fetchAuthProviders()
    .then((p) => {
      if (!p) return;
      known = p;
      listeners.forEach((l) => l());
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const snapshot = () => known ?? NO_PROVIDERS;

/** The enabled providers, read again when Forge returns to the foreground. */
export function useAuthProviders() {
  const providers = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void refreshAuthProviders();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshAuthProviders();
    });
    return () => sub.remove();
  }, []);
  return providers;
}

/**
 * Which buttons the Welcome screen may show. Apple needs Forge's own signed
 * build on iOS: in Expo Go, Apple would sign in as Expo's app, creating an
 * identity that Forge's real app could never use again. Google needs a
 * return address Supabase will send the athlete back to.
 */
export function socialOptions(f: {
  platform: string;
  expoGo: boolean;
  appleAvailable: boolean;
  googleReturns: boolean;
  providers: AuthProviders;
}): AuthProviders {
  return {
    apple:
      f.platform === "ios" &&
      !f.expoGo &&
      f.appleAvailable &&
      f.providers.apple,
    google: f.providers.google && f.googleReturns,
  };
}
