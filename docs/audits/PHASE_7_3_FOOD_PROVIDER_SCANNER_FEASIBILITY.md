# Project REFORGE — Phase 7.3: Branded Foods and Barcode Scanning Feasibility

**Status:** research only, for founder review. **No provider or scanner integration is authorized.** Nothing in the app, data or dependencies was changed.

**Gate for:** 7.3E (branded foods) and 7.3F (barcode scanning). See [PHASE_7_3A_REFORGE_NUTRITION_ARCHITECTURE.md](PHASE_7_3A_REFORGE_NUTRITION_ARCHITECTURE.md) §7 and §10.

**Method:**

- Each claim was checked against provider documentation, licence texts and pricing pages.
- Claims that could not be confirmed at a primary source are marked **unverified**.
- The Open Food Facts rate limits and API status were re-checked directly in its API documentation on 2026-10-25.

**App constraints that decide feasibility:**

- Logged entries keep a **permanent, independent snapshot** of values plus source identifiers. History never depends on a catalogue (7.3A §6).
- The app works **offline-first**.
- Store distribution may be **closed-source**, so share-alike data obligations matter.
- Testing happens on iPhone through **Expo Go**, with no custom development client.

---

## 1. Providers compared

| Provider | Coverage | Barcode | Licence | Cost | Bundle / store values? | Attribution | Key risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **USDA FoodData Central — Branded Foods** | US (and NZ) branded and private-label products, commonly cited at ~1.5–2 M records (**exact count unverified**) | `gtinUpc` on every record | **CC0** (public domain) | Free; API key 1,000 requests/hour; bulk download | **Yes, without restriction** | Citation requested, not required | Manufacturer-submitted, not independently verified: label rounding, missing ≠ zero, stale SKUs, duplicate GTINs (USDA documents these). Bulk download refreshed **twice a year** (April, October); the API monthly |
| **Open Food Facts (OFF)** | ~4 M products worldwide, crowd-sourced; US subset less complete than EU (**secondary source**) | Barcode is the key (`/api/v3/product/{code}`; v2 deprecated) | Database **ODbL 1.0**; contents DbCL; images **CC BY-SA 3.0** | Free | **Live lookups: yes, with attribution. Bundling a subset creates a Derivative Database: ODbL share-alike applies** | Required wherever the data is shown, and in the store listing | Rate limits **15 product reads / min / IP**, **10 searches / min / IP** (not for search-as-you-type), per user when calls come from devices. A custom User-Agent is required. Data accuracy not assured. Crowd-sourced duplicates |
| **FatSecret Platform API** | 2.3 M+ foods, 62+ countries, extensive barcode data (provider claim) | `food.find_id_for_barcode` | Proprietary terms | Basic free: 5,000 calls/day, US only; Premier is paid | **Only IDs may be stored indefinitely; other content must be deleted or refreshed within 24 h** | "Powered by FatSecret" | **Conflicts with permanent snapshots** unless written permission is obtained |
| **Edamam Food Database** | ~900 k foods, ~680 k UPCs | UPC search | Proprietary | Free tier, then from $14 / month | **Storage prohibited** unless explicitly permitted | Mandatory | Incompatible with snapshots and offline use |
| **Spoonacular** | US grocery products | UPC endpoint (**path unverified**) | Proprietary | Free, then $29–$149 / month | **Cache at most 1 hour** | Per terms (**unverified**) | Incompatible with snapshots |
| **Nutritionix** | ~1.05 M grocery items, 48 k brands (provider page) | UPC search | Proprietary | Paid, MAU-based (**pricing unverified**, quote only) | Caching on paid plans; bulk licence is a paid add-on | Required below top tier | Cost; terms not public |
| **Chomp** | ~900 k branded foods | Yes | Proprietary | Tiered (**third-party source, unverified**) | Indefinite only on the top tier (**unverified**) | Below top tier | Verify directly |
| **Open Food Repo** | Swiss / EU products | Yes | CC BY 4.0 claimed (**unverified**) | Free (claimed) | Likely permitted (**unverified**) | Yes | Little US coverage |
| GS1 / 1WorldSync / Syndigo | Upstream source of USDA Branded Foods | B2B | Enterprise GDSN licences | Enterprise | — | — | Pays for data USDA already publishes as CC0 |

