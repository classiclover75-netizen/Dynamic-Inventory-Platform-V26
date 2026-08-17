import { parseMultiSource } from './appUtils';
import { isRetired } from './sourceArchiveUtils';

export function getInlineRetiredSourceNames(columns: any[], activeFilterSaleCol: string | null | undefined, row: any): Set<string> {
    const inlineSet = new Set<string>();
    const totalSources = parseMultiSource(row.total_qty);
    const retiredSources = totalSources.filter(isRetired);
    
    if (retiredSources.length === 0) return inlineSet;

    for (const col of columns) {
        if (col.type === 'sale_tracker' && (!col.archived || col.key === activeFilterSaleCol)) {
            const saleEntries = parseMultiSource(row[col.key]);
            for (const rs of retiredSources) {
                const entry = saleEntries.find((s: any) => s.source === rs.source);
                if (entry && (parseFloat(entry.qty) || 0) > 0) {
                    inlineSet.add(rs.source);
                }
            }
        }
    }
    
    return inlineSet;
}
