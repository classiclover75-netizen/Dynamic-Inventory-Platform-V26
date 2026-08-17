import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette } from "lucide-react";
import { ColorPickerPanel, ColorPickerValue } from "./ColorPickerPanel";
import { parseHex } from "../lib/colorUtils";
import { CUSTOM_PREFIX, parseCustomColor, parseColorToPickerValue } from "../lib/colorRender";

interface ColorPickerPopoverProps {
  value?: string;
  onChange?: (val: ColorPickerValue) => void;
  onCommit?: (val: ColorPickerValue) => void;
  disabled?: boolean;
  label?: string;
  forceIconVisible?: boolean;
  hideSwatch?: boolean;
  className?: string;
}

const PANEL_MARGIN = 8;
const VIEWPORT_PADDING = 8;

function useCanHover() {
  const [canHover, setCanHover] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(hover: hover)');
    const sync = () => setCanHover(mq.matches);
    sync();
    if (mq.addEventListener) {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    } else if (mq.addListener) {
      mq.addListener(sync);
      return () => mq.removeListener(sync);
    }
  }, []);
  // touch screens report false and there the icon must stay visible, 
  // because a hover-only control is unreachable on a phone or tablet.
  return canHover;
}

function resolveSwatchColor(value?: string): string {
  if (!value) return "#E5E7EB";
  if (value.startsWith(CUSTOM_PREFIX)) {
    const parsed = parseCustomColor(value);
    if (parsed) return parsed.hex;
  }
  if (parseHex(value)) return value;
  return "#E5E7EB";
}

export const ColorPickerPopover = React.memo(function ColorPickerPopover({
  value,
      onChange,
  onCommit,
  disabled = false,
  label = "Change colour",
  forceIconVisible = false,
  hideSwatch = false,
  className = ""
}: ColorPickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [openCount, setOpenCount] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const latestValueRef = useRef<ColorPickerValue | null>(null);
  const wasOpen = useRef(false);
  const initialValueRef = useRef<string | undefined>(undefined);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setOpenCount(c => c + 1);
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  const canHover = useCanHover();

  const swatchColor = resolveSwatchColor(value);
  // On a hover-capable device the icon hides until it is wanted, anywhere else it stays put.
  const iconVisible = !canHover || isHovered || hasFocus || isOpen || forceIconVisible;

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelW = panelRef.current ? panelRef.current.offsetWidth : 288;
    const panelH = panelRef.current ? panelRef.current.offsetHeight : 380;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < (panelH + PANEL_MARGIN) && spaceAbove > spaceBelow;

    let top = openUpwards ? rect.top - panelH - PANEL_MARGIN : rect.bottom + PANEL_MARGIN;
    let left = rect.left;

    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - panelW - VIEWPORT_PADDING));
    top = Math.max(VIEWPORT_PADDING, Math.min(top, window.innerHeight - panelH - VIEWPORT_PADDING));

    setPosition({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updatePosition, { capture: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  const handleCommit = useCallback(() => {
    setIsOpen(false);
    setShowDiscardWarning(false);
    triggerRef.current?.focus();
    if (latestValueRef.current && onCommit) {
      onCommit(latestValueRef.current);
    }
  }, [onCommit]);

  const handleClose = useCallback(() => {
    setShowDiscardWarning(false);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleDiscard = useCallback(() => {
    if (onChange) {
      const parsed = parseColorToPickerValue(initialValueRef.current);
      if (parsed) {
        onChange(parsed);
      } else if (initialValueRef.current !== undefined) {
        onChange({ chipClass: initialValueRef.current } as ColorPickerValue);
      }
    }
    setShowDiscardWarning(false);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [onChange]);

  const handleRequestClose = useCallback(() => {
    if (!latestValueRef.current) {
      handleClose();
      return;
    }
    
    const initialParsed = parseColorToPickerValue(initialValueRef.current);
    if (initialParsed && initialParsed.chipClass.toLowerCase() === latestValueRef.current.chipClass.toLowerCase()) {
      handleClose();
      return;
    }
    
    setShowDiscardWarning(true);
  }, [handleDiscard, handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleRequestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [isOpen, handleRequestClose]);

  const handleChange = useCallback((val: ColorPickerValue) => {
    latestValueRef.current = val;
    if (onChange) onChange(val);
  }, [onChange]);

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setHasFocus(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setHasFocus(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) return;
          if (isOpen) {
            handleRequestClose();
          } else {
            initialValueRef.current = value;
            latestValueRef.current = null;
            setShowDiscardWarning(false);
            setIsOpen(true);
          }
        }}
        className="inline-flex items-center gap-1.5 rounded-md border-none bg-transparent p-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed outline-none focus-visible:outline-2 focus-visible:outline-[#2b579a] focus-visible:outline-offset-2"
      >
        {!hideSwatch && (
          <span className="shrink-0 w-4 h-4 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: swatchColor }} />
        )}
        <Palette
          size={15}
          className="shrink-0 text-gray-500 transition-opacity duration-150"
          style={{ opacity: iconVisible ? 1 : 0, pointerEvents: iconVisible ? "auto" : "none" }}
        />
      </button>
      {isOpen && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Colour picker"
          className="fixed z-[10050]"
          style={{
            top: position ? `${position.top}px` : "-9999px",
            left: position ? `${position.left}px` : "-9999px",
            visibility: position ? "visible" : "hidden"
          }}
        >
                    <ColorPickerPanel
            key={String(openCount)}
            initialValue={value}
            onChange={handleChange}
            onRequestClose={handleRequestClose}
            onConfirm={handleCommit}
          />
          {showDiscardWarning && (
            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-[10] flex flex-col items-center justify-center p-4 text-center rounded-xl shadow-[0_0_15px_rgba(0,0,0,0.1)] border border-gray-100">
              <p className="text-[13px] font-semibold text-gray-800 mb-1">Discard colour change?</p>
              <p className="text-[12px] text-gray-500 mb-4 leading-tight">Closing will undo the colour you picked.</p>
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 text-[13px] font-semibold cursor-pointer hover:bg-red-100 transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiscardWarning(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-[13px] font-semibold cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  Keep editing
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  );
});
