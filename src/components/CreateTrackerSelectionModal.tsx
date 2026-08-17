import { formatCellDisplay } from '../lib/formatCellDisplay';
import { parseMultiSource } from "../lib/appUtils";
import React, { useState, useEffect, useMemo, useDeferredValue } from "react";
import { Button, Modal, Input } from "./ui";
import { Column, RowData } from "../types";
import { ArrowLeft, LayoutList, Search } from "lucide-react";

interface CreateTrackerSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourcePage: string;
  sourceColumns: Column[];
  sourceRows: RowData[];
  onConfirm: (selectedColKeys: string[]) => void;
}

export const CreateTrackerSelectionModal: React.FC<
  CreateTrackerSelectionModalProps
> = ({ isOpen, onClose, sourcePage, sourceColumns, sourceRows, onConfirm }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedColumnKeys(
        new Set(sourceColumns.filter((c) => c.key !== "sr").map((c) => c.key)),
      );
      setSearchQuery("");
    }
  }, [isOpen, sourceColumns]);

  const getImageUrl = (val: any) => {
    if (!val) return "";
    let data = val;
    if (Array.isArray(val) && val.length > 0) {
      data = val[0];
    }
    const imgData =
      typeof data === "object" && data !== null
        ? data.data || data.url || data.name
        : data;
    if (!imgData) return "";
    if (
      typeof imgData === "string" &&
      (imgData.startsWith("data:image") || /^https?:\/\//i.test(imgData))
    ) {
      return imgData;
    }
    return `/uploads/${imgData}`;
  };

  const getCellValue = (row: RowData, col: Column) => {
    if (col.key === "sr") {
      const rowIndex = sourceRows.findIndex((r) => r.id === row.id);
      return String(rowIndex + 1);
    }
    if (col.key === "remaining_qty") {
      const rawTotal = String(row.total_qty || "");
      if (rawTotal.trim().startsWith("[")) {
        try {
          const totalSources = parseMultiSource(row.total_qty);
          const saleCols = sourceColumns.filter((c) => c.type === "sale_tracker");
          
          const remainingSources = totalSources.map((ts: any) => {
            let totalSaleForSource = 0;
            saleCols.forEach(sc => {
              const sales = parseMultiSource(row[sc.key]);
              const saleEntry = sales.find((s: any) => s.source === ts.source);
              if (saleEntry) totalSaleForSource += parseFloat(saleEntry.qty) || 0;
            });
            return {
              ...ts,
              qty: (parseFloat(ts.qty) || 0) - totalSaleForSource
            };
          });
          return JSON.stringify(remainingSources);
        } catch (err) {
          return "0";
        }
      }
      const total = parseFloat(String(row.total_qty || 0)) || 0;
      const saleCols = sourceColumns.filter((c) => c.type === "sale_tracker");
      const totalSales = saleCols.reduce(
        (sum, c) => sum + (parseFloat(String(row[c.key] || 0)) || 0),
        0,
      );
      return String(total - totalSales);
    }
    if (col.type === "sale_tracker") {
      return row[col.key] || "0";
    }
    return row[col.key] || "";
  };

  const exportColumns = useMemo(() => {
    return sourceColumns.filter(
      (c) => c.key === "sr" || selectedColumnKeys.has(c.key),
    );
  }, [sourceColumns, selectedColumnKeys]);

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

  const filteredRows = useMemo(() => {
    if (!deferredSearchQuery.trim()) return sourceRows;
    const activeQueries = [deferredSearchQuery.trim()].filter(Boolean);

    return sourceRows.filter((row) => {
      const colData = sourceColumns.map((col) => {
        if (col.key === "sr" || col.type === "image" || col.type === "file") return null;
        const val = getCellValue(row, col);
        const strVal = Array.isArray(val) ? val.join(" ") : val !== null && val !== undefined ? String(val) : "";
        const cleanVal = strVal.replace(/<[^>]*>/g, "").replace(/<br\s*\/?>/gi, " ").replace(/&nbsp;/gi, " ").toLowerCase();
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
  }, [sourceRows, sourceColumns, deferredSearchQuery]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`⚡ Create Linked Tracker Preview (${sourcePage})`}
      width="95vw"
      noScroll={true}
    >
      <div className="flex flex-col h-[85vh] p-4">
        <div className="flex gap-4 mb-4 shrink-0 items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-2 top-2.5 text-gray-400"
              size={16}
            />
            <Input
              className="pl-8"
              placeholder="Filter rows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 mb-4 shrink-0 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-700">
              Tracker Columns:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setSelectedColumnKeys(
                    new Set(
                      sourceColumns
                        .filter((c) => c.key !== "sr")
                        .map((c) => c.key),
                    ),
                  )
                }
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
            {sourceColumns
              .filter((c) => c.key !== "sr")
              .map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-600 hover:text-gray-900"
                >
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
                {exportColumns.map((c, i) => (
                  <th key={c.key} className="p-2 border text-left">
                    <div className="flex items-center gap-1">
                      {i + 1}. {c.name} {c.locked && "🔒"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {exportColumns.map((c) => {
                    const rawVal = getCellValue(row, c);
                    return (
                      <td
                        key={c.key}
                        className="p-2 border whitespace-pre-wrap break-words min-w-[150px]"
                      >
                        {(c.type === "image" || c.type === "file") &&
                        rawVal &&
                        getImageUrl(rawVal) ? (
                          <img
                            src={getImageUrl(rawVal)}
                            className="h-10 w-10 object-contain mx-auto rounded"
                            alt="img"
                            onError={(e) => {
                              // If image fails to load, maybe it's not an image file (e.g. PDF)
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          highlightText(
                            formatCellDisplay(rawVal),
                            deferredSearchQuery,
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={exportColumns.length}
                    className="p-4 text-center text-gray-500 font-medium"
                  >
                    No data matches your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-4 pt-4 border-t sticky bottom-0 bg-white z-10 pb-2 shrink-0">
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md">
            {exportColumns.length} active columns
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Cancel
            </Button>
            <Button
              variant="dark"
              onClick={() => onConfirm(Array.from(selectedColumnKeys))}
              className="flex items-center gap-2 !bg-[#2b579a] hover:!bg-[#1a3c6d] text-white"
              disabled={
                selectedColumnKeys.size === 0 && sourceColumns.length > 1
              }
            >
              <LayoutList size={16} /> ⚡ Create Linked Tracker
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
