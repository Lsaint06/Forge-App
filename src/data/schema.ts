export const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profile(id TEXT PRIMARY KEY CHECK(id='local'), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS exercises(id TEXT PRIMARY KEY, data TEXT NOT NULL, custom INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS favorites(exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS workouts(id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','paused','completed')),started_at INTEGER NOT NULL,finished_at INTEGER,paused_at INTEGER,paused_ms INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',template_id TEXT,updated_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS one_active ON workouts((1)) WHERE status IN ('active','paused');
CREATE INDEX IF NOT EXISTS workout_date ON workouts(finished_at);
CREATE TABLE IF NOT EXISTS workout_exercises(id TEXT PRIMARY KEY,workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,exercise_id TEXT NOT NULL REFERENCES exercises(id),position INTEGER NOT NULL,notes TEXT NOT NULL DEFAULT '',rest INTEGER NOT NULL DEFAULT 90,group_id TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS exercise_workout ON workout_exercises(workout_id,position);
CREATE INDEX IF NOT EXISTS exercise_history ON workout_exercises(exercise_id);
CREATE TABLE IF NOT EXISTS workout_sets(id TEXT PRIMARY KEY,exercise_row_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,position INTEGER NOT NULL,weight REAL NOT NULL DEFAULT 0 CHECK(weight>=0),reps INTEGER NOT NULL DEFAULT 0 CHECK(reps>=0),duration REAL NOT NULL DEFAULT 0,distance REAL NOT NULL DEFAULT 0,rpe REAL,rir REAL,kind TEXT NOT NULL DEFAULT 'working',completed INTEGER NOT NULL DEFAULT 0,rest INTEGER NOT NULL DEFAULT 90,tempo TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',side TEXT NOT NULL DEFAULT 'both');
CREATE INDEX IF NOT EXISTS sets_exercise ON workout_sets(exercise_row_id,position);
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,name TEXT NOT NULL,notes TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS template_exercises(id TEXT PRIMARY KEY,template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,exercise_id TEXT NOT NULL REFERENCES exercises(id),position INTEGER NOT NULL,sets INTEGER NOT NULL,reps INTEGER NOT NULL,weight REAL NOT NULL,rest INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS journal(id TEXT PRIMARY KEY,kind TEXT NOT NULL,date TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS journal_kind_date ON journal(kind,date);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_meta(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,kind TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS conflicts(id TEXT PRIMARY KEY,local TEXT NOT NULL,remote TEXT NOT NULL,revision INTEGER NOT NULL);
INSERT OR IGNORE INTO migrations(version,applied_at) VALUES(1,0);
`;
export const migrationV2 = `
ALTER TABLE template_exercises ADD COLUMN rep_max INTEGER;
ALTER TABLE workout_exercises ADD COLUMN target TEXT;
INSERT INTO migrations(version,applied_at) VALUES(2,CAST(strftime('%s','now') AS INTEGER)*1000);
`;
