const fs = require('fs');
const c = fs.readFileSync('./js/app.js', 'utf8');
let p = 0, b = 0;
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    const x = l[j];
    if (x === '(') p++;
    if (x === ')') p--;
    if (x === '{') b++;
    if (x === '}') b--;
  }
  if (b < 0) {
    console.log('Negative braces at line ' + (i+1) + ': ' + l.substring(0,60) + ' | b=' + b);
    break;
  }
}
console.log('Final: p=' + p + ', b=' + b);
