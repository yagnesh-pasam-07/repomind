// Static showcase for Vercel (D31): landing, sign-in, example map, brand assets. No scanning server.
// Output: public/ (Vercel's default static output for "Other" projects).
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { renderViewer, scan } from '../dist/index.js';

const out = 'public';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Static site: no workspace, so "Maps" opens the example map; add link-preview tags for sharing.
// Absolute URLs: link previewers (LinkedIn, Slack, X) ignore relative og:image paths.
const SITE = process.env.REPOMIND_SITE || 'https://repomind-pi.vercel.app';
const OG = `<meta property="og:title" content="RepoMind — your codebase, as a living map" />\n<meta property="og:description" content="Every app, database, cloud service and integration on one hand-drawn map, redrawn on every commit." />\n<meta property="og:image" content="${SITE}/social-preview.png" />\n<meta property="og:url" content="${SITE}/" />\n<meta name="twitter:card" content="summary_large_image" />\n`;
const flagStatic = (html) => html
  .replace('const STATIC = false;', 'const STATIC = true;')
  .replace('<a href="/app">Maps</a>', '<a href="/map">Example map</a>')
  .replace('</title>', '</title>\n' + OG);
writeFileSync(`${out}/index.html`, flagStatic(readFileSync('dist/viewer/landing.html', 'utf8')));
writeFileSync(`${out}/login.html`, readFileSync('dist/viewer/login.html', 'utf8'));

const g = scan('examples/sumitra-like', { repoName: 'sumitra (example)' });
writeFileSync(`${out}/example.html`, renderViewer(g, { embed: true }));
// Full-screen version of the same map for people who click through.
writeFileSync(`${out}/map.html`, renderViewer(g));

mkdirSync(`${out}/brand`, { recursive: true });
cpSync('src/web/brand', `${out}/brand`, { recursive: true });
cpSync('docs/social-preview.png', `${out}/social-preview.png`);
console.log(`Static showcase written to ${out}/`);
