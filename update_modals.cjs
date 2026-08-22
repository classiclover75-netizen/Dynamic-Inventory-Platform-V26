const fs = require('fs');

function replaceStr(file, oldStr, newStr) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes(oldStr)) {
    console.error(`Not found in ${file}. Expected:\n${oldStr}`);
    process.exit(1);
  } else {
    content = content.replace(oldStr, newStr);
  }
  fs.writeFileSync(file, content, 'utf8');
}

// Replacement 1
replaceStr('src/components/ManageTrackerColumnsModal.tsx',
`import { formatCellDisplay } from '../lib/formatCellDisplay';`,
`import { formatCellDisplay } from '../lib/formatCellDisplay';
import { resolveRowColorStyle } from '../lib/rowCellColor';`);

// Replacement 2
replaceStr('src/components/ManageTrackerColumnsModal.tsx',
`                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      {exportColumns.map((c) => {
                        const rawVal = getCellValue(row, c);
                        return (
                          <td
                            key={c.key}
                            className="p-2 border whitespace-pre-wrap break-words min-w-[150px]"
                          >`,
`                  {filteredRows.map((row) => {
                    const rowColorStyle = resolveRowColorStyle(row);
                    return (
                    <tr key={row.id} className={rowColorStyle ? "" : "hover:bg-gray-50"}>
                      {exportColumns.map((c) => {
                        const rawVal = getCellValue(row, c);
                        return (
                          <td
                            key={c.key}
                            style={rowColorStyle || undefined}
                            className="p-2 border whitespace-pre-wrap break-words min-w-[150px]"
                          >`);

// Replacement 3
replaceStr('src/components/ManageTrackerColumnsModal.tsx',
`                        );
                      })}
                    </tr>
                  ))}`,
`                        );
                      })}
                    </tr>
                    );
                  })}`);

// Replacement 4
replaceStr('src/components/ExcelExportModal.tsx',
`import { filterAndSortTrackerRows } from '../lib/trackerSortUtils';`,
`import { filterAndSortTrackerRows } from '../lib/trackerSortUtils';
import { resolveRowColorStyle } from '../lib/rowCellColor';`);

// Replacement 5
replaceStr('src/components/ExcelExportModal.tsx',
`                  {filteredRows.map((row) => {
                    const isRowSelected = selectedRowIds.has(row.id);
                    return (
                    <tr key={row.id} className={isRowSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="p-2 border text-center">`,
`                  {filteredRows.map((row) => {
                    const rowColorStyle = resolveRowColorStyle(row);
                    const isRowSelected = selectedRowIds.has(row.id);
                    const cellStyle = rowColorStyle
                      ? (isRowSelected
                          ? { ...rowColorStyle, boxShadow: 'inset 0 2px 0 0 #2b579a, inset 0 -2px 0 0 #2b579a' }
                          : rowColorStyle)
                      : undefined;
                    return (
                    <tr key={row.id} className={rowColorStyle ? '' : (isRowSelected ? 'bg-blue-50' : 'hover:bg-gray-50')}>
                      <td style={cellStyle} className="p-2 border text-center">`);

// Replacement 6
replaceStr('src/components/ExcelExportModal.tsx',
`                          <td key={c.key} className="p-2 border whitespace-pre-wrap break-words min-w-[150px]">`,
`                          <td key={c.key} style={cellStyle} className="p-2 border whitespace-pre-wrap break-words min-w-[150px]">`);

// Replacement 7 (Already matches current, but let's replace just in case)
replaceStr('src/components/ExcelExportModal.tsx',
`                        );
                      })}
                    </tr>
                    );
                  })}`,
`                        );
                      })}
                    </tr>
                    );
                  })}`);

// Replacement 8
replaceStr('src/components/RangeSumOverviewModal.tsx',
`import { formatCellDisplay } from '../lib/formatCellDisplay';`,
`import { formatCellDisplay } from '../lib/formatCellDisplay';
import { resolveRowColorStyle } from '../lib/rowCellColor';`);

