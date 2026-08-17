import { parseMultiSource } from './appUtils';
import { isRetired } from './sourceArchiveUtils';
import { isLocked } from './sourceLockUtils';

export interface ActiveItemInfo {
  itemLabel: string;
  activeQty: number;
  totalSales: number;
  perSaleColumn: { colName: string; qty: number }[];
}

export interface ActiveSourceOverview {
  sourceName: string;
  color?: string;
  itemCount: number;
  totalActiveQty: number;
  lastActiveAt?: number;
  items: ActiveItemInfo[];
}

export function buildActiveOverview(rows: any[], columns: any[]): ActiveSourceOverview[] {
  if (!rows || !columns) return [];
  const saleCols = columns.filter((c: any) => c.type === 'sale_tracker');
  const sourceMap = new Map<string, ActiveSourceOverview>();

  const firstDisplayCol = columns.find((c: any) => c.key !== 'sr' && c.key !== 'total_qty' && !c.archived && c.type !== 'image' && c.type !== 'system_serial');

  rows.forEach(row => {
    // Find itemLabel
    let itemLabel = "Row No.";
    if (firstDisplayCol && row[firstDisplayCol.key]) {
      itemLabel = String(row[firstDisplayCol.key]);
    } else if (row.sr) {
      itemLabel = `Row No. ${row.sr}`;
    }

    if (!row.total_qty) return;
    
    const multiSource = parseMultiSource(row.total_qty);
    const activeSources = multiSource.filter(s => !isRetired(s));

    if (activeSources.length === 0) return;

    // Calculate sales for this row
    const rowSalesBySource = new Map<string, { colName: string; qty: number }[]>();
    const rowSalesTotalBySource = new Map<string, number>();

    saleCols.forEach((saleCol: any) => {
      if (!row[saleCol.key]) return;
      const saleVal = parseMultiSource(row[saleCol.key]);
      saleVal.forEach((s: any) => {
        const sqty = parseFloat(String(s.qty)) || 0;
        if (sqty > 0) {
          if (!rowSalesBySource.has(s.source)) rowSalesBySource.set(s.source, []);
          rowSalesBySource.get(s.source)!.push({ colName: saleCol.name, qty: sqty });
          rowSalesTotalBySource.set(s.source, (rowSalesTotalBySource.get(s.source) || 0) + sqty);
        }
      });
    });

    activeSources.forEach(rs => {
      const sourceName = rs.source;
      const activeQty = parseFloat(String(rs.qty)) || 0;
      
      const salesArr = rowSalesBySource.get(sourceName) || [];
      const tSales = rowSalesTotalBySource.get(sourceName) || 0;

      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          sourceName,
          color: rs.color,
          itemCount: 0,
          totalActiveQty: 0,
          lastActiveAt: typeof rs.retiredAt === 'number' ? rs.retiredAt : undefined,
          items: []
        });
      }

      const overview = sourceMap.get(sourceName)!;
      overview.itemCount += 1;
      overview.totalActiveQty += activeQty;
      if (typeof rs.retiredAt === 'number') {
        overview.lastActiveAt = Math.max(overview.lastActiveAt ?? 0, rs.retiredAt);
      }
      overview.items.push({
        itemLabel,
        activeQty,
        totalSales: tSales,
        perSaleColumn: salesArr
      });
    });
  });

  return Array.from(sourceMap.values()).sort((a, b) => {
    const at = a.lastActiveAt, bt = b.lastActiveAt;
    if (at != null && bt != null) {
      if (bt !== at) return bt - at;
      return b.totalActiveQty - a.totalActiveQty;
    }
    if (at != null) return -1;
    if (bt != null) return 1;
    return b.totalActiveQty - a.totalActiveQty;
  });
}

export interface FlatActiveRow {
  _originalRowId: string;
  _activeSourceName: string;
  _activeSourceColor?: string;
  _activeQty: number;
  _totalSales: number;
  _isLocked?: boolean;
  [key: string]: any;
}

export function buildFlatActiveRows(rows: any[], columns: any[]): FlatActiveRow[] {
  if (!rows || !columns) return [];
  const saleCols = columns.filter((c: any) => c.type === 'sale_tracker');
  const flatRows: FlatActiveRow[] = [];

  rows.forEach(row => {
    if (!row.total_qty) return;
    const multiSource = parseMultiSource(row.total_qty);
    const activeSources = multiSource.filter(s => !isRetired(s));
    if (activeSources.length === 0) return;

    const rowSalesTotalBySource = new Map<string, number>();
    saleCols.forEach((saleCol: any) => {
      if (!row[saleCol.key]) return;
      const saleVal = parseMultiSource(row[saleCol.key]);
      saleVal.forEach((s: any) => {
        const sqty = parseFloat(String(s.qty)) || 0;
        if (sqty > 0) {
          rowSalesTotalBySource.set(s.source, (rowSalesTotalBySource.get(s.source) || 0) + sqty);
        }
      });
    });

    activeSources.forEach(rs => {
      const sourceName = rs.source;
      const activeQty = parseFloat(String(rs.qty)) || 0;
      const tSales = rowSalesTotalBySource.get(sourceName) || 0;

      flatRows.push({
        ...row,
        _originalRowId: row.id,
        _activeSourceName: sourceName,
        _activeSourceColor: rs.color,
        _activeQty: activeQty,
        _totalSales: tSales,
        _isLocked: isLocked(rs)
      });
    });
  });
  return flatRows;
}
