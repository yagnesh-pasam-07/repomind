import YAML from 'yaml';
import { DATA_STORES } from '../catalog.js';
import type { Ctx } from '../context.js';
import { basename, dirOf, findLine, slug } from '../repo.js';

export interface DockerfileInfo {
  file: string;
  base: string[];
  ports: string[];
  user?: string;
}

/** Dockerfiles annotate their app; docker-compose adds local services and data stores. */
export function detectDocker(ctx: Ctx) {
  const { repo, g } = ctx;

  for (const f of repo.files.filter((x) => /(^|\/)(Dockerfile|[\w.-]+\.Dockerfile|Dockerfile\.[\w.-]+)$/.test(x))) {
    const info = parseDockerfile(f, repo.read(f) ?? '');
    const unit = ctx.unitFor(f);
    if (unit && unit.role !== 'tooling') {
      const n = g.nodes.get(unit.nodeId);
      if (n) {
        n.evidence.push({ file: f, line: 1, note: 'Dockerfile' });
        n.meta = { ...(n.meta ?? {}), container: { base: info.base.at(-1), ports: info.ports, user: info.user ?? 'root' } };
      }
    }
  }

  for (const f of repo.files.filter((x) => /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(x))) {
    const text = repo.read(f) ?? '';
    let doc: any;
    try {
      doc = YAML.parse(text);
    } catch {
      continue;
    }
    const services = doc?.services ?? {};
    for (const [name, svc] of Object.entries<any>(services)) {
      const image: string = svc?.image ?? '';
      const line = findLine(text, new RegExp(`^\\s{2}${escape(name)}:`, 'm'));
      const store = DATA_STORES.find((s) => s.composeImages.some((img) => image.split(':')[0] === img || image.split(':')[0].endsWith('/' + img)));
      if (store) {
        g.node({ id: store.id, kind: store.kind, layer: 'data', label: store.label, tech: image, description: `${store.label} (local via docker-compose).`, evidence: [{ file: f, line, note: name }] });
        continue;
      }
      const ctxPath = typeof svc?.build === 'string' ? svc.build : svc?.build?.context;
      if (ctxPath) {
        const unit = ctx.unitByDir(normalize(dirOf(f), ctxPath));
        if (unit) {
          g.nodes.get(unit.nodeId)?.evidence.push({ file: f, line, note: `compose service "${name}"` });
          continue;
        }
      }
      if (image) {
        g.node({
          id: `svc:${slug(name)}`,
          kind: 'service',
          layer: 'app',
          label: name,
          tech: image,
          description: `Container "${name}" from docker-compose.`,
          evidence: [{ file: f, line }],
        });
      }
    }
  }
}

export function parseDockerfile(file: string, text: string): DockerfileInfo {
  const info: DockerfileInfo = { file, base: [], ports: [] };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = /^FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(line))) info.base.push(m[1]);
    else if ((m = /^EXPOSE\s+(.+)/i.exec(line))) info.ports.push(...m[1].split(/\s+/));
    else if ((m = /^USER\s+(\S+)/i.exec(line))) info.user = m[1];
  }
  return info;
}

function normalize(base: string, p: string) {
  const parts = (base ? base.split('/') : []).concat(p.split('/'));
  const out: string[] = [];
  for (const s of parts) {
    if (!s || s === '.') continue;
    if (s === '..') out.pop();
    else out.push(s);
  }
  return out.join('/');
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { basename };
