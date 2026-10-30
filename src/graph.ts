import type { EdgeKind, Evidence, Finding, GEdge, GNode } from './types.js';

const MAX_EVIDENCE = 8;

function mergeEvidence(into: Evidence[], add: Evidence[]) {
  for (const e of add) {
    if (into.length >= MAX_EVIDENCE) return;
    if (!into.some((x) => x.file === e.file && x.line === e.line)) into.push(e);
  }
}

/** Collects nodes/edges/findings; merges duplicates so detectors can be naive. */
export class GraphBuilder {
  nodes = new Map<string, GNode>();
  edges = new Map<string, GEdge>();
  findings = new Map<string, Finding>();

  node(n: Omit<GNode, 'evidence'> & { evidence?: Evidence[] }): GNode {
    const existing = this.nodes.get(n.id);
    if (existing) {
      mergeEvidence(existing.evidence, n.evidence ?? []);
      // Fill gaps without overwriting what an earlier, more specific detector set.
      for (const k of ['tech', 'description', 'category', 'cost', 'parent'] as const) {
        if (existing[k] == null && n[k] != null) (existing as any)[k] = n[k];
      }
      if (n.meta) existing.meta = { ...(n.meta ?? {}), ...(existing.meta ?? {}) };
      return existing;
    }
    const created: GNode = { ...n, evidence: [...(n.evidence ?? [])] };
    this.nodes.set(n.id, created);
    return created;
  }

  has(id: string) {
    return this.nodes.has(id);
  }

  edge(from: string, to: string, kind: EdgeKind, evidence: Evidence[] = [], label?: string) {
    if (from === to) return;
    const key = `${from}|${kind}|${to}`;
    const existing = this.edges.get(key);
    if (existing) {
      mergeEvidence(existing.evidence, evidence);
      return existing;
    }
    const e: GEdge = { from, to, kind, evidence: [...evidence], ...(label ? { label } : {}) };
    this.edges.set(key, e);
    return e;
  }

  finding(f: Finding) {
    if (!this.findings.has(f.id)) this.findings.set(f.id, f);
  }

  /** Drop edges whose endpoints don't exist (e.g. a hidden node). */
  prune() {
    for (const [k, e] of this.edges) {
      if (!this.nodes.has(e.from) || !this.nodes.has(e.to)) this.edges.delete(k);
    }
  }
}
