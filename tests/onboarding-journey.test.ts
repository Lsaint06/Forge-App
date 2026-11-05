import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { defaults, type Profile } from "../src/domain/types";
import {
  experienceLevels,
  restDayNames,
  trainingGoals,
} from "../src/domain/profile";
import {
  programKey,
  publishedPrograms,
  type CuratedProgram,
} from "../src/domain/programs/model";
import { recommendProgram } from "../src/domain/programs/recommend";
import { programWorkouts } from "../src/domain/programs/presentation";
import { programLibrary } from "../src/programs";
import { exercises } from "../src/data/catalog";
import {
  ARRIVAL_KEY,
  aboutIssues,
  afterReveal,
  introDue,
  nameInput,
  nameValue,
  programForKey,
  readArrival,
  readProgress,
  resumeStage,
  revealFor,
  revealWorkouts,
  supportedDays,
  trainingAnswers,
  trainingComplete,
  trainingMissing,
  writeArrival,
  writeProgress,
  type Progress,
} from "../src/domain/onboarding/journey";
import {
  bodyFatText,
  feetInches,
  heightCmText,
  readFeetInches,
  readWeight,
  weightText,
} from "../src/domain/onboarding/about";
import {
  DISCOVER_PAGES,
  LANDING,
  LANDING_SPOKEN,
} from "../src/domain/onboarding/discover";
import {
  RIR_MEANING,
  plainDescription,
  plainSummary,
  progressionParts,
  revealFit,
  revealStats,
  revealTitle,
  revealWeek,
  sentences,
} from "../src/domain/onboarding/reveal";
import { totalSessions } from "../src/domain/programs/enrollment";
import { trainingWeekdays } from "../src/domain/programs/schedule";
import { introMark } from "../src/screens/onboarding/handoff";
import {
  LANDING_MIN_WALL,
  LANDING_SPACE,
  landingPlan,
  type LandingMeasures,
} from "../src/screens/onboarding/landing-layout";
import {
  WORDMARK_HEIGHT,
  WORDMARK_WIDTH,
} from "../src/components/splash/wordmark";

// Phase 9.2: first-time setup's journey, without a screen. Every answer the
// athlete can give reaches a real, published program written for exactly
// those days; the reveal is that program as authored; setup resumes where
// it was and never skips a step.

const library = programLibrary;
const profile = (p: Partial<Profile> = {}): Profile => ({ ...defaults, ...p });
const about = { name: "Lifter", height: 180, weight: 80 };
const answered = (p: Partial<Profile> = {}, days = 4): [Profile, Progress] => [
  profile({
    ...about,
    experience: "Intermediate",
    goal: "Strength",
    restDay: 6,
    frequency: days,
    ...p,
  }),
  { stage: "reveal", days },
];

test("the progress record reads back exactly, and anything unreadable starts at About you", () => {
  for (const p of [
    { stage: "about" },
    { stage: "training", days: 3 },
    { stage: "reveal", days: 5, revealed: "forge-strength-beginner-5-day@1" },
  ] as Progress[])
    assert.deepEqual(readProgress(writeProgress(p)), p);
  for (const raw of [
    undefined,
    null,
    "",
    "{",
    "[]",
    "42",
    '{"stage":"paywall"}',
    '{"stage":"enter"}',
  ])
    assert.deepEqual(readProgress(raw), { stage: "about" });
  // Unusable parts are dropped, not trusted.
  assert.deepEqual(
    readProgress('{"stage":"training","days":3.5,"revealed":"../x@1"}'),
    { stage: "training" },
  );
});

