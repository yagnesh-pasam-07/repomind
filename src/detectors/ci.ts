import YAML from 'yaml';
import type { Ctx, Unit } from '../context.js';
import { basename, findLine, slug } from '../repo.js';
import { TF_TYPES } from '../catalog.js';

const RUN = TF_TYPES.google_cloud_run_v2_service;

export function cloudRunNode(ctx: Ctx, name: string, evidence: { file: string; line?: number }) {
  const id = `gcp:run:${slug(name)}`;
  ctx.g.node({
    id,
    kind: 'cloud',
    layer: 'cloud',
    label: name,
    tech: 'Cloud Run',
    category: 'GCP · serverless containers',
    cost: RUN.cost,
    description: `Cloud Run service "${name}".`,
    evidence: [evidence],
  });
  return id;
}

/** GitHub Actions and Cloud Build → pipelines and what they deploy to. */
export function detectCI(ctx: Ctx) {
  const { repo, g } = ctx;
  const workflows = repo.files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f));
  for (const f of workflows) {
    const text = repo.read(f) ?? '';
    let doc: any;
    try {
      doc = YAML.parse(text);
    } catch {
      continue;
    }
    const name: string = doc?.name ?? basename(f).replace(/\.ya?ml$/, '');
    const id = `ci:${slug(basename(f).replace(/\.ya?ml$/, ''))}`;
    const triggers = Object.keys(typeof doc?.on === 'object' && doc?.on ? doc.on : doc?.on ? { [doc.on]: 1 } : doc?.true ?? {});
    g.node({
      id,
      kind: 'pipeline',
      layer: 'cicd',
      label: name,
      tech: 'GitHub Actions',
      category: 'CI/CD',
      cost: { tier: 'low', model: 'per runner-minute' },
      description: `Workflow "${name}"${triggers.length ? ` — runs on ${triggers.join(', ')}` : ''}.`,
      evidence: [{ file: f, line: 1 }],
      meta: { triggers, jobs: Object.keys(doc?.jobs ?? {}) },
    });
    for (const [jobName, job] of Object.entries<any>(doc?.jobs ?? {})) {
      const steps: any[] = job?.steps ?? [];
      const jobText = JSON.stringify(job);
      const dirs = new Set<string>();
      if (job?.defaults?.run?.['working-directory']) dirs.add(job.defaults.run['working-directory']);
      for (const s of steps) {
        if (s?.['working-directory']) dirs.add(s['working-directory']);
        if (s?.with?.['working-directory']) dirs.add(s.with['working-directory']);
        if (s?.with?.source) dirs.add(s.with.source);
        if (s?.with?.context) dirs.add(s.with.context);
        const run: string = s?.run ?? '';
        for (const m of run.matchAll(/(?:--source[ =]|-f\s+|docker build\s+(?:[^\n]*?\s)?)(\.?\/?[\w./-]+)/g)) dirs.add(m[1].replace(/\/Dockerfile$/, ''));
      }
      const units = [...dirs].map((d) => ctx.unitByDir(d)).filter((u): u is Unit => !!u && u.role !== 'tooling');
      deployTargets(ctx, id, f, text, jobText, steps, units, jobName);
    }
  }

  for (const f of repo.files.filter((x) => /(^|\/)cloudbuild(\.[\w-]+)?\.ya?ml$/.test(x))) {
    const text = repo.read(f) ?? '';
    let doc: any;
    try {
      doc = YAML.parse(text);
    } catch {
      continue;
    }
    const id = `ci:${slug(f.replace(/\.ya?ml$/, ''))}`;
    g.node({ id, kind: 'pipeline', layer: 'cicd', label: basename(f), tech: 'Cloud Build', category: 'CI/CD', cost: { tier: 'low', model: 'per build-minute' }, description: 'Google Cloud Build pipeline.', evidence: [{ file: f, line: 1 }] });
    const steps: any[] = doc?.steps ?? [];
    const flat = steps.map((s) => ({ run: [s?.entrypoint ?? '', ...(s?.args ?? [])].join(' ') }));
    const dirs = new Set<string>();
    for (const s of steps) for (const a of s?.args ?? []) if (typeof a === 'string' && a.startsWith('apps/')) dirs.add(a.replace(/\/Dockerfile$/, ''));
    const units = [...dirs].map((d) => ctx.unitByDir(d)).filter((u): u is Unit => !!u);
    deployTargets(ctx, id, f, text, JSON.stringify(doc), flat, units, 'build');
  }

  // EAS Workflows (D49): Expo's own CI under .eas/workflows/ — mobile builds, OTA updates, store submits.
  for (const f of repo.files.filter((x) => /^\.eas\/workflows\/[^/]+\.ya?ml$/.test(x))) {
    const text = repo.read(f) ?? '';
    let doc: any;
    try {
      doc = YAML.parse(text);
    } catch {
      continue;
    }
    const id = `ci:eas-${slug(basename(f).replace(/\.ya?ml$/, ''))}`;
    const name: string = doc?.name ?? basename(f).replace(/\.ya?ml$/, '');
    g.node({ id, kind: 'pipeline', layer: 'cicd', label: name, tech: 'EAS Workflows', category: 'CI/CD · mobile', cost: { tier: 'medium', model: 'per build' }, description: 'Expo EAS workflow: builds, updates or submits the mobile app.', evidence: [{ file: f, line: 1 }] });
    hostNode(ctx, 'ext:eas', 'Expo EAS', 'Mobile build & updates', { tier: 'medium', model: 'per build + MAU' });
    g.edge(id, 'ext:eas', 'deploys', [{ file: f, line: 1 }], 'runs on');
  }

  // Host config files next to apps.
  for (const f of repo.files.filter((x) => basename(x) === 'vercel.json')) {
    const u = ctx.unitFor(f);
    if (!u) continue;
    hostNode(ctx, 'host:vercel', 'Vercel', 'Hosting', { tier: 'medium', model: 'per seat + usage' });
    g.edge(u.nodeId, 'host:vercel', 'runs-on', [{ file: f }]);
  }
  for (const f of repo.files.filter((x) => basename(x) === 'eas.json')) {
    const u = ctx.unitFor(f);
    if (!u) continue;
    hostNode(ctx, 'ext:eas', 'Expo EAS', 'Mobile build & updates', { tier: 'medium', model: 'per build + MAU' });
    g.edge('ext:eas', u.nodeId, 'deploys', [{ file: f }], 'builds');
    const eas = repo.json(f);
    if (eas?.submit) {
      hostNode(ctx, 'ext:app-stores', 'App Store · Play Store', 'Mobile distribution', { tier: 'low', model: 'yearly developer fee' });
      g.edge('ext:eas', 'ext:app-stores', 'deploys', [{ file: f, line: findLine(repo.read(f) ?? '', '"submit"') }], 'submits');
    }
  }
  for (const f of repo.files.filter((x) => basename(x) === 'render.yaml')) {
    const u = ctx.unitFor(f);
    hostNode(ctx, 'host:render', 'Render', 'Hosting', { tier: 'medium', model: 'per instance' });
    if (u && u.role !== 'tooling') g.edge(u.nodeId, 'host:render', 'runs-on', [{ file: f }]);
  }
  for (const f of repo.files.filter((x) => basename(x) === 'firebase.json')) {
    hostNode(ctx, 'host:firebase', 'Firebase Hosting', 'Hosting', { tier: 'low', model: 'per GB served' });
    const u = ctx.unitFor(f);
    if (u && u.role !== 'tooling') g.edge(u.nodeId, 'host:firebase', 'runs-on', [{ file: f }]);
  }
}

