import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pipette, Plus, Trash2, X } from "lucide-react";
import {
  DEFAULT_SAVED_COLORS,
  MAX_SAVED_COLORS,
  Rgb,
  formatRgba,
  hsvToRgb,
  isValidHex,
  parseHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from "../lib/colorUtils";
import { buildCustomColor } from "../lib/colorRender";


export interface ColorPickerValue {
  hex: string;
  alpha: number;
  rgb: Rgb;
  chipClass: string;
}

interface ColorPickerPanelProps {
  initialValue?: string;
  onChange?: (val: ColorPickerValue) => void;
  className?: string;
  onRequestClose?: () => void;
  onConfirm?: () => void;
}

const SAVED_COLORS_STORAGE_KEY = "inventory_saved_colors";

const CHECKER_STYLE: React.CSSProperties = {
  backgroundImage: "linear-gradient(45deg, rgba(128, 136, 150, 0.32) 25%, transparent 25%), linear-gradient(-45deg, rgba(128, 136, 150, 0.32) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128, 136, 150, 0.32) 75%), linear-gradient(-45deg, transparent 75%, rgba(128, 136, 150, 0.32) 75%)",
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0"
};

const HUE_GRADIENT = "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)";

function readSavedColors(): string[] {
  try {
    const stored = localStorage.getItem(SAVED_COLORS_STORAGE_KEY);
    if (!stored) return [...DEFAULT_SAVED_COLORS];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [...DEFAULT_SAVED_COLORS];
    const valid = parsed
      .filter(isValidHex)
      .map(parseHex)
      .filter((rgb): rgb is Rgb => rgb !== null)
      .map(rgbToHex);
    return valid.slice(0, MAX_SAVED_COLORS);
  } catch (e) {
    return [...DEFAULT_SAVED_COLORS];
  }
}

function resolveSeed(seed?: string): { h: number; s: number; v: number } {
  const fallback = { h: 217, s: 72, v: 60 };
  if (typeof seed !== 'string') return fallback;
  
  // Custom formatted color parsing
  if (seed.startsWith("custom:")) {
    const parts = seed.substring(7).split("@");
    if (parts.length > 0) {
      const hexRgb = parseHex(parts[0]);
      if (hexRgb) {
        const [h, s, v] = rgbToHsv(hexRgb);
        return { h, s, v };
      }
    }
  }

  const hexRgb = parseHex(seed);
  if (hexRgb) {
    const [h, s, v] = rgbToHsv(hexRgb);
    return { h, s, v };
  }
  
  return fallback;
}

function useDragTrack(onChange: (x: number, y: number) => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const read = useMemo(() => {
    return (el: HTMLElement, clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      onChangeRef.current(x, y);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    read(e.currentTarget, e.clientX, e.clientY);
  }, [read]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    read(e.currentTarget, e.clientX, e.clientY);
  }, [read]);

  return { onPointerDown, onPointerMove };
}

// The panel is uncontrolled after mount, remount with a changed key to reseed it
export const ColorPickerPanel = React.memo(function ColorPickerPanel({
  initialValue,
  onChange,
  className = "",
  onRequestClose,
  onConfirm
}: ColorPickerPanelProps) {
  const initialSeed = useRef({
    hsv: resolveSeed(initialValue),
    alpha: 1,
    
  });

  const [hsv, setHsv] = useState(initialSeed.current.hsv);
  const [alpha, setAlpha] = useState(initialSeed.current.alpha);
    const [format, setFormat] = useState<"hex" | "rgb" | "hsl">("hex");
  const [savedColors, setSavedColors] = useState(() => readSavedColors());
  const [deleteMode, setDeleteMode] = useState(false);

  useEffect(() => {
    if (savedColors.length === 0) {
      setDeleteMode(false);
    }
  }, [savedColors.length]);
  
  // While a field is being typed in, its raw draft text wins so the caret and any half-finished value are left alone.
  // null means show the derived value instead.
  const [valueDraft, setValueDraft] = useState<string | null>(null);
  const [opacityDraft, setOpacityDraft] = useState<string | null>(null);

  const rgb = useMemo(() => hsvToRgb(hsv.h, hsv.s, hsv.v), [hsv]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);
    const cssColor = useMemo(() => formatRgba(rgb, alpha), [rgb, alpha]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (onChangeRef.current) {
      onChangeRef.current({
        hex,
        alpha,
        rgb,
        chipClass: buildCustomColor(hex, Math.round(alpha * 100))
      });
    }
  }, [hex, alpha, rgb]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_COLORS_STORAGE_KEY, JSON.stringify(savedColors));
    } catch (e) {
      // storage can be full or blocked and the picker must still work without it
    }
  }, [savedColors]);

  const applyHex = useCallback((candidate: string): boolean => {
    const parsed = parseHex(candidate);
    if (!parsed) return false;
    const [h, s, v] = rgbToHsv(parsed);
    setHsv({ h, s, v });
    return true;
  }, []);

  const saturationTrack = useDragTrack((x, y) => {
    setHsv(prev => ({ ...prev, s: x * 100, v: (1 - y) * 100 }));
  });

  const hueTrack = useDragTrack((x, y) => {
    setHsv(prev => ({ ...prev, h: x * 360 }));
  });

  const alphaTrack = useDragTrack((x, y) => {
    setAlpha(x);
    setOpacityDraft(null);
  });

  const handleHueKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft") {
      setHsv(prev => ({ ...prev, h: (prev.h - step + 360) % 360 }));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setHsv(prev => ({ ...prev, h: (prev.h + step) % 360 }));
      e.preventDefault();
    }
  }, []);

  const handleAlphaKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (e.shiftKey ? 10 : 1) / 100;
    if (e.key === "ArrowLeft") {
      setAlpha(prev => Math.max(0, prev - step));
      setOpacityDraft(null);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setAlpha(prev => Math.min(1, prev + step));
      setOpacityDraft(null);
      e.preventDefault();
    }
  }, []);

  const handleSaturationKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === "ArrowLeft") {
      setHsv(prev => ({ ...prev, s: Math.max(0, Math.min(100, prev.s - step)) }));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      setHsv(prev => ({ ...prev, s: Math.max(0, Math.min(100, prev.s + step)) }));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHsv(prev => ({ ...prev, v: Math.max(0, Math.min(100, prev.v + step)) }));
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      setHsv(prev => ({ ...prev, v: Math.max(0, Math.min(100, prev.v - step)) }));
      e.preventDefault();
    } else {
      return;
    }
  }, []);

  const derivedFieldValue = useMemo(() => {
    if (format === "hex") return hex;
    if (format === "rgb") return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
    const [hl, sl, ll] = rgbToHsl(rgb);
    return `${hl}, ${sl}%, ${ll}%`;
  }, [format, hex, rgb]);

  const handleValueInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setValueDraft(val);
    if (format !== "hex") return;
    applyHex(val);
    // an unparseable value simply leaves the picker where it was
  }, [format, applyHex]);

  const handleOpacityInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOpacityDraft(val);
    const parsed = parseFloat(val.replace("%", ""));
    if (isNaN(parsed)) return;
    setAlpha(Math.max(0, Math.min(100, parsed)) / 100);
  }, []);

  const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  const handleEyeDropper = useCallback(() => {
    if (!supportsEyeDropper) return;
    try {
      const EyeDropper = (window as any).EyeDropper;
      const eyeDropper = new EyeDropper();
      eyeDropper.open().then((result: any) => {
        if (result && result.sRGBHex) {
          applyHex(result.sRGBHex);
          setValueDraft(null);
        }
      }).catch(() => {});
    } catch (e) {
      // empty catch because some browsers expose the constructor but refuse to construct it
    }
  }, [supportsEyeDropper, applyHex]);

  const savedIsFull = savedColors.length >= MAX_SAVED_COLORS;
  const alreadySaved = savedColors.includes(hex);

  const handleAddSaved = useCallback(() => {
    if (savedIsFull || alreadySaved) return;
    setSavedColors(prev => [...prev, hex]);
  }, [savedIsFull, alreadySaved, hex]);

  const handleRemoveSaved = useCallback((entry: string) => {
    setSavedColors(prev => prev.filter(c => c !== entry));
  }, []);

  
  const handleToggleDeleteMode = useCallback(() => {
    if (savedColors.length === 0) {
      setDeleteMode(false);
      return;
    }
    setDeleteMode(prev => !prev);
  }, [savedColors.length]);

  const handleRootKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (deleteMode && e.key === "Escape") {
      setDeleteMode(false);
      e.stopPropagation();
    }
  }, [deleteMode]);

  const addDisabled = savedIsFull || alreadySaved;
  const addTitle = savedIsFull
    ? `Saved colours are full (${MAX_SAVED_COLORS} max). Remove one to add another.`
    : alreadySaved
      ? "Colour already saved"
      : "Save this colour";

  const deleteDisabled = savedColors.length === 0;
  const deleteTitle = savedColors.length === 0
    ? "No saved colours to delete"
    : deleteMode
      ? "Exit delete mode"
      : "Color Slot Delete";

  return (
    <div 
      className={`w-[288px] max-w-full bg-white border border-gray-200 rounded-xl shadow-lg p-4 flex flex-col gap-3.5 select-none ${className}`}
      onKeyDown={handleRootKeyDown}
    >
      {onRequestClose && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRequestClose}
            title="Close"
            aria-label="Close"
            className="w-6 h-6 grid place-content-center rounded-md border-none bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-100 hover:text-gray-800 outline-none focus-visible:outline-2 focus-visible:outline-[#2b579a] focus-visible:outline-offset-2"
          >
            <X size={16} />
          </button>
        </div>
      )}
      

      <div
        role="application"
        aria-label="Saturation and brightness"
        tabIndex={0}
        onKeyDown={handleSaturationKeyDown}
        onPointerDown={saturationTrack.onPointerDown}
        onPointerMove={saturationTrack.onPointerMove}
        className="relative w-full rounded-lg cursor-crosshair touch-none overflow-hidden ring-1 ring-inset ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-[#2b579a] focus-visible:ring-offset-2"
        style={{ aspectRatio: "1 / 0.95", backgroundColor: `hsl(${hsv.h.toFixed(1)}, 100%, 50%)` }}
      >
        <div 
          className="absolute inset-0 pointer-events-none" 
          style={{ backgroundImage: "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)" }}
        />
        <div
          className="absolute w-[18px] h-[18px] -ml-[9px] -mt-[9px] rounded-full border-[2.5px] border-white pointer-events-none z-[2] drop-shadow-sm"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
        />
      </div>

      <div className="flex flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleEyeDropper}
          disabled={!supportsEyeDropper}
          title={supportsEyeDropper ? "Pick a colour from the screen" : "Browser does not support the screen colour picker"}
          aria-label="Pick a colour from the screen"
          className="shrink-0 w-[40px] h-[40px] grid place-content-center rounded-lg border border-gray-200 bg-white text-gray-500 cursor-pointer transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-gray-500"
        >
          <Pipette size={18} />
        </button>

        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <div
            role="slider"
            aria-label="Hue"
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(hsv.h)}
            tabIndex={0}
            onKeyDown={handleHueKeyDown}
            onPointerDown={hueTrack.onPointerDown}
            onPointerMove={hueTrack.onPointerMove}
            className="relative h-2.5 rounded-full cursor-pointer touch-none ring-1 ring-inset ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-[#2b579a] focus-visible:ring-offset-2"
            style={{ backgroundImage: HUE_GRADIENT }}
          >
            <div
              className="absolute top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white pointer-events-none drop-shadow-sm"
              style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h.toFixed(1)}, 100%, 50%)` }}
            />
          </div>

          <div
            role="slider"
            aria-label="Opacity"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(alpha * 100)}
            tabIndex={0}
            onKeyDown={handleAlphaKeyDown}
            onPointerDown={alphaTrack.onPointerDown}
            onPointerMove={alphaTrack.onPointerMove}
            className="relative h-2.5 rounded-full cursor-pointer touch-none ring-1 ring-inset ring-black/10 outline-none focus-visible:ring-2 focus-visible:ring-[#2b579a] focus-visible:ring-offset-2"
            style={CHECKER_STYLE}
          >
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ backgroundImage: `linear-gradient(to right, rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0), rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1))` }}
            />
            <div
              className="absolute top-1/2 w-4 h-4 -ml-2 -mt-2 rounded-full border-2 border-white pointer-events-none drop-shadow-sm z-[2]"
              style={{ left: `${alpha * 100}%`, backgroundColor: cssColor }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-row items-center gap-2">
        <select
          aria-label="Colour format"
          value={format}
          onChange={(e) => { setFormat(e.target.value as any); setValueDraft(null); }}
          className="shrink-0 h-10 w-[74px] px-2 rounded-lg border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 cursor-pointer outline-none focus:border-[#2b579a]"
        >
          <option value="hex">Hex</option>
          <option value="rgb">RGB</option>
          <option value="hsl">HSL</option>
        </select>

        <label className="flex-1 min-w-0 flex flex-row items-center gap-2 h-10 px-2.5 rounded-lg border border-gray-200 bg-white focus-within:border-[#2b579a]">
          <span className="shrink-0 w-4 h-4 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: cssColor }} />
          <input
            aria-label="Colour value"
            spellCheck={false}
            value={valueDraft !== null ? valueDraft : derivedFieldValue}
            onChange={handleValueInput}
            onBlur={() => setValueDraft(null)}
            className="flex-1 min-w-0 border-none bg-transparent text-[13px] text-gray-700 outline-none"
          />
        </label>

        <label className="shrink-0 w-[62px] flex flex-row items-center h-10 px-2.5 rounded-lg border border-gray-200 bg-white focus-within:border-[#2b579a]">
          <input
            aria-label="Opacity"
            spellCheck={false}
            value={opacityDraft !== null ? opacityDraft : `${Math.round(alpha * 100)}%`}
            onChange={handleOpacityInput}
            onBlur={() => setOpacityDraft(null)}
            className="w-full min-w-0 border-none bg-transparent text-[13px] text-gray-700 tabular-nums outline-none"
          />
        </label>
      </div>

      <div className="flex flex-row items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="text-[13px] font-semibold text-gray-700">Saved</span>
          <button
            type="button"
            onClick={onConfirm}
            title="Update colour"
            aria-label="Update colour"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border-none bg-blue-50 text-[13px] font-semibold text-blue-700 cursor-pointer transition-colors hover:bg-blue-100"
          >
            Update
          </button>
        </div>
        <div className="inline-flex items-center gap-1 -mx-2 -my-1">
          <button
            type="button"
            disabled={addDisabled}
            title={addTitle}
            onClick={handleAddSaved}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border-none bg-transparent text-[13px] font-semibold text-gray-900 cursor-pointer transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-900"
          >
            <Plus size={15} /> Add
          </button>
          <button
            type="button"
            disabled={deleteDisabled}
            title={deleteTitle}
            aria-label={deleteTitle}
            aria-pressed={deleteMode}
            onClick={handleToggleDeleteMode}
            className={`inline-flex items-center justify-center px-2 py-1 rounded-md border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500 ${deleteMode ? "bg-red-100 text-red-600" : "bg-transparent text-gray-500 hover:bg-gray-100 hover:text-red-600"}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-row flex-wrap gap-2 min-h-[26px]">
        {savedColors.length === 0 ? (
          <span className="text-[12px] italic text-gray-400 font-light">No saved colours yet, press Add</span>
        ) : (
          savedColors.map(c => {
            const isActive = c === hex;
            return (
              <span key={c} className="relative w-[26px] h-[26px]">
                <button
                  type="button"
                  title={deleteMode ? `Delete ${c}` : c}
                  aria-label={deleteMode ? `Delete ${c}` : `Use ${c}`}
                  aria-pressed={isActive}
                  onClick={() => { 
                    if (deleteMode) {
                      handleRemoveSaved(c);
                    } else {
                      applyHex(c); 
                      setAlpha(1); 
                      setValueDraft(null); 
                      setOpacityDraft(null); 
                    }
                  }}
                  className="w-full h-full rounded-full border-none p-0 cursor-pointer transition-transform hover:scale-110"
                  style={{ backgroundColor: c, boxShadow: deleteMode ? "inset 0 0 0 1px rgba(0,0,0,0.1), 0 0 0 2px white, 0 0 0 2px #ef4444" : isActive ? "inset 0 0 0 1px rgba(0,0,0,0.1), 0 0 0 2px white, 0 0 0 4px #2b579a" : "inset 0 0 0 1px rgba(0,0,0,0.1)" }}
                />
                {deleteMode && (
                  <span 
                    aria-hidden="true" 
                    className="absolute -top-1 -left-1 w-[14px] h-[14px] rounded-full bg-white border border-gray-300 shadow-sm grid place-content-center pointer-events-none z-[2]"
                  >
                    <X size={9} strokeWidth={3} className="text-gray-700" />
                  </span>
                )}
              </span>
            );
          })
        )}
      </div>
    </div>
  );
});
