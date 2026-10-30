import YAML from 'yaml';
import { TF_TYPES } from '../catalog.js';
import type { Ctx } from '../context.js';
import { basename, findLine, slug } from '../repo.js';
import { cloudRunNode } from './ci.js';

/**
 * Deploy-environment manifests (D49): `.github/environments/*.yml` and `deploy/environments/*.yml`.
 * Teams that deploy by script (not Terraform) often keep one YAML per environment listing the real
 * infrastructure: Cloud Run services, Cloud SQL, buckets, migration jobs. Read them as evidence.
 */
export function detectEnvironments(ctx: Ctx) {
  const { repo, g } = ctx;
  const files = repo.files.filter((f) => /^(\.github|deploy|infra)\/environments\/[^/]+\.ya?ml$/.test(f));
  for (const f of files) {
    const text = repo.read(f) ?? '';
    let doc: any;
    try {
      doc = YAML.parse(text);
    } catch {
      continue;
    }
    if (!doc || typeof doc !== 'object') continue;
    const env: string = String(doc.name ?? basename(f).replace(/\.ya?ml$/, ''));
    const ev = (needle: string | RegExp) => ({ file: f, line: findLine(text, needle) ?? 1, note: env });

    const envId = `env:${slug(env)}`;
    const project = doc.project?.id ? ` · project ${doc.project.id}` : '';
    const region = doc.project?.region ? ` · ${doc.project.region}` : '';
    g.node({
      id: envId,
      kind: 'cloud',
      layer: 'cloud',
      label: env,
      tech: 'Deploy environment',
      category: 'Environment',
      description: `Deploy environment "${env}"${project}${region}.`,
      evidence: [{ file: f, line: 1 }],
      meta: { environment: true, trigger: doc.trigger_branch, autoDeploy: !!doc.auto_deploy },
    });

    const apps = ctx.appUnits();
    const appFor = (key: string) => apps.find((u) => u.dir.split('/').pop() === key || u.name === key);

    // Cloud Run services (api_service / web_service / <x>_service).
    const run = doc.cloud_run ?? {};
    for (const [k, v] of Object.entries(run)) {
      const m = /^(\w+)_service$/.exec(k);
      if (!m || typeof v !== 'string') continue;
      const id = cloudRunNode(ctx, v, ev(v));
      g.edge(id, envId, 'runs-on', [ev(v)]);
      const u = appFor(m[1]);
      if (u) g.edge(u.nodeId, id, 'runs-on', [ev(v)]);
      if (run.allow_unauthenticated === true) {
        g.finding({
          id: `env-public-run:${v}`,
          rule: 'run-public-invoke',
          severity: 'high',
          title: `Cloud Run service ${v} allows unauthenticated calls`,
          node: id,
          file: f,
          line: findLine(text, 'allow_unauthenticated'),
          fix: 'If this is not a public API, set allow_unauthenticated: false and put it behind IAP or a load balancer with auth.',
        });
      }
    }

    // Cloud SQL.
    const sql = doc.cloud_sql;
    if (sql?.instance) {
      const id = `gcp:sql:${slug(sql.instance)}`;
      g.node({
        id,
        kind: 'database',
        layer: 'cloud',
        label: sql.instance,
        tech: 'Cloud SQL',
        category: `GCP · ${sql.version ?? 'Postgres'}${sql.availability_type === 'REGIONAL' ? ' · HA' : ''}`,
        cost: TF_TYPES.google_sql_database_instance?.cost,
        description: `Cloud SQL instance "${sql.instance}"${sql.database ? `, database ${sql.database}` : ''}${sql.tier ? `, tier ${sql.tier}` : ''}.`,
        evidence: [ev(sql.instance)],
      });
      g.edge(id, envId, 'runs-on', [ev(sql.instance)]);
      if (g.has('data:postgres')) g.edge('data:postgres', id, 'runs-on', [ev(sql.instance)]);
      if (sql.point_in_time_recovery === false) {
        g.finding({ id: `env-sql-pitr:${f}`, rule: 'sql-no-pitr', severity: 'medium', title: `Cloud SQL ${sql.instance} has point-in-time recovery off`, node: id, file: f, line: findLine(text, 'point_in_time_recovery'), fix: 'Turn on point-in-time recovery for production databases.' });
      }
    }

    // Storage bucket.
    const bucket = doc.storage?.bucket;
    if (typeof bucket === 'string') {
      const id = `gcp:bucket:${slug(bucket)}`;
      g.node({ id, kind: 'bucket', layer: 'cloud', label: bucket, tech: 'Cloud Storage', category: 'GCP · object storage', cost: TF_TYPES.google_storage_bucket?.cost, evidence: [ev(bucket)] });
      g.edge(id, envId, 'runs-on', [ev(bucket)]);
      if (g.has('gcp:storage')) g.edge('gcp:storage', id, 'uses', [ev(bucket)]);
    }

    // Migration job.
    const job = doc.migrations?.job;
    if (typeof job === 'string') {
      const id = `gcp:job:${slug(job)}`;
      g.node({ id, kind: 'pipeline', layer: 'cloud', label: job, tech: 'Cloud Run job', category: 'GCP · database migrations', evidence: [ev(job)] });
      g.edge(id, envId, 'runs-on', [ev(job)]);
      const sqlId = sql?.instance ? `gcp:sql:${slug(sql.instance)}` : null;
      if (sqlId) g.edge(id, sqlId, 'writes', [ev(job)], 'migrates');
    }

    // Artifact Registry repo.
    const ar = doc.artifact_registry?.repo;
    if (typeof ar === 'string' && g.has('gcp:artifact-registry')) g.edge('gcp:artifact-registry', envId, 'deploys', [ev(ar)]);
  }
}
