import type { GraphDiff } from './diff.js';
import { isEmpty } from './diff.js';
import type { Finding, GEdge, GNode, Graph, Severity } from './types.js';

export const COMMENT_MARKER = '<!-- repomind:pr-comment -->';

const SEV_ICON: Record<Severity, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
const TIER: Record<string, string> = { free: 'free', low: '$', medium: '$$', high: '$$$' };
const LAYER_NAME: Record<string, string> = {
  client: 'Users',
  app: 'App / service',
  module: 'Module',
  data: 'Data',
  cloud: 'Cloud',
  external: 'External service',
  cicd: 'CI/CD',
};

const link = (f: { file?: string; line?: number }, blobBase?: string) => {
  if (!f.file) return '';
  const label = `${f.file}${f.line ? `:${f.line}` : ''}`;
  return blobBase ? `[\`${label}\`](${blobBase}/${f.file}${f.line ? `#L${f.line}` : ''})` : `\`${label}\``;
};

const esc = (s: string) => s.replace(/\|/g, '\\|');

function nodeRow(n: GNode, blobBase?: string) {
  const ev = n.evidence[0];
  return `| ${esc(n.label)} | ${LAYER_NAME[n.layer] ?? n.layer} | ${esc(n.tech ?? '')} | ${n.cost ? `${TIER[n.cost.tier]} ${esc(n.cost.model)}` : ''} | ${ev ? link(ev, blobBase) : ''} |`;
}

function findingLine(f: Finding, blobBase?: string) {
  return `- ${SEV_ICON[f.severity]} **${f.severity.toUpperCase()}** ${f.title} — ${link(f, blobBase)}${f.fix ? `<br/>↳ ${f.fix}` : ''}`;
}

/** Mermaid of what changed: changed components, changed links, and the components they attach to. */
export function changeMermaid(d: GraphDiff, head: Graph, base: Graph): string {
  const all = new Map<string, GNode>([...base.nodes, ...head.nodes].map((n) => [n.id, n]));
  const isMod = (id: string) => all.get(id)?.kind === 'module';
  const core = new Set([...d.addedNodes, ...d.removedNodes, ...d.changedNodes.map((c) => c.after)].filter((n) => n.kind !== 'module').map((n) => n.id));
  const key = (e: GEdge) => `${e.from}|${e.kind}|${e.to}`;
  const addedE = new Set(d.addedEdges.map(key));
  const removedE = new Set(d.removedEdges.map(key));
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const push = (e: GEdge) => {
    if (seen.has(key(e)) || e.kind === 'contains' || isMod(e.from) || isMod(e.to)) return;
    seen.add(key(e));
    edges.push(e);
  };
  d.addedEdges.forEach(push);
  d.removedEdges.forEach(push);
  for (const e of head.edges) if (core.has(e.from) || core.has(e.to)) push(e);
  if (!edges.length && !core.size) return '';
  const show = new Set<string>(core);
  for (const e of edges) {
    show.add(e.from);
    show.add(e.to);
  }
  if (show.size > 24) return '';
  const id = (s: string) => 'n_' + s.replace(/[^A-Za-z0-9]/g, '_');
  const lines = ['```mermaid', 'flowchart LR'];
  for (const sid of show) {
    const n = all.get(sid);
    if (!n) continue;
    lines.push(`  ${id(sid)}["${`${n.label}${n.tech ? `<br/><small>${n.tech}</small>` : ''}`.replace(/"/g, "'")}"]`);
  }
  for (const e of edges) {
    const k = key(e);
    const arrow = removedE.has(k) ? '-.->' : addedE.has(k) ? '==>' : '-->';
    lines.push(`  ${id(e.from)} ${arrow}|${removedE.has(k) ? 'removed ' : addedE.has(k) ? 'new ' : ''}${e.label ?? e.kind}| ${id(e.to)}`);
  }
  lines.push('  classDef added fill:#dcfce7,stroke:#16a34a,color:#14532d');
  lines.push('  classDef removed fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-dasharray:4 3');
  lines.push('  classDef changed fill:#fef3c7,stroke:#d97706,color:#78350f');
  const cls = (nodes: GNode[], c: string) => {
    const ids = nodes.map((n) => n.id).filter((x) => show.has(x));
    if (ids.length) lines.push(`  class ${ids.map(id).join(',')} ${c}`);
  };
  cls(d.addedNodes, 'added');
  cls(d.removedNodes, 'removed');
  cls(d.changedNodes.map((c) => c.after), 'changed');
  lines.push('```');
  return lines.join('\n');
}

