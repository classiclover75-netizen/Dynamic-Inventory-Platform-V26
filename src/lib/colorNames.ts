import { parseHex, Rgb } from "./colorUtils";

const NAMED_COLORS: [string, string][] = [
  ["#000000", "Black"], ["#1C1C1C", "Charcoal"], ["#36454F", "Dark Slate"],
  ["#696969", "Dim Grey"], ["#808080", "Grey"], ["#A9A9A9", "Silver Grey"],
  ["#C0C0C0", "Silver"], ["#D3D3D3", "Light Grey"], ["#E5E4E2", "Platinum"],
  ["#F5F5F5", "White Smoke"], ["#FFFFFF", "White"], ["#FFFDD0", "Cream"],
  ["#FFFFF0", "Ivory"], ["#FAEBD7", "Antique White"], ["#F5F5DC", "Beige"],
  ["#800000", "Maroon"], ["#8B0000", "Dark Red"], ["#B22222", "Firebrick"],
  ["#DC143C", "Crimson"], ["#FF0000", "Red"], ["#EF4444", "Bright Red"],
  ["#FF6347", "Tomato"], ["#FF7F50", "Coral"], ["#FA8072", "Salmon"],
  ["#FFA07A", "Light Salmon"], ["#FFC0CB", "Pink"], ["#FFB6C1", "Light Pink"],
  ["#FF69B4", "Hot Pink"], ["#FF1493", "Deep Pink"], ["#DB7093", "Pale Violet"],
  ["#C71585", "Medium Violet"], ["#8B4513", "Saddle Brown"], ["#A0522D", "Sienna"],
  ["#A52A2A", "Brown"], ["#CD853F", "Peru"], ["#D2691E", "Chocolate"],
  ["#DEB887", "Burlywood"], ["#F4A460", "Sandy Brown"], ["#D2B48C", "Tan"],
  ["#FFE4C4", "Bisque"], ["#FFDAB9", "Peach"], ["#FF8C00", "Dark Orange"],
  ["#FFA500", "Orange"], ["#F59E0B", "Amber"], ["#FFD700", "Gold"],
  ["#DAA520", "Goldenrod"], ["#B8860B", "Dark Goldenrod"], ["#808000", "Olive"],
  ["#FFFF00", "Yellow"], ["#FEF3C7", "Pale Yellow"], ["#F0E68C", "Khaki"],
  ["#EEE8AA", "Pale Goldenrod"], ["#ADFF2F", "Green Yellow"], ["#9ACD32", "Yellow Green"],
  ["#7CFC00", "Lawn Green"], ["#00FF00", "Lime"], ["#22C55E", "Bright Green"],
  ["#32CD32", "Lime Green"], ["#008000", "Green"], ["#006400", "Dark Green"],
  ["#228B22", "Forest Green"], ["#2E8B57", "Sea Green"], ["#3CB371", "Medium Sea Green"],
  ["#90EE90", "Light Green"], ["#98FB98", "Pale Green"], ["#00FA9A", "Spring Green"],
  ["#40E0D0", "Turquoise"], ["#20B2AA", "Light Sea Green"], ["#008080", "Teal"],
  ["#008B8B", "Dark Cyan"], ["#00FFFF", "Cyan"], ["#AFEEEE", "Pale Turquoise"],
  ["#E0FFFF", "Light Cyan"], ["#B0E0E6", "Powder Blue"], ["#87CEEB", "Sky Blue"],
  ["#87CEFA", "Light Sky Blue"], ["#00BFFF", "Deep Sky Blue"], ["#1E90FF", "Dodger Blue"],
  ["#3B82F6", "Bright Blue"], ["#4682B4", "Steel Blue"], ["#5F9EA0", "Cadet Blue"],
  ["#6495ED", "Cornflower Blue"], ["#4169E1", "Royal Blue"], ["#0000FF", "Blue"],
  ["#0000CD", "Medium Blue"], ["#00008B", "Dark Blue"], ["#000080", "Navy"],
  ["#1E3A8A", "Deep Navy"], ["#191970", "Midnight Blue"], ["#483D8B", "Dark Slate Blue"],
  ["#6A5ACD", "Slate Blue"], ["#7B68EE", "Medium Slate Blue"], ["#8A2BE2", "Blue Violet"],
  ["#7C3AED", "Violet"], ["#9400D3", "Dark Violet"], ["#9932CC", "Dark Orchid"],
  ["#BA55D3", "Medium Orchid"], ["#DA70D6", "Orchid"], ["#EE82EE", "Light Violet"],
  ["#DDA0DD", "Plum"], ["#D8BFD8", "Thistle"], ["#E6E6FA", "Lavender"],
  ["#800080", "Purple"], ["#4B0082", "Indigo"], ["#111827", "Ink"],
  ["#374151", "Slate"], ["#6B7280", "Cool Grey"], ["#9CA3AF", "Ash"],
  ["#E5E7EB", "Mist"], ["#F3F4F6", "Fog"]
];

const PARSED: [Rgb, string][] = NAMED_COLORS
  .map(([hex, name]) => [parseHex(hex), name] as [Rgb | null, string])
  .filter((entry): entry is [Rgb, string] => entry[0] !== null);

export function getColorName(value: unknown): string | null {
  const rgb = parseHex(value);
  if (!rgb) return null;
  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [candidate, name] of PARSED) {
    const dr = rgb[0] - candidate[0];
    const dg = rgb[1] - candidate[1];
    const db = rgb[2] - candidate[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = name;
    }
  }
  return bestName;
}
