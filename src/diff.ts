import type { Graph } from './types.js';

export interface GraphDiff {
  added: string[];
  removed: string[];
  newRisks: string[];
  resolvedRisks: string[];
}

export function diffGraphs(base: Graph, head: Graph): GraphDiff {
  const baseIds = new Set(base.nodes.map((n) => n.id));
  const headIds = new Set(head.nodes.map((n) => n.id));
  const baseF = new Set(base.findings.map((f) => f.id));
  const headF = new Set(head.findings.map((f) => f.id));
  return {
    added: [...headIds].filter((id) => !baseIds.has(id)),
    removed: [...baseIds].filter((id) => !headIds.has(id)),
    newRisks: [...headF].filter((id) => !baseF.has(id)),
    resolvedRisks: [...baseF].filter((id) => !headF.has(id)),
  };
}

// TODO: full PR comment (Changed, Cost impact, Mermaid sub-diagram) — F3.
export function toMarkdown(d: GraphDiff): string {
  const list = (title: string, items: string[]) => (items.length ? `### ${title}\n${items.map((i) => `- ${i}`).join('\n')}\n` : '');
  return ['## RepoMind', list('Added', d.added), list('Removed', d.removed), list('New risks', d.newRisks), list('Resolved risks', d.resolvedRisks)].join('\n');
}
