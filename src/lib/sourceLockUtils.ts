import { parseMultiSource } from './appUtils';

export function isLocked(entry: any): boolean {
    return entry?.locked === true;
}

export function toggleLockInTotalQty(rawTotalQty: string, sourceName: string): string {
    const sources = parseMultiSource(rawTotalQty);
    const updated = sources.map((s: any) => {
        if (s.source === sourceName) {
            return { ...s, locked: !s.locked };
        }
        return s;
    });
    return JSON.stringify(updated);
}
