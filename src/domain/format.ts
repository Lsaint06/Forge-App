import { z } from "zod";
import {
  exerciseSchema,
  journalSchema,
  profileSchema,
  setSchema,
  templateSchema,
  workoutExerciseSchema,
  workoutSchema,
} from "./validation";

// Record formats across versions of Forge (Phase 7.8D).
//
// A synchronized record may declare the format that wrote it:
// `forgeFormat: { version, minReader }`. Records without one are format 1,
// which is everything Forge has written so far. A version of Forge that adds
// a field anywhere in a record (journal `data` keys included) raises that
// record's `version`; a change that older versions would misread also raises
// `minReader`, the lowest format that can still read the record safely.
//
// This version reads and writes format 1. It doesn't stamp its own records,
// so everything it sends is exactly what older versions already read.

export const FORMAT_VERSION = 1;
export const FORMAT_KEY = "forgeFormat";
export type RecordFormat = { version: number; minReader: number };
/** Record kinds the cloud holds and this version of Forge understands. */
export const RECORD_KINDS = [
  "profile",
  "exercise",
  "workout",
  "template",
  "journal",
];

type Obj = Record<string, unknown>;
export const isObject = (v: unknown): v is Obj =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const whole = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 1;

/**
 * A record's declared format. A declaration this version can't read is
 * never trusted: it counts as a format too new to read.
 */
export function recordFormat(payload: unknown): RecordFormat {
  if (!isObject(payload) || payload[FORMAT_KEY] === undefined)
    return { version: 1, minReader: 1 };
  const f = payload[FORMAT_KEY];
  const version = isObject(f) ? f.version : undefined;
  const minReader = isObject(f) ? (f.minReader ?? 1) : undefined;
  return whole(version) && whole(minReader)
    ? { version, minReader }
    : { version: Infinity, minReader: Infinity };
}
/** This version can apply the record without misreading any of it. */
export const readableFormat = (payload: unknown) =>
  recordFormat(payload).minReader <= FORMAT_VERSION;
/** Written in a format newer than this version's. */
export const newerFormat = (payload: unknown) =>
  recordFormat(payload).version > FORMAT_VERSION;

/**
 * Fields this version doesn't know, anywhere in a value: "mood",
 * "sets[3].tempoMs", "workout.effort". Known fields' values aren't judged
 * here; validation does that. Keys inside free-form maps (a journal entry's
 * `data`) can't be told apart, which is why new ones raise the format.
 */
export function unknownFields(
  schema: z.ZodType,
  value: unknown,
  at = "",
): string[] {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable)
    return value === undefined || value === null
      ? []
      : unknownFields(schema.unwrap() as z.ZodType, value, at);
  if (schema instanceof z.ZodArray)
    return Array.isArray(value)
      ? value.flatMap((v, i) =>
          unknownFields(schema.element as z.ZodType, v, `${at}[${i}]`),
        )
      : [];
  if (schema instanceof z.ZodObject && isObject(value)) {
    const shape = schema.shape as Record<string, z.ZodType>;
    return Object.keys(value).flatMap((key) => {
      const path = at ? `${at}.${key}` : key;
      const field = shape[key];
      return field ? unknownFields(field, value[key], path) : [path];
    });
  }
  return [];
}

const WORKOUT_PARTS = ["workout", "exercises", "sets", FORMAT_KEY];

/** Fields of a synchronized record that this version doesn't know. */
export function unknownRecordFields(kind: string, payload: unknown): string[] {
  if (!isObject(payload)) return [];
  const top = (schema: z.ZodType) =>
    unknownFields(schema, payload).filter((key) => key !== FORMAT_KEY);
  switch (kind) {
    case "profile":
      return top(profileSchema);
    case "exercise":
      return top(exerciseSchema);
    case "journal":
      return top(journalSchema);
    case "template":
      return top(templateSchema);
    case "workout":
      return [
        ...Object.keys(payload).filter((key) => !WORKOUT_PARTS.includes(key)),
        ...unknownFields(workoutSchema, payload.workout, "workout"),
        ...unknownFields(
          z.array(workoutExerciseSchema),
          payload.exercises,
          "exercises",
        ),
        ...unknownFields(z.array(setSchema), payload.sets, "sets"),
      ];
    default:
      return [];
  }
}

/**
 * A stored document: the validated fields this version knows, over the
 * fields it doesn't, which are kept exactly as they were. A known field left
 * out of `known` (cleared) stays out.
 */
export function withUnknownFields<T extends Obj>(
  raw: unknown,
  known: T,
  schema: { shape: Record<string, unknown> },
): T {
  const kept = isObject(raw)
    ? Object.fromEntries(
        Object.entries(raw).filter(([key]) => !(key in schema.shape)),
      )
    : {};
  return { ...kept, ...known };
}

/** A workout or template naming exercises this phone doesn't have. */
export function namesUnknownExercises(
  kind: string,
  payload: unknown,
  knows: (exerciseId: string) => boolean,
) {
  if (kind !== "workout" && kind !== "template") return false;
  const items = isObject(payload) ? payload.exercises : undefined;
  return (
    Array.isArray(items) &&
    items.some((e: unknown) => {
      const exerciseId = isObject(e) ? e.exerciseId : undefined;
      return typeof exerciseId === "string" && !knows(exerciseId);
    })
  );
}

/**
 * Whether this version must not replace a cloud copy, nor apply it as the
 * athlete's choice: a record kind or exercise it doesn't know, a format it
 * can't read, or fields it doesn't know. The profile is the exception for
 * unknown fields: it keeps them and merges field by field (Phase 7.8D).
 */
export function cloudCopyNeedsUpdate(
  kind: string,
  payload: unknown,
  knows: (exerciseId: string) => boolean,
) {
  if (!kind) return false;
  if (!RECORD_KINDS.includes(kind)) return true;
  if (!readableFormat(payload)) return true;
  if (
    kind !== "profile" &&
    (newerFormat(payload) || unknownRecordFields(kind, payload).length > 0)
  )
    return true;
  return namesUnknownExercises(kind, payload, knows);
}
