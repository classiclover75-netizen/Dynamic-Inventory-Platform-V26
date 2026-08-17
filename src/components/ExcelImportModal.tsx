import React, { useState, useMemo, useRef, useDeferredValue } from 'react';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { Modal, Button, Input } from './ui';
import { Column, RowData } from '../types';
import { Download, Search, FileUp, ArrowLeft } from 'lucide-react';

const decodeHtmlEntities = (text: string) => {
  return String(text)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
};

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBack: () => void;
  onImport: (newRows: RowData[], newColumns: Column[]) => void;
  existingColumns: Column[];
  existingRows: RowData[];
  importRows: any[];
  setImportRows: (rows: any[]) => void;
  headers: string[];
  setHeaders: (headers: string[]) => void;
  getImageUrl: (val: any) => string;
}

export const ExcelImportModal = React.memo(({ isOpen, onClose, onBack, onImport, existingColumns, existingRows, importRows, setImportRows, headers, setHeaders, getImageUrl }: ExcelImportModalProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trimmedCellsCount, setTrimmedCellsCount] = useState(0);
  const [importSummary, setImportSummary] = useState<{ imported: number; duplicates: number; trimmed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Removed toast

  const compressImage = (base64Str: string, maxWidth = 1200, quality = 0.7): Promise<string> => {
    return new Promise((resolve) => {
      // Safeguard 1: Skip small images (under maxWidth and under ~300kb)
      const approxSize = base64Str.length * 0.75;
      const isSmallSize = approxSize < 300 * 1024;

      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        if (img.width <= maxWidth && isSmallSize) {
          return resolve(base64Str);
        }

        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64Str);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const [loadingStep, setLoadingStep] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setProgress(10);
    setLoadingStep('Parsing ZIP structure...');
    setImportRows([]);
    setSelectedRowIds(new Set());
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      
      setProgress(30);
      setLoadingStep('Reading strings and structures...');

      // 1. Shared Strings
      let sharedStrings: string[] = [];
      const sharedStringsEntry = zip.file('xl/sharedStrings.xml');
      if (sharedStringsEntry) {
          const ssXml = await sharedStringsEntry.async('string');
          const siRegex = /<si(?:>|\s+[^>]*>)(.*?)<\/si>/gs;
          const tRegex = /<t(?:>|\s+[^>]*>)(.*?)<\/t>/gs;
          let siMatch;
          while ((siMatch = siRegex.exec(ssXml)) !== null) {
              let str = '';
              let tMatch;
              while ((tMatch = tRegex.exec(siMatch[1])) !== null) {
                  str += decodeHtmlEntities(tMatch[1]);
              }
              sharedStrings.push(str);
          }
      }

      // 2. Find Drawings to Media Relations
      const drawingRels: Record<string, Record<string, string>> = {};
      const relsFiles = Object.keys(zip.files).filter(k => k.startsWith('xl/drawings/_rels/'));
      for (const relsPath of relsFiles) {
          const dName = relsPath.split('/').pop()?.replace('.rels', '') || '';
          const xml = await zip.file(relsPath)?.async('string') || '';
          const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"/g;
          let m;
          while((m = relRegex.exec(xml)) !== null) {
              let target = m[2];
              if (target.startsWith('../')) target = target.replace('../', 'xl/');
              else if (target.startsWith('/')) target = target.substring(1);
              else target = 'xl/drawings/' + target; 
              
              if (!drawingRels[dName]) drawingRels[dName] = {};
              drawingRels[dName][m[1]] = target;
          }
      }

      // 3. Map Image Anchors
      const imageAnchors: { row: number, col: number, mediaPath: string }[] = [];
      const drawingFiles = Object.keys(zip.files).filter(k => k.startsWith('xl/drawings/') && k.endsWith('.xml'));
      for (const drawingPath of drawingFiles) {
          const dName = drawingPath.split('/').pop() || '';
          const xml = await zip.file(drawingPath)?.async('string') || '';
          const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>.*?<xdr:from>.*?<xdr:col>(\d+)<\/xdr:col>.*?<xdr:row>(\d+)<\/xdr:row>.*?<\/xdr:from>.*?<a:blip[^>]*?r:embed="([^"]+)"/gs;
          let match;
          while ((match = anchorRegex.exec(xml)) !== null) {
              const col = parseInt(match[1], 10);
              const row = parseInt(match[2], 10); 
              const rId = match[3];
              const mediaPath = drawingRels[dName]?.[rId];
              if (mediaPath) {
                  imageAnchors.push({ row: row + 1, col: col + 1, mediaPath }); 
              }
          }
      }

      setProgress(40);
      setLoadingStep('Parsing dataset, please remain patient... (Large files take a moment)');

      // 4. Parse Worksheet
      const sheetFiles = Object.keys(zip.files).filter(k => k.startsWith('xl/worksheets/') && k.endsWith('.xml') && !k.includes('_rels'));
      if (sheetFiles.length === 0) throw new Error("No worksheets found");
      const sheetXml = await zip.file(sheetFiles[0])?.async('string') || '';

      const colToNumber = (letters: string) => {
          let sum = 0;
          for (let i = 0; i < letters.length; i++) {
              sum *= 26;
              sum += (letters.toUpperCase().charCodeAt(i) - 64);
          }
          return sum;
      };

      const newHeaders: string[] = [];
      const rowsMap = new Map<number, any>();
      const rowsArray: any[] = [];
      let trimmedCount = 0;

      const rowRegex = /<row\s+[^>]*r="(\d+)"[^>]*?(?:\/>|>(.*?)<\/row>)/gs;
      const cellRegex = /<c\s+[^>]*r="([A-Z]+)(\d+)"([^>]*)(?:\/>|>(.*?)<\/c>)/g;
      const vRegex = /<v>(.*?)<\/v>/;
      const isRegex = /<is>.*?<t(?:>|\s+[^>]*>)(.*?)<\/t>.*?<\/is>/si;
      const tAttrRegex = /t="([^"]+)"/;

      let rMatch;
      let loopCount = 0;
      while ((rMatch = rowRegex.exec(sheetXml)) !== null) {
          loopCount++;
          if (loopCount % 500 === 0) {
              await new Promise(resolve => setTimeout(resolve, 0));
          }
          const rowNum = parseInt(rMatch[1], 10);
          const rowContent = rMatch[2];
          if (!rowContent) continue; 
          
          const rowData: any = { _id: "import_" + Date.now() + "_" + rowNum };
          let hasData = false;
          let isHeader = (rowNum === 1);
          
          cellRegex.lastIndex = 0;
          let cMatch;
          while ((cMatch = cellRegex.exec(rowContent)) !== null) {
              const colLetter = cMatch[1];
              const attrs = cMatch[3];
              const cellContent = cMatch[4];
              if (!cellContent) continue;
              
              const colIdx = colToNumber(colLetter); 
              const tAttr = tAttrRegex.exec(attrs)?.[1];
              let val = '';
              
              if (tAttr === 's') { 
                  const vMatch = vRegex.exec(cellContent);
                  if (vMatch) {
                     val = sharedStrings[parseInt(vMatch[1], 10)] || '';
                  }
              } else if (tAttr === 'inlineStr') {
                  const isMatch = isRegex.exec(cellContent);
                  if (isMatch) val = decodeHtmlEntities(isMatch[1]);
              } else if (tAttr === 'b') {
                  const vMatch = vRegex.exec(cellContent);
                  if (vMatch) val = vMatch[1] === '1' ? 'TRUE' : 'FALSE';
              } else {
                  const vMatch = vRegex.exec(cellContent);
                  if (vMatch) val = vMatch[1];
              }
              
              if (isHeader) {
                  newHeaders[colIdx] = val.trim();
              } else {
                  const header = newHeaders[colIdx];
                  if (header) {
                      const trimmed = val.trim();
                      if (val && trimmed !== val) trimmedCount++;
                      rowData[header] = val ? trimmed : val;
                      hasData = true;
                  }
              }
          }
          
          if (!isHeader && hasData) {
              rowsArray.push(rowData);
              rowsMap.set(rowNum, rowData);
          }
      }

      setProgress(50);
      setLoadingStep('Uploading & extracting media files to backend server...');

      // 5. Build Image Uploads via Bulk Endpoint
      const uploadedMap = new Map<string, Record<string, string>>();
      
      if (imageAnchors.length > 0) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('safeId', 'import_' + Date.now());
        
        let mediaMap: Record<string, string> = {};
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/upload-excel-media-bulk', true);
            
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percent = Math.floor((e.loaded / e.total) * 30);
                setProgress(50 + percent);
              }
            };
            
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const data = JSON.parse(xhr.responseText);
                  if (data.mediaMap) mediaMap = data.mediaMap;
                  setProgress(80);
                  resolve();
                } catch (err) {
                  console.error("Parse fail", err);
                  resolve();
                }
              } else {
                console.error("Bulk media upload failed:", xhr.statusText);
                resolve();
              }
            };
            
            xhr.onerror = () => {
              console.error("Network error", xhr.statusText);
              resolve();
            };
            
            xhr.send(formData);
          });
        } catch (err) {
          console.error("Failed to upload bulk media", err);
        }

        for (const anchor of imageAnchors) {
            const rowData = rowsMap.get(anchor.row);
            const header = newHeaders[anchor.col];
            if (rowData && header && mediaMap[anchor.mediaPath]) {
                if (!uploadedMap.has(rowData._id)) uploadedMap.set(rowData._id, {});
                uploadedMap.get(rowData._id)![header] = mediaMap[anchor.mediaPath];
            }
        }
        
        setProgress(95);
      }

      for (const row of rowsArray) {
         const uploads = uploadedMap.get(row._id);
         if (uploads) {
           for (const key in uploads) {
              row[key] = uploads[key];
           }
         }
      }

      setHeaders(newHeaders.filter(Boolean));
      setImportRows(rowsArray);
      setTrimmedCellsCount(trimmedCount);
      setProgress(100);
      setTimeout(() => setIsProcessing(false), 400);

    } catch (err) {
      console.error("Worker Creation Error / Extraction Error:", err);
      alert("Error parsing Excel file. Check format.");
      setIsProcessing(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Template');
    
    const headerRow = ws.addRow(existingColumns.map(c => c.name));
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F3F3' }
      };
      cell.font = { bold: true, color: { argb: 'FF2F3D49' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Inventory_Template.xlsx";
    a.click();
    window.URL.revokeObjectURL(url);
  };

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

  const finalRows = useMemo(() => {
    if (!deferredSearchQuery.trim()) return importRows;
    const activeQueries = [deferredSearchQuery.trim()].filter(Boolean);
    
    return importRows.filter(r => {
      const colData = Object.entries(r).map(([key, val]) => {
        if (key === "_id") return null;
        const strVal = Array.isArray(val) ? val.join(" ") : val !== null && val !== undefined ? String(val) : "";
        const cleanVal = strVal.replace(/<[^>]*>/g, "").replace(/<br\s*\/?>/gi, " ").replace(/&nbsp;/gi, " ").toLowerCase();
        return { name: key.toLowerCase(), val: cleanVal };
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
  }, [importRows, deferredSearchQuery]);

  const handleConfirm = async () => {
    setIsImporting(true);
    setProgress(0);

    // Give UI time to update
    await new Promise(resolve => setTimeout(resolve, 50));

    const newColumns: Column[] = [];
    headers.forEach(h => {
      const exists = existingColumns.some(c => c.name.toLowerCase() === h.toLowerCase());
      if (!exists) {
        newColumns.push({
          key: h.toLowerCase().replace(/\s+/g, '_'),
          name: h,
          type: h.includes('Pics') ? 'image' : 'text',
          locked: false,
          movable: true
        });
      }
    });

    setProgress(20);
    await new Promise(resolve => setTimeout(resolve, 50));

    const rowsToProcess = selectedRowIds.size > 0 ? finalRows.filter(r => selectedRowIds.has(r._id)) : finalRows;
    const totalRows = rowsToProcess.length;
    const formattedRows: RowData[] = [];
    let ignoredDuplicates = 0;
    
    // Process rows in chunks to avoid freezing the UI
    const chunkSize = 50; 
    for (let i = 0; i < totalRows; i += chunkSize) {
      const chunk = rowsToProcess.slice(i, i + chunkSize);
      const processedChunk: RowData[] = [];
      
      for (const r of chunk) {
        const row: RowData = { id: `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
        const rowValuesForComparison: Record<string, any> = {};

        for (const h of headers) {
          const col = existingColumns.find(c => c.name === h) || newColumns.find(c => c.name === h);
          if (col) {
            let val = r[h];
            if (col.type === 'image' && typeof val === 'string' && val.startsWith('data:image')) {
              val = await compressImage(val);
            } else if (col.type === 'text_with_copy_button' && typeof val === 'string') {
              val = val.split(/\r?\n/).map((part: string) => part.trim());
            }
            row[col.key] = val;
            if (col.key !== 'sr') {
              rowValuesForComparison[col.key] = val;
            }
          }
        }

        // Safeguard 3: Exact Duplicate Detection
        const isDuplicate = existingRows.some(existingRow => {
          return Object.keys(rowValuesForComparison).every(key => {
            const existingVal = existingRow[key] === undefined ? '' : String(existingRow[key]);
            const newVal = rowValuesForComparison[key] === undefined ? '' : String(rowValuesForComparison[key]);
            return existingVal === newVal;
          });
        });

        if (isDuplicate) {
          ignoredDuplicates++;
          continue;
        }

        processedChunk.push(row);
      }
      
      formattedRows.push(...processedChunk);
      
      // Update progress (from 20% to 90%)
      const currentProgress = 20 + Math.floor(((i + chunk.length) / totalRows) * 70);
      setProgress(currentProgress);
      
      // Yield to main thread
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setProgress(95);
    await new Promise(resolve => setTimeout(resolve, 50));

    onImport(formattedRows, newColumns);
    
    setProgress(100);
    setImportSummary({
      imported: formattedRows.length,
      duplicates: ignoredDuplicates,
      trimmed: trimmedCellsCount
    });
    setIsImporting(false);
    // Do NOT call onClose() here. Wait for the user to click OK.
  };

  const handleBack = () => {
    onBack();
  };

  const handleClearData = () => {
    setImportRows([]);
    setSelectedRowIds(new Set());
    setHeaders([]);
    setSearchQuery('');
    setTrimmedCellsCount(0);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (importSummary) {
    return (
      <Modal 
        isOpen={isOpen} 
        onClose={() => { setImportSummary(null); onClose(); }} 
        title="✅ Import Report" 
        width="min(400px, 90vw)"
      >
        <div className="p-6 flex flex-col items-center text-[#333]">
          <div className="text-green-600 text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold mb-4 text-center">Import Completed!</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 w-full text-sm space-y-2 mb-6 shadow-sm">
            <div className="flex justify-between border-b pb-1">
              <span className="font-semibold text-gray-600">Rows Imported:</span>
              <span className="font-bold text-green-700">{importSummary.imported}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="font-semibold text-gray-600">Exact Duplicates Ignored:</span>
              <span className="font-bold text-orange-600">{importSummary.duplicates}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-gray-600">Cells Cleaned (Spaces Trimmed):</span>
              <span className="font-bold text-blue-600">{importSummary.trimmed}</span>
            </div>
          </div>
          <Button 
            variant="green" 
            className="w-full py-2 text-base"
            onClick={() => {
              setImportSummary(null);
              setImportRows([]);
              setSearchQuery('');
              onClose();
            }}
          >
            OK, Close
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📥 Excel Import Preview" width="95vw" noScroll={true}>
      <div className="flex flex-col h-[85vh] p-4">
        <div className="flex justify-between items-center mb-4 gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 text-gray-400" size={16} />
            <Input 
              className="pl-8 w-full" 
              placeholder="Filter imported data..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={downloadTemplate} className="flex items-center gap-2">
            <Download size={14} /> Download Template
          </Button>
          <input type="file" id="xl-input-file" hidden onChange={handleFileChange} accept=".xlsx" ref={fileInputRef} />
          <Button variant="dark" onClick={() => document.getElementById('xl-input-file')?.click()} className="flex items-center gap-2" disabled={isProcessing || isImporting}>
            <FileUp size={14} /> {isProcessing && !isImporting ? "Loading..." : "Select Excel File"}
          </Button>
        </div>

        {(isProcessing || isImporting) && (
          <div className="mb-4 shrink-0">
            <div className="text-xs text-gray-500 mb-1 flex justify-between">
              <span>{isImporting ? `Importing Data... ${progress}%` : `${loadingStep} ${progress}%`}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto border rounded-md relative bg-white">
          <table className="w-full text-[13px] border-collapse">
            <thead className="sticky top-0 bg-gray-100 z-10 shadow-sm">
              <tr>
                <th className="p-2 border w-10 text-center">
                  <input type="checkbox" className="cursor-pointer" onChange={(e) => {
                    if (e.target.checked) setSelectedRowIds(new Set(finalRows.map(r => r._id)));
                    else setSelectedRowIds(new Set());
                  }} />
                </th>
                {headers.map((h, i) => {
                  const existingCol = existingColumns.find(c => c.name.toLowerCase() === h.toLowerCase());
                  const isNew = !existingCol;
                  return (
                    <th key={h} className={`p-2 border text-left font-bold ${isNew ? 'bg-orange-50 text-orange-700' : 'text-gray-700'}`}>
                      <div className="flex items-center gap-1">
                        {i + 1}. {h} {existingCol?.locked && '🔒'}
                        {isNew && <span className="text-[9px] block font-normal ml-1">(New Column)</span>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {importRows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length + 1} className="p-10 text-center text-gray-400 font-medium">
                    No data to preview. Please upload an Excel file.
                  </td>
                </tr>
              ) : (
                finalRows.slice(0, 100).map((row, i) => (
                  <tr key={i} className={`transition-colors ${selectedRowIds.has(row._id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                    <td className="p-2 border text-center">
                      <input 
                        type="checkbox" 
                        className="cursor-pointer"
                        checked={selectedRowIds.has(row._id)} 
                        onChange={() => {
                          const next = new Set(selectedRowIds);
                          if (next.has(row._id)) next.delete(row._id);
                          else next.add(row._id);
                          setSelectedRowIds(next);
                        }} 
                      />
                    </td>
                    {headers.map(h => (
                      <td key={h} className="p-2 border whitespace-pre-wrap break-words min-w-[150px]">
                        {String(row[h]).startsWith('data:image') || (row[h] && typeof row[h] === 'string' && /\.(jpg|jpeg|png|gif|webp)$/i.test(row[h])) ? 
                          <img src={getImageUrl(row[h])} className="h-10 w-10 object-contain mx-auto rounded shadow-sm" alt="excel-img" /> 
                          : highlightText(String(row[h] || ''), deferredSearchQuery)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-4 pt-4 border-t sticky bottom-0 bg-white z-10 pb-2 shrink-0">
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md text-center max-w-fit">
              {selectedRowIds.size > 0 ? `${selectedRowIds.size} rows selected` : `No selection (Will import all ${finalRows.length} filtered rows)`}
            </span>
            {finalRows.length > 100 && <span className="text-gray-400">Showing first 100 rows in preview.</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBack} className="flex items-center gap-2" disabled={isProcessing || isImporting}>
              <ArrowLeft size={14} /> Back to Active Page
            </Button>
            <Button variant="red" onClick={handleClearData} disabled={isProcessing || isImporting}>Clear Data</Button>
            <Button 
              variant="green" 
              onClick={handleConfirm} 
              disabled={finalRows.length === 0 || isProcessing || isImporting}
            >
              {isImporting ? "Importing..." : `Confirm & Import ${selectedRowIds.size > 0 ? selectedRowIds.size : finalRows.length} Rows`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
});