test("About you needs a height and a starting weight; the profile's own rules apply", () => {
  assert.deepEqual(aboutIssues(profile()), ["height", "weight"]);
  assert.deepEqual(aboutIssues(profile(about)), []);
  // The default name is a valid name; an empty field keeps it.
  assert.equal(nameInput(profile()), "");
  assert.equal(nameInput(profile({ name: "Sam" })), "Sam");
  assert.equal(nameValue("   "), defaults.name);
  assert.equal(nameValue(" Sam "), "Sam");
  for (const [bad, field] of [
    [{ name: "x".repeat(81) }, "name"],
    [{ height: 301 }, "height"],
    [{ height: NaN }, "height"],
    [{ weight: 701 }, "weight"],
    [{ weight: 0 }, "weight"],
    [{ bodyFat: 101 }, "bodyFat"],
  ] as const)
    assert.deepEqual(aboutIssues(profile({ ...about, ...bad })), [field]);
  // Body fat stays optional.
  assert.deepEqual(aboutIssues(profile({ ...about, bodyFat: 0 })), []);
});

test("units: kilograms and centimetres stored, typed in the athlete's own units", () => {
  assert.equal(weightText(0, "kg"), "");
  assert.equal(weightText(80, "kg"), "80");
  assert.equal(weightText(80, "lb"), "176.37");
  assert.equal(readWeight("80,5", "kg"), 80.5);
  assert.ok(Math.abs(readWeight("176.37", "lb") - 80) < 0.01);
  assert.equal(readWeight("", "lb"), 0);
  assert.ok(Number.isNaN(readWeight("eighty", "kg")));
  assert.equal(heightCmText(0), "");
  assert.equal(heightCmText(180.256), "180.26");
  assert.deepEqual(feetInches(0), { feet: "", inches: "" });
  assert.deepEqual(feetInches(180.34), { feet: "5", inches: "11" });
  assert.ok(Math.abs(readFeetInches("5", "11") - 180.34) < 0.01);
  assert.equal(readFeetInches("6", ""), 182.88);
  assert.equal(readFeetInches("", ""), 0);
  for (const [f, i] of [
    ["5", "12"],
    ["5.5", "0"],
    ["", "7"],
    ["x", "1"],
  ])
    assert.ok(Number.isNaN(readFeetInches(f!, i!)), `${f}' ${i}"`);
  assert.equal(bodyFatText(0), "");
  assert.equal(bodyFatText(18.5), "18.5");
});

test("only the days a week Forge Paths has programs for are offered", () => {
  const all = publishedPrograms(library).map((p) => p.daysPerWeek);
  assert.deepEqual(supportedDays(library), [...new Set(all)].sort());
  assert.deepEqual(supportedDays(library), [3, 4, 5]);
  for (const experience of experienceLevels)
    for (const goal of trainingGoals)
      assert.deepEqual(supportedDays(library, experience, goal), [3, 4, 5]);
  // A combination without a 4-day program never offers 4 days.
  const without4 = library.filter(
    (p) => !(p.goal === "Strength" && p.daysPerWeek === 4),
  );
  assert.deepEqual(supportedDays(without4, "Beginner", "Strength"), [3, 5]);
  // Drafts never count.
  const drafts = library.map((p) => ({ ...p, status: "draft" as const }));
  assert.deepEqual(supportedDays(drafts), []);
});

test("days a week count only once chosen, and only when Forge Paths offers them", () => {
  const p = profile({ ...about, experience: "Beginner", goal: "Strength" });
  // The profile's default frequency is never taken as a choice.
  assert.equal(
    trainingAnswers(p, { stage: "training" }, library).days,
    undefined,
  );
  assert.equal(
    trainingAnswers(
      { ...p, frequency: 4 },
      { stage: "training", days: 4 },
      library,
    ).days,
    4,
  );
  // Out of step with the profile, or not offered: not a choice.
  assert.equal(
    trainingAnswers(
      { ...p, frequency: 5 },
      { stage: "training", days: 4 },
      library,
    ).days,
    undefined,
  );
  assert.equal(
    trainingAnswers(
      { ...p, frequency: 6 },
      { stage: "training", days: 6 },
      library,
    ).days,
    undefined,
  );
  const answers = trainingAnswers(
    { ...p, frequency: 3, restDay: 0 },
    { stage: "training", days: 3 },
    library,
  );
  assert.equal(trainingComplete(answers), true);
  assert.deepEqual(trainingMissing(answers), []);
  assert.deepEqual(
    trainingMissing(
      trainingAnswers(profile(about), { stage: "training" }, library),
    ),
    ["your experience", "your goal", "days a week", "a rest day"],
  );
});

