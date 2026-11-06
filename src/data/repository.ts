import { schema, migrationV2, migrationV3 } from "./schema";
import { exercises as catalog, searchExercises } from "./catalog";
import {
  defaults,
  id,
  localDate,
  type Profile,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
  type Exercise,
  type Prescription,
  type RepTarget,
  type Template,
  type Journal,
  type JournalKind,
  type Outbox,
} from "../domain/types";
import {
  backupSchema,
  profileSchema,
  setSchema,
  workoutSchema,
  workoutExerciseSchema,
  templateSchema,
  journalSchema,
  exerciseSchema,
  validateJournal,
  repTargetSchema,
  prescriptionSchema,
  FAVORITE,
  favoriteId,
} from "../domain/validation";
import {
  RECORD_KINDS,
  cloudCopyNeedsUpdate,
  isObject,
  newerFormat,
  readableFormat,
  unknownRecordFields,
  withUnknownFields,
} from "../domain/format";
import {
  cloudProfileForPhone,
  mergeProfile,
  validProfile,
  wholeSides,
  type ProfileDoc,
} from "../domain/profile-merge";
import { canonical } from "../cloud/compare";
export interface SqlDatabase {
  exec(sql: string): void;
  run(sql: string, params?: (string | number | null)[]): void;
  all<T>(sql: string, params?: (string | number | null)[]): T[];
}
export type WorkoutSnapshot = {
  workout: Workout;
  exercises: WorkoutExercise[];
  sets: WorkoutSet[];
};
/** Record kinds the cloud holds and this version of Forge understands. */
const SYNCED_KINDS = RECORD_KINDS;
/** The athlete's profile: one record, always this id. */
const PROFILE = "profile";
const syncMetaUpsert =
  "INSERT INTO sync_meta(id,revision) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision";
const outboxSelect =
  "SELECT id,kind,payload,revision,attempts,next_attempt AS nextAttempt,deleted FROM outbox";
/** A version this phone sent whose reply never arrived (Phase 7.8B, H1). */
type SentVersion = { payload: string; deleted: boolean };
const sentKey = (recordId: string) => `syncSent:${recordId}`;
/**
 * A cloud record this phone can't take yet (Phase 7.8B): it needs a newer
 * Forge (an exercise or record kind this version doesn't know), or it's a
 * workout in progress elsewhere while another is in progress here. Nothing
 * is written, the cloud copy is untouched, and the next sync tries again.
 */
export class HeldRecord extends Error {
  constructor(readonly reason: "update" | "active") {
    super(
      reason === "update"
        ? "This record needs a newer version of Forge. Update Forge, then try again."
        : "Another workout is in progress on this phone. Finish or discard it first.",
    );
    this.name = "HeldRecord";
  }
}
export const isHeldRecord = (e: unknown): e is HeldRecord =>
  e instanceof HeldRecord ||
  (!!e &&
    typeof e === "object" &&
    (e as { name?: unknown }).name === "HeldRecord" &&
    ["update", "active"].includes(String((e as { reason?: unknown }).reason)));
/**
 * A record saved by a newer version of Forge, kept exactly as the cloud has
 * it (Phase 7.8D). This version shows it but refuses to change or delete it,
 * so nothing it can't read is overwritten or lost.
 */
