import { TF_HIDDEN, TF_TYPES } from '../catalog.js';
import type { Ctx } from '../context.js';
import { lineAt, slug } from '../repo.js';
import { cloudRunNode, guessUnits } from './ci.js';

export interface TfResource {
  type: string;
  name: string;
  file: string;
  line: number;
  body: string;
  /** Literal `name = "..."` attribute if present. */
  attrName?: string;
}

/** Extracts `resource "type" "name" { ... }` blocks with brace matching. */
export function parseTerraform(file: string, text: string): TfResource[] {
  const out: TfResource[] = [];
  const re = /^\s*resource\s+"([^"]+)"\s+"([^"]+)"\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = m.index + m[0].length;
    let inStr = false;
    for (; i < text.length && depth > 0; i++) {
      const c = text[i];
      if (c === '"' && text[i - 1] !== '\\') inStr = !inStr;
      if (inStr) continue;
      if (c === '#' || (c === '/' && text[i + 1] === '/')) {
        while (i < text.length && text[i] !== '\n') i++;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    const body = text.slice(m.index + m[0].length, i - 1);
    const attr = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*"([^"$]+)"`, 'm').exec(body)?.[1];
    let attrName = attr('name') ?? attr('secret_id') ?? attr('account_id') ?? attr('repository_id') ?? attr('topic') ?? attr('dataset_id');
    if (!attrName || attrName.includes('/')) attrName = attr('title') ?? attrName?.split('/').pop();
    out.push({ type: m[1], name: m[2], file, line: lineAt(text, m.index), body, attrName });
  }
  return out;
}

export function terraformResources(ctx: Ctx): TfResource[] {
  const all: TfResource[] = [];
  for (const f of ctx.repo.files.filter((x) => x.endsWith('.tf'))) all.push(...parseTerraform(f, ctx.repo.read(f) ?? ''));
  return all;
}

const SERVICE_TO_TYPES: Record<string, string[]> = {
  'cloudkms.googleapis.com': ['google_kms_crypto_key', 'google_kms_key_ring'],
  'storage.googleapis.com': ['google_storage_bucket'],
  'sqladmin.googleapis.com': ['google_sql_database_instance'],
  'secretmanager.googleapis.com': ['google_secret_manager_secret'],
  'run.googleapis.com': ['google_cloud_run_v2_service', 'google_cloud_run_service'],
  'bigquery.googleapis.com': ['google_bigquery_dataset'],
  'pubsub.googleapis.com': ['google_pubsub_topic'],
};

/** GCP resources from Terraform, with edges from cross-references between resources. */
export function detectTerraform(ctx: Ctx) {
  const { g } = ctx;
  const resources = terraformResources(ctx);
  const idOf = new Map<string, string>();

  for (const r of resources) {
    const t = TF_TYPES[r.type];
    if (!t || TF_HIDDEN.test(r.type)) continue;
    const label = r.attrName ?? r.name;
    let id: string;
    if (r.type === 'google_cloud_run_v2_service' || r.type === 'google_cloud_run_service') {
      id = cloudRunNode(ctx, label, { file: r.file, line: r.line });
    } else {
      id = `tf:${r.type}.${slug(r.name)}`;
      g.node({
        id,
        kind: t.kind,
        layer: t.layer,
        label,
        tech: t.label,
        category: `GCP · ${t.label}`,
        cost: t.cost,
        description: describe(r, t.label),
        evidence: [{ file: r.file, line: r.line, note: `${r.type}.${r.name}` }],
        meta: { terraform: `${r.type}.${r.name}` },
      });
    }
    idOf.set(`${r.type}.${r.name}`, id);
  }

  // References: google_x.name.attr inside a block → edge.
  for (const r of resources) {
    const from = idOf.get(`${r.type}.${r.name}`);
    if (!from) continue;
    for (const m of r.body.matchAll(/\b(google_[a-z0-9_]+)\.([A-Za-z0-9_-]+)\b/g)) {
      const to = idOf.get(`${m[1]}.${m[2]}`);
      if (to && to !== from) {
        const kind = r.type.includes('perimeter') ? 'protects' : 'uses';
        g.edge(from, to, kind, [{ file: r.file, line: r.line + lineAt(r.body, m.index) - 1 }]);
      }
    }
    // VPC Service Controls: restricted services → protected resources.
    if (r.type === 'google_access_context_manager_service_perimeter') {
      for (const [svc, types] of Object.entries(SERVICE_TO_TYPES)) {
        if (!r.body.includes(svc)) continue;
        for (const other of resources) {
          if (!types.includes(other.type)) continue;
          const to = idOf.get(`${other.type}.${other.name}`);
          if (to) g.edge(from, to, 'protects', [{ file: r.file, line: r.line + lineAt(r.body, r.body.indexOf(svc)) - 1, note: svc }]);
        }
      }
    }
    // Cloud Run image → app unit.
    if (r.type.startsWith('google_cloud_run')) {
      const image = /image\s*=\s*"([^"]+)"/.exec(r.body)?.[1] ?? '';
      const imageName = image.split('/').pop()?.split(':')[0] ?? '';
      const units = guessUnits(ctx, imageName).concat(guessUnits(ctx, r.attrName ?? r.name));
      for (const u of units.slice(0, 1)) g.edge(u.nodeId, from, 'runs-on', [{ file: r.file, line: r.line, note: image || r.name }]);
    }
  }

  // Code-level stores → the managed instance that hosts them.
  for (const r of resources) {
    const id = idOf.get(`${r.type}.${r.name}`);
    if (!id) continue;
    if (r.type === 'google_sql_database_instance') {
      const ver = /database_version\s*=\s*"([A-Z]+)/.exec(r.body)?.[1] ?? '';
      const store = ver.startsWith('POSTGRES') ? 'data:postgres' : ver.startsWith('MYSQL') ? 'data:mysql' : undefined;
      if (store && g.has(store)) g.edge(store, id, 'runs-on', [{ file: r.file, line: r.line }]);
    }
    if (r.type === 'google_redis_instance' && g.has('data:redis')) g.edge('data:redis', id, 'runs-on', [{ file: r.file, line: r.line }]);
    if (r.type === 'google_storage_bucket' && g.has('gcp:storage')) g.edge('gcp:storage', id, 'uses', [{ file: r.file, line: r.line }]);
    if (r.type === 'google_kms_crypto_key' && g.has('gcp:kms')) g.edge('gcp:kms', id, 'uses', [{ file: r.file, line: r.line }]);
    if (r.type === 'google_pubsub_topic' && g.has('gcp:pubsub')) g.edge('gcp:pubsub', id, 'uses', [{ file: r.file, line: r.line }]);
  }
}

function describe(r: TfResource, label: string): string {
  const bits: string[] = [`${label} defined in Terraform (${r.type}.${r.name}).`];
  const loc = /(?:location|region)\s*=\s*"([^"]+)"/.exec(r.body)?.[1];
  if (loc) bits.push(`Region: ${loc}.`);
  const tier = /tier\s*=\s*"([^"]+)"/.exec(r.body)?.[1];
  if (tier) bits.push(`Tier: ${tier}.`);
  const ver = /database_version\s*=\s*"([^"]+)"/.exec(r.body)?.[1];
  if (ver) bits.push(`Version: ${ver}.`);
  return bits.join(' ');
}
