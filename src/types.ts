// Graph schema for repomind.graph.json. See PRODUCT.md, "Architecture and data model".

export type NodeKind =
  | 'app' | 'service' | 'module' | 'database' | 'cache' | 'bucket'
  | 'queue' | 'cloud' | 'external' | 'pipeline' | 'client';

export type Layer = 'clients' | 'apps' | 'data' | 'cloud' | 'external' | 'cicd';

export type EdgeKind = 'calls' | 'reads' | 'writes' | 'deploys' | 'depends' | 'sends';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type CostTier = 'free' | 'low' | 'medium' | 'high';

export interface Evidence {
  file: string;
  line?: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  layer: Layer;
  label: string;
  tech?: string;
  evidence: Evidence[];
  cost?: { tier: CostTier; model: string };
  risks: string[];
  manual?: boolean;
  group?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  evidence: Evidence[];
}

export interface Finding {
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  node?: string;
  file: string;
  line?: number;
  fix?: string;
}

export interface GraphMeta {
  repo: string;
  commit?: string;
  scannedAt: string;
  version: string;
  stats: { files: number; nodes: number; edges: number; findings: number };
}

export interface Graph {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
  findings: Finding[];
}
