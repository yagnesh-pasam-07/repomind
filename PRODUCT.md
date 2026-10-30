# RepoMind — PRD

30 Oct 2026 · @Yagnesh

## Summary and problem

RepoMind turns a repository into one live map of code, infrastructure, integrations and apps, and comments on every pull request with what the change does to that map, including new security and cost risks.

**The problem.** Architecture diagrams go stale within weeks. Each existing tool sees one layer: GitDiagram and DeepWiki see code, TerraVision sees Terraform. None of them shows the SMS provider, the email service, the mobile app and the Cloud Run service on one map, and none tells a reviewer that a PR just made a bucket public or added a paid service.

**Who feels it.** New joiners take days to learn how the system fits together. Tech leads rebuild diagrams by hand for every review or client presentation. Reviewers miss infrastructure and security side effects hidden in code diffs.

**The bet.** Diagrams that people look at once a quarter don't build a habit. A PR comment that people see on every merge does. The map is the reference; the PR comment is the daily product; the risk and cost flags are what a company pays for.

## Goals, non-goals and success metrics

### Goals

1. One accurate map per repo: code modules, apps, cloud services, data stores, external integrations, CI/CD.
2. A PR comment on every pull request: added, removed and changed components, plus risk and cost flags.
3. Every box backed by evidence: the file and line that proved it exists.
4. A viewer good enough to present from: layered views, search, a change view and a presentation mode.

### Non-goals for v1

- Languages other than JS/TS, and clouds other than GCP.
- Live reads of the cloud account (planned for v2).
- Editing infrastructure from the map.
- Exact cost estimates. v1 gives cost tiers, not invoices.

### Success metrics

| Metric | Target | How measured |
|---|---|---|
| Detection precision on Sumitra | 95% of boxes correct | Tech lead reviews the map once |
| Detection recall on Sumitra | 90% of real services found | Compared with a hand-made list |
| PR comment usefulness | 1 in 5 PRs gets a flag a reviewer acts on | Reactions and follow-up commits |
| Onboarding | New joiner explains the system in day 1 | Ask the next two joiners |
| Scan speed | Under 30 s for Sumitra-size repo | CI timing |

## Users and use cases

| User | Job to be done | What they use |
|---|---|---|
| Tech lead | Explain the system in a review or client meeting | Presentation mode, PNG/SVG export |
| New joiner | Learn what lives where in day 1 | Overview map, click a box to see its files |
| PR reviewer | Catch infra, security and cost side effects | PR comment |
| Security / DevOps | See exposure and secrets across repos | Risk overlay, findings list |
| Manager / founder | Know which paid services the product depends on | Integrations view, cost overlay |

### Example stories

- A developer adds `twilio` to the API. The PR comment says: "New external service: Twilio (SMS). Paid per message. Secret `TWILIO_AUTH_TOKEN` expected in env."
- A Terraform change sets a bucket to `allUsers`. The PR comment flags it as critical before merge.
- A new team member opens the map, clicks Payroll, and sees its API routes, Cloud SQL database and KMS key.

## Scope v1: JS/TS, Expo and GCP

v1 does one stack very accurately instead of every stack roughly. Detection is rule-based; AI is optional and only writes labels and summaries.

| Detector | Reads | Finds |
|---|---|---|
| Workspace | `package.json`, workspaces, `apps/*`, `packages/*` | Apps, shared packages, internal dependencies |
| Frameworks | dependencies, `app.json`, `next.config.*` | Next.js, React, Expo/React Native, Express, NestJS, Fastify |
| API routes | Express/Next route files | Endpoints per module |
| Data | Prisma schema, pg, mongoose, redis | Databases, models, caches |
| Integrations | SDK imports and env keys | Twilio, SendGrid, Resend, Nodemailer, Razorpay, Stripe, Slack, Firebase, OpenAI, Anthropic, Sentry, Keka |
| Containers | `Dockerfile`, `docker-compose.yml` | Images, exposed ports, services |
| CI/CD | `.github/workflows/*`, `cloudbuild.yaml` | Pipelines, deploy targets |
| GCP infra | Terraform `google_*` resources | Cloud Run, Cloud SQL, Cloud Storage, KMS, VPC, Pub/Sub, Secret Manager |
| Secrets | All text files | Committed keys and tokens (values never stored) |
| Overrides | `.repomind.yml` | Renames, hidden nodes, manual nodes, groups |

## Features and requirements

**F1. Scanner (CLI).** `repomind scan <path>` writes `repomind.graph.json`. Must be deterministic: the same repo gives the same graph, so diffs only show real changes. Must finish under 30 s for 5,000 files and skip `node_modules`, build output and binaries.

