import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input, Button } from './ui';
import { MultiSourceItem } from '../lib/sourceArchiveUtils';
import { getCreationTooltip } from '../lib/sourceTimestamp';

export function RetiredSourcePickerPopup({
  retiredSources,
  onClose,
  onDone
}: {
  retiredSources: MultiSourceItem[];
  onClose: () => void;
  onDone: (selectedSources: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(retiredSources.map(s => s.source)));
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Sort by retiredAt DESC
  const sortedSources = useMemo(() => {
    return [...retiredSources].sort((a, b) => {
      const aTime = a.retiredAt || 0;
      const bTime = b.retiredAt || 0;
      return bTime - aTime;
    });
  }, [retiredSources]);

  const filteredSources = useMemo(() => {
    if (!search.trim()) return sortedSources;
    const lowerQuery = search.toLowerCase();
    return sortedSources.filter(s => s.source.toLowerCase().includes(lowerQuery));
  }, [sortedSources, search]);

  const handleToggle = (source: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const handleSelectAll = () => setSelected(new Set(retiredSources.map(s => s.source)));
  const handleSelectNone = () => setSelected(new Set());

  return (
    <div
      ref={popupRef}
      className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow-xl z-50 flex flex-col text-sm text-gray-800"
    >
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1 text-xs border-gray-300"
            placeholder="Search retired sources..."
            autoFocus
          />
        </div>
      </div>
      <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100 bg-gray-50 text-xs">
        <button onClick={handleSelectAll} className="text-blue-600 hover:underline">Select All</button>
        <button onClick={handleSelectNone} className="text-gray-500 hover:underline">Select None</button>
      </div>
      <div className="max-h-48 overflow-y-auto p-1 custom-scrollbar">
        {filteredSources.length === 0 ? (
          <div className="p-2 text-center text-xs text-gray-500">No sources found.</div>
        ) : (
          filteredSources.map(s => (
            <label key={s.source} title={getCreationTooltip(s)} className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 cursor-pointer rounded">
              <input
                type="checkbox"
                checked={selected.has(s.source)}
                onChange={() => handleToggle(s.source)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="truncate">{s.source}</span>
              <span className="ml-auto text-[10px] text-gray-400 font-mono">{s.qty}</span>
            </label>
          ))
        )}
      </div>
      <div className="p-2 border-t border-gray-100">
        <Button
          variant="blue"
          className="w-full text-xs py-1"
          disabled={selected.size === 0}
          onClick={() => onDone(Array.from(selected))}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
