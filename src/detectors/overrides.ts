import YAML from 'yaml';
import type { Ctx } from '../context.js';
import type { EdgeKind, GNode } from '../types.js';

export interface Overrides {
  ignore?: string[];
  hide?: string[];
  rename?: Record<string, string>;
  describe?: Record<string, string>;
  nodes?: Array<Partial<GNode> & { id: string; label: string }>;
  edges?: Array<{ from: string; to: string; kind?: EdgeKind; label?: string }>;
}

export const OVERRIDE_FILES = ['.repomind.yml', '.repomind.yaml', 'repomind.yml'];

export function loadOverrides(read: (f: string) => string | null): Overrides {
  for (const f of OVERRIDE_FILES) {
    const t = read(f);
    if (t) {
      try {
        return (YAML.parse(t) ?? {}) as Overrides;
      } catch (e) {
        console.warn(`repomind: could not parse ${f}: ${(e as Error).message}`);
      }
    }
  }
  return {};
}

const glob = (pattern: string) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');

/** Team-maintained corrections: rename, hide, describe and hand-drawn nodes/edges (e.g. infra built in the console). */
export function applyOverrides(ctx: Ctx, o: Overrides) {
  const { g } = ctx;
  for (const n of o.nodes ?? []) {
    g.node({
      kind: 'cloud',
      layer: 'cloud',
      ...n,
      manual: true,
      evidence: [{ file: '.repomind.yml', note: 'added by hand' }],
    } as GNode);
  }
  for (const e of o.edges ?? []) g.edge(e.from, e.to, e.kind ?? 'uses', [{ file: '.repomind.yml', note: 'added by hand' }], e.label);
  for (const [id, label] of Object.entries(o.rename ?? {})) {
    const n = g.nodes.get(id);
    if (n) n.label = label;
  }
  for (const [id, text] of Object.entries(o.describe ?? {})) {
    const n = g.nodes.get(id);
    if (n) n.description = text;
  }
  for (const pattern of o.hide ?? []) {
    const re = glob(pattern);
    for (const id of [...g.nodes.keys()]) if (re.test(id)) g.nodes.delete(id);
  }
  g.prune();
}
