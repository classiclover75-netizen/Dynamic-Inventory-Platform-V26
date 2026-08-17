import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface OverviewColumnResizeHandleProps {
  colId: string;
  width: number;
  startResize: (e: React.MouseEvent<HTMLDivElement, MouseEvent>, colId: string) => void;
  resetCol: (colId: string) => void;
  columnName?: string;
}

export function OverviewColumnResizeHandle({
  colId,
  width,
  startResize,
  resetCol,
  columnName,
}: OverviewColumnResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <>
      <div
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-blue-400/60 z-20"
        onMouseEnter={(e) => {
          setIsHovered(true);
          setMousePos({ x: e.clientX, y: e.clientY });
        }}
        onMouseMove={(e) => {
          setMousePos({ x: e.clientX, y: e.clientY });
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        onMouseDown={(e) => {
          setIsDragging(true);
          setMousePos({ x: e.clientX, y: e.clientY });
          startResize(e, colId);
        }}
        onDoubleClick={() => resetCol(colId)}
      />
      {(isDragging || isHovered) &&
        createPortal(
          <div
            className="fixed z-[10000] pointer-events-none bg-black/90 text-white text-[11px] font-bold px-2 py-0.5 rounded shadow-xl whitespace-nowrap"
            style={{
              left: `${mousePos.x}px`,
              top: `${mousePos.y - 40}px`,
              transform: "translateX(-50%)",
            }}
          >
            {Math.round(width)}px
          </div>,
          document.body
        )}
    </>
  );
}