export function prComment(d: GraphDiff, head: Graph, base: Graph, opts: { blobBase?: string; mapUrl?: string } = {}): string {
  const out: string[] = [COMMENT_MARKER];
  const crit = d.newFindings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
  const headline = isEmpty(d)
    ? 'No architecture changes in this PR.'
    : [
        d.addedNodes.length ? `+${d.addedNodes.length} component${d.addedNodes.length > 1 ? 's' : ''}` : '',
        d.removedNodes.length ? `−${d.removedNodes.length} removed` : '',
        d.changedNodes.length ? `${d.changedNodes.length} changed` : '',
        d.newFindings.length ? `${d.newFindings.length} new risk${d.newFindings.length > 1 ? 's' : ''}${crit ? ` (${crit} high+)` : ''}` : '',
        d.resolvedFindings.length ? `${d.resolvedFindings.length} fixed` : '',
        d.cost.direction === 'up' ? 'cost ↑' : d.cost.direction === 'down' ? 'cost ↓' : '',
      ]
        .filter(Boolean)
        .join(' · ');
  out.push(`### 🧠 RepoMind — architecture impact`);
  out.push(`**${headline}**${d.base && d.head ? `  \n<sub>\`${d.base}\` → \`${d.head}\`</sub>` : ''}`);

  if (d.newFindings.length) {
    out.push('', '#### ⚠️ New risks');
    for (const f of d.newFindings.slice(0, 15)) out.push(findingLine(f, opts.blobBase));
    if (d.newFindings.length > 15) out.push(`- …and ${d.newFindings.length - 15} more`);
  }

  const visibleAdded = d.addedNodes.filter((n) => n.kind !== 'module');
  if (visibleAdded.length) {
    out.push('', '#### ➕ Added', '| Component | Layer | Tech | Cost | Evidence |', '| --- | --- | --- | --- | --- |');
    for (const n of visibleAdded) out.push(nodeRow(n, opts.blobBase));
  }
  const visibleRemoved = d.removedNodes.filter((n) => n.kind !== 'module');
  if (visibleRemoved.length) {
    out.push('', '#### ➖ Removed', '| Component | Layer | Tech | Cost | Evidence |', '| --- | --- | --- | --- | --- |');
    for (const n of visibleRemoved) out.push(nodeRow(n));
  }
  if (d.changedNodes.length) {
    out.push('', '#### ✏️ Changed');
    for (const c of d.changedNodes) {
      const parts = c.fields.map((f) => {
        if (f === 'tech') return `tech ${c.before.tech ?? '–'} → ${c.after.tech ?? '–'}`;
        if (f === 'cost') return `cost ${TIER[c.before.cost?.tier ?? 'free']} → ${TIER[c.after.cost?.tier ?? 'free']}`;
        if (f === 'routes') return `routes ${c.before.meta?.routeCount ?? 0} → ${c.after.meta?.routeCount ?? 0}`;
        if (f === 'label') return `renamed ${c.before.label} → ${c.after.label}`;
        return f;
      });
      out.push(`- **${c.after.label}** — ${parts.join(', ')}`);
    }
  }
  const newModules = d.addedNodes.filter((n) => n.kind === 'module');
  if (newModules.length) out.push('', `**New modules:** ${newModules.map((m) => `\`${m.label}\``).join(', ')}`);

  if (d.cost.added.length || d.cost.removed.length || d.cost.tierChanged.length) {
    out.push('', '#### 💸 Cost impact');
    for (const n of d.cost.added) out.push(`- ↑ Adds **${n.label}** · ${TIER[n.cost!.tier]} · ${n.cost!.model}`);
    for (const n of d.cost.removed) out.push(`- ↓ Removes **${n.label}** · ${TIER[n.cost!.tier]} · ${n.cost!.model}`);
    for (const c of d.cost.tierChanged) out.push(`- ${c.after.label}: ${TIER[c.before.cost?.tier ?? 'free']} → ${TIER[c.after.cost?.tier ?? 'free']}`);
  }

  if (d.resolvedFindings.length) {
    out.push('', '#### ✅ Fixed risks');
    for (const f of d.resolvedFindings.slice(0, 10)) out.push(`- ~~${f.title}~~ — \`${f.file ?? ''}\``);
  }

  const mermaid = changeMermaid(d, head, base);
  if (mermaid) out.push('', '<details open><summary><b>What changed on the map</b></summary>', '', mermaid, '', '</details>');

  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  for (const f of head.findings) counts[f.severity]++;
  out.push(
    '',
    `<sub>Repo now: ${head.nodes.filter((n) => n.kind !== 'module').length} components · ${head.edges.length} links · open risks ${SEV_ICON.critical}${counts.critical} ${SEV_ICON.high}${counts.high} ${SEV_ICON.medium}${counts.medium} ${SEV_ICON.low}${counts.low}${opts.mapUrl ? ` · [open the full map](${opts.mapUrl})` : ''}</sub>`,
  );
  return out.join('\n');
}

/** Console summary for `repomind scan`. */
export function textSummary(g: Graph): string {
  const by = (layer: string) => g.nodes.filter((n) => n.layer === layer);
  const lines = [
    `RepoMind · ${g.meta.repo}${g.meta.commit ? ` @ ${g.meta.commit}` : ''}`,
    `${g.meta.stats.files} files scanned in ${g.meta.stats.ms} ms`,
    '',
  ];
  const layers: [string, string][] = [
    ['client', 'Users'],
    ['app', 'Apps & services'],
    ['module', 'Modules'],
    ['data', 'Data'],
    ['cloud', 'Cloud'],
    ['external', 'External services'],
    ['cicd', 'CI/CD'],
  ];
  for (const [l, name] of layers) {
    const ns = by(l);
    if (!ns.length) continue;
    lines.push(`${name.padEnd(18)} ${ns.map((n) => n.label + (n.tech && l !== 'module' ? ` (${n.tech})` : '')).join(', ')}`);
  }
  const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  for (const f of g.findings) counts[f.severity]++;
  lines.push('', `Risks: ${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low`);
  for (const f of g.findings.slice(0, 10)) lines.push(`  ${f.severity.padEnd(8)} ${f.title} — ${f.file ?? ''}${f.line ? ':' + f.line : ''}`);
  return lines.join('\n');
}