test("setup resumes where it was, never past a step that is missing answers", () => {
  const [done, reveal] = answered();
  assert.equal(resumeStage(done, reveal, library), "reveal");
  assert.equal(
    resumeStage(done, { ...reveal, stage: "training" }, library),
    "training",
  );
  assert.equal(
    resumeStage(done, { ...reveal, stage: "about" }, library),
    "about",
  );
  // A record that skips ahead is held to the answers.
  assert.equal(resumeStage(profile(), reveal, library), "about");
  assert.equal(
    resumeStage({ ...done, experience: "" }, reveal, library),
    "training",
  );
  assert.equal(
    resumeStage(done, { stage: "reveal" }, library),
    "training",
    "days a week never chosen",
  );
  assert.equal(
    resumeStage({ ...done, restDay: undefined }, reveal, library),
    "training",
  );
});

test("every answer reveals the published program written for exactly those days (all 18)", () => {
  const seen = new Set<string>();
  for (const experience of experienceLevels)
    for (const goal of trainingGoals)
      for (const days of supportedDays(library, experience, goal))
        for (let restDay = 0; restDay < 7; restDay++) {
          const [p, progress] = answered({ experience, goal, restDay }, days);
          const reveal = revealFor(p, progress, library)!;
          const label = `${experience} ${goal} ${days} days, rest ${restDayNames[restDay]}`;
          assert.ok(reveal, label);
          const { program } = reveal;
          assert.equal(program.status, "published", label);
          assert.deepEqual(
            [program.experience, program.goal, program.daysPerWeek],
            [experience, goal, days],
            label,
          );
          // The real engine's own choice and reasons, not a second engine.
          const rec = recommendProgram(p, library);
          assert.equal(rec.kind, "match");
          if (rec.kind === "match") {
            assert.equal(programKey(rec.program), programKey(program), label);
            assert.deepEqual(reveal.reasons, rec.reasons);
            assert.deepEqual(reveal.alternatives, rec.alternatives);
          }
          assert.ok(
            reveal.reasons.some((r) =>
              r.includes(`${days} sessions a week matches`),
            ),
            label,
          );
          // Its week: exactly its training days, the rest day kept free.
          assert.equal(reveal.weekdays.length, days, label);
          assert.ok(!reveal.weekdays.includes(restDay), label);
          assert.deepEqual(
            reveal.weekdays,
            [...reveal.weekdays].sort((a, b) => a - b),
          );
          assert.equal(reveal.restDay, restDay);
          for (const alt of reveal.alternatives)
            assert.deepEqual(
              [alt.experience, alt.goal],
              [experience, goal],
              label,
            );
          seen.add(programKey(program));
        }
  assert.equal(seen.size, 18);
  assert.deepEqual(
    [...seen].sort(),
    publishedPrograms(library).map(programKey).sort(),
  );
});

test("the reveal's workouts are the program as authored: every session, exercise, set and rep", () => {
  const catalog = new Map(exercises.map((e) => [e.id, e]));
  for (const program of publishedPrograms(library)) {
    const workouts = revealWorkouts(program);
    // Exactly the distinct workouts Forge Paths lists.
    assert.deepEqual(
      workouts.map((w) => w.session),
      programWorkouts(program).workouts.map((w) => w.session),
    );
    // Every session of every phase is shown, on its day of the week.
    program.phases.forEach((phase, p) =>
      phase.sessions.forEach((session, i) => {
        const shown = workouts.find(
          (w) => w.phases.includes(p) && w.session.id === session.id,
        );
        assert.ok(shown, `${program.id}: ${session.id}`);
        assert.equal(shown.day, i + 1, `${program.id}: ${session.id}`);
        assert.deepEqual(shown.session, session);
      }),
    );
    // Each exercise is a real catalogue exercise with its authored dose.
    for (const w of workouts)
      for (const item of w.session.exercises) {
        assert.ok(catalog.get(item.exerciseId)?.name, item.exerciseId);
        assert.ok(item.sets >= 1 && item.reps.min >= 1);
      }
    assert.ok(program.equipment.length > 0, program.id);
  }
});

