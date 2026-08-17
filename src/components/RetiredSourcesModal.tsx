import React, { useState, useMemo } from 'react';
import { useModalLayer } from '../lib/modalStack';
import { Button, Input } from './ui';
import { X, ArchiveRestore, Search } from 'lucide-react';
import { MultiSourceItem } from '../lib/sourceArchiveUtils';

interface RetiredSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  sources: MultiSourceItem[];
  onUnretire: (sourceName: string) => void;
}

export const RetiredSourcesModal: React.FC<RetiredSourcesModalProps> = ({
  isOpen,
  onClose,
  sources,
  onUnretire
}) => {
  const zIndexVal = useModalLayer(isOpen);
  const [search, setSearch] = useState('');

  const filteredSources = useMemo(() => {
    if (!search.trim()) return sources;
    const lowerSearch = search.toLowerCase();
    return sources.filter(s => s.source.toLowerCase().includes(lowerSearch));
  }, [sources, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center p-3.5" style={{ zIndex: zIndexVal }}>
      <div 
        className="bg-white rounded-lg border border-[#cfd8dc] p-3.5 max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        style={{ width: 'min(500px, 95vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 shrink-0">
          <h3 className="m-0 text-[#2b579a] text-lg font-bold flex items-center gap-2">
            🗄️ Retired Sources
          </h3>
          <button className="bg-transparent border-0 text-[22px] cursor-pointer text-gray-600 hover:text-gray-900 flex" onClick={onClose} title="Close">
            <X size={24} />
          </button>
        </div>
        
        <div className="mb-3 shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-3 text-gray-400" size={16} />
            <Input
              type="text"
              placeholder="Search retired sources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 h-9"
              autoFocus
            />
          </div>
        </div>
        
        <div className="overflow-y-auto flex-1 -mx-3.5 px-3.5 pb-2">
          {filteredSources.length === 0 ? (
            <div className="text-center text-gray-500 my-8 text-sm font-bold opacity-70">
              {sources.length === 0 
                ? "No retired sources." 
                : "No retired sources match your search."}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredSources.map((src, i) => (
                <div 
                  key={`${src.source}-${i}`} 
                  className="flex items-center justify-between p-2.5 bg-[#f9fcff] border border-[#d7e3f6] rounded-md"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-800 text-[14px]">{src.source}</span>
                    <span className="text-[11px] text-gray-500 font-bold">Qty: {src.qty}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="h-7 text-[11px] flex items-center gap-1 border-purple-200 text-purple-700 hover:bg-purple-100 px-2"
                    onClick={() => {
                      onUnretire(src.source);
                    }}
                  >
                    <ArchiveRestore size={14} />
                    Un-retire
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
