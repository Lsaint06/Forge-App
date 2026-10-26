# FORGE Phase 7.3F.2 — Food Coverage & Nutrition Reliability

**M1: research, gap analysis and architecture.** Research and planning only. No production food data, catalogue schema, scanner, Nutrition UI, logging calculation or dependency was changed, and no data from any new source has been combined with the catalogue or shipped.

Prepared 2026-10-26 for founder review.

---

## 0. Summary for the founder

### Answer

**Why the Dr Pepper can (and many pantry products) don't scan.** The cause is not the scanner. The bundled USDA catalogue no longer tracks the US shelf:

1. **94.8% of our 404,982 products come from Label Insight.** USDA states Label Insight stopped sending new or updated products on **2023-11-16**. Only **3.1%** of our products (12,578) carry a 2024 or later label.
2. **Brands that launched or grew after 2023 are badly covered.** Barebells has 3% of known US barcodes, Ghost 8%, Celsius 11%, Prime 13%, Optimum Nutrition 18%, Chomps 21% and Fairlife/Core Power 24%. Long-established brands sit at 64–79%, e.g. Kellogg's 75%, Gatorade 78%, Banquet 79%. Costco's Kirkland is at 3%: Costco never fed this pipeline.
3. **USDA often lists the case or multipack barcode, not the barcode on the single can or bar you hold.** Regular Dr Pepper is listed by its 24-pack, 4-pack, 2 L and 1.25 L GTINs. The can's own GTIN is a different number.
4. **9,628 products we already have are unscannable** because USDA published their barcode wrongly. 7,563 of these are UPC-A codes with the check digit dropped.

### What can be gained (measured, not promised)

| Option | Measured effect | Cost / risk |
| --- | --- | --- |
| Newer USDA data (monthly API delta since our snapshot) | 7,434 records published since 2026-05-01. About 78% are updates of products we already hold. **Estimated about 1,500 new barcodes**, mostly foodservice and seasonal items | Public domain. Free API key at build time only. Small gain |
| **Open Food Facts (ODbL)**, US/Canada barcodes not in Forge | **67,845 pass a conservative policy**, a further 109,092 need review, and 276,512 are rejected | Licensing obligations: share-alike, attribution, offering the derived database. **Needs professional licensing review** |
| Popularity-weighted coverage (share of Open Food Facts scan volume on US/Canada codes) | Forge today about **60%**. Plus accepted OFF records, about **77%**. Plus review records, about **82%** | Measured on Open Food Facts users' scans, not on Forge users |
| Corroborated recovery of dropped check digits | 1,906 corroborated by Open Food Facts; 2,115 are duplicates of products we already scan | The founder's rule against silent repair applies. Needs a decision |
| **Personal barcode foods** (scan → not found → create once → rescans work) | Fixes every product the founder uses, permanently, on every device the account syncs to | No new data, no licence, no infrastructure. Uses the existing journal and sync |

### Recommendation (§11)

**C1.** Build barcode-linked personal foods and personal corrections first. Coverage then grows with every product the user actually eats, with zero licensing exposure.

**C2.** Refresh USDA at the next semiannual download, adding a check-digit recovery corroborated within USDA.

**C3.** Run an Open Food Facts supplement only **after a professional licensing review**, as a **separate, ODbL-licensed collective database file**, never merged into the USDA catalogue.

**Not recommended:** commercial nutrition APIs (Nutritionix, FatSecret and similar). They conflict with the offline-first, no-subscription and no-redistribution constraints.

Decisions needing founder approval are listed in §12. Items needing **professional licensing review** are marked ⚖.

---

## 1. Baseline

| Item | State |
| --- | --- |
| Branch | `feat/forge-paths-foundation`, tracking `origin` |
| Latest commit | **`7f5207b`** feat(nutrition): smart servings for branded foods (Phase 7.3F.1 S1-S3) |
| Before it | `4b0e354` (7.3F scanner), `e41bd41` (7.3E catalogue), `5bb9171` (7.3D) |
| Working tree | Clean before this report. This document is the only change |

**Prerequisite note.** The brief stated 7.3F.1 was committed and pushed. At the start of M1 it was not: HEAD was `4b0e354` with the 18 Smart Servings files uncommitted. With founder direction, those files alone were committed and pushed as `7f5207b`, after a typecheck and whitespace check, before any M1 work began. No M1 material is in that commit.

**Reviewed for this audit:**

- [rules.ts](../../scripts/branded-catalog/rules.ts) (quality exclusions)
- [catalog-db.ts](../../scripts/branded-catalog/catalog-db.ts) and [build.ts](../../scripts/branded-catalog/build.ts) (pipeline, schema 4)
- [barcode.ts](../../src/domain/barcode.ts) (GTIN normalisation)
- [servings.ts](../../src/domain/servings.ts) (Smart Serving rules)
- [branded.ts](../../src/domain/branded.ts) and [branded-query.ts](../../src/data/branded-query.ts)
- [BarcodeScanner.tsx](../../src/components/nutrition/BarcodeScanner.tsx) (not-found state)
- [nutrition.ts](../../src/domain/nutrition.ts) (`SourceMeta` provenance)
- [repository.ts](../../src/data/repository.ts) and [schema.ts](../../src/data/schema.ts) (journal, outbox, sync)

The scanner and Nutrition UI are untouched.

---

## 2. Method and data

All measurements are reproducible from pinned inputs. The research scripts live in the session workspace (`files/coverage/`), not in the repository.

