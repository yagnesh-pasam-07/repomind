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
- [ ] The Weaver Bird brand brief (D34) calls the product **Repo Brain**. Keep RepoMind, or rename everywhere (repo, site, logo wordmark, CLI)?
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

## Brand story: the Weaver Bird

> Owner's brand brief, recorded as written (D34). It uses the name **Repo Brain**; the product ships as **RepoMind**. See Open questions.

### The inspiration

The Baya Weaver Bird is known for its remarkable ability to construct intricate hanging nests by weaving individual strands of grass and other natural materials.

What makes this bird fascinating is not simply the nest it creates, but the process behind it.

It explores its surroundings, gathers materials, repeatedly weaves individual strands and gradually constructs a complete structure.

Each strand has a place. Each connection contributes to the whole.

This is the philosophy behind Repo Brain.

### Brand personality

- **Curious:** Always exploring and discovering.
- **Intelligent:** Recognising relationships between seemingly unrelated things.
- **Precise:** Connecting components with care and accuracy.
- **Resourceful:** Making meaningful use of available information.
- **Persistent:** Building understanding incrementally.
- **Architectural:** Understanding how individual elements form a larger system.
- **Thoughtful:** Looking beyond individual components to understand the bigger picture.

### Brand philosophy

A software repository is more than a collection of files.

It is an interconnected ecosystem of functions, modules, dependencies, configurations and architectural decisions.

Understanding one file is not the same as understanding the system.

Repo Brain aims to connect these individual pieces and build a meaningful understanding of the entire codebase.

Just as the Weaver Bird turns individual strands into an intricate nest, Repo Brain turns scattered code into connected knowledge.

### Animation direction

Create a sophisticated, nature-inspired yet technology-oriented visual experience.

1. Start with a lone Weaver Bird exploring its environment.
2. Show it discovering and collecting individual strands.
3. Transition the strands into subtle code symbols, file references and interconnected nodes.
4. Show the bird weaving these strands together.
5. Gradually transform the woven structure into a visual representation of a software repository.
6. Reveal a complete, interconnected knowledge graph.
7. End with the Repo Brain logo.

### Visual personality

- Warm golden yellow inspired by the Baya Weaver.
- Deep charcoal and natural earthy tones.
- Fine woven lines and interconnected patterns.
- Organic motion combined with precise geometric transitions.
- Minimal, premium, sophisticated visual language.
- Avoid cartoonish mascots and generic AI brain imagery.

### Core message

**Weaving intelligence into code.**

Repo Brain doesn't just look at files. It connects the pieces, discovers relationships and helps developers understand the bigger picture.

## Visual style and colour palette

The map looks drawn by hand on paper: one ink colour for every outline and word, soft pastel fills that tell you the layer, and violet as the only brand colour.

### Style rules