**F2. Interactive map (viewer).** One self-contained HTML file, opened locally or hosted.

- Views: Overview, Code, Infrastructure, Integrations, Risks, Changes.
- Zones by layer: Clients, Apps and services, Data, Cloud, External services, CI/CD.
- Click a box: description, evidence (file:line), risks, cost tier, connected nodes.
- Search, focus on a node and its neighbours, pan and zoom, dark and light theme.
- Export PNG/SVG of the current view.

**F3. PR diff bot.** A GitHub Action scans the base and head commits, diffs the two graphs, and posts or updates one comment.

- Sections: Added, Removed, Changed, New risks, Resolved risks, Cost impact.
- A small Mermaid diagram of only the changed nodes and their neighbours.
- Optional `fail-on: critical` to block merges with critical findings.

**F4. Security overlay.** Rules, each with severity and evidence:

| Rule | Severity |
|---|---|
| Committed secret (AWS, GCP key, Stripe, Slack, Twilio, private key) | Critical |
| Public bucket (`allUsers` / `allAuthenticatedUsers`) | Critical |
| Cloud Run allows unauthenticated invoke | High |
| Cloud SQL with public IP or `0.0.0.0/0` authorised network | High |
| Firewall open to `0.0.0.0/0` | High |
| `.env` file committed | High |
| Dockerfile runs as root or uses `latest` tag | Medium |
| CORS allows `*` | Medium |
| Integration secret used but not listed in `.env.example` | Low |

**F5. Cost overlay.** Each cloud and external node gets a tier (free, low, medium, high) and a pricing model (per request, per message, per instance-hour). The PR comment states the direction: "Adds 1 paid service: Twilio, per SMS." Exact prices are v2.

**F6. Presentation mode.** Step through Overview → each zone → risks, full screen, with a one-line caption per step. Keyboard arrows to move.

**F7. Overrides.** `.repomind.yml` lets a team rename, hide, group or add nodes and edges by hand. Manual nodes are marked as manual.

## Architecture and data model

Everything flows through one JSON graph, so the map, the PR comment and the merge gate can never disagree.

```
 repo files ──► detectors ──► overrides (.repomind.yml) ──► rules (security, cost) ──► repomind.graph.json
                                                                                         │
                                         ┌───────────────────────┬───────────────────────┤
                                         ▼                       ▼                       ▼
                                   HTML viewer             graph diff ──► PR comment   merge gate
```

Overrides from `.repomind.yml` are applied after the detectors and before the rules.

### Graph schema (`repomind.graph.json`)

| Object | Key fields |
|---|---|
| Node | id, kind (app, service, module, database, cache, bucket, queue, cloud, external, pipeline, client), layer, label, tech, evidence[] (file, line), cost (tier, model), risks[] |
| Edge | from, to, kind (calls, reads, writes, deploys, depends, sends), evidence[] |
| Finding | id, rule, severity, title, node, file, line, fix |
| Meta | repo, commit, scannedAt, version, stats |

### Repo layout

| Path | Purpose |
|---|---|
| `src/detectors/` | One file per detector |
| `src/rules/` | Security and cost rules |
| `src/diff.ts` | Graph diff and PR markdown |
| `src/viewer/` | Self-contained HTML viewer |
| `action.yml` | GitHub Action |
| `examples/sumitra-like/` | Test fixture |

## Rollout, risks and open questions

### Rollout

1. **v0.1 (now):** CLI scanner, viewer, PR diff, security and cost rules, GitHub Action. Run on Sumitra.
2. **v0.2:** Tune detectors on Sumitra until precision is 95%. Add `.repomind.yml` examples for the team.
3. **v0.3:** Live GCP sync through Cloud Asset Inventory; flag drift between repo and cloud.
4. **v0.4:** Flows view (user action traced across services), hosted viewer per branch.
5. **v1.0:** Open-source release; Python and AWS detectors as plugins.

### Risks

| Risk | Mitigation |
|---|---|
| Wrong boxes erode trust | Evidence on every node; overrides file; rules before AI |
| Infra built in the console is invisible | v0.3 cloud sync; manual nodes until then |
| Noisy PR comments get ignored | One comment, updated in place; silent when nothing changed |
| Secret scanner leaks secrets | Store only rule name, file and line, never the value |
| Large monorepos are slow | File limits, ignore list, cache by file hash |

### Open questions

