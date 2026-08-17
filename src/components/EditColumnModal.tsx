import React, { useState, useEffect } from 'react';
import { Button, Input, Select, Modal } from './ui';
import { Column, ColumnType, RowData } from '../types';
import { useToast } from './ToastProvider';

import { DropdownOptionsEditor } from './DropdownOptionsEditor';

export const EditColumnModal = React.memo(({
  isOpen,
  onClose,
  onBack,
  onSave,
  onUpdate,
  column,
  existingColumns,
  rows = []
}: {
  isOpen: boolean;
  onClose: () => void;
  onBack?: () => void;
  onSave: (updatedColumn: Column) => void;
  onUpdate?: (updatedColumn: Column) => void;
  column: Column | null;
  existingColumns: Column[];
  rows?: RowData[];
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<ColumnType>('text');
  const [width, setWidth] = useState<number>(150);
  const [sortEnabled, setSortEnabled] = useState<boolean>(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [sortPriority, setSortPriority] = useState<number>(1);
  const [locked, setLocked] = useState<boolean>(false);
  const [options, setOptions] = useState<string[]>([]);
  const [priorityError, setPriorityError] = useState('');
  const { toast } = useToast();

  const columnIndex = existingColumns.findIndex(c => c.key === column?.key);

  useEffect(() => {
    if (column && isOpen) {
      setName(column.name);
      setType(column.type);
      setWidth(column.width || 150);
      setSortEnabled(column.sortEnabled || false);
      setSortDirection(column.sortDirection || 'asc');
      setSortPriority(column.sortPriority || 1);
      setLocked(column.locked || false);
      setOptions(column.options || []);
    }
  }, [column, isOpen]);

  // Smart default for sort priority
  useEffect(() => {
    if (sortEnabled && (!column || !column.sortEnabled)) {
      const usedPriorities = existingColumns
        .filter(c => c.sortEnabled && c.key !== column?.key)
        .map(c => c.sortPriority || 0);
      
      let nextPriority = 1;
      while (usedPriorities.includes(nextPriority)) {
        nextPriority++;
      }
      setSortPriority(nextPriority);
    }
  }, [sortEnabled, column, existingColumns]);

  // Validate priority uniqueness
  useEffect(() => {
    if (sortEnabled) {
      const duplicate = existingColumns.find(col => 
        col.key !== column?.key && col.sortEnabled && col.sortPriority === sortPriority
      );
      if (duplicate) {
        setPriorityError(`⚠️ Priority ${sortPriority} (P${sortPriority}) is already in use by another column.`);
      } else {
        setPriorityError('');
      }
    } else {
      setPriorityError('');
    }
  }, [sortPriority, sortEnabled, column, existingColumns]);

  const getUpdatedColumn = (overrides: Partial<Column> = {}): Column => {
    if (!column) return {} as Column;
    
    // Clean options before returning
    const cleanedOptions: string[] = [];
    const seen = new Set<string>();
    options.forEach(o => {
      const trimmed = o.trim();
      if (trimmed && !seen.has(trimmed)) {
        cleanedOptions.push(trimmed);
        seen.add(trimmed);
      }
    });

    return {
      ...column,
      name: name.trim() || column.name,
      type,
      width,
      sortEnabled,
      sortDirection: sortEnabled ? sortDirection : undefined,
      sortPriority: sortEnabled ? sortPriority : undefined,
      locked,
      copyPerItem: type === 'text_with_copy_button',
      multiInput: type === 'text_with_copy_button',
      options: (type === 'dropdown' || type === 'multi_select') ? cleanedOptions : undefined,
      ...overrides
    };
  };

  const handleWidthChange = (newWidth: number) => {
    setWidth(newWidth);
    if (onUpdate && column) {
      onUpdate(getUpdatedColumn({ width: newWidth }));
    }
  };

  const handleSave = () => {
    if (!column) return;
    const trimmedName = name.trim();
    if (!trimmedName) return toast('Column name required');

    const lowerName = trimmedName.toLowerCase();
    const conflict = existingColumns.find(c => c.key !== column.key && c.name.toLowerCase() === lowerName);
    if (conflict) return toast(`Column "${conflict.name}" already exists on this page`);

    onSave(getUpdatedColumn());
  };

  if (!column) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} onBack={onBack} title={`✏️ Edit Column (${columnIndex + 1}. ${name})`} width="min(400px, 96vw)">
      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-600 mb-1">Column Name</label>
        <Input 
          value={name} 
          onChange={e => {
            const newVal = e.target.value;
            setName(newVal);
            if (onUpdate && column) {
              onUpdate(getUpdatedColumn({ name: newVal }));
            }
          }} 
          placeholder="Column name" 
        />
      </div>
      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-600 mb-1">Column Type</label>
        <Select 
          value={type} 
          disabled={column?.type === 'sale_tracker'}
          onChange={e => {
            const newVal = e.target.value as ColumnType;
            setType(newVal);

            // Auto-populate options if changing to dropdown
            if (newVal === 'dropdown' && column && rows && rows.length > 0) {
              const uniqueValues = new Set<string>();
              rows.forEach(row => {
                const val = row[column.key];
                if (val && typeof val === 'string' && val.trim() !== '') {
                  uniqueValues.add(val);
                }
              });

              if (uniqueValues.size > 0) {
                setOptions(prevOptions => {
                  const newOptions = [...prevOptions];
                  uniqueValues.forEach(val => {
                    if (!newOptions.includes(val)) {
                      newOptions.push(val);
                    }
                  });
                  return newOptions;
                });
              }
            }

            if (onUpdate && column) {
              onUpdate(getUpdatedColumn({ type: newVal }));
            }
          }}
        >
                    {column?.type === 'sale_tracker' ? (
            <option value="sale_tracker">Sale Tracker (Locked)</option>
          ) : (
            <>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="dropdown">Dropdown</option>
              <option value="multi_select">Multi-select</option>
              <option value="checkbox">Checkbox</option>
              <option value="image">Image</option>
              <option value="file">File</option>
              <option value="formula">Formula</option>
              <option value="relation">Relation/Lookup</option>
              <option value="multi_text">Multi Text</option>
              <option value="text_with_copy_button">Text With Copy Button</option>
            </>
          )}
        </Select>
        
        {(type === 'dropdown' || type === 'multi_select') && (
          <DropdownOptionsEditor options={options} onChange={setOptions} />
        )}
      </div>

      <div className="mb-3">
        <label className="block text-xs font-bold text-gray-600 mb-1">Column Width (px)</label>
        <div className="flex items-center gap-3">
          <input 
            type="range" 
            min="50" 
            max="800" 
            step="5" 
            value={width} 
            onChange={e => handleWidthChange(parseInt(e.target.value, 10))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#2b579a]"
          />
          <Input 
            type="number" 
            value={width} 
            onChange={e => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) handleWidthChange(val);
            }} 
            className="w-20 text-center"
          />
        </div>
        <div className="mt-1 text-[10px] text-gray-400">Min: 50px, Max: 800px</div>
      </div>

      {column?.type !== 'sale_tracker' && (
        <>

          <div className="mb-3 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id="sortEnabled"
                checked={sortEnabled}
                onChange={(e) => setSortEnabled(e.target.checked)}
                className="w-4 h-4 accent-[#2b579a]"
              />
              <label htmlFor="sortEnabled" className="text-xs font-bold text-gray-600 cursor-pointer">Enable Sorting</label>
            </div>

            {sortEnabled && (
              <div className="space-y-3 pl-6">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Sort Direction</label>
                  <Select 
                    value={sortDirection} 
                    onChange={e => setSortDirection(e.target.value as 'asc' | 'desc')}
                  >
                    <option value="asc">A to Z (Ascending)</option>
                    <option value="desc">Z to A (Descending)</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Sort Priority (1 is highest)</label>
                  <Input 
                    type="number" 
                    min="1"
                    value={sortPriority}
                    onChange={(e) => setSortPriority(parseInt(e.target.value, 10) || 1)}
                    className={priorityError ? "border-red-500" : ""}
                  />
                  {priorityError && <p className="text-[10px] text-red-500 font-medium mt-1">{priorityError}</p>}
                </div>
              </div>
            )}
          </div>

          <div className="mb-3 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <input 
                type="checkbox" 
                id="locked"
                checked={locked}
                onChange={(e) => {
                  setLocked(e.target.checked);
                  if (onUpdate && column) {
                    onUpdate(getUpdatedColumn({ locked: e.target.checked }));
                  }
                }}
                className="w-4 h-4 accent-[#2b579a]"
              />
              <label htmlFor="locked" className="text-xs font-bold text-gray-600 cursor-pointer">Lock Column (Prevent move/resize)</label>
            </div>
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2 sticky bottom-0 bg-white py-3 border-t border-gray-100 z-10 -mb-1">
        {onBack ? (
          <Button variant="outline" onClick={onBack}>Back to Active Page Settings</Button>
        ) : (
          <Button variant="red" onClick={onClose}>Back to Workspace</Button>
        )}
        <Button 
          variant="green" 
          onClick={handleSave}
          disabled={!!priorityError}
        >
          Save Changes
        </Button>
      </div>
    </Modal>
  );
});
