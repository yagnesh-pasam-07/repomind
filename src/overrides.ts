import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { Graph } from './types.js';

// TODO: apply rename, hide, groups, nodes, edges from .repomind.yml (F7).
export function applyOverrides(root: string, graph: Graph): Graph {
  const file = path.join(root, '.repomind.yml');
  if (!existsSync(file)) return graph;
  YAML.parse(readFileSync(file, 'utf8'));
  return graph;
}