test("the version first shown stays while it still fits; otherwise the current one", () => {
  const [p, progress] = answered({}, 3);
  const current = revealFor(p, progress, library)!.program;
  const v2: CuratedProgram = { ...current, version: current.version + 1 };
  const updated = [...library, v2];
  // A newer version published since: the athlete still sees what they saw.
  assert.equal(
    revealFor(p, { ...progress, revealed: programKey(current) }, updated)!
      .program,
    current,
  );
  assert.equal(revealFor(p, progress, updated)!.program, v2);
  // A key that no longer fits the answers (or exists) is ignored.
  assert.equal(
    revealFor(
      p,
      { ...progress, revealed: "forge-muscle-advanced-5-day@1" },
      library,
    )!.program,
    current,
  );
  assert.equal(
    revealFor(p, { ...progress, revealed: `${current.id}@99` }, library)!
      .program,
    current,
  );
  // Nothing to reveal until the answers are complete.
  assert.equal(
    revealFor(profile(about), { stage: "reveal" }, library),
    undefined,
  );
});

test("after the reveal, Phase 9.2 only enters Forge: no paywall, purchase or enrollment", () => {
  assert.equal(afterReveal(), "enterForge");
});

test("the brand intro opens only on a fresh phone, once, and never over a message", () => {
  const fresh = {
    signedOut: true,
    hasLocalData: false,
    syncHistory: false,
    seen: false,
    message: false,
  };
  assert.equal(introDue(fresh), true);
  for (const change of [
    { signedOut: false },
    { owner: "user-a" },
    { hasLocalData: true },
    { syncHistory: true },
    { seen: true },
    { message: true },
  ])
    assert.equal(
      introDue({ ...fresh, ...change }),
      false,
      JSON.stringify(change),
    );
});

test("Discover Forge and Stage A say only what Forge does; Discover quotes the libraries' real numbers", () => {
  const programs = publishedPrograms(library);
  const foods = (
    JSON.parse(readFileSync("src/data/food-library/manifest.json", "utf8")) as {
      catalog: { foods: number };
    }
  ).catalog.foods;
  const text = (page: (typeof DISCOVER_PAGES)[number]) =>
    [page.overline, page.title, page.body].join(" ");
  const paths = text(DISCOVER_PAGES.find((p) => p.key === "paths")!);
  assert.match(paths, new RegExp(`\\b${programs.length} programs\\b`));
  assert.equal(programs.length, 18);
  const days = supportedDays(library);
  assert.match(
    paths,
    new RegExp(`${days.slice(0, -1).join(", ")} or ${days.at(-1)} days a week`),
  );
  const nutrition = text(DISCOVER_PAGES.find((p) => p.key === "nutrition")!);
  assert.match(nutrition, new RegExp(foods.toLocaleString("en-US")));
  // Stage A says what Forge stands for, not what it holds: no numbers at
  // all (the libraries' numbers are Discover's).
  const landing = [...LANDING.lines, LANDING.support].join(" ");
  assert.doesNotMatch(landing, /\d/);
  // Nothing Forge doesn't do, and no promises.
  const all = [landing, ...DISCOVER_PAGES.map(text)].join(" ");
  assert.doesNotMatch(
    all,
    /barcode|scan|\bAI\b|artificial|coach|trainer|guarantee|free|trial|\$|price|subscri|premium|social|friends|wearable|watch|sync/i,
  );
  assert.deepEqual(
    DISCOVER_PAGES.map((p) => p.key),
    ["paths", "train", "progress", "nutrition"],
  );
  // The product carries each page: a headline and a sentence or two.
  for (const page of DISCOVER_PAGES) {
    assert.ok(page.title.length <= 28, page.key);
    assert.ok(page.body.length <= 140, page.key);
  }
  // Stage A (Emergence, founder-approved): THE WORK SHOWS, a display
  // headline on two lines with no closing punctuation, and one plain
  // sentence beneath it.
  assert.deepEqual(LANDING.lines, ["The work", "shows"]);
  assert.equal(LANDING_SPOKEN, "The work shows");
  for (const line of LANDING.lines) assert.doesNotMatch(line, /[.,;:!?]/);
  assert.ok(LANDING.support.length <= 90);
  assert.match(LANDING.support, /^[A-Z].*\.$/);
});

