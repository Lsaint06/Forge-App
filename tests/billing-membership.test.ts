import { test } from "node:test";
import assert from "node:assert/strict";
import { cacheKey } from "../src/billing/cache";
import { membershipSetup, type MembershipValues } from "../src/billing/config";
import { membershipOffer } from "../src/billing/offer";
import {
  LOAD_FAILED_TEXT,
  NOT_YET_TEXT,
  NO_OFFERING_TEXT,
  SIMULATED_TEXT,
  STORE_PROBLEM_TEXT,
  UNCONFIRMED_TEXT,
  afterCheck,
  afterPurchase,
  checkFromPaywall,
  loadPaywall,
  memberLines,
  purchaseFromPaywall,
  restoreFromPaywall,
  restoreText,
  statusLines,
  type PaywallState,
} from "../src/billing/paywall";
import { membershipProductProblems } from "../src/billing/plan";
import {
  VerifierError,
  type EntitlementVerifier,
  type PurchaseProvider,
} from "../src/billing/provider";
import {
  isoPeriod,
  purchaseOutcomeOf,
  revenueCatProvider,
  storeProduct,
  type RcPackage,
  type RcProduct,
  type RevenueCatSdk,
} from "../src/billing/revenuecat";
import {
  currentAccess,
  followAccount,
  verify,
  type BillingDeps,
} from "../src/billing/service";
import { replyProblem, serverVerifier } from "../src/billing/verifier";
import { A, B, DAY, MEMBERSHIP, PRODUCT, T0, billing } from "./billing-fixture";

// Phase 9.3: membership's gate and keys, the paywall's disclosures and
// states, Forge's server as the app asks it, and RevenueCat's SDK behind
// PurchaseProvider. Nothing external: RevenueCat's SDK is a fake with the
// real 10.16 API (src/billing/revenuecat.ts checks the shape), and Forge's
// server and the App Store are the Phase 9.1 doubles.

const APPLE = "appl_AbCdEfGh12345678";
const TEST_STORE = "test_AbCdEfGh12345678";
const OPTED: MembershipValues = {
  EXPO_PUBLIC_FORGE_ENV: "development",
  EXPO_PUBLIC_FORGE_MEMBERSHIP: "development",
};
const setup = (
  values: MembershipValues,
  platform = "ios",
  { development = true, expoGo = false } = {},
) => membershipSetup({ values, platform, development, expoGo });

// ---- The gate and the keys --------------------------------------------------

test("membership is off everywhere but an opted-in development build on FORGE DEV", () => {
  const keys = { EXPO_PUBLIC_REVENUECAT_APPLE_KEY: APPLE };
  assert.deepEqual(setup({}), { mode: "off" });
  assert.deepEqual(setup({ ...keys }), { mode: "off" });
  // Production's environment, even when opted in.
  assert.deepEqual(
    setup({ ...OPTED, ...keys, EXPO_PUBLIC_FORGE_ENV: "production" }),
    { mode: "off" },
  );
  // No opt-in, or another value.
  assert.deepEqual(
    setup({ ...OPTED, ...keys, EXPO_PUBLIC_FORGE_MEMBERSHIP: "on" }),
    { mode: "off" },
  );
  // A release-compiled build (FORGE Preview, TestFlight, the App Store).
  assert.deepEqual(
    setup({ ...OPTED, ...keys }, "ios", { development: false }),
    {
      mode: "off",
    },
  );
  assert.equal(setup({ ...OPTED, ...keys }).mode, "development");
});

test("the App Store key serves an iPhone development build; Expo Go only the Test Store", () => {
  const apple = { ...OPTED, EXPO_PUBLIC_REVENUECAT_APPLE_KEY: APPLE };
  const both = { ...apple, EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY: TEST_STORE };
  assert.deepEqual(setup(apple), {
    mode: "development",
    apiKey: APPLE,
    simulated: false,
  });
  // Expo Go can't reach the App Store: RevenueCat refuses an appl_ key there.
  assert.deepEqual(setup(apple, "ios", { expoGo: true }), {
    mode: "development",
    storeProblem: "expoGoKey",
  });
  assert.deepEqual(setup(both, "ios", { expoGo: true }), {
    mode: "development",
    apiKey: TEST_STORE,
    simulated: true,
  });
  // A development build still prefers the real store when it has its key.
  assert.deepEqual(setup(both), {
    mode: "development",
    apiKey: APPLE,
    simulated: false,
  });
});

test("Android has no approved store: only the Test Store, never a Google key", () => {
  const test = { ...OPTED, EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY: TEST_STORE };
  assert.deepEqual(setup(test, "android"), {
    mode: "development",
    apiKey: TEST_STORE,
    simulated: true,
  });
  assert.deepEqual(
    setup({ ...OPTED, EXPO_PUBLIC_REVENUECAT_APPLE_KEY: APPLE }, "android"),
    { mode: "development", storeProblem: "platform" },
  );
  assert.deepEqual(setup(OPTED, "android"), {
    mode: "development",
    storeProblem: "platform",
  });
  assert.deepEqual(setup(OPTED), {
    mode: "development",
    storeProblem: "noKey",
  });
});

