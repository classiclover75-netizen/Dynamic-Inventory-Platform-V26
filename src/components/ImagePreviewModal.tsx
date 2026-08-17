import React, { useState, useEffect, useRef } from 'react';
import { useModalLayer } from '../lib/modalStack';
import { Button, Input } from './ui';
import { Column, RowData } from '../types';
import { useToast } from './ToastProvider';
import { Edit, RefreshCw, X, ArrowLeft, ZoomIn, ZoomOut, RotateCcw, Trash2 } from 'lucide-react';
import { CopyPopupNotification } from './CopyPopupNotification';
import { parseMultiSource } from '../lib/appUtils';
import { isRetired, sumActive, splitActiveRetired } from '../lib/sourceArchiveUtils';

export const ImagePreviewModal = React.memo(({

  isOpen,
  onClose,
  onBack,
  row,
  imageColKey,
  columns,
  rowIndex,
  onEditRow,
  onReplaceImage,
  onDeleteImage,
  activePopupId,
  setActivePopupId,
  activeAnchor,
  setActiveAnchor,
  pageName,
  onCopy,
  getImageUrl,
  actionsDisabled = false
}: {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  row: RowData | null;
  imageColKey: string;
  columns: Column[];
  rowIndex: number;
  onEditRow: () => void;
  onReplaceImage: (newImage: any, pageName: string) => void;
  onDeleteImage: (rowId: string, imageKey: string, pageName: string) => void;
  activePopupId: string | null;
  setActivePopupId: (id: string | null) => void;
  activeAnchor: HTMLElement | null;
  setActiveAnchor: (el: HTMLElement | null) => void;
  pageName: string;
  onCopy?: (item: string, colKey: string, pageName: string) => void;
  getImageUrl: (val: any) => string;
  actionsDisabled?: boolean;
}) => {
  const [replaceMode, setReplaceMode] = useState<'url' | 'file'>('url');
  const [replaceUrl, setReplaceUrl] = useState('');
  const [showReplacePanel, setShowReplacePanel] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { toast } = useToast();

  // Zoom and Pan State
  const zIndexVal = useModalLayer(isOpen);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const [actualSize, setActualSize] = useState<{ loading: boolean, size: number | null, error: boolean }>({ loading: false, size: null, error: false });
  const [imageUsage, setImageUsage] = useState<{ loading: boolean, count: number, rows: any[], error: boolean } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, row, imageColKey]);

  useEffect(() => {
    if (!isOpen || !row) {
      setActualSize({ loading: false, size: null, error: false });
      return;
    }
    const rawVal = row[imageColKey];
    let reference = '';
    if (typeof rawVal === 'object' && rawVal !== null && typeof rawVal.data === 'string') {
      reference = rawVal.data;
    } else if (typeof rawVal === 'string') {
      reference = rawVal;
    }

    if (!reference) {
      setActualSize({ loading: false, size: null, error: false });
      setImageUsage(null);
      return;
    }

    const isExternalUrl = reference.startsWith('http://') || reference.startsWith('https://');

    if (!isExternalUrl) {
      setImageUsage({ loading: true, count: 0, rows: [], error: false });
      fetch(`/api/image-usage?filename=${encodeURIComponent(reference)}`)
        .then(res => {
          if (!res.ok) throw new Error('Failed');
          return res.json();
        })
        .then(data => {
          const currentRawVal = row[imageColKey];
          let currentRef = '';
          if (typeof currentRawVal === 'object' && currentRawVal !== null && typeof currentRawVal.data === 'string') {
            currentRef = currentRawVal.data;
          } else if (typeof currentRawVal === 'string') {
            currentRef = currentRawVal;
          }
          if (currentRef !== reference) return;
          setImageUsage({ loading: false, count: data.count, rows: data.rows || [], error: false });
        })
        .catch(err => {
          console.error("Failed to fetch image usage:", err);
          setImageUsage({ loading: false, count: 0, rows: [], error: true });
        });
    } else {
      setImageUsage(null);
    }

    setActualSize({ loading: true, size: null, error: false });

    fetch(`/api/local-image-size?filename=${encodeURIComponent(reference)}`)
      .then(res => res.json())
      .then(data => {
        const currentRawVal = row[imageColKey];
        let currentRef = '';
        if (typeof currentRawVal === 'object' && currentRawVal !== null && typeof currentRawVal.data === 'string') {
          currentRef = currentRawVal.data;
        } else if (typeof currentRawVal === 'string') {
          currentRef = currentRawVal;
        }
        if (currentRef !== reference) return;

        if (data.ok && typeof data.sizeBytes === 'number') {
          setActualSize({ loading: false, size: data.sizeBytes, error: false });
        } else {
          setActualSize({ loading: false, size: null, error: true });
        }
      })
      .catch(() => {
        const currentRawVal = row[imageColKey];
        let currentRef = '';
        if (typeof currentRawVal === 'object' && currentRawVal !== null && typeof currentRawVal.data === 'string') {
          currentRef = currentRawVal.data;
        } else if (typeof currentRawVal === 'string') {
          currentRef = currentRawVal;
        }
        if (currentRef !== reference) return;

        setActualSize({ loading: false, size: null, error: true });
      });
  }, [isOpen, row, imageColKey]);

  if (!isOpen || !row) return null;

  const rawImgVal = row[imageColKey];
  const metadata = typeof rawImgVal === 'object' && rawImgVal !== null ? rawImgVal : null;

  let reference = '';
  if (typeof rawImgVal === 'object' && rawImgVal !== null && typeof rawImgVal.data === 'string') {
    reference = rawImgVal.data;
  } else if (typeof rawImgVal === 'string') {
    reference = rawImgVal;
  }

  const isExternalUrl = reference.startsWith('http://') || reference.startsWith('https://');

  let showCompression = false;
  let compressionPercent = 0;
  if (metadata && typeof metadata.rawSize === 'number' && typeof metadata.compressedSize === 'number' && metadata.rawSize > 0 && metadata.compressedSize > 0 && metadata.rawSize !== metadata.compressedSize) {
    compressionPercent = Math.round((1 - metadata.compressedSize / metadata.rawSize) * 100);
    if (compressionPercent > 0) {
      showCompression = true;
    }
  }

  const formatSize = (bytes: number | undefined | null) => {
    if (bytes === 0) return '—';
    if (!bytes) return '—';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatActualSize = (bytes: number | null) => {
    if (bytes === null) return '';
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    return Math.round(bytes / 1024) + ' KB';
  };

  const renderUsageWarning = (actionType: 'delete' | 'replace') => {
    if (isExternalUrl || !imageUsage || imageUsage.loading || imageUsage.error) {
      if (actionType === 'delete') return <div className="text-xs font-bold text-red-700">Are you sure you want to remove this image?</div>;
      return null;
    }
    if (imageUsage.count <= 1) {
      return <div className="text-xs font-bold text-red-700">The image is not used anywhere else and will be permanently deleted. Are you sure you want to continue?</div>;
    }
    
    const otherRows = imageUsage.rows.filter(r => !(r.rowId === row.id && r.pageName === pageName));
    if (otherRows.length === 0) {
       return <div className="text-xs font-bold text-red-700">The image is not used anywhere else and will be permanently deleted. Are you sure you want to continue?</div>;
    }

    return (
      <div className="text-xs font-bold text-amber-700 flex flex-col gap-1">
        <span>This image will be removed from this row but the file will be kept because other rows still use it. Used by:</span>
        <ul className="m-0 pl-4 font-normal">
          {otherRows.map((r, i) => (
            <li key={i}>{r.pageName} - row {r.rowNumber}</li>
          ))}
        </ul>
        <span className="font-bold mt-1">Are you sure you want to continue?</span>
      </div>
    );
  };

  const handleApplyReplace = () => {
    if (replaceMode === 'url') {
      if (!replaceUrl.trim()) return toast('Please enter image URL');
      // For URL we don't have raw size easily, so we'll just use the compressed size for both
      const dummySize = Math.round((replaceUrl.length * 3) / 4);
      onReplaceImage({
        data: replaceUrl.trim(),
        rawSize: dummySize,
        compressedSize: dummySize
      } as any, pageName);
      setShowReplacePanel(false);
      setReplaceUrl('');
    } else {
      const fileInput = document.getElementById('previewReplaceFile') as HTMLInputElement;
      if (!fileInput || !fileInput.files || !fileInput.files[0]) return toast('Please choose an image file');
      
      const file = fileInput.files[0];
      const rawSize = file.size;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        // Simple compression simulation for replace (ideally we'd use the same utility)
        const compressedSize = Math.round((dataUrl.length * 3) / 4); 
        onReplaceImage({
          data: dataUrl,
          rawSize: rawSize,
          compressedSize: compressedSize
        } as any, pageName);
        setShowReplacePanel(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.5, 10));
  const handleZoomOut = () => {
    const newScale = Math.max(1, scale - 0.5);
    setScale(newScale);
    if (newScale === 1) {
      setPosition({ x: 0, y: 0 });
    }
  };
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const newScale = Math.min(Math.max(scale + delta, 1), 10);
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Calculate point relative to center
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const mouseX = (x - centerX - position.x) / scale;
      const mouseY = (y - centerY - position.y) / scale;
      
      const newX = x - centerX - mouseX * newScale;
      const newY = y - centerY - mouseY * newScale;
      
      setScale(newScale);
      if (newScale === 1) {
        setPosition({ x: 0, y: 0 });
      } else {
        setPosition({ x: newX, y: newY });
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-3.5" style={{ zIndex: zIndexVal }}>
      <div 
        className="bg-white rounded-lg border border-[#cfd8dc] flex flex-col lg:flex-row w-[95vw] max-w-[1200px] h-[90vh] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          ref={containerRef}
          className="w-full h-[45vh] lg:h-full lg:flex-1 min-w-0 bg-black relative flex flex-col overflow-hidden"
          onWheel={handleWheel}
        >
          {/* Zoom Controls Overlay */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm p-1.5 rounded-full border border-white/20 z-10">
            <button onClick={handleZoomOut} className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors border-0 bg-transparent cursor-pointer" title="Zoom Out">
              <ZoomOut size={18} />
            </button>
            <div className="text-white text-[11px] font-bold min-w-[40px] text-center">
              {Math.round(scale * 100)}%
            </div>
            <button onClick={handleZoomIn} className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors border-0 bg-transparent cursor-pointer" title="Zoom In">
              <ZoomIn size={18} />
            </button>
            <div className="w-px h-4 bg-white/20 mx-1" />
            <button onClick={handleReset} className="p-1.5 text-white hover:bg-white/20 rounded-full transition-colors border-0 bg-transparent cursor-pointer" title="Reset">
              <RotateCcw size={18} />
            </button>
          </div>

          <div 
            className="w-full h-full flex justify-center items-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img 
              src={getImageUrl(rawImgVal)} 
              alt="Preview" 
              className="max-w-full max-h-full object-contain transition-transform duration-100 ease-out select-none" 
              style={{ 
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
              draggable={false}
            />
          </div>
        </div>
        <div className="w-full lg:w-[350px] shrink-0 bg-[#f8fafb] border-t lg:border-t-0 lg:border-l border-[#e0e6ea] flex flex-col flex-1 lg:flex-none overflow-y-auto p-3.5 gap-2.5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {onBack && (
                <button className="bg-transparent border-0 text-[18px] cursor-pointer text-gray-600 hover:text-gray-900 flex items-center" onClick={onBack} title="Go Back">
                  <ArrowLeft size={20} />
                </button>
              )}
              <h3 className="m-0 text-[#2b579a] text-lg font-bold flex items-center gap-2">🖼️ Image Preview</h3>
            </div>
            <button className="bg-transparent border-0 text-[22px] cursor-pointer text-gray-600 hover:text-gray-900" onClick={onClose} title="Close">
              <X size={24} />
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!isConfirmingDelete ? (
              <>
                <Button variant="blue" onClick={onEditRow} disabled={actionsDisabled} title={actionsDisabled ? "Not available from overview" : undefined}><Edit size={14} /> Edit Row</Button>
                <Button variant="green" onClick={() => setShowReplacePanel(!showReplacePanel)} disabled={actionsDisabled} title={actionsDisabled ? "Not available from overview" : undefined}><RefreshCw size={14} /> Replace Image</Button>
                <Button variant="red" onClick={() => setIsConfirmingDelete(true)} disabled={actionsDisabled} title={actionsDisabled ? "Not available from overview" : undefined}><Trash2 size={14} /> Delete Image</Button>
              </>
            ) : (
              <div className="flex flex-col gap-2 w-full bg-red-50 p-3 rounded-md border border-red-200">
                {renderUsageWarning('delete')}
                <div className="flex gap-2">
                  <Button 
                    variant="red" 
                    onClick={() => {
                      onDeleteImage(row!.id, imageColKey, pageName);
                      onClose();
                      setIsConfirmingDelete(false);
                    }}
                    className="flex-1"
                  >
                    Yes, Remove
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsConfirmingDelete(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
          
          {showReplacePanel && (
            <div className="border border-[#d7dde1] rounded-md p-2 bg-white">
              <div className="flex gap-3 text-xs mb-1.5 flex-wrap">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="previewReplaceSource" value="url" checked={replaceMode === 'url'} onChange={() => setReplaceMode('url')} /> URL
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="previewReplaceSource" value="file" checked={replaceMode === 'file'} onChange={() => setReplaceMode('file')} /> File
                </label>
              </div>
              {replaceMode === 'url' ? (
                <Input value={replaceUrl} onChange={e => setReplaceUrl(e.target.value)} placeholder="https://example.com/image.jpg" className="mb-1.5" />
              ) : (
                <input id="previewReplaceFile" type="file" accept="image/*" className="mb-1.5 text-xs" />
              )}
              {renderUsageWarning('replace')}
              <div className="flex gap-2">
                <Button variant="green" onClick={handleApplyReplace}>Apply</Button>
                <Button variant="red" onClick={() => setShowReplacePanel(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="mt-2 space-y-2">
            <div className="border border-emerald-100 bg-emerald-50 rounded-md p-2 flex justify-between items-center">
              <div>
                <div className="text-[10px] font-bold text-emerald-600 uppercase">File Size</div>
                <div className="text-[12px] text-emerald-800">
                  {actualSize.loading ? 'Checking actual size...' : (actualSize.error || actualSize.size === null ? "Couldn't determine size" : formatActualSize(actualSize.size))}
                </div>
              </div>
            </div>
            {isExternalUrl ? (
              <div className="border border-blue-100 bg-blue-50 rounded-md p-2 flex items-center">
                <div className="text-[10px] font-bold text-blue-600 uppercase">External URL image</div>
              </div>
            ) : showCompression && metadata ? (
              <div className="border border-blue-100 bg-blue-50 rounded-md p-2">
                <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">Compression</div>
                <div className="text-[12px] text-blue-800">
                  Original {formatSize(metadata.rawSize)} &rarr; {formatSize(metadata.compressedSize)} ({compressionPercent}% smaller)
                </div>
              </div>
            ) : null}
            <div className="border border-[#e2e7ea] bg-white rounded-md p-2">
              <div className="text-[11px] font-bold text-[#607d8b] uppercase mb-1">Row No.</div>
              <div className="text-[13px] text-[#263238]">{rowIndex + 1}</div>
            </div>
            {columns.filter(c => c.key !== 'sr').map(col => {
              const rawVal = row[col.key];
              let displayVal: React.ReactNode = '-';
              
              if (col.type === 'text_with_copy_button') {
                const items = Array.isArray(rawVal) ? rawVal.map(v => String(v || '').trim()).filter(Boolean) : (String(rawVal || '').trim() ? [String(rawVal).trim()] : []);
                if (items.length) {
                  displayVal = (
                    <div className="flex flex-col gap-1">
                      {items.map((item, i) => {
                        const hideButton = item.startsWith('!');
                        const displayText = hideButton ? item.slice(1) : item;
                        const itemId = `preview-${col.key}-${i}`;
                        return (
                          <div key={i} className={`flex items-center justify-between gap-1.5 border border-[#d7e3f6] bg-[#f9fcff] rounded px-1.5 py-0.5 min-h-[25px] ${hideButton ? 'bg-gray-50 border-gray-100 opacity-80' : ''}`}>
                            <span className="text-[13px]">{displayText}</span>
                            {!hideButton && (
                              <>
                                <button 
                                  className="border-0 rounded bg-[#2b579a] text-white px-1.5 py-0.5 text-[11px] font-bold cursor-pointer shrink-0"
                                  onClick={(e) => {
                                    const target = e.currentTarget;
                                    navigator.clipboard.writeText(displayText).then(() => {
                                      setActivePopupId(itemId);
                                      setActiveAnchor(target);
                                      if (onCopy) {
                                        onCopy(displayText, col.key, pageName);
                                      }
                                    });
                                  }}
                                >
                                  Copy
                                </button>
                                <CopyPopupNotification 
                                  text={displayText} 
                                  columnName={col.name || col.key} 
                                  columnNumber={rowIndex + 1} 
                                  isActive={activePopupId === itemId}
                                  anchorElement={activeAnchor}
                                  onClose={() => setActivePopupId(null)}
                                />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
              } else if (col.type === 'image') {
                displayVal = rawVal ? 'Image attached' : 'No image';
              } else if (col.type === 'sale_tracker' || col.key === 'total_qty') {
                const parsed = parseMultiSource(rawVal);
                if (parsed.length === 0) {
                  displayVal = '-';
                } else {
                  const lines = parsed.map((s: any) => `${s.source}${isRetired(s) ? ' (Retired)' : ''}: ${s.qty}`);
                  const { active } = splitActiveRetired(parsed);
                  if (active.length >= 2) {
                    lines.push(`Total: ${sumActive(parsed)}`);
                  }
                  displayVal = lines.join('\n');
                }
              } else if (col.key === 'remaining_qty') {
                const totalSources = parseMultiSource(row.total_qty);
                const saleCols = columns.filter(c => c.type === 'sale_tracker');
                
                const remainingSources = totalSources.map((ts: any) => {
                  let totalSaleForSource = 0;
                  saleCols.forEach(sc => {
                    const sales = parseMultiSource(row[sc.key]);
                    const saleEntry = sales.find((s: any) => s.source === ts.source);
                    if (saleEntry) totalSaleForSource += parseFloat(saleEntry.qty) || 0;
                  });
                  return {
                    source: ts.source,
                    remaining: (parseFloat(ts.qty) || 0) - totalSaleForSource,
                    isRetired: isRetired(ts)
                  };
                });

                if (remainingSources.length === 0) {
                  displayVal = '-';
                } else {
                  const lines = remainingSources.map((s: any) => `${s.source}${s.isRetired ? ' (Retired)' : ''}: ${s.remaining}`);
                  const activeSources = remainingSources.filter((s: any) => !s.isRetired);
                  if (activeSources.length >= 2) {
                    const activeSum = activeSources.reduce((sum: number, s: any) => sum + s.remaining, 0);
                    lines.push(`Total: ${activeSum}`);
                  }
                  displayVal = lines.join('\n');
                }
              } else if (Array.isArray(rawVal)) {
                displayVal = rawVal.join('\n') || '-';
              } else {
                displayVal = String(rawVal ?? '').trim() || '-';
              }

              return (
                <div key={col.key} className="border border-[#e2e7ea] bg-white rounded-md p-2">
                  <div className="text-[11px] font-bold text-[#607d8b] uppercase mb-1">{col.name || col.key}</div>
                  <div className="text-[13px] text-[#263238] whitespace-pre-line break-words">{displayVal}</div>
                </div>
              );
            })}
          </div>
          {onBack && (
            <div className="mt-auto flex justify-end sticky bottom-0 bg-[#f8fafb] py-3 border-t border-[#e0e6ea] z-10 -mb-3.5">
              <Button variant="outline" onClick={onBack}>Back to Active Page Settings</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
