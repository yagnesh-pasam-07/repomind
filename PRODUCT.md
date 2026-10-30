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

- [ ] Final product name (RepoMind is the working name).
- [ ] Should the viewer be hosted for the team or stay a CI artifact?
- [ ] Which Sumitra infrastructure lives only in the GCP console and needs manual nodes?
- [ ] Open-source from day one, or after v0.3?
