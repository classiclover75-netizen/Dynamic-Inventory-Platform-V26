import { isRetired, splitActiveRetired, sumActive } from '../lib/sourceArchiveUtils';
import { getRowRetiredSourceNames } from '../lib/rowRetiredFilter';
import React from "react";
import { Lock, ArrowUp, ArrowDown } from "lucide-react";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { CopyPopupNotification } from "./CopyPopupNotification";
import { decodeHtmlEntities, parseMultiSource } from "../lib/appUtils";
import { RowPositionEditor } from "./RowPositionEditor";
import { sanitizeHtml } from "../lib/sanitizeHtml";
import { RetiredSourcePickerPopup } from "./RetiredSourcePickerPopup";
import { getVisibleSaleSources, getCurrentSaleColumnKey } from '../lib/saleColumnSourceFilter';
import { ArchivedSaleSourceAdder } from './ArchivedSaleSourceAdder';
import { getInlineRetiredSourceNames } from '../lib/inlineRetiredHelper';
import { isLocked, toggleLockInTotalQty } from '../lib/sourceLockUtils';
import { resolveChipRender, resolveBorderAccent } from '../lib/colorRender';
import { getCreationTooltip } from '../lib/sourceTimestamp';

export const TableView = ({
  activeFilterSaleCol,
  config, rows, queries, isSecondary, showArchived, setBox1Value, setBox2Value, activeAnchor, originalRows, isGhost, ghostIds,
  state, activeConfig,
  inlineEdit, setInlineEdit,
  selectedRowIds, setSelectedRowIds,
  setHoveredImage,
  activePopupId, setActivePopupId, setActiveAnchor,
  setEditingRowId, setEditingPageName, setPreviewContext,
  primTable, secTable,
  primVirtualizer, secVirtualizer,
  primParentRef, secParentRef,
  savedPrimScroll, savedSecScroll,
  handleClosePopup, handleDragEnd, handleSaveColumnWidth, handleSaveInlineEdit,
  onTogglePinColumn,
  onOpenRetiredOverview,
  onOpenActiveSourceOverview,
  handleTableMouseOver, handleTableMouseOut,
  getImageUrl, toggleModal,
}: any) => {
  const [containerWidth, setContainerWidth] = React.useState<number | null>(null);
  const [openRetiredPickerRowId, setOpenRetiredPickerRowId] = React.useState<string | null>(null);
  const [adderOpenCellId, setAdderOpenCellId] = React.useState<string | null>(null);
  const currentSaleKey = React.useMemo(() => getCurrentSaleColumnKey(config?.columns || []), [config?.columns]);
  React.useEffect(() => {
    const parentRef = isSecondary ? secParentRef : primParentRef;
    if (!parentRef?.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(parentRef.current);
    setContainerWidth(parentRef.current.clientWidth);
    return () => observer.disconnect();
  }, [isSecondary, secParentRef, primParentRef]);

  const originalRowIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    if (originalRows && Array.isArray(originalRows)) {
      originalRows.forEach((r, idx) => map.set(String(r.id), idx));
    }
    return map;
  }, [originalRows]);

  const highlightText = (
    text: any,
    tokens: string[],
    isGhost: boolean = false,
  ) => {
    const strText = decodeHtmlEntities(String(text || ""));
    const cleanText = strText
      ? strText
          .replace(/<!--[\s\S]*?-->/g, "")
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/&nbsp;/gi, " ")
      : "";
    if (!tokens || tokens.length === 0 || !cleanText) return cleanText;

    const escapedStrings = tokens.map((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let bStart = "";
      let bEnd = "";
      if (/^[0-9]/.test(t)) {
        bStart = ""; // Removed strict numeric boundary for SKU compatibility
        bEnd = "";
      } else if (/^[a-zA-Z]/.test(t)) {
        if (t.length <= 2) {
          bStart = "(?<![a-zA-Z])";
          bEnd = "(?![a-zA-Z]{2,})"; // Restored strict end boundary
        } else {
          bStart = "";
        }
      }
      return bStart + escaped + bEnd;
    });
    const regex = new RegExp("(" + escapedStrings.join("|") + ")", "gi");
    const parts = cleanText.split(regex);
    const highlightClass = isGhost
      ? "bg-green-100 text-green-900 border border-green-500 font-bold rounded-sm px-[1px]"
      : "bg-yellow-300 text-black font-bold rounded-sm px-[1px]";
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className={highlightClass}>
          {part}
        </span>
      ) : (
        part
      ),
    );
  };
  const highlightHtmlText = (
    htmlString: string,
    tokens: string[],
    isGhost: boolean = false,
  ) => {
    const decodedHtml = decodeHtmlEntities(htmlString);
    const cleanHtml = decodedHtml
      ? decodedHtml.replace(/<!--[\s\S]*?-->/g, "").replace(/&nbsp;/gi, " ")
      : "";
    if (!tokens || tokens.length === 0 || !cleanHtml) return cleanHtml;
    const escapedStrings = tokens.map((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let bStart = "";
      let bEnd = "";
      if (/^[0-9]/.test(t)) {
        bStart = ""; // Removed strict numeric boundary for SKU compatibility
        bEnd = "";
      } else if (/^[a-zA-Z]/.test(t)) {
        if (t.length <= 2) {
          bStart = "(?<![a-zA-Z])";
          bEnd = "(?![a-zA-Z]{2,})"; // Restored strict end boundary
        } else {
          bStart = "";
        }
      }
      return bStart + escaped + bEnd;
    });
    const regex = new RegExp(
      "(" + escapedStrings.join("|") + ")(?![^<]*>)",
      "gi",
    );
    const highlightClass = isGhost
      ? "bg-green-100 text-green-900 border border-green-500 font-bold rounded-sm px-[1px]"
      : "bg-yellow-300 text-black font-bold rounded-sm px-[1px]";
    return cleanHtml.replace(
      regex,
      (match) => `<span class="${highlightClass}">${match}</span>`,
    );
  };

    const currentTable = isSecondary ? secTable : primTable;
    const currentVirtualizer = isSecondary ? secVirtualizer : primVirtualizer;
    const currentParentRef = isSecondary ? secParentRef : primParentRef;

    const flatHeadersMap = new Map();
    try {
      currentTable.getFlatHeaders().forEach((h: any) => {
        flatHeadersMap.set(h.id, h);
      });
    } catch (e) {
      // Safety verification check: ignore if failing to precompute
    }
    


    const activePage = isSecondary
      ? state.pageConfigs[state.activePage]?.secondarySearchPage
      : state.activePage;

    const isTableSorted = config.columns.some(
      (col) => col.sortEnabled && col.sortPriority && col.sortPriority > 0,
    );
    const hasAnyExplicitPinned = config.columns.some((col: any) => col.pinned);
    const visibleColumns = config.columns.filter(
      (col: any) => showArchived || !col.archived,
    ).map((col: any) => {
      if (hasAnyExplicitPinned && col.key === 'sr') {
         return { ...col, pinned: true };
      }
      return col;
    });
    
    const pinnedOffsets: Record<string, number> = {};
    let currentLeftOffset = 0;
    const hasRowReorder = !isSecondary && config.rowReorderEnabled && !(typeof config.linkedSourcePage === 'string' && config.linkedSourcePage.trim() !== '');
    
    if (hasAnyExplicitPinned) {
      if (hasRowReorder) {
        currentLeftOffset += 40;
      }
      visibleColumns.forEach((col: any) => {
        if (col.pinned) {
          pinnedOffsets[col.key] = currentLeftOffset;
          const header = flatHeadersMap.get(col.key) || currentTable
            .getFlatHeaders()
            .find((h: any) => h.id === col.key);
          const activeWidth = header
            ? header.getSize()
            : col.width ||
              (col.key === "sr"
                ? state.globalRowNoWidth || 100
                : col.type === "image"
                  ? 137
                  : 150);
          currentLeftOffset += activeWidth;
        }
      });
    }

    const pinnedCols = visibleColumns.filter((c: any) => c.pinned);
    const lastPinnedColKey = pinnedCols.length > 0 ? pinnedCols[pinnedCols.length - 1].key : null;
    const spacerWidth = 50;
    if (!config || !config.columns) {
      return (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 m-4">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-bold text-gray-700">
            Page Configuration Missing
          </h3>
        </div>
      );
    }

    const virtualItems = currentVirtualizer.getVirtualItems();
    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
    const paddingBottom =
      virtualItems.length > 0
        ? currentVirtualizer.getTotalSize() -
          virtualItems[virtualItems.length - 1].end
        : 0;
    const colSpan =
      visibleColumns.length +
      (hasRowReorder ? 1 : 0) + 1;

    const colTokensMap: Record<string, string[]> = {};
    visibleColumns.forEach((col) => {
      let tokens: string[] = [];
      queries.forEach((query) => {
        const qLower = query.toLowerCase();
        const colonIndex = qLower.indexOf(":");
        if (colonIndex > 0) {
          const prefix = qLower.substring(0, colonIndex).trim();
          const suffix = qLower.substring(colonIndex + 1).trim();
          if (
            col.name.toLowerCase().includes(prefix) ||
            prefix.includes(col.name.toLowerCase())
          ) {
            tokens.push(...suffix.split(/\s+/).filter(Boolean));
          }
        } else {
          tokens.push(...qLower.split(/\s+/).filter(Boolean));
        }
      });
      colTokensMap[col.key] = tokens;
    });


    return (
      <div
        className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border-none rounded-none m-0 p-0 relative outline-none"
        ref={currentParentRef}
        style={{
          ...(hasAnyExplicitPinned ? {
            scrollSnapType: 'none',
            scrollPaddingLeft: `${currentLeftOffset}px`
          } : {})
        }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          )
            return;
          if (e.key === "Home") {
            e.preventDefault();
            currentVirtualizer.scrollToIndex(0);
          } else if (e.key === "End") {
            e.preventDefault();
            currentVirtualizer.scrollToIndex(rows.length - 1);
          } else if (e.key === "PageUp") {
            e.preventDefault();
            if (currentParentRef.current)
              currentParentRef.current.scrollTop -=
                currentParentRef.current.clientHeight;
          } else if (e.key === "PageDown") {
            e.preventDefault();
            if (currentParentRef.current)
              currentParentRef.current.scrollTop +=
                currentParentRef.current.clientHeight;
          }
        }}
        onScroll={(e) => {
          const isActualSearchEmpty = queries.length === 0 || isGhost;
          if (isSecondary) {
            if (isActualSearchEmpty)
              savedSecScroll.current = e.currentTarget.scrollTop;
          } else {
            if (isActualSearchEmpty)
              savedPrimScroll.current = e.currentTarget.scrollTop;
          }
        }}
      >
          <table
            className="border-separate border-spacing-0 table-fixed w-max max-w-none text-[14px] font-normal"
            style={{
              width: `${currentTable.getTotalSize() + (hasRowReorder ? 40 : 0) + spacerWidth}px`,
            }}
            onMouseOver={handleTableMouseOver}
            onMouseOut={handleTableMouseOut}
          >
            <thead>
              <tr>
                {hasRowReorder && (
                  <th
                    className={`sticky top-0 text-center p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] bg-[#f3f3f3] data-[hovered-col=true]:bg-[#fce7f3]`}
                    style={{
                      width: "40px",
                      minWidth: "40px",
                      maxWidth: "40px",
                      ...(hasAnyExplicitPinned ? { left: 0, zIndex: 30 } : { zIndex: 20 })
                    }}
                  >
                  </th>
                )}
                {visibleColumns.map((col, i) => {
                  const header = flatHeadersMap.get(col.key) || currentTable
                    .getFlatHeaders()
                    .find((h) => h.id === col.key);
                  const isResizing = header?.column?.getIsResizing();
                  const activeWidth = header
                    ? header.getSize()
                    : col.width ||
                      (col.key === "sr"
                        ? state.globalRowNoWidth || 100
                        : col.type === "image"
                          ? 137
                          : 150);

                  const defaultWidthClass =
                    col.key === "sr"
                      ? "text-center"
                      : col.type === "image"
                        ? "text-center"
                        : "text-left";

                  const isPinned = col.pinned;
                  const leftOffset = isPinned ? pinnedOffsets[col.key] : undefined;
                  const isLastPinned = isPinned && col.key === lastPinnedColKey;
                  
                  return (
                    <th
                      key={col.key}
                      className={`sticky top-0 text-[14px] font-bold text-[#2f3d49] p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${defaultWidthClass} bg-[#f3f3f3] data-[hovered-col=true]:bg-[#fce7f3] ${isResizing ? "overflow-visible" : ""} ${isLastPinned ? "shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-300" : ""}`}
                      style={{
                        width: `${activeWidth}px`,
                        minWidth: `${activeWidth}px`,
                        maxWidth: `${activeWidth}px`,
                        ...(isPinned ? { left: `${leftOffset}px`, zIndex: 30 } : { zIndex: 20 }),

                      }}
                    >
                      <div className="flex items-center gap-1">
                        {i + 1}. {col.name}{" "}
                        {col.sortPriority ? (
                          <span className="text-[10px] font-bold text-gray-500">
                            (P{col.sortPriority})
                          </span>
                        ) : (
                          ""
                        )}{" "}
                        {col.locked && "🔒"}
                        {col.sortEnabled && col.key !== "sr" && (
                          <div className="flex items-center gap-0.5">
                            {col.sortDirection === "desc" ? (
                              <ArrowDown
                                size={12}
                                className={
                                  col.sortLocked ? "text-gray-400" : ""
                                }
                              />
                            ) : (
                              <ArrowUp
                                size={12}
                                className={
                                  col.sortLocked ? "text-gray-400" : ""
                                }
                              />
                            )}
                            {col.sortLocked && (
                              <Lock size={12} className="text-gray-500" />
                            )}
                          </div>
                        )}
                        {col.key !== "sr" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onTogglePinColumn) onTogglePinColumn(col.key);
                            }}
                            className={`p-0 m-0 ml-1 bg-transparent border-0 cursor-pointer transition-opacity ${col.pinned ? 'opacity-100 hover:opacity-80' : 'opacity-40 hover:opacity-100 grayscale-[0.5]'}`}
                            title={col.pinned ? "Unpin column (unfreeze)" : "Pin column (freeze)"}
                          >
                            📌
                          </button>
                        )}
                      </div>

                      <ColumnResizeHandle 
                        header={header} 
                        columnName={col.name}
                        onManualSave={(id, w) => {
                          let targetPage = state.activePage;
                          if (isSecondary && activeConfig?.secondarySearchPage) {
                            targetPage = activeConfig.secondarySearchPage;
                          }
                          handleSaveColumnWidth(id, w, targetPage);
                        }} 
                      />
                    </th>
                  );
                })}
                <th
                  className="border-none bg-transparent pointer-events-none"
                  style={{ width: `${spacerWidth}px`, minWidth: `${spacerWidth}px`, maxWidth: `${spacerWidth}px` }}
                ></th>
              </tr>
            </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={colSpan}
                        className="text-center text-[#90a4ae] font-normal p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0]"
                      >
                        {queries.length > 0
                          ? "No rows match your search."
                          : "No row data yet."}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {paddingTop > 0 && (
                        <tr>
                          <td
                            colSpan={colSpan}
                            style={{ height: `${paddingTop}px` }}
                          />
                        </tr>
                      )}
                      {virtualItems.map((virtualItem) => {
                        const rowIndex = virtualItem.index;
                        const row = rows[rowIndex];
                        const isActiveRow = !(
                          isGhost && !ghostIds.has(String(row.id))
                        );
                        const isRowEditing = inlineEdit?.id?.startsWith(
                          String(row.id) + "-",
                        );
                        return (
                              <tr
                                key={row.id}
                                className={`${!isSecondary && selectedRowIds.has(row.id) ? "bg-[#e8f0fe]" : ""} ${isRowEditing ? "relative z-[60]" : ""}`}
                                style={{
                                  ...(isRowEditing
                                    ? { position: "relative", zIndex: 60 }
                                    : {}),
                                  height: `${config.rowHeight || 100}px`,
                                }}
                              >
                                {hasRowReorder && (
                                  <td
                                    className={`text-center p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] data-[hovered-col=true]:bg-[#f0f7ff] data-[hovered-row=true]:bg-[#e8f0fe] data-[hovered-exact=true]:!bg-[#d2e3fc] data-[hovered-exact=true]:shadow-[inset_0_0_0_3px_#2b579a,inset_0_2px_4px_0_rgba(0,0,0,0.05)] data-[hovered-exact=true]:relative data-[hovered-exact=true]:z-10 ${hasAnyExplicitPinned ? (!isSecondary && selectedRowIds.has(row.id) ? 'bg-[#e8f0fe]' : 'bg-white') : ''}`}
                                    style={{
                                      width: "40px",
                                      minWidth: "40px",
                                      maxWidth: "40px",
                                      ...(hasAnyExplicitPinned ? { position: 'sticky', left: 0, zIndex: 15 } : {})
                                    }}
                                  >
                                    <div className="flex items-center justify-center relative">
                                      <RowPositionEditor
                                        currentIndex={originalRowIndexMap.has(String(row.id)) ? originalRowIndexMap.get(String(row.id))! : rowIndex}
                                        totalRows={originalRows?.length || rows.length}
                                        rowId={row.id}
                                        onPositionChange={(src, dest, id) => {
                                          handleDragEnd({
                                            destination: { index: dest },
                                            source: { index: src },
                                            draggableId: id,
                                          });
                                        }}
                                      />
                                    </div>
                                  </td>
                                )}
                                {visibleColumns.map((col, colIndex) => {
                                  const header = flatHeadersMap.get(col.key) || currentTable
                                    .getFlatHeaders()
                                    .find((h) => h.id === col.key);
                                  const activeWidth = header
                                    ? header.getSize()
                                    : col.width ||
                                      (col.key === "sr"
                                        ? state.globalRowNoWidth || 100
                                        : col.type === "image"
                                          ? 137
                                          : 150);

                                  const widthStyle = {
                                    width: `${activeWidth}px`,
                                    minWidth: `${activeWidth}px`,
                                    maxWidth: `${activeWidth}px`,
                                  };

                                  const isPinned = col.pinned;
                                  const leftOffset = isPinned ? pinnedOffsets[col.key] : undefined;
                                  const isLastPinned = isPinned && col.key === lastPinnedColKey;
                                  
                                  const pinnedBgClass = isPinned ? (!isSecondary && selectedRowIds.has(row.id) ? 'bg-[#e8f0fe]' : 'bg-white') : '';
                                  const pinnedShadowClass = isLastPinned ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-300' : '';

                                  const hoverClass =
                                    `data-[hovered-col=true]:bg-[#f0f7ff] data-[hovered-row=true]:bg-[#e8f0fe] data-[hovered-exact=true]:!bg-[#d2e3fc] data-[hovered-exact=true]:shadow-[inset_0_0_0_3px_#2b579a,inset_0_2px_4px_0_rgba(0,0,0,0.05)] data-[hovered-exact=true]:relative data-[hovered-exact=true]:z-10 ${pinnedBgClass} ${pinnedShadowClass}`;

                                  const colTokens = isActiveRow
                                    ? colTokensMap[col.key] || []
                                    : [];
                                  const isResizing = header?.column?.getIsResizing();
                                  const commonProps = {
                                    style: {
                                      ...widthStyle,
                                      position: (isPinned ? "sticky" : "relative") as "sticky" | "relative",
                                      ...(isPinned ? { left: `${leftOffset}px`, zIndex: 15 } : {}),
                                      overflow: isResizing
                                        ? ("visible" as const)
                                        : ("hidden" as const),
                                    },
                                  };
                                  if (col.key === "sr") {
                                    return (
                                      <td
                                        key={col.key}
                                        {...commonProps}
                                        className={`font-normal p-1 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] bg-[#f3f3f3] data-[hovered-row=true]:bg-[#fce7f3] overflow-hidden ${pinnedShadowClass}`}
                                      >
                                        <div className="flex items-center justify-center gap-0 px-0.5 whitespace-nowrap">
                                          <span className="text-[14px]">
                                            {isTableSorted
                                              ? rowIndex + 1
                                              : originalRows.findIndex(
                                                  (r) => r.id === row.id,
                                                ) + 1}
                                            .
                                          </span>
                                          <div className="flex items-center shrink-0">
                                            <button
                                              className="border-0 bg-transparent cursor-pointer text-[14px] hover:scale-110 transition-transform p-0"
                                              title="Edit Row"
                                              onClick={() => {
                                                setEditingRowId(row.id);
                                                setEditingPageName(
                                                  isSecondary
                                                    ? activeConfig.secondarySearchPage!
                                                    : state.activePage,
                                                );
                                                toggleModal("addRow", true);
                                              }}
                                            >
                                              ✏️
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    );
                                  }

                                  const rawVal = row[col.key];

                                  if (col.type === "image") {
                                    const imgData =
                                      typeof rawVal === "object" &&
                                      rawVal !== null
                                        ? rawVal.data
                                        : rawVal;
                                    const isImg =
                                      typeof imgData === "string" &&
                                      (imgData.startsWith("data:image") ||
                                        /^https?:\/\//i.test(imgData) ||
                                        imgData.includes("."));
                                    return (
                                      <td
                                        key={col.key}
                                        {...commonProps}
                                        className={`text-center p-0 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${hoverClass} bg-white overflow-hidden`}
                                        style={{
                                          ...commonProps.style,
                                          height: `${config.rowHeight || 100}px`,
                                        }}
                                        onMouseMove={(e) => {
                                          if (
                                            isImg &&
                                            config.hoverPreviewEnabled
                                          ) {
                                            setHoveredImage({
                                              url: getImageUrl(imgData),
                                              x: e.clientX,
                                              y: e.clientY,
                                            });
                                          }
                                        }}
                                        onMouseLeave={() => {
                                          setHoveredImage(null);
                                        }}
                                      >
                                        {isImg ? (
                                          <img
                                            src={getImageUrl(imgData, true)}
                                            alt="img"
                                            loading="lazy"
                                            className="w-full h-full object-contain cursor-pointer block"
                                            onClick={() => {
                                              setPreviewContext({
                                                rowId: row.id,
                                                imageKey: col.key,
                                                pageName: isSecondary
                                                  ? activeConfig.secondarySearchPage!
                                                  : state.activePage,
                                              });
                                              toggleModal("imagePreview", true);
                                            }}
                                          />
                                        ) : (
                                          <span className="w-full h-full inline-flex items-center justify-center text-[#9e9e9e] text-2xl bg-[#fafafa]">
                                            📷
                                          </span>
                                        )}
                                      </td>
                                    );
                                  }

                                  if (col.type === "text_with_copy_button") {
                                    const items = Array.isArray(rawVal)
                                      ? rawVal
                                          .map((v) => String(v || "").trim())
                                          .filter(Boolean)
                                      : String(rawVal || "").trim()
                                        ? [String(rawVal).trim()]
                                        : [];
                                    const isCellActive =
                                      activePopupId?.startsWith(
                                        `${row.id}-${col.key}`,
                                      );
                                    const cellClass = isCellActive
                                      ? "bg-[#fff3cd] shadow-[inset_0_0_0_2px_#fac800] relative z-10 transition-all"
                                      : hoverClass;

                                    return (
                                      <td
                                        key={col.key}
                                        {...commonProps}
                                        className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${cellClass} overflow-hidden`}
                                      >
                                        {items.length > 0 && (
                                          <div className="flex flex-col gap-1">
                                            {items.map((item, i) => {
                                              const hideButton =
                                                item.startsWith("!");
                                              let displayText = hideButton
                                                ? item.slice(1)
                                                : item;
                                              displayText = decodeHtmlEntities(
                                                displayText,
                                              )
                                                .replace(/<!--[\s\S]*?-->/g, "")
                                                .replace(/&nbsp;/gi, " ");
                                              const itemId = `${row.id}-${col.key}-${i}`;
                                              const hasHtml =
                                                /<[a-z][\s\S]*>/i.test(
                                                  displayText,
                                                );
                                              return (
                                                <div
                                                  key={i}
                                                  className={`flex items-center justify-between gap-1.5 border border-[#d7e3f6] bg-[#f9fcff] rounded px-1.5 py-0.5 min-h-[25px] ${hideButton ? "bg-gray-50 border-gray-100 opacity-80" : ""}`}
                                                >
                                                  {hasHtml ? (
                                                    <span
                                                      className="whitespace-pre-wrap"
                                                      dangerouslySetInnerHTML={{
                                                        __html: sanitizeHtml(
                                                          highlightHtmlText(
                                                            displayText,
                                                            colTokens,
                                                            isGhost,
                                                          )
                                                        ),
                                                      }}
                                                    />
                                                  ) : (
                                                    <span className="whitespace-pre-wrap">
                                                      {highlightText(
                                                        displayText,
                                                        colTokens,
                                                        isGhost,
                                                      )}
                                                    </span>
                                                  )}
                                                  {!hideButton && (
                                                    <>
                                                      <button
                                                        className="border-0 rounded bg-[#2b579a] text-white px-1.5 py-0.5 text-[11px] font-bold cursor-pointer shrink-0"
                                                        onClick={(e) => {
                                                          const target =
                                                            e.currentTarget;
                                                          const plainText =
                                                            hasHtml
                                                              ? displayText.replace(
                                                                  /<[^>]*>?/gm,
                                                                  "",
                                                                )
                                                              : displayText;
                                                          navigator.clipboard
                                                            .writeText(
                                                              plainText,
                                                            )
                                                            .then(() => {
                                                              setActivePopupId(
                                                                itemId,
                                                              );
                                                              setActiveAnchor(
                                                                target,
                                                              );
                                                              const activeCopyCfg =
                                                                state
                                                                  .pageConfigs[
                                                                  state
                                                                    .activePage
                                                                ]
                                                                  ?.copyBoxConfig;
                                                              if (
                                                                activeCopyCfg
                                                              ) {
                                                                const currentPage =
                                                                  isSecondary
                                                                    ? activeConfig.secondarySearchPage!
                                                                    : state.activePage;
                                                                if (
                                                                  activeCopyCfg
                                                                    .box1
                                                                    .sourcePage ===
                                                                    currentPage &&
                                                                  activeCopyCfg
                                                                    .box1
                                                                    .sourceColumn ===
                                                                    col.key
                                                                )
                                                                  setBox1Value(
                                                                    plainText,
                                                                  );
                                                                if (
                                                                  activeCopyCfg
                                                                    .box2
                                                                    .sourcePage ===
                                                                    currentPage &&
                                                                  activeCopyCfg
                                                                    .box2
                                                                    .sourceColumn ===
                                                                    col.key
                                                                )
                                                                  setBox2Value(
                                                                    plainText,
                                                                  );
                                                              }
                                                            });
                                                        }}
                                                      >
                                                        Copy
                                                      </button>
                                                      <CopyPopupNotification
                                                        text={
                                                          hasHtml
                                                            ? displayText.replace(
                                                                /<[^>]*>?/gm,
                                                                "",
                                                              )
                                                            : displayText
                                                        }
                                                        columnName={col.name}
                                                        columnNumber={
                                                          colIndex + 1
                                                        }
                                                        isActive={
                                                          activePopupId ===
                                                          itemId
                                                        }
                                                        anchorElement={
                                                          activeAnchor
                                                        }
                                                        onClose={
                                                          handleClosePopup
                                                        }
                                                      />
                                                    </>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </td>
                                    );
                                  }

                                  if (config.isTrackerPage) {
                                    if (col.key === "custom_temp_sum") {
                                      const breakdown = parseMultiSource(row.custom_temp_sum_breakdown);
                                      return (
                                        <td
                                          key={col.key}
                                          {...commonProps}
                                          className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] overflow-hidden whitespace-pre-wrap bg-purple-50 text-purple-900 font-bold text-center`}
                                        >
                                          <div className="flex flex-col gap-1 justify-center w-full min-h-[20px]">
                                            {breakdown.map((b: any, idx: number) => {
                                              const render = resolveChipRender(b.color);
                                              return (
                                                <div 
                                                  key={idx} 
                                                  className={`w-full px-1.5 py-0.5 rounded text-[14px] font-bold border flex items-center justify-between gap-1 shadow-sm ${render.kind === 'class' ? render.className : ""}`}
                                                  style={render.kind === 'style' ? render.style : undefined}
                                                >
                                                  <span className="shrink-0 capitalize">{b.source}:</span>
                                                  <span className="flex-1 text-right">{b.qty}</span>
                                                </div>
                                              );
                                            })}
                                            <div className="mt-1 pt-1 border-t border-purple-200 text-purple-900 font-extrabold text-[15px] flex items-center justify-between w-full">
                                              <span className="opacity-50 text-[11px] uppercase tracking-wider">Total</span>
                                              <span>{rawVal}</span>
                                            </div>
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (col.key === "remaining_qty") {
                                      const totalSources = parseMultiSource(
                                        row.total_qty,
                                      );
                                      const saleCols = config.columns.filter(
                                        (c) => c.type === "sale_tracker",
                                      );

                                      const { active: activeTotalSources } = splitActiveRetired(totalSources);
                                      const remainingSources = activeTotalSources.map(
                                        (ts: any) => {
                                          let totalSaleForSource = 0;
                                          saleCols.forEach((sc) => {
                                            const sales = parseMultiSource(
                                              row[sc.key],
                                            );
                                            const saleEntry = sales.find(
                                              (s: any) =>
                                                s.source === ts.source,
                                            );
                                            if (saleEntry)
                                              totalSaleForSource +=
                                                parseFloat(saleEntry.qty) || 0;
                                          });
                                          return {
                                            ...ts,
                                            remaining:
                                              (parseFloat(ts.qty) || 0) -
                                              totalSaleForSource,
                                          };
                                        },
                                      );

                                      const isPickerOpen = openRetiredPickerRowId === row.id;
                                      return (
                                        <td
                                          key={col.key}
                                          {...commonProps}
                                          style={{ ...commonProps.style, overflow: isPickerOpen ? "visible" : commonProps.style.overflow, zIndex: isPickerOpen ? 99999 : commonProps.style.zIndex }}
                                          className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${hoverClass} ${isPickerOpen ? "relative !z-[60]" : ""}`}
                                        >
                                          <div className="flex flex-col gap-1 justify-center">
                                            {remainingSources.map(
                                              (s: any, idx: number) => {
                                                const locked = isLocked(s);
                                                const alert = s.remaining <= (config.minStockAlert ?? 0);
                                                const render = alert ? null : resolveChipRender(s.color);
                                                return (
                                                  <div
                                                    key={idx}
                                                    className={`px-2 py-0.5 rounded text-[14px] font-bold border flex items-center gap-1 ${alert ? "bg-[#FF0000] text-white border-[#cc0000] shadow-md" : (render?.kind === 'class' ? render.className : '')} ${locked ? "opacity-50 grayscale" : ""}`}
                                                    style={render?.kind === 'style' ? render.style : undefined}
                                                  >
                                                    <span className={`${alert ? "text-white font-extrabold" : ""} flex items-center`}>
                                                      {s.source}:{locked && <span className="ml-1 text-[10px]">🔒</span>}
                                                    </span>{" "}
                                                    <span>{s.remaining}</span>
                                                  </div>
                                                );
                                              }
                                            )}
                                            {totalSources.length >= 2 && (
                                              <div className="mt-1 pt-1 border-t border-gray-200 text-gray-900 font-extrabold text-[15px] flex items-center justify-between w-full px-1">
                                                <span className="opacity-50 text-[11px] uppercase tracking-wider">Total</span>
                                                <span>{remainingSources.reduce((sum, s) => sum + (Number(s.remaining) || 0), 0)}</span>
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (col.key === "total_qty") {
                                      const totalSources = parseMultiSource(rawVal);
                                      const { active, retired } = splitActiveRetired(totalSources);
                                      
                                      const inlineSet = getInlineRetiredSourceNames(config.columns, activeFilterSaleCol, row);
                                      const inlineRetired = retired.filter((s: any) => inlineSet.has(s.source));
                                      const chipRetired = retired.filter((s: any) => !inlineSet.has(s.source));
                                      
                                      const isPickerOpen = openRetiredPickerRowId === row.id;
                                      return (
                                        <td
                                          key={col.key}
                                          {...commonProps}
                                          style={{ ...commonProps.style, overflow: isPickerOpen ? "visible" : commonProps.style.overflow, zIndex: isPickerOpen ? 99999 : commonProps.style.zIndex }}
                                          className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${hoverClass} ${isPickerOpen ? "relative !z-[60]" : ""}`}
                                        >
                                          <div className="flex flex-col gap-1 justify-center relative group">
                                            {active.map(
                                              (s: any, idx: number) => {
                                                const locked = isLocked(s);
                                                const render = resolveChipRender(s.color);
                                                return (
                                                  <div
                                                    key={idx}
                                                    title={getCreationTooltip(s)}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (onOpenActiveSourceOverview) onOpenActiveSourceOverview([s.source]);
                                                    }}
                                                    className={`group px-2 py-0.5 rounded text-[14px] font-bold border flex items-center justify-between gap-1 ${render.kind === 'class' ? render.className : ""} cursor-pointer hover:opacity-80 transition-opacity ${locked ? "opacity-50 grayscale" : ""}`}
                                                    style={render.kind === 'style' ? render.style : undefined}
                                                  >
                                                    <div className="flex items-center gap-1">
                                                      <span className="flex items-center">
                                                        {s.source}:{locked && <span className="ml-1 text-[13px]">🔒</span>}
                                                      </span>{" "}
                                                      <span>{s.qty}</span>
                                                    </div>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        const newTotalQty = toggleLockInTotalQty(rawVal, s.source);
                                                        handleSaveInlineEdit(activePage!, row.id, "total_qty", newTotalQty);
                                                      }}
                                                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-white/60 hover:bg-white text-gray-700 rounded p-1 shadow-sm border border-black/10 w-7 h-7 flex items-center justify-center text-[14px] cursor-pointer"
                                                      title={locked ? "Unlock source" : "Lock source"}
                                                    >
                                                      {locked ? "🔓" : "🔒"}
                                                    </button>
                                                  </div>
                                                );
                                              }
                                            )}
                                            {totalSources.length >= 2 && (
                                              <div className="mt-1 pt-1 border-t border-gray-200 text-gray-900 font-extrabold text-[15px] flex items-center justify-between w-full px-1">
                                                <span className="opacity-50 text-[11px] uppercase tracking-wider">Total</span>
                                                <span>{sumActive(totalSources)}</span>
                                              </div>
                                            )}
                                            {inlineRetired.map(
                                              (s: any, idx: number) => {
                                                const render = resolveChipRender(s.color);
                                                return (
                                                  <div
                                                    key={`inline-ret-${idx}`}
                                                    title={getCreationTooltip(s)}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      if (onOpenRetiredOverview) onOpenRetiredOverview([s.source]);
                                                    }}
                                                    className={`px-2 py-0.5 rounded text-[14px] font-bold border flex items-center gap-1 ${render.kind === 'class' ? render.className : ""} cursor-pointer hover:opacity-80 transition-opacity`}
                                                    style={render.kind === 'style' ? render.style : undefined}
                                                  >
                                                    <span>
                                                      {s.source}:
                                                    </span>{" "}
                                                    <span>{s.qty}</span>
                                                    <span className="ml-auto text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">(retired)</span>
                                                  </div>
                                                );
                                              }
                                            )}
                                            {chipRetired.length > 0 && config.showRetiredChipInTotalQty !== false && (
                                              <div className="relative mt-1">
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenRetiredPickerRowId(openRetiredPickerRowId === row.id ? null : row.id);
                                                  }}
                                                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold py-0.5 px-2 rounded-full border border-gray-200 flex items-center justify-center gap-1.5 transition-colors"
                                                >
                                                  <span>🗄️ {chipRetired.length} retired</span>
                                                </button>
                                                {openRetiredPickerRowId === row.id && (
                                                  <RetiredSourcePickerPopup
                                                    retiredSources={chipRetired}
                                                    onClose={() => setOpenRetiredPickerRowId(null)}
                                                    onDone={(selected) => {
                                                      setOpenRetiredPickerRowId(null);
                                                      if (onOpenRetiredOverview) onOpenRetiredOverview(selected);
                                                    }}
                                                  />
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    } if (col.type === "sale_tracker") {
                                      const totalSourcesRaw = parseMultiSource(
                                        row.total_qty,
                                      );
                                      const currentVal =
                                        parseMultiSource(rawVal);
                                      
                                      
                                      const isCellEditing = inlineEdit?.id?.startsWith(`${row.id}-${col.key}-`);
                                      const isAdderOpen = adderOpenCellId === `${row.id}-${col.key}`;
                                      const isCellExpanded = isCellEditing || isAdderOpen;
                                      const inlineEditSource = isCellEditing ? inlineEdit!.id.replace(`${row.id}-${col.key}-`, '') : null;
                                      
                                      const isCurrentSaleCol = col.key === currentSaleKey;
                                      const totalSources = getVisibleSaleSources(isCurrentSaleCol, totalSourcesRaw, currentVal, inlineEditSource);
                                      
                                      // Compute hidden sources for sale columns
                                      const hiddenSources = totalSourcesRaw.filter((ts: any) => {
                                        const isVisible = totalSources.some((vts: any) => vts.source === ts.source);
                                        if (isVisible) return false;
                                        if (isCurrentSaleCol) {
                                            return isLocked(ts); // Only locked sources can be hidden in current col
                                        }
                                        return true; // Older columns hide all non-visible
                                      });
                                        
                                      const draftVal = isCellEditing ? parseMultiSource(inlineEdit!.val) : currentVal;


                                      return (
                                        <td
                                          key={col.key}
                                          {...commonProps}
                                          style={{ ...commonProps.style, overflow: isCellExpanded ? "visible" : commonProps.style.overflow, zIndex: isCellExpanded ? 99999 : undefined }}
                                          className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${hoverClass} text-xs ${isCellExpanded ? "relative !z-[60]" : ""}`}
                                        >
                                          <div className="flex flex-col gap-1 justify-center w-full min-h-[20px]">
                                            {totalSources.map(
                                              (ts: any, idx: number) => {
                                                const isThisRowEditing = inlineEdit?.id === `${row.id}-${col.key}-${ts.source}`;
                                                const currentSaleEntry = (isThisRowEditing ? draftVal : currentVal).find(
                                                  (s: any) => s.source === ts.source
                                                );
                                                const saleQty = currentSaleEntry ? currentSaleEntry.qty : 0;
                                                const originalSaleEntry = currentVal.find((s: any) => s.source === ts.source);
                                                const originalQty = originalSaleEntry ? originalSaleEntry.qty : 0;

                                                const locked = isLocked(ts);
                                                const render = resolveChipRender(ts.color);
                                                return (
                                                  <div key={idx} className="w-full">
                                                    <div 
                                                      className={`group w-full px-1.5 py-0.5 rounded text-[14px] font-bold border flex items-center justify-between gap-1 ${render.kind === 'class' ? render.className : ""} ${locked ? "opacity-50 grayscale" : ""}`}
                                                      style={render.kind === 'style' ? render.style : undefined}
                                                    >
                                                      <div className="flex items-center justify-between w-full">
                                                        <div className="shrink-0 flex flex-col items-start justify-center">
                                                          <span className="flex items-center">
                                                            {ts.source}:{locked && <span className="ml-1 text-[10px]">🔒</span>}
                                                          </span>
                                                          {isRetired(ts) && (
                                                            <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap mt-0.5 self-start">(retired)</span>
                                                          )}
                                                        </div>
                                                        <span className="flex-1 text-right">{saleQty}</span>
                                                      </div>
                                                      {!locked && <button
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setInlineEdit({
                                                            id: `${row.id}-${col.key}-${ts.source}`,
                                                            colKey: col.key,
                                                            val: rawVal ? String(rawVal) : JSON.stringify([]),
                                                            history: [],
                                                            historyPointer: 0,
                                                          });
                                                        }}
                                                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 bg-white/60 hover:bg-white text-gray-700 rounded p-1 shadow-sm border border-black/10 w-6 h-6 flex items-center justify-center text-[10px] cursor-pointer ml-1"
                                                        title="Edit sale"
                                                      >
                                                        ✏️
                                                      </button>}
                                                    </div>

                                                    {isThisRowEditing && (
                                                      <div 
                                                        className="absolute z-[999999] top-0 right-0 bg-white p-3 rounded-lg shadow-[0_5px_20px_rgba(0,0,0,0.5)] border-[3px] flex flex-col gap-4 min-w-[240px]"
                                                        style={{ borderColor: resolveBorderAccent(ts.color) }}
                                                        onClick={(e) => e.stopPropagation()}
                                                      >
                                                        <div className="font-bold text-gray-700 text-[14px]">Edit Sale for {ts.source}</div>
                                                        <div className="text-[11px] text-gray-500 mb-2 -mt-0.5">Previous Value: <span className="font-bold text-gray-800">{originalQty}</span></div>
                                                        <div className="flex items-center justify-between gap-2 border-b pb-3">
                                                          <span 
                                                            className={`px-2 py-1 rounded text-[15px] font-bold border ${render.kind === 'class' ? render.className : ""}`}
                                                            style={render.kind === 'style' ? render.style : undefined}
                                                          >{ts.source}</span>
                                                          <input
                                                            type="number"
                                                            value={saleQty === 0 ? "0" : saleQty || ""}
                                                            placeholder="0"
                                                            onChange={(e) => {
                                                              const copy = [...draftVal];
                                                              const existingIdx = copy.findIndex((s: any) => s.source === ts.source);
                                                              const newVal = e.target.value;
                                                              if (existingIdx >= 0) {
                                                                copy[existingIdx].qty = newVal;
                                                              } else {
                                                                copy.push({ source: ts.source, qty: newVal, color: ts.color });
                                                              }
                                                              setInlineEdit((prev) => ({ ...prev!, val: JSON.stringify(copy) }));
                                                            }}
                                                            onWheel={(e) => e.currentTarget.blur()}
                                                            onFocus={(e) => {
                                                              setTimeout(() => e.target.select(), 0);
                                                            }}
                                                            onKeyDown={(e) => {
                                                              if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                handleSaveInlineEdit(activePage!, row.id, col.key, inlineEdit!.val);
                                                              } else if (e.key === "Escape") {
                                                                e.preventDefault();
                                                                setInlineEdit(null);
                                                              }
                                                            }}
                                                            autoFocus
                                                            className="w-24 bg-gray-50 border border-gray-300 px-2 py-1 text-right font-bold text-[16px] rounded text-blue-800 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none placeholder:text-gray-400/70"
                                                          />
                                                        </div>
                                                        <div className="flex items-center justify-end gap-3 pt-1">
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setInlineEdit(null);
                                                            }}
                                                            className="bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded px-4 py-1.5 text-sm font-bold shadow-md transition-colors"
                                                          >
                                                            Cancel
                                                          </button>
                                                          <button
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleSaveInlineEdit(activePage!, row.id, col.key, inlineEdit!.val);
                                                            }}
                                                            className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded px-5 py-1.5 text-sm font-bold shadow-md transition-colors"
                                                          >
                                                            Save
                                                          </button>
                                                        </div>
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              }
                                            )}
                                            {totalSources.length >= 2 && (
                                              <div className="mt-1 pt-1 border-t border-gray-200 text-gray-900 font-extrabold text-[15px] flex items-center justify-between w-full px-1.5">
                                                <span className="opacity-50 text-[11px] uppercase tracking-wider">Total</span>
                                                <span>{totalSources.reduce((sum, ts) => {
                                                    const currentSaleEntry = draftVal.find((s) => s.source === ts.source);
                                                    return sum + (currentSaleEntry ? (Number(currentSaleEntry.qty) || 0) : 0);
                                                }, 0)}</span>
                                              </div>
                                            )}
                                            {hiddenSources.length > 0 && (
                                              <ArchivedSaleSourceAdder
                                                hiddenSources={hiddenSources}
                                                onOpenChange={(open) => setAdderOpenCellId(prev => open ? `${row.id}-${col.key}` : (prev === `${row.id}-${col.key}` ? null : prev))}
                                                onSelect={(source) => {
                                                  setInlineEdit({
                                                    id: `${row.id}-${col.key}-${source}`,
                                                    colKey: col.key,
                                                    val: rawVal ? String(rawVal) : JSON.stringify([]),
                                                    history: [],
                                                    historyPointer: 0,
                                                  });
                                                }}
                                              />
                                            )}
                                          </div>
                                        </td>
                                      );
                                    }
                                  }

                                  if (Array.isArray(rawVal)) {
                                    return (
                                      <td
                                        key={col.key}
                                        {...commonProps}
                                        className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${hoverClass} overflow-hidden`}
                                      >
                                        {rawVal.map((v, i) => {
                                          const strVal = String(v || "");
                                          const decodedStrVal = decodeHtmlEntities(strVal);
                                          const hasHtml =
                                            /<[a-z][\s\S]*>/i.test(decodedStrVal);
                                          return (
                                            <React.Fragment key={i}>
                                              {hasHtml ? (
                                                <span
                                                  className="whitespace-pre-wrap"
                                                  dangerouslySetInnerHTML={{
                                                    __html: sanitizeHtml(
                                                      highlightHtmlText(
                                                        decodedStrVal,
                                                        colTokens,
                                                        isGhost,
                                                      )
                                                    ),
                                                  }}
                                                />
                                              ) : (
                                                <span className="whitespace-pre-wrap">
                                                  {highlightText(
                                                    strVal,
                                                    colTokens,
                                                    isGhost,
                                                  )}
                                                </span>
                                              )}
                                              <br />
                                            </React.Fragment>
                                          );
                                        })}
                                      </td>
                                    );
                                  }

                                  const strRawVal = String(rawVal || "");
                                  const decodedRawVal = decodeHtmlEntities(strRawVal);
                                  const hasHtmlRaw = /<[a-z][\s\S]*>/i.test(
                                    decodedRawVal,
                                  );
                                  return (
                                    <td
                                      key={col.key}
                                      {...commonProps}
                                      className={`p-1.5 border-r-[length:medium] border-b-[length:medium] border-[#e0e0e0] ${hoverClass} overflow-hidden whitespace-pre-wrap`}
                                    >
                                      {hasHtmlRaw ? (
                                        <span
                                          dangerouslySetInnerHTML={{
                                            __html: sanitizeHtml(
                                              highlightHtmlText(
                                                decodedRawVal,
                                                colTokens,
                                                isGhost,
                                              )
                                            ),
                                          }}
                                        />
                                      ) : (
                                        highlightText(
                                          rawVal,
                                          colTokens,
                                          isGhost,
                                        )
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="border-none bg-transparent pointer-events-none" style={{ width: `${spacerWidth}px`, minWidth: `${spacerWidth}px`, maxWidth: `${spacerWidth}px` }}></td>
                              </tr>
                        );
                      })}
                      {paddingBottom > 0 && (
                        <tr>
                          <td
                            colSpan={colSpan}
                            style={{ height: `${paddingBottom}px` }}
                          />
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
          </table>
      </div>
    );
};
