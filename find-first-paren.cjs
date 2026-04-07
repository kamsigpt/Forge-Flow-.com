const fs = require('fs');
const c = fs.readFileSync('./js/app.js', 'utf8');
let p = 0, b = 0;
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    const x = l[j];
    if (x === '(') {
      console.log('Open ( at line ' + (i+1) + ': ' + l.substring(0,70));
      p++;
    }
    if (x === ')') {
      p--;
    }
    if (x === '{') b++;
    if (x === '}') b--;
  }
  if (p > 0) {
    break;
  }
}
console.log('First paren opens at line ' + (i+1) + ': p=' + p);
