# REFORGE asset register

Every font, image or graphic added for REFORGE is listed here before it ships. Rules are in [PHASE_7_0_REFORGE_ARCHITECTURE.md §8](../../audits/PHASE_7_0_REFORGE_ARCHITECTURE.md):

- Bundled files only, so FORGE stays offline.
- No AI-generated or unlicensed imagery.
- No text baked into images.
- People only with model releases.

Artwork is registered in code in [artwork.ts](../../../src/components/reforge/artwork.ts). Tests require every code entry to carry a credit and a licence.

## Fonts

| File | Family / cut | Source | Licence | Added | Used by |
| --- | --- | --- | --- | --- | --- |
| `assets/fonts/BarlowCondensed-Bold.ttf` | Barlow Condensed Bold (700) | [google/fonts `ofl/barlowcondensed`](https://github.com/google/fonts/tree/main/ofl/barlowcondensed), © 2017 The Barlow Project Authors | SIL Open Font License 1.1 ([OFL.txt](../../../assets/fonts/OFL.txt)): bundling and commercial use permitted; the font may not be sold by itself | Phase 7.1A | `displayLabel` role |
| `assets/fonts/BarlowCondensed-ExtraBold.ttf` | Barlow Condensed ExtraBold (800) | same | same | Phase 7.1A | `heroTitle` role |

**Why Barlow Condensed:** Phase 7.0 proofed the shortlisted OFL families against the references' hero titles at matched cap height:

| Family | Width of "GET STRONGER" | Letterforms |
| --- | --- | --- |
| Reference | ≈ 555 px | — |
| Barlow Condensed | ≈ 565 px | Same rounded-square forms |
| Saira Condensed | ≈ 555 px | Squarer and more technical |
| Barlow Semi Condensed | ≈ 640 px | 15–20% too wide |
| Saira Semi Condensed | ≈ 665 px | 15–20% too wide |

Numbers stay in the system face, as the references draw them.

## Images

None yet. Until a slot has approved artwork, `HeroCard` draws a graphical ember glow.

| File | Slot | Source | Author | Licence / receipt | Model release | Added |
| --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — |

## Cancelled: plate artwork

The weight-plate artwork direction (from an AI-generated reference) was cancelled by the founder on 2026-10-24. No renders were integrated or kept. A simpler artwork direction is pending.

## Existing brand assets reused (not modified)

| Asset | Use in REFORGE |
| --- | --- |
| `src/components/splash/wordmark.ts` (paths traced from `assets/splash/brand/forge-wordmark.svg`) | The in-app `Wordmark` / `BrandHeader`, drawn as vector with a steel gradient |
