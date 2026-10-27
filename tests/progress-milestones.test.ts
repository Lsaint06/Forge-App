import test from "node:test";
import assert from "node:assert/strict";
import {
  achievements,
  kgToLb,
  milestoneList,
  VOLUME_MILESTONE_KG,
} from "../src/domain/metrics";
import {
  milestoneName,
  nextGoals,
} from "../src/domain/presentation/milestones";
import { nextTarget } from "../src/screens/home/model";
import type { GoalView } from "../src/domain/goals";

// Phase 7.4F: milestones (thresholds unchanged, PD-3 units) and next goals.

const ids = (list: { id: string }[]) => list.map((m) => m.id);

test("milestone thresholds are unchanged; achievements are the earned ones", () => {
  const cases: [number, number, number, string[]][] = [
    [0, 0, 0, []],
    [1, 9999, 0, ["first"]],
    [9, 10000, 0, ["first", "volume"]],
    [10, 0, 1, ["first", "ten", "pr"]],
    [99, 0, 0, ["first", "ten"]],
    [100, 10000, 3, ["first", "ten", "hundred", "volume", "pr"]],
  ];
  for (const [count, volume, prs, earned] of cases) {
    assert.deepEqual(ids(achievements(count, volume, prs)), earned);
    const all = milestoneList(count, volume, prs);
    assert.deepEqual(ids(all), ["first", "ten", "hundred", "volume", "pr"]);
    assert.deepEqual(
      all.filter((m) => m.ok),
      achievements(count, volume, prs),
    );
  }
  assert.equal(VOLUME_MILESTONE_KG, 10000);
});

test("PD-3: the volume milestone reads in the lifter's unit; others unchanged", () => {
  const [, , , volume, pr] = milestoneList(0, 0, 0);
  assert.equal(milestoneName(volume!, "kg"), "10,000 kg lifted");
  assert.equal(milestoneName(volume!, "lb"), "22,046 lb lifted");
  assert.equal(Math.round(kgToLb(VOLUME_MILESTONE_KG)), 22046);
  assert.equal(milestoneName(pr!, "lb"), "New territory · first PR");
});

let n = 0;
function view(patch: Partial<GoalView> & { createdAt?: number }): GoalView {
  n++;
  const { createdAt = n, ...rest } = patch;
  return {
    goal: { id: `g${n}`, createdAt } as GoalView["goal"],
    type: undefined,
    habit: false,
    status: "active",
    name: `Goal ${n}`,
    measure: "",
    target: "",
    state: "",
    reached: false,
    historical: false,
    notes: [],
    spoken: "",
    ...rest,
  } as GoalView;
}

test("next goals: closest measured targets first, then recorded ones; never archived or achieved", () => {
  const bench = view({ ratio: 0.95, current: "95 kg" });
  const weight = view({ ratio: 0.6, current: "82 kg" });
  const habit = view({ habit: true, ratio: 0.9, current: "3 / 4" });
  const unmeasured = view({ current: "2,400 kcal" });
  const reachedWaiting = view({ ratio: 1, reached: true, current: "100 kg" });
  const noValue = view({});
  const archived = view({ status: "archived", ratio: 0.99, current: "x" });
  const achieved = view({ status: "achieved", ratio: 1, current: "x" });
  const views = [
    weight,
    habit,
    unmeasured,
    reachedWaiting,
    noValue,
    archived,
    achieved,
    bench,
  ];
  const next = nextGoals(views, 6);
  assert.deepEqual(
    next.map((v) => v.name),
    [
      bench.name,
      weight.name,
      // Then by newest: the reached one waits to be marked, the habit, the rest.
      reachedWaiting.name,
      unmeasured.name,
      habit.name,
    ],
  );
  assert.equal(nextGoals(views).length, 3);
  // The first is always Home's next target.
  for (let i = 0; i < views.length; i++) {
    const subset = views.filter((_, j) => j !== i);
    assert.equal(nextGoals(subset)[0], nextTarget(subset));
  }
  assert.deepEqual(nextGoals([]), []);
  assert.deepEqual(nextGoals([noValue, archived]), []);
});
