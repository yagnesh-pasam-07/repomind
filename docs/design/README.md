# Design references

The source of truth for RepoMind's screens and brand.

- **Design artifact:** [RepoMind — v2 designs](https://claude.ai/artifact/PVYBaVsuM87DVoxkL576T3) — the full flow:
  Logo, Theme, Flow 0 Sign in, Flow 1 Website, Flow 2 Scanning, Flow 3 Live map, Flow 4 Compare versions,
  Flow 5 Download & connect, dark versions, Workspace Overview and the Sidebar component.
- **PRD:** [RepoMind — PRD](https://claude.ai/artifact/DQfeuCZGrur8qCYHSrr8SL) (mirrored in [`PRODUCT.md`](../../PRODUCT.md)).

## Files here

| File | What it is | Built in |
| --- | --- | --- |
| `landing-light.png` | Website, light | `src/web/landing.html` |
| `landing-dark.png` | Website, dark (Night) | `src/web/landing.html` |
| `logo-sheet.png` | The weaverbird mark and app icons | `src/web/brand/*.svg` (traced to vector) |

## Where each screen lives

| Design | Route | Source |
| --- | --- | --- |
| Flow 0 · Sign in | `/login` | `src/web/login.html` |
| Flow 1 · Website | `/` | `src/web/landing.html` |
| Flow 2 · Scanning | `/` after "Map it" | `src/web/landing.html` (`#scanning`) |
| Flow 3 · Live map | `/r/:owner/:repo` | `src/viewer/parts/*` |
| Flow 4 · Compare versions | `/r/:owner/:repo?base=<sha>#changes` | `src/viewer/parts/*` (Changes view) |
| Flow 5 · Download & connect | "Download" on the map | `src/viewer/parts/app2.js` (Share dialog) |
| Workspace · Overview + Sidebar | `/app` | `src/web/app.html`, data from `/api/overview` |
