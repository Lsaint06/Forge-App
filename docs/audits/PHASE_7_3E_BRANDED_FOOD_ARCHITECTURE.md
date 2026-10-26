# Project REFORGE — Phase 7.3E: Branded Food Catalogue Architecture

**Founder decision: bundled-first. No external catalogue hosting for the initial release.** The branded catalogue ships inside the app, works offline from the first launch, and is updated with app releases. Cloudflare R2, Supabase Storage, GitHub Releases and any download service are **not** part of this architecture.

**Status:** **M2 (production integration) implemented and verified, for founder review; not committed.**

- M1 (iPhone benchmark) was accepted.
- **The offline test is still pending.** It has not been run and is not reported as passed.
- §0 is the M2 record. §1–18 are the research and M1 record, kept as evidence. Where M2 changed a detail (schema 3, final counts), §0 says so.

- **Baseline:** `5bb9171` (Phase 7.3D), identical to `origin/feat/forge-paths-foundation`.
- **The M1 prototype was removed** (the benchmark screen and route, its You row, the prototype test, `assets/m1`). Its query code was hardened into the production data layer.

---

> **Phase 7.3F.1 update:** the catalogue is now **schema 4** (64,737,280 bytes). It adds serving names, their sources and whole-package amounts; see [PHASE_7_3F_1_SMART_SERVINGS.md](PHASE_7_3F_1_SMART_SERVINGS.md) §0. Products, barcodes and exclusions are unchanged.

## 0. M2: production integration (implemented)

### 0.1 Final catalogue

