const fs = require('fs');

let content = fs.readFileSync('src/components/RangeSumOverviewModal.tsx', 'utf8');

// 1. Add useRef to import
content = content.replace("import React, { useState, useMemo, useEffect } from 'react';", "import React, { useState, useMemo, useEffect, useRef } from 'react';");

// 2. Split useEffect
const oldEffect = `  useEffect(() => {
    if (isOpen) {
      selectAll(orderedSaleColKeys);
      setShowSaleColumns(true);
      setSearchQuery("");
      setColWidths(initialColWidths || {});
    }
  }, [isOpen, selectAll, orderedSaleColKeys, initialColWidths]);`;

const newEffect = `  const initialColWidthsRef = useRef(initialColWidths);
  useEffect(() => {
    initialColWidthsRef.current = initialColWidths;
  }, [initialColWidths]);

  useEffect(() => {
    if (isOpen) {
      selectAll(orderedSaleColKeys);
      setShowSaleColumns(true);
      setSearchQuery("");
    }
  }, [isOpen, selectAll, orderedSaleColKeys]);

  useEffect(() => {
    if (isOpen) {
      setColWidths(initialColWidthsRef.current || {});
    }
  }, [isOpen]);`;

content = content.replace(oldEffect, newEffect);

// 3. Update getBodyCls
const oldGetBodyCls = `  const getBodyCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLast = colId === lastPinnedColId;
    return \`\${baseCls} \${isPinned ? 'sticky z-10' : ''} \${isLast ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-400' : ''}\`;
  };`;

const newGetBodyCls = `  const getBodyCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLast = colId === lastPinnedColId;
    const needsBg = isPinned && !baseCls.includes('bg-');
    return \`\${baseCls} \${isPinned ? 'sticky z-10' : ''} \${needsBg ? 'bg-white' : ''} \${isLast ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15)] border-r-gray-400' : ''}\`;
  };`;

content = content.replace(oldGetBodyCls, newGetBodyCls);

// 4. Update getBodySty (definition)
content = content.replace("const getBodySty = (colId: string, width: number) => {", "const getBodySty = (colId: string) => {");

// 5. Update getBodySty (calls)
content = content.replace(/style=\{getBodySty\('__row', getColWidth\('__row'\)\)\}/g, "style={getBodySty('__row')}");
content = content.replace(/style=\{getBodySty\('__range_sum', getColWidth\('__range_sum'\)\)\}/g, "style={getBodySty('__range_sum')}");
content = content.replace(/style=\{getBodySty\(c\.key, getColWidth\(c\.key\)\)\}/g, "style={getBodySty(c.key)}");

fs.writeFileSync('src/components/RangeSumOverviewModal.tsx', content, 'utf8');
console.log('Patched modal successfully.');
