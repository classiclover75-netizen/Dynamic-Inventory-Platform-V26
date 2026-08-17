import { useRef } from "react";
import React from "react";

export function useTableHover() {
  const hoveredCellRef = useRef<HTMLTableCellElement | null>(null);

  const applyHover = (td: HTMLTableCellElement) => {
    const tr = td.parentElement as HTMLTableRowElement;
    if (!tr) return;
    const table = tr.closest("table");
    if (!table) return;

    const cellIndex = td.cellIndex;

    td.dataset.hoveredExact = "true";

    const cellsInRow = tr.children;
    for (let i = 0; i < cellsInRow.length; i++) {
      const cell = cellsInRow[i] as HTMLTableCellElement;
      cell.dataset.hoveredRow = "true";
    }

    const rows = table.rows;
    for (let i = 0; i < rows.length; i++) {
      const cellInCol = rows[i].children[cellIndex] as HTMLTableCellElement;
      if (cellInCol) {
        cellInCol.dataset.hoveredCol = "true";
      }
    }
  };
  const cleanupHover = (td: HTMLTableCellElement) => {
    const root = td.closest("table") || document;

    const exacts = root.querySelectorAll("[data-hovered-exact]");
    for (let i = 0; i < exacts.length; i++) {
      delete (exacts[i] as HTMLElement).dataset.hoveredExact;
    }

    const rows = root.querySelectorAll("[data-hovered-row]");
    for (let i = 0; i < rows.length; i++) {
      delete (rows[i] as HTMLElement).dataset.hoveredRow;
    }

    const cols = root.querySelectorAll("[data-hovered-col]");
    for (let i = 0; i < cols.length; i++) {
      delete (cols[i] as HTMLElement).dataset.hoveredCol;
    }
  };
  const handleTableMouseOver = (e: React.MouseEvent<HTMLTableElement>) => {
    const td = (e.target as HTMLElement).closest(
      "td, th",
    ) as HTMLTableCellElement;
    if (!td) return;

    if (hoveredCellRef.current === td) return;

    if (hoveredCellRef.current) {
      cleanupHover(hoveredCellRef.current);
    }

    hoveredCellRef.current = td;
    applyHover(td);
  };
  const handleTableMouseOut = (e: React.MouseEvent<HTMLTableElement>) => {
    const td = (e.target as HTMLElement).closest(
      "td, th",
    ) as HTMLTableCellElement;
    if (!td) return;

    const relatedTarget = e.relatedTarget as HTMLElement;
    if (td.contains(relatedTarget)) return;

    if (hoveredCellRef.current === td) {
      cleanupHover(td);
      hoveredCellRef.current = null;
    }
  };

  return { handleTableMouseOver, handleTableMouseOut };
}
