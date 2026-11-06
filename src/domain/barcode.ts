// Barcodes (Phase 7.3E): one canonical form for every GTIN, shared by the
// branded-catalogue build and the app, so a code printed as UPC-A, EAN-13,
// EAN-8 or GTIN-14 always finds the same product. Pure and dependency-free.

/** GS1 mod-10 check of a code left-padded to 14 digits. */
function checkDigitOk(g14: string) {
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(g14[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(g14[13]);
}

/** A UPC-E code (8 digits, number system 0 or 1) expanded to UPC-A. */
export function expandUpcE(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const [ns, d1, d2, d3, d4, d5, d6, check] = code.split("");
  let body: string;
  if (d6 === "0" || d6 === "1" || d6 === "2")
    body = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
  else if (d6 === "3") body = `${d1}${d2}${d3}00000${d4}${d5}`;
  else if (d6 === "4") body = `${d1}${d2}${d3}${d4}00000${d5}`;
  else body = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  return `${ns}${body}${check}`;
}

/** What a scanner reports a code to be, when it knows. */
export type Symbology = "upc_e";

/**
 * The canonical GTIN-14 of a scanned, typed or published code, or null when
 * it isn't a valid GTIN. Spaces are ignored; anything else non-numeric is
 * refused. A UPC-E code is expanded only when the scanner says it is UPC-E
 * (8-digit codes are otherwise EAN-8). A missing or wrong check digit is
 * never repaired.
 */
export function gtin14(raw: string, symbology?: Symbology): string | null {
  let digits = String(raw).replace(/\s+/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (symbology === "upc_e") {
    const expanded = expandUpcE(digits);
    if (!expanded) return null;
    digits = expanded;
  }
  if (digits.length < 8 || digits.length > 14) return null;
  const g = digits.padStart(14, "0");
  return checkDigitOk(g) ? g : null;
}

/** Why a published code can't be indexed (for build reports). */
export function gtinProblem(raw: unknown) {
  const s = String(raw ?? "").trim();
  if (!s) return "missing";
  if (!/^\d+$/.test(s)) return "non-digit";
  if (s.length < 8 || s.length > 14) return "bad-length";
  return gtin14(s) ? undefined : "bad-check-digit";
}

/** The food barcode types the scanner reads. */
export const FOOD_BARCODES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

/**
 * What a camera read means: its digits and, for a full 8-digit UPC-E, that
 * symbology (so it is expanded, not read as EAN-8). iOS reports UPC-A as
 * EAN-13 without its leading zero; GTIN-14 padding makes both the same code.
 * A shortened UPC-E (no number system or check digit) is not completed.
 */
export function scannedCode(type: string | undefined, data: string) {
  const digits = String(data).replace(/\s+/g, "");
  const symbology: Symbology | undefined =
    type === "upc_e" && digits.length === 8 ? "upc_e" : undefined;
  return {
    digits,
    symbology,
    gtin:
      type === "upc_e" && digits.length < 8 ? null : gtin14(digits, symbology),
  };
}
