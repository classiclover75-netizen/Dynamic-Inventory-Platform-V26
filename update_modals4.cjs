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

replaceStr('src/components/RangeSumOverviewModal.tsx',
`                  })}
                </tr>
              ))}`,
`                  })}
                </tr>
                );
              })}`);

console.log('Modals updated');
