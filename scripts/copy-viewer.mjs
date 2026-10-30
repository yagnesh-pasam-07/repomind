// Assembles the self-contained viewer from its parts into dist/viewer/template.html, with rough.js inlined.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const parts = ['head.html', 'app1.js', 'app2.js'].map((p) => readFileSync(`src/viewer/parts/${p}`, 'utf8'));
const theme = readFileSync('src/web/theme.css', 'utf8');
// Favicon and logo as data URIs so the offline HTML map keeps them.
// The SVGs carry a prefers-color-scheme block; an <img> follows the OS, not RepoMind's own theme toggle,
// so we also emit a dark variant (media query forced on) and the pages swap src when the theme changes.
const clean = (svg) => svg.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim();
const darkOf = (svg) => svg.replace(/@media \(prefers-color-scheme: dark\) \{([\s\S]*?\})\s*\}/, '$1');
const lightOf = (svg) => svg.replace(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\}\s*\}/, '');
const uri = (svg) => 'data:image/svg+xml,' + encodeURIComponent(clean(svg));
const read = (f) => readFileSync(f, 'utf8');
const favicon = uri(read('src/web/favicon.svg'));
const logo = uri(lightOf(read('src/web/logo.svg')));
const logoDark = uri(darkOf(read('src/web/logo.svg')));
const fill = (html) => html.replace('/*__THEME_CSS__*/', () => theme).replaceAll('/*__FAVICON__*/', () => favicon).replaceAll('/*__LOGO__*/', () => logo).replaceAll('/*__LOGO_DARK__*/', () => logoDark).replace('/*__ROUGH_JS__*/', () => rough);
const rough = readFileSync('node_modules/roughjs/bundled/rough.js', 'utf8').replace(/<\/script/gi, '<\\/script');
mkdirSync('dist/viewer', { recursive: true });
writeFileSync('dist/viewer/template.html', fill(parts.join('\n')));
writeFileSync('dist/viewer/landing.html', fill(readFileSync('src/web/landing.html', 'utf8')));
