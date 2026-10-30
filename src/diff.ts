import type { CostTier, Finding, GEdge, GNode, Graph, Severity } from './types.js';

export interface NodeChange {
  before: GNode;
  after: GNode;
  fields: string[];
}

export interface GraphDiff {
  base?: string;
  head?: string;
  addedNodes: GNode[];
  removedNodes: GNode[];
  changedNodes: NodeChange[];
  addedEdges: GEdge[];
  removedEdges: GEdge[];
  newFindings: Finding[];
  resolvedFindings: Finding[];
  cost: { added: GNode[]; removed: GNode[]; tierChanged: NodeChange[]; direction: 'up' | 'down' | 'same' };
}

const edgeKey = (e: GEdge) => `${e.from}|${e.kind}|${e.to}`;
const TIER_RANK: Record<CostTier, number> = { free: 0, low: 1, medium: 2, high: 3 };
const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Only structural changes count; evidence line shifts are noise. */
export function diffGraphs(base: Graph, head: Graph): GraphDiff {
  const b = new Map(base.nodes.map((n) => [n.id, n]));
  const h = new Map(head.nodes.map((n) => [n.id, n]));
  const addedNodes = head.nodes.filter((n) => !b.has(n.id));
  const removedNodes = base.nodes.filter((n) => !h.has(n.id));
  const changedNodes: NodeChange[] = [];
  for (const n of head.nodes) {
    const old = b.get(n.id);
    if (!old) continue;
    const fields: string[] = [];
    if (old.label !== n.label) fields.push('label');
    if (old.tech !== n.tech && !(old.kind === 'module' && n.kind === 'module')) fields.push('tech');
    if (old.kind !== n.kind) fields.push('kind');
    if ((old.cost?.tier ?? '') !== (n.cost?.tier ?? '')) fields.push('cost');
    const oc = JSON.stringify(old.meta?.container ?? null);
    const nc = JSON.stringify(n.meta?.container ?? null);
    if (oc !== nc) fields.push('container');
    if ((old.meta?.routeCount ?? 0) !== (n.meta?.routeCount ?? 0)) fields.push('routes');
    if (fields.length) changedNodes.push({ before: old, after: n, fields });
  }
  const be = new Set(base.edges.map(edgeKey));
  const he = new Set(head.edges.map(edgeKey));
  const addedEdges = head.edges.filter((e) => !be.has(edgeKey(e)));
  const removedEdges = base.edges.filter((e) => !he.has(edgeKey(e)));
  const bf = new Set(base.findings.map((f) => f.id));
  const hf = new Set(head.findings.map((f) => f.id));
  const newFindings = head.findings.filter((f) => !bf.has(f.id)).sort((x, y) => SEV_RANK[x.severity] - SEV_RANK[y.severity]);
  const resolvedFindings = base.findings.filter((f) => !hf.has(f.id));

  const paid = (n: GNode) => n.cost && n.cost.tier !== 'free';
  const costAdded = addedNodes.filter(paid);
  const costRemoved = removedNodes.filter(paid);
  const tierChanged = changedNodes.filter((c) => c.fields.includes('cost'));
  let score = costAdded.reduce((s, n) => s + TIER_RANK[n.cost!.tier], 0) - costRemoved.reduce((s, n) => s + TIER_RANK[n.cost!.tier], 0);
  for (const c of tierChanged) score += TIER_RANK[c.after.cost?.tier ?? 'free'] - TIER_RANK[c.before.cost?.tier ?? 'free'];

  return {
    base: base.meta.commit,
    head: head.meta.commit,
    addedNodes,
    removedNodes,
    changedNodes,
    addedEdges,
    removedEdges,
    newFindings,
    resolvedFindings,
    cost: { added: costAdded, removed: costRemoved, tierChanged, direction: score > 0 ? 'up' : score < 0 ? 'down' : 'same' },
  };
}

export function isEmpty(d: GraphDiff) {
  return !d.addedNodes.length && !d.removedNodes.length && !d.changedNodes.length && !d.addedEdges.length && !d.removedEdges.length && !d.newFindings.length && !d.resolvedFindings.length;
}

export function worstNewSeverity(d: GraphDiff): Severity | undefined {
  return d.newFindings[0]?.severity;
}

export function shouldFail(d: GraphDiff, failOn: string | undefined): boolean {
  if (!failOn || failOn === 'none') return false;
  const limit = SEV_RANK[failOn as Severity];
  if (limit == null) return false;
  return d.newFindings.some((f) => SEV_RANK[f.severity] <= limit);
}
