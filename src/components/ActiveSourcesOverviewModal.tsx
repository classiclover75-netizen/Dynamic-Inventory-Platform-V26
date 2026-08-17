import React, { useState, useMemo, useDeferredValue } from 'react';
import ExcelJS from 'exceljs';
import { formatCellDisplay } from '../lib/formatCellDisplay';
import { saveAs } from 'file-saver';
import { Search, FileSpreadsheet } from 'lucide-react';
import { buildFlatActiveRows, buildActiveOverview, FlatActiveRow } from '../lib/activeOverviewUtils';
import { parseMultiSource } from '../lib/appUtils';
import { isRetired } from '../lib/sourceArchiveUtils';
import { sortOverviewRows, getStatusCounts, buildMixedFlatRows, getSourceNumericValue } from '../lib/overviewEnhancements';
import { resolveChipRender } from '../lib/colorRender';
import { useOverviewColumnPin } from '../hooks/useOverviewColumnPin';
import { useSaleColumnRangeSelect } from '../hooks/useSaleColumnRangeSelect';
import { useSaleColumnSearch } from '../hooks/useSaleColumnSearch';
import { OverviewColumnResizeHandle } from './OverviewColumnResizeHandle';
import { Modal, Button, Input } from './ui';
import { useToast } from './ToastProvider';

