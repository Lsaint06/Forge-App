import React from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { render, fireEvent, act } from "@testing-library/react-native";
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import Welcome from "../../src/screens/entry/Welcome";
import { EntryContext } from "../../src/auth/session";
import {
  NO_PROVIDERS,
  fetchAuthProviders,
  socialOptions,
} from "../../src/auth/providers";
import {
  oauthRedirectResult,
  signInWithApple,
  signInWithGoogle,
  socialErrorText,
} from "../../src/auth/social";
import { signInMethods } from "../../src/auth/methods";
import { authLinkStatus } from "../../src/auth/links";

// Phase 7.7B.1: Continue with Apple and Google through the existing Supabase
// Auth. The providers, Apple's and Google's SDK surfaces and the account
// service are mocked: these tests check which buttons appear, what each flow
// asks of Supabase, and that nothing else (navigation, sync, data) happens.

const mockDims = { width: 393, height: 852, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockDims,
}));
let mockProfile: { theme: "dark" | "light" } | undefined;
jest.mock("../../src/state", () => ({
  useRepo: jest.fn(),
  mutate: (fn: () => unknown) => fn(),
  confirm: jest.fn(),
  useApp: Object.assign(
    (selector: (s: { revision: number; profile: unknown }) => unknown) =>
      selector({ revision: 0, profile: mockProfile }),
    { getState: () => ({ touch: jest.fn() }) },
  ),
}));
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
  },
}));
// What Expo's createURL returns on the device: a build's own scheme by
// default; tests switch it to Expo Go's addresses.
const mockLink = { base: "forge://" };
jest.mock("expo-linking", () => ({
  createURL: (path: string) => `${mockLink.base}${path.replace(/^\//, "")}`,
  useURL: () => null,
}));
const mockEnv = { execution: "standalone" };
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockEnv.execution;
    },
    expoConfig: { version: "1.0.0" },
  },
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
}));
const mockApple = { available: true };
jest.mock("expo-apple-authentication", () => {
  const { Pressable, Text: T } = jest.requireActual("react-native");
  return {
    isAvailableAsync: jest.fn(async () => mockApple.available),
    signInAsync: jest.fn(),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: ({
      onPress,
      buttonStyle,
      buttonType,
    }: {
      onPress: () => void;
      buttonStyle: number;
      buttonType: number;
    }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Continue with Apple"
        testID={`apple-native-style${buttonStyle}-type${buttonType}`}
        onPress={onPress}
      >
        <T>Continue with Apple</T>
      </Pressable>
    ),
  };
});
jest.mock("expo-crypto", () => ({
  randomUUID: () => "raw-nonce",
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `sha256:${value}`,
  ),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
}));
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("../../src/fonts", () => ({
  ...jest.requireActual("../../src/fonts"),
  loadProviderFont: jest.fn(),
}));
const mockProviders = { apple: false, google: false };
jest.mock("../../src/auth/providers", () => ({
  ...jest.requireActual("../../src/auth/providers"),
  useAuthProviders: () => mockProviders,
}));
jest.mock("../../src/cloud/sync", () => ({ synchronize: jest.fn() }));

const me = { id: "user-a", email: "a@example.com" };
const AUTHORIZE =
  "https://forgeproj.supabase.co/auth/v1/authorize?provider=google";
const RETURNED =
  "forge://welcome#access_token=at&expires_in=3600&refresh_token=rt&token_type=bearer";
function client() {
  return {
    auth: {
      signInWithOAuth: jest.fn(async () => ({
        data: { provider: "google", url: AUTHORIZE },
        error: null,
      })),
      setSession: jest.fn(async () => ({
        data: { session: { user: me } },
        error: null,
      })),
      signInWithIdToken: jest.fn(async () => ({
        data: { session: { user: me } },
        error: null,
      })),
      updateUser: jest.fn(async () => ({ data: {}, error: null })),
    },
  };
}
type Client = ReturnType<typeof client>;
const browser = jest.mocked(WebBrowser.openAuthSessionAsync);
const apple = jest.mocked(AppleAuthentication.signInAsync);
const flush = () => act(async () => {});
async function welcome(c: Client = client()) {
  const view = await render(
    <EntryContext.Provider
      value={{
        entry: { kind: "signedOut" },
        client: c as never,
        finishRecovery: jest.fn(),
      }}
    >
      <Welcome />
    </EntryContext.Provider>,
  );
  await flush();
  return view;
}
const labels = (view: Awaited<ReturnType<typeof render>>) =>
  view.getAllByRole("button").map((b) => b.props.accessibilityLabel);
