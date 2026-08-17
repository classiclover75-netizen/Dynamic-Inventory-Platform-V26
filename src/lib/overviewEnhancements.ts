import { parseMultiSource } from './appUtils';
import { isRetired } from './sourceArchiveUtils';
import { isLocked } from './sourceLockUtils';

export function getSourceNumericValue(row: any, colKey: string, sourceName: string, isRemaining: boolean = false, columns: any[] = []): number {
    if (isRemaining) {
        const rawTotal = String(row.total_qty || "");
        let totalQty = 0;
        if (rawTotal.trim().startsWith("[")) {
            try {
                const totalSources = parseMultiSource(row.total_qty);
                const ts = totalSources.find((s: any) => s.source === sourceName && isRetired(s) === !!row._isRetired);
                if (ts) totalQty = parseFloat(String(ts.qty)) || 0;
            } catch (e) {}
        } else {
            totalQty = parseFloat(String(row.total_qty || 0)) || 0;
        }

        const saleCols = columns.filter((c: any) => c.type === "sale_tracker");
        let totalSales = 0;
        saleCols.forEach(sc => {
            const rawSale = String(row[sc.key] || "");
            if (rawSale.trim().startsWith("[")) {
                try {
                    const saleArr = parseMultiSource(row[sc.key]);
                    const sSale = saleArr.find((ss: any) => ss.source === sourceName && isRetired(ss) === !!row._isRetired);
                    if (sSale) totalSales += parseFloat(String(sSale.qty)) || 0;
                } catch (e) {}
            } else {
                totalSales += parseFloat(String(row[sc.key] || 0)) || 0;
            }
        });
        return totalQty - totalSales;
    }

    const rawVal = String(row[colKey] || "0");
    if (rawVal.trim().startsWith("[")) {
        try {
            const sources = parseMultiSource(rawVal);
            const s = sources.find((ss: any) => ss.source === sourceName && isRetired(ss) === !!row._isRetired);
            if (s) return parseFloat(String(s.qty)) || 0;
            return 0;
        } catch (e) {
            return parseFloat(rawVal) || 0;
        }
    }
    if (sourceName === "Default") {
        return parseFloat(rawVal) || 0;
    }
    return 0;
}

export function sortOverviewRows(rows: any[], sortBy: string, sortDir: 'asc' | 'desc', columns: any[], sourceProp: string, statusFirst: 'retired' | 'active' = 'retired'): any[] {
    if (sortBy === 'Recently Added') {
        return sortDir === 'asc' ? [...rows] : [...rows].reverse();
    }

    return [...rows].sort((a, b) => {
        const sourceA = a[sourceProp];
        const sourceB = b[sourceProp];
        let valA = 0;
        let valB = 0;

        if (sortBy === 'Status') {
            const isRetiredA = !!a._isRetired;
            const isRetiredB = !!b._isRetired;
            if (isRetiredA !== isRetiredB) {
                if (statusFirst === 'active') {
                    if (sortDir === 'asc') {
                        return isRetiredA ? 1 : -1;
                    } else {
                        return isRetiredA ? -1 : 1;
                    }
                } else {
                    if (sortDir === 'asc') {
                        return isRetiredA ? -1 : 1;
                    } else {
                        return isRetiredA ? 1 : -1;
                    }
                }
            }
            // Same status: sort by source name
            const strA = String(sourceA || '').toLowerCase();
            const strB = String(sourceB || '').toLowerCase();
            if (sortDir === 'asc') {
                // asc: within group, A-Z
                return strA.localeCompare(strB);
            } else {
                // desc: within group, Z-A
                return strB.localeCompare(strA);
            }
        } else if (sortBy === 'Total Sale') {
            valA = a._totalSales || 0;
            valB = b._totalSales || 0;
        } else if (sortBy === 'Total Qty') {
            valA = a._activeQty ?? a._retiredQty ?? 0;
            valB = b._activeQty ?? b._retiredQty ?? 0;
        } else if (sortBy === 'Remaining Qty') {
            valA = getSourceNumericValue(a, 'remaining_qty', sourceA, true, columns);
            valB = getSourceNumericValue(b, 'remaining_qty', sourceB, true, columns);
        } else {
            const col = columns.find((c: any) => c.name === sortBy);
            if (col) {
                valA = getSourceNumericValue(a, col.key, sourceA, false, columns);
                valB = getSourceNumericValue(b, col.key, sourceB, false, columns);
            }
        }

        if (valA !== valB) {
            return sortDir === 'asc' ? valA - valB : valB - valA;
        }
        return 0;
    });
}

export interface SourceStatusCount {
    source: string;
    retiredCount: number;
    activeCount: number;
}

export function getStatusCounts(rows: any[], visibleSources: Set<string>): SourceStatusCount[] {
    const counts = new Map<string, SourceStatusCount>();
    visibleSources.forEach(s => counts.set(s, { source: s, retiredCount: 0, activeCount: 0 }));

    rows.forEach(row => {
        if (!row.total_qty) return;
        const multiSource = parseMultiSource(row.total_qty);
        multiSource.forEach((s: any) => {
            if (visibleSources.has(s.source)) {
                const count = counts.get(s.source)!;
                if (isRetired(s)) count.retiredCount++;
                else count.activeCount++;
            }
        });
    });

    return Array.from(counts.values());
}

export function buildMixedFlatRows(rows: any[], columns: any[], baseSources: Set<string>, sourceProp: string, qtyProp: string, colorProp: string): any[] {
    const saleCols = columns.filter((c: any) => c.type === 'sale_tracker');
    const flatRows: any[] = [];

    rows.forEach(row => {
        if (!row.total_qty) return;
        const multiSource = parseMultiSource(row.total_qty);
        const relevantSources = multiSource.filter((s: any) => baseSources.has(s.source));

        if (relevantSources.length === 0) return;

        const rowSalesTotalBySource = new Map<string, number>();
        saleCols.forEach((saleCol: any) => {
            if (!row[saleCol.key]) return;
            const saleVal = parseMultiSource(row[saleCol.key]);
            saleVal.forEach((s: any) => {
                const sqty = parseFloat(String(s.qty)) || 0;
                if (sqty > 0) {
                    const key = s.source;
                    rowSalesTotalBySource.set(key, (rowSalesTotalBySource.get(key) || 0) + sqty);
                }
            });
        });

        relevantSources.forEach((rs: any) => {
            const sourceName = rs.source;
            const qty = parseFloat(String(rs.qty)) || 0;
            const key = sourceName;
            const tSales = rowSalesTotalBySource.get(key) || 0;
            flatRows.push({
                ...row,
                _originalRowId: row.id,
                [sourceProp]: sourceName,
                [qtyProp]: qty,
                [colorProp]: rs.color,
                _totalSales: tSales,
                _isRetired: isRetired(rs),
                _isLocked: isLocked(rs)
            });
        });
    });
    return flatRows;
}
