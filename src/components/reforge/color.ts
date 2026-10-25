// react-native-svg drops the alpha channel of a gradient stop's colour and
// uses `stopOpacity` alone, so `rgba(…, 0.2)` would paint at full strength.
// A stop's colour alpha is therefore moved into its opacity here (pure, so
// it is unit-tested in node).

const RGBA =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d*\.?\d+)\s*)?\)$/i;
const HEX8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i;

export function stopPaint(color: string, opacity = 1) {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const rgba = RGBA.exec(color.trim());
  if (rgba) {
    const [, r, g, b, a] = rgba;
    return {
      color: `rgb(${r}, ${g}, ${b})`,
      opacity: clamp(opacity * (a === undefined ? 1 : Number(a))),
    };
  }
  const hex8 = HEX8.exec(color.trim());
  if (hex8)
    return {
      color: `#${hex8[1]}`,
      opacity: clamp((opacity * parseInt(hex8[2]!, 16)) / 255),
    };
  return { color, opacity: clamp(opacity) };
}
