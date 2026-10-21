import { test } from "node:test";
import assert from "node:assert/strict";
import { exercises } from "../src/data/catalog";
import {
  checkLibrary,
  findProgramVersion,
  programFingerprint,
  programKey,
  publishedPrograms,
  validateProgram,
  type CuratedProgram,
} from "../src/domain/programs/model";
import { recommendProgram } from "../src/domain/programs/recommend";
import { trainingWeekdays } from "../src/domain/programs/schedule";
import { missingTrainingProfile, trainingGoal } from "../src/domain/profile";
import { defaults } from "../src/domain/types";
import { profileSchema } from "../src/domain/validation";
import { programLibrary, programLock, programSources } from "../src/programs";
import { placeholderProgram } from "./program-fixture";

const published = (patch: Partial<CuratedProgram> = {}) =>
  placeholderProgram({ status: "published", ...patch });

test("the bundled library is valid, locked and contains no placeholder data", () => {
  assert.deepEqual(checkLibrary(programSources, programLock, exercises), []);
  assert.equal(programLibrary.length, programSources.length);
  assert.ok(
    programLibrary.every(
      (p) => !/placeholder/i.test(`${p.id} ${p.name} ${p.description}`),
    ),
  );
});

test("authored programs validate without being altered", () => {
  const program = placeholderProgram();
  const checked = validateProgram(structuredClone(program), exercises);
  assert.deepEqual(checked, program);
});

test("validation rejects structural mistakes instead of repairing them", () => {
  const invalid: [string, unknown][] = [
    ["pattern", placeholderProgram({ daysPerWeek: 4 })],
    [
      "sessions",
      placeholderProgram({
        phases: [
          {
            name: "P",
            sessions: placeholderProgram().phases[0]!.sessions.slice(0, 2),
          },
        ],
      }),
    ],
    ["duration", placeholderProgram({ durationWeeks: 8 })],
    ["unknown key", { ...placeholderProgram(), sets: 3 }],
    [
      "reps",
      placeholderProgram({
        phases: [
          {
            name: "P",
            sessions: placeholderProgram().phases[0]!.sessions.map((s) => ({
              ...s,
              exercises: [{ ...s.exercises[0]!, reps: { min: 9, max: 5 } }],
            })),
          },
        ],
      }),
    ],
  ];
  for (const [label, input] of invalid)
    assert.throws(() => validateProgram(input, exercises), Error, label);
});

test("multi-phase programs need week counts that sum to the duration", () => {
  const sessions = placeholderProgram().phases[0]!.sessions;
  const phased = placeholderProgram({
    durationWeeks: 8,
    phases: [
      { name: "One", weeks: 4, sessions },
      { name: "Two", weeks: 4, sessions },
    ],
  });
  assert.doesNotThrow(() => validateProgram(phased, exercises));
  assert.throws(
    () =>
      validateProgram(
        {
          ...phased,
          phases: [{ ...phased.phases[0]!, weeks: 3 }, phased.phases[1]],
        },
        exercises,
      ),
    /total 7/,
  );
});

test("unknown and non-rep exercises are reported, never substituted", () => {
  const withExercise = (exerciseId: string) =>
    placeholderProgram({
      phases: [
        {
          name: "P",
          sessions: placeholderProgram().phases[0]!.sessions.map((s) => ({
            ...s,
            exercises: [{ ...s.exercises[0]!, exerciseId }],
          })),
        },
      ],
    });
  assert.throws(
    () => validateProgram(withExercise("not-an-exercise"), exercises),
    /unknown exercise "not-an-exercise"/,
  );
  assert.throws(
    () => validateProgram(withExercise("plank"), exercises),
    /duration-based/,
  );
});

test("fingerprints ignore key order and detect any content change", () => {
  const program = published();
  const reordered = Object.fromEntries(
    Object.entries(program).reverse(),
  ) as CuratedProgram;
  assert.equal(programFingerprint(reordered), programFingerprint(program));
  const edited = structuredClone(program);
  edited.phases[0]!.sessions[0]!.exercises[0]!.sets = 2;
  assert.notEqual(programFingerprint(edited), programFingerprint(program));
});

test("the lock blocks silent edits and removal of published versions", () => {
  const program = published();
  const key = programKey(program);
  const lock = { [key]: programFingerprint(program) };
  assert.deepEqual(checkLibrary([program], lock, exercises), []);
  assert.match(checkLibrary([program], {}, exercises)[0]!, /not in the lock/);
  const edited = structuredClone(program);
  edited.phases[0]!.sessions[0]!.exercises[0]!.reps = { min: 1, max: 2 };
  assert.match(
    checkLibrary([edited], lock, exercises)[0]!,
    /changed after publishing/,
  );
  assert.match(checkLibrary([], lock, exercises)[0]!, /no longer bundled/);
  assert.match(
    checkLibrary([program, program], lock, exercises)[0]!,
    /more than once/,
  );
  // Drafts need no lock entry.
  assert.deepEqual(checkLibrary([placeholderProgram()], {}, exercises), []);
});

