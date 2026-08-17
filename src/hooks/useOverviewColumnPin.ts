import { useState, useCallback, useMemo, useEffect } from 'react';

export function useOverviewColumnPin(
  initialPinnedCols: string[] = [],
  onSavePinnedCols?: (cols: string[]) => void,
  getColWidth?: (id: string) => number,
  colWidths?: Record<string, number>,
  isOpen?: boolean,
  colIds?: string[]
) {
  const [pinnedCols, setPinnedCols] = useState<string[]>(initialPinnedCols);

  useEffect(() => {
    if (isOpen) {
      setPinnedCols(initialPinnedCols || []);
    }
  }, [isOpen, initialPinnedCols]);

  const togglePin = useCallback((colId: string) => {
    setPinnedCols(prev => {
      let next;
      if (prev.includes(colId)) {
        next = prev.filter(id => id !== colId);
      } else {
        next = [...prev, colId];
      }
      if (onSavePinnedCols) onSavePinnedCols(next);
      return next;
    });
  }, [onSavePinnedCols]);

  const { pinnedOffsets, lastPinnedColId } = useMemo(() => {
    const offsets: Record<string, number> = {};
    let currentOffset = 0;
    let lastPinned = null;
    
    if (colIds) {
      for (const colId of colIds) {
        if (pinnedCols.includes(colId)) {
          offsets[colId] = currentOffset;
          currentOffset += (getColWidth ? getColWidth(colId) : 150);
          lastPinned = colId;
        }
      }
    } else {
      for (const colId of pinnedCols) {
        offsets[colId] = currentOffset;
        currentOffset += (getColWidth ? getColWidth(colId) : 150);
        lastPinned = colId;
      }
    }
    
    return { pinnedOffsets: offsets, lastPinnedColId: lastPinned };
  }, [pinnedCols, getColWidth, colWidths, colIds]);

  return {
    pinnedCols,
    togglePin,
    pinnedOffsets,
    lastPinnedColId
  };
}