- Shapes and arrows are drawn with rough.js: slightly wobbly strokes, hachure (diagonal hatch) fills, 2 px ink outlines.
- Words: Excalifont (Excalidraw's own font) for map labels, titles, the brand and buttons; IBM Plex Sans for small interface text; IBM Plex Mono for file paths and commit ids (see D23).
- The canvas is warm paper with a faint dot grid. Lanes are dashed pencil boxes with a handwritten title.
- Colour only carries meaning: layer fill, risk, or change. Everything else is ink or pencil grey.
- Dark mode is "Night": `#0F172A` canvas, `#0B1120` header, `#1E293B` panels, `#334155` borders, `#E2E8F0` text, indigo primary buttons, `#A5B4FC` links; layer fills at lower strength (see D26; replaces the GitHub-dark palette of D22).

### Palette

Brand: the **weaverbird** — a bird that weaves connections, as RepoMind weaves understanding across a codebase (D26). Indigo outline, honey breast, a woven wing, and a thread tying three nodes together in its beak.

Rules: **indigo is the brand** (logo, primary buttons, selection, the Apps layer). **Green means something** — only live, success and added, never decoration. **Coral asks for attention** — warnings, risks and changes between versions.

| Token | Fill | Stroke | Used for |
|---|---|---|---|
| Paper | `#F4F1EA` / canvas `#FDFBF7` | — | Background |
| Card | `#FBFAF7` | `#262626` | Panels, cards, header |
| Graphite | `#262626` | — | Main text, outlines |
| Indigo (brand) | `#6366F1` | `#4F46E5` | Logo, primary buttons, selection, current version |
| Honey | `#FBBF24` | — | Logo accent |
| Users · Stone | `#E7E5E4` | `#57534E` | Mobile, web and desktop users |
| Apps · Indigo | `#C7D2FE` | `#4F46E5` | Apps and services |
| Modules · Lilac | `#E0E7FF` | `#6366F1` | Feature modules |
| Data · Sky | `#BAE6FD` | `#0284C7` | Databases, caches, queues |
| Cloud · Cyan | `#A5F3FC` | `#0E7490` | GCP and hosting |
| External · Honey | `#FDE68A` | `#B45309` | Third-party services |
| CI/CD · Peach | `#FED7AA` | `#C2410C` | Pipelines |
| Live / success | `#A7F3D0` | `#34D399` (`#10B981` text-safe) | Live badge, added items |
| Warning / change | `#FFD6D6` | `#FF6B6B` | Changed items |
| Critical risk | `#FFD6D6` | `#E03131` | Critical/high risks, removed items |
| Night (dark) | `#0F172A` / panels `#1E293B` / header `#0B1120` | `#334155` | Dark mode; text `#E2E8F0`, links `#A5B4FC` |

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

| D21 | 2026-10-30 | Fonts are Excalidraw's own: **Excalifont** for all words and **Comic Shanns** for code, replacing Kalam, Caveat and JetBrains Mono. Loaded from the `@excalidraw/excalidraw@0.18.0` npm package on jsDelivr with a handwriting fallback; not bundled into the repo. Excalifont has one weight, so no bold. Shared in `src/web/theme.css`. | Owner asked for a more artistic, Excalidraw look. Excalifont's embedded notice reserves rights, so we link to Excalidraw's published copy instead of shipping it. |
| D22 | 2026-10-30 | Dark mode uses GitHub's dark palette (Primer): canvas `#0d1117`, panels `#161b22`, borders `#30363d`, text `#e6edf3`, green primary button, flat 1px borders. Sketch outlines become GitHub grey `#8b949e`. Landing page has its own toggle and shares the setting with the map. Replaces the "chalkboard" dark mode. | Owner asked for dark mode to feel like part of GitHub, not a separate product. |

| D23 | 2026-10-30 | Follow the updated v2 designs (Landing, LandingDark, Map, MapDark): Excalifont only for headings, brand, buttons, tabs and map labels; **IBM Plex Sans** for interface text and **IBM Plex Mono** for code (both OFL, Google Fonts). Thin 1.5px lines, 8px corners, soft shadow instead of hard ink offsets. Dark mode: `#010409` header, `#161B22` panels, GitHub green (`#238636`) as the brand and primary colour, current version dot green with a blue ring. Supersedes the Comic Shanns part of D21. | The design artifact and PRD were updated to this split; all-handwritten body text was hard to read at small sizes. |
| D24 | 2026-10-30 | Recent-map summaries count shared packages as apps and use singular/plural ("1 app · 1 risk"). | Found in the browser: a library repo (expressjs/express) showed "0 apps". |

| D25 | 2026-10-30 | *(Replaced by D26.)* Logo and favicon: a pink hand-drawn brain (`#FCC2D7` fill, `#A61E4D` lines) on a green tile (`#2F9E44`, GitHub `#238636` in dark). One SVG (`src/web/favicon.svg`) is the browser tab icon and the header logo on every page, embedded as a data URI so the offline HTML map keeps it. Replaces the violet "R" tile. | Owner asked for green and pink with a brain; "RepoMind" is the project's brain. |

| D26 | 2026-10-30 | Follow the updated design artifact (Brand · the weaverbird; Palette & type; all screens). Logo is the **weaverbird** (indigo outline, honey breast, woven wing, thread through three nodes), drawn as SVG in `src/web/logo.svg`; the favicon is a simplified bird on an indigo tile (`src/web/favicon.svg`). Palette moves to indigo brand + honey accent; green only for live/success/added; coral for warnings/changes. Dark mode becomes "Night" (`#0F172A`). Scanning copy is "Weaving your repo…". Replaces D25's brain and D22's GitHub-dark colours. | Owner asked to build to the artifact, which introduced the weaverbird brand. The artifact's bird images could not be read here, so the SVG follows its written description. |
| D27 | 2026-10-30 | Logo dark variant is generated at build time and swapped by the page's theme toggle. | An `<img>` SVG follows the OS dark setting, not RepoMind's own toggle. |

| D28 | 2026-10-30 | Built to the owner's `landing-light.png`, `landing-dark.png` and `logo-sheet.png` (kept in `docs/design/`). Interface font is **Inter** (IBM Plex Mono for code); Excalifont stays only inside the map drawing. The logo is the geometric weaverbird from the logo sheet, traced to SVG in `src/web/brand/` (mark, dark mark, mono mark, light/indigo/dark app icons); favicon is the indigo icon. Landing hero: "Your codebase, as a living map." with a live example map (`/example`) in a browser frame. Replaces D26's hand-drawn bird and D23's Plex Sans UI. | Owner supplied these PNGs as the design to use. |
| D29 | 2026-10-30 | Every screen in the design artifact is built: Flow 0 Sign in (`/login`), Flow 1 Website (`/`), Flow 2 Scanning (map weaves itself lane by lane with live counts), Flow 3 Live map (breadcrumb header), Flow 4 Compare versions (summary on the left), Flow 5 Download & connect, Workspace Overview + Sidebar (`/app`, data from `/api/overview`). Overview numbers are real: health = 100 minus open risks by severity; trends vs a week ago. | Owner asked to build all screens in the artifact. |
| D30 | 2026-10-30 | Sign-in has no accounts yet (PRD v2 non-goal): "Continue with GitHub" opens the workspace using the server's token; SSO and email links say they come with team accounts. Workspace name, plan, members, Slack digest and scan quota from the design are not shown, because nothing backs them yet. Server frameworks (Express, NestJS…) are detected only from runtime dependencies. | Don't show features that don't work. The dependency fix came from the browser test: `sindresorhus/ky` (an HTTP client) was labelled Express because it uses Express in tests. |

| D31 | 2026-10-30 | Open source like Pen & Paper: public repo, MIT, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CODEOWNERS`, issue and PR templates. Footer credits the maker (black-and-white photo, LinkedIn, email). README gets the logo, live demo link, badges, a screenshot gallery (`docs/screenshots/`) and a 1280×640 social preview (`docs/social-preview.png`). | Owner asked to open-source it like penandpaper, add screenshots, logo and a maker credit. |
| D32 | 2026-10-30 | Vercel hosts a **static showcase** at [repomind-pi.vercel.app](https://repomind-pi.vercel.app): website, sign-in and the example map (`scripts/build-static.mjs` → `public/`). "Map it" there explains how to self-host instead of scanning. The full app (`repomind serve`) is not on Vercel. | The scanner keeps per-commit graphs on disk and polls every 5 minutes; Vercel functions have no persistent disk or long-running process. Self-hosting also keeps the promise that code never leaves your server. |

| D33 | 2026-10-30 | The landing hero has a small flock of flying weaverbirds, each trailing a dotted thread like a link on the map. Birds fly only above the headline or in the side margins (checked: 0 overlaps with the text over 40 samples); they hold still for people who set reduced motion. | Owner asked for flying-bird detail in the hero. The trail ties the bird to the product: it weaves links. |
| D34 | 2026-10-30 | The Weaver Bird brand story (inspiration, personality, philosophy, animation direction, visual personality, core message "Weaving intelligence into code.") is recorded in this PRD as written. Not yet built: the 7-step story animation and the golden-yellow/charcoal palette it describes, which differs from the shipped indigo brand (D26–D28). | Owner supplied the brief. The name and palette differences are open questions, not silent changes. |

| D35 | 2026-10-30 | The full app runs on Vercel with **Neon Postgres** (project `repomind`, `aws-ap-southeast-1`, same region as the owner's other projects). One store interface, two backends: `DiskStore` for `repomind serve` without a database, `NeonStore` when `DATABASE_URL` is set. Tables `rm_repos`, `rm_graphs`, `rm_jobs` are created on first use. Scan jobs are stored too, so any function instance can report progress; background scans run via `waitUntil` (max 300 s), with backfill cut to 5 commits on Vercel. `DATABASE_URL` and `CRON_SECRET` live only in Vercel's encrypted env and a git-ignored `.env.local`. Replaces D32's static-only showcase. | Owner asked for the DB in Neon. Vercel functions have no disk and stop after the response, so state must live in Postgres. |
| D36 | 2026-10-30 | Polling cron runs **daily** (`0 6 * * *`), not every 5 minutes; the GitHub webhook gives instant updates and open map pages still poll every 30 s. | The Vercel account is on the Hobby plan, which only allows daily cron jobs. |
| D37 | 2026-10-30 | Backfill starts *after* the head scan's queued task, not inside it. | Bug found on Vercel: awaiting backfill inside the per-repo queue waited on itself, so history never filled. Verified fixed: `sindresorhus/ky` got 5 versions in Neon. |

| D38 | 2026-10-30 | Hero birds redrawn as a **flying** weaverbird: side view, streamlined body, two wings (near coral, far deep indigo) that beat up and down, body rising on each downstroke, and the dotted thread leaving from the beak — the weaver carrying a strand. Replaces D33's sliding logo bird with a detached trail. | Owner: "bird should fly"; the sitting logo pose didn't read as flight. |

| D39 | 2026-10-30 | The landing preview shows the full product again, map **plus** the side panel (at a glance, open risks, paid services), sized to fit the frame; the workspace card's small preview still shows the map only. The flock flies across the **whole screen** in a fixed layer behind the content, instead of being clipped to the hero. | Owner: images missing in prod (the panel from the landing screenshot was hidden), and "keep the bird animation full screen" (a bird was cut off at the hero's edge). |

| D40 | 2026-10-30 | Birds appear **only on the home page's first screen**: the flock covers the top 100vh at full width, flies left to right edge to edge, and scrolls away with the hero. No birds on the rest of the page or on any other page. Replaces D39's fixed layer that followed the visitor down. | Owner: "don't include the birds in the whole website… only the home page… fly left to right full screen". |

| D41 | 2026-10-30 | A bird flies through the **nav bar** on its own lane, held inside the 68 px header. | Owner screenshot: "bird should fly in the nav bar". Found and fixed: it first flew above the screen (top −46 px) because its rise and wing-lift pushed it out. |
| D42 | 2026-10-30 | The home screen gets a **tree with Baya weaver nests**, from the Weaver Bird brand story (D34). Iterated with the owner through several versions: outline tree → single teardrop nest → cluster → filled → one-line "Picasso" nest. | Owner: "add a tree and a weave nest… white… minimal… shouldn't capture attention… make it better… think like Picasso". |
| D43 | 2026-10-30 | Final form: a **big, soft ink-brush tree** (tapered strokes, 180 leaves, a few honey and coral accents) at low opacity on the right of the hero, and **three small nests** hanging from branches near the trunk. Each nest follows the owner's reference photos: thin woven neck, pear-shaped chamber, long entrance tube dropping from one side, rough woven-grass texture, gentle sway. A tiny weaverbird clings to one nest. Hidden under 1100 px and during scanning; still under reduced motion. | Owner: "add a big tree… nest looking big… small nest… 2 nests… add another nest… place the nest near the tree", with photos of real Baya nests. |
| D44 | 2026-10-30 | Nest position and nest sway live on separate SVG groups. | Bug found in the browser: the sway animation's `transform` overrode each nest's `translate()`, so all three nests stacked off-screen at the top-left. |

| D45 | 2026-10-30 | The tree and nests (D42–D44) are **removed**; the home hero is plain again, with only the flying weaverbirds (nav-bar bird + first-screen flock). | Owner: "remove the whole tree… keep it plain". |

### Verified (2026-10-30)

- `npm test`: 13 checks pass (10 v1 + 3 v2: URL forms, store/recount, viewer embedding).
- Mapped `expressjs/express` from its URL: scan ~1 s, 10 versions backfilled, map page with no console errors.
- Webhook: bad signature → 401; valid HMAC → accepted. Token/secret absent from all API responses; `index.json` is mode 0600.
- Browser: Landing, Scanning (→ redirect to map), Map (sketch, timeline, live badge), Changes (`?base=`), Share dialog, live toast on a new version all render as designed.
- D35–D37 (Vercel + Neon, live at repomind-pi.vercel.app): every route returns 200; a real scan of `expressjs/express` ran on Vercel, its job progress was read back from Neon by a separate request, the map and Overview render from Neon, and the webhook secret never appears in API output. Backfill gave `sindresorhus/ky` 5 versions. The Neon store contract test could not run from the build machine (its network blocks Neon's HTTPS endpoint), so the database was verified on Vercel instead.
- D28–D30: every route (`/`, `/login`, `/app`, `/example`, `/r/:owner/:repo`, `?embed=1`, `/api/overview`) returns 200; Landing, Sign in, Scanning, Map (light + Night), Overview (light + Night) checked in Chrome with no console errors. Live scan of `vercel/commerce` with 10-commit backfill feeds the Overview. 14 tests pass.
- D26–D27: served Landing and Map carry the weaverbird logo (light + dark variants), favicon, indigo palette and "Weaving" copy, with no brain or GitHub-dark colours left; logo SVGs rendered and checked in light and dark. Chrome was disconnected, so the screens themselves were not re-checked in a browser.
- Browser (D21–D24): Excalifont, IBM Plex Sans and IBM Plex Mono load; Landing, Scanning and Map checked in light and GitHub dark against the Landing/LandingDark/Map/MapDark designs, no console errors.