function hostNode(ctx: Ctx, id: string, label: string, category: string, cost: { tier: any; model: string }) {
  const layer = id.startsWith('host:') ? 'cloud' : 'external';
  ctx.g.node({ id, kind: layer === 'cloud' ? 'cloud' : 'external', layer, label, tech: category, category, cost, description: `${label} — ${category}.` });
}

function deployTargets(ctx: Ctx, pipelineId: string, file: string, text: string, jobText: string, steps: any[], units: Unit[], jobName: string) {
  const { g } = ctx;
  const ev = (needle: string | RegExp) => ({ file, line: findLine(text, needle), note: `job ${jobName}` });
  const runText = steps.map((s) => `${s?.uses ?? ''} ${s?.run ?? ''}`).join('\n');

  const targets: string[] = [];

  // Cloud Run
  const runNames = new Set<string>();
  for (const m of runText.matchAll(/gcloud\s+(?:beta\s+)?run\s+(?:deploy|services\s+update)\s+([\w${}.-]+)/g)) runNames.add(m[1]);
  for (const s of steps) if (/deploy-cloudrun/.test(s?.uses ?? '') && s?.with?.service) runNames.add(String(s.with.service));
  for (const n of runNames) {
    const clean = n.replace(/\$\{\{.*?\}\}/g, '').replace(/^\$\w+$/, '') || 'service';
    const id = cloudRunNode(ctx, clean, ev(n));
    g.edge(pipelineId, id, 'deploys', [ev(n)]);
    targets.push(id);
  }
  if (/gcloud\s+functions\s+deploy\s+([\w-]+)/.test(runText)) {
    const n = /gcloud\s+functions\s+deploy\s+([\w-]+)/.exec(runText)![1];
    ctx.g.node({ id: `gcp:fn:${slug(n)}`, kind: 'cloud', layer: 'cloud', label: n, tech: 'Cloud Function', cost: { tier: 'low', model: 'per invocation' }, description: `Cloud Function "${n}".`, evidence: [ev(n)] });
    g.edge(pipelineId, `gcp:fn:${slug(n)}`, 'deploys', [ev(n)]);
    targets.push(`gcp:fn:${slug(n)}`);
  }
  if (/gcloud\s+app\s+deploy/.test(runText)) {
    ctx.g.node({ id: 'gcp:appengine', kind: 'cloud', layer: 'cloud', label: 'App Engine', tech: 'App Engine', cost: { tier: 'medium', model: 'per instance-hour' } });
    g.edge(pipelineId, 'gcp:appengine', 'deploys', [ev('gcloud app deploy')]);
    targets.push('gcp:appengine');
  }
  if (/(gcr\.io|docker\.pkg\.dev)/.test(jobText)) {
    ctx.g.node({ id: 'gcp:artifact-registry', kind: 'cloud', layer: 'cloud', label: 'Artifact Registry', tech: 'Container images', cost: { tier: 'low', model: 'per GB stored' } });
    g.edge(pipelineId, 'gcp:artifact-registry', 'deploys', [ev(/gcr\.io|docker\.pkg\.dev/)], 'pushes image');
  }
  if (/vercel(-action)?|\bvercel\s+(deploy|--prod)/i.test(runText)) {
    hostNode(ctx, 'host:vercel', 'Vercel', 'Hosting', { tier: 'medium', model: 'per seat + usage' });
    g.edge(pipelineId, 'host:vercel', 'deploys', [ev(/vercel/i)]);
    targets.push('host:vercel');
  }
  if (/expo-github-action|\beas\s+(build|update|submit)/.test(runText)) {
    hostNode(ctx, 'ext:eas', 'Expo EAS', 'Mobile build & updates', { tier: 'medium', model: 'per build + MAU' });
    g.edge(pipelineId, 'ext:eas', 'deploys', [ev(/eas\s+(build|update|submit)|expo-github-action/)], 'triggers');
  }
  if (/firebase\s+deploy|FirebaseExtended\/action-hosting-deploy/.test(runText)) {
    hostNode(ctx, 'host:firebase', 'Firebase Hosting', 'Hosting', { tier: 'low', model: 'per GB served' });
    g.edge(pipelineId, 'host:firebase', 'deploys', [ev(/firebase/)]);
    targets.push('host:firebase');
  }
  if (/api\.render\.com\/deploy|render-deploy/.test(jobText)) {
    hostNode(ctx, 'host:render', 'Render', 'Hosting', { tier: 'medium', model: 'per instance' });
    g.edge(pipelineId, 'host:render', 'deploys', [ev(/render/)]);
    targets.push('host:render');
  }
  if (/terraform\s+apply|hashicorp\/setup-terraform/.test(runText)) {
    const n = g.nodes.get(pipelineId);
    if (n) n.meta = { ...(n.meta ?? {}), terraform: true };
  }

  // Which app runs where.
  for (const t of targets) {
    let owners = units;
    if (!owners.length) owners = guessUnits(ctx, g.nodes.get(t)?.label ?? '');
    for (const u of owners) g.edge(u.nodeId, t, 'runs-on', [{ file, note: `deployed by ${jobName}` }]);
  }
}

/** "sumitra-api" → unit "apps/api". */
export function guessUnits(ctx: Ctx, name: string): Unit[] {
  const n = name.toLowerCase();
  if (!n) return [];
  const candidates = ctx.appUnits().filter((u) => {
    const short = (u.dir.split('/').pop() || u.name).toLowerCase();
    const pkg = u.name.toLowerCase().split('/').pop()!;
    return n === short || n === pkg || n.endsWith('-' + short) || n.startsWith(short + '-') || n.includes(pkg);
  });
  return candidates.slice(0, 1);
}
