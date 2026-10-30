import { lineAt } from '../repo.js';

export interface ImportRef {
  /** The raw specifier, e.g. "@slack/web-api" or "../leave/service". */
  spec: string;
  /** Package name for bare specifiers ("@scope/pkg" or "pkg"). */
  pkg?: string;
  line: number;
}

const IMPORT_RE =
  /(?:^|[^\w$.])(?:import\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+|require\s*\(\s*|import\s*\(\s*)['"`]([^'"`\n]+)['"`]/g;

export function packageName(spec: string): string | undefined {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return undefined;
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return name ? `${scope}/${name}` : undefined;
  }
  return spec.split('/')[0];
}

export function importsOf(text: string): ImportRef[] {
  const out: ImportRef[] = [];
  IMPORT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1];
    out.push({ spec, pkg: packageName(spec), line: lineAt(text, m.index + m[0].indexOf(spec)) });
  }
  return out;
}

/** process.env.X, process.env['X'], import.meta.env.X, Deno.env.get('X') */
const ENV_RE = /(?:process\.env|import\.meta\.env)(?:\.([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])|Deno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;

export function envRefsOf(text: string): { key: string; line: number }[] {
  const out: { key: string; line: number }[] = [];
  ENV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_RE.exec(text))) {
    out.push({ key: m[1] ?? m[2] ?? m[3], line: lineAt(text, m.index) });
  }
  return out;
}

/** KEY=value lines in .env-style files. */
export function envFileKeys(text: string): { key: string; line: number; value: string }[] {
  const out: { key: string; line: number; value: string }[] = [];
  text.split('\n').forEach((raw, i) => {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (m) out.push({ key: m[1], line: i + 1, value: m[2].trim() });
  });
  return out;
}
