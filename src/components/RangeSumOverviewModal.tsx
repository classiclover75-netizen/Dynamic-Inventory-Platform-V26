import React, { useState, useMemo, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Modal, Button, Input } from './ui';
import { useSaleColumnRangeSelect } from '../hooks/useSaleColumnRangeSelect';
import { useSaleColumnSearch } from '../hooks/useSaleColumnSearch';
import { parseMultiSource } from '../lib/appUtils';
import { resolveChipRender } from '../lib/colorRender';
import { Column, RowData } from '../types';

interface RangeSumOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: Column[];
  rows: RowData[];
  onApply: (startName: string, endName: string, keys: string[]) => void;
}

export function RangeSumOverviewModal({
  isOpen,
  onClose,
  columns,
  rows,
  onApply
}: RangeSumOverviewModalProps) {
  const saleCols = useMemo(() => columns.filter(c => c.type === "sale_tracker"), [columns]);
  const [showSaleColumns, setShowSaleColumns] = useState(true);

  const { selectedKeys, toggle, selectRange, clear, selectAll, anchorKey } = useSaleColumnRangeSelect();
  const orderedSaleColKeys = useMemo(() => saleCols.map(c => c.key), [saleCols]);

  useEffect(() => {
    if (isOpen) {
      selectAll(orderedSaleColKeys);
      setShowSaleColumns(true);
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

  const sourceColumns = useMemo(() => {
    let cols = saleCols;
    if (!showSaleColumns) {
      cols = [];
    } else if (saleEffectiveTerms.length > 0) {
      cols = cols.filter(c => saleEffectiveTerms.some(term => c.name.toLowerCase().includes(term)));
    }
    return cols;
  }, [saleCols, showSaleColumns, saleEffectiveTerms]);

  const renderMultiSourceCell = (rawVal: any, bgClass = 'bg-white', textClass = 'text-gray-900', borderClass = 'border-gray-200') => {
    const breakdown = parseMultiSource(rawVal);
    if (breakdown.length === 0) return null;
    let total = 0;
    breakdown.forEach(b => {
      total += parseFloat(b.qty) || 0;
    });

    return (
      <div className={`p-1.5 border-r border-b ${borderClass} overflow-hidden whitespace-pre-wrap ${bgClass} ${textClass} font-bold text-center h-full min-h-[40px] flex items-center`}>
        <div className="flex flex-col gap-1 justify-center w-full">
          {breakdown.map((b: any, idx: number) => {
            const render = resolveChipRender(b.color);
            return (
              <div 
                key={idx} 
                className={`w-full px-1.5 py-0.5 rounded text-[14px] font-bold border flex items-center justify-between gap-1 shadow-sm ${render?.kind === 'class' ? render.className : ""}`}
                style={render?.kind === 'style' ? render.style : undefined}
              >
                <span className="shrink-0 capitalize">{b.source}:</span>
                <span className="flex-1 text-right">{b.qty}</span>
              </div>
            );
          })}
          <div className={`mt-1 pt-1 border-t ${borderClass} font-extrabold text-[15px] flex items-center justify-between w-full`}>
            <span className="opacity-50 text-[11px] uppercase tracking-wider">Total</span>
            <span>{total}</span>
          </div>
        </div>
      </div>
    );
  };

  const getRowSumBreakdown = (row: RowData) => {
    const breakdownMap: Record<string, { qty: number, color: string }> = {};
    let hasValues = false;

    selectedKeys.forEach(key => {
      if (sourceColumns.some(c => c.key === key)) {
        const sources = parseMultiSource(row[key]);
        sources.forEach(s => {
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
    return Object.entries(breakdownMap).map(([source, data]) => ({
      source,
      qty: String(data.qty),
      color: data.color
    }));
  };

  const handleApply = () => {
    const validSelectedCols = sourceColumns.filter(c => selectedKeys.has(c.key));
    if (validSelectedCols.length === 0) {
      onApply("None", "None", []);
      return;
    }
    const startName = validSelectedCols[0].name;
    const endName = validSelectedCols[validSelectedCols.length - 1].name;
    const keys = validSelectedCols.map(c => c.key);
    onApply(startName, endName, keys);
  };

  const colWidth = 200;

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
                     {sourceColumns.length}/{saleCols.length} sale columns
                   </div>
                 )}
               </div>
             )}
           </div>
           <div className="flex items-center gap-2 shrink-0">
             <Button variant="primary" onClick={handleApply}>
               Apply to Page
             </Button>
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
          <table className="w-max table-fixed text-sm border-collapse">
            <thead className="sticky top-0 bg-gray-100 z-20 shadow-sm">
              <tr>
                <th className="p-2 border text-left bg-gray-200 sticky left-0 z-30" style={{ width: 60, minWidth: 60 }}>
                  Row
                </th>
                <th className="p-2 border text-left bg-blue-50 text-blue-800 sticky left-[60px] z-30 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-400" style={{ width: 220, minWidth: 220 }}>
                  Total Sale Range Column Sum
                </th>
                {sourceColumns.map((c, i) => {
                  const isUncheckedSaleCol = !selectedKeys.has(c.key);
                  return (
                  <th key={c.key} className="p-2 border text-left relative" style={{ width: colWidth, minWidth: colWidth }}>
                    <div className="flex items-start justify-between w-full"><div className="flex items-start gap-1 min-w-0">
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
                      <span className={`${isUncheckedSaleCol ? 'opacity-40 grayscale-[0.5] ' : ''}break-words whitespace-normal`}>
                        {i + 1}. {(() => {
                          if (saleEffectiveTerms.length === 0) return c.name;
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
                    </div></div>
                  </th>
                )})}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="p-2 border text-center font-bold sticky left-0 bg-gray-100 z-10">
                    {i + 1}
                  </td>
                  <td className="p-0 border sticky left-[60px] bg-white z-10 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-400 align-top">
                    {renderMultiSourceCell(JSON.stringify(getRowSumBreakdown(row)), 'bg-purple-50', 'text-purple-900', 'border-purple-200')}
                  </td>
                  
                  {sourceColumns.map((c: any) => {
                    return (
                      <td
                        key={c.key}
                        className="p-0 border align-top"
                      >
                        {renderMultiSourceCell(row[c.key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={sourceColumns.length + 2}
                    className="p-8 text-center text-gray-500 font-medium"
                  >
                    No items in this tracker.
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