test("Discover's product visuals are bundled, registered and within budget", () => {
  const showcase = readFileSync("src/screens/onboarding/showcase.tsx", "utf8");
  const files = [
    ...new Set(
      [...showcase.matchAll(/assets\/onboarding\/([a-z-]+\.png)/g)].map(
        (m) => m[1]!,
      ),
    ),
  ];
  assert.equal(files.length, 9);
  const register = readFileSync("docs/redesign/reforge/ASSETS.md", "utf8");
  let total = 0;
  for (const file of files) {
    const bytes = readFileSync(`assets/onboarding/${file}`);
    // Lossless PNG (Forge bundles no JPEG: tests/ui/splash.test.tsx).
    assert.equal(bytes.subarray(1, 4).toString(), "PNG", file);
    assert.ok(bytes.length < 240_000, file);
    total += bytes.length;
    assert.ok(register.includes(`assets/onboarding/${file}`), file);
    // The size the composition was laid out for is the image's own.
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    assert.ok(
      showcase.includes(
        `assets/onboarding/${file}"),\n      px: [${width}, ${height}]`,
      ),
      file,
    );
  }
  assert.ok(total < 900_000, `${total} bytes`);
  // Nothing in the folder that isn't used.
  assert.deepEqual(readdirSync("assets/onboarding").sort(), [...files].sort());
});

test("the reveal's first layer: the program's family, the athlete's answers, three real numbers", () => {
  for (const program of publishedPrograms(library)) {
    const title = revealTitle(program);
    // The day count lives in the answers, not the title.
    assert.ok(!/·|\d+ Days/.test(title), program.id);
    assert.ok(program.name.startsWith(title), program.id);
    for (const restDay of [0, 6]) {
      const fit = revealFit(program, restDay);
      assert.deepEqual(
        fit.map((r) => r.label),
        ["Experience", "Goal", "Schedule", "Rest day"],
      );
      assert.equal(fit[0]!.value, program.experience);
      assert.match(
        fit[1]!.value,
        program.goal === "Strength" ? /^Strength$/ : /^Muscle building$/,
      );
      assert.equal(fit[2]!.value, `${program.daysPerWeek} days a week`);
      assert.equal(fit[3]!.value, restDayNames[restDay]);
    }
    const stats = revealStats(program);
    assert.ok(stats.length >= 2 && stats.length <= 3, program.id);
    if (program.durationWeeks !== undefined) {
      assert.deepEqual(stats[0], {
        value: String(program.durationWeeks),
        label: "Weeks",
      });
      assert.deepEqual(stats[1], {
        value: String(totalSessions(program)),
        label: "Sessions",
      });
    } else {
      assert.deepEqual(stats[0], { value: "Ongoing", label: "Length" });
      const workouts = programWorkouts(program).workouts;
      assert.equal(stats[1]!.value, String(workouts.length));
      const sizes = workouts.map((w) => w.session.exercises.length);
      assert.equal(
        stats[2]!.value,
        Math.min(...sizes) === Math.max(...sizes)
          ? String(sizes[0])
          : `${Math.min(...sizes)}–${Math.max(...sizes)}`,
      );
    }
  }
});

test("internal program codes never reach the reveal; the authored words are kept", () => {
  for (const program of publishedPrograms(library)) {
    const summary = plainSummary(program);
    const description = plainDescription(program);
    for (const text of [summary, description])
      assert.doesNotMatch(text, /\b[A-Z]-[A-Z]\d\b|\bV\d\b/, program.id);
    // Only the code is removed: the rest is the authored text.
    assert.ok(
      program.summary.toLowerCase().endsWith(summary.toLowerCase()),
      program.id,
    );
    assert.ok(program.description.endsWith(description), program.id);
    assert.ok(summary.length > 20 && description.length > 20, program.id);
  }
});