test("a secret or mismatched key is refused, whichever variable it arrives in", () => {
  for (const values of [
    { EXPO_PUBLIC_REVENUECAT_APPLE_KEY: "sk_AbCdEfGh12345678" },
    { EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY: "sk_AbCdEfGh12345678" },
    { EXPO_PUBLIC_REVENUECAT_APPLE_KEY: "my-webhook-secret-value" },
  ])
    assert.deepEqual(setup({ ...OPTED, ...values }), {
      mode: "development",
      storeProblem: "secretKey",
    });
  for (const values of [
    { EXPO_PUBLIC_REVENUECAT_APPLE_KEY: "goog_AbCdEfGh12345678" },
    { EXPO_PUBLIC_REVENUECAT_APPLE_KEY: TEST_STORE },
    { EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY: APPLE },
  ])
    assert.deepEqual(setup({ ...OPTED, ...values }), {
      mode: "development",
      storeProblem: "wrongKey",
    });
});

// ---- What the paywall discloses ---------------------------------------------

test("the free week is promised only to an Apple Account StoreKit calls eligible", () => {
  const eligible = membershipOffer(MEMBERSHIP, "eligible");
  assert.ok(eligible.ok);
  assert.equal(eligible.offer.price, "$6.99");
  assert.equal(eligible.offer.period, "month");
  assert.equal(eligible.offer.trialDays, 7);
  assert.equal(eligible.offer.trialLine, "7 days free, then $6.99 a month");
  assert.equal(
    eligible.offer.renewal,
    "7 days free, then $6.99 a month. Cancel anytime.",
  );
  assert.equal(eligible.offer.action, "Start free trial");
  assert.equal(
    eligible.offer.spoken,
    "Forge Premium: $6.99 a month, after 7 days free",
  );
  assert.match(
    eligible.offer.terms[0]!,
    /^Free for 7 days, then \$6\.99 a month\./,
  );
  for (const eligibility of ["ineligible", "unknown"] as const) {
    const r = membershipOffer(MEMBERSHIP, eligibility);
    assert.ok(r.ok);
    assert.equal(r.offer.trialDays, undefined);
    assert.equal(r.offer.trialLine, undefined);
    assert.equal(r.offer.action, "Subscribe");
    assert.equal(
      r.offer.renewal,
      "Billed when you confirm, then every month until you cancel.",
    );
    assert.doesNotMatch(r.offer.terms.join(" "), /free/i);
    assert.match(
      r.offer.terms[0]!,
      /^\$6\.99 a month, charged to your Apple Account when you confirm/,
    );
  }
});

test("renewal, cancellation and the kept period are stated before anything is bought", () => {
  const r = membershipOffer(MEMBERSHIP, "eligible");
  assert.ok(r.ok);
  const terms = r.offer.terms.join(" ");
  assert.match(terms, /until you cancel/);
  assert.match(terms, /Settings › Apple Account › Subscriptions/);
  assert.match(terms, /at least 24 hours before a renewal/);
  assert.match(
    terms,
    /Canceling keeps Forge Premium until the end of the period/,
  );
  assert.match(terms, /Your training is always kept/);
});

test("the store's own localized price and name are shown as they come", () => {
  const euro = membershipOffer(
    {
      ...MEMBERSHIP,
      title: "Forge Premium Monthly",
      priceString: "6,99 €",
      currency: "EUR",
    },
    "eligible",
  );
  assert.ok(euro.ok);
  assert.equal(euro.offer.price, "6,99 €");
  assert.equal(euro.offer.title, "Forge Premium Monthly");
  assert.equal(euro.offer.trialLine, "7 days free, then 6,99 € a month");
});

test("a product other than the approved membership is refused, never described", () => {
  for (const product of [
    { ...MEMBERSHIP, period: { unit: "year" as const, count: 1 } },
    { ...MEMBERSHIP, price: 9.99, priceString: "$9.99" },
    { ...MEMBERSHIP, introOffer: undefined },
    {
      ...MEMBERSHIP,
      introOffer: {
        price: 0.99,
        period: { unit: "week" as const, count: 1 },
        cycles: 1,
      },
    },
    {
      ...MEMBERSHIP,
      introOffer: {
        price: 0,
        period: { unit: "day" as const, count: 3 },
        cycles: 1,
      },
    },
  ]) {
    const r = membershipOffer(product, "eligible");
    assert.equal(r.ok, false);
  }
});

// ---- Forge's server, as the app asks it ------------------------------------

test("why the server gave no answer: the connection, the sign-in or the service", () => {
  const cases: [unknown, string][] = [
    [
      { name: "FunctionsFetchError", message: "Failed to send a request" },
      "offline",
    ],
    [{ name: "FunctionsHttpError", context: { status: 401 } }, "auth"],
    [{ name: "FunctionsHttpError", context: { status: 403 } }, "auth"],
    [{ name: "FunctionsHttpError", context: { status: 404 } }, "unavailable"],
    [{ name: "FunctionsHttpError", context: { status: 503 } }, "unavailable"],
    [
      {
        name: "FunctionsRelayError",
        message: "Relay Error invoking the Edge Function",
      },
      "unavailable",
    ],
    [
      {
        code: "PGRST202",
        message: "Could not find the function public.forge_entitlement",
      },
      "unavailable",
    ],
    [{ code: "42501", message: "permission denied" }, "auth"],
    [{ code: "PGRST301", message: "JWT expired" }, "auth"],
    [new TypeError("Network request failed"), "offline"],
    [{ name: "AbortError", message: "Aborted" }, "offline"],
    [{ name: "TimeoutError", message: "Timed out" }, "offline"],
    [{ message: "Something else" }, "unavailable"],
  ];
  for (const [error, problem] of cases)
    assert.equal(replyProblem(error), problem, JSON.stringify(error));
});

