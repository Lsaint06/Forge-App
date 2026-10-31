import { supabaseAcceptsReturnUrl } from "../../src/auth/redirects";

// Phase 7.7B.1, SDK 58 tunnel regression. Expo's real Linking.createURL,
// with only the native values it reads mocked: the URL Expo Go actually
// downloaded the JavaScript bundle from, and Expo Go's constants. Metro's
// banner URL is not an input: what matters is where the bundle came from.

const mockNative = { scriptURL: null as string | null };
jest.mock(
  "react-native/unstable-internals-do-not-use",
  () => ({
    NativeSourceCode: {
      getConstants: () => ({ scriptURL: mockNative.scriptURL }),
    },
  }),
  { virtual: true },
);
const mockApp = { env: "storeClient" };
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockApp.env;
    },
    expoConfig: {
      name: "Forge",
      slug: "forge-fitness",
      scheme: "forge",
      ios: { bundleIdentifier: "com.lsaint06.forge" },
      android: { package: "com.lsaint06.forge" },
    },
    get expoGoConfig() {
      return mockApp.env === "storeClient"
        ? { developer: { tool: "expo-cli" } }
        : undefined;
    },
  },
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
}));

const TUNNEL = "c-lstamand-97rrx8-mvvws2xi04jjituc.on.expo.app";
const BUNDLE = "node_modules/expo-router/entry.bundle?platform=ios&dev=true";
// The real modules, after the mocks above.
const returnUrl = () => {
  const { oauthReturnUrl } = jest.requireActual(
    "../../src/auth/social",
  ) as typeof import("../../src/auth/social");
  return oauthReturnUrl();
};

beforeEach(() => {
  mockApp.env = "storeClient";
  mockNative.scriptURL = null;
});

test("Expo Go through SDK 58's tunnel: exps://<tunnel>/--/welcome, which Supabase accepts", () => {
  // Expo Go reaches exp://<tunnel>, is redirected to https, and downloads
  // the bundle from https://<tunnel>/… (observed on the founder's tunnel).
  mockNative.scriptURL = `https://${TUNNEL}/${BUNDLE}`;
  expect(returnUrl()).toBe(`exps://${TUNNEL}/--/welcome`);
  expect(supabaseAcceptsReturnUrl(returnUrl())).toBe(true);
});

test("a tunnel bundle over plain http keeps exp://", () => {
  mockNative.scriptURL = `http://${TUNNEL}/${BUNDLE}`;
  expect(returnUrl()).toBe(`exp://${TUNNEL}/--/welcome`);
  expect(supabaseAcceptsReturnUrl(returnUrl())).toBe(true);
});

test("Expo Go opened from the local network (Home list, Recents): the computer's IP, refused", () => {
  // Even while Metro runs a tunnel, it still serves the local network; a
  // copy of Forge opened that way downloads its bundle from the IP.
  mockNative.scriptURL = `http://192.168.1.23:8081/${BUNDLE}`;
  expect(returnUrl()).toBe("exp://192.168.1.23:8081/--/welcome");
  expect(supabaseAcceptsReturnUrl(returnUrl())).toBe(false);
});

test("Forge's own build returns to its own scheme", () => {
  mockApp.env = "bare";
  expect(returnUrl()).toBe("forge:///welcome");
  expect(supabaseAcceptsReturnUrl(returnUrl())).toBe(true);
});
