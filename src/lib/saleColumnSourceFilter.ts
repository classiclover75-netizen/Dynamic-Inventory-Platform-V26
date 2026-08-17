import { isRetired } from './sourceArchiveUtils';
import { isLocked } from './sourceLockUtils';

export function getCurrentSaleColumnKey(columns: any[]): string | null {
    let maxTimestamp = -1;
    let maxKey: string | null = null;
    let firstSaleKey: string | null = null;

    for (const col of columns) {
        if (col.type === "sale_tracker") {
            if (!firstSaleKey) firstSaleKey = col.key;
            
            const match = col.key.match(/^sale_(\d+)$/);
            if (match) {
                const ts = parseInt(match[1], 10);
                if (ts > maxTimestamp) {
                    maxTimestamp = ts;
                    maxKey = col.key;
                }
            }
        }
    }
    
    return maxKey || firstSaleKey;
}

export function getVisibleSaleSources(isCurrent: boolean, totalSourcesRaw: any[], saleEntries: any[], inlineEditSource?: string | null) {
    return totalSourcesRaw.filter((ts: any) => {
        // Temporarily include if it's currently being edited in this cell
        if (inlineEditSource && inlineEditSource === ts.source) {
            return true;
        }

        if (isCurrent) {
            // Current (newest) sale column
            if (isRetired(ts) || isLocked(ts)) {
                const saleEntry = saleEntries.find((s: any) => s.source === ts.source);
                return saleEntry && (parseFloat(saleEntry.qty) || 0) > 0;
            }
            return true;
        }

        // Older sale column: show ONLY sources whose sale entry qty > 0 in that column
        const saleEntry = saleEntries.find((s: any) => s.source === ts.source);
        return saleEntry && (parseFloat(saleEntry.qty) || 0) > 0;
    });
}