let warn: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockProviders, { apple: false, google: false });
  mockEnv.execution = "standalone";
  mockLink.base = "forge://";
  mockApple.available = true;
  mockProfile = undefined;
  Object.assign(mockDims, { width: 393, fontScale: 1 });
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("which providers the account service has enabled", () => {
  const config = {
    url: "https://forgeproj.supabase.co",
    key: "sb_publishable_test",
  };
  afterEach(() => jest.restoreAllMocks());

  test("reads Supabase's public settings with the publishable key only", async () => {
    const fetch = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        external: { apple: false, google: true, email: true },
      }),
    } as Response);
    expect(await fetchAuthProviders(config)).toEqual({
      apple: false,
      google: true,
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://forgeproj.supabase.co/auth/v1/settings");
    expect((init as RequestInit).headers).toEqual({
      apikey: "sb_publishable_test",
    });
  });

  test("anything unreadable means no provider buttons", async () => {
    const fetch = jest.spyOn(global, "fetch");
    expect(await fetchAuthProviders({})).toBeUndefined();
    expect(
      await fetchAuthProviders({ url: "http://insecure.example", key: "k" }),
    ).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce({ ok: false } as Response);
    expect(await fetchAuthProviders(config)).toBeUndefined();
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpected: true }),
    } as Response);
    expect(await fetchAuthProviders(config)).toBeUndefined();
    fetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await fetchAuthProviders(config)).toBeUndefined();
    // A request that never answers is abandoned.
    fetch.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          (init as RequestInit).signal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
    expect(await fetchAuthProviders(config, 5)).toBeUndefined();
  });

  test("the last answer stands while offline; it never invents a provider", async () => {
    const real = jest.requireActual(
      "../../src/auth/providers",
    ) as typeof import("../../src/auth/providers");
    const { AppState } = jest.requireActual("react-native");
    let foreground: ((state: string) => void) | undefined;
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type: unknown, handler: unknown) => {
        foreground = handler as (state: string) => void;
        return { remove: jest.fn() };
      });
    process.env.EXPO_PUBLIC_SUPABASE_URL = config.url;
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = config.key;
    let answer!: (r: Response) => void;
    const fetch = jest
      .spyOn(global, "fetch")
      .mockImplementationOnce(() => new Promise((done) => (answer = done)));
    let seen: unknown;
    function Probe() {
      seen = real.useAuthProviders();
      return <Text>probe</Text>;
    }
    try {
      const view = await render(<Probe />);
      // Nothing is offered before the account service answers.
      expect(seen).toEqual(NO_PROVIDERS);
      await act(async () =>
        answer({
          ok: true,
          json: async () => ({ external: { apple: false, google: true } }),
        } as Response),
      );
      expect(seen).toEqual({ apple: false, google: true });
      // Back in the foreground but offline: the last answer stands.
      fetch.mockRejectedValueOnce(new TypeError("Network request failed"));
      await act(async () => foreground?.("active"));
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(seen).toEqual({ apple: false, google: true });
      // A provider switched off in the dashboard disappears on the next read.
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ external: { apple: false, google: false } }),
      } as Response);
      await act(async () => foreground?.("active"));
      expect(seen).toEqual(NO_PROVIDERS);
      await view.unmount();
    } finally {
      delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    }
  });
});
describe("which buttons may appear", () => {
  const all = { apple: true, google: true };
  test("Apple needs iOS, Forge's own build, the device and the account service", () => {
    const base = {
      platform: "ios",
      expoGo: false,
      appleAvailable: true,
      googleReturns: true,
      providers: all,
    };
    expect(socialOptions(base)).toEqual(all);
    // Expo Go would sign in as Expo's app: never offered there.
    expect(socialOptions({ ...base, expoGo: true }).apple).toBe(false);
    expect(socialOptions({ ...base, platform: "android" }).apple).toBe(false);
    expect(socialOptions({ ...base, appleAvailable: false }).apple).toBe(false);
    expect(
      socialOptions({ ...base, providers: { apple: false, google: true } })
        .apple,
    ).toBe(false);
  });
  test("Google needs only the account service, in Expo Go too", () => {
    for (const platform of ["ios", "android"])
      for (const expoGo of [true, false])
        expect(
          socialOptions({
            platform,
            expoGo,
            appleAvailable: false,
            googleReturns: true,
            providers: { apple: false, google: true },
          }).google,
        ).toBe(true);
    expect(
      socialOptions({
        platform: "ios",
        expoGo: false,
        appleAvailable: true,
        googleReturns: true,
        providers: NO_PROVIDERS,
      }),
    ).toEqual(NO_PROVIDERS);
  });
});

