# FORGE Phase 7.3F.2 M3.1 — Branded Food Coverage Expansion

**Licensing, architecture and isolated prototype.** Research and non-production prototyping only.

> **Status (2026-10-26): M3.1 closed. M3.2 is BLOCKED pending licensing clearance.** The founder has emailed Open Food Facts asking for licensing clarification (M3-D9). Open Food Facts production integration is on hold until OFF's answer and qualified legal review (M3-D1) are in hand. Only the research tooling (`scripts/research/off-coverage/`) and this report are committed; no OFF data, snapshot or generated database is.

- No Open Food Facts (OFF) data is in Forge's assets, catalogues, repository or Nutrition experience.
- No production code, barcode precedence, attribution UI, nutrition calculation or USDA rule was changed.
- Phase 7.3G was not started.

Prepared 2026-10-26 for founder review. Builds on [PHASE_7_3F_2_FOOD_COVERAGE.md](PHASE_7_3F_2_FOOD_COVERAGE.md) (M1).

> **This is not legal advice.** §2 is an engineering reading of the licence texts and published guidance. It identifies what qualified counsel must decide; it does not decide it.

---

## 0. Summary for the founder

### What the prototype shows (measured)

The prototype was built from a pinned OFF snapshot of 2026-10-26: 13.26 GB, SHA-256 verified, with two identical runs.

| | Result |
| --- | --- |
| OFF products sold in the US/Canada and **absent from Forge's USDA catalogue** | 453,452 unique barcodes |
| … passing a strict policy (**accept**) | **50,386** |
| … needing review (missing evidence, units or serving; OFF quality warnings) | 157,635 |
| … rejected (no brand, in-store codes, missing or contradictory nutrition) | 245,431 |
| Standalone accept-tier database | **7.2 MB** (3.9 MB compressed) |
| Barcode lookup / search on it (desktop) | ~0.02 ms / ≤ 3.4 ms (an iPhone measurement is still required) |
| Share of OFF users' US/Canada scan volume Forge would recognise | **59.5% today → 67.2%** with the accept tier (+7.6 points); a further 13.5 points sit in review |
| Agreement with USDA where both have the barcode (accept tier) | 80.5% agree; **3.1% grossly different**; 1.6% opposite g/ml basis |

**Honest bottom line:** a strict, accuracy-first OFF supplement is a **meaningful but modest** gain.

- **Where it helps:** fitness brands. Barebells gets 8 of its 20 most-scanned barcodes, Optimum Nutrition 8, Prime 7 and Ghost 5. The top-200 supermarket items rise from 66% to 74%.
- **Where it doesn't:** several headline gaps stay in **review**, because OFF doesn't record whether a drink's values are per 100 g or 100 ml (most new Dr Pepper and Celsius cans), or has no label photo.
- **Why not loosen the rules:** relaxing them to capture those would trade accuracy for count, which the brief forbids.

### Licensing in one paragraph

Shipping any OFF-derived catalogue makes Forge a distributor of an **ODbL Derivative Database**. That means:

- attribution in the app and in the file;
- the derivative licensed under the ODbL;
- **a free public copy** of it (or of the exact method that made it);
- a parallel unrestricted copy, because App Store distribution restricts access to the bundled file.

Forge's proprietary **app code is not affected**: the ODbL excludes software (§2.2a/2.3a). The serious open question is whether filling USDA's gaps with OFF records **and de-duplicating by barcode** makes the combination, including Forge's USDA curation, a single Derivative Database rather than a Collective one. The most-cited published guidance (the OpenStreetMap Foundation's) treats almost exactly this pattern as **not** a safe collective database. **Separate SQLite files do not settle it.** Qualified legal review is required before any production distribution.

### Recommendation

1. **Commission legal review now** (§2.5, decision M3-D1), with the specific questions listed.
2. **In parallel, make the M3.2 build production-grade, not shipped:**
   - accept tier only;
   - separate file, separate connection, never joined;
   - attribution UI designed but behind a build flag;
   - phone measurements.
3. **Ship only after counsel signs off** and the public-copy channel exists (M3-D3).
4. **Do not loosen rules for coverage.** Instead, consider a narrowly scoped, evidence-backed rule for drink basis (M3-D7) once legal is clear.

---

## 1. Baseline

| Item | State |
| --- | --- |
| Branch / HEAD | `feat/forge-paths-foundation` @ **`53229ee`** (M2: personal barcode foods and corrections), pushed; working tree clean before M3.1 |
| Production branded source | USDA FoodData Central Branded Foods, release **2026-04-30** (204,270,542 B, SHA-256 `57b0f122…2256`). **CC0 public domain** |
| Production catalogue | `usda-branded-2026-04-30.db`, schema 4, content digest `5c8a5788…a727`, 404,982 products / 395,354 barcodes, 64,737,280 B (29.3 MB gzip) |
| Production quality rules | [rules.ts](../../scripts/branded-catalog/rules.ts): market, Euromonitor, discontinued, name/brand, unit, serving, energy/macro presence, negative, impossible, 4/4/9 energy consistency, prepared |
| User sources | Personal barcode foods and corrections (M2): per-account journal rows, first in lookup |
| Licensing assumption today | Only USDA (CC0) data is bundled. **No ODbL obligations apply to the current app** |

