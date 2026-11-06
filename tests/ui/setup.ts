// The bundled branded catalogue is native SQLite: UI tests see no branded
// products unless a test provides them (see food-branded.test.tsx).
jest.mock("../../src/data/branded-catalog", () => ({
  BRANDED_CATALOG: "usda-branded-2026-04-30",
  BRANDED_RELEASE: "2026-04-30",
  BRANDED_ATTRIBUTION: "USDA FoodData Central",
  searchBranded: jest.fn(async () => null),
  brandedByBarcode: jest.fn(async () => null),
  brandedProblem: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  brandedOpened: () => false,
}));
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
