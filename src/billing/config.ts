// Whether membership runs in this build, and with which store key (Phase
// 9.3). Pure: the app passes in its public values, its platform, whether it
// is a development build and whether it runs in Expo Go (runtime.ts), so every
// rule is tested in Node.
//
// - Membership runs only in development builds (__DEV__) against FORGE DEV,
//   and only when the developer opts in with EXPO_PUBLIC_FORGE_MEMBERSHIP=
//   development. Everywhere else (production, Expo Go on the production
//   project, release-compiled builds, any build without the opt-in) it is off
//   and Forge behaves exactly as before: no paywall, no purchase SDK, no gate
//   (founder directive 7.4).
// - The app only ever holds RevenueCat's public SDK keys: `appl_` for the App
//   Store, or `test_` for RevenueCat's Test Store. A secret key (`sk_`) or a
//   webhook secret is refused whatever variable it arrives in: those live only
//   in Forge's Edge Functions.
// - The Test Store simulates purchases. Expo Go can use nothing else (the App
//   Store isn't reachable there), and RevenueCat crashes release-compiled
//   builds that carry a Test Store key, which __DEV__ already excludes.
// - The approved membership is sold in the App Store only
//   (docs/SUBSCRIPTIONS.md). Google Play has no approved product, so Android
//   can only exercise the Test Store, never a real store.

export type MembershipMode = "off" | "development";

/** Why the store can't be used in this build, when it can't. */
export type StoreSetupProblem =
  /** Expo Go needs the Test Store key. */
  | "expoGoKey"
  /** No approved store for this platform and no Test Store key. */
  | "platform"
  /** No RevenueCat key at all. */
  | "noKey"
  /** A secret key was given to the app: it is refused, never used. */
  | "secretKey"
  /** A value that isn't the RevenueCat public key its variable names. */
  | "wrongKey";

export type MembershipSetup =
  | { mode: "off" }
  | {
      mode: "development";
      /** RevenueCat's public SDK key, when the store can be used here. */
      apiKey?: string;
      /** The Test Store: purchases are simulated and never sold. */
      simulated?: boolean;
      storeProblem?: StoreSetupProblem;
    };

/** The public values membership reads (each a literal process.env read in runtime.ts). */
export type MembershipValues = {
  EXPO_PUBLIC_FORGE_ENV?: string;
  EXPO_PUBLIC_FORGE_MEMBERSHIP?: string;
  EXPO_PUBLIC_REVENUECAT_APPLE_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY?: string;
};

/** RevenueCat secret keys (`sk_`) and anything named like a secret. */
export const isSecretKey = (key: string) =>
  /^sk_/i.test(key) || /secret|webhook/i.test(key);

/** RevenueCat's public SDK key for an App Store app. */
export const isAppleKey = (key: string) => /^appl_[A-Za-z0-9]{8,}$/.test(key);

/** RevenueCat's Test Store key: development builds only, never sold. */
export const isTestStoreKey = (key: string) =>
  /^test_[A-Za-z0-9]{8,}$/.test(key);

export function membershipSetup({
  values,
  platform,
  development,
  expoGo,
}: {
  values: MembershipValues;
  /** Platform.OS */
  platform: string;
  /** __DEV__ */
  development: boolean;
  /** isRunningInExpoGo() */
  expoGo: boolean;
}): MembershipSetup {
  const optedIn =
    development &&
    values.EXPO_PUBLIC_FORGE_ENV?.trim() === "development" &&
    values.EXPO_PUBLIC_FORGE_MEMBERSHIP?.trim() === "development";
  if (!optedIn) return { mode: "off" };
  const apple = values.EXPO_PUBLIC_REVENUECAT_APPLE_KEY?.trim() || undefined;
  const test =
    values.EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY?.trim() || undefined;
  if ((apple && isSecretKey(apple)) || (test && isSecretKey(test)))
    return { mode: "development", storeProblem: "secretKey" };
  if ((apple && !isAppleKey(apple)) || (test && !isTestStoreKey(test)))
    return { mode: "development", storeProblem: "wrongKey" };
  // A real store only where one is approved and reachable: the App Store,
  // from a development build on an iPhone.
  if (apple && platform === "ios" && !expoGo)
    return { mode: "development", apiKey: apple, simulated: false };
  if (test) return { mode: "development", apiKey: test, simulated: true };
  return {
    mode: "development",
    storeProblem: expoGo
      ? "expoGoKey"
      : platform !== "ios"
        ? "platform"
        : "noKey",
  };
}

/** What the paywall says when the store can't be used (development builds only). */
export const STORE_SETUP_TEXT: Record<StoreSetupProblem, string> = {
  expoGoKey:
    "Expo Go can only use RevenueCat's Test Store. Set EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY, or use a development build for the App Store.",
  platform:
    "Forge Premium is sold in the App Store. Google Play has no approved membership, so Android can only use RevenueCat's Test Store (EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY).",
  noKey:
    "This build has no RevenueCat key (EXPO_PUBLIC_REVENUECAT_APPLE_KEY or EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY).",
  secretKey:
    "This build was given a RevenueCat secret key. It's refused: an app only ever holds public SDK keys.",
  wrongKey:
    "A RevenueCat key isn't the public key its variable names (appl_ for the App Store, test_ for the Test Store).",
};
