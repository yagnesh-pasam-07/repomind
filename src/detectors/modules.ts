import type { Ctx, ModuleInfo, Unit } from '../context.js';
import { lineAt, slug, SOURCE_EXT } from '../repo.js';
import { posix } from 'node:path';
import { importsOf } from './imports.js';

const FEATURE_ROOTS = ['src/modules', 'src/features', 'src/domains', 'modules', 'features', 'src/app', 'app', 'src/screens', 'screens', 'src/routes', 'src/api', 'pages', 'src/pages', 'src'];
const SKIP_DIRS = new Set(['utils', 'util', 'lib', 'helpers', 'types', 'constants', 'config', 'assets', 'styles', '__tests__', 'test', 'tests', 'mocks', '__mocks__', 'generated', 'hooks', 'components', 'ui', 'theme', 'i18n', 'locales']);
const MAX_MODULES = 24;

/** Splits each app into feature modules (leave, payroll, auth…) for the Code view. */
export function detectModules(ctx: Ctx) {
  const { g } = ctx;
  for (const u of ctx.units) {
    if (u.role === 'tooling') continue;
    const files = ctx.filesOfUnit(u);
    const rel = (f: string) => (u.dir ? f.slice(u.dir.length + 1) : f);

    for (const root of FEATURE_ROOTS) {
      const prefix = root + '/';
      const groups = new Map<string, string[]>();
      for (const f of files) {
        const r = rel(f);
        if (!r.startsWith(prefix)) continue;
        const rest = r.slice(prefix.length);
        const seg = rest.split('/')[0];
        if (!rest.includes('/')) continue; // a file directly in root
        const name = seg.replace(/^\((.*)\)$/, '$1').replace(/^\[(.*)\]$/, '$1');
        if (SKIP_DIRS.has(name.toLowerCase()) || name.startsWith('_') || name.startsWith('.')) continue;
        if (!groups.has(seg)) groups.set(seg, []);
        groups.get(seg)!.push(f);
      }
      if (groups.size < 2) continue;
      const entries = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MAX_MODULES);
      for (const [seg, mfiles] of entries.sort((a, b) => a[0].localeCompare(b[0]))) {
        const dir = (u.dir ? u.dir + '/' : '') + prefix + seg;
        const name = seg.replace(/^\((.*)\)$/, '$1');
        const m: ModuleInfo = { unit: u, dir, name, nodeId: `mod:${slug(u.dir || u.name)}/${slug(name)}` };
        ctx.modules.push(m);
        g.node({
          id: m.nodeId,
          kind: 'module',
          layer: 'module',
          label: name,
          tech: `${mfiles.length} file${mfiles.length === 1 ? '' : 's'}`,
          parent: u.nodeId,
          description: `Feature module in ${u.dir || u.name}.`,
          evidence: [{ file: mfiles[0] }],
          meta: { dir, files: mfiles.length },
        });
        g.edge(u.nodeId, m.nodeId, 'contains', [{ file: dir }]);
      }
      break;
    }
  }
  detectRoutes(ctx);
  detectModuleDeps(ctx);
}

const EXPRESS_ROUTE = /\b(?:router|app|server|api|routes|fastify|r)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const NEST_CTRL = /@Controller\(\s*['"`]([^'"`]*)['"`]/;
const NEST_ROUTE = /@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
const NEXT_HANDLER = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function detectRoutes(ctx: Ctx) {
  const perOwner = new Map<string, { method: string; path: string; file: string; line: number }[]>();
  const add = (file: string, method: string, path: string, line: number) => {
    const owner = ctx.ownerOf(file);
    if (!owner) return;
    if (!perOwner.has(owner)) perOwner.set(owner, []);
    perOwner.get(owner)!.push({ method: method.toUpperCase(), path, file, line });
  };

  for (const f of ctx.repo.sourceFiles()) {
    const text = ctx.repo.read(f);
    if (!text) continue;
    let m: RegExpExecArray | null;
    EXPRESS_ROUTE.lastIndex = 0;
    while ((m = EXPRESS_ROUTE.exec(text))) {
      if (!m[2].startsWith('/') && m[2] !== '*') continue;
      add(f, m[1], m[2], lineAt(text, m.index));
    }
    const ctrl = NEST_CTRL.exec(text);
    if (ctrl) {
      NEST_ROUTE.lastIndex = 0;
      while ((m = NEST_ROUTE.exec(text))) add(f, m[1], posix.join('/', ctrl[1], m[2] ?? ''), lineAt(text, m.index));
    }
    const nextRoute = /(?:^|\/)(?:src\/)?app\/(.*)\/route\.(?:t|j)sx?$/.exec(f);
    const pagesApi = /(?:^|\/)(?:src\/)?pages\/(api\/.*)\.(?:t|j)sx?$/.exec(f);
    if (nextRoute) {
      const path = '/' + nextRoute[1].split('/').filter((s) => !/^\(.*\)$/.test(s)).join('/');
      NEXT_HANDLER.lastIndex = 0;
      while ((m = NEXT_HANDLER.exec(text))) add(f, m[1], path, lineAt(text, m.index));
    } else if (pagesApi) {
      add(f, 'ANY', '/' + pagesApi[1].replace(/\/index$/, ''), 1);
    }
  }

  for (const [owner, routes] of perOwner) {
    const n = ctx.g.nodes.get(owner);
    if (!n) continue;
    routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    n.meta = { ...(n.meta ?? {}), routes: routes.slice(0, 60).map((r) => `${r.method} ${r.path}`), routeCount: routes.length };
    // Roll counts up to the unit.
    const parent = n.parent ? ctx.g.nodes.get(n.parent) : undefined;
    if (parent) parent.meta = { ...(parent.meta ?? {}), routeCount: Number(parent.meta?.routeCount ?? 0) + routes.length };
  }
}

/** Relative imports from one module into another → "depends" edges. */
function detectModuleDeps(ctx: Ctx) {
  for (const m of ctx.modules) {
    const files = ctx.repo.sourceFiles().filter((f) => f.startsWith(m.dir + '/'));
    for (const f of files) {
      const text = ctx.repo.read(f);
      if (!text) continue;
      for (const imp of importsOf(text)) {
        if (!imp.spec.startsWith('.')) continue;
        const target = posix.normalize(posix.join(posix.dirname(f), imp.spec));
        const other = ctx.moduleFor(target + '/x') ?? ctx.moduleFor(target);
        if (other && other !== m && other.unit === m.unit) {
          ctx.g.edge(m.nodeId, other.nodeId, 'depends', [{ file: f, line: imp.line }]);
        }
      }
    }
  }
}

export function isSource(f: string) {
  return SOURCE_EXT.test(f);
}

export type { Unit };
