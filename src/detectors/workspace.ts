import { FRAMEWORKS } from '../catalog.js';
import type { Ctx, Unit } from '../context.js';
import { dirOf, findLine, slug, SOURCE_EXT } from '../repo.js';
import { importsOf } from './imports.js';

const ROLE_TECH: Record<string, string> = {
  library: 'Shared package',
  tooling: 'Tooling',
};

/** Finds every package.json → one "unit" (app, service or library) per package. */
export function detectWorkspace(ctx: Ctx) {
  const { repo, g } = ctx;
  const pkgFiles = repo.byName('package.json');

  for (const pkgFile of pkgFiles) {
    const pkg = repo.json(pkgFile);
    if (!pkg) continue;
    const dir = dirOf(pkgFile);
    const deps = new Set<string>([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]);
    const runtimeDeps = new Set<string>(Object.keys(pkg.dependencies ?? {}));
    // Server frameworks must be runtime deps: libraries often list express/koa only to run their tests (D30).
    // Build-time frameworks (Next.js, Vite, Expo…) are commonly devDependencies of real apps, so those still count.
    const framework = FRAMEWORKS.find((f) => f.packages.some((p) => runtimeDeps.has(p) || (f.role !== 'server' && deps.has(p))));
    const isWorkspaceRoot = dir === '' && (pkg.workspaces || repo.files.includes('pnpm-workspace.yaml') || repo.files.includes('turbo.json'));
    const hasSource = repo.files.some((f) => (dir === '' || f.startsWith(dir + '/')) && SOURCE_EXT.test(f));

    let role: Unit['role'];
    if (isWorkspaceRoot && pkgFiles.length > 1) role = 'tooling';
    else if (framework) role = framework.role;
    else if (pkg.bin) role = 'tooling';
    else role = 'library';
    if (!hasSource && role !== 'tooling') role = 'tooling';

    const name: string = pkg.name ?? (dir.split('/').pop() || 'app');
    const unit: Unit = {
      dir,
      name,
      nodeId: `app:${slug(dir || name)}`,
      pkg,
      pkgFile,
      deps,
      framework,
      role,
    };
    ctx.units.push(unit);
  }

  // Draw units (tooling-only workspace roots are not drawn).
  for (const u of ctx.units) {
    if (u.role === 'tooling') continue;
    const short = u.dir ? u.dir.split('/').pop()! : u.name;
    const kind = u.role === 'library' ? 'library' : u.role === 'server' ? 'service' : 'app';
    g.node({
      id: u.nodeId,
      kind,
      layer: 'app',
      label: short,
      tech: u.framework?.name ?? ROLE_TECH[u.role],
      category: u.role,
      description: u.pkg.description ?? describeRole(u),
      evidence: [{ file: u.pkgFile, line: 1, note: u.name }],
      meta: { package: u.name, dir: u.dir || '.', role: u.role },
    });
  }

  // Internal package dependencies (monorepo).
  const byName = new Map(ctx.units.map((u) => [u.name, u]));
  for (const u of ctx.units) {
    if (u.role === 'tooling') continue;
    for (const d of u.deps) {
      const target = byName.get(d);
      if (target && target !== u && target.role !== 'tooling') {
        const text = repo.read(u.pkgFile) ?? '';
        g.edge(u.nodeId, target.nodeId, 'depends', [{ file: u.pkgFile, line: findLine(text, `"${d}"`) }]);
      }
    }
  }

  // Users of the apps.
  const mobile = ctx.units.filter((u) => u.role === 'mobile');
  const web = ctx.units.filter((u) => u.role === 'web' || u.role === 'fullstack');
  const desktop = ctx.units.filter((u) => u.role === 'desktop');
  if (mobile.length) {
    g.node({ id: 'client:mobile', kind: 'client', layer: 'client', label: 'Mobile users', tech: 'iOS · Android', description: 'People using the mobile app.' });
    for (const u of mobile) g.edge('client:mobile', u.nodeId, 'uses', [{ file: u.pkgFile }]);
  }
  if (web.length) {
    g.node({ id: 'client:web', kind: 'client', layer: 'client', label: 'Web users', tech: 'Browser', description: 'People using the web app.' });
    for (const u of web) g.edge('client:web', u.nodeId, 'uses', [{ file: u.pkgFile }]);
  }
  if (desktop.length) {
    g.node({ id: 'client:desktop', kind: 'client', layer: 'client', label: 'Desktop users', tech: 'macOS · Windows', description: 'People using the desktop app.' });
    for (const u of desktop) g.edge('client:desktop', u.nodeId, 'uses', [{ file: u.pkgFile }]);
  }

  // Front-ends call back-ends over HTTP.
  const servers = ctx.units.filter((u) => u.role === 'server');
  if (servers.length) {
    for (const u of [...mobile, ...web, ...desktop]) {
      const hit = findHttpClientUse(ctx, u);
      if (!hit) continue;
      const target = pickServer(servers, hit.hint);
      for (const s of target) g.edge(u.nodeId, s.nodeId, 'calls', [hit.evidence], 'HTTP');
    }
  }
}

function describeRole(u: Unit): string {
  switch (u.role) {
    case 'mobile':
      return 'Mobile app.';
    case 'web':
      return 'Web front-end.';
    case 'fullstack':
      return 'Web app with server-side code.';
    case 'server':
      return 'Back-end API service.';
    case 'desktop':
      return 'Desktop app.';
    case 'library':
      return 'Shared code used by other packages.';
    default:
      return '';
  }
}

function findHttpClientUse(ctx: Ctx, u: Unit) {
  const envRe = /\b((?:EXPO_PUBLIC_|NEXT_PUBLIC_|VITE_|REACT_APP_)?[A-Z_]*(?:API|BACKEND|SERVER)_(?:URL|BASE_URL|HOST|ENDPOINT))\b/;
  for (const f of ctx.filesOfUnit(u)) {
    const text = ctx.repo.read(f);
    if (!text) continue;
    const m = envRe.exec(text);
    if (m) return { hint: m[1], evidence: { file: f, line: findLine(text, m[1]), note: m[1] } };
    const imports = importsOf(text);
    const ax = imports.find((i) => i.spec === 'axios' || i.spec === 'ky' || i.spec === '@tanstack/react-query');
    if (ax) return { hint: '', evidence: { file: f, line: ax.line, note: ax.spec } };
  }
  return null;
}

function pickServer(servers: Unit[], hint: string): Unit[] {
  if (servers.length === 1 || !hint) return servers;
  const h = hint.toLowerCase();
  const match = servers.filter((s) => h.includes((s.dir.split('/').pop() ?? '').toLowerCase()));
  return match.length ? match : servers;
}