| Input | Identity |
| --- | --- |
| USDA FDC Branded Foods, release 2026-04-30 (our snapshot) | 204,270,542 bytes, SHA-256 `57b0f122…2256` (as in `sources.json`) |
| Forge catalogue | `usda-branded-2026-04-30.db`, content digest `5c8a5788…a727`, 404,982 products, 395,354 barcodes |
| Open Food Facts nightly CSV export | Last-Modified 2026-10-26 09:04 GMT, 1,494,338,436 bytes, SHA-256 `1112229ef068e543a29fd5e3a280f16ff0d934857066f2085a3b430546121683` |
| USDA FDC API (`DEMO_KEY`, public, rate-limited) | Queried 2026-10-26: 4 count queries and 3 sample pages of 200 records |

Steps:

1. **USDA census.** Every one of the 455,458 records was streamed through the production `judge()` and `deduplicate()` rules. Each record was tagged *catalog*, *superseded* or *excluded:reason*, with its normalised GTIN-14 from the production `gtin14()`.
2. **Open Food Facts comparison.** All 4,837,143 rows were streamed (23 malformed rows skipped). For each US-tagged row with a valid GTIN, we recorded whether it is in Forge and, if not, its USDA fate. A conservative quality policy (§8) was then applied: the production rules plus Open Food Facts' own data-quality validator.
3. **Popularity weighting.** Open Food Facts' `unique_scans_n` (unique scans per product by its own app users) was used as a proxy for which products shoppers actually scan.

**Measurement caveats:**

- **Open Food Facts' `en:united-states` tag is contaminated.** The most-scanned "US" products are Moroccan (GS1 prefix 611) and European goods. Every coverage figure below is therefore restricted to **US/Canada GS1 prefixes** (GTIN-14 starting `00` or `01`, i.e. UPC-A and GS1 US 100–139), excluding zero-padded EAN-8 codes, unless stated otherwise.
- Open Food Facts' CSV has no serving unit or nutrition basis (per 100 g vs per 100 ml) field. The basis below is inferred from quantity text and is indicative only. A real import would use the JSONL or Parquet fields (`serving_quantity_unit`, `nutrition_data_per`).
- `last_modified_t` in Open Food Facts is also touched by robots, so it is **not** evidence of label freshness.
- Category counts come from a truncated tag field and are lower bounds.

---

## 3. Why real products are missing

### 3.1 Classification of causes (measured)

US/Canada-prefix and all-US figures are labelled per row.

| Cause | Measured evidence | Scale |
| --- | --- | --- |
| **A. Product absent from USDA entirely** | US-tagged Open Food Facts GTINs that do not exist in the USDA release at all | **571,492** (all US-tagged). Includes the US/Canada candidates in §6 |
| **B. Newer products and labels not in our snapshot (source freshness)** | 94.8% of the catalogue is Label Insight, frozen 2023-11-16. Only 12,578 products have 2024+ labels. New-brand coverage 3–24% (§4.2) | Structural. The main root cause behind A |
| **C. Packaging variation (different GTIN for the same food)** | USDA lists multipack, case and bottle GTINs. A can, bar or single-serve unit has its own GTIN (Dr Pepper, §4.1) | Widespread in beverages and bars. Not measurable exactly, because the pairs are unknown |
| **D. In USDA but barcode missing or invalid** | Catalogue products whose USDA barcode fails GS1 validation: 9,544 wrong check digit, 58 non-digit, 26 bad length | **9,628** in Forge but unscannable (§3.3) |
| **E. In USDA but excluded by quality rules** | US Open Food Facts GTINs whose USDA record our rules exclude | **17,121** (§3.2) |
| **F. Different market or GTIN** | Imported or foreign-market editions carry foreign EANs, e.g. EU Coca-Cola `5449000…` | Present but correct behaviour |
| **G. Normalisation or matching fault** | **None found.** All 333,075 shared US GTINs matched via the same `gtin14()` the scanner uses. iOS's EAN-13-with-leading-zero-stripped report pads to the same GTIN-14 | 0 |
| **H. Superseded versions** | 18,988 older labels of a barcode we keep. The barcode still resolves to the newest label | Not a coverage loss |

### 3.2 USDA records we excluded that shoppers scan (cause E)

Of the US-tagged Open Food Facts GTINs absent from Forge, 17,121 exist in USDA but our rules excluded them:

| Exclusion reason | GTINs |
| --- | ---: |
| Energy contradicts protein, carbs and fat | 3,773 |
| Serving not by weight or volume (mg, IU, mcg) | 3,557 |
| Missing protein, carbs or fat | 3,031 |
| No energy value | 2,418 |
| Impossible per-100 value | 1,388 |
| Discontinued by the data provider | 1,134 |
| No brand or brand owner | 908 |
| Serving describes the food as prepared | 790 |
| Other (market, Euromonitor, serving size) | 122 |

These exclusions protect accuracy and **should not be weakened** (see the brief). The per-reason lists already exist in `docs/branded-catalog/excluded.tsv`. Where another source holds a credible record for the same GTIN, the right action is to send it to review (§8), not to relax USDA's rule.

### 3.3 Barcodes USDA published wrongly (cause D)

The 9,544 catalogue products with an invalid check digit break down as follows:

| Published code | Products | Interpretation |
| --- | ---: | --- |
| 11 digits | **7,563** | UPC-A with the check digit dropped, a known Label Insight pattern |
| 8 digits, wrong check | 1,112 | Typing errors or truncation; cannot be safely interpreted |
| 12 digits, wrong check | 503 | Typing errors; cannot be safely interpreted |
| 13 digits, wrong check | 202 | Typing errors; cannot be safely interpreted |
| 9, 10 or 14 digits, wrong check | 164 | Typing errors; cannot be safely interpreted |