describe("Welcome with providers", () => {
  test("Expo Go: Google and Email; Apple stays hidden even when enabled", async () => {
    mockEnv.execution = "storeClient";
    Object.assign(mockProviders, { apple: true, google: true });
    const view = await welcome();
    expect(labels(view)).toEqual([
      "Continue with Google",
      "Continue with Email",
    ]);
    expect(view.queryByText("Continue with Apple")).toBeNull();
    expect(AppleAuthentication.isAvailableAsync).not.toHaveBeenCalled();
  });

  test("Forge's own iOS build: Apple, then Google, then Email", async () => {
    Object.assign(mockProviders, { apple: true, google: true });
    const view = await welcome();
    expect(labels(view)).toEqual([
      "Continue with Apple",
      "Continue with Google",
      "Continue with Email",
    ]);
    // Email becomes the quieter outline once a provider leads.
    await fireEvent.press(
      view.getByRole("button", { name: "Continue with Email" }),
    );
    expect(router.push).toHaveBeenLastCalledWith("/sign-in");
  });

  test("no Apple button when the device or the account service can't use it", async () => {
    Object.assign(mockProviders, { apple: true, google: false });
    mockApple.available = false;
    expect(labels(await welcome())).toEqual(["Continue with Email"]);
    mockApple.available = true;
    mockProviders.apple = false;
    expect(labels(await welcome())).toEqual(["Continue with Email"]);
  });

  test("Android never shows Apple", async () => {
    Object.assign(mockProviders, { apple: true, google: true });
    const os = Platform.OS;
    Platform.OS = "android";
    try {
      const view = await welcome();
      expect(labels(view)).toEqual([
        "Continue with Google",
        "Continue with Email",
      ]);
    } finally {
      Platform.OS = os;
    }
  });

  test("official branding, matched to the theme with equal prominence", async () => {
    Object.assign(mockProviders, { apple: true, google: true });
    const dark = await welcome();
    // Dark Forge: Apple white, Google's light theme.
    expect(dark.getByTestId("apple-native-style0-type1")).toBeTruthy();
    let google = StyleSheet.flatten(
      dark.getByTestId("continue-google").props.style,
    );
    expect(google).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#747775",
      minHeight: 48,
    });
    expect(dark.getByText("Continue with Google").props.style).toMatchObject({
      color: "#1F1F1F",
    });
    await dark.unmount();
    mockProfile = { theme: "light" };
    const light = await welcome();
    expect(light.getByTestId("apple-native-style2-type1")).toBeTruthy();
    google = StyleSheet.flatten(
      light.getByTestId("continue-google").props.style,
    );
    expect(google).toMatchObject({
      backgroundColor: "#131314",
      borderColor: "#8E918F",
    });
  });

  test("compact iPhone and large text keep every option readable", async () => {
    Object.assign(mockDims, { width: 320, fontScale: 2 });
    Object.assign(mockProviders, { apple: true, google: true });
    const view = await welcome();
    expect(labels(view)).toHaveLength(3);
    expect(
      view.getByText("Continue with Google").props.maxFontSizeMultiplier,
    ).toBe(1.4);
  });
});