- [x] Final product name: **RepoMind** (see D1).
- [x] Should the viewer be hosted for the team or stay a CI artifact? **Both** (see D7).
- [ ] Which Sumitra infrastructure lives only in the GCP console and needs manual nodes?
- [ ] Open-source from day one, or after v0.3?

---

# v2 — RepoMind web app

## Summary

v2 turns RepoMind into a web app: paste a GitHub URL, get a hand-drawn map of the whole project in under a minute, download it, and connect the repo so the map redraws itself on every commit with a full version history.

### What changes from v1

- **Input:** a GitHub URL in a browser instead of a CLI in CI.
- **Look:** an Excalidraw-style sketch (wobbly lines, hachure fills, handwriting) instead of clean boxes. It reads like a whiteboard drawing, which lands better in presentations and onboarding.
- **Live:** a connected repo is re-scanned on every push (webhook) or every few minutes (polling fallback).
- **Versions:** every scanned commit is kept; a timeline lets you step through them and see what changed between any two.
- **Output:** download as PNG, SVG, a self-contained HTML map, or the graph JSON; share a link that always shows the latest commit.

Out of scope for v2: user accounts and billing, private repos without a token, editing the drawing by hand (v3 could export to Excalidraw).

## User flow

```
First visit:   paste URL ──► scanning (download → read files → detect → draw) ──► map ──► download / share
Live loop:     push to GitHub ──► webhook (or 5-min poll) ──► scan new commit ──► new version dot ──► open maps redraw
```

A snapshot needs no setup. Live updates need one click ("Connect") plus a webhook in the repo settings, or they fall back to polling.

## Visual style and colour palette

The map looks drawn by hand on paper: one ink colour for every outline and word, soft pastel fills that tell you the layer, and violet as the only brand colour.

### Style rules

- Shapes and arrows are drawn with rough.js: slightly wobbly strokes, hachure (diagonal hatch) fills, 2 px ink outlines.
- Words are handwritten: Kalam for labels, Caveat for big titles and notes, JetBrains Mono for file paths and commit ids.
- The canvas is warm paper with a faint dot grid. Lanes are dashed pencil boxes with a handwritten title.
- Colour only carries meaning: layer fill, risk, or change. Everything else is ink or pencil grey.
- Dark mode is "chalkboard": dark slate paper, chalk-white ink, the same fills at lower strength.

### Palette

| Token | Fill | Stroke | Used for |
|---|---|---|---|
| Paper | `#FDFBF7` | — | Canvas background |
| Paper 2 | `#F4F1EA` | `#D9D3C7` | Lanes, panels, cards in the UI |
| Ink | `#1E1E1E` | — | Outlines, labels, main text |
| Pencil | `#6B6B6B` | — | Secondary text, tech line under a label |
| Brand violet | `#6965DB` | `#5B57D1` | Buttons, links, selection, logo |
| Users · Sky | `#A5D8FF` | `#1971C2` | Mobile, web and desktop users |
| Apps · Lavender | `#D0BFFF` | `#6741D9` | Apps and services |
| Modules · Grape | `#EEBEFA` | `#9C36B5` | Feature modules |
| Data · Mint | `#B2F2BB` | `#2F9E44` | Databases, caches, queues |
| Cloud · Aqua | `#99E9F2` | `#0C8599` | GCP and hosting |
| External · Butter | `#FFEC99` | `#F08C00` | Third-party services |
| CI/CD · Peach | `#FFD8A8` | `#E8590C` | Pipelines |
| Risk · Coral | `#FFC9C9` | `#E03131` | Critical and high risks, removed items |
| Added | `#B2F2BB` | `#2F9E44` | New in this version |
| Changed | `#FFEC99` | `#F08C00` | Modified in this version |
| Chalkboard | `#1B1B1F` | `#E9E7E2` | Dark-mode paper and ink |

The fills and strokes follow Excalidraw's open colour scale, so a map exported later into Excalidraw keeps its colours.

## Live sync and versioning

Every commit on the tracked branch becomes a version: RepoMind scans it, stores its graph, and diffs it against the version before.

### How updates arrive

- **Webhook (preferred).** The repo owner adds a GitHub webhook for push events pointing at `/api/webhook/github`. The payload is checked with the shared secret (HMAC SHA-256); the new head commit is queued and scanned.
- **Polling (fallback).** For repos without a webhook, the server checks the branch head every 5 minutes through the GitHub API and scans any new commit.
- **Backfill.** On first connect, the last 10 commits are scanned so the timeline isn't empty on day one.

### Version timeline

