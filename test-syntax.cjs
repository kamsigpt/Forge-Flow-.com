import { checkJs } from './node_modules/typescript/lib/typescript.js';
import * as ts from './node_modules/typescript/lib/typescript.js';
import * as fs from 'fs';

const code = fs.readFileSync('./js/app.js', 'utf8');
const result = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.ESNext }
});

if (result.diagnostics && result.diagnostics.length > 0) {
  result.diagnostics.forEach(d => {
    console.log(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  });
} else {
  console.log('No TypeScript errors found');
}
