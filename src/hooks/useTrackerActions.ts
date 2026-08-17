import { fetchFreshPageData } from "../lib/syncFetch";
import { parseMultiSource } from "../lib/appUtils";
import React from "react";
import { PageConfig } from "../types";
import { putRows, savePageConfig } from "../lib/api";
import { createPageSafe, deletePageSafe } from "../lib/pageMutations";

export function useTrackerActions(deps: {
  state: any;
  setState: any;
  toast: any;
  activeConfig: any;
  activeRows: any;
  customSaleName: any;
  setCustomSaleName: any;
  setIsSalePromptOpen: any;
  activeFilterSaleCol: any;
  setActiveFilterSaleCol: any;
  setSelectedArchiveCols: any;
  handleSaveActivePageSettings: any;
  handleSaveRows: any;
  loadSourcePageIfNeeded: any;
}) {
  const {
    state,
    setState,
    toast,
    activeConfig,
    activeRows,
    customSaleName,
    setCustomSaleName,
    setIsSalePromptOpen,
    activeFilterSaleCol,
    setActiveFilterSaleCol,
    setSelectedArchiveCols,
    handleSaveActivePageSettings,
    handleSaveRows,
    loadSourcePageIfNeeded,
  } = deps;

  const handleSyncTracker = async (trackerName: string) => {
    try {
      const trackerConfig = state.pageConfigs[trackerName];
      if (!trackerConfig || !trackerConfig.linkedSourcePage) return;

      const sourcePage = trackerConfig.linkedSourcePage;
      const freshData = await fetchFreshPageData(sourcePage);
      
      if (!freshData || !Array.isArray(freshData.rows)) {
        toast("Sync blocked: could not fetch the latest source page data. Check your connection and try again.");
        return;
      }

      const sourceRows = freshData.rows;
      const trackerRows = state.pageRows[trackerName] || [];

      if (sourceRows.length === 0 && trackerRows.length > 0) {
        if (!window.confirm(`Warning: The source page "${sourcePage}" currently has 0 rows. Syncing will erase all rows in this tracker. Are you sure you want to proceed?`)) {
          return;
        }
      }

      const trackerRowsMap = new Map();
      for (const tr of trackerRows) {
        if (tr.id) trackerRowsMap.set(String(tr.id), tr);
      }

      const repairedTrackerRows = sourceRows.map((sr: any) => {
        const existingTr = trackerRowsMap.get(String(sr.id));
        if (existingTr) {
          const trackerKeysToKeep = [
            "total_qty",
            "remaining_qty",
            ...trackerConfig.columns
              .filter((c: any) => c.type === "sale_tracker")
              .map((c: any) => c.key),
          ];
          const preservedData: any = {};
          for (const k of trackerKeysToKeep) {
            if (k in existingTr) preservedData[k] = existingTr[k];
          }
          return { ...sr, ...preservedData };
        } else {
          return { ...sr, total_qty: "0" };
        }
      });

      const response = await putRows(trackerName, repairedTrackerRows, true);
      if (!response.ok) throw new Error("Failed to sync to server");

      setState((prev: any) => ({
        ...prev,
        pageConfigs: { ...prev.pageConfigs, [sourcePage]: freshData.config },
        pageRows: { ...prev.pageRows, [trackerName]: repairedTrackerRows, [sourcePage]: sourceRows },
      }));

      toast("Tracker synced successfully!");
    } catch (err) {
      console.error("Sync error:", err);
      toast("Failed to sync tracker.");
    }
  };
  const handleCreateTracker = async (
    sourcePage: string,
    selectedColKeys?: string[],
  ) => {
    const loaded = await loadSourcePageIfNeeded(sourcePage);
    if (!loaded) return toast("Source page not found!");
    const sourceConfig = loaded.config;
    const sourceRows = loaded.rows || [];

    // SMART AUTO-NUMBERING LOGIC
    const baseTrackerName = `${sourcePage} - Live Tracker`;
    let trackerCounter = 1;
    let trackerName = `${baseTrackerName} (${trackerCounter})`;

    // Keep increasing the number in brackets if the name already exists
    while (state.pages.includes(trackerName)) {
      trackerCounter++;
      trackerName = `${baseTrackerName} (${trackerCounter})`;
    }

    const filteredColumns = selectedColKeys
      ? sourceConfig.columns.filter(
          (c) => selectedColKeys.includes(c.key) || c.key === "sr",
        )
      : sourceConfig.columns;

    // EXACT COPY of ALL columns, appending only Total and Remaining
    const newColumns = [
      ...filteredColumns,
      {
        key: "total_qty",
        name: "Total Qty",
        type: "number" as const,
        width: 150,
      },
      {
        key: "remaining_qty",
        name: "Remaining Qty",
        type: "number" as const,
        locked: true,
        width: 150,
      },
    ];

    const newConfig: PageConfig = {
      ...sourceConfig,
      isTrackerPage: true,
      linkedSourcePage: sourcePage,
      columns: newColumns,
      minStockAlert: 5,
      autoSortBySales: true,
    };

    // EXACT COPY of ALL row data, setting total_qty to '0'
    const newRows = sourceRows.map((row) => {
      const newRow = { ...row };
      if (selectedColKeys) {
        Object.keys(newRow).forEach((k) => {
          if (
            k !== "id" &&
            k !== "sr" &&
            !selectedColKeys.includes(k) &&
            k !== "total_qty" &&
            k !== "remaining_qty"
          ) {
            delete newRow[k];
          }
        });
      }
      newRow.total_qty = "0";
      return newRow;
    });

    try {
      await createPageSafe(trackerName, newConfig);
      try {
        const rowsResponse = await putRows(trackerName, newRows, true);
        if (!rowsResponse.ok) {
          throw new Error("Failed to write tracker rows");
        }
      } catch (rowErr) {
        try {
          await deletePageSafe(trackerName);
        } catch (cleanupErr) {
          console.error("Failed to clean up tracker page after row write failure:", cleanupErr);
        }
        throw rowErr;
      }

      setState((prev: any) => ({
        ...prev,
        pages: [...prev.pages, trackerName],
        activePage: trackerName,
        pageConfigs: { ...prev.pageConfigs, [trackerName]: newConfig },
        pageRows: { ...prev.pageRows, [trackerName]: newRows },
      }));
      toast(`Tracker "${trackerName}" created with ALL columns!`);
    } catch (err: any) {
      console.error(err);
      toast(err.message || "Failed to create tracker page");
    }
  };
  const handleAddSaleColumn = async () => {
    if (!customSaleName.trim()) return;
    const newColKey = "sale_" + Date.now();
    
    const sourcesSet = new Set<string>();
    activeRows.forEach(row => {
      const rawTotal = String(row.total_qty || "0");
      if (rawTotal.trim().startsWith("[")) {
        try {
          const totalSources = parseMultiSource(rawTotal);
          totalSources.forEach((s: any) => {
            if (s.source) sourcesSet.add(s.source);
          });
        } catch(e) {}
      }
    });
    
    const newCol = {
      key: newColKey,
      name: customSaleName,
      type: "sale_tracker" as const,
      archived: false,
      width: 260,
      sourcesSnapshot: Array.from(sourcesSet),
    };

    // Find where to insert the new column (before existing sale columns)
    const currentColumns = activeConfig.columns.map((c) =>
      c.type === "sale_tracker" ? { ...c, archived: true } : c,
    );
    const firstSaleIndex = activeConfig.columns.findIndex(
      (c) => c.type === "sale_tracker",
    );

    if (firstSaleIndex !== -1) {
      currentColumns.splice(firstSaleIndex, 0, newCol); // Push old columns to the right
    } else {
      currentColumns.push(newCol); // If no sale columns exist yet
    }

    const updatedConfig = { ...activeConfig, columns: currentColumns };

    try {
      await savePageConfig(state.activePage, updatedConfig);
      setState((prev) => ({
        ...prev,
        pageConfigs: { ...prev.pageConfigs, [state.activePage]: updatedConfig },
      }));
      setIsSalePromptOpen(false);
      setCustomSaleName("");
      toast(`Sale column "${customSaleName}" added successfully!`);
    } catch (err) {
      console.error(err);
      toast("Failed to add sale column");
    }
  };
  const handleBulkDeleteSaleColumns = async (
    colKeys: string[],
    deleteType: "normal" | "smart",
  ) => {
    if (!state.activePage || colKeys.length === 0) return;

    const colKeysSet = new Set(colKeys);
    const updatedColumns = activeConfig.columns.filter(
      (c) => !colKeysSet.has(c.key),
    );

    const newConfig = { ...activeConfig, columns: updatedColumns };

    const updatedRows = activeRows.map((row) => {
      const newRow = { ...row };
      if (deleteType === "smart") {
        const rawTotal = String(row.total_qty || "");
        if (rawTotal.trim().startsWith("[")) {
          try {
            const totalSources = parseMultiSource(row.total_qty);
            
            // Calculate total deductions per source across all deleted columns
            const sourceDeductions: Record<string, number> = {};
            for (const key of colKeys) {
              const saleSources = parseMultiSource(row[key]);
              for (const ss of saleSources) {
                if (ss.source) {
                  sourceDeductions[ss.source] = (sourceDeductions[ss.source] || 0) + (parseFloat(String(ss.qty)) || 0);
                }
              }
            }

            const updatedSources = totalSources.map((ts: any) => {
              const deduction = sourceDeductions[ts.source] || 0;
              return {
                ...ts,
                qty: (parseFloat(String(ts.qty)) || 0) - deduction
              };
            });
            newRow.total_qty = JSON.stringify(updatedSources);
          } catch (err) {
            // On parse error, leave unchanged
          }
        } else {
          let totalDeduction = 0;
          for (const key of colKeys) {
            totalDeduction += parseFloat(String(row[key] || 0)) || 0;
          }
          const totalQty = parseFloat(String(row.total_qty || 0)) || 0;
          newRow.total_qty = String(totalQty - totalDeduction);
        }
      }
      for (const key of colKeys) {
        delete newRow[key];
      }
      return newRow;
    });

    const saved = await handleSaveRows(updatedRows, state.activePage, true, "replace");
    if (saved) {
      await handleSaveActivePageSettings(newConfig, false);
      toast(
        `${colKeys.length} column(s) deleted successfully (${deleteType} mode).`,
      );
    }
    setSelectedArchiveCols(new Set());
    if (activeFilterSaleCol && colKeysSet.has(activeFilterSaleCol)) {
      setActiveFilterSaleCol(null);
    }
  };

    const handleManageTrackerColumns = async (newSourceColKeys: string[]) => {
    if (!activeConfig || !activeConfig.linkedSourcePage) return;
    const sourcePage = activeConfig.linkedSourcePage;
    const loaded = await loadSourcePageIfNeeded(sourcePage);
    
    if (!loaded) {
      toast("Source page not found.");
      return;
    }
    
    const sourceConfig = loaded.config;
    const sourceRows = loaded.rows || [];

    const selectedSourceColumns = sourceConfig.columns.filter((c: any) => newSourceColKeys.includes(c.key) || c.key === "sr");
    const sourceColKeysSet = new Set(sourceConfig.columns.map((c: any) => c.key));
    
    const trackerSpecialColumns = activeConfig.columns.filter((c: any) => !sourceColKeysSet.has(c.key) && c.key !== "sr");
    const newTrackerColumns = [
      ...selectedSourceColumns,
      ...trackerSpecialColumns
    ];

    const currentTrackerColKeys = new Set(activeConfig.columns.map((c: any) => c.key));
    const newlyAddedKeys = newSourceColKeys.filter((k: string) => !currentTrackerColKeys.has(k) && k !== "sr");
    const removedKeys = sourceConfig.columns.map((c: any) => c.key).filter((k: string) => !newSourceColKeys.includes(k) && currentTrackerColKeys.has(k) && k !== "sr");
    
    const sourceRowMap = new Map(sourceRows.map((r: any) => [r.id, r]));
    const updatedTrackerRows = activeRows.map((row: any) => {
      const sourceRow = sourceRowMap.get(row.id);
      const newRow = { ...row };
      
      for (const key of newlyAddedKeys) {
        if (sourceRow && sourceRow[key] !== undefined) {
          newRow[key] = sourceRow[key];
        } else {
          delete newRow[key];
        }
      }
      
      for (const key of removedKeys) {
        delete newRow[key];
      }
      
      return newRow;
    });

    const updatedConfig = { ...activeConfig, columns: newTrackerColumns };
    await handleSaveActivePageSettings(updatedConfig, false);
    
    // Use putRows directly to replace all rows for the active page, avoiding duplicates
    const res = await putRows(state.activePage, updatedTrackerRows, true);
    if (!res.ok) {
       toast("Failed to update tracker columns. Please try again.");
       throw new Error("Failed to save rows");
    }
    
    setState((prev: any) => {
      // deduplicate rows by ID as a safety net
      const dedupedRows = [];
      const seen = new Set();
      for (const r of updatedTrackerRows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          dedupedRows.push(r);
        }
      }
      return {
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [state.activePage]: dedupedRows
        }
      };
    });
    
    toast("Tracker columns updated successfully.");
  };

  return { handleSyncTracker, handleCreateTracker, handleAddSaleColumn, handleBulkDeleteSaleColumns, handleManageTrackerColumns };
}