- A strip along the bottom of the map: one dot per commit (short sha, message, author, time).
- Dots that changed the architecture are bigger and coloured; commits with no map change are small grey dots.
- Clicking a dot loads that version; the Changes view compares it with the one before. Two dots can be picked to compare any range.
- While you watch, a new commit adds a dot and shows a note: "New commit a1b2c3d — map updated, 1 component added."

### Storage

- One JSON graph per commit, stored by owner/repo/sha, plus an index of versions per repo.
- v2 stores on disk; a Postgres or Cloud Storage backend can replace it without changing the API.

### Limits

- Public repos work with no setup. Private repos need a GitHub token with read access, kept on the server only.
- Repos up to 20,000 files and 200 MB tarball; larger repos are refused with a clear message.

## Screens and requirements

| Screen | Job | Must have |
|---|---|---|
| Landing | Paste a URL and go | One big input ("github.com/owner/repo"), branch picker, optional token for private repos, recent maps, a sketched example map behind it |
| Scanning | Show progress | Steps ticked off in handwriting: download → read files → detect → draw; under 60 s for a Sumitra-size repo |
| Map | Understand the project | Sketch canvas with lanes; view tabs (Overview, Code, Infra, Integrations, Risks, Changes); side panel with details and evidence; search; present mode; live badge; version timeline at the bottom |
| Download & share | Take it somewhere | PNG (2×), SVG, HTML map, graph JSON; "always latest" share link; "Connect for live updates" with webhook URL and secret to copy |

### Requirements

- **R1.** Accept `https://github.com/owner/repo`, `github.com/owner/repo`, `owner/repo`, and URLs with `/tree/<branch>`.
- **R2.** Same commit gives the same drawing (fixed random seed per node), so screenshots don't jump between visits.
- **R3.** Toggle between Sketch and Clean styles; Sketch is the default.
- **R4.** Live badge shows "Live · updated 2 min ago" when connected, "Snapshot" otherwise.
- **R5.** A map page polls for new versions every 30 s and redraws without losing zoom or selection.
- **R6.** Downloads work offline: the HTML map embeds its data and the drawing library.

## Architecture, API and build plan

One Node server wraps the v1 scanner: it downloads a commit's tarball from GitHub, scans it, stores the graph per commit, and serves the sketch map.

### API

| Method | Path | Does |
|---|---|---|
| POST | `/api/maps` | `{url, branch?, token?, backfill?}` → starts a scan of the head commit (and backfill), returns `{job, owner, repo}` |
| GET | `/api/jobs/:id` | Scan progress: steps done, error, and `sha` when finished |
| GET | `/api/repos` | Recent maps for the landing page |
| GET | `/api/repos/:owner/:repo/versions` | List of scanned commits, newest first, with change counts |
| GET | `/api/repos/:owner/:repo/graph?sha=&base=` | Graph JSON for a commit (latest if no sha) plus diff vs the previous version (or vs `base`) |
| POST | `/api/repos/:owner/:repo/refresh` | Check GitHub now and scan a new head |
| POST | `/api/repos/:owner/:repo/connect` | Turn on live updates; returns the webhook URL and secret, starts backfill |
| POST | `/api/webhook/github` | GitHub push webhook, HMAC-verified |
| GET | `/r/:owner/:repo` | The live map page |
| GET | `/r/:owner/:repo/download.html?sha=` | Self-contained HTML map for one version |

### Build plan

1. Sketch renderer in the viewer: rough.js inlined, hand fonts, palette tokens, Sketch/Clean toggle.
2. Server: URL parsing, GitHub API client, tarball download and safe extraction, scan, file store.
3. Versions: index per repo, diff per version, backfill, polling loop, webhook.
4. Map page in live mode: timeline strip, live badge, polling, toast on new commit.
5. Landing page and download/share panel.
6. Test on public repos, then on Sumitra with a token.

---

# Decisions