export function ActiveSourcesOverviewModal({
  isOpen,
  onClose,
  rows,
  columns,
  pageName,
  initialColWidths = {},
  onSaveColWidths,
  initialSelectedSources = null,
  initialPinnedCols = [],
  onSavePinnedCols,
  onImageClick
}: {
  initialPinnedCols?: string[];
  onSavePinnedCols?: (cols: string[]) => void;
  onImageClick?: (rowId: string, imageKey: string) => void;
  isOpen: boolean;
  onClose: () => void;
  rows: any[];
  columns: any[];
  pageName: string;
  initialColWidths?: Record<string, number>;
  onSaveColWidths?: (w: Record<string, number>) => void;
  initialSelectedSources?: string[] | null;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("Recently Added");
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  React.useEffect(() => {
    if (!showAllStatuses && sortBy === 'Status') {
      setSortBy('Recently Added');
    }
  }, [showAllStatuses, sortBy]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");

  const saleCols = useMemo(() => columns.filter((c: any) => c.type === "sale_tracker"), [columns]);
  const [showSaleColumns, setShowSaleColumns] = useState(true);

  const { selectedKeys, toggle, selectRange, clear, selectAll, anchorKey } = useSaleColumnRangeSelect();
  const orderedSaleColKeys = useMemo(() => saleCols.map((c: any) => c.key), [saleCols]);

  React.useEffect(() => {
    if (isOpen) {
      selectAll(orderedSaleColKeys);
    }
  }, [isOpen, selectAll, orderedSaleColKeys]);

  const {
    searchText: saleSearchText,
    setSearchText: setSaleSearchText,
    savedTerms: saleSavedTerms,
    activeTerms: saleActiveTerms,
    effectiveTerms: saleEffectiveTerms,
    saveTerm: saveSaleTerm,
    toggleTerm: toggleSaleTerm,
    removeTerm: removeSaleTerm,
    selectAll: selectAllSaleTerms,
    selectNone: selectNoneSaleTerms,
    clearAll: clearAllSaleTerms
  } = useSaleColumnSearch();

  const [colWidths, setColWidths] = useState<Record<string, number>>(initialColWidths);
  const colWidthsRef = React.useRef(colWidths);

  const sourceDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showSourceDropdown) return;
    const handler = (e: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target as Node)) {
        setShowSourceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSourceDropdown]);

  React.useEffect(() => {
    colWidthsRef.current = colWidths;
  }, [colWidths]);

  React.useEffect(() => {
    if (isOpen) {
      setColWidths(initialColWidths || {});
    }
  }, [isOpen, initialColWidths]);

  const startResize = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startX = e.clientX;
    const startW = colWidths[id] ?? th.offsetWidth;
    document.body.style.userSelect = 'none';
    
    const onMove = (ev) => {
      const newW = Math.max(60, startW + (ev.clientX - startX));
      setColWidths(prev => ({ ...prev, [id]: newW }));
    };
    
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      if (onSaveColWidths) {
        onSaveColWidths(colWidthsRef.current);
      }
    };
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const resetCol = (id: string) => {
    setColWidths(prev => {
      const n = { ...prev };
      delete n[id];
      if (onSaveColWidths) {
        onSaveColWidths(n);
      }
      return n;
    });
  };

  const overviewData = useMemo(() => {
    if (!isOpen) return [];
    return buildActiveOverview(rows, columns);
  }, [isOpen, rows, columns]);

  const filteredOverviewData = useMemo(() => {
    if (!sourceSearchQuery.trim()) return overviewData;
    const lowerQuery = sourceSearchQuery.toLowerCase();
    return overviewData.filter(s => s.sourceName.toLowerCase().includes(lowerQuery));
  }, [overviewData, sourceSearchQuery]);

  const flatRows = useMemo(() => {
    if (!isOpen) return [];
    if (showAllStatuses) {
      const baseRows = buildFlatActiveRows(rows, columns);
      const baseSources = new Set<string>(baseRows.map((r: any) => r._activeSourceName));
      return buildMixedFlatRows(rows, columns, baseSources, '_activeSourceName', '_activeQty', '_activeSourceColor');
    }
    return buildFlatActiveRows(rows, columns);
  }, [isOpen, rows, columns, showAllStatuses]);

  React.useEffect(() => {
    if (isOpen) {
      const allNames = overviewData.map(s => s.sourceName);
      if (initialSelectedSources && initialSelectedSources.length > 0) {
        const initialSet = new Set(initialSelectedSources.filter(s => allNames.includes(s)));
        setSelectedSources(initialSet.size > 0 ? initialSet : new Set(allNames));
      } else {
        setSelectedSources(new Set(allNames));
      }
      setSearchQuery("");
    }
  }, [isOpen, overviewData, initialSelectedSources]);

  const getImageUrl = (val: any) => {
    if (!val) return "";
    let data = val;
    if (Array.isArray(val) && val.length > 0) {
      data = val[0];
    }
    const imgData = typeof data === "object" && data !== null ? data.data || data.url || data.name : data;
    if (!imgData) return "";
    if (typeof imgData === "string" && (imgData.startsWith("data:image") || /^https?:\/\//i.test(imgData))) {
      return imgData;
    }
    return `/uploads/${imgData}`;
  };

  const getCellValue = (row: FlatActiveRow, col: any) => {
    if (col.key === "sr") {
      const rowIndex = rows.findIndex((r) => r.id === row._originalRowId);
      return String(rowIndex + 1);
    }
    if (col.key === "remaining_qty") {
       const rawTotal = String(row.total_qty || "");
       if (rawTotal.trim().startsWith("[")) {
         try {
            const totalSources = parseMultiSource(row.total_qty);
            const ts = totalSources.find((s: any) => s.source === row._activeSourceName);
            if (!ts) return "0";
            if (showAllStatuses && isRetired(ts) !== !!row._isRetired) return "0";
            
            const saleCols = columns.filter((c) => c.type === "sale_tracker");
            let totalSaleForSource = 0;
            saleCols.forEach(sc => {
                const saleArr = parseMultiSource(row[sc.key]);
                const sSale = saleArr.find((ss:any) => ss.source === row._activeSourceName);
                if (sSale) totalSaleForSource += parseFloat(String(sSale.qty)) || 0;
            });
            return String((parseFloat(String(ts.qty)) || 0) - totalSaleForSource);
         } catch(e) {
            return "0";
         }
       }
       const total = parseFloat(String(row.total_qty || 0)) || 0;
       const saleCols = columns.filter((c) => c.type === "sale_tracker");
       const totalSales = saleCols.reduce((sum: number, c: any) => sum + (parseFloat(String(row[c.key] || 0)) || 0), 0);
       return String(total - totalSales);
    }
    if (col.type === "sale_tracker" || col.key === "total_qty") {
      const rawVal = String(row[col.key] || "0");
      if (rawVal.trim().startsWith("[")) {
        try {
          const sources = parseMultiSource(rawVal);
          const s = sources.find((ss: any) => ss.source === row._activeSourceName && (col.key === 'total_qty' && showAllStatuses ? isRetired(ss) === !!row._isRetired : true));
          if (s) {
            let res = String(s.qty);
            if (col.key === 'total_qty' && showAllStatuses && row._isRetired) {
                res = `${s.source}: ${s.qty} (retired)`;
            } else if (col.key === 'total_qty' && showAllStatuses && !row._isRetired) {
                res = `${s.source}: ${s.qty}`;
            }
            return res;
          }
          return "0";
        } catch(e) {
          return rawVal;
        }
      }
      return rawVal;
    }
    return row[col.key] || "";
  };

  const highlightText = (text: string, query: string) => {
    const cleanText = text
      ? String(text)
          .replace(/<[^>]*>/g, "")
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/&nbsp;/gi, " ")
      : "";
    if (!query || !cleanText) return cleanText;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return cleanText;
    const escapedStrings = tokens.map((t) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let bStart = "";
      let bEnd = "";
      if (/^[0-9]/.test(t)) {
        bStart = "(?<![0-9])";
        bEnd = "";
      } else if (/^[a-zA-Z]/.test(t)) {
        if (t.length <= 2) {
          bStart = "(?<![a-zA-Z])";
          bEnd = "(?![a-zA-Z]{2,})";
        } else {
          bStart = "";
          bEnd = "";
        }
      }
      return bStart + escaped + bEnd;
    });
    const regex = new RegExp("(" + escapedStrings.join("|") + ")", "gi");
    const parts = cleanText.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span
          key={i}
          className="bg-yellow-300 text-black font-bold px-[1px] rounded-sm"
        >
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  const sourceColumns = useMemo(() => {
    let cols = columns.filter(c => c.key !== 'sr');
    if (!showSaleColumns) {
      cols = cols.filter(c => c.type !== 'sale_tracker');
    } else if (saleEffectiveTerms.length > 0) {
      cols = cols.filter(c => c.type !== 'sale_tracker' || saleEffectiveTerms.some(term => c.name.toLowerCase().includes(term)));
    }
    return cols;
  }, [columns, showSaleColumns, saleEffectiveTerms]);

  const filteredRows = useMemo(() => {
    const baseRows = flatRows.filter(r => selectedSources.has(r._activeSourceName));
    
    let result = baseRows;
    if (deferredSearchQuery.trim()) {
      const activeQueries = [deferredSearchQuery.trim()].filter(Boolean);
      result = baseRows.filter((row) => {
      const searchCols = [
        { name: "Active Source", val: row._activeSourceName.toLowerCase() },
        { name: "Total Sales", val: String(row._totalSales).toLowerCase() },
        ...sourceColumns.map((col: any) => {
          if (col.type === "image" || col.type === "file") return null;
          const val = getCellValue(row, col);
          const strVal = Array.isArray(val) ? val.join(" ") : val !== null && val !== undefined ? String(val) : "";
          const cleanVal = strVal.replace(/<[^>]*>/g, "").replace(/<br\s*\/?>/gi, " ").replace(/&nbsp;/gi, " ").toLowerCase();
          return { name: col.name.toLowerCase(), val: cleanVal };
        }).filter(Boolean) as { name: string; val: string }[]
      ];
      
      const globalBlob = searchCols.map((c) => c.val).join(" ");
      
      return activeQueries.some((query) => {
        let targetBlob = globalBlob;
        let searchString = query.toLowerCase();
        const colonIndex = searchString.indexOf(":");
        
        if (colonIndex > 0) {
          const prefix = searchString.substring(0, colonIndex).trim();
          const suffix = searchString.substring(colonIndex + 1).trim();
          const matchedCol = searchCols.find((c) => c.name.includes(prefix) || prefix.includes(c.name));
          if (matchedCol) {
            targetBlob = matchedCol.val;
            searchString = suffix;
          }
        }
        
        const tokens = searchString.split(/\s+/).filter(Boolean);
        return tokens.every((t) => {
          const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          let bStart = "";
          let bEnd = "";
          if (/^[0-9]/.test(t)) {
            bStart = "(?<![0-9])";
            bEnd = "";
          } else if (/^[a-zA-Z]/.test(t)) {
            if (t.length <= 2) {
              bStart = "(?<![a-zA-Z])";
              bEnd = "(?![a-zA-Z]{2,})";
            } else {
              bStart = "";
              bEnd = "";
            }
          }
          return new RegExp(bStart + escaped + bEnd, "i").test(targetBlob);
        });
      });
      }); // missing filter closing
    }
    return sortOverviewRows(result, sortBy, sortDir, columns, '_activeSourceName', 'active');
  }, [flatRows, sourceColumns, deferredSearchQuery, selectedSources, sortBy, sortDir, columns]);

  const handleExport = async () => {
    if (filteredRows.length === 0) {
      toast("No rows to export.");
      return;
    }
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Active Sources');
      
      const exportCols = [
        { name: "Active Source", width: 20 },
        { name: "Active Qty", width: 15 },
        { name: "Total Sales", width: 15 },
        ...sourceColumns.map(c => ({
          name: c.name,
          width: c.type === 'image' ? 12 : 20
        }))
      ];
      
      worksheet.columns = exportCols.map(c => ({
        header: c.name,
        key: c.name,
        width: c.width
      }));
      
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
      
      for (const row of filteredRows) {
        const rowValues: any = {};
        rowValues["Active Source"] = row._activeSourceName + (showAllStatuses && row._isRetired ? ' (retired)' : '');
        rowValues["Active Qty"] = row._activeQty;
        rowValues["Total Sales"] = row._totalSales;
        
        for (const col of sourceColumns) {
           const val = getCellValue(row, col);
           if (col.type === 'image' || col.type === 'file') {
              rowValues[col.name] = val ? '(File/Image)' : '';
           } else {
              rowValues[col.name] = val;
           }
        }
        worksheet.addRow(rowValues);
      }
      
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `${pageName || 'Inventory'}_Active_Sources_${Date.now()}.xlsx`);
      toast(`Exported ${filteredRows.length} rows successfully.`);
    } catch (err) {
      console.error(err);
      toast("Export failed.");
    } finally {
      setIsExporting(false);
    }
  };

  const visibleSourceNames = useMemo(() => {
    if (selectedSources.size > 0) return selectedSources;
    return new Set<string>(flatRows.map((r: any) => r._activeSourceName));
  }, [selectedSources, flatRows]);

  const statusCounts = useMemo(() => {
    return getStatusCounts(rows, visibleSourceNames);
  }, [rows, visibleSourceNames]);

  const colIds = ["__active_source", "__total_sales", "__range_sum", ...sourceColumns.map((c: any) => c.key)];
  const getColWidth = (id: string) => {
    if (colWidths[id]) return colWidths[id];
    if (id === '__active_source') return 150;
    if (id === '__total_sales') return 120;
    if (id === '__range_sum') return 160;
    if (saleCols.some((c: any) => c.key === id)) return 240;
    return 150;
  };
  const { pinnedCols, togglePin, pinnedOffsets, lastPinnedColId } = useOverviewColumnPin(initialPinnedCols, onSavePinnedCols, getColWidth, colWidths, isOpen, colIds);
  const totalWidth = colIds.reduce((sum, id) => sum + getColWidth(id), 0);


  const renderPinBtn = (colId: string) => {
    const isPinned = pinnedCols.includes(colId);
    return (
      <button 
        onClick={(e) => {
          e.stopPropagation();
          togglePin(colId);
        }}
        className={`shrink-0 p-0 m-0 ml-1 bg-transparent border-0 cursor-pointer transition-opacity ${isPinned ? 'opacity-100 hover:opacity-80' : 'opacity-40 hover:opacity-100 grayscale-[0.5]'}`}
        title={isPinned ? "Unpin column (unfreeze)" : "Pin column (freeze)"}
      >
        📌
      </button>
    );
  };

  const getHeaderCls = (colId: string, baseClass: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLastPinned = isPinned && lastPinnedColId === colId;
    let pinnedBg = '';
    if (isPinned) {
      if (colId === '__active_source') pinnedBg = '!bg-purple-100';
      else if (colId === '__total_sales' || colId === '__range_sum') pinnedBg = '!bg-blue-100';
      else pinnedBg = '!bg-gray-200';
    }
    return `${baseClass} overflow-hidden ${isPinned ? 'sticky z-20 ' + pinnedBg : ''} ${isLastPinned ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-400' : ''}`;
  };
  const getHeaderSty = (colId: string, width: number) => {
    const isPinned = pinnedCols.includes(colId);
    const offset = pinnedOffsets[colId] ?? 0;
    return { width: width + 'px', minWidth: width + 'px', ...(isPinned ? { left: offset + 'px' } : {}) };
  };
  const getBodyCls = (colId: string, baseClass: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLastPinned = isPinned && lastPinnedColId === colId;
    let pinnedBg = '';
    if (isPinned) {
      if (colId === '__active_source') pinnedBg = '!bg-purple-100';
      else if (colId === '__total_sales' || colId === '__range_sum') pinnedBg = '!bg-blue-100';
      else pinnedBg = '!bg-gray-100';
    }
    return `${baseClass} ${isPinned ? 'sticky z-10 ' + pinnedBg : ''} ${isLastPinned ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-400' : ''}`;
  };
  const getBodySty = (colId: string, width: number) => {
    const isPinned = pinnedCols.includes(colId);
    const offset = pinnedOffsets[colId] ?? 0;
    return { width: width + 'px', minWidth: width + 'px', ...(isPinned ? { left: offset + 'px' } : {}) };
  };
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`🗄️ Active Sources Overview (${pageName})`}
      width="95vw"
      noScroll={true}
    >
      <div className="flex flex-col h-[85vh] p-4">
        {statusCounts.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 custom-scrollbar shrink-0">
            {statusCounts.map(sc => (
               <div key={sc.source} className="flex-shrink-0 text-xs px-2 py-1 bg-white rounded-full border shadow-sm flex items-center gap-1">
                 <span className="font-bold">{sc.source}</span>
                 <span className="text-gray-400">|</span>
                 <span className="text-gray-600">Retired: {sc.retiredCount}</span>
                 <span className="text-gray-400">|</span>
                 <span className="text-gray-600">Active: {sc.activeCount}</span>
               </div>
            ))}
          </div>
        )}
        <div className="flex gap-4 mb-2 shrink-0 items-center justify-between">
           <div className="flex gap-4 items-center">
             <div className="relative" ref={sourceDropdownRef}>
               <Button
                 variant="outline"
                 onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                 className="flex items-center gap-2 font-bold"
               >
                 📋 Select Sources ({selectedSources.size} selected)
               </Button>
               {showSourceDropdown && (
                 <div className="absolute top-full left-0 mt-2 w-[400px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-3 flex flex-col gap-3 max-h-[400px]">
                   <div className="relative shrink-0">
                     <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                     <Input
                       className="pl-8"
                       placeholder="Search sources..."
                       value={sourceSearchQuery}
                       onChange={(e) => setSourceSearchQuery(e.target.value)}
                     />
                   </div>
                   <div className="flex gap-2 shrink-0">
                     <button
                       onClick={() => setSelectedSources(new Set(overviewData.map(s => s.sourceName)))}
                       className="px-2 py-1 text-[10px] font-bold bg-[#2b579a] text-white rounded hover:bg-[#1a3c6d] transition-colors"
                     >
                       Select All
                     </button>
                     <button
                       onClick={() => setSelectedSources(new Set())}
                       className="px-2 py-1 text-[10px] font-bold bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors border border-gray-300"
                     >
                       Select None
                     </button>
                   </div>
                   <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2">
                      {filteredOverviewData.map(s => (
                         <label
                           key={s.sourceName}
                           className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:bg-gray-50 p-1.5 rounded transition-colors"
                         >
                           <input
                             type="checkbox"
                             className="accent-purple-600 w-4 h-4 cursor-pointer shrink-0"
                             checked={selectedSources.has(s.sourceName)}
                             onChange={(e) => {
                                const next = new Set(selectedSources);
                                if (e.target.checked) next.add(s.sourceName);
                                else next.delete(s.sourceName);
                                setSelectedSources(next);
                             }}
                           />
                           {(() => {
                             const render = s.color ? resolveChipRender(s.color) : null;
                             return (
                               <span 
                                 className={`font-bold flex-1 ${render ? `px-1.5 py-0.5 rounded border ${render.kind === 'class' ? render.className : ''}` : ""}`} 
                                 style={render?.kind === 'style' ? render.style : undefined}
                               >
                                 {s.sourceName}
                               </span>
                             );
                           })()}
                           <span className="text-[10px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full shrink-0">
                             {s.itemCount} items, qty {s.totalActiveQty}
                           </span>
                         </label>
                      ))}
                      {filteredOverviewData.length === 0 && (
                         <span className="text-sm text-gray-500 italic p-2">No matching sources found.</span>
                      )}
                   </div>
                 </div>
               )}
             </div>
             <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700 select-none bg-gray-100 px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-200 transition-colors">
                <input 
                  type="checkbox" 
                  className="accent-blue-600 w-4 h-4 cursor-pointer"
                  checked={showSaleColumns} 
                  onChange={e => {
                    const checked = e.target.checked;
                    setShowSaleColumns(checked);
                    if (!checked) clear();
                  }} 
                />
                Show Sale Columns
             </label>
             {showSaleColumns && (
               <div className="flex items-center gap-2">
                 <div className="relative shrink-0">
                   <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                   <input
                     type="text"
                     className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 w-64"
                     placeholder="Search Sale Column"
                     value={saleSearchText}
                     onChange={e => setSaleSearchText(e.target.value)}
                     onKeyDown={e => {
                       if (e.key === 'Enter') saveSaleTerm();
                     }}
                   />
                 </div>
                 {saleEffectiveTerms.length > 0 && (
                   <div className="px-2.5 py-0.5 text-xs text-blue-900 bg-blue-100 rounded-full whitespace-nowrap">
                     {sourceColumns.filter((c: any) => c.type === 'sale_tracker').length}/{saleCols.length} sale columns
                   </div>
                 )}
               </div>
             )}
           </div>
           <div className="flex items-center gap-2 shrink-0">
             <Button
                variant="green"
                onClick={handleExport}
                disabled={isExporting || filteredRows.length === 0}
                className="flex items-center gap-2 shrink-0"
             >
                <FileSpreadsheet size={16} /> {isExporting ? "Exporting..." : "Export to Excel"}
             </Button>
             <div className="flex items-center gap-2 text-sm bg-white p-1 rounded border shadow-sm">
               <label className="flex items-center gap-1 cursor-pointer px-2 py-1 hover:bg-gray-50 rounded select-none">
                 <input type="checkbox" checked={showAllStatuses} onChange={e => setShowAllStatuses(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                 Show All Statuses
               </label>
               <div className="w-px h-4 bg-gray-300 mx-1"></div>
               <select value={sortBy} onChange={e => {
                 const val = e.target.value;
                 setSortBy(val);
                 if (val === 'Status') setSortDir('asc');
               }} className="border-none bg-transparent outline-none cursor-pointer py-1 pl-2 font-medium text-gray-700">
                 <option value="Recently Added">Recently Added</option>
                 {showAllStatuses && <option value="Status">Status (Active/Retired)</option>}
                 <option value="Total Sale">Total Sale</option>
                 <option value="Total Qty">Total Qty</option>
                 <option value="Remaining Qty">Remaining Qty</option>
                 {saleCols.map((c: any) => <option key={c.key} value={c.name}>{c.name}</option>)}
               </select>
               <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="px-2 py-1 rounded font-medium border bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-300" title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
                 {sortDir === 'asc' ? '↑' : '↓'}
               </button>
             </div>
           </div>
        </div>
        {showSaleColumns && saleSavedTerms.length > 0 && (
          <div className="flex flex-col gap-2 mb-2 shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              {saleSavedTerms.map((term, idx) => {
                const isActive = saleActiveTerms.has(term);
                return (
                  <div key={`${term}-${idx}`} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold border cursor-pointer select-none ${isActive ? 'bg-blue-900 text-white border-blue-900' : 'bg-blue-50 text-blue-900 border-blue-300'}`} onClick={(e) => toggleSaleTerm(term, idx, e.shiftKey)}>
                    <span>{term}</span>
                    <button onClick={(e) => { e.stopPropagation(); removeSaleTerm(term); }} className={`ml-1 flex items-center justify-center rounded-full w-4 h-4 hover:bg-black/20 ${isActive ? 'text-white' : 'text-blue-900'}`}>
                      <span className="text-[10px] leading-none mb-[1px]">✕</span>
                    </button>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 ml-2">
                <button onClick={selectAllSaleTerms} className="text-xs font-medium text-blue-600 hover:underline">Select all</button>
                <span className="text-gray-300">|</span>
                <button onClick={selectNoneSaleTerms} className="text-xs font-medium text-gray-500 hover:underline">Select none</button>
                <span className="text-gray-300">|</span>
                <button onClick={clearAllSaleTerms} className="text-xs font-medium text-red-500 hover:underline">Clear all</button>
                <span className="text-xs text-gray-400 ml-2 italic">Click to toggle. Shift+click to select or deselect a range.</span>
              </div>
            </div>
          </div>
        )}
        <div className="mb-2">
           <div className="relative w-full border-[2px] border-[#217346] rounded bg-white">
             <Search
               className="absolute left-2 top-2.5 text-gray-400"
               size={16}
             />
             <Input
               className="pl-8 w-full !border-0 focus:!border-transparent"
               placeholder="Filter rows (e.g. source:A)..."
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
           </div>
        </div>
        <div className="flex-1 overflow-auto border rounded relative bg-white pr-4">
          <table className="w-max table-fixed text-sm border-collapse" style={{ width: totalWidth + 'px' }}>
            <thead className="sticky top-0 bg-gray-100 z-10 shadow-sm">
              <tr>
                <th className={getHeaderCls('__active_source', "p-2 border text-left bg-purple-50 text-purple-800 relative")} style={getHeaderSty('__active_source', getColWidth('__active_source'))}>
                  <div className="flex items-center justify-between w-full"><div className="flex items-center gap-1 min-w-0">📦 {showAllStatuses ? "Active/Retired Sources" : "Active Source"}</div>{renderPinBtn('__active_source')}</div>
                  <OverviewColumnResizeHandle colId="__active_source" width={getColWidth('__active_source')} startResize={startResize} resetCol={resetCol} columnName="Active Source" />
                </th>
                <th className={getHeaderCls('__total_sales', "p-2 border text-left bg-blue-50 text-blue-800 relative")} style={getHeaderSty('__total_sales', getColWidth('__total_sales'))}>
                  <div className="flex items-center justify-between w-full"><div className="flex items-center gap-1 min-w-0">📈 Total Sales</div>{renderPinBtn('__total_sales')}</div>
                  <OverviewColumnResizeHandle colId="__total_sales" width={getColWidth('__total_sales')} startResize={startResize} resetCol={resetCol} columnName="Total Sales" />
                </th>
                <th className={getHeaderCls('__range_sum', "p-2 border text-left bg-blue-50 text-blue-800 relative")} style={getHeaderSty('__range_sum', getColWidth('__range_sum'))}>
                  <div className="flex items-center justify-between w-full"><div className="flex items-center gap-1 min-w-0">Total Sale Range Column Sum</div>{renderPinBtn('__range_sum')}</div>
                  <OverviewColumnResizeHandle colId="__range_sum" width={getColWidth('__range_sum')} startResize={startResize} resetCol={resetCol} columnName="Total Sale Range Column Sum" />
                </th>
                {sourceColumns.map((c, i) => {
                  const isUncheckedSaleCol = c.type === 'sale_tracker' && !selectedKeys.has(c.key);
                  return (
                  <th key={c.key} className={getHeaderCls(c.key, "p-2 border text-left relative")} style={getHeaderSty(c.key, getColWidth(c.key))}>
                    <div className="flex items-start justify-between w-full"><div className="flex items-start gap-1 min-w-0">
                      {c.type === 'sale_tracker' && (
                        <span className={`relative inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-colors cursor-pointer hover:bg-gray-300 mr-1 ${selectedKeys.has(c.key) ? 'bg-blue-100' : ''} ${c.key === anchorKey ? 'ring-2 ring-purple-500' : ''}`}>
                          <input
                            type="checkbox"
                            className="accent-blue-600 w-4 h-4 cursor-pointer focus:outline-none focus-visible:outline-none"
                            checked={selectedKeys.has(c.key)}
                            onChange={() => {}}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (e.shiftKey) {
                                selectRange(c.key, orderedSaleColKeys);
                              } else {
                                toggle(c.key);
                              }
                            }}
                          />
                        </span>
                      )}
                      <span className={`${isUncheckedSaleCol ? 'opacity-40 grayscale-[0.5] ' : ''}break-words whitespace-normal`}>
                        {i + 1}. {(() => {
                          if (c.type !== 'sale_tracker' || saleEffectiveTerms.length === 0) return c.name;
                          const escapedTerms = saleEffectiveTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                          const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');
                          const parts = String(c.name).split(regex);
                          return parts.map((part, pIdx) => {
                            const isMatch = saleEffectiveTerms.some(t => t.toLowerCase() === part.toLowerCase());
                            if (isMatch) {
                              return <mark key={pIdx} className="bg-amber-200 text-amber-900 px-[1px] rounded-sm">{part}</mark>;
                            }
                            return <span key={pIdx}>{part}</span>;
                          });
                        })()} {c.locked && "🔒"}
                      </span>
                    </div>{renderPinBtn(c.key)}</div>
                    <OverviewColumnResizeHandle colId={c.key} width={getColWidth(c.key)} startResize={startResize} resetCol={resetCol} columnName={c.name} />
                  </th>
                )})}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={`${row._originalRowId}-${row._activeSourceName}-${i}`} className="hover:bg-gray-50">
                  <td className={getBodyCls('__active_source', "p-2 border whitespace-pre-wrap break-words font-bold text-purple-700 bg-purple-50/30")} style={getBodySty('__active_source', getColWidth('__active_source'))}>
                    <div className="flex items-center gap-1">
                      {(() => {
                        const render = row._activeSourceColor ? resolveChipRender(row._activeSourceColor) : null;
                        return (
                          <span 
                            className={render ? `px-1.5 py-0.5 rounded border ${render.kind === 'class' ? render.className : ''}` : ""} 
                            style={render?.kind === 'style' ? render.style : undefined}
                          >
                            {highlightText(row._activeSourceName, deferredSearchQuery)}
                          </span>
                        );
                      })()}
                      {row._isLocked && <span className="text-[10px]">🔒</span>}
                      {showAllStatuses && row._isRetired && <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">(retired)</span>}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase mt-0.5 tracking-wider">Qty: {row._activeQty}</div>
                  </td>
                  <td className={getBodyCls('__total_sales', "p-2 border whitespace-pre-wrap break-words font-bold text-blue-700 bg-blue-50/30")} style={getBodySty('__total_sales', getColWidth('__total_sales'))}>
                    {highlightText(String(row._totalSales), deferredSearchQuery)}
                  </td>
                  <td className={getBodyCls('__range_sum', "p-2 border whitespace-pre-wrap break-words font-bold text-blue-700 bg-blue-50/30")} style={getBodySty('__range_sum', getColWidth('__range_sum'))}>
                    {(() => {
                      if (selectedKeys.size === 0) return "0";
                      let sum = 0;
                      selectedKeys.forEach(key => {
                        if (sourceColumns.some((c: any) => c.key === key)) {
                          sum += getSourceNumericValue(row, key, row._activeSourceName, false, columns);
                        }
                      });
                      return highlightText(String(sum), deferredSearchQuery);
                    })()}
                  </td>
                  
                  {sourceColumns.map((c: any) => {
                    const rawVal = getCellValue(row, c);
                    return (
                      <td
                        key={c.key}
                        className="p-2 border whitespace-pre-wrap break-words"
                        style={{ width: getColWidth(c.key) + 'px', minWidth: getColWidth(c.key) + 'px' }}
                      >
                        {(c.type === "image" || c.type === "file") &&
                        rawVal &&
                        getImageUrl(rawVal) ? (
                          <img
                            src={getImageUrl(rawVal)}
                            className={`h-10 w-10 object-contain mx-auto rounded ${onImageClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                            alt="img"
                            onClick={() => {
                              if (onImageClick) {
                                onImageClick(row._originalRowId, c.key);
                              }
                            }}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (() => {
                          const strVal = formatCellDisplay(rawVal);
                          const isRetiredSuffix = c.key === 'total_qty' && typeof strVal === 'string' && strVal.endsWith(' (retired)');
                          const cleanVal = isRetiredSuffix ? strVal.replace(' (retired)', '') : strVal;
                          return (
                            <div className="flex items-center gap-1 flex-wrap">
                              {highlightText(cleanVal, deferredSearchQuery)}
                              {isRetiredSuffix && (
                                <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">(retired)</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={sourceColumns.length + 3}
                    className="p-8 text-center text-gray-500 font-medium"
                  >
                    No active sources match your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
