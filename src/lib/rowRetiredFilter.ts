import { parseMultiSource } from './appUtils';
import { isRetired } from './sourceArchiveUtils';

export const getRowRetiredSourceNames = (row: any): string[] => {
  if (!row || !row.total_qty) return [];
  try {
    const sources = parseMultiSource(row.total_qty);
    return sources
      .filter((s: any) => isRetired(s))
      .map((s: any) => s.source);
  } catch (e) {
    console.error("Error in getRowRetiredSourceNames", e);
    return [];
  }
};
