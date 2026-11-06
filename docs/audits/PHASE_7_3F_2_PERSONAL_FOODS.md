# FORGE Phase 7.3F.2 M2 — Personal Barcode Foods & Nutrition Corrections

**Status:** implemented and verified with automated tests; **awaiting founder iPhone 17 acceptance** (§10). Not committed.

**Scope approved by the founder:** F1 (personal barcode foods), F5 (review-tier data stays excluded), F6 (no monthly USDA API pulls), F7 (no server-side reporting).

**Not done in M2, by design:**

- F2: no automatic recovery of invalid USDA barcodes.
- F3/F4: no Open Food Facts.
- F8: no link-out.
- No new API, server, subscription or dependency.

Research basis: [PHASE_7_3F_2_FOOD_COVERAGE.md](PHASE_7_3F_2_FOOD_COVERAGE.md).

---

## 1. Baseline

| Item | State |
| --- | --- |
| Branch | `feat/forge-paths-foundation` |
| Smart Servings | Committed and pushed as `7f5207b` (HEAD before M2) |
| Working tree before M2 | Clean except the untracked M1 report |

The M1 report is kept separate from the code changes; its only edit is the new §16 results pointer.

## 2. What the lifter can do

1. **Unknown barcode → personal food.** "Product not found" now leads with **Create food from this barcode**.
   - The scanned barcode is carried into the label form, shown as printed and never typed.
   - The lifter enters the name, optional brand, the serving ("1 can", 355 ml) and the Nutrition Facts values, **per serving** (the usual label) or **per 100 g / 100 ml**.
   - **Save food** saves it; nothing is logged.
   - The personal food then opens ready to log, with "Saved. FORGE will recognize this barcode next time."
2. **Save once, recognised forever.** Scanning that barcode again opens the personal food immediately, offline, after restarts and on other devices the account syncs to. It also appears among Saved foods and Recent, labelled **Your label**.
3. **Smart Servings for personal foods:**
   - one user-defined serving by default;
   - **½ · 1 · 1½ · 2** chips and a Servings stepper ("× 1 can");
   - "1 serving = 1 can (355 ml)";
   - a values card "For 1½ × 1 can · 532.5 ml".
   
   No gram entry is required. Logging needs **Add to *meal***, with the existing Undo and double-tap guard.
4. **Correct a branded product.** A USDA product's step has **Correct nutrition**.
   - The form opens with USDA's serving and values filled in. The lifter changes what differs from the package and saves a **personal correction**.
   - Saving identical values is refused ("These are USDA's values…").
   - From then on, scanning **or** searching that product opens **Your correction · used instead of USDA's values**, with **Edit correction**, **Remove correction** and **Use USDA values**.
   - Removing it brings USDA's product back immediately.
5. **Edit or delete.** Personal foods and corrections edit in the same label form, from the food step or Saved foods. Deleting explains what scanning will show afterwards.

Logged entries never change.

## 3. Architecture: reused vs new

| Concern | Reused (unchanged) | New or extended |
| --- | --- | --- |
| Storage | `journal` kind `food` (saved foods), `addJournal` / `updateJournal` / `deleteJournal` | Additive keys on the record (§4). **No schema migration** |
| Sync / backup | Outbox per journal record; Supabase sync; `exportBackup` / `importBackup`; `applyRemote` | Nothing: the keys travel inside `data` |
| Logging | `entryFromFood`, `log()` with busy guard, Undo, journal snapshots, totals (`nutritionTotals`) | Personal step passes the chosen servings |
| Protected engine | `servingOf`, `choiceError`, `valuesForAmount`, `entryFromLibrary` | **Untouched**; personal foods don't go through it |
| Barcodes | `gtin14`, `scannedCode`, `brandedByBarcode` | `displayBarcode` (display only) |
| Food form | `FoodForm.tsx` (existing creator file), REFORGE `ForgeField` / `ForgeSegments` / `ForgeChips` | `LabelFields` (label variant of the creator) |
| Scanner | `BarcodeScanner` camera, permission, torch, typed lookup | Personal lookup first; **Create food from this barcode** |
| Domain rules | — | `src/domain/personal-foods.ts`: pure, logic-tested |