A running log of choices made while building. Newest last.

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-10-30 | Product name is **RepoMind**. | Short, carries the "brain that understands your repo" idea, reads well in a PR bot ("RepoMind found 2 risks"). |
| D2 | 2026-10-30 | Repo lives at `github.com/yagnesh-pasam-07/repomind`, private, single `main` branch. | Owner's request; one branch until there is a team. |
| D3 | 2026-10-30 | The working v0.1 build (scanner, viewer, PR diff, security/cost rules, Action) is the base; the earlier empty scaffold was replaced. | v0.1 was already tested end to end on the example repo (10 checks pass). |
| D4 | 2026-10-30 | v0.1 has no runtime dependencies beyond `yaml`; the v2 server adds only `roughjs` (inlined into the HTML) and `tar` (safe extraction). Web server is plain `node:http`. | Keeps installs small and the CLI usable in CI without a framework. |
| D5 | 2026-10-30 | Graph schema is the v0.1 one (`src/types.ts`): layers `client, app, module, data, cloud, external, cicd` and extra edge kinds `uses, contains, runs-on, protects`. | Modules need their own lane, and "runs on" / "protects" are what make the infra view readable. Supersedes the shorter list in the v1 schema table. |
| D6 | 2026-10-30 | CLI commands are `scan`, `view`, `diff`, `map` (v1) and `serve` (v2). Output folder is `.repomind/`. | One command per job; `map` covers the common case. |
| D7 | 2026-10-30 | The viewer is **both** a CI artifact (v1, single HTML file) and hosted (v2 server, `/r/:owner/:repo`). | Same template serves both; live features switch on only when the server injects live settings. |
| D8 | 2026-10-30 | `POST /api/maps` returns a job id immediately; progress comes from `GET /api/jobs/:id`. Added `/api/repos`, `/connect` and `?base=` to the v2 API. | The Scanning screen needs real step-by-step progress; a single blocking call can't show it. |
| D9 | 2026-10-30 | Versions are stored on disk under `.repomind-data/<owner>/<repo>/` (`index.json` + `graphs/<sha>.json`). Tokens and webhook secrets are stored there only, never returned by read endpoints, and the files are written with mode 0600. | Matches "v2 stores on disk"; swap the store module for Postgres/GCS later. |
| D10 | 2026-10-30 | Tarball extraction refuses symlinks, absolute paths and `..`, and stops at 20,000 files or 200 MB. | Untrusted input from any public repo. |
| D11 | 2026-10-30 | Hand fonts (Kalam, Caveat, JetBrains Mono) load from Google Fonts with a system handwriting fallback; rough.js and the data are inlined. | R6 asks for data and drawing library offline; fonts degrade gracefully offline. |
| D12 | 2026-10-30 | Sketch seed per node = hash of the node id (and of the edge key for arrows). | R2: same commit, same drawing. |
| D13 | 2026-10-30 | A version's change count = added + removed + changed components + new risks vs the previous version on the timeline. | Decides whether the timeline dot is big/coloured or small/grey. |
| D14 | 2026-10-30 | Screens follow the **"RepoMind — v2 designs"** artifact (Landing, Scanning, Map, Changes, Share). Landing and Scanning are one page (`src/web/landing.html`); Map, Changes and Share live in the viewer (`src/viewer/parts/`). | One source of truth for the look; the viewer already had views and panels to extend. |
| D15 | 2026-10-30 | The Changes screen is the Changes view of the map, not a separate page: range chips (`base → head`), +added / −removed / new-risk cards, components, new risks, cost. Opened by `?base=<sha>`, by shift-clicking a second timeline dot, or by "See changes" in the toast. | Keeps zoom and selection; same data as the PR comment. |
| D16 | 2026-10-30 | The Share screen is a dialog opened by **Download** on the map. Secret is shown once on Connect, then masked. | Matches the design; secret never sits in page data (D9). |
| D17 | 2026-10-30 | Live map opens on **Overview** even though a diff vs the previous version exists; it opens on Changes only when `?base=` is set. | Every live version has a previous one, so defaulting to Changes would hide the map. |
| D18 | 2026-10-30 | Dark mode in Sketch style uses the layer fills at ~35% strength. | Full-strength hatching on dark paper made labels unreadable (seen in browser test). |
| D19 | 2026-10-30 | Repo names that are only dots (e.g. `..`) are rejected when parsing URLs. | Found by test: `..` passed the GitHub name pattern and could reach the store path. |
| D20 | 2026-10-30 | Landing page "Try" chips: vercel/commerce, expo/examples, calcom/cal.com. Example map on Landing is drawn live with rough.js instead of an image. | No image assets to ship; stays on-palette. |

### Verified (2026-10-30)

- `npm test`: 13 checks pass (10 v1 + 3 v2: URL forms, store/recount, viewer embedding).
- Mapped `expressjs/express` from its URL: scan ~1 s, 10 versions backfilled, map page with no console errors.
- Webhook: bad signature → 401; valid HMAC → accepted. Token/secret absent from all API responses; `index.json` is mode 0600.
- Browser: Landing, Scanning (→ redirect to map), Map (sketch, timeline, live badge), Changes (`?base=`), Share dialog, live toast on a new version all render as designed.
