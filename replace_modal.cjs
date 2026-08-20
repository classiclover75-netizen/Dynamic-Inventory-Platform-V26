const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const startMarker = '{/* --- CUSTOM SUM MODAL --- */}';
const endMarker = '      <ExportChoiceModal';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `{/* --- CUSTOM SUM MODAL --- */}
      <RangeSumOverviewModal
        isOpen={isSumModalOpen}
        onClose={() => setIsSumModalOpen(false)}
        columns={activeConfig.columns}
        rows={activeRows}
        onApply={(startName, endName, keys) => {
          setActiveCustomSum({
            startName,
            endName,
            keys
          });
          setIsSumModalOpen(false);
          toast(\`Calculated sum for \${keys.length} columns.\`);
        }}
      />

`;
  
  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync('src/App.tsx', content);
  console.log('Success');
} else {
  console.log('Markers not found');
}
