const fs = require('fs');
const c = fs.readFileSync('C:/Users/USER/Desktop/maria-project/js/app.js', 'utf8');
let p = 0, b = 0;
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const x = line[j];
    if (x === '/' && line[j+1] === '/') break;
    if (x === '/' && line[j+1] === '*') {
      j += 2;
      while (j < line.length && !(line[j] === '*' && line[j+1] === '/')) j++;
      continue;
    }
    if (x === '"' || x === "'" || x === '`') {
      const quote = x;
      j++;
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++;
        j++;
      }
      continue;
    }
    if (x === '(') p++;
    if (x === ')') p--;
    if (x === '{') b++;
    if (x === '}') b--;
  }
  if (p > 1 || b > 2) {
    console.log('Excess at line ' + (i+1) + ': p=' + p + ', b=' + b + ' | ' + line.substring(0,60));
  }
}
console.log('Final: p=' + p + ', b=' + b);
