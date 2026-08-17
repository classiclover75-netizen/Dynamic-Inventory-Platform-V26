import { useCallback } from "react";
import { bulkPatchRows } from "../lib/api";
import { 
  SourceColorChange, 
  applyColorUpdatesToRows, 
  buildColorPropagationUpdates 
} from "../lib/sourceColorSync";

export function useSourceColorSync({ state, setState, toast }: any) {
  const handlePropagateSourceColors = useCallback(async (pageName: string, changes: SourceColorChange[], excludeRowId?: string) => {
    try {
      if (!pageName || !Array.isArray(changes) || changes.length === 0) return;
      const pageConfig = state.pageConfigs?.[pageName];
      const rows = state.pageRows?.[pageName];
      if (!pageConfig || !Array.isArray(pageConfig.columns) || !Array.isArray(rows)) return;
      
      const updates = buildColorPropagationUpdates(rows, pageConfig.columns, changes, excludeRowId);
      const rowCount = Object.keys(updates).length;
      if (rowCount === 0) return;
      
      const response = await bulkPatchRows(pageName, { updates }, true);
      if (!response.ok) {
        throw new Error("Server rejected the colour update");
      }
      
      setState((prev: any) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [pageName]: applyColorUpdatesToRows(prev.pageRows[pageName] || [], updates)
        }
      }));
      
      const subject = changes.length === 1 ? `"${changes[0].source}" colour` : "Source colours";
      const rowWord = rowCount === 1 ? "row" : "rows";
      toast(`${subject} updated in ${rowCount} ${rowWord}`);
    } catch (e) {
      console.error("Failed to propagate source color", e);
      toast("Row saved, but colour could not be applied to other rows");
    }
  }, [state.pageConfigs, state.pageRows, setState, toast]);
  
  return { handlePropagateSourceColors };
}
