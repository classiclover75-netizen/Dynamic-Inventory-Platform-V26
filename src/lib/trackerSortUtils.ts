import { RowData, Column } from "../types";
import { parseMultiSource } from "./appUtils";

interface FilterSortParams {
  rows: RowData[];
  originalRows: RowData[]; // Used to maintain stable sort based on original indices
  columns: Column[];
  trackerFilter: string;
  trackerSort: string;
  trackerQtySort: string;
  activeFilterSaleCol: string | null;
  minStockAlert: number | undefined;
  linkedSourcePage?: string;
  autoSortBySales?: boolean;
}

export function filterAndSortTrackerRows({
  rows,
  originalRows,
  columns,
  trackerFilter,
  trackerSort,
  trackerQtySort,
  activeFilterSaleCol,
  minStockAlert,
  linkedSourcePage,
  autoSortBySales,
}: FilterSortParams): RowData[] {
  let resultRows = rows;
  const saleCols = columns.filter((c) => c.type === "sale_tracker");
  
  const latestSaleCol =
    activeFilterSaleCol &&
    saleCols.some((c) => c.key === activeFilterSaleCol)
      ? activeFilterSaleCol
      : saleCols.length > 0
        ? saleCols[0].key
        : null;

  const getNum = (row: any, v: any) => {
    const validSources = new Set(parseMultiSource(row.total_qty).map((ts: any) => ts.source));
    return parseMultiSource(v).reduce(
      (sum: number, s: any) => sum + (validSources.has(s.source) ? (parseFloat(s.qty) || 0) : 0),
      0,
    );
  };

  const originalIndices = new Map<string, number>(originalRows.map((r, i) => [String(r.id), i]));

  const statsMap = new Map<string, { total: number; remaining: number }>();
  const getStats = (row: any) => {
    if (statsMap.has(row.id)) return statsMap.get(row.id)!;
    const totalSources = parseMultiSource(row.total_qty);
    let total = 0;
    let remaining = 0;
    totalSources.forEach((ts: any) => {
      const tQty = parseFloat(ts.qty) || 0;
      total += tQty;
      let totalSaleForSource = 0;
      saleCols.forEach((sc: any) => {
        const sales = parseMultiSource(row[sc.key]);
        const saleEntry = sales.find((s: any) => s.source === ts.source);
        if (saleEntry) totalSaleForSource += (parseFloat(saleEntry.qty) || 0);
      });
      remaining += (tQty - totalSaleForSource);
    });
    const stats = { total, remaining };
    statsMap.set(row.id, stats);
    return stats;
  };

  if (trackerFilter !== "all") {
    resultRows = resultRows.filter((row) => {
      const stats = getStats(row);
      const minStock = minStockAlert || 5;
      const latestSaleVal = latestSaleCol ? getNum(row, row[latestSaleCol]) : 0;
      if (trackerFilter === "low") {
        return stats.remaining <= minStock;
      } else if (trackerFilter === "zero") {
        return latestSaleVal === 0 || !row[latestSaleCol!];
      } else if (trackerFilter === "high") {
        return latestSaleVal > 0;
      }
      return true;
    });

    if (trackerFilter === "high" && latestSaleCol) {
      if (resultRows === rows) {
        resultRows = [...resultRows];
      }
      resultRows.sort((a, b) => {
        const diff = getNum(b, b[latestSaleCol]) - getNum(a, a[latestSaleCol]);
        return diff !== 0 ? diff : (originalIndices.get(String(a.id)) ?? 0) - (originalIndices.get(String(b.id)) ?? 0);
      });
    }
  }

  if (trackerFilter === "all" && trackerSort !== "none" && latestSaleCol) {
    if (resultRows === rows) {
      resultRows = [...resultRows];
    }
    resultRows.sort((a, b) => {
      let diff = 0;
      if (trackerSort === "high") diff = getNum(b, b[latestSaleCol]) - getNum(a, a[latestSaleCol]);
      else if (trackerSort === "low") diff = getNum(a, a[latestSaleCol]) - getNum(b, b[latestSaleCol]);
      return diff !== 0 ? diff : (originalIndices.get(String(a.id)) ?? 0) - (originalIndices.get(String(b.id)) ?? 0);
    });
  }

  if (linkedSourcePage && autoSortBySales) {
    if (latestSaleCol) {
      if (resultRows === rows) {
        resultRows = [...resultRows];
      }
      resultRows.sort((a, b) => {
        const salesA = getNum(a, a[latestSaleCol]);
        const salesB = getNum(b, b[latestSaleCol]);
        const diff = salesB - salesA;
        return diff !== 0 ? diff : (originalIndices.get(String(a.id)) ?? 0) - (originalIndices.get(String(b.id)) ?? 0);
      });
    }
  }

  if (trackerQtySort !== "none") {
    if (resultRows === rows) {
      resultRows = [...resultRows];
    }
    resultRows.sort((a, b) => {
      const statsA = getStats(a);
      const statsB = getStats(b);
      let diff = 0;
      if (trackerQtySort === "total_high") diff = statsB.total - statsA.total;
      else if (trackerQtySort === "total_low") diff = statsA.total - statsB.total;
      else if (trackerQtySort === "remaining_high") diff = statsB.remaining - statsA.remaining;
      else if (trackerQtySort === "remaining_low") diff = statsA.remaining - statsB.remaining;
      return diff !== 0 ? diff : (originalIndices.get(String(a.id)) ?? 0) - (originalIndices.get(String(b.id)) ?? 0);
    });
  }

  return resultRows;
}
