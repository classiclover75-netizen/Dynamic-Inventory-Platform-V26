import { useState, useCallback, useMemo } from 'react';

export function useSaleColumnSearch() {
  const [searchText, setSearchText] = useState("");
  const [savedTerms, setSavedTerms] = useState<string[]>([]);
  const [activeTerms, setActiveTerms] = useState<Set<string>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);

  const saveTerm = useCallback(() => {
    const term = searchText.trim();
    if (term && !savedTerms.includes(term)) {
      setSavedTerms(prev => [...prev, term]);
      setActiveTerms(prev => {
        const next = new Set(prev);
        next.add(term);
        return next;
      });
    }
    setSearchText("");
  }, [searchText, savedTerms]);

  const toggleTerm = useCallback((term: string, idx: number, isShift: boolean) => {
    setActiveTerms(prev => {
      const next = new Set(prev);
      const isCurrentlyActive = next.has(term);
      const targetState = !isCurrentlyActive;

      if (!isShift || lastClickedIdx === null) {
        if (targetState) next.add(term);
        else next.delete(term);
        return next;
      }

      const start = Math.min(lastClickedIdx, idx);
      const end = Math.max(lastClickedIdx, idx);
      for (let i = start; i <= end; i++) {
        if (targetState) next.add(savedTerms[i]);
        else next.delete(savedTerms[i]);
      }
      return next;
    });
    setLastClickedIdx(idx);
  }, [lastClickedIdx, savedTerms]);

  const removeTerm = useCallback((term: string) => {
    setSavedTerms(prev => prev.filter(t => t !== term));
    setActiveTerms(prev => {
      const next = new Set(prev);
      next.delete(term);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setActiveTerms(new Set(savedTerms));
  }, [savedTerms]);

  const selectNone = useCallback(() => {
    setActiveTerms(new Set());
  }, []);

  const clearAll = useCallback(() => {
    setSavedTerms([]);
    setActiveTerms(new Set());
    setLastClickedIdx(null);
  }, []);

  const effectiveTerms = useMemo(() => {
    const terms = new Set<string>();
    activeTerms.forEach(t => terms.add(t.toLowerCase()));
    const current = searchText.trim().toLowerCase();
    if (current) terms.add(current);
    return Array.from(terms);
  }, [activeTerms, searchText]);

  return {
    searchText,
    setSearchText,
    savedTerms,
    activeTerms,
    effectiveTerms,
    saveTerm,
    toggleTerm,
    removeTerm,
    selectAll,
    selectNone,
    clearAll
  };
}
