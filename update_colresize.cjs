const fs = require('fs');
const file = 'src/components/ColumnResizeHandle.tsx';
let content = fs.readFileSync(file, 'utf8');

const oldStr = `    let val = parseInt(inputValue);
    if (!isNaN(val)) {
      if (val < 20) val = 20;`;

const newStr = `    let val = parseInt(inputValue);
    if (!isNaN(val)) {
      const minWidth = header?.column?.id === "sr" ? 110 : 20;
      if (val < minWidth) val = minWidth;`;

if (!content.includes(oldStr)) {
  console.error("Not found in ColumnResizeHandle.tsx");
  process.exit(1);
} else {
  content = content.replace(oldStr, newStr);
}

fs.writeFileSync(file, content, 'utf8');
console.log('ColumnResizeHandle.tsx updated');
