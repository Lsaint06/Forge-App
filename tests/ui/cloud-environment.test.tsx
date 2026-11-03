// Phase 7.8E, Stage 5 (E6), and Phase 8: the real client module, loaded
// fresh with each build's variables and in each app (Expo Go, FORGE Dev,
// FORGE), creates no client of any kind for another project. createClient is
// replaced, so nothing here reaches a network.

/** The app the JavaScript runs in: Expo Go unless a test says otherwise. */
const mockApp = {
  environment: "storeClient",
  id: "host.exp.Exponent" as string | null,
  scheme: "forge",
};
jest.mock("expo-application", () => ({
  get applicationId() {
    return mockApp.id;
  },
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
  default: {
    get executionEnvironment() {
      return mockApp.environment;
    },
    get expoConfig() {
      return { name: "FORGE", slug: "forge-fitness", scheme: mockApp.scheme };
    },
  },
}));
/** One of Forge's own builds, running JavaScript given `scheme`. */
function inApp(id: string, scheme: string) {
  Object.assign(mockApp, { environment: "bare", id, scheme });
}

const mockCreated: string[] = [];
jest.mock("@supabase/supabase-js", () => ({
  ...jest.requireActual("@supabase/supabase-js"),
  createClient: (url: string) => {
    mockCreated.push(url);
    return {
      auth: { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() },
    };
  },
}));

const VARS = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_FORGE_ENV",
  "EXPO_PUBLIC_SUPABASE_PROJECT_REF",
] as const;
const DEV = "devprojectrefaaaaaaa";
const PROD = "prodprojectrefbbbbbb";

function build(env: Partial<Record<(typeof VARS)[number], string>>) {
  for (const name of VARS) delete process.env[name];
  Object.assign(process.env, env);
  let modules!: {
    client: typeof import("../../src/cloud/client");
    session: typeof import("../../src/auth/session");
  };
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    modules = {
      client: require("../../src/cloud/client"),
      session: require("../../src/auth/session"),
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return modules;
}

const saved = Object.fromEntries(VARS.map((name) => [name, process.env[name]]));
afterEach(() => {
  mockCreated.length = 0;
  Object.assign(mockApp, {
    environment: "storeClient",
    id: "host.exp.Exponent",
    scheme: "forge",
  });
  for (const name of VARS)
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
});

test("today's build (no environment named) connects as before", () => {
  const { client, session } = build({
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
  });
  const auth = session.authClient();
  expect(auth.misconfigured).toBe(false);
  expect(auth.client).not.toBeNull();
  expect(client.verifierClient()).not.toBeNull();
  expect(client.tokenClient("token")).not.toBeNull();
  expect(mockCreated).toEqual([
    `https://${PROD}.supabase.co`,
    `https://${PROD}.supabase.co`,
    `https://${PROD}.supabase.co`,
  ]);
});

test("a build connects to the project it names", () => {
  const { session } = build({
    EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    EXPO_PUBLIC_FORGE_ENV: "development",
    EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV,
  });
  expect(session.authClient().misconfigured).toBe(false);
  expect(mockCreated).toEqual([`https://${DEV}.supabase.co`]);
});

test("a build pointed at another project is misconfigured and creates no client", () => {
  const { client, session } = build({
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    EXPO_PUBLIC_FORGE_ENV: "development",
    EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV,
  });
  expect(session.authClient()).toEqual({ client: null, misconfigured: true });
  expect(() => client.verifierClient()).toThrow();
  expect(() => client.tokenClient("token")).toThrow();
  expect(mockCreated).toEqual([]);
});

test("an environment named without its project is misconfigured", () => {
  const { session } = build({
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
    EXPO_PUBLIC_FORGE_ENV: "production",
  });
  expect(session.authClient()).toEqual({ client: null, misconfigured: true });
  expect(mockCreated).toEqual([]);
});

// ---- Phase 8: Forge's own builds ----

const todays = {
  EXPO_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
};
const development = {
  EXPO_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key",
  EXPO_PUBLIC_FORGE_ENV: "development",
  EXPO_PUBLIC_SUPABASE_PROJECT_REF: DEV,
};

test("FORGE Dev with today's settings (production, nothing named) creates no client", () => {
  inApp("com.lsaint06.forge.dev", "forge-dev");
  const { client, session } = build(todays);
  expect(session.authClient()).toEqual({ client: null, misconfigured: true });
  expect(() => client.verifierClient()).toThrow(/development/);
  expect(() => client.tokenClient("token")).toThrow(/development/);
  expect(mockCreated).toEqual([]);
});

test("FORGE Dev connects only to its development project, with its own JavaScript", () => {
  inApp("com.lsaint06.forge.dev", "forge-dev");
  expect(build(development).session.authClient().misconfigured).toBe(false);
  expect(mockCreated).toEqual([`https://${DEV}.supabase.co`]);
  // Metro started without APP_VARIANT: its links would open the wrong app.
  mockCreated.length = 0;
  inApp("com.lsaint06.forge.dev", "forge");
  expect(build(development).session.authClient()).toEqual({
    client: null,
    misconfigured: true,
  });
  expect(mockCreated).toEqual([]);
});

test("the production app needs production named; an unknown app never connects", () => {
  inApp("com.lsaint06.forge", "forge");
  for (const env of [todays, development])
    expect(build(env).session.authClient().misconfigured).toBe(true);
  expect(
    build({
      ...todays,
      EXPO_PUBLIC_FORGE_ENV: "production",
      EXPO_PUBLIC_SUPABASE_PROJECT_REF: PROD,
    }).session.authClient().misconfigured,
  ).toBe(false);
  expect(mockCreated).toEqual([`https://${PROD}.supabase.co`]);
  inApp("com.example.forge", "forge");
  expect(build(todays).session.authClient().misconfigured).toBe(true);
});

test("why a build can't connect is said in development, naming no values", () => {
  inApp("com.lsaint06.forge.dev", "forge-dev");
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  try {
    build(todays).session.authClient();
    expect(warn).toHaveBeenCalledTimes(1);
    const said = String(warn.mock.calls[0]![0]);
    expect(said).toMatch(/^\[FORGE\] Accounts aren't available: /);
    expect(said).toMatch(/EXPO_PUBLIC_FORGE_ENV=development/);
    expect(said).not.toContain(PROD);
    expect(said).not.toContain("public-key");
  } finally {
    warn.mockRestore();
  }
});