test("the verifier asks the right function, returns only raw data and names failures", async () => {
  const asked: string[] = [];
  const answer = { user_id: A, server_now: T0, entitlement: null };
  const verifier = serverVerifier(() => ({
    invoke: async (name) => {
      asked.push(`invoke ${name}`);
      return { data: answer, error: null };
    },
    rpc: async (name) => {
      asked.push(`rpc ${name}`);
      return { data: null, error: { code: "PGRST202", message: "not found" } };
    },
  }));
  assert.deepEqual(await verifier.refresh(), answer);
  await assert.rejects(
    verifier.read(),
    (e: unknown) => e instanceof VerifierError && e.problem === "unavailable",
  );
  assert.deepEqual(asked, [
    "invoke entitlement-refresh",
    "rpc forge_entitlement",
  ]);
  // No Supabase client in this build: nothing to ask.
  const none = serverVerifier(() => undefined);
  await assert.rejects(
    none.refresh(),
    (e: unknown) => e instanceof VerifierError && e.problem === "unavailable",
  );
  // A request that throws is classified too.
  const thrown = serverVerifier(() => ({
    invoke: async () => {
      throw new TypeError("Network request failed");
    },
    rpc: async () => ({ data: null, error: null }),
  }));
  await assert.rejects(
    thrown.refresh(),
    (e: unknown) => e instanceof VerifierError && e.problem === "offline",
  );
});

test("today's undeployed server grants nothing: every answer is unavailable", async () => {
  const { deps, phone } = billing();
  const offline = {
    ...deps,
    verifier: serverVerifier(() => ({
      invoke: async () => ({
        data: null,
        error: { name: "FunctionsHttpError", context: { status: 404 } },
      }),
      rpc: async () => ({
        data: null,
        error: { code: "PGRST202", message: "not found" },
      }),
    })),
  };
  const v = await verify(offline, phone.user);
  assert.deepEqual(v, {
    access: { kind: "unverified", reason: "missing" },
    problem: "unavailable",
  });
  assert.deepEqual(await currentAccess(offline, phone.user), {
    kind: "unverified",
    reason: "missing",
  });
});

// ---- RevenueCat's SDK behind PurchaseProvider --------------------------------

const RC_PRODUCT: RcProduct = {
  identifier: PRODUCT,
  title: "Forge Premium",
  price: 6.99,
  priceString: "$6.99",
  currencyCode: "USD",
  subscriptionPeriod: "P1M",
  introPrice: {
    price: 0,
    cycles: 1,
    periodUnit: "WEEK",
    periodNumberOfUnits: 1,
  },
};
const MONTHLY: RcPackage = {
  identifier: "$rc_monthly",
  packageType: "MONTHLY",
  product: RC_PRODUCT,
};

function fakeSdk() {
  const calls: string[] = [];
  const listeners = new Set<(info: unknown) => void>();
  const state = {
    configured: false,
    appUserID: "$RCAnonymousID:first",
    offering: {
      monthly: MONTHLY as RcPackage | null,
      availablePackages: [MONTHLY],
    } as { monthly: RcPackage | null; availablePackages: RcPackage[] } | null,
    eligibility: 2 as number | Error,
    configureError: undefined as unknown,
    purchaseError: undefined as unknown,
    restoreError: undefined as unknown,
    logOutError: undefined as unknown,
  };
  const sdk: RevenueCatSdk = {
    configure(c) {
      calls.push(`configure ${c.apiKey} ${c.appUserID ?? "anonymous"}`);
      if (state.configureError) throw state.configureError;
      state.configured = true;
      if (c.appUserID) state.appUserID = c.appUserID;
    },
    isConfigured: async () => state.configured,
    logIn: async (id) => {
      calls.push(`logIn ${id}`);
      state.appUserID = id;
      return { created: false };
    },
    logOut: async () => {
      calls.push("logOut");
      if (state.logOutError) throw state.logOutError;
      state.appUserID = "$RCAnonymousID:next";
      return {};
    },
    getAppUserID: async () => state.appUserID,
    getOfferings: async () => ({ current: state.offering }),
    getProducts: async (ids) =>
      [RC_PRODUCT].filter((p) => ids.includes(p.identifier)),
    checkTrialOrIntroductoryPriceEligibility: async (ids) => {
      if (state.eligibility instanceof Error) throw state.eligibility;
      const status = state.eligibility;
      return Object.fromEntries(ids.map((id) => [id, { status }]));
    },
    purchasePackage: async (p) => {
      calls.push(`purchasePackage ${p.identifier}`);
      if (state.purchaseError) throw state.purchaseError;
      return {};
    },
    purchaseStoreProduct: async (p) => {
      calls.push(`purchaseStoreProduct ${p.identifier}`);
      if (state.purchaseError) throw state.purchaseError;
      return {};
    },
    restorePurchases: async () => {
      calls.push("restorePurchases");
      if (state.restoreError) throw state.restoreError;
      return {};
    },
    showManageSubscriptions: async () => {
      calls.push("showManageSubscriptions");
    },
    addCustomerInfoUpdateListener: (l) => {
      listeners.add(l);
    },
    removeCustomerInfoUpdateListener: (l) => listeners.delete(l),
  };
  return { sdk, calls, state, listeners };
}

