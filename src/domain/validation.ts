import { z } from "zod";
import { pathProgramDataSchema, pathSessionDataSchema } from "./paths/model";
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
export const journalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "measurement",
    "nutrition",
    "recovery",
    "goal",
    "food",
    "schedule",
    "program",
  ]),
  date: z.iso.date(),
  data: z.record(
    z.string(),
    z.union([z.string().max(5000), z.number().finite(), z.boolean()]),
  ),
  createdAt: nonnegative,
  updatedAt: nonnegative,
});
export function validateJournal(
  kind: string,
  data: Record<string, string | number | boolean>,
) {
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
  if (kind === "measurement") {
    z.string().trim().min(1).parse(data.name);
    n("value", 10000, 0.01);
    z.enum(["kg", "cm", "percent"]).parse(data.unit);
    if (data.unit === "percent") n("value", 100, 0.01);
    if (/^body\s*weight$/i.test(String(data.name).trim()) && data.unit !== "kg")
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
