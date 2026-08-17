import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import { isLocked } from '../lib/sourceLockUtils';
import { resolveBorderAccent } from '../lib/colorRender';
import { Input } from './ui';

interface ArchivedSaleSourceAdderProps {
  hiddenSources: any[];
  onSelect: (source: string) => void;
  onOpenChange?: (open: boolean) => void;
}

export function ArchivedSaleSourceAdder({ hiddenSources, onSelect, onOpenChange }: ArchivedSaleSourceAdderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const filteredSources = useMemo(() => {
    if (!search.trim()) return hiddenSources;
    const lowerQuery = search.toLowerCase();
    return hiddenSources.filter(ts => ts.source.toLowerCase().includes(lowerQuery));
  }, [hiddenSources, search]);

  if (hiddenSources.length === 0) return null;

  return (
    <div className="relative mt-1 w-full" ref={containerRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-center py-1 opacity-40 hover:opacity-100 hover:bg-gray-100 rounded border border-dashed border-gray-300 transition-all text-gray-500"
      >
        <Plus size={14} />
      </button>
      {isOpen && (
        <div 
          className="absolute left-0 mt-1 w-48 bg-white border shadow-lg rounded z-[99999] flex flex-col"
          style={{ top: '100%' }}
        >
          <div className="px-2 py-1 text-xs font-bold text-gray-500 uppercase border-b shrink-0">Add Record For:</div>
          <div className="p-1 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 text-xs border-gray-300"
                placeholder="Search sources..."
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto py-1 custom-scrollbar">
            {filteredSources.length === 0 ? (
              <div className="p-2 text-center text-xs text-gray-500">No sources found.</div>
            ) : (
              filteredSources.map((ts, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(false);
                    onSelect(ts.source);
                  }}
                  className="w-full flex items-center text-left px-3 py-1.5 text-sm hover:bg-blue-50 text-gray-700 truncate"
                >
                  <span className="inline-block shrink-0 w-2 h-2 rounded-full mr-2" style={{ backgroundColor: resolveBorderAccent(ts.color) }}></span>
                  {isLocked(ts) && <span className="mr-1 text-[10px]">🔒</span>}
                  <span className="truncate">{ts.source}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
