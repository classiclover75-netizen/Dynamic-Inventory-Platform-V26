import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pipette } from "lucide-react";
import {
  Rgb,
  hsvToRgb,
  isEyeDropperSupported,
  parseHex,
  pickColorFromScreen,
  rgbToHex,
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

const HUE_GRADIENT = "linear-gradient(to right, #ff0000 0%, #ffff00 16.66%, #00ff00 33.33%, #00ffff 50%, #0000ff 66.66%, #ff00ff 83.33%, #ff0000 100%)";

function resolveSeed(seed?: string): { h: number; s: number; v: number } {
  const fallback = { h: 0, s: 0, v: 100 };
  if (typeof seed !== 'string') return fallback;

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

function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export const ColorPickerPanel = React.memo(function ColorPickerPanel({
  initialValue,
  onChange,
  className = "",
  onRequestClose,
  onConfirm
}: ColorPickerPanelProps) {
  const initialSeed = useRef(resolveSeed(initialValue));

  const [hsv, setHsv] = useState(initialSeed.current);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [rgbDraft, setRgbDraft] = useState<{ r: string | null; g: string | null; b: string | null }>({ r: null, g: null, b: null });

  const rgb = useMemo(() => hsvToRgb(hsv.h, hsv.s, hsv.v), [hsv]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);

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
        alpha: 1,
        rgb,
        chipClass: buildCustomColor(hex, 100)
      });
    }
  }, [hex, rgb]);

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

  const handleHexInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexDraft(val);
    applyHex(val);
  }, [applyHex]);

  const handleChannelInput = useCallback((channel: "r" | "g" | "b", e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRgbDraft(prev => ({ ...prev, [channel]: val }));
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) return;
    const clamped = clampChannel(parsed);
    const nextRgb: Rgb = [
      channel === "r" ? clamped : rgb[0],
      channel === "g" ? clamped : rgb[1],
      channel === "b" ? clamped : rgb[2],
    ];
    const [h, s, v] = rgbToHsv(nextRgb);
    setHsv({ h, s, v });
  }, [rgb]);

  const clearChannelDraft = useCallback((channel: "r" | "g" | "b") => {
    setRgbDraft(prev => ({ ...prev, [channel]: null }));
  }, []);

  const eyeDropperSupported = isEyeDropperSupported();

  const handleEyeDropper = useCallback(async () => {
    const picked = await pickColorFromScreen();
    if (picked) {
      applyHex(picked);
      setHexDraft(null);
    }
  }, [applyHex]);

  return (
    <div className={`w-[280px] bg-white shadow-2xl rounded-lg border border-gray-200 p-4 text-left select-none ${className}`}>
      <div
        role="application"
        aria-label="Saturation and brightness"
        tabIndex={0}
        onKeyDown={handleSaturationKeyDown}
        onPointerDown={saturationTrack.onPointerDown}
        onPointerMove={saturationTrack.onPointerMove}
        className="w-full h-32 rounded-md relative overflow-hidden mb-4 border border-gray-300 cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#2b579a] focus-visible:ring-offset-2"
        style={{ backgroundColor: `hsl(${hsv.h.toFixed(1)}, 100%, 50%)` }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to right, white 0%, transparent 100%)" }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, black 0%, transparent 100%)" }} />
        <div
          className="absolute w-4 h-4 -ml-2 -mt-2 bg-white rounded-full border-2 border-white shadow-sm ring-1 ring-black/20 pointer-events-none"
          style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: `hsl(${hsv.h.toFixed(1)}, ${hsv.s.toFixed(0)}%, ${(hsv.v * (1 - hsv.s / 200)).toFixed(0)}%)` }}
        />
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: hex }} />
        <button
          type="button"
          onClick={handleEyeDropper}
          disabled={!eyeDropperSupported}
          title={eyeDropperSupported ? "Pick a custom color from the screen" : "Browser does not support the screen colour picker"}
          aria-label="Pick a custom color from the screen"
          className="flex items-center justify-center w-8 h-8 border border-gray-300 rounded bg-white cursor-pointer hover:bg-gray-50 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Pipette size={16} className="text-gray-700" />
        </button>
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
          className="w-full h-3 rounded-full relative ml-2 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-[#2b579a] focus-visible:ring-offset-2"
          style={{ backgroundImage: HUE_GRADIENT }}
        >
          <div
            className="absolute -top-1 w-5 h-5 -ml-2.5 rounded-full border-2 border-white shadow-md ring-1 ring-black/10 pointer-events-none"
            style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h.toFixed(1)}, 100%, 50%)` }}
          />
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-[12px] font-medium text-gray-600">Hex</label>
          <input
            type="text"
            aria-label="Hex value"
            spellCheck={false}
            value={hexDraft !== null ? hexDraft : hex}
            onChange={handleHexInput}
            onBlur={() => setHexDraft(null)}
            className="w-full px-2 py-1.5 text-[13px] border border-gray-300 rounded focus:outline-none focus:border-blue-500 uppercase"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 w-11">
            <label className="text-[12px] font-medium text-gray-600">R</label>
            <input
              type="text"
              aria-label="Red channel"
              spellCheck={false}
              value={rgbDraft.r !== null ? rgbDraft.r : String(rgb[0])}
              onChange={(e) => handleChannelInput("r", e)}
              onBlur={() => clearChannelDraft("r")}
              className="w-full px-1 py-1.5 text-[13px] border border-gray-300 rounded text-center focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1 w-11">
            <label className="text-[12px] font-medium text-gray-600">G</label>
            <input
              type="text"
              aria-label="Green channel"
              spellCheck={false}
              value={rgbDraft.g !== null ? rgbDraft.g : String(rgb[1])}
              onChange={(e) => handleChannelInput("g", e)}
              onBlur={() => clearChannelDraft("g")}
              className="w-full px-1 py-1.5 text-[13px] border border-gray-300 rounded text-center focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1 w-11">
            <label className="text-[12px] font-medium text-gray-600">B</label>
            <input
              type="text"
              aria-label="Blue channel"
              spellCheck={false}
              value={rgbDraft.b !== null ? rgbDraft.b : String(rgb[2])}
              onChange={(e) => handleChannelInput("b", e)}
              onBlur={() => clearChannelDraft("b")}
              className="w-full px-1 py-1.5 text-[13px] border border-gray-300 rounded text-center focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onRequestClose}
          className="px-4 py-1.5 text-[14px] font-medium text-green-700 hover:bg-green-50 rounded transition-colors border-none bg-transparent cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-6 py-1.5 text-[14px] font-medium bg-[#188038] text-white hover:bg-[#177233] rounded transition-colors border-none cursor-pointer"
        >
          OK
        </button>
      </div>
    </div>
  );
});
