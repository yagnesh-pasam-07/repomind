import { diffGraphs } from '../diff.js';
import type { GNode, Graph, Severity } from '../types.js';
import type { RepoIndex, Store } from './store.js';

// Workspace Overview data (design: "Workspace · Overview", D29). Everything here is computed from stored scans.

const DAY = 864e5;
const WEEK = 7 * DAY;
const PENALTY: Record<Severity, number> = { critical: 25, high: 10, medium: 4, low: 1 };

/** 0–100: starts at 100, loses points per open finding by severity. */
export function healthOf(g: Graph): number {
  return Math.max(0, Math.min(100, 100 - g.findings.reduce((s, f) => s + PENALTY[f.severity], 0)));
}

const isPaid = (n: GNode) => !!n.cost && n.cost.tier !== 'free' && ['external', 'cloud', 'data'].includes(n.layer);
const components = (g: Graph) => g.nodes.filter((n) => n.kind !== 'module').length;

/** "Express · Next.js · Expo · GCP": app frameworks plus where it runs. */
function stackOf(g: Graph): string {
  const techs = [...new Set(g.nodes.filter((n) => n.layer === 'app' && n.kind !== 'library' && n.tech).map((n) => n.tech!.replace(' / React Native', '')))].slice(0, 3);
  const hosts = new Set<string>();
  for (const n of g.nodes) {
    if (n.id.startsWith('gcp:') || n.id.startsWith('tf:google')) hosts.add('GCP');
    else if (n.id.startsWith('host:')) hosts.add(n.label);
    else if (n.layer === 'cicd' && n.tech === 'GitHub Actions') hosts.add('GitHub Actions');
  }
  return [...techs, ...[...hosts].slice(0, 2)].join(' · ') || 'No apps detected';
}

type Chip = { kind: 'add' | 'rem' | 'risk' | 'fix'; text: string };

function chipsOf(before: Graph, after: Graph): Chip[] {
  const d = diffGraphs(before, after);
  const chips: Chip[] = [];
  for (const n of d.addedNodes.filter((n) => n.kind !== 'module')) chips.push({ kind: 'add', text: `+ ${n.label}${n.tech ? ' · ' + n.tech : ''}` });
  for (const n of d.removedNodes.filter((n) => n.kind !== 'module')) chips.push({ kind: 'rem', text: `− ${n.label}` });
  for (const f of d.newFindings.filter((f) => f.severity === 'critical' || f.severity === 'high')) chips.push({ kind: 'risk', text: `New risk · ${f.title}` });
  for (const f of d.resolvedFindings.filter((f) => f.severity === 'critical' || f.severity === 'high')) chips.push({ kind: 'fix', text: `Fixed · ${f.title}` });
  if (!chips.length && d.newFindings.length) chips.push({ kind: 'risk', text: `${d.newFindings.length} new low/medium risk${d.newFindings.length > 1 ? 's' : ''}` });
  if (!chips.length && d.changedNodes.length) chips.push({ kind: 'fix', text: `${d.changedNodes.length} component${d.changedNodes.length > 1 ? 's' : ''} changed` });
  return chips.slice(0, 4);
}

