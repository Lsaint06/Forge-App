import type { CuratedProgram } from "../src/domain/programs/model";

// DEVELOPMENT-ONLY PLACEHOLDER. Not a training program: its exercises and
// numbers exist only to exercise the data model in tests. It is a draft, is
// never bundled in src/programs, and must not be published.
export function placeholderProgram(
  patch: Partial<CuratedProgram> = {},
): CuratedProgram {
  const session = (id: string) => ({
    id,
    name: `Placeholder session ${id}`,
    exercises: [
      {
        exerciseId: "barbell-bench-press",
        sets: 1,
        reps: { min: 1, max: 1 },
        restSeconds: 0,
      },
    ],
  });
  return {
    id: "dev-placeholder",
    version: 1,
    status: "draft",
    name: "DEVELOPMENT PLACEHOLDER — NOT A TRAINING PROGRAM",
    summary: "Test data only.",
    description: "Test data only. Not authored training content.",
    experience: "Beginner",
    goal: "Strength",
    daysPerWeek: 3,
    equipment: ["Barbell"],
    weeklyPattern: ["train", "rest", "train", "rest", "train", "rest", "rest"],
    progression: "Test data only.",
    phases: [{ name: "Placeholder", sessions: ["a", "b", "c"].map(session) }],
    ...patch,
  };
}
