import { useState, useCallback } from 'react';

export function useSaleColumnRangeSelect() {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);

  const toggle = useCallback((key: string) => {
    setAnchorKey(key);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const selectRange = useCallback((key: string, orderedKeys: string[]) => {
    setAnchorKey(key);
    setSelectedKeys(prev => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(key);
      const shouldSelect = !isCurrentlySelected;

      if (!anchorKey) {
        if (shouldSelect) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      }
      const anchorIdx = orderedKeys.indexOf(anchorKey);
      const targetIdx = orderedKeys.indexOf(key);
      if (anchorIdx === -1 || targetIdx === -1) {
        if (shouldSelect) {
          next.add(key);
        } else {
          next.delete(key);
        }
        return next;
      }
      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      for (let i = start; i <= end; i++) {
        if (shouldSelect) {
          next.add(orderedKeys[i]);
        } else {
          next.delete(orderedKeys[i]);
        }
      }
      return next;
    });
  }, [anchorKey]);

  const clear = useCallback(() => {
    setSelectedKeys(new Set());
    setAnchorKey(null);
  }, []);

  const selectAll = useCallback((keys: string[]) => {
    setSelectedKeys(new Set(keys));
    setAnchorKey(null);
  }, []);

  return { selectedKeys, toggle, selectRange, clear, selectAll, anchorKey };
}
