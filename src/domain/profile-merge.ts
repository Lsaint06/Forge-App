import { canonical } from "../cloud/compare";
import { FORMAT_KEY, recordFormat } from "./format";
import { profileSchema } from "./validation";

// Merging the athlete's profile field by field (Phase 7.8D).
//
// When this phone changed the profile while another device changed it too,
// each field is decided against the base (the cloud's copy both started
// from), never by timestamps:
//
//   this phone        cloud             result
//   unchanged         changed           the cloud's value
//   changed           unchanged         this phone's value
//   changed to X      changed to X      X
//   changed to X      changed to Y      a conflict on that field
//
// Clearing is a change. A field missing from a version written before the
// field existed, or a field this version doesn't know, is not a clearing:
// it keeps its value. Every field is decided and the result is validated
// as a whole; anything that can't be merged safely is left to the athlete,
// and both of their choices keep every change that didn't conflict.

export type ProfileDoc = Record<string, unknown>;

/**
 * The record format in which each profile field first appeared. Fields not
 * listed appeared in format 1. A version of Forge that adds a profile field
 * lists it here with its new format.
 */
export const PROFILE_FIELD_FORMAT: Record<string, number> = {};

export type ProfileMerge =
  | { kind: "merged"; profile: ProfileDoc }
  | {
      kind: "conflict";
      /** The fields the athlete decides, as changed on either side. */
      fields: string[];
      /** "Keep this phone's": this phone's values for those fields. */
      phone: ProfileDoc;
      /** "Use the cloud's": the cloud's values for those fields. */
      cloud: ProfileDoc;
    };

const ABSENT = Symbol("absent");
type Value = unknown | typeof ABSENT;
const read = (doc: ProfileDoc, key: string): Value =>
  Object.prototype.hasOwnProperty.call(doc, key) && doc[key] !== undefined
    ? doc[key]
    : ABSENT;
const same = (a: Value, b: Value) =>
  a === ABSENT || b === ABSENT ? a === b : canonical(a) === canonical(b);
const set = (doc: ProfileDoc, key: string, value: Value) => {
  if (value === ABSENT) delete doc[key];
  else doc[key] = value;
};
const KNOWN = new Set(Object.keys(profileSchema.shape));

export const validProfile = (doc: ProfileDoc) =>
  profileSchema.safeParse(doc).success;

type Options = {
  /** Field formats (tests may substitute their own). */
  introducedIn?: Record<string, number>;
  /** Whether a merged profile may be stored. */
  valid?: (doc: ProfileDoc) => boolean;
};

/** Whether the version that wrote `doc` knew `key`. */
function knew(
  doc: ProfileDoc,
  key: string,
  introducedIn: Options["introducedIn"],
) {
  return (introducedIn?.[key] ?? 1) <= recordFormat(doc).version;
}

/** The newest format stamp among the documents, kept on the result. */
function stamp(docs: ProfileDoc[]) {
  let best: { version: number; value: unknown } | undefined;
  for (const doc of docs) {
    if (doc[FORMAT_KEY] === undefined) continue;
    const { version } = recordFormat(doc);
    if (!best || version > best.version)
      best = { version, value: doc[FORMAT_KEY] };
  }
  return best?.value;
}

export function mergeProfile(
  base: ProfileDoc,
  local: ProfileDoc,
  remote: ProfileDoc,
  { introducedIn = PROFILE_FIELD_FORMAT, valid = validProfile }: Options = {},
): ProfileMerge {
  const merged: ProfileDoc = {};
  const conflicts: string[] = [];
  const changed: string[] = [];
  const decided = new Map<string, { b: Value; l: Value; r: Value }>();
  const keys = new Set(
    [base, local, remote].flatMap((doc) => Object.keys(doc)),
  );
  keys.delete(FORMAT_KEY);
  for (const key of keys) {
    const b = read(base, key);
    let l = read(local, key);
    let r = read(remote, key);
    if (!KNOWN.has(key)) {
      // This version can't have changed a field it doesn't know, and a
      // version older than the base can't have cleared it.
      l = b;
      if (
        r === ABSENT &&
        recordFormat(remote).version < recordFormat(base).version
      )
        r = b;
    } else {
      if (l === ABSENT && !knew(local, key, introducedIn)) l = b;
      if (r === ABSENT && !knew(remote, key, introducedIn)) r = b;
    }
    decided.set(key, { b, l, r });
    if (!same(l, b) || !same(r, b)) changed.push(key);
    if (same(l, r)) set(merged, key, l);
    else if (same(l, b)) set(merged, key, r);
    else if (same(r, b)) set(merged, key, l);
    else conflicts.push(key);
  }
  const format = stamp([local, remote]);
  const finish = (doc: ProfileDoc) =>
    format === undefined ? doc : { ...doc, [FORMAT_KEY]: format };

  if (!conflicts.length && valid(finish(merged)))
    return { kind: "merged", profile: finish(merged) };

  // Each choice takes one side's values for the fields in question and
  // keeps every other change. If that can't make a valid profile, the
  // choice covers every changed field: one side's whole version of them.
  const side = (fields: string[], pick: "l" | "r") => {
    const doc = { ...merged };
    for (const key of fields) set(doc, key, decided.get(key)![pick]);
    return finish(doc);
  };
  let fields = conflicts.length ? conflicts : changed;
  let phone = side(fields, "l");
  let cloud = side(fields, "r");
  if (!valid(phone) || !valid(cloud)) {
    fields = changed;
    phone = side(fields, "l");
    cloud = side(fields, "r");
  }
  return { kind: "conflict", fields, phone, cloud };
}

/**
 * A cloud profile applied on this phone with no change of its own waiting:
 * the cloud's version, except fields its writer's version predates, which
 * keep this phone's values.
 */
export function cloudProfileForPhone(
  local: ProfileDoc,
  remote: ProfileDoc,
  introducedIn = PROFILE_FIELD_FORMAT,
): ProfileDoc {
  const doc = { ...remote };
  for (const key of Object.keys(local)) {
    if (key === FORMAT_KEY || !KNOWN.has(key)) continue;
    if (read(remote, key) === ABSENT && !knew(remote, key, introducedIn))
      doc[key] = local[key];
  }
  return doc;
}

/**
 * Without a base, a conflict is between the two whole versions. "Keep this
 * phone's" still keeps fields only the cloud has that this version doesn't
 * know: it can't have cleared them.
 */
export function wholeSides(local: ProfileDoc, remote: ProfileDoc) {
  const phone = { ...local };
  for (const key of Object.keys(remote))
    if (!KNOWN.has(key) && read(local, key) === ABSENT)
      phone[key] = remote[key];
  return { phone, cloud: remote };
}
