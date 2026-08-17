import React, { useState, useRef, useEffect, useMemo } from "react";
import { Input } from "./ui";
import { parseMultiSource } from "../lib/appUtils";
import { RowData } from "../types";
import { formatSourceNumber } from "../lib/multiSourceHelpers";
import { resolveChipRender } from "../lib/colorRender";

export interface SourceSuggestion {
  source: string;
  color: string;
}

export function useSourceSuggestions(allRows: RowData[], currentBlocks: Record<string, any>[]) {
  return useMemo(() => {
    const sourcesMap = new Map<string, SourceSuggestion>();
    
    // 1. Scan existing rows
    (allRows || []).forEach((row) => {
      const parsed = parseMultiSource(row.total_qty);
      parsed.forEach((s: any) => {
        if (s.source && s.source.trim()) {
          const lower = s.source.trim().toLowerCase();
          if (!sourcesMap.has(lower)) {
            sourcesMap.set(lower, {
              source: s.source.trim(),
              color: s.color || "bg-gray-100 text-gray-800 border-gray-200"
            });
          }
        }
      });
    });

    // 2. Scan currently edited blocks
    (currentBlocks || []).forEach((block) => {
      if (block.total_qty) {
        const parsed = parseMultiSource(block.total_qty);
        parsed.forEach((s: any) => {
          if (s.source && s.source.trim()) {
            const lower = s.source.trim().toLowerCase();
            if (!sourcesMap.has(lower)) {
              sourcesMap.set(lower, {
                source: s.source.trim(),
                color: s.color || "bg-gray-100 text-gray-800 border-gray-200"
              });
            }
          }
        });
      }
    });

    return Array.from(sourcesMap.values());
  }, [allRows, currentBlocks]);
}

interface SourceAutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  suggestions: SourceSuggestion[];
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  isExistingSource?: boolean;
  dropdownPosition?: "bottom" | "top";
  suggestionsEnabled?: boolean;
}

export const SourceAutocompleteInput: React.FC<SourceAutocompleteInputProps> = ({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  wrapperClassName = "",
  isExistingSource = false,
  dropdownPosition = "bottom",
  suggestionsEnabled = false,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0, width: 0, bottom: 0, availableBottom: 0, availableTop: 0 });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const updateDropdownRect = () => {
    if (wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      setDropdownRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        bottom: rect.bottom,
        availableBottom: window.innerHeight - rect.bottom,
        availableTop: rect.top
      });
    }
  };

  useEffect(() => {
    if (showSuggestions) {
      updateDropdownRect();
    }
  }, [showSuggestions, value]);

  useEffect(() => {
    if (!showSuggestions) return;
    const handleScroll = (e: Event) => {
      // Don't reposition if the scroll happened inside the dropdown itself
      if (e.target && (e.target as HTMLElement).closest && (e.target as HTMLElement).closest('.source-autocomplete-dropdown')) {
        return;
      }
      updateDropdownRect();
    };
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll, true);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll, true);
    };
  }, [showSuggestions]);

  const filtered = (suggestions || []).filter(s => s.source.toLowerCase().includes((value || "").toLowerCase()));

  let finalPosition = dropdownPosition;
  let maxHeight = 192; // 48 * 4 = 192px max-h-48 default
  
  if (dropdownPosition === "bottom") {
     const footerHeight = 70; // safe margin for footer
     if (dropdownRect.availableBottom < 120 && dropdownRect.availableTop > dropdownRect.availableBottom) {
        finalPosition = "top";
        maxHeight = Math.min(192, dropdownRect.availableTop - 10);
     } else {
        maxHeight = Math.min(192, dropdownRect.availableBottom - footerHeight);
     }
  } else {
     if (dropdownRect.availableTop < 120 && dropdownRect.availableBottom > dropdownRect.availableTop) {
        finalPosition = "bottom";
        const footerHeight = 70;
        maxHeight = Math.min(192, dropdownRect.availableBottom - footerHeight);
     } else {
        maxHeight = Math.min(192, dropdownRect.availableTop - 10);
     }
  }
  
  maxHeight = Math.max(80, maxHeight); // clamp minimum

  return (
    <div className={`${wrapperClassName || (isExistingSource ? "" : "flex-1 min-w-[80px]")} relative`} ref={wrapperRef}>
      {isExistingSource ? (
        <input
          type="text"
          className={className}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
        />
      ) : (
        <Input
          placeholder={placeholder}
          className={className}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
        />
      )}

      {suggestionsEnabled && showSuggestions && filtered.length > 0 && (
        <div 
          className="source-autocomplete-dropdown fixed z-[99999] min-w-[140px] overflow-y-auto bg-white border border-gray-300 rounded shadow-lg p-1.5 flex flex-col gap-1.5"
          style={{
            left: dropdownRect.left,
            ...(finalPosition === "top" 
              ? { bottom: window.innerHeight - dropdownRect.top + 4 } 
              : { top: dropdownRect.bottom + 4 }),
            minWidth: Math.max(dropdownRect.width, 140),
            maxHeight: `${maxHeight}px`
          }}
        >
          {filtered.map((s, idx) => {
            const render = resolveChipRender(s.color);
            return (
              <div
                key={idx}
                className={`px-2 py-0.5 rounded text-[14px] font-bold border flex items-center justify-center cursor-pointer transition-opacity hover:opacity-80 ${render.kind === 'class' ? render.className : ""}`}
                style={render.kind === 'style' ? render.style : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(s.source);
                  setShowSuggestions(false);
                }}
              >
                <span className="mr-1">{formatSourceNumber(idx)}</span>{s.source}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
