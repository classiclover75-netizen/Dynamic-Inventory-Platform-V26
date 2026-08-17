import React, { useState, useRef, useEffect } from 'react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

interface RichDropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
}

export const RichDropdownSelect: React.FC<RichDropdownSelectProps> = ({
  value,
  onChange,
  options = [],
  disabled = false,
  placeholder = "Select an option..."
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const hasOptions = options && options.length > 0;

  return (
    <div className="relative w-full text-[13px]" ref={containerRef}>
      <div
        className={`w-full border border-[#cfd8dc] rounded px-2 py-1.5 min-h-[32px] flex justify-between items-center ${disabled ? 'opacity-70 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:border-[#2b579a] bg-white'}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="flex-1 overflow-hidden whitespace-nowrap overflow-ellipsis mr-2">
          {value ? (
            <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
        <span className="text-[10px] text-gray-400 shrink-0">▼</span>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full border border-[#cfd8dc] rounded mt-1 bg-white z-[9999] shadow-[0_4px_12px_rgba(0,0,0,0.15)] max-h-60 overflow-y-auto min-w-[200px]">
          <div
            className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 text-[#B8860B] font-bold text-[15px] italic"
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
          >
            — None —
          </div>
          {!hasOptions ? (
            <div className="px-3 py-2 text-gray-400 italic">No options defined for this column</div>
          ) : (
            options.map((opt, i) => (
              <div
                key={i}
                className="px-3 py-2 hover:bg-[#e8f0fe] cursor-pointer border-b border-gray-100 last:border-0"
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
              >
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(opt) }} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
