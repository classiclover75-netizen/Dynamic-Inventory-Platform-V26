import { Column, RowData } from "../types";

export interface SourceColorChange {
  source: string;
  color: string;
}

export function matchesSourceName(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function parseSourceArray(val: unknown): any[] | null {
  if (Array.isArray(val)) return val;
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch (e) {
    return null;
  }
}

function findChange(changes: SourceColorChange[], sourceName: unknown): SourceColorChange | null {
  if (!Array.isArray(changes)) return null;
  for (const change of changes) {
    if (matchesSourceName(change.source, sourceName)) return change;
  }
  return null;
}

function recolorCell(val: unknown, changes: SourceColorChange[]): string | null {
  const parsed = parseSourceArray(val);
  if (!parsed) return null;
  let hasChanged = false;
  const newArray = parsed.map(entry => {
    if (!entry || typeof entry !== 'object') return entry;
    const change = findChange(changes, entry.source);
    if (!change || entry.color === change.color) return entry;
    hasChanged = true;
    return { ...entry, color: change.color };
  });
  if (hasChanged) {
    return JSON.stringify(newArray);
  }
  return null;
}

export function buildRowColorUpdates(
  row: RowData, 
  columns: Column[], 
  changes: SourceColorChange[]
): Record<string, string> | null {
  if (!row || !Array.isArray(columns) || !Array.isArray(changes) || changes.length === 0) return null;
  const updates: Record<string, string> = {};
  
  const totalQtyRecolored = recolorCell(row.total_qty, changes);
  if (totalQtyRecolored !== null) {
    updates['total_qty'] = totalQtyRecolored;
  }

  for (const col of columns) {
    if (!col || col.type !== 'sale_tracker' || !col.key) continue;
    const recolored = recolorCell(row[col.key], changes);
    if (recolored !== null) {
      updates[col.key] = recolored;
    }
  }

  if (Object.keys(updates).length > 0) return updates;
  return null;
}

export function buildColorPropagationUpdates(
  rows: RowData[],
  columns: Column[],
  changes: SourceColorChange[],
  excludeRowId?: string
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  if (!Array.isArray(rows) || !Array.isArray(columns) || !Array.isArray(changes) || changes.length === 0) return result;
  
  const excludeStr = excludeRowId !== undefined ? String(excludeRowId) : null;
  
  for (const row of rows) {
    if (!row || row.id === undefined || row.id === null) continue;
    const rowIdStr = String(row.id);
    if (excludeStr !== null && rowIdStr === excludeStr) continue;
    
    const rowUpdates = buildRowColorUpdates(row, columns, changes);
    if (rowUpdates !== null) {
      result[rowIdStr] = rowUpdates;
    }
  }
  
  return result;
}

export function applyColorUpdatesToRows(
  rows: RowData[],
  updates: Record<string, Record<string, string>>
): RowData[] {
  if (!Array.isArray(rows) || !updates || Object.keys(updates).length === 0) return rows;
  
  return rows.map(row => {
    if (!row || row.id === undefined || row.id === null) return row;
    const rowIdStr = String(row.id);
    const rowUpdates = updates[rowIdStr];
    if (rowUpdates) {
      return { ...row, ...rowUpdates };
    }
    return row;
  });
}
