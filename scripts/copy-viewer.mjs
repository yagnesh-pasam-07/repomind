// Assembles the self-contained viewer from its parts into dist/viewer/template.html, with rough.js inlined.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const parts = ['head.html', 'app1.js', 'app2.js'].map((p) => readFileSync(`src/viewer/parts/${p}`, 'utf8'));
const theme = readFileSync('src/web/theme.css', 'utf8');
// Favicon and logo as data URIs so the offline HTML map keeps them.
// Light and dark marks are separate files; pages swap <img> src with RepoMind's own theme toggle (D27).
const clean = (svg) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
const uri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(clean(svg));
const read = (f) => readFileSync(f, 'utf8');
// Brand from the owner's logo-sheet.png (D28): src/web/brand/. Favicon = indigo app icon; header = the bird mark.
const favicon = uri(read('src/web/brand/icon-indigo.svg'));
const mark = uri(read('src/web/brand/mark.svg'));
const markDark = uri(read('src/web/brand/mark-dark.svg'));
// Maker avatar (black and white, 160px) for the footer credit (D31).
const maker = 'data:image/jpeg;base64,' + readFileSync('src/web/brand/maker.jpg').toString('base64');
const fill = (html, isStatic = false) => html.replace('/*__STATIC__*/false', String(isStatic)).replace('/*__THEME_CSS__*/', () => theme).replaceAll('/*__FAVICON__*/', () => favicon).replaceAll('/*__MARK__*/', () => mark).replaceAll('/*__MARK_DARK__*/', () => markDark).replaceAll('/*__MAKER__*/', () => maker).replace('/*__ROUGH_JS__*/', () => rough);
const rough = readFileSync('node_modules/roughjs/bundled/rough.js', 'utf8').replace(/<\/script/gi, '<\\/script');
mkdirSync('dist/viewer', { recursive: true });
writeFileSync('dist/viewer/template.html', fill(parts.join('\n')));
for (const f of ['landing.html', 'app.html', 'login.html', 'social.html']) writeFileSync(`dist/viewer/${f}`, fill(readFileSync(`src/web/${f}`, 'utf8')));
