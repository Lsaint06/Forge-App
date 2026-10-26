# Project REFORGE — Phase 7.3F.1: Smart Serving System (catalogue-wide audit)

**Status:** the audit (§1–11) was research only. **S1–S3 are now implemented (§0)**, for founder review; not committed.

- **Baseline:** `e41bd41` (Phase 7.3E) on `feat/forge-paths-foundation`, identical to the remote.
- **Phase 7.3F (barcode scanner) is still uncommitted** in the working tree. It was preserved untouched and is not mixed with this work. This report is the only new file.

**Method:**

- The pinned USDA Branded Foods release (2026-04-30, SHA-256 verified) was streamed through the **production** rules ([rules.ts](../../scripts/branded-catalog/rules.ts)).
- Every one of the **404,982** products in the built catalogue was classified.
- The research scripts and raw output (`servings.json`) are kept in the session workspace, not in Git.
- All counts are **measured** unless marked otherwise.

---

## 0. Implementation results (S1–S3, founder-authorised)

**Status:** S1, S2 and S3 implemented and verified automatically; **not committed**. S4–S6 were not implemented.

- **Baseline:** Phase 7.3F committed and pushed separately (`4b0e354`).
- **Shared rules:** [src/domain/servings.ts](../../src/domain/servings.ts) decides every product's servings at build time. The app and the tests use the same rules.

### 0.1 What changed

| Area | Change |
| --- | --- |
| **Rules** ([servings.ts](../../src/domain/servings.ts)) | `readHousehold()` classifies the text: named, measure, about, metric, conflict, generic, empty or long. `planServing()` applies the ladder: label → measure → about → same product → package → "1 serving", plus a whole package when it is 1.1–4.5 servings. `packageAmount()` reads package sizes and refuses multipacks and inconsistent amounts. Grams and millilitres are never converted |
| **Pipeline** ([rules.ts](../../scripts/branded-catalog/rules.ts), [catalog-db.ts](../../scripts/branded-catalog/catalog-db.ts), [build.ts](../../scripts/branded-catalog/build.ts)) | Accepted records keep the published household and package texts. `planServings()` adds same-product names (exact brand, name, serving and basis; the most frequent name wins, deterministically). **Schema 4**: a `serving_label` dictionary, and `product.serving_label`, `serving_source` and `package` (× 1000). Serving counts go to the manifest and [BUILD_REPORT.md](../branded-catalog/BUILD_REPORT.md) |
| **App data** ([branded-query.ts](../../src/data/branded-query.ts), [branded.ts](../../src/domain/branded.ts)) | Queries read the serving columns. `brandedFood()` gives portion 1 = one manufacturer serving under its name, and portion 2 = the whole package when offered. `servingNote()` explains the name's source. `LibraryFood.servingInfo` is optional and display-only |
| **Protected engine** | **No calculation changed.** `servingOf`, `choiceError`, `valuesForAmount` and `entryFromLibrary` already handled several portions in g or ml. The only addition is the optional `servingInfo` type field |
| **Selector** ([QuickAddSheet.tsx](../../src/components/nutrition/QuickAddSheet.tsx)) | **Branded foods only** (generic foods are unchanged). The serving leads, then the whole package, then Grams or Millilitres. Quick amounts **½ · 1 · 1½ · 2**. The stepper says "Servings" (or "Packages"). "1 serving = 1 stick (32 g)" or "Whole package = 591 ml · about 2.46 servings", with the source note. Heading: "For 1½ × 1 stick · 48 g". One implementation for search and scan |

### 0.2 Rebuilt catalogue (measured)

| Measure | Value |
| --- | --- |
| Products, barcodes | **404,982**, **395,354** (unchanged) |
| File | **64,737,280 bytes** (+2.68 MB, +4.3% over schema 3); still one separate asset, read-only |
| Content digest | `5c8a5788…b7d040762835c862c817fa727`. `branded:check` reproduced it **byte-identically** |
| Distinct serving names | 9,855 |

| Serving name from | Products | Share | Audit projection |
| --- | ---: | ---: | ---: |
| Label: named unit ("1 Stick", "2 cookies") | 149,296 | 36.9% | 153,369 |
| Label: household measure ("2 Tbsp") | 142,357 | 35.2% | 142,222 |
| Recovered "about N units" | 3,024 | 0.7% | 3,019 |
| Same product's other listing | 1,662 | 0.4% | 1,734 |
| Single-serve package ("1 package") | 11,900 | 2.9% | 11,939 |
| **Named in total** | **308,239** | **76.1%** | 77.1% |
| "1 serving (X g/ml)" | 96,743 | 23.9% | 22.9% |
| Whole-package option (extra) | 79,396 | 19.6% | 80,064 |

