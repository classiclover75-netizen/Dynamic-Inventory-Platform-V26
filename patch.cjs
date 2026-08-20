const fs = require('fs');
let content = fs.readFileSync('src/components/RangeSumOverviewModal.tsx', 'utf8');

const searchShadow = `const SHADOW_CLASSES = {
  black: {
    firstAndLast: 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15),inset_-1px_-1px_0_#000,inset_1px_0_0_#000]',
    first: 'shadow-[inset_-1px_-1px_0_#000,inset_1px_0_0_#000]',
    last: 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15),inset_-1px_-1px_0_#000]',
    middle: 'shadow-[inset_-1px_-1px_0_#000]'
  },
  blue: {
    withDropShadow: 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15),inset_-1px_-1px_0_#1d4ed8,inset_1px_1px_0_#1d4ed8]',
    plain: 'shadow-[inset_-1px_-1px_0_#1d4ed8,inset_1px_1px_0_#1d4ed8]'
  }
};`;

const replaceShadow = `const SHADOW_CLASSES = {
  black: {
    firstAndLast: 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15),inset_-1px_-1px_0_#000,inset_1px_0_0_#000]',
    first: 'shadow-[inset_-1px_-1px_0_#000,inset_1px_0_0_#000]',
    last: 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.15),inset_-1px_-1px_0_#000]',
    middle: 'shadow-[inset_-1px_-1px_0_#000]'
  }
};`;

const searchHeader = `  const getHeaderCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLast = colId === lastPinnedColId;
    const isFirst = colId === pinnedCols[0];
    let shadowCls = '';
    if (isPinned) {
      if (colId === '__range_sum') {
        shadowCls = isLast ? SHADOW_CLASSES.blue.withDropShadow : SHADOW_CLASSES.blue.plain;
      } else {
        const theme = SHADOW_CLASSES.black;
        if (isFirst && isLast) {
          shadowCls = theme.firstAndLast;
        } else if (isFirst) {
          shadowCls = theme.first;
        } else if (isLast) {
          shadowCls = theme.last;
        } else {
          shadowCls = theme.middle;
        }
      }
    }
    return \`\${baseCls} sticky top-0 \${isPinned ? 'z-30' : 'z-20'} \${shadowCls}\`;
  };`;

const replaceHeader = `  const getHeaderCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLast = colId === lastPinnedColId;
    const isFirst = colId === pinnedCols[0];
    let shadowCls = '';
    if (isPinned) {
      const theme = SHADOW_CLASSES.black;
      if (isFirst && isLast) {
        shadowCls = theme.firstAndLast;
      } else if (isFirst) {
        shadowCls = theme.first;
      } else if (isLast) {
        shadowCls = theme.last;
      } else {
        shadowCls = theme.middle;
      }
    }
    return \`\${baseCls} sticky top-0 \${isPinned ? 'z-30' : 'z-20'} \${shadowCls}\`;
  };`;

const searchBody = `  const getBodyCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLast = colId === lastPinnedColId;
    const isFirst = colId === pinnedCols[0];
    const needsBg = isPinned && !baseCls.includes('bg-');
    let shadowCls = '';
    if (isPinned) {
      if (colId === '__range_sum') {
        shadowCls = isLast ? SHADOW_CLASSES.blue.withDropShadow : SHADOW_CLASSES.blue.plain;
      } else {
        const theme = SHADOW_CLASSES.black;
        if (isFirst && isLast) {
          shadowCls = theme.firstAndLast;
        } else if (isFirst) {
          shadowCls = theme.first;
        } else if (isLast) {
          shadowCls = theme.last;
        } else {
          shadowCls = theme.middle;
        }
      }
    }
    return \`\${baseCls} \${isPinned ? 'sticky z-[15]' : ''} \${needsBg ? 'bg-white' : ''} \${shadowCls}\`;
  };`;

const replaceBody = `  const getBodyCls = (colId: string, baseCls: string) => {
    const isPinned = pinnedCols.includes(colId);
    const isLast = colId === lastPinnedColId;
    const isFirst = colId === pinnedCols[0];
    const needsBg = isPinned && !baseCls.includes('bg-');
    let shadowCls = '';
    if (isPinned) {
      const theme = SHADOW_CLASSES.black;
      if (isFirst && isLast) {
        shadowCls = theme.firstAndLast;
      } else if (isFirst) {
        shadowCls = theme.first;
      } else if (isLast) {
        shadowCls = theme.last;
      } else {
        shadowCls = theme.middle;
      }
    }
    return \`\${baseCls} \${isPinned ? 'sticky z-[15]' : ''} \${needsBg ? 'bg-white' : ''} \${shadowCls}\`;
  };`;

content = content.replace(searchShadow, replaceShadow);
content = content.replace(searchHeader, replaceHeader);
content = content.replace(searchBody, replaceBody);

fs.writeFileSync('src/components/RangeSumOverviewModal.tsx', content, 'utf8');
