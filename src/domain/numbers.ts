/**
 * Typed numbers from regions that write "1,5" for one and a half. A single
 * comma with no point is read as the decimal separator; anything else is left
 * as typed, so "1.5" behaves exactly as before and "1.234,5" or "1,2,3" stay
 * invalid rather than being guessed at.
 */
export function decimalText(text: string) {
  return /^[^,.]*,[^,.]*$/.test(text) ? text.replace(",", ".") : text;
}

/**
 * A number typed into a settings field (profile, targets): "2,5" or "2.5"
 * → 2.5; "" → 0 (an empty field has always meant zero there); anything
 * else, including a sign or a second point, → NaN, which validation refuses.
 */
export function readFormNumber(text: string) {
  const t = decimalText(text.trim());
  if (t === "") return 0;
  return /^\d*\.?\d*$/.test(t) ? Number(t) : NaN;
}
