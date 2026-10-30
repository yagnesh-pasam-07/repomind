import type { ScanContext } from '../context.js';
import type { GraphEdge, GraphNode } from '../types.js';

export interface DetectorResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Detector {
  name: string;
  detect(ctx: ScanContext): Promise<DetectorResult>;
}
