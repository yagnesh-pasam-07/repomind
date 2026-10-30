import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GraphDiff } from './diff.js';
import type { Graph } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Builds the self-contained HTML map: template + embedded graph (+ optional diff). */
/** Settings the v2 server injects so the page polls for versions; absent in the offline file. */
export interface LiveOptions {
  owner: string;
  repo: string;
  pollSeconds?: number;
  pinned?: boolean;
  base?: string;
  info?: unknown;
}

export function renderViewer(graph: Graph, opts: { diff?: GraphDiff; base?: Graph; blobBase?: string; live?: LiveOptions; embed?: boolean | 'showcase' } = {}): string {
  const template = readFileSync(join(here, 'viewer', 'template.html'), 'utf8');
  const payload = {
    graph,
    base: opts.base ? { nodes: opts.base.nodes, edges: opts.base.edges } : null,
    diff: opts.diff ? viewerDiff(opts.diff) : null,
    blobBase: opts.blobBase ?? null,
    live: opts.live ?? null,
    // Embedded preview on the landing page: no presenting/fullscreen, follows the parent's theme.
    embed: opts.embed === 'showcase' ? 'showcase' : !!opts.embed,
  };
  // Safe to embed inside <script>: escape "<" so "</script>" in data can't break out.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');
  // Function replacers: the data and rough.js contain "$" sequences that string replacement would expand.
  return template.replace('/*__REPOMIND_DATA__*/null', () => json).replace('__REPOMIND_TITLE__', () => escapeHtml(`${graph.meta.repo} · RepoMind`));
}

/** The compact diff shape the viewer reads (ids and edge keys, not whole nodes). */
export function viewerDiff(d: GraphDiff) {
  return {
    added: d.addedNodes.map((n) => n.id),
    removed: d.removedNodes.map((n) => n.id),
    changed: d.changedNodes.map((c) => ({ id: c.after.id, fields: c.fields })),
    addedEdges: d.addedEdges.map((e) => `${e.from}|${e.kind}|${e.to}`),
    removedEdges: d.removedEdges.map((e) => `${e.from}|${e.kind}|${e.to}`),
    newFindings: d.newFindings.map((f) => f.id),
    resolvedFindings: d.resolvedFindings,
    baseCommit: d.base,
    headCommit: d.head,
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