export class NewerRecordError extends Error {
  constructor(kind: string) {
    super(
      `This ${kind === "workout" ? "workout" : kind === "template" ? "template" : "entry"} was saved by a newer version of Forge. Update Forge on this phone to change or delete it.`,
    );
    this.name = "NewerRecordError";
  }
}
/** A new favourite record for an exercise, starred now (Phase 7.8D). */
function favoriteRecord(exerciseId: string): Journal {
  const now = Date.now();
  return {
    id: favoriteId(exerciseId),
    kind: FAVORITE,
    date: localDate(now),
    data: { exerciseId },
    createdAt: now,
    updatedAt: now,
  };
}
/** The exercise a stored favourite names, if readable. */
function favoriteExercise(data: string) {
  try {
    const exerciseId = (JSON.parse(data) as { exerciseId?: unknown })
      .exerciseId;
    return typeof exerciseId === "string" && exerciseId
      ? exerciseId
      : undefined;
  } catch {
    return undefined;
  }
}
const wSelect = `SELECT id,name,status,started_at AS startedAt,finished_at AS finishedAt,paused_at AS pausedAt,paused_ms AS pausedMs,notes,template_id AS templateId,updated_at AS updatedAt FROM workouts`;
const eSelect = `SELECT id,workout_id AS workoutId,exercise_id AS exerciseId,position,notes,rest,group_id AS groupId,target FROM workout_exercises`;
const sSelect = `SELECT id,exercise_row_id AS exerciseRowId,position,weight,reps,duration,distance,rpe,rir,kind,completed,rest,tempo,notes,side FROM workout_sets`;
export class Repository {
  private depth = 0;
  generation = 0;
  constructor(public db: SqlDatabase) {}
  transaction<T>(fn: () => T): T {
    if (this.depth) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.depth--;
    }
  }
  migrate() {
    this.db.exec(schema);
    this.transaction(() => {
      if (!this.db.all("SELECT version FROM migrations WHERE version=2").length)
        this.db.exec(migrationV2);
      for (const e of catalog)
        this.db.run(
          "INSERT OR IGNORE INTO exercises(id,data,custom) VALUES(?,?,0)",
          [e.id, JSON.stringify(e)],
        );
      this.db.run("INSERT OR IGNORE INTO profile(id,data) VALUES('local',?)", [
        JSON.stringify(defaults),
      ]);
    });
    // Phase 7.8D (v3): additive, in one transaction. An interrupted start
    // leaves the database exactly as it was and the next start tries again;
    // every step is safe to repeat. Older versions of Forge ignore the new
    // tables.
    this.transaction(() => {
      this.db.exec(migrationV3);
      if (this.hasMigration(3)) return;
      this.recordProfileBase();
      this.db.run("INSERT INTO migrations(version,applied_at) VALUES(3,?)", [
        Date.now(),
      ]);
    });
    // Every start: favourites from before the update become synced records,
    // and changes an older version of Forge made here since are taken in.
    this.transaction(() => this.reconcileFavorites());
    this.rereadNewerRecords();
  }
  /**
   * Records kept from a newer Forge are read again at every start (Phase
   * 7.8D): once this version understands one (Forge was updated), the kept
   * copy is applied and the record can be changed again. A copy that a later
   * version of the record replaced is dropped.
   */
  private rereadNewerRecords() {
    for (const kept of this.db.all<{
      id: string;
      kind: string;
      revision: number;
      payload: string;
    }>("SELECT id,kind,revision,payload FROM newer_records")) {
      if (!this.newerRecord(kept.id)) {
        this.forgetNewer(kept.id);
        continue;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(kept.payload) as unknown;
      } catch {
        continue;
      }
      if (
        !readableFormat(payload) ||
        newerFormat(payload) ||
        unknownRecordFields(kept.kind, payload).length > 0 ||
        this.outboxRow(kept.id) ||
        this.conflicts().some((c) => c.id === kept.id)
      )
        continue;
      try {
        this.applyRemote(kept.id, kept.kind, payload, kept.revision);
      } catch {
        // Stays kept; the next start tries again.
      }
    }
  }
  private hasMigration(version: number) {
    return (
      this.db.all("SELECT version FROM migrations WHERE version=?", [version])
        .length > 0
    );
  }
  /** Tables found to exist (they're never dropped), checked once each. */
  private tables = new Set<string>();
  private hasTable(name: string) {
    if (this.tables.has(name)) return true;
    const exists =
      this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [name],
      ).length > 0;
    if (exists) this.tables.add(name);
    return exists;
  }
  /**
   * Phase 7.8D: a phone that synchronized its profile and has no change to
   * it waiting holds exactly the cloud's copy at that revision, so that copy
   * becomes the base for merging later changes field by field. With a
   * change waiting the earlier copy is unknown, and none is recorded.
   */
  private recordProfileBase() {
    const seen = this.db.all<{ revision: number }>(
      "SELECT revision FROM sync_meta WHERE id=?",
      [PROFILE],
    )[0]?.revision;
    if (!seen || this.outboxRow(PROFILE)) return;
    if (this.conflicts().some((c) => c.id === PROFILE)) return;
    const data = this.db.all<{ data: string }>("SELECT data FROM profile")[0]
      ?.data;
    if (data)
      this.db.run(
        "INSERT OR IGNORE INTO sync_base(id,revision,payload) VALUES(?,?,?)",
        [PROFILE, seen, data],
      );
  }
  /**
   * The cloud's copy of the profile as this phone last saw it (Phase 7.8D),
   * at its revision: what each phone started from when it changed the
   * profile. Other records don't need one.
   */
  private recordBase(recordId: string, revision: number, payload: string) {
    if (recordId !== PROFILE) return;
    this.db.run(
      "INSERT INTO sync_base(id,revision,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload",
      [recordId, revision, payload],
    );
  }
  /** The last-seen cloud copy, only if recorded at exactly this revision. */
  syncBase(recordId: string, revision: number): unknown {
    const row = this.db.all<{ revision: number; payload: string }>(
      "SELECT revision,payload FROM sync_base WHERE id=?",
      [recordId],
    )[0];
    if (!row || row.revision !== revision) return undefined;
    try {
      return JSON.parse(row.payload) as unknown;
    } catch {
      return undefined;
    }
  }
  /**
   * The stored profile with every field, including any a newer Forge added
   * that this version doesn't know (Phase 7.8D): they're kept, and sent
   * back with every change.
   */
  profileDocument(): Record<string, unknown> {
    const raw = this.db.all<{ data: string }>("SELECT data FROM profile")[0]
      ?.data;
    const doc = raw ? (JSON.parse(raw) as unknown) : { ...defaults };
    return isObject(doc) ? doc : { ...defaults };
  }
  profile(): Profile {
    return profileSchema.parse(this.profileDocument());
  }
  saveProfile(p: Partial<Profile>) {
    const doc = this.profileDocument();
    const data = profileSchema.parse({ ...doc, ...p });
    this.transaction(() =>
      this.storeProfile(withUnknownFields(doc, data, profileSchema)),
    );
    return data;
  }
  /** Saves the whole profile document and queues it for the cloud. */
  private storeProfile(doc: Record<string, unknown>) {
    this.db.run("UPDATE profile SET data=? WHERE id='local'", [
      JSON.stringify(doc),
    ]);
    this.queue(PROFILE, "profile", doc);
  }
  setting(key: string) {
    return this.db.all<{ value: string }>(
      "SELECT value FROM settings WHERE key=?",
      [key],
    )[0]?.value;
  }
  setSetting(key: string, value: string) {
    this.db.run(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [key, value],
    );
  }
  clearSetting(key: string) {
    this.db.run("DELETE FROM settings WHERE key=?", [key]);
  }
  exercises(query = "", muscle = "All", equipment = "All") {
    return searchExercises(
      this.db
        .all<{ data: string }>("SELECT data FROM exercises")
        .map((x) => exerciseSchema.parse(JSON.parse(x.data))),
      query,
      muscle,
      equipment,
    );
  }
  exercise(exerciseId: string) {
    const row = this.db.all<{ data: string }>(
      "SELECT data FROM exercises WHERE id=?",
      [exerciseId],
    )[0];
    return row ? exerciseSchema.parse(JSON.parse(row.data)) : undefined;
  }
  /** Whether this phone has the exercise (catalogue or custom). */
  knowsExercise(exerciseId: string) {
    return (
      this.db.all<{ x: number }>(
        "SELECT EXISTS(SELECT 1 FROM exercises WHERE id=?) AS x",
        [exerciseId],
      )[0]?.x === 1
    );
  }
  customExercises() {
    return this.db
      .all<{ data: string }>("SELECT data FROM exercises WHERE custom=1")
      .map((x) => exerciseSchema.parse(JSON.parse(x.data)));
  }
  /**
   * Saves a custom exercise. Fields a newer Forge added to it are kept
   * (Phase 7.8D); `base` is the document they come from when this phone
   * doesn't hold it yet (a backup being restored).
   */
  saveExercise(e: Exercise, base?: unknown) {
    const data = exerciseSchema.parse(e);
    if (catalog.some((c) => c.id === e.id))
      throw new Error(
        "Built-in exercises cannot be edited. Create a custom variation.",
      );
    const stored = withUnknownFields(
      base ?? this.exerciseDocument(e.id),
      data,
      exerciseSchema,
    );
    this.transaction(() => {
      this.db.run(
        "INSERT INTO exercises(id,data,custom) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        [e.id, JSON.stringify(stored)],
      );
      this.queue(e.id, "exercise", stored);
    });
    return data;
  }
  private exerciseDocument(exerciseId: string): unknown {
    const raw = this.db.all<{ data: string }>(
      "SELECT data FROM exercises WHERE id=? AND custom=1",
      [exerciseId],
    )[0]?.data;
    try {
      return raw ? (JSON.parse(raw) as unknown) : undefined;
    } catch {
      return undefined;
    }
  }
  /** Starred exercises this phone has, oldest first. */
  favorites() {
    return this.db
      .all<{ data: string }>(
        "SELECT data FROM journal WHERE kind=? ORDER BY created_at,rowid",
        [FAVORITE],
      )
      .map((row) => favoriteExercise(row.data))
      .filter(
        (exerciseId): exerciseId is string =>
          !!exerciseId && this.knowsExercise(exerciseId),
      );
  }
  /**
   * Stars or unstars an exercise. Since Phase 7.8D a favourite is a synced
   * record; unstarring leaves a deletion for the cloud, so the star can't
   * come back from another phone that still had it.
   */
  toggleFavorite(exerciseId: string) {
    const recordId = favoriteId(exerciseId);
    this.transaction(() => {
      const starred = this.hasJournal(recordId);
      if (starred) {
        this.db.run("DELETE FROM journal WHERE id=?", [recordId]);
        this.queue(recordId, "journal", {}, true);
      } else {
        if (!this.knowsExercise(exerciseId))
          throw new Error("Exercise not found");
        const favorite = favoriteRecord(exerciseId);
        this.putJournal(favorite);
        this.queue(recordId, "journal", favorite);
      }
      this.mirrorFavorite(exerciseId, !starred);
    });
  }
  private hasJournal(journalId: string) {
    return (
      this.db.all("SELECT id FROM journal WHERE id=?", [journalId]).length > 0
    );
  }
  /**
   * The older local list of favourites, kept matching for versions of Forge
   * before Phase 7.8D that may open this database. It lists only exercises
   * this phone has.
   */
  private mirrorFavorite(exerciseId: string, starred: boolean) {
    if (starred)
      this.db.run(
        "INSERT OR IGNORE INTO favorites(exercise_id) SELECT ? WHERE EXISTS(SELECT 1 FROM exercises WHERE id=?)",
        [exerciseId, exerciseId],
      );
    else this.db.run("DELETE FROM favorites WHERE exercise_id=?", [exerciseId]);
    // The older list as this version leaves it, with the cloud revision this
    // phone had seen of each entry's record (see reconcileFavorites).
    this.db.run("DELETE FROM favorites_seen WHERE exercise_id=?", [exerciseId]);
    this.db.run(
      "INSERT INTO favorites_seen(exercise_id,revision) SELECT f.exercise_id,coalesce((SELECT revision FROM sync_meta WHERE id=?),0) FROM favorites f WHERE f.exercise_id=? AND EXISTS(SELECT 1 FROM journal WHERE id=?)",
      [favoriteId(exerciseId), exerciseId, favoriteId(exerciseId)],
    );
  }
  /**
   * Keeps the synced favourites and the older local list in step, at every
   * start (Phase 7.8D). A version of Forge from before 7.8D on this phone
   * changes only the older list, and may download favourite records it
   * can't show. What this version last left in that list, and the cloud
   * revision it had seen of each (`favorites_seen`), tell which side
   * changed:
   * - only in the older list: listed before the update, or starred there
   *   since. It's sent as new (revision 0), so the same favourite already in
   *   the cloud settles on its own and one another device removed becomes a
   *   choice for the athlete. A removal is never silently undone;
   * - only a synced record, and listed when last seen: unstarred there, so
   *   the removal is sent. If the record has a newer revision since (it was
   *   downloaded there), the removal is sent as new, so the cloud asks
   *   instead of this phone deciding;
   * - only a synced record, never listed: downloaded there, so it's listed.
   * A favourite that can't be settled is left exactly as it was for the next
   * start and never stops Forge from opening. Records kept from a newer
   * Forge are left alone (D3).
   */
  private reconcileFavorites() {
    const listed = new Set(
      this.db
        .all<{
          exercise_id: string;
        }>("SELECT exercise_id FROM favorites ORDER BY rowid")
        .map((row) => row.exercise_id),
    );
    const synced = new Map<string, string>();
    for (const row of this.db.all<{ id: string; data: string }>(
      "SELECT id,data FROM journal WHERE kind=? ORDER BY created_at,rowid",
      [FAVORITE],
    )) {
      const exerciseId = favoriteExercise(row.data);
      if (exerciseId) synced.set(exerciseId, row.id);
    }
    const seen = new Map(
      this.db
        .all<{
          exercise_id: string;
          revision: number;
        }>("SELECT exercise_id,revision FROM favorites_seen")
        .map((row) => [row.exercise_id, row.revision] as const),
    );
    for (const exerciseId of new Set([
      ...listed,
      ...synced.keys(),
      ...seen.keys(),
    ]))
      this.attempt(() =>
        this.reconcileFavorite(
          exerciseId,
          listed.has(exerciseId),
          synced.get(exerciseId),
          seen.get(exerciseId),
        ),
      );
  }
  private reconcileFavorite(
    exerciseId: string,
    listed: boolean,
    syncedId: string | undefined,
    seen: number | undefined,
  ) {
    const recordId = syncedId ?? favoriteId(exerciseId);
    if (!this.canChange(recordId)) return;
    const revision =
      this.db.all<{ revision: number }>(
        "SELECT revision FROM sync_meta WHERE id=?",
        [recordId],
      )[0]?.revision ?? 0;
    if (listed && !syncedId) {
      const favorite = favoriteRecord(exerciseId);
      this.putJournal(favorite);
      this.db.run(
        "INSERT INTO outbox(id,kind,payload,revision,deleted) VALUES(?,'journal',?,0,0) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,deleted=0,attempts=0,next_attempt=0",
        [recordId, JSON.stringify(favorite)],
      );
      this.mirrorFavorite(exerciseId, true);
    } else if (
      syncedId &&
      !listed &&
      seen !== undefined &&
      this.knowsExercise(exerciseId)
    ) {
      this.db.run("DELETE FROM journal WHERE id=?", [recordId]);
      if (revision === seen) this.queue(recordId, "journal", {}, true);
      else
        this.db.run(
          "INSERT INTO outbox(id,kind,payload,revision,deleted) VALUES(?,'journal','{}',0,1) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,deleted=1,attempts=0,next_attempt=0",
          [recordId],
        );
      this.mirrorFavorite(exerciseId, false);
    } else if (syncedId) {
      if (!listed || seen !== revision) this.mirrorFavorite(exerciseId, true);
    } else
      this.db.run("DELETE FROM favorites_seen WHERE exercise_id=?", [
        exerciseId,
      ]);
  }
  /** Runs a step in the current transaction; a failure undoes only it. */
  private attempt(step: () => void) {
    this.db.exec("SAVEPOINT attempt");
    try {
      step();
    } catch {
      this.db.exec("ROLLBACK TO attempt");
    }
    this.db.exec("RELEASE attempt");
  }
  workouts() {
    return this.db.all<Workout>(`${wSelect} ORDER BY started_at DESC`);
  }
  workout(workoutId: string) {
    return this.db.all<Workout>(`${wSelect} WHERE id=?`, [workoutId])[0];
  }
  active() {
    return this.db.all<Workout>(
      `${wSelect} WHERE status!='completed' LIMIT 1`,
    )[0];
  }
  workoutExercises(workoutId: string) {
    return this.exerciseRows(" WHERE workout_id=? ORDER BY position", [
      workoutId,
    ]);
  }
  private exerciseRows(suffix = "", params: (string | number | null)[] = []) {
    return this.db
      .all<Omit<WorkoutExercise, "target"> & { target: string | null }>(
        `${eSelect}${suffix}`,
        params,
      )
      .map(({ target, ...row }): WorkoutExercise => ({
        ...row,
        ...(target === null
          ? {}
          : { target: repTargetSchema.parse(JSON.parse(target)) }),
      }));
  }
  sets(exerciseRowId: string) {
    return this.db
      .all<WorkoutSet>(`${sSelect} WHERE exercise_row_id=? ORDER BY position`, [
        exerciseRowId,
      ])
      .map((s) => ({ ...s, completed: !!s.completed }));
  }
  workoutSets(workoutId: string) {
    return this.workoutExercises(workoutId).flatMap((e) => this.sets(e.id));
  }
  /**
   * An exercise's sets in completed workouts, newest workout first; with
   * `limit`, only that many of the newest workouts.
   */
  history(exerciseId: string, limit?: number) {
    return [...this.exerciseHistory(exerciseId, limit).values()];
  }
  /**
   * An exercise's sets in completed workouts, by workout (most recently
   * finished first), each workout's in its order (exercise row, then set).
   * With `limit`, only the newest workouts' sets are read. Phase 8.5: sets
   * are read at once, not one query per session; the logger reads this for
   * every exercise on every save.
   */
  exerciseHistory(exerciseId: string, limit = Infinity) {
    const rows = this.db.all<{ id: string; workoutId: string }>(
      `SELECT e.id,w.id AS workoutId FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE e.exercise_id=? AND w.status='completed' ORDER BY w.finished_at DESC,e.position`,
      [exerciseId],
    );
    // Each workout's rows of this exercise, in order of appearance.
    const groups = new Map<string, string[]>();
    for (const e of rows) {
      const ids = groups.get(e.workoutId);
      if (ids) ids.push(e.id);
      else if (groups.size < limit) groups.set(e.workoutId, [e.id]);
    }
    const sets =
      limit === Infinity
        ? this.historySets(exerciseId)
        : this.rowSets([...groups.values()].flat());
    const history = new Map<string, WorkoutSet[]>();
    for (const [workoutId, ids] of groups)
      history.set(
        workoutId,
        ids.flatMap((id) => sets.get(id) ?? []),
      );
    return history;
  }
  /** The sets of an exercise's rows in completed workouts, by row: one read. */
  private historySets(exerciseId: string) {
    return this.setsByRow(
      `exercise_row_id IN (SELECT e.id FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE e.exercise_id=? AND w.status='completed')`,
      [exerciseId],
    );
  }
  /** These exercise rows' sets, by row, each in its order: one read. */
  private rowSets(rowIds: string[]) {
    return rowIds.length
      ? this.setsByRow(
          `exercise_row_id IN (${rowIds.map(() => "?").join(",")})`,
          rowIds,
        )
      : new Map<string, WorkoutSet[]>();
  }
  private setsByRow(where: string, params: string[]) {
    const byRow = new Map<string, WorkoutSet[]>();
    for (const s of this.db.all<WorkoutSet>(
      `${sSelect} WHERE ${where} ORDER BY exercise_row_id,position`,
      params,
    )) {
      const set = { ...s, completed: !!s.completed };
      const row = byRow.get(s.exerciseRowId);
      if (row) row.push(set);
      else byRow.set(s.exerciseRowId, [set]);
    }
    return byRow;
  }
  /**
   * Read-only: every set of every completed workout in one query, oldest
   * workout first, with its workout and exercise. Used by Progress.
   */
  completedSets() {
    return this.db
      .all<{
        workoutId: string;
        exerciseId: string;
        weight: number;
        reps: number;
        kind: WorkoutSet["kind"];
        completed: number | boolean;
      }>(
        `SELECT e.workout_id AS workoutId,e.exercise_id AS exerciseId,s.weight,s.reps,s.kind,s.completed FROM workout_sets s JOIN workout_exercises e ON e.id=s.exercise_row_id JOIN workouts w ON w.id=e.workout_id WHERE w.status='completed' ORDER BY w.finished_at,w.id,e.position,s.position`,
      )
      .map((s) => ({ ...s, completed: !!s.completed }));
  }
  targetHistory(exerciseId: string, target: RepTarget): WorkoutSet[][] {
    repTargetSchema.parse(target);
    const rows = this.db.all<{
      id: string;
      workoutId: string;
      target: string | null;
    }>(
      `SELECT e.id,w.id AS workoutId,e.target FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE e.exercise_id=? AND w.status='completed' ORDER BY w.finished_at DESC,e.position`,
      [exerciseId],
    );
    const groups = new Map<string, typeof rows>();
    for (const row of rows)
      groups.set(row.workoutId, [...(groups.get(row.workoutId) ?? []), row]);
    const byRow = this.historySets(exerciseId);
    const history: WorkoutSet[][] = [];
    for (const group of groups.values()) {
      if (
        !group.every((row) => {
          if (row.target === null) return false;
          const stored = repTargetSchema.parse(JSON.parse(row.target));
          return (
            stored.min === target.min &&
            stored.max === target.max &&
            stored.sets === target.sets
          );
        })
      )
        continue;
      const workingGroups = group.map((row) =>
        (byRow.get(row.id) ?? []).filter((set) => set.kind !== "warmup"),
      );
      if (
        !workingGroups.every(
          (sets) =>
            sets.length === target.sets && sets.every((set) => set.completed),
        )
      )
        continue;
      const sets = workingGroups.flat();
      if (sets.length === target.sets) history.push(sets);
    }
    return history;
  }
  private putWorkout(w: Workout) {
    workoutSchema.parse(w);
    this.db.run(
      "INSERT INTO workouts(id,name,status,started_at,finished_at,paused_at,paused_ms,notes,template_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,started_at=excluded.started_at,finished_at=excluded.finished_at,paused_at=excluded.paused_at,paused_ms=excluded.paused_ms,notes=excluded.notes,template_id=excluded.template_id,updated_at=excluded.updated_at",
      [
        w.id,
        w.name,
        w.status,
        w.startedAt,
        w.finishedAt,
        w.pausedAt,
        w.pausedMs,
        w.notes,
        w.templateId,
        w.updatedAt,
      ],
    );
  }
  private putExercise(e: WorkoutExercise) {
    workoutExerciseSchema.parse(e);
    if (!this.exercise(e.exerciseId)) throw new Error("Exercise not found");
    this.db.run(
      "INSERT INTO workout_exercises(id,workout_id,exercise_id,position,notes,rest,group_id,target) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET exercise_id=excluded.exercise_id,position=excluded.position,notes=excluded.notes,rest=excluded.rest,group_id=excluded.group_id,target=excluded.target",
      [
        e.id,
        e.workoutId,
        e.exerciseId,
        e.position,
        e.notes,
        e.rest,
        e.groupId,
        e.target === undefined ? null : JSON.stringify(e.target),
      ],
    );
  }
  private putSet(s: WorkoutSet) {
    setSchema.parse(s);
    this.db.run(
      "INSERT INTO workout_sets(id,exercise_row_id,position,weight,reps,duration,distance,rpe,rir,kind,completed,rest,tempo,notes,side) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET position=excluded.position,weight=excluded.weight,reps=excluded.reps,duration=excluded.duration,distance=excluded.distance,rpe=excluded.rpe,rir=excluded.rir,kind=excluded.kind,completed=excluded.completed,rest=excluded.rest,tempo=excluded.tempo,notes=excluded.notes,side=excluded.side",
      [
        s.id,
        s.exerciseRowId,
        s.position,
        s.weight,
        s.reps,
        s.duration,
        s.distance,
        s.rpe,
        s.rir,
        s.kind,
        Number(s.completed),
        s.rest,
        s.tempo,
        s.notes,
        s.side,
      ],
    );
  }
  /**
   * Queues the whole session. An edit stamps its save time; restoring a
   * backup (`touch` false) keeps the time recorded in the file, so a session
   * the cloud already holds is recognized as the same (Phase 7.8B, H2).
   */
  private queueWorkout(workoutId: string, touch = true) {
    const w = this.workout(workoutId);
    if (w) {
      if (touch)
        this.db.run("UPDATE workouts SET updated_at=? WHERE id=?", [
          Date.now(),
          workoutId,
        ]);
      this.queue(workoutId, "workout", {
        workout: this.workout(workoutId),
        exercises: this.workoutExercises(workoutId),
        sets: this.workoutSets(workoutId),
      });
    }
  }
  startWorkout(name = "Freestyle", templateId?: string) {
    const active = this.active();
    if (active) return active;
    return this.transaction(() => {
      const w = this.createWorkout(name, templateId ?? null);
      if (templateId) {
        const t = this.templates().find((t) => t.id === templateId);
        if (!t) throw new Error("Template no longer exists");
        this.prescribe(w.id, t.exercises);
      }
      this.queueWorkout(w.id);
      return w;
    });
  }
  // Starts a workout from a prescription that is not a saved template, such as
  // a curated program session. Targets are snapshotted like template workouts.
  startPrescribedWorkout(name: string, items: Prescription[]) {
    if (this.active())
      throw new Error(
        "Finish or discard your current workout before starting another.",
      );
    items.forEach((item) => prescriptionSchema.parse(item));
    return this.transaction(() => {
      const w = this.createWorkout(name, null);
      this.prescribe(w.id, items);
      this.queueWorkout(w.id);
      return w;
    });
  }
  private createWorkout(name: string, templateId: string | null) {
    const now = Date.now();
    // A new workout never starts mid-rest: a countdown left by a workout
    // that ended some other way is not carried over (Phase 8.3C-3).
    if (Number(this.setting("restDeadline") ?? 0) > 0)
      this.setSetting("restDeadline", "0");
    const w: Workout = {
      id: id(),
      name,
      status: "active",
      startedAt: now,
      finishedAt: null,
      pausedAt: null,
      pausedMs: 0,
      notes: "",
      templateId,
      updatedAt: now,
    };
    this.putWorkout(w);
    return w;
  }
  private prescribe(workoutId: string, items: Prescription[]) {
    for (const p of items) {
      const e = this.addExercise(workoutId, p.exerciseId);
      this.putExercise({
        ...e,
        rest: p.rest,
        ...(p.reps > 0
          ? {
              target: {
                min: p.reps,
                max: p.repMax ?? p.reps,
                sets: p.sets,
              },
            }
          : {}),
      });
      for (let i = 0; i < p.sets; i++)
        this.addSet(e.id, { reps: p.reps, weight: p.weight, rest: p.rest });
    }
  }
  updateWorkout(
    workoutId: string,
    patch: Partial<Pick<Workout, "name" | "notes">>,
  ) {
    const w = this.workout(workoutId);
    if (!w) throw new Error("Workout not found");
    this.transaction(() => {
      this.putWorkout({ ...w, ...patch, updatedAt: Date.now() });
      this.queueWorkout(workoutId);
    });
  }
  pauseWorkout(workoutId: string) {
    const w = this.workout(workoutId);
    if (!w || w.status === "completed") return;
    this.transaction(() => {
      const now = Date.now();
      this.putWorkout({
        ...w,
        status: w.status === "paused" ? "active" : "paused",
        pausedAt: w.status === "paused" ? null : now,
        pausedMs: w.pausedMs + (w.pausedAt ? now - w.pausedAt : 0),
        updatedAt: now,
      });
      this.queueWorkout(workoutId);
    });
  }
  finishWorkout(workoutId: string) {
    const w = this.workout(workoutId);
    if (!w || w.status === "completed") return;
    this.transaction(() => {
      const now = Date.now();
      this.putWorkout({
        ...w,
        status: "completed",
        finishedAt: now,
        pausedAt: null,
        pausedMs: w.pausedMs + (w.pausedAt ? now - w.pausedAt : 0),
        updatedAt: now,
      });
      this.queueWorkout(workoutId);
    });
  }
  deleteWorkout(workoutId: string) {
    this.transaction(() => {
      this.db.run("DELETE FROM workouts WHERE id=?", [workoutId]);
      this.queue(workoutId, "workout", {}, true);
    });
  }
  /** One workout with its exercises and sets, for undoing an edit. */
  workoutSnapshot(workoutId: string): WorkoutSnapshot {
    const workout = this.workout(workoutId);
    if (!workout) throw new Error("Workout not found");
    return {
      workout,
      exercises: this.workoutExercises(workoutId),
      sets: this.workoutSets(workoutId),
    };
  }
  /**
   * Puts a workout back exactly as snapshotted (same identities), replacing
   * its current exercises and sets in one transaction.
   */
  restoreWorkout(snapshot: WorkoutSnapshot) {
    const w = workoutSchema.parse(snapshot.workout);
    if (!this.workout(w.id)) throw new Error("Workout not found");
    const rows = snapshot.exercises.map((e) => workoutExerciseSchema.parse(e));
    const sets = snapshot.sets.map((s) => setSchema.parse(s));
    if (
      rows.some((e) => e.workoutId !== w.id) ||
      sets.some((s) => !rows.some((e) => e.id === s.exerciseRowId))
    )
      throw new Error("The saved copy doesn't match this workout");
    this.transaction(() => {
      this.putWorkout(w);
      this.db.run("DELETE FROM workout_exercises WHERE workout_id=?", [w.id]);
      for (const e of rows) this.putExercise(e);
      for (const s of sets) this.putSet(s);
      this.queueWorkout(w.id);
    });
  }
  addExercise(workoutId: string, exerciseId: string) {
    if (!this.workout(workoutId)) throw new Error("Workout not found");
    return this.transaction(() => {
      const e: WorkoutExercise = {
        id: id(),
        workoutId,
        exerciseId,
        position: this.workoutExercises(workoutId).length,
        notes: "",
        rest: this.profile().rest,
        groupId: "",
      };
      this.putExercise(e);
      this.queueWorkout(workoutId);
      return e;
    });
  }
  editExercise(
    rowId: string,
    patch: Partial<
      Pick<WorkoutExercise, "notes" | "rest" | "groupId" | "exerciseId">
    >,
  ) {
    const e = this.exerciseRows(" WHERE id=?", [rowId])[0];
    if (!e) throw new Error("Exercise row not found");
    this.transaction(() => {
      const updated = { ...e };
      for (const key of ["notes", "rest", "groupId", "exerciseId"] as const) {
        if (patch[key] !== undefined)
          Object.assign(updated, { [key]: patch[key] });
      }
      if (updated.exerciseId !== e.exerciseId) delete updated.target;
      this.putExercise(updated);
      this.queueWorkout(e.workoutId);
    });
  }
  removeExercise(rowId: string) {
    const e = this.exerciseRows(" WHERE id=?", [rowId])[0];
    if (!e) return;
    this.transaction(() => {
      this.db.run("DELETE FROM workout_exercises WHERE id=?", [rowId]);
      this.workoutExercises(e.workoutId).forEach((row, position) =>
        this.putExercise({ ...row, position }),
      );
      this.queueWorkout(e.workoutId);
    });
  }
  moveExercise(rowId: string, direction: number) {
    const e = this.exerciseRows(" WHERE id=?", [rowId])[0];
    if (!e) return;
    const rows = this.workoutExercises(e.workoutId);
    const index = rows.findIndex((x) => x.id === rowId);
    const other = rows[index + direction];
    if (!other) return;
    this.transaction(() => {
      [rows[index], rows[index + direction]] = [other, e];
      rows.forEach((r, i) => this.putExercise({ ...r, position: i }));
      this.queueWorkout(e.workoutId);
    });
  }
  addSet(rowId: string, patch: Partial<WorkoutSet> = {}) {
    const e = this.exerciseRows(" WHERE id=?", [rowId])[0];
    if (!e) throw new Error("Exercise row not found");
    return this.transaction(() => {
      const s: WorkoutSet = {
        id: id(),
        exerciseRowId: rowId,
        position: this.sets(rowId).length,
        weight: 0,
        reps: 0,
        duration: 0,
        distance: 0,
        rpe: null,
        rir: null,
        kind: "working",
        completed: false,
        rest: e.rest,
        tempo: "",
        notes: "",
        side: "both",
        ...patch,
      };
      this.putSet(s);
      this.queueWorkout(e.workoutId);
      return s;
    });
  }
  editSet(
    setId: string,
    patch: Partial<Omit<WorkoutSet, "id" | "exerciseRowId">>,
  ) {
    const raw = this.db.all<WorkoutSet>(`${sSelect} WHERE id=?`, [setId])[0];
    if (!raw) throw new Error("Set not found");
    const s = { ...raw, completed: !!raw.completed, ...patch };
    this.transaction(() => {
      this.putSet(s);
      const e = this.exerciseRows(" WHERE id=?", [s.exerciseRowId])[0];
      if (e) this.queueWorkout(e.workoutId);
    });
  }
  removeSet(setId: string) {
    const s = this.db.all<WorkoutSet>(`${sSelect} WHERE id=?`, [setId])[0];
    if (!s) return;
    this.transaction(() => {
      this.db.run("DELETE FROM workout_sets WHERE id=?", [setId]);
      this.sets(s.exerciseRowId).forEach((row, position) =>
        this.putSet({ ...row, position }),
      );
      const e = this.exerciseRows(" WHERE id=?", [s.exerciseRowId])[0];
      if (e) this.queueWorkout(e.workoutId);
    });
  }
  duplicateWorkout(workoutId: string) {
    if (this.active())
      throw new Error("Finish or discard your active workout first");
    const source = this.workout(workoutId);
    if (!source) throw new Error("Workout not found");
    return this.transaction(() => {
      const w = this.startWorkout(source.name);
      for (const e of this.workoutExercises(workoutId)) {
        const copy = this.addExercise(w.id, e.exerciseId);
        this.putExercise({
          ...copy,
          notes: e.notes,
          rest: e.rest,
          groupId: e.groupId,
          ...(e.target ? { target: e.target } : {}),
        });
        for (const s of this.sets(e.id)) {
          const { id: oldId, exerciseRowId: oldRow, ...fields } = s;
          void oldId;
          void oldRow;
          this.addSet(copy.id, { ...fields, completed: false });
        }
      }
      this.queueWorkout(w.id);
      return w;
    });
  }
  templates() {
    return this.db
      .all<{ id: string; name: string; notes: string; updated_at: number }>(
        "SELECT * FROM templates ORDER BY name",
      )
      .map((t) => ({
        id: t.id,
        name: t.name,
        notes: t.notes,
        updatedAt: t.updated_at,
        exercises: this.db
          .all<Omit<Prescription, "repMax"> & { repMax: number | null }>(
            "SELECT exercise_id AS exerciseId,sets,reps,rep_max AS repMax,weight,rest FROM template_exercises WHERE template_id=? ORDER BY position",
            [t.id],
          )
          .map(({ repMax, ...p }): Prescription => ({
            ...p,
            ...(repMax === null ? {} : { repMax }),
          })),
      }));
  }
  saveTemplate(
    name: string,
    items: Prescription[],
    templateId = id(),
    notes = "",
  ) {
    const t = templateSchema.parse({
      id: templateId,
      name,
      exercises: items,
      notes,
      updatedAt: Date.now(),
    });
    this.transaction(() => {
      this.writeTemplate(t);
      this.queue(t.id, "template", t);
    });
    return t;
  }
  /**
   * Writes a validated template exactly as given, its save time included,
   * without queueing it: restores and downloads keep the recorded time.
   */
  private writeTemplate(t: Template) {
    this.db.run(
      "INSERT INTO templates(id,name,notes,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,notes=excluded.notes,updated_at=excluded.updated_at",
      [t.id, t.name, t.notes, t.updatedAt],
    );
    this.db.run("DELETE FROM template_exercises WHERE template_id=?", [t.id]);
    t.exercises.forEach((e, i) =>
      this.db.run(
        "INSERT INTO template_exercises(id,template_id,exercise_id,position,sets,reps,weight,rest,rep_max) VALUES(?,?,?,?,?,?,?,?,?)",
        [
          id(),
          t.id,
          e.exerciseId,
          i,
          e.sets,
          e.reps,
          e.weight,
          e.rest,
          e.repMax ?? null,
        ],
      ),
    );
  }
  templateFromWorkout(workoutId: string, name: string) {
    return this.saveTemplate(
      name,
      this.workoutExercises(workoutId).map((e) => {
        const sets = this.sets(e.id);
        return {
          exerciseId: e.exerciseId,
          sets: e.target?.sets ?? Math.max(1, sets.length),
          reps: e.target?.min ?? sets[0]?.reps ?? 10,
          ...(e.target ? { repMax: e.target.max } : {}),
          weight: sets[0]?.weight ?? 0,
          rest: e.rest,
        };
      }),
    );
  }
  deleteTemplate(templateId: string) {
    this.transaction(() => {
      this.db.run("DELETE FROM templates WHERE id=?", [templateId]);
      this.queue(templateId, "template", {}, true);
    });
  }
  journal(kind?: JournalKind) {
    return this.db
      .all<{
        id: string;
        kind: JournalKind;
        date: string;
        data: string;
        created_at: number;
        updated_at: number;
      }>(
        `SELECT * FROM journal ${kind ? "WHERE kind=?" : ""} ORDER BY date DESC,created_at DESC`,
        kind ? [kind] : [],
      )
      .map((j) => ({
        id: j.id,
        kind: j.kind,
        date: j.date,
        data: JSON.parse(j.data) as Journal["data"],
        createdAt: j.created_at,
        updatedAt: j.updated_at,
      }));
  }
  // Restores and sync downloads may carry a kind written by a newer FORGE;
  // it is stored as recorded (Phase 7.3C, H7). App code only adds known kinds.
  private putJournal(j: Omit<Journal, "kind"> & { kind: string }) {
    journalSchema.parse(j);
    validateJournal(j.kind, j.data);
    // One record per exercise, so phones can't duplicate a favourite.
    if (j.kind === FAVORITE && j.id !== favoriteId(String(j.data.exerciseId)))
      throw new Error("A favorite's identity must name its exercise");
    this.db.run(
      "INSERT INTO journal(id,kind,date,data,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,data=excluded.data,updated_at=excluded.updated_at",
      [j.id, j.kind, j.date, JSON.stringify(j.data), j.createdAt, j.updatedAt],
    );
  }
  addJournal(kind: JournalKind, data: Journal["data"], date = localDate()) {
    const now = Date.now();
    const j: Journal = {
      id: id(),
      kind,
      date,
      data,
      createdAt: now,
      updatedAt: now,
    };
    this.transaction(() => {
      this.putJournal(j);
      this.queue(j.id, "journal", j);
    });
    return j;
  }
  updateJournal(journalId: string, data: Journal["data"], date?: string) {
    const j = this.journal().find((x) => x.id === journalId);
    if (!j) throw new Error("Entry not found");
    this.transaction(() => {
      const updated = {
        ...j,
        data,
        date: date ?? j.date,
        updatedAt: Date.now(),
      };
      this.putJournal(updated);
      this.queue(j.id, "journal", updated);
    });
  }
  deleteJournal(journalId: string) {
    this.transaction(() => {
      this.db.run("DELETE FROM journal WHERE id=?", [journalId]);
      this.queue(journalId, "journal", {}, true);
    });
  }
  exportBackup() {
    const backup = backupSchema.parse({
      version: 1,
      exportedAt: Date.now(),
      profile: this.profile(),
      workouts: this.workouts(),
      workoutExercises: this.exerciseRows(),
      sets: this.db
        .all<WorkoutSet>(sSelect)
        .map((s) => ({ ...s, completed: !!s.completed })),
      templates: this.templates(),
      journals: this.journal(),
      customExercises: this.customExercises(),
      // For versions before Phase 7.8D, which read favourites only here;
      // the older local list also covers a database that never migrated.
      favorites: [
        ...new Set([
          ...this.favorites(),
          ...this.db
            .all<{
              exercise_id: string;
            }>("SELECT exercise_id FROM favorites ORDER BY rowid")
            .map((row) => row.exercise_id),
        ]),
      ],
    });
    // Phase 7.8D: fields this version doesn't know stay in the file, and
    // records saved by a newer Forge travel exactly as received. Versions
    // before 7.8D read the same file and skip what they don't know.
    const newerRecords = this.keptNewerRecords();
    return {
      ...backup,
      profile: withUnknownFields(
        this.profileDocument(),
        backup.profile,
        profileSchema,
      ),
      customExercises: backup.customExercises.map((e) =>
        withUnknownFields(this.exerciseDocument(e.id), e, exerciseSchema),
      ),
      ...(newerRecords.length ? { newerRecords } : {}),
    };
  }
  /** Verbatim copies of records saved by a newer Forge, still current. */
  private keptNewerRecords() {
    if (!this.hasTable("newer_records")) return [];
    return this.db
      .all<{
        id: string;
        kind: "workout" | "template" | "journal";
        payload: string;
      }>("SELECT id,kind,payload FROM newer_records ORDER BY id")
      .filter((kept) => this.newerRecord(kept.id))
      .map((kept) => ({
        id: kept.id,
        kind: kept.kind,
        payload: JSON.parse(kept.payload) as Record<string, unknown>,
      }));
  }
  importBackup(text: string) {
    if (text.length > 50_000_000) throw new Error("Backup exceeds 50 MB");
    const raw = JSON.parse(text) as unknown;
    // Phase 7.8D: a backup from a newer Forge is refused, never misread.
    const version = isObject(raw) ? raw.version : undefined;
    if (typeof version === "number" && version > 1)
      throw new Error(
        "This backup was made by a newer version of Forge. Update Forge on this phone, then restore it.",
      );
    const b = backupSchema.parse(raw);
    const source = raw as { profile?: unknown; customExercises?: unknown[] };
    for (const j of b.journals) validateJournal(j.kind, j.data);
    const unique = (rows: { id: string }[]) => {
      if (new Set(rows.map((x) => x.id)).size !== rows.length)
        throw new Error("Duplicate record identifiers");
    };
    [
      b.workouts,
      b.workoutExercises,
      b.sets,
      b.templates,
      b.journals,
      b.customExercises,
    ].forEach(unique);
    if (b.workouts.filter((w) => w.status !== "completed").length > 1)
      throw new Error("Backup has multiple active workouts");
    const newer = b.newerRecords ?? [];
    for (const n of newer) {
      const rows: { id: string }[] =
        n.kind === "workout"
          ? b.workouts
          : n.kind === "template"
            ? b.templates
            : b.journals;
      if (!rows.some((row) => row.id === n.id))
        throw new Error("The backup's records don't match");
    }
    this.transaction(() => {
      this.clearData();
      b.customExercises.forEach((e, i) =>
        this.saveExercise(e, source.customExercises?.[i]),
      );
      this.storeProfile(
        withUnknownFields(source.profile, b.profile, profileSchema),
      );
      for (const w of b.workouts) this.putWorkout(w);
      for (const e of b.workoutExercises) this.putExercise(e);
      for (const s of b.sets) this.putSet(s);
      // Templates and sessions keep the save times recorded in the file
      // (Phase 7.8B, H2): restoring isn't editing.
      for (const t of b.templates) {
        this.writeTemplate(t);
        this.queue(t.id, "template", t);
      }
      for (const j of b.journals) {
        this.putJournal(j);
        this.queue(j.id, "journal", j);
        if (j.kind === FAVORITE)
          this.mirrorFavorite(String(j.data.exerciseId), true);
      }
      // A backup from before Phase 7.8D lists favourites only here.
      for (const exerciseId of new Set(b.favorites)) {
        const recordId = favoriteId(exerciseId);
        if (!this.hasJournal(recordId)) {
          const favorite = favoriteRecord(exerciseId);
          this.putJournal(favorite);
          this.queue(recordId, "journal", favorite);
        }
        this.mirrorFavorite(exerciseId, true);
      }
      for (const w of b.workouts) this.queueWorkout(w.id, false);
      // Records saved by a newer Forge go back exactly as they were saved,
      // and stay protected from changes on this phone.
      for (const n of newer) {
        const payload = JSON.stringify(n.payload);
        this.db.run(
          "INSERT INTO newer_records(id,kind,revision,payload) VALUES(?,?,0,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=0,payload=excluded.payload",
          [n.id, n.kind, payload],
        );
        this.db.run("UPDATE outbox SET payload=?,deleted=0 WHERE id=?", [
          payload,
          n.id,
        ]);
      }
    });
  }
  clearData() {
    this.generation++;
    this.transaction(() => {
      for (const table of [
        "conflicts",
        "outbox",
        "sync_meta",
        "settings",
        "favorites",
        "workouts",
        "templates",
        "journal",
        "sync_base",
        "newer_records",
        "favorites_seen",
      ])
        if (this.hasTable(table)) this.db.run(`DELETE FROM ${table}`);
      this.db.run("DELETE FROM exercises WHERE custom=1");
      this.db.run("UPDATE profile SET data=? WHERE id='local'", [
        JSON.stringify(defaults),
      ]);
    });
  }
  queue(recordId: string, kind: string, payload: unknown, deleted = false) {
    // Enforced here, beneath every screen (Phase 7.8D, D3): the change is
    // refused and, inside its transaction, nothing else is written either.
    this.assertCanChange(recordId, kind);
    const revision =
      this.db.all<{ revision: number }>(
        "SELECT revision FROM sync_meta WHERE id=?",
        [recordId],
      )[0]?.revision ?? 0;
    this.db.run(
      "INSERT INTO outbox(id,kind,payload,revision,deleted) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,payload=excluded.payload,deleted=excluded.deleted,attempts=0,next_attempt=0",
      [recordId, kind, JSON.stringify(payload), revision, Number(deleted)],
    );
  }
  /**
   * The verbatim cloud copy of a record saved by a newer Forge, while it is
   * still the latest this phone has seen (a later version of the record,
   * applied by any version of Forge, replaces it).
   */
  private newerRecord(recordId: string) {
    if (!this.hasTable("newer_records")) return undefined;
    const kept = this.db.all<{
      kind: string;
      revision: number;
      payload: string;
    }>("SELECT kind,revision,payload FROM newer_records WHERE id=?", [
      recordId,
    ])[0];
    if (!kept) return undefined;
    const seen =
      this.db.all<{ revision: number }>(
        "SELECT revision FROM sync_meta WHERE id=?",
        [recordId],
      )[0]?.revision ?? 0;
    return kept.revision >= seen ? kept : undefined;
  }
  /** Whether this version may change or delete the record (Phase 7.8D). */
  canChange(recordId: string) {
    return !this.newerRecord(recordId);
  }
  assertCanChange(recordId: string, kind: string) {
    if (!this.canChange(recordId)) throw new NewerRecordError(kind);
  }
  /**
   * Waiting changes in upload order: custom exercises, then templates, then
   * everything else; within a kind, changes that failed before go last so
   * one troubled record can't hold up the rest.
   */
  outbox() {
    return this.db.all<Outbox>(
      `${outboxSelect} ORDER BY CASE kind WHEN 'exercise' THEN 0 WHEN 'template' THEN 1 ELSE 2 END,attempts,rowid`,
    );
  }
  outboxRow(recordId: string) {
    return this.db.all<Outbox>(`${outboxSelect} WHERE id=?`, [recordId])[0];
  }
  acknowledge(recordId: string, revision: number, payload: string) {
    this.transaction(() => {
      this.seeRevision(recordId, revision);
      // What was sent is now the cloud's copy at that revision.
      this.recordBase(recordId, revision, payload);
      this.db.run("DELETE FROM outbox WHERE id=? AND payload=?", [
        recordId,
        payload,
      ]);
      this.db.run("UPDATE outbox SET revision=? WHERE id=?", [
        revision,
        recordId,
      ]);
      this.clearSetting(sentKey(recordId));
    });
  }
  conflict(recordId: string, local: string, remote: string, revision: number) {
    this.transaction(() => {
      this.db.run(
        "INSERT INTO conflicts(id,local,remote,revision) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET local=excluded.local,remote=excluded.remote,revision=excluded.revision",
        [recordId, local, remote, revision],
      );
      this.clearSetting(sentKey(recordId));
    });
  }
  conflicts() {
    return this.db.all<{
      id: string;
      local: string;
      remote: string;
      revision: number;
    }>("SELECT * FROM conflicts");
  }
  retry(recordId: string, attempts: number) {
    this.db.run("UPDATE outbox SET attempts=?,next_attempt=? WHERE id=?", [
      attempts,
      Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(attempts, 12)),
      recordId,
    ]);
  }
  /**
   * Written just before a change is sent (Phase 7.8B, H1). If the reply never
   * arrives (no connection, a timeout, Forge closed), the cloud may already
   * hold it; a later conflict whose cloud copy is exactly one of these is
   * this phone's own write, not another device's change. Cleared once the
   * outcome is known.
   */
  markSent(op: Outbox) {
    const entry: SentVersion = { payload: op.payload, deleted: !!op.deleted };
    const earlier = this.sentVersions(op.id, op.revision).filter(
      (v) => v.payload !== entry.payload || v.deleted !== entry.deleted,
    );
    this.setSetting(
      sentKey(op.id),
      JSON.stringify({
        revision: op.revision,
        versions: [...earlier, entry].slice(-5),
      }),
    );
  }
  /** What was sent from this base revision without a confirmed outcome. */
  sentVersions(recordId: string, revision: number): SentVersion[] {
    const raw = this.setting(sentKey(recordId));
    if (!raw) return [];
    try {
      const m = JSON.parse(raw) as { revision?: unknown; versions?: unknown };
      if (m.revision !== revision || !Array.isArray(m.versions)) return [];
      return (m.versions as Partial<SentVersion>[]).filter(
        (v): v is SentVersion =>
          typeof v?.payload === "string" && typeof v.deleted === "boolean",
      );
    } catch {
      return [];
    }
  }
  /**
   * The cloud holds a version this phone sent, at `revision`: the waiting
   * change was made on top of it, so it moves onto that revision and
   * uploads normally. Nothing of anyone else's is replaced. `cloudPayload`
   * is that cloud copy, when known.
   */
  rebase(recordId: string, revision: number, cloudPayload?: string) {
    this.transaction(() => {
      this.seeRevision(recordId, revision);
      if (cloudPayload !== undefined)
        this.recordBase(recordId, revision, cloudPayload);
      this.db.run(
        "UPDATE outbox SET revision=?,attempts=0,next_attempt=0 WHERE id=?",
        [revision, recordId],
      );
      this.clearSetting(sentKey(recordId));
    });
  }
  /**
   * A saved conflict whose two versions turned out to be the same: settled
   * at the cloud's revision without a choice (Phase 7.8B, H1).
   */
  settleConflict(recordId: string, revision: number, payload: string) {
    this.transaction(() => {
      this.acknowledge(recordId, revision, payload);
      this.db.run("DELETE FROM conflicts WHERE id=?", [recordId]);
    });
  }
  keepLocal(recordId: string) {
    const c = this.conflicts().find((c) => c.id === recordId);
    if (!c) return;
    // Replacing a cloud version this phone can't fully read would drop
    // what a newer Forge recorded in it (Phase 7.8B, M3).
    if (this.cloudNeedsUpdate(c.remote)) throw new HeldRecord("update");
    // The profile keeps every change that didn't conflict, from both sides,
    // and the fields the cloud has that this version doesn't know.
    const sides =
      recordId === PROFILE ? this.profileConflictSides() : undefined;
    if (sides && !validProfile(sides.phone))
      throw new Error(
        "This phone's profile can't be combined with the cloud's. Use the cloud version instead.",
      );
    this.transaction(() => {
      if (sides) {
        const payload = JSON.stringify(sides.phone);
        this.db.run("UPDATE profile SET data=? WHERE id='local'", [payload]);
        this.db.run("UPDATE outbox SET payload=?,deleted=0 WHERE id=?", [
          payload,
          recordId,
        ]);
        this.recordBase(recordId, c.revision, JSON.stringify(sides.remote));
      }
      this.db.run(
        "UPDATE outbox SET revision=?,attempts=0,next_attempt=0 WHERE id=?",
        [c.revision, recordId],
      );
      this.db.run("DELETE FROM conflicts WHERE id=?", [recordId]);
      this.clearSetting(sentKey(recordId));
    });
  }
  /**
   * The two choices of the profile's conflict (Phase 7.8D). Each keeps every
   * change that didn't conflict, from both sides, so they differ only in the
   * fields the athlete decides. Without a base (a change waiting since before
   * 7.8D), the choices are the two whole versions.
   */
  profileConflictSides():
    { phone: ProfileDoc; cloud: ProfileDoc; remote: ProfileDoc } | undefined {
    const c = this.conflicts().find((x) => x.id === PROFILE);
    const op = this.outboxRow(PROFILE);
    if (!c || !op || op.deleted) return undefined;
    let row: { payload?: unknown; deleted?: unknown };
    let local: unknown;
    try {
      row = JSON.parse(c.remote) as typeof row;
      local = JSON.parse(op.payload) as unknown;
    } catch {
      return undefined;
    }
    const remote = row.payload;
    if (row.deleted === true || !isObject(remote) || !isObject(local))
      return undefined;
    const base = this.syncBase(PROFILE, op.revision);
    if (!isObject(base)) return { ...wholeSides(local, remote), remote };
    const merge = mergeProfile(base, local, remote);
    return merge.kind === "conflict"
      ? { phone: merge.phone, cloud: merge.cloud, remote }
      : { phone: merge.profile, cloud: merge.profile, remote };
  }
  /**
   * A profile change waiting here, against a newer cloud copy (Phase 7.8D):
   * merged field by field when that's safe. The merged profile becomes this
   * phone's and replaces the waiting change, on top of the cloud's revision;
   * with nothing of this phone's left to send, the change is settled.
   * Undefined when it can't be merged safely: the athlete decides.
   */
  mergeProfileChange(
    op: Outbox,
    remote: { revision: number; payload: unknown; deleted?: boolean },
    savedConflict = false,
  ) {
    if (op.id !== PROFILE || op.deleted || remote.deleted) return undefined;
    const base = this.syncBase(PROFILE, op.revision);
    let local: unknown;
    try {
      local = JSON.parse(op.payload) as unknown;
    } catch {
      return undefined;
    }
    if (
      !isObject(base) ||
      !isObject(local) ||
      !isObject(remote.payload) ||
      !readableFormat(remote.payload)
    )
      return undefined;
    const merge = mergeProfile(base, local, remote.payload);
    if (merge.kind !== "merged") return undefined;
    const done = canonical(merge.profile) === canonical(remote.payload);
    const payload = JSON.stringify(merge.profile);
    return this.transaction(() => {
      // Only the change this sync read: an edit made meanwhile stays as is.
      const current = this.outboxRow(PROFILE);
      if (
        !current ||
        current.payload !== op.payload ||
        current.revision !== op.revision
      )
        return undefined;
      this.db.run("UPDATE profile SET data=? WHERE id='local'", [payload]);
      this.db.run(syncMetaUpsert, [PROFILE, remote.revision]);
      this.recordBase(PROFILE, remote.revision, JSON.stringify(remote.payload));
      if (done) this.db.run("DELETE FROM outbox WHERE id=?", [PROFILE]);
      else
        this.db.run(
          "UPDATE outbox SET payload=?,revision=?,attempts=0,next_attempt=0 WHERE id=?",
          [payload, remote.revision, PROFILE],
        );
      if (savedConflict)
        this.db.run("DELETE FROM conflicts WHERE id=?", [PROFILE]);
      this.clearSetting(sentKey(PROFILE));
      return done ? ("matched" as const) : ("merged" as const);
    });
  }
  /**
   * A saved cloud version this phone mustn't replace: it names a kind or
   * exercises this version lacks, uses a format it can't read, or holds
   * fields it doesn't know (Phase 7.8B M3; Phase 7.8D).
   */
  private cloudNeedsUpdate(remote: string) {
    try {
      const row = JSON.parse(remote) as {
        kind?: unknown;
        payload?: unknown;
        deleted?: unknown;
      };
      if (row.deleted === true) return false;
      // A kind this version doesn't know comes from a newer Forge; a copy
      // with no kind at all is just unreadable, and can still be replaced.
      if (typeof row.kind !== "string" || !row.kind) return false;
      return cloudCopyNeedsUpdate(row.kind, row.payload, (exerciseId) =>
        this.knowsExercise(exerciseId),
      );
    } catch {
      return false;
    }
  }
  /**
   * The athlete chose the cloud version of a conflict: this phone's record
   * is replaced by the preserved cloud copy and its waiting change dropped,
   * together. A cloud copy this phone can't take yet (`HeldRecord`) changes
   * nothing.
   */
  useCloudVersion(recordId: string) {
    const c = this.conflicts().find((c) => c.id === recordId);
    if (!c) return;
    const row = JSON.parse(c.remote) as {
      id?: unknown;
      kind?: unknown;
      payload?: unknown;
      revision?: unknown;
      deleted?: unknown;
    };
    if (
      row.id !== recordId ||
      typeof row.kind !== "string" ||
      typeof row.revision !== "number"
    )
      throw new Error("The saved cloud version can't be read.");
    const { kind, payload, revision } = row;
    // The profile: the cloud's values for the conflicting fields, with this
    // phone's other changes still to send (Phase 7.8D).
    const sides =
      recordId === PROFILE && row.deleted !== true
        ? this.profileConflictSides()
        : undefined;
    this.transaction(() => {
      this.applyRemote(recordId, kind, payload, revision, row.deleted === true);
      this.db.run("DELETE FROM outbox WHERE id=?", [recordId]);
      this.db.run("DELETE FROM conflicts WHERE id=?", [recordId]);
      this.clearSetting(sentKey(recordId));
      if (sides && canonical(sides.cloud) !== canonical(payload)) {
        if (!validProfile(sides.cloud))
          throw new Error(
            "The cloud's profile can't be combined with this phone's. Keep this phone's version instead.",
          );
        this.storeProfile(sides.cloud);
      }
    });
  }
  /** Exercises a cloud record names that this version doesn't have. */
  private requireExercises(exerciseIds: string[]) {
    if (exerciseIds.some((e) => !this.knowsExercise(e)))
      throw new HeldRecord("update");
  }
  /**
   * Applies one cloud record. Nothing is written when it can't be taken yet
   * (`HeldRecord`): an exercise or kind from a newer Forge, or a workout in
   * progress elsewhere while another is in progress here. Two sessions in
   * progress are never merged and neither replaces the other (Phase 7.8B).
   */
  applyRemote(
    recordId: string,
    kind: string,
    payload: unknown,
    revision: number,
    deleted = false,
  ) {
    if (!deleted && !SYNCED_KINDS.includes(kind))
      throw new HeldRecord("update");
    // Phase 7.8D: a format this version can't read is never applied.
    if (!deleted && !readableFormat(payload)) throw new HeldRecord("update");
    const newer = !deleted && newerFormat(payload);
    try {
      this.transaction(() =>
        this.putRemote(recordId, kind, payload, revision, deleted),
      );
    } catch (e) {
      // A newer Forge's record that this version can't validate waits for an
      // update instead of counting as unreadable.
      if (newer && !isHeldRecord(e)) throw new HeldRecord("update");
      throw e;
    }
  }
  private putRemote(
    recordId: string,
    kind: string,
    payload: unknown,
    revision: number,
    deleted: boolean,
  ) {
    if (deleted) {
      if (kind === "workout")
        this.db.run("DELETE FROM workouts WHERE id=?", [recordId]);
      else if (kind === "journal") {
        this.db.run("DELETE FROM journal WHERE id=?", [recordId]);
        // A favourite removed on another device leaves this phone's list.
        if (recordId.startsWith(`${FAVORITE}:`))
          this.mirrorFavorite(recordId.slice(FAVORITE.length + 1), false);
      } else if (kind === "template")
        this.db.run("DELETE FROM templates WHERE id=?", [recordId]);
      this.forgetNewer(recordId);
    } else if (kind === "profile") {
      // Fields a newer Forge added are kept, and fields the writer's
      // version predates keep this phone's values (Phase 7.8D).
      const known = profileSchema.parse(payload);
      const doc = cloudProfileForPhone(
        this.profileDocument(),
        withUnknownFields(payload, known, profileSchema),
      );
      this.db.run("UPDATE profile SET data=? WHERE id='local'", [
        JSON.stringify(doc),
      ]);
      this.recordBase(recordId, revision, JSON.stringify(payload));
    } else if (kind === "exercise") {
      const e = exerciseSchema.parse(payload);
      if (e.id !== recordId) throw new Error("Remote identity mismatch");
      if (!catalog.some((x) => x.id === e.id))
        this.db.run(
          "INSERT INTO exercises(id,data,custom) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
          [e.id, JSON.stringify(withUnknownFields(payload, e, exerciseSchema))],
        );
    } else if (kind === "journal") {
      const j = journalSchema.parse(payload);
      if (j.id !== recordId) throw new Error("Remote identity mismatch");
      this.putJournal(j);
      if (j.kind === FAVORITE)
        this.mirrorFavorite(String(j.data.exerciseId), true);
    } else if (kind === "template") {
      const t = templateSchema.parse(payload);
      if (t.id !== recordId) throw new Error("Remote identity mismatch");
      this.requireExercises(t.exercises.map((e) => e.exerciseId));
      // Kept exactly as the cloud has it, its save time included.
      this.writeTemplate(t);
    } else {
      const p = payload as {
        workout: unknown;
        exercises: unknown[];
        sets: unknown[];
      };
      const w = workoutSchema.parse(p.workout);
      if (w.id !== recordId) throw new Error("Remote identity mismatch");
      const rows = p.exercises.map((e) => workoutExerciseSchema.parse(e));
      const sets = p.sets.map((s) => setSchema.parse(s));
      if (
        rows.some((e) => e.workoutId !== recordId) ||
        sets.some((s) => !rows.some((e) => e.id === s.exerciseRowId))
      )
        throw new Error("Remote workout contains unrelated records");
      if (
        new Set(rows.map((e) => e.id)).size !== rows.length ||
        new Set(sets.map((s) => s.id)).size !== sets.length
      )
        throw new Error("Duplicate remote child identity");
      for (const row of rows) {
        const existing = this.db.all<{ workout_id: string }>(
          "SELECT workout_id FROM workout_exercises WHERE id=?",
          [row.id],
        )[0];
        if (existing && existing.workout_id !== recordId)
          throw new Error("Exercise identity owned by another workout");
      }
      for (const set of sets) {
        const existing = this.db.all<{ workout_id: string }>(
          "SELECT e.workout_id FROM workout_sets s JOIN workout_exercises e ON e.id=s.exercise_row_id WHERE s.id=?",
          [set.id],
        )[0];
        if (existing && existing.workout_id !== recordId)
          throw new Error("Set identity owned by another workout");
      }
      this.requireExercises(rows.map((e) => e.exerciseId));
      if (w.status !== "completed") {
        const active = this.active();
        if (active && active.id !== recordId) throw new HeldRecord("active");
      }
      this.putWorkout(w);
      this.db.run("DELETE FROM workout_exercises WHERE workout_id=?", [
        recordId,
      ]);
      for (const e of rows) this.putExercise(e);
      for (const s of sets) this.putSet(s);
    }
    if (
      !deleted &&
      (kind === "workout" || kind === "template" || kind === "journal")
    )
      this.keepNewer(recordId, kind, revision, payload);
    this.seeRevision(recordId, revision);
  }
  /**
   * The cloud revision this phone has seen of a record. For a favourite in
   * the older list, it's also noted as seen by this version (see
   * reconcileFavorites).
   */
  private seeRevision(recordId: string, revision: number) {
    this.db.run(syncMetaUpsert, [recordId, revision]);
    if (recordId.startsWith(`${FAVORITE}:`))
      this.db.run("UPDATE favorites_seen SET revision=? WHERE exercise_id=?", [
        revision,
        recordId.slice(FAVORITE.length + 1),
      ]);
  }
  /**
   * Phase 7.8D: a workout, template or journal entry saved by a newer Forge
   * (a newer format, or fields this version doesn't know) is applied for
   * viewing and also kept exactly as received, so it's backed up whole and
   * never overwritten. Any other version of the record replaces the copy.
   */
  private keepNewer(
    recordId: string,
    kind: string,
    revision: number,
    payload: unknown,
  ) {
    if (newerFormat(payload) || unknownRecordFields(kind, payload).length > 0)
      this.db.run(
        "INSERT INTO newer_records(id,kind,revision,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,revision=excluded.revision,payload=excluded.payload",
        [recordId, kind, revision, JSON.stringify(payload)],
      );
    else this.forgetNewer(recordId);
  }
  private forgetNewer(recordId: string) {
    if (this.hasTable("newer_records"))
      this.db.run("DELETE FROM newer_records WHERE id=?", [recordId]);
  }
}
