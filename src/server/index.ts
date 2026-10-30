import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffGraphs } from '../diff.js';
import { scan } from '../scan.js';
import { renderViewer, viewerDiff } from '../viewer.js';
import { GitHub, parseRepoUrl } from './github.js';
import { Scanner } from './jobs.js';
import { overview } from './overview.js';
import { DiskStore, openStore, publicRepo, type RepoIndex, type Store } from './store.js';

export interface ServeOptions {
  port?: number;
  host?: string;
  dataDir?: string;
  pollMinutes?: number;
  backfill?: number;
}

export interface AppOptions {
  store: Store;
  pollMinutes?: number;
  backfill?: number;
  /**
   * Keeps background work alive after the response (Vercel's waitUntil). Without it (long-running
   * `repomind serve`), background promises simply run in the process (D35).
   */
  waitUntil?: (p: Promise<unknown>) => void;
}

const here = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 1024 * 1024;

/** The whole web app + API as one request handler, usable by `repomind serve` and by a Vercel function (D35). */
export function createApp(opts: AppOptions) {
  const pollMinutes = opts.pollMinutes ?? 5;
  const backfillN = opts.backfill ?? 10;
  const store = opts.store;
  const scanner = new Scanner(store);
  const bg = (p: Promise<unknown>) => {
    const safe = p.catch((e) => console.error('repomind: background task failed:', e instanceof Error ? e.message : e));
    if (opts.waitUntil) opts.waitUntil(safe);
  };
  const page = (f: string) => readFileSync(join(here, '..', 'viewer', f), 'utf8');
  const landing = () => page('landing.html');
  // Landing-page preview (D28): the built-in example repo, scanned once and rendered with the real viewer.
  let exampleHtml: string | null = null;
  const example = () => {
    if (exampleHtml) return exampleHtml;
    const exDir = join(here, '..', '..', 'examples', 'sumitra-like');
    const g = scan(exDir, { repoName: 'sumitra (example)' });
    exampleHtml = renderViewer(g, { embed: 'showcase' });
    return exampleHtml;
  };

  const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8', extra: Record<string, string> = {}) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, msg: string) => send(res, status, { error: msg });

  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((ok, bad) => {
      const chunks: Buffer[] = [];
      let n = 0;
      req.on('data', (c: Buffer) => {
        n += c.length;
        if (n > MAX_BODY) {
          bad(new Error('Body too large'));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => ok(Buffer.concat(chunks)));
      req.on('error', bad);
    });
  const json = async (req: IncomingMessage) => {
    const b = await readBody(req);
    if (!b.length) return {};
    try {
      return JSON.parse(b.toString('utf8'));
    } catch {
      throw new Error('Invalid JSON body');
    }
  };

  /** Start (or reuse) a repo and scan its head. Returns the job. */
  async function startMap(url: string, branch?: string, token?: string, backfill = false, live = false) {
    const ref = parseRepoUrl(url);
    const gh = new GitHub(token);
    const meta = await gh.info(ref);
    const br = branch || ref.branch || meta.defaultBranch;
    let idx = await store.get(ref.owner, ref.repo);
    if (!idx) idx = { repo: { owner: ref.owner, repo: ref.repo, branch: br, connected: false, createdAt: new Date().toISOString() }, versions: [] };
    if (token) idx.repo.token = token;
    idx.repo.private = meta.private;
    if (idx.repo.branch !== br) {
      // A different branch is a different timeline; keep it simple and start over for that branch.
      idx.repo.branch = br;
      idx.versions = [];
    }
    if (live) {
      idx.repo.connected = true;
      if (!idx.repo.secret) idx.repo.secret = 'rm_whsec_' + randomBytes(18).toString('hex');
    }
    await store.save(idx);
    const job = await scanner.newJob(idx.repo.owner, idx.repo.repo, br);
    bg(
      scanner
        .enqueue(ref.owner, ref.repo, async () => {
          const fresh = (await store.get(ref.owner, ref.repo))!;
          const head = await new GitHub(fresh.repo.token).head(ref, br);
          job.sha = head.sha.slice(0, 7);
          await scanner.scanCommit(fresh, head, job);
          const after = (await store.get(ref.owner, ref.repo))!;
          after.repo.lastChecked = new Date().toISOString();
          await store.save(after);
          job.status = 'done';
          await scanner.saveJob(job);
        })
        // Backfill queues on the same per-repo chain, so it must start after this task, not inside it
        // (awaiting it from within the chain waits on itself).
        .then(() => (backfill ? runBackfill(ref.owner, ref.repo) : undefined))
        .catch(async (e) => {
          if (job.status === 'done') throw e; // backfill failure: the map itself is fine
          job.status = 'error';
          job.error = e instanceof Error ? e.message : String(e);
          await scanner.saveJob(job);
        }),
    );
    return job;
  }

  function runBackfill(owner: string, repo: string) {
    return scanner.enqueue(owner, repo, async () => {
      const idx = await store.get(owner, repo);
      if (!idx) return;
      const commits = await new GitHub(idx.repo.token).recentCommits(idx.repo, idx.repo.branch, backfillN);
      for (const c of commits) {
        const cur = (await store.get(owner, repo))!;
        try {
          await scanner.scanCommit(cur, c);
        } catch (e) {
          console.error(`repomind: backfill ${owner}/${repo}@${c.sha.slice(0, 7)} failed:`, e instanceof Error ? e.message : e);
        }
      }
    });
  }

  /** Check the branch head and scan it if new. Returns a job id when a scan started. */
  async function checkHead(owner: string, repo: string): Promise<string | null> {
    const idx = await store.get(owner, repo);
    if (!idx) throw new Error('Unknown repo');
    const head = await new GitHub(idx.repo.token).head(idx.repo, idx.repo.branch);
    idx.repo.lastChecked = new Date().toISOString();
    await store.save(idx);
    if (idx.versions.some((v) => v.sha === head.sha.slice(0, 7))) return null;
    const job = await scanner.newJob(owner, repo, idx.repo.branch);
    job.sha = head.sha.slice(0, 7);
    bg(
      scanner
        .enqueue(owner, repo, async () => {
          await scanner.scanCommit((await store.get(owner, repo))!, head, job);
          job.status = 'done';
          await scanner.saveJob(job);
        })
        .catch(async (e) => {
          job.status = 'error';
          job.error = e instanceof Error ? e.message : String(e);
          await scanner.saveJob(job);
        }),
    );
    return job.id;
  }

  async function graphPayload(idx: RepoIndex, sha?: string | null, baseSha?: string | null) {
    const { owner, repo } = idx.repo;
    const v = sha ? idx.versions.find((x) => x.sha.startsWith(sha)) : idx.versions[0];
    if (!v) return null;
    const graph = await store.graph(owner, repo, v.sha);
    if (!graph) return null;
    let baseV = baseSha ? idx.versions.find((x) => x.sha.startsWith(baseSha)) : idx.versions[idx.versions.indexOf(v) + 1];
    const base = baseV ? await store.graph(owner, repo, baseV.sha) : null;
    const d = base ? diffGraphs(base, graph) : null;
    return { graph, base: base ? { nodes: base.nodes, edges: base.edges } : null, diff: d ? viewerDiff(d) : null, _d: d, _base: base, version: v };
  }

  const SOURCE_REPO = 'yagnesh-pasam-07/repomind';
  // Stars, forks and contributors for the website (D50, D51). Cached briefly so visitors don't hit
  // GitHub's rate limit, but short enough that a new star shows within minutes.
  const STATS_TTL = 5 * 60_000;
  type Contributor = { login: string; avatar: string; url: string; contributions: number };
  let stats: { at: number; data: { stars: number | null; forks: number | null; url: string; contributors: Contributor[] } } | null = null;
  async function githubStats() {
    if (stats && Date.now() - stats.at < STATS_TTL) return stats.data;
    const headers = { accept: 'application/vnd.github+json', 'user-agent': 'repomind' };
    let stars: number | null = stats?.data.stars ?? null, forks: number | null = stats?.data.forks ?? null;
    let contributors: Contributor[] = stats?.data.contributors ?? [];
    try {
      const [r, c] = await Promise.all([
        fetch(`https://api.github.com/repos/${SOURCE_REPO}`, { headers }),
        fetch(`https://api.github.com/repos/${SOURCE_REPO}/contributors?per_page=24`, { headers }),
      ]);
      if (r.ok) { const j: any = await r.json(); stars = j.stargazers_count ?? stars; forks = j.forks_count ?? forks; }
      if (c.ok) {
        const list: any[] = await c.json();
        contributors = list
          .filter((x) => x.type !== 'Bot' && !/\[bot\]$/.test(x.login))
          .map((x) => ({ login: x.login, avatar: `${x.avatar_url}&s=96`, url: x.html_url, contributions: x.contributions }));
      }
    } catch {}
    stats = { at: Date.now(), data: { stars, forks, url: `https://github.com/${SOURCE_REPO}`, contributors } };
    return stats.data;
  }

  const repoFromPath = (owner: string, repo: string) => store.get(decodeURIComponent(owner), decodeURIComponent(repo));

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const p = url.pathname;
      const m = (re: RegExp) => re.exec(p);
      let r: RegExpExecArray | null;

      if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, landing(), 'text/html; charset=utf-8');
      if (req.method === 'GET' && p === '/healthz') return send(res, 200, { ok: true });
      // Star count for the header button (D50). Cached so visitors never hit GitHub's rate limit.
      if (req.method === 'GET' && p === '/api/github-stats') return send(res, 200, await githubStats(), 'application/json; charset=utf-8');
      if (req.method === 'GET' && p === '/example') return send(res, 200, example(), 'text/html; charset=utf-8');
      // Workspace and sign-in pages (D29).
      if (req.method === 'GET' && (p === '/app' || p === '/app/')) return send(res, 200, page('app.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && p === '/login') return send(res, 200, page('login.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && p === '/social') return send(res, 200, page('social.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && p === '/api/overview') {
        const scanning = new Set([...scanner.jobs.values()].filter((j) => j.status === 'running').map((j) => `${j.owner}/${j.repo}`.toLowerCase()));
        return send(res, 200, await overview(store, scanning));
      }

      if (req.method === 'POST' && p === '/api/maps') {
        const b = await json(req);
        if (typeof b.url !== 'string') return fail(res, 400, 'Missing "url".');
        const job = await startMap(b.url, typeof b.branch === 'string' ? b.branch : undefined, typeof b.token === 'string' && b.token ? b.token : undefined, !!b.backfill, !!b.live);
        return send(res, 202, { job: job.id, owner: job.owner, repo: job.repo, branch: job.branch });
      }

      if (req.method === 'GET' && p === '/api/branches') {
        const ref = parseRepoUrl(url.searchParams.get('url') || '');
        const gh = new GitHub(req.headers['x-github-token'] as string | undefined);
        const [def, all] = await Promise.all([gh.defaultBranch(ref), gh.branches(ref)]);
        return send(res, 200, { default: def, branches: [def, ...all.filter((b) => b !== def)] });
      }

      if (req.method === 'GET' && (r = m(/^\/api\/jobs\/([a-f0-9]{16})$/))) {
        const job = await scanner.getJob(r[1]);
        return job ? send(res, 200, job) : fail(res, 404, 'Unknown job');
      }

      if (req.method === 'GET' && p === '/api/repos') {
        const top = (await store.all())
          .filter((i) => i.versions.length)
          .sort((a, b) => b.versions[0].scannedAt.localeCompare(a.versions[0].scannedAt))
          .slice(0, 12);
        const list = await Promise.all(
          top.map(async (i) => ({ ...publicRepo(i.repo, pollMinutes), latest: i.versions[0], count: i.versions.length, summary: summaryOf(await store.graph(i.repo.owner, i.repo.repo, i.versions[0].sha)) })),
        );
        return send(res, 200, { repos: list });
      }

      if ((r = m(/^\/api\/repos\/([^/]+)\/([^/]+)\/(versions|graph|refresh|connect)$/))) {
        const idx = await repoFromPath(r[1], r[2]);
        if (!idx) return fail(res, 404, 'This repo has not been mapped yet.');
        const what = r[3];
        if (what === 'versions' && req.method === 'GET') return send(res, 200, { repo: publicRepo(idx.repo, pollMinutes), versions: idx.versions });
        if (what === 'graph' && req.method === 'GET') {
          const g = await graphPayload(idx, url.searchParams.get('sha'), url.searchParams.get('base'));
          if (!g) return fail(res, 404, 'No version found.');
          const { _d, _base, ...out } = g;
          return send(res, 200, out);
        }
        if (what === 'refresh' && req.method === 'POST') return send(res, 200, { job: await checkHead(idx.repo.owner, idx.repo.repo) });
        if (what === 'connect' && req.method === 'POST') {
          const b = await json(req);
          idx.repo.connected = true;
          // The secret is shown once, here; later reads never include it (D9).
          const secret = 'rm_whsec_' + randomBytes(18).toString('hex');
          idx.repo.secret = secret;
          await store.save(idx);
          if (b.backfill !== false) bg(runBackfill(idx.repo.owner, idx.repo.repo));
          return send(res, 200, { repo: publicRepo(idx.repo, pollMinutes), secret, webhook: `${originOf(req)}/api/webhook/github` });
        }
        return fail(res, 405, 'Method not allowed');
      }

      if (req.method === 'POST' && p === '/api/webhook/github') {
        const raw = await readBody(req);
        const event = req.headers['x-github-event'];
        if (event === 'ping') return send(res, 200, { ok: true });
        let body: any;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return fail(res, 400, 'Invalid JSON');
        }
        const full: string = body?.repository?.full_name || '';
        const [owner, repo] = full.split('/');
        const idx = owner && repo ? await store.get(owner, repo) : null;
        if (!idx || !idx.repo.secret) return fail(res, 404, 'Repo not connected');
        const sig = String(req.headers['x-hub-signature-256'] || '');
        const want = 'sha256=' + createHmac('sha256', idx.repo.secret).update(raw).digest('hex');
        if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return fail(res, 401, 'Bad signature');
        if (event !== 'push') return send(res, 200, { ignored: event });
        if (body.ref !== `refs/heads/${idx.repo.branch}`) return send(res, 200, { ignored: body.ref });
        const job = await checkHead(idx.repo.owner, idx.repo.repo);
        return send(res, 202, { job });
      }

      if (req.method === 'GET' && (r = m(/^\/r\/([^/]+)\/([^/]+?)(\/download\.html)?$/))) {
        const idx = await repoFromPath(r[1], r[2]);
        if (!idx) return send(res, 404, notFoundPage(`${decodeURIComponent(r[1])}/${decodeURIComponent(r[2])}`), 'text/html; charset=utf-8');
        const sha = url.searchParams.get('sha');
        const g = await graphPayload(idx, sha, url.searchParams.get('base'));
        if (!g) return send(res, 404, notFoundPage(`${idx.repo.owner}/${idx.repo.repo}`), 'text/html; charset=utf-8');
        if (r[3]) {
          // R6: offline file — data and rough.js embedded, no live polling.
          const html = renderViewer(g.graph, { base: g._base ?? undefined, diff: g._d ?? undefined, blobBase: blobBase(idx, g.version.sha) });
          return send(res, 200, html, 'text/html; charset=utf-8', { 'content-disposition': `attachment; filename="${idx.repo.repo}-${g.version.sha}.html"` });
        }
        // ?embed=1: preview inside the workspace Overview (no polling, no chrome).
        if (url.searchParams.get('embed') === '1') return send(res, 200, renderViewer(g.graph, { embed: true }), 'text/html; charset=utf-8');
        const html = renderViewer(g.graph, {
          base: g._base ?? undefined,
          diff: g._d ?? undefined,
          blobBase: blobBase(idx, g.version.sha),
          live: { owner: idx.repo.owner, repo: idx.repo.repo, pollSeconds: 30, pinned: !!sha, base: url.searchParams.get('base') || undefined, info: publicRepo(idx.repo, pollMinutes) },
        });
        return send(res, 200, html, 'text/html; charset=utf-8');
      }

      return fail(res, 404, 'Not found');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!res.headersSent) fail(res, /not found|Not a GitHub|token|rate limit|larger|refuses|Invalid|Missing|too large/i.test(msg) ? 400 : 500, msg);
    }
  };

  /** Polling fallback: check every connected repo's head (PRD v2, "How updates arrive"). Vercel runs it from a cron. */
  async function pollAll() {
    let checked = 0;
    for (const i of await store.all()) {
      if (!i.repo.connected) continue;
      try {
        await checkHead(i.repo.owner, i.repo.repo);
        checked++;
      } catch (e) {
        console.error(`repomind: poll ${i.repo.owner}/${i.repo.repo} failed:`, e instanceof Error ? e.message : e);
      }
    }
    return checked;
  }

  return { handle, pollAll, scanner, store };
}

