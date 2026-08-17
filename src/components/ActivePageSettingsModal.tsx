import React, { useState, useRef } from 'react';
import { Button, Input, Modal } from './ui';
import { Column, PageConfig } from '../types';
import { Edit, Trash2, Plus, GripVertical, RefreshCw, ArrowUpDown, Lock, Sliders, Search } from 'lucide-react';
import { ColumnSortSettingsModal } from './ColumnSortSettingsModal';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export const ActivePageSettingsModal = React.memo(({
  isOpen,
  onClose,
  activePage,
  pageConfig,
  onSave,
  onDeleteColumn,
  onRenamePage,
  onCreateColumn,
  onAddRow,
  onEditColumn,
  onDeletePage,
  onReorderSearchBars,
  onImportExcel,
  onExportExcel,
  onImportPageJson,
  onFindDuplicates,
  onClearPageData,
  onCreateTracker,
  onSyncTracker,
  onManageTrackerColumns,
  onConfigureCopyBoxes,
  existingPages,
  setConfirmationModal,
  pageRows,
  pageConfigs,
  onOpenRelinkTracker
}: {
  isOpen: boolean;
  onClose: () => void;
  activePage: string;
  pageConfig: PageConfig | null;
  onSave: (config: PageConfig, closeModal?: boolean) => void;
  onDeleteColumn?: (column: Column, deleteType: 'normal' | 'smart') => void;
  onRenamePage: () => void;
  onCreateColumn: () => void;
  onAddRow: () => void;
  onEditColumn: (column: Column) => void;
  onDeletePage: () => void;
  onReorderSearchBars: () => void;
  onImportExcel: () => void;
  onExportExcel: () => void;
  onImportPageJson: (file: File) => void;
  onFindDuplicates: () => void;
  onClearPageData: () => void;
  onCreateTracker?: (sourcePage: string) => void;
  onSyncTracker?: (trackerName: string) => void;
  onManageTrackerColumns?: () => void;
  onConfigureCopyBoxes: () => void;
  existingPages: string[];
  setConfirmationModal: (modal: { isOpen: boolean, title?: string, message?: string, onConfirm: () => void } | null) => void;
  pageRows: Record<string, any[]>;
  pageConfigs: Record<string, PageConfig>;
  onOpenRelinkTracker?: () => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rowReorder, setRowReorder] = useState(pageConfig?.rowReorderEnabled || false);
  const [hoverPreview, setHoverPreview] = useState(pageConfig?.hoverPreviewEnabled || false);
  const [autoSortBySales, setAutoSortBySales] = useState(pageConfig?.autoSortBySales || false);
  const [independentSearchBars, setIndependentSearchBars] = useState(pageConfig?.independentSearchBars ?? true);
  const [rowHeight, setRowHeight] = useState(pageConfig?.rowHeight || 100);
  const [rowHeightInput, setRowHeightInput] = useState(String(pageConfig?.rowHeight || 100));
  const [localColumns, setLocalColumns] = useState<Column[]>(pageConfig?.columns || []);
  const [secondarySearchPage, setSecondarySearchPage] = useState<string>(pageConfig?.secondarySearchPage || '');
  const [minStockAlert, setMinStockAlert] = useState(pageConfig?.minStockAlert ?? 0);
  const [sortSettingsColumn, setSortSettingsColumn] = useState<Column | null>(null);
  const [pendingDeleteSaleCol, setPendingDeleteSaleCol] = useState<Column | null>(null);
  const [columnSearch, setColumnSearch] = useState('');
  const [pageStats, setPageStats] = useState<{ totalRows: number, totalColumns: number, totalImages: number, duplicateImages: number } | null>(null);

  const calculateStats = () => {
    const rows = pageRows[activePage] || [];
    const config = pageConfigs[activePage] || { columns: [] };

    const totalRows = rows.length;
    const totalColumns = config.columns.length;

    // Find which columns are of type 'image'
    const imageColumns = config.columns.filter(c => c.type === 'image').map(c => c.key);

    let totalImages = 0;
    const uniqueImages = new Set();

    rows.forEach(row => {
      imageColumns.forEach(colKey => {
        const imgVal = row[colKey];
        // Count if the image cell is not empty
        if (imgVal && typeof imgVal === 'string' && imgVal.trim() !== '') {
          totalImages++;
          uniqueImages.add(imgVal);
        }
      });
    });

    const duplicateImages = totalImages - uniqueImages.size;
    setPageStats({ totalRows, totalColumns, totalImages, duplicateImages });
  };

  React.useEffect(() => {
    if (isOpen) {
      setRowReorder(pageConfig?.rowReorderEnabled || false);
      setHoverPreview(pageConfig?.hoverPreviewEnabled || false);
      setAutoSortBySales(pageConfig?.autoSortBySales || false);
      setIndependentSearchBars(pageConfig?.independentSearchBars ?? true);
      const initialHeight = pageConfig?.rowHeight || 100;
      setRowHeight(initialHeight);
      setRowHeightInput(String(initialHeight));
      setLocalColumns(pageConfig?.columns || []);
      setSecondarySearchPage(pageConfig?.secondarySearchPage || '');
      setMinStockAlert(pageConfig?.minStockAlert ?? 0);
    }
  }, [isOpen, pageConfig]);

  const handleSaveSortSettings = (updatedCol: Column) => {
    const cols = localColumns.map(c => c.key === updatedCol.key ? updatedCol : c);
    setLocalColumns(cols);
    saveConfig({ columns: cols }, false);
  };

  const handleTogglePin = (colKey: string) => {
    const cols = localColumns.map(c => c.key === colKey ? { ...c, pinned: !c.pinned } : c);
    setLocalColumns(cols);
    saveConfig({ columns: cols }, false);
  };

  const saveConfig = (updatedProps: Partial<PageConfig>, closeModal?: boolean) => {
    if (pageConfig) {
      onSave({ 
        ...pageConfig, 
        rowHeight: rowHeight, 
        rowReorderEnabled: rowReorder, 
        hoverPreviewEnabled: hoverPreview,
        autoSortBySales: autoSortBySales, 
        independentSearchBars: independentSearchBars,
        secondarySearchPage: secondarySearchPage || undefined,
        minStockAlert: minStockAlert,
        columns: localColumns,
        ...updatedProps 
      }, closeModal);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const sourceIdx = result.source.index;
    const destIdx = result.destination.index;
    if (sourceIdx === destIdx) return;

    const cols = [...localColumns];
    const draggedCol = cols[sourceIdx];
    const targetCol = cols[destIdx];

    if (draggedCol.movable === false || targetCol.movable === false) return;

    const [reorderedItem] = cols.splice(sourceIdx, 1);
    cols.splice(destIdx, 0, reorderedItem);

    setLocalColumns(cols);
    saveConfig({ columns: cols }, false);
  };

  const handleManualReorder = (colKey: string, newPosStr: string) => {
    const newPos = parseInt(newPosStr, 10);
    if (isNaN(newPos)) return;

    const cols = [...localColumns];
    const currentIdx = cols.findIndex(c => c.key === colKey);
    if (currentIdx === -1) return;

    // Position 1 is locked (index 0). Movable columns start at index 1 (Position 2).
    let targetIdx = newPos - 1;
    if (targetIdx < 1) targetIdx = 1;
    if (targetIdx >= cols.length) targetIdx = cols.length - 1;

    if (currentIdx === targetIdx) return;

    const [movedCol] = cols.splice(currentIdx, 1);
    cols.splice(targetIdx, 0, movedCol);

    setLocalColumns(cols);
    saveConfig({ columns: cols }, false);
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); }} title={`⚙️ Active Page Settings ${activePage ? `(${activePage})` : ''}`} width="min(900px, 96vw)">
      <div className="text-xs text-[#607d8b] mb-2 font-bold">
        Page: <span className="text-gray-800">{activePage || 'No page selected'}</span>
      </div>
      {!pageConfig?.linkedSourcePage && (<div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
        <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
          <span className="text-[13px] text-[#37474f] font-bold">Row Height</span>
          <div className="flex items-center gap-2">
            <input 
              type="range" 
              min="40" 
              max="300" 
              value={rowHeight}
              className="w-32"
              onChange={e => {
                const val = parseInt(e.target.value, 10);
                setRowHeight(val);
                setRowHeightInput(String(val));
                saveConfig({ rowHeight: val }, false);
              }} 
            />
            <Input 
              type="number" 
              min="40" 
              max="300" 
              value={rowHeightInput}
              className="w-16 text-xs p-1"
              onChange={e => {
                const rawVal = e.target.value;
                setRowHeightInput(rawVal);
                
                const val = parseInt(rawVal, 10);
                if (!isNaN(val) && val >= 40 && val <= 300) {
                  setRowHeight(val);
                  saveConfig({ rowHeight: val }, false);
                }
              }} 
            />
          </div>
        </label>
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          Adjust the global height of all rows on this page (40-300px).
        </div>
      </div>)}
      {!pageConfig?.linkedSourcePage && (<div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
        <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
          <span className="text-[13px] text-[#37474f] font-bold">Row Reorder</span>
          <input 
            type="checkbox" 
            className="scale-125" 
            checked={rowReorder} 
            onChange={e => {
              const checked = e.target.checked;
              setRowReorder(checked);
              saveConfig({ rowReorderEnabled: checked }, false);
            }} 
          />
        </label>
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          Enable this to unlock single-row and multi-row move features. Disable it to prevent accidental row movement.
        </div>
      </div>)}
      {!!pageConfig?.linkedSourcePage && (
        <div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
          <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
            <span className="text-[13px] text-[#37474f] font-bold">Auto-sort rows by latest sale column (highest first)</span>
            <input 
              type="checkbox" 
              className="scale-125" 
              checked={autoSortBySales} 
              onChange={e => {
                const checked = e.target.checked;
                setAutoSortBySales(checked);
                saveConfig({ autoSortBySales: checked }, false);
              }} 
            />
          </label>
          <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
            Automatically reorder Live Tracker rows based on the latest sale column's quantities.
          </div>
        </div>
      )}
      {!!pageConfig?.linkedSourcePage && (
        <div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5 flex items-center justify-between gap-2.5">
          <div>
            <div className="text-[13px] text-[#37474f] font-bold">Source Page</div>
            <div className="text-[11px] text-[#78909c] leading-snug mt-1">Currently linked to: <span className="font-semibold">{pageConfig.linkedSourcePage}</span></div>
          </div>
          {onOpenRelinkTracker && (
            <Button variant="outline" className="text-xs py-1 px-2 shrink-0" onClick={onOpenRelinkTracker}>
              Change source page
            </Button>
          )}
        </div>
      )}
      <div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
        <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
          <span className="text-[13px] text-[#37474f] font-bold">Hover Preview Image</span>
          <input 
            type="checkbox" 
            className="scale-125" 
            checked={hoverPreview} 
            onChange={e => {
              const checked = e.target.checked;
              setHoverPreview(checked);
              saveConfig({ hoverPreviewEnabled: checked }, false);
            }} 
          />
        </label>
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          When enabled, hovering over an image cell will show a larger preview of the image.
        </div>
      </div>
      {!pageConfig?.linkedSourcePage && (<div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
        <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
          <span className="text-[13px] text-[#37474f] font-bold">Link Secondary Search Page</span>
          <select 
            className="border border-gray-300 rounded p-1 text-xs"
            value={secondarySearchPage}
            onChange={e => {
              const val = e.target.value;
              setSecondarySearchPage(val);
              saveConfig({ secondarySearchPage: val || undefined }, false);
            }}
          >
            <option value="">None</option>
            {existingPages.filter(p => p !== activePage).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        {secondarySearchPage && (
          <Button variant="dark" className="mt-2 w-full justify-center" onClick={onReorderSearchBars}>
            <RefreshCw size={14} /> 🔄 Reorder Search Bars
          </Button>
        )}
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          Select another page to display a secondary search bar and view its data below this page's data.
        </div>
      </div>)}
      <div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
        <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
          <span className="text-[13px] text-[#37474f] font-bold">Independent Search Bars</span>
          <input 
            type="checkbox" 
            className="scale-125" 
            checked={independentSearchBars} 
            onChange={e => {
              const checked = e.target.checked;
              setIndependentSearchBars(checked);
              saveConfig({ independentSearchBars: checked }, false);
            }} 
          />
        </label>
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          When enabled, typing in one search bar will not clear the text in the other search bar.
        </div>
      </div>
      
      <div className="border border-gray-200 rounded-md p-2.5 bg-gray-50 mb-2.5">
        <label className="flex items-center justify-between gap-2.5 m-0 cursor-pointer">
          <span className="text-[13px] text-[#37474f] font-bold">Show retired chip in Total Qty</span>
          <input 
            type="checkbox" 
            className="scale-125" 
            checked={pageConfig?.showRetiredChipInTotalQty !== false} 
            onChange={e => {
              const checked = e.target.checked;
              saveConfig({ showRetiredChipInTotalQty: checked }, false);
            }} 
          />
        </label>
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          When enabled, retired sources in the Total Qty column are grouped into a single compact chip.
        </div>
      </div>

      {pageConfig?.isTrackerPage && (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 mt-2 mb-4">
          <div>
            <div className="text-sm font-bold text-gray-800">🚨 Low Stock Alert Threshold</div>
            <div className="text-xs text-gray-500">Highlight remaining qty in red when stock reaches this number (Default: 0)</div>
          </div>
          <input
            type="number"
            min="0"
            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm font-bold text-center focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            value={minStockAlert}
            onWheel={(e) => e.currentTarget.blur()}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              setMinStockAlert(val);
              saveConfig({ minStockAlert: val }, false);
            }}
          />
        </div>
      )}

      {!pageConfig?.linkedSourcePage && (<div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-[#2b579a]">📦 Page Copy Boxes</p>
            <p className="text-[10px] text-gray-500 font-semibold leading-tight mt-0.5">Enable and configure combination copy boxes specific to this page.</p>
          </div>
          <input 
            type="checkbox" 
            className="w-5 h-5 cursor-pointer accent-[#2b579a]"
            checked={pageConfig?.showCopyBoxes !== false} 
            onChange={(e) => saveConfig({ showCopyBoxes: e.target.checked }, false)}
          />
        </div>
        {pageConfig?.showCopyBoxes !== false && (
          <Button variant="outline" className="w-full text-xs py-1.5 mt-1 border-[#2b579a] text-[#2b579a] hover:bg-blue-50" onClick={onConfigureCopyBoxes}>
            ⚙️ Configure Copy Boxes for this Page
          </Button>
        )}
      </div>)}

      {!pageConfig?.isTrackerPage && onCreateTracker && (
        <div className="mt-4 border-t border-[#eceff1] pt-3 mb-3">
          <div className="text-[11px] font-bold text-[#217346] mb-1.5 uppercase tracking-wide flex items-center gap-1">📦 Smart Inventory Tracker</div>
          <p className="text-[11px] text-gray-600 mb-2 leading-tight">Create a linked Live Tracker page with a 100% exact copy of current columns and data.</p>
          <Button variant="green" className="w-full text-xs py-1.5" onClick={() => { onCreateTracker(activePage); onClose(); }}>
             ⚡ Create Linked Live Tracker
          </Button>
        </div>
      )}


      {pageConfig?.isTrackerPage && onManageTrackerColumns && (
        <div className="mt-4 border-t border-[#eceff1] pt-3 mb-3">
          <div className="text-[11px] font-bold text-purple-700 mb-1.5 uppercase tracking-wide flex items-center gap-1">🧩 Manage Columns</div>
          <p className="text-[11px] text-gray-600 mb-2 leading-tight">Add or remove columns from the main page to show in this tracker.</p>
          <Button variant="outline" className="w-full text-xs py-1.5 border-purple-600 text-purple-700 hover:bg-purple-50" onClick={onManageTrackerColumns}>
             🧩 Manage Columns from Main Page
          </Button>
        </div>
      )}

      {pageConfig?.isTrackerPage && onSyncTracker && (
        <div className="mt-4 border-t border-[#eceff1] pt-3 mb-3">
          <div className="text-[11px] font-bold text-[#2b579a] mb-1.5 uppercase tracking-wide flex items-center gap-1">🔄 Manual Sync</div>
          <p className="text-[11px] text-gray-600 mb-2 leading-tight">Manually sync this tracker page with its source page. This fixes missing entries and ensures data is an exact match.</p>
          <Button variant="blue" className="w-full text-xs py-1.5" onClick={() => { onSyncTracker(activePage); onClose(); }}>
             🔄 Repair & Sync Tracker Now
          </Button>
        </div>
      )}

      <div className="border border-gray-200 rounded-md p-2.5 bg-gray-50">
        {!pageConfig?.linkedSourcePage && (<div className="flex gap-2 mb-2">
          <Button variant="blue" className="flex-1 justify-center" onClick={onCreateColumn}><Plus size={14} /> Create Column</Button>
          <Button variant="green" className="flex-1 justify-center" onClick={onAddRow}>🧾 Add Row</Button>
        </div>)}
        
        { (
          <div className="flex gap-2 mb-2">
            <Button variant="dark" className="flex-1 justify-center" onClick={onRenamePage}><Edit size={14} /> Rename Page</Button>
            <Button variant="red" className="flex-1 justify-center" onClick={() => {
              onClose();
              onDeletePage();
            }}><Trash2 size={14} /> Delete Page</Button>
          </div>
        )}

        <div className="flex gap-2 mb-2">
          {!pageConfig?.linkedSourcePage && <Button variant="green" className="flex-1 justify-center" onClick={onImportExcel}>📥 Import Excel</Button>}
          <Button variant="blue" className="flex-1 justify-center" onClick={onExportExcel}>📤 Export Excel</Button>
        </div>

        <div className="flex justify-between items-center mt-2 mb-4 gap-2">
          {!pageConfig?.linkedSourcePage && <Button variant="outline" className="flex-1 justify-center" onClick={() => fileInputRef.current?.click()}>📂 Import Page (JSON/ZIP)</Button>}
          {!pageConfig?.isTrackerPage && (
            <Button variant="outline" className="flex-1 justify-center border-blue-600 text-blue-600 hover:bg-blue-50" onClick={() => {
              window.open("/api/export-zip/page/" + encodeURIComponent(activePage));
            }}>
              📂 Export Page (ZIP Archive)
            </Button>
          )}
          <input 
            type="file" 
            accept=".json,.zip" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onImportPageJson(e.target.files[0]);
                e.target.value = ''; // Reset input
              }
            }} 
          />
        </div>

        {!pageConfig?.linkedSourcePage && (
          <div className="flex gap-2 mb-2">
            <Button variant="outline" className="flex-1 justify-center text-orange-600 border-orange-600 hover:bg-orange-50" onClick={onFindDuplicates}>
              🔍 Find Duplicates
            </Button>
            <Button variant="outline" className="flex-1 justify-center text-red-600 border-red-600 hover:bg-red-50" onClick={() => {
              setConfirmationModal({
                isOpen: true,
                title: "Confirm Clear Active Page Data",
                message: "Are you sure you want to permanently delete ALL rows on this page? This action cannot be undone.",
                onConfirm: () => {
                  onClearPageData();
                  onClose();
                }
              });
            }}>
              <Trash2 size={14} /> Clear Active Page All Data 
            </Button>
          </div>
        )}

        <div className="flex gap-2 mb-2">
          <Button variant="outline" className="flex-1 justify-center text-purple-600 border-purple-600 hover:bg-purple-50" onClick={calculateStats}>
            📊 Page Statistics
          </Button>
        </div>

        {pageStats && (
          <div className="stats-container" style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f3f4f6', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '15px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#374151' }}>📊 Statistics for {activePage}</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#4b5563', lineHeight: '1.8', fontSize: '13px' }}>
              <li><strong>Total Rows:</strong> {pageStats.totalRows}</li>
              <li><strong>Total Columns:</strong> {pageStats.totalColumns}</li>
              <li><strong>Total Images:</strong> {pageStats.totalImages}</li>
              <li><strong>Duplicate Images:</strong> {pageStats.duplicateImages}</li>
            </ul>
            <button onClick={() => setPageStats(null)} style={{ marginTop: '10px', padding: '5px 10px', background: '#d1d5db', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Close Stats</button>
          </div>
        )}

        <div className="mt-4 mb-2 relative flex items-center">
          <div className="absolute left-2.5 text-blue-500">
            <Search size={14} />
          </div>
          <Input 
            type="text" 
            placeholder="Search column name..." 
            value={columnSearch} 
            onChange={e => setColumnSearch(e.target.value)} 
            className="w-full text-xs py-2 pl-8 pr-8 border-2 border-blue-400 bg-blue-50/50 rounded focus:border-blue-500 focus:bg-blue-50 focus:ring-1 focus:ring-blue-500 outline-none transition-colors placeholder-blue-300 text-blue-900"
          />
          {columnSearch && (
            <button 
              onClick={() => setColumnSearch('')} 
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600 font-bold border-none bg-transparent cursor-pointer flex items-center justify-center p-1"
              title="Clear search"
            >✕</button>
          )}
        </div>
        <div className="mt-2 text-[11px] text-[#78909c] leading-snug">
          New columns will be added to the active page. <b>Row No.</b> always remains first and locked. You can drag and drop columns here to reorder them.
        </div>
        {columnSearch ? (
          <div className="mt-2.5 max-h-[300px] overflow-auto border border-gray-200 rounded bg-white p-1.5">
            {(() => {
              const lowerSearch = columnSearch.toLowerCase();
              const filtered = localColumns.map((c, i) => ({ c, i })).filter(({ c }) => c.name.toLowerCase().includes(lowerSearch) || c.key.toLowerCase().includes(lowerSearch));
              if (filtered.length === 0) {
                return <div className="text-[11px] text-[#90a4ae] p-2">No matching columns.</div>;
              }
              return filtered.map(({ c, i }) => (
                <div key={c.key} className="flex justify-between items-center text-[14px] p-1 border-b border-gray-100 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    {c.movable !== false ? (
                      <>
                        <input 
                          type="number" 
                          value={i + 1}
                          disabled
                          className="w-12 text-center text-xs border border-gray-200 rounded p-1 bg-gray-50 text-gray-400 cursor-not-allowed"
                          title="Clear the search to reorder columns"
                        />
                        <div className="text-gray-200 cursor-not-allowed" title="Clear the search to reorder columns">
                          <GripVertical size={16} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 text-center text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded p-1" title="Locked column">1</div>
                        <div className="w-[16px]"></div>
                      </>
                    )}
                    <div className="flex items-center gap-1.5">
                      <b>{c.name}</b> <span className="text-[#607d8b]">({c.type})</span>
                      {c.sortEnabled && c.key !== 'sr' && <ArrowUpDown size={14} className="text-blue-500" title="Sorting Enabled" />}
                      {c.sortLocked && c.key !== 'sr' && <Lock size={14} className="text-gray-500" title="Sorting Locked" />}
                      {c.sortPriority && c.key !== 'sr' && <span className="text-[10px] font-bold px-1 rounded bg-blue-100 text-blue-700" title={`Priority ${c.sortPriority}`}>P{c.sortPriority}</span>}
                      {c.locked && ' • Locked'}
                      {c.type === 'text_with_copy_button' && ' • Multi input + per-item copy'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.key !== 'sr' && (
                      <button 
                        className="border-0 bg-transparent cursor-pointer text-[#607d8b] hover:text-gray-800 p-1 flex items-center justify-center"
                        onClick={() => setSortSettingsColumn(c)}
                        title="Sort Settings"
                      >
                        <Sliders size={16} />
                      </button>
                    )}
                    {c.key !== "sr" && (
                      <button 
                        className={`border-0 bg-transparent cursor-pointer p-1 flex items-center justify-center transition-opacity ${c.pinned ? 'opacity-100 hover:opacity-80' : 'opacity-40 hover:opacity-100 grayscale-[0.5]'}`}
                        onClick={() => handleTogglePin(c.key)}
                        title={c.pinned ? "Unpin column (unfreeze)" : "Pin column (freeze)"}
                      >
                        📌
                      </button>
                    )}
                    {!c.locked && (
                      <div className="flex items-center gap-1">
                        {pendingDeleteSaleCol?.key === c.key ? (
                          <div className="flex items-center gap-1.5 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 shadow-sm ml-1">
                            <button 
                              onClick={() => {
                                setPendingDeleteSaleCol(null);
                                setConfirmationModal({
                                  isOpen: true,
                                  title: "Delete Confirmation (1/2)",
                                  message: `Are you sure you want to normal delete "${c.name}"? (Use this if created by mistake)`,
                                  onConfirm: () => {
                                    setTimeout(() => {
                                      setConfirmationModal({
                                        isOpen: true,
                                        title: "Final Confirmation (2/2)",
                                        message: `Are you ABSOLUTELY sure? This will remove the column and revert remaining quantity.`,
                                        onConfirm: () => {
                                          if (onDeleteColumn) {
                                            onDeleteColumn(c, 'normal');
                                          } else {
                                            const cols = localColumns.filter(col => col.key !== c.key);
                                            setLocalColumns(cols);
                                            saveConfig({ columns: cols }, false);
                                          }
                                        }
                                      });
                                    }, 400); // Trigger 2nd confirmation after a short delay
                                  }
                                });
                              }}
                              className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 px-2 py-1 rounded text-[10px] font-bold transition-colors"
                              title="Normal Delete (Mistake)"
                            >
                              🗑️ Normal
                            </button>
                            <button 
                              onClick={() => {
                                setPendingDeleteSaleCol(null);
                                setConfirmationModal({
                                  isOpen: true,
                                  title: "Smart Delete Confirmation",
                                  message: `Are you sure you want to Smart Delete "${c.name}"? This permanently deducts sales from Total Qty before deleting to keep stock accurate.`,
                                  onConfirm: () => {
                                    if (onDeleteColumn) {
                                      onDeleteColumn(c, 'smart');
                                    }
                                  }
                                });
                              }}
                              className="bg-red-600 text-white hover:bg-red-700 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm"
                              title="Smart Delete (Purge Old Data)"
                            >
                              🧠 Smart
                            </button>
                            <button 
                              onClick={() => setPendingDeleteSaleCol(null)}
                              className="text-gray-400 hover:text-gray-700 px-1 cursor-pointer border-none bg-transparent font-bold text-xs"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <>
                            <button 
                              className="border-0 bg-transparent cursor-pointer text-[#2b579a] hover:text-blue-800 p-1 flex items-center justify-center"
                              onClick={() => onEditColumn(c)}
                              title="Edit Column"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              className="border-0 bg-transparent cursor-pointer text-red-600 hover:text-red-800 p-1 flex items-center justify-center"
                              onClick={() => {
                                if (c.type === 'sale_tracker') {
                                  setPendingDeleteSaleCol(c);
                                } else {
                                  setConfirmationModal({
                                    isOpen: true,
                                    title: "Delete Column",
                                    message: `Are you sure you want to delete "${c.name}"?`,
                                    onConfirm: () => {
                                      if (onDeleteColumn) {
                                        onDeleteColumn(c, 'normal');
                                      } else {
                                        const cols = localColumns.filter(col => col.key !== c.key);
                                        setLocalColumns(cols);
                                        saveConfig({ columns: cols }, false);
                                      }
                                    }
                                  });
                                }
                              }}
                              title="Delete Column"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="columns-droppable">
            {(provided) => (
              <div 
                className="mt-2.5 max-h-[300px] overflow-auto border border-gray-200 rounded bg-white p-1.5"
                {...provided.droppableProps}
                ref={provided.innerRef}
              >
                {localColumns.length === 0 ? (
                  <div className="text-[11px] text-[#90a4ae]">No columns yet.</div>
                ) : (
                  localColumns.map((c, i) => (
                    // @ts-ignore
                    <Draggable key={c.key} draggableId={c.key} index={i} isDragDisabled={c.movable === false}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`flex justify-between items-center text-[14px] p-1 border-b border-gray-100 ${c.movable !== false ? 'hover:bg-gray-50' : ''} ${snapshot.isDragging ? 'bg-white shadow-lg rounded ring-1 ring-blue-500 z-50' : ''}`}
                          style={provided.draggableProps.style}
                        >
                          <div className="flex items-center gap-2">
                            {c.movable !== false ? (
                              <>
                                <input 
                                  type="number" 
                                  min={2} 
                                  max={localColumns.length} 
                                  value={i + 1}
                                  onChange={(e) => handleManualReorder(c.key, e.target.value)}
                                  className="w-12 text-center text-xs border border-gray-300 rounded p-1 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                  title="Type position number"
                                />
                                <div {...provided.dragHandleProps} className="text-gray-400 hover:text-gray-700 cursor-grab active:cursor-grabbing">
                                  <GripVertical size={16} />
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="w-12 text-center text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded p-1" title="Locked column">1</div>
                                <div className="w-[16px]"></div>
                              </>
                            )}
                            <div className="flex items-center gap-1.5">
                              <b>{c.name}</b> <span className="text-[#607d8b]">({c.type})</span>
                              {c.sortEnabled && c.key !== 'sr' && <ArrowUpDown size={14} className="text-blue-500" title="Sorting Enabled" />}
                              {c.sortLocked && c.key !== 'sr' && <Lock size={14} className="text-gray-500" title="Sorting Locked" />}
                              {c.sortPriority && c.key !== 'sr' && <span className="text-[10px] font-bold px-1 rounded bg-blue-100 text-blue-700" title={`Priority ${c.sortPriority}`}>P{c.sortPriority}</span>}
                              {c.locked && ' • Locked'}
                              {c.type === 'text_with_copy_button' && ' • Multi input + per-item copy'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {c.key !== 'sr' && (
                              <button 
                                className="border-0 bg-transparent cursor-pointer text-[#607d8b] hover:text-gray-800 p-1 flex items-center justify-center"
                                onClick={() => setSortSettingsColumn(c)}
                                title="Sort Settings"
                              >
                                <Sliders size={16} />
                              </button>
                            )}
                            {c.key !== "sr" && (
                              <button 
                                className={`border-0 bg-transparent cursor-pointer p-1 flex items-center justify-center transition-opacity ${c.pinned ? 'opacity-100 hover:opacity-80' : 'opacity-40 hover:opacity-100 grayscale-[0.5]'}`}
                                onClick={() => handleTogglePin(c.key)}
                                title={c.pinned ? "Unpin column (unfreeze)" : "Pin column (freeze)"}
                              >
                                📌
                              </button>
                            )}
                            {!c.locked && (
                              <div className="flex items-center gap-1">
                                {pendingDeleteSaleCol?.key === c.key ? (
                                  <div className="flex items-center gap-1.5 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 shadow-sm ml-1">
                                    <button 
                                      onClick={() => {
                                        setPendingDeleteSaleCol(null);
                                        setConfirmationModal({
                                          isOpen: true,
                                          title: "Delete Confirmation (1/2)",
                                          message: `Are you sure you want to normal delete "${c.name}"? (Use this if created by mistake)`,
                                          onConfirm: () => {
                                            setTimeout(() => {
                                              setConfirmationModal({
                                                isOpen: true,
                                                title: "Final Confirmation (2/2)",
                                                message: `Are you ABSOLUTELY sure? This will remove the column and revert remaining quantity.`,
                                                onConfirm: () => {
                                                  if (onDeleteColumn) {
                                                    onDeleteColumn(c, 'normal');
                                                  } else {
                                                    const cols = localColumns.filter(col => col.key !== c.key);
                                                    setLocalColumns(cols);
                                                    saveConfig({ columns: cols }, false);
                                                  }
                                                }
                                              });
                                            }, 400); // Trigger 2nd confirmation after a short delay
                                          }
                                        });
                                      }}
                                      className="bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 px-2 py-1 rounded text-[10px] font-bold transition-colors"
                                      title="Normal Delete (Mistake)"
                                    >
                                      🗑️ Normal
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setPendingDeleteSaleCol(null);
                                        setConfirmationModal({
                                          isOpen: true,
                                          title: "Smart Delete Confirmation",
                                          message: `Are you sure you want to Smart Delete "${c.name}"? This permanently deducts sales from Total Qty before deleting to keep stock accurate.`,
                                          onConfirm: () => {
                                            if (onDeleteColumn) {
                                              onDeleteColumn(c, 'smart');
                                            }
                                          }
                                        });
                                      }}
                                      className="bg-red-600 text-white hover:bg-red-700 px-2 py-1 rounded text-[10px] font-bold transition-colors shadow-sm"
                                      title="Smart Delete (Purge Old Data)"
                                    >
                                      🧠 Smart
                                    </button>
                                    <button 
                                      onClick={() => setPendingDeleteSaleCol(null)}
                                      className="text-gray-400 hover:text-gray-700 px-1 cursor-pointer border-none bg-transparent font-bold text-xs"
                                      title="Cancel"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button 
                                      className="border-0 bg-transparent cursor-pointer text-[#2b579a] hover:text-blue-800 p-1 flex items-center justify-center"
                                      onClick={() => onEditColumn(c)}
                                      title="Edit Column"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button 
                                      className="border-0 bg-transparent cursor-pointer text-red-600 hover:text-red-800 p-1 flex items-center justify-center"
                                      onClick={() => {
                                        if (c.type === 'sale_tracker') {
                                          setPendingDeleteSaleCol(c);
                                        } else {
                                          setConfirmationModal({
                                            isOpen: true,
                                            title: "Delete Column",
                                            message: `Are you sure you want to delete "${c.name}"?`,
                                            onConfirm: () => {
                                              if (onDeleteColumn) {
                                                onDeleteColumn(c, 'normal');
                                              } else {
                                                const cols = localColumns.filter(col => col.key !== c.key);
                                                setLocalColumns(cols);
                                                saveConfig({ columns: cols }, false);
                                              }
                                            }
                                          });
                                        }
                                      }}
                                      title="Delete Column"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        )}
      </div>

      <ColumnSortSettingsModal
        isOpen={!!sortSettingsColumn}
        onClose={() => setSortSettingsColumn(null)}
        column={sortSettingsColumn}
        onSave={handleSaveSortSettings}
      />
      <div className="mt-4 flex justify-end gap-2 sticky bottom-0 bg-white py-3 border-t border-gray-100 z-10 -mb-1">
        <Button variant="dark" onClick={onClose}>Back to Workspace</Button>
      </div>
    </Modal>
  );
});
