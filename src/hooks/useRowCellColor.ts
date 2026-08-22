import { patchRow } from "../lib/api";
import { ROW_COLOR_KEY } from "../lib/rowCellColor";
import { findAllLinkedTrackers } from "../lib/trackerOrderSync";

export function useRowCellColor(deps: {
  state: any;
  setState: any;
  toast: any;
  pendingSavesRef: any;
}) {
  const { state, setState, toast, pendingSavesRef } = deps;

  const applyRowColorToPage = async (
    pageName: string,
    rowId: string,
    color: string | null,
    reportFailure: boolean,
  ) => {
    if (!pageName || !rowId) return;

    const existingRows = state.pageRows[pageName];
    if (Array.isArray(existingRows)) {
      const idx = existingRows.findIndex(
        (r: any) => String(r.id) === String(rowId),
      );
      if (idx >= 0) {
        const updatedRows = [...existingRows];
        updatedRows[idx] = { ...updatedRows[idx], [ROW_COLOR_KEY]: color };
        setState((prev: any) => ({
          ...prev,
          pageRows: { ...prev.pageRows, [pageName]: updatedRows },
        }));
      }
    }

    pendingSavesRef.current += 1;
    try {
      await patchRow(pageName, rowId, { [ROW_COLOR_KEY]: color });
    } catch (e) {
      if (reportFailure) {
        toast("Failed to save row colour");
      }
    } finally {
      pendingSavesRef.current -= 1;
    }
  };

  const handleSetRowColor = async (
    pageName: string,
    rowId: string,
    color: string | null,
  ) => {
    if (!pageName || !rowId) return;

    await applyRowColorToPage(pageName, rowId, color, true);

    const linkedTrackers = findAllLinkedTrackers(
      pageName,
      state.pageConfigs,
      state.pageLinks,
    );

    await Promise.all(
      linkedTrackers.map((tracker: string) =>
        applyRowColorToPage(tracker, rowId, color, false),
      ),
    );
  };

  const handleClearRowColor = async (pageName: string, rowId: string) => {
    await handleSetRowColor(pageName, rowId, null);
  };

  return { handleSetRowColor, handleClearRowColor };
}
