import { Linking, Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import type PurchasesModule from "react-native-purchases";
import { cloudClient } from "../cloud/client";
import { membershipSetup, type MembershipSetup } from "./config";
import type { PurchaseProvider } from "./provider";
import {
  revenueCatProvider,
  type RevenueCatProvider,
  type RevenueCatSdk,
} from "./revenuecat";
import { secureEntitlementCache } from "./secure-cache";
import { followAccount, type BillingDeps } from "./service";
import { serverVerifier, type VerifierClient } from "./verifier";

// Membership in the running app (Phase 9.3): the one place that knows React
// Native, RevenueCat's real SDK, the Supabase client and the account session.
// Everything it decides comes from the pure modules beside it.
//
// While membership is off (every build except an opted-in development build
// on FORGE DEV: config.ts) nothing here runs: RevenueCat's SDK is never even
// loaded, no listener is added, and Forge behaves exactly as before.

/** Apple's own page for managing subscriptions. */
export const MANAGE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions";

/** This build's membership setup (cheap; read on every use). */
export function membership(): MembershipSetup {
  return membershipSetup({
    // Literal reads: Expo inlines only `process.env.EXPO_PUBLIC_*` written out.
    values: {
      EXPO_PUBLIC_FORGE_ENV: process.env.EXPO_PUBLIC_FORGE_ENV,
      EXPO_PUBLIC_FORGE_MEMBERSHIP: process.env.EXPO_PUBLIC_FORGE_MEMBERSHIP,
      EXPO_PUBLIC_REVENUECAT_APPLE_KEY:
        process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY,
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY:
        process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY,
    },
    platform: Platform.OS,
    development: __DEV__,
    expoGo: isRunningInExpoGo(),
  });
}

export const membershipEnabled = () => membership().mode === "development";

/** The Terms of Use and Privacy Policy addresses (founder decision F15), when set. */
export function legalLinks(): { terms?: string; privacy?: string } {
  const https = (v: string | undefined) =>
    v && /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : undefined;
  return {
    terms: https(process.env.EXPO_PUBLIC_TERMS_OF_USE_URL),
    privacy: https(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL),
  };
}

// A build that can't use any store still verifies with Forge's server: an
// account's membership doesn't depend on this phone being able to buy one.
const NO_STORE: PurchaseProvider = {
  identify: async () => undefined,
  reset: async () => undefined,
  products: async () => [],
  introEligibility: async () => "unknown",
  purchase: async () => ({ kind: "failed", problem: "unavailable" }),
  restore: async () => ({ kind: "failed", problem: "unavailable" }),
  onStoreChange: () => () => undefined,
};

let store: RevenueCatProvider | undefined;

/** RevenueCat, created once for the app's life and only when membership runs. */
function revenueCat(apiKey: string, simulated: boolean) {
  if (!store) {
    // Required here rather than imported: builds with membership off never
    // evaluate the SDK. The assignments check it still matches what
    // revenuecat.ts uses.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require("react-native-purchases");
    const Purchases: typeof PurchasesModule = loaded.default;
    const sdk: RevenueCatSdk = Purchases;
    store = revenueCatProvider(sdk, { apiKey, simulated });
  }
  return store;
}

function serverClient(): VerifierClient | undefined {
  let client: ReturnType<typeof cloudClient>;
  try {
    client = cloudClient();
  } catch {
    return undefined;
  }
  if (!client) return undefined;
  const c = client;
  return {
    invoke: (name) => c.functions.invoke(name, { method: "POST" }),
    rpc: (name) => c.rpc(name),
  };
}

/**
 * The membership flows' parts, or undefined while membership is off.
 * `productId` matters only to a purchase (paywall.ts passes the offer's).
 */
export function membershipDeps(productId = ""): BillingDeps | undefined {
  const m = membership();
  if (m.mode !== "development") return undefined;
  return {
    provider: m.apiKey ? revenueCat(m.apiKey, !!m.simulated) : NO_STORE,
    verifier: serverVerifier(serverClient),
    cache: secureEntitlementCache,
    productId,
  };
}

let watching = false;

/**
 * Follows the account session once membership runs: a sign-in binds the
 * store to the account and asks the server; a sign-out, account switch or
 * deletion makes the store and this phone forget the previous account's
 * membership. One change at a time, in order (`followAccount`). Training
 * data is never touched.
 */
export function watchMembershipSession() {
  if (watching || !membershipEnabled()) return;
  let client: ReturnType<typeof cloudClient>;
  try {
    client = cloudClient();
  } catch {
    return;
  }
  if (!client) return;
  watching = true;
  const follow = followAccount(() => membershipDeps());
  client.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id;
    // Outside Supabase's auth callback: its own calls wait for it to finish.
    setTimeout(() => void follow(id).catch(() => undefined), 0);
  });
}

/** Apple's subscription management, or its web page where the SDK can't open it. */
export async function manageMembership() {
  const provider = membershipDeps()?.provider as
    Partial<RevenueCatProvider> | undefined;
  try {
    if (provider?.manage) return await provider.manage();
  } catch {
    // Expo Go and the Test Store can't open Apple's sheet.
  }
  await Linking.openURL(MANAGE_SUBSCRIPTIONS_URL);
}
