import type { ScanContext } from '../context.js';
import type { Finding, Graph } from '../types.js';

export interface Rule {
  id: string;
  run(ctx: ScanContext, graph: Graph): Promise<Finding[]>;
}
