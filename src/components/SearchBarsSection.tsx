import React, { useState, useRef, useEffect } from "react";
import { Input } from "./ui";
import { X, Plus, Undo2, Redo2, History } from "lucide-react";
import { buildRowCountSummary } from "../lib/rowCountSummary";

export const SearchBarsSection = ({
  activePage,
  activeConfig,
  isAnyModalOpen,
  pageSearchQueries,
  setPageSearchQueries,
  setSecondarySearchQuery,
  setActiveSearchView,
  primarySearchTags,
  setPrimarySearchTags,
  secondarySearchTags,
  setSecondarySearchTags,
  maxSearchHistory,
  visibleRowCount,
  totalRowCount,
  isSearchActive,
}: any) => {

  const primaryInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);

  type HistoryEntry = { value: string; timestamp: number };
  const [primarySearchInput, setPrimarySearchInput] = useState("");
  const [secondarySearchInput, setSecondarySearchInput] = useState("");

  const [primHist, setPrimHist] = useState<{
    entries: HistoryEntry[];
    pointer: number;
  }>({ entries: [{ value: "", timestamp: Date.now() }], pointer: 0 });
  const [showPrimHist, setShowPrimHist] = useState(false);
  const primHistRef = useRef<HTMLDivElement>(null);
  const isPrimUndoRef = useRef(false);

  const [secHist, setSecHist] = useState<{
    entries: HistoryEntry[];
    pointer: number;
  }>({ entries: [{ value: "", timestamp: Date.now() }], pointer: 0 });
  const [showSecHist, setShowSecHist] = useState(false);
  const secHistRef = useRef<HTMLDivElement>(null);
  const isSecUndoRef = useRef(false);

  const activeSecPage =
    activeConfig?.secondarySearchPage;

  useEffect(() => {
    const pVal = pageSearchQueries[activePage] || "";
    const sVal = activeSecPage ? pageSearchQueries[activeSecPage] || "" : "";
    setPrimarySearchInput(pVal);
    setSecondarySearchInput(sVal);
    setActiveSearchView("primary");
    setPrimHist({
      entries: [{ value: pVal, timestamp: Date.now() }],
      pointer: 0,
    });
    setSecHist({
      entries: [{ value: sVal, timestamp: Date.now() }],
      pointer: 0,
    });
  }, [activePage, activeSecPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPageSearchQueries((prev) =>
        prev[activePage] === primarySearchInput
          ? prev
          : { ...prev, [activePage]: primarySearchInput },
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [primarySearchInput, activePage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSecondarySearchQuery(secondarySearchInput);
      if (activeSecPage)
        setPageSearchQueries((prev) =>
          prev[activeSecPage] === secondarySearchInput
            ? prev
            : { ...prev, [activeSecPage]: secondarySearchInput },
        );
    }, 250);
    return () => clearTimeout(timer);
  }, [secondarySearchInput, activeSecPage]);

  useEffect(() => {
    if (isPrimUndoRef.current) {
      isPrimUndoRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPrimHist((prev) => {
        if (prev.entries[prev.pointer]?.value === primarySearchInput)
          return prev;
        const newEntries = [
          ...prev.entries.slice(0, prev.pointer + 1),
          { value: primarySearchInput, timestamp: Date.now() },
        ];
        while (newEntries.length > maxSearchHistory) newEntries.shift();
        return { entries: newEntries, pointer: newEntries.length - 1 };
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [primarySearchInput, maxSearchHistory]);

  useEffect(() => {
    if (isSecUndoRef.current) {
      isSecUndoRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setSecHist((prev) => {
        if (prev.entries[prev.pointer]?.value === secondarySearchInput)
          return prev;
        const newEntries = [
          ...prev.entries.slice(0, prev.pointer + 1),
          { value: secondarySearchInput, timestamp: Date.now() },
        ];
        while (newEntries.length > maxSearchHistory) newEntries.shift();
        return { entries: newEntries, pointer: newEntries.length - 1 };
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [secondarySearchInput, maxSearchHistory]);

  const formatHistDate = (ts: number) => {
    const d = new Date(ts);
    const time = d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      })
      .replace(/\s/g, "-");
    const date = `${d.getDate()}-${d.toLocaleString("en-US", { month: "long" })}-${d.getFullYear()}`;
    return `${time}, ${date}`;
  };

  const handlePrimUndo = () =>
    setPrimHist((prev) => {
      if (prev.pointer > 0) {
        isPrimUndoRef.current = true;
        setPrimarySearchInput(prev.entries[prev.pointer - 1].value);
        return { ...prev, pointer: prev.pointer - 1 };
      }
      return prev;
    });
  const handlePrimRedo = () =>
    setPrimHist((prev) => {
      if (prev.pointer < prev.entries.length - 1) {
        isPrimUndoRef.current = true;
        setPrimarySearchInput(prev.entries[prev.pointer + 1].value);
        return { ...prev, pointer: prev.pointer + 1 };
      }
      return prev;
    });
  const handleSecUndo = () =>
    setSecHist((prev) => {
      if (prev.pointer > 0) {
        isSecUndoRef.current = true;
        setSecondarySearchInput(prev.entries[prev.pointer - 1].value);
        return { ...prev, pointer: prev.pointer - 1 };
      }
      return prev;
    });
  const handleSecRedo = () =>
    setSecHist((prev) => {
      if (prev.pointer < prev.entries.length - 1) {
        isSecUndoRef.current = true;
        setSecondarySearchInput(prev.entries[prev.pointer + 1].value);
        return { ...prev, pointer: prev.pointer + 1 };
      }
      return prev;
    });

  const handleAddPrimaryTag = () => {
    if (primarySearchInput.trim()) {
      setPrimarySearchTags((prev) => [...prev, primarySearchInput.trim()]);
      setPrimarySearchInput("");
    }
  };

  const handleRemovePrimaryTag = (index: number) => {
    setPrimarySearchTags((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSecondaryTag = () => {
    if (secondarySearchInput.trim()) {
      setSecondarySearchTags((prev) => [...prev, secondarySearchInput.trim()]);
      setSecondarySearchInput("");
    }
  };

  const handleRemoveSecondaryTag = (index: number) => {
    setSecondarySearchTags((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePrimKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddPrimaryTag();
    }
    if (e.key === "Backspace" && primarySearchInput === "")
      setPrimarySearchTags((prev) => prev.slice(0, -1));
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      e.shiftKey ? handlePrimRedo() : handlePrimUndo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      handlePrimRedo();
    }
  };

  const handleSecKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSecondaryTag();
    }
    if (e.key === "Backspace" && secondarySearchInput === "")
      setSecondarySearchTags((prev) => prev.slice(0, -1));
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      e.shiftKey ? handleSecRedo() : handleSecUndo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      handleSecRedo();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        primHistRef.current &&
        !primHistRef.current.contains(event.target as Node)
      )
        setShowPrimHist(false);
      if (
        secHistRef.current &&
        !secHistRef.current.contains(event.target as Node)
      )
        setShowSecHist(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  return (
      <div className="bg-white border border-[#d8d8d8] rounded-md p-2 flex flex-col md:flex-row gap-2">
        {(activeConfig.searchBarOrder || ["primary", "secondary"]).map(
          (type) => {
            if (type === "primary") {
              return (
                <div key="primary" className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1 flex items-center gap-1 border-2 border-[#217346] rounded px-1 min-w-0 bg-white">
                    <div className="flex flex-wrap gap-1 max-w-[60%] overflow-hidden">
                      {primarySearchTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-1 bg-green-100 text-[#217346] text-[11px] font-bold px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemovePrimaryTag(idx)}
                            className="hover:text-red-500 transition-colors border-0 bg-transparent p-0 cursor-pointer flex items-center"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="relative flex-1 min-w-[100px]">
                      <Input
                        ref={primaryInputRef}
                        key={`prim-${isAnyModalOpen}`}
                        onBeforeInput={(e: any) => {
                          if (
                            e.nativeEvent &&
                            e.nativeEvent.inputType &&
                            e.nativeEvent.inputType.startsWith("history")
                          )
                            e.preventDefault();
                        }}
                        className="border-0 focus:ring-0 text-sm w-full pr-14 h-8 min-w-0 overflow-x-auto whitespace-nowrap"
                        value={primarySearchInput}
                        readOnly={isAnyModalOpen}
                        onChange={(e) => {
                          setPrimarySearchInput(e.target.value);
                          if (
                            e.target.value &&
                            activeConfig.independentSearchBars === false
                          )
                            setSecondarySearchInput("");
                        }}
                        onFocus={() => {
                          setActiveSearchView("primary");
                        }}
                        onKeyDown={handlePrimKeyDown}
                      />
                      {!primarySearchInput && primarySearchTags.length === 0 && (
                        <div 
                          className="absolute inset-y-0 left-1 right-12 flex items-center overflow-x-auto whitespace-nowrap text-gray-400 text-sm cursor-text select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                          onClick={() => primaryInputRef.current?.focus()}
                        >
                          🔍 Search Data {activePage ? <>For "<strong>{activePage}</strong>"</> : ""}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleAddPrimaryTag}
                      className="p-1 text-[#217346] hover:bg-green-100 rounded transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div
                    className="flex items-center gap-1.5 relative"
                    ref={primHistRef}
                  >
                    <button
                      title="Undo (Ctrl+Z)"
                      onClick={handlePrimUndo}
                      disabled={primHist.pointer === 0}
                      className="p-1.5 text-[#217346] hover:bg-green-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      title="Redo (Ctrl+Y)"
                      onClick={handlePrimRedo}
                      disabled={
                        primHist.pointer === primHist.entries.length - 1
                      }
                      className="p-1.5 text-[#217346] hover:bg-green-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <Redo2 size={18} />
                    </button>
                    <div className="relative">
                      <button
                        title="Search History"
                        onClick={() => setShowPrimHist(!showPrimHist)}
                        className="p-1.5 text-[#217346] hover:bg-green-100 rounded transition-colors border-0 bg-transparent cursor-pointer"
                      >
                        <History size={18} />
                      </button>
                      {showPrimHist && (
                        <div className="absolute top-full right-0 mt-2 w-[280px] bg-white border border-gray-200 shadow-2xl rounded-lg z-50 py-1.5 max-h-[300px] overflow-y-auto">
                          <div className="px-3 py-1.5 border-b border-gray-100 text-[13px] font-bold text-gray-400 uppercase tracking-wider">
                            Search History (Max {maxSearchHistory})
                          </div>
                          {primHist.entries
                            .map((entry, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  setPrimHist((prev) => {
                                    isPrimUndoRef.current = true;
                                    setPrimarySearchInput(entry.value);
                                    return { ...prev, pointer: idx };
                                  });
                                  setShowPrimHist(false);
                                }}
                                className={`px-3 py-2 text-[12px] cursor-pointer flex justify-between items-center transition-all ${idx === primHist.pointer ? "bg-[#e8f0fe] font-bold text-[#217346] border-l-[3px] border-[#217346]" : "text-gray-700 hover:bg-gray-50"}`}
                              >
                                <span className="truncate max-w-[140px]">
                                  {entry.value || (
                                    <span className="italic text-gray-400">
                                      Empty State
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] opacity-70 shrink-0 font-medium ml-2">
                                  {formatHistDate(entry.timestamp)}
                                </span>
                              </div>
                            ))
                            .reverse()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            } else if (
              type === "secondary" &&
              activeConfig.secondarySearchPage
            ) {
              return (
                <div key="secondary" className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1 flex items-center gap-1 border-2 border-[#2b579a] rounded px-1 min-w-0 bg-white">
                    <div className="flex flex-wrap gap-1 max-w-[60%] overflow-hidden">
                      {secondarySearchTags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="flex items-center gap-1 bg-blue-100 text-[#2b579a] text-[11px] font-bold px-2 py-0.5 rounded-full border border-blue-200 whitespace-nowrap"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveSecondaryTag(idx)}
                            className="hover:text-red-500 transition-colors border-0 bg-transparent p-0 cursor-pointer flex items-center"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="relative flex-1 min-w-[100px]">
                      <Input
                        ref={secondaryInputRef}
                        key={`sec-${isAnyModalOpen}`}
                        onBeforeInput={(e: any) => {
                          if (
                            e.nativeEvent &&
                            e.nativeEvent.inputType &&
                            e.nativeEvent.inputType.startsWith("history")
                          )
                            e.preventDefault();
                        }}
                        className="border-0 focus:ring-0 text-sm w-full pr-14 h-8 min-w-0 overflow-x-auto whitespace-nowrap"
                        value={secondarySearchInput}
                        readOnly={isAnyModalOpen}
                        onChange={(e) => {
                          setSecondarySearchInput(e.target.value);
                          if (
                            e.target.value &&
                            activeConfig.independentSearchBars === false
                          )
                            setPrimarySearchInput("");
                        }}
                        onFocus={() => {
                          setActiveSearchView("secondary");
                        }}
                        onKeyDown={handleSecKeyDown}
                      />
                      {!secondarySearchInput && secondarySearchTags.length === 0 && (
                        <div 
                          className="absolute inset-y-0 left-1 right-12 flex items-center overflow-x-auto whitespace-nowrap text-gray-400 text-sm cursor-text select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                          onClick={() => secondaryInputRef.current?.focus()}
                        >
                          🔍 Search Data For "<strong>{activeConfig.secondarySearchPage}</strong>" (Secondary Search)
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleAddSecondaryTag}
                      className="p-1 text-[#2b579a] hover:bg-blue-100 rounded transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                  <div
                    className="flex items-center gap-1.5 relative"
                    ref={secHistRef}
                  >
                    <button
                      title="Undo (Ctrl+Z)"
                      onClick={handleSecUndo}
                      disabled={secHist.pointer === 0}
                      className="p-1.5 text-[#2b579a] hover:bg-blue-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <Undo2 size={18} />
                    </button>
                    <button
                      title="Redo (Ctrl+Y)"
                      onClick={handleSecRedo}
                      disabled={secHist.pointer === secHist.entries.length - 1}
                      className="p-1.5 text-[#2b579a] hover:bg-blue-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors border-0 bg-transparent cursor-pointer"
                    >
                      <Redo2 size={18} />
                    </button>
                    <div className="relative">
                      <button
                        title="Search History"
                        onClick={() => setShowSecHist(!showSecHist)}
                        className="p-1.5 text-[#2b579a] hover:bg-blue-100 rounded transition-colors border-0 bg-transparent cursor-pointer"
                      >
                        <History size={18} />
                      </button>
                      {showSecHist && (
                        <div className="absolute top-full right-0 mt-2 w-[280px] bg-white border border-gray-200 shadow-2xl rounded-lg z-50 py-1.5 max-h-[300px] overflow-y-auto">
                          <div className="px-3 py-1.5 border-b border-gray-100 text-[13px] font-bold text-gray-400 uppercase tracking-wider">
                            Search History (Max {maxSearchHistory})
                          </div>
                          {secHist.entries
                            .map((entry, idx) => (
                              <div
                                key={idx}
                                onClick={() => {
                                  setSecHist((prev) => {
                                    isSecUndoRef.current = true;
                                    setSecondarySearchInput(entry.value);
                                    return { ...prev, pointer: idx };
                                  });
                                  setShowSecHist(false);
                                }}
                                className={`px-3 py-2 text-[12px] cursor-pointer flex justify-between items-center transition-all ${idx === secHist.pointer ? "bg-[#e8f0fe] font-bold text-[#2b579a] border-l-[3px] border-[#2b579a]" : "text-gray-700 hover:bg-gray-50"}`}
                              >
                                <span className="truncate max-w-[140px]">
                                  {entry.value || (
                                    <span className="italic text-gray-400">
                                      Empty State
                                    </span>
                                  )}
                                </span>
                                <span className="text-[10px] opacity-70 shrink-0 font-medium ml-2">
                                  {formatHistDate(entry.timestamp)}
                                </span>
                              </div>
                            ))
                            .reverse()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          },
        )}
        {visibleRowCount !== undefined && totalRowCount !== undefined && (
          (() => {
            const summary = buildRowCountSummary(visibleRowCount, totalRowCount, !!isSearchActive);
            const toneClasses = {
              idle: "bg-gray-100 text-gray-500 border-gray-300",
              active: "bg-[#eaf3ed] text-[#217346] border-[#217346]",
              empty: "bg-red-50 text-red-800 border-red-300",
            };
            return (
              <div
                className={`rounded-full text-xs font-bold px-3 py-1 flex items-center justify-center shrink-0 self-center border ${toneClasses[summary.tone]}`}
              >
                {summary.text}
              </div>
            );
          })()
        )}
      </div>
  );
};
