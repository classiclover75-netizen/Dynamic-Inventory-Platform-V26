import React, { useEffect, useRef } from 'react';
import { AppState } from '../types';

export function useTrackerSourcePreload({
  state,
  setState,
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
}) {
  const attemptedPages = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!state.activePage) return;
    const config = state.pageConfigs[state.activePage];
    if (!config || !config.linkedSourcePage) return;

    const sourcePageName = config.linkedSourcePage.trim();
    if (!sourcePageName) return;

    if (state.pageConfigs[sourcePageName] && state.pageRows[sourcePageName] !== undefined) {
      return;
    }

    if (!state.pages.includes(sourcePageName)) {
      return;
    }

    if (attemptedPages.current.has(sourcePageName)) {
      return;
    }

    attemptedPages.current.add(sourcePageName);

    const loadSourcePage = async () => {
      try {
        const res = await fetch(`/api/pages/${encodeURIComponent(sourcePageName)}`);
        let data: any = {};
        try {
          data = await res.json();
        } catch (e) {}

        if (data && !data.error && data.config && Array.isArray(data.rows)) {
          setState(prev => ({
            ...prev,
            pageConfigs: {
              ...prev.pageConfigs,
              [sourcePageName]: data.config,
            },
            pageRows: {
              ...prev.pageRows,
              [sourcePageName]: data.rows,
            }
          }));
        }
      } catch (error) {
        console.error("Failed to preload tracker source page:", error);
      }
    };

    loadSourcePage();
  }, [state.activePage, state.pageConfigs, state.pageRows, state.pages, setState]);
}