const rc = (sdk: RevenueCatSdk, simulated = false) =>
  revenueCatProvider(sdk, { apiKey: APPLE, simulated });

test("RevenueCat is configured once, as the first account to use it", async () => {
  const { sdk, calls } = fakeSdk();
  const store = rc(sdk);
  await Promise.all([store.identify(A), store.identify(A), store.membership()]);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("configure")),
    [`configure ${APPLE} ${A}`],
  );
  // Already the SDK's customer: no second log-in.
  assert.equal(calls.filter((c) => c.startsWith("logIn")).length, 0);
  // A second provider in the same app (a fast refresh) finds it configured.
  await rc(sdk).identify(A);
  assert.equal(calls.filter((c) => c.startsWith("configure")).length, 1);
});

test("switching accounts moves the store's customer; signing out forgets it", async () => {
  const { sdk, calls, state } = fakeSdk();
  const store = rc(sdk);
  await store.identify(A);
  await store.identify(B);
  assert.equal(state.appUserID, B);
  await store.reset();
  assert.ok(calls.includes("logOut"));
  assert.match(state.appUserID, /^\$RCAnonymousID/);
  await store.identify(A);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("logIn")),
    [`logIn ${B}`, `logIn ${A}`],
  );
});

test("a sign-out during a slow sign-in can't leave the next purchase on an anonymous customer", async () => {
  const { sdk, state } = fakeSdk();
  const store = rc(sdk);
  await store.identify(B);
  // RevenueCat logs A in at once but answers late; the account signs out
  // meanwhile, and that log-out lands last.
  const logIn = sdk.logIn;
  let answer = () => {};
  sdk.logIn = async (id) => {
    const result = await logIn(id);
    await new Promise<void>((resolve) => (answer = resolve));
    return result;
  };
  const signingIn = store.identify(A);
  await new Promise((resolve) => setImmediate(resolve));
  await store.reset();
  answer();
  await signingIn;
  assert.match(state.appUserID, /^\$RCAnonymousID/);
  // A signs in again before buying: the store's customer is A, whatever the
  // provider last remembered.
  sdk.logIn = logIn;
  await store.identify(A);
  assert.equal(state.appUserID, A);
});

test("signing out an anonymous customer is not an error; anything else is", async () => {
  const { sdk, calls, state } = fakeSdk();
  const store = rc(sdk);
  // Never configured: nothing of any account is held, nothing is called.
  await store.reset();
  assert.deepEqual(calls, []);
  await store.identify(A);
  state.logOutError = {
    code: "22",
    message: "LogOut was called but the current user is anonymous.",
  };
  await store.reset();
  state.logOutError = { code: "10", message: "Network error" };
  await assert.rejects(store.reset());
});

// ---- Following the account (the session watcher) ------------------------------

const settle = () => new Promise((resolve) => setImmediate(resolve));
const MEMBER = {
  [PRODUCT]: { purchased: T0, expires: T0 + 7 * DAY, trial: true },
};

/**
 * Forge's server answering only when told to. Each answer is about the
 * account that sent the request, as the real server's is.
 */
function heldServer(b: ReturnType<typeof billing>) {
  const waiting: (() => void)[] = [];
  const verifier: EntitlementVerifier = {
    async refresh() {
      const asker = b.phone.user;
      await new Promise<void>((answer) => waiting.push(answer));
      return b.server.verifier(() => asker).refresh();
    },
    read: () => b.server.verifier(() => b.phone.user).read(),
  };
  return { deps: { ...b.deps, verifier }, answer: () => waiting.shift()?.() };
}

test("signing out or switching while the server answers: the answer for the account that left isn't kept", async () => {
  const out = billing();
  out.server.rc.set(A, MEMBER);
  const outServer = heldServer(out);
  const followOut = followAccount(() => outServer.deps);
  const signingIn = followOut(A);
  await settle();
  await followOut(undefined);
  outServer.answer();
  await signingIn;
  assert.equal(out.memory.data.size, 0);
  assert.equal(out.store.identified, undefined);

  const sw = billing();
  sw.server.rc.set(A, MEMBER);
  sw.server.rc.set(B, MEMBER);
  const swServer = heldServer(sw);
  const follow = followAccount(() => swServer.deps);
  const first = follow(A);
  await settle();
  sw.phone.user = B;
  const second = follow(B);
  await settle();
  // A's answer arrives after B signed in, then B's.
  swServer.answer();
  swServer.answer();
  await Promise.all([first, second]);
  assert.equal(sw.memory.data.has(cacheKey(A)!), false);
  assert.equal(sw.memory.data.has(cacheKey(B)!), true);
  assert.equal(sw.store.identified, B);
});

