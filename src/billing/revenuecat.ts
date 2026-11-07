import type { PeriodUnit, StoreProduct, SubscriptionPeriod } from "./plan";
import type {
  IntroEligibility,
  PurchaseOutcome,
  PurchaseProvider,
  RestoreOutcome,
  StoreProblem,
} from "./provider";

// RevenueCat's SDK as Forge's store (Phase 9.3), behind PurchaseProvider. The
// only file that knows RevenueCat's API; runtime.ts hands it the real module
// (react-native-purchases 10.16) and tests hand it a fake.
//
// - Configured once, then bound to the signed-in account: the App User ID is
//   the Supabase user ID, so RevenueCat (and Apple's appAccountToken) name
//   the Forge account, never a device.
// - What it reports (prices, eligibility, a purchase sheet's outcome) is only
//   for showing the paywall and as a cue to ask Forge's server. Its customer
//   info never decides access (service.ts, access.ts).
// - The membership is the monthly package of RevenueCat's current offering:
//   which App Store product that is stays the founder's choice (F16), made
//   in RevenueCat rather than in the app. plan.ts then refuses anything that
//   isn't the approved $6.99 monthly membership with a free week.

/** A store product as RevenueCat's SDK describes it (the fields Forge reads). */
export type RcProduct = {
  identifier: string;
  title: string;
  price: number;
  priceString: string;
  currencyCode: string;
  /** ISO 8601 ("P1M"). */
  subscriptionPeriod: string | null;
  introPrice: {
    price: number;
    cycles: number;
    /** "DAY" | "WEEK" | "MONTH" | "YEAR" */
    periodUnit: string;
    periodNumberOfUnits: number;
  } | null;
};

export type RcPackage = {
  identifier: string;
  packageType: string;
  product: RcProduct;
};

/** What Forge uses of RevenueCat's SDK; runtime.ts checks the real one against it. */
export type RevenueCatSdk = {
  configure(configuration: { apiKey: string; appUserID?: string | null }): void;
  isConfigured(): Promise<boolean>;
  logIn(appUserID: string): Promise<unknown>;
  logOut(): Promise<unknown>;
  getAppUserID(): Promise<string>;
  getOfferings(): Promise<{
    current: {
      monthly: RcPackage | null;
      availablePackages: RcPackage[];
    } | null;
  }>;
  getProducts(productIdentifiers: string[]): Promise<RcProduct[]>;
  checkTrialOrIntroductoryPriceEligibility(
    productIdentifiers: string[],
  ): Promise<Record<string, { status: number } | undefined>>;
  purchasePackage(aPackage: RcPackage): Promise<unknown>;
  purchaseStoreProduct(product: RcProduct): Promise<unknown>;
  restorePurchases(): Promise<unknown>;
  showManageSubscriptions(): Promise<void>;
  addCustomerInfoUpdateListener(listener: (info: unknown) => void): void;
  removeCustomerInfoUpdateListener(listener: (info: unknown) => void): boolean;
};

// RevenueCat's PURCHASES_ERROR_CODE values (stable across its SDKs).
const CANCELLED = "1";
const ALREADY_PURCHASED = "6";
const PAYMENT_PENDING = "20";
const LOG_OUT_ANONYMOUS = "22";
// INTRO_ELIGIBILITY_STATUS
const ELIGIBLE = 2;
const INELIGIBLE = 1;
const NO_INTRO_OFFER = 3;

const PROBLEMS: Record<string, StoreProblem> = {
  "10": "offline", // NETWORK_ERROR
  "35": "offline", // OFFLINE_CONNECTION_ERROR
  "3": "notAllowed", // PURCHASE_NOT_ALLOWED_ERROR (Screen Time, parental)
  "19": "notAllowed", // INSUFFICIENT_PERMISSIONS_ERROR
  "5": "productUnavailable", // PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR
  "7": "otherAccount", // RECEIPT_ALREADY_IN_USE_ERROR
  "13": "otherAccount", // RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR
  "40": "otherAccount", // PURCHASE_BELONGS_TO_OTHER_USER
  "2": "unavailable", // STORE_PROBLEM_ERROR
  "11": "unavailable", // INVALID_CREDENTIALS_ERROR
  "12": "unavailable", // UNEXPECTED_BACKEND_RESPONSE_ERROR
  "16": "unavailable", // UNKNOWN_BACKEND_ERROR
  "23": "unavailable", // CONFIGURATION_ERROR
  "24": "unavailable", // UNSUPPORTED_ERROR
  "33": "unavailable", // API_ENDPOINT_BLOCKED
};

function errorOf(e: unknown): { code?: string; userCancelled?: boolean } {
  const err = (e ?? {}) as { code?: unknown; userCancelled?: unknown };
  return {
    code:
      typeof err.code === "string"
        ? err.code
        : typeof err.code === "number"
          ? String(err.code)
          : undefined,
    userCancelled: err.userCancelled === true,
  };
}

/** Why the store refused, in Forge's terms. */
export const storeProblemOf = (e: unknown): StoreProblem =>
  PROBLEMS[errorOf(e).code ?? ""] ?? "unknown";

/** A purchase sheet's ending, from the error RevenueCat threw. */
export function purchaseOutcomeOf(e: unknown): PurchaseOutcome {
  const { code, userCancelled } = errorOf(e);
  if (userCancelled || code === CANCELLED) return { kind: "cancelled" };
  if (code === PAYMENT_PENDING) return { kind: "pending" };
  // The Apple Account already has it: Forge's server says what that means.
  if (code === ALREADY_PURCHASED) return { kind: "completed" };
  return { kind: "failed", problem: storeProblemOf(e) };
}

