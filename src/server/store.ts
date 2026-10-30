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

/** Disk store under <root>/<owner>/<repo>/ (D9). Swap for Postgres/GCS behind the same methods. */
export class Store {
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

  get(owner: string, repo: string): RepoIndex | null {
    const f = join(this.dir(owner, repo), 'index.json');
    if (!existsSync(f)) return null;
    return JSON.parse(readFileSync(f, 'utf8'));
  }

  save(idx: RepoIndex) {
    const d = this.dir(idx.repo.owner, idx.repo.repo);
    mkdirSync(join(d, 'graphs'), { recursive: true });
    idx.versions.sort((a, b) => b.committedAt.localeCompare(a.committedAt) || b.scannedAt.localeCompare(a.scannedAt));
    this.writeAtomic(join(d, 'index.json'), JSON.stringify(idx, null, 2));
  }

  putGraph(owner: string, repo: string, sha: string, g: Graph) {
    const d = join(this.dir(owner, repo), 'graphs');
    mkdirSync(d, { recursive: true });
    this.writeAtomic(join(d, `${sha}.json`), JSON.stringify(g));
  }

  graph(owner: string, repo: string, sha: string): Graph | null {
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null;
    const f = join(this.dir(owner, repo), 'graphs', `${sha}.json`);
    return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  }

  all(): RepoIndex[] {
    const out: RepoIndex[] = [];
    for (const o of safeList(this.root)) for (const r of safeList(join(this.root, o))) {
      const f = join(this.root, o, r, 'index.json');
      if (existsSync(f)) out.push(JSON.parse(readFileSync(f, 'utf8')));
    }
    return out;
  }
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
