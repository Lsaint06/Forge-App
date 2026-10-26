# Project REFORGE — Phase 7.3F: Barcode Scanner

**Status:** implemented, verified automatically, and **accepted by the founder on an iPhone 17**: a real Coca-Cola can was scanned and matched.

- **Baseline:** `e41bd41` (Phase 7.3E), identical to `origin/feat/forge-paths-foundation`.
- **Verified on a real device:** camera scanning and matching of a Coca-Cola can (founder, iPhone 17, Expo Go).
- **Not individually verified on a device:** every other workflow (denied permission, torch, typed lookup, unknown products) and offline scanning. These are covered by automated tests only.

## 1. What the lifter does

Nutrition → **Add food** → **Scan barcode** (the ember barcode button beside the search field) → point the camera at the package:

1. **Match:** the product opens in the usual 7.3D/7.3E food step, with name, brand, "Per 100 ml/g", the label serving, Grams or Millilitres, values, meal and day. **Nothing is logged** until **Add to *meal***.
   - Back returns to the camera, so another product can be scanned straight away.
   - After adding, the food list shows "Added … to *meal*" with **Undo**.
2. **Product not found:** a normal result showing the barcode, with **Scan again**, **Search foods** and **Create food**. Nothing is invented and nothing is sent anywhere.
3. **Unreadable code** (bad check digit, incomplete UPC-E): "That barcode couldn't be read", with how to retry. There is no lookup, and digits are never repaired.
4. **Typing the barcode** under the camera uses the same lookup. It is the fallback when the camera is off or unavailable.

## 2. Camera

| Item | Implementation |
| --- | --- |
| Package | `expo-camera` **58.0.12**, installed with `npx expo install` (the SDK 58 version). It is part of Expo Go |
| View | `CameraView`, back camera, `barcodeScannerSettings.barcodeTypes = ["ean13", "ean8", "upc_a", "upc_e"]` |
| Permission | `useCameraPermissions`: asked **once, when the scanner opens**, never earlier. If denied: "Camera access is off" with **Allow camera** (while iOS can still ask) or **Open Settings**; typing still works. In Expo Go the iOS prompt uses Expo Go's wording. In FORGE's own builds: "FORGE uses the camera to scan food barcodes. Nothing is recorded or uploaded." (`app.json` plugin; microphone permission **off**) |
| Unavailable | `onMountError` → "Camera unavailable", typing offered |
| One scan at a time | A lookup guard ignores repeated reads within a frame. `onBarcodeScanned` is detached and `active={false}` (iOS) as soon as a code is read, until **Scan again**. A match unmounts the camera |
| Release | The camera exists only while the scanner step is shown. Back, Close and a match unmount it. An answer arriving after the sheet moved on is ignored |
| Light | Torch toggle (44 pt, inside the frame); off whenever the camera isn't reading |
| Design | Dark camera viewport in a REFORGE card; four ember corner guides (no animation, no flashing); one line of instruction; status below; safe-area-aware sheet; controls at least 44 pt |

## 3. Barcode handling (reuses 7.3E)

- `scannedCode(type, data)` in [barcode.ts](../../src/domain/barcode.ts):
  - **iOS reports UPC-A as `ean13` without its leading zero.** GTIN-14 padding makes it the same code as UPC-A, EAN-13 and GTIN-14.
  - **UPC-E is expanded only when the scanner says `upc_e` and gives all 8 digits.** A shortened UPC-E is never completed.
  - Check digits are never repaired.
- Lookup is the production `brandedByBarcode()`: exact, indexed, read-only, **offline**. No other lookup system exists; the catalogue and logs are never written by scanning.
- **Coca-Cola coverage** (catalogue `2026-04-30`): 207 Coca-Cola products, 195 with barcodes. Among them:

| Barcode | Product |
| --- | --- |
| `049000006346` | Coca-Cola Can, 12 fl oz |
| `049000028904` | Coca-Cola Fridge Pack Cans, 12 × 12 fl oz |
| `049000042566` | Coca-Cola Zero Sugar Can, 12 fl oz |

  Whether a particular can matches depends on the code printed on it.

## 4. Verification

| Check | Result |
| --- | --- |
| TypeScript, ESLint, Prettier | ✅ (the one ESLint warning in `templates-wp3.test.tsx` predates 7.3E) |
| Logic tests | ✅ 457 / 457 (5 new: symbologies, UPC-A via iOS EAN-13, UPC-E rules, invalid codes, the real catalogue finding the Coke can offline) |
| UI tests | ⚠️ 428 / 430. The 2 failures are **M-1** (Progress, Monday-only), unchanged. A 7.3D Add food test that assumed the Breakfast meal (chosen by time of day) was made independent of the time; every food and scanner suite passes at 08:00, 12:00, 18:00 and 22:30 |
| New UI tests (8) | Entry and camera settings; release on Back; one lookup for repeated reads; product step without logging; amount and meal; snapshot with brand and barcode; Undo; scan again from a product; UPC-E; not found with Scan again, Search and Create; unreadable codes; permission asked once, denied, Settings; typed lookup; starting, unavailable; torch; catalogue failure; closing during a lookup |
| Updated 7.3D test | "No scan control" now asserts exactly one **Scan barcode** control |
| Food library check | ✅ 3,730 foods, unchanged |
| iOS and Android exports | ✅. JavaScript bundles grow by 31,954 bytes (iOS) and 30,570 bytes (Android) over 7.3E |

## 5. Limitations

- **On a real device, only the Coca-Cola scan has been verified** (iPhone 17); other paths and offline scanning are verified by automated tests only. Android has not been tried on a device.
- **Real-world finding:** scanning a Chomps stick showed the confusing serving "1.15 oz · 32 g" (no "1 stick"). This is analysed in [PHASE_7_3F_1_SMART_SERVINGS.md](PHASE_7_3F_1_SMART_SERVINGS.md) and is not a scanner fault.
- **Expo Go:** the permission prompt shows Expo Go's text.
- **Coverage:** products outside the USDA Branded Foods catalogue are "Product not found". No online fallback exists, as decided (no external food API).
