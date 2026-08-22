const fs = require('fs');

function applyReplacements(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const { find, replace } of replacements) {
    if (content.indexOf(find) === -1) {
      console.error(`Not found in ${file}:`, find);
    } else {
      content = content.replace(find, replace);
      // for occurrences > 1, replace them all
      while (content.indexOf(find) !== -1) {
          content = content.replace(find, replace);
      }
    }
  }
  fs.writeFileSync(file, content, 'utf8');
}

applyReplacements('src/App.tsx', [
  {
    find: `        const colData = indexData ? indexData.colData : [];`,
    replace: `        const colData: { name: string; val: string }[] = indexData ? indexData.colData : [];`
  }
]);

applyReplacements('src/components/SearchBarsSection.tsx', [
  {
    find: `      setPageSearchQueries((prev) =>\n        prev[activePage] === primarySearchInput`,
    replace: `      setPageSearchQueries((prev: Record<string, string>) =>\n        prev[activePage] === primarySearchInput`
  },
  {
    find: `        setPageSearchQueries((prev) =>\n          prev[activeSecPage] === secondarySearchInput`,
    replace: `        setPageSearchQueries((prev: Record<string, string>) =>\n          prev[activeSecPage] === secondarySearchInput`
  },
  {
    find: `      setPrimarySearchTags((prev) => [...prev, primarySearchInput.trim()]);`,
    replace: `      setPrimarySearchTags((prev: string[]) => [...prev, primarySearchInput.trim()]);`
  },
  {
    find: `    setPrimarySearchTags((prev) => prev.filter((_, i) => i !== index));`,
    replace: `    setPrimarySearchTags((prev: string[]) => prev.filter((_: string, i: number) => i !== index));`
  },
  {
    find: `      setSecondarySearchTags((prev) => [...prev, secondarySearchInput.trim()]);`,
    replace: `      setSecondarySearchTags((prev: string[]) => [...prev, secondarySearchInput.trim()]);`
  },
  {
    find: `    setSecondarySearchTags((prev) => prev.filter((_, i) => i !== index));`,
    replace: `    setSecondarySearchTags((prev: string[]) => prev.filter((_: string, i: number) => i !== index));`
  },
  {
    find: `      setPrimarySearchTags((prev) => prev.slice(0, -1));`,
    replace: `      setPrimarySearchTags((prev: string[]) => prev.slice(0, -1));`
  },
  {
    find: `      setSecondarySearchTags((prev) => prev.slice(0, -1));`,
    replace: `      setSecondarySearchTags((prev: string[]) => prev.slice(0, -1));`
  },
  {
    find: `          (type) => {\n            if (type === "primary") {`,
    replace: `          (type: string) => {\n            if (type === "primary") {`
  },
  {
    find: `                      {primarySearchTags.map((tag, idx) => (`,
    replace: `                      {primarySearchTags.map((tag: string, idx: number) => (`
  },
  {
    find: `                      {secondarySearchTags.map((tag, idx) => (`,
    replace: `                      {secondarySearchTags.map((tag: string, idx: number) => (`
  }
]);

applyReplacements('src/components/TableView.tsx', [
  {
    find: `      (col) => col.sortEnabled && col.sortPriority && col.sortPriority > 0,`,
    replace: `      (col: any) => col.sortEnabled && col.sortPriority && col.sortPriority > 0,`
  },
  {
    find: `    visibleColumns.forEach((col) => {\n      let tokens: string[] = [];`,
    replace: `    visibleColumns.forEach((col: any) => {\n      let tokens: string[] = [];`
  },
  {
    find: `      queries.forEach((query) => {\n        const qLower = query.toLowerCase();`,
    replace: `      queries.forEach((query: string) => {\n        const qLower = query.toLowerCase();`
  },
  {
    find: `                {visibleColumns.map((col, i) => {`,
    replace: `                {visibleColumns.map((col: any, i: number) => {`
  },
  {
    find: `                    .find((h) => h.id === col.key);\n                  const isResizing = header?.column?.getIsResizing();`,
    replace: `                    .find((h: any) => h.id === col.key);\n                  const isResizing = header?.column?.getIsResizing();`
  },
  {
    find: `                      {virtualItems.map((virtualItem) => {`,
    replace: `                      {virtualItems.map((virtualItem: any) => {`
  },
  {
    find: `                                {visibleColumns.map((col, colIndex) => {`,
    replace: `                                {visibleColumns.map((col: any, colIndex: number) => {`
  },
  {
    find: `                                    .find((h) => h.id === col.key);\n                                  const activeWidth = header`,
    replace: `                                    .find((h: any) => h.id === col.key);\n                                  const activeWidth = header`
  },
  {
    find: `                                                  (r) => r.id === row.id,`,
    replace: `                                                  (r: any) => r.id === row.id,`
  },
  {
    find: `                                      const saleCols = config.columns.filter(\n                                        (c) => c.type === "sale_tracker",`,
    replace: `                                      const saleCols = config.columns.filter(\n                                        (c: any) => c.type === "sale_tracker",`
  },
  {
    find: `                                          saleCols.forEach((sc) => {`,
    replace: `                                          saleCols.forEach((sc: any) => {`
  },
  {
    find: `                                                              setInlineEdit((prev) => ({ ...prev!, val: JSON.stringify(copy) }));`,
    replace: `                                                              setInlineEdit((prev: any) => ({ ...prev!, val: JSON.stringify(copy) }));`
  }
]);

