import { Column } from "../types";
import { patchRow } from "../lib/api";

export function useInlineEdit(deps: {
  state: any;
  setState: any;
  toast: any;
  pendingSavesRef: any;
  setInlineEdit: any;
}) {
  const { state, setState, toast, pendingSavesRef, setInlineEdit } = deps;

  const handleSaveInlineEdit = async (
    pageName: string,
    rowId: string,
    colKey: string,
    val: string,
  ) => {
    // 1. Close the popover immediately to prevent multiple clicks and UI lag
    setInlineEdit(null);

    // 2. Optimistically update the local state
    const updatedRows = [...(state.pageRows[pageName] || [])];
    const idx = updatedRows.findIndex((r) => r.id === rowId);
    if (idx >= 0) {
      updatedRows[idx] = { ...updatedRows[idx], [colKey]: val };
      setState((prev) => ({
        ...prev,
        pageRows: { ...prev.pageRows, [pageName]: updatedRows },
      }));

      // 3. Save to database in the background
      pendingSavesRef.current += 1;
      try {
        await patchRow(pageName, rowId, { [colKey]: val });
      } catch (e) {
        toast("Failed to save inline edit");
      } finally {
        pendingSavesRef.current -= 1;
      }

      // 4. Propagate to linked trackers
      const linkedTrackers = Object.entries(state.pageConfigs)
        .filter(([_, c]: [string, any]) => c.linkedSourcePage === pageName)
        .map(([n]) => n);

      const trackerPromises = linkedTrackers.map(async (tracker) => {
        const trackerConfig = state.pageConfigs[tracker];
        const isTrackerOwnedField =
          colKey === "total_qty" ||
          colKey === "remaining_qty" ||
          trackerConfig?.columns?.some(
            (c: Column) => c.key === colKey && c.type === "sale_tracker",
          );

        if (isTrackerOwnedField) return;

        const trackerRows = state.pageRows[tracker] || [];
        const tIdx = trackerRows.findIndex((r) => r.id === rowId);
        if (tIdx >= 0) {
          const updatedTrackerRows = [...trackerRows];
          updatedTrackerRows[tIdx] = {
            ...updatedTrackerRows[tIdx],
            [colKey]: val,
          };

          setState((prev) => ({
            ...prev,
            pageRows: { ...prev.pageRows, [tracker]: updatedTrackerRows },
          }));

          pendingSavesRef.current += 1;
          try {
            await patchRow(tracker, rowId, { [colKey]: val });
          } catch (e) {
            toast(`Failed to save inline edit to tracker ${tracker}`);
          } finally {
            pendingSavesRef.current -= 1;
          }
        }
      });
      await Promise.all(trackerPromises);
    }
  };

  return { handleSaveInlineEdit };
}
