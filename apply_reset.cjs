const fs = require('fs');

function applyReplacements(file, oldStr, newStr) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes(oldStr)) {
    console.error(`Not found in ${file}. Expected:\n${oldStr}`);
    process.exit(1);
  } else {
    content = content.replace(oldStr, newStr);
  }
  fs.writeFileSync(file, content, 'utf8');
}

applyReplacements('src/components/ColorPickerPanel.tsx',
`import { Pipette, Plus, Trash2, X } from "lucide-react";`,
`import { Pipette, Plus, RotateCcw, Trash2, X } from "lucide-react";`);

applyReplacements('src/components/ColorPickerPanel.tsx',
`interface ColorPickerPanelProps {
  initialValue?: string;
  onChange?: (val: ColorPickerValue) => void;
  className?: string;
  onRequestClose?: () => void;
  onConfirm?: () => void;
}`,
`interface ColorPickerPanelProps {
  initialValue?: string;
  onChange?: (val: ColorPickerValue) => void;
  className?: string;
  onRequestClose?: () => void;
  onConfirm?: () => void;
  onReset?: () => void;
}`);

applyReplacements('src/components/ColorPickerPanel.tsx',
`// The panel is uncontrolled after mount, remount with a changed key to reseed it
export const ColorPickerPanel = React.memo(function ColorPickerPanel({
  initialValue,
  onChange,
  className = "",
  onRequestClose,
  onConfirm
}: ColorPickerPanelProps) {`,
`// The panel is uncontrolled after mount, remount with a changed key to reseed it
export const ColorPickerPanel = React.memo(function ColorPickerPanel({
  initialValue,
  onChange,
  className = "",
  onRequestClose,
  onConfirm,
  onReset
}: ColorPickerPanelProps) {`);


applyReplacements('src/components/ColorPickerPanel.tsx',
`      {onRequestClose && (
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
      )}`,
`      {(onRequestClose || onReset) && (
        <div className="flex justify-between items-center">
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              title="Reset to no colour"
              aria-label="Reset to no colour"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border-none bg-transparent text-[13px] font-semibold text-gray-700 cursor-pointer transition-colors hover:bg-gray-100 hover:text-gray-900 outline-none focus-visible:outline-2 focus-visible:outline-[#2b579a] focus-visible:outline-offset-2"
            >
              <RotateCcw size={15} /> Reset
            </button>
          ) : (
            <span />
          )}
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              title="Close"
              aria-label="Close"
              className="w-6 h-6 grid place-content-center rounded-md border-none bg-transparent text-gray-500 cursor-pointer transition-colors hover:bg-gray-100 hover:text-gray-800 outline-none focus-visible:outline-2 focus-visible:outline-[#2b579a] focus-visible:outline-offset-2"
            >
              <X size={16} />
            </button>
          ) : (
            <span />
          )}
        </div>
      )}`);

// Replacement 5 part A
applyReplacements('src/components/ColorPickerPopover.tsx',
`interface ColorPickerPopoverProps {
  value?: string;
  onChange?: (val: ColorPickerValue) => void;
  onCommit?: (val: ColorPickerValue) => void;
  disabled?: boolean;
  label?: string;
  forceIconVisible?: boolean;
  hideSwatch?: boolean;
  className?: string;
}`,
`interface ColorPickerPopoverProps {
  value?: string;
  onChange?: (val: ColorPickerValue) => void;
  onCommit?: (val: ColorPickerValue) => void;
  onReset?: () => void;
  disabled?: boolean;
  label?: string;
  forceIconVisible?: boolean;
  hideSwatch?: boolean;
  className?: string;
}`);

// Replacement 5 part B
applyReplacements('src/components/ColorPickerPopover.tsx',
`export const ColorPickerPopover = React.memo(function ColorPickerPopover({
  value,
      onChange,
  onCommit,
  disabled = false,
  label = "Change colour",
  forceIconVisible = false,
  hideSwatch = false,
  className = ""
}: ColorPickerPopoverProps) {`,
`export const ColorPickerPopover = React.memo(function ColorPickerPopover({
  value,
      onChange,
  onCommit,
  onReset,
  disabled = false,
  label = "Change colour",
  forceIconVisible = false,
  hideSwatch = false,
  className = ""
}: ColorPickerPopoverProps) {`);


applyReplacements('src/components/ColorPickerPopover.tsx',
`  const handleChange = useCallback((val: ColorPickerValue) => {
    latestValueRef.current = val;
    if (onChange) onChange(val);
  }, [onChange]);`,
`  const handleChange = useCallback((val: ColorPickerValue) => {
    latestValueRef.current = val;
    if (onChange) onChange(val);
  }, [onChange]);

  const handleReset = useCallback(() => {
    latestValueRef.current = null;
    setShowDiscardWarning(false);
    setIsOpen(false);
    triggerRef.current?.focus();
    if (onReset) onReset();
  }, [onReset]);`);

applyReplacements('src/components/ColorPickerPopover.tsx',
`            initialValue={value}
            onChange={handleChange}
            onRequestClose={handleRequestClose}
            onConfirm={handleCommit}`,
`            initialValue={value}
            onChange={handleChange}
            onRequestClose={handleRequestClose}
            onConfirm={handleCommit}
            onReset={onReset ? handleReset : undefined}`);

console.log('Done applying reset button replacements.');
