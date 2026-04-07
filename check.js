const fs = require('fs');
const c = fs.readFileSync('C:/Users/USER/Desktop/maria-project/js/app.js', 'utf8');
let p = 0, b = 0, s = 0, e = false;
for (let i = 0; i < c.length; i++) {
  const x = c[i];
  if (e) { e = false; continue; }
  if (x === '\\') { e = true; continue; }
  if (!s && (x === '"' || x === "'" || x === '`')) { s = 1; continue; }
  if (s && x === c[i-1]) { s = 0; continue; }
  if (s) continue;
  if (x === '(') p++;
  if (x === ')') p--;
  if (x === '{') b++;
  if (x === '}') b--;
}
console.log('Final: p=' + p + ', b=' + b);
