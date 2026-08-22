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
replaceStr('src/App.tsx',
`const initialConfig: PageConfig = {`,
`const ROW_NO_MIN_WIDTH = 110;

const initialConfig: PageConfig = {`);

// Replacement 2
replaceStr('src/App.tsx',
`          width: state.globalRowNoWidth || 100,`,
`          width: Math.max(state.globalRowNoWidth || 100, ROW_NO_MIN_WIDTH),`);

// Replacement 3
replaceStr('src/App.tsx',
`  const primVisibleColumns = useMemo(() => {
    const pConfig = state.pageConfigs[state.activePage];
    if (!pConfig || !pConfig.columns) return [];
    return pConfig.columns
      .filter((col) => showArchived || !col.archived)
      .map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: () => col.name,
        size:
          col.width ||
          (col.key === "sr"
            ? state.globalRowNoWidth || 100
            : col.type === "image"
              ? 137
              : 150),
      }));
  }, [
    state.activePage,
    state.pageConfigs,
    showArchived,
    state.globalRowNoWidth,
  ]);`,
`  const primVisibleColumns = useMemo(() => {
    const pConfig = state.pageConfigs[state.activePage];
    if (!pConfig || !pConfig.columns) return [];
    return pConfig.columns
      .filter((col) => showArchived || !col.archived)
      .map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: () => col.name,
        size:
          col.key === "sr"
            ? Math.max(col.width || state.globalRowNoWidth || 100, ROW_NO_MIN_WIDTH)
            : col.width || (col.type === "image" ? 137 : 150),
        minSize: col.key === "sr" ? ROW_NO_MIN_WIDTH : 20,
      }));
  }, [
    state.activePage,
    state.pageConfigs,
    showArchived,
    state.globalRowNoWidth,
  ]);`);

// Replacement 4
replaceStr('src/App.tsx',
`  const secVisibleColumns = useMemo(() => {
    const secPage = activeConfig.secondarySearchPage;
    if (!secPage || !state.pageConfigs[secPage]) return [];
    const secConfig = state.pageConfigs[secPage];
    return secConfig.columns
      .filter((col) => showArchived || !col.archived)
      .map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: () => col.name,
        size:
          col.width ||
          (col.key === "sr"
            ? state.globalRowNoWidth || 100
            : col.type === "image"
              ? 137
              : 150),
      }));
  }, [`,
`  const secVisibleColumns = useMemo(() => {
    const secPage = activeConfig.secondarySearchPage;
    if (!secPage || !state.pageConfigs[secPage]) return [];
    const secConfig = state.pageConfigs[secPage];
    return secConfig.columns
      .filter((col) => showArchived || !col.archived)
      .map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: () => col.name,
        size:
          col.key === "sr"
            ? Math.max(col.width || state.globalRowNoWidth || 100, ROW_NO_MIN_WIDTH)
            : col.width || (col.type === "image" ? 137 : 150),
        minSize: col.key === "sr" ? ROW_NO_MIN_WIDTH : 20,
      }));
  }, [`);

console.log('App.tsx updated');
