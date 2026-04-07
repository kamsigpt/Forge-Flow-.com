const fs = require('fs');
const c = fs.readFileSync('./js/app.js', 'utf8');
let p = 0;
const lines = c.split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (let j = 0; j < l.length; j++) {
    const x = l[j];
    if (x === '(') {
      p++;
      console.log('Open ( at line ' + (i+1) + ' col ' + (j+1) + ': ' + l.substring(Math.max(0,j-20), j+30));
    }
    if (x === ')') {
      p--;
    }
  }
  if (p > 0) {
    console.log('p is now ' + p + ' at line ' + (i+1));
  }
}
