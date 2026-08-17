import type { CSSProperties } from "react";
import { parseHex, rgbToHex, contrastRatio, readableTextColor, Rgb } from "./colorUtils";

export const CUSTOM_PREFIX = "custom:";

export function isCustomColor(val: unknown): boolean {
  if (typeof val !== "string") return false;
  return val.trim().startsWith(CUSTOM_PREFIX);
}

export function buildCustomColor(hex: string, opacity: number): string {
  const clampedOpacity = Math.max(0, Math.min(100, Math.round(opacity)));
  let parsed = parseHex(hex);
  let normalizedHex = "#000000";
  if (parsed) {
    normalizedHex = rgbToHex(parsed);
  }
  return `${CUSTOM_PREFIX}${normalizedHex}@${clampedOpacity}`;
}

export interface ParsedCustomColor {
  hex: string;
  rgb: Rgb;
  opacity: number;
  alpha: number;
}

export function parseCustomColor(val: unknown): ParsedCustomColor | null {
  if (!isCustomColor(val)) return null;
  const str = (val as string).trim();
  const stripped = str.substring(CUSTOM_PREFIX.length);
  const parts = stripped.split("@");
  const hexPart = parts[0] || "";
  const opacityPart = parts[1];
  
  const rgb = parseHex(hexPart);
  if (!rgb) return null;
  
  const normalizedHex = rgbToHex(rgb);
  
  let opacity = parseInt(opacityPart as string, 10);
  if (isNaN(opacity) || !isFinite(opacity)) {
    opacity = 100;
  }
  opacity = Math.max(0, Math.min(100, opacity));
  const alpha = opacity / 100;
  
  return {
    hex: normalizedHex,
    rgb,
    opacity,
    alpha
  };
}

export type ChipRender = 
  | { kind: "class"; className: string }
  | { kind: "style"; style: CSSProperties };

export function resolveChipRender(color: unknown): ChipRender {
  if (typeof color === "string" && color.trim() !== "") {
    if (isCustomColor(color)) {
      const parsed = parseCustomColor(color);
      if (parsed) {
        const bgRgba = `rgba(${parsed.rgb[0]}, ${parsed.rgb[1]}, ${parsed.rgb[2]}, ${parsed.alpha})`;
        const textCol = readableTextColor(parsed.rgb);
        return {
          kind: "style",
          style: {
            backgroundColor: bgRgba,
            color: textCol,
            borderColor: bgRgba
          }
        };
      }
      return {
        kind: "class",
        className: "bg-gray-100 text-gray-800 border-gray-200"
      };
    }
    return {
      kind: "class",
      className: color
    };
  }
  
  return {
    kind: "class",
    className: "bg-gray-100 text-gray-800 border-gray-200"
  };
}

export function resolveBorderAccent(color: unknown): string {
  if (isCustomColor(color)) {
    const parsed = parseCustomColor(color);
    if (parsed) {
      return parsed.hex;
    }
  }
  
  if (typeof color === "string") {
    const trimmed = color.trim();
    if (trimmed.includes("blue")) return "#3b82f6";
    if (trimmed.includes("green")) return "#22c55e";
    if (trimmed.includes("yellow")) return "#eab308";
    if (trimmed.includes("red")) return "#ef4444";
    if (trimmed.includes("purple")) return "#a855f7";
  }
  
  return "#94a3b8";
}

export function parseColorToPickerValue(value: string | undefined): { hex: string; alpha: number; rgb: Rgb; chipClass: string } | null {
  if (!value) return null;
  if (isCustomColor(value)) {
    const parsed = parseCustomColor(value);
    if (parsed) {
      return {
        hex: parsed.hex,
        alpha: parsed.alpha,
        rgb: parsed.rgb,
        chipClass: buildCustomColor(parsed.hex, parsed.opacity)
      };
    }
  }
  const rgb = parseHex(value);
  if (rgb) {
    const hex = rgbToHex(rgb);
    return {
      hex,
      alpha: 1,
      rgb,
      chipClass: buildCustomColor(hex, 100)
    };
  }
  return null;
}
