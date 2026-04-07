const fs = require('fs');
const c = fs.readFileSync('C:/Users/USER/Desktop/maria-project/js/app.js', 'utf8');
let p = 0, b = 0;
for (let i = 0; i < c.length; i++) {
  const x = c[i];
  if (x === '/' && c[i+1] === '/') {
    while (i < c.length && c[i] !== '\n') i++;
    continue;
  }
  if (x === '/' && c[i+1] === '*') {
    i += 2;
    while (i < c.length && !(c[i] === '*' && c[i+1] === '/')) i++;
    i++;
    continue;
  }
  if (x === '"' || x === "'" || x === '`') {
    const quote = x;
    i++;
    while (i < c.length && c[i] !== quote) {
      if (c[i] === '\\') i++;
      i++;
    }
    continue;
  }
  if (x === '(') p++;
  if (x === ')') p--;
  if (x === '{') b++;
  if (x === '}') b--;
}
console.log('Final: p=' + p + ', b=' + b);