---

## 2. Licensing findings (Open Food Facts / ODbL 1.0)

### 2.1 Sources consulted (2026-10-26)

| Source | Status |
| --- | --- |
| ODbL 1.0 full text (opendatacommons.org/licenses/odbl/1-0/) | Read: §1 definitions, §2–4, §4.4–4.8, §9 |
| ODC Licenses FAQ (opendatacommons.org/faq/licenses/) | Read |
| OFF Terms of use, contribution and re-use (world.openfoodfacts.org/terms-of-use) | Read |
| OFF data page and "License: be on the legal side" tutorial | Read |
| OSMF Collective Database Guideline (endorsed 2016-06-17) | Read. OSM-specific, **not binding for OFF**; cited as the most developed published interpretation |
| OFF wiki "ODBL License" (attribution how-to) and "ODbL non-compliance" registry | **Not retrieved**: protected by an anti-scraping proof-of-work page. **Must be read manually** by the founder and counsel |

### 2.2 Answers to the brief's questions

**a. Can an independently stored OFF database coexist with the USDA database?**

Yes, technically. Legally, coexistence is allowed: the ODbL permits Collective Databases (§3.1c, §4.5a).

The catch is in the definition. A "Collective Database" is the Database "**in unmodified form** as part of a collection of independent databases". Forge's file is filtered, normalised and re-structured. It is therefore a **Derivative Database** (§1: "Extracting or Re-utilising… a Substantial part of the Contents in a new Database"; §4.4b).

§4.5a still lets a collection *include* a Derivative Database without the whole collection being ODbL, but the derivative itself must be ODbL. Whether the two definitions fit together this way for Forge's design is **question Q1** for counsel.

**b. What separation avoids an unintended combined derivative?** The engineering separation the prototype uses, necessary but not proven sufficient:

- separate file;
- no shared tables and no foreign keys;
- no OFF values written into USDA rows;
- USDA never modified using OFF;
- no stored cross-references;
- separate database connections;
- results composed only at display time.

**Not sufficient on its own:**

- The OSMF guideline says physical separation is neither required nor sufficient for "independence".
- Its example of a proprietary list "complemented" by ODbL data "removing any duplicate objects" falls **outside** the safe harbour.
- Forge's plan (OFF fills USDA's barcode gaps; OFF records whose barcode USDA has are dropped) is structurally that example (**Q2**).

**c. Does matching records across databases create obligations?**

| Kind of matching | Effect |
| --- | --- |
| *Using USDA to filter OFF* (drop OFF barcodes USDA has) | Changes only the OFF derivative, which is ODbL anyway |
| *Using OFF to change, verify or enrich USDA records* | Would make the USDA catalogue a derivative of OFF, putting Forge's whole curated catalogue under ODbL share-alike. Examples: M1's F2 barcode corroboration, filling USDA servings, correcting USDA nutrients. **Must never be done** (rule R-SEP-2 in §8) |
| *Runtime precedence* (look up USDA first, then OFF, by barcode) | Produces a result shown to the user, a **Produced Work** (§4.5b). Whether a key-based lookup across both is a "reference" that defeats independence (as the OSMF guideline treats joins) is **Q2** |
| *Users copying OFF values into personal foods or corrections* | Private, per-account, not "Publicly" used (§1 "Publicly"). Likely outside share-alike, but sync to Forge's cloud and multi-device use should be confirmed (**Q5**) |

**d. What attribution must appear inside Forge?**

- **ODbL §4.3:** a notice reasonably calculated to make any person exposed to the output aware that content came from the database and is available under the ODbL. The licence's example: "Contains information from Open Food Facts, which is made available here under the Open Database License (ODbL)", with links.
- **OFF terms of re-use:** "mention the licence and attribute the authorship to Open Food Facts with a link to https://openfoodfacts.org … or **the product page**, when the information … pertain[s] to a specific product. Such attribution is also necessary for derivative works."
- **OFF's own reuse checklist** asks for prominent UI attribution with clickable links on product pages, search screens and About/Settings.

**Practical minimum (design for M3.2, not built):**

- a source pill "Open Food Facts" on every OFF-sourced row;
- on the product step, "Source: Open Food Facts · ODbL", with a link to that product's OFF page and to the licence;
- an About / Licences entry with the full notice;
- the notice and licence URI in the database file's `meta` table (§4.2b–d), already done by the prototype.

**e. Must the OFF-derived database be publicly downloadable?** Effectively yes:

