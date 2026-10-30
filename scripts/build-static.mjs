// Assets served straight from Vercel's CDN (D35). Every page and API route is served by the function
// in api/index.mjs (the full app on Neon), so public/ only holds files that never change per request.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const out = 'public';
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/brand`, { recursive: true });
cpSync('src/web/brand', `${out}/brand`, { recursive: true });
cpSync('docs/social-preview.png', `${out}/social-preview.png`);
// Vercel needs an index in the output directory; the rewrite sends "/" to the function anyway.
writeFileSync(`${out}/.keep`, '');
console.log(`Static assets written to ${out}/`);