test("the store's log-out and log-in take turns, in the order the account changed", async () => {
  const b = billing();
  // RevenueCat answers A's log-in late; B signs in meanwhile.
  let loggedIn = () => {};
  const provider: PurchaseProvider = {
    ...b.store.provider,
    identify: async (userId) => {
      if (userId === A) await new Promise<void>((done) => (loggedIn = done));
      return b.store.provider.identify(userId);
    },
  };
  const follow = followAccount(() => ({ ...b.deps, provider }));
  const first = follow(A);
  await settle();
  b.phone.user = B;
  const second = follow(B);
  await settle();
  loggedIn();
  await Promise.all([first, second]);
  assert.equal(b.store.identified, B);
  assert.deepEqual(b.store.log, [`identify ${A}`, "reset", `identify ${B}`]);
});

test("the membership is the current offering's monthly package, checked against the plan", async () => {
  const { sdk, state } = fakeSdk();
  const store = rc(sdk);
  const product = await store.membership();
  assert.deepEqual(product, {
    id: PRODUCT,
    title: "Forge Premium",
    priceString: "$6.99",
    price: 6.99,
    currency: "USD",
    period: { unit: "month", count: 1 },
    introOffer: { price: 0, period: { unit: "week", count: 1 }, cycles: 1 },
  });
  assert.deepEqual(membershipProductProblems(product!), []);
  // Found among the packages when the offering names no monthly one.
  state.offering = { monthly: null, availablePackages: [MONTHLY] };
  assert.equal((await store.membership())?.id, PRODUCT);
  state.offering = { monthly: null, availablePackages: [] };
  assert.equal(await store.membership(), undefined);
  state.offering = null;
  assert.equal(await store.membership(), undefined);
});

test("an unreadable period never passes as a month", () => {
  assert.deepEqual(isoPeriod("P1M"), { unit: "month", count: 1 });
  assert.deepEqual(isoPeriod("P7D"), { unit: "day", count: 7 });
  assert.equal(isoPeriod("P1M2D"), undefined);
  assert.equal(isoPeriod(null), undefined);
  const odd = storeProduct({ ...RC_PRODUCT, subscriptionPeriod: null });
  assert.ok(
    membershipProductProblems(odd).includes(
      "The membership renews every month",
    ),
  );
  const noTrial = storeProduct({ ...RC_PRODUCT, introPrice: null });
  assert.ok(
    membershipProductProblems(noTrial).includes(
      "The membership starts with a free week",
    ),
  );
});

test("StoreKit's eligibility answer, and nothing promised when it can't say", async () => {
  const { sdk, state } = fakeSdk();
  const store = rc(sdk);
  const ask = () => store.introEligibility(PRODUCT);
  state.eligibility = 2;
  assert.equal(await ask(), "eligible");
  state.eligibility = 1;
  assert.equal(await ask(), "ineligible");
  state.eligibility = 3; // no introductory offer exists
  assert.equal(await ask(), "ineligible");
  state.eligibility = 0;
  assert.equal(await ask(), "unknown");
  state.eligibility = new Error(
    "checkTrialOrIntroductoryPriceEligibility is not supported on web platform.",
  );
  assert.equal(await ask(), "unknown");
});

test("a purchase buys the offering's package; another product is looked up first", async () => {
  const { sdk, calls } = fakeSdk();
  const store = rc(sdk);
  await store.membership();
  assert.deepEqual(await store.purchase(PRODUCT), { kind: "completed" });
  assert.ok(calls.includes("purchasePackage $rc_monthly"));
  const fresh = fakeSdk();
  const other = rc(fresh.sdk);
  assert.deepEqual(await other.purchase(PRODUCT), { kind: "completed" });
  assert.ok(fresh.calls.includes(`purchaseStoreProduct ${PRODUCT}`));
  assert.deepEqual(await other.purchase("not.a.product"), {
    kind: "failed",
    problem: "productUnavailable",
  });
});

test("every way Apple's sheet can end, in Forge's terms", () => {
  const cases: [unknown, unknown][] = [
    [{ code: "1", userCancelled: true }, { kind: "cancelled" }],
    [{ code: "1", userCancelled: null }, { kind: "cancelled" }],
    [{ code: "0", userCancelled: true }, { kind: "cancelled" }],
    [{ code: "20" }, { kind: "pending" }],
    [{ code: "6" }, { kind: "completed" }],
    [{ code: "10" }, { kind: "failed", problem: "offline" }],
    [{ code: "35" }, { kind: "failed", problem: "offline" }],
    [{ code: "3" }, { kind: "failed", problem: "notAllowed" }],
    [
      { code: "5", userCancelled: false },
      { kind: "failed", problem: "productUnavailable" },
    ],
    [{ code: "7" }, { kind: "failed", problem: "otherAccount" }],
    [{ code: "13" }, { kind: "failed", problem: "otherAccount" }],
    [{ code: "40" }, { kind: "failed", problem: "otherAccount" }],
    [{ code: "2" }, { kind: "failed", problem: "unavailable" }],
    [{ code: "23" }, { kind: "failed", problem: "unavailable" }],
    [{ code: "42" }, { kind: "failed", problem: "unknown" }],
    [new Error("boom"), { kind: "failed", problem: "unknown" }],
    [undefined, { kind: "failed", problem: "unknown" }],
  ];
  for (const [error, outcome] of cases)
    assert.deepEqual(purchaseOutcomeOf(error), outcome, JSON.stringify(error));
});