describe("Continue with Google", () => {
  beforeEach(() => {
    mockProviders.google = true;
  });

  test("Supabase's OAuth flow in the secure sheet; the gate, not the screen, moves on", async () => {
    browser.mockResolvedValue({ type: "success", url: RETURNED });
    const c = client();
    let release!: () => void;
    c.auth.setSession.mockImplementation(
      () =>
        new Promise((done) => {
          release = () =>
            done({ data: { session: { user: me } }, error: null });
        }),
    );
    const view = await welcome(c);
    await fireEvent.press(view.getByTestId("continue-google"));
    expect(c.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "forge://welcome",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    expect(browser).toHaveBeenCalledWith(AUTHORIZE, "forge://welcome");
    expect(c.auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    // While the session starts: a quiet note, and no second attempt.
    expect(view.getByText("Signing you in…")).toBeTruthy();
    expect(
      view.getByTestId("continue-google").props.accessibilityState.disabled,
    ).toBe(true);
    await act(async () => release());
    expect(view.queryByText("Signing you in…")).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    const { synchronize } = jest.requireMock("../../src/cloud/sync");
    expect(synchronize).not.toHaveBeenCalled();
  });

  test("closing the sheet or declining at Google is not an error", async () => {
    for (const result of [
      { type: "cancel" },
      { type: "dismiss" },
      {
        type: "success",
        url: "forge://welcome#error=access_denied&error_description=The+user+denied",
      },
    ]) {
      browser.mockResolvedValueOnce(result as never);
      const c = client();
      const view = await welcome(c);
      await fireEvent.press(view.getByTestId("continue-google"));
      await flush();
      expect(c.auth.setSession).not.toHaveBeenCalled();
      expect(view.queryByText(/didn't finish|Can't reach/)).toBeNull();
      expect(
        view.getByTestId("continue-google").props.accessibilityState.disabled,
      ).toBe(false);
      await view.unmount();
    }
  });

  test("a failure is said plainly; provider details and tokens never show", async () => {
    browser.mockResolvedValue({
      type: "success",
      url: "forge://welcome#error=server_error&error_description=Unable+to+exchange+external+code",
    });
    const c = client();
    const view = await welcome(c);
    await fireEvent.press(view.getByTestId("continue-google"));
    await flush();
    expect(
      view.getByText(
        "Google sign-in didn't finish. Try again, or continue with email.",
      ),
    ).toBeTruthy();
    expect(view.queryByText(/exchange|server_error/)).toBeNull();
    expect(c.auth.setSession).not.toHaveBeenCalled();
    // The developer log gets the code only.
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(
      /access_token|refresh_token/,
    );
  });

  test("offline: the connection message", async () => {
    browser.mockResolvedValue({ type: "success", url: RETURNED });
    const c = client();
    c.auth.setSession.mockRejectedValueOnce(
      new AuthRetryableFetchError("Failed to fetch", 0),
    );
    const view = await welcome(c);
    await fireEvent.press(view.getByTestId("continue-google"));
    await flush();
    expect(
      view.getByText(
        "Can't reach Forge's account service. Check your connection and try again.",
      ),
    ).toBeTruthy();
  });

  test("a second tap while the sheet is open starts nothing", async () => {
    let finish!: (v: unknown) => void;
    browser.mockImplementation(
      () => new Promise((done) => (finish = done)) as never,
    );
    const c = client();
    const view = await welcome(c);
    await fireEvent.press(view.getByTestId("continue-google"));
    await fireEvent.press(view.getByTestId("continue-google"));
    expect(c.auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    await act(async () => finish({ type: "cancel" }));
  });
});

// The founder's report: in Expo Go, Continue with Google ended on a page
// titled "localhost". Supabase refuses to return to an IP address and used
// its Site URL instead.
describe("Expo Go return address", () => {
  const LAN = "exp://192.168.1.23:8081/--/";
  // SDK 58 tunnels are on.expo.app (@expo/ws-tunnel).
  const TUNNEL = "exps://c-lstamand-97rrx8-mvvws2xi04jjituc.on.expo.app/--/";

  test("on a local network address: no Google button, never a dead-end sheet", async () => {
    mockEnv.execution = "storeClient";
    mockLink.base = LAN;
    mockProviders.google = true;
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    try {
      const view = await welcome();
      expect(labels(view)).toEqual(["Continue with Email"]);
      // Developers see the exact return address, why, and what to do.
      const said = info.mock.calls.map((c) => String(c[0])).join("\n");
      expect(said).toContain("exp://192.168.1.23:8081/--/welcome");
      expect(said).toMatch(/IP address/);
      expect(said).toMatch(/tunnel address Metro shows/);
      // Even if asked directly, nothing opens.
      const c = client();
      const failure = await signInWithGoogle(c as never).catch((e) => e);
      expect(failure).toBeInstanceOf(Error);
      expect(c.auth.signInWithOAuth).not.toHaveBeenCalled();
      expect(browser).not.toHaveBeenCalled();
      expect(socialErrorText("google", failure)).toBe(
        "Google sign-in didn't finish. Try again, or continue with email.",
      );
    } finally {
      info.mockRestore();
    }
  });

  test("through a tunnel: the sheet returns to Expo Go and signs in", async () => {
    mockEnv.execution = "storeClient";
    mockLink.base = TUNNEL;
    mockProviders.google = true;
    const back = `${TUNNEL}welcome#access_token=at&refresh_token=rt&token_type=bearer`;
    browser.mockResolvedValue({ type: "success", url: back });
    const c = client();
    const view = await welcome(c);
    expect(labels(view)).toEqual([
      "Continue with Google",
      "Continue with Email",
    ]);
    await fireEvent.press(view.getByTestId("continue-google"));
    await flush();
    const redirectTo = `${TUNNEL}welcome`;
    expect(c.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ redirectTo }),
      }),
    );
    // The sheet watches for the same address it was given.
    expect(browser).toHaveBeenCalledWith(AUTHORIZE, redirectTo);
    expect(c.auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
    expect(view.queryByText(/didn't finish/)).toBeNull();
    // Never mistaken for an email link.
    expect(authLinkStatus(back)).toBeUndefined();
  });

  test("Forge's own build returns to its own scheme", async () => {
    mockLink.base = "forge:///";
    mockProviders.google = true;
    browser.mockResolvedValue({ type: "cancel" } as never);
    const c = client();
    const view = await welcome(c);
    await fireEvent.press(view.getByTestId("continue-google"));
    await flush();
    expect(browser).toHaveBeenCalledWith(AUTHORIZE, "forge:///welcome");
  });
});
describe("Continue with Apple (Forge's own build)", () => {
  beforeEach(() => {
    mockProviders.apple = true;
  });
  const credential = {
    user: "apple-user",
    identityToken: "apple-id-token",
    authorizationCode: "code",
    email: null,
    realUserStatus: 1,
    state: null,
    fullName: {
      givenName: "Ada",
      middleName: null,
      familyName: "Lovelace",
      namePrefix: null,
      nameSuffix: null,
      nickname: null,
    },
  };

  test("a one-time nonce ties Apple's token to Supabase's sign-in", async () => {
    apple.mockResolvedValue(credential as never);
    const c = client();
    const view = await welcome(c);
    await fireEvent.press(
      view.getByRole("button", { name: "Continue with Apple" }),
    );
    await flush();
    expect(apple).toHaveBeenCalledWith({
      requestedScopes: [0, 1],
      nonce: "sha256:raw-nonce",
    });
    expect(c.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "apple",
      token: "apple-id-token",
      nonce: "raw-nonce",
    });
    // Apple shares the name once: kept on the account for later.
    expect(c.auth.updateUser).toHaveBeenCalledWith({
      data: {
        full_name: "Ada Lovelace",
        given_name: "Ada",
        family_name: "Lovelace",
      },
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  test("closing Apple's sheet is not an error", async () => {
    apple.mockRejectedValue(
      Object.assign(new Error("The user canceled the sign-in flow."), {
        code: "ERR_REQUEST_CANCELED",
      }),
    );
    const c = client();
    const view = await welcome(c);
    await fireEvent.press(
      view.getByRole("button", { name: "Continue with Apple" }),
    );
    await flush();
    expect(c.auth.signInWithIdToken).not.toHaveBeenCalled();
    expect(view.queryByText(/didn't finish/)).toBeNull();
  });

  test("no token, or a refused token, is said plainly", async () => {
    apple.mockResolvedValueOnce({
      ...credential,
      identityToken: null,
    } as never);
    const c = client();
    expect(await signInWithApple(c as never).catch((e) => e)).toBeInstanceOf(
      Error,
    );
    expect(c.auth.signInWithIdToken).not.toHaveBeenCalled();
    apple.mockResolvedValueOnce({ ...credential, fullName: null } as never);
    c.auth.signInWithIdToken.mockResolvedValueOnce({
      data: { session: null },
      error: Object.assign(new Error("Unacceptable audience in id_token"), {
        code: "bad_jwt",
      }),
    } as never);
    const error = await signInWithApple(c as never).catch((e) => e);
    expect(socialErrorText("apple", error)).toBe(
      "Apple sign-in didn't finish. Try again, or continue with email.",
    );
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("helpers", () => {
  test("oauthRedirectResult reads only tokens or an error", () => {
    expect(oauthRedirectResult(RETURNED)).toEqual({
      tokens: { access_token: "at", refresh_token: "rt" },
    });
    expect(
      oauthRedirectResult("forge://welcome?error=access_denied").error,
    ).toBe("access_denied");
    expect(oauthRedirectResult("forge://welcome#access_token=at").error).toBe(
      "missing_tokens",
    );
    expect(oauthRedirectResult("not a url").error).toBe("invalid_redirect");
  });

  test("Google's return is never mistaken for an email link", () => {
    expect(authLinkStatus(RETURNED)).toBeUndefined();
    expect(
      authLinkStatus(
        "exp://192.168.1.5:8081/--/welcome#error=access_denied&error_code=x",
      ),
    ).toBeUndefined();
  });

  test("sign-in methods: every linked way into the account", () => {
    expect(
      signInMethods({ app_metadata: { providers: ["email", "google"] } }),
    ).toEqual(["Email", "Google"]);
    expect(signInMethods({ app_metadata: { provider: "apple" } })).toEqual([
      "Apple",
    ]);
    expect(signInMethods({})).toEqual([]);
  });

  test("Google helper without the screen: cancelled leaves no session", async () => {
    browser.mockResolvedValueOnce({ type: "cancel" } as never);
    const c = client();
    expect(await signInWithGoogle(c as never)).toBe("cancelled");
    expect(c.auth.setSession).not.toHaveBeenCalled();
  });
});
