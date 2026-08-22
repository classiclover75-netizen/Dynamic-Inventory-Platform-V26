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

// Replacement 5
replaceStr('src/components/TableView.tsx',
`          const activeWidth = header
            ? header.getSize()
            : col.width ||
              (col.key === "sr"
                ? state.globalRowNoWidth || 100
                : col.type === "image"
                  ? 137
                  : 150);
          currentLeftOffset += activeWidth;`,
`          const activeWidth = header
            ? header.getSize()
            : col.key === "sr"
              ? Math.max(col.width || state.globalRowNoWidth || 100, 110)
              : col.width || (col.type === "image" ? 137 : 150);
          currentLeftOffset += activeWidth;`);

// Replacement 6
replaceStr('src/components/TableView.tsx',
`                  const activeWidth = header
                    ? header.getSize()
                    : col.width ||
                      (col.key === "sr"
                        ? state.globalRowNoWidth || 100
                        : col.type === "image"
                          ? 137
                          : 150);

                  const defaultWidthClass =`,
`                  const activeWidth = header
                    ? header.getSize()
                    : col.key === "sr"
                      ? Math.max(col.width || state.globalRowNoWidth || 100, 110)
                      : col.width || (col.type === "image" ? 137 : 150);

                  const defaultWidthClass =`);

// Replacement 7
replaceStr('src/components/TableView.tsx',
`                                  const activeWidth = header
                                    ? header.getSize()
                                    : col.width ||
                                      (col.key === "sr"
                                        ? state.globalRowNoWidth || 100
                                        : col.type === "image"
                                          ? 137
                                          : 150);`,
`                                  const activeWidth = header
                                    ? header.getSize()
                                    : col.key === "sr"
                                      ? Math.max(col.width || state.globalRowNoWidth || 100, 110)
                                      : col.width || (col.type === "image" ? 137 : 150);`);

console.log('TableView.tsx updated');