## 2. Recommendation (for decision; not implemented)

### 2.1 Primary: USDA Branded Foods as a curated offline bundle (7.3E)

**Why it fits the founder's rule** ("useful, identifiable products, not record counts"):

- It has identifiable brand owner and product names, GTINs, and the printed serving size with per-serving and per-100 g values.
- It is CC0, so it can be bundled with no share-alike obligation.
- It matches the existing reproducible USDA pipeline: a build script, a manifest, and SHA-256 locking.

**Selection:** a filtered subset, never the whole dataset. Proposed inclusion rules:

- Calories, protein, carbohydrate and fat are all present (missing is not zero).
- A parseable serving size and gram weight.
- A valid GTIN check digit.
- A brand owner present.
- One record per canonical GTIN, keeping the latest publication.
- Not discontinued where flagged.
- A product-category allowlist suited to a lifter's diary.

The **≥ 10,000 useful records** target is feasible from a dataset of this size. The exact number that survives the filters can only be known by building the subset. **Unverified until the 7.3E build.**

**Size:** the current 3,730 generic foods are ~528 KB of JSON. A 10,000-product subset with brand and GTIN fields would be roughly 1.5–2 MB. This is an **estimate** to confirm in 7.3E. Larger catalogues should use a compact, separately loaded format and lazy indexing, as the current library does.

**Updates:** rebuild with each April / October USDA release, with a manifest diff for review.

### 2.2 Fallback: Open Food Facts live barcode lookup (7.3F)

- A barcode not in the bundle is looked up on OFF (`/api/v3/product/{code}`).
- Requests use a FORGE User-Agent; the usage form OFF requests is filled in.
- Results are shown with an inline "Nutrition data: Open Food Facts (ODbL)" credit.
- **Never bundle an OFF subset**, which would trigger ODbL share-alike.
- Searching OFF as the user types is not permitted (10 / min); OFF is used for exact barcode lookups only.

### 2.3 Scanned items, snapshots and unknown barcodes

- **Canonical key:** every barcode is normalised to **GTIN-14** (zero-padded) after a GS1 modulo-10 check-digit test. UPC-A, EAN-13 and EAN-8 for the same product then match across the bundle, the cache and OFF. UPC-E needs expansion to UPC-A first.
- **Logging:** stores the existing **snapshot** (per-serving values × quantity) plus source and barcode identifiers. This needs a **separate data-model proposal** before fields are added (7.3A §6).
- **Local scan cache:** a device-only cache of products the user looked up, so a repeat scan works offline.
- **Unknown barcode:** fall back to manual entry from the label (the existing create-food form). Optionally invite the user to contribute the product to OFF.

### 2.4 Not recommended as primary

FatSecret, Edamam, Spoonacular and, on current terms, Chomp all limit storage to between 1 hour and 24 hours, or prohibit it. That conflicts with permanent diary snapshots unless a written exception is negotiated. Nutritionix's pricing and terms are quote-only.

## 3. Barcode scanning in Expo SDK 58

| Option | Works in Expo Go | Symbologies | Notes |
| --- | --- | --- | --- |
| **`expo-camera` `CameraView`** (`barcodeScannerSettings`, `onBarcodeScanned`) | **Yes** (physical devices; no simulator camera) | EAN-13, EAN-8, UPC-A, UPC-E, ITF-14 and others | **Recommended.** A new dependency (`npx expo install expo-camera`), so it needs founder approval. In Expo Go the camera prompt uses Expo Go's own wording; FORGE's `NSCameraUsageDescription` applies only in a development or store build |
| `expo-barcode-scanner` | — | — | **Deprecated and removed** (docs page 404). Do not add |
| `react-native-vision-camera` + code scanner | **No** (needs a development build) | Broad | Only if `expo-camera` proves insufficient; it would end Expo Go testing |

**Device test plan (7.3F):**

