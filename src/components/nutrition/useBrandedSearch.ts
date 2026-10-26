import { useEffect, useRef, useState } from "react";
import {
  brandedProblem,
  searchBranded,
  type BrandedPage,
} from "../../data/branded-catalog";
import { catalogKey } from "../../domain/branded";
import type { LibraryFood } from "../../domain/food-library";

/** Branded products found for a search (bounded pages, loaded on demand). */
export type BrandedResults = {
  /** The query these results answer. */
  query: string;
  foods: LibraryFood[];
  /** Matches, counted up to 1,000. */
  total: number;
  broad: boolean;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  /** Whether another page may follow. */
  more: boolean;
};

const PAGE = 30;
const idle = (query: string): BrandedResults => ({
  query,
  foods: [],
  total: 0,
  broad: false,
  status: "idle",
  more: false,
});
const fromPage = (query: string, page: BrandedPage | null): BrandedResults => ({
  query,
  foods: page?.foods ?? [],
  total: page?.total ?? 0,
  broad: page?.broad ?? false,
  status: "ready",
  more: (page?.foods.length ?? 0) === PAGE,
});

/**
 * Searches the bundled branded catalogue for a (settled) query: one page
 * first, more on request. Searches run on SQLite's thread; an older answer
 * never replaces a newer one, and nothing is kept beyond the pages shown.
 * Queries under two letters or digits don't search.
 */
export function useBrandedSearch(query: string) {
  // Only answers are stored; "idle" and "searching" follow from the query.
  const [answered, setAnswered] = useState<BrandedResults>(() => idle(""));
  const [attempt, setAttempt] = useState(0);
  const ticket = useRef(0);
  const started = useRef(0);
  const loadingMore = useRef(false);
  const short = catalogKey(query).replace(/ /g, "").length < 2;

  useEffect(() => {
    const mine = ++ticket.current;
    loadingMore.current = false;
    if (short) return;
    started.current = Date.now();
    searchBranded(query).then(
      (page) => {
        if (mine === ticket.current) setAnswered(fromPage(query, page));
      },
      (e: unknown) => {
        if (mine === ticket.current)
          setAnswered({
            ...idle(query),
            status: "error",
            error: brandedProblem(e),
          });
      },
    );
  }, [query, short, attempt]);

  const results: BrandedResults = short
    ? idle(query)
    : answered.query === query
      ? answered
      : { ...idle(query), status: "loading" };

  useEffect(() => {
    // Development builds report search-to-screen time for branded results.
    if (
      __DEV__ &&
      process.env.NODE_ENV !== "test" &&
      answered.status === "ready" &&
      started.current
    ) {
      console.log(
        `[branded] "${answered.query}": ${answered.foods.length} shown of ${answered.broad ? "1000+" : answered.total} in ${Date.now() - started.current} ms`,
      );
      started.current = 0;
    }
  }, [answered]);

  /** Loads the next page (once at a time; ignored when there is none). */
  function more() {
    if (loadingMore.current || !results.more || results.status !== "ready")
      return;
    loadingMore.current = true;
    const mine = ticket.current;
    searchBranded(results.query, results.foods.length, results.total)
      .then((page) => {
        if (mine !== ticket.current || !page) return;
        setAnswered((r) => ({
          ...r,
          foods: [...r.foods, ...page.foods],
          more: page.foods.length === PAGE,
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (mine === ticket.current) loadingMore.current = false;
      });
  }

  /** Searches again after a failure. */
  const retry = () => setAttempt((n) => n + 1);

  /** True until the current query has its answer. */
  const pending = results.status === "loading";

  return { results, more, retry, pending };
}
