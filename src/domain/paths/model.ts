import { z } from "zod";

export const pathKeys = [
  "start-strong",
  "build-muscle",
  "get-strong",
  "lean-strong",
  "athlete-mode",
  "advanced-physique",
] as const;
export const machineEquipment = [
  "Chest press machine",
  "Leg press machine",
  "Leg curl machine",
  "Leg extension machine",
  "Chest fly machine",
  "Seated row machine",
] as const;
export const equipmentOptions = [
  "Dumbbell",
  "Barbell",
  "Kettlebell",
  "Cable",
  ...machineEquipment,
  "Resistance band",
  "Band anchor",
  "Pull-up bar",
  "Bench",
  "Squat rack",
] as const;
export const roleKeys = [
  "push",
  "pull",
  "squat",
  "posterior",
  "shoulder",
  "biceps",
  "triceps",
  "core",
  "calf",
  "rear",
] as const;
export type PathRole = (typeof roleKeys)[number];
export const movementOptions = [
  "horizontal push",
  "horizontal pull",
  "vertical push",
  "vertical pull",
  "squat",
  "hinge",
  "hip extension",
  "shoulder isolation",
  "elbow flexion",
  "elbow extension",
  "trunk stability",
] as const;
export const priorityOptions = [
  "Chest",
  "Back",
  "Shoulders",
  "Quadriceps",
  "Hamstrings",
  "Glutes",
  "Arms",
  "Core",
] as const;
export const pathPreferencesSchema = z
  .object({
    pathKey: z.enum(pathKeys),
    experience: z.enum(["Beginner", "Intermediate", "Advanced"]),
    frequency: z.number().int().min(1).max(6),
    duration: z.number().int().min(30).max(90),
    equipment: z
      .array(z.enum([...equipmentOptions, "Full gym machines"]))
      .max(16),
    gymAccess: z.boolean(),
    excluded: z.array(z.string().min(1).max(100)).max(30),
    avoidPatterns: z.array(z.enum(movementOptions)).max(11),
    limitations: z.string().max(500),
    priorities: z.array(z.enum(priorityOptions)).max(2),
    style: z.enum(["Balanced", "Free weights", "Machines"]),
    startDate: z.iso.date(),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(6),
  })
  .refine(
    (p) =>
      p.weekdays.length === p.frequency &&
      new Set(p.weekdays).size === p.frequency,
    {
      message: "Select exactly one distinct weekday for each weekly session.",
    },
  );
export type PathPreferences = z.infer<typeof pathPreferencesSchema>;
export type PathDefinition = {
  key: (typeof pathKeys)[number];
  name: string;
  subtitle: string;
  description: string;
  experience: string;
  objective: string;
  frequency: number;
  minDays: number;
  maxDays: number;
  duration: number;
  muscles: string;
  benefits: string;
  equipment: string;
};
export const dayStructureSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(80),
  offset: z.number().int().min(0).max(6),
  roles: z.array(z.enum(roleKeys)).min(1).max(8),
});
export type PathDayStructure = z.infer<typeof dayStructureSchema>;
export const phasesSchema = z.tuple([
  z.object({
    key: z.literal("foundation"),
    name: z.literal("Foundation"),
    from: z.literal(1),
    to: z.literal(4),
    templateIds: z.array(z.string().min(1)).min(1).max(6),
  }),
  z.object({
    key: z.literal("evolution"),
    name: z.literal("Evolution"),
    from: z.literal(5),
    to: z.literal(8),
    templateIds: z.array(z.string().min(1)).min(1).max(6),
  }),
]);
function json<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .max(5000)
    .transform((text, ctx) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid Path metadata JSON" });
        return z.NEVER;
      }
    })
    .pipe(schema);
}
export const pathProgramDataSchema = z
  .object({
    forgePath: z.literal(1),
    engineVersion: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    pathKey: z.enum(pathKeys),
    name: z.string().min(1).max(120),
    weeks: z.literal(8),
    started: z.iso.date(),
    status: z.enum(["active", "paused", "archived"]),
    pausedOn: z.union([z.iso.date(), z.literal("")]),
    pausedDays: z.number().int().min(0).max(36500),
    preferences: json(pathPreferencesSchema),
    days: json(z.array(dayStructureSchema).min(1).max(6)),
    phases: json(phasesSchema),
  })
  .superRefine((p, ctx) => {
    const refs = p.phases.flatMap((phase) => phase.templateIds);
    if (
      p.days.length !== p.preferences.frequency ||
      p.phases.some((phase) => phase.templateIds.length !== p.days.length) ||
      new Set(refs).size !== refs.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Path phase templates must be distinct and match the training days",
      });
    if (p.status === "paused" && !p.pausedOn)
      ctx.addIssue({
        code: "custom",
        message: "Paused Paths need a pause date",
      });
  });
export type PathProgramData = z.infer<typeof pathProgramDataSchema>;
export const pathSessionDataSchema = z
  .object({
    forgePath: z.literal(1),
    programId: z.string().min(1),
    templateId: z.string().min(1),
    name: z.string().min(1).max(120),
    week: z.number().int().min(1).max(8),
    dayIndex: z.number().int().min(0).max(5),
    phase: z.enum(["foundation", "evolution"]),
    workoutId: z.string().max(100),
    skipped: z.boolean(),
  })
  .refine((s) => (s.week <= 4 ? "foundation" : "evolution") === s.phase, {
    message: "Session phase must match its week",
  });
export type PathSessionData = z.infer<typeof pathSessionDataSchema>;

// Calendar arithmetic uses local dates at noon, never fixed 24-hour increments.
export function addDays(date: string, count: number): string {
  z.iso.date().parse(date);
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + count);
  return `${d.getFullYear().toString().padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000,
  );
}
export const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function defaultWeekdays(frequency: number): number[] {
  return (
    (
      {
        1: [0],
        2: [0, 3],
        3: [0, 2, 4],
        4: [0, 1, 3, 4],
        5: [0, 1, 3, 4, 5],
        6: [0, 1, 2, 4, 5, 6],
      } as Record<number, number[]>
    )[frequency] ?? [0, 2, 4]
  );
}

// Legacy broad equipment selections remain readable in saved programs/backups.
export function expandEquipment(
  values: PathPreferences["equipment"],
): PathPreferences["equipment"] {
  return [
    ...new Set(
      values.flatMap((value) =>
        value === "Full gym machines" ? [...machineEquipment] : [value],
      ),
    ),
  ];
}
export function hasEquipment(
  values: PathPreferences["equipment"],
  required: string,
) {
  return expandEquipment(values).includes(
    required as PathPreferences["equipment"][number],
  );
}
export function machineRequirement(required: string) {
  return (
    required === "Full gym machines" ||
    machineEquipment.some((value) => value === required)
  );
}