**For the 7,563 eleven-digit codes**, appending the computed check digit always "validates", so validity alone proves nothing. Independent corroboration was therefore tested:

| Evidence for the reconstructed GTIN | Same product name | Different name |
| --- | ---: | ---: |
| Another USDA listing (public domain) | **2,115** (already scannable via that listing; the bad one is a duplicate) | 55 |
| USDA listing that we excluded | 54 | 1 |
| Open Food Facts record | **1,906** | 105 |
| No independent evidence | 3,327 | — |

Where evidence exists, the reconstruction agrees 95–97.5% of the time. That is good, but not good enough to do silently. The **12/13/8-digit wrong-check-digit codes must never be repaired.** This follows the existing rule in [barcode.ts](../../src/domain/barcode.ts).

---

## 4. Representative brands and categories

### 4.1 Dr Pepper

| Finding | Detail |
| --- | --- |
| USDA Dr Pepper-related records | 582. 507 in catalogue, 67 superseded, 8 excluded |
| Regular Dr Pepper GTINs in Forge | 078000082104 ("12 FL OZ, 24 COUNT"), 078000082944 (4-count), 078000082463 (2 L), 078000082395 (1.25 L), 078000082401 (20 oz), 078000028379 (24 oz) and others |
| Diet Dr Pepper | Two USDA listings, 12 fl oz and 7.5 fl oz, have **invalid check digits**, so they cannot be scanned (cause D) |
| GTINs Open Food Facts knows under the KDP company prefix `078000` (US-tagged, "pepper") | 70. Of these, 27 in Forge, 12 pass our policy, 4 need review, 27 rejected |
| Dr Pepper codes absent from USDA, rejected because Open Food Facts has per-100 values but **no serving size** | 078000082098, 082470, 082951, 082609, 082647, 035384 (Zero Sugar), 033489 (& Cream Soda 355 ml) |
| New flavours absent from USDA that pass our policy | Zero Sugar 20 oz (035308), Blackberry Zero Sugar 12 fl oz (040661), Cream Soda Zero Sugar 355 ml (035490), Creamy Coconut Zero Sugar (038750), Cane Sugar (008722) |
| Warning case | 078000800531 "Dr pepper" passes generic checks with **382 kcal per 100**, which is impossible for a soda. Category-aware plausibility checks are required (§8) |

**Conclusion.** USDA covers regular Dr Pepper through multipack and bottle GTINs. The can's own GTIN is most likely one of the `078000 08xxxx` codes that USDA lacks entirely, which Open Food Facts holds without serving data. **The founder can confirm the exact code:** the 7.3F "Product not found" screen shows the barcode digits. Sharing them would let this report name the exact cause. This is an open item, not an assumption.

### 4.2 Brand coverage

US/Canada-prefix GTINs known to Open Food Facts for each brand family, and where they stand.

| Brand family | Known GTINs | In Forge | OFF would pass | Review | Reject |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dr Pepper | 394 | 309 (78%) | 21 | 7 | 57 |
| Coca-Cola | 337 | 153 (45%) | 25 | 40 | 119 |
| Chomps | 106 | 22 (21%) | 36 | 27 | 21 |
| Monster | 376 | 212 (56%) | 36 | 38 | 90 |
| Red Bull | 153 | 77 (50%) | 27 | 11 | 38 |
| Celsius | 71 | 8 (11%) | 22 | 4 | 37 |
| Ghost | 250 | 20 (8%) | 108 | 74 | 48 |
| Prime | 316 | 40 (13%) | 89 | 106 | 81 |
| Gatorade | 757 | 589 (78%) | 46 | 31 | 91 |
| Quest | 607 | 230 (38%) | 103 | 84 | 190 |
| RXBAR | 182 | 118 (65%) | 23 | 23 | 18 |
| Clif | 606 | 286 (47%) | 54 | 203 | 63 |
| KIND | 571 | 371 (65%) | 74 | 33 | 93 |
| Barebells | 172 | 6 (3%) | 64 | 68 | 34 |
| Premier Protein | 289 | 89 (31%) | 95 | 43 | 62 |
| Fairlife / Core Power | 127 | 30 (24%) | 27 | 56 | 14 |
| Muscle Milk | 160 | 65 (41%) | 42 | 25 | 28 |
| Optimum Nutrition | 279 | 51 (18%) | 90 | 57 | 81 |
| Lay's | 655 | 400 (61%) | 81 | 49 | 125 |
| Doritos | 432 | 222 (51%) | 75 | 61 | 74 |
| Pringles | 268 | 158 (59%) | 41 | 42 | 27 |
| Goldfish | 90 | 62 (69%) | 10 | 14 | 4 |
| Cheerios | 146 | 94 (64%) | 7 | 15 | 30 |
| Kellogg's | 2,307 | 1,734 (75%) | 180 | 210 | 183 |
| Chobani | 558 | 259 (46%) | 95 | 145 | 59 |
| Oikos | 163 | 65 (40%) | 37 | 30 | 31 |
| Tillamook | 625 | 374 (60%) | 80 | 88 | 83 |
| Kirkland Signature | 4,308 | 109 (3%) | 542 | 297 | 3,360 |
| Great Value | 5,251 | 2,784 (53%) | 543 | 648 | 1,276 |
| Good & Gather | 2,449 | 1,371 (56%) | 239 | 293 | 546 |
| Hot Pockets | 59 | 26 (44%) | 19 | 9 | 5 |
| DiGiorno | 91 | 50 (55%) | 19 | 20 | 2 |
| Lean Cuisine | 99 | 63 (64%) | 24 | 12 | 0 |
| Banquet | 170 | 134 (79%) | 13 | 20 | 3 |
| Eggo | 83 | 42 (51%) | 20 | 17 | 4 |
| Stouffer's | 159 | 111 (70%) | 17 | 26 | 5 |

