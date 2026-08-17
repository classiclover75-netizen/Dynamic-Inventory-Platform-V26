import React, { useMemo } from 'react';
import { groupColumnsByMonth, getLatestBusinessDate, getColumnsInDateRange, parseBusinessDate } from '../lib/saleDateUtils';

interface QuickRangePanelProps {
  saleColumns: { key: string; name: string }[];
  onSelectQuickRange: (keys: string[], startName: string, endName: string) => void;
  onToast: (msg: string) => void;
}

export const QuickRangePanel: React.FC<QuickRangePanelProps> = ({ saleColumns, onSelectQuickRange, onToast }) => {
  const { months, latestDate, unparsedColumns } = useMemo(() => {
    const unparsed: string[] = [];
    saleColumns.forEach(c => {
      if (!parseBusinessDate(c.name)) unparsed.push(c.name);
    });

    return {
      months: groupColumnsByMonth(saleColumns),
      latestDate: getLatestBusinessDate(saleColumns),
      unparsedColumns: unparsed
    };
  }, [saleColumns]);

  const handlePreset = (type: 'days' | 'months', value: number, label: string) => {
    if (!latestDate) {
      onToast("No valid dates found for presets.");
      return;
    }
    const start = new Date(latestDate);
    if (type === 'days') {
      start.setDate(start.getDate() - value + 1);
    } else {
      start.setMonth(start.getMonth() - value);
    }
    const cols = getColumnsInDateRange(saleColumns, start, latestDate);
    
    if (cols.length === 0) {
      onToast(`No columns matched ${label}`);
      return;
    }
    
    onSelectQuickRange(cols.map(c => c.key), label, "");
  };

  const handleMonth = (monthLabel: string, cols: typeof saleColumns) => {
    if (cols.length === 0) {
      onToast(`No columns matched ${monthLabel}`);
      return;
    }
    onSelectQuickRange(cols.map(c => c.key), `${monthLabel} Sales`, "");
  };

  if (saleColumns.length === 0) return null;

  return (
    <div className="mb-6 p-4 bg-purple-50/50 rounded-lg border border-purple-100">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-bold text-purple-700 uppercase tracking-wider">
          Quick Ranges
        </label>
        {unparsedColumns.length > 0 && (
          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold" title={unparsedColumns.join('\n')}>
            {unparsedColumns.length} columns not recognised by date
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handlePreset('days', 7, "Last 7 Days Sales")}
            className="px-3 py-1.5 bg-white border border-purple-300 text-purple-800 rounded text-xs font-bold shadow-sm hover:bg-purple-100 transition-colors"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handlePreset('days', 30, "Last 30 Days Sales")}
            className="px-3 py-1.5 bg-white border border-purple-300 text-purple-800 rounded text-xs font-bold shadow-sm hover:bg-purple-100 transition-colors"
          >
            Last 30 Days
          </button>
          <button
            onClick={() => handlePreset('months', 6, "Last 6 Months Sales")}
            className="px-3 py-1.5 bg-white border border-purple-300 text-purple-800 rounded text-xs font-bold shadow-sm hover:bg-purple-100 transition-colors"
          >
            Last 6 Months
          </button>
        </div>

        {/* Months */}
        {months.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-purple-200/50">
            {months.map(m => (
              <button
                key={m.label}
                onClick={() => handleMonth(m.label, m.columns)}
                className="px-2.5 py-1 bg-purple-100/50 border border-purple-200 text-purple-700 rounded text-xs hover:bg-purple-200 transition-colors"
              >
                {m.label} ({m.columns.length})
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
