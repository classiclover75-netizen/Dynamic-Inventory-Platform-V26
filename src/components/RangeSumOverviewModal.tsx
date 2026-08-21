import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, FileSpreadsheet } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useToast } from './ToastProvider';
import { Modal, Button, Input } from './ui';
import { useSaleColumnRangeSelect } from '../hooks/useSaleColumnRangeSelect';
import { useSaleColumnSearch } from '../hooks/useSaleColumnSearch';
import { parseMultiSource } from '../lib/appUtils';
import { splitActiveRetired, isRetired } from '../lib/sourceArchiveUtils';
import { computeRemainingQtyBreakdown } from '../lib/rangeSumRemainingQty';
import { isLocked } from '../lib/sourceLockUtils';
import { resolveChipRender } from '../lib/colorRender';
import { formatCellDisplay } from '../lib/formatCellDisplay';
import { Column, RowData } from '../types';
import { useOverviewColumnPin } from '../hooks/useOverviewColumnPin';
import { OverviewColumnResizeHandle } from './OverviewColumnResizeHandle';

interface RangeSumOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: Column[];
  rows: RowData[];
  onApply: (startName: string, endName: string, keys: string[], selectedSources?: string[]) => void;
  initialColWidths?: Record<string, number>;
  onSaveColWidths?: (widths: Record<string, number>) => void;
  initialPinnedCols?: string[];
  onSavePinnedCols?: (cols: string[]) => void;
  minStockAlert?: number;
  onImageClick?: (rowId: string, imageKey: string) => void;
}

