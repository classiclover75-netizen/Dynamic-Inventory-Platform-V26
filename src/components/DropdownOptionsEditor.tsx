import React, { useRef, useEffect } from 'react';
import { Button } from './ui';
import { Trash2, Plus } from 'lucide-react';
import { sanitizeHtml } from '../lib/sanitizeHtml';

const OptionRichTextEditor = ({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (
      divRef.current &&
      divRef.current.innerHTML !== value &&
      document.activeElement !== divRef.current
    ) {
      divRef.current.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(sanitizeHtml(e.currentTarget.innerHTML));
  };

  const handleBlur = () => {
    if (divRef.current) {
      const clean = sanitizeHtml(divRef.current.innerHTML);
      if (divRef.current.innerHTML !== clean) {
        divRef.current.innerHTML = clean;
      }
      onChange(clean);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");

    if (html) {
      const sanitizedHtml = sanitizeHtml(html);
      document.execCommand("insertHTML", false, sanitizedHtml);
    } else {
      document.execCommand("insertText", false, text);
    }
  };

  return (
    <div className="flex-1 flex flex-col border border-[#cfd8dc] rounded overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 bg-white">
      <div
        ref={divRef}
        contentEditable
        onInput={handleInput}
        onBlur={handleBlur}
        onPaste={handlePaste}
        className="w-full p-1.5 text-[13px] outline-none min-h-[32px] max-h-[150px] overflow-auto"
        data-placeholder={placeholder}
      />
    </div>
  );
};

interface DropdownOptionsEditorProps {
  options: string[];
  onChange: (options: string[]) => void;
}

export const DropdownOptionsEditor: React.FC<DropdownOptionsEditorProps> = ({
  options = [],
  onChange
}) => {
  const handleAddOption = () => {
    onChange([...options, '']);
  };

  const handleUpdateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    onChange(newOptions);
  };

  const handleRemoveOption = (index: number) => {
    const newOptions = [...options];
    newOptions.splice(index, 1);
    onChange(newOptions);
  };

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <label className="block text-xs font-bold text-gray-600 mb-2">Dropdown Options</label>
      <div className="space-y-2 mb-2">
        {options.map((opt, i) => (
          <div key={i} className="flex items-start gap-2">
            <OptionRichTextEditor
              value={opt}
              onChange={val => handleUpdateOption(i, val)}
              placeholder={`Option ${i + 1}`}
            />
            <Button variant="red" onClick={() => handleRemoveOption(i)} className="px-2 py-1 mt-1">
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={handleAddOption} className="w-full text-xs py-1.5 flex justify-center items-center gap-1 border-dashed">
        <Plus size={14} /> Add option
      </Button>
    </div>
  );
};