test("the reveal's week: each session on its day, in order, around the rest day", () => {
  for (const program of publishedPrograms(library))
    for (let restDay = 0; restDay < 7; restDay++) {
      const week = revealWeek(program, restDay);
      assert.equal(week.length, 7);
      const order = trainingWeekdays(program.weeklyPattern, restDay);
      for (const [i, day] of order.entries())
        assert.equal(week[day]!.session, i + 1, `${program.id} ${restDay}`);
      assert.equal(
        week.filter((d) => d.session !== undefined).length,
        program.daysPerWeek,
      );
      assert.equal(week[restDay]!.rest, true);
      assert.equal(week[restDay]!.session, undefined, program.id);
      assert.equal(week.filter((d) => d.rest).length, 1);
    }
});

test("How progression works: the authored text, one sentence at a time, with RIR explained", () => {
  for (const program of publishedPrograms(library)) {
    const { lead, points } = progressionParts(program.progression);
    // Nothing added, dropped or reworded.
    assert.equal(
      [...(lead ? [lead] : []), ...points].join(" "),
      sentences(program.progression).join(" "),
    );
    assert.equal(
      sentences(program.progression).join(" ").replace(/\s+/g, " "),
      program.progression.replace(/\s+/g, " ").trim(),
    );
    assert.ok(points.length >= 3, program.id);
  }
  assert.match(RIR_MEANING, /reps in reserve/);
});

test("after setup, Home remembers the Forge Path shown, and only a real one", () => {
  const [p, progress] = answered();
  const program = revealFor(p, progress, library)!.program;
  const raw = writeArrival(programKey(program));
  assert.equal(readArrival(raw), programKey(program));
  assert.equal(programForKey(library, readArrival(raw)!), program);
  for (const bad of [
    undefined,
    null,
    "",
    "{",
    '{"program":3}',
    '{"program":"x"}',
  ])
    assert.equal(readArrival(bad), undefined, String(bad));
  assert.equal(
    programForKey(library, "forge-strength-intermediate-4-day@99"),
    undefined,
  );
  assert.equal(ARRIVAL_KEY, "onboardingArrival");
});

test("Stage A continues from the launch intro's last frame: the same wordmark size, place and line", () => {
  // The intro's own layout (src/components/splash/ForgeSplash.tsx). If it
  // changes, handoff.ts must change with it, or the hand-off shows a seam.
  const splash = readFileSync("src/components/splash/ForgeSplash.tsx", "utf8");
  for (const formula of [
    "Math.min(width - 64, 440, height * 0.9)",
    "Math.max(10, Math.min(14, markWidth * 0.032))",
    "insets.top + (height - insets.top - insets.bottom) / 2",
    "centerY - markHeight / 2 - taglineSize",
    "marginTop: taglineSize * 1.6",
    "letterSpacing: taglineSize * 0.42",
    "BUILT THROUGH DISCIPLINE",
  ])
    assert.ok(splash.includes(formula), formula);
  // iPhone 16 Pro, 393 × 852 pt, insets 59/34.
  const phone = introMark({ width: 393, height: 852 }, { top: 59, bottom: 34 });
  assert.equal(phone.width, 329);
  assert.equal(phone.height, (WORDMARK_HEIGHT * 329) / WORDMARK_WIDTH);
  assert.equal(phone.tagline, Math.max(10, Math.min(14, 329 * 0.032)));
  assert.equal(
    phone.top,
    59 + (852 - 59 - 34) / 2 - phone.height / 2 - phone.tagline,
  );
  // iPhone SE: the smallest line size; a large screen: the widest mark.
  assert.equal(
    introMark({ width: 375, height: 667 }, { top: 20, bottom: 0 }).tagline,
    10,
  );
  assert.equal(
    introMark({ width: 1024, height: 1366 }, { top: 24, bottom: 20 }).width,
    440,
  );
});

