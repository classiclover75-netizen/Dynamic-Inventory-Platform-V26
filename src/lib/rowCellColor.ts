import type { CSSProperties } from "react";
import { isCustomColor, parseCustomColor } from "./colorRender";
import { parseHex, readableTextColor, Rgb } from "./colorUtils";

export const ROW_COLOR_KEY = "_rowColor";

export function getRowColor(row: any): string | null {
  if (!row || typeof row !== "object") return null;
  const raw = row[ROW_COLOR_KEY];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return trimmed;
}

export function resolveRowColorStyle(row: any): CSSProperties | null {
  return resolveColorValueStyle(getRowColor(row));
}

export function resolveColorValueStyle(
  value: string | null | undefined,
): CSSProperties | null {
  if (!value) return null;
  if (isCustomColor(value)) {
    const parsed = parseCustomColor(value);
    if (!parsed) return null;
    const blended: Rgb = [
      Math.round(parsed.rgb[0] * parsed.alpha + 255 * (1 - parsed.alpha)),
      Math.round(parsed.rgb[1] * parsed.alpha + 255 * (1 - parsed.alpha)),
      Math.round(parsed.rgb[2] * parsed.alpha + 255 * (1 - parsed.alpha))
    ];
    return {
      backgroundColor: `rgba(${parsed.rgb[0]}, ${parsed.rgb[1]}, ${parsed.rgb[2]}, ${parsed.alpha})`,
      color: readableTextColor(blended)
    };
  }
  const rgb = parseHex(value);
  if (!rgb) return null;
  return {
    backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    color: readableTextColor(rgb)
  };
}