**Why "named" is 1.0 point below the projection:** the implementation is stricter than the audit's classifier. A count followed by a weight, such as "1 oz (28g/about 20 chips)" or "2 oz dry (56g)", or by "servings" ("about 2.5 servings per bag") is **not** treated as a unit name. Those products read "1 serving".

**Products whose serving name changed for the better: about 103,100.**

| Before | Count | Now |
| --- | ---: | --- |
| Weight-only text ("1.15 oz") | 95,306 | "1 serving", "1 package" or the same product's name |
| Conflicting text ("1.05 oz" on a 60 g serving) | 925 | "1 serving" |
| "AMOUNT PER SERVING"-style text | 2,386 | "1 serving" |
| Over-long text | 212 | "1 serving" |
| Previously "1 serving" | 3,024 | "about N units" recovered |
| Empty text | 1,246 | Same-product or package name |

**Named-unit names were also tidied:** "1 STICK (32g/1.15oz)" now reads "1 stick", with the amount shown once from the serving size.

### 0.3 Reference products (real catalogue, tested)

| Barcode | Product | Serving |
| --- | --- | --- |
| 856584004183 | Chomps Mild Original Beef Stick | **1 package (32 g)**: the household text "1.15 oz"; the package "1.15 OZ/32 G" is one serving |
| 856584004763 and the other "Original Beef Sticks" listings | Chomps | **1 Stick (32 g)**: printed on the label, or taken from the same product's other listing |
| 049000006346 | Coca-Cola Can, 12 fl oz | **1 Can (355 ml)** |
| 049000000443 | Coca-Cola Bottle, 20 fl oz | **1 Bottle (591 ml)** |
| 049000050103 | Coca-Cola Bottle, 2 L | **1 serving (355 ml)**: the text "12 fl oz (360 mL)" is a restated volume. No whole package, because 2 L is 5.6 servings, above 4.5 |
| 888849000708 | Quest bar | **1 Bar (60 g)**; ½ bar = 30 g |

### 0.4 Accuracy safeguards

- Every option is an explicit amount in the product's own unit: the metric serving, or the parsed package size.
- Nutrients are always per-100 × amount, using the unchanged USDA values.
- A stated amount that contradicts the serving (925 products) rejects the name.
- Multipacks, packages with inconsistent amounts, and packages of more than 4.5 servings get no whole-package option.
- Same-product names require an exact match on brand, name, serving and basis.
- No name is guessed from a product name.
- **Logged entries are snapshots and are never rewritten.** A test logs an entry under the old "1.15 oz (32 g)" wording, then a new one under "1 package (32 g)", and checks both stay exactly as logged.
- An installed schema-3 copy on a phone fails the schema check and is replaced from the bundled asset once (7.3E recovery, tested).
- Quality exclusions are unchanged (404,982 products). S6 (re-admitting excluded records) was not implemented.

### 0.5 Performance (desktop, isolated)

| Query | Search page |
| --- | --- |
| quest | 0.8 ms |
| fairlife | 0.3 ms |
| greek yogurt | 5.4 ms |
| peanut butter | 14 ms |
| chicken | 20 ms |
| "ch" | 64 ms |

- **Same as schema 3.** The serving name is read through its primary key for the 30 rows of a page only.
- **JavaScript bundles:** +13–14 KB over 7.3F (iOS 7,962,894 bytes; Android 7,951,997 bytes).
- **App start:** unchanged; the catalogue still opens on first use.
- **On the iPhone:** unmeasured; to be checked in the acceptance test.

### 0.6 Verification

| Check | Result |
| --- | --- |
| TypeScript, ESLint, Prettier | ✅ (the one ESLint warning in `templates-wp3.test.tsx` predates 7.3E) |
| Logic tests | ✅ **468 / 468** (new `servings.test.ts`: 10, including the real catalogue; `branded-food.test.ts` +1) |
| UI tests | ⚠️ **432 / 434**: the 2 failures are **M-1** (Progress, Monday-only), unchanged. New: weight-only product at ½ / 1 / 1½ / 2 with exact values; serving vs whole package; history preserved; scan and search giving identical entries |
| Food library check | ✅ 3,730 foods, unchanged |
| Branded catalogue check | ✅ reproduced byte-identically |
| iOS and Android exports | ✅; the catalogue is a separate 64.7 MB asset |

