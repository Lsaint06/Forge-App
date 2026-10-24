# FORGE - Phase 7B WP4A.1: Built-In Offline Food Library

**Status: approved and implemented; awaiting founder review. Not committed.**
Sections 1-15 are the approved research and plan (unchanged except this line);
the implementation, measurements and remaining iPhone checks are in
[Implementation results](#implementation-results-wp4a1) at the end.

Research date: 2026-10-23 (Pacific). Application baseline:
`35972ed34513b4f23ae925ccf8465e83f3d548dc`, `feat/forge-paths-foundation`.
The working tree was clean and the remote branch resolved to this exact commit
before research. WP4A is committed and pushed; its physical iPhone review remains
outstanding. This document does not imply device approval.

## Executive recommendation

- Bundle a curated **FNDDS 2021-2023 backbone**, with **SR Legacy gap-fillers**
  for explicit raw/dry ingredients, fat percentages and preparation states.
- Aim for **1,000-3,000 useful foods**, initially planning around 1,800-2,200.
  Publish the actual accepted count; never pad it with ambiguous records.
- Do not use Foundation Foods in version 1 until its archive discrepancies and
  nutrient qualification handling are reconciled. This is an ingestion gate,
  not a claim that Foundation Foods is nutritionally inferior.
- Use a separate, versioned, read-only **compact JSON asset**, loaded on first
  Nutrition quick-add use, with local token search. Do not seed journal rows.
- Keep Recent and Saved first, then a clearly labeled **Forge foods - USDA**
  section. Catalog details remain read-only; a personal copy is editable.
- Support 100 g, typed grams and verified household portions. Recommend a
  **chosen-portion snapshot using existing per-serving arithmetic**, with
  optional scalar provenance/mass metadata on new copies, subject to approval.
- Preserve every existing nutrition/food record, backup envelope, database schema,
  sync implementation, totals calculation and protected training surface.

Evidence labels:

- **Verified - code:** inspected at the baseline.
- **Verified - documentation:** stated by an official USDA source below.
- **Measured - source:** computed from downloaded official archives.
- **Measured - desktop:** research-only Node benchmarks, not phone results.
- **Proposed:** design, target or acceptance gate; not implemented or measured.

## 1. Baseline and completed WP4A architecture

Read the [WP4A audit](./PHASE_7B_WP4A_NUTRITION_AUDIT.md), including founder
decisions and the implementation/review section. Its pre-implementation sections
are historical: the completed source is authoritative for current behavior.

| Surface | Verified current contract |
| --- | --- |
| [Nutrition](../../src/screens/Nutrition.tsx) | Day-specific meals/totals; quick-add; snapshot copy/save; confirmed deletion; entry editor. |
| [Saved foods](../../src/screens/SavedFoods.tsx) | Personal `food` journals only; search, edit, delete; no source library. |
| [QuickAddSheet](../../src/components/nutrition/QuickAddSheet.tsx) | One sheet with list/detail/create steps, frozen recent ordering, row guards and entry-ID Undo. `FlatList` renders results. |
| [FoodForm](../../src/components/nutrition/FoodForm.tsx) | Per-serving kcal/P/C/F, optional serving text, quantity, meal and notes. Numeric inputs accept comma or point. |
| [FoodEditorSheet](../../src/components/nutrition/FoodEditorSheet.tsx) | Writes only changed fields using `mergeEntry`; retains unknown scalar keys. |
| [Nutrition helpers](../../src/domain/nutrition.ts) | `FoodChoice.source` is currently `recent` or `saved`. `foodKey` is normalized name/serving plus four per-serving values, not a database ID. Recent default quantity is last eaten. |
| [Repository](../../src/data/repository.ts) | `addJournal` allocates a new ID, validates and queues a snapshot inside a transaction. `updateJournal` replaces the payload. Saved-food changes have no cascading relationship to entries. |
| [Journal types](../../src/domain/types.ts), [validation](../../src/domain/validation.ts) | Payload is `Record<string, string \| number \| boolean>`; no objects, arrays or null. Required kcal/P/C/F: finite 0-20,000. Quantity: 0.01-1,000. |
| [Metrics](../../src/domain/metrics.ts) | Totals are raw per-serving values multiplied by quantity; rounding is display-only. No mandatory 4P+4C+9F identity. |

**Important integration detail:** `entryFromFood` and `foodFromEntry` currently
copy a fixed field whitelist. Unknown metadata survives an edit but would not
automatically survive logging a recent/saved choice or saving an entry as food.
Any approved new source metadata must be wired through both helpers and choice
construction, not just added at the catalog click handler.

No schema, repository, backup, sync, totals or validation changes are necessary
for the recommended approach. Existing validation remains a hard boundary.

## 2. Official sources, release currency and licensing

Official sources accessed during this audit:

1. [FDC home](https://fdc.nal.usda.gov/).
2. [Download datasets](https://fdc.nal.usda.gov/download-datasets/).
3. [Data type comparison/documentation](https://fdc.nal.usda.gov/data-documentation/).
4. [Foundation Foods documentation](https://fdc.nal.usda.gov/Foundation_Foods_Documentation/),
   particularly Energy, Weights and Limits of Quantification.
5. [FNDDS documentation/databases](https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/food-surveys-research-group/docs/fndds-download-databases/).
6. [API guide and licensing](https://fdc.nal.usda.gov/api-guide/).
7. [FAQ](https://fdc.nal.usda.gov/faq/), particularly energy and less-than values.
8. [Download field descriptions PDF](https://fdc.nal.usda.gov/docs/Download_Field_Descriptions_Oct2020.pdf)
   is linked by USDA; the field names below were verified against the downloaded
   CSV headers/JSON, not inferred from a PDF text extraction.

The live downloads page lists **April 2026 Foundation Foods**, **FNDDS 2021-2023
released October 2024**, and **April 2018 SR Legacy**. Do not infer an October
2026 release from the usual schedule: it was not listed during this inspection.
The API guide still mentions older FNDDS cycles in introductory prose; use the
actual release listing/archive provenance, not that prose, to pin a build.

### Dataset comparison

| Dataset | Everyday coverage and portions | Nutrient evidence / limitations | Recommended role |
| --- | --- | --- | --- |
| Foundation Foods | Basic commodities/ingredients, detailed sampling; portions are less consistently useful for consumers. | Strong analytical provenance and variability metadata, but incomplete nutrients are legitimate. Different energy IDs, LOQ concerns, and current JSON/CSV discrepancies require care. Normally updated April/October; inspect actual releases. | Future verified upgrades of exact food concepts; not required for v1. |
| FNDDS 2021-2023 | Foods/beverages reported in WWEIA/NHANES; broad cooked foods, mixed dishes, common snacks and household portions. | Compiled representative values, not a lab analysis of the user's meal. Contains unspecified-fat, unspecified-preparation and survey-only portion descriptions. | Primary consumer catalog, with explicit-state foods preferred. |
| SR Legacy | Broad ingredients, raw/cooked states, fat percentages and household weights. | Final historical dataset, incorporating analyses, calculations, imputations and literature. Many fine-grained cuts/variants; not a current branded label database. | Selected exact-concept gaps, identified as historical source data. |

No Branded Foods, Experimental Foods, third-party scraped tables or runtime food
API is needed. Generic values must not be presented as a verified brand recipe.
Prepared-food results need a brief "USDA reference; recipes vary" disclosure.

### Distribution and attribution

**Verified:** the API guide states FDC data are public domain, not copyrighted,
published under **CC0 1.0**, and need no permission for use. A curated subset can
therefore be distributed in a commercial offline app. USDA requests source
attribution and, when possible, notification of the product using the data.
Attribution is requested, not a runtime API or account requirement.

Proposed in-app source text and asset notice:

> Source: U.S. Department of Agriculture, Agricultural Research Service.
> FoodData Central. FNDDS 2021-2023 (October 2024) and SR Legacy (April 2018).
> fdc.nal.usda.gov. Public-domain data (CC0 1.0).
> Selected and labeled by FORGE; USDA does not endorse this app.

Include exact pinned releases in the generated manifest and an accessible source
link in catalog details. Keep USDA wording/provenance separate from Forge's
names, synonyms and curation decisions. Do not use a USDA logo or imply endorsement.

## 3. Actual source inspection and integrity findings

The following **official ZIP downloads were fetched and parsed**, outside the
repository. JSONs were inspected in memory; no distributable catalog was created.
Counts below describe the inspected files, not every record available in FDC.

| Source | Official archive link | ZIP bytes | JSON bytes | Parsed food objects |
| --- | --- | ---: | ---: | ---: |
| Foundation | [April 2026 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip) | 469,303 | 6,721,650 | 363 plus 32 null array elements |
| FNDDS | [October 2024 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip) | 3,835,292 | 66,294,426 | 5,432 |
| SR Legacy | [April 2018 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip) | 13,456,312 | 210,758,826 | 7,793 |

Observed SHA-256 hashes (locally calculated pins, **not USDA-signed checksums**):

```text
Foundation JSON ZIP:
186e988ec542e913f51ef62b86a47758e8cdd0d1dc3889e7b055581f3c09c77a
FNDDS JSON ZIP:
dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb
SR Legacy JSON ZIP:
0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef
Foundation CSV ZIP:
70457ee9d9342f43bda2010318c85f04210c689fdeb9cd2da4c513b0e8dbc655
```

### Coverage and anomalies

- FNDDS: **5,431** records contain finite nonnegative kcal/three macro values
  with expected units. The remaining record is FDC **2705383**, "Milk, human",
  missing the required values; exclude it, never fill zeros.
- SR Legacy: **7,793** pass that basic completeness/unit check. This does not
  make all of them appropriate for the curated catalog.
- Foundation JSON: **311** contain the required macros and at least one valid
  kcal field when historical 1008 is allowed; only **216** pass if energy is
  restricted to 2048/2047. All 363 non-null IDs are unique.
- FNDDS has portion rows for all 5,432 records; SR Legacy for 7,533/7,793;
  Foundation JSON for 285/363. A row existing is not proof it is user-appropriate.
- The [Foundation April 2026 CSV](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2026-04-30.zip)
  contains **469 `foundation_food` rows**, 106 absent from the JSON's non-null
  IDs. A required-field presence check yields 377 CSV candidates, not a final
  quality-approved count.
- Foundation CSV `food.csv` also contains 4,079 `sample_food`, 7,577
  `market_acquisition`, 75,055 `sub_sample_food` and 810
  `agricultural_acquisition` rows. These must not be mistaken for consumer foods.
- Some absent JSON IDs may represent historical versions, but that explanation
  is **not verified**. Null rows and the ID-set difference must be reported and
  reconciled against source lifecycle/history before Foundation ingestion.
- Required nutrient JSON objects inspected did not expose LOQ metadata.
  Foundation CSV `food_nutrient.csv` has no LOQ column in the inspected header.
  Absence of that field is not evidence that a reported zero is an analytical
  absolute zero. Foundation zero/qualification handling remains a gate.

### Representative records (source values per 100 g)

These are evidence/examples, not hand-authored production food records.
P/C/F columns are grams; energy is kcal.

| Data type / FDC ID | Original source description | Energy | P | C | F | Relevant distinction |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Foundation 2646170 | Chicken, breast, boneless, skinless, raw | 112 (2048); 106 (2047) | 22.5 | 0 | 1.93 | Two legitimate energy fields; never sum or average. |
| SR 171477 | Chicken, broilers or fryers, breast, meat only, cooked, roasted | 165 | 31 | 0 | 3.57 | Cooked is not interchangeable with raw. |
| SR 168877 | Rice, white, long-grain, regular, raw, enriched | 365 | 7.13 | 80 | 0.66 | Source cup: 185 g. |
| SR 168878 | Rice, white, long-grain, regular, enriched, cooked | 130 | 2.69 | 28.2 | 0.28 | Source cup: 158 g. Not the raw cup weight. |
| SR 174030 | Beef, ground, 90% lean meat / 10% fat, raw | 176 | 20 | 0 | 10 | Retain fat percentage. |
| SR 171796 | Beef, ground, 85% lean meat / 15% fat, raw (Includes foods for USDA's Food Distribution Program) | 215 | 18.6 | 0 | 15 | Not a duplicate of 90/10. |
| FNDDS 2705385 | Milk, whole | 61 | 3.27 | 4.63 | 3.2 | Source cup: 244 g. |
| SR 173432 | Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or skim) | 35 | 3.37 | 4.86 | 0.18 | Retain skim and fortification distinctions. |
| FNDDS 2707154 | Egg, whole, boiled or poached | 143 | 12.4 | 0.96 | 9.96 | Source "1 egg": 50 g; "1 cup": 135 g. |
| SR 170894 | Yogurt, Greek, plain, nonfat (Includes foods for USDA's Food Distribution Program) | 59 | 10.2 | 3.6 | 0.39 | Keep plain/nonfat. |
| SR 170902 | Yogurt, Greek, vanilla, nonfat | 78 | 8.64 | 10.4 | 0.18 | Do not collapse flavored and plain. |

FNDDS **2708403**, "Rice, white, cooked, NS as to fat", supplies 129 kcal,
P 2.67 / C 28 / F 0.28 and a 163 g cup. Its unspecified-fat qualifier must
not be renamed "no added fat". Prefer an explicit-state record; exclude this
ambiguous candidate from the default catalog if explicit equivalents cover it.

Foundation **746782** (whole milk, 3.25%, added vitamin D) still supplies 1008
(60 kcal) and 1062 (251 kJ), not 2047/2048. This directly disproves a uniform
"every food has 1008" or "Foundation never has 1008" import assumption.

## 4. Source fields and nutrient-selection rules

### Verified mappings

| Meaning | Download JSON field | CSV equivalent / rule |
| --- | --- | --- |
| Food ID/type/name | `fdcId`, `dataType`, `description` | `food.fdc_id`, `data_type`, `description`. Match an explicitly allowed data type. |
| Dataset identity | FNDDS `foodCode`; SR/Foundation `ndbNumber` | Keep alongside FDC ID, not instead of it. |
| Record dates | `publicationDate`; FNDDS `startDate`, `endDate` | Archive release and dietary survey cycle are separate provenance. Do not infer one from another. |
| Nutrient identity | `foodNutrients[].nutrient.id` | `food_nutrient.nutrient_id` joined to `nutrient.id`. NOT the outer nutrient-row `id`, nutrient `number` or array position. |
| Numeric value/unit | `foodNutrients[].amount`, `nutrient.unitName` | `food_nutrient.amount`, `nutrient.unit_name`; values are per 100 g edible food. |
| Protein | Nutrient **1003**, g | Historical nutrient number 203 is a different identifier namespace. |
| Fat | **1004**, g | Total lipid (fat), not saturated fat. |
| Carbohydrate | **1005**, g | Carbohydrate by difference; not sugar, net carbs or the sum of selected fractions. |
| Energy | **1008**, **2047**, **2048**, kcal | **1062 is kJ**, not kcal. Units are checked, case-insensitively. |
| Portions | `foodPortions[].id`, `gramWeight`, `portionDescription`, `amount`, `measureUnit`, `modifier`, `sequenceNumber` | `food_portion.id`, `gram_weight`, `portion_description`, `amount`, `measure_unit_id`, `modifier`, `seq_num`. |
| Derivation | `foodNutrientDerivation`, where supplied | Preserve available derivation/source information in the build audit, not necessarily all of it in the phone asset. |
| Release provenance | Archive URL/date/type/hash plus record fields | Generated manifest and per-record source reference. |

FNDDS portions often omit `amount`; `portionDescription` is the complete
description ("1 egg") and `gramWeight` is the weight of that **whole described
portion**. Its `modifier` can be a numeric survey code; it is not a display label.
SR portions often use `amount` plus `modifier` because `measureUnit` is
"undetermined". A missing amount must not silently become 1.

### Proposed energy policy (versioned independently)

1. FNDDS/SR: select one valid **1008 kcal** value.
2. Future Foundation: prefer valid **2048 specific Atwater**, then **2047
   general Atwater**, then a verified historical **1008**. Retain chosen ID and
   selection reason. This is Forge policy, not a USDA requirement to prefer 2048.
3. Validate the chosen value's units and numeric status. Multiple conflicting
   rows for the same nutrient ID are a build error/quarantine, not "first wins".
4. A missing preferred ID may fall through to the next permitted ID. An
   invalid/qualified preferred value is quarantined for review, not silently
   hidden by a fallback.
5. Do not average energy fields; do not recalculate energy as 4P+4C+9F.
6. **No kJ-only foods in v1.** A later policy could explicitly convert verified
   kJ with kcal = kJ / 4.184, retaining the source and conversion rule. That is a
   unit conversion, not a zero/default; it needs its own fixture and approval.

### Zero, missing, invalid and qualified

| Source state | Proposed handling |
| --- | --- |
| Explicit numeric 0 with no reported qualifier | Preserve as **source-reported zero**; never claim infinite analytical precision. |
| Required nutrient row/amount absent, null or blank | Exclude with `missing-required-nutrient`; never `Number(null)`, `Number("")` or `value \|\| 0`. |
| Negative, non-finite, text, wrong unit, duplicate conflicting row | Exclude/quarantine with an explicit reason; fail a pinned-release regression. |
| Less-than/LOQ-marked required value | Exclude until a defensible policy exists; do not treat a stored 0 as exact. |
| Verified portion/unit scaling | Calculate from source value and verified mass; retain full numeric precision until display. |

USDA explicitly documents that some LOQ values are stored with a component value
of zero and that unavailable LOQs may also appear as zeros. We cannot recover
unpublished precision. The plan does not invent it: source-reported zeros are
distinguished from both missing values and analytically proven absence.
Foundation requires additional qualification verification before it enters v1.

## 5. Catalog coverage and deterministic curation

**Proposed initial coverage budget**, not a manufactured data count:

| Family | Approximate planning allocation |
| --- | ---: |
| Poultry, beef, pork, fish/seafood | 350 |
| Eggs, dairy and dairy alternatives | 200 |
| Rice, oats, pasta, breads and cereals | 250 |
| Fruits | 150 |
| Vegetables | 250 |
| Beans, lentils, other legumes and plant proteins | 180 |
| Nuts, seeds, oils and related spreads | 150 |
| Common snacks | 150 |
| Common beverages | 120 |
| Frequently eaten prepared foods | 200 |
| **Planning total** | **2,100** |

1. Pin release/type and require complete eligible macros/energy first.
2. Classify source rows into reviewed food concepts using a small checked-in
   category/description ruleset. Fail or quarantine unclassified candidates.
3. Record a **semantic identity**: food/cut/species; raw/cooked/dry/canned;
   cooking method; drained/undrained; skin/bone/edible state; fat percentage;
   sweetening/flavor; fortification; added oil/sauce/solution; relevant variety.
   "Unknown" stays unknown, never "plain".
4. Exclude infant/human milk, baby foods, supplements/medical formulas, sample
   rows, obscure survey codes, obsolete branded labels and ambiguous "NFS/NS"
   preparations where an explicit food covers the ordinary use.
5. Rank within **the same explicit semantic identity**, favoring clear everyday
   descriptions, verified usable portions, FNDDS for as-eaten foods and SR for
   ingredient gaps. Use stable FDC ID as final tie-breaker, not input ordering.
6. Select one canonical source per equivalent identity. Never average or splice
   nutrients across records. Different nutrient values are not "true duplicates"
   merely because their shortened names match. Reviewed supersession choices
   retain losing IDs/reasons in the audit.
7. Deduplicate literal repeated IDs and identical semantic/nutrient/portion
   payloads. Preserve materially different states as separate foods. Deduplicate
   identical portion rows only within the same source food.
8. Apply family budgets as upper planning guides. Underfilled groups stay
   underfilled; a count shortfall produces a report, not weaker quality rules.
9. Generate readable names from the ruleset, keeping disambiguators prominent:
   "White rice, long-grain - cooked, enriched"; "Ground beef, 90/10 - raw".
   Original description remains accessible verbatim in details.
10. Use a bounded reviewed alias dictionary, e.g. chickpeas/garbanzo beans,
    courgette/zucchini, aubergine/eggplant, ground/minced beef. Aliases affect
    discovery only, never nutrition or preparation identity.

Deterministic does **not** mean semantic decisions are safely automated from
strings alone. A human reviews the taxonomy, ambiguous concepts and a stratified
candidate report. Exceptions map IDs to naming/classification/selection reasons,
not hand-written nutrient values. Freeze that ruleset and report so reruns are
reproducible. The exact accepted count and per-family distribution remain unmeasured.

## 6. Serving architecture and the WP4A D9 re-evaluation

**Verified:** grams do not inherently require a database migration. The current
formula is flexible enough; reliable mass metadata and edit behavior are the
actual design questions. Never parse arbitrary personal `serving` strings as mass.

For source value V per 100 g and chosen edible mass G:

```text
chosen-portion nutrient = V * G / 100
household portion mass = chosen count * that source portion's gramWeight
daily contribution = stored per-serving nutrient * stored quantity
```

A source "0.5 breast, 118 g" already represents the complete half-breast portion.
Choosing one of that portion means 118 g, not 59 g. Cups/fluid ounces use a
food-specific source weight; never assume 1 mL = 1 g or share weights between foods.
RACC, "quantity not specified", guideline amounts and unusable labels are not
consumer portions. Always offer 100 g and typed grams even when no household
portion qualifies. Household choices are ordered deterministically and capped
for usability, without changing their values.

### Migration-free options requiring approval

| Option | Storage | Advantages | Limitations |
| --- | --- | --- | --- |
| A0: chosen-portion snapshot, existing keys only | Scale V by G/100; `serving: "150 g"`; `quantity: 1`. | No new payload keys or calculation change; fractional grams remain possible; repeat/save works today. | No machine-readable mass or historical source reference. After reopening, only generic serving multipliers can be edited reliably; arbitrary label parsing is unsafe. |
| A1: A0 plus optional scalar mass/provenance **(recommended)** | Same snapshot/arithmetic; retain source IDs/release and frozen serving mass on new records. | Reliable gram editing and provenance survive restart, copy, backup and catalog updates; still no schema migration. | Additive payload metadata and targeted helper/editor changes require approval and round-trip tests. |
| B: fixed 100 g base | Store V, `serving: "100 g"`, `quantity: G/100`. | Smallest catalog adapter; 150 g is 1.5 servings. | Current minimum quantity 0.01 means at least 1 g; current 2-decimal quantity display can misrepresent fractional grams. UI must not relabel all legacy servings as grams. |
| C: 1 g base | Store V/100, `serving: "1 g"`, `quantity: G`. | Direct mass in the multiplier, no metadata necessary for totals. | Existing quantity cap limits to 1,000 g; default quarter-serving controls become quarter-gram controls; per-gram displayed values are tiny. Not recommended. |

**Do not change quantity bounds or `nutritionTotals` to fit a catalog.**
A new structured schema or backup version is unnecessary and is not proposed.

### Recommended A1 detail

- Catalog detail offers **Grams**, **100 g**, and verified household portions;
  use existing number parsing/control patterns, not modified shared workout inputs.
- Default catalog quick-add is explicitly **100 g**, not a guessed "typical"
  portion. Each row shows its default mass and kcal. Tapping the row changes it.
- Proposed gram range: **0.1-5,000 g**, increments 1 g with direct decimal entry.
  This is a UI proposal. Reject a selection whose resulting per-serving values
  exceed existing 20,000 validation bounds; do not silently clamp it.
- Proposed count range: **0.01-100** of a verified household portion, with the
  same total-mass and macro-value bounds. Disallow blank/zero/negative/non-finite.
- Store the selected portion's full values as one serving, quantity 1. Thus a
  150 g portion is a genuine repeatable serving, not a display-only conversion.
- Illustrative optional scalar keys (names subject to implementation review):
  `foodSource: "usda"`, `sourceFdcId`, `sourceDataType`, `sourceRelease`,
  `sourceCatalogVersion`, `sourceBasisGrams`, `sourceValuesEdited`.
  `sourceBasisGrams` describes the stored serving, not an external lookup.
  Do not persist nested source objects or portion arrays in journals.
- On editing mass, use the **frozen entry's** nutrient values and basis mass.
  Never fetch current catalog macros. For existing quantity Q, total mass is
  basis mass * Q; changing to G can rebase values to G with quantity 1.
- Personal edits to name/macros mark the copy edited; changing arbitrary serving
  text invalidates/removes mass metadata. Preserve origin as "based on USDA",
  not "verified USDA values". No automatic rewrite of user values.
- A record without valid recognized metadata stays on the unchanged generic
  servings editor. Never infer mass from legacy text such as "1 scoop".
- Copy/save/recent-choice helpers must preserve the approved metadata whitelist.
  Household text and chosen gram mass must survive restart without the catalog.

**Exact verified arithmetic fixtures:**

- SR cooked rice 168878 at 150 g: 195 kcal; P 4.035 g, C 42.3 g, F 0.42 g.
- Same food at its 158 g source cup: 205.4 kcal, not a generic 240 g cup.
- SR raw rice 168877 at 150 g: 547.5 kcal, not the cooked result.
- FNDDS boiled/poached egg 2707154 at 50 g: 71.5 kcal; P 6.2 g,
  C 0.48 g, F 4.98 g. Two eggs: 100 g and 143 kcal.
- SR roasted chicken breast 171477 at 150 g: 247.5 kcal, P 46.5 g,
  C 0 g, F 5.355 g.

Calculations keep raw precision. Round only the displayed preview/totals.

## 7. Offline asset, size and measured performance

### Desktop methodology and results

Research used Node **24.22.0**, Windows x64, Intel Core i9-14900K. Select the
first 1,000/3,000 eligible FNDDS rows sorted by FDC ID. In memory only, project
ID/name/original description/release/macros/energy ID and up to three
non-survey-placeholder portions. This is a **noncurated benchmark projection**,
not a final catalog, representative food balance, or native implementation.

Measure UTF-8 `JSON.stringify` bytes and gzip bytes, 30 JSON parses, heap delta
after forced GC for parsed records plus a token index, and 15 queries repeated
100 times. Search tests all-token exact/prefix matches, sorts by score/stable ID,
and caps results at 30. Queries include chicken breast/breast chicken, rice cooked,
milk, egg, Greek yogurt, tofu, lentil, banana, salmon, oats, peanut butter,
beef 90, unsweetened and an absent string.

For comparison, create an **in-memory** Node SQLite database with a foods table
containing JSON payloads and an FTS5 index, insert the same projection, measure
page_count * page_size, and time the same 1,500 token-prefix queries (LIMIT 30).
No SQLite catalog file was produced. The SQLite/JSON schemas are prototypes,
not a byte-optimal comparison of every possible schema or ranking equivalent.

| Measure | 1,000 rows | 3,000 rows |
| --- | ---: | ---: |
| Compact JSON bytes | 401,316 | 1,194,652 |
| Gzip bytes (transport proxy only) | 45,389 | 137,579 |
| JSON parse median / p95 | 0.87 / 1.13 ms | 2.60 / 2.78 ms |
| Parsed/indexed heap delta (approximate) | 966,752 bytes | 1,941,152 bytes |
| Token scan/rank p95 / worst observed | 0.09 / 1.09 ms | 0.21 / 1.64 ms |
| SQLite pages incl. FTS5 | 675,840 bytes | 1,941,504 bytes |
| SQLite query p95 | 0.06 ms | 0.11 ms |

Neither these desktop timings nor gzip bytes establish installed phone size,
Hermes memory, startup latency, UI responsiveness, or availability of a particular
FTS option in Expo Go. Adding all original portions, aliases and manifests will
increase bytes. GC heap deltas are approximate and are not native RSS measurements.

### Storage decision

**Proposed JSON for v1:** at this scale both desktop search approaches are far
below a perceptible delay; SQLite's measured query advantage does not justify
asset-copy/open/version management. JSON is easier to inspect, validate and
replace atomically in source control and requires no new runtime dependency.
The raw source archives must never be bundled.

Place compact catalog JSON separately from the exercise/program catalogs.
Defer parsing/index construction until quick-add first needs built-in foods;
do not import the parsed catalog at app root. Cache it for subsequent searches.
Verify the exact Expo/Metro asset-loading approach in implementation: a deferred
JSON require/import may still bundle bytes in Hermes rather than a separate
downloadable asset. It must work in Expo Go, release export and airplane mode;
it must not rely on a development-server fetch.

**Planning estimates, not measurements:** allow up to 2 MiB of uncompressed
catalog payload and up to 4 MiB incremental installed/export footprint for
1,000-3,000 entries, including metadata/portions. Budget 12 MiB native memory
increase after first use. Do not assert zero startup impact merely because
parsing is deferred; measure both binary/export footprint and cold launch.

If native gates fail, first reduce unused metadata/index allocations and
unnecessary rendered rows. Reassess a read-only SQLite asset using existing
`expo-sqlite` only if measured phone results warrant it. No write to the user's
database and no new dependency without an explicit rationale/approval.

## 8. Search architecture and ranking

**Proposed pure local search**, with no network or heavyweight search package:

1. Normalize Unicode/diacritics, case, punctuation and whitespace for search;
   keep display/source text intact. Tokenize once on load.
2. Normalize reviewed spelling/abbreviation aliases. Tokenize numbers and fat
   percentages deliberately: `90/10` and `90% lean` can point to the same
   classified identity, never to all ground beef indiscriminately.
3. Require all meaningful query terms. Support word-order differences. Score
   exact display-name match, then exact tokens/phrase, then token prefixes,
   then reviewed synonyms and lower-ranked description-only matches.
4. Explicit preparation/fat/sweetening constraints are **hard filters**, not
   optional scoring boosts. "Cooked rice" must not return raw rice above it,
   and "unsweetened" must not substring-match "sweetened".
5. When no state is requested, show a clear common variant first but retain
   raw/cooked labels and meaningful variants. Never rename an unknown state.
6. Use an explicit everyday-food priority in the curation ruleset to demote
   obscure variants. No invented usage statistics or healthfulness rankings.
7. Stable tie-break: canonical name then namespaced source ID. No reranking
   after a log while the sheet is open.
8. Cap initial visible results to 30 per source section and offer local
   "Show more". Avoid thousands of rows or unbounded historical matches.

Recent/Saved selection and frozen ordering remain independent of catalog
ranking. For a nonempty query, match all three sources and show Recent/Eaten
before, Saved foods, then Forge foods - USDA. Use the same normalization rules
for matching, without changing personal values or default quantities.

Deduplicate by existing value/serving identity for identical Recent/Saved rows.
Hide a catalog duplicate only if source identity, basis and all snapshot values
are demonstrably equivalent; a renamed/edited personal copy stays distinct.
Use separate **selection IDs** and **snapshot-value keys**: source IDs cannot
replace journal IDs or `foodKey` blindly.

Empty query: show Recent/Saved and a small stable curated "Common foods" group,
so a first-time user sees useful foods immediately without typing. Include a
Browse all action. No-results copy offers changing the search or Create food.
Invalid/incomplete catalog records never enter results.

## 9. Integration with Nutrition and source transparency

- Keep the existing route and one-sheet list/detail/create architecture.
- Catalog detail reuses the detail step/preview/meal/footer, with a portion
  selector and a compact USDA source link. Do not open a second sibling modal.
- Catalog rows show name, preparation/fat qualifiers, default portion and kcal.
  Section labels communicate the source without a badge on every row.
- Catalog macros/source descriptions are read-only. "Save a personal copy"
  creates one ordinary `food` snapshot, with its own ID and default portion.
  Do not add a second favorite table or silently save every logged food.
- The Saved foods screen continues to contain personal copies only. Editing
  one never changes the catalog. If source metadata is approved, show
  "Based on USDA" there rather than implying edited values are official.
- Recent/personal rows keep their usual one-tap amount, regardless of a
  catalog's 100 g default. Search across sources must not coerce all foods
  into a catalog portion model.
- The existing guarded repository mutation performs the write. Keep immediate
  Added/Undo feedback, accessibility announcements, day/meal selection and
  frozen row positions. Undo deletes the returned entry ID, not a catalog ID.
- On failure, retain the input/detail state and show the repository-standard
  error. Do not show Added, release a successful-looking empty snapshot, or
  fall back to guessed/zero nutrient data.
- A malformed/unavailable bundled asset displays an explicit catalog error and
  Retry; personal foods/Create food remain available. This is a visible partial
  availability state, not a silent empty catalog or cloud fallback.

**Tap acceptance:** unchanged two-tap saved/recent logging from a meal (+ Add,
row +). Built-in 100 g default also uses those two taps when visible, plus any
search typing. A changed portion requires row detail and Add; do not pretend
that typing grams or choosing a different meal is still a two-tap workflow.

## 10. History, personal-data and update guarantees

1. Catalog ID, e.g. `usda:survey:2707154`, is a read-only asset identity only.
   Every logged entry or personal copy receives the normal generated journal ID.
2. Logging always stores complete per-serving values, quantity, serving/meal/date
   and approved scalar provenance **by value**. There is no runtime join for totals.
3. Catalog v2 changes only subsequent catalog selections. Entries, recents and
   saved copies retain v1 snapshot values, even if the source ID is removed.
4. Date/meal edits and repeat/copy/save flows preserve snapshot semantics.
   Editing grams uses frozen snapshot mass/values, never the current catalog.
5. Delete a personal copy without deleting meals. Delete a meal without deleting
   catalog records or personal foods. Undo affects exactly one newly logged ID.
6. Do not insert catalog rows into `journal`, import them over personal foods,
   assign their IDs to user rows, or queue the catalog for sync.
7. Backup remains version 1, with normal user journals only. Approved scalar
   metadata already fits its record schema; test its round trip and existing
   sync passthrough without changing either implementation.
8. A restored backup must display/count/edit food snapshots without the original
   catalog version installed and without internet. Do not require an old asset
   to calculate history.
9. Unknown existing keys and scalar types remain unchanged. No migration,
   rebase, relabeling or repair pass over historical records.

## 11. Reproducible build pipeline

**Proposed isolated build-time pipeline; not runtime ingestion:**

1. A checked-in source manifest pins official HTTPS URLs, dataset cycles,
   archive filenames, expected hashes, root array names and selected data types.
   Start with inspected FNDDS/SR JSON pins; do not select "latest" dynamically.
2. Download to a gitignored build cache using standard tooling. Verify hash and
   ZIP integrity, allowlisted members, bounded expanded sizes and expected JSON
   roots before parsing. Reject path traversal and unexpected archive contents.
   Locally calculated hashes detect changed downloads, not prove USDA signatures.
3. Extract with available host ZIP tooling (.NET on Windows, unzip on CI);
   TypeScript builder consumes extracted JSON. No new runtime dependency.
   Pin tool versions/commands in the future pipeline documentation.
4. Parse one source at a time with a bounded Node heap. These input files are
   66/211 MB before parsing, so developer/CI memory is distinct from phone RAM.
   Fail explicitly if a release exceeds the documented build-memory ceiling.
5. Validate rows/types/IDs/dates/nutrient units/completeness and qualification
   metadata. Report rejected nulls and duplicate IDs; no silent `.filter(Boolean)`
   in production ingestion. Research counted nulls only to investigate them.
6. Apply versioned energy policy, eligibility, taxonomy, semantic identity,
   deterministic selection and reviewed exceptions.
7. Preserve canonical source description/ID/type/release and selected nutrient
   IDs. Extract only usable source portions; never transplant portions from
   another source food to fill a gap.
8. Generate display names/search aliases from rules and original descriptions.
   Preserve source numeric precision; do not synthesize macros or serving weights.
9. Sort by stable ID; emit compact UTF-8 JSON, version manifest, attribution,
   output hash and a separate audit/exclusion report. No timestamps in the
   deterministic artifact hash; research/build time belongs in the report.
10. Validate the generated asset independently, run fixtures/search/size gates,
    rerun twice and require byte-identical output.
11. Compare old/new IDs, values, portions, names, missing fields, source dates,
    per-family counts and bytes. A human reviews material changes before release.
12. Bundle only approved output/manifest/notice. Raw archives, full nutrient
    metadata and exclusion reports stay out of the phone asset.

Audit report fields: input hashes/URLs, policy/tool versions, input counts,
accepted counts per family/source, every excluded ID and reason, selected
energy field, duplicate/supersession decisions, renamed descriptions, missing
concepts, portion exclusions, byte sizes and final artifact hash.

Foundation's nulls/JSON-CSV disagreement must not be "fixed" by silently
unioning versions. If it is later introduced, first reconcile historical/current
IDs, verify LOQ/source metadata, choose an authoritative release representation,
and document any build-only CSV parsing dependency separately.

## 12. Proposed code and asset scope

Names are proposals, not files created by this audit.

| Scope | Proposed files / purpose |
| --- | --- |
| New build inputs | `scripts/food-library/sources.json`, `curation.json`: pins, policies, taxonomy, naming/alias rules and documented exceptions. |
| New builder | `scripts/build-food-library.ts`: offline extraction-input validation, mapping, curation, deterministic outputs/reports. |
| New bundled assets | `src/data/food-library/catalog.json`, `manifest.json`, `NOTICE.txt`. No journal seeding. |
| New pure runtime module | `src/domain/food-library.ts`: typed asset validation, search/ranking, source portions, snapshot adapter. Reuse existing Zod/numeric helpers. |
| Targeted changes | `QuickAddSheet.tsx`: third source, portions, personal-copy action, errors/loading. `nutrition.ts`: approved metadata copy/choice types, without changing totals. |
| Conditional A1 changes | `FoodEditorSheet.tsx` and `FoodForm.tsx`: recognize only valid new mass metadata and edit from frozen values. Saved foods/source copy text as needed. |
| Copy updates | `Nutrition.tsx` empty state, `SavedFoods.tsx` help text, README, phone checklist and audit progress references. |
| Tests | `tests/food-library.test.ts`, fixtures and `tests/ui/food-library.test.tsx`; extend existing Nutrition cases where behavior is shared. |
| Build scripts | `package.json` command only if approved for implementation; no dependency changes currently needed. |

**Not modified:** database schema/repository interfaces, validation bounds,
`nutritionTotals`, backup envelope, sync protocol, onboarding, WP2 logger,
WP3 Templates, Progress calculations, workout history/prescriptions/progression,
the 18 curated programs/locks, WP4B, WP4C or WP4D.

Do not add a general search framework, food-recommendation system, barcode flow,
AI estimates, coaching or runtime external API as part of this work.

## 13. Test plan and measurable acceptance criteria

### Data and domain tests

- Pin hashes/root types, verify ID uniqueness and allowed release/type; unknown
  versions fail visibly. Changed input bytes require review, not automatic repin.
- Reject missing/null/blank/negative/non-finite/wrong-unit nutrients; preserve
  source 0. Distinguish qualified zero from absent/invalid. Fixture Foundation
  nulls/missing fields/LOQ and all three energy IDs even if Foundation is excluded.
- Test selection priority, conflicting duplicates, kcal versus kJ, and explicit
  rejection of kJ-only v1 foods. Do not compare all energy to 4/4/9 as an identity.
- Test exact source examples above; scale grams, fractional grams, household
  counts and source half-portions. No premature rounding; tolerance <= 1e-9
  for arithmetic assertions, with display rounding tested separately.
- Test dry/raw versus cooked rice/chicken; 85/15 versus 90/10 beef; whole versus
  skim milk; plain versus flavored/sweetened yogurt; fried versus baked.
- Assert semantically distinct records survive curation even when shortened
  names or calories happen to match. Report same-name collisions explicitly.
- Test deterministic exclusions, true duplicate removal, naming exceptions,
  canonical-source choices, per-family coverage and byte-identical rebuilds.
- Search fixtures: case/diacritics, word order, partial tokens, aliases, negative
  match, exact match first, `sweetened` versus `unsweetened`, fat percentages and
  explicit raw/cooked constraints. Proposed relevance gate: expected canonical
  match in top 5 for >= 95% of a frozen >= 60-query ordinary-food test set;
  **100%** correct hard preparation/fat filtering.

### Repository and history tests (existing real SQLite harness)

- Log a catalog choice and assert a new journal ID, exact snapshot values,
  viewed date/meal and no catalog rows in the writable database.
- Save a personal copy exactly once; editing/deleting it leaves prior meals
  unchanged and never changes the bundled source.
- Add a v1 food, swap to a v2 fixture with changed/deleted source values, then
  assert unchanged daily totals, saved/recent values, gram edits and re-logs.
- Backup export/import preserves old/new snapshots and approved scalar metadata;
  no catalog required to restore. Existing sync passthrough round-trips the
  snapshot unchanged without changing protocol code.
- Existing personal foods/unknown keys remain unchanged; metadata whitelist
  survives log/repeat/copy/save-as-food but does not absorb unrelated keys.
- Manual serving edits invalidate structured mass safely; source-edited state
  never falsely advertises an official unmodified nutrient value.

### UI and offline tests

- First-time user sees built-in foods immediately, can search, choose 150 g and
  log verified values without creating a food/account or accepting targets.
- Recent/Saved stay first and fast; catalog default is visibly 100 g; personal
  quantities and legacy generic servings stay unchanged.
- Repeated same-frame +/Add/Save taps cause one operation; Undo deletes exactly
  the returned entry, not a food/source or an earlier meal. Failed writes
  display errors, preserve the draft and allow retry without duplicates.
- Frozen order while adding/undoing; source sections and accessible labels are
  clear. No infinite result rendering or nested sibling modals.
- Source records cannot be edited; personal copies can. No-results, loading,
  corrupt asset and Retry are visible and do not fabricate values.
- Run with network requests disabled. Assert search/log/recent/save/Undo still
  work; release build cold-start in airplane mode verifies true bundling.
  Expo Go additionally needs a previously loaded JS bundle or a running local
  Metro connection; catalog independence is not a claim Expo Go itself works
  offline on its first ever launch.
- Physical iPhone and Android: compact/standard/large, dark/light, 130% and 200%
  text, keyboard/footer behavior, comma keypad, VoiceOver/TalkBack, readable
  state qualifiers. Retain all outstanding WP4A iPhone checks.

### Native performance gates (proposed, not yet passed)

Measure a release build on a physical compact iPhone and a midrange Android,
record models/OS/build/catalog hashes, and compare against the same baseline
without the asset. Use at least 20 cold launches/first opens and 100 warm
searches; report p50/p95, not one best run.

| Measure | Acceptance gate |
| --- | --- |
| Accepted catalog | Normally 1,000-3,000 complete, useful foods; justified shortfall needs approval, never padding. |
| Asset payload | <= 2 MiB compact JSON including manifest/portion/search data. |
| Incremental installed/export footprint | <= 4 MiB versus baseline, measured separately for each platform. |
| Cold app launch regression | p95 <= 50 ms absolute increase; no catalog parse/index work on unrelated app-start paths. |
| First catalog load + index | p95 <= 150 ms, with a visible loading state if pending. |
| Warm search computation | p95 <= 20 ms for 3,000 entries; cap/slice result work. |
| Keystroke to settled results | p95 <= 100 ms, including any debounce/rendering. |
| Native process memory after first use | <= 12 MiB retained increase versus equivalent baseline screen. |
| Offline use | Zero runtime network requests for load/search/portion/logging. |
| Snapshot/history correctness | No change to existing values; all deterministic fixtures pass. |

If a performance gate fails, publish the failure and investigate; do not claim
desktop numbers passed a native gate or change thresholds after measuring.

### Required regressions

Run the existing scripts, plus the new focused tests during implementation:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run test:ui
npm.cmd run export
```

Coverage must explicitly retain:

- All WP4A domain/UI Nutrition and decimal-input tests.
- WP2 workout logging/copy-forward/finished-workout behavior and decimal parsing.
- WP3 Templates, load units, scheduling and modal interactions.
- Curated-program library validity/fingerprints/locks and all 18 program sources,
  including Strength v2 and Muscle Building v3 regressions.
- Repository, data-safety, backup and sync regressions.

Baseline immediately before this audit passed 265 domain tests and 214 UI tests,
typecheck, formatting and both exports. Lint had one existing WP3 unused-type
warning. Those were WP4A validation results, **not tests of this proposed feature**.
No app validation rerun is needed for this document-only audit.

## 14. Maintenance, risks and approval decisions

### Versioning and maintenance

- Track asset `formatVersion`, independent `catalogVersion`, energy policy,
  curation/alias ruleset versions and pinned USDA release references.
- Namespaced source IDs remain stable within a source record, but USDA can assign
  a new FDC ID to an updated food. Do not infer continuity from a shared name.
  Review changed IDs with source codes/history before declaring replacements.
- Update during reviewed app releases, not by silent background download.
  Check USDA release availability periodically; a calendar schedule alone is
  not evidence a new dataset exists.
- Preserve immutable source pins and human-readable diffs for previous releases.
  No requirement to bundle every historical catalog: snapshots are self-contained.
- Roll back an asset by app release if necessary; never roll back user journals.
- If a data error is discovered, correct future catalog selections and explain
  it in release notes. Historical corrections must remain an explicit user
  action outside this package; do not rewrite old intake.

### Risks and mitigations

| Risk | Mitigation / unresolved gate |
| --- | --- |
| Generic prepared food differs from actual recipe | Label reference nature; retain preparation details; keep personal label creation available. |
| Source-reported zero masks analytical limits | No missing-to-zero coercion; retain qualification distinctions; Foundation deferred pending verification. |
| Foundation archives differ | Do not silently combine or substitute representations; reconcile IDs/history/LOQ before adoption. |
| Semantic grouping hides meaningful differences | Hard state/fat/sweetening identity, reviewed exceptions and adversarial fixtures. |
| Personal snapshot metadata lost on reuse | Update/test every approved helper and copy surface, not just catalog logging. |
| Catalog update alters history through a live lookup | Never calculate totals or edits from current source records. |
| Gram conversion leaks into legacy foods | Recognized mass metadata only; no free-text parsing or global serving-contract changes. |
| Desktop speed does not translate to phones | Physical release-build performance gates before accepting JSON strategy. |
| Catalog count exceeds useful coverage | Report actual categories/shortfalls; accept fewer verified foods rather than near-duplicate padding. |
| Scope expands into training, coaching or cloud | Enforce protected file/diff scope; no implementation of those features here. |

### Founder decisions requested before implementation

| Decision | Recommendation |
| --- | --- |
| Source mix | Approve FNDDS 2021-2023 primary + reviewed SR Legacy gaps; Foundation behind a reconciliation gate. |
| First-release coverage | Target 1,000-3,000, planning near 2,100; no lower-quality padding or promise of a count before curation. |
| Serving persistence | Approve **A1**, chosen-portion snapshots plus optional scalar provenance/frozen mass on new records; no schema migration. A0 is the smaller alternative with generic-only historical serving edits. |
| Default quick-add | Catalog + logs visibly labeled 100 g; personal/recent foods keep their current default amount. |
| Source copies | "Save a personal copy" creates ordinary saved-food snapshots; no separate linked favorite subsystem. |
| Storage/search | JSON + local token ranking provisionally; native gates decide whether SQLite needs revisiting. |
| Preparation policy | Prefer explicit states; omit ambiguous survey variants when ordinary explicit alternatives exist. |
| Portion controls | Grams 0.1-5,000 and counts 0.01-100, always constrained by existing journal validation. |

These are proposals, **not recorded approvals**. The source baseline is ready,
but WP4A's outstanding physical iPhone review should be scheduled rather than
misrepresented as complete.

## 15. Proposed implementation phases

1. **Approve contracts and source policy.** Resolve the decisions above; freeze
   which metadata/serving option is allowed. No database or calculation changes.
2. **Source pipeline and candidate audit.** Implement pinned source validation,
   taxonomy, exclusions and reports. Review coverage/naming/portions before
   accepting generated output; stop if data quality cannot meet expectations.
3. **Read-only asset and pure logic.** Validate the accepted catalog, implement
   offline loading/search/portions/snapshot adapter, pass source/arithmetic/
   ranking/history tests. Measure the actual generated bytes.
4. **Nutrition integration.** Add the third search source, portion selection,
   personal copies, provenance handling and guarded Undo in the existing sheet.
   Preserve legacy forms and all protected surfaces.
5. **Verification and founder review.** Run regression scripts, offline release
   testing and native performance/accessibility gates; update documentation and
   present the measured result for approval.

**Stop point for the research assignment:** the plan only. The implementation
below followed the founder's approval.

## Implementation results (WP4A.1)

Implemented on `feat/forge-paths-foundation` from baseline `35972ed`, uncommitted
for founder review. The plan's recommendations were followed as the specification:
FNDDS backbone with SR Legacy gap-fillers, Foundation deferred, compact JSON,
local search, serving option **A1** (chosen-portion snapshot with scalar
provenance), 100 g quick add, ordinary saved-food copies. Deviations are listed
under [Decisions taken during implementation](#decisions-taken-during-implementation).

### What a lifter can now do

- Open Add food on a fresh install and see **Common foods · USDA** (18 curated
  everyday foods) under the first-use hint; no typing needed.
- Search recent, saved and library foods together, in that order: **Recent / Eaten
  before → Saved foods → Food library · USDA**. Case, accents, plurals and word
  order don't matter; synonyms (garbanzo, courgette, prawn, mince, porridge,
  yoghurt, "cooked" = baked/broiled/roasted/…) are folded in; results are paged 30
  at a time ("Show 30 more").
- **+** logs 100 g of a library food in one tap, with the WP4A double-tap guard and
  Undo. Tapping a food opens its detail: original USDA description, values per
  100 g, a portion choice (**Grams**, or each USDA household portion with its
  weight, e.g. "1 egg · 50 g"), an amount, live calories and macros with the total
  grams, the meal, **Save to my foods**, the source and a FoodData Central link.
- Reopened, a library entry reads "From USDA FNDDS · FDC 2707154 · 2 × 50 g =
  100 g"; after editing its values it reads "Based on USDA … (values edited)".

### Source manifest (pinned, verified)

| Source | Release | Archive SHA-256 (verified on every build) | Records | Included |
| --- | --- | --- | ---: | ---: |
| [FNDDS 2021-2023 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip) | 2024-10-31 | `dfb06ae7ddc397ccd570b91c14b75438ab2ba39f64f22d321f61d4a52a77f3eb` | 5,432 | 3,557 |
| [SR Legacy JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip) | 2018-04 | `0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef` | 7,793 | 173 |
| Foundation Foods | — | Deferred (JSON/CSV discrepancy, LOQ handling unresolved) | — | 0 |

Catalog version `2026.1`, **3,730 foods**. `catalog.json` SHA-256
`2d95151e0c6df2867486b6f0efff2491a26383a46d1760402f22d5d8e29d6001` (528,484 bytes).
Energy for every food is nutrient **1008** (kcal); protein 1003, fat 1004,
carbohydrate by difference 1005, all grams per 100 g. Attribution and licence are
in [manifest.json](../../src/data/food-library/manifest.json) and shown in each
food's detail. Full counts: [BUILD_REPORT.md](../food-library/BUILD_REPORT.md);
every excluded record with its reason: [exclusions.tsv](../food-library/exclusions.tsv).

### Reproducible pipeline

```powershell
npm.cmd run food-library:build              # download if needed, verify, rebuild
npm.cmd run food-library:build -- --offline  # cached archives only
npm.cmd run food-library:check              # rebuild in memory; fail if outputs differ
```

- [sources.json](../../scripts/food-library/sources.json): pinned URLs, releases,
  byte sizes, SHA-256, expected archive members and JSON roots. Archives are
  cached in `.cache/food-library/` (gitignored).
- [zip.ts](../../scripts/food-library/zip.ts): a dependency-free ZIP reader that
  refuses unsafe paths, ZIP64, encryption, oversized members and size or CRC-32
  mismatches.
- [pipeline.ts](../../scripts/food-library/pipeline.ts): nutrient and unit
  validation, energy policy, portions, curation, deduplication, deterministic
  serialization. [rules.ts](../../scripts/food-library/rules.ts) holds every
  curation decision; [featured.ts](../../scripts/food-library/featured.ts) the
  18 common foods (by ID; the build fails if one disappears).
- Outputs (generated, never hand-edited): `src/data/food-library/catalog.json`
  (one food per line, reviewable), `catalog.js` (the same JSON as one string,
  bundled), `manifest.json`, `docs/food-library/BUILD_REPORT.md` and
  `exclusions.tsv`. Two consecutive builds and `food-library:check` produced
  byte-identical outputs.

### Curation and coverage

| Family | FNDDS | SR Legacy | Total |
| --- | ---: | ---: | ---: |
| Meat and poultry | 297 | 62 | 359 |
| Fish and seafood | 128 | 56 | 184 |
| Eggs | 83 | 0 | 83 |
| Dairy and alternatives | 186 | 0 | 186 |
| Grains and cereals | 117 | 27 | 144 |
| Breads and bakery | 261 | 0 | 261 |
| Fruit | 112 | 0 | 112 |
| Vegetables | 338 | 5 | 343 |
| Beans, legumes, plant protein | 99 | 19 | 118 |
| Nuts and seeds | 53 | 0 | 53 |
| Oils and fats | 68 | 0 | 68 |
| Drinks | 274 | 0 | 274 |
| Protein powders and shakes | 1 | 3 | 4 |
| Prepared foods | 936 | 0 | 936 |
| Snacks and sweets | 495 | 1 | 496 |
| Sauces and condiments | 109 | 0 | 109 |
| **Total** | **3,557** | **173** | **3,730** |

How FNDDS was narrowed from 5,432 (1,875 exclusions, each with a reason):
uncurated categories (infant/baby foods, formula, human milk, waters, sugar
substitutes); unspecified "NFS" (238) and "NS as to" (255) records; special
populations (school, WIC); ingredient-only rows; brand-named products (103: survey-era
formulations of named products; packaged foods are logged from their label);
frozen and ready-to-heat packaged meals; survey-coding descriptors ("excluding
carrots, broccoli, and dark-green leafy"); generic meat-with-sauce and dressing
permutations; margarine and animal-fat cooking variants; toasted breads (toasting
removes water only); mixed foods more than two descriptive qualifiers deep; and
named near-identical variants (decaffeinated, reduced sodium, salt level, frozen
vs fresh, wheat vs white sandwich bread, patty size, cooking spray, whole-grain
pasta dishes, restaurant vs home recipe) — **each removed only when its values
per 100 g are within 10 kcal or 5 % and 1 g or 10 % per macronutrient of the
offered record**; materially different variants stay.

SR Legacy contributes only allowlisted ingredients the survey lacks: raw chicken
cuts, ground beef at every fat percentage (raw, broiled patty, pan-browned
crumbles), ground turkey and chicken, turkey breast, lean steaks and pork cuts,
raw and cooked fish, canned tuna/salmon/sardines, shrimp, dry rice/oats/pasta and
other grains (named "dry (uncooked)"), dry beans, lentils and split peas, tofu,
tempeh, raw potatoes, whey and soy protein powder, and maple syrup. Regional
study records, "with added solution" and "without salt" variants are refused; an
SR record whose display name matches an FNDDS food is dropped in favour of FNDDS;
any other name collision fails the build.

Distinctions kept and tested: raw vs cooked chicken, dry vs cooked rice, ground
beef 70-97 % lean, whole vs skim milk, sweetened vs unsweetened, fried vs baked
chicken. Display names are FNDDS descriptions verbatim, or SR descriptions
rewritten by rule (e.g. "Beef, ground, 90% lean meat / 10% fat, raw" → "Ground
beef, 90% lean / 10% fat, raw"); the original description is kept and shown.

**Major gaps** (probed by searching): protein bars and ready-to-drink protein
shakes (FNDDS has them only as brand-named products), casein and collagen,
skyr, seitan, sriracha, creatine and other supplements, and branded/packaged
foods generally. These are logged with Create food from the label. Protein
powders are limited to SR's generic whey (isolate and whey-based) and soy.

### Data integrity and missing values

- A required value that is absent, `null`, non-numeric, negative, non-finite, in
  the wrong unit, or duplicated with a different value excludes the record with
  a named reason. A recorded `0` is kept as the source's zero (in the catalog:
  6 foods with 0 kcal, 105 with 0 g protein, 339 with 0 g carbohydrate, 106 with
  0 g fat — e.g. oils, meats, black coffee). Nothing is filled, defaulted or
  computed from 4/4/9 factors.
- Energy: a present but unusable energy value is refused rather than skipped in
  favour of another field; kJ-only records are refused (no conversion in v1).
- Plausibility: protein + carbohydrate + fat ≤ 101 g and energy ≤ 902 kcal per
  100 g, or the record is excluded.
- The only FNDDS record lacking required nutrients (2705383, "Milk, human") is in
  an uncurated category; every included record has all four values.
- The app re-validates the bundled catalog on load and refuses a damaged one as a
  whole (Add food then shows "Try again"; recent, saved and Create food keep
  working).

### Portions and stored entries (option A1)

| Choice | Stored per-serving values | `quantity` | `serving` | `sourceGrams` |
| --- | --- | ---: | --- | ---: |
| Grams, e.g. 150 g | value per 100 g × 150 / 100 | 1 | `150 g` | 150 |
| Household, e.g. 2 eggs | value per 100 g × 50 / 100 | 2 | `1 egg (50 g)` | 50 |

Plus `sourceId` (e.g. `fndds:2707154`) and `sourceCatalog` (`2026.1`). Daily totals
use the unchanged `nutritionTotals` (value × quantity). Repeat, Copy to today and
Save as food copy these keys by value, so nothing is ever scaled twice. Editing a
value sets `sourceEdited: true`; editing the serving text drops `sourceGrams`.
Typed grams 0.1-5,000 (steps of 10), household portions 0.01-100 (steps of 0.25);
an amount whose single serving would exceed the journal's 20,000 limit is refused
("Log it in smaller parts"). Only binary floating-point noise is removed from
stored values (rounded to a millionth: 0.28 × 150 / 100 is stored as 0.42).

No change to the journal schema, repository, validation, `nutritionTotals`, backup
format or sync. Catalog IDs (`fndds:…`, `sr:…`) are never journal IDs, and the
catalog is never written to the database.

### Asset size and performance

| Measure | Result | Gate |
| --- | --- | --- |
| `catalog.json` / bundled `catalog.js` | 528,484 / 576,432 bytes | ≤ 2 MiB ✓ |
| Hermes bundle growth vs `35972ed` (`expo export`) | Android +556,549 B, iOS +556,347 B | ≤ 4 MiB ✓ |
| Catalog loaded at app start | No (first use only, warmed 300 ms after Nutrition opens) | ✓ |
| Desktop, Node 24 (i9-14900K): parse + decode + index | median 8.9 ms, p95 10.9 ms | — |
| Desktop: search, 15 queries × 100 | p50 0.45 ms, p95 0.71 ms, max 2.6 ms | — |
| Emulator, Expo Go **development** bundle: load | `require` + `JSON.parse` 9-24 ms; decode + index 90-108 ms (3 runs) | 150 ms on a release device: **not yet measured** |
| Emulator, Expo Go development: search (300 timed searches per run, 3 runs) | p50 7.0-10.1 ms, p95 9.9-14.8 ms, max 12-50 ms (GC) | ≤ 20 ms p95 ✓ (dev build) |
| Emulator: JS heap after loading | +4 MiB (Hermes `js_heapSize`); process PSS change within noise | ≤ 12 MiB ✓ |
| Offline | Searched and logged in airplane mode; `fetch` never called in tests | 0 requests ✓ |

Emulator figures were taken with temporary logging (since removed) in the Expo Go
development bundle on the x86_64 Android emulator; release Hermes bytecode on a
phone is expected to be faster, but the plan's release-device gates (cold launch,
first load, keystroke-to-results) still need a physical-device release build.
Shipping the catalog as a JSON string cut the emulator's module load from
107-161 ms to 9-24 ms, and skipping description tokens identical to names cut
indexing from about 155 ms to 75-110 ms.

### Tests

| Suite | Result |
| --- | --- |
| Logic (`npm test`) | 292 passed (265 before + 27 new in [food-library.test.ts](../../tests/food-library.test.ts)) |
| UI (`npm run test:ui`) | 223 passed in 23 suites (214 before + 9 new in [food-library.test.tsx](../../tests/ui/food-library.test.tsx)) |
| TypeScript, Prettier | Pass |
| ESLint | 0 errors; 1 pre-existing warning (`tests/ui/templates-wp3.test.tsx`) |
| `expo export` (iOS, Android) | Pass |
| Expo Doctor | 19/20, as after WP4A: patch releases expo 58.0.19, expo-file-system 58.0.11, expo-font 58.0.10, expo-router 58.0.26, expo-sqlite 58.0.14 are newer than installed; no dependency changed in WP4A.1 |
| `food-library:check` | Reproducible |

New logic tests cover pinned sources and manifest, catalog bytes, the ZIP
reader, missing vs zero vs invalid vs conflicting values, energy selection,
portion extraction, curation reasons and distinct foods, determinism, the
near-identical rule, catalog integrity and cross-checked source values, damaged
catalogs, gram and household arithmetic, ranges, snapshots, repeat/copy/save
without double scaling, provenance on edit, history and backup stability across
a changed catalog, word-order personal search, search normalization, everyday
ranking (29 queries), a 76-query relevance set (≥ 95 % top-5), strict
preparation filters, empty results and offline use. UI tests cover the fresh
install flow (search, 150 g, add, offline), two eggs, one-tap + with double tap
and Undo, Save to my foods, source order, out-of-range amounts, edited
provenance, a failed library with Try again, and the source link. One WP4A test
changed: "kiwi" is now found in the library, so its no-match check uses a food
that isn't. The curated-program locks, WP2, WP3, comma decimals, data safety,
backup and sync suites pass unchanged.

### Android emulator review

Harness: `forge-visual-harness` (`seed14.ts`, `p14.ps1`), Expo Go 58,
screenshots in `forge-visual-harness\shots\android\p14\`. Covered: compact (SE),
standard and large sizes; dark and light; 130 % text; keyboard open; first use;
search; long names; 2-line titles; grams and household portions; Added/Undo;
saved copy; empty results; a 200-result list with "Show 30 more"; recent, saved
and library together; reopened entry; airplane mode. The device database after
logging held exactly the expected snapshot (e.g. `calories 71.5, quantity 2,
serving "1 egg (50 g)", sourceId "fndds:2707154", sourceGrams 50`) and one saved copy.

Fixed during review:

- With the keyboard open on SE, no result was visible: while typing, the day and
  meal shrink to one line (none on short screens) and Create food moves to the end
  of the list. One full result now shows on SE at 100 % and 130 %.
- "cooked chicken breast" found nothing (FNDDS names the method): "cooked" now
  also matches baked, broiled, roasted, grilled, boiled, stewed and similar.
- "skim milk" ranked Greek yogurt first; sauces outranked "steak" and "fries";
  common foods now lead only when the query names them.
- Personal search matched "cooked" inside "uncooked" and needed exact word order;
  it now matches word starts in any order.
- Stored values carried float noise (0.42000000000000004), visible when editing.
- FNDDS portions such as "1 fry, NS as to shape" and turkey neck/tail/back rows.
- A redundant source caption; slow first load (see above).

### Decisions taken during implementation

1. **Count: 3,730, above the 1,000-3,000 planning range.** About 2,000 are
   core single foods; prepared foods, snacks and drinks are the rest. Each
   exclusion rule above removed duplicates or survey permutations; tightening
   further (for example one qualifier for mixed foods) removed staples such as
   cheese pizza, air-popped popcorn and chocolate-chip cookies, so it was not
   applied. `MAX_QUALIFIERS` in rules.ts is the lever if a smaller library is
   preferred.
2. Gram steps are 10 g (typed values accept 0.1 g), not the plan's 1 g steps.
3. Bundled as a JSON string module (measured benefit above), with the reviewable
   JSON kept beside it and tested identical.
4. Personal-food search moved from substring to word-start matching in any order.
5. A library row's + always logs 100 g; recent and saved foods keep their usual
   amounts.

### Known limitations

- Values are survey (FNDDS) or historical (SR Legacy, 2018) references: recipes
  and products vary, and SR is not updated by USDA.
- Some FNDDS names don't say the food is cooked ("Barley", "Millet"); they are
  shown as published, with values per 100 g beside them.
- A logged entry's amount is edited as servings of its stored portion; there is
  no gram re-entry in the editor (the weight is shown).
- "Save to my foods" saves the portion chosen at that moment.
- At 130 % text on SE, "Added · Undo" truncates the food name and the meal
  control shows "Breakf…" (as in WP4A); spoken labels are complete.
- No fuzzy spelling correction; synonyms are a short reviewed list.
- Release-build cold-start, first-load and keystroke latency on physical phones
  are not measured.

### iPhone acceptance checks (outstanding)

1. Fresh profile, airplane mode after FORGE loads: Add food shows Common foods.
2. Search "chicken breast"; open the baked, skin-not-eaten result; type 150 → 242 kcal,
   Protein 45 g; Add to Lunch; the day shows 242 kcal.
3. Search "egg"; choose "1 egg · 50 g"; set 2 → 143 kcal, 100 g; add.
4. + on Banana, raw → added at 100 g; Undo removes it.
5. Save to my foods once; it appears under Saved foods; a second save says it's
   already saved.
6. Reopen a logged library food: the source line and weight read correctly; edit
   calories and confirm "Based on USDA … (values edited)".
7. With the keyboard open on an iPhone SE / mini, at least one result is visible
   and Create food is at the end of the list; on larger iPhones the meal line stays.
8. Dynamic Type at the largest sizes: food rows, the detail values card and the
   Back / Add footer stay readable and reachable.
9. VoiceOver: each result reads its name, 100 g, calories and protein; + reads
   "Add 100 g of …"; Undo, portion chips and the amount control are announced.
10. Comma-decimal region: type "12,5" grams and confirm 12.5 g.
11. Release build (TestFlight): measure cold launch with and without visiting
    Nutrition, first Add food open and typing latency against the plan's gates.

Also outstanding from WP4A: its own iPhone review (keyboard and footers, comma keypad,
day picker over the editor, VoiceOver, midnight rollover).
