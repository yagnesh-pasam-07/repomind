import path from 'node:path';
import { createContext } from './context.js';
import { detectors } from './detectors/index.js';
import { applyOverrides } from './overrides.js';
import { applyCost } from './rules/cost.js';
import { securityRules } from './rules/security.js';
import type { Graph } from './types.js';

export const VERSION = '0.1.0';

// Pipeline: detectors -> overrides -> rules. Output is sorted so scans are deterministic.
export async function scan(root: string): Promise<Graph> {
  const ctx = await createContext(root);
  let graph: Graph = {
    meta: { repo: path.basename(path.resolve(root)), scannedAt: new Date().toISOString(), version: VERSION, stats: { files: ctx.files.length, nodes: 0, edges: 0, findings: 0 } },
    nodes: [],
    edges: [],
    findings: [],
  };
  for (const d of detectors) {
    const r = await d.detect(ctx);
    graph.nodes.push(...r.nodes);
    graph.edges.push(...r.edges);
  }
  graph = applyOverrides(root, graph);
  for (const rule of securityRules) graph.findings.push(...(await rule.run(ctx, graph)));
  graph = applyCost(graph);

  graph.nodes.sort((a, b) => a.id.localeCompare(b.id));
  graph.edges.sort((a, b) => `${a.from}>${a.to}`.localeCompare(`${b.from}>${b.to}`));
  graph.findings.sort((a, b) => a.id.localeCompare(b.id));
  graph.meta.stats = { files: ctx.files.length, nodes: graph.nodes.length, edges: graph.edges.length, findings: graph.findings.length };
  return graph;
}