export async function overview(store: Store, scanningRepos: Set<string>) {
  const now = Date.now();
  const all = (await store.all()).filter((i) => i.versions.length);
  // Load every graph this page needs up front (one round trip each, in parallel), then compute synchronously.
  const cache = new Map<string, Graph | null>();
  const keyOf = (i: RepoIndex, sha: string) => `${i.repo.owner}/${i.repo.repo}@${sha}`;
  const need: [RepoIndex, string][] = [];
  for (const i of all) {
    i.versions.slice(0, 1).forEach((v) => need.push([i, v.sha]));
    const old = i.versions.find((x) => now - Date.parse(x.committedAt) >= WEEK);
    if (old) need.push([i, old.sha]);
    i.versions.forEach((v, k) => {
      const prev = i.versions[k + 1];
      if (prev && v.changes > 0 && now - Date.parse(v.committedAt) <= 2 * WEEK) need.push([i, v.sha], [i, prev.sha]);
    });
  }
  for (const { i, v } of all.flatMap((i) => i.versions.map((v) => ({ i, v }))).sort((a, b) => b.v.committedAt.localeCompare(a.v.committedAt)).slice(0, 8)) need.push([i, v.sha]);
  await Promise.all(need.filter(([i, sha]) => !cache.has(keyOf(i, sha))).map(async ([i, sha]) => {
    cache.set(keyOf(i, sha), null);
    cache.set(keyOf(i, sha), await store.graph(i.repo.owner, i.repo.repo, sha));
  }));
  const graphOf = (i: RepoIndex, sha: string) => cache.get(keyOf(i, sha)) ?? null;

  const rows = [];
  const sev: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const paidNow = new Set<string>();
  const paidWeekAgo = new Set<string>();
  let healthSum = 0, healthOldSum = 0, healthOldN = 0, risksOld = 0, risksOldKnown = false;

  for (const i of all) {
    const { owner, repo } = i.repo;
    const v = i.versions[0];
    const g = graphOf(i, v.sha);
    if (!g) continue;
    const h = healthOf(g);
    healthSum += h;
    for (const f of g.findings) sev[f.severity]++;
    for (const n of g.nodes.filter(isPaid)) paidNow.add(n.label);
    // Same repo a week ago (latest version committed before then), for trends.
    const old = i.versions.find((x) => now - Date.parse(x.committedAt) >= WEEK);
    const og = old ? graphOf(i, old.sha) : null;
    if (og) {
      healthOldSum += healthOf(og);
      healthOldN++;
      risksOld += og.findings.length;
      risksOldKnown = true;
      for (const n of og.nodes.filter(isPaid)) paidWeekAgo.add(n.label);
    } else for (const n of g.nodes.filter(isPaid)) paidWeekAgo.add(n.label);
    rows.push({
      owner, repo, url: `/r/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      stack: stackOf(g),
      status: scanningRepos.has(`${owner}/${repo}`.toLowerCase()) ? 'Scanning' : i.repo.connected ? 'Live' : 'Snapshot',
      sha: v.sha, committedAt: v.committedAt,
      components: components(g), services: g.nodes.filter((n) => n.layer === 'external').length,
      risks: g.findings.length, health: h,
    });
  }
  rows.sort((a, b) => b.committedAt.localeCompare(a.committedAt));

  // Feed: commits from the last 14 days that changed the map.
  const candidates: { i: RepoIndex; at: string; sha: string; prev: string; msg: string; author: string }[] = [];
  for (const i of all)
    i.versions.forEach((v, k) => {
      const prev = i.versions[k + 1];
      if (prev && v.changes > 0 && now - Date.parse(v.committedAt) <= 2 * WEEK) candidates.push({ i, at: v.committedAt, sha: v.sha, prev: prev.sha, msg: v.message, author: v.author });
    });
  candidates.sort((a, b) => b.at.localeCompare(a.at));
  const feed = candidates.slice(0, 6).flatMap((c) => {
    const a = graphOf(c.i, c.prev), b = graphOf(c.i, c.sha);
    if (!a || !b) return [];
    return [{ repo: `${c.i.repo.owner}/${c.i.repo.repo}`, url: `/r/${encodeURIComponent(c.i.repo.owner)}/${encodeURIComponent(c.i.repo.repo)}?sha=${c.sha}&base=${c.prev}#changes`, sha: c.sha, msg: c.msg, author: c.author, committedAt: c.at, chips: chipsOf(a, b) }];
  });

  // Sparklines: the 8 most recent scanned versions across all repos, oldest first.
  const recent = all.flatMap((i) => i.versions.map((v) => ({ i, v }))).sort((a, b) => b.v.committedAt.localeCompare(a.v.committedAt)).slice(0, 8).reverse();
  const series = recent.flatMap(({ i, v }) => {
    const g = graphOf(i, v.sha);
    return g ? [{ health: healthOf(g), risks: g.findings.length, changes: v.changes, paid: g.nodes.filter(isPaid).length }] : [];
  });

  const inWeek = all.flatMap((i) => i.versions).filter((v) => now - Date.parse(v.committedAt) < WEEK);
  const changedRepos = all.filter((i) => i.versions.some((v) => v.changes > 0 && now - Date.parse(v.committedAt) < WEEK)).length;
  const health = rows.length ? Math.round(healthSum / rows.length) : 0;
  const risks = sev.critical + sev.high + sev.medium + sev.low;
  const paidAdded = [...paidNow].filter((p) => !paidWeekAgo.has(p));

  return {
    repoCount: rows.length,
    liveCount: rows.filter((r) => r.status === 'Live').length,
    changedRepos,
    kpis: {
      health: { value: health, delta: healthOldN ? health - Math.round(healthOldSum / healthOldN) : null },
      risks: { value: risks, delta: risksOldKnown ? risks - risksOld : null, bySeverity: sev },
      changes: { value: inWeek.filter((v) => v.changes > 0).length, of: inWeek.length },
      paid: { value: paidNow.size, added: paidAdded },
    },
    series,
    feed,
    repos: rows,
  };
}
