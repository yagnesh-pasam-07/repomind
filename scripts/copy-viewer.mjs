// Assembles the self-contained viewer from its parts into dist/viewer/template.html, with rough.js inlined.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const parts = ['head.html', 'app1.js', 'app2.js'].map((p) => readFileSync(`src/viewer/parts/${p}`, 'utf8'));
const theme = readFileSync('src/web/theme.css', 'utf8');
// Favicon as a data URI so the offline HTML map keeps its icon.
const favicon = 'data:image/svg+xml,' + encodeURIComponent(readFileSync('src/web/favicon.svg', 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim());
const fill = (html) => html.replace('/*__THEME_CSS__*/', () => theme).replaceAll('/*__FAVICON__*/', () => favicon).replace('/*__ROUGH_JS__*/', () => rough);
const rough = readFileSync('node_modules/roughjs/bundled/rough.js', 'utf8').replace(/<\/script/gi, '<\\/script');
mkdirSync('dist/viewer', { recursive: true });
writeFileSync('dist/viewer/template.html', fill(parts.join('\n')));
writeFileSync('dist/viewer/landing.html', fill(readFileSync('src/web/landing.html', 'utf8')));