The denominator is only what Open Food Facts knows, so true shelf coverage is lower for every brand. Kirkland's rejects are mostly records with no brand or no serving.

### 4.3 Category view of Open Food Facts candidates not in Forge

US/Canada prefixes; lower bounds.

| Category | Pass | Review | Reject |
| --- | ---: | ---: | ---: |
| Energy drinks | 222 | 53 | 246 |
| Sodas / soft drinks | 335 | 273 | 555 |
| Protein bars | 355 | 64 | 194 |
| Bars (all) | 801 | 186 | 467 |
| Protein / sports nutrition | 1,587 | 379 | 3,718 |
| Chips and salty snacks | 1,206 | 268 | 1,824 |
| Meat snacks / jerky | 61 | 69 | 57 |
| Dairy | 1,903 | 1,493 | 2,731 |
| Frozen foods | 996 | 1,054 | 748 |
| Bread / bakery | 666 | 329 | 1,151 |
| Condiments and sauces | 1,223 | 1,334 | 5,503 |

---

## 5. Candidate data sources

"Measured" means quantified in this audit. "Desk" means taken from published terms or documentation and **not verified with the provider**.

| Source | US grocery coverage | Barcodes / overlap with Forge | Nutrients and servings | Update cadence | Format and size | Licence and redistribution | Offline bundling | Maintenance | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **USDA FDC Branded, semiannual download** (current source) | Measured: 404,982 accepted products. Strong for pre-2024 national brands | 395,354 valid GTINs | Complete label macros. Household servings 72% named (7.3F.1) | Downloads every 6 months: 2025-04-24, 2025-12-18, 2026-04-30 | 204 MB zip JSON | **CC0 public domain.** Attribution courteous | Yes (today) | Low; pipeline exists | **Keep**: primary source |
| **USDA FDC API, monthly** | Measured: 7,434 records published 2026-05-01 to 2026-09-24, **all GDSN**. Sample of 600: 78% updates of our GTINs, 2% other existing, **20% new** (about 1,500; the sample is brand-clustered, so the uncertainty is wide). About 42% look like foodservice items | About 1,500 new estimated | Same schema as the download | Monthly | REST JSON. Free api.data.gov key; `DEMO_KEY` allows about 30 requests an hour | CC0 | Yes, if fetched at **build time only** | Medium: paging, key, rate limits | **Optional**: freshness more than coverage. Next semiannual download gives the same data with no key |
| **Open Food Facts** | Measured: 921,688 unique US-tagged valid GTINs. 333,075 already in Forge (84% of our barcodes) | **67,845** US/Canada pass; 109,092 review; 276,512 reject | Community-entered. Of 453,449 US/Canada non-Forge rows, the first failing check is no brand for 24.4%, no energy for 7.9% and no serving for 8.0%. Agreement with USDA on shared GTINs: **87.9%** (community), **75.5%** (its 2017 USDA copies) | Nightly export plus 14-day daily deltas | CSV 1.49 GB gz, JSONL 13.3 GB gz, Parquet 8.0 GB | **ODbL 1.0** (database), DbCL (contents), CC-BY-SA (images). Commercial use allowed **with obligations** (§7) ⚖ | Yes, under ODbL conditions | Medium–high: quality filtering, licence compliance, contribution etiquette | **Conditional**: only after licensing review, as a separate ODbL database |
| Nutritionix | Large US restaurant and grocery set (desk) | Unknown | Good (desk) | Continuous | Paid API | Desk: caching and offline storage prohibited without a written agreement; no redistribution | **No** | Contract | **Reject**: violates offline-first and no-subscription |
| FatSecret Platform | Large (desk) | Unknown | Good (desk) | Continuous | Paid or free-tier API | Desk: storage and caching limited by terms | **No** | Contract | **Reject** |
| Edamam Food Database | Large (desk) | Unknown | Varies | Continuous | Paid API | Desk: API terms; no bulk redistribution | **No** | Contract | **Reject** |
| GS1 US Data Hub / Verified by GS1 | Authoritative product **identity** (brand, description); no nutrition | n/a | **None** | Continuous | Licensed API | Desk: licensed; not redistributable | No | Contract | **Not useful** for nutrition |
| 1WorldSync / Syndigo / NielsenIQ Label Insight | The commercial upstreams that feed USDA | Unknown | Excellent (manufacturer-supplied) | Continuous | Enterprise feeds | Desk: commercial licence; redistribution by negotiation | Only by contract | High; legal | **Out of scope** (paid infrastructure) |
| USDA Child Nutrition (CN) database, monthly | School foodservice products | Few retail GTINs | Good | Monthly | Zip | Public | Yes | Low | **Low value** for grocery scanning |
| Manufacturer-published nutrition | Exact per brand | Per product | Exact, current labels | Ad hoc | Web pages and PDFs | Facts are not copyrightable in the US, but site terms often restrict scraping ⚖ | Manual only | **Very high** at scale | Use only as **user-verified personal corrections** (§9), not bulk import |
| Retailer APIs (Kroger, Walmart and similar) | Retail-accurate | Large | Varies | Continuous | API | Desk: terms restrict storage and redistribution | No | Contract | **Reject** |

A large raw dataset is not automatically better. Open Food Facts has 4.8 million rows, but only 67,845 new US/Canada products survive a policy as strict as the one already applied to USDA.

---

## 6. Quantified potential gains

