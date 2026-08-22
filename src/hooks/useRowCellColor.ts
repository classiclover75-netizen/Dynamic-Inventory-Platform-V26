import { patchRow } from "../lib/api";
import { ROW_COLOR_KEY } from "../lib/rowCellColor";

export function useRowCellColor(deps: {
  state: any;
  setState: any;
  toast: any;
  pendingSavesRef: any;
}) {
  const { state, setState, toast, pendingSavesRef } = deps;

  const handleSetRowColor = async (
    pageName: string,
    rowId: string,
    color: string | null,
  ) => {
    if (!pageName || !rowId) return;
    const existingRows = state.pageRows[pageName] || [];
    const idx = existingRows.findIndex(
      (r: any) => String(r.id) === String(rowId),
    );
    if (idx < 0) return;

    const updatedRows = [...existingRows];
    updatedRows[idx] = { ...updatedRows[idx], [ROW_COLOR_KEY]: color };
    setState((prev: any) => ({
      ...prev,
      pageRows: { ...prev.pageRows, [pageName]: updatedRows },
    }));

    pendingSavesRef.current += 1;
    try {
      await patchRow(pageName, rowId, { [ROW_COLOR_KEY]: color });
    } catch (e) {
      toast("Failed to save row colour");
    } finally {
      pendingSavesRef.current -= 1;
    }
  };

  const handleClearRowColor = async (pageName: string, rowId: string) => {
    await handleSetRowColor(pageName, rowId, null);
  };

  return { handleSetRowColor, handleClearRowColor };
}