test("Stage A holds together on every phone and at every text size: the brand starts at the intro's place and only rises, and nothing overlaps", () => {
  const phones = [
    {
      name: "iPhone SE",
      width: 375,
      height: 667,
      insets: { top: 20, bottom: 0 },
    },
    {
      name: "iPhone 16 Pro",
      width: 393,
      height: 852,
      insets: { top: 59, bottom: 34 },
    },
    {
      name: "iPhone 16 Pro Max",
      width: 440,
      height: 956,
      insets: { top: 62, bottom: 34 },
    },
    { name: "Pixel", width: 412, height: 915, insets: { top: 24, bottom: 24 } },
    {
      name: "iPad",
      width: 1024,
      height: 1366,
      insets: { top: 24, bottom: 20 },
    },
  ];
  // Heights as measured on the emulator at 1× and 1.3× text, and beyond:
  // the display lines stop growing at 1.3×, the sentence and actions don't.
  // At accessibility sizes (3×) the actions alone can fill a small screen.
  const texts = [
    { scale: 1, brand: 84, statement: 142, actions: 150 },
    { scale: 1.3, brand: 88, statement: 190, actions: 166 },
    { scale: 2, brand: 92, statement: 310, actions: 210 },
    { scale: 3, brand: 100, statement: 480, actions: 560 },
  ] as const;
  let checked = 0;
  for (const phone of phones)
    for (const t of texts)
      for (const banner of [0, 96]) {
        const mark = introMark(phone, phone.insets);
        const m: LandingMeasures = {
          height: phone.height,
          insets: phone.insets,
          markTop: mark.top,
          banner,
          brand: t.brand,
          statement: t.statement,
          actions: t.actions,
        };
        const p = landingPlan(m);
        const at = `${phone.name}, ${t.scale}× text${banner ? ", preview" : ""}`;
        const floor = phone.height - t.actions;
        const ceiling =
          phone.insets.top + (banner ? banner + 12 : 0) + LANDING_SPACE.ceiling;
        // Exactly where the intro left the wordmark (unless the actions
        // would reach it), and from there it only ever rises.
        assert.ok(p.drop >= 0, at);
        const start = p.rest + p.drop;
        if (mark.top + t.brand + LANDING_SPACE.around <= floor)
          assert.equal(start, mark.top, at);
        // Never under the status bar; below the preview's banner unless the
        // actions leave no room for it (accessibility sizes).
        assert.ok(start >= phone.insets.top + 12, at);
        assert.ok(p.rest >= Math.min(ceiling, start), at);
        // The statement keeps a deliberate distance from the brand.
        assert.ok(p.gap >= LANDING_SPACE.statement && p.gap <= 56, at);
        // Nothing reaches the actions; only very large text scrolls, and by
        // then the wall has gone.
        const bottom = p.rest + t.brand + p.gap + t.statement;
        if (t.scale < 2 || p.wall > 0) assert.ok(bottom <= floor, at);
        if (bottom > floor) assert.equal(p.wall, 0, at);
        // The wall stays in the dark above the brand, or isn't drawn.
        if (p.wall) {
          assert.equal(p.wall, p.rest + 8, at);
          assert.ok(p.rest - ceiling >= LANDING_MIN_WALL, at);
        }
        // On a phone at ordinary text sizes the wall is always there.
        if (t.scale === 1 && phone.name !== "iPad" && !banner)
          assert.ok(p.wall > 0, at);
        checked++;
      }
  assert.equal(checked, phones.length * texts.length * 2);
});

test("Emergence keeps the launch intro's frame: on a phone at ordinary text sizes its brand never moves", () => {
  for (const phone of [
    { width: 393, height: 852, insets: { top: 59, bottom: 34 } },
    { width: 440, height: 956, insets: { top: 62, bottom: 34 } },
    { width: 412, height: 915, insets: { top: 24, bottom: 24 } },
  ]) {
    const mark = introMark(phone, phone.insets);
    const p = landingPlan({
      height: phone.height,
      insets: phone.insets,
      markTop: mark.top,
      banner: 0,
      brand: 84,
      statement: 142,
      actions: 150,
    });
    assert.equal(p.drop, 0);
    assert.equal(p.rest, mark.top);
    assert.ok(p.wall > 0);
  }
});
