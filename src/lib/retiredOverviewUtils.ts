import { parseMultiSource } from './appUtils';
import { isRetired } from './sourceArchiveUtils';
import { isLocked } from './sourceLockUtils';

export interface RetiredItemInfo {
  itemLabel: string;
  retiredQty: number;
  totalSales: number;
  perSaleColumn: { colName: string; qty: number }[];
}

export interface RetiredSourceOverview {
  sourceName: string;
  color?: string;
  itemCount: number;
  totalRetiredQty: number;
  lastRetiredAt?: number;
  items: RetiredItemInfo[];
}

export function buildRetiredOverview(rows: any[], columns: any[]): RetiredSourceOverview[] {
  if (!rows || !columns) return [];
  const saleCols = columns.filter((c: any) => c.type === 'sale_tracker');
  const sourceMap = new Map<string, RetiredSourceOverview>();

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
    const retiredSources = multiSource.filter(isRetired);

    if (retiredSources.length === 0) return;

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

    retiredSources.forEach(rs => {
      const sourceName = rs.source;
      const retiredQty = parseFloat(String(rs.qty)) || 0;
      
      const salesArr = rowSalesBySource.get(sourceName) || [];
      const tSales = rowSalesTotalBySource.get(sourceName) || 0;

      if (!sourceMap.has(sourceName)) {
        sourceMap.set(sourceName, {
          sourceName,
          color: rs.color,
          itemCount: 0,
          totalRetiredQty: 0,
          lastRetiredAt: typeof rs.retiredAt === 'number' ? rs.retiredAt : undefined,
          items: []
        });
      }

      const overview = sourceMap.get(sourceName)!;
      overview.itemCount += 1;
      overview.totalRetiredQty += retiredQty;
      if (typeof rs.retiredAt === 'number') {
        overview.lastRetiredAt = Math.max(overview.lastRetiredAt ?? 0, rs.retiredAt);
      }
      overview.items.push({
        itemLabel,
        retiredQty,
        totalSales: tSales,
        perSaleColumn: salesArr
      });
    });
  });

  return Array.from(sourceMap.values()).sort((a, b) => {
    const at = a.lastRetiredAt, bt = b.lastRetiredAt;
    if (at != null && bt != null) {
      if (bt !== at) return bt - at;
      return b.totalRetiredQty - a.totalRetiredQty;
    }
    if (at != null) return -1;
    if (bt != null) return 1;
    return b.totalRetiredQty - a.totalRetiredQty;
  });
}

export interface FlatRetiredRow {
  _originalRowId: string;
  _retiredSourceName: string;
  _retiredSourceColor?: string;
  _retiredQty: number;
  _totalSales: number;
  _isLocked?: boolean;
  [key: string]: any;
}

export function buildFlatRetiredRows(rows: any[], columns: any[]): FlatRetiredRow[] {
  if (!rows || !columns) return [];
  const saleCols = columns.filter((c: any) => c.type === 'sale_tracker');
  const flatRows: FlatRetiredRow[] = [];

  rows.forEach(row => {
    if (!row.total_qty) return;
    const multiSource = parseMultiSource(row.total_qty);
    const retiredSources = multiSource.filter(isRetired);
    if (retiredSources.length === 0) return;

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

    retiredSources.forEach(rs => {
      const sourceName = rs.source;
      const retiredQty = parseFloat(String(rs.qty)) || 0;
      const tSales = rowSalesTotalBySource.get(sourceName) || 0;

      flatRows.push({
        ...row,
        _originalRowId: row.id,
        _retiredSourceName: sourceName,
        _retiredSourceColor: rs.color,
        _retiredQty: retiredQty,
        _totalSales: tSales,
        _isLocked: isLocked(rs)
      });
    });
  });
  return flatRows;
}
