import { renderHook, act } from "@testing-library/react-native";
import { searchBranded } from "../../src/data/branded-catalog";
import { useBrandedSearch } from "../../src/components/nutrition/useBrandedSearch";
import { brandedFood } from "../../src/domain/branded";

// Phase 7.3E: branded search state for Add food. Bounded pages on demand,
// stale answers ignored, failures recoverable, short queries never searched.

const food = (i: number) =>
  brandedFood({
    id: i,
    fdcId: 1000 + i,
    name: `PROTEIN BAR ${i}`,
    brand: "QUEST",
    basis: "g",
    serving: 60,
    household: "1 BAR",
    servingLabel: "1 BAR",
    servingSource: "label",
    kcal: 350,
    protein: 35,
    carbs: 36.7,
    fat: 13.3,
  });
const ALL = Array.from({ length: 45 }, (_, i) => food(i));
const flush = () => act(async () => {});

beforeEach(() => {
  jest.mocked(searchBranded).mockReset();
  jest.mocked(searchBranded).mockImplementation(async (_q, offset = 0) => ({
    foods: ALL.slice(offset, offset + 30),
    total: ALL.length,
    broad: false,
  }));
});

test("one page first, the next only on request, never the whole catalogue", async () => {
  const { result } = await renderHook(() => useBrandedSearch("quest"));
  await flush();
  expect(result.current.results.foods).toHaveLength(30);
  expect(result.current.results.total).toBe(45);
  expect(result.current.results.more).toBe(true);
  expect(result.current.pending).toBe(false);
  expect(searchBranded).toHaveBeenCalledTimes(1);
  expect(searchBranded).toHaveBeenLastCalledWith("quest");
  await act(async () => {
    result.current.more();
    result.current.more(); // a second tap while loading does nothing
  });
  await flush();
  expect(searchBranded).toHaveBeenCalledTimes(2);
  expect(searchBranded).toHaveBeenLastCalledWith("quest", 30, 45);
  expect(result.current.results.foods.map((f) => f.name)).toEqual(
    ALL.map((f) => f.name),
  );
  expect(result.current.results.more).toBe(false);
  await act(async () => result.current.more());
  expect(searchBranded).toHaveBeenCalledTimes(2);
});

test("an older, slower answer never replaces a newer one", async () => {
  const answers: ((v: unknown) => void)[] = [];
  jest.mocked(searchBranded).mockImplementation(
    (q) =>
      new Promise((res) =>
        answers.push(() =>
          res({
            foods: [food(q === "kind" ? 1 : 2)],
            total: 1,
            broad: false,
          }),
        ),
      ),
  );
  const { result, rerender } = await renderHook(
    ({ q }: { q: string }) => useBrandedSearch(q),
    { initialProps: { q: "kind" } },
  );
  await rerender({ q: "quest" });
  expect(result.current.pending).toBe(true);
  await act(async () => answers[1]!(null)); // "quest" answers first
  await act(async () => answers[0]!(null)); // then the stale "kind"
  expect(result.current.results.query).toBe("quest");
  expect(result.current.results.foods[0]!.name).toBe("PROTEIN BAR 2");
});

test("short queries don't search; a failure is reported and Try again recovers", async () => {
  const { result, rerender } = await renderHook(
    ({ q }: { q: string }) => useBrandedSearch(q),
    { initialProps: { q: "q" } },
  );
  await flush();
  expect(searchBranded).not.toHaveBeenCalled();
  expect(result.current.results.status).toBe("idle");
  expect(result.current.pending).toBe(false);
  jest
    .mocked(searchBranded)
    .mockRejectedValueOnce(new Error("Branded foods couldn't be opened."));
  await rerender({ q: "quest" });
  await flush();
  expect(result.current.results.status).toBe("error");
  expect(result.current.results.error).toBe(
    "Branded foods couldn't be opened.",
  );
  await act(async () => result.current.retry());
  await flush();
  expect(result.current.results.status).toBe("ready");
  expect(result.current.results.foods).toHaveLength(30);
});