test("restore reports the store's own failure, and an Apple Account owned elsewhere", async () => {
  const { sdk, state } = fakeSdk();
  const store = rc(sdk);
  assert.deepEqual(await store.restore(), { kind: "completed" });
  state.restoreError = {
    code: "7",
    message: "The receipt is already in use by another subscriber.",
  };
  assert.deepEqual(await store.restore(), {
    kind: "failed",
    problem: "otherAccount",
  });
  state.restoreError = { code: "35" };
  assert.deepEqual(await store.restore(), {
    kind: "failed",
    problem: "offline",
  });
});

test("the store's changes are cues only while someone listens", async () => {
  const { sdk, listeners } = fakeSdk();
  const store = rc(sdk);
  let cues = 0;
  const stop = store.onStoreChange(() => cues++);
  await store.identify(A);
  await new Promise((r) => setImmediate(r));
  assert.equal(listeners.size, 1);
  listeners.forEach((l) => l({}));
  assert.equal(cues, 1);
  stop();
  assert.equal(listeners.size, 0);
  // Stopped before RevenueCat was ready: never added at all.
  const quick = fakeSdk();
  const late = rc(quick.sdk);
  late.onStoreChange(() => cues++)();
  await new Promise((r) => setImmediate(r));
  assert.equal(quick.listeners.size, 0);
});

test("a configuration RevenueCat refuses fails the call and is tried again next time", async () => {
  const { sdk, state, calls } = fakeSdk();
  // What Expo Go does with an App Store key.
  state.configureError = new Error(
    "Invalid API key. The native store is not available when running inside Expo Go",
  );
  const store = rc(sdk);
  await assert.rejects(store.membership());
  state.configureError = undefined;
  assert.equal((await store.membership())?.id, PRODUCT);
  assert.equal(calls.filter((c) => c.startsWith("configure")).length, 2);
});

test("Apple's subscription management opens from the store", async () => {
  const { sdk, calls } = fakeSdk();
  await rc(sdk).manage();
  assert.ok(calls.includes("showManageSubscriptions"));
});

// ---- The paywall's states ------------------------------------------------------

const withOffer = (
  deps: BillingDeps,
  more: Partial<PurchaseProvider> = {},
  product = MEMBERSHIP,
): BillingDeps => ({
  ...deps,
  provider: { ...deps.provider, membership: async () => product, ...more },
});

const offer = (() => {
  const r = membershipOffer(MEMBERSHIP, "eligible");
  if (!r.ok) throw new Error("fixture");
  return r.offer;
})();

test("the paywall opens on the store's offer, checked against the approved plan", async () => {
  const { deps, phone, store } = billing();
  const ready = await loadPaywall(withOffer(deps), phone.user);
  assert.equal(ready.kind, "ready");
  assert.equal(
    ready.kind === "ready" && ready.offer.action,
    "Start free trial",
  );
  // The store learned whose purchase this would be before showing it.
  assert.deepEqual(store.log, [`identify ${A}`]);
  // This Apple Account already had its free week.
  store.trialUsed = true;
  const again = await loadPaywall(withOffer(deps), phone.user);
  assert.equal(again.kind === "ready" && again.offer.action, "Subscribe");
});

test("no offering, another product, or a store that can't answer: nothing to buy, said plainly", async () => {
  const { deps, phone, store } = billing();
  assert.deepEqual(await loadPaywall(deps, phone.user), {
    kind: "unavailable",
    text: NO_OFFERING_TEXT,
    retry: true,
  });
  const annual = await loadPaywall(
    withOffer(deps, {}, { ...MEMBERSHIP, period: { unit: "year", count: 1 } }),
    phone.user,
  );
  assert.equal(annual.kind, "unavailable");
  assert.equal(annual.kind === "unavailable" && annual.retry, false);
  store.failIdentify = true;
  assert.deepEqual(await loadPaywall(withOffer(deps), phone.user), {
    kind: "unavailable",
    text: LOAD_FAILED_TEXT,
    retry: true,
  });
});

test("a purchase opens Forge only once Forge's server confirms it", async () => {
  const { deps, phone } = billing();
  const state = await purchaseFromPaywall(withOffer(deps), phone.user, offer);
  assert.equal(state.kind, "member");
  assert.equal(state.kind === "member" && state.via, "purchase");
  assert.deepEqual(state.kind === "member" && state.access, {
    kind: "granted",
    status: "trial",
    until: T0 + 7 * DAY,
    renews: true,
  });
});

test("a Test Store or Expo Go purchase never opens Forge", async () => {
  const { deps, phone } = billing({ settles: false });
  const simulated = withOffer(deps, { simulated: true });
  const state = await purchaseFromPaywall(simulated, phone.user, offer);
  assert.deepEqual(state, {
    kind: "ready",
    offer,
    notice: { tone: "info", text: SIMULATED_TEXT },
  });
  assert.notEqual((await currentAccess(simulated, phone.user)).kind, "granted");
});

