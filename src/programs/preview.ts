// Development builds only (`npm start` / Expo Go): draft programs can be
// previewed and enrolled to test the real Forge Paths flow on a device.
// Production bundles compile __DEV__ to false, so drafts are never listed,
// enrolled or resolved there.
export const draftPreviewEnabled =
  typeof __DEV__ !== "undefined" && __DEV__ === true;