### 6.1 Open Food Facts (US/Canada GS1 prefixes, not in Forge)

| Category | Products | Notes |
| --- | ---: | --- |
| **Measured unique additions passing the policy** | **67,845** | 65,972 not in USDA at all; **1,873 are GTINs USDA excluded**, which policy v2 should move to review (§8). Creators: 64,504 community, 2,177 old USDA copies, 1,164 manufacturer (producer platform) |
| Potential additions before quality review | 109,092 | 106,482 lack a nutrition-label photo, 2,323 have loose energy, 240 have no stated basis, 47 are stale |
| **Rejected** | **276,512** | No brand 110,817; restricted in-store or variable-weight code 61,312; no usable serving 36,119; no energy 35,752; no name 9,092; missing macros 7,016; energy contradicts macros 6,234; Open Food Facts data-quality error 5,438; impossible per-100 4,351; no-nutrition flag 379; negative 2 |
| US-tagged but non-US/Canada prefix | 14,764 pass / 15,063 review / 78,093 reject | Mostly foreign goods mis-tagged as US. **Excluded from recommendations** |
| Zero-padded EAN-8 | 3,719 / 3,782 / 19,743 | Mostly foreign. Excluded |

### 6.2 Popularity-weighted coverage

This uses Open Food Facts unique scans on US/Canada UPC codes, about 211,500 scans after removing EAN-8 codes not in Forge.

| Coverage level | Share of scan volume |
| --- | ---: |
| Forge today | **≈ 60.0%** |
| + Open Food Facts records passing the policy | **≈ 76.6%** (+16.6 pts) |
| + review records (if a later review tier is approved) | **≈ 81.6%** (+5.0 pts) |
| Remaining: rejected or unresolvable, including in-store codes | ≈ 18.4% |

For the 7,799 products scanned at least five times (unadjusted), Forge has 63.7%, policy-passing records add 23.7%, review records 3.2%, and rejects are 9.4%.

**Limits of this proxy.** Open Food Facts scans come from Open Food Facts users, not Forge users. Products unknown to both databases are invisible here, so real-world hit rates will be lower. **Near-universal recognition is not achievable from these sources and is not promised.**

### 6.3 Other measured or estimated gains

| Item | Products | Type |
| --- | ---: | --- |
| USDA monthly delta since 2026-04-30 | ≈ 1,500 new GTINs, ≈ 5,800 updated | **Estimate** from a 600-record sample |
| Dropped-check-digit recovery corroborated by another USDA listing | 2,115 | Measured. **No new coverage** (duplicates); dedupe benefit only |
| Dropped-check-digit recovery corroborated by Open Food Facts name match | 1,906 | Measured. New scannable barcodes for products we already hold. Corroboration uses ODbL data ⚖ |
| Dropped-check-digit codes with no corroboration | 3,327 | Measured. **Leave unscannable** |

### 6.4 Size impact (bundled-first)

The current catalogue averages about **160 bytes per product**, including FTS and indexes.

| Addition | Extra size |
| --- | ---: |
| 67,845 Open Food Facts products | ≈ +10.8 MB |
| With the review tier as well | ≈ +28 MB in total |
| USDA delta | ≈ +0.3 MB |

Startup is unaffected (the catalogue opens lazily). Barcode lookup stays an indexed point query in each database file.

---

## 7. Licensing: Open Food Facts and the ODbL ⚖

**Professional licensing review is required before any Open Food Facts-derived record ships.** This section is an engineering reading of the licence text (opendatacommons.org/licenses/odbl/1-0/, read 2026-10-26) and Open Food Facts' reuse page. It is not legal advice.

| ODbL clause | What it means for Forge |
| --- | --- |
| §4.2–4.3 Attribution | Any public use of the database, or of a product built from it, needs a notice that the content comes from Open Food Facts under the ODbL. Open Food Facts asks for **prominent in-app attribution** with links, e.g. on product details, in search, and in About or Settings |
| §4.4 Share-alike; §4.4 b (extraction of a substantial part) | Extracting and filtering about 68,000 US products is a **Derivative Database**. If publicly used, which shipping it in an app is, it must be licensed **under the ODbL** |
| §4.5 a Collective Database | If Open Food Facts-derived data sits **beside** the USDA catalogue as a separate database, the collection does not have to be ODbL. Only the Open Food Facts-derived part does. **Merging Open Food Facts records into the USDA SQLite file would arguably make the combined catalogue, including Forge's curation such as serving labels, a single ODbL derivative.** Keep them separate |
| §4.5 b Produced Work | The app itself (code, UI) is a Produced Work and is **not** subject to share-alike. Attribution (§4.3) still applies |
| §4.6 Access | Forge must **offer the derivative database** (or the alterations, or the method that makes them, "such as an algorithm") to recipients, free of charge over the internet. This means publishing the Open Food Facts-derived file or the exact filtering script. That is a static public file, not a runtime service, but it is still a publication decision |
| §4.7 b Technological measures | App Store distribution wraps bundled assets in FairPlay DRM. Forge must also provide an **unrestricted copy** of the derivative database that is "at least as accessible" as the restricted one. This is the same public file as §4.6 |
| §9.1 Termination | **Any breach terminates the licence automatically.** Compliance must be built in, not retrofitted |
| DbCL (contents) and CC-BY-SA (images) | Do **not** use Open Food Facts images; they bring CC-BY-SA obligations and possible trademark issues |
| Open Food Facts terms (contribute back) | Open Food Facts asks apps that let users add or edit products to send those contributions back. This is a request in their terms, not an ODbL obligation, but it is a reputational and ethical expectation |

