import React, { useState, useMemo, useDeferredValue } from 'react';
import { Modal, Button, Input } from './ui';
import { Column, RowData } from '../types';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useToast } from './ToastProvider';
import { Search, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import { parseMultiSource } from '../lib/appUtils';
import { isRetired, sumActive } from '../lib/sourceArchiveUtils';
import { filterAndSortTrackerRows } from '../lib/trackerSortUtils';

export interface ExcelExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  pageName: string;
  columns: Column[];
  rows: RowData[];
  lowStockIds?: Set<string> | null;
  activeFilterSaleCol?: string | null;
  isTrackerPage?: boolean;
  linkedSourcePage?: string | null;
  autoSortBySales?: boolean;
  minStockAlert?: number;
  initialTrackerQtySort?: string;
}

export const ExcelExportModal = React.memo(({
  isOpen, onClose, onBack, pageName, columns, rows, lowStockIds, activeFilterSaleCol,
  isTrackerPage, linkedSourcePage, autoSortBySales, minStockAlert,
  initialTrackerQtySort = 'none'
}: ExcelExportModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [localRows, setLocalRows] = useState<RowData[]>(rows);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Tracker specific local states
  const [localTrackerQtySort, setLocalTrackerQtySort] = useState(initialTrackerQtySort);

  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(
    new Set(columns.filter(c => c.key !== 'sr' && !c.archived).map(c => c.key))
  );
  const { toast } = useToast();

  const getImageUrl = (val: any) => {
    if (!val) return '';
    const imgData = typeof val === 'object' && val !== null ? val.data : val;
    if (!imgData) return '';
    if (typeof imgData === 'string' && (imgData.startsWith('data:image') || /^https?:\/\//i.test(imgData))) {
      return imgData;
    }
    return `/uploads/${imgData}`;
  };

  const formatMultiSource = (sources: any[]) => {
    if (!sources || sources.length === 0) return '0';
    if (sources.length === 1 && sources[0].source === 'Default' && !isRetired(sources[0])) return String(sources[0].qty);
    
    const lines = sources.map(s => `${s.source}: ${s.qty}${isRetired(s) ? ' (Retired)' : ''}`);
    if (sources.length > 1) {
      const total = sumActive(sources);
      lines.push(`Total: ${total}`);
    }
    return lines.join('\n');
  };

  const getCellValue = (row: RowData, col: Column) => {
    if (col.key === 'remaining_qty') {
      const totalSources = parseMultiSource(row.total_qty);
      const saleCols = columns.filter(c => c.type === 'sale_tracker');
      
      const remainingSources = totalSources.map((ts: any) => {
        let totalSaleForSource = 0;
        saleCols.forEach(sc => {
          const sales = parseMultiSource(row[sc.key]);
          const match = sales.find((s: any) => s.source === ts.source);
          if (match) totalSaleForSource += (parseFloat(match.qty) || 0);
        });
        return {
          ...ts,
          qty: (parseFloat(ts.qty) || 0) - totalSaleForSource
        };
      });
      
      return formatMultiSource(remainingSources);
    }
    if (col.key === 'total_qty') {
      const sources = parseMultiSource(row[col.key]);
      let visibleSources = sources.filter((s: any) => !isRetired(s));
      if (activeFilterSaleCol) {
        const saleSources = parseMultiSource(row[activeFilterSaleCol]);
        const autoRevealed = sources.filter((s: any) => isRetired(s) && saleSources.some((ss: any) => ss.source === s.source && (parseFloat(ss.qty) || 0) > 0));
        visibleSources = [...visibleSources, ...autoRevealed];
      }
      return formatMultiSource(visibleSources);
    }
    if (col.type === 'sale_tracker') {
      const sources = parseMultiSource(row[col.key]);
      return formatMultiSource(sources);
    }
    return row[col.key];
  };

  // Sync localRows when rows prop changes
  React.useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  // Reset selected columns when the modal opens or columns change
  React.useEffect(() => {
    if (isOpen) {
      setSelectedColumnKeys(new Set(columns.filter(c => c.key !== 'sr' && !c.archived).map(c => c.key)));
      setShowLowStockOnly(false);
      setLocalTrackerQtySort(initialTrackerQtySort);
    }
  }, [isOpen, columns, initialTrackerQtySort]);

  const decodeHtmlEntities = (text: string) => {
    if (!text) return text;
    return String(text)
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'");
  };

  const exportColumns = useMemo(() => columns.filter(c => c.key !== 'sr' && selectedColumnKeys.has(c.key)), [columns, selectedColumnKeys]);

  const highlightText = (text: string, query: string) => {
    const cleanText = text ? String(text).replace(/<[^>]*>/g, '').replace(/<br\s*\/?>/gi, ' ').replace(/&nbsp;/gi, ' ') : '';
    if (!query || !cleanText) return cleanText;
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return cleanText;

    const escapedStrings = tokens.map(t => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let bStart = '';
      let bEnd = '';
      if (/^[0-9]/.test(t)) {
        bStart = '(?<![0-9])';
        bEnd = '';
      } else if (/^[a-zA-Z]/.test(t)) {
        if (t.length <= 2) {
          bStart = '(?<![a-zA-Z])';
          bEnd = '(?![a-zA-Z]{2,})';
        } else {
          bStart = '';
          bEnd = '';
        }
      }
      return bStart + escaped + bEnd;
    });
    
    const regex = new RegExp('(' + escapedStrings.join('|') + ')', 'gi');
    const parts = cleanText.split(regex);
    
    return parts.map((part, i) => 
      regex.test(part) ? (
        <span key={i} className="bg-yellow-300 text-black font-bold px-[1px] rounded-sm">{part}</span>
      ) : (
        part
      )
    );
  };

  // Code 2 wala Advanced Tokenized Search
  const filteredRows = useMemo(() => {
    let baseRows = localRows;
    if (isTrackerPage && showLowStockOnly && lowStockIds) {
      baseRows = baseRows.filter(r => lowStockIds.has(String(r.id)));
    }

    if (deferredSearchQuery.trim()) {
      const activeQueries = [deferredSearchQuery.trim()].filter(Boolean);
      
      baseRows = baseRows.filter(row => {
        const colData = columns.map(col => {
          if (col.key === "sr" || col.type === "image" || col.type === "file") return null;
          const val = getCellValue(row, col);
          const strVal = Array.isArray(val) ? val.join(" ") : val !== null && val !== undefined ? String(val) : "";
          const cleanVal = decodeHtmlEntities(strVal).replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/gi, " ").replace(/&nbsp;/gi, " ").toLowerCase();
          return { name: col.name.toLowerCase(), val: cleanVal };
        }).filter(Boolean) as { name: string; val: string }[];

        const globalBlob = colData.map((c) => c.val).join(" ");

        return activeQueries.some((query) => {
          let targetBlob = globalBlob;
          let searchString = query.toLowerCase();
          const colonIndex = searchString.indexOf(":");
          if (colonIndex > 0) {
            const prefix = searchString.substring(0, colonIndex).trim();
            const suffix = searchString.substring(colonIndex + 1).trim();
            const matchedCol = colData.find((c) => c.name.includes(prefix) || prefix.includes(c.name));
            if (matchedCol) {
              targetBlob = matchedCol.val;
              searchString = suffix;
            }
          }
          const tokens = searchString.split(/\s+/).filter(Boolean);
          if (tokens.length === 0) return true;
          return tokens.every((t) => {
            const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let bStart = "";
            let bEnd = "";
            if (/^[0-9]/.test(t)) {
              bStart = "";
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
      });
    }

    if (isTrackerPage) {
      baseRows = filterAndSortTrackerRows({
        rows: baseRows,
        originalRows: localRows,
        columns,
        trackerFilter: 'all',
        trackerSort: 'none',
        trackerQtySort: localTrackerQtySort,
        activeFilterSaleCol,
        minStockAlert,
        linkedSourcePage,
        autoSortBySales,
      });
    }

    return baseRows;
  }, [
    localRows, deferredSearchQuery, showLowStockOnly, lowStockIds, columns,
    isTrackerPage, localTrackerQtySort,
    activeFilterSaleCol, minStockAlert, linkedSourcePage, autoSortBySales
  ]);

  const parseHtmlToRichText = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const richText: any[] = [];
    
    const processNode = (node: Node, currentFont: any = {}) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          richText.push({ text: node.textContent, font: { ...currentFont } });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const newFont = { ...currentFont };
        
        if (el.tagName === 'B' || el.tagName === 'STRONG') newFont.bold = true;
        if (el.tagName === 'I' || el.tagName === 'EM') newFont.italic = true;
        if (el.tagName === 'U') newFont.underline = true;
        if (el.tagName === 'S' || el.tagName === 'STRIKE') newFont.strike = true;
        
        if (el.style.color) {
          const color = el.style.color;
          let argb = 'FF000000';
          if (color.startsWith('#')) {
            const hex = color.substring(1);
            if (hex.length === 6) argb = 'FF' + hex.toUpperCase();
            else if (hex.length === 8) argb = hex.substring(6, 8).toUpperCase() + hex.substring(0, 6).toUpperCase();
            else if (hex.length === 3) argb = 'FF' + hex.split('').map(c => c + c).join('').toUpperCase();
          } else if (color.startsWith('rgb')) {
            const match = color.match(/\d+/g);
            if (match && match.length >= 3) {
              const r = parseInt(match[0]).toString(16).padStart(2, '0');
              const g = parseInt(match[1]).toString(16).padStart(2, '0');
              const b = parseInt(match[2]).toString(16).padStart(2, '0');
              argb = 'FF' + (r + g + b).toUpperCase();
            }
          }
          newFont.color = { argb };
        }
        
        if (el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight) >= 700) newFont.bold = true;
        if (el.style.fontStyle === 'italic') newFont.italic = true;
        if (el.style.textDecoration.includes('underline')) newFont.underline = true;
        if (el.style.textDecoration.includes('line-through')) newFont.strike = true;
        
        if (el.tagName === 'BR') {
           richText.push({ text: '\n', font: { ...currentFont } });
        }

        el.childNodes.forEach(child => processNode(child, newFont));
      }
    };
    
    div.childNodes.forEach(child => processNode(child));
    return richText.length > 0 ? richText : [{ text: decodeHtmlEntities(html) }];
  };

  const handleCopyRowToSheets = async (row: RowData) => {
    try {
      let html = '<table border="1"><tr>';
      
      for (const col of exportColumns) {
        if (col.type === 'image') {
          const rawImgVal = row[col.key];
          let base64Data = '';
          
          if (rawImgVal) {
            let imgVal = typeof rawImgVal === 'object' && rawImgVal !== null ? rawImgVal.data : rawImgVal;
            
            if (typeof imgVal === 'string') {
              if (imgVal.startsWith('data:image')) {
                base64Data = imgVal;
              } else if (imgVal.startsWith('base64,')) {
                base64Data = `data:image/png;${imgVal}`;
              } else if (!/^https?:\/\//i.test(imgVal) && !imgVal.match(/\.(jpeg|jpg|gif|png|webp|svg|heic)$/i)) {
                if (imgVal.length > 50 && !imgVal.includes(' ')) {
                  base64Data = `data:image/png;base64,${imgVal}`;
                }
              } else if (!/^https?:\/\//i.test(imgVal)) {
                try {
                  const response = await fetch(`/uploads/${imgVal}`);
                  if (response.ok) {
                    const blob = await response.blob();
                    base64Data = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  }
                } catch (e) {
                  console.error("Failed to fetch local image for export", e);
                }
              } else {
                try {
                  const response = await fetch(imgVal, { mode: 'cors' });
                  if (response.ok) {
                    const blob = await response.blob();
                    base64Data = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  }
                } catch (e) {
                  console.error("Failed to fetch external image for export", e);
                }
              }
            }
          }
          
          if (base64Data) {
            html += `<td><img src="${base64Data}" width="100" /></td>`;
          } else {
            html += `<td></td>`;
          }
        } else {
          let val = getCellValue(row, col);
          if (Array.isArray(val)) {
            val = val.join(', ');
          }
          let textVal = String(val || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
          html += `<td style="white-space: pre-wrap;">${textVal}</td>`;
        }
      }
      
      html += '</tr></table>';
      
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' })
        })
      ]);
      toast("Row copied for Google Sheets!");
    } catch (err) {
      console.error(err);
      toast("Error copying row");
    }
  };

  const handleExport = async () => {
    if (exportColumns.length === 0) {
      toast("Please select at least one column to export.");
      return;
    }
    setIsProcessing(true);
    setProgress(10);

    try {
      // Agar kuch select kiya hai toh sirf wo, warna filtered sab
      const rowsToExport = selectedRowIds.size > 0 
        ? filteredRows.filter(r => selectedRowIds.has(r.id))
        : filteredRows; 

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(pageName || 'Inventory Data');
      
      setProgress(30);

      // Columns banayein aur Image column ki width set karein
      worksheet.columns = exportColumns.map(c => ({ 
        header: c.name, 
        key: c.key, 
        width: c.type === 'image' ? 18 : 25 
      }));

      // Code 2 wala Header Styling (Software kay color kay mutabiq)
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F3F3' }
        };
        cell.font = { bold: true, color: { argb: 'FF2F3D49' } };
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });

      setProgress(50);

      // Data insert karna
      for (let i = 0; i < rowsToExport.length; i++) {
        const rowData = rowsToExport[i];
        const rowValues: any = {};
        
        exportColumns.forEach(col => {
          if (col.type === 'image') {
            rowValues[col.key] = ''; // Text clear karein
          } else {
            let val = getCellValue(rowData, col);
            if (Array.isArray(val)) {
              val = val.join('<br>');
            } else {
              val = val || '';
            }
            if (typeof val === 'string' && /<[a-z][\s\S]*>/i.test(val)) {
              rowValues[col.key] = { richText: parseHtmlToRichText(val) };
            } else {
              rowValues[col.key] = typeof val === 'string' ? decodeHtmlEntities(val) : val;
            }
          }
        });
        
        const excelRow = worksheet.addRow(rowValues);
        excelRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        
        // Image kay liye row height badi ki (First code requirement)
        excelRow.height = 80; 
        
        // Image processing
        for (let j = 0; j < exportColumns.length; j++) {
          const col = exportColumns[j];
          const rawImgVal = rowData[col.key];
          
          if (col.type === 'image' && rawImgVal) {
            let base64Data = '';
            
            // Extract the actual image string from object format (for newly added rows)
            let imgVal = typeof rawImgVal === 'object' && rawImgVal !== null ? rawImgVal.data : rawImgVal;
            
            if (typeof imgVal === 'string') {
              if (imgVal.startsWith('data:image')) {
                base64Data = imgVal;
              } else if (imgVal.startsWith('base64,')) {
                base64Data = `data:image/png;${imgVal}`;
              } else if (!/^https?:\/\//i.test(imgVal) && !imgVal.match(/\.(jpeg|jpg|gif|png|webp|svg|heic)$/i)) {
                // Heuristic: If it has no obvious file extension and no URL, it might be raw base64
                if (imgVal.length > 50 && !imgVal.includes(' ')) {
                  base64Data = `data:image/png;base64,${imgVal}`;
                }
              } else if (!/^https?:\/\//i.test(imgVal)) {
                // Local filename fetch fallback
                try {
                  const response = await fetch(`/uploads/${imgVal}`);
                  if (response.ok) {
                    const blob = await response.blob();
                    base64Data = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  }
                } catch (e) {
                  console.error("Failed to fetch local image for export", e);
                }
              } else {
                // External URL
                try {
                  const response = await fetch(imgVal, { mode: 'cors' });
                  if (response.ok) {
                    const blob = await response.blob();
                    base64Data = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                  }
                } catch (e) {
                  console.error("Failed to fetch external image for export", e);
                }
              }
            }
            
            if (base64Data && base64Data.startsWith('data:image')) {
              try {
                // Safety check to ensure we can split and parse it
                const parts = base64Data.split(',');
                if (parts.length > 1) {
                  // e.g. "data:image/png;base64" -> split(';') -> "data:image/png" -> split('/') -> "png"
                  const extensionWrapper = parts[0].split(';')[0];
                  let extension = extensionWrapper && extensionWrapper.includes('/') ? extensionWrapper.split('/')[1] : 'png';
                  
                  const base64 = parts[1];
                  const validExtensions = ['jpeg', 'png', 'gif', 'jpg'];
                  if (!validExtensions.includes(extension)) {
                    extension = 'png'; // Fallback for exceljs support
                  }
                  
                  const imageId = workbook.addImage({
                    base64,
                    extension: (extension === 'jpeg' ? 'jpg' : extension) as any,
                  });

                  // Aapka dia gaya exact pehle code wala placement logic
                  worksheet.addImage(imageId, {
                    // Left side se zyada gap (0.3) aur top se normal gap (0.1)
                    tl: { col: j + 0.5, row: excelRow.number - 1 + 0.1 }, 
                    
                    // Width ko thoda aur kam kar diya taake image right border ko touch na kare
                    ext: { width: 90, height: 80 }, 
                    
                    editAs: 'oneCell' 
                  });
                }
              } catch (e) { 
                console.error("Image export failed", e); 
              }
            }
          }
        }
      }

      setProgress(90);

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `${pageName || 'Inventory'}_Export_${Date.now()}.xlsx`);
      
      setProgress(100);
      toast(`Exported ${rowsToExport.length} rows successfully.`);
      onClose();
    } catch (err) {
      console.error(err);
      toast("Error exporting Excel file");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearData = () => {
    setSelectedRowIds(new Set());
    setSearchQuery('');
    setLocalRows([]);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`📤 Excel Export Preview (${pageName})`} width="95vw" noScroll={true}>
      <div className="flex flex-col h-[85vh] p-4">
        {isProcessing ? (
          <div className="mb-4">
            <div className="text-xs text-gray-500 mb-1">Processing... {progress}%</div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-[#2b579a] h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-4 mb-4 shrink-0 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
                <Input className="pl-8" placeholder="Filter rows..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              {isTrackerPage && lowStockIds && (
                <label className="flex items-center gap-2 cursor-pointer bg-red-50 text-red-700 px-3 py-1.5 rounded border border-red-200 font-bold text-sm hover:bg-red-100 transition-colors">
                  <input 
                    type="checkbox" 
                    className="accent-red-600 w-4 h-4 cursor-pointer"
                    checked={showLowStockOnly}
                    onChange={e => setShowLowStockOnly(e.target.checked)}
                  />
                  🚨 Low Stock Only
                </label>
              )}
            </div>

            {isTrackerPage && (
              <div className="flex items-center gap-4 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm shrink-0 mb-4 flex-wrap">
                
                
                <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
                  <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                    📦 Qty:
                  </span>
                  <select
                    value={localTrackerQtySort}
                    onChange={(e) => setLocalTrackerQtySort(e.target.value)}
                    className="text-xs font-bold text-[#2b579a] border-none outline-none cursor-pointer bg-transparent"
                  >
                    <option value="none">🟢 Default (Reset)</option>
                    <option value="total_high">⬆️ Total Qty: High to Low</option>
                    <option value="total_low">⬇️ Total Qty: Low to High</option>
                    <option value="remaining_high">⬆️ Remaining Qty: High to Low</option>
                    <option value="remaining_low">⬇️ Remaining Qty: Low to High</option>
                  </select>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 mb-4 shrink-0 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-700">Export Columns:</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedColumnKeys(new Set(columns.filter(c => c.key !== 'sr' && !c.archived).map(c => c.key)))}
                    className="px-2 py-1 text-[10px] font-bold bg-[#2b579a] text-white rounded hover:bg-[#1a3c6d] transition-colors"
                  >
                    Select All
                  </button>
                  <button 
                    onClick={() => setSelectedColumnKeys(new Set())}
                    className="px-2 py-1 text-[10px] font-bold bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors border border-gray-300"
                  >
                    Select None
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-1">
                {columns.filter(c => c.key !== 'sr' && !c.archived).map(col => (
                  <label key={col.key} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600 hover:text-gray-900">
                    <input 
                      type="checkbox" 
                      className="accent-[#2b579a] w-4 h-4 cursor-pointer"
                      checked={selectedColumnKeys.has(col.key)}
                      onChange={(e) => {
                        const next = new Set(selectedColumnKeys);
                        if (e.target.checked) next.add(col.key);
                        else next.delete(col.key);
                        setSelectedColumnKeys(next);
                      }}
                    />
                    <span>{col.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto border rounded relative bg-white">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-gray-100 z-10 shadow-sm">
                  <tr>
                    <th className="p-2 border w-10 text-center">
                      <input type="checkbox" className="cursor-pointer" onChange={(e) => {
                        if (e.target.checked) setSelectedRowIds(new Set(filteredRows.map(r => r.id)));
                        else setSelectedRowIds(new Set());
                      }} />
                    </th>
                    {exportColumns.map((c, i) => (
                      <th key={c.key} className="p-2 border text-left">
                        <div className="flex items-center gap-1">
                          {i + 1}. {c.name} {c.locked && '🔒'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className={selectedRowIds.has(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="p-2 border text-center">
                        <div className="flex items-center justify-center gap-2">
                          <input 
                            type="checkbox" 
                            className="cursor-pointer"
                            checked={selectedRowIds.has(row.id)} 
                            onChange={() => {
                              const next = new Set(selectedRowIds);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              setSelectedRowIds(next);
                            }} 
                          />
                          <button 
                            onClick={() => handleCopyRowToSheets(row as RowData)} 
                            title="Copy Row" 
                            className="border-0 bg-transparent hover:scale-110 transition-transform cursor-pointer"
                          >
                            📋
                          </button>
                        </div>
                      </td>
                      {exportColumns.map(c => {
                        const rawVal = getCellValue(row, c);
                        return (
                          <td key={c.key} className="p-2 border whitespace-pre-wrap break-words min-w-[150px]">
                            {c.type === 'image' && rawVal ? 
                              <img src={getImageUrl(rawVal)} className="h-10 w-10 object-contain mx-auto rounded" alt="img" /> 
                              : highlightText(String(rawVal || ''), deferredSearchQuery)
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={exportColumns.length + 1} className="p-4 text-center text-gray-500 font-medium">
                        No data matches your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mt-4 pt-4 border-t sticky bottom-0 bg-white z-10 pb-2 shrink-0">
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md">
                {selectedRowIds.size > 0 ? `${selectedRowIds.size} rows selected` : "No selection (Will export all filtered rows)"}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onBack} className="flex items-center gap-2">
                  <ArrowLeft size={16} /> Back to Active Page
                </Button>
                <Button variant="red" onClick={handleClearData}>Clear Data</Button>
                <Button 
                  variant="dark" 
                  onClick={handleExport} 
                  className="flex items-center gap-2"
                  disabled={exportColumns.length === 0}
                >
                  <FileSpreadsheet size={16} /> Download Excel
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
});
