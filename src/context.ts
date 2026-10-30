import fg from 'fast-glob';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/.git/**', '**/coverage/**'];

export interface ScanContext {
  root: string;
  files: string[];
  read(file: string): Promise<string>;
}

export async function createContext(root: string): Promise<ScanContext> {
  const files = (await fg('**/*', { cwd: root, dot: true, ignore: IGNORE, onlyFiles: true })).sort();
  const cache = new Map<string, string>();
  return {
    root,
    files,
    async read(file) {
      if (!cache.has(file)) cache.set(file, await readFile(path.join(root, file), 'utf8'));
      return cache.get(file)!;
    },
  };
}