test("closing Apple's sheet changes nothing; a pending approval waits; a failure says why", async () => {
  const { deps, phone, store } = billing();
  store.purchases.push({ kind: "cancelled" });
  assert.deepEqual(
    await purchaseFromPaywall(withOffer(deps), phone.user, offer),
    { kind: "ready", offer },
  );
  store.purchases.push({ kind: "pending" });
  assert.deepEqual(
    await purchaseFromPaywall(withOffer(deps), phone.user, offer),
    { kind: "pending", offer },
  );
  store.purchases.push({ kind: "failed", problem: "offline" });
  assert.deepEqual(
    await purchaseFromPaywall(withOffer(deps), phone.user, offer),
    {
      kind: "ready",
      offer,
      notice: { tone: "error", text: STORE_PROBLEM_TEXT.offline },
    },
  );
  // A store that throws is a failure too, never a purchase.
  store.purchases.push(new Error("StoreKit crashed"));
  const thrown = await purchaseFromPaywall(withOffer(deps), phone.user, offer);
  assert.equal(thrown.kind === "ready" && thrown.notice?.tone, "error");
});

test("a purchase the server can't confirm yet waits for it, then opens Forge", async () => {
  const { deps, phone, server } = billing();
  server.faults.push("offline");
  const waiting = await purchaseFromPaywall(withOffer(deps), phone.user, offer);
  assert.deepEqual(waiting, {
    kind: "unconfirmed",
    offer,
    text: UNCONFIRMED_TEXT.offline,
  });
  assert.notEqual((await currentAccess(deps, phone.user)).kind, "granted");
  const after = await checkFromPaywall(deps, phone.user, offer, "unconfirmed");
  assert.equal(after.kind, "member");
});

test("restore finds the membership, nothing, an ended one, or another account's", async () => {
  {
    const { deps, phone } = billing();
    const state = await restoreFromPaywall(withOffer(deps), phone.user, offer);
    assert.deepEqual(state, {
      kind: "ready",
      offer,
      notice: {
        tone: "info",
        text: restoreText({ kind: "denied", reason: "never" }),
      },
    });
    assert.equal(
      state.kind === "ready" && state.notice?.text,
      "No Forge Premium membership was found for this Apple Account.",
    );
  }
  {
    const { deps, phone, server } = billing();
    server.rc.set(A, {
      [PRODUCT]: {
        purchased: T0 - 2 * DAY,
        expires: T0 + 5 * DAY,
        trial: true,
      },
    });
    const state = await restoreFromPaywall(withOffer(deps), phone.user, offer);
    assert.equal(state.kind === "member" && state.via, "restore");
  }
  {
    const { deps, phone, server } = billing();
    server.rc.set(A, {
      [PRODUCT]: { purchased: T0 - 40 * DAY, expires: T0 - 10 * DAY },
    });
    const state = await restoreFromPaywall(withOffer(deps), phone.user, offer);
    assert.equal(
      state.kind === "ready" && state.notice?.text,
      "Your Forge Premium membership has ended. Subscribe to start it again.",
    );
  }
  {
    const { deps, phone, store } = billing();
    store.restores.push({ kind: "failed", problem: "otherAccount" });
    const state = await restoreFromPaywall(withOffer(deps), phone.user, offer);
    assert.deepEqual(state, {
      kind: "ready",
      offer,
      notice: { tone: "error", text: STORE_PROBLEM_TEXT.otherAccount },
    });
  }
  {
    // Found, but the server couldn't confirm it: waiting to check again,
    // and welcomed as restored once it does.
    const { deps, phone, server } = billing();
    server.rc.set(A, {
      [PRODUCT]: { purchased: T0 - 2 * DAY, expires: T0 + 28 * DAY },
    });
    server.faults.push("offline");
    const state = await restoreFromPaywall(withOffer(deps), phone.user, offer);
    assert.deepEqual(state, {
      kind: "unconfirmed",
      offer,
      text: UNCONFIRMED_TEXT.offline,
      from: "restore",
    });
    const after = await checkFromPaywall(
      deps,
      phone.user,
      offer,
      "unconfirmed",
      "restore",
    );
    assert.equal(after.kind === "member" && after.via, "restore");
  }
});

test("a member on a new phone is welcomed back after one read, never offered it again", async () => {
  {
    const { deps, phone, server, store } = billing();
    server.rc.set(A, {
      [PRODUCT]: { purchased: T0 - 2 * DAY, expires: T0 + 28 * DAY },
    });
    // RevenueCat's webhook already reached Forge's server; this phone
    // holds nothing for the account yet.
    server.sync(A);
    const state = await loadPaywall(withOffer(deps), phone.user);
    assert.equal(state.kind === "member" && state.via, "held");
    assert.deepEqual(server.calls, { refresh: 0, read: 1 });
    assert.deepEqual(store.log, []);
    // Kept: the next opening needs no server at all.
    assert.equal(
      (await loadPaywall(withOffer(deps), phone.user)).kind,
      "member",
    );
    assert.equal(server.calls.read, 1);
  }
  {
    // Nothing on the server: the offer, and that answer is kept.
    const { deps, phone, server } = billing();
    assert.equal(
      (await loadPaywall(withOffer(deps), phone.user)).kind,
      "ready",
    );
    assert.equal(
      (await loadPaywall(withOffer(deps), phone.user)).kind,
      "ready",
    );
    assert.equal(server.calls.read, 1);
  }
  {
    // A server that can't answer never blocks the offer.
    const { deps, phone, server } = billing();
    server.faults.push("offline");
    assert.equal(
      (await loadPaywall(withOffer(deps), phone.user)).kind,
      "ready",
    );
    assert.equal(server.calls.read, 1);
  }
});

