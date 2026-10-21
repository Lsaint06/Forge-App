import { z } from "zod";
import { experienceLevels, trainingGoals } from "../profile";
import type { Exercise } from "../types";

// Curated, human-authored training programs (Forge Paths 4.0). Nothing in this
// module selects exercises or derives prescriptions: it only describes and
// validates content written by the program author. See docs/CURATED_PROGRAMS.md.

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase-words-with-dashes")
  .max(80);
const text = (max: number) => z.string().trim().min(1).max(max);

export const programExerciseSchema = z.strictObject({
  exerciseId: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps: z
    .strictObject({
      min: z.number().int().min(1).max(100),
      max: z.number().int().min(1).max(100),
    })
    .refine((r) => r.min <= r.max, {
      message: "Minimum reps must not exceed maximum reps",
    }),
  restSeconds: z.number().int().min(0).max(600),
  notes: text(500).optional(),
});
export const programSessionSchema = z.strictObject({
  id: slug,
  name: text(80),
  notes: text(1000).optional(),
  exercises: z.array(programExerciseSchema).min(1).max(15),
});
export const programPhaseSchema = z.strictObject({
  name: text(60),
  // Omitted only for an open-ended, single-phase program.
  weeks: z.number().int().min(1).max(52).optional(),
  notes: text(1000).optional(),
  sessions: z.array(programSessionSchema).min(3).max(5),
});
// One training week's train/rest layout, starting from the first day of the
// program week. Forge rotates it around the lifter's preferred rest day.
export const weeklyPatternSchema = z.array(z.enum(["train", "rest"])).length(7);

export const curatedProgramSchema = z
  .strictObject({
    id: slug,
    version: z.number().int().min(1),
    status: z.enum(["draft", "published"]),
    name: text(80),
    summary: text(160),
    description: text(2000),
    experience: z.enum(experienceLevels),
    goal: z.enum(trainingGoals),
    daysPerWeek: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    durationWeeks: z.number().int().min(1).max(52).optional(),
    equipment: z.array(text(60)).min(1).max(30),
    weeklyPattern: weeklyPatternSchema,
    progression: text(2000),
    phases: z.array(programPhaseSchema).min(1).max(12),
  })
  .superRefine((p, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const training = p.weeklyPattern.filter((d) => d === "train").length;
    if (training !== p.daysPerWeek)
      issue(
        `weeklyPattern has ${training} training days but daysPerWeek is ${p.daysPerWeek}`,
      );
    p.phases.forEach((phase) => {
      if (phase.sessions.length !== p.daysPerWeek)
        issue(
          `Phase "${phase.name}" has ${phase.sessions.length} sessions but daysPerWeek is ${p.daysPerWeek}`,
        );
      const ids = phase.sessions.map((s) => s.id);
      if (new Set(ids).size !== ids.length)
        issue(`Phase "${phase.name}" repeats a session id`);
    });
    if (p.durationWeeks === undefined) {
      if (p.phases.length !== 1 || p.phases[0]!.weeks !== undefined)
        issue(
          "Open-ended programs have exactly one phase without a week count; set durationWeeks for multi-phase programs",
        );
    } else {
      const total = p.phases.reduce((n, phase) => n + (phase.weeks ?? 0), 0);
      if (p.phases.some((phase) => phase.weeks === undefined))
        issue("Every phase needs a week count when durationWeeks is set");
      else if (total !== p.durationWeeks)
        issue(
          `Phase weeks total ${total} but durationWeeks is ${p.durationWeeks}`,
        );
    }
  });
export type CuratedProgram = z.infer<typeof curatedProgramSchema>;
export type ProgramSession = z.infer<typeof programSessionSchema>;
export type ProgramExercise = z.infer<typeof programExerciseSchema>;

export const programKey = (p: Pick<CuratedProgram, "id" | "version">) =>
  `${p.id}@${p.version}`;

// Validates authored content against the schema and the exercise catalog.
// Throws one error listing every problem; never repairs or substitutes.
export function validateProgram(
  input: unknown,
  catalog: readonly Exercise[],
): CuratedProgram {
  const parsed = curatedProgramSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `Invalid program: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "program"}: ${i.message}`)
        .join("; ")}`,
    );
  const program = parsed.data;
  const byId = new Map(catalog.map((e) => [e.id, e]));
  const problems: string[] = [];
  for (const phase of program.phases)
    for (const session of phase.sessions)
      for (const item of session.exercises) {
        const exercise = byId.get(item.exerciseId);
        if (!exercise)
          problems.push(`${session.id}: unknown exercise "${item.exerciseId}"`);
        else if (exercise.category !== "strength")
          problems.push(
            `${session.id}: "${item.exerciseId}" is ${exercise.category}-based; only rep-based prescriptions are supported`,
          );
      }
  if (problems.length)
    throw new Error(
      `Invalid program ${programKey(program)}: ${problems.join("; ")}`,
    );
  return program;
}

// Stable content fingerprint, independent of object key order. Published
// versions are locked to their fingerprint so they cannot silently change.
export function programFingerprint(program: CuratedProgram): string {
  const canonical = (value: unknown): string =>
    Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : value && typeof value === "object"
        ? `{${Object.keys(value)
            .sort()
            .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
            .map(
              (k) =>
                `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
            )
            .join(",")}}`
        : JSON.stringify(value);
  const text = canonical(program);
  // cyrb53: a small, dependency-free 53-bit string hash.
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export type ProgramLock = Readonly<Record<string, string>>;

// Library integrity: every entry valid and unique, every published version
// locked, and no locked version edited or removed (enrolled lifters must be
// able to reload the exact version they started).
export function checkLibrary(
  library: readonly unknown[],
  lock: ProgramLock,
  catalog: readonly Exercise[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of library) {
    let program: CuratedProgram;
    try {
      program = validateProgram(raw, catalog);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      continue;
    }
    const key = programKey(program);
    if (seen.has(key)) errors.push(`${key} is defined more than once`);
    seen.add(key);
    if (program.status !== "published") continue;
    const fingerprint = programFingerprint(program);
    if (!lock[key])
      errors.push(
        `${key} is published but not in the lock file; add "${key}": "${fingerprint}"`,
      );
    else if (lock[key] !== fingerprint)
      errors.push(
        `${key} changed after publishing; publish the change as a new version`,
      );
  }
  for (const key of Object.keys(lock))
    if (!seen.has(key))
      errors.push(
        `${key} is locked but no longer bundled; keep published versions`,
      );
  return errors;
}

const experienceOrder = Object.fromEntries(
  experienceLevels.map((level, i) => [level, i]),
) as Record<CuratedProgram["experience"], number>;

// Latest published version of each program; drafts are never listed.
export function publishedPrograms(
  library: readonly CuratedProgram[],
): CuratedProgram[] {
  const latest = new Map<string, CuratedProgram>();
  for (const p of library)
    if (
      p.status === "published" &&
      (latest.get(p.id)?.version ?? 0) < p.version
    )
      latest.set(p.id, p);
  return [...latest.values()].sort(
    (a, b) =>
      experienceOrder[a.experience] - experienceOrder[b.experience] ||
      a.goal.localeCompare(b.goal) ||
      a.daysPerWeek - b.daysPerWeek ||
      a.name.localeCompare(b.name),
  );
}

// The exact published version a lifter enrolled in.
export function findProgramVersion(
  library: readonly CuratedProgram[],
  id: string,
  version: number,
): CuratedProgram | undefined {
  return library.find(
    (p) => p.id === id && p.version === version && p.status === "published",
  );
}
