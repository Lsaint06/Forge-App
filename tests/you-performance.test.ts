import test from "node:test";
import assert from "node:assert/strict";
import {
  bodyweightSource,
  heightText,
  weeksConsistent,
} from "../src/domain/presentation/you";
import { dayTitle } from "../src/domain/calendar-dates";

// Phase 7.5C: Weeks consistent, height and the bodyweight source line.
// 2026-10-26 is a Monday; weeks run Monday to Sunday.

const at = (date: string, time = "12:00:00") =>
  new Date(`${date}T${time}`).getTime();
const done = (date: string, time?: string) => ({
  status: "completed" as const,
  startedAt: at(date, time) - 3600000,
  finishedAt: at(date, time),
});
const WED = "2026-10-28";

test("weeks consistent: nothing completed is zero", () => {
  assert.equal(weeksConsistent([], WED), 0);
  // Unfinished workouts never count.
  assert.equal(
    weeksConsistent(
      [
        { status: "active", startedAt: at(WED), finishedAt: null },
        {
          status: "active",
          startedAt: at("2026-10-21"),
          finishedAt: null,
        },
      ],
      WED,
    ),
    0,
  );
});

test("weeks consistent: the current week counts once it has a workout", () => {
  assert.equal(weeksConsistent([done("2026-10-26")], WED), 1);
  // Several workouts in one week are still one week.
  assert.equal(
    weeksConsistent([done("2026-10-26"), done("2026-10-27"), done(WED)], WED),
    1,
  );
});

test("weeks consistent: a week still in progress never breaks the run", () => {
  // Nothing yet this week: last week anchors the run.
  assert.equal(
    weeksConsistent([done("2026-10-21"), done("2026-10-14")], WED),
    2,
  );
  // Nothing this week or last week: the run is over.
  assert.equal(weeksConsistent([done("2026-10-14")], WED), 0);
});

test("weeks consistent: consecutive weeks, ended by a fully missed week", () => {
  const list = [
    done("2026-10-27"),
    done("2026-10-19"),
    // 2026-10-12 to 2026-10-18: nothing.
    done("2026-10-08"),
    done("2026-10-01"),
  ];
  assert.equal(weeksConsistent(list, WED), 2);
  assert.equal(weeksConsistent([...list, done("2026-10-15")], WED), 5);
});

test("weeks consistent: Sunday and Monday belong to different weeks", () => {
  const sunday = done("2026-10-25", "23:30:00");
  // Monday: Sunday's workout is last week's, which anchors the run.
  assert.equal(weeksConsistent([sunday], "2026-10-26"), 1);
  assert.equal(
    weeksConsistent([sunday, done("2026-10-26", "00:30:00")], "2026-10-26"),
    2,
  );
  // A workout started on Sunday and finished on Monday is Monday's.
  const late = {
    status: "completed" as const,
    startedAt: at("2026-10-25", "23:30:00"),
    finishedAt: at("2026-10-26", "00:20:00"),
  };
  assert.equal(weeksConsistent([late], "2026-11-02"), 1);
  assert.equal(weeksConsistent([late], "2026-11-09"), 0);
});

test("weeks consistent: a workout dated after today is not counted ahead", () => {
  assert.equal(weeksConsistent([done("2026-11-03")], WED), 0);
});

test("height: whole centimetres for kilograms, feet and inches for pounds", () => {
  assert.deepEqual(heightText(178, "kg"), { value: "178", unit: "cm" });
  assert.deepEqual(heightText(177.8, "kg"), { value: "178", unit: "cm" });
  assert.deepEqual(heightText(177.8, "lb"), { value: "5 ft 10 in" });
  assert.deepEqual(heightText(182.88, "lb"), { value: "6 ft 0 in" });
  assert.equal(heightText(0, "kg"), undefined);
  assert.equal(heightText(0, "lb"), undefined);
});

test("bodyweight source: the weigh-in's day, or the profile", () => {
  assert.equal(bodyweightSource(undefined, WED), "From your profile");
  assert.equal(bodyweightSource(WED, WED), "Logged today");
  assert.equal(bodyweightSource("2026-10-27", WED), "Logged yesterday");
  assert.equal(
    bodyweightSource("2026-10-20", WED),
    `Logged ${dayTitle("2026-10-20", WED)}`,
  );
});
