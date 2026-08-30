export type Rgb = [number, number, number];

export function isValidHex(val: unknown): val is string {
  if (typeof val !== 'string') return false;
  return /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val.trim());
}

export function parseHex(val: unknown): Rgb | null {
  if (typeof val !== 'string') return null;
  let s = val.trim().replace(/^#/, '');
  if (s.length === 3) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (s.length !== 6 || !/^[0-9A-Fa-f]{6}$/.test(s)) {
    return null;
  }
  const r = parseInt(s.substring(0, 2), 16);
  const g = parseInt(s.substring(2, 4), 16);
  const b = parseInt(s.substring(4, 6), 16);
  return [r, g, b];
}

export function rgbToHex(rgb: Rgb): string {
  if (!Array.isArray(rgb) || rgb.length !== 3) return "#000000";
  const r = Math.max(0, Math.min(255, Math.round(rgb[0]))).toString(16).padStart(2, '0');
  const g = Math.max(0, Math.min(255, Math.round(rgb[1]))).toString(16).padStart(2, '0');
  const b = Math.max(0, Math.min(255, Math.round(rgb[2]))).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`.toUpperCase();
}

export function hsvToRgb(h: number, s: number, v: number): Rgb {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

export function rgbToHsv(rgb: Rgb): [number, number, number] {
  if (!Array.isArray(rgb) || rgb.length !== 3) return [0, 0, 0];
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * (((b - r) / delta) + 2);
    else h = 60 * (((r - g) / delta) + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;
  return [h, s, v];
}

export function rgbToHsl(rgb: Rgb): [number, number, number] {
  if (!Array.isArray(rgb) || rgb.length !== 3) return [0, 0, 0];
  const r = rgb[0] / 255;
  const g = rgb[1] / 255;
  const b = rgb[2] / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * (((b - r) / delta) + 2);
    else h = 60 * (((r - g) / delta) + 4);
  }
  if (h < 0) h += 360;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function relativeLuminance(rgb: Rgb): number {
  if (!Array.isArray(rgb) || rgb.length !== 3) return 0;
  const [r, g, b] = rgb.map(c => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(rgb1: Rgb, rgb2: Rgb): number {
  if (!Array.isArray(rgb1) || rgb1.length !== 3 || !Array.isArray(rgb2) || rgb2.length !== 3) return 1;
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const max = Math.max(l1, l2);
  const min = Math.min(l1, l2);
  return (max + 0.05) / (min + 0.05);
}

export function formatRgba(rgb: Rgb, alpha: number = 1): string {
  if (!Array.isArray(rgb) || rgb.length !== 3) return "rgba(0, 0, 0, 1)";
  const a = Math.max(0, Math.min(1, alpha));
  if (a < 1) {
    const aStr = Number(a.toFixed(2));
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${aStr})`;
  }
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

export function readableTextColor(rgb: Rgb): string {
  if (!Array.isArray(rgb) || rgb.length !== 3) return "#101828";
  const white: Rgb = [255, 255, 255];
  if (contrastRatio(rgb, white) >= 3.4) {
    return "#ffffff";
  }
  return "#101828";
}

export const DEFAULT_SAVED_COLORS = ["#EF4444", "#22C55E", "#3B82F6"];
export const MAX_SAVED_COLORS = 20;

export const MAIN_PRESET_GRID: string[][] = [
  ["#000000", "#434343", "#666666", "#999999", "#B7B7B7", "#CCCCCC", "#D9D9D9", "#EFEFEF", "#F3F3F3", "#FFFFFF"],
  ["#980000", "#FF0000", "#FF9900", "#FFFF00", "#00FF00", "#00FFFF", "#4A86E8", "#0000FF", "#9900FF", "#FF00FF"],
  ["#E6B8AF", "#F4CCCC", "#FCE5CD", "#FFF2CC", "#D9EAD3", "#D0E0E3", "#C9DAF8", "#CFE2F3", "#D9D2E9", "#EAD1DC"],
  ["#DD7E6B", "#EA9999", "#F9CB9C", "#FFE599", "#B6D7A8", "#A2C4C9", "#A4C2F4", "#9FC5E8", "#B4A7D6", "#D5A6BD"],
  ["#CC4125", "#E06666", "#F6B26B", "#FFD966", "#93C47D", "#76A5AF", "#6D9EEB", "#6FA8DC", "#8E7CC3", "#C27BA0"],
  ["#A61C00", "#CC0000", "#E69138", "#F1C232", "#6AA84F", "#45818E", "#3C78D8", "#3D85C6", "#674EA7", "#A64D79"],
  ["#85200C", "#990000", "#B45F06", "#BF9000", "#38761D", "#134F5C", "#1155CC", "#0B5394", "#351C75", "#741B47"],
  ["#5B0F00", "#660000", "#783F04", "#7F6000", "#274E13", "#0C343D", "#1C4587", "#073763", "#20124D", "#4C1130"]
];

export const STANDARD_COLORS = ["#000000", "#FFFFFF", "#4285F4", "#EA4335", "#FBBC04", "#34A853", "#FF6D01", "#46BDC6"];

const SAVED_COLORS_STORAGE_KEY = "inventory_saved_colors";

export function readSavedColors(): string[] {
  try {
    const stored = localStorage.getItem(SAVED_COLORS_STORAGE_KEY);
    if (!stored) return [...DEFAULT_SAVED_COLORS];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [...DEFAULT_SAVED_COLORS];
    const valid = parsed
      .filter(isValidHex)
      .map(parseHex)
      .filter((rgb): rgb is Rgb => rgb !== null)
      .map(rgbToHex);
    return valid.slice(0, MAX_SAVED_COLORS);
  } catch (e) {
    return [...DEFAULT_SAVED_COLORS];
  }
}

function writeSavedColors(colors: string[]): void {
  try {
    localStorage.setItem(SAVED_COLORS_STORAGE_KEY, JSON.stringify(colors));
  } catch (e) {
    // storage can be full or blocked and the picker must still work without it
  }
}

export function addSavedColor(hex: string): string[] {
  const current = readSavedColors();
  if (current.includes(hex) || current.length >= MAX_SAVED_COLORS) return current;
  const next = [...current, hex];
  writeSavedColors(next);
  return next;
}

export function removeSavedColor(hex: string): string[] {
  const next = readSavedColors().filter(c => c !== hex);
  writeSavedColors(next);
  return next;
}

export function isEyeDropperSupported(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

export async function pickColorFromScreen(): Promise<string | null> {
  if (!isEyeDropperSupported()) return null;
  try {
    const EyeDropperCtor = (window as any).EyeDropper;
    const eyeDropper = new EyeDropperCtor();
    const result = await eyeDropper.open();
    if (result && result.sRGBHex) return result.sRGBHex;
    return null;
  } catch (e) {
    return null;
  }
}
