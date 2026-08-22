import type { CSSProperties } from "react";
import { isCustomColor, parseCustomColor } from "./colorRender";
import { parseHex, readableTextColor } from "./colorUtils";

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
  const value = getRowColor(row);
  if (!value) return null;
  if (isCustomColor(value)) {
    const parsed = parseCustomColor(value);
    if (!parsed) return null;
    return {
      backgroundColor: `rgba(${parsed.rgb[0]}, ${parsed.rgb[1]}, ${parsed.rgb[2]}, ${parsed.alpha})`,
      color: readableTextColor(parsed.rgb)
    };
  }
  const rgb = parseHex(value);
  if (!rgb) return null;
  return {
    backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    color: readableTextColor(rgb)
  };
}
