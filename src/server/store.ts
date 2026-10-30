import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../types.js';

/** One scanned commit on the timeline. Counts are vs the version before it (D13). */
export interface Version {
  sha: string;
  message: string;
  author: string;
  committedAt: string;
  scannedAt: string;
  added: number;
  removed: number;
  changed: number;
  newRisks: number;
  changes: number;
  components: number;
  findings: number;
}

/** Per-repo settings. `token` and `secret` never leave the server (D9). */
export interface RepoRecord {
  owner: string;
  repo: string;
  branch: string;
  connected: boolean;
  token?: string;
  secret?: string;
  lastChecked?: string;
  createdAt: string;
}

export interface RepoIndex {
  repo: RepoRecord;
  versions: Version[];
}

/**
 * Where maps live. Two backends behind one async interface (D35):
 * DiskStore for self-hosting (`repomind serve` with no database), NeonStore when DATABASE_URL is set (Vercel).
 * Jobs are stored too, so any serverless instance can report a scan's progress.
 */
export interface Store {
  readonly kind: 'disk' | 'neon';
  get(owner: string, repo: string): Promise<RepoIndex | null>;
  save(idx: RepoIndex): Promise<void>;
  putGraph(owner: string, repo: string, sha: string, g: Graph): Promise<void>;
  graph(owner: string, repo: string, sha: string): Promise<Graph | null>;
  all(): Promise<RepoIndex[]>;
  putJob(id: string, job: unknown): Promise<void>;
  job<T>(id: string): Promise<T | null>;
}

const SHA = /^[0-9a-f]{7,40}$/i;
const sortVersions = (idx: RepoIndex) =>
  idx.versions.sort((a, b) => b.committedAt.localeCompare(a.committedAt) || b.scannedAt.localeCompare(a.scannedAt));

/** Disk store under <root>/<owner>/<repo>/ (D9). */
export class DiskStore implements Store {
  readonly kind = 'disk' as const;
  private jobs = new Map<string, unknown>();

  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  private dir(owner: string, repo: string) {
    return join(this.root, owner.toLowerCase(), repo.toLowerCase());
  }

  private writeAtomic(file: string, data: string) {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, file);
  }

  async get(owner: string, repo: string): Promise<RepoIndex | null> {
    const f = join(this.dir(owner, repo), 'index.json');
    if (!existsSync(f)) return null;
    return JSON.parse(readFileSync(f, 'utf8'));
  }

  async save(idx: RepoIndex) {
    const d = this.dir(idx.repo.owner, idx.repo.repo);
    mkdirSync(join(d, 'graphs'), { recursive: true });
    sortVersions(idx);
    this.writeAtomic(join(d, 'index.json'), JSON.stringify(idx, null, 2));
  }

  async putGraph(owner: string, repo: string, sha: string, g: Graph) {
    const d = join(this.dir(owner, repo), 'graphs');
    mkdirSync(d, { recursive: true });
    this.writeAtomic(join(d, `${sha}.json`), JSON.stringify(g));
  }

  async graph(owner: string, repo: string, sha: string): Promise<Graph | null> {
    if (!SHA.test(sha)) return null;
    const f = join(this.dir(owner, repo), 'graphs', `${sha}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }

  async all(): Promise<RepoIndex[]> {
    const out: RepoIndex[] = [];
    for (const o of safeList(this.root)) for (const r of safeList(join(this.root, o))) {
      const f = join(this.root, o, r, 'index.json');
      if (existsSync(f)) out.push(JSON.parse(readFileSync(f, 'utf8')));
    }
    return out;
  }

  // One long-lived process: jobs can stay in memory.
  async putJob(id: string, job: unknown) {
    this.jobs.set(id, job);
    if (this.jobs.size > 500) this.jobs.delete(this.jobs.keys().next().value!);
  }

  async job<T>(id: string): Promise<T | null> {
    return (this.jobs.get(id) as T) ?? null;
  }
}

/** Minimal tagged-template SQL client (the Neon serverless driver's shape). */
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, any>[]>;

/**
 * Postgres store on Neon (D35). One row per repo (index JSON, incl. token/secret — never returned by read
 * endpoints), one row per scanned commit graph, and short-lived job rows for scan progress.
 */
export class NeonStore implements Store {
  readonly kind = 'neon' as const;
  private ready: Promise<void> | null = null;

  constructor(private sql: Sql) {}

  static async connect(url: string): Promise<NeonStore> {
    const { neon } = await import('@neondatabase/serverless');
    return new NeonStore(neon(url) as unknown as Sql);
  }

  /** Create tables once per instance; idempotent. */
  private init() {
    this.ready ??= (async () => {
      await this.sql`CREATE TABLE IF NOT EXISTS rm_repos (key text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
      await this.sql`CREATE TABLE IF NOT EXISTS rm_graphs (key text NOT NULL, sha text NOT NULL, graph jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (key, sha))`;
      await this.sql`CREATE TABLE IF NOT EXISTS rm_jobs (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
    })();
    return this.ready;
  }

  private key(owner: string, repo: string) {
    return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  }

  async get(owner: string, repo: string): Promise<RepoIndex | null> {
    await this.init();
    const rows = await this.sql`SELECT data FROM rm_repos WHERE key = ${this.key(owner, repo)}`;
    return (rows[0]?.data as RepoIndex) ?? null;
  }

  async save(idx: RepoIndex) {
    await this.init();
    sortVersions(idx);
    const data = JSON.stringify(idx);
    await this.sql`INSERT INTO rm_repos (key, data, updated_at) VALUES (${this.key(idx.repo.owner, idx.repo.repo)}, ${data}::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  }

  async putGraph(owner: string, repo: string, sha: string, g: Graph) {
    await this.init();
    await this.sql`INSERT INTO rm_graphs (key, sha, graph) VALUES (${this.key(owner, repo)}, ${sha}, ${JSON.stringify(g)}::jsonb)
      ON CONFLICT (key, sha) DO UPDATE SET graph = EXCLUDED.graph`;
  }

  async graph(owner: string, repo: string, sha: string): Promise<Graph | null> {
    if (!SHA.test(sha)) return null;
    await this.init();
    const rows = await this.sql`SELECT graph FROM rm_graphs WHERE key = ${this.key(owner, repo)} AND sha = ${sha}`;
    return (rows[0]?.graph as Graph) ?? null;
  }

  async all(): Promise<RepoIndex[]> {
    await this.init();
    const rows = await this.sql`SELECT data FROM rm_repos ORDER BY updated_at DESC LIMIT 200`;
    return rows.map((r) => r.data as RepoIndex);
  }

  async putJob(id: string, job: unknown) {
    await this.init();
    await this.sql`INSERT INTO rm_jobs (id, data, updated_at) VALUES (${id}, ${JSON.stringify(job)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  }

  async job<T>(id: string): Promise<T | null> {
    await this.init();
    const rows = await this.sql`SELECT data FROM rm_jobs WHERE id = ${id}`;
    return (rows[0]?.data as T) ?? null;
  }
}

/** Neon when DATABASE_URL is set, else the disk store at `dataDir`. */
export async function openStore(dataDir: string): Promise<Store> {
  const url = process.env.DATABASE_URL;
  return url ? NeonStore.connect(url) : new DiskStore(dataDir);
}

function safeList(d: string): string[] {
  try {
    return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** The public view of a repo record: never includes token or secret. */
export function publicRepo(r: RepoRecord, pollMinutes: number) {
  return { owner: r.owner, repo: r.repo, branch: r.branch, connected: r.connected, private: !!r.token, lastChecked: r.lastChecked, pollMinutes };
}
