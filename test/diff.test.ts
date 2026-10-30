import { describe, expect, it } from 'vitest';
import { diffGraphs } from '../src/diff.js';
import type { Graph } from '../src/types.js';

const g = (ids: string[]): Graph => ({
  meta: { repo: 't', scannedAt: '', version: '0', stats: { files: 0, nodes: 0, edges: 0, findings: 0 } },
  nodes: ids.map((id) => ({ id, kind: 'service', layer: 'apps', label: id, evidence: [], risks: [] })),
  edges: [],
  findings: [],
});

describe('diffGraphs', () => {
  it('reports added and removed nodes', () => {
    const d = diffGraphs(g(['api', 'render']), g(['api', 'twilio']));
    expect(d.added).toEqual(['twilio']);
    expect(d.removed).toEqual(['render']);
  });
});
