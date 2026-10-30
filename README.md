# RepoMind

One live map of your repo's code, infrastructure, integrations and apps, plus a comment on every pull request saying what the change does to that map, including new security and cost risks.

Full product spec: [PRODUCT.md](PRODUCT.md).

## Quick start

```bash
npm install
npm run scan:example                         # scan the sample project
npx tsx src/cli.ts scan . --html repomind.html
npx tsx src/cli.ts diff base.json head.json  # PR comment markdown
```

## Layout

| Path | Purpose |
|---|---|
| `src/detectors/` | One file per detector |
| `src/rules/` | Security and cost rules |
| `src/diff.ts` | Graph diff and PR markdown |
| `src/viewer/` | Self-contained HTML viewer |
| `action.yml` | GitHub Action |
| `examples/sumitra-like/` | Test fixture |

## Status

v0.1 scaffold: pipeline, schema, CLI and diff are wired up; detectors, rules and the viewer are stubs. See the Rollout section in PRODUCT.md.