test("listing shows the latest published version; enrolled versions stay loadable", () => {
  const v1 = published({ version: 1 });
  const v2 = published({ version: 2, summary: "Revised." });
  const draft = placeholderProgram({ version: 3 });
  const library = [v1, v2, draft];
  assert.deepEqual(publishedPrograms(library), [v2]);
  assert.equal(findProgramVersion(library, v1.id, 1), v1);
  assert.equal(findProgramVersion(library, v1.id, 3), undefined);
});

test("recommendations match the lifter's own experience and goal", () => {
  const strength3 = published({ id: "s3" });
  const strength4 = published({
    id: "s4",
    daysPerWeek: 4,
    weeklyPattern: ["train", "train", "rest", "train", "train", "rest", "rest"],
    phases: [
      {
        name: "P",
        sessions: ["a", "b", "c", "d"].map((id) => ({
          ...placeholderProgram().phases[0]!.sessions[0]!,
          id,
        })),
      },
    ],
  });
  const muscle = published({ id: "m3", goal: "Muscle Building" });
  const library = [strength3, strength4, muscle, placeholderProgram()];
  const profile = {
    ...defaults,
    experience: "Beginner",
    goal: "Strength",
    frequency: 4,
  };

  const match = recommendProgram(profile, library);
  assert.equal(match.kind, "match");
  if (match.kind !== "match") return;
  assert.equal(match.program.id, "s4");
  assert.deepEqual(
    match.alternatives.map((p) => p.id),
    ["s3"],
  );
  assert.equal(match.reasons.length, 3);

  assert.equal(
    recommendProgram({ ...profile, experience: "Advanced" }, library).kind,
    "none",
  );
  assert.deepEqual(recommendProgram(defaults, library), {
    kind: "incomplete",
    missing: ["experience", "goal"],
  });
  // Drafts are never recommended.
  assert.equal(recommendProgram(profile, [placeholderProgram()]).kind, "none");
});

test("legacy goals keep their meaning; ambiguous goals read as not set", () => {
  assert.equal(trainingGoal({ goal: "Build strength" }), "Strength");
  assert.equal(trainingGoal({ goal: "Build muscle" }), "Muscle Building");
  assert.equal(trainingGoal({ goal: "Improve fitness" }), undefined);
  assert.equal(trainingGoal({ goal: "Manage weight" }), undefined);
  assert.deepEqual(
    missingTrainingProfile({ experience: "Advanced", goal: "Manage weight" }),
    ["goal", "restDay"],
  );
});

test("profiles without a rest day stay valid; invalid days are rejected", () => {
  const legacy = {
    ...defaults,
    experience: "Beginner",
    goal: "Build strength",
  };
  assert.equal(profileSchema.parse(legacy).restDay, undefined);
  assert.equal(profileSchema.parse({ ...legacy, restDay: 6 }).restDay, 6);
  assert.throws(() => profileSchema.parse({ ...legacy, restDay: 7 }));
});

test("weekly patterns rotate around the preferred rest day without changing spacing", () => {
  const pattern: CuratedProgram["weeklyPattern"] = [
    "train",
    "rest",
    "train",
    "rest",
    "train",
    "rest",
    "rest",
  ];
  assert.deepEqual(trainingWeekdays(pattern), [0, 2, 4]);
  assert.deepEqual(trainingWeekdays(pattern, 6), [0, 2, 4]);
  for (let restDay = 0; restDay < 7; restDay++) {
    const days = trainingWeekdays(pattern, restDay);
    assert.equal(days.length, 3);
    assert.ok(!days.includes(restDay), `rest day ${restDay}`);
    // Authored gaps between sessions are preserved.
    const gaps = days.map((d, i) => (days[(i + 1) % 3]! - d + 7) % 7);
    assert.deepEqual([...gaps].sort(), [2, 2, 3]);
  }
  const fiveDay: CuratedProgram["weeklyPattern"] = [
    "train",
    "train",
    "rest",
    "train",
    "train",
    "train",
    "rest",
  ];
  for (let restDay = 0; restDay < 7; restDay++)
    assert.ok(!trainingWeekdays(fiveDay, restDay).includes(restDay));
});