**Separation architecture that would satisfy the reading above:**

- A second bundled file, `off-us-<date>.db`, built by a separate script and carrying its own licence and attribution metadata.
- Never joined into USDA rows or Forge serving dictionaries.
- Results from the two files are merged only at query time (a Produced Work).
- The Open Food Facts-derived file and its build method are published publicly.

User personal foods copied from an Open Food Facts product stay private per-user data. They are not publicly used, under §4.5 c by analogy, but this needs confirmation in the licensing review.

**USDA:** CC0, with no obligations. Our current attribution text is retained.

---

## 8. Nutrition reliability system (design)

This is the conservative evaluation every **non-USDA** candidate record must pass. **The existing USDA rules in [rules.ts](../../scripts/branded-catalog/rules.ts) are unchanged and are not weakened.**

### 8.1 Checks

| # | Check | Accept requires | Notes |
| --- | --- | --- | --- |
| R1 | Valid GTIN | GS1 check digit valid; not restricted-circulation (UPC 2/4, EAN 02/04/20–29) | Never repair a check digit |
| R2 | Identity | Name and brand present | Optional, later: GS1 company-prefix consistency. The GTIN's company prefix should map to the same brand owner as our other products with that prefix. A mismatch flags a misidentified product |
| R3 | Required nutrients | Energy, protein, carbs and fat present and non-negative | Missing never becomes zero |
| R4 | Per-100 plausibility | Energy ≤ 902 kcal; protein + carbs + fat ≤ 105 g | Same as USDA |
| R5 | Energy consistency | Rejected if \|kcal − (4P + 4C + 9F)\| > 20 and the ratio is outside 0.5–2; ratio outside 0.8–1.2 goes to review | Same as USDA |
| R6 | **Category plausibility (new)** | Energy density inside a per-category band (e.g. soda ≤ 70 kcal/100 ml, water ≈ 0, oils ≥ 700 kcal/100 g) | Catches the Dr Pepper "382 kcal/100" case that R4 and R5 accept |
| R7 | Basis | Explicit `nutrition_data_per` and serving unit; **ml only when stated** | Never infer density. Unknown basis goes to review |
| R8 | Serving evidence | A metric serving within 0–2,000; per-serving values consistent with per-100 × serving within label rounding | Open Food Facts JSONL holds both, so this is testable |
| R9 | Label evidence | A nutrition-label photo exists (Open Food Facts), or the record is manufacturer-sourced (producer platform or GDSN) | No photo goes to review |
| R10 | Source data-quality flags | No Open Food Facts `data_quality_errors_tags` | Open Food Facts' own validator |
| R11 | Duplicate barcodes | One record per GTIN-14; the newest evidence wins within a source | As in USDA dedupe |
| R12 | **Cross-source conflict** | If the GTIN exists in USDA (catalogue **or** excluded), USDA's verdict stands. A USDA-excluded GTIN goes to review, never straight in | Affects 1,873 of the 67,845 |
| R13 | Stale copies | Open Food Facts records created by `usda-ndb-import` (2017 USDA copies) are downgraded | They disagree with current USDA 24.5% of the time, and 15.5% are grossly off (kJ/kcal-style errors) |
| R14 | Freshness | Recorded and shown (label date where known); not used as a pass/fail threshold | Open Food Facts modification time is not label freshness |

### 8.2 Policy tiers

| Tier | Meaning | Ships? |
| --- | --- | --- |
| **Accept** | Passes R1–R13 with label or manufacturer evidence | Yes, in the separate source file, with a source badge |
| **Review** | Passes the hard checks but lacks evidence: no photo, loose energy, unknown basis, or conflicts with USDA | **No.** Excluded until a review path is approved (founder decision F5) |
| **Reject** | Fails any hard check | Never |

### 8.3 Measured reliability

On 326,066 GTINs held by both Open Food Facts and Forge, compared within 10% / 5 kcal and 1 g:

| Open Food Facts record type | Agree | Grossly different (energy ×1.33 or more either way, or zero vs non-zero) |
| --- | ---: | ---: |
| Community and producer records | **87.9%** | **3.8%** |
| `usda-ndb-import` copies | 75.5% | 15.5% |

The residual error in an accepted community record is therefore of the order of a few percent. The policy's R5/R6/R9 checks are designed to cut this further. This must be **re-measured on the accepted set before shipping** (acceptance criterion in C3).

### 8.4 Error taxonomy

From the 7.3F.1 brief, used for reporting and correction.

| Kind | How it is detected | Remedy |
| --- | --- | --- |
| Wrong nutrition data | R4–R6 at build; user report | Exclude or review at build; personal correction for the user |
| Correct per-100 values but confusing serving | Smart Servings conflict states (7.3F.1) | Personal serving label (S4) |
| Outdated label (reformulation) | Cross-source disagreement of 10–33%; user report | Newest source wins at the next build; personal correction now |
| Wrong product/barcode association | R2 prefix check; user report "this isn't the product" | Hide the association locally; never auto-edit the catalogue |

---

## 9. Product-not-found and correction workflows (design)

These fit the **existing** local repository and sync: journal rows of kind `food`, `SourceMeta` provenance, the outbox, and per-account Supabase sync. **No new tables, services or infrastructure.**

### 9.1 Product not found → personal barcode food