1. Grant the permission; deny it, and see a clear way to manual entry.
2. Scan real products in each symbology (UPC-A, EAN-13, EAN-8, UPC-E).
3. A corrupted code is rejected by the check digit before any lookup.
4. A bundled product resolves instantly offline.
5. An OFF-only product resolves online and shows its credit.
6. An unknown code offers manual entry.
7. Airplane mode: the bundle and cache work; online lookup fails clearly.
8. One scan logs once, even when the camera reports the same code repeatedly.
9. Low light and glare.
10. iPhone and Android.

## 4. Licensing obligations and open questions

**Obligations if the recommendation is adopted:**

- **USDA:** cite "U.S. Department of Agriculture, FoodData Central" (requested), as the existing library does.
- **OFF lookups:** show an attribution notice wherever OFF data appears ("Contains information from Open Food Facts, available under the Open Database License"), on an app-wide credits screen and in the store listing.
- **OFF images:** CC BY-SA 3.0 with possible packaging copyright. **Recommendation: do not display OFF product images.**

**Open questions (counsel or provider):**

1. Does saving a user's **own** looked-up OFF product into their permanent diary, and into a device-only cache, remain "Produced Work" use rather than a Derivative Database? Ask OFF at reuse@openfoodfacts.org.
2. Would FatSecret grant written permission for permanent diary snapshots, if it is ever considered?
3. Exact USDA Branded Foods record count and bulk file size: confirm from the current release in 7.3E.
4. Open Food Repo's licence: verify before any use.

## 5. Founder decisions for 7.3E / 7.3F

| # | Decision | Recommendation |
| --- | --- | --- |
| B1 | Branded-food source | **USDA Branded Foods (CC0) as a curated offline bundle** · a paid commercial API (needs storage terms) |
| B2 | Inclusion rules and size | **The rules in §2.1. No artificial cap (founder, 7.3B review): as many useful, reliable products as pass the filters, within app-size, memory and search-latency budgets; never loaded into memory whole** |
| B3 | Barcode fallback | **OFF live lookup by barcode only, with attribution; never bundled** · USDA-only (no fallback) |
| B4 | Ask OFF to confirm the snapshot / cache question | **Yes, before 7.3F ships** |
| B5 | Scanner | **`expo-camera` (new dependency, Expo Go compatible)** · VisionCamera (needs a development build) |
| B6 | Data-model proposal for product identifiers (brand, GTIN, provider id) on entries and saved foods | **Prepare at the start of 7.3E** |
| B7 | Attribution | **Inline credit on OFF-sourced items plus an app-wide data-sources screen** |
| B8 | Update cadence | **Rebuild with each USDA April / October release** |

## 6. Sources

- USDA FoodData Central: <https://fdc.nal.usda.gov/api-guide/>, <https://fdc.nal.usda.gov/GBFPD_Documentation/>
- Open Food Facts API documentation (rate limits, User-Agent, v3 current): <https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md>
- OFF data and licences: <https://world.openfoodfacts.org/data>, <https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/>
- ODbL 1.0: <https://opendatacommons.org/licenses/odbl/1-0/>
- FatSecret: <https://platform.fatsecret.com/api-editions>, <https://platform.fatsecret.com/docs/guides/storable-data>, <https://platform.fatsecret.com/terms>, <https://platform.fatsecret.com/docs/v2/food.find_id_for_barcode>
- Edamam: <https://developer.edamam.com/food-database-api>
- Spoonacular: <https://spoonacular.com/food-api/pricing>
- Nutritionix: <https://www.nutritionix.com/database>
- Chomp (third-party pricing, unverified): <https://chompthis.com/api/cost-calculator.php>
- Expo camera (SDK 58): <https://docs.expo.dev/versions/latest/sdk/camera/>; `expo-barcode-scanner` removed: <https://docs.expo.dev/versions/latest/sdk/barcode-scanner/>
- VisionCamera code scanner: <https://visioncamera.margelo.com/docs/barcode-scanner>
- GS1 check digit: <https://www.gs1.org/services/check-digit-calculator>
- OFF coverage comparison (secondary): <https://selfhostednutrition.org/comparisons/database-coverage-foss-trackers-2026/>
