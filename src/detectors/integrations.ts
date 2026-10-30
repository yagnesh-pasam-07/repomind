import { DATA_STORES, ORMS, PROVIDERS, type Provider } from '../catalog.js';
import type { Ctx } from '../context.js';
import { basename, findLine } from '../repo.js';
import type { EdgeKind } from '../types.js';
import { posix } from 'node:path';
import { envFileKeys, envRefsOf, importsOf } from './imports.js';

const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$|(^|\/)env\.example$|(^|\/)\.env\.example$/;

function providerNode(ctx: Ctx, p: Provider) {
  ctx.g.node({
    id: p.id,
    kind: p.kind,
    layer: p.layer,
    label: p.label,
    tech: p.category,
    category: p.category,
    cost: p.cost,
    description: `${p.label} — ${p.category}. Billing: ${p.cost.model}.`,
  });
}

/** External services, GCP SDKs and data stores, found via SDK imports, package.json, env keys and hostnames. */
export function detectIntegrations(ctx: Ctx) {
  const { repo, g } = ctx;
  const pkgToProvider = new Map<string, Provider>();
  for (const p of PROVIDERS) for (const pkg of p.packages) pkgToProvider.set(pkg, p);
  const pkgToStore = new Map<string, (typeof DATA_STORES)[number]>();
  for (const s of DATA_STORES) for (const pkg of s.packages) pkgToStore.set(pkg, s);

  /** file → services it touches directly (used to pass usage through shared files like db.ts). */
  const fileUses = new Map<string, { id: string; kind: EdgeKind; line?: number; note?: string }[]>();
  const link = (owner: string | undefined, targetId: string, kind: EdgeKind, file: string, line?: number, note?: string) => {
    if (!fileUses.has(file)) fileUses.set(file, []);
    fileUses.get(file)!.push({ id: targetId, kind, line, note });
    if (!owner) return;
    const tn = g.nodes.get(targetId);
    if (tn && tn.evidence.length < 4 && !tn.evidence.some((e) => e.file === file)) tn.evidence.push({ file, line, note });
    g.edge(owner, targetId, kind, [{ file, line, note }]);
    // Module-level edge also implies the unit-level one.
    const n = g.nodes.get(owner);
    if (n?.parent) g.edge(n.parent, targetId, kind, [{ file, line, note }]);
  };

  // 1) SDK imports in source files (most precise: gives module + line).
  for (const f of repo.sourceFiles()) {
    const text = repo.read(f);
    if (!text) continue;
    const owner = ctx.ownerOf(f);
    for (const imp of importsOf(text)) {
      if (!imp.pkg) continue;
      const p = pkgToProvider.get(imp.pkg);
      if (p) {
        providerNode(ctx, p);
        link(owner, p.id, p.edge ?? 'calls', f, imp.line, imp.pkg);
      }
      const s = pkgToStore.get(imp.pkg);
      if (s) {
        g.node({ id: s.id, kind: s.kind, layer: 'data', label: s.label, tech: imp.pkg, description: `${s.label} used by the app.` });
        link(owner, s.id, s.kind === 'queue' ? 'sends' : 'reads', f, imp.line, imp.pkg);
      }
      if (ORMS[imp.pkg]) {
        const store = ormStore(ctx, imp.pkg, f);
        if (store) link(owner, store, 'reads', f, imp.line, ORMS[imp.pkg]);
      }
    }
    // Hostnames in code (APIs without SDKs, e.g. Keka, Slack webhooks).
    for (const p of PROVIDERS) {
      for (const h of p.hosts ?? []) {
        // Only real URLs count (scheme or // before the host), not a bare mention of it.
        const line = findLine(text, new RegExp(`(?:https?:)?//[\\w.-]*${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        if (line) {
          providerNode(ctx, p);
          link(owner, p.id, p.edge ?? 'calls', f, line, h);
        }
      }
    }
    // Env vars read in code.
    for (const ref of envRefsOf(text)) {
      const p = providerForEnv(ref.key);
      if (p) {
        providerNode(ctx, p);
        link(owner, p.id, p.edge ?? 'calls', f, ref.line, ref.key);
      }
    }
  }

  // 1b) A module that imports a shared, non-module file (e.g. src/db.ts) inherits what that file uses.
  const sources = new Set(repo.sourceFiles());
  const resolveRel = (from: string, spec: string) => {
    const base = posix.normalize(posix.join(posix.dirname(from), spec));
    for (const cand of [base, ...['.ts', '.tsx', '.js', '.jsx', '.mjs'].map((e) => base + e), ...['/index.ts', '/index.js'].map((e) => base + e)]) {
      if (sources.has(cand)) return cand;
    }
    return undefined;
  };
  for (const m of ctx.modules) {
    for (const f of repo.sourceFiles().filter((x) => x.startsWith(m.dir + '/'))) {
      const text = repo.read(f) ?? '';
      for (const imp of importsOf(text)) {
        if (!imp.spec.startsWith('.')) continue;
        const target = resolveRel(f, imp.spec);
        if (!target || ctx.moduleFor(target)) continue;
        for (const u of fileUses.get(target) ?? []) g.edge(m.nodeId, u.id, u.kind, [{ file: f, line: imp.line, note: `via ${target}` }]);
      }
    }
  }

  // 2) package.json dependencies (catches SDKs only used in config or native code).
  for (const u of ctx.units) {
    if (u.role === 'tooling') continue;
    const text = repo.read(u.pkgFile) ?? '';
    for (const d of Object.keys(u.pkg.dependencies ?? {})) {
      const p = pkgToProvider.get(d);
      if (p && !hasEdgeFrom(ctx, u.nodeId, p.id)) {
        providerNode(ctx, p);
        g.edge(u.nodeId, p.id, p.edge ?? 'calls', [{ file: u.pkgFile, line: findLine(text, `"${d}"`), note: 'dependency' }]);
      }
      const s = pkgToStore.get(d);
      if (s && !hasEdgeFrom(ctx, u.nodeId, s.id)) {
        g.node({ id: s.id, kind: s.kind, layer: 'data', label: s.label, tech: d, description: `${s.label} used by the app.` });
        g.edge(u.nodeId, s.id, s.kind === 'queue' ? 'sends' : 'reads', [{ file: u.pkgFile, line: findLine(text, `"${d}"`) }]);
      }
      if (ORMS[d]) {
        const store = ormStore(ctx, d, u.pkgFile);
        if (store && !hasEdgeFrom(ctx, u.nodeId, store)) g.edge(u.nodeId, store, 'reads', [{ file: u.pkgFile, line: findLine(text, `"${d}"`), note: ORMS[d] }]);
      }
    }
  }

  // 3) .env / .env.example keys.
  for (const f of repo.files.filter((x) => ENV_FILE.test(x))) {
    const text = repo.read(f);
    if (!text) continue;
    const unit = ctx.unitFor(f);
    if (!unit || unit.role === 'tooling') continue;
    for (const { key, line } of envFileKeys(text)) {
      const p = providerForEnv(key);
      if (p) {
        providerNode(ctx, p);
        g.edge(unit.nodeId, p.id, p.edge ?? 'calls', [{ file: f, line, note: key }]);
      }
    }
  }
}

function hasEdgeFrom(ctx: Ctx, from: string, to: string) {
  for (const e of ctx.g.edges.values()) if (e.from === from && e.to === to) return true;
  return false;
}

export function providerForEnv(key: string): Provider | undefined {
  // Longest prefix wins (e.g. NEXT_PUBLIC_POSTHOG_ over POSTHOG_).
  let best: Provider | undefined;
  let bestLen = 0;
  for (const p of PROVIDERS) {
    for (const pre of p.envPrefixes ?? []) {
      if ((key === pre || key.startsWith(pre)) && pre.length > bestLen) {
        best = p;
        bestLen = pre.length;
      }
    }
  }
  return best;
}

/** Prisma etc. → which database? Reads schema.prisma's provider when present. */
function ormStore(ctx: Ctx, pkg: string, nearFile: string): string | undefined {
  const { repo, g } = ctx;
  if (pkg === 'mongoose') return ensureStore(ctx, 'data:mongodb', 'MongoDB', 'Mongoose');
  if (pkg === '@prisma/client' || pkg === 'prisma') {
    const unit = ctx.unitFor(nearFile);
    const schemas = repo.files.filter((f) => basename(f) === 'schema.prisma' || /prisma\/schema\/.*\.prisma$/.test(f));
    const schema = schemas.find((s) => unit && (unit.dir === '' || s.startsWith(unit.dir + '/'))) ?? schemas[0];
    if (!schema) return ensureStore(ctx, 'data:postgres', 'PostgreSQL', 'Prisma');
    const text = repo.read(schema) ?? '';
    const prov = /provider\s*=\s*"(postgresql|postgres|mysql|sqlite|mongodb|sqlserver|cockroachdb)"/.exec(text)?.[1] ?? 'postgresql';
    const map: Record<string, [string, string]> = {
      postgresql: ['data:postgres', 'PostgreSQL'],
      postgres: ['data:postgres', 'PostgreSQL'],
      cockroachdb: ['data:postgres', 'PostgreSQL'],
      mysql: ['data:mysql', 'MySQL'],
      sqlite: ['data:sqlite', 'SQLite'],
      mongodb: ['data:mongodb', 'MongoDB'],
      sqlserver: ['data:sqlserver', 'SQL Server'],
    };
    const [id, label] = map[prov];
    const models = [...text.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
    const n = ensureStore(ctx, id, label, 'Prisma');
    const node = g.nodes.get(n)!;
    node.evidence.push({ file: schema, line: findLine(text, 'datasource'), note: `${models.length} models` });
    node.meta = { ...(node.meta ?? {}), models: [...new Set([...((node.meta?.models as string[]) ?? []), ...models])] };
    node.description = `${label} accessed through Prisma — ${models.length} models.`;
    return n;
  }
  return ensureStore(ctx, 'data:postgres', 'SQL database', ORMS[pkg]);
}

function ensureStore(ctx: Ctx, id: string, label: string, tech: string) {
  ctx.g.node({ id, kind: 'database', layer: 'data', label, tech, description: `${label} used by the app.` });
  return id;
}
