import { z } from "zod";
import { addDays } from "../paths/model";
import type { CuratedProgram, ProgramSession } from "./model";

// A lifter's enrollment in one exact published program version. The authored
// program is never copied or modified: the enrollment references it by id and
// version, and each started workout snapshots its prescription.
export const enrollmentDataSchema = z.object({
  forgeProgram: z.literal(1),
  programId: z.string().min(1).max(80),
  programVersion: z.number().int().min(1),
  name: z.string().min(1).max(120),
  started: z.iso.date(),
  status: z.enum(["active", "archived"]),
  // Suggested training weekdays (0 = Monday), comma-separated.
  weekdays: z.string().regex(/^[0-6](,[0-6]){0,6}$/),
});
export type EnrollmentData = z.infer<typeof enrollmentDataSchema>;

// One record per session position the lifter has acted on: started (linked to
// its workout) or skipped. Sessions that were not trained have no record, so
// nothing is ever marked missed or rescheduled automatically.
export const programSessionLogSchema = z
  .object({
    forgeProgram: z.literal(1),
    enrollmentId: z.string().min(1),
    position: z.number().int().min(0).max(10000),
    workoutId: z.string().max(100),
    skipped: z.boolean(),
    // The session was started as a lower-fatigue session (reduced sets).
    // Absent on records written before Strength V2.
    lowerFatigue: z.boolean().optional(),
  })
  .refine((s) => (s.skipped ? s.workoutId === "" : s.workoutId !== ""), {
    message: "A program session is either linked to a workout or skipped",
  });
export type ProgramSessionLog = z.infer<typeof programSessionLogSchema>;

export const parseWeekdays = (value: string) => value.split(",").map(Number);

export function totalSessions(program: CuratedProgram) {
  return program.durationWeeks === undefined
    ? undefined
    : program.durationWeeks * program.daysPerWeek;
}

export type SessionSlot = {
  position: number;
  week: number;
  phase: CuratedProgram["phases"][number];
  session: ProgramSession;
};

// Sessions run in authored order: position 0 is week 1's first session.
export function sessionAt(
  program: CuratedProgram,
  position: number,
): SessionSlot | undefined {
  const total = totalSessions(program);
  if (position < 0 || (total !== undefined && position >= total))
    return undefined;
  const week = Math.floor(position / program.daysPerWeek) + 1;
  let phase = program.phases[0]!;
  if (program.durationWeeks !== undefined) {
    let end = 0;
    for (const candidate of program.phases) {
      end += candidate.weeks ?? 0;
      if (week <= end) {
        phase = candidate;
        break;
      }
    }
  }
  return {
    position,
    week,
    phase,
    session: phase.sessions[position % program.daysPerWeek]!,
  };
}

const weekdayOf = (date: string) =>
  (new Date(`${date}T12:00:00`).getDay() + 6) % 7;

// The next `count` dates, from `from` inclusive, that fall on a suggested
// training weekday. Suggestions only; lifters may train on any day.
export function suggestedDates(
  weekdays: number[],
  from: string,
  count: number,
): string[] {
  const dates: string[] = [];
  if (!weekdays.length) return dates;
  for (let d = from; dates.length < count; d = addDays(d, 1))
    if (weekdays.includes(weekdayOf(d))) dates.push(d);
  return dates;
}