// Replacement 9
replaceStr('src/components/RangeSumOverviewModal.tsx',
`  const getBodySty = (colId: string) => {
    const isPinned = pinnedCols.includes(colId);
    let bg = '#ffffff';
    if (colId === '__row') bg = '#f3f4f6';
    else if (colId === '__range_sum') bg = '#eff6ff';
    return isPinned ? { left: pinnedOffsets[colId], backgroundColor: bg } : {};
  };`,
`  const getBodySty = (colId: string, rowStyle?: React.CSSProperties) => {
    const isPinned = pinnedCols.includes(colId);
    let bg = '#ffffff';
    if (colId === '__row') bg = '#f3f4f6';
    else if (colId === '__range_sum') bg = '#eff6ff';
    return { ...(isPinned ? { left: pinnedOffsets[colId], backgroundColor: bg } : {}), ...(rowStyle || {}) };
  };`);

// Replacement 10
replaceStr('src/components/RangeSumOverviewModal.tsx',
`              {sortedRows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className={getBodyCls('__row', "p-2 border text-center font-bold bg-gray-100")} style={getBodySty('__row')}>
                    {rowNumbers.get(row.id) || (i + 1)}
                  </td>
                  <td className={getBodyCls('__range_sum', "p-0 border border-black bg-blue-50 align-top")} style={getBodySty('__range_sum')}>
                    {renderMultiSourceCell(JSON.stringify(getRowSumBreakdown(row)), 'bg-transparent', 'text-blue-700', 'border-blue-200', true, true)}
                  </td>`,
`              {sortedRows.map((row, i) => {
                const rowColorStyle = resolveRowColorStyle(row);
                const cellTextClass = rowColorStyle ? '' : 'text-gray-900';
                const sumTextClass = rowColorStyle ? '' : 'text-blue-700';
                const innerBgClass = rowColorStyle ? 'bg-transparent' : 'bg-white';
                return (
                <tr key={row.id} className={rowColorStyle ? '' : 'hover:bg-gray-50'}>
                  <td className={getBodyCls('__row', "p-2 border text-center font-bold bg-gray-100")} style={getBodySty('__row', rowColorStyle || undefined)}>
                    {rowNumbers.get(row.id) || (i + 1)}
                  </td>
                  <td className={getBodyCls('__range_sum', "p-0 border border-black bg-blue-50 align-top")} style={getBodySty('__range_sum', rowColorStyle || undefined)}>
                    {renderMultiSourceCell(JSON.stringify(getRowSumBreakdown(row)), 'bg-transparent', sumTextClass, 'border-blue-200', true, true)}
                  </td>`);

// Replacement 11
replaceStr('src/components/RangeSumOverviewModal.tsx',
`                        <td key={c.key} className={getBodyCls(c.key, "p-2 border align-top text-center")} style={getBodySty(c.key)}>`,
`                        <td key={c.key} className={getBodyCls(c.key, "p-2 border align-top text-center")} style={getBodySty(c.key, rowColorStyle || undefined)}>`);

replaceStr('src/components/RangeSumOverviewModal.tsx',
`                        <td key={c.key} className={getBodyCls(c.key, "p-0 border align-top")} style={getBodySty(c.key)}>
                          {renderMultiSourceCell(JSON.stringify(remainingSources), 'bg-white', 'text-gray-900', 'border-gray-200', false)}`,
`                        <td key={c.key} className={getBodyCls(c.key, "p-0 border align-top")} style={getBodySty(c.key, rowColorStyle || undefined)}>
                          {renderMultiSourceCell(JSON.stringify(remainingSources), innerBgClass, cellTextClass, 'border-gray-200', false)}`);

replaceStr('src/components/RangeSumOverviewModal.tsx',
`                        <td key={c.key} className={getBodyCls(c.key, "p-0 border align-top")} style={getBodySty(c.key)}>
                          {renderMultiSourceCell(row[c.key], 'bg-white', 'text-gray-900', 'border-gray-200', c.key === 'total_qty')}`,
`                        <td key={c.key} className={getBodyCls(c.key, "p-0 border align-top")} style={getBodySty(c.key, rowColorStyle || undefined)}>
                          {renderMultiSourceCell(row[c.key], innerBgClass, cellTextClass, 'border-gray-200', c.key === 'total_qty')}`);

replaceStr('src/components/RangeSumOverviewModal.tsx',
`                       <td key={c.key} className={getBodyCls(c.key, "p-2 border align-top break-words")} style={getBodySty(c.key)}>`,
`                       <td key={c.key} className={getBodyCls(c.key, "p-2 border align-top break-words")} style={getBodySty(c.key, rowColorStyle || undefined)}>`);

replaceStr('src/components/RangeSumOverviewModal.tsx',
`                  })}
                </tr>
              ))}`,
`                  })}
                </tr>
                );
              })}`);

console.log('Modals updated');
