import React, { useState, useEffect, useRef } from "react";

interface RowPositionEditorProps {
  currentIndex: number;
  totalRows: number;
  rowId: string;
  onPositionChange: (sourceIndex: number, destIndex: number, rowId: string) => void;
}

export function RowPositionEditor({
  currentIndex,
  totalRows,
  rowId,
  onPositionChange,
}: RowPositionEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(currentIndex + 1));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleConfirm = () => {
    setIsEditing(false);
    const parsed = parseInt(inputValue, 10);
    
    if (isNaN(parsed)) {
      setInputValue(String(currentIndex + 1));
      return;
    }

    const clampedPos = Math.max(1, Math.min(parsed, totalRows));
    const newIndex = clampedPos - 1;
    
    if (newIndex !== currentIndex) {
      onPositionChange(currentIndex, newIndex, rowId);
    } else {
      setInputValue(String(currentIndex + 1));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setInputValue(String(currentIndex + 1));
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="w-10 text-xs border border-blue-400 rounded px-1 py-0.5 text-center focus:outline-none focus:ring-1 focus:ring-blue-500 absolute bg-white z-20 shadow-sm"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onWheel={(e) => e.currentTarget.blur()}
        onBlur={handleConfirm}
      />
    );
  }

  return (
    <div
      onClick={() => {
        setInputValue(String(currentIndex + 1));
        setIsEditing(true);
      }}
      className="text-gray-400 hover:text-gray-800 hover:bg-gray-100 px-1 py-0.5 rounded cursor-pointer text-xs font-medium transition-colors select-none min-w-[20px] text-center"
      title="Jump to position"
    >
      {currentIndex + 1}
    </div>
  );
}
