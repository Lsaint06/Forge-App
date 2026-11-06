import type { Exercise } from "../types";
import { experienceLevels, trainingGoals } from "../profile";
import {
  checkLibrary,
  programFingerprint,
  programKey,
  publishedPrograms,
  validateProgram,
  type CuratedProgram,
  type ProgramLock,
} from "./model";

// Forge Paths publication and activation (Phase 6). Pure functions: the
// publish script (scripts/publish-programs.ts) applies the plan to files.
// See docs/PHASE_6.md.

export const frequencies = [3, 4, 5] as const;
export type Combination = {
  goal: CuratedProgram["goal"];
  experience: CuratedProgram["experience"];
  daysPerWeek: CuratedProgram["daysPerWeek"];
};

// Every goal × experience × weekly frequency the curated library must cover.
export const requiredCombinations: readonly Combination[] =
  trainingGoals.flatMap((goal) =>
    experienceLevels.flatMap((experience) =>
      frequencies.map((daysPerWeek) => ({ goal, experience, daysPerWeek })),
    ),
  );

const label = (c: Combination) =>
  `${c.experience} ${c.goal} · ${c.daysPerWeek} days`;

// Coverage of the latest *published* versions only; drafts never count.
export function libraryCoverage(programs: readonly CuratedProgram[]) {
  const published = publishedPrograms(programs);
  const missing = requiredCombinations.filter(
    (c) =>
      !published.some(
        (p) =>
          p.goal === c.goal &&
          p.experience === c.experience &&
          p.daysPerWeek === c.daysPerWeek,
      ),
  );
  const duplicated = requiredCombinations.filter(
    (c) =>
      published.filter(
        (p) =>
          p.goal === c.goal &&
          p.experience === c.experience &&
          p.daysPerWeek === c.daysPerWeek,
      ).length > 1,
  );
  return {
    complete: missing.length === 0,
    missing: missing.map(label),
    duplicated: duplicated.map(label),
    published: published.length,
  };
}

export type PublicationPlan = {
  // Programs whose status changes from draft to published.
  publish: { id: string; version: number; fingerprint: string }[];
  // The complete lock after publication.
  lock: Record<string, string>;
  // Blocking problems; the plan must not be applied when non-empty.
  errors: string[];
  coverage: ReturnType<typeof libraryCoverage>;
};

// Plans publishing the given draft versions (all drafts by default). Nothing
// about the authored content changes except `status`. The plan is valid only
// if the resulting library passes every integrity check, every published
// version is fingerprint-locked and the 18 combinations are covered.
export function publicationPlan(
  sources: readonly unknown[],
  lock: ProgramLock,
  catalog: readonly Exercise[],
  select?: readonly string[],
): PublicationPlan {
  const errors: string[] = [];
  const programs: CuratedProgram[] = [];
  for (const raw of sources) {
    try {
      programs.push(validateProgram(raw, catalog));
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  const chosen = programs.filter(
    (p) =>
      p.status === "draft" &&
      (!select || select.includes(p.id) || select.includes(programKey(p))),
  );
  for (const key of select ?? [])
    if (!programs.some((p) => p.id === key || programKey(p) === key))
      errors.push(`${key} is not a bundled program`);
  const after = programs.map((p) =>
    chosen.includes(p) ? { ...p, status: "published" as const } : p,
  );
  const next: Record<string, string> = { ...lock };
  const publish = after
    .filter((p) => chosen.some((c) => programKey(c) === programKey(p)))
    .map((p) => {
      const fingerprint = programFingerprint(p);
      next[programKey(p)] = fingerprint;
      return { id: p.id, version: p.version, fingerprint };
    });
  errors.push(...checkLibrary(after, next, catalog));
  const coverage = libraryCoverage(after);
  if (!coverage.complete)
    errors.push(`Library does not cover: ${coverage.missing.join("; ")}`);
  if (coverage.duplicated.length)
    errors.push(
      `More than one published program for: ${coverage.duplicated.join("; ")}`,
    );
  return { publish, lock: next, errors, coverage };
}
