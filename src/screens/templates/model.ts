import type { Template } from "../../domain/types";

// Templates screen (Phase 7.2C-2) presentation rules. Read-only.

/** Search appears only once the list is long enough to need it (C6). */
export const SEARCH_THRESHOLD = 8;
export const showsSearch = (count: number) => count > SEARCH_THRESHOLD;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Templates whose name, or one of whose exercises, contains every word of
 * the query. Order is kept (the repository's name order).
 */
export function filterTemplates(
  templates: Template[],
  query: string,
  exerciseName: (id: string) => string | undefined,
) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return templates;
  return templates.filter((t) => {
    const text = fold(
      [
        t.name,
        ...t.exercises.map((e) => exerciseName(e.exerciseId) ?? ""),
      ].join(" "),
    );
    return words.every((w) => text.includes(w));
  });
}