### 0.7 Limitations

- 23.9% of products read "1 serving (X g)", because their source names no unit. S4 (personal serving labels) is deferred.
- Serving names keep the label's wording and casing ("1 Stick", "0.166 cake"); only all-capital text is put in lower case.
- "1 package" is used, never a guessed noun ("stick", "can") from a product name.
- On a device, only the earlier Coca-Cola scan is verified. The serving selector awaits the founder's iPhone test.

---

## 1. Summary

1. **The Chomps stick logged correctly. It was just badly labelled.**
   - The values are right: 281 kcal/100 g × 32 g = **90 kcal and 9 g protein** for a beef stick, exactly the label.
   - Most Chomps listings publish their household serving as a weight code (`1.15 ONZ`), not "1 stick". The pipeline turns that into "1.15 oz", and the app showed it as the portion name: "1.15 oz · 32 g".
   - That is one stick, but nothing on screen says "stick" or "serving".
2. **This is catalogue-wide. 22.7% of products (91,883) describe their serving only by restating its weight or volume** ("1 oz", "8 fl oz", "38 g"). In meat snacks it is **70%**.
3. **73.0% already have a good household serving:**
   - a named unit such as "1 bar", "1 can" or "2 slices" (37.9%);
   - a household measure such as "1/2 cup" or "2 tbsp" (35.1%).
4. **The pipeline discards serving evidence that the source has:**
   - "about 15 chips" text (3,019 products, dropped as malformed);
   - the **package weight**, which proves 43,547 products are single-serve, and lets a "whole package" option be offered on 80,064 more;
   - unit names published on **other listings of the same product** (2,279).
5. **Proposal:** a ranked serving list built at catalogue time, plus a small app change.
   - Every product gets an honest one-tap serving: a **named unit** where the source supports one, otherwise **"1 package"** or **"1 serving (32 g)"**.
   - Fractions, multiples and exact grams or millilitres stay available.
   - Nothing is invented, no density conversion, no change to logged history.
6. **Nutrition accuracy:** no systematic error was found in per-100 values beyond those already excluded. Specific risk signals are measured in §8, with a safe reporting path.

## 2. How servings work today

| Layer | Behaviour |
| --- | --- |
| USDA source | `servingSize` + `servingSizeUnit` (the metric serving, which USDA used to derive the per-100 values), `householdServingFullText` (free text from the label, often a GS1 code such as `1.15 ONZ`), `packageWeight` (free text such as "1.15 OZ/32 G"), and `labelNutrients` (per serving) |
| Pipeline ([rules.ts](../../scripts/branded-catalog/rules.ts) `household()`) | Keeps the serving size and the household text only: GS1 codes become words (`ONZ` → "oz", `OZA` → "fl oz"); text with unbalanced brackets or a `\|` is dropped. **`packageWeight` is not imported** |
| Catalogue | `serving` (g or ml), `household` (text or "") |
| App ([branded.ts](../../src/domain/branded.ts) `brandedFood()`, `servingLabel()`) | One portion: the household text (a trailing "(240 mL)" is trimmed) or "1 serving" when empty. Row: "1.15 oz (32 g) · 90 kcal". Food step: chips **Grams** and **1.15 oz · 32 g**, opening on the household portion × 1; stepper "Portions × 1.15 oz"; values card "For 32 g" |

**What already works:** + logs exactly one label serving. Portions go in steps of 0.25, from 0.01 to 100. Grams and millilitres stay separate (7.3E). Every amount is stored as a snapshot.

**What is missing:** a portion **name** whenever the household text is only a weight, empty or malformed, and any use of package information.

## 3. Catalogue-wide audit (measured, 404,982 products)

### 3.1 Household serving descriptions

