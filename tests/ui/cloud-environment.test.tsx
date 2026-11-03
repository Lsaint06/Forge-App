// Phase 7.8E, Stage 5 (E6): the real client module, loaded fresh with each
// build's variables, creates no client of any kind for another project.
// createClient is replaced, so nothing here reaches a network.

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