applyReplacements('src/hooks/useSaveActions.ts', [
  {
    find: `      setState((prev) => ({\n        ...prev,\n        pageConfigs: {`,
    replace: `      setState((prev: any) => ({\n        ...prev,\n        pageConfigs: {`
  },
  {
    find: `      setState((prev) => ({\n        ...prev,\n        pageRows: {`,
    replace: `      setState((prev: any) => ({\n        ...prev,\n        pageRows: {`
  },
  {
    find: `                .filter((c) => c.type === "sale_tracker")\n                .map((c) => c.key),`,
    replace: `                .filter((c: any) => c.type === "sale_tracker")\n                .map((c: any) => c.key),`
  },
  {
    find: `          setState((prev) => ({\n            ...prev,\n            pageRows: { ...prev.pageRows, [trackerName]: trackerRows },`,
    replace: `          setState((prev: any) => ({\n            ...prev,\n            pageRows: { ...prev.pageRows, [trackerName]: trackerRows },`
  }
]);

applyReplacements('src/hooks/useTrackerActions.ts', [
  {
    find: `      ? sourceConfig.columns.filter(\n          (c) => selectedColKeys.includes(c.key) || c.key === "sr",`,
    replace: `      ? sourceConfig.columns.filter(\n          (c: any) => selectedColKeys.includes(c.key) || c.key === "sr",`
  },
  {
    find: `    const newRows = sourceRows.map((row) => {\n      const newRow = { ...row };`,
    replace: `    const newRows = sourceRows.map((row: any) => {\n      const newRow = { ...row };`
  },
  {
    find: `    activeRows.forEach(row => {\n      const rawTotal = String(row.total_qty || "0");`,
    replace: `    activeRows.forEach((row: any) => {\n      const rawTotal = String(row.total_qty || "0");`
  },
  {
    find: `    const currentColumns = activeConfig.columns.map((c) =>\n      c.type === "sale_tracker" ? { ...c, archived: true } : c,`,
    replace: `    const currentColumns = activeConfig.columns.map((c: any) =>\n      c.type === "sale_tracker" ? { ...c, archived: true } : c,`
  },
  {
    find: `    const firstSaleIndex = activeConfig.columns.findIndex(\n      (c) => c.type === "sale_tracker",\n    );`,
    replace: `    const firstSaleIndex = activeConfig.columns.findIndex(\n      (c: any) => c.type === "sale_tracker",\n    );`
  },
  {
    find: `      setState((prev) => ({\n        ...prev,`,
    replace: `      setState((prev: any) => ({\n        ...prev,`
  },
  {
    find: `    const updatedColumns = activeConfig.columns.filter(\n      (c) => !colKeysSet.has(c.key),\n    );`,
    replace: `    const updatedColumns = activeConfig.columns.filter(\n      (c: any) => !colKeysSet.has(c.key),\n    );`
  },
  {
    find: `    const updatedRows = activeRows.map((row) => {\n      const newRow = { ...row };`,
    replace: `    const updatedRows = activeRows.map((row: any) => {\n      const newRow = { ...row };`
  },
  {
    find: `    const sourceRowMap = new Map(sourceRows.map((r: any) => [r.id, r]));\n    const updatedTrackerRows = activeRows.map((row: any) => {\n      const sourceRow = sourceRowMap.get(row.id);\n      const newRow = { ...row };`,
    replace: `    const sourceRowMap = new Map<string, any>(sourceRows.map((r: any) => [r.id, r]));\n    const updatedTrackerRows = activeRows.map((row: any) => {\n      const sourceRow = sourceRowMap.get(row.id);\n      const newRow: any = { ...row };`
  }
]);

console.log("Replacements complete");
