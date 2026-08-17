import { isLocked, toggleLockInTotalQty } from "../lib/sourceLockUtils";
import { isRetired, setRetired, splitActiveRetired } from '../lib/sourceArchiveUtils';
import React, { useState, useEffect, useRef } from "react";
import { Button, Input, Modal } from "./ui";
import { Column, RowData } from "../types";
import { useToast } from "./ToastProvider";
import {
  Trash2,
  Plus,
  Wand2,
  Lock,
  RotateCcw,
  Undo2,
  X,
  Copy,
  Layers3,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { reorderSources, formatSourceNumber } from "../lib/multiSourceHelpers";
import { GripVertical } from "lucide-react";
import { RichDropdownSelect } from "./RichDropdownSelect";
import { SourceAutocompleteInput, useSourceSuggestions } from "./SourceAutocompleteInput";
import { RetiredSourcesModal } from "./RetiredSourcesModal";
import { ColorPickerPopover } from "./ColorPickerPopover";
import { SourceColorChange, buildRowColorUpdates } from "../lib/sourceColorSync";
import { resolveChipRender } from "../lib/colorRender";
import { extractHue, generateRandomSourceColor, getNextAvailableHexColor } from "../lib/randomSourceColor";
import { getCreationTooltip } from "../lib/sourceTimestamp";

const RichTextEditor = ({
  value,
  onChange,
  placeholder,
  minHeight = "36px",
  className = "",
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}) => {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // CRITICAL FIX: Only update DOM from state if the user is NOT actively focused on this element.
    // This prevents React from forcefully resetting the caret (cursor) position upon sanitization.
    if (
      divRef.current &&
      divRef.current.innerHTML !== value &&
      document.activeElement !== divRef.current
    ) {
      divRef.current.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerHTML);
  };

  const handleBlur = () => {
    // Force sync the cleaned value back to the DOM when the user leaves the field
    if (divRef.current && divRef.current.innerHTML !== value) {
      divRef.current.innerHTML = value || "";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      range.deleteContents();

      const br = document.createElement("br");
      const zwsp = document.createTextNode("\u200B");
      const fragment = document.createDocumentFragment();
      fragment.appendChild(br);
      fragment.appendChild(zwsp);
      range.insertNode(fragment);

      // Move selection to after the ZWSP
      range.setStartAfter(zwsp);
      range.collapse(true);

      // Crucially, ensure the Selection/Range is moved OUTSIDE of any active preceding rich-text tags
      let parent = zwsp.parentElement;
      while (parent && parent !== divRef.current) {
        if (
          ["B", "I", "U", "S", "SPAN", "STRONG", "EM", "FONT"].includes(
            parent.tagName,
          )
        ) {
          parent.after(br, zwsp);
          range.setStartAfter(zwsp);
          range.collapse(true);
        }
        parent = parent.parentElement;
      }

      selection.removeAllRanges();
      selection.addRange(range);
      onChange(e.currentTarget.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const isPlainPaste = e.shiftKey || !html;

    if (!isPlainPaste) {
      document.execCommand("insertHTML", false, html);
    } else {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      selection.deleteFromDocument();
      const range = selection.getRangeAt(0);

      // Normalize: If we are at the end of a formatting tag, move out before inserting plain text
      // to prevent formatting bleed from the previous content.
      let container = range.startContainer;
      if (
        container.nodeType === Node.TEXT_NODE &&
        range.startOffset === (container.textContent?.length || 0)
      ) {
        let parent = container.parentElement;
        while (parent && parent !== divRef.current) {
          if (
            ["B", "I", "U", "S", "SPAN", "STRONG", "EM", "FONT"].includes(
              parent.tagName,
            )
          ) {
            range.setStartAfter(parent);
            range.collapse(true);
          }
          parent = parent.parentElement;
        }
      }

      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    onChange(e.currentTarget.innerHTML);
  };

  return (
    <div
      ref={divRef}
      contentEditable
      onInput={handleInput}
      onBlur={handleBlur}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
      className={`w-full border border-[#cfd8dc] rounded p-1.5 text-[13px] overflow-auto focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white ${className}`}
      style={{ minHeight }}
      data-placeholder={placeholder}
    />
  );
};

const parseMultiSource = (val: any) => {
  try {
    if (!val) return [];
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr;
  } catch (e) {
    return [
      {
        source: "Default",
        qty: parseFloat(String(val)) || 0,
        color: "bg-gray-100 text-gray-800 border-gray-200",
      },
    ];
  }
};

export const AddRowModal = React.memo(
  ({
    isOpen,
    onClose,
    onBack,
    backText = "Back to Active Page Settings",
    onSave,
    onDelete,
    columns,
    editingRow,
    editingRowIndex,
    activePage,
    allRows,
    allPagesRows,
    onToggleMagicPasteColumn,
    onApplySourceToAll,
    setConfirmationModal,
    getImageUrl,
    isLiveTracker = false,
    sourceSuggestionsEnabled = false,
    onToggleSourceSuggestions,
    onPropagateSourceColors,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onBack?: () => void;
    backText?: string;
    onSave: (rows: RowData[]) => void | Promise<boolean>; // may resolve to false when the save was rejected, for example by a conflict
    onDelete?: (rowId: string) => void;
    columns: Column[];
    editingRow: RowData | null;
    editingRowIndex?: number;
    activePage: string;
    allRows?: RowData[];
    allPagesRows?: Record<string, RowData[]>;
    onToggleMagicPasteColumn?: (colKey: string) => void;
    onApplySourceToAll?: (page: string, col: string, name: string, color: string) => void;
    setConfirmationModal: (
      modal: {
        isOpen: boolean;
        title?: string;
        message?: string;
        onConfirm: () => void;
      } | null,
    ) => void;
    getImageUrl: (val: any) => string;
    isLiveTracker?: boolean;
    sourceSuggestionsEnabled?: boolean;
    onToggleSourceSuggestions?: (val: boolean) => void;
    onPropagateSourceColors?: (page: string, changes: SourceColorChange[], excludeRowId?: string) => void;
  }) => {
    const { toast } = useToast();
    const [blocks, setBlocks] = useState<Record<string, any>[]>([{}]);
    const [magicPasteText, setMagicPasteText] = useState("");
    const [imageModes, setImageModes] = useState<
      Record<string, "url" | "file">
    >({});
    const [urlSizes, setUrlSizes] = useState<
      Record<string, { loading: boolean; size: number | null; error: boolean }>
    >({});
    const urlTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const currentUrlRef = useRef<Record<string, string>>({});
    const [history, setHistory] = useState<any[][]>([[{}]]);
    const [pointer, setPointer] = useState(0);
    const isUndoRedoRef = useRef(false);
    const [newSourceInputs, setNewSourceInputs] = useState<
      Record<number, { source: string; qty: string }>
    >({});
    
    const sourceSuggestions = useSourceSuggestions(allRows || [], blocks);
    const [retiredModalRowIndex, setRetiredModalRowIndex] = useState<number | null>(null);

    // these are the colour picks made in this session, keyed by lowercased source name so a source changed twice only propagates its final colour, that they are sent on Save, and that they are dropped on Cancel, matching how the rest of the modal already behaves.
    const pendingColorChangesRef = useRef<Map<string, SourceColorChange>>(new Map());

    const editableCols = columns.filter((c) => c.key !== "sr");

    useEffect(() => {
      if (isOpen) {
        if (editingRow) {
          setBlocks([{ ...editingRow }]);
        } else {
          setBlocks([{}]);
        }
        setMagicPasteText("");
        // Reset history when modal opens
        setHistory([editingRow ? [{ ...editingRow }] : [{}]]);
        setPointer(0);
        pendingColorChangesRef.current = new Map<string, SourceColorChange>();
      }
    }, [isOpen, editingRow, columns]);

    useEffect(() => {
      if (isUndoRedoRef.current) {
        isUndoRedoRef.current = false;
        return;
      }
      const timer = setTimeout(() => {
        const currentBlocksStr = JSON.stringify(blocks);
        const lastSavedStr = JSON.stringify(history[pointer]);
        if (currentBlocksStr !== lastSavedStr) {
          const newHistory = [
            ...history.slice(0, pointer + 1),
            JSON.parse(currentBlocksStr),
          ];
          if (newHistory.length > 50) newHistory.shift();
          setHistory(newHistory);
          setPointer(newHistory.length - 1);
        }
      }, 600);
      return () => clearTimeout(timer);
    }, [blocks]);

    useEffect(() => {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (!isOpen) return;

        if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
          // Stop propagation IMMEDIATELY to prevent App.tsx background from catching it
          e.stopPropagation();

          const target = e.target as HTMLElement;
          if (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
          ) {
            return; // Let browser native undo work safely isolated in the modal
          }

          e.preventDefault();
          e.shiftKey ? handleRedo() : handleUndo();
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
          e.stopPropagation();
          const target = e.target as HTMLElement;
          if (
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.isContentEditable
          )
            return;
          e.preventDefault();
          handleRedo();
        }
      };

      window.addEventListener("keydown", handleGlobalKeyDown, true);
      return () =>
        window.removeEventListener("keydown", handleGlobalKeyDown, true);
    }, [isOpen, pointer, history]);

    const handleAddBlock = () => setBlocks([...blocks, {}]);
    const handleRemoveBlock = (index: number) => {
      if (blocks.length <= 1)
        return toast("At least one row block is required");
      setConfirmationModal({
        isOpen: true,
        title: "Confirm Block Deletion",
        message:
          "Are you sure you want to delete this row block? This action cannot be undone.",
        onConfirm: () => {
          setBlocks(blocks.filter((_, i) => i !== index));
        },
      });
    };

    const formatSize = (bytes: number | undefined | null) => {
      if (bytes === 0) return "N/A (URL Image)";
      if (!bytes) return "0 KB";
      return (bytes / 1024).toFixed(1) + " KB";
    };

    const handleUndo = () => {
      if (pointer > 0) {
        isUndoRedoRef.current = true;
        const prevVersion = history[pointer - 1];
        setBlocks(prevVersion);
        setPointer(pointer - 1);
        toast("Undo applied (Add Row)");
      }
    };

    const handleSourceColorChange = (blockIndex: number, sourceName: string, newColor: string) => {
      if (!sourceName || !newColor) return;
      const change: SourceColorChange = { source: sourceName, color: newColor };
      const newBlocks = [...blocks];
      const block = { ...newBlocks[blockIndex] };
      const updates = buildRowColorUpdates(block as any, columns, [change]);
      if (updates) {
        newBlocks[blockIndex] = { ...block, ...updates };
        setBlocks(newBlocks);
      }
      // it is recorded even when this block already had the colour, because the other rows may still be on the old one.
      pendingColorChangesRef.current.set(sourceName.trim().toLowerCase(), change);
    };

    const handleRedo = () => {
      if (pointer < history.length - 1) {
        isUndoRedoRef.current = true;
        const nextVersion = history[pointer + 1];
        setBlocks(nextVersion);
        setPointer(pointer + 1);
        toast("Redo applied (Add Row)");
      }
    };

    const handleSourceRename = (
      blockIndex: number, 
      oldName: string, 
      newName: string,
      updatedTotalSources: any[]
    ) => {
      const newBlocks = [...blocks];
      const block = { ...newBlocks[blockIndex] };
      
      block["total_qty"] = JSON.stringify(updatedTotalSources);
      
      columns.filter(c => c.type === "sale_tracker").forEach(col => {
        if (block[col.key]) {
          const saleSources = parseMultiSource(block[col.key]);
          let changed = false;
          
          const oldIdx = saleSources.findIndex((s: any) => s.source === oldName);
          const existingNewIdx = saleSources.findIndex((s: any) => s.source === newName);
          
          if (oldIdx >= 0) {
            changed = true;
            if (existingNewIdx >= 0 && existingNewIdx !== oldIdx) {
               saleSources[existingNewIdx].qty = (Number(saleSources[existingNewIdx].qty) || 0) + (Number(saleSources[oldIdx].qty) || 0);
               saleSources.splice(oldIdx, 1);
            } else {
               saleSources[oldIdx].source = newName;
            }
          }
          
          if (changed) {
            block[col.key] = JSON.stringify(saleSources);
          }
        }
      });
      
      newBlocks[blockIndex] = block;
      setBlocks(newBlocks);
    };

    const handleUpdateField = (
      blockIndex: number,
      fieldKey: string,
      value: any,
    ) => {
      const cleanValue = (val: any): any => {
        if (typeof val === "string") {
          // Removed <br> cleaning to allow Shift+Enter. Keep comment and nbsp cleaning.
          return val.replace(/<!--[\s\S]*?-->/g, "").replace(/&nbsp;/gi, " ");
        }
        if (Array.isArray(val)) {
          return val.map((v) =>
            typeof v === "string"
              ? v.replace(/<!--[\s\S]*?-->/g, "").replace(/&nbsp;/gi, " ")
              : v,
          );
        }
        return val;
      };
      const sanitizedValue = cleanValue(value);
      const newBlocks = [...blocks];
      newBlocks[blockIndex] = {
        ...newBlocks[blockIndex],
        [fieldKey]: sanitizedValue,
      };
      setBlocks(newBlocks);
    };

    const compressImage = (
      dataUrl: string,
    ): Promise<{ data: string; size: number }> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = dataUrl;
        img.onload = () => {
          const approxSize = dataUrl.length * 0.75;
          const MAX_WIDTH = 1200;
          if (img.width <= MAX_WIDTH && approxSize < 300 * 1024) {
            resolve({ data: dataUrl, size: Math.round(approxSize) });
            return;
          }

          const canvas = document.createElement("canvas");
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          const compressedData = canvas.toDataURL("image/jpeg", 0.8);
          // Calculate size in bytes from base64 string
          const size = Math.round((compressedData.length * 3) / 4);
          resolve({ data: compressedData, size });
        };
        img.onerror = () =>
          resolve({
            data: dataUrl,
            size: Math.round((dataUrl.length * 3) / 4),
          });
      });
    };

    const handleResetBlock = (index: number) => {
      const newBlocks = [...blocks];
      const currentBlock = newBlocks[index];

      const hasData = Object.keys(currentBlock).some(
        (k) =>
          k !== "_undoData" &&
          currentBlock[k] !== undefined &&
          currentBlock[k] !== "",
      );
      if (!hasData) return;

      const undoData = { ...currentBlock };
      delete undoData._undoData;
      newBlocks[index] = { _undoData: undoData };
      setBlocks(newBlocks);
    };

    const handleUndoReset = (index: number) => {
      const newBlocks = [...blocks];
      if (newBlocks[index]._undoData) {
        newBlocks[index] = { ...newBlocks[index]._undoData };
        setBlocks(newBlocks);
      }
    };

    const handleProcessMagicPaste = () => {
      if (!magicPasteText.trim()) {
        toast("Please paste some data first");
        return;
      }

      // Replace newlines inside quotes with a placeholder to prevent incorrect row splitting
      const processedText = magicPasteText.replace(/"(.*?)"/gs, (match) => {
        return match.replace(/\n/g, "___NEWLINE___");
      });

      const rows = processedText
        .split(/\r?\n/)
        .filter((row) => row.trim() !== "");
      const newBlocks = [...blocks];

      // If the first block is completely empty, we can overwrite it
      if (newBlocks.length === 1 && Object.keys(newBlocks[0]).length === 0) {
        newBlocks.pop();
      }

      const activePasteCols = columns.filter(
        (c) =>
          c.key !== "sr" &&
          !c.magicPasteDisabled &&
          !(c.name && c.name.toLowerCase().includes("remaining qty")),
      );

      rows.forEach((rowStr) => {
        // Split by tab and restore newlines
        const values = rowStr
          .split("\t")
          .map((val) => val.replace(/___NEWLINE___/g, "\n"));
        const blockData: Record<string, any> = {};

        activePasteCols.forEach((col, colIdx) => {
          if (colIdx < values.length) {
            let val = values[colIdx].trim();
            // Remove surrounding quotes if they exist
            val = val.replace(/^"|"$/g, "");

            if (col.type === "text_with_copy_button") {
              const parts = val
                .split(/\r?\n/)
                .map((part: string) => part.replace(/^"|"$/g, "").trim())
                .filter((part: string) => part.length > 0);
              blockData[col.key] = parts;
            } else {
              blockData[col.key] = val;
            }
          }
        });

        newBlocks.push(blockData);
      });

      setBlocks(newBlocks.length > 0 ? newBlocks : [{}]);
      setTimeout(() => setMagicPasteText(""), 150);
      toast("✨ Magic Paste applied successfully!");
    };

    const handleSave = () => {
      const preparedRows: RowData[] = [];
      let numberError = false;

      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        
        // Self-heal: Total Qty is the authoritative source list
        const saleTrackerCols = columns.filter(c => c.type === "sale_tracker");
        if (saleTrackerCols.length > 0) {
            let totalSourcesArr = parseMultiSource(block["total_qty"] || "");
            let totalChanged = false;
            const uniqueTotal = new Map();
            totalSourcesArr.forEach((s: any) => {
                if (uniqueTotal.has(s.source)) {
                    totalChanged = true;
                    uniqueTotal.get(s.source).qty = (Number(uniqueTotal.get(s.source).qty) || 0) + (Number(s.qty) || 0);
                } else {
                    uniqueTotal.set(s.source, { ...s, qty: Number(s.qty) || 0 });
                }
            });
            if (totalChanged) {
                totalSourcesArr = Array.from(uniqueTotal.values());
                block["total_qty"] = JSON.stringify(totalSourcesArr);
            }
            const totalSources = totalSourcesArr.map((s: any) => s.source);
            saleTrackerCols.forEach(col => {
              if (block[col.key]) {
                 let saleSources = parseMultiSource(block[col.key]);
                 let changed = false;
                 
                 const filtered = saleSources.filter((s: any) => totalSources.includes(s.source));
                 if (filtered.length !== saleSources.length) {
                    saleSources = filtered;
                    changed = true;
                 }
                 
                 const uniqueSources = new Map();
                 let hasDuplicates = false;
                 saleSources.forEach((s: any) => {
                    if (uniqueSources.has(s.source)) {
                       hasDuplicates = true;
                       uniqueSources.get(s.source).qty = (Number(uniqueSources.get(s.source).qty) || 0) + (Number(s.qty) || 0);
                    } else {
                       uniqueSources.set(s.source, { ...s, qty: Number(s.qty) || 0 });
                    }
                 });
                 
                 if (hasDuplicates) {
                    saleSources = Array.from(uniqueSources.values());
                    changed = true;
                 }
                 
                 if (changed) {
                    block[col.key] = saleSources.length > 0 ? JSON.stringify(saleSources) : "";
                 }
              }
            });
        }

        const payload: RowData = {
          id:
            editingRow && i === 0
              ? editingRow.id
              : `${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
        };
        let hasAnyValue = false;

        for (const col of editableCols) {
          let val = block[col.key];

          if (
            col.type === "number" &&
            col.key !== "total_qty" &&
            val !== undefined &&
            val !== null &&
            String(val).trim() !== ""
          ) {
            const num = Number(val);
            if (Number.isNaN(num)) {
              numberError = true;
              continue;
            }
            val = num;
          }

          if (
            col.type === "text_with_copy_button" ||
            col.type === "multi_text"
          ) {
            if (Array.isArray(val) && val.length > 0) hasAnyValue = true;
            else if (typeof val === "string" && val.trim()) hasAnyValue = true;
          } else if (
            val !== undefined &&
            val !== null &&
            String(val).trim() !== ""
          ) {
            hasAnyValue = true;
          }

          payload[col.key] = val;
        }

        if (hasAnyValue) preparedRows.push(payload);
      }

      if (numberError)
        return toast("Invalid number value found in one or more rows");
      if (!preparedRows.length)
        return toast("Please enter at least one row with data");

      const saveResult = onSave(preparedRows);
      
      if (!onPropagateSourceColors || pendingColorChangesRef.current.size === 0) return;
      
      const changes = Array.from(pendingColorChangesRef.current.values()) as SourceColorChange[];
      pendingColorChangesRef.current = new Map<string, SourceColorChange>();
      
      const propagate = () => {
        // the edited row is already covered by onSave, so it is skipped here to keep two writes off the same row
        onPropagateSourceColors(activePage, changes, editingRow?.id);
      };
      
      // the other rows are only recoloured once this row has actually been stored, because a rejected save such as a conflict would otherwise leave the rest of the page on a colour this row never got.
      if (saveResult && typeof (saveResult as any).then === 'function') {
        (saveResult as Promise<boolean>).then((success) => {
          if (success !== false) propagate();
        });
      } else {
        propagate();
      }
    };

    return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        onBack={onBack}
        title={
          editingRow && editingRowIndex !== undefined && editingRowIndex >= 0
            ? `📝 Edit Row Data (Row No. ${editingRowIndex + 1})`
            : "🧾 Add Row Data"
        }
        width="min(860px, 96vw)"
      >
        <div className="text-xs text-[#607d8b] mb-2 font-bold">
          Active Page: <b>{activePage}</b> | Columns:{" "}
          <b>{editableCols.length}</b>
        </div>
        {isLiveTracker && (
          <div className="mb-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 p-2 rounded flex items-center gap-2">
            <Lock size={14} className="text-gray-400" />
            <span>
              <b>Live Tracker:</b> only Total Qty is editable here. Edit other fields from the main page.
            </span>
          </div>
        )}

        {!isLiveTracker && editableCols.length > 0 && (
          <div className="mb-4 border border-purple-200 bg-purple-50 rounded-md p-2.5">
            <div className="text-xs text-purple-800 font-bold mb-1 flex items-center gap-1">
              <Wand2 size={14} /> Add Row Magic Paste Box
            </div>
            <div className="text-[11px] text-purple-600 mb-2 leading-snug">
              Copy a row (or multiple rows) from Excel/Sheets and paste it here.
              Uncheck columns you want to skip if you don't have data for them.
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {columns.map((c, idx) => {
                const isLockedField =
                  c.key === "sr" ||
                  (c.name && c.name.toLowerCase().includes("remaining qty"));
                if (isLockedField) {
                  return (
                    <div
                      key={c.key}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-yellow-100 text-yellow-800 border-yellow-300 cursor-not-allowed"
                      title="Field is auto-calculated or generated"
                    >
                      <Lock size={10} /> {idx + 1}. {c.name}
                    </div>
                  );
                }
                return (
                  <label
                    key={c.key}
                    className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded cursor-pointer border transition-colors ${
                      !c.magicPasteDisabled
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={!c.magicPasteDisabled}
                      onChange={() => onToggleMagicPasteColumn?.(c.key)}
                    />
                    {idx + 1}. {c.name}
                  </label>
                );
              })}
            </div>

            <div className="text-[11px] text-purple-800 mb-1 font-bold">
              Paste order:{" "}
              {columns
                .filter((c) => !c.magicPasteDisabled && c.key !== "sr")
                .map(
                  (c) =>
                    `${columns.findIndex((col) => col.key === c.key) + 1}. ${c.name}`,
                )
                .join(" ➔ ") || "No columns selected"}
            </div>

            <div className="flex gap-2">
              <textarea
                className="flex-1 h-16 border border-purple-300 rounded p-1.5 text-xs focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                placeholder="Paste your tab-separated data here..."
                value={magicPasteText}
                onChange={(e) => setMagicPasteText(e.target.value)}
              />
              <button
                onClick={handleProcessMagicPaste}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap h-16 cursor-pointer border-0"
              >
                <Wand2 size={16} />
                <div className="text-left leading-tight">
                  Process
                  <br />
                  Magic Paste
                </div>
              </button>
            </div>
          </div>
        )}

        {editableCols.length === 0 ? (
          <div className="text-xs text-red-700 font-bold">
            No editable columns found. Please create columns first.
          </div>
        ) : (
          <div className="space-y-3">
            {blocks.map((block, i) => (
              <div
                key={i}
                className="border border-[#d7dde1] rounded-md p-2.5 bg-[#fafcfe]"
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs font-bold text-[#2b579a]">
                    Row {i + 1}
                  </div>
                  <div className="flex gap-2">
                    {!isLiveTracker && block._undoData && (
                      <Button
                        variant="orange"
                        onClick={() => handleUndoReset(i)}
                      >
                        <Undo2 size={14} /> Undo
                      </Button>
                    )}
                    {!isLiveTracker && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => handleResetBlock(i)}
                        >
                          <RotateCcw size={14} /> Reset
                        </Button>
                        <Button variant="red" onClick={() => handleRemoveBlock(i)}>
                          <Trash2 size={14} /> Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {editableCols.map((col) => {
                    if (isLiveTracker) {
                      if (col.name && col.name.toLowerCase().includes("remaining qty")) return null;
                      if (col.type === "sale_tracker") return null;
                    }
                    const isReadOnly =
                      (col.name &&
                        col.name.toLowerCase().includes("remaining qty")) ||
                      (isLiveTracker && col.key !== "total_qty");
                    const colNumber =
                      columns.findIndex((c) => c.key === col.key) + 1;
                      
                    const isLiveTrackerHighlight = isLiveTracker && col.key === "total_qty";

                    return (
                      <div key={col.key} className={`flex flex-col relative ${isReadOnly ? "opacity-60" : ""} ${(col.key === "total_qty" || col.type === "sale_tracker") ? "sm:col-span-2" : ""} ${isLiveTrackerHighlight ? "ring-2 ring-blue-500 bg-blue-50/50 p-2 rounded-lg shadow-sm z-10" : ""}`}>
                        {isReadOnly && (
                          <div
                            className="absolute inset-0 z-10 cursor-not-allowed"
                            title={isLiveTracker ? "Live Tracker: only Total Qty is editable here. Edit other fields from the main page." : "Field is auto-calculated or locked"}
                          />
                        )}
                        <label className="text-xs font-bold text-gray-600 mb-1">
                          {colNumber}. {col.name}{" "}
                          {col.key === "total_qty"
                            ? "(Multi-Source)"
                            : col.type === "sale_tracker"
                              ? "(Sales per Source)"
                              : `(${col.type})`}
                        </label>
                        {col.key === "total_qty" ? (
                          (() => {
                            const currentSources = parseMultiSource(
                              block[col.key],
                            );
                            const { active: activeSources, retired: retiredSources } = splitActiveRetired(currentSources);
                            const newSourceInput = newSourceInputs[i] || {
                              source: "",
                              qty: "",
                            };
                            return (
                              <div className="border border-purple-200 bg-purple-50 p-2 rounded flex flex-col h-full min-h-[100px]">
                                <div className="flex justify-between items-center mb-2 px-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-purple-700 font-bold uppercase">Sources</span>
                                    {onToggleSourceSuggestions && (
                                      <label className="flex items-center gap-1 cursor-pointer" title="Suggest source names used in other rows (applies to everyone)">
                                        <input
                                          type="checkbox"
                                          checked={sourceSuggestionsEnabled}
                                          onChange={(e) => onToggleSourceSuggestions(e.target.checked)}
                                          className="w-3 h-3 cursor-pointer accent-purple-600"
                                        />
                                        <span className="text-[10px] text-purple-600 font-medium">Suggestions</span>
                                      </label>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {retiredSources.length > 0 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                                        onClick={() => setRetiredModalRowIndex(i)}
                                      >
                                        🗄️ Retired ({retiredSources.length})
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <DragDropContext
                                  onDragEnd={(result: DropResult) => {
                                    if (!result.destination) return;
                                    const reordered = reorderSources(activeSources, result.source.index, result.destination.index);
                                    handleUpdateField(i, col.key, JSON.stringify([...reordered, ...retiredSources]));
                                  }}
                                >
                                  <Droppable droppableId={`droppable-${i}-${col.key}`}>
                                    {(provided) => (
                                      <div
                                        {...provided.droppableProps}
                                        ref={provided.innerRef}
                                        className="flex flex-col gap-2 mb-2"
                                      >
                                        {activeSources.map((src: any, idx: number) => {
                                          let totalSales = 0;
                                          columns.filter(c => c.type === "sale_tracker").forEach(sc => {
                                            const sales = parseMultiSource(block[sc.key]);
                                            const entry = sales.find((s: any) => s.source === src.source);
                                            if (entry) totalSales += (parseFloat(entry.qty) || 0);
                                          });
                                          const remaining = (parseFloat(src.qty) || 0) - totalSales;
                                          const retired = isRetired(src);

                                          return (
                                          // @ts-ignore
                                          <Draggable key={`${i}-${col.key}-${idx}`} draggableId={`${i}-${col.key}-${idx}`} index={idx}>
                                            {(provided, snapshot) => (
                                              <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                className={`flex flex-wrap sm:flex-nowrap w-full box-border gap-2 items-center bg-white p-2 rounded shadow-sm border ${snapshot.isDragging ? 'border-purple-400 shadow-md ring-1 ring-purple-200' : 'border-purple-100'} ${retired ? 'opacity-60 bg-gray-50' : ''} ${!retired && isLocked(src) ? 'opacity-50 grayscale' : ''}`}
                                                style={provided.draggableProps.style}
                                              >
                                                <div {...provided.dragHandleProps} className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing px-1 shrink-0">
                                                  <GripVertical className="h-4 w-4" />
                                                </div>
                                                <div className="shrink-0 text-[14px] font-bold text-gray-900 w-5 flex justify-center">
                                                  {formatSourceNumber(idx)}
                                                </div>
                                                <div className="flex flex-col gap-1 shrink-0">
                                                  <label className="flex items-center gap-1 text-[10px] uppercase font-bold text-gray-500 cursor-pointer">
                                                    <input 
                                                      type="checkbox" 
                                                      checked={false}
                                                      onChange={(e) => {
                                                        if (e.target.checked) {
                                                          const copyActive = [...activeSources];
                                                          copyActive[idx] = setRetired(copyActive[idx], true);
                                                          handleUpdateField(i, col.key, JSON.stringify([...copyActive, ...retiredSources]));
                                                        }
                                                      }}
                                                      className="cursor-pointer"
                                                    /> Retire
                                                  </label>
                                                  {!retired && remaining <= 0 && (
                                                    <span className="text-[9px] text-blue-500 leading-tight">Zero qty.<br/>Retire?</span>
                                                  )}
                                                </div>
                                                <div className="flex-[2] min-w-[100px] flex items-center gap-1">
                                                  {!retired && isLocked(src) && <span className="text-[10px]">🔒</span>}
                                                  {(() => {
                                                    const render = resolveChipRender(src.color);
                                                    return (
                                                      <textarea
                                                        ref={(el) => {
                                                          if (el && !el.style.height) {
                                                            el.style.height = 'auto';
                                                            el.style.height = el.scrollHeight + 'px';
                                                          }
                                                        }}
                                                        className={`w-full box-border text-[14px] px-1.5 py-0.5 rounded font-bold border border-transparent hover:border-gray-300 outline-none transition-colors resize-none overflow-hidden break-words whitespace-normal ${render.kind === 'class' ? render.className : ''}`}
                                                        title={getCreationTooltip(src)}
                                                        value={src.source}
                                                        rows={1}
                                                        style={{ fieldSizing: "content", minHeight: "28px", ...(render.kind === 'style' ? render.style : {}) } as any}
                                                        onChange={(e) => {
                                                          e.target.style.height = 'auto';
                                                          e.target.style.height = e.target.scrollHeight + 'px';
                                                          const copyActive = [...activeSources];
                                                          const oldName = copyActive[idx].source;
                                                          const newName = e.target.value;
                                                          copyActive[idx].source = newName;
                                                          const newAll = [...copyActive, ...retiredSources];
                                                          if (oldName !== newName) {
                                                            handleSourceRename(i, oldName, newName, newAll);
                                                          } else {
                                                            handleUpdateField(
                                                              i,
                                                              col.key,
                                                              JSON.stringify(newAll),
                                                            );
                                                          }
                                                        }}
                                                      />
                                                    );
                                                  })()}
                                                </div>
                                        <Input
                                          type="number"
                                          onFocus={(e) => e.target.select()}
                                          onWheel={(e) =>
                                            e.currentTarget.blur()
                                          }
                                          className="w-[70px] shrink-0 h-8 text-[14px] px-1 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          value={src.qty}
                                          onChange={(e) => {
                                            const copyActive = [...activeSources];
                                            copyActive[idx].qty =
                                              parseFloat(e.target.value) || 0;
                                            handleUpdateField(
                                              i,
                                              col.key,
                                              JSON.stringify([...copyActive, ...retiredSources]),
                                            );
                                          }}
                                        />
                                        <div className="flex items-center ml-auto shrink-0 gap-1">
                                          <ColorPickerPopover
                                            value={src.color}
                                            hideSwatch={true}
                                            forceIconVisible={true}
                                            label={src.source ? `Change colour for ${src.source}` : "Change colour for this source"}
                                            onChange={(val) => handleSourceColorChange(i, src.source, val.chipClass)}
                                            className="shrink-0"
                                          />
                                          <button
                                            type="button"
                                            className="text-gray-600 hover:text-gray-800 flex items-center justify-center p-1 rounded hover:bg-gray-100 transition-colors shrink-0"
                                            onClick={() => {
                                                const currentStr = JSON.stringify([...activeSources, ...retiredSources]);
                                                const newTotalQty = toggleLockInTotalQty(currentStr, src.source);
                                                handleUpdateField(i, col.key, newTotalQty);
                                            }}
                                            title={isLocked(src) ? "Unlock source" : "Lock source"}
                                          >
                                            <span className="text-[14px]">{isLocked(src) ? "🔓" : "🔒"}</span>
                                          </button>
                                          <button
                                            type="button"
                                            className="text-red-500 font-bold px-1 hover:text-red-700 flex-shrink-0"
                                          onClick={() => {
                                            setConfirmationModal({
                                              isOpen: true,
                                              title: "Confirm Source Deletion",
                                              message: `Are you sure you want to delete "${src.source}"? This will also permanently remove its historical sales data from all sale columns. This cannot be undone. Consider retiring the source instead if you want to keep the historical data.`,
                                              onConfirm: () => {
                                                const copyActive = activeSources.filter(
                                                  (_: any, k: number) => k !== idx,
                                                );
                                                const newAll = [...copyActive, ...retiredSources];
                                                
                                                const newBlocks = [...blocks];
                                                const block = { ...newBlocks[i] };
                                                
                                                block[col.key] = newAll.length > 0 ? JSON.stringify(newAll) : "";
                                                
                                                // Immediate purge from all sale_tracker columns
                                                columns.filter(c => c.type === "sale_tracker").forEach(saleCol => {
                                                  if (block[saleCol.key]) {
                                                    let saleSources = parseMultiSource(block[saleCol.key]);
                                                    const filtered = saleSources.filter((s: any) => s.source !== src.source);
                                                    if (filtered.length !== saleSources.length) {
                                                      block[saleCol.key] = filtered.length > 0 ? JSON.stringify(filtered) : "";
                                                    }
                                                  }
                                                });
                                                
                                                newBlocks[i] = block;
                                                setBlocks(newBlocks);
                                              }
                                            });
                                          }}
                                          title="Delete Option"
                                        >
                                          X
                                        </button>
                                        {onApplySourceToAll && (
                                          <button
                                            type="button"
                                            className="text-blue-600 hover:text-blue-800 flex items-center justify-center p-1 rounded hover:bg-blue-50 transition-colors shrink-0"
                                            onClick={() => onApplySourceToAll(activePage, col.key, src.source, src.color)}
                                            title="Apply this source and zero quantity to all rows"
                                          >
                                            <Layers3 className="h-4 w-4" />
                                          </button>
                                        )}
                                        </div>
                                      </div>
                                            )}
                                          </Draggable>
                                        );
                                        })}
                                        {provided.placeholder}
                                      </div>
                                    )}
                                  </Droppable>
                                </DragDropContext>
                                <div className="flex flex-wrap sm:flex-nowrap gap-2 items-center w-full box-border pt-2 border-t border-purple-200 mt-auto">
                                  <SourceAutocompleteInput
                                    placeholder="Source"
                                    suggestions={sourceSuggestions}
                                    dropdownPosition="top"
                                    className="h-8 text-[14px] px-2 w-full"
                                    wrapperClassName="flex-[2] min-w-[100px]"
                                    suggestionsEnabled={sourceSuggestionsEnabled}
                                    value={newSourceInput.source}
                                    onChange={(val) =>
                                      setNewSourceInputs({
                                        ...newSourceInputs,
                                        [i]: {
                                          ...newSourceInput,
                                          source: val,
                                        },
                                      })
                                    }
                                  />
                                  <Input
                                    type="number"
                                    onWheel={(e) => e.currentTarget.blur()}
                                    placeholder="Qty"
                                    className="w-[70px] shrink-0 h-8 text-[14px] px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    value={newSourceInput.qty}
                                    onChange={(e) =>
                                      setNewSourceInputs({
                                        ...newSourceInputs,
                                        [i]: {
                                          ...newSourceInput,
                                          qty: e.target.value,
                                        },
                                      })
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant="green"
                                    className="h-7 text-[10px] px-2 py-0 shrink-0"
                                    onClick={() => {
                                      if (newSourceInput.source) {
                                        let existingColor = null;
                                        const pagesToSearch = allPagesRows ? Object.values(allPagesRows) : (allRows ? [allRows] : []);
                                        for (const rows of pagesToSearch) {
                                          for (const r of rows) {
                                            for (const fieldKey of Object.keys(r)) {
                                              try {
                                                const val = r[fieldKey];
                                                if (!val) continue;
                                                const arr = typeof val === 'string' ? JSON.parse(val) : val;
                                                if (Array.isArray(arr)) {
                                                  const match = arr.find((item: any) => item.source?.trim().toLowerCase() === newSourceInput.source.trim().toLowerCase());
                                                  if (match && match.color) {
                                                    existingColor = match.color;
                                                    break;
                                                  }
                                                }
                                              } catch (e) {}
                                            }
                                            if (existingColor) break;
                                          }
                                          if (existingColor) break;
                                        }

                                        const usedColors = currentSources.map((item: any) => item.color);
                                        let newColor = existingColor;
                                        if (!newColor) {
                                          const availableFamilyClass = getNextAvailableHexColor(usedColors);
                                          if (availableFamilyClass) {
                                            newColor = availableFamilyClass;
                                          } else {
                                            const usedHues = usedColors.map((c: string) => extractHue(c)).filter((h: number | null) => h !== null) as number[];
                                            newColor = generateRandomSourceColor(usedHues);
                                          }
                                        }
                                        
                                        const updated = [
                                          ...currentSources,
                                          {
                                            source: newSourceInput.source,
                                            qty:
                                              parseFloat(newSourceInput.qty) ||
                                              0,
                                            color: newColor,
                                            createdAt: new Date().toISOString(),
                                          },
                                        ];
                                        handleUpdateField(
                                          i,
                                          col.key,
                                          JSON.stringify(updated),
                                        );
                                        setNewSourceInputs({
                                          ...newSourceInputs,
                                          [i]: { source: "", qty: "" },
                                        });
                                      }
                                    }}
                                  >
                                    Add
                                  </Button>
                                </div>
                              </div>
                            );
                          })()
                        ) : col.type === "sale_tracker" ? (
                          (() => {
                            const totalSources = parseMultiSource(
                              block["total_qty"],
                            );
                            const saleSources = parseMultiSource(
                              block[col.key],
                            );
                            return (
                              <div className="border border-gray-200 bg-gray-50 p-2 rounded flex flex-col h-full min-h-[100px]">
                                <div className="flex flex-col gap-2">
                                  {totalSources.map((ts: any, idx: number) => {
                                    const saleEntry = saleSources.find(
                                      (s: any) => s.source === ts.source,
                                    );
                                    const saleQty = saleEntry
                                      ? saleEntry.qty
                                      : "";
                                    return (
                                      <div
                                        key={idx}
                                        className="flex flex-wrap sm:flex-nowrap w-full box-border gap-2 items-center bg-white p-1 rounded shadow-sm border border-gray-100"
                                      >
                                        {(() => {
                                          const render = resolveChipRender(ts.color);
                                          return (
                                            <span
                                              className={`text-[14px] px-1.5 py-0.5 rounded font-bold flex-[2] min-w-[100px] break-words whitespace-normal ${render.kind === 'class' ? render.className : ''}`}
                                              style={render.kind === 'style' ? render.style : undefined}
                                            >
                                              {ts.source}
                                            </span>
                                          );
                                        })()}
                                        <Input
                                          type="number"
                                          onFocus={(e) => e.target.select()}
                                          onWheel={(e) =>
                                            e.currentTarget.blur()
                                          }
                                          className="w-[70px] shrink-0 h-8 text-[14px] px-1 text-right text-blue-800 font-bold ml-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                          value={saleQty}
                                          placeholder="Qty"
                                          onChange={(e) => {
                                            const copy = [...saleSources];
                                            const existingIdx = copy.findIndex(
                                              (s: any) =>
                                                s.source === ts.source,
                                            );
                                            if (existingIdx >= 0) {
                                              copy[existingIdx].qty =
                                                parseFloat(e.target.value) || 0;
                                            } else {
                                              copy.push({
                                                source: ts.source,
                                                qty:
                                                  parseFloat(e.target.value) ||
                                                  0,
                                                color: ts.color,
                                              });
                                            }
                                            handleUpdateField(
                                              i,
                                              col.key,
                                              JSON.stringify(copy),
                                            );
                                          }}
                                        />
                                      </div>
                                    );
                                  })}
                                  {totalSources.length === 0 && (
                                    <div className="text-[14px] text-gray-500 italic p-1">
                                      No sources added yet. Add to Total Qty
                                      first.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()
                        ) : col.type === "multi_text" ? (
                          <div
                            className={
                              isReadOnly
                                ? "pointer-events-none opacity-70 bg-gray-50"
                                : ""
                            }
                          >
                            <RichTextEditor
                              className="w-full min-h-[90px]"
                              placeholder="One value per line (use Shift+Enter for new line)"
                              value={
                                Array.isArray(block[col.key])
                                  ? block[col.key].join("<br>")
                                  : block[col.key] || ""
                              }
                              onChange={(val) =>
                                handleUpdateField(
                                  i,
                                  col.key,
                                  val.split(/<br\s*\/?>/i),
                                )
                              }
                            />
                          </div>
                        ) : col.type === "text_with_copy_button" ? (
                          <div
                            className={`flex flex-col gap-1 ${isReadOnly ? "pointer-events-none opacity-70 bg-gray-50" : ""}`}
                          >
                            {(Array.isArray(block[col.key]) &&
                            block[col.key].length > 0
                              ? block[col.key]
                              : [""]
                            ).map((val: string, idx: number, arr: string[]) => {
                              const isCopyDisabled = val.startsWith("!");
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center gap-1.5"
                                >
                                  <div className="flex-1 relative">
                                    <RichTextEditor
                                      value={
                                        isCopyDisabled ? val.slice(1) : val
                                      }
                                      placeholder={`Item ${idx + 1}`}
                                      className={
                                        isCopyDisabled
                                          ? "bg-gray-50 text-gray-400 italic"
                                          : ""
                                      }
                                      onChange={(newVal) => {
                                        const newArr = [...arr];
                                        newArr[idx] = isCopyDisabled
                                          ? "!" + newVal
                                          : newVal;
                                        handleUpdateField(i, col.key, newArr);
                                      }}
                                    />
                                    {isCopyDisabled && (
                                      <div className="absolute right-2 top-1.5 text-[9px] font-bold text-red-400 uppercase pointer-events-none">
                                        Copy Hidden
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newArr = [...arr];
                                        newArr[idx] = isCopyDisabled
                                          ? val.slice(1)
                                          : "!" + val;
                                        handleUpdateField(i, col.key, newArr);
                                      }}
                                      className={`p-1.5 rounded border transition-all cursor-pointer ${isCopyDisabled ? "bg-gray-100 text-gray-400 border-gray-200" : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"}`}
                                      title={
                                        isCopyDisabled
                                          ? "Show Copy Button"
                                          : "Hide Copy Button"
                                      }
                                    >
                                      <Copy size={16} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (arr.length === 1) {
                                          handleUpdateField(i, col.key, [""]);
                                        } else {
                                          const newArr = arr.filter(
                                            (_, k) => k !== idx,
                                          );
                                          handleUpdateField(i, col.key, newArr);
                                        }
                                      }}
                                      className="p-1.5 bg-red-50 text-red-500 rounded border border-red-100 hover:bg-red-100 transition-all cursor-pointer"
                                      title="Delete this box"
                                    >
                                      <X size={16} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              className="mt-1 border border-dashed border-blue-300 text-blue-700 bg-blue-50 rounded text-xs font-bold py-1 px-2 w-fit cursor-pointer"
                              onClick={() => {
                                const newArr = [
                                  ...(Array.isArray(block[col.key])
                                    ? block[col.key]
                                    : [""]),
                                  "",
                                ];
                                handleUpdateField(i, col.key, newArr);
                              }}
                            >
                              ➕ Add Another Box
                            </button>
                          </div>
                        ) : col.type === "image" ? (
                          <div className="border border-gray-200 rounded p-2 bg-white">
                            <div className="flex items-center gap-4 mb-2">
                              <label className="flex items-center gap-1 text-xs cursor-pointer font-medium text-gray-700">
                                <input
                                  type="radio"
                                  name={`mode_${i}_${col.key}`}
                                  checked={
                                    (imageModes[`${i}_${col.key}`] || "url") ===
                                    "url"
                                  }
                                  onChange={() =>
                                    setImageModes((prev) => ({
                                      ...prev,
                                      [`${i}_${col.key}`]: "url",
                                    }))
                                  }
                                  className="accent-blue-500"
                                />
                                URL
                              </label>
                              <label className="flex items-center gap-1 text-xs cursor-pointer font-medium text-gray-700">
                                <input
                                  type="radio"
                                  name={`mode_${i}_${col.key}`}
                                  checked={
                                    imageModes[`${i}_${col.key}`] === "file"
                                  }
                                  onChange={() =>
                                    setImageModes((prev) => ({
                                      ...prev,
                                      [`${i}_${col.key}`]: "file",
                                    }))
                                  }
                                  className="accent-blue-500"
                                />
                                File
                              </label>
                            </div>
                            {(imageModes[`${i}_${col.key}`] || "url") ===
                            "url" ? (
                              <div className="flex flex-col gap-1 w-full">
                                <Input
                                  placeholder="https://example.com/image.jpg"
                                  value={
                                    typeof block[col.key] === "object"
                                      ? block[col.key].data
                                      : block[col.key] || ""
                                  }
                                  onChange={async (e) => {
                                    const val = e.target.value;
                                    handleUpdateField(i, col.key, val);
                                    
                                    const key = `${i}_${col.key}`;
                                    currentUrlRef.current[key] = val;
                                    
                                    if (urlTimeoutsRef.current[key]) {
                                      clearTimeout(urlTimeoutsRef.current[key]);
                                    }
                                    
                                    if (val.startsWith("http") && val.length > 10) {
                                      setUrlSizes(prev => ({ ...prev, [key]: { loading: true, size: null, error: false } }));
                                      urlTimeoutsRef.current[key] = setTimeout(async () => {
                                        try {
                                          const res = await fetch(`/api/url-image-size?url=${encodeURIComponent(val)}`);
                                          let data: any = {}; try { data = await res.json(); } catch(e) {}
                                          if (currentUrlRef.current[key] !== val) return;
                                          
                                          if (data.ok && typeof data.sizeBytes === 'number') {
                                            setUrlSizes(prev => ({ ...prev, [key]: { loading: false, size: data.sizeBytes, error: false } }));
                                            handleUpdateField(i, col.key, {
                                              data: val,
                                              rawSize: data.sizeBytes,
                                              compressedSize: data.sizeBytes,
                                            });
                                          } else {
                                            setUrlSizes(prev => ({ ...prev, [key]: { loading: false, size: null, error: true } }));
                                            handleUpdateField(i, col.key, {
                                              data: val,
                                              rawSize: 0,
                                              compressedSize: 0,
                                            });
                                          }
                                        } catch (err) {
                                          if (currentUrlRef.current[key] !== val) return;
                                          setUrlSizes(prev => ({ ...prev, [key]: { loading: false, size: null, error: true } }));
                                          handleUpdateField(i, col.key, {
                                            data: val,
                                            rawSize: 0,
                                            compressedSize: 0,
                                          });
                                        }
                                      }, 600);
                                    } else {
                                      setUrlSizes(prev => {
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      });
                                    }
                                  }}
                                />
                                {urlSizes[`${i}_${col.key}`] && (
                                  <div className="text-[10px] ml-1">
                                    {urlSizes[`${i}_${col.key}`].loading ? (
                                      <span className="text-gray-500">Checking size...</span>
                                    ) : urlSizes[`${i}_${col.key}`].error ? (
                                      <span className="text-red-500">Couldn't determine size</span>
                                    ) : (
                                      <span className="text-blue-600">
                                        Image size: {urlSizes[`${i}_${col.key}`].size! > 1024 * 1024 ? (urlSizes[`${i}_${col.key}`].size! / (1024 * 1024)).toFixed(2) + " MB" : Math.round(urlSizes[`${i}_${col.key}`].size! / 1024) + " KB"}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <input
                                  type="file"
                                  id={`file-upload-${i}-${col.key}`}
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const rawSize = file.size;
                                      const reader = new FileReader();
                                      reader.onloadend = async () => {
                                        const compressed = await compressImage(
                                          reader.result as string,
                                        );
                                        handleUpdateField(i, col.key, {
                                          data: compressed.data,
                                          rawSize: rawSize,
                                          compressedSize: compressed.size,
                                        });
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`file-upload-${i}-${col.key}`}
                                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#217346] hover:bg-[#1a5c38] text-white text-xs font-bold rounded cursor-pointer transition-colors w-max"
                                >
                                  📤 Upload Image
                                </label>
                                {block[col.key] &&
                                  (typeof block[col.key] === "object"
                                    ? block[col.key].data
                                    : block[col.key]
                                  ).startsWith("data:image") && (
                                    <div className="text-[10px] text-gray-500 italic truncate max-w-[200px]">
                                      Image selected successfully
                                    </div>
                                  )}
                              </div>
                            )}
                            {block[col.key] && (
                              <div className="mt-2 flex items-center gap-3 border border-gray-100 rounded p-1.5 bg-gray-50 w-fit relative">
                                <img
                                  src={getImageUrl(block[col.key])}
                                  alt="Preview"
                                  className="w-[60px] h-[60px] object-cover rounded border border-gray-200"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 border-0 cursor-pointer"
                                  onClick={() => {
                                    setConfirmationModal({
                                      isOpen: true,
                                      title: "Confirm Image Deletion",
                                      message:
                                        "Are you sure you want to delete this image?",
                                      onConfirm: () => {
                                        const newBlock = { ...block };
                                        newBlock[col.key] = "";
                                        setBlocks(
                                          blocks.map((b, i) =>
                                            i === blocks.indexOf(block)
                                              ? newBlock
                                              : b,
                                          ),
                                        );
                                      },
                                    });
                                  }}
                                >
                                  <X size={12} />
                                </button>
                                <div className="flex flex-col">
                                  <div className="text-[10px] text-gray-500 font-bold uppercase">
                                    Preview
                                  </div>
                                  {typeof block[col.key] === "object" && (
                                    <div className="text-[9px] text-gray-400 leading-tight">
                                      Raw: {formatSize(block[col.key].rawSize)}
                                      <br />
                                      Comp:{" "}
                                      {formatSize(
                                        block[col.key].compressedSize,
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : col.type === "dropdown" ? (
                          <div className={isReadOnly ? "pointer-events-none opacity-70" : ""}>
                            <RichDropdownSelect
                              value={block[col.key] || ""}
                              onChange={(val) => handleUpdateField(i, col.key, val)}
                              options={col.options || []}
                              disabled={isReadOnly}
                              placeholder={`Select ${col.name}`}
                            />
                          </div>
                        ) : col.type === "text" ? (
                          <div
                            className={
                              isReadOnly
                                ? "pointer-events-none opacity-70 bg-gray-50"
                                : ""
                            }
                          >
                            <RichTextEditor
                              placeholder={`Enter ${col.name}`}
                              value={block[col.key] || ""}
                              onChange={(val) =>
                                handleUpdateField(i, col.key, val)
                              }
                            />
                          </div>
                        ) : (
                          <Input
                            type={
                              col.type === "number"
                                ? "number"
                                : col.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            onWheel={(e) =>
                              col.type === "number" && e.currentTarget.blur()
                            }
                            placeholder={`Enter ${col.name}`}
                            value={block[col.key] || ""}
                            onChange={(e) =>
                              handleUpdateField(i, col.key, e.target.value)
                            }
                            disabled={isReadOnly}
                            className={`${isReadOnly ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""} ${col.type === "number" ? "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" : ""}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {!editingRow && (
          <Button variant="blue" onClick={handleAddBlock} className="mt-2">
            <Plus size={14} /> Add Row
          </Button>
        )}

        <div className="mt-4 flex justify-end gap-2 sticky bottom-0 bg-white py-3 border-t border-gray-100 z-10">
          {onBack ? (
            <Button variant="outline" onClick={onBack}>
              {backText}
            </Button>
          ) : (
            <Button variant="red" onClick={onClose}>
              Back to Workspace
            </Button>
          )}
          {!isLiveTracker && editingRow && onDelete && (
            <Button
              variant="red"
              onClick={() => {
                setConfirmationModal({
                  isOpen: true,
                  title: "Confirm Row Deletion",
                  message:
                    "Are you sure you want to delete this row? This action cannot be undone.",
                  onConfirm: () => {
                    onDelete(editingRow.id);
                    onClose();
                  },
                });
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 size={14} /> Delete Row
            </Button>
          )}
          <Button variant="green" onClick={handleSave}>
            {editingRow ? "Update Row" : "Save Rows"}
          </Button>
        </div>
      </Modal>

      {retiredModalRowIndex !== null && (
        <RetiredSourcesModal
          isOpen={true}
          onClose={() => setRetiredModalRowIndex(null)}
          sources={(() => {
            const block = blocks[retiredModalRowIndex];
            if (!block) return [];
            const parsed = parseMultiSource(block.total_qty);
            return splitActiveRetired(parsed).retired;
          })()}
          onUnretire={(sourceName) => {
            const block = blocks[retiredModalRowIndex];
            if (!block) return;
            const parsed = parseMultiSource(block.total_qty);
            const updated = parsed.map((s: any) => s.source === sourceName ? setRetired(s, false) : s);
            handleUpdateField(retiredModalRowIndex, "total_qty", JSON.stringify(updated));
          }}
        />
      )}
    </>
  );
});
