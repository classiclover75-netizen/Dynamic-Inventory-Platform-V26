import { rgbToHex, rgbToHsl } from "./colorUtils";
import { parseCustomColor, buildCustomColor, CUSTOM_PREFIX } from "./colorRender";

export const ORDERED_HEX_COLORS = [
  "#3B82F6", "#F97316", "#22C55E", "#A855F7", "#EC4899", "#06B6D4", "#F59E0B", "#F43F5E", "#14B8A6", "#6366F1", "#84CC16", "#D946EF", "#0EA5E9", "#EF4444", "#8B5CF6", "#10B981", "#EAB308", "#64748B", "#6B7280", "#71717A"
];

export function getNextAvailableHexColor(usedColors: string[]): string | null {
  for (const hex of ORDERED_HEX_COLORS) {
    let used = false;
    for (const c of usedColors) {
      const parsed = parseCustomColor(c);
      if (parsed && parsed.hex.toUpperCase() === hex.toUpperCase()) {
        used = true;
        break;
      }
    }
    if (!used) {
      return buildCustomColor(hex, 100);
    }
  }
  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

export function extractHue(color: string): number | null {
  if (color.startsWith(CUSTOM_PREFIX)) {
    const parsed = parseCustomColor(color);
    if (parsed) {
      const hsl = rgbToHsl(parsed.rgb);
      return hsl[0];
    }
  }
  return null;
}

export function generateRandomSourceColor(usedHues: number[]): string {
  let bestHue = 0;
  let maxMinDiff = -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const hue = Math.floor(Math.random() * 360);
    
    let minDiff = 360;
    if (usedHues.length === 0) {
        minDiff = 360;
    }
    
    for (const usedHue of usedHues) {
      let diff = Math.abs(hue - usedHue);
      if (diff > 180) {
        diff = 360 - diff;
      }
      if (diff < minDiff) {
        minDiff = diff;
      }
    }
    
    if (minDiff >= 18) {
      bestHue = hue;
      maxMinDiff = minDiff;
      break;
    }
    
    if (minDiff > maxMinDiff) {
      maxMinDiff = minDiff;
      bestHue = hue;
    }
  }
  
  const saturation = 85;
  const lightness = 52;
  
  const rgb = hslToRgb(bestHue, saturation, lightness);
  const hex = rgbToHex(rgb);
  
  return `custom:${hex}@100`;
}
