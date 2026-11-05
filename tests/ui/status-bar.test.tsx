import React from "react";
import { Platform } from "react-native";
import { render } from "@testing-library/react-native";

// Phase 8.4C-1: on iOS 27, Forge's own builds rely on the native screen
// stack for the status bar (UIViewControllerBasedStatusBarAppearance), so
// every screen states Forge's style. Expo Go keeps that setting off and
// Android uses StatusBar, so there the stack states nothing. The workout
// logger keeps its full-screen presentation (the Phase 8.3C safe-area fix
// depends on it).

/** The app the JavaScript runs in: one of Forge's builds unless a test says otherwise. */
const mockApp = { environment: "standalone" };
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
  },
}));
let mockProfile: { theme: string } | undefined;
jest.mock("../../src/state", () => ({
  useApp: (selector: (s: { profile: unknown }) => unknown) =>
    selector({ profile: mockProfile }),
}));
/** The phone's light or dark mode, which Forge's System appearance follows. */
const mockPhone = { scheme: "light" };
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: () => mockPhone.scheme,
}));
const mockStack: { statusBarStyle?: string }[] = [];
const mockScreens: { name: string; options?: { presentation?: string } }[] = [];
jest.mock("expo-router", () => {
  const Stack = ({
    children,
    screenOptions,
  }: {
    children: React.ReactNode;
    screenOptions: { statusBarStyle?: string };
  }) => {
    mockStack.push(screenOptions);
    return <>{children}</>;
  };
  Stack.Screen = function Screen(props: {
    name: string;
    options?: { presentation?: string };
  }) {
    mockScreens.push(props);
    return null;
  };
  Stack.Protected = function Protected({
    children,
  }: {
    children: React.ReactNode;
  }) {
    return <>{children}</>;
  };
  return { Stack, Redirect: () => null };
});

// eslint-disable-next-line import/first
import { AppStack } from "../../src/auth/AppStack";
// eslint-disable-next-line import/first
import { IntroOnScreen } from "../../src/components/status-bar";

beforeEach(() => {
  mockApp.environment = "standalone";
  mockProfile = undefined;
  mockPhone.scheme = "light";
  mockStack.length = 0;
  mockScreens.length = 0;
});

const stackStyle = async (
  ui: React.ReactElement = <AppStack entry="ready" />,
) => {
  const view = await render(ui);
  const style = mockStack.at(-1)?.statusBarStyle;
  await view.unmount();
  return style;
};

test("Forge's own iOS builds: every screen states Forge's style", async () => {
  // The default dark theme: light icons.
  expect(await stackStyle()).toBe("light");
  // The light theme: dark icons.
  mockProfile = { theme: "light" };
  expect(await stackStyle()).toBe("dark");
  // Over the intro: light icons whatever the theme.
  expect(
    await stackStyle(
      <IntroOnScreen.Provider value>
        <AppStack entry="ready" />
      </IntroOnScreen.Provider>,
    ),
  ).toBe("light");
  // A development build reports bare: the same.
  mockApp.environment = "bare";
  expect(await stackStyle()).toBe("dark");
});

test("Forge's Appearance decides, not the phone's; System follows the phone", async () => {
  for (const scheme of ["light", "dark"]) {
    mockPhone.scheme = scheme;
    mockProfile = { theme: "dark" };
    expect(await stackStyle()).toBe("light");
    mockProfile = { theme: "light" };
    expect(await stackStyle()).toBe("dark");
    // System: Forge's colours follow the phone, and so do the icons.
    mockProfile = { theme: "system" };
    expect(await stackStyle()).toBe(scheme === "light" ? "dark" : "light");
  }
});

test("Expo Go: the stack states nothing (its Info.plist keeps the setting off)", async () => {
  mockApp.environment = "storeClient";
  for (const theme of ["dark", "light"]) {
    mockProfile = { theme };
    expect(await stackStyle()).toBeUndefined();
  }
});

test("Android: the stack states nothing; StatusBar applies the style, as before", async () => {
  const restore = jest.replaceProperty(Platform, "OS", "android");
  try {
    for (const theme of ["dark", "light"]) {
      mockProfile = { theme };
      expect(await stackStyle()).toBeUndefined();
    }
  } finally {
    restore.restore();
  }
});

test("the workout logger stays a full-screen modal", async () => {
  await stackStyle();
  expect(mockScreens.find((s) => s.name === "workout")?.options).toEqual({
    presentation: "fullScreenModal",
  });
});
