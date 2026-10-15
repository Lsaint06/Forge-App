jest.mock("../../src/state", () => ({
  useRepo: jest.fn(() => ({
    profile: () => ({ theme: "dark", notifications: false }),
  })),
  mutate: (fn: () => unknown) => fn(),
  useApp: (selector: (s: { profile: undefined }) => unknown) =>
    selector({ profile: undefined }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Icon" }));
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => true,
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: number) => value,
  };
});
