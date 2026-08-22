const fs = require('fs');

function applyReplacements(file, replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const { find, replace } of replacements) {
    if (content.indexOf(find) === -1) {
      console.error(`Not found in ${file}:\n`, find);
      process.exit(1);
    } else {
      content = content.replace(find, replace);
      while (content.indexOf(find) !== -1) {
          content = content.replace(find, replace);
      }
    }
  }
  fs.writeFileSync(file, content, 'utf8');
}

applyReplacements('src/components/AddRowModal.tsx', [
  {
    find: `  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {\n    if (e.key === "Enter" && e.shiftKey) {`,
    replace: `  const insertPlainText = (text: string) => {\n    const selection = window.getSelection();\n    if (!selection || !selection.rangeCount) return;\n    selection.deleteFromDocument();\n    const range = selection.getRangeAt(0);\n\n    // Normalize: If we are at the end of a formatting tag, move out before inserting plain text\n    // to prevent formatting bleed from the previous content.\n    let container = range.startContainer;\n    if (\n      container.nodeType === Node.TEXT_NODE &&\n      range.startOffset === (container.textContent?.length || 0)\n    ) {\n      let parent = container.parentElement;\n      while (parent && parent !== divRef.current) {\n        if (\n          ["B", "I", "U", "S", "SPAN", "STRONG", "EM", "FONT"].includes(\n            parent.tagName,\n          )\n        ) {\n          range.setStartAfter(parent);\n          range.collapse(true);\n        }\n        parent = parent.parentElement;\n      }\n    }\n\n    const textNode = document.createTextNode(text);\n    range.insertNode(textNode);\n    range.setStartAfter(textNode);\n    range.collapse(true);\n    selection.removeAllRanges();\n    selection.addRange(range);\n  };\n\n  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {\n    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "v") {\n      e.preventDefault();\n      if (navigator.clipboard && navigator.clipboard.readText) {\n        navigator.clipboard\n          .readText()\n          .then((text) => {\n            if (!text) return;\n            insertPlainText(text);\n            if (divRef.current) onChange(divRef.current.innerHTML);\n          })\n          .catch(() => {\n            // Clipboard read permission denied or unavailable; nothing to fall back to here\n            // since the default browser paste action was already prevented.\n          });\n      }\n      return;\n    }\n    if (e.key === "Enter" && e.shiftKey) {`
  },
  {
    find: `    if (!isPlainPaste) {\n      document.execCommand("insertHTML", false, html);\n    } else {\n      const selection = window.getSelection();\n      if (!selection || !selection.rangeCount) return;\n      selection.deleteFromDocument();\n      const range = selection.getRangeAt(0);\n\n      // Normalize: If we are at the end of a formatting tag, move out before inserting plain text\n      // to prevent formatting bleed from the previous content.\n      let container = range.startContainer;\n      if (\n        container.nodeType === Node.TEXT_NODE &&\n        range.startOffset === (container.textContent?.length || 0)\n      ) {\n        let parent = container.parentElement;\n        while (parent && parent !== divRef.current) {\n          if (\n            ["B", "I", "U", "S", "SPAN", "STRONG", "EM", "FONT"].includes(\n              parent.tagName,\n            )\n          ) {\n            range.setStartAfter(parent);\n            range.collapse(true);\n          }\n          parent = parent.parentElement;\n        }\n      }\n\n      const textNode = document.createTextNode(text);\n      range.insertNode(textNode);\n      range.setStartAfter(textNode);\n      range.collapse(true);\n      selection.removeAllRanges();\n      selection.addRange(range);\n    }\n    onChange(e.currentTarget.innerHTML);\n  };`,
    replace: `    if (!isPlainPaste) {\n      document.execCommand("insertHTML", false, html);\n    } else {\n      insertPlainText(text);\n    }\n    onChange(e.currentTarget.innerHTML);\n  };`
  }
]);

console.log("Replacements complete");