export function RangeSumOverviewModal({
  isOpen,
  onClose,
  columns,
  rows,
  onApply,
  initialColWidths,
  onSaveColWidths,
  initialPinnedCols,
  onSavePinnedCols,
  minStockAlert = 0,
  onImageClick
}: RangeSumOverviewModalProps) {
  const { toast } = useToast();
  const saleCols = useMemo(() => columns.filter(c => c.type === "sale_tracker"), [columns]);
  const [showSaleColumns, setShowSaleColumns] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [sourceSearchQuery, setSourceSearchQuery] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [sortBy, setSortBy] = useState("Default");
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sourceDropdownRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!showSourceDropdown) return;
    const handler = (e: MouseEvent) => {
      if (sourceDropdownRef.current && !sourceDropdownRef.current.contains(e.target as Node)) {
        setShowSourceDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSourceDropdown]);
  
  const allUniqueSourcesInfo = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach(r => {
      const parsed = parseMultiSource(r.total_qty);
      parsed.forEach((s: any) => {
        if (!map.has(s.source) || !map.get(s.source)) {
           map.set(s.source, s.color || '');
        }
      });
    });
    return Array.from(map.entries()).map(([source, color]) => ({ source, color })).sort((a, b) => a.source.localeCompare(b.source));
  }, [rows]);
  
  const filteredSources = useMemo(() => {
    if (!sourceSearchQuery) return allUniqueSourcesInfo;
    const lower = sourceSearchQuery.toLowerCase();
    return allUniqueSourcesInfo.filter(s => s.source.toLowerCase().includes(lower));
  }, [allUniqueSourcesInfo, sourceSearchQuery]);


  const { selectedKeys, toggle, selectRange, clear, selectAll, anchorKey } = useSaleColumnRangeSelect();
  const orderedSaleColKeys = useMemo(() => saleCols.map(c => c.key), [saleCols]);

  const [colWidths, setColWidths] = useState<Record<string, number>>(initialColWidths || {});

  const initialColWidthsRef = useRef(initialColWidths);
  useEffect(() => {
    initialColWidthsRef.current = initialColWidths;
  }, [initialColWidths]);

  useEffect(() => {
    if (isOpen) {
      selectAll(orderedSaleColKeys);
      setShowSaleColumns(true);
      setSearchQuery("");
      setSelectedSources(new Set(allUniqueSourcesInfo.map(s => s.source)));
      setShowSourceDropdown(false);
      setSourceSearchQuery("");
    }
  }, [isOpen, selectAll, orderedSaleColKeys, allUniqueSourcesInfo]);

  useEffect(() => {
    if (isOpen) {
      setColWidths(initialColWidthsRef.current || {});
    }
  }, [isOpen]);

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

  const visibleColumns = useMemo(() => {
    return columns.filter(c => {
      if (c.key === 'sr') return false;
      if (c.type === 'sale_tracker') {
        if (!showSaleColumns) return false;
        if (saleEffectiveTerms.length > 0) {
          return saleEffectiveTerms.some(term => c.name.toLowerCase().includes(term));
        }
      }
      return true;
    });
  }, [columns, showSaleColumns, saleEffectiveTerms]);

  const saleTrackerColsVisible = useMemo(() => visibleColumns.filter(c => c.type === 'sale_tracker'), [visibleColumns]);

  const colIds = useMemo(() => ['__row', '__range_sum', ...visibleColumns.map(c => c.key)], [visibleColumns]);

  const getColWidth = (id: string) => {
    if (colWidths[id]) return colWidths[id];
    if (id === '__row') return 60;
    if (id === '__range_sum') return 160;
    if (saleCols.some(c => c.key === id)) return 240;
    return 150;
  };

  const { pinnedCols, togglePin, pinnedOffsets, lastPinnedColId } = useOverviewColumnPin(
    initialPinnedCols, 
    onSavePinnedCols, 
    getColWidth, 
    colWidths, 
    isOpen, 
    colIds
  );

  const totalWidth = colIds.reduce((sum, id) => sum + getColWidth(id), 0);

  const startResize = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
    const startX = e.clientX;
    const startW = colWidths[id] ?? th.offsetWidth;
    document.body.style.userSelect = 'none';
    
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(60, startW + (ev.clientX - startX));
      setColWidths(prev => ({ ...prev, [id]: newW }));
    };
    
    const onUp = () => {
      document.body.style.userSelect = '';
      window.removeEventListener('blur', onUp);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setColWidths(prev => {
        if (onSaveColWidths) onSaveColWidths(prev);
        return prev;
      });
    };
    
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp, { once: true });
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

  const getHeaderCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLastPinned = isPinned && colId === lastPinnedColId;
    const pinShadow = isLastPinned
      ? 'shadow-[inset_0_0_0_1px_currentColor,4px_0_10px_-4px_rgba(0,0,0,0.15)]'
      : 'shadow-[inset_0_0_0_1px_currentColor]';
    return baseCls + ' sticky top-0 ' + (isPinned ? 'z-30 ' + pinShadow : 'z-20');
  };

  const getHeaderSty = (colId: string, width: number) => {
    const isPinned = pinnedCols.includes(colId);
    return {
      width,
      minWidth: width,
      maxWidth: width,
      ...(isPinned ? { left: pinnedOffsets[colId] } : {})
    };
  };

  const getBodyCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLastPinned = isPinned && colId === lastPinnedColId;
    const pinShadow = isLastPinned
      ? 'shadow-[inset_0_0_0_1px_currentColor,4px_0_10px_-4px_rgba(0,0,0,0.15)]'
      : 'shadow-[inset_0_0_0_1px_currentColor]';
    return baseCls + (isPinned ? ' sticky z-[15] ' + pinShadow : '');
  };

  const getBodySty = (colId: string) => {
    const isPinned = pinnedCols.includes(colId);
    let bg = '#ffffff';
    if (colId === '__row') bg = '#f3f4f6';
    else if (colId === '__range_sum') bg = '#eff6ff';
    return { ...(isPinned ? { left: pinnedOffsets[colId], backgroundColor: bg } : {}) };
  };


  const rowNumbers = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, i) => map.set(r.id, i + 1));
    return map;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!deferredSearchQuery) return rows;
    const tokens = deferredSearchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const saleCols = columns.filter((col) => col.type === "sale_tracker");
    return rows.filter(row => {
      return visibleColumns.some(c => {
        return tokens.every(token => {
          if (c.key === 'remaining_qty') {
            const remainingSources = computeRemainingQtyBreakdown(row, saleCols, minStockAlert);
            if (remainingSources.length === 0) return false;
            return remainingSources.some((s: any) => 
              String(s.source).toLowerCase().includes(token) || 
              String(s.qty).toLowerCase().includes(token)
            );
          }
          if (c.type === 'sale_tracker' || c.key === 'total_qty') {
            const sources = parseMultiSource(row[c.key]);
            if (sources.length === 0) return false;
            return sources.some((s: any) => 
              String(s.source).toLowerCase().includes(token) || 
              String(s.qty).toLowerCase().includes(token)
            );
          }
          const rawVal = row[c.key];
          const strVal = formatCellDisplay(rawVal).toLowerCase();
          return strVal.includes(token);
        });
      });
    });
  }, [rows, deferredSearchQuery, visibleColumns, columns, minStockAlert]);

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
    return (
      <span className="whitespace-pre-wrap">
        {parts.map((part, i) =>
          (i % 2 !== 0) ? (
            <span
              key={i}
              className="bg-yellow-300 text-black font-bold rounded-sm px-[1px]"
            >
              {part}
            </span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const renderMultiSourceCell = (rawVal: any, bgClass = 'bg-white', textClass = 'text-gray-900', borderClass = 'border-gray-200', isTotalQty = false, removeBorders = false) => {
    const breakdown = parseMultiSource(rawVal);
    if (breakdown.length === 0) return null;
    let total = 0;
    breakdown.forEach(b => {
      total += parseFloat(b.qty) || 0;
    });

    return (
      <div className={`p-1.5 ${removeBorders ? '' : 'border-r border-b'} ${borderClass} overflow-hidden whitespace-pre-wrap ${bgClass} ${textClass} font-bold text-center h-full min-h-[40px] flex items-center`}>
        <div className="flex flex-col gap-1 justify-center w-full">
          {breakdown.map((b: any, idx: number) => {
            const locked = isLocked(b);
            const alert = b.isAlert;
            const render = alert ? null : resolveChipRender(b.color);
            return (
              <div 
                key={idx} 
                className={`w-full px-1.5 py-0.5 rounded text-[14px] font-bold border flex items-center justify-between gap-1 shadow-sm ${alert ? "bg-[#FF0000] text-white border-[#cc0000]" : (render?.kind === 'class' ? render.className : "")} ${locked ? "opacity-50 grayscale" : ""}`}
                style={render?.kind === 'style' ? render.style : undefined}
              >
                <span className={`shrink-0 flex items-center gap-1 capitalize ${alert ? "text-white font-extrabold" : ""}`}>
                  {highlightText(b.source, deferredSearchQuery)}:{locked && <span className="ml-1 text-[10px]">🔒</span>}
                  {isTotalQty && isRetired(b) && (
                    <span className="text-xs font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full whitespace-nowrap leading-none">(retired)</span>
                  )}
                </span>
                <span className="flex-1 text-right">{highlightText(String(b.qty), deferredSearchQuery)}</span>
              </div>
            );
          })}
          <div className="mt-1 pt-1 border-t border-gray-200 text-gray-900 font-extrabold text-[15px] flex items-center justify-between w-full px-1">
             <span className="opacity-50 text-[11px] uppercase tracking-wider">Total</span>
             <span>{highlightText(String(total), deferredSearchQuery)}</span>
          </div>
        </div>
      </div>
    );
  };

  const getRowSumBreakdown = (row: RowData) => {
    const breakdownMap: Record<string, { qty: number, color: string }> = {};
    let hasValues = false;
    const allTotalSources = parseMultiSource(row.total_qty || "");

    selectedKeys.forEach(key => {
      if (saleTrackerColsVisible.some(c => c.key === key)) {
        const sources = parseMultiSource(row[key]);
        sources.forEach((s: any) => {
          if (!selectedSources.has(s.source)) return;
          const qty = parseFloat(s.qty);
          if (!isNaN(qty)) {
            hasValues = true;
            if (!breakdownMap[s.source]) {
              breakdownMap[s.source] = { qty: 0, color: s.color };
            }
            breakdownMap[s.source].qty += qty;
          }
        });
      }
    });

    if (!hasValues) return [];
    return Object.entries(breakdownMap).map(([source, data]) => {
      const matchInTotal = allTotalSources.find((ts: any) => ts.source === source);
      return {
        source,
        qty: String(data.qty),
        color: data.color,
        retired: matchInTotal ? isRetired(matchInTotal) : false
      };
    });
  };

  const getColumnRowTotal = (row: RowData, colKey: string) => {
    if (colKey === "__range_sum") {
      return getRowSumBreakdown(row).reduce((acc, entry) => acc + (parseFloat(entry.qty) || 0), 0);
    }
    if (colKey === "remaining_qty") {
      const saleCols = columns.filter((c: any) => c.type === "sale_tracker");
      return computeRemainingQtyBreakdown(row, saleCols, minStockAlert).reduce((acc: number, entry: any) => acc + (parseFloat(String(entry.qty)) || 0), 0);
    }
    return parseMultiSource(row[colKey]).reduce((acc: number, entry: any) => acc + (parseFloat(String(entry.qty)) || 0), 0);
  };

  const sortedRows = useMemo(() => {
    if (sortBy === "Default") return filteredRows;
    let key = "";
    if (sortBy === "Total Sale Range Column Sum") key = "__range_sum";
    else if (sortBy === "Total Qty") key = "total_qty";
    else if (sortBy === "Remaining Qty") key = "remaining_qty";
    else {
      const matched = saleTrackerColsVisible.find((c: any) => c.name === sortBy);
      if (matched) key = matched.key;
    }
    if (!key) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      const valA = getColumnRowTotal(a, key);
      const valB = getColumnRowTotal(b, key);
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });
  }, [filteredRows, sortBy, sortDir, saleTrackerColsVisible, rowNumbers]);

  const handleApply = () => {
    const validSelectedCols = saleTrackerColsVisible.filter(c => selectedKeys.has(c.key));
    if (validSelectedCols.length === 0) {
      onApply("None", "None", [], Array.from(selectedSources));
      return;
    }
    const startName = validSelectedCols[0].name;
    const endName = validSelectedCols[validSelectedCols.length - 1].name;
    const keys = validSelectedCols.map(c => c.key);
    onApply(startName, endName, keys, Array.from(selectedSources));
  };
  
  const handleExport = async () => {
    if (filteredRows.length === 0) {
      toast("No rows to export.");
      return;
    }
    setIsExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Range Sum');
      
      const exportCols = [
        { header: "Row No. 🔒", key: "__row", width: 10 },
        { header: "Total Sale Range Column Sum", key: "__range_sum", width: 25 },
        ...visibleColumns.map(c => ({
          header: c.name,
          key: c.key,
          width: c.type === 'image' || c.type === 'file' ? 12 : 20
        }))
      ];
      
      worksheet.columns = exportCols.map(c => ({
        header: c.header,
        key: c.key,
        width: c.width
      }));
      
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
      
      for (let i = 0; i < sortedRows.length; i++) {
        const row = sortedRows[i];
        const rowValues: any = {};
        rowValues["__row"] = rowNumbers.get(row.id) || (i + 1);
        
        const sumBreakdown = getRowSumBreakdown(row);
        let sumTotal = 0;
        sumBreakdown.forEach(b => sumTotal += parseFloat(b.qty) || 0);
        rowValues["__range_sum"] = sumTotal;
        
        for (const c of visibleColumns) {
           if (c.type === 'image' || c.type === 'file') {
              const val = row[c.key];
              rowValues[c.key] = val ? (c.type === 'image' ? 'Image' : 'File') : '';
           } else if (c.key === 'remaining_qty') {
              const saleCols = columns.filter((col) => col.type === "sale_tracker");
              const remainingSources = computeRemainingQtyBreakdown(row, saleCols, minStockAlert);
              if (remainingSources.length === 0) {
                 rowValues[c.key] = "";
              } else {
                 let total = 0;
                 const parts = remainingSources.map((s: any) => {
                    const q = parseFloat(s.qty) || 0;
                    total += q;
                    return `${s.source}: ${s.qty}`;
                 });
                 rowValues[c.key] = `${parts.join(', ')} (Total: ${total})`;
              }
           } else if (c.type === 'sale_tracker' || c.key === "total_qty") {
              const sources = parseMultiSource(row[c.key]);
              if (sources.length === 0) {
                 rowValues[c.key] = "";
              } else {
                 let total = 0;
                 const parts = sources.map((s: any) => {
                    const q = parseFloat(s.qty) || 0;
                    total += q;
                    return `${s.source}: ${s.qty}`;
                 });
                 rowValues[c.key] = `${parts.join(', ')} (Total: ${total})`;
              }
           } else {
              rowValues[c.key] = formatCellDisplay(row[c.key]);
           }
        }
        worksheet.addRow(rowValues);
      }
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, `Range_Sum_Overview.xlsx`);
      toast("Exported to Excel successfully.");
    } catch (err: any) {
      console.error(err);
      toast("Export failed: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="📊 Calculate Range Sum"
      width="95vw"
      noScroll={true}
    >
      <div className="flex flex-col h-[85vh] p-4">
        <div className="flex gap-4 mb-2 shrink-0 items-center justify-between">
           <div className="flex gap-4 items-center">
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
             <div className="flex items-center gap-2 text-sm bg-white p-1 rounded border shadow-sm">
               <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border-none bg-transparent outline-none cursor-pointer py-1 pl-2 font-medium text-gray-700">
                 <option value="Default">Default</option>
                 <option value="Total Sale Range Column Sum">Total Sale Range Column Sum</option>
                 <option value="Total Qty">Total Qty</option>
                 <option value="Remaining Qty">Remaining Qty</option>
                 {saleTrackerColsVisible.map((c: any) => <option key={c.key} value={c.name}>{c.name}</option>)}
               </select>
               <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="px-2 py-1 rounded font-medium border bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-300" title={sortDir === 'asc' ? 'Ascending' : 'Descending'}>
                 {sortDir === 'asc' ? '↑' : '↓'}
               </button>
             </div>
             {showSaleColumns && (
               <div className="flex items-center gap-2">
                 <div className="relative shrink-0">
                   <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                   <input
                     type="text"
                     className="pl-8 pr-3 py-1.5 border-2 rounded-md text-sm outline-none w-64 transition-colors"
                     style={{ borderColor: '#2b579a' }}
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
                     {saleTrackerColsVisible.length}/{saleCols.length} sale columns
                   </div>
                 )}
               </div>
             )}
           </div>
           <div className="flex items-center gap-2 shrink-0">
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
                       onClick={() => setSelectedSources(new Set(allUniqueSourcesInfo.map(s => s.source)))}
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
                      {filteredSources.map(s => (
                         <label
                           key={s.source}
                           className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 hover:bg-gray-50 p-1.5 rounded transition-colors"
                         >
                           <input
                             type="checkbox"
                             className="accent-purple-600 w-4 h-4 cursor-pointer shrink-0"
                             checked={selectedSources.has(s.source)}
                             onChange={(e) => {
                                const next = new Set(selectedSources);
                                if (e.target.checked) next.add(s.source);
                                else next.delete(s.source);
                                setSelectedSources(next);
                             }}
                           />
                           {(() => {
                             const render = s.color ? resolveChipRender(s.color) : null;
                             return (
                               <span 
                                 className={`px-2 py-0.5 rounded text-xs font-bold shadow-sm border ${render?.kind === 'class' ? render.className : "bg-gray-100 text-gray-800 border-gray-200"}`}
                                 style={render?.kind === 'style' ? render.style : undefined}
                               >
                                 {s.source}
                               </span>
                             );
                           })()}
                         </label>
                      ))}
                   </div>
                 </div>
               )}
             </div>
             
             <Button 
                variant="green" 
                onClick={handleExport} 
                disabled={isExporting || filteredRows.length === 0}
                className="flex items-center gap-2 shrink-0"
             >
                <FileSpreadsheet size={16} /> {isExporting ? "Exporting..." : "Export to Excel"}
             </Button>

             <Button variant="blue" onClick={handleApply}>
               Apply to Page
             </Button>
           </div>
        </div>

        <div className="flex flex-col gap-2 mb-2 shrink-0">
          <div className="relative w-full border-2 rounded-md bg-white transition-colors" style={{ borderColor: '#2b579a' }}>
            <Search
              className="absolute left-2 top-2.5 text-gray-400"
              size={16}
            />
            <Input
              className="pl-8 w-full !border-0 focus:!border-transparent"
              placeholder="Filter rows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
              </div>
            </div>
          </div>
        )}
        
        <div className="flex-1 overflow-auto border rounded relative bg-white">
          <table className="w-max table-fixed text-sm border-collapse" style={{ width: totalWidth + 'px' }}>
            <thead className="bg-gray-100 shadow-sm">
              <tr>
                <th className={getHeaderCls('__row', "p-2 border text-left bg-gray-200")} style={getHeaderSty('__row', getColWidth('__row'))}>
                  <div className="flex items-center justify-between w-full"><div className="flex items-center gap-1 min-w-0">Row No. 🔒</div>{renderPinBtn('__row')}</div>
                  <OverviewColumnResizeHandle colId="__row" width={getColWidth('__row')} startResize={startResize} resetCol={resetCol} columnName="Row No. 🔒" />
                </th>
                <th className={getHeaderCls('__range_sum', "p-2 border text-left bg-blue-50 text-blue-800")} style={getHeaderSty('__range_sum', getColWidth('__range_sum'))}>
                  <div className="flex items-center justify-between w-full"><div className="flex items-center gap-1 min-w-0">Total Sale Range Column Sum</div>{renderPinBtn('__range_sum')}</div>
                  <OverviewColumnResizeHandle colId="__range_sum" width={getColWidth('__range_sum')} startResize={startResize} resetCol={resetCol} columnName="Total Sale Range Column Sum" />
                </th>
                {visibleColumns.map((c, i) => {
                  const isSale = c.type === 'sale_tracker';
                  const isUncheckedSaleCol = isSale && !selectedKeys.has(c.key);
                  return (
                  <th key={c.key} className={getHeaderCls(c.key, "p-2 border text-left bg-gray-100")} style={getHeaderSty(c.key, getColWidth(c.key))}>
                    <div className="flex items-start justify-between w-full"><div className="flex items-start gap-1 min-w-0">
                      {isSale && (
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
                        {isSale && <>{saleCols.indexOf(c) + 1}. </>}
                        {(() => {
                          if (!isSale || saleEffectiveTerms.length === 0) return c.name;
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
              {sortedRows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className={getBodyCls('__row', "p-2 border text-center font-bold bg-gray-100")} style={getBodySty('__row')}>
                    {rowNumbers.get(row.id) || (i + 1)}
                  </td>
                  <td className={getBodyCls('__range_sum', "p-0 border border-black bg-blue-50 text-blue-700 align-top")} style={getBodySty('__range_sum')}>
                    {renderMultiSourceCell(JSON.stringify(getRowSumBreakdown(row)), 'bg-transparent', 'text-blue-700', 'border-blue-200', true, true)}
                  </td>
                  
                  {visibleColumns.map((c: any) => {
                    if (c.type === "image" || c.type === "file") {
                      const imgUrl = getImageUrl(row[c.key]);
                      return (
                        <td key={c.key} className={getBodyCls(c.key, "p-2 border align-top text-center")} style={getBodySty(c.key)}>
                          {imgUrl ? (
                            <img src={imgUrl} alt="" className={`w-10 h-10 object-contain mx-auto ${onImageClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`} onClick={() => onImageClick?.(row.id, c.key)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                          ) : null}
                        </td>
                      );
                    }
                    if (c.key === "remaining_qty") {
                      const saleCols = columns.filter((col) => col.type === "sale_tracker");
                      const remainingSources = computeRemainingQtyBreakdown(row, saleCols, minStockAlert);
                      
                      return (
                        <td key={c.key} className={getBodyCls(c.key, "p-0 border align-top")} style={getBodySty(c.key)}>
                          {renderMultiSourceCell(JSON.stringify(remainingSources), 'bg-white', 'text-gray-900', 'border-gray-200', false)}
                        </td>
                      );
                    }

                    if (c.type === "sale_tracker" || c.key === "total_qty") {
                      return (
                        <td key={c.key} className={getBodyCls(c.key, "p-0 border align-top")} style={getBodySty(c.key)}>
                          {renderMultiSourceCell(row[c.key], 'bg-white', 'text-gray-900', 'border-gray-200', c.key === 'total_qty')}
                        </td>
                      );
                    }
                    
                    const rawVal = row[c.key];
                    const strVal = formatCellDisplay(rawVal);
                    return (
                       <td key={c.key} className={getBodyCls(c.key, "p-2 border align-top break-words")} style={getBodySty(c.key)}>
                         <div className="flex items-center gap-1 flex-wrap">
                           {highlightText(strVal, deferredSearchQuery)}
                         </div>
                       </td>
                    );
                  })}
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={visibleColumns.length + 2}
                    className="p-8 text-center text-gray-500 font-medium"
                  >
                    No items match your filters.
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
