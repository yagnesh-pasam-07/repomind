import { createGunzip } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';

export interface RepoRef {
  owner: string;
  repo: string;
  branch?: string;
}

// GitHub names: letters, digits, "-", "_", "."; never only dots (blocks ".." path tricks in the store).
const NAME = /^(?!\.+$)[A-Za-z0-9_.-]{1,100}$/;

/** R1: https://github.com/o/r, github.com/o/r, o/r, …/tree/<branch>, with or without .git. */
export function parseRepoUrl(input: string): RepoRef {
  let s = input.trim().replace(/^git@github\.com:/, 'github.com/').replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.replace(/^github\.com\//, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  const [owner, rawRepo, kind, ...rest] = s.split('/');
  const repo = rawRepo?.replace(/\.git$/, '');
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) throw new Error(`Not a GitHub repository: "${input}". Try github.com/owner/repo.`);
  const branch = kind === 'tree' && rest.length ? rest.join('/') : undefined;
  return { owner, repo, branch };
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  committedAt: string;
}

export const LIMITS = { files: 20_000, bytes: 200 * 1024 * 1024 };

export class GitHub {
  constructor(private token?: string) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'repomind', 'x-github-api-version': '2022-11-28' };
    const t = this.token || process.env.GITHUB_TOKEN;
    if (t) h.authorization = `Bearer ${t}`;
    return h;
  }

  private async get(path: string) {
    const r = await fetch(`https://api.github.com${path}`, { headers: this.headers() });
    if (r.status === 404) throw new Error('Repository or branch not found. Private repos need a token with read access.');
    if (r.status === 401) throw new Error('GitHub rejected the token.');
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0') throw new Error('GitHub rate limit reached. Add a token or try again later.');
    if (!r.ok) throw new Error(`GitHub API ${r.status} for ${path}`);
    return r.json() as Promise<any>;
  }

  async defaultBranch(ref: RepoRef): Promise<string> {
    return (await this.get(`/repos/${ref.owner}/${ref.repo}`)).default_branch;
  }

  async branches(ref: RepoRef): Promise<string[]> {
    const list = await this.get(`/repos/${ref.owner}/${ref.repo}/branches?per_page=100`);
    return list.map((b: any) => b.name);
  }

  private toCommit(c: any): CommitInfo {
    return {
      sha: c.sha,
      message: String(c.commit?.message ?? '').split('\n')[0].slice(0, 200),
      author: c.commit?.author?.name ?? c.author?.login ?? '',
      committedAt: c.commit?.committer?.date ?? c.commit?.author?.date ?? new Date().toISOString(),
    };
  }

  async head(ref: RepoRef, branch: string): Promise<CommitInfo> {
    return this.toCommit(await this.get(`/repos/${ref.owner}/${ref.repo}/commits/${encodeURIComponent(branch)}`));
  }

  /** Newest first. */
  async recentCommits(ref: RepoRef, branch: string, n: number): Promise<CommitInfo[]> {
    const list = await this.get(`/repos/${ref.owner}/${ref.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${n}`);
    return list.map((c: any) => this.toCommit(c));
  }

  /**
   * Downloads the commit tarball and extracts it into `dest` (D10): regular files and dirs only,
   * no absolute paths or "..", stops past LIMITS. The top-level "<owner>-<repo>-<sha>/" folder is stripped.
   */
  async download(ref: RepoRef, sha: string, dest: string): Promise<{ files: number; bytes: number }> {
    const r = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}/tarball/${sha}`, { headers: this.headers(), redirect: 'follow' });
    if (!r.ok || !r.body) throw new Error(`Could not download ${ref.owner}/${ref.repo}@${sha.slice(0, 7)} (HTTP ${r.status}).`);
    const declared = Number(r.headers.get('content-length') || 0);
    if (declared > LIMITS.bytes) throw new Error('Repository is larger than 200 MB; RepoMind v2 refuses repos that big.');
    mkdirSync(dest, { recursive: true });
    let files = 0, bytes = 0, tooBig: string | null = null;
    const extract = tar.x({
      cwd: dest,
      strip: 1,
      preservePaths: false,
      filter: (path, entry: any) => {
        const type = entry.type;
        if (type !== 'File' && type !== 'Directory' && type !== 'OldFile' && type !== 'ContiguousFile') return false;
        if (path.startsWith('/') || path.split('/').includes('..')) return false;
        if (type !== 'Directory') {
          files++;
          bytes += entry.size || 0;
          if (files > LIMITS.files) tooBig = 'more than 20,000 files';
          if (bytes > LIMITS.bytes) tooBig = 'more than 200 MB';
        }
        return !tooBig;
      },
    });
    let raw = 0;
    const counted = Readable.fromWeb(r.body as any).on('data', (c: Buffer) => {
      raw += c.length;
      if (raw > LIMITS.bytes) counted.destroy(new Error('Repository is larger than 200 MB; RepoMind v2 refuses repos that big.'));
    });
    await pipeline(counted, createGunzip(), extract);
    if (tooBig) throw new Error(`Repository has ${tooBig}; RepoMind v2 refuses repos that big.`);
    return { files, bytes };
  }
}
