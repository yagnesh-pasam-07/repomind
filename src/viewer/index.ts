import type { Graph } from '../types.js';

// TODO: full interactive viewer (F2) and presentation mode (F6).
export function renderViewer(graph: Graph): string {
  const data = JSON.stringify(graph).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>RepoMind — ${graph.meta.repo}</title></head>
<body><h1>RepoMind — ${graph.meta.repo}</h1><pre id="g"></pre>
<script>const graph = ${data}; document.getElementById('g').textContent = JSON.stringify(graph.meta, null, 2);</script>
</body></html>`;
}
