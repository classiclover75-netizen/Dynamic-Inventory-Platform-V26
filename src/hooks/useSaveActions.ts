import { PageConfig, RowData } from "../types";
import { savePageConfig, patchRow, appendPageRows, bulkPatchRows, putRows } from "../lib/api";
import { validateReplacePayload } from "../lib/rowSaveMode";
import { findAllLinkedTrackers } from "../lib/trackerOrderSync";

export function useSaveActions(deps: {
  state: any;
  setState: any;
  toast: any;
  toggleModal: any;
  editingRowId: any;
  setEditingRowId: any;
  setConfirmationModal: any;
  setPrimarySearchTags: any;
  primParentRef: any;
  returnToImagePreview: any;
  setReturnToImagePreview: any;
  returnToSettings: any;
  setReturnToSettings: any;
  refetchAndHydrateState?: any;
  loadPageData?: any;
}) {
  const { state, setState, toast, toggleModal, editingRowId, setEditingRowId, setConfirmationModal, setPrimarySearchTags, primParentRef, returnToImagePreview, setReturnToImagePreview, returnToSettings, setReturnToSettings, refetchAndHydrateState, loadPageData } = deps;
  const handleSaveActivePageSettings = async (
    config: PageConfig,
    closeModal: boolean = true,
  ) => {
    try {
      await savePageConfig(state.activePage, config);

      setState((prev) => ({
        ...prev,
        pageConfigs: {
          ...prev.pageConfigs,
          [state.activePage]: config,
        },
      }));
      if (closeModal) {
        toggleModal("activePageSettings", false);
        toast(`Page settings updated for ${state.activePage}`);
      }
    } catch (err) {
      console.error(err);
      toast("Failed to save page settings to database");
    }
  };
  const handleSaveRows = async (
    newRows: RowData[],
    pageName?: string,
    force = false,
    mode: "append" | "replace" = "append"
  ): Promise<boolean> => {
    const targetPage = pageName || state.activePage;
    let currentRows = [...(state.pageRows[targetPage] || [])];

    if (mode === "replace") {
      const validation = validateReplacePayload(state.pageRows[targetPage], newRows);
      if (!validation.ok) {
        toast(`Save blocked: ${validation.reason}`);
        return false;
      }
      currentRows = newRows;
    } else {
      if (editingRowId) {
        const idx = currentRows.findIndex((r) => r.id === editingRowId);
        if (idx >= 0) currentRows[idx] = newRows[0];
        else currentRows.push(newRows[0]);
      } else {
        currentRows.push(...newRows);
      }
    }

    try {
      let response;
      if (mode === "replace") {
        response = await putRows(targetPage, newRows, true);
        if (response.ok) {
          const finalRows = state.pageRows[targetPage] ? state.pageRows[targetPage].length : 0;
          if (newRows.length > finalRows) {
            console.error("Safety check failed: new rows count exceeds previous count.");
          }
        }
      } else if (editingRowId && newRows.length === 1) {
        response = await patchRow(targetPage, editingRowId, newRows[0], force);
      } else {
        response = await appendPageRows(targetPage, newRows, force);
      }

      if (!response.ok) {
        if (response.status === 400) {
          let data: any = {}; try { data = await response.json(); } catch(e) {}
          if (data.requiresConfirmation) {
            setConfirmationModal({
              isOpen: true,
              title: "Unsupported Image Format",
              message: data.error,
              onConfirm: () => handleSaveRows(newRows, pageName, true, mode),
            });
            return false;
          }
        } else if (response.status === 404) {
          toast("This data was changed elsewhere. Refreshing to the latest version… please redo your change.");
          if (refetchAndHydrateState) {
            await refetchAndHydrateState();
          }
          toggleModal("addRow", false);
          setEditingRowId(null);
          return false;
        } else if (response.status === 409) {
          toast("Someone else changed this page while you were editing. Your change was not saved to avoid overwriting their work. The page has been refreshed, please redo your change.", 6000);
          if (refetchAndHydrateState) {
            await refetchAndHydrateState();
          }
          toggleModal("addRow", false);
          setEditingRowId(null);
          return false;
        }
        throw new Error("Database failed to save");
      }

      // Success! Update state
      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [targetPage]: currentRows,
        },
      }));

      if (mode === "append" && !editingRowId && !force) {
        setPrimarySearchTags([]);

        setTimeout(() => {
          if (primParentRef.current) {
            primParentRef.current.scrollTop = primParentRef.current.scrollHeight;
          }
        }, 100);
      }

      const wasEditing = editingRowId;
      toggleModal("addRow", false);
      setEditingRowId(null);

      // Auto-sync trackers
      const linkedTrackers = findAllLinkedTrackers(targetPage, state.pageConfigs, state.pageLinks);

      await Promise.allSettled(linkedTrackers.map(async (trackerName) => {
        let trackerConfig = state.pageConfigs[trackerName];
        let trackerRowsState = state.pageRows[trackerName];

        if (!trackerConfig || !trackerRowsState) {
          const data = await loadPageData?.(trackerName);
          if (!data || !data.config) return;
          trackerConfig = data.config;
          trackerRowsState = data.rows || [];
        }

        const trackerRows = [...trackerRowsState];
        let updatedTracker = false;
        
        const updatesObj: Record<string, any> = {};
        const appendRows: any[] = [];

        for (const newRow of newRows) {
          const tIdx = trackerRows.findIndex((r) => r.id === newRow.id);
          if (tIdx >= 0 && wasEditing) {
            const existingTrackerRow = trackerRows[tIdx];
            const trackerKeysToKeep = [
              "total_qty",
              "remaining_qty",
              ...trackerConfig.columns
                .filter((c) => c.type === "sale_tracker")
                .map((c) => c.key),
            ];
            const preservedData: any = {};
            for (const k of trackerKeysToKeep)
              if (k in existingTrackerRow)
                preservedData[k] = existingTrackerRow[k];
            trackerRows[tIdx] = { ...newRow, ...preservedData };

            updatesObj[newRow.id] = trackerRows[tIdx];
            updatedTracker = true;
          } else if (!wasEditing && mode === "append") {
            const newTrackerRow = {
              ...newRow,
              total_qty: "0",
            };
            trackerRows.push(newTrackerRow);
            
            appendRows.push(newTrackerRow);
            updatedTracker = true;
          }
        }
        
        if (Object.keys(updatesObj).length > 0) {
          await bulkPatchRows(trackerName, { updates: updatesObj }, true);
        }

        if (appendRows.length > 0) {
          await appendPageRows(trackerName, appendRows, false, true);
        }

        if (updatedTracker) {
          setState((prev) => ({
            ...prev,
            pageRows: { ...prev.pageRows, [trackerName]: trackerRows },
          }));
        }
      }));

      let hasRemoteUrl = false;
      for (const row of newRows) {
        for (const [key, val] of Object.entries(row)) {
          if (key === 'id') continue;
          let s = null;
          if (typeof val === 'string') {
            s = val;
          } else if (val && typeof val === 'object' && typeof (val as any).data === 'string') {
            s = (val as any).data;
          }
          if (s) {
            const lower = s.toLowerCase();
            if ((lower.startsWith('http://') || lower.startsWith('https://')) && !lower.includes('/uploads/')) {
              hasRemoteUrl = true;
              break;
            }
          }
        }
        if (hasRemoteUrl) break;
      }

      if (hasRemoteUrl && refetchAndHydrateState) {
        await refetchAndHydrateState();
      }

      // Jab database se OK aa jaye, tabhi success message show karein
      if (returnToImagePreview) {
        toggleModal("imagePreview", true);
        setReturnToImagePreview(false);
      } else if (returnToSettings) {
        toggleModal("activePageSettings", true);
        setReturnToSettings(false);
      }

      toast(
        mode === "replace"
          ? "Changes saved successfully."
          : wasEditing
          ? "Row updated successfully"
          : `${newRows.length} row(s) added successfully!`,
      );
      return true;
    } catch (err) {
      console.error("Save Error:", err);
      // Agar database save karne mein fail ho jaye to user ko lal/error alert dein
      toast("❌ Error saving to database! Please try again.");
      return false;
    }
  };

  return { handleSaveActivePageSettings, handleSaveRows };
}
