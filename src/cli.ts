import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { diffGraphs, shouldFail } from './diff.js';
import { prComment, textSummary } from './report.js';
import { scan, VERSION } from './scan.js';
import type { Graph } from './types.js';
import { renderViewer } from './viewer.js';

const HELP = `RepoMind ${VERSION} — a live map of your code, infrastructure and integrations.

Usage
  repomind scan [dir] [-o graph.json] [--quiet]
      Scan a repository and write the graph.
  repomind view [graph.json] [-o map.html] [--base base.json] [--blob-base URL]
      Build the interactive HTML map. With --base, highlights what changed.
  repomind diff <base.json> <head.json> [-o comment.md] [--fail-on critical|high|medium|low|none] [--map-url URL] [--blob-base URL]
      Compare two graphs and write the PR comment (markdown).
  repomind map [dir] [--out-dir .repomind]
      scan + view in one step.
  repomind serve [--port 4242] [--host 127.0.0.1] [--data .repomind-data] [--poll 5]
      v2 web app: paste a GitHub URL, get a live sketch map with version history.

Examples
  npx repomind map .                      # → .repomind/graph.json + .repomind/map.html
  repomind diff base.json head.json --fail-on critical
`;

function parseArgs(argv: string[]) {
  const pos: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('-')) flags[k] = argv[++i];
      else flags[k] = true;
    } else if (a === '-o') flags.out = argv[++i];
    else if (a === '-h') flags.help = true;
    else pos.push(a);
  }
  return { pos, flags };
}

const readGraph = (p: string): Graph => JSON.parse(readFileSync(resolve(p), 'utf8'));
const write = (p: string, content: string) => {
  mkdirSync(dirname(resolve(p)), { recursive: true });
  writeFileSync(resolve(p), content);
};
const str = (v: string | boolean | undefined) => (typeof v === 'string' ? v : undefined);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseArgs(rest);
  if (!cmd || cmd === 'help' || flags.help || cmd === '--help') {
    console.log(HELP);
    return;
  }
  if (cmd === '--version' || cmd === 'version') {
    console.log(VERSION);
    return;
  }

  switch (cmd) {
    case 'scan': {
      const g = scan(pos[0] ?? '.', { repoName: str(flags.repo) });
      const out = str(flags.out) ?? 'repomind.graph.json';
      write(out, JSON.stringify(g, null, 2) + '\n');
      if (!flags.quiet) console.log(textSummary(g) + `\n\n→ ${out}`);
      break;
    }
    case 'view': {
      const g = readGraph(pos[0] ?? 'repomind.graph.json');
      const base = str(flags.base) ? readGraph(str(flags.base)!) : undefined;
      const html = renderViewer(g, { base, diff: base ? diffGraphs(base, g) : undefined, blobBase: str(flags['blob-base']) });
      const out = str(flags.out) ?? 'repomind.map.html';
      write(out, html);
      console.log(`→ ${out}`);
      break;
    }
    case 'diff': {
      if (pos.length < 2) throw new Error('diff needs <base.json> <head.json>');
      const base = readGraph(pos[0]);
      const head = readGraph(pos[1]);
      const d = diffGraphs(base, head);
      const md = prComment(d, head, base, { mapUrl: str(flags['map-url']), blobBase: str(flags['blob-base']) });
      if (str(flags.out)) write(str(flags.out)!, md + '\n');
      else console.log(md);
      if (str(flags.json)) write(str(flags.json)!, JSON.stringify(d, null, 2));
      if (shouldFail(d, str(flags['fail-on']))) {
        console.error(`repomind: new ${flags['fail-on']}+ risks introduced — failing.`);
        process.exitCode = 2;
      }
      break;
    }
    case 'map': {
      const dir = str(flags['out-dir']) ?? '.repomind';
      const g = scan(pos[0] ?? '.', { repoName: str(flags.repo) });
      write(`${dir}/graph.json`, JSON.stringify(g, null, 2) + '\n');
      write(`${dir}/map.html`, renderViewer(g, { blobBase: str(flags['blob-base']) }));
      console.log(textSummary(g) + `\n\n→ ${dir}/graph.json\n→ ${dir}/map.html`);
      break;
    }
    case 'serve': {
      const { startServer } = await import('./server/index.js');
      startServer({
        port: Number(str(flags.port) ?? process.env.PORT ?? 4242),
        host: str(flags.host) ?? process.env.HOST ?? '127.0.0.1',
        dataDir: str(flags.data) ?? process.env.REPOMIND_DATA,
        pollMinutes: Number(str(flags.poll) ?? 5),
      });
      break;
    }
    default:
      console.error(`Unknown command "${cmd}".\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('repomind:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