test("one account's membership never opens Forge for the next account on this phone", async () => {
  const { deps, phone } = billing();
  assert.equal(
    (await purchaseFromPaywall(withOffer(deps), A, offer)).kind,
    "member",
  );
  phone.user = B;
  const next = await loadPaywall(withOffer(deps), B);
  assert.equal(next.kind, "ready");
  assert.notEqual((await currentAccess(deps, B)).kind, "granted");
  // And the first account's is still its own.
  phone.user = A;
  assert.equal((await loadPaywall(withOffer(deps), A)).kind, "member");
});

test("a renewal is confirmed by the server; a refund ends access at the next answer", async () => {
  const { deps, phone, server, wait } = billing();
  assert.equal(
    (await purchaseFromPaywall(withOffer(deps), phone.user, offer)).kind,
    "member",
  );
  // The free week ends: until the server says it renewed, Forge doesn't open.
  wait(7 * DAY + 1);
  assert.deepEqual(await currentAccess(deps, phone.user), {
    kind: "unverified",
    reason: "renewal",
  });
  server.rc.set(A, {
    [PRODUCT]: {
      purchased: T0 + 7 * DAY,
      expires: T0 + 37 * DAY,
      original: T0,
    },
  });
  const renewed = await verify(deps, phone.user);
  assert.equal(
    renewed.access.kind === "granted" && renewed.access.status,
    "active",
  );
  // Refunded through Apple.
  server.rc.set(A, {
    [PRODUCT]: {
      purchased: T0 + 7 * DAY,
      expires: T0 + 37 * DAY,
      original: T0,
      refunded: server.now,
    },
  });
  const refunded = await verify(deps, phone.user);
  assert.deepEqual(refunded.access, { kind: "denied", reason: "revoked" });
});

test("checking again while pending keeps waiting until the server confirms", () => {
  const pending: PaywallState = afterCheck(
    offer,
    { access: { kind: "denied", reason: "never" } },
    "pending",
  );
  assert.deepEqual(pending, { kind: "pending", offer });
  assert.deepEqual(
    afterCheck(
      offer,
      { access: { kind: "denied", reason: "never" } },
      "unconfirmed",
    ),
    {
      kind: "unconfirmed",
      offer,
      text: NOT_YET_TEXT,
    },
  );
  assert.deepEqual(
    afterCheck(
      offer,
      { access: { kind: "unverified", reason: "missing" }, problem: "auth" },
      "pending",
    ),
    { kind: "unconfirmed", offer, text: UNCONFIRMED_TEXT.auth },
  );
  // Only the server's grant opens Forge, simulated store or not.
  const granted = {
    kind: "granted" as const,
    status: "active" as const,
    until: T0 + DAY,
    renews: true,
  };
  assert.equal(
    afterPurchase(
      offer,
      { outcome: { kind: "completed" }, access: granted },
      true,
    ).kind,
    "member",
  );
});

test("what the member and You → Account read, from the server's decision", () => {
  const date = () => "December 4";
  const trial = {
    kind: "granted" as const,
    status: "trial" as const,
    until: T0,
    renews: true,
  };
  assert.deepEqual(memberLines(trial, "December 4"), {
    title: "Your free week has started",
    detail:
      "Your free week ends on December 4. Your first monthly payment is then, unless you cancel before.",
  });
  // A restore and a membership already held are welcomed as such; the
  // dates still come from the server's decision.
  assert.equal(
    memberLines(trial, "December 4", "restore").title,
    "Your membership is restored",
  );
  assert.deepEqual(memberLines(trial, "December 4", "held"), {
    title: "You're a Forge Premium member",
    detail: memberLines(trial, "December 4").detail,
  });
  assert.equal(statusLines(undefined, date).chip, "Checking");
  assert.deepEqual(statusLines({ access: trial }, date), {
    chip: "Free trial",
    title: "Free week until December 4",
    detail:
      "Your first monthly payment is on December 4 unless you cancel before.",
    manage: true,
  });
  const cancelled = {
    kind: "granted" as const,
    status: "active" as const,
    until: T0,
    renews: false,
  };
  assert.equal(
    statusLines({ access: cancelled }, date).title,
    "Ends December 4",
  );
  const grace = {
    kind: "granted" as const,
    status: "grace" as const,
    until: T0,
    renews: true,
  };
  assert.equal(statusLines({ access: grace }, date).chip, "Payment issue");
  const chips = (["never", "expired", "billingIssue", "revoked"] as const).map(
    (reason) => statusLines({ access: { kind: "denied", reason } }, date).chip,
  );
  assert.deepEqual(chips, [
    "Not a member",
    "Ended",
    "Payment issue",
    "Refunded",
  ]);
  // Not confirmed: the title says so once; the detail says why and what to do.
  for (const [problem, why] of Object.entries(UNCONFIRMED_TEXT)) {
    const lines = statusLines(
      {
        access: { kind: "unverified", reason: "missing" },
        problem: problem as keyof typeof UNCONFIRMED_TEXT,
      },
      date,
    );
    assert.equal(lines.title, "Forge couldn't confirm your membership");
    assert.equal(lines.detail, why);
    assert.doesNotMatch(lines.detail, /confirm your membership/);
  }
  assert.equal(
    statusLines({ access: { kind: "unverified", reason: "renewal" } }, date)
      .detail,
    "Your membership was due to renew. Apple hasn't confirmed it yet.",
  );
});