- **§4.6:** anyone who Publicly Uses a Derivative Database or a Produced Work from one must offer recipients, free of charge over the internet, either (a) the entire Derivative Database, or (b) the alterations or "the method of making the alterations… (such as an algorithm)".
- **§4.7 (technological measures):** App Store distribution places the bundled file in a sandbox users can't freely access. Forge must then also offer an **unrestricted copy** "at least as accessible" as the restricted one (§4.7b).

Publishing the generated file at a stable public URL satisfies both. Publishing only the method (4.6b) may not satisfy 4.7b (**Q3**).

**f. Does publishing the data require publishing Forge's proprietary code?** **No**, on the licence text:

- The ODbL covers databases, not "computer programs used in the making or operation of the Database" (§2.3a).
- The app is a separate work, and the screens it renders are Produced Works (§4.5b).
- Only the derivative database must be ODbL (including its schema, §2.2a).

**Caveat:** if Forge chooses §4.6b (publish the *method* rather than the file), the method must be disclosed. It can be written as documentation of the rules, but any published scripts would expose the small pure modules they use (`barcode.ts`, `servings.ts`). Publishing the file avoids this.

**g. What happens when the underlying dataset changes?**

- Each snapshot is used under the licence as received. Rights last for the duration of the database rights (§3.1) and are terminable only for breach (§9.1: **automatic** termination).
- OFF may change future licensing (§3.3), but that does not revoke a licence already granted.
- **Every shipped rebuild is a new Derivative Database**: each needs the notices and a public copy for as long as it is distributed.
- OFF exports do not report deletions (the delta files can't), so removed or corrected products persist in old builds until the next full rebuild. Plan periodic full rebuilds, never patching.
- Trademark, personality or privacy claims on individual products are outside the ODbL (§2.3c, §2.4). A takedown process is needed (**Q6**).

### 2.3 Licensing decision matrix

| # | Obligation or question | Source | Forge approach if shipped | Status |
| --- | --- | --- | --- | --- |
| L1 | In-app attribution with links (product page, search, About) | ODbL §4.3; OFF terms; OFF checklist | Source pill, product-step source line with OFF product link and licence link, About/Licences notice | **Founder decision** (UI design, M3-D5); legal sign-off on wording |
| L2 | Licence notice in and with the database file | §4.2b–d | `meta` table: licence, contents licence, attribution, snapshot, SHA-256 (prototype does this); notice in app docs | Resolved by design |
| L3 | Derivative must be licensed under ODbL | §4.4a | The OFF-derived file is published as ODbL. Forge's serving labels inside it become ODbL too | Resolved by design; **accept the consequence** (M3-D2) |
| L4 | Collective vs derivative for the *combination* (USDA + OFF + app precedence + barcode de-dup) | §1 definitions, §4.5a/b; OSMF guideline (by analogy) | Strict separation (§8 R-SEP rules); USDA never altered by OFF | **Unresolved: legal (Q1, Q2)** |
| L5 | Public, free copy of the derivative or of the method | §4.6 | Publish each shipped file (and its build report) at a stable public URL | **Founder decision** (channel, M3-D3); legal: is 4.6b alone enough? (Q3) |
| L6 | Unrestricted parallel copy (app sandbox as a technological measure) | §4.7 | The same public file | **Unresolved: legal (Q3)** |
| L7 | Proprietary code stays proprietary | §2.3a, §4.5b | No code published if the file itself is published | Resolved, with the 4.6b caveat |
| L8 | Never use OFF to modify, verify or enrich USDA records | §4.4, §1 "Derivative Database" | Hard rule R-SEP-2; M1's F2 corroboration via OFF stays off | Resolved by design |
| L9 | Users' personal copies of OFF values | §1 "Publicly", §4.4 | Treat as private per-account data | **Unresolved: legal (Q5)** |
| L10 | Images are CC BY-SA (and may contain third-party rights) | OFF terms | **No OFF images** used or bundled | Resolved by design |
| L11 | Contents (individual facts) | DbCL 1.0 | Facts used as published; attribution per L1 | Resolved |
| L12 | Accuracy disclaimer, no warranty | OFF terms; ODbL §7 | "Values from Open Food Facts contributors" in source text; existing correction flow | Founder decision (wording) |
| L13 | Termination on any breach | ODbL §9.1 | Compliance checklist gate in the release process | **Legal: reinstatement path?** (Q7) |
| L14 | Contribute-back (a request, not an obligation) | OFF data page | Optional link-out (M1 F8); never automatic | Founder decision (M3-D8) |
| L15 | Enforceability for a US distributor (no US sui generis database right; ODbL also a contract) | ODC FAQ | Treat as binding regardless (ethics and reputation; OFF keeps a public non-compliance list) | Legal context (Q8) |
| L16 | Updates: each rebuild is a new derivative | §4.6, §3.3 | Pinned snapshots, full rebuilds, public copy per shipped version, kept while distributed | Resolved by design |

### 2.4 Questions for qualified counsel

| # | Question |
| --- | --- |
| Q1 | Does a *filtered, restructured* OFF subset (not "unmodified form") shipped beside a CC0 USDA catalogue qualify for §4.5a treatment of the collection, or does the definition of "Collective Database" exclude it? |
| Q2 | Does runtime precedence (lookup by barcode in USDA, then OFF), plus build-time exclusion of OFF records whose barcodes USDA has, make the USDA catalogue, or the combined result, a Derivative Database? Is the OSMF "removing any duplicate objects" example persuasive for OFF data? |
| Q3 | Does publishing the method (§4.6b) suffice, or must the file be published? Does the iOS/Android app sandbox count as a technological measure under §4.7, requiring an unrestricted parallel copy? |
| Q4 | Exact attribution wording and placement acceptable under ODbL §4.3 and OFF's terms (per-product links in an offline app: is a link text enough when offline?) |
| Q5 | Are users' personal foods and corrections created from OFF values, synced to Forge's cloud for the same user, "Public Use"? |
| Q6 | Takedown and correction obligations for trademark or other third-party claims on product data |
| Q7 | Reinstatement after an inadvertent breach (§9) |
| Q8 | Governing law and enforceability as a contract for a US company distributing worldwide through the app stores |

**Recommended companion step:** a short, non-binding email to `reuse@openfoodfacts.org` describing the separated design (M3-D9). OFF invites this, and its view would inform counsel.

---

## 3. Prototype architecture (isolated, non-production)

```
scripts/research/off-coverage/          (research tooling; not imported by the app)
  snapshot.json   pinned snapshot: URL, Last-Modified, bytes, SHA-256, licence, attribution
  rules.ts        pure quality rules (accept / review / reject + reasons)
  rules.test.ts   10 unit tests  →  npx tsx --test scripts/research/off-coverage/rules.test.ts
  build.ts        stream, verify, classify, de-duplicate, compare with USDA, write DB + report
  bench.ts        sizes, desktop lookup/search timings, brand / supermarket probes
.cache/off-research/                    (gitignored; never committed)
  openfoodfacts-products.jsonl.gz       the pinned snapshot (13,262,350,813 B)
  off-us-2026-10-26.db                  accept tier, standalone (7,200,768 B)
  off-us-2026-10-26-with-review.db      accept + review, for size estimates only
  candidates.tsv, report.json, bench.json, build logs
```

**Pipeline (build.ts):**

1. Classify every GTIN in the pinned USDA release with the **production** rules (`judge`, `deduplicate`): catalogue, excluded (with reason), or absent.
2. Stream the OFF snapshot, hashing it on the way. The run fails on any size or SHA-256 mismatch with `snapshot.json`.
3. Keep US-tagged records with a **valid** GTIN-14 (`gtin14`; never repaired) and a US/Canada GS1 prefix.
4. Judge each record (§4). One record per GTIN: the newest wins, and disagreeing duplicates go to review.
5. Barcodes already in the USDA catalogue are **not added**. They are used only to measure how the policy agrees with USDA.
6. Write a standalone SQLite catalogue (schema `off-research`: `meta`, `brand`, `serving_label`, `product` with `gtin UNIQUE`, FTS5 like production), deterministic row order, and a content digest over every row.
7. Write `report.json` and `candidates.tsv` (every in-scope barcode with its verdict and reasons).

**Isolation guarantees:**

- Outputs live only in `.cache/`, which is gitignored and outside `assets/`.
- The app never imports `scripts/research`.
- The USDA catalogue is opened **read-only**.
- No production file was edited.
- The prototype reuses production `gtin14`, `readHousehold` and the USDA `judge` / `deduplicate` read-only, so its rules match production identity and serving behaviour.

**Reproducibility:**

| Run | Content digest of the accept database | Accept + review digest |
| --- | --- | --- |
| Rules v1, runs 1 and 2 | identical: `d0d91f00…b8cd` | identical: `d47246bc…f9cf` |
| Rules v2 (final), runs A and B, plus a closeout run | identical: see §5.6 | identical |

The reports matched field for field. Each full run takes about 7 minutes on the desktop.

---

## 4. Data-quality rules (rules v2)

Every record gets **every** applicable reason. Any reject reason rejects it; otherwise any review reason holds it for review; only a record with no reasons is accepted. **No questionable record is accepted to increase the count.**

| Check | Reject | Review |
| --- | --- | --- |
| Barcode identity | Invalid GTIN (never repaired); in-store / variable-weight prefixes | — |
| Product | Not food; marked obsolete (discontinued); no name or unusable name; no brand | — |
| Core nutrition | Missing energy, protein, carbs or fat; marked "no nutrition facts"; values only as prepared; negative; > 902 kcal or macros > 105 g per 100 g (150 per 100 ml) | — |
| Energy consistency (production 4/4/9 rule) | Gross contradiction (more than 20 kcal off and ratio outside 0.5–2) | Loose (ratio outside 0.8–1.2) |
| Value source | Estimates from ingredients are **never** used | — |
| One input set | Values from **one** manufacturer or packaging set (as sold) or the legacy per-100 fields; **never blended** | — |
| Basis (per 100 g vs 100 ml) | — | Not stated; serving and package units disagree; drink recorded by weight |
| Serving | > 2 kg / 2 l | None; unit not stated; unit differs from basis (no density conversion) |
| OFF quality flags | Errors on energy or core macros (totals over 105, kcal/kJ swapped, saturated fat > fat…) | Warnings: very high / very low **for category** (energy, macros, sugars), "3 or more values identical", serving vs package anomalies; other (non-core) errors |
| Category plausibility (narrow, defensible bands, per 100) | — | Outside the band: plain water 0–5, diet soda 0–10, soda 0–65, energy drink 0–75, juice 0–85, milk 0–100, vegetable oil 600–902, protein bar 150–600, potato chips 350–650 kcal. **Exempt:** syrups, concentrates, powders, drink mixes, energy shots, cooking sprays |
| Evidence | — | No nutrition-label photo **and** no manufacturer or producer-platform source |
| Provenance | — | A 2017 USDA-import copy (M1: these disagree with current USDA 24.5% of the time) |
| Cross-source | — | USDA itself excluded this barcode (USDA's verdict stands) |
| Duplicates | — | Several OFF records of one GTIN disagree beyond label rounding |

**Calibration from v1 to v2 (one change, evidence-based).** OFF's "kcal does not match value computed from other nutrients" and "kcal does not match kJ" checks flagged **correct US labels**:

- Steel-cut oats at 375 kcal with P 12.5, C 67.5, F 6.25: 4/4/9 gives 376.
- Balsamic vinegar at 333 kcal with C 80: 4/4/9 gives 320.
- US labels print no kJ at all.

v2 therefore relies on the production 4/4/9 check for energy consistency on every record and ignores those two OFF checks; kcal/kJ swaps still reject. Effect: accept rose from 36,741 to 50,386. The gross-disagreement rate against USDA stayed **3.1%**.

---

## 5. Measured results (rules v2)

### 5.1 Funnel

| Step | Records |
| --- | ---: |
| JSONL records in the snapshot | 4,837,307 |
| US-tagged | 990,571 |
| … invalid GTIN | 68,876 |
| … outside US/Canada GS1 prefixes (mostly foreign goods mis-tagged as US) | 141,131 |
| **Unique in-scope barcodes** | **780,564** |
| … already in Forge's USDA catalogue | 327,112 |
| … **not in Forge** | **453,452** |
| → **accept** | **50,386** (11.1%) |
| → review | 157,635 (34.8%) |
| → reject | 245,431 (54.1%) |

**Accepted records:**

| Measure | Breakdown |
| --- | --- |
| Basis | 44,270 per 100 g; 6,116 per 100 ml |
| Serving name (production Smart Serving rules) | 39,324 named ("1 bar", "1 can"); 11,062 "1 serving" |
| Value source | 29,524 legacy fields; 20,862 new-schema packaging or manufacturer sets |
| Evidence | label photo for 50,228; manufacturer / producer-platform source for 173 |

### 5.2 Why records don't qualify (first reason)

| Reason | Records |
| --- | ---: |
| Reject: no brand | 110,715 |
| Review: no nutrition-label photo or manufacturer source | 86,695 |
| Reject: in-store / variable-weight code | 61,312 |
| Review: nutrition basis (g or ml) not stated | 36,741 |
| Reject: no energy value | 35,877 |
| Reject: missing protein, carbs or fat | 16,972 |
| Review: OFF quality warning | 12,662 |
| Review: no serving size | 11,208 |
| Reject: no product name | 9,096 |
| Reject: energy contradicts macros (4/4/9) | 5,753 |
| Review: energy loosely matches macros | 5,339 |
| Reject: OFF error on core nutrition | 4,814 |
| Review: 2017 USDA import copy | 1,290 |
| Review: drink by weight / unit disagreements | 2,300 |
| Review: USDA excluded the barcode | 999 |
| Other | 1,293 |

### 5.3 Reliability against USDA (barcodes both have)

| Tier (if the barcode were new) | Agree (10% / 5 kcal / 1 g) | Differ | Grossly differ (> 33% energy) | Opposite basis |
| --- | ---: | ---: | ---: | ---: |
| Accept | 21,801 (**80.5%**) | 4,448 (16.4%) | 841 (**3.1%**) | 425 (1.6%) |
| Review | 212,679 (85.7%) | 27,699 | 7,869 (3.2%) | 8,321 |

**Interpretation:** disagreement shows inconsistency, not which side is wrong.

- Most USDA records are 2021–2023 Label Insight labels, so many differences will be reformulations.
- About 3% gross disagreement is the order of residual risk in accepted OFF data.
- The review tier agrees *more* because it holds the 2017 USDA-import copies.
- **Identity conflicts:** 119 of 27,090 accept-tier overlaps (0.44%) share no meaningful word with USDA's name. Most are naming variants; some are real misattributions (e.g. "Canned Yams · Great Value" on a Kroger barcode).
- **Duplicates:** no GTIN had more than one OFF record after normalisation.

### 5.4 Benefit: tested vs projected

**Tested (exact barcode matches against both files):**

Popularity-weighted coverage uses OFF `unique_scans_n` on in-scope barcodes (209,014 scans):

| Source | Share of scans | Cumulative |
| --- | ---: | ---: |
| USDA catalogue (today) | 59.5% | 59.5% |
| + OFF accept tier | 7.6% | **67.2%** |
| OFF review tier | 13.5% | (80.7%) |
| OFF reject | 19.3% | — |

Named brands, among OFF's US/Canada barcodes for each brand. "Top 20" means the brand's 20 most-scanned barcodes; rejected records have no parsed brand and are excluded from these counts.

| Brand | Known (excl. rejects) | USDA | OFF accept | OFF review | Top 20: USDA | Top 20: + accept | Top 20: review |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dr Pepper | 378 | 304 | 14 | 60 | 8 | 4 | 8 |
| Chomps | 66 | 17 | 17 | 32 | 12 | 2 | 6 |
| Fairlife / Core Power | 124 | 36 | 25 | 63 | 16 | 3 | 1 |
| Celsius | 38 | 7 | 3 | 28 | 4 | 0 | 16 |
| Ghost | 267 | 55 | 81 | 131 | 10 | 5 | 5 |
| Barebells | 133 | 4 | 38 | 91 | 4 | 8 | 8 |
| Prime | 316 | 65 | 90 | 161 | 10 | 7 | 3 |
| Quest | 456 | 175 | 55 | 226 | 18 | 1 | 1 |
| Premier Protein | 229 | 77 | 59 | 93 | 13 | 4 | 3 |
| Optimum Nutrition | 176 | 37 | 54 | 85 | 7 | 8 | 5 |
| Kirkland | 945 | 89 | 268 | 588 | 8 | 6 | 6 |
| Great Value | 3,862 | 2,333 | 296 | 1,233 | 18 | 1 | 1 |
| **Supermarket: 200 most-scanned US/Canada products** | — | 132 | 16 | 18 | — | → **74%** | (reject 34) |

**Dr Pepper detail (exact GTINs):**

- In USDA: the 2 L, 20 oz, 1 L and multipack cases, Diet Dr Pepper and Cream Soda.
- Accepted: Cream Soda Zero Sugar (035490), Zero Sugar (038675, 039108).
- **Held for review:** most regular, Zero Sugar, Blackberry and Creamy Coconut cans (e.g. 082098, 082470, 082609, 082647, 082951, 035308, 040661). Their OFF records either don't state g vs ml or record the drink by weight; three others carry OFF serving warnings (038750, 038774, 040579).
- Including those would require a *basis inference for drinks*, a rule decision (M3-D7), not a data fix.

**Projected (not measured):**

- A real Forge user's hit rate. OFF users' scans are a proxy, and products unknown to both databases are invisible.
- Phone latency on the OFF file (§6).

### 5.5 Data-quality failures discovered

1. **Missing g/ml basis on drinks.** Legacy OFF records often lack both serving and package units, so per-100 values can't be tied to grams or millilitres (36,741 first-reason records, many of them drinks).
2. **Per-serving values typed into per-100 fields.** Examples: Lindor truffles at 230 kcal/100 g, pistachios at 170 kcal/100 g. These are caught by OFF's category warnings, which is why those warnings stay in the review list.
3. **OFF's kcal cross-check is unsuited to US labels.** It is EU-oriented and flags correct US labels (§4 calibration).
4. **Imported 2017 USDA copies.** They disagree with current USDA in a quarter of cases, often grossly (kJ/kcal-style errors); kept in review.
5. **Mis-tagged countries.** 141,131 "US" barcodes use foreign GS1 prefixes.
6. **Records without a brand.** 110,715 (mostly scan-only stubs).
7. **In-store codes.** 61,312 restricted-circulation codes (deli, produce, store-packed).
8. **Brand misattribution on shared barcodes.** About 0.4% of overlaps.
9. **Unusable serving units** (mmol/l, kJ, %) and ml-as-g serving quantities in older records.
10. **Names that repeat or are only the brand.** Measured on the accept tier: 2,562 of 50,386 names (5.1%) start with their own brand (`Kinder Bueno` with brand `Kinder`), which the current USDA-style display would print twice. Another 298 names (0.6%) *are* just the brand (`bubly`), which says little about the product. Neither is changed by the prototype. Trimming a repeated brand for display, and treating brand-only names as review, are M3.2 decisions.

### 5.6 Reproducibility of the final rules

Rules v2, runs A and B and the closeout run: accept database `b06b57b2…ab9f` in all three; accept + review database `25ba4295…a2aa`. The reports were identical apart from file paths.

---

## 6. Size and performance

| Measure | USDA catalogue (production) | OFF accept tier (prototype) | OFF accept + review |
| --- | ---: | ---: | ---: |
| Products | 404,982 | 50,386 | 208,021 |
| File | 64,737,280 B | **7,200,768 B** | 27,918,336 B |
| gzip -9 (≈ download growth) | 29,258,507 B | **3,921,751 B** | 14,646,874 B |
| Barcode lookup, desktop (2,000 hits) | median 0.018 ms, 95th 0.023 ms | median 0.019 ms, 95th 0.022 ms | — |
| Unknown barcode, desktop | 0.017 / 0.018 ms | 0.018 / 0.019 ms | — |
| FTS search, desktop, simplified query (warm) | `ch` 37 ms, `chicken` 13.7 ms, `quest` 0.07 ms | `ch` 3.4 ms, `chicken` 1.7 ms, `quest` 0.04 ms, `barebells` 0.04 ms | — |

**Installed footprint of adding the accept tier:**

| Platform | Growth |
| --- | --- |
| App bundle | +7.2 MB |
| iPhone | About +7.2 MB total. The 7.3E iPhone measurement showed the asset-to-SQLite copy is an APFS clone (0 MB extra; release build unverified) |
| Android | About +14.4 MB (asset plus a real copy) |
| Store download | About +3.9 MB |

The combined bundled catalogues would be 71.9 MB.

**Phone performance (projected, not measured):**

- 7.3E measured the 9× larger USDA file on the iPhone 17: barcode median 0.12 ms, 95th percentile 0.14 ms; worst search (`ch`) 52 ms against a 100 ms budget.
- A second, 7 MB catalogue queried after USDA adds one indexed lookup per scan and one smaller FTS query per search.
- **An iPhone measurement is required in M3.2** (as 7.3E did) before any decision to ship.

**Recommended size budget:** an OFF catalogue of **at most 10 MB uncompressed and 5 MB compressed** (about 15% of USDA), plus a review if a rebuild grows it by more than 20%.

- The accept tier fits.
- The review tier (27.9 MB) does not, and its quality doesn't justify it.

---

## 7. Proposed multi-source lookup (future, if approved)

**Order:**

1. **The lifter's personal food or correction** (M2). It stays first and unchanged.
2. **USDA Branded Foods** (CC0, bundled).
3. **Open Food Facts accept tier** (ODbL, separate bundled file), only if approved.
4. **Not found → Create food from this barcode** (M2).

**Rules:**

| Rule | Meaning |
| --- | --- |
| **R-SEP-1** | Separate files, separate read-only connections; no `ATTACH`, joins, shared tables, foreign keys or stored cross-references |
| **R-SEP-2** | OFF data never modifies, corroborates or fills USDA records (no derivative of USDA); USDA is only used to **exclude** OFF barcodes at build time |
| **R-ONE** | A product's values always come from **one** source row. Values are **never** combined or averaged across sources; nothing is "filled in" from the other source |
| **R-PREC** | One barcode, many sources: personal > USDA > OFF. The winner is shown with its source pill; other sources are reachable ("Use USDA values" already exists for personal records). OFF builds exclude USDA barcodes, so USDA and OFF overlap only when a newer USDA release adds a barcode; then USDA wins at runtime until the next OFF rebuild drops it |
| **R-PROV** | Source pill per row ("USDA Branded" / "Open Food Facts"). OFF product step: brand, "Source: Open Food Facts contributors · ODbL", link to the product's OFF page and the licence, snapshot date |
| **R-SEARCH** | Personal and recent foods, then generic foods, then USDA brands, then a separate **"More products · Open Food Facts"** section (separate FTS query, capped). Never interleaved, so provenance stays obvious and ranking stays predictable |
| **R-ENGINE** | An OFF row maps to the existing `LibraryFood` shape (per 100 g or ml, serving, Smart Serving name) with source ID `off:<GTIN-14>`. The protected functions and `entryFromLibrary` are unchanged; `sourceLabel` gains "Open Food Facts". Records without a serving stay out (review) |
| **R-HIST** | Entries keep snapshotting values with `sourceCatalog` (e.g. `off-us-2026-10-26`); rebuilds never touch history |
| **R-CORR** | Personal corrections work for OFF products as for USDA ones; removing one restores the OFF values |

**Conflicts across sources** (USDA vs OFF on one barcode, only after a USDA update) are never merged. USDA is shown, and the build report lists the overlap.

---

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Share-alike reaches Forge's USDA curation (combined derivative) | R-SEP-1/2; legal Q1/Q2 **before** shipping; ability to drop the OFF file without touching USDA |
| Licence breach terminates rights automatically | Release checklist: notices in file and app, public copy published, attribution visible; counsel-approved wording |
| Residual wrong values (about 3% gross vs USDA) | Accept tier only; evidence required; the 4/4/9 check; category warnings; visible source; one-tap personal correction (M2) |
| Users mistake OFF values for USDA | Source pill and product-step source line; separate search section |
| Identity misattribution (about 0.4%) | Source shown; personal correction; build-time name/brand cross-check against GS1 company prefix (M3.2) |
| Size growth over time | 10 MB / 5 MB budget; build report diff; review gate at +20% |
| Snapshot reproducibility (OFF replaces the nightly file) | Pinned SHA-256; the cached snapshot is the reproducible copy; the public copy of each shipped DB is the long-term record |
| Phone performance unknown | iPhone measurement in M3.2 (as in 7.3E) |
| Coverage expectations | Report scan-weighted gains, not product counts; personal barcode foods (M2) remain the guaranteed fallback |

---

## 9. Recommended M3.2 plan (production preparation, gated)

**Status: BLOCKED** pending licensing clearance: OFF's reply to the founder's clarification email and qualified legal review (M3.2-0). No M3.2 step starts until both are in hand.

| Step | Work | Gate / acceptance |
| --- | --- | --- |
| M3.2-0 | **Legal review** of §2 (Q1–Q8). The founder emailed `reuse@openfoodfacts.org` on 2026-10-26; awaiting a reply | Written sign-off on the design, attribution wording and public-copy method. **Nothing ships without it** |
| M3.2-1 | Promote the prototype to `scripts/off-catalog/`: pinned sources file, `--check` byte-identical rebuild, build report (like `branded:build`), CI cache; GS1 company-prefix brand cross-check; display handling of names that repeat or equal the brand (§5.5 item 10) | Two identical rebuilds; rules unit tests; report reviewed |
| M3.2-2 | App data layer behind a **build flag (off by default)**: separate asset and install like `branded-install.ts`; `offByBarcode`, `searchOff`; R-SEP / R-ONE / R-PREC | Unit and UI tests: precedence, no blending, history snapshots, personal-first, offline; production behaviour unchanged with the flag off |
| M3.2-3 | Attribution UI (pill, product source line with links, About/Licences) | Founder design approval; legal wording |
| M3.2-4 | **iPhone measurements** (install, size, cold/warm lookup, search, memory), as 7.3E M1 | Within budgets (barcode ≤ 20 ms p95; search ≤ 100 ms; ≤ 10 MB) |
| M3.2-5 | Public-copy publication pipeline (each shipped DB plus report at a stable URL) | Exists **before** the first build that contains OFF data |
| M3.2-6 | Founder acceptance on device, then enable the flag | Founder approval |

---

## 10. Decisions requiring founder approval

| # | Decision | Recommendation |
| --- | --- | --- |
| M3-D1 | Commission qualified legal review of the ODbL questions (§2.4) | **Yes, before any shipping work** |
| M3-D2 | Accept that the OFF-derived file (and Forge's serving labels within it) is published under ODbL | Required if OFF ships |
| M3-D3 | Where the public copy lives (a public repository's releases, a static page). A free public file is *not* a runtime service, but it is a publication channel that needs approval | Decide with counsel |
| M3-D4 | Ship the **accept tier only**; review stays out (consistent with M1 F5) | **Yes** |
| M3-D5 | Attribution UI (§7 R-PROV) | Approve the design in M3.2-3 |
| M3-D6 | Size budget: 10 MB uncompressed / 5 MB compressed | **Yes** |
| M3-D7 | Whether drinks with no stated basis may ever be treated as per 100 ml, e.g. only with a label photo **and** an ml serving text. This is an inference rule, so it is a decision, not a fix | Defer until after legal review; measure its effect first |
| M3-D8 | Optional link-out to OFF for missing or incorrect products (M1 F8) | Optional |
| M3-D9 | Contact OFF (`reuse@openfoodfacts.org`) about the design | **Done:** the founder sent the clarification email on 2026-10-26; awaiting a reply |

---

## 11. Verification of the research tooling

| Check | Result |
| --- | --- |
| `tsc --noEmit` (whole project, includes `scripts/research`) | ✅ |
| ESLint on `scripts/research` | ✅ |
| Prettier | ✅ (`scripts/research/off-coverage`) |
| Rules unit tests (`npx tsx --test scripts/research/off-coverage/rules.test.ts`) | ✅ 10 / 10 |
| Snapshot integrity | ✅ SHA-256 verified on every full run |
| Determinism | ✅ identical digests across two runs (v1 and v2) |
| Production suites | Not affected (no production file changed; see §0) |

**Reproduce:**

1. Download `snapshot.json`'s URL into `.cache/off-research/` (or use the cached copy).
2. `npx tsx scripts/research/off-coverage/build.ts` (about 7 minutes, 12 GB Node heap).
3. `npx tsx scripts/research/off-coverage/bench.ts`.
