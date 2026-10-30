import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep, basename, dirname, posix } from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.expo', '.turbo', 'coverage',
  '.cache', '.vercel', '.terraform', 'Pods', 'vendor', '.gradle', '.idea', '.vscode', '.repomind',
  'android', 'ios', '__snapshots__', 'tmp',
]);

const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'pdf', 'zip', 'gz', 'tar', 'woff', 'woff2', 'ttf',
  'otf', 'eot', 'mp4', 'mov', 'mp3', 'wav', 'jar', 'keystore', 'jks', 'apk', 'aab', 'ipa', 'lock',
  'db', 'sqlite', 'bin', 'exe', 'dll', 'so', 'dylib', 'map', 'snap',
]);

const MAX_FILE_BYTES = 512 * 1024;
/** Schemas are read for their model list, and large apps routinely exceed 512 KB (D50). */
const MAX_SCHEMA_BYTES = 4 * 1024 * 1024;
const isSchema = (name: string) => name.endsWith('.prisma');
const MAX_FILES = 20000;

export const SOURCE_EXT = /\.(c|m)?(t|j)sx?$/;

/** A repository snapshot: file list + lazy, cached reads. Paths are POSIX and relative. */
export class Repo {
  readonly root: string;
  readonly files: string[];
  private cache = new Map<string, string | null>();

  constructor(root: string, extraIgnores: string[] = []) {
    this.root = root;
    const ignores = new Set([...IGNORED_DIRS, ...extraIgnores]);
    const out: string[] = [];
    const walk = (dir: string) => {
      if (out.length >= MAX_FILES) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (ignores.has(e.name)) continue;
          walk(full);
        } else if (e.isFile()) {
          const ext = e.name.split('.').pop()?.toLowerCase() ?? '';
          if (BINARY_EXT.has(ext) && e.name !== 'package-lock.json') continue;
          if (e.name === 'package-lock.json' || e.name === 'yarn.lock' || e.name === 'pnpm-lock.yaml') continue;
          try {
            if (statSync(full).size > (isSchema(e.name) ? MAX_SCHEMA_BYTES : MAX_FILE_BYTES)) continue;
          } catch {
            continue;
          }
          out.push(relative(root, full).split(sep).join('/'));
        }
      }
    };
    walk(root);
    this.files = out.sort();
  }

  read(file: string): string | null {
    if (this.cache.has(file)) return this.cache.get(file)!;
    let text: string | null = null;
    try {
      const buf = readFileSync(join(this.root, file));
      // Skip anything that looks binary.
      text = buf.includes(0) ? null : buf.toString('utf8');
    } catch {
      text = null;
    }
    this.cache.set(file, text);
    return text;
  }

  json<T = any>(file: string): T | null {
    const t = this.read(file);
    if (t == null) return null;
    try {
      return JSON.parse(t) as T;
    } catch {
      return null;
    }
  }

  find(pred: (f: string) => boolean): string[] {
    return this.files.filter(pred);
  }

  byName(name: string): string[] {
    return this.files.filter((f) => basename(f) === name);
  }

  sourceFiles(): string[] {
    return this.files.filter((f) => SOURCE_EXT.test(f) && !f.endsWith('.d.ts'));
  }
}

export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** First line (1-based) where `needle` (string or regex) matches. */
export function findLine(text: string, needle: string | RegExp): number | undefined {
  if (typeof needle === 'string') {
    const i = text.indexOf(needle);
    return i < 0 ? undefined : lineAt(text, i);
  }
  const m = needle.exec(text);
  return m ? lineAt(text, m.index) : undefined;
}

export function dirOf(file: string): string {
  const d = posix.dirname(file);
  return d === '.' ? '' : d;
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';
}

export { basename, dirname };
