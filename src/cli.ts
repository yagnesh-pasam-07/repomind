#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { diffGraphs, toMarkdown } from './diff.js';
import { scan, VERSION } from './scan.js';
import { renderViewer } from './viewer/index.js';

const program = new Command('repomind').version(VERSION);

program
  .command('scan')
  .argument('[path]', 'repo to scan', '.')
  .option('-o, --out <file>', 'graph output', 'repomind.graph.json')
  .option('--html <file>', 'also write the viewer HTML')
  .action(async (root: string, opts: { out: string; html?: string }) => {
    const graph = await scan(root);
    writeFileSync(opts.out, JSON.stringify(graph, null, 2));
    if (opts.html) writeFileSync(opts.html, renderViewer(graph));
    console.log(`Scanned ${graph.meta.stats.files} files: ${graph.meta.stats.nodes} nodes, ${graph.meta.stats.findings} findings -> ${opts.out}`);
  });

program
  .command('diff')
  .argument('<base>', 'base graph json')
  .argument('<head>', 'head graph json')
  .action((base: string, head: string) => {
    const load = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
    console.log(toMarkdown(diffGraphs(load(base), load(head))));
  });

program.parseAsync();
