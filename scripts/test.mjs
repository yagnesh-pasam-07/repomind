// Assertions against the example repo. Run: npm test
import assert from 'node:assert/strict';
import { scan, diffGraphs, prComment } from '../dist/index.js';

const g = scan('examples/sumitra-like', { repoName: 'test' });
const has = (id) => g.nodes.some((n) => n.id === id);
const edge = (from, kind, to) => g.edges.some((e) => e.from === from && e.kind === kind && e.to === to);
const finding = (rule) => g.findings.some((f) => f.rule === rule);

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('  ✓', name); };

t('apps detected with frameworks', () => {
  assert.equal(g.nodes.find((n) => n.id === 'app:apps-api')?.tech, 'Express');
  assert.equal(g.nodes.find((n) => n.id === 'app:apps-web')?.tech, 'Next.js');
  assert.equal(g.nodes.find((n) => n.id === 'app:apps-mobile')?.tech, 'Expo / React Native');
});
t('feature modules found', () => ['leave', 'payroll', 'auth', 'polls'].forEach((m) => assert.ok(has(`mod:apps-api/${m}`), m)));
t('integrations: Slack, SMTP, Twilio, Keka', () => {
  assert.ok(edge('mod:apps-api/notifications', 'sends', 'ext:slack'));
  assert.ok(edge('mod:apps-api/notifications', 'sends', 'ext:smtp'));
  assert.ok(edge('mod:apps-api/auth', 'sends', 'ext:twilio'));
  assert.ok(edge('mod:apps-api/auth', 'calls', 'ext:keka'));
});
t('prisma → postgres → Cloud SQL', () => {
  assert.ok(edge('mod:apps-api/leave', 'reads', 'data:postgres'));
  assert.ok(edge('data:postgres', 'runs-on', 'tf:google_sql_database_instance.main'));
  assert.ok(g.nodes.find((n) => n.id === 'data:postgres').meta.models.includes('LeaveRequest'));
});
t('CI deploys to Cloud Run, app runs on it', () => {
  assert.ok(edge('ci:deploy-api', 'deploys', 'gcp:run:sumitra-api'));
  assert.ok(edge('app:apps-api', 'runs-on', 'gcp:run:sumitra-api'));
  assert.ok(edge('app:apps-web', 'runs-on', 'host:vercel'));
});
t('VPC-SC perimeter protects KMS and bucket', () => {
  assert.ok(edge('tf:google_access_context_manager_service_perimeter.payroll', 'protects', 'tf:google_kms_crypto_key.payroll'));
  assert.ok(edge('tf:google_access_context_manager_service_perimeter.payroll', 'protects', 'tf:google_storage_bucket.payslips'));
});
t('security rules fire', () => ['run-public-invoke', 'cors-wildcard', 'docker-root', 'vpcsc-dry-run'].forEach((r) => assert.ok(finding(r), r)));
t('overrides add manual nodes', () => assert.ok(g.nodes.find((n) => n.id === 'ext:google-sso')?.manual));
t('scan is deterministic', () => {
  const g2 = scan('examples/sumitra-like', { repoName: 'test' });
  assert.deepEqual(g2.nodes, g.nodes);
  assert.deepEqual(g2.edges, g.edges);
});
t('diff of identical graphs is empty', () => {
  const d = diffGraphs(g, g);
  assert.equal(d.addedNodes.length + d.removedNodes.length + d.newFindings.length, 0);
  assert.match(prComment(d, g, g), /No architecture changes/);
});
console.log(`\n${passed} checks passed`);

// ---------- v2 ----------
const { parseRepoUrl } = await import('../dist/server/github.js');
const { Store } = await import('../dist/server/store.js');
const { recount } = await import('../dist/server/jobs.js');
const { renderViewer } = await import('../dist/index.js');
const { mkdtempSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
let v2 = 0;
const t2 = (name, fn) => { fn(); v2++; console.log('  ✓', name); };

t2('R1: GitHub URL forms parse', () => {
  for (const u of ['https://github.com/tilicho/sumitra', 'github.com/tilicho/sumitra', 'tilicho/sumitra', 'https://github.com/tilicho/sumitra.git', 'git@github.com:tilicho/sumitra.git'])
    assert.deepEqual(parseRepoUrl(u), { owner: 'tilicho', repo: 'sumitra', branch: undefined }, u);
  assert.equal(parseRepoUrl('https://github.com/a/b/tree/feature/x').branch, 'feature/x');
  assert.throws(() => parseRepoUrl('not a url'));
  assert.throws(() => parseRepoUrl('github.com/../etc'));
});
t2('store keeps versions newest first and recount marks map changes (D13)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rm-store-'));
  try {
    const s = new Store(dir);
    const base = scan('examples/sumitra-like', { repoName: 'x' });
    const head = JSON.parse(JSON.stringify(base));
    head.nodes.push({ id: 'ext:new', kind: 'external', layer: 'external', label: 'New', evidence: [] });
    s.putGraph('o', 'r', 'aaaaaaa', base);
    s.putGraph('o', 'r', 'bbbbbbb', head);
    const v = (sha, t) => ({ sha, message: '', author: '', committedAt: t, scannedAt: t, added: 0, removed: 0, changed: 0, newRisks: 0, changes: 0, components: 0, findings: 0 });
    const idx = { repo: { owner: 'o', repo: 'r', branch: 'main', connected: false, createdAt: '' }, versions: [v('aaaaaaa', '2026-01-01'), v('bbbbbbb', '2026-01-02')] };
    s.save(idx);
    const back = s.get('o', 'r');
    assert.equal(back.versions[0].sha, 'bbbbbbb');
    recount(s, back);
    assert.equal(back.versions[0].added, 1);
    assert.equal(back.versions[0].changes, 1);
    assert.equal(back.versions[1].changes, 0);
    assert.equal(s.graph('o', 'r', '../../etc'), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
t2('viewer embeds rough.js, live settings and escapes data', () => {
  const html = renderViewer(g, { live: { owner: 'o', repo: 'r' } });
  assert.match(html, /var rough=/);
  assert.match(html, /"live":\{"owner":"o"/);
  assert.ok(!html.includes('/*__ROUGH_JS__*/'));
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
});
console.log(`${v2} v2 checks passed`);
