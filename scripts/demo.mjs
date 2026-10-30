// End-to-end demo: builds a "before" copy of the example repo, scans both, writes graph, map and PR comment.
import { cpSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const head = 'examples/sumitra-like';
const base = join(tmpdir(), 'repomind-demo-base');
const out = 'examples/output';
rmSync(base, { recursive: true, force: true });
cpSync(head, base, { recursive: true });

// "Before" state: still on Render, no Twilio OTP, no Keka sync, no Expo push, Cloud Run not yet public.
rmSync(join(base, 'apps/api/src/modules/auth/otp.ts'));
rmSync(join(base, 'apps/api/src/modules/auth/keka.ts'));
rmSync(join(base, 'apps/api/src/modules/notifications/push.ts'));
const pkgFile = join(base, 'apps/api/package.json');
const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
delete pkg.dependencies.twilio;
delete pkg.dependencies['expo-server-sdk'];
writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
writeFileSync(join(base, 'apps/api/render.yaml'), 'services:\n  - type: web\n    name: sumitra-api\n');
const tf = join(base, 'infra/terraform/main.tf');
writeFileSync(tf, readFileSync(tf, 'utf8').replace(/resource "google_cloud_run_v2_service_iam_member"[\s\S]*?\n}\n/, ''));

mkdirSync(out, { recursive: true });
const cli = (...args) => execFileSync('node', ['bin/repomind.js', ...args], { stdio: 'inherit' });
cli('scan', base, '-o', `${out}/base.graph.json`, '--repo', 'sumitra (example)', '--quiet');
cli('scan', head, '-o', `${out}/graph.json`, '--repo', 'sumitra (example)');
cli('view', `${out}/graph.json`, '-o', `${out}/map.html`);
cli('view', `${out}/graph.json`, '--base', `${out}/base.graph.json`, '-o', `${out}/map-with-changes.html`);
cli('diff', `${out}/base.graph.json`, `${out}/graph.json`, '-o', `${out}/pr-comment.md`);
console.log(`\nDemo written to ${out}/`);
