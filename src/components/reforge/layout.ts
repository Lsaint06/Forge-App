// Pure layout rules for REFORGE components (no React Native imports, so they
// are unit-tested in node).

/**
 * Columns for a stat strip. All items share one row while each keeps
 * `minColumn` points (grown with Dynamic Type, capped at 2×). Otherwise two
 * per row, and one per row when even two don't fit.
 */
export function stripColumns(
  width: number,
  fontScale: number,
  count: number,
  minColumn = 76,
) {
  if (count <= 1) return 1;
  const need = minColumn * Math.min(Math.max(fontScale, 1), 2);
  const fit = Math.max(1, Math.floor(width / need));
  if (fit >= count) return count;
  return fit >= 2 ? 2 : 1;
}

/**
 * Two cards side by side (e.g. a snapshot beside a nutrition ring) only
 * while each keeps `minCard` points at the current text size.
 */
export function pairFits(width: number, fontScale: number, minCard = 160) {
  return width >= 2 * minCard * Math.min(Math.max(fontScale, 1), 2) + 12;
}
