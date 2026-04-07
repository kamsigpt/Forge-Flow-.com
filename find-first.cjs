const fs = require('fs');
const c = fs.readFileSync('./js/app.js', 'utf8');
let p = 0, b = 0;
const lines = c.split('\n');
let prevP = 0, prevB = 0;
let foundExcess = false;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  prevP = p;
  prevB = b;
  for (let j = 0; j < l.length; j++) {
    const x = l[j];
    if (x === '(') p++;
    if (x === ')') p--;
    if (x === '{') b++;
    if (x === '}') b--;
  }
  if (!foundExcess && p > 0 && b > 0) {
    foundExcess = true;
    console.log('First excess at line ' + (i+1) + ': p=' + p + ', b=' + b + ' | ' + l.substring(0,60));
  }
}
console.log('Final: p=' + p + ', b=' + b);
