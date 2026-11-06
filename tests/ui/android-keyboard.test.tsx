import React from "react";
import { Platform, Text } from "react-native";
import { render } from "@testing-library/react-native";
import { Screen, Sheet } from "../../src/components/ui";
import { ForgeScreen, ForgeSubScreen } from "../../src/components/reforge";
import { EntryFrame } from "../../src/screens/entry/EntryFrame";

// Phase 8.4 M3: Expo apps draw edge to edge on Android, so the window no
// longer resizes for the keyboard; a KeyboardAvoidingView without a
// behavior leaves its inputs under it (docs.expo.dev/guides/keyboard-handling).
// React Native 0.88 makes a Modal's window edge to edge too. Every screen,
// sheet and entry form therefore pads above the keyboard on both platforms.
// The workout logger does the same itself on Android, and insets its list on
// iOS.

jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock(
  "react-native/Libraries/Components/Keyboard/KeyboardAvoidingView",
  () => {
    const { View } = jest.requireActual("react-native");
    return {
      __esModule: true,
      default: ({
        behavior,
        enabled = true,
        style,
        children,
      }: React.PropsWithChildren<{
        behavior?: string;
        enabled?: boolean;
        style?: unknown;
      }>) => (
        <View
          testID="keyboard-avoiding"
          style={style}
          {...{ behavior, enabled }}
        >
          {children}
        </View>
      ),
    };
  },
);

const HOSTS: [string, () => React.ReactElement][] = [
  [
    "Screen",
    () => (
      <Screen title="Preferences">
        <Text>Body</Text>
      </Screen>
    ),
  ],
  [
    "Sheet",
    () => (
      <Sheet visible title="Add food" onClose={() => {}}>
        <Text>Body</Text>
      </Sheet>
    ),
  ],
  [
    "ForgeScreen",
    () => (
      <ForgeScreen>
        <Text>Body</Text>
      </ForgeScreen>
    ),
  ],
  [
    "ForgeSubScreen",
    () => (
      <ForgeSubScreen title="Account" onBack={() => {}}>
        <Text>Body</Text>
      </ForgeSubScreen>
    ),
  ],
  [
    "EntryFrame",
    () => (
      <EntryFrame title="Sign in">
        <Text>Body</Text>
      </EntryFrame>
    ),
  ],
];

const avoiding = async (ui: React.ReactElement) => {
  const view = await render(ui);
  const found = view
    .getAllByTestId("keyboard-avoiding", { includeHiddenElements: true })
    .map((node) => ({
      behavior: node.props.behavior,
      enabled: node.props.enabled,
    }));
  await view.unmount();
  return found;
};

for (const os of ["android", "ios"] as const)
  test(`${os}: every screen, sheet and entry form keeps its inputs above the keyboard`, async () => {
    const restore = jest.replaceProperty(Platform, "OS", os);
    try {
      for (const [name, ui] of HOSTS)
        expect({ name, avoiding: await avoiding(ui()) }).toEqual({
          name,
          avoiding: [{ behavior: "padding", enabled: true }],
        });
    } finally {
      restore.restore();
    }
  });
