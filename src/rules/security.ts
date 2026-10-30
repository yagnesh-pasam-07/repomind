import type { Ctx } from '../context.js';
import { basename, lineAt, slug } from '../repo.js';
import type { Finding, Severity } from '../types.js';
import { isDockerfile, parseDockerfile } from '../detectors/docker.js';
import { envFileKeys, envRefsOf } from '../detectors/imports.js';
import { providerForEnv } from '../detectors/integrations.js';
import { terraformResources, type TfResource } from '../detectors/terraform.js';

interface SecretRule {
  id: string;
  title: string;
  severity: Severity;
  re: RegExp;
}

const SECRET_RULES: SecretRule[] = [
  { id: 'secret-private-key', title: 'Private key committed', severity: 'critical', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: 'secret-gcp-service-account', title: 'GCP service-account key committed', severity: 'critical', re: /"type"\s*:\s*"service_account"[\s\S]{0,400}"private_key"/ },
  { id: 'secret-aws-key', title: 'AWS access key committed', severity: 'critical', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'secret-stripe-live', title: 'Stripe live secret key committed', severity: 'critical', re: /\b(?:sk|rk)_live_[0-9a-zA-Z]{20,}\b/ },
  { id: 'secret-razorpay', title: 'Razorpay live key committed', severity: 'critical', re: /\brzp_live_[0-9a-zA-Z]{10,}\b/ },
  { id: 'secret-slack-token', title: 'Slack token committed', severity: 'critical', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: 'secret-slack-webhook', title: 'Slack webhook URL committed', severity: 'high', re: /https:\/\/hooks\.slack\.com\/services\/T[0-9A-Z]+\/B[0-9A-Z]+\/[0-9A-Za-z]+/ },
  { id: 'secret-openai', title: 'OpenAI API key committed', severity: 'critical', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: 'secret-anthropic', title: 'Anthropic API key committed', severity: 'critical', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'secret-github-token', title: 'GitHub token committed', severity: 'critical', re: /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{30,}\b/ },
  { id: 'secret-twilio', title: 'Twilio API key committed', severity: 'high', re: /\bSK[0-9a-f]{32}\b/ },
  { id: 'secret-sendgrid', title: 'SendGrid API key committed', severity: 'high', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/ },
  { id: 'secret-google-api-key', title: 'Google API key in code', severity: 'medium', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    id: 'secret-generic',
    title: 'Hard-coded credential',
    severity: 'medium',
    re: /\b(?:password|passwd|secret|api_?key|auth_?token|access_?token|client_?secret)\b\s*[:=]\s*['"](?![^'"]*(?:\$\{|process\.env|example|changeme|placeholder|your[_-]|xxx|<|test|dummy))[^'"\s]{12,}['"]/i,
  },
];

const SKIP_SECRET_FILES = /(^|\/)(\.env\.example|\.env\.sample|\.env\.template|env\.example)$|\.(md|mdx|lock|snap)$|(^|\/)(test|tests|__tests__|fixtures?|mocks?)\//i;

const env = (key: string) => /^\.env(\.[\w-]+)?$/.test(key) && !/\.(example|sample|template|dist)$/.test(key);

/** Security rules over the repo. Findings store location, never the secret value. */
export function runSecurityRules(ctx: Ctx) {
  const { repo, g } = ctx;
  const add = (f: Omit<Finding, 'id'> & { subject?: string }) => {
    const { subject, ...rest } = f;
    g.finding({ id: `${f.rule}:${f.file ?? ''}:${slug(subject ?? '')}`, ...rest });
  };

  // 1) Secrets in any text file.
  for (const f of repo.files) {
    if (SKIP_SECRET_FILES.test(f)) continue;
    const text = repo.read(f);
    if (!text) continue;
    const seen = new Set<string>();
    for (const r of SECRET_RULES) {
      if (r.id === 'secret-generic' && seen.size) continue;
      const m = r.re.exec(text);
      if (!m) continue;
      seen.add(r.id);
      add({
        rule: r.id,
        severity: r.severity,
        title: r.title,
        file: f,
        line: lineAt(text, m.index),
        node: ctx.ownerOf(f),
        subject: r.id,
        fix: 'Rotate the credential now, remove it from the repo history, and load it from Secret Manager or CI secrets.',
      });
    }
  }

  // 2) Committed .env files.
  for (const f of repo.files) {
    if (!env(basename(f))) continue;
    const keys = envFileKeys(repo.read(f) ?? '').filter((k) => k.value && !/^["']?$/.test(k.value));
    if (!keys.length) continue;
    add({ rule: 'env-file-committed', severity: 'high', title: `.env file committed with ${keys.length} value${keys.length === 1 ? '' : 's'}`, file: f, line: 1, node: ctx.unitFor(f)?.nodeId, fix: 'Delete it from git, add .env* to .gitignore, rotate the values.' });
  }

  // 3) Terraform (GCP).
  const tf = terraformResources(ctx);
  const nodeForTf = (r: TfResource) => {
    for (const n of g.nodes.values()) if (n.meta?.terraform === `${r.type}.${r.name}`) return n.id;
    return undefined;
  };
  const refTarget = (body: string, type: string) => {
    const m = new RegExp(`\\b${type}\\.([A-Za-z0-9_-]+)`).exec(body);
    if (!m) return undefined;
    const r = tf.find((x) => x.type === type && x.name === m[1]);
    return r ? nodeForTf(r) ?? (type.startsWith('google_cloud_run') ? `gcp:run:${slug(r.attrName ?? r.name)}` : undefined) : undefined;
  };
  for (const r of tf) {
    const at = (needle: RegExp) => {
      const m = needle.exec(r.body);
      return m ? r.line + lineAt(r.body, m.index) - 1 : r.line;
    };
    if (/^google_storage_bucket_iam_(member|binding)$/.test(r.type) && /all(Authenticated)?Users/.test(r.body)) {
      add({ rule: 'gcs-public-bucket', severity: 'critical', title: 'Cloud Storage bucket is public', file: r.file, line: at(/all(Authenticated)?Users/), node: refTarget(r.body, 'google_storage_bucket'), subject: r.name, fix: 'Remove allUsers/allAuthenticatedUsers; serve files through signed URLs.' });
    }
    if (r.type === 'google_storage_bucket' && !/uniform_bucket_level_access\s*=\s*true/.test(r.body)) {
      add({ rule: 'gcs-no-uniform-access', severity: 'low', title: 'Bucket without uniform bucket-level access', file: r.file, line: r.line, node: nodeForTf(r), subject: r.name, fix: 'Set uniform_bucket_level_access = true.' });
    }
    if (/^google_cloud_run(_v2)?_service_iam_(member|binding)$/.test(r.type) && /allUsers/.test(r.body) && /run\.invoker/.test(r.body)) {
      add({ rule: 'run-public-invoke', severity: 'high', title: 'Cloud Run service allows unauthenticated calls', file: r.file, line: at(/allUsers/), node: refTarget(r.body, r.type.includes('v2') ? 'google_cloud_run_v2_service' : 'google_cloud_run_service'), subject: r.name, fix: 'If this is not a public API, remove allUsers and put it behind IAP or a load balancer with auth.' });
    }
    if (r.type === 'google_sql_database_instance') {
      if (/value\s*=\s*"0\.0\.0\.0\/0"/.test(r.body)) {
        add({ rule: 'sql-open-to-internet', severity: 'critical', title: 'Cloud SQL accepts connections from any IP', file: r.file, line: at(/0\.0\.0\.0\/0/), node: nodeForTf(r), subject: r.name, fix: 'Remove 0.0.0.0/0 and use private IP or the Cloud SQL connector.' });
      } else if (/ipv4_enabled\s*=\s*true/.test(r.body)) {
        add({ rule: 'sql-public-ip', severity: 'medium', title: 'Cloud SQL has a public IP', file: r.file, line: at(/ipv4_enabled/), node: nodeForTf(r), subject: r.name, fix: 'Prefer private IP with a VPC connector.' });
      }
      if (/deletion_protection\s*=\s*false/.test(r.body)) {
        add({ rule: 'sql-no-deletion-protection', severity: 'medium', title: 'Cloud SQL deletion protection is off', file: r.file, line: at(/deletion_protection/), node: nodeForTf(r), subject: r.name, fix: 'Set deletion_protection = true for production.' });
      }
      if (!/backup_configuration[\s\S]*?enabled\s*=\s*true/.test(r.body)) {
        add({ rule: 'sql-no-backups', severity: 'medium', title: 'Cloud SQL backups not enabled', file: r.file, line: r.line, node: nodeForTf(r), subject: r.name, fix: 'Add backup_configuration { enabled = true }.' });
      }
    }
    if (r.type === 'google_compute_firewall' && /source_ranges\s*=\s*\[[^\]]*"0\.0\.0\.0\/0"/.test(r.body)) {
      const admin = /ports\s*=\s*\[[^\]]*"(22|3389)"/.test(r.body);
      add({ rule: 'firewall-open', severity: admin ? 'high' : 'medium', title: admin ? 'SSH/RDP open to the internet' : 'Firewall rule open to the internet', file: r.file, line: at(/0\.0\.0\.0\/0/), subject: r.name, fix: 'Limit source_ranges to known IPs or use IAP TCP forwarding.' });
    }
    if (r.type === 'google_access_context_manager_service_perimeter' && /use_explicit_dry_run_spec\s*=\s*true/.test(r.body)) {
      add({ rule: 'vpcsc-dry-run', severity: 'low', title: 'VPC Service Controls perimeter is in dry-run (not enforced)', file: r.file, line: at(/use_explicit_dry_run_spec/), node: nodeForTf(r), subject: r.name, fix: 'Review dry-run violation logs, then enforce the perimeter.' });
    }
  }

  // 4) Dockerfiles.
  for (const f of repo.files.filter((x) => isDockerfile(x))) {
    const text = repo.read(f) ?? '';
    const info = parseDockerfile(f, text);
    const owner = ctx.unitFor(f)?.nodeId;
    if (!info.user || info.user === 'root' || info.user === '0') {
      add({ rule: 'docker-root', severity: 'medium', title: 'Container runs as root', file: f, line: 1, node: owner, fix: 'Add a non-root USER (e.g. USER node) before CMD.' });
    }
    const last = info.base.at(-1) ?? '';
    if (last && (!last.includes(':') || last.endsWith(':latest')) && !last.includes('@sha256') && last !== 'scratch') {
      add({ rule: 'docker-unpinned', severity: 'low', title: `Base image not pinned (${last})`, file: f, line: lineAt(text, text.lastIndexOf('FROM')), node: owner, fix: 'Pin a version tag or digest.' });
    }
  }

  // 5) Code: CORS wildcard, TLS off, env vars undocumented.
  const exampleKeys = new Map<string, Set<string>>();
  for (const f of repo.files.filter((x) => /(^|\/)\.env\.(example|sample|template)$|(^|\/)env\.example$/.test(x))) {
    const u = ctx.unitFor(f);
    const set = exampleKeys.get(u?.nodeId ?? '') ?? new Set<string>();
    for (const k of envFileKeys(repo.read(f) ?? '')) set.add(k.key);
    exampleKeys.set(u?.nodeId ?? '', set);
  }
  const allExample = new Set([...exampleKeys.values()].flatMap((s) => [...s]));
  for (const f of repo.sourceFiles()) {
    const text = repo.read(f);
    if (!text) continue;
    const owner = ctx.ownerOf(f);
    const cors = /\bcors\(\s*\)|origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]\s*,\s*['"]\*['"]|origin\s*:\s*true\s*,\s*credentials\s*:\s*true/.exec(text);
    if (cors) add({ rule: 'cors-wildcard', severity: 'medium', title: 'CORS allows any origin', file: f, line: lineAt(text, cors.index), node: owner, fix: 'List allowed origins explicitly.' });
    const tls = /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/.exec(text);
    if (tls) add({ rule: 'tls-verify-off', severity: 'high', title: 'TLS certificate checks disabled', file: f, line: lineAt(text, tls.index), node: owner, fix: 'Turn certificate verification back on and trust the right CA instead.' });
    const evalUse = /\beval\(|new Function\(/.exec(text);
    if (evalUse && !/\.(test|spec)\./.test(f)) add({ rule: 'code-eval', severity: 'medium', title: 'eval / new Function used', file: f, line: lineAt(text, evalUse.index), node: owner, fix: 'Avoid running strings as code.' });
    if (allExample.size) {
      const missing = [...new Map(envRefsOf(text).filter((r) => !allExample.has(r.key) && providerForEnv(r.key)).map((r) => [r.key, r])).values()];
      if (missing.length) {
        const keys = missing.map((r) => r.key);
        add({ rule: 'env-undocumented', severity: 'low', title: `${keys.length === 1 ? 'Secret' : `${keys.length} secrets`} missing from .env.example: ${keys.join(', ')}`, file: f, line: missing[0].line, node: owner, subject: keys.join('-'), fix: 'Add them to .env.example so new deploys and teammates know they are needed.' });
      }
    }
  }

  // 6) GitHub Actions: pull_request_target + checkout of PR code.
  for (const f of repo.files.filter((x) => /^\.github\/workflows\/.*\.ya?ml$/.test(x))) {
    const text = repo.read(f) ?? '';
    if (/pull_request_target/.test(text) && /github\.event\.pull_request\.head\.(sha|ref)/.test(text)) {
      add({ rule: 'gha-prt-checkout', severity: 'high', title: 'pull_request_target checks out untrusted PR code', file: f, line: lineAt(text, text.indexOf('pull_request_target')), fix: 'Use pull_request, or never run PR code with secrets.' });
    }
  }
}