/** `repomind serve`: one long-running process with a disk (or Neon, if DATABASE_URL is set) store. */
export async function startServer(opts: ServeOptions = {}) {
  const port = opts.port ?? 4242;
  const host = opts.host ?? '127.0.0.1';
  const pollMinutes = opts.pollMinutes ?? 5;
  const dataDir = resolve(opts.dataDir ?? '.repomind-data');
  const store = await openStore(dataDir);
  const app = createApp({ store, pollMinutes, backfill: opts.backfill });
  const server = createServer((req, res) => void app.handle(req, res));
  const pollTimer = setInterval(() => void app.pollAll(), pollMinutes * 60_000);
  pollTimer.unref();
  const where = store instanceof DiskStore ? `data in ${store.root}` : 'data in Neon Postgres';
  server.listen(port, host, () => console.log(`RepoMind web app → http://${host === '0.0.0.0' ? 'localhost' : host}:${port}  (${where})`));
  server.on('close', () => clearInterval(pollTimer));
  return server;
}

function originOf(req: IncomingMessage) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

function blobBase(idx: RepoIndex, sha: string) {
  return `https://github.com/${idx.repo.owner}/${idx.repo.repo}/blob/${sha}`;
}

function summaryOf(g: { nodes: { layer: string; kind: string }[]; findings: unknown[] } | null) {
  if (!g) return '';
  // Count shared packages as apps too: a library-only repo (e.g. express) would otherwise read "0 apps".
  const c = (l: string) => g.nodes.filter((n) => n.layer === l).length;
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const parts = [plural(c('app'), 'app'), `${c('cloud')} cloud`, plural(c('external'), 'service'), plural(g.findings.length, 'risk')];
  return parts.join(' · ');
}

function notFoundPage(name: string) {
  const esc = name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  return `<!DOCTYPE html><meta charset="utf-8"><title>Not mapped yet</title><body style="font-family:Kalam,cursive;background:#FDFBF7;color:#1E1E1E;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="font-family:Caveat,cursive;font-size:56px;margin:0">${esc} isn't mapped yet</h1><p><a href="/?url=${encodeURIComponent(name)}" style="color:#5B57D1">Draw it now →</a></p></div>`;
}
