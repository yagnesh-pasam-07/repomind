import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { Ctx } from './context.js';
import { detectCI } from './detectors/ci.js';
import { detectDocker } from './detectors/docker.js';
import { detectIntegrations } from './detectors/integrations.js';
import { detectModules } from './detectors/modules.js';
import { applyOverrides, loadOverrides } from './detectors/overrides.js';
import { detectTerraform } from './detectors/terraform.js';
import { detectWorkspace } from './detectors/workspace.js';
import { Repo } from './repo.js';
import { runSecurityRules } from './rules/security.js';
import type { Graph } from './types.js';

export const VERSION = '0.1.0';

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;

export function scan(root: string, opts: { repoName?: string; commit?: string } = {}): Graph {
  const t0 = Date.now();
  const abs = resolve(root);
  const overrides = loadOverrides((f) => {
    try {
      return readFileSync(join(abs, f), 'utf8');
    } catch {
      return null;
    }
  });
  const repo = new Repo(abs, overrides.ignore ?? []);
  const ctx = new Ctx(repo);

  // Order matters: units → modules → what they use → where they run → corrections → rules.
  detectWorkspace(ctx);
  detectModules(ctx);
  detectIntegrations(ctx);
  detectDocker(ctx);
  detectCI(ctx);
  detectTerraform(ctx);
  applyOverrides(ctx, overrides);
  runSecurityRules(ctx);
  ctx.g.prune();

  // Nodes created from a reference (e.g. a host named in config) borrow evidence from their first link.
  for (const n of ctx.g.nodes.values()) {
    if (n.evidence.length) continue;
    const e = [...ctx.g.edges.values()].find((x) => (x.to === n.id || x.from === n.id) && x.evidence.length);
    if (e) n.evidence.push(...e.evidence.slice(0, 2));
  }

  // Findings whose node was hidden stay, but lose the link.
  for (const f of ctx.g.findings.values()) if (f.node && !ctx.g.nodes.has(f.node)) delete f.node;

  const nodes = [...ctx.g.nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...ctx.g.edges.values()].sort((a, b) => `${a.from}|${a.to}|${a.kind}`.localeCompare(`${b.from}|${b.to}|${b.kind}`));
  const findings = [...ctx.g.findings.values()].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.id.localeCompare(b.id));

  return {
    meta: {
      tool: 'repomind',
      version: VERSION,
      repo: opts.repoName ?? gitRepoName(abs) ?? basename(abs),
      commit: opts.commit ?? gitCommit(abs),
      scannedAt: new Date().toISOString(),
      stats: { files: repo.files.length, nodes: nodes.length, edges: edges.length, findings: findings.length, ms: Date.now() - t0 },
    },
    nodes,
    edges,
    findings,
  };
}

function gitCommit(dir: string): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

function gitRepoName(dir: string): string | undefined {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execSync('git config --get remote.origin.url', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url);
    return m?.[1];
  } catch {
    return undefined;
  }
}
