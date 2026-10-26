import { z } from "zod";
import { pathProgramDataSchema, pathSessionDataSchema } from "./paths/model";
import {
  enrollmentDataSchema,
  programSessionLogSchema,
} from "./programs/enrollment";
import {
  MAX_ENTRY_ML,
  MAX_GOAL_ML,
  MIN_ENTRY_ML,
  MIN_GOAL_ML,
  toMl,
} from "./hydration";
import { gtin14 } from "./barcode";
import { MAX_SERVING_NAME } from "./personal-foods";
const nonnegative = z.number().finite().min(0);
export const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    onboarded: z.boolean(),
    units: z.enum(["kg", "lb"]),
    theme: z.enum(["dark", "light", "system"]),
    experience: z.string(),
    goal: z.string(),
    restDay: z.number().int().min(0).max(6).optional(),
    height: nonnegative.max(300),
    weight: nonnegative.max(700),
    frequency: z.number().int().min(1).max(7),
    equipment: z.string(),
    duration: nonnegative.max(480),
    muscles: z.string(),
    bodyFat: nonnegative.max(100),
    notifications: z.boolean(),
    rest: nonnegative.max(3600),
    increment: z.number().finite().positive().max(100),
    repMin: z.number().int().min(1).max(100),
    repMax: z.number().int().min(1).max(100),
    calories: nonnegative.max(20000),
    protein: nonnegative.max(2000),
    carbs: nonnegative.max(3000),
    fat: nonnegative.max(2000),
    waterGoal: z.number().finite().min(MIN_GOAL_ML).max(MAX_GOAL_ML).optional(),
    fluidUnit: z.enum(["ml", "oz"]).optional(),
  })
  .refine((p) => p.repMin <= p.repMax, {
    message: "Minimum reps must not exceed maximum reps",
  });
export const setSchema = z
  .object({
    id: z.string().min(1),
    exerciseRowId: z.string().min(1),
    position: nonnegative.int(),
    weight: nonnegative.max(2000),
    reps: nonnegative.int().max(10000),
    duration: nonnegative.max(86400),
    distance: nonnegative.max(1000000),
    rpe: z.number().finite().min(1).max(10).nullable(),
    rir: nonnegative.max(20).nullable(),
    kind: z.enum(["warmup", "working", "drop", "failure"]),
    completed: z.boolean(),
    rest: nonnegative.max(3600),
    tempo: z.string().max(50),
    notes: z.string().max(2000),
    side: z.enum(["both", "left", "right"]),
  })
  .refine(
    (s) => !s.completed || s.reps > 0 || s.duration > 0 || s.distance > 0,
    {
      message:
        "Enter repetitions, duration or distance before completing a set",
    },
  );
export const workoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  status: z.enum(["active", "paused", "completed"]),
  startedAt: nonnegative,
  finishedAt: nonnegative.nullable(),
  pausedAt: nonnegative.nullable(),
  pausedMs: nonnegative,
  notes: z.string().max(5000),
  templateId: z.string().nullable(),
  updatedAt: nonnegative,
});
export const repTargetSchema = z
  .object({
    min: z.number().int().min(1).max(1000),
    max: z.number().int().min(1).max(1000),
    sets: z.number().int().min(1).max(30),
  })
  .refine((target) => target.min <= target.max, {
    message: "Minimum reps must not exceed maximum reps",
  });
export const workoutExerciseSchema = z.object({
  id: z.string().min(1),
  workoutId: z.string().min(1),
  exerciseId: z.string().min(1),
  position: nonnegative.int(),
  notes: z.string().max(2000),
  rest: nonnegative.max(3600),
  groupId: z.string().max(80),
  target: repTargetSchema.optional(),
});
export const prescriptionSchema = z
  .object({
    exerciseId: z.string().min(1),
    sets: z.number().int().min(1).max(30),
    reps: nonnegative.int().max(1000),
    repMax: z.number().int().min(1).max(1000).optional(),
    weight: nonnegative.max(2000),
    rest: nonnegative.max(3600),
  })
  .refine((p) => p.repMax === undefined || (p.reps > 0 && p.reps <= p.repMax), {
    message: "Rep ranges require positive, ordered bounds",
  });
export const templateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  notes: z.string().max(5000),
  exercises: z.array(prescriptionSchema).max(100),
  updatedAt: nonnegative,
});
/** Journal kinds this build understands (Phase 7.3C adds `hydration`). */
export const journalKinds = [
  "measurement",
  "nutrition",
  "recovery",
  "goal",
  "food",
  "schedule",
  "program",
  "hydration",
] as const;
export const isKnownJournalKind = (kind: string) =>
  (journalKinds as readonly string[]).includes(kind);
export const journalSchema = z.object({
  id: z.string().min(1),
  // Phase 7.3C (H7): a kind this build doesn't know, written by a newer
  // FORGE, is kept exactly as recorded rather than rejected or discarded
  // (restores and sync downloads store it, backups export it unchanged).
  // Only its shape is checked; known kinds keep their full rules in
  // validateJournal.
  kind: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  date: z.iso.date(),
  data: z.record(
    z.string(),
    z.union([z.string().max(5000), z.number().finite(), z.boolean()]),
  ),
  createdAt: nonnegative,
  updatedAt: nonnegative,
});
/** "Bodyweight", "Body weight", "body weight": the measurement goals and
 * conversions treat as the lifter's weight (always stored in kilograms). */
