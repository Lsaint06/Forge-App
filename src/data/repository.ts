import { schema, migrationV2 } from "./schema";
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
} from "../domain/validation";
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
  }
  profile(): Profile {
    return profileSchema.parse(
      JSON.parse(
        this.db.all<{ data: string }>("SELECT data FROM profile")[0]?.data ??
          JSON.stringify(defaults),
      ),
    );
  }
  saveProfile(p: Partial<Profile>) {
    const data = profileSchema.parse({ ...this.profile(), ...p });
    this.transaction(() => {
      this.db.run("UPDATE profile SET data=? WHERE id='local'", [
        JSON.stringify(data),
      ]);
      this.queue("profile", "profile", data);
    });
    return data;
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
  customExercises() {
    return this.db
      .all<{ data: string }>("SELECT data FROM exercises WHERE custom=1")
      .map((x) => exerciseSchema.parse(JSON.parse(x.data)));
  }
  saveExercise(e: Exercise) {
    const data = exerciseSchema.parse(e);
    if (catalog.some((c) => c.id === e.id))
      throw new Error(
        "Built-in exercises cannot be edited. Create a custom variation.",
      );
    this.transaction(() => {
      this.db.run(
        "INSERT INTO exercises(id,data,custom) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
        [e.id, JSON.stringify(data)],
      );
      this.queue(e.id, "exercise", data);
    });
    return data;
  }
  favorites() {
    return this.db
      .all<{ exercise_id: string }>("SELECT exercise_id FROM favorites")
      .map((x) => x.exercise_id);
  }
  toggleFavorite(exerciseId: string) {
    if (this.favorites().includes(exerciseId))
      this.db.run("DELETE FROM favorites WHERE exercise_id=?", [exerciseId]);
    else
      this.db.run("INSERT INTO favorites(exercise_id) VALUES(?)", [exerciseId]);
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
  history(exerciseId: string) {
    const rows = this.db.all<{ id: string; workoutId: string }>(
      `SELECT e.id,w.id AS workoutId FROM workout_exercises e JOIN workouts w ON w.id=e.workout_id WHERE e.exercise_id=? AND w.status='completed' ORDER BY w.finished_at DESC,e.position`,
      [exerciseId],
    );
    const history = new Map<string, WorkoutSet[]>();
    for (const e of rows)
      history.set(e.workoutId, [
        ...(history.get(e.workoutId) ?? []),
        ...this.sets(e.id),
      ]);
    return [...history.values()];
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
        this.sets(row.id).filter((set) => set.kind !== "warmup"),
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
  private queueWorkout(workoutId: string) {
    const w = this.workout(workoutId);
    if (w) {
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
      this.queue(t.id, "template", t);
    });
    return t;
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
  private putJournal(j: Journal) {
    journalSchema.parse(j);
    validateJournal(j.kind, j.data);
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
    return backupSchema.parse({
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
      favorites: this.favorites(),
    });
  }
  importBackup(text: string) {
    if (text.length > 50_000_000) throw new Error("Backup exceeds 50 MB");
    const b = backupSchema.parse(JSON.parse(text));
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
    this.transaction(() => {
      this.clearData();
      for (const e of b.customExercises) this.saveExercise(e);
      this.saveProfile(b.profile);
      for (const w of b.workouts) this.putWorkout(w);
      for (const e of b.workoutExercises) this.putExercise(e);
      for (const s of b.sets) this.putSet(s);
      for (const t of b.templates)
        this.saveTemplate(t.name, t.exercises, t.id, t.notes);
      for (const j of b.journals) {
        this.putJournal(j);
        this.queue(j.id, "journal", j);
      }
      for (const f of b.favorites)
        this.db.run("INSERT INTO favorites(exercise_id) VALUES(?)", [f]);
      for (const w of b.workouts) this.queueWorkout(w.id);
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
      ])
        this.db.run(`DELETE FROM ${table}`);
      this.db.run("DELETE FROM exercises WHERE custom=1");
      this.db.run("UPDATE profile SET data=? WHERE id='local'", [
        JSON.stringify(defaults),
      ]);
    });
  }
  queue(recordId: string, kind: string, payload: unknown, deleted = false) {
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
  outbox() {
    return this.db.all<Outbox>(
      "SELECT id,kind,payload,revision,attempts,next_attempt AS nextAttempt,deleted FROM outbox ORDER BY CASE kind WHEN 'exercise' THEN 0 WHEN 'template' THEN 1 ELSE 2 END",
    );
  }
  acknowledge(recordId: string, revision: number, payload: string) {
    this.transaction(() => {
      this.db.run(
        "INSERT INTO sync_meta(id,revision) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision",
        [recordId, revision],
      );
      this.db.run("DELETE FROM outbox WHERE id=? AND payload=?", [
        recordId,
        payload,
      ]);
      this.db.run("UPDATE outbox SET revision=? WHERE id=?", [
        revision,
        recordId,
      ]);
    });
  }
  conflict(recordId: string, local: string, remote: string, revision: number) {
    this.db.run(
      "INSERT INTO conflicts(id,local,remote,revision) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET local=excluded.local,remote=excluded.remote,revision=excluded.revision",
      [recordId, local, remote, revision],
    );
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
  keepLocal(recordId: string) {
    const c = this.conflicts().find((c) => c.id === recordId);
    if (!c) return;
    this.transaction(() => {
      this.db.run(
        "UPDATE outbox SET revision=?,attempts=0,next_attempt=0 WHERE id=?",
        [c.revision, recordId],
      );
      this.db.run("DELETE FROM conflicts WHERE id=?", [recordId]);
    });
  }
  applyRemote(
    recordId: string,
    kind: string,
    payload: unknown,
    revision: number,
    deleted = false,
  ) {
    this.transaction(() => {
      if (deleted) {
        if (kind === "workout")
          this.db.run("DELETE FROM workouts WHERE id=?", [recordId]);
        else if (kind === "journal")
          this.db.run("DELETE FROM journal WHERE id=?", [recordId]);
        else if (kind === "template")
          this.db.run("DELETE FROM templates WHERE id=?", [recordId]);
      } else if (kind === "profile") {
        this.db.run("UPDATE profile SET data=? WHERE id='local'", [
          JSON.stringify(profileSchema.parse(payload)),
        ]);
      } else if (kind === "exercise") {
        const e = exerciseSchema.parse(payload);
        if (e.id !== recordId) throw new Error("Remote identity mismatch");
        if (!catalog.some((x) => x.id === e.id))
          this.db.run(
            "INSERT INTO exercises(id,data,custom) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
            [e.id, JSON.stringify(e)],
          );
      } else if (kind === "journal") {
        const j = journalSchema.parse(payload);
        if (j.id !== recordId) throw new Error("Remote identity mismatch");
        this.putJournal(j);
      } else if (kind === "template") {
        const t = templateSchema.parse(payload);
        if (t.id !== recordId) throw new Error("Remote identity mismatch");
        this.saveTemplate(t.name, t.exercises, t.id, t.notes);
        this.db.run("DELETE FROM outbox WHERE id=?", [recordId]);
      } else if (kind === "workout") {
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
        this.putWorkout(w);
        this.db.run("DELETE FROM workout_exercises WHERE workout_id=?", [
          recordId,
        ]);
        for (const e of rows) this.putExercise(e);
        for (const s of sets) this.putSet(s);
      } else throw new Error("Unsupported remote record kind");
      this.db.run(
        "INSERT INTO sync_meta(id,revision) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision",
        [recordId, revision],
      );
    });
  }
}
