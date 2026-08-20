import { parseMultiSource } from './appUtils';
import { splitActiveRetired } from './sourceArchiveUtils';

export const computeRemainingQtyBreakdown = (row: any, saleCols: any[], minStockAlert: number) => {
  const totalSources = parseMultiSource(row.total_qty);
  const { active: activeTotalSources } = splitActiveRetired(totalSources);
  
  return activeTotalSources.map((ts: any) => {
    let totalSaleForSource = 0;
    saleCols.forEach((sc) => {
      const sales = parseMultiSource(row[sc.key]);
      const saleEntry = sales.find((s: any) => s.source === ts.source);
      if (saleEntry) totalSaleForSource += parseFloat(saleEntry.qty) || 0;
    });
    return {
      ...ts,
      qty: (parseFloat(ts.qty) || 0) - totalSaleForSource,
      isAlert: ((parseFloat(ts.qty) || 0) - totalSaleForSource) <= minStockAlert,
    };
  });
};