| Item | Value |
| --- | --- |
| Source | USDA FDC Branded Foods **2026-04-30**: 455,458 records; archive SHA-256 `57b0f122…70db2256` (verified on every build) |
| **Products** | **404,982** (M1: 404,991) |
| **Barcodes** | **395,354** (M1: 395,351) |
| Per 100 ml | 54,030 |
| Exclusions | **31,488**, identical to M1 reason by reason ([BUILD_REPORT.md](../branded-catalog/BUILD_REPORT.md)) |
| Superseded | 18,207 older versions of a barcode, plus 781 exact duplicates without one; every record listed in [superseded.tsv](../branded-catalog/superseded.tsv) |
| Euromonitor | Excluded (2,487), as validated in §4.3 |
| File | `assets/catalog/usda-branded-2026-04-30.db`, **62,058,496 bytes**, schema **3** (adds each product's GTIN, so a logged entry can record its barcode) |
| Content digest | `73f6a877ff592b7735e77ec5f293304352d8929c83b69b9d09cf9d603708ad9e`: every table row, independent of the SQLite version |

**Why the counts differ from M1, exactly:** 12 accepted products publish valid barcodes with spaces in them (`"0 12546 61229 6"`). M1 treated those as having no barcode; production ignores the spaces.

- 9 of them were duplicates of products already in the catalogue, so they merged under the newest-label rule: 404,991 − 9 = 404,982.
- 3 add new barcodes: 395,351 + 3 = 395,354.

Measured with a diagnostic over the full release.

### 0.2 Reproducible build ([scripts/branded-catalog/](../../scripts/branded-catalog/))

| Command | What it does |
| --- | --- |
| `npm run branded:build` | Downloads the pinned archive (cached in `.cache/branded-catalog`, gitignored), checks its size and SHA-256, and streams the 3.3 GB member line by line (size and CRC-32 checked; never extracted to disk). It then applies the rules, deduplicates, writes the catalogue, and commits the [manifest](../../src/data/branded-catalog.manifest.json) and [report](../branded-catalog/BUILD_REPORT.md) |
| `npm run branded:check` | Rebuilds into a temporary file and fails unless the content digest equals the committed manifest. Writes nothing |
| `npm run branded:ensure` | Makes sure the asset is present, complete and equal to the manifest (in milliseconds), and builds it only when not. **Runs automatically before `start`, `export` and EAS builds** (`prestart`, `preexport`, `eas-build-post-install`) and in CI (cached archive) |

**Reproducibility evidence (desktop):**

- Two clean builds produced byte-identical files (SHA-256 `5b7120a6…a9b8158`, SQLite 3.53.4).
- `branded:check` reproduced the content digest and the file bytes.
- A different SQLite version may produce different file bytes; the content digest is unaffected and is what is checked.

**Network:** only the first build on a machine (or a CI run with a cold cache) needs internet, for a 204 MB download from `fdc.nal.usda.gov`. After that everything works offline. The 59–62 MB catalogue is never committed.

### 0.3 Packaging (measured from the export)

- **Packaging:** the catalogue is a **separate Metro asset** (`dist/assets/…`, 62,058,496 bytes).
- **JavaScript bundles:** neither contains catalogue bytes or product names.
- **JavaScript bundle growth (all code), exact against the `5bb9171` baseline:**

| Platform | Baseline | With M2 | Change |
| --- | --- | --- | --- |
| iOS | 7,876,108 bytes | 7,917,821 bytes | **+41,713 bytes (+0.53%)** |
| Android | 7,867,006 bytes | 7,907,441 bytes | **+40,435 bytes (+0.51%)** |

- **App start:** nothing touches the catalogue. It is opened on the first branded search.
- **First use:** the asset is copied into the SQLite folder once (an APFS clone on iOS, §7), its page count is checked, and `quick_check` runs once. Later uses only open it and check its metadata.

### 0.4 Production modules

| Module | Role |
| --- | --- |
| [domain/barcode.ts](../../src/domain/barcode.ts) | GTIN-14 normalisation (UPC-A, EAN-13, EAN-8, GTIN-14; UPC-E only when the scanner says so); check digits never repaired. Shared by the build and the app |
| [domain/branded.ts](../../src/domain/branded.ts) | Schema version, `catalogKey`, and `brandedFood()`: a product as a `LibraryFood` whose only portion is the label serving, in g or ml |
| [data/branded-query.ts](../../src/data/branded-query.ts) | Query planning and SQL (M1 ranking rules), bounded pages, exact barcode lookup, metadata checks. Runner-injected (node:sqlite in tests) |
| [data/branded-install.ts](../../src/data/branded-install.ts) | Install, open and recovery rules (§11): copy once, verify, replace a bad copy once, clear errors, never a loop; platform work injected |
| [data/branded-catalog.ts](../../src/data/branded-catalog.ts) | `expo-sqlite` and `expo-file-system` bindings; lazy, read-only (`query_only`); `searchBranded()`, `brandedByBarcode()` (for 7.3F); removes earlier versions and Android's intermediate copy |
| [components/nutrition/useBrandedSearch.ts](../../src/components/nutrition/useBrandedSearch.ts) | Search state: one page, more on request, stale answers ignored, retry |
| [QuickAddSheet.tsx](../../src/components/nutrition/QuickAddSheet.tsx) | **Brands · USDA Branded** section after Recent, Saved and the USDA library; + logs the label serving (Undo, double-tap guard); the existing selected-food step now handles g **or** ml; the source line names the release, FDC ID and barcode |
| [results.ts](../../src/components/nutrition/results.ts), [FoodEditorSheet.tsx](../../src/components/nutrition/FoodEditorSheet.tsx) | Branded row (brand line, "USDA Branded" pill). Recent and saved rows show their brand. A reopened entry reads "FAIRLIFE · From USDA Branded Foods · FDC … · 1 serving = 110 ml · barcode …" |

**Protected engine changes, as approved in §12 and nothing more:**

- `food-library.ts`: `NutrientBasis`; an optional `basis`, `brand` and `barcode`; a `PortionChoice` of `ml`; `valuesForAmount`, `totalAmount`, `servingAmount`, `amountText`; `entryFromLibrary` writes `sourceMl` (never `sourceGrams`) for ml foods, plus `sourceBrand` and `sourceBarcode`.
- `nutrition.ts`: `SourceMeta` reads the new keys defensively; `withSourceEdits` drops `sourceMl` with a changed serving; `foodKey` appends the brand **only when one is present**; Recent and Saved search also match the brand.
- **Unchanged:** generic outputs (every existing test passes unedited, except one type-only tightening in `food-library.test.ts`), totals, goals, validation limits, journal schema, backups and sync.

### 0.5 Verification

| Check | Result |
| --- | --- |
| TypeScript, ESLint, Prettier | ✅ (one ESLint warning in `templates-wp3.test.tsx` predates 7.3E) |
| Logic tests | ✅ **452 / 452**, including 33 new: pipeline 12, catalogue 13, branded nutrition 8 |
| UI tests | ⚠️ **420 / 422**: the 2 failures are **M-1** (Progress, Monday-only: `several weeks of history…`, `Records lists…`); 11 / 11 with a Tuesday clock. New: Add food branded journey 7, search state 3 |
| Food library check | ✅ 3,730 foods, catalog `2d95151e…6d6001` (unchanged) |
| Branded catalogue check | ✅ content digest and file bytes reproduced |
| iOS and Android exports | ✅ (catalogue as a separate asset) |

**New test coverage:**

- **Pipeline:** every rule, nothing invented, units never converted, text normalisation, deduplication, a deterministic digest, ZIP streaming and CRC.
- **Search:** ranking rules, bounded pages, barcode forms, metadata checks.
- **Install:** install, partial, corrupt and outdated copies, a bad asset, low storage, clean-up failure, read-only enforcement, and no network code.
- **Real catalogue (when built):** 13 / 13 acceptance queries.
- **Nutrition:** g and ml calculations, label servings, snapshots, edits, saved and recent foods, brand duplicates, backup and restore, sync payload and `applyRemote`, historical stability, hydration separate.
- **UI:** one-tap add with Undo and the double-tap guard, ml journey with meal and day, reopen and edit, save to my foods, section order, failure and Try again, "No matches" only after an answer, compact screens and large text at 44 pt.

**Bug found and fixed by these tests:** "No matches" could flash while the branded search was still running.

### 0.6 iPhone acceptance (founder, iPhone 17, Expo Go, production code)

- **Feel:** "Smooth"; "This is working so damn well".
- **End-to-end search-to-screen time** (from the settled query to rendered results, `__DEV__` log in the production hook) over 18 keystrokes was **10–46 ms**:

| Query | Matches | Time |
| --- | --- | --- |
| `qu` | 1,000+ | 26 ms |
| `que` | — | 20 ms |
| `ques` | — | 18 ms |
| `quest` | 271 | 25 ms |
| `fa` | 1,000+ | 37 ms |
| `fai` | 491 | 25 ms |
| `fairl` … `fairlife` | 25 | 22–43 ms |
| `fairlife whole m` | 2 | 46 ms |
| `fairlife w…` (other keystrokes) | 2 | 10–28 ms |

- **Logging, Undo, millilitres, reopening, paging:** run by the founder in the acceptance steps.
- **Offline:** ⏳ **pending.** The founder did not run it (step 6: Airplane Mode with Wi-Fi off, search and log). Nothing in the branded path uses the network: there is a static test, and the UI tests run with `fetch` disabled. **It is still not a device-verified pass.**

### 0.7 Remaining risks

- **Release builds are unverified:** IPA and AAB size, installed size, whether the bundle-to-Documents copy is a clone, and native memory (§7, §17.2). These need an EAS project and an Apple developer account (E15).
- **Android has not been run on a device.** The build succeeds; device behaviour is unverified.
- **Offline is pending.**
- **ALL-CAPS product names** are shown as published (E10, display casing, is not approved).
- **The first build on a machine needs the USDA download**, as above.

---
**How the numbers were obtained.**

- The official 2026-04-30 release was downloaded **outside the repository**. Its SHA-256 was checked against the pinned value, and it was profiled and built by streaming scripts kept in the session workspace.
- The catalogue was then measured **on a real iPhone** in Expo Go (§9), and on the desktop where noted.

**Labels used throughout:**

- **iPhone:** measured on the founder's iPhone 17 (§9.1).
- **Desktop:** measured on the development PC (Node 24, SQLite 3.53.4). **Never a substitute for iPhone results.**
- **Export:** measured from `npx expo export`.
- **Estimate:** reasoned, not measured.
- **Unverified:** needs a release (TestFlight or store) build, which this project does not have yet.

---

## 1. Source and licensing findings (verified)

| Item | Finding | Source |
| --- | --- | --- |
| Provider | USDA FoodData Central, **Global Branded Food Products Database** (GBFPD), a public-private partnership: USDA ARS, IAFNS, GS1 US, 1WorldSync (Syndigo), University of Maryland JIFSAN, Euromonitor | GBFPD documentation |
| Licence | **CC0 1.0** (public domain). No permission needed; a citation is *requested*: "U.S. Department of Agriculture, Agricultural Research Service. FoodData Central …" | API guide, "Licensing" |
| Responsibility | "The data providers … are responsible for descriptions, nutrient data, serving size, and ingredient information." USDA standardises them | GBFPD documentation |
| Endorsement | Trade names do not imply USDA endorsement. FORGE must not suggest any | GBFPD disclaimers |
| Nutrient basis | USDA converts the **per-serving label values** to a **100 g or 100 ml basis**, whichever the provider gave. Only %DV is used when no value was given (older records) | GBFPD documentation |
| Missing values | **Missing does not mean zero**; "Not a significant source of …" does not mean zero; label rounding adds variability, especially for small servings | GBFPD documentation |
| Releases | Bulk download documented as twice a year. Actual Branded releases: 2024-04-18, 2024-10-31, 2025-04-24, **2025-12-18**, **2026-04-30**. The cadence is **irregular**, and no October 2026 release is listed as of 2026-10-26. The online database and API update **monthly** | Download page (release list read from the site's own index) |
| API | Free data.gov key. **1,000 requests per hour per IP**; going over blocks the key for an hour. `DEMO_KEY`: 30 per hour, 50 per day. **Keys found published are deactivated**, so a key must never ship in the app | API guide |
| Images | The release has **no product images**. None are proposed | Measured (field inventory) |
| Open Food Facts | **Not part of 7.3E.** ODbL share-alike forbids mixing it into a bundled catalogue (feasibility report §4). It stays a possible 7.3F online barcode fallback, kept in a separate store | Feasibility report |

**Correction to the earlier feasibility report:** it cited "~1.5–2 M records" from secondary sources. The **bulk release holds 455,458 products**, the latest version of each (§2). Older versions exist only through the API and each record's update log.

## 2. Dataset version and size (measured)

| Measure | Value |
| --- | --- |
| Release | `FoodData_Central_branded_food_json_2026-04-30.zip`, published 2026-04-29 22:59 GMT |
| JSON archive | 204,270,542 bytes, SHA-256 `57b0f122…70db2256` |
| CSV archive | 448,767,220 bytes, SHA-256 `26050a5d…19fc49` |
| Extracted JSON | **3,315,545,449 bytes** (3.1 GiB), a single file with one product per line |
| Extracted CSV | 3.09 GB across 10 files (`food_nutrient.csv` 1.50 GB, `branded_food.csv` 954 MB, `food.csv` 376 MB, …) |
| Products | **455,458** (one record shares its line with the closing bracket and needs special handling; it was recovered) |
| Unique FDC IDs | 455,458 (no duplicate IDs) |
| Market | United States 454,349 (446,502 "United States" + 7,847 "US"); New Zealand 1,108 |
| Data source | LI (Label Insight) 426,742 · GDSN 25,120 · Euromonitor 2,487 · NZGDSN 1,108 |
| Categories | 353 |
| Brand owners | 22,959 distinct; `brandName` on 438,801, `subbrandName` on 44,677 |
| Publication year | 2019: 10,718 · 2020: 5,752 · 2021: 201,758 · 2022: 77,392 · 2023: 143,632 · 2024: 3,305 · 2025: 6,448 · 2026: 6,452 |
| Last-modified year | 2013–2016: 217 · 2017–2018: 143,489 · 2019–2021: 155,964 · 2022–2023: 141,008 · 2024–2026: 12,292 · none: 2,487 (exactly the Euromonitor records) |
| Update log | Every record lists its version history (previous FDC IDs and dates). 88,126 products have 6 or more versions |

**Field completeness (measured, all 455,458 records):**

| Field | Present | Note |
| --- | --- | --- |
| Description (name) | 100% | **95% ALL CAPS**; 19,270 repeat a segment ("GRANOLA, CINNAMON, RAISIN, CINNAMON, RAISIN") |
| Brand (brand name or owner) | 99.95% | 7,037 have an empty owner; brand name fills most of them |
| GTIN / UPC | 100% present; **444,622 (97.6%) pass the GS1 check digit** | Failures: 10,709 bad check digits (8,503 of them 11 digits long, apparently missing a digit; not guessable), 93 non-digit, 33 bad length |
| Serving size and unit | 100% present; usable by weight or volume: g 389,645 (incl. `GRM`, `GM`) · ml 59,992 (incl. `MLT`) | 5,820 use mg / IU / mcg (supplements): no edible weight |
| Household serving text | 441,562 | Includes GS1 unit codes ("4 OZA", "4 ONZ"), "None", and malformed text ("1 BAR) \| (") |
| Energy (kcal, nutrient 1008) | 450,022 | 5,435 have no energy value at all |
| Protein / carbs / fat | missing on 4,089 / 6,413 / 4,156 | 9,576 lack at least one |
| Label vs per-100 consistency | All 443,807 checkable records agree within rounding | Confirms the values per 100 g or ml are derived from the label serving |

## 3. Usable product counts (measured under the prototype rules)

These counts come from the prototype rules in §4, applied in order so that each record has exactly one reason. **They are measurements of this release under these rules.** They will change if the founder changes a rule.

| Step | Records |
| --- | --- |
| Products in the release | **455,458** |
| Rejected by quality rules (table below) | −31,488 |
| Passed the rules | 423,970 |
| Older version of the same barcode | −18,198 |
| Exact duplicate without a valid barcode | −781 |
| **Catalogue products** | **404,991** |
| … with a verified barcode (indexed) | 395,351 |
| … searchable but without an indexable barcode | 9,640 |
| … on a per-100 ml basis (drinks, milk, ice cream, …) | 54,033 |

**Exclusions by reason (measured):**

| Reason | Records |
| --- | --- |
| Serving not by weight or volume (mg, IU, mcg) | 5,820 |
| Energy contradicts protein, carbs and fat (< 0.5× or > 2× the Atwater estimate, beyond 20 kcal) | 5,328 |
| Missing protein, carbs or fat (never assumed zero) | 5,310 |
| No energy value | 4,263 |
| Impossible per-100 value (> 902 kcal, or protein + carbs + fat > 105 g) | 3,070 |
| Euromonitor pilot: per-serving values in the per-100 fields (§4.3) | 2,487 |
| Discontinued by the data provider | 1,860 |
| Serving describes the food as prepared (§4.3) | 1,203 |
| Market outside the US (New Zealand) | 1,108 |
| No brand or brand owner | 952 |
| No usable serving size | 65 |
| Implausible serving (> 2 kg or 2 l) | 22 |

**Kept, with a flag (measured):**

- **Energy loosely matches the macros** (0.5–0.8× or 1.2–2×, beyond 20 kcal): 12,459. This is typical of fibre, polyols and label rounding, as in protein bars. Excluding them would be over-aggressive.
- **Alcohol energy:** 79 drinks where alcohol supplies calories the macros don't.
- **Household text repaired:** GS1 unit codes mapped to words for 77,013.
- **Household text unusable:** 4,480 malformed, 803 "None" and 9,491 empty fall back to "1 serving (28 g)".

**Conclusion:** after quality filtering, about **405,000 identifiable, loggable US products** are available. That is well above the original 10,000 target and needs no artificial cap.

## 4. Inclusion and quality rules (recommended)

### 4.1 Classes

| Class | Meaning | Treatment |
| --- | --- | --- |
| **Reliable and loggable** | Passes every rule in §4.2 | In the catalogue |
| **Partially useful** | Name, brand and energy present, but a macro is missing, or the serving is in mg / IU / mcg | **Excluded** from the catalogue (FORGE logs calories *and* macros, and never invents a zero). Counted in the build report by reason. A later "calories only" mode would need a founder decision |
| **Unusable or contradictory** | No name or energy; negative or impossible values; energy contradicting the macros; per-serving data in per-100 fields; serving ambiguous | Excluded, with the reason recorded |

### 4.2 Rules, in order (each record gets the first failing reason)

1. Market is the US (decision E2).
2. Not from the Euromonitor pilot (§4.3).
3. Not discontinued.
4. Has a product name and a brand: brand name, else brand owner.
5. The serving unit is a weight (`g`, `GRM`, `GM`) or a volume (`ml`, `MLT`). Other units are excluded.
6. Serving size greater than 0 and at most 2,000.
7. Energy (kcal), protein, carbohydrate and fat are all present. **Missing is never zero.**
8. No negative values. Per 100 units: at most 902 kcal, and protein + carbs + fat at most 105 g, allowing for rounding.
9. Energy agrees with 4P + 4C + 9F within 20 kcal or between 0.5× and 2×. Alcohol categories are exempt from the upper bound.
10. The household serving does not describe a *prepared* food ("with ½ cup skim milk", "prepared", "as served") when the values may be for the packaged product.
11. **Barcode:** digits only, 8–14 long, valid GS1 mod-10 check digit. A record that fails is kept for search but **not indexed for barcode lookup**. Missing digits are never guessed.

**Normalisation:** this reformats values without changing them.

- **Serving sizes:** float32 noise is rounded to 0.01 ("150.24969482421875 g" becomes "150.25 g"); about 6,300 records are affected.
- **Repeated name segments:** removed (18,422 records). The raw description is kept in the build report.
- **GS1 unit codes in household text:** mapped to words (`ONZ` → oz, `OZA` → fl oz, `GRM` → g, `MLT` → ml, `H87` → piece, `EA` → each).
- **Unusable household text:** dropped, and the label serving ("1 serving (28 g)") is shown instead.
- **Display casing of ALL-CAPS names:** a presentation choice (decision E10). The stored text is unchanged.

### 4.3 Systematic problems found in the data (measured)

- **Euromonitor pilot records (validated in M1):**
  - All 2,487 lack modified dates and nutrient derivation codes (measured: 2,487 of 2,487).
  - Their "per 100" values look like **per-serving values**. Lindt Lindor truffles show 220 kcal/100 g (Label Insight record: 611). Heavy whipping cream shows 50 kcal/100 g (Label Insight: 333). fairlife whole milk shows 150 kcal/100 g at a 240 g serving, which would log 360 kcal for a cup that is labelled 150.
  - **Barcode cross-check (measured):** 2,148 of the 2,487 share a GTIN with a Label Insight or GDSN record.
    - In **1,523** cases their "per 100" value equals the other record's value *for the Euromonitor serving*.
    - In only **40** does it equal the other record's per-100 value.
    - 69 fit both, because the serving is about 100 g.
    - 516 fit neither, typically reformulations.
    - **Where the two explanations can be told apart, 97.4% (1,523 of 1,563) are per-serving values.**
    - All 2,208 label-calorie values equal per-100 × serving, so the derived label values carry the same error.
  - **Policy: exclude the source.** This rests on the cross-check showing a systematic basis error, not on a few examples. No per-record test can validate the 339 records without a matching barcode.
    - The 2,148 matched products **stay in the catalogue** through their other-source records.
    - At most 339 products are lost.
  - **The Atwater check cannot catch this**, because the values are internally consistent.
  - USDA can be told through the FDC contact form (optional).
- **"As prepared" servings:**
  - Blueberry Cheerios (GDSN) pairs the dry cereal's 407 kcal/100 g with a 150 g serving of "3/4 cup with 1/2 cup skim milk", which would compute to 610 kcal.
  - 1,203 such records are excluded because the serving basis is ambiguous.
- **Label rounding:** a small serving magnifies rounding (0.4 g of fat printed as 0 g is still 0 g per 100 g). These are the provider's legal label values, so they are used as published, as with the generic library.

## 5. Deduplication policy

**Measured duplication:**

- 18,547 GTINs appear on more than one record.
- In 13,507 of those groups the values agree; in 5,040 they conflict. Typically a 2020 label sits beside a 2023 relabel ("ORIGINAL WATER CRACKERS" vs "ORIGINAL WITH SEA SALT WATER CRACKERS", or protein changed from 13.3 to 6.67).
- 30,855 brand-and-name pairs appear more than once. These are **mostly distinct package sizes with their own GTINs**, and must not be merged.

**Policy (deterministic):**

1. **Key:** the GTIN-14, the checked barcode left-padded to 14 digits. UPC-A, EAN-13, EAN-8 and GTIN-14 forms of one code then compare equal. The original string is kept in the build report.
2. **Same GTIN:** the record with the latest `publicationDate` wins, then the latest `modifiedDate`, then the highest FDC ID. Older records are **superseded, not deleted from history**: the build report lists every superseded FDC ID with its winner, and whether values conflicted (measured: 4,335 conflicts after the rules).
3. **Without a valid GTIN:** only **exact** duplicates are merged (same brand, name, serving, basis and all four values). Measured: 781.
4. **Never merge by similar name.** Same name with a different GTIN or serving stays separate. The UI may *group* identical-looking rows for display (§13); the data keeps them apart.
5. **FDC IDs are kept as published.** A product gets a new FDC ID when its label changes, and the update log links its versions.
6. **History never changes** (§12.3). A logged entry keeps its own snapshot whatever the catalogue later says.
## 6. Recommended bundled packaging (Expo SDK 58)

**Approach:** ship the SQLite file as a **Metro asset** and copy it once into the app's SQLite folder with `expo-sqlite`'s `importDatabaseFromAssetAsync`. Both are already installed and are already in the app bundle; **no new dependency** is needed.

| Step | Mechanism | Evidence |
| --- | --- | --- |
| Packaging | `require("…/usda-branded-<release>.db")` makes the file a Metro asset. Expo's Metro config already lists `db` as an asset extension, so **`metro.config.js` is unchanged** | Desktop: `getDefaultConfig().resolver.assetExts` includes `db` |
| JavaScript bundle | Holds only a numeric asset reference: **no catalogue bytes, no JSON** | Export: both Hermes bundles stay about 7.9 MB, and neither contains `SQLite format 3` or any product name |
| iOS release | `expo-asset` resolves the asset to a file inside the signed app bundle and returns it **without downloading or hashing** (`AssetModule.swift`: a `file://` URL resolves at once). `expo-sqlite` copies it with `FileManager.copyItem` | Source read; **unverified in a release build** |
| Android release | The asset is a raw resource inside the APK, which SQLite cannot open. `expo-asset` streams it to the cache (`openRawResource`), then `expo-sqlite` copies it into the databases folder. The **cache copy should then be deleted** | Source read; **unverified, no Android device or build tools on this PC** |
| Expo Go (development) | The asset comes from Metro over Wi-Fi and is cached, and `expo-asset` **re-hashes the whole 57 MB cached file (MD5) on every import**. That is why development imports took 125–983 ms | iPhone and source read. Development-only cost |
| Opening | A separate connection by file name, then `PRAGMA query_only = ON`, the schema and `meta` check, then the category list is read once. **Never at app start; only on the first branded search or barcode lookup** | iPhone (§9) |

**Opening the bundled file in place instead of copying:** possible on iOS in principle. SQLite opens a write-protected file read-only, and the catalogue is built in rollback-journal mode, not WAL (header bytes 18–19 are `1`, `1`, measured), so no `-wal`/`-shm` files are needed. It is **not recommended**:

- On iOS, the copy is an APFS clone (§7) that costs no extra space or time.
- Android cannot open a file inside the APK at all.
- One code path for both platforms is simpler.

**Over-the-air updates:** FORGE does not use `expo-updates`. If it is adopted later, an unchanged catalogue keeps its content hash and is never downloaded again. A changed catalogue would be a 57 MB update download, so **catalogue changes ship only in store releases**, which matches the founder's update decision.

**How the 59 MB file reaches builds without bloating Git.** GitHub warns above 50 MB and refuses above 100 MB, and every committed catalogue version would stay in the repository history forever.

- **Recommended (decision E14):** **generate the file at build time** from the pinned USDA release:
  - The pipeline verifies the source SHA-256, builds, and verifies the **output** SHA-256 against a committed manifest.
  - This is possible because the build is **deterministic**. Two independent desktop builds produced byte-identical files: SHA-256 `2ce7840c…6fbef8`.
  - The build host needs a one-time 204 MB download from USDA, cached locally afterwards.
  - The Node version must be pinned, because the bytes depend on the SQLite version (3.53.4, recorded in `meta`).
- **Alternative:** commit the built file with **Git LFS**. This is simpler for builds, but needs LFS storage and bandwidth quota.

## 7. Application size and storage impact

| Measure | Expected (before M1) | Measured | Status |
| --- | --- | --- | --- |
| Catalogue file | ~57 MB (desktop prototype) | **59,207,680 bytes (56.5 MiB)**, schema 2 | Export (the asset in `dist/assets`) and iPhone (installed size) |
| JavaScript bundle growth | 0 | **0 catalogue bytes**; about 30 KB of prototype screen code | Export |
| Compressed size of the asset (what an IPA, APK or AAB zip holds) | ~23 MB | **24.6 MiB** (zip deflate, desktop) | Desktop measurement of the file. **The store download size is unverified**; App Store and Play processing differ |
| iPhone storage: app bundle | +56.5 MiB | — | **Unverified** (needs a release build). An iOS bundle stores assets uncompressed |
| iPhone storage: installed copy | +56.5 MiB if copied byte for byte | **+0 MB.** Import, re-import and delete changed free space by 56.6 MB once (the first file on the phone), then by **0.0 MB**. The copy took **0.8–2.7 ms**. **Removing the copy reclaimed 0 MB**, because its blocks were shared | iPhone (Expo Go): APFS clone between the asset cache and the SQLite folder. **Same behaviour expected from bundle to Documents in a release build (same APFS volume); unverified** |
| **iPhone total (estimate)** | — | **About 57 MB** (bundle plus a cloned copy). Worst case if not cloned: about 113 MB | Estimate from the above |
| Android total (estimate) | — | APK +~25 MB compressed; installed copy 56.5 MiB; transient cache copy 56.5 MiB, deleted after import. **About 82 MB** | Estimate. **Unverified (no Android test)** |

**The 57 MB desktop file does not translate into a 57 MB larger download.** The store download grows by about the compressed size (about 25 MB, estimate). The installed size grows by about 57 MB on iPhone, thanks to the APFS clone, and about 82 MB on Android.

## 8. Catalogue as built (schema 2)

| Item | Value |
| --- | --- |
| Source | USDA FDC Branded Foods **2026-04-30**, JSON, SHA-256 `57b0f122…70db2256` (re-verified) |
| Records | 455,458 → passed rules 423,970 → **404,991 products**, **395,351 barcodes**, 9,640 without an indexable barcode, 54,033 per 100 ml |
| Deduplication | 18,979 superseded records listed with their winners (18,198 by barcode, 781 exact duplicates without one) |
| Brands | 35,999 distinct brand names (dictionary table) |
| Output | `usda-branded-2026-04-30.db`, **59,207,680 bytes**, SHA-256 **`2ce7840cba5b42df39d22f1bf590ca22d8342885b0570e1eae8c5819386fbef8`**, `integrity_check` ok, rollback journal (not WAL) |
| Determinism | Two clean builds: **identical SHA-256** (desktop) |
| Build | ~20 s per build, streaming (desktop) |
| Report | `report.json`: release, raw and accepted counts, exclusions by reason, flags, deduplication summary, barcode counts, checksum, size, objects. Plus `superseded.ndjson` (each superseded FDC ID, its winner and whether values conflicted). Kept in the session workspace, outside Git |

```sql
meta(key, value)                                    -- schema 2, release, source and SHA-256, counts, sqlite version
category(id, name, key)                             -- 353 rows
brand(id, name, key) + index on key                 -- 35,999 rows; key = normalised brand
product(id INTEGER PRIMARY KEY,                     -- id = static order (§10)
        fdc_id, name, brand → brand.id, category → category.id,
        basis 0|1 (per 100 g | per 100 ml), serving ×1000, household,
        kcal, protein, carbs, fat ×1000 (per 100 g or ml), published)
barcode(gtin INTEGER PRIMARY KEY, product)          -- GTIN-14 → product
VIEW product_text(id, name, brand)                  -- FTS content
product_fts USING fts5(name, brand, content='product_text', detail=column,
                       tokenize="unicode61 remove_diacritics 2")
```

**Space breakdown:**

| Object | Size |
| --- | --- |
| Products | 35.4 MB |
| Full-text index | 9.3 MB |
| Barcodes | 5.6 MB |
| FTS document sizes | 4.3 MB |
| Brands and their index | 1.9 MB |

The brand dictionary saved 19 MB against storing a brand name and key on every product (78.5 MB → 59.2 MB, desktop).

## 9. M1 iPhone results

### 9.1 Device, conditions and method

**Device:**

- **iPhone 17**: model confirmed by the founder, matching the measured 402 × 874 pt screen at 3×.
- iOS 26.6.2.
- **4.1 GB free** of 243.5 GB.

**Runtime:** Expo Go (`storeClient`), Hermes, React Native 0.88, `expo-sqlite` with **SQLite 3.53.3, FTS5 enabled**.

**Delivery:** the catalogue asset came from Metro over the home network (6 GHz Wi-Fi to the PC). Each result was posted to a receiver on the PC as it finished.

**Runs:**

- Two complete "Run all" passes.
- A second round: reload, install, open, then a full Expo Go quit and relaunch followed by **cold open**, then remove and reinstall.
- The founder's hands-on live typing and scrolling: "smooth, no noticeable lag; the highest input lag was maybe 50 ms".

**Timing:** `performance.now()` around each awaited `expo-sqlite` **async** call, which runs off the JavaScript thread as production would. Bridge time is included.

- "Cold" = the first execution after opening.
- "Warm" = the median of 5 repeats.

**What Expo Go cannot show:**

- The release-build bundle path and copy behaviour (§6, §7).
- Store download size.
- Native memory: there is no API in Expo Go. JavaScript heap figures come from Hermes.
- Storage-cold reads. iOS keeps file pages cached across an app relaunch, so the "cold open" is a cold *process*; a device restart was not tested.

### 9.2 Results against the performance budgets

| Measure | Budget | iPhone 17 result | Verdict |
| --- | --- | --- | --- |
| App start | +0 ms | **Nothing runs at launch.** The catalogue is touched only on first branded use. A presence check (file exists plus size) costs 1.6–3.3 ms | ✅ by construction |
| Install (copy asset into place) | — | **0.8–2.7 ms** copy (APFS clone), 0 MB extra. Development-only import overhead 125–983 ms (Metro transfer, `expo-asset` MD5) | ✅ (release copy unverified) |
| Open (first after install) | ≤ 50 ms | **4.1–22.1 ms** open, plus 2.2–4.9 ms schema and `meta` check | ✅ |
| Open, cold process (after quitting Expo Go) | ≤ 50 ms | **2.8 ms** open, 4.7 ms check, **first search 4.3 ms** | ✅ |
| Reopen | — | 0.8–1.5 ms | ✅ |
| Full integrity check (`quick_check`, reads all 57 MB) | Not at startup | **467 / 483 ms** | Run once after (re)install, in the background (§11) |
| Search page, brand queries | ≤ 100 ms (95th percentile) | Quest, Fairlife, Oikos, Cheerios, Premier Protein: **warm 0.4–1.3 ms**, cold 0.5–1.5 ms | ✅ |
| Search page, broad queries | ≤ 100 ms (95th percentile) | Chicken 9.5 · Greek yogurt 3.0 · Protein bar 4.0 · Peanut butter 7.8 · Chicken breast 3.3 · Great Value 2.9 ms warm. Cold within 0.5 ms of warm | ✅ |
| Search page, short prefixes (worst case) | ≤ 100 ms | `ch` **52 ms** · `gr` 21 ms · `pro` 9 ms | ✅ |
| Query planning (brand and category lookup) | — | 8.1–9.1 ms per query in run 1, re-reading 353 categories each time. **Fixed:** categories are read once per open; the cold-process first search, plan included, then took **4.3 ms** | ✅ |
| Second page | — | 0.2–44 ms (`ch` is the worst) | ✅ |
| Typing (every keystroke from 2 characters, plan plus search) | No dropped input | **Median 6.4 ms, 95th percentile 49 ms, maximum 53 ms** over 38 keystrokes (premier protein, chicken breast, greek yogurt) | ✅ |
| Barcode lookup | ≤ 20 ms (95th percentile) | **Median 0.12 ms, 95th percentile 0.14 ms** (387 real codes, as 12-digit UPC-A). First lookup 7.8–8.5 ms. **388 of 388 found** | ✅ |
| Unknown barcode | — | Median 0.15 ms; **0 false hits** in 200 | ✅ |
| Invalid barcode | Refused before lookup | **4 of 4 refused** (bad check digit, too short, letters) | ✅ |
| JavaScript memory while paging | ≤ 5 MB | 10 pages (300 rows held): allocations **+1–2 MB**, Hermes heap unchanged at 40 MB (and at 92 MB in run 2). SQLite page cache bounded by `cache_size = -2000` (about 2 MB per connection). **Native memory not measurable in Expo Go** | ✅ (JavaScript); native unverified |
| Responsiveness during repeated searches | No JavaScript stalls | **48 searches back-to-back** (9 ms each): JavaScript frame gaps median 16.67 ms, **maximum 16.8 ms, none over 50 ms** | ✅ |
| Live typing and scrolling (hands-on) | Smooth | "Smooth"; "0 lag"; "highest input lag maybe 50 ms" | ✅ |
| Offline lookup | Works in Airplane Mode | **PENDING.** Not run: the founder was unavailable to switch the network off. Nothing in the path uses the network (local file, local SQLite). The test is in the benchmark (step 12) | ⏳ **pending, not passed** |
| Failure handling | Refused safely | A missing file was detected before opening. An empty database was refused (`no such table: meta`). A corrupt file was refused (`file is not a database`). A write was refused (`attempt to write a readonly database`) | ✅ |
| Remove and reinstall | Clean | Delete **3.7 ms**, file gone, reclaimed 0 MB (clone); reinstall 109 ms (development MD5 included); reopened, same release | ✅ |

**Run-to-run consistency:** the two complete runs agree to within about 5% on every search and barcode figure.

**Desktop vs iPhone (for context only):** the iPhone 17 was *faster* than the desktop for most queries (desktop `ch` 66 ms, `chicken` 22 ms). That confirms desktop figures must not stand in for device results in either direction.

**Copy-test note:** the separate "copy behaviour" step failed in the prototype code (the copy's destination file was not where expected). Install, re-import and removal already measured the same behaviour, so it was not repeated.

## 10. Search ranking improvements

**Problems found in the research prototype:**

- "quest" ranked SEA QUEST EGG HUNT above Quest bars.
- "kind bar" ranked KINDER first.
- "chicken" ranked CHICKEN OF THE SEA tuna first.
- "peanut butter" ranked the brand BETTER'N PEANUT BUTTER's "Banana" first.

**Rules now** (pure functions in [catalogQuery.ts](../../src/m1/catalogQuery.ts); the same code runs on the iPhone and in the tests):

1. **Named brand:** the query, or its leading words, equals a brand's normalised key. "kind bar" names KIND, not KINDER; "premier protein" names PREMIER PROTEIN. Its products lead.
2. **Brand family:** when a brand is named exactly, its longer variants (QUEST → QUEST BAR, QUEST NUTRITION) follow.
3. **A word still being typed** (one word, 4+ letters, not itself the brand's first word) names the brands it starts: "fairl" names FAIRLIFE, but "chicken" never names CHICKEN OF THE SEA.
4. **Fewer than 1,000 matches:** products whose **own name** has every word come next, then bm25 relevance (name 4×, brand 1×), helped by a **category** the query names ("peanut butter" → Nut & Seed Butters), then the static order.
5. **1,000 or more matches** (bounded, no per-row scoring):
   - with a named brand, its products come first, then the named category, then the static order;
   - otherwise, only products whose **name** has every word (an FTS name-column filter), by category and then static order.
6. **Static order** (row ID, fixed at build time): a usable household serving first, then fewer words in the name, then the newest label, then the FDC ID.
7. **Branded search starts at 2 characters.** Each word becomes a quoted FTS prefix term, so FTS syntax typed by the user is inert.

**Acceptance set: 13 of 13 pass, on the desktop and on the iPhone in both runs** ("every one of the top N must satisfy the rule"):

| Query | Rule (top N) | Result on the iPhone |
| --- | --- | --- |
| quest | Quest brand (top 5) | ✅ QUEST, PROTEIN CHIPS… (Sea Quest no longer leads; "sea quest" still finds it) |
| fairlife | fairlife (5) | ✅ FAIRLIFE WHOLE ULTRA-FILTERED MILK |
| oikos | Oikos (5) | ✅ OIKOS, YOGURT, STRAWBERRY |
| premier protein | Premier Protein (5) | ✅ PREMIER PROTEIN HIGH PROTEIN BAR |
| cheerios | Cheerios (5) | ✅ Cheerios Cereal |
| kind bar | KIND, not KINDER (3) | ✅ KIND FRUIT & NUT BAR |
| chobani | Chobani (5) | ✅ |
| rxbar | RXBAR (3) | ✅ |
| greek yogurt | a Greek yogurt, not dressing, dip or snack (5) | ✅ OLYMPIANA / CHOBANI GREEK YOGURT |
| protein bar | a bar (5) | ✅ GOOD! SNACKS PROTEIN BARS |
| peanut butter | peanut butter itself (5) | ✅ TEDDIE PEANUT BUTTER |
| chicken | a chicken product (5) | ✅ WEGMANS CHICKEN |
| chicken breast | chicken breast (5) | ✅ GIANT EAGLE CHICKEN BREAST |

**Known ranking limits:**

- Broad queries are ordered by a static rule rather than popularity; the data has no popularity information.
- Private-label duplicates (the same product from several store brands) appear together.
- Identical rows may be grouped for display in integration (§13).

## 11. Failure and recovery handling

| Situation | Behaviour (prototype-verified where marked) |
| --- | --- |
| Catalogue file missing (not yet installed, or deleted by the user or OS) | A presence check before opening (✅ iPhone), because SQLite would otherwise *create* an empty file. Then reinstall from the bundled asset (✅ iPhone: 109 ms) |
| Empty, wrong-schema or wrong-release file | Refused by the `meta` check: schema must equal the build's `SCHEMA` and release must equal the bundled release (✅ iPhone, empty file). The file is then reinstalled from the asset |
| Corrupt file | Refused on first read: "file is not a database" (✅ iPhone). Delete and reinstall from the asset. After any (re)install, `PRAGMA quick_check` runs **once, in the background** (467–483 ms on the iPhone 17), and the install is used only when it passes |
| Accidental write | Refused: the connection is `query_only` (✅ iPhone) |
| Not enough storage to install | Check `Paths.availableDiskSpace` against the asset size plus a margin before importing. Otherwise branded search reports "Not enough storage for branded foods", and **generic foods keep working** |
| Any catalogue failure | Branded results are hidden with a short notice and a **Try again** action, as the generic library's error already does. Recent, Saved and the 3,730 generic foods are unaffected. Logged entries never depend on the catalogue (snapshots) |
| Initialisation interrupted (app killed while copying) | The import copies to the final name. On the next use, the presence, `meta` and `quick_check` checks detect a partial file and reinstall. A partial copy is never trusted |
| App update with a newer catalogue | The new asset has a new versioned file name. On first branded use: install the new file, verify, switch, then delete the old file. **If the new one fails verification, the old one stays in use** (rollback) |

## 12. Protected nutrition-engine changes (proposed, not implemented)

The founder approved the direction (g and ml bases, brand, barcode, provenance). **The exact changes below need approval before integration.** Every one is **additive**, and existing records, calculations and behaviour are unchanged.

### 12.1 `src/domain/food-library.ts`

```ts
export type NutrientBasis = "g" | "ml";

export type LibraryPortion = { label: string; grams: number };          // unchanged (generic library)

export type LibraryFood = {                                             // existing fields unchanged
  // …id, name, description, family, kcal, protein, carbs, fat, portions, rank
  /** Absent for the generic library: grams. */
  basis?: NutrientBasis;
  /** Branded only, when the source has them. */
  brand?: string;
  barcode?: string;                                                    // GTIN-14
  /** Label serving: "1 bar" with its amount in the food's basis. */
  labelServing?: { label: string; amount: number };
};

export type PortionChoice =
  | { kind: "grams"; grams: number }                                   // unchanged; basis g only
  | { kind: "millilitres"; ml: number }                                // new; basis ml only
  | { kind: "portion"; index: number; count: number };                 // unchanged; generic portions
  // the label serving of a branded food is offered as portion index 0

export const MIN_ML = 0.1, MAX_ML = 5000;                              // as grams

/** Values for an amount in the food's own basis (g or ml). Never converts between them. */
export function valuesForAmount(food: LibraryFood, amount: number): Values;
// valuesForGrams stays exactly as is (it is valuesForAmount for g foods).

servingOf(food, choice)   // + returns unit: "g" | "ml"; `grams` stays set for g foods
choiceError(food, choice) // + refuses "grams" for ml foods and "millilitres" for g foods
entryFromLibrary(food, choice, catalog, meal)
  // g foods: unchanged output.
  // ml foods: sourceMl instead of sourceGrams.
  // branded:  + sourceBarcode, sourceBrand when present.
SOURCE_KEYS = [...existing, "sourceMl", "sourceBarcode", "sourceBrand"]
sourceLabel("usda-branded:2758974") → "USDA Branded Foods · FDC 2758974"
```

### 12.2 `src/domain/nutrition.ts`

- `SourceMeta`: add `sourceMl?: number`, `sourceBarcode?: string` (14 digits) and `sourceBrand?: string`. `sourceMeta()` reads them defensively, as today.
- `withSourceEdits`: a changed serving drops `sourceMl` as well as `sourceGrams`.
- `foodKey`: **unchanged for every existing record.** When `sourceBrand` is present, the brand is appended, so two brands' identically named and valued products are not "duplicates".
- **No change** to `macrosOf`, `totalsOf`, `entryCalories`, `nutritionTotals`, meals, or validation limits. An entry still stores per-serving values × quantity.

### 12.3 Journal records (no migration)

| Key | Example | Notes |
| --- | --- | --- |
| `sourceId` | `"usda-branded:2758974"` | Existing key, new namespace |
| `sourceCatalog` | `"usda-branded-2026-04-30"` | Existing key |
| `sourceGrams` / **`sourceMl`** | `60` / `240` | Exactly one, matching the basis |
| **`sourceBarcode`** | `"00036000291452"` | String, so leading zeros are kept |
| **`sourceBrand`** | `"QUEST"` | |

- Journal `data` already accepts string, number and boolean values, so **existing builds, backups, restore and cloud sync carry these keys unchanged**.
- Older builds ignore the keys they don't know and still show the correct values.

### 12.4 Regression coverage required before integration

1. Every existing `food-library`, `nutrition`, `nutrition-tab`, `nutrition-dashboard`, `hydration` and `food-discovery` test passes **unchanged**.
2. Generic foods: values, portions and the snapshot are byte-identical to today's output, with no `basis`, `sourceMl`, `sourceBarcode` or `sourceBrand`.
3. g branded food: grams and label-serving amounts are accurate (per 100 g × amount, no rounding drift); the snapshot has `sourceGrams`.
4. ml branded food: millilitres and label-serving amounts are accurate; `sourceMl` is set, **never** `sourceGrams`; choosing grams is refused.
5. Totals: logging branded g and ml foods changes calories and macros exactly by their snapshots; hydration is unaffected.
6. Historical stability: after replacing or deleting the catalogue, every logged branded entry still shows and totals the same values.
7. Edit, copy, move and delete work for branded entries; editing values marks them "based on"; changing the serving drops `sourceGrams` or `sourceMl`.
8. Saved foods: saving a branded food, duplicate detection with brands, and logging from Saved.
9. Backup and restore round trip, and sync payload, with the new keys; an older-schema reader ignores them.
10. Undo and double-tap protection for branded adds.

## 13. Integration plan (after approval)

**Search order:** Recent → Saved → Common foods (generic, top 5 with "Show all") → **Branded** (paged 30, "1,000+ — keep typing" for broad queries).

- Branded results never interleave with the user's own foods.
- **Rows:** the 7.3D `FoodResult` model already has `brand`, `barcode` and `provenance` slots. A row shows the brand line, "1 bar (60 g) · 210 kcal", and a "USDA Branded" pill.
- **Selected food:** the existing serving step. It offers the label serving and grams for g foods, or the label serving and millilitres for ml foods; the values card says "For 240 ml". Logging uses the existing guard, Undo, meal and day.
- **Barcode readiness (for 7.3F):**
  - `gtin14()` handles UPC-A, EAN-13, EAN-8 and GTIN-14, and UPC-E only when the scanner reports UPC-E.
  - `byBarcode()` is exact and indexed: 0.12 ms on the iPhone.
  - The barcode index has one product per GTIN, with the newest label winning at build time.
  - Hand-off is the same selected-food step.
  - **No scan control** until 7.3F.

## 14. Catalogue updates and versioning

- The catalogue is **versioned by release**: `usda-branded-<release>.db`, with `meta.release`, `meta.schema` and `meta.sourceSha256`, plus the output SHA-256 in the committed build manifest.
- **Update path:** a newer USDA release → rebuild with the same rules → review the diff report → ship it in an app release → on first use the app installs the new file, verifies it, switches, and deletes the old one (§11). **Logged entries are never rewritten.**
- A schema change (new columns or indexes) bumps `SCHEMA`. An app reads only the schema it was built for, and the bundled file always matches its own app version.
- No remote update service is built. Downloadable updates may be considered separately later.

## 15. M1 prototype inventory (removed in M2)

| Path | What | Fate |
| --- | --- | --- |
| `src/m1/catalogQuery.ts` | Query planning, ranking, barcodes, schema check | Basis for the production query module (M3) |
| `src/m1/CatalogBench.tsx`, `src/m1/sample-gtins.ts`, `app/m1-catalog.tsx` | Benchmark screen and route | Remove before integration |
| `src/screens/You.tsx` | One `__DEV__`-only row ("M1 catalogue benchmark") | Remove before integration |
| `tests/m1-branded-catalog.test.ts` | 10 tests (fixture catalogue, plus the real catalogue when present): **10 of 10 pass** | Becomes production tests (M3) |
| `assets/m1/usda-branded-2026-04-30.db` | The 59 MB catalogue (`.git/info/exclude`) | Never committed; replaced by the build-time file (E14) |

## 16. Implementation milestones

| # | Milestone | Content | Gate |
| --- | --- | --- | --- |
| M1 | Device benchmark | §9 | ✅ except **offline (pending)** |
| M2 | Production pipeline (**done**, §0) | `scripts/branded-catalog/`: pinned source, streaming rules, deduplication, build, report, output-checksum manifest, determinism check; fixture tests; Git ignore rules; `npm run branded:build` | Report reviewed |
| M3 | Catalogue access (**done**, §0) | `src/data/branded-catalog.ts` (lazy install and open, checks, recovery, version switch, Android cache clean-up) and the query module from `src/m1/catalogQuery.ts`; tests | Tests green |
| M4 | Protected engine (§12) (**done**, §0) | g and ml basis, snapshot keys, regression set §12.4 | **Founder approval** |
| M5 | UI integration (**done**, §0; Data sources screen not built) | Branded section, rows, serving step for g and ml, Data sources screen with the USDA citation | UI tests; full verification suite |
| M6 | Release-build verification | First TestFlight or development build: IPA size, installed size, bundle-to-Documents clone, cold storage after a device restart, native memory (Instruments); Android build if available | **Needs the founder's EAS and Apple developer setup (E15)** |
| M7 | QA and founder iPhone review | Full suite, both exports, offline test | **Founder approval** |

## 17. Decisions, risks and limitations

### 17.1 Decisions

| # | Decision | Status / recommendation |
| --- | --- | --- |
| E1 | Source: USDA Branded Foods (CC0) | **Approved** |
| E2 | Quality rules | **Provisionally approved.** Euromonitor exclusion now **validated** (§4.3); confirm |
| E4 | Distribution | **Superseded: bundled-first** (founder) |
| E6 | Hosting | **Cancelled** (founder) |
| E8 | Protected engine change | Approved in direction. **Exact changes in §12 need approval** |
| E9 | Search priority | **Approved**; ranking acceptance 13 of 13 (§10) |
| E10 | Display casing of ALL-CAPS names | Proposal: title case for display, stored text unchanged |
| E12 | Category exclusions (infant formula, supplements, alcohol) | Proposal: keep everything that passes the rules |
| E14 | **How the catalogue file reaches builds** | **Recommend build-time generation with a checksum** (deterministic, proven) · or Git LFS |
| E15 | **Release-build verification** (M6) | Needs an EAS project and Apple developer account. **Not provisioned**; founder decision |
| E16 | Offline test | **Pending:** run benchmark step 12 in Airplane Mode with Wi-Fi off |

### 17.2 Risks and limitations

- **Release-only behaviour is unverified:** the iOS bundle copy being a clone, IPA and AAB download size, installed size, native memory, and storage-cold reads after a reboot. Expo Go faithfully measured the SQLite engine, file, flash storage, CPU and JavaScript behaviour, but **not** release packaging.
- **Android is entirely unmeasured:** no device or build tools on this PC. The estimates in §7 come from source code.
- **Offline is pending.** The design has no network dependency, but it is not yet tested.
- **One device:** a high-end iPhone 17. Older iPhones are slower; the worst case (`ch`, 52 ms) leaves about 2× headroom against the 100 ms budget. A minimum of 3 characters is a lever if needed.
- **Low free storage:** the test phone had 4.1 GB free. The catalogue adds about 57 MB installed (estimate), so the storage check in §11 is required.
- **Data quality:**
  - The data comes from label submissions and may contain errors the rules don't catch.
  - Rule exclusions are explainable and reported, but not perfect.
  - Popularity is unknown, so broad results use a static order.
- **Freshness:** the catalogue is only as current as the last app release, and USDA's release cadence is irregular.

## 18. Sources

- USDA FoodData Central downloads: <https://fdc.nal.usda.gov/download-datasets/> (release list from the site's own index, 2026-10-26)
- API guide (rate limits, key responsibility, CC0 and citation): <https://fdc.nal.usda.gov/api-guide/>
- GBFPD documentation (partners, Euromonitor pilot, 100-unit basis, missing values, rounding, update log): <https://fdc.nal.usda.gov/GBFPD_Documentation/>
- Data type comparison: <https://fdc.nal.usda.gov/data-documentation/>
- `expo-sqlite` 58 source: build flags (FTS5 by default) in `ios/ExpoSQLite.podspec` and `android/build.gradle`; `importAssetDatabase` (`FileManager.copyItem`) in `ios/SQLiteModule.swift`; asset copy in `android/…/SQLiteModule.kt`
- `expo-asset` 58 source: `ios/AssetModule.swift` (file URLs resolve without download; cached files are MD5-checked), `android/…/AssetModule.kt` and `ResourceAsset.kt` (raw resources copied to the cache), `src/Asset.ts` (release builds resolve embedded assets)
- GS1 check digit: <https://www.gs1.org/services/check-digit-calculator>
- Earlier hosting research (Cloudflare R2, Supabase, GitHub Releases) is superseded by the founder's bundled-first decision and is no longer a recommendation.
