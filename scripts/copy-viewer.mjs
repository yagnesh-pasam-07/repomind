// Assembles the self-contained viewer from its parts into dist/viewer/template.html, with rough.js inlined.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const parts = ['head.html', 'app1.js', 'app2.js'].map((p) => readFileSync(`src/viewer/parts/${p}`, 'utf8'));
const theme = readFileSync('src/web/theme.css', 'utf8');
const rough = readFileSync('node_modules/roughjs/bundled/rough.js', 'utf8').replace(/<\/script/gi, '<\\/script');
mkdirSync('dist/viewer', { recursive: true });
writeFileSync('dist/viewer/template.html', parts.join('\n').replace('/*__THEME_CSS__*/', () => theme).replace('/*__ROUGH_JS__*/', () => rough));
writeFileSync('dist/viewer/landing.html', readFileSync('src/web/landing.html', 'utf8').replace('/*__THEME_CSS__*/', () => theme).replace('/*__ROUGH_JS__*/', () => rough));
