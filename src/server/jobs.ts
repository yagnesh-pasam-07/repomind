import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffGraphs } from '../diff.js';
import { scan } from '../scan.js';
import type { Graph } from '../types.js';
import { GitHub, type CommitInfo } from './github.js';
import type { RepoIndex, Store, Version } from './store.js';

export type StepKey = 'download' | 'read' | 'detect' | 'risks' | 'draw';
export const STEPS: { key: StepKey; label: string }[] = [
  { key: 'download', label: 'Download commit' },
  { key: 'read', label: 'Read files' },
  { key: 'detect', label: 'Find apps, data and services' },
  { key: 'risks', label: 'Check risks and cost' },
  { key: 'draw', label: 'Draw the map' },
];

export interface Job {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  sha?: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  steps: { key: StepKey; label: string; state: 'todo' | 'doing' | 'done'; ms?: number }[];
  found: { name: string; what: string; layer: string; tech?: string; risk?: boolean }[];
  /** Live counts for the Scanning screen (D29). */
  counts?: { components: number; links: number; risks: number; paid: number };
  startedAt: string;
}

/** Runs scans one commit at a time per repo, and records the result as a version. */
export class Scanner {
  jobs = new Map<string, Job>();
  private chains = new Map<string, Promise<unknown>>();

  constructor(private store: Store) {}

  newJob(owner: string, repo: string, branch: string): Job {
    const job: Job = { id: randomBytes(8).toString('hex'), owner, repo, branch, status: 'running', steps: STEPS.map((s) => ({ ...s, state: 'todo' })), found: [], startedAt: new Date().toISOString() };
    this.jobs.set(job.id, job);
    // Forget old jobs so memory stays flat.
    if (this.jobs.size > 500) this.jobs.delete(this.jobs.keys().next().value!);
    return job;
  }

  /** Serialises work per repo so two pushes never write the index at the same time. */
  enqueue<T>(owner: string, repo: string, fn: () => Promise<T>): Promise<T> {
    const key = `${owner}/${repo}`.toLowerCase();
    const next = (this.chains.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
    this.chains.set(key, next);
    return next;
  }

  /** Scan one commit (if not stored yet) and add it to the timeline. */
  async scanCommit(idx: RepoIndex, commit: CommitInfo, job?: Job): Promise<Version> {
    const { owner, repo } = idx.repo;
    const existing = idx.versions.find((v) => v.sha.startsWith(commit.sha.slice(0, 7)));
    const short = commit.sha.slice(0, 7);
    if (existing && this.store.graph(owner, repo, existing.sha)) {
      if (job) job.steps.forEach((s) => (s.state = 'done'));
      if (job) Object.assign(job, foundOf(this.store.graph(owner, repo, existing.sha)!));
      return existing;
    }
    const step = async <T>(key: StepKey, fn: () => Promise<T> | T): Promise<T> => {
      const s = job?.steps.find((x) => x.key === key);
      const t0 = Date.now();
      if (s) s.state = 'doing';
      const r = await fn();
      if (s) Object.assign(s, { state: 'done', ms: Date.now() - t0 });
      return r;
    };
    const dir = mkdtempSync(join(tmpdir(), 'repomind-'));
    try {
      const gh = new GitHub(idx.repo.token);
      const dl = await step('download', () => gh.download({ owner, repo }, commit.sha, dir));
      const s = job?.steps.find((x) => x.key === 'download');
      if (s) s.label = `Download commit ${short}`;
      await step('read', () => {
        const r = job?.steps.find((x) => x.key === 'read');
        if (r) r.label = `Read ${dl.files.toLocaleString('en')} files`;
      });
      const g = await step('detect', () => scan(dir, { repoName: `${owner}/${repo}`, commit: short }));
      if (job) Object.assign(job, foundOf(g));
      // Rules run inside scan(); this step reports them separately to match the Scanning screen.
      await step('risks', () => undefined);
      const v = await step('draw', () => this.record(idx, commit, g));
      return v;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /** Store the graph, then recompute change counts for the whole timeline (backfill can arrive out of order). */
  private record(idx: RepoIndex, commit: CommitInfo, g: Graph): Version {
    const { owner, repo } = idx.repo;
    const sha = commit.sha.slice(0, 7);
    g.meta.commit = sha;
    this.store.putGraph(owner, repo, sha, g);
    const v: Version = {
      sha,
      message: commit.message,
      author: commit.author,
      committedAt: commit.committedAt,
      scannedAt: new Date().toISOString(),
      added: 0, removed: 0, changed: 0, newRisks: 0, changes: 0,
      components: g.nodes.filter((n) => n.kind !== 'module').length,
      findings: g.findings.length,
    };
    idx.versions = idx.versions.filter((x) => x.sha !== sha).concat(v);
    this.store.save(idx);
    recount(this.store, idx);
    this.store.save(idx);
    return v;
  }
}

/** D13: change count = added + removed + changed components + new risks vs the previous version. */
export function recount(store: Store, idx: RepoIndex) {
  const { owner, repo } = idx.repo;
  const vs = idx.versions; // newest first
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    const prev = vs[i + 1];
    if (!prev) {
      Object.assign(v, { added: 0, removed: 0, changed: 0, newRisks: 0, changes: 0 });
      continue;
    }
    const a = store.graph(owner, repo, prev.sha), b = store.graph(owner, repo, v.sha);
    if (!a || !b) continue;
    const d = diffGraphs(a, b);
    const comp = (ns: { kind: string }[]) => ns.filter((n) => n.kind !== 'module').length;
    v.added = comp(d.addedNodes);
    v.removed = comp(d.removedNodes);
    v.changed = comp(d.changedNodes.map((c) => c.after));
    v.newRisks = d.newFindings.length;
    v.changes = v.added + v.removed + v.changed + v.newRisks;
  }
}

/** Lanes of found components + live counts for the Scanning screen (D29). Ordered like the map's lanes. */
function foundOf(g: Graph) {
  const rank: Record<string, number> = { client: 0, app: 1, data: 2, cloud: 3, external: 4, cicd: 5 };
  const risky = new Set(g.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => f.node));
  const found = g.nodes
    .filter((n) => n.layer in rank)
    .sort((a, b) => rank[a.layer] - rank[b.layer] || a.label.localeCompare(b.label))
    .map((n) => {
      const m: any = n.meta || {};
      const what = m.routeCount ? `${n.tech ?? ''} · ${m.routeCount} routes` : m.models?.length ? `${n.tech ?? ''} · ${m.models.length} models` : n.tech ?? n.category ?? '';
      return { name: n.label, what, layer: n.layer, tech: n.tech, risk: risky.has(n.id) };
    });
  const counts = {
    components: g.nodes.filter((n) => n.kind !== 'module').length,
    links: g.edges.filter((e) => e.kind !== 'contains').length,
    risks: g.findings.length,
    paid: g.nodes.filter((n) => n.cost && n.cost.tier !== 'free' && ['external', 'cloud', 'data'].includes(n.layer)).length,
  };
  return { found, counts };
}
