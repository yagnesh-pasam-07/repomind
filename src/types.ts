export type Layer = 'client' | 'app' | 'module' | 'data' | 'cloud' | 'external' | 'cicd';

export type NodeKind =
  | 'client'
  | 'app'
  | 'service'
  | 'library'
  | 'module'
  | 'database'
  | 'cache'
  | 'queue'
  | 'bucket'
  | 'cloud'
  | 'network'
  | 'secret'
  | 'external'
  | 'pipeline';

export type EdgeKind =
  | 'uses'
  | 'calls'
  | 'reads'
  | 'writes'
  | 'sends'
  | 'depends'
  | 'contains'
  | 'deploys'
  | 'runs-on'
  | 'protects';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type CostTier = 'free' | 'low' | 'medium' | 'high';

export interface Evidence {
  file: string;
  line?: number;
  note?: string;
}

export interface CostInfo {
  tier: CostTier;
  /** How it is billed, e.g. "per SMS", "per instance-hour". */
  model: string;
}

export interface GNode {
  id: string;
  kind: NodeKind;
  layer: Layer;
  label: string;
  tech?: string;
  category?: string;
  description?: string;
  parent?: string;
  evidence: Evidence[];
  cost?: CostInfo;
  manual?: boolean;
  meta?: Record<string, unknown>;
}

export interface GEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  evidence: Evidence[];
}

export interface Finding {
  /** Stable id: rule + file + subject (no line numbers, so diffs survive edits). */
  id: string;
  rule: string;
  severity: Severity;
  title: string;
  node?: string;
  file?: string;
  line?: number;
  fix?: string;
}

export interface GraphMeta {
  tool: 'repomind';
  version: string;
  repo: string;
  commit?: string;
  scannedAt: string;
  stats: { files: number; nodes: number; edges: number; findings: number; ms: number };
}

export interface Graph {
  meta: GraphMeta;
  nodes: GNode[];
  edges: GEdge[];
  findings: Finding[];
}