| Class | Products | Share | Example (brand · serving · household text) |
| --- | ---: | ---: | --- |
| **Named unit** (stick, bar, can, bottle, slice, piece, package, 15 chips…) | **153,369** | **37.9%** | Smokie Products · 21 g · "1 STICK"; Jones · 355 ml · "1 BOTTLE" |
| **Household measure** (cup, tbsp, tsp) | **142,222** | **35.1%** | Michele's granola · 28 g · "0.25 cup" |
| **Metric only** (restates the serving's weight or volume) | **91,883** | **22.7%** | Link Snacks beef jerky · 28 g · "1 ONZ"; Ice Mountain · 240 ml · "8 OZA" |
| **Empty or "None"** | 9,277 | 2.3% | Matador beef jerky · 28 g · "None" |
| **Malformed** (dropped by the pipeline today) | 4,245 | 1.0% | Clover Valley kettle chips · 28 g · "15 CHIPS \| ABOUT" |
| **Unrecognised** (text without a unit) | 3,866 | 1.0% | "AMOUNT PER SERVING" (1,467), "per serving" (189) |
| **Generic** ("1 serving") | 120 | 0.0% | |

- **Most frequent named units:**

| Unit | Products |
| --- | ---: |
| piece | 25,882 |
| bar | 11,379 |
| slice | 10,291 |
| package | 8,781 |
| cookie | 8,180 |
| container | 6,354 |
| can | 5,317 |
| bottle | 4,841 |
| pouch | 4,375 |
| pizza | 3,316 |
| cracker | 2,572 |
| bag | 2,451 |
| packet | 2,360 |
| link | 2,323 |
| sandwich | 2,211 |
| stick | 1,841 |

- **Counts within named units:**

| Count | Products | Example |
| --- | ---: | --- |
| Exactly 1 | 87,960 | |
| A whole count above 1 | 49,613 | "15 chips", "2 slices" |
| A fraction below 1 | 14,664 | "1/2 bar" |
| A fractional count above 1 | 831 | |
| No leading count | 301 | |

- **Metric-only text, most common forms:**

| Form | Products |
| --- | ---: |
| "# oz" | 56,279 |
| "# fl oz" | 19,793 |
| "# g" | 8,426 |
| "# oz (#g)" | 972 |
| "# gram" | 965 |

### 3.2 By category

| Category (USDA) | Products | Named unit | Measure | **Metric only** | Empty | Malformed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| **Meat snacks** (jerky, snack sticks) | 2,171 | 588 (27%) | 23 | **1,523 (70%)** | 18 | 9 |
| Drinks (soda, water, juice, tea, coffee, milk…) | 39,512 | 11,950 (30%) | 6,036 | **20,406 (52%)** | 640 | 103 |
| Protein, energy and granola bars | 7,339 | 6,560 (89%) | 37 | 616 (8%) | 93 | 30 |
| Yogurt | 6,066 | 3,077 (51%) | 1,351 | 1,543 (25%) | 76 | 10 |
| Chips, pretzels, popcorn, nuts | 31,428 | 6,747 (21%) | 9,801 | 11,458 (36%) | 1,802 | **1,570** |
| Cereal | 7,377 | 1,356 (18%) | 5,373 (73%) | 400 | 219 | 22 |
| Frozen | 24,088 | 11,811 (49%) | 6,231 | 5,359 (22%) | 460 | 158 |
| Supplements and meal replacements | 406 | 220 | 58 | 98 | 26 | 1 |

**Examples:**

| Category | Example (brand · product · serving · household text) |
| --- | --- |
| Meat snacks | Blue Ribbon hickory beef sausage · 56 g · "2 ONZ" |
| Drinks | Simple Truth chamomile tea · 1 g · "1 TEA BAG MAKES 8 FL OZ" |
| Bars | PowerCrunch Protein Genius · 40 g · "1.4 ONZ" (metric only) |
| Bars | Annie's granola bar · 25 g · "1 bar (25g)" |
| Yogurt | Harris Teeter plain whole milk · 170 g · "6 ONZ" |
| Chips | Clover Valley kettle chips · 28 g · "15 CHIPS \| ABOUT" (dropped today) |
| Cereal | Lidl shredded wheat · 60 g · "22 BISCUITS" |
| Frozen | Nature's Path waffles · 70 g · "2 WAFFLES" |
| Supplements | Signature Care electrolyte · 360 ml · "12 OZA" |

### 3.3 Does the household text agree with the metric serving?

The metric serving is authoritative: it is what the per-100 values were derived from (the label values agree with per-100 × serving on every record that can be checked, §2 of the 7.3E report).

| State | Products | Share |
| --- | ---: | ---: |
| No explicit amount in the text | 288,916 | 71.3% |
| **Explicit amount agrees** (within 12% or 1.5 g/ml) | **113,336** | **28.0%** |
| **Explicit amount conflicts** | **946** | **0.2%** |
| Only the other unit (a volume on a weight-based product, or the reverse): **unverifiable** without a density, never converted | 1,784 | 0.4% |

**Conflict examples:**

| Product | Text | Serving |
| --- | --- | --- |
| Gooda Gooda cube bites | "1.05 oz" (30 g) | 60 g |
| Shinshushi dressing | "3.52 oz" (100 g) | 30 g |
| Fresh & Easy carbonara | "2 oz" (57 g) | 50 g |

A false-positive pattern also exists: "1 TEA BAG (MAKES 4 - 8 OZ SERVINGS)".

### 3.4 Package information (`packageWeight`, not imported today)

| Package weight ÷ serving | Products | Meaning |
| --- | ---: | --- |
| ≈ 1 (0.92–1.08) | **43,547** (10.8%) | **The package is one serving** (single stick, can, bar, cup) |
| 1.1–2.2 | 17,852 | A container of about 2 servings (a 20 oz bottle, a share-size bar) |
| 2.2–4.5 | 62,212 | A container of a few servings |
| 4.5–12 | 127,347 | Family packs and multipacks: ambiguous |
| > 12 | 85,806 | Multipacks or bulk |
| < 0.92 | 746 | **Package smaller than a serving: suspect data** |
| Absent | 41,128 | |
| Unparsed or multipack text | 26,344 | |

Products with no named unit whose package is one serving: **12,160**. Among them, 10,873 are metric-only, for example Chomps "1.15 OZ/32 G" against a 32 g serving.

### 3.5 What the pipeline discards today

| Lost evidence | Products | Fix |
| --- | ---: | --- |
| "15 CHIPS \| ABOUT", "0.25 CUP \| ABOUT" dropped as malformed | **3,019** of 4,245 malformed | Parse as "about 15 chips" |
| Package weight | All (single-serve 43,547; whole-package option 80,064) | Import the parsed amount |
| A named unit on another listing of the same product (same brand, name and serving) | **2,279** | Use it, marked as coming from the same product's other listing |
| Conflicting amounts shown verbatim ("1.05 oz" for a 60 g serving) | 946 | Show "1 serving (60 g)" instead |
| Records excluded for an mg/IU serving unit whose number matches a stated g/ml amount (Red Bull "250 MG" with package "8.4 fl oz") | **1,603** of 5,816 food records | Recoverable only if label values reconcile (§6.6); proposal, not automatic |
| Missing nutrients recoverable from the printed label | **0** | None: excluded records lack those nutrients on the label too. Missing is still never zero |

### 3.6 "Product not found" when scanning (coverage)

**26,768 valid barcodes** belong to records the quality rules excluded and have no other catalogue version, so scanning them says "Product not found":

| Exclusion reason | Barcodes |
| --- | ---: |
| Serving unit not g or ml | 5,223 |
| Energy contradicts the macros | 5,070 |
| A macro missing | 4,869 |
| No energy | 3,727 |
| Impossible per-100 value | 2,961 |
| Discontinued | 1,659 |
| Outside the US | 1,101 |
| "As prepared" serving | 1,010 |
| No brand | 951 |
| Euromonitor | 114 |
| Other | 83 |

The rest of "not found" is products absent from USDA's database. USDA coverage is voluntary manufacturer submission.

## 4. Chomps investigation

**26 Chomps records** exist in the release. **24** are Chomps-brand sticks in the catalogue. A 25th catalogue match is Nature's Path "Cheetah Chomps" cereal, not Chomps. Two more were excluded:

- 2643238 "Original Beef Mini Sticks" has no energy value, so its barcode `856584004862` scans as not found.
- 2510251 "Mild Pepperoni Turkey" has a serving of "32 IU"; it was superseded by a valid newer listing anyway.

| FDC | Product | Barcode | Raw household | Serving | Package | Per 100 g (kcal / protein) | **Per serving** | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2365336 | Mild Original Beef Stick | 856584004183 | `1.15 ONZ` | 32 g | 1.15 OZ/32 G | 281 / 28.1 | **90 kcal / 9 g** | 89.9 / 8.99 ✅ |
| 2426288 | Mild Pepperoni Turkey Stick | 856584004145 | `1.15 ONZ` | 32 g | 1.15 OZ/32 G | 188 / 31.2 | **60 kcal / 10 g** | 60.2 / 9.98 ✅ |
| 1983177 | Original Turkey Snack Stick | 856584004329 | `1.15 ONZ` | 32 g | 1.15 oz | 219 / 31.2 | 70 kcal / 10 g | 70.1 / 9.98 ✅ |
| 2396314 | Mild Original Beef Mini Stick | 856584004572 | `0.5 ONZ` | 14 g | 0.5 oz/14 g | 286 / 28.6 | 40 kcal / 4 g | 40 / 4 ✅ |
| 2652237 | Original Beef Sticks | 856584004763 | `1 Stick` | 32 g | 13.8 oz/384 g (12-pack) | 281 / 28.1 | 90 kcal / 9 g | 89.9 / 8.99 ✅ |
| 2604733 | Mild Pepperoni Turkey Stick | 0850015892615 | `1 stick (32g/1.15oz)` | 32 g | 1.15 oz | 188 / 31.2 | 60 kcal / 10 g | 60.2 / 9.98 ✅ |
| 2554461 | Original Turkey Sticks | 850015892295 | (empty) | 32 g | 11.5 oz/320 g | 188 / 31.2 | 60 kcal / 10 g | 60.2 / 9.98 ✅ |

**Findings:**

- **Nutrient data is correct** on every Chomps listing checked: per-100 × serving equals the printed label.
- **Root cause:**
  - 18 of the 24 catalogue listings carry a weight ("1.15 ONZ", "0.5 ONZ") or nothing instead of "1 stick". Only 6 say "1 Stick" or "1 stick (32g/1.15oz)".
  - The app names the portion with the household text verbatim, so the screen read "1.15 oz · 32 g" and "Portions × 1.15 oz".
  - One portion was one stick, and + logged one stick (90 kcal), but the word "stick" never appeared.
- **Under the proposal (§6), measured per listing:**

| Becomes | Listings | Why |
| --- | ---: | --- |
| "1 Stick" (already) | 6 | The label names it |
| "1 Stick" (from another listing of the same product) | 5 | The same name and 32 g serving are published as "1 Stick" |
| "1 package (32 g)" | 11 | The package weight equals one serving |
| "1 serving (14 g)" or "1 serving (32 g)" | 2 | No stronger evidence |

## 5. Design principles (founder's priorities)

1. Prefer a **named serving from the source**.
2. Otherwise "**1 serving (32 g)**" from the verified metric serving.
3. Fractions and multiples are always available.
4. Grams or millilitres are always available as the precise option.
5. **Never invent** a unit name, package count, household measure or density.
6. **One serving model** for search and scanning (both already use `brandedFood()` and the same food step).
7. Generic foods and history are untouched.

## 6. Proposed Smart Serving System

### 6.1 The serving ladder (built per product at catalogue time)

| Rank | Option | Source evidence | Label shown | Products (measured) |
| --- | --- | --- | --- | ---: |
| 1 | **Named unit from the label** | Household names a unit and agrees with, or doesn't contradict, the serving | "1 stick (32 g)", "15 chips (28 g)", "1/2 cup (120 g)" | 153,369 + 142,222 measures = **295,591 (73.0%)** |
| 2 | **Recovered "about N units"** | "15 CHIPS \| ABOUT" | "About 15 chips (28 g)" | **3,019** |
| 3 | **Named unit from the same product's other listing** | Same brand, same name, same serving and basis; one listing names the unit | "1 stick (32 g)"; details: "unit from another listing of this product" | **1,734** after ranks 1–2 |
| 4 | **Single-serve package** | `packageWeight` equals the serving (±8%) | "1 package (32 g)" | **11,939** after ranks 1–3 |
| 5 | **1 serving** | Metric serving only (restated weight, empty, junk text, or conflicting amount) | "1 serving (32 g)"; the restated text, such as "1.15 oz", goes in the detail line | 79,956 + 12,743 = **92,699 (22.9%)** |
| + | **Whole package** (extra option) | Package of 1.1–4.5 servings, no multipack wording | "Whole package (591 ml) · 2.5 servings" | **80,064** |
| + | **One of a counted unit** (extra option; **decision S5**) | "15 chips (28 g)" | "1 chip (1.9 g)", by division of the stated count | up to 49,613 |
| + | **Grams or millilitres** | The food's basis | Unchanged (7.3E) | All |

**Result:** every product gets an honestly named one-tap serving. 77.1% are named (ranks 1–4) and 22.9% read "1 serving (X g/ml)". **No product shows a restated weight as its serving name.**

### 6.2 What the lifter sees

- **Row:** "1 stick (32 g) · 90 kcal", or "1 serving (240 ml) · 100 kcal".
- **Food step:**
  - The first chip is the rank-1 serving (selected), then the extras (whole package, one unit), then **Grams** or **Millilitres**.
  - A plain line: "1 serving = 1 stick (32 g)".
  - The stepper is labelled "**Servings**" for branded foods, with quick choices **½ · 1 · 1½ · 2**.
  - The values card heading says "For 2 sticks (64 g)".
- **Scanner:** the same step.

### 6.3 Data (catalogue schema 4; additive)

New `product` columns, all derived at build time with the evidence recorded:

| Column | Content |
| --- | --- |
| `serving_label` | The rank-1 label text ("1 stick", "About 15 chips", "1 package", "1 serving") |
| `serving_source` | `label` / `measure` / `about` / `sibling` / `package` / `metric` |
| `package` | The parsed package amount × 1000 in the basis unit, or NULL |
| `unit_count` | The leading count of a named unit (15 for "15 chips"), or NULL |

- The original household text stays in `household`, for transparency.
- Estimated size impact: about 4–6 MB on top of 62 MB. **Unmeasured**; measured in M2.

### 6.4 App (small, non-protected changes)

- `brandedFood()` ([branded.ts](../../src/domain/branded.ts)) builds `portions[]` in ladder order from the new columns. The existing protected functions (`servingOf`, `choiceError`, `entryFromLibrary`) already support several portions in grams **or** millilitres, so **no engine change** is needed.
- QuickAddSheet: for branded foods only, the stepper label "Servings", quick fractions, and the "1 serving = …" line. Generic foods keep "Portions" exactly as today.
- Snapshots are unchanged: `serving` stores the chosen portion label ("1 stick (32 g)") and `sourceGrams`/`sourceMl` its amount. **Old entries are never rewritten.**

### 6.5 Smallest safe improvements, in order

| Step | Change | Effect | Rebuild? |
| --- | --- | --- | --- |
| **S1** | `servingLabel()`: a household text that only restates the metric serving, conflicts with it, or is junk ("AMOUNT PER SERVING") becomes **"1 serving"**. Branded stepper reads "Servings" | Chomps-like products read "1 serving (32 g) · 90 kcal" at once (**about 94,000 products**: 91,883 weight-only texts plus about 1,800 "per serving" texts) | No (app only) |
| **S2** | Pipeline: about-N recovery, package import, same-product units, conflict handling; schema 4 | Ranks 2–4: **+16,692 named servings**; whole-package option on 80,064 | Yes (deterministic; new digest) |
| **S3** | Food step: ladder order, quick fractions, "1 serving = …" line | Faster logging for every branded food | No |
| **S4** | Personal serving labels (§7) | Lifter-verified names, such as "1 stick" on the remaining 22.9% | No |

### 6.6 Optional coverage recovery (separate decision S6)

Re-admit records excluded only for an mg/IU serving unit (1,603 measured) **only if** all three hold:

- the same number is stated as g or ml in the package or household text;
- per-100 × that amount ÷ 100 reproduces the printed label energy within rounding;
- every other rule passes.

The other exclusions stay as they are.

## 7. Personal serving labels (future, research)

- **What it is:** a lifter can save "1 stick = 32 g" (or "1 scoop = 31 g") against a product identity.
- **Where it lives:** a new journal kind, for example `serving-label`, with `{ sourceId, barcode?, label, amount, unit: "g" | "ml" }`.
- **Applies to:** that lifter's own devices only, through the existing sync.
- **Never changes:**
  - USDA values, the catalogue, or other users;
  - past entries (they keep their snapshots).
- **Presentation:** the label appears first in the ladder, marked "yours", and can be edited or deleted.
- **Compatibility:** older builds keep unknown journal kinds unchanged (7.3C decision H7), so backups and sync are safe.
- **Validation:**
  - the amount uses the product's basis, never converted;
  - limits match the existing serving limits;
  - one label per unit name per product.
- **Already possible today:** **Save to my foods** plus **Edit** gives a personal copy with corrected values.

## 8. Nutrition accuracy (detection and reporting)

| Kind of problem | How to tell | Measured signal | Handling |
| --- | --- | --- | --- |
| **Wrong nutrient data** | Energy inconsistent with macros; implausible per serving | 11,786 kept with loose energy (2.9%, mostly fibre, polyols, rounding); 5 servings over 1,500 kcal; 40 named units with implausible sizes (for example a "1 chip" of 43 g that is really "1.5 oz (about 15 chips)") | Excluded already where contradictory (5,328). Others: curated review list (§8.1) |
| **Correct per-100, confusing serving** | Household text conflicts with the metric serving; package smaller than a serving | 946 conflicts; 746 packages smaller than a serving | Ladder rank 5 ("1 serving (X g)"); never show the conflicting text as the portion |
| **Outdated label** | Newer versions of the same barcode with different values | 4,336 barcodes had conflicting versions (newest kept); 49.4% of products were last published 2019–2021 | Rebuild per USDA release; reports (§8.1) |
| **Wrong product for a barcode** | Versions of a barcode whose names share no word | 163 of 17,904 multi-version barcodes, mostly rewording ("Gourmet Drops" ↔ "beverage enhancer") | Review list; the scanner already shows name and brand before anything is logged |

### 8.1 Reporting and correction (not implemented)

1. **In the food step:** "Something wrong?" with four choices (values, serving, old label, wrong product) and an optional note. It is stored on the device as a journal record and never sent automatically.
2. **The lifter's own fix, immediately:** a personal serving label (§7), or Save to my foods plus Edit. Logged entries keep their snapshots.
3. **Founder review:** reports can be exported by the lifter (share sheet or email; no hosted service). Confirmed issues go into a versioned `scripts/branded-catalog/overrides.json` (by FDC ID or barcode), applied at build and listed in the build report:
   - **serving-label overrides** (with the evidence);
   - **exclusions** (with the reason).

   **Nutrient values are never edited by hand.** A wrong record is excluded or replaced by USDA's next release.
4. **Upstream:** confirmed source errors go to USDA through the FoodData Central contact form.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| A single-serve package could be a multipack measured per unit | Requires equality within ±8% and no multipack wording; labelled "1 package", never a guessed noun |
| A same-product unit could belong to a variant | Exact brand, cleaned name, serving and basis must all match; the source is shown in the details; measured scope is small (1,734) |
| "About N" counts are approximate | The label says "About" |
| Dividing a count ("1 chip") could imply precision | Optional (S5); shows "≈"; never offered for fractions or "about" |
| A larger catalogue | Schema 4 size is measured in M2; budget ≤ +8 MB |
| Data-entry errors in the source remain | Reports and overrides (§8.1); release refreshes |

## 10. Tests for implementation

**Pipeline fixtures:**

- every household class;
- GS1 codes;
- "\| ABOUT" recovery;
- conflict detection (including the tea-bag false positive);
- package parsing (single, few, multipack, suspect);
- same-product units (match and non-match);
- determinism, and the new digest.

**Ladder:**

- rank order and labels for each class;
- grams and millilitres never mixed;
- whole package only within bounds;
- no invented units.

**Serving maths:** 1, ½, 1½ and 2 servings; a named unit × count; the whole package; grams and millilitres. Values equal per-100 × amount, and the snapshot is exact.

**Regressions:**

- generic foods unchanged ("Portions" kept);
- existing entries display unchanged;
- scanner and search share the same step;
- the real catalogue's Chomps listings give the expected labels.

**UI:** the "1 serving = …" line, quick fractions, large text and compact screens at 44 pt.

## 11. Recommended sequence and decisions

| Step | Scope | Needs |
| --- | --- | --- |
| 0 | Commit 7.3F (scanner) separately after your iPhone sign-off | Founder |
| 1 | **S1**: app-only label fix | Approval |
| 2 | **S2 + S3**: pipeline schema 4 and food step | Approval; catalogue rebuild (new digest) |
| 3 | **S4**: personal serving labels | Approval (new journal kind) |
| 4 | Reports and overrides (§8.1) | Approval |

**Decisions:**

| # | Decision | Recommendation |
| --- | --- | --- |
| S1 | Restated weight, conflicting or junk household text → "1 serving (X g)" | **Yes** |
| S2 | Import package weight; offer "1 package" (single-serve) and "Whole package" (1.1–4.5 servings) | **Yes** |
| S3 | Use units from another listing of the same product (exact match) | **Yes, labelled as such** |
| S4 | Recover "about N units" | **Yes** |
| S5 | Offer one of a counted unit ("1 chip ≈ 1.9 g") | Optional; recommend **later** |
| S6 | Re-admit mg/IU unit errors under the three-way check | Optional; recommend **after S2** |
| S7 | Personal serving labels | **Yes, after S1–S3** |
| S8 | Local reports, export, curated overrides file | **Yes** |
