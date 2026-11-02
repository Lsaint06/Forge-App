import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sessionStorage } from "../platform/sessionStorage";
import { AppState } from "react-native";
import { withTimeout } from "./transport";
export { transport } from "./transport";
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let client: SupabaseClient | null = null;
export function cloudClient() {
  if (!url || !key) return null;
  if (!/^https:\/\//.test(url)) throw new Error("Supabase URL must use HTTPS");
  if (!client) {
    client = createClient(url, key, {
      auth: {
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      // Every request, sign-in and data alike, gives up after a time limit
      // instead of waiting indefinitely (Phase 7.8B, H3).
      global: { fetch: withTimeout((input, init) => fetch(input, init)) },
    });
    const created = client;
    AppState.addEventListener("change", (state) => {
      if (state === "active") created.auth.startAutoRefresh();
      else created.auth.stopAutoRefresh();
    });
  }
  return client;
}

/**
 * A client that stores and refreshes nothing (Phase 7.8E): for checking a
 * password without touching this phone's session. One per check.
 */
export function verifierClient(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!/^https:\/\//.test(url)) throw new Error("Supabase URL must use HTTPS");
  return createClient(url, key, {
    auth: {
      storageKey: "forge-reauth",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: withTimeout((input, init) => fetch(input, init)) },
  });
}

/**
 * A client that acts only as the holder of `accessToken` and stores nothing
 * (Phase 7.8E): for requests that must go out as one particular account,
 * whatever this phone's own sign-in is at that moment.
 */
export function tokenClient(accessToken: string): SupabaseClient | null {
  if (!url || !key) return null;
  if (!/^https:\/\//.test(url)) throw new Error("Supabase URL must use HTTPS");
  return createClient(url, key, {
    accessToken: async () => accessToken,
    global: { fetch: withTimeout((input, init) => fetch(input, init)) },
  });
}