const UNITS: Record<string, PeriodUnit> = {
  D: "day",
  W: "week",
  M: "month",
  Y: "year",
};

/** "P1M" → one month; undefined when it isn't a plain ISO 8601 period. */
export function isoPeriod(
  iso: string | null | undefined,
): SubscriptionPeriod | undefined {
  const m = /^P(\d+)([DWMY])$/.exec(iso ?? "");
  const unit = m ? UNITS[m[2]!] : undefined;
  return m && unit ? { unit, count: Number(m[1]) } : undefined;
}

/** RevenueCat's product as plan.ts checks it. An unknown period never passes. */
export function storeProduct(p: RcProduct): StoreProduct {
  const intro = p.introPrice;
  const introUnit = intro
    ? UNITS[intro.periodUnit.trim().charAt(0).toUpperCase()]
    : undefined;
  return {
    id: p.identifier,
    title: p.title,
    priceString: p.priceString,
    price: p.price,
    currency: p.currencyCode,
    period: isoPeriod(p.subscriptionPeriod) ?? { unit: "month", count: 0 },
    ...(intro && introUnit
      ? {
          introOffer: {
            price: intro.price,
            period: { unit: introUnit, count: intro.periodNumberOfUnits },
            cycles: intro.cycles,
          },
        }
      : {}),
  };
}

export type RevenueCatOptions = {
  /** RevenueCat's public SDK key for this app (config.ts checks it). */
  apiKey: string;
  /** A Test Store key (and always in Expo Go): purchases are simulated. */
  simulated: boolean;
};

export type RevenueCatProvider = PurchaseProvider & {
  membership(): Promise<StoreProduct | undefined>;
  manage(): Promise<void>;
};

export function revenueCatProvider(
  sdk: RevenueCatSdk,
  { apiKey, simulated }: RevenueCatOptions,
): RevenueCatProvider {
  let configured: Promise<void> | undefined;
  let current: string | undefined;
  const packages = new Map<string, RcPackage>();
  const products = new Map<string, RcProduct>();

  // Configured once for the app's life (a second configure would replace the
  // SDK's state), as the first account to use it, or anonymously.
  function configure(appUserID?: string) {
    configured ??= (async () => {
      if (await sdk.isConfigured().catch(() => false)) return;
      sdk.configure({ apiKey, appUserID: appUserID ?? null });
      if (appUserID) current = appUserID;
    })().catch((e) => {
      configured = undefined;
      throw e;
    });
    return configured;
  }

  async function membership() {
    await configure(current);
    const offering = (await sdk.getOfferings()).current;
    const pkg =
      offering?.monthly ??
      offering?.availablePackages.find((p) => p.packageType === "MONTHLY");
    if (!pkg) return undefined;
    packages.set(pkg.product.identifier, pkg);
    products.set(pkg.product.identifier, pkg.product);
    return storeProduct(pkg.product);
  }

  return {
    simulated,
    async identify(userId) {
      await configure(userId);
      // The SDK's own customer, never the one last remembered here: a
      // sign-out that lands during a slow log-in leaves it anonymous.
      const now = await sdk.getAppUserID().catch(() => undefined);
      if (now !== userId) await sdk.logIn(userId);
      current = userId;
    },
    async reset() {
      // Never configured: nothing of any account is held.
      if (!configured) return;
      await configured;
      current = undefined;
      try {
        await sdk.logOut();
      } catch (e) {
        // Already anonymous: nothing to forget.
        if (errorOf(e).code !== LOG_OUT_ANONYMOUS) throw e;
      }
    },
    membership,
    async products(ids) {
      await configure(current);
      const found = await sdk.getProducts([...ids]);
      for (const p of found) products.set(p.identifier, p);
      return found.map(storeProduct);
    },
    async introEligibility(productId) {
      await configure(current);
      try {
        const status = (
          await sdk.checkTrialOrIntroductoryPriceEligibility([productId])
        )[productId]?.status;
        return status === ELIGIBLE
          ? "eligible"
          : status === INELIGIBLE || status === NO_INTRO_OFFER
            ? "ineligible"
            : "unknown";
      } catch {
        // Google Play and the Test Store can't say: promise nothing.
        return "unknown" satisfies IntroEligibility;
      }
    },
    async purchase(productId): Promise<PurchaseOutcome> {
      await configure(current);
      try {
        const pkg = packages.get(productId);
        if (pkg) await sdk.purchasePackage(pkg);
        else {
          const product =
            products.get(productId) ?? (await sdk.getProducts([productId]))[0];
          if (!product)
            return { kind: "failed", problem: "productUnavailable" };
          await sdk.purchaseStoreProduct(product);
        }
        return { kind: "completed" };
      } catch (e) {
        return purchaseOutcomeOf(e);
      }
    },
    async restore(): Promise<RestoreOutcome> {
      await configure(current);
      try {
        await sdk.restorePurchases();
        return { kind: "completed" };
      } catch (e) {
        return { kind: "failed", problem: storeProblemOf(e) };
      }
    },
    onStoreChange(listener) {
      const cue = () => listener();
      let added = false;
      let closed = false;
      void configure(current)
        .then(() => {
          if (closed) return;
          sdk.addCustomerInfoUpdateListener(cue);
          added = true;
        })
        .catch(() => undefined);
      return () => {
        closed = true;
        if (added) sdk.removeCustomerInfoUpdateListener(cue);
      };
    },
    async manage() {
      await configure(current);
      await sdk.showManageSubscriptions();
    },
  };
}