export const isBodyweightName = (name: unknown) =>
  /^body\s*weight$/i.test(String(name ?? "").trim());
export function validateJournal(
  kind: string,
  data: Record<string, string | number | boolean>,
) {
  if ("forgeProgram" in data) {
    if (data.forgeProgram !== 1)
      throw new Error("Unsupported Forge program metadata version");
    if (kind === "program") enrollmentDataSchema.parse(data);
    else if (kind === "schedule") programSessionLogSchema.parse(data);
    else
      throw new Error(
        "Forge program metadata belongs to program or schedule records",
      );
  }
  if ("forgePath" in data) {
    if (data.forgePath !== 1)
      throw new Error("Unsupported Forge Path metadata version");
    if (kind === "program") pathProgramDataSchema.parse(data);
    else if (kind === "schedule") pathSessionDataSchema.parse(data);
    else
      throw new Error(
        "Forge Path metadata belongs to program or schedule records",
      );
  }
  const n = (key: string, max: number, min = 0) =>
    z.number().finite().min(min).max(max).parse(data[key]);
  if (kind === "nutrition" || kind === "food") {
    z.string().trim().min(1).parse(data.name);
    for (const k of ["calories", "protein", "carbs", "fat"]) n(k, 20000);
    n("quantity", 1000, 0.01);
  }
  // Phase 7.3F.2 M2: a personal barcode food is its barcode, which must be a
  // valid GTIN-14 (never repaired); a correction's barcode, when it has one,
  // too. Other personal kinds a newer FORGE may add are kept as recorded.
  if (
    kind === "food" &&
    (data.personalKind === "food" || data.personalKind === "correction")
  ) {
    const barcode = data.sourceBarcode;
    if (
      (data.personalKind === "food" || barcode !== undefined) &&
      !(typeof barcode === "string" && gtin14(barcode) === barcode)
    )
      throw new Error("A personal food's barcode must be a valid GTIN-14");
    if ("servingName" in data)
      z.string().trim().min(1).max(MAX_SERVING_NAME).parse(data.servingName);
  }
  if (kind === "hydration") {
    // Water is never food: it carries no energy or macros (decision H1).
    for (const k of ["calories", "protein", "carbs", "fat", "quantity"])
      if (k in data) throw new Error("Hydration records carry no food values");
    n("ml", MAX_ENTRY_ML, MIN_ENTRY_ML);
    if ("amount" in data !== "unit" in data)
      throw new Error("A hydration amount needs its unit");
    if ("unit" in data) {
      const unit = z.enum(["ml", "oz"]).parse(data.unit);
      const amount = n("amount", 1_000_000, 0);
      // The canonical millilitres must be the amount as typed.
      if (Math.abs(toMl(amount, unit) - Number(data.ml)) > 0.01)
        throw new Error("Hydration amount and millilitres disagree");
    }
  }
  if (kind === "measurement") {
    z.string().trim().min(1).parse(data.name);
    n("value", 10000, 0.01);
    z.enum(["kg", "cm", "percent"]).parse(data.unit);
    if (data.unit === "percent") n("value", 100, 0.01);
    if (isBodyweightName(data.name) && data.unit !== "kg")
      throw new Error(
        "Bodyweight must be stored in kilograms; imperial entries are converted before saving",
      );
  }
  if (kind === "recovery") {
    n("sleep", 24);
    for (const k of ["quality", "soreness", "energy", "stress"]) n(k, 5, 1);
  }
  if (kind === "goal") {
    z.string().trim().min(1).parse(data.name);
    n("target", 100000, 0.01);
    if (data.metric === "bodyweight") {
      n("start", 700, 0.01);
      if (data.start === data.target)
        throw new Error(
          "Bodyweight goal starting and target values must differ",
        );
    }
    z.enum([
      "workouts",
      "volume",
      "bodyweight",
      "strength",
      "duration",
      "nutrition",
    ]).parse(data.metric);
  }
  return data;
}
export const exerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  muscle: z.string().min(1),
  secondary: z.array(z.string()),
  equipment: z.string(),
  pattern: z.string(),
  difficulty: z.string(),
  instructions: z.array(z.string()).min(1),
  mistakes: z.string(),
  safety: z.string(),
  category: z.enum(["strength", "duration", "distance"]),
  unilateral: z.boolean(),
  tracking: z.array(z.string()),
});
export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: nonnegative,
  profile: profileSchema,
  workouts: z.array(workoutSchema).max(100000),
  workoutExercises: z.array(workoutExerciseSchema).max(100000),
  sets: z.array(setSchema).max(1000000),
  templates: z.array(templateSchema).max(10000),
  journals: z.array(journalSchema).max(100000),
  customExercises: z.array(exerciseSchema).max(10000),
  favorites: z.array(z.string()).max(10000),
});
