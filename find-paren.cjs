const fs = require('fs');
const c = fs.readFileSync('./js/app.js', 'utf8');
let p = 0, b = 0;
const lines = c.split('\n');
let maxP = 0, maxPLine = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    const x = l[j];
    if (x === '(') p++;
    if (x === ')') p--;
    if (x === '{') b++;
    if (x === '}') b--;
  }
  if (p > maxP) {
    maxP = p;
    maxPLine = i + 1;
  }
}
console.log('Max parens: ' + maxP + ' at line ' + maxPLine);
console.log('Final: p=' + p + ', b=' + b);