1. The 7.3F "Product not found" screen already offers **Search foods** and **Create food**.
2. **Create food** opens the existing `FoodForm`, pre-filled with the scanned barcode (read-only, shown as digits) and a prompt: "Enter the values from the Nutrition Facts label".
3. Saved as a normal saved food (`journal` kind `food`), with `sourceBarcode` (GTIN-14, already validated by `sourceMeta()`) and a new `sourceCatalog: "personal"` value.
4. **Lookup order on scan:**
   1. Personal foods with that GTIN, most recently updated first. This is a local in-memory map built from the user's saved foods, which are a small set.
   2. The bundled catalogue `brandedByBarcode()`.
   3. (C3, if approved) the separate Open Food Facts file.
   4. Not found.
5. **Reuse:** the next scan of that barcode opens the personal food directly in the selected-food step, with the same Smart Servings, meal choice and explicit confirmation.
6. **Sync:** saved foods already sync per account, so the barcode follows the user to other devices. Other users are never affected.
7. **Search alternatives:** **Search foods** pre-fills the query with nothing, because a barcode is not a name. Optionally, a later step could suggest same-brand products using the GS1 company prefix (local, read-only).

### 9.2 Incorrect nutrition → personal correction

1. On a catalogue product, a **"Doesn't match my label"** action opens the food editor pre-filled with the catalogue values.
2. Saving creates a **personal copy**:
   - `sourceId`, `sourceCatalog`, `sourceBarcode` and `sourceBrand` keep the original attribution;
   - `sourceEdited: true`, which [nutrition.ts](../../src/domain/nutrition.ts) `withSourceEdits()` already sets.
3. Future scans and searches show **"Your version"** first, with **"USDA original"** one tap away. The bundled catalogue is read-only and never changes.
4. **History is unchanged.** Logged entries are value snapshots; they are not re-derived from the food.
5. This combines naturally with the deferred **S4 personal serving labels** (7.3F.1), so one mechanism serves both.

### 9.3 Reporting inaccurate data

Under the current constraints (no new backend), recommended options in order:

1. **Local report log plus share sheet.** The report (GTIN, product ID, catalogue version, the user's label values, optional label photo kept on device) is stored locally and exportable to the founder by email or share. No infrastructure. Gives the founder evidence for build-time rules.
2. **Pointer to the upstream.** For USDA data, FDC's public contact; for Open Food Facts data (if C3 ships), a link to edit the product on Open Food Facts. This satisfies Open Food Facts' contribute-back request without Forge sending data automatically.
3. *(Needs approval, F7)* A `food_reports` table in the existing Supabase project. This is new server-side schema and moderation work. **Not proposed for now.**

Reports and corrections **never** change values for other users.

### 9.4 Engine and data-contract impact

- No change to protected calculations (`servingOf`, `choiceError`, `valuesForAmount`, `entryFromLibrary`).
- One additive provenance value (`sourceCatalog: "personal"`) plus a barcode index over saved foods.
- `validateJournal` needs to accept the barcode on user-created foods (today `sourceBarcode` arrives only from the catalogue).

The exact schema and API diff will be presented before integration, as in 7.3E (E8).

---

## 10. Architecture constraints check

| Constraint | Recommendation complies? |
| --- | --- |
| Bundled-first, offline lookup | Yes. Every source is bundled at build time. The USDA API is used only by the build, never at runtime |
| No mandatory online lookup, R2 or other hosting, new subscription, new backend, or runtime download | Yes. ODbL §4.6/§4.7 needs a **public copy** of any Open Food Facts derivative. That is a published static file (e.g. a release attachment), not a runtime service. Still flagged (F4) |
| Startup speed | Unchanged; databases open lazily |
| Query performance | Barcode: one extra indexed point lookup per extra file (sub-millisecond on desktop). Search: a second FTS query merged after USDA and capped. Ranking stays Recent → Saved → Common → Branded (E9) |
| App size | +10.8 MB for the Open Food Facts accept tier (§6.4) |
| Existing user data | Untouched; personal foods are additive journal rows |

---

## 11. Proposed roadmap after M1

| Stage | Work | Expected benefit | Complexity | Main risks | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| **C1 — Personal barcode foods** | §9.1: create-from-scan, personal-first lookup, reuse, sync | Every product the user eats becomes scannable after one entry; fixes the founder's pantry permanently | Low–medium (UI plus the lookup layer; no engine change) | Duplicate personal foods per barcode; user typing errors | A scan → not found → create → rescan opens the personal food, offline. Never logs without confirmation. Syncs to a second device. No effect on catalogue or history. Tests for lookup order, GTIN normalisation, duplicates and Undo |
| **C2 — Personal corrections (+ S4 labels)** | §9.2, plus the deferred personal serving labels | Fixes wrong or confusing catalogue entries for that user | Medium | Users confusing "your version" with the original | Original attribution is visible; "USDA original" is reachable; history unchanged; other accounts unaffected |
| **C3 — USDA refresh procedure** | Adopt the next semiannual download via `sources.json`. Optionally add 11-digit recovery **only with in-USDA corroboration** (F2). Document the update and rollback procedure | Fresher labels; about 1,500+ new GTINs; dedupe of 2,115 duplicate listings | Low (pipeline exists) | Schema drift in USDA files; reproducibility | Byte-identical rebuild; report diff; all rules unchanged; `branded:check` passes; no regressions in the 7.3E ranking set |
| **C4 — Open Food Facts supplement** *(only after licensing review)* | Separate ODbL database, the policy in §8, attribution UI, public derivative copy | ≈ +16.6 pts of scan-weighted coverage; +67,845 products (fewer after R6, R8 and R12) | High (pipeline, licence compliance, UI attribution, query merge) | Licence breach (§9.1 termination); data errors; size +11 MB | Signed-off licensing review. Re-measured agreement ≥ 95% on a held-out USDA-overlap sample. Category-plausibility rejects verified. Attribution visible wherever Open Food Facts data appears. Public derivative published. Size and latency budgets met |
| **C5 — Reporting** | §9.3 option 1 (local log plus share) | Evidence loop for build rules | Low | Privacy of label photos (kept local) | Reports export cleanly; nothing is sent automatically |
| **C6 — Unknown-product UX polish** | Show the scanned digits prominently; "Create from label" as the primary action; optional same-brand suggestions | Faster recovery from not-found | Low | Clutter | Founder iPhone acceptance |

**Recommended order:** C1 → C2 → C3, with the licensing review for C4 started in parallel, then C4 → C5. C6 can ride with C1.

---

## 12. Decisions for the founder

| # | Decision | Recommendation |
| --- | --- | --- |
| F1 | Approve C1 (personal barcode foods) as the next implementation stage | **Approve** |
| F2 | Allow build-time reconstruction of 11-digit USDA UPCs **when corroborated by another USDA listing** (public domain). This is an exception to "never repair check digits" for **published source data only**; scanned codes stay strictly validated | Approve with the USDA-only corroboration rule. Do **not** use Open Food Facts as corroboration until F3 is resolved |
| F3 ⚖ | Commission a professional licensing review of the ODbL plan (§7) before any Open Food Facts data ships | **Required** before C4 |
| F4 ⚖ | If C4 proceeds: accept publishing the Open Food Facts-derived database (or the exact filter method) publicly, as ODbL §4.6/§4.7 require | Decide after F3 |
| F5 | Whether a **review** tier ever ships (e.g. with a "community data" badge) or stays excluded | Keep excluded for now |
| F6 | Fetch the USDA monthly API at build time with a free api.data.gov key, or wait for semiannual downloads | Wait for downloads; small gain |
| F7 | Any server-side reporting table (Supabase) | Defer; use the local report log |
| F8 | Open Food Facts contribute-back: link users out to Open Food Facts for missing products, or not | Link out only, never automatic |

**Professional licensing review needed (⚖):** F3 and F4; using Open Food Facts data as corroboration (§3.3); the treatment of user-copied Open Food Facts data (§7); manufacturer-website data use (§5).

---

## 13. Risks

- **Expectation risk.** Even with every option, scan-weighted coverage is about 77–82% of what Open Food Facts users scan, and lower for brand-new products. Personal barcode foods (C1) are what close the gap for any individual user.
- **Accuracy risk** from community data (§8.3). Mitigated by tiers, cross-source precedence (USDA wins), category plausibility, and visible source badges.
- **Licence risk** (ODbL §9.1 automatic termination). Mitigated by separation, legal review, published derivative, and attribution.
- **Size growth** from a second bundled file (+11 MB).
- **Source drift.** USDA download cadence and Open Food Facts schema changes. Mitigated by pinned releases, digests and byte-identical rebuilds (as in 7.3E).

## 14. Tests planned for implementation stages

- **C1:**
  - lookup precedence (personal → catalogue → none);
  - GTIN-14 normalisation of personal barcodes (UPC-E, iOS EAN-13);
  - duplicate personal foods, where the most recent wins;
  - scanning never logs;
  - Undo, journal snapshots and the duplicate-tap guard;
  - offline;
  - sync round-trip;
  - no change to catalogue rows or history.
- **C2:** original attribution preserved; `sourceEdited` set; history snapshots unchanged; the original stays reachable.
- **C3:** byte-identical rebuild; rule-by-rule counts in `BUILD_REPORT.md`; 11-digit recovery only with USDA corroboration, plus negative tests (conflicting names, 12/13-digit codes never repaired).
- **C4:**
  - policy unit tests for R1–R14 on fixtures, including the Dr Pepper 382 kcal case and kJ/kcal errors;
  - an agreement re-measurement;
  - attribution rendering;
  - licence metadata in the file;
  - query merge ordering and latency budgets.

## 15. What M1 did not do

No production code, data, schema, scanner, UI or calculation changed. No dependency or external service was added. No data from Open Food Facts or the USDA API entered the repository or the app. The only network access was public downloads and queries, used to measure. Nothing in this phase is committed or pushed. Phase 7.3G was not started.

---

## 16. M2 results: personal barcode foods and corrections (implemented)

The founder approved **F1, F5, F6 and F7** and authorised M2. F2 stays research-only, F3/F4 are deferred, and F8 is not part of M2. Stage **C1** (personal barcode foods) and the correction part of **C2** are implemented. Full report: [PHASE_7_3F_2_PERSONAL_FOODS.md](PHASE_7_3F_2_PERSONAL_FOODS.md).

| Item | Result |
| --- | --- |
| Unknown barcode | **Create food from this barcode** carries the scanned GTIN-14 into a label form; values per serving or per 100 g / ml, converted once; saved, not logged |
| Recognition | Personal record first, then the USDA catalogue, offline; survives restart, backup and sync (tested) |
| Corrections | **Correct nutrition** on any USDA product; preferred on scan **and** search; **Use USDA values** and **Remove correction** restore the original; the catalogue is never modified |
| Infrastructure | None added: ordinary saved foods (journal kind `food`) with additive keys; no schema migration; protected engine untouched |
| Duplicates | Refused on save; synced duplicates resolve deterministically (newest update, then earliest created, then ID) |
| F2 | Not implemented: no USDA barcode is repaired; invalid scanned or typed codes are still refused |
| Verification | Logic 479/479; UI 441/443 (the 2 are the Monday-only M-1 Progress tests); typecheck, lint, format, `food-library:check`, `branded:check` (byte-identical), iOS and Android exports all pass |
| Pending | Founder iPhone 17 acceptance (Tests A–C) |
