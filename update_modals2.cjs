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

// ExcelExportModal.tsx Replacement 5
replaceStr('src/components/ExcelExportModal.tsx',
`                  {filteredRows.map((row) => (
                    <tr key={row.id} className={selectedRowIds.has(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
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

// ExcelExportModal.tsx Replacement 6
replaceStr('src/components/ExcelExportModal.tsx',
`                          <td key={c.key} className="p-2 border whitespace-pre-wrap break-words min-w-[150px]">`,
`                          <td key={c.key} style={cellStyle} className="p-2 border whitespace-pre-wrap break-words min-w-[150px]">`);

// RangeSumOverviewModal.tsx Replacement 10
replaceStr('src/components/RangeSumOverviewModal.tsx',
`              {sortedRows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className={getBodyCls('__row', "p-2 border text-center font-bold bg-gray-100")} style={getBodySty('__row')}>
                    {rowNumbers.get(row.id) || (i + 1)}
                  </td>
                  <td className={getBodyCls('__range_sum', "p-0 border border-black bg-blue-50 text-blue-700 align-top")} style={getBodySty('__range_sum')}>
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

console.log('Modals updated');
