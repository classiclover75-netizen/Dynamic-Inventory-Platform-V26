import React, { useCallback, useState } from "react";
import { DropletOff, Pipette, Plus, Trash2, X } from "lucide-react";
import {
  MAIN_PRESET_GRID,
  STANDARD_COLORS,
  addSavedColor,
  isEyeDropperSupported,
  pickColorFromScreen,
  readSavedColors,
  removeSavedColor,
} from "../lib/colorUtils";
import { parseColorToPickerValue } from "../lib/colorRender";

interface ColorPaletteGridProps {
  value?: string;
  onSelect: (hex: string) => void;
  onOpenCustom: () => void;
  onReset?: () => void;
}

const SWATCH_CLASS = "rounded-full border border-gray-200 flex items-center justify-center cursor-pointer transition-transform hover:scale-125 origin-center p-0";

function swatchStyle(size: number): React.CSSProperties {
  return { width: `${size}px`, height: `${size}px` };
}

export const ColorPaletteGrid = React.memo(function ColorPaletteGrid({
  value,
  onSelect,
  onOpenCustom,
  onReset
}: ColorPaletteGridProps) {
  const [savedColors, setSavedColors] = useState(() => readSavedColors());
  const [deleteMode, setDeleteMode] = useState(false);

  const currentHex = parseColorToPickerValue(value)?.hex;
  const selectedHex = currentHex?.toLowerCase();
  const eyeDropperSupported = isEyeDropperSupported();

  const inMainGrid = selectedHex
    ? MAIN_PRESET_GRID.some(row => row.some(c => c.toLowerCase() === selectedHex))
    : false;
  const inStandard = selectedHex
    ? STANDARD_COLORS.some(c => c.toLowerCase() === selectedHex)
    : false;
  const isCurrentSaved = selectedHex
    ? savedColors.some(c => c.toLowerCase() === selectedHex)
    : false;

  // Shows the box's current colour in the CUSTOM row for this viewing only,
  // without writing it to the saved-colours list. Only "+" and the eyedropper save permanently.
  const showCurrentAsTemporary = Boolean(currentHex) && !inMainGrid && !inStandard && !isCurrentSaved;
  const customDisplayColors = showCurrentAsTemporary ? [...savedColors, currentHex as string] : savedColors;

  const handleEyeDropper = useCallback(async () => {
    const hex = await pickColorFromScreen();
    if (hex) {
      setSavedColors(addSavedColor(hex.toUpperCase()));
      onSelect(hex);
    }
  }, [onSelect]);

  const handleRemoveSaved = useCallback((hex: string) => {
    const next = removeSavedColor(hex);
    setSavedColors(next);
    if (next.length === 0) setDeleteMode(false);
  }, []);

  return (
    <div className="w-[245px] bg-white border border-gray-300 rounded-md shadow-xl p-3 select-none text-left">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          title="Reset to no colour"
          aria-label="Reset to no colour"
          className="flex items-center gap-2 text-[13px] text-gray-700 pb-2 cursor-pointer hover:bg-gray-100 p-1 -ml-1 rounded w-full border-none bg-transparent"
        >
          <DropletOff size={18} className="text-gray-600" />
          <span className="font-medium text-gray-800">Reset</span>
        </button>
      )}

      <div className="grid grid-cols-10 gap-0.5 pb-2">
        {MAIN_PRESET_GRID.map((row, rowIndex) =>
          row.map((color, colIndex) => {
            const isSelected = color.toLowerCase() === selectedHex;
            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                title={color}
                aria-label={color}
                onClick={() => onSelect(color)}
                className={SWATCH_CLASS}
                style={{ ...swatchStyle(21), backgroundColor: color }}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-gray-200 my-2 -mx-3" />

      <div className="flex items-center gap-1.5 pb-2">
        <span className="font-medium text-[13px] text-gray-800 uppercase tracking-wide">Standard</span>
      </div>
      <div className="grid grid-cols-8 gap-2 pb-2">
        {STANDARD_COLORS.map(color => {
          const isSelected = color.toLowerCase() === selectedHex;
          return (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={color}
              onClick={() => onSelect(color)}
              className={SWATCH_CLASS}
              style={{ ...swatchStyle(23), backgroundColor: color }}
            >
              {isSelected && (
                <svg className="w-3.5 h-3.5 text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-gray-200 my-2 -mx-3" />

      <div className="flex items-center justify-between gap-1.5 pb-2">
        <span className="font-medium text-[13px] text-gray-800 uppercase tracking-wide">Custom</span>
        {savedColors.length > 0 && (
          <button
            type="button"
            onClick={() => setDeleteMode(prev => !prev)}
            title={deleteMode ? "Exit delete mode" : "Delete a saved colour"}
            aria-label={deleteMode ? "Exit delete mode" : "Delete a saved colour"}
            aria-pressed={deleteMode}
            className={`inline-flex items-center justify-center w-5 h-5 rounded border-none cursor-pointer transition-colors ${deleteMode ? "bg-red-100 text-red-600" : "bg-transparent text-gray-400 hover:bg-gray-100 hover:text-red-600"}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <div className="flex items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenCustom}
          title="Add a custom colour"
          aria-label="Add a custom colour"
          className="flex items-center justify-center w-6 h-6 bg-white rounded-full border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors"
        >
          <Plus size={16} className="text-gray-600" />
        </button>
        <button
          type="button"
          onClick={handleEyeDropper}
          disabled={!eyeDropperSupported}
          title={eyeDropperSupported ? "Pick a custom color from the screen" : "Browser does not support the screen colour picker"}
          aria-label="Pick a custom color from the screen"
          className="flex items-center justify-center w-6 h-6 bg-white rounded-full border border-gray-300 cursor-pointer hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Pipette size={16} className="text-gray-600" />
        </button>
        {customDisplayColors.map(color => {
          const isSelected = color.toLowerCase() === selectedHex;
          const isPersisted = savedColors.some(c => c.toLowerCase() === color.toLowerCase());
          return (
            <span key={color} className="relative w-6 h-6">
              <button
                type="button"
                title={deleteMode && isPersisted ? `Delete ${color}` : color}
                aria-label={deleteMode && isPersisted ? `Delete ${color}` : `Use ${color}`}
                onClick={() => (deleteMode && isPersisted ? handleRemoveSaved(color) : onSelect(color))}
                className="w-full h-full rounded-full border border-gray-300 cursor-pointer hover:scale-110 transition-transform p-0"
                style={{ backgroundColor: color }}
              >
                {!deleteMode && isSelected && (
                  <svg className="w-3.5 h-3.5 mx-auto text-white drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              {deleteMode && isPersisted && (
                <span className="absolute -top-1 -left-1 w-[14px] h-[14px] rounded-full bg-white border border-gray-300 shadow-sm grid place-content-center pointer-events-none z-[2]">
                  <X size={9} strokeWidth={3} className="text-gray-700" />
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
});
