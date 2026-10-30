import { GraphBuilder } from './graph.js';
import { Repo, dirOf } from './repo.js';
import type { Framework } from './catalog.js';

export interface Unit {
  /** Directory relative to repo root ('' for root). */
  dir: string;
  name: string;
  nodeId: string;
  pkg: any;
  pkgFile: string;
  deps: Set<string>;
  framework?: Framework;
  role: 'web' | 'mobile' | 'server' | 'fullstack' | 'desktop' | 'library' | 'tooling';
}

export interface ModuleInfo {
  unit: Unit;
  dir: string;
  name: string;
  nodeId: string;
}

export class Ctx {
  repo: Repo;
  g = new GraphBuilder();
  units: Unit[] = [];
  modules: ModuleInfo[] = [];

  constructor(repo: Repo) {
    this.repo = repo;
  }

  /** Deepest unit whose directory contains `file`. */
  unitFor(file: string): Unit | undefined {
    let best: Unit | undefined;
    for (const u of this.units) {
      if (u.dir === '' || file === u.dir || file.startsWith(u.dir + '/')) {
        if (!best || u.dir.length > best.dir.length) best = u;
      }
    }
    return best;
  }

  unitByDir(dir: string): Unit | undefined {
    const clean = dir.replace(/^\.\/?/, '').replace(/\/$/, '');
    return this.units.find((u) => u.dir === clean) ?? this.unitFor(clean + '/x');
  }

  moduleFor(file: string): ModuleInfo | undefined {
    let best: ModuleInfo | undefined;
    for (const m of this.modules) {
      if (file.startsWith(m.dir + '/')) {
        if (!best || m.dir.length > best.dir.length) best = m;
      }
    }
    return best;
  }

  /** The most specific graph node that owns a file: module, else unit. */
  ownerOf(file: string): string | undefined {
    return this.moduleFor(file)?.nodeId ?? this.unitFor(file)?.nodeId;
  }

  /** Units that are real runnable apps (not libraries/tooling). */
  appUnits(): Unit[] {
    return this.units.filter((u) => u.role !== 'library' && u.role !== 'tooling');
  }

  /** Source files that belong to a unit (not to a nested unit). */
  filesOfUnit(u: Unit): string[] {
    return this.repo.sourceFiles().filter((f) => this.unitFor(f) === u);
  }
}

export { dirOf };