No parallel logging engine, barcode database or account system was built.

## 4. Data model

A personal food or correction is an ordinary saved food. Values are **per serving**, `quantity` is 1, and `serving` is the display string. The added keys:

| Key | Personal food | Correction |
| --- | --- | --- |
| `personalKind` | `"food"` | `"correction"` |
| `servingName` | "1 can" (or "1 serving") | same |
| `labelBasis` | `"serving"` or `"100"`: how the values were read (provenance only) | same |
| `sourceId` | `personal:<GTIN-14>` | the product's own (`usda-branded:<FDC>`) |
| `sourceCatalog` | `"personal"` | the catalogue version it corrects (`usda-branded-2026-04-30`) |
| `sourceBarcode` | canonical GTIN-14 (required) | the product's, when it has one |
| `sourceBrand` | as typed (optional) | as typed |
| `sourceMl` / `sourceGrams` | one serving's amount, when stated | same |
| `sourceEdited` | — | `true` |

Entries logged from them carry the existing `SourceMeta` keys only, so a reopened entry reads:

- "From your package label · 1 serving = 355 ml · barcode …", or
- "Based on USDA Branded Foods · FDC … (values edited)".

## 5. Nutritional validation

- **Required:** a name, and all four values (calories, protein, carbs, fat). A blank value says "Enter a number (0 if none)". **Zero is stored as zero.**
- **Ranges:**
  - Per serving: 0–20,000 each (the journal's limit).
  - Per 100: calories ≤ 902. Protein, carbs and fat ≤ 100 g each per 100 g (≤ 200 per 100 ml, since dense liquids exceed 100 g per 100 ml). Per 100 g, protein + carbs + fat ≤ 105.
  - Negative values are refused.
- **Serving amount:**
  - Optional per serving; **required per 100** (otherwise there is no serving to convert to).
  - Range 0.1–5,000 g or ml. The serving name is at most 40 characters.
- **One conversion, once.** Per-100 values are converted to one serving as `value × amount / 100` when saving. Only binary noise is removed (to a millionth, as in `valuesForAmount`).
  - The saved per-serving values are previewed live ("1 can (355 ml): 149 kcal · …").
  - Logging then multiplies per-serving values by servings, the same arithmetic as every saved food.
  - **Grams and millilitres are never converted**, and no density is assumed.
- **Basis switching never reinterprets numbers.** Per-serving and per-100 values are kept apart in the form.
- **Plausibility hint (non-blocking):** when calories are far from 4P + 4C + 9F (more than 20 kcal off and a ratio outside 0.5–2, the build's rule), an ember note asks the lifter to check the label.
- **Too large:** a serving whose values exceed one entry is refused.

## 6. Barcode identity and conflict precedence

- The barcode is the scanner's canonical GTIN-14 (UPC-A, EAN-13, EAN-8, UPC-E as reported by the camera), via the production `scannedCode` / `gtin14`.
- An invalid check digit is refused and **never repaired**. A record claiming `personalKind: "food"` without a valid GTIN-14 is rejected by `validateJournal`.
- **Lookup order on scan:**
  1. the lifter's personal food or correction for that GTIN;
  2. the bundled USDA catalogue (`brandedByBarcode`);
  3. Product not found.
- **Opening a branded product from search** applies the same rule: a correction (matched by barcode, or by product ID for products without one) opens first. Scan and search give identical entries (tested).
- **A corrected product's search row** shows the correction ("Your correction", its calories), and its **+** logs the correction: a row always logs what it shows. The row isn't repeated when Recent or Saved already lists the correction.
- When both exist, the personal record wins, and its origin line says so. **Use USDA values** opens the untouched USDA product; it is offered whenever the catalogue has the barcode, including a future catalogue that adds a product the lifter created a personal food for.
- **Duplicates are refused.** Saving a second personal record for the same barcode, or a second correction of the same product, says "You've already saved this barcode as …". **Correct nutrition** on a product that already has a correction opens that correction for editing.
- **Synced duplicates** (two devices each saved one offline) resolve deterministically on every device: most recently updated, then earliest created, then record ID. The step says "2 of your saved foods use this barcode. Showing the most recently updated."
- Plain saved copies of USDA products ("Save to my foods", 7.3E) carry a barcode but **never** take over a scan; only personal records do.
- Similar names or package sizes are never treated as the same product: matching is by exact GTIN-14 or exact catalogue ID only.

## 7. Persistence, sync, backup, migration

- **Restart:** records are rows in the local SQLite `journal`. Tested by reopening a file database and by remounting the sheet.
- **Sync:** queued in the existing outbox like any journal record. Another device receives them through `applyRemote` (tested). Same-record conflicts use the existing conflict table; different-record duplicates use §6's precedence.
- **Backup and restore:** keys round-trip through `exportBackup` / `importBackup` exactly (tested).
- **Migration:** none needed. Existing saved foods have no `personalKind` and behave exactly as before (tested). Unknown future `personalKind` values written by a newer FORGE are kept as recorded (forward-compatible, as decision H7).
- **History:**
  - Entries are value snapshots; editing or deleting a personal food or correction never changes them (tested).
  - Removing a correction leaves earlier corrected entries at their corrected values.
- **Other users:** records are per-account journal rows; nothing is shared or uploaded beyond the user's own sync.

## 8. Files changed

| File | Change |
| --- | --- |
| `src/domain/personal-foods.ts` | **New.** Label draft, validation, per-100 conversion, correction drafts, `findPersonal` precedence, `personalConflict`, `displayBarcode` |
| `src/domain/nutrition.ts` | `FoodChoice.id` / `.personal`; `savedChoice`; Recent rows of a saved personal food open it |
| `src/domain/validation.ts` | Personal records need a valid GTIN-14 and a bounded serving name |
| `src/domain/food-library.ts` | `sourceLabel("personal:…")` = "your package label" |
| `src/components/nutrition/FoodForm.tsx` | `LabelFields` |
| `src/components/nutrition/QuickAddSheet.tsx` | Label step (create, edit, correct); personal food step with Smart Servings; personal-first `openBranded`; scanner wiring; **Correct nutrition**; `ActionRow`, `OriginLine` |
| `src/components/nutrition/BarcodeScanner.tsx` | Personal lookup first; **Create food from this barcode** carries the GTIN-14 |
| `src/components/nutrition/FoodEditorSheet.tsx` | Personal records edit in the label form |
| `src/components/nutrition/results.ts` | Provenance "Your label" / "Your correction" |
| `src/screens/SavedFoods.tsx` | Origin in subtitles; delete / remove wording |
| `tests/personal-foods.test.ts` | **New**, 11 logic tests |
| `tests/ui/personal-foods.test.tsx` | **New**, 9 UI tests |
| `tests/ui/barcode-scanner.test.tsx` | Not-found test updated for the new action |
| `docs/redesign/REFORGE_FOUNDATION.md` | Not-found row; personal foods section |
| `docs/audits/PHASE_7_3F_2_FOOD_COVERAGE.md` | §16: M2 results |

## 9. Verification (2026-10-26)

| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | ✅ |
| ESLint | ✅ (the pre-existing `Repo` warning in `templates-wp3.test.tsx` only) |
| Prettier (`format:check`) | ✅ |
| Logic tests | ✅ **479 / 479** (468 before + 11 new) |
| UI tests | **441 / 443**. New: 9/9, scanner 9/9. The 2 failures are the documented **M-1 Progress Monday-only tests** (`progress.test.tsx`); with the clock set to a Tuesday, that file passes 11/11 |
| `food-library:check` | ✅ 3,730 foods, reproducible |
| `branded:check` | ✅ 404,982 products / 395,354 barcodes, byte-identical (catalogue unchanged) |
| iOS / Android export | ✅ Hermes bundles 7,999,219 B / 7,990,484 B (+36 KB / +38 KB vs 7.3F.1) |

**New tests cover:**

- an unknown barcode passed into creation (shown, not typed);
- valid and invalid GTINs (never repaired);
- per-serving storage;
- per-100 g and per-100 ml conversion, and basis switching;
- zero values, blanks, negatives, impossible values and oversized servings;
- ½ / 1½ servings, macro scaling and the millilitres shown;
- save and rescan offline (network cut, 0 fetches);
- a fresh mount and a reopened file database;
- duplicate refusal, and synced-duplicate precedence;
- editing in the label form, and deletion;
- correction creation, no-op refusal, preference on rescan and search, **Use USDA values**, removal restoring USDA;
- scan-vs-search identical entries;
- a corrected product's search row showing and logging the correction (its + included);
- journal snapshots unchanged by edits and deletes;
- Undo and the double-tap guard;
- existing saved foods unchanged (migration);
- backup / restore and sync round trips.

Existing suites (generic foods, branded search, Smart Servings, hydration, nutrition dashboard) pass unchanged.

**Test-harness note:** rendering the Journal screen, unmounting it and rendering it again in one jest test leaves the second Add food sheet unopenable. The same probe fails on the pre-M2 code, so it is a harness limitation (sheet teardown in jest), not app behaviour. "Restart" is therefore tested with a reopened file database (logic) and a fresh render (UI).

**Not verified until the founder tests on the iPhone:** physical camera reading of the founder's cans, keyboard behaviour while typing label values, and Airplane Mode.

## 10. Founder acceptance (iPhone 17, Expo Go)

Start the app (`npm.cmd start`) and scan the QR code with Expo Go.

### Test A: Dr Pepper can

1. Nutrition → **Add to** any meal → the barcode button beside search → scan the can.
2. If it shows **Product not found**, tap **Create food from this barcode**. Check that the barcode digits shown match the can.
3. Enter the can's label exactly:
   - name "Dr Pepper";
   - Serving name **1 can**;
   - Amount **355**, then tap **ml**;
   - calories, protein, carbs and fat as printed, under **Per serving**.

   Check the preview line under the values.
4. **Save food**. Nothing is logged yet; the screen says "Saved. FORGE will recognize this barcode next time."
5. Tap **Back** (to the scanner), then Back again, and reopen the scanner.
6. Scan the same can. "Your food · values from your package label" opens immediately.
7. Leave **1** selected, check "1 serving = 1 can (355 ml)" and the calories, then **Add to *meal***.
8. Check the meal's calories and macros on the Nutrition dashboard. Reopen Add food and tap **Undo** to confirm it removes the entry, then add it again if wanted.

(If the can **is** recognised as a USDA product, use Test B with it instead.)

### Test B: incorrect USDA product

1. Scan or search a branded food (e.g. the Coca-Cola can) and log it once (history to protect).
2. Open it again → **Correct nutrition**. USDA's values are filled in. Change at least one value to your package's.
3. **Save correction**. "Your correction · used instead of USDA's values" appears.
4. Back to the scanner, rescan. The correction opens first. Also search the product by name: the same correction opens.
5. Tap **Use USDA values** to see the original, unchanged.
6. Open the correction → **Remove correction** → confirm. USDA's product returns, and rescanning shows USDA with **Correct nutrition**.
7. Check the day's earlier entries: their calories are unchanged.

### Test C: offline persistence

1. With a personal food saved (Test A), close FORGE completely and reopen it.
2. Turn on Airplane Mode.
3. Scan the same product. It resolves immediately from the phone.

## 11. Remaining limitations

- **One serving per personal food.** There is no whole-package option and no grams or millilitres chip: the lifter logs in servings, which matches the label they entered. A grams / ml alternative would need a second conversion; it can be added later from the stored amount if wanted.
- **A personal food (not a correction) opened from Saved foods or Recent** doesn't look for a USDA twin. **Use USDA values** appears for it only when it was opened from a scan or a branded search. Corrections always offer it, looking the product up offline by barcode. Removing a correction opened from Saved foods returns to the list.
- **Personal foods are per account.** They don't improve the catalogue for other users, and reporting stays out of scope (F7).
- **Barcodes can't be typed in the label form.** They come from the scan or the scanner's typed lookup. Changing a personal food's barcode means deleting it and scanning again.
- **Not yet tested on device:** physical camera reading and keyboard layout on the iPhone (§10).
