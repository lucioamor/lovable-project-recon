# NEXT LEVEL Lovable Project Recon

> The runtime-waste, cost-audit, and cleanup-planning CLI for Lovable Cloud projects - by [**Lucio Amorim**](https://linkedin.com/in/lucioamorim), **Lovable Ambassador**.

Lovable Project Recon scans a Lovable project, a Supabase-backed app, or a whole Lovable portfolio for **runtime waste**: background jobs, logs, polling, AI calls, open RLS surfaces, idle projects, and other patterns that can keep consuming compute or credits after the app is already built.

Run it against your own evidence. Get a plain-English report. Review the suggested cleanup plan before anything changes.

Built and maintained by [**Lucio Amorim**](https://linkedin.com/in/lucioamorim) - Lovable Ambassador - the same builder behind [Lovable Portfolio Audit](https://github.com/lucioamor/lovable-portfolio-audit), [Lovable Skills](https://github.com/lucioamor/lovable-skills), [Lovable Register](https://github.com/lucioamor/lovable-register), and the broader NXLV toolkit for builders who want to ship fast without losing control of cost, security, and operational hygiene.

[![Author: Lucio Amorim](https://img.shields.io/badge/By-Lucio%20Amorim-6c63ff?style=flat-square)](https://linkedin.com/in/lucioamorim) [![Role: Lovable Ambassador](https://img.shields.io/badge/Lovable-Ambassador-8b5cf6?style=flat-square)](https://linkedin.com/in/lucioamorim) [![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-2ed573?style=flat-square)](./LICENSE)

## Start here

If you are searching for any of these, this is the tool:

- "Why is my Lovable Cloud project still burning credits?"
- "Which Lovable projects are idle but still running cron jobs?"
- "Can I audit Lovable runtime costs before I clean anything up?"
- "How do I find orphan Supabase cron jobs, noisy logs, and uncapped AI usage?"
- "Which project in my Lovable portfolio should I optimize first?"
- "Can I get a read-only report before touching production?"
- "Is my Lovable app wasting runtime through polling, Realtime, RLS, or background tasks?"

In plain terms: **Recon looks for work your app keeps doing when no human clearly asked for it.** It turns that into a waste score, evidence, and review-gated cleanup recommendations.

## Terms up front

| Term | For dummies |
|---|---|
| **Runtime waste** | Work that keeps running in the background even when the app is idle, abandoned, or already finished. |
| **Lovable Cloud cost audit** | A practical check of what might be consuming Cloud/runtime resources in Lovable-built projects. |
| **Cron job** | A scheduled task. Useful when intentional; expensive or risky when forgotten. |
| **RLS** | Row Level Security in Supabase. Bad RLS can be a security issue and a cost issue because broad reads/writes can amplify load. |
| **AI cost governance** | Budget caps, model IDs, and logs that keep AI calls from becoming invisible spend. |
| **Evidence** | Facts Recon can inspect: database metadata, source files, usage reports, or exported project JSON. |
| **Waste score** | A 0-100 score that ranks runtime waste and cleanup priority. It is a triage signal, not a billing invoice. |
| **Dry-run cleanup** | A proposed cleanup plan that does not apply changes automatically. You review first. |

## Why this exists

Lovable makes it easy to ship real software quickly. The next problem is operational: once you have many projects, you need to know which ones are still doing background work, which ones have grown noisy tables, which ones are polling too often, and which ones are quietly missing AI cost controls.

Recon is for the builder who has moved from "can I build this?" to "can I operate this responsibly?"

It does not promise miracle savings. In real Lovable portfolios, the biggest burn may come from Build-mode/editor activity or platform baseline costs, not always from runtime code. Recon is honest about that. It finds the runtime patterns it can prove, ranks projects by likely cleanup value, and keeps cleanup behind review.

## What it detects

| Policy | What Recon checks | Why it matters |
|---|---|---|
| **POL-1 Scheduled-job hygiene** | Perpetual or suspicious cron jobs, frequent schedules, jobs that keep running on idle projects. | Forgotten scheduled work can keep invoking functions, writing logs, and burning runtime. |
| **POL-2 Log and raw-payload retention** | Append-only logs, raw payload tables, cron history, and tables with no retention signal. | Logs are useful until they become unbounded storage and query cost. |
| **POL-3 Client and Realtime fetch defaults** | `staleTime:0`, hover preloads, background polling, `onAuthStateChange` work. | Open tabs and background refetches can multiply traffic without new user intent. |
| **POL-4 AI cost governance** | Missing AI spend ceilings, broken or unpinned model IDs, AI configs without guardrails. | AI spend needs hard caps and traceability. |
| **POL-5 RLS and tenancy baseline** | Broad `USING (true)` policies, anonymous write surfaces, open table access patterns. | RLS mistakes can be both data exposure and cost amplification. |
| **POL-6 Secrets and auth surface** | Credential-shaped values in cron commands or source evidence, without storing secret values. | Secrets in runtime configuration create rotation and blast-radius problems. |
| **POL-7 Write amplification** | Trigger fan-out and repeated updates that multiply writes. | One user action should not create a hidden storm of database writes. |
| **POL-8 Cost observability** | AI usage without a ledger or attribution table. | If you cannot attribute spend, you cannot manage it. |
| **POL-9 Idle-project lifecycle** | Projects idle for weeks while cron, Realtime, or other runtime work keeps running. | "No user activity" is not the same thing as "not billing." |

## What you get

| Output | What it means |
|---|---|
| **Project report** | Markdown report with findings, evidence, rationale, and suggested next actions. |
| **Portfolio report** | Ranking across multiple Lovable projects by waste score, estimated savings, confidence, and effort. |
| **Evidence corpus** | Offline `ProjectEvidence` JSON files that can be reviewed, versioned, and rescanned. |
| **Clean plan** | A dry-run remediation plan based only on confirmed findings. |
| **Review gate** | Current real remediations are review-required. Recon refuses broad portfolio cleanup and does not treat hypotheses as executable actions. |

## Quickstart

Requires **Node >= 22.6** for the zero-install source demo. The packaged CLI targets Node >= 20 after build.

```bash
git clone https://github.com/lucioamor/lovable-project-recon.git
cd lovable-project-recon
node packages/recon/src/cli.ts scan --mode demo --out ./central-genial_USAGE_REPORT.md
```

This reproduces a real Lovable project audit from bundled evidence: `collect -> detect -> score -> report`.

Open the generated `central-genial_USAGE_REPORT.md`.

## Packaged CLI

For local development:

```bash
npm install
npm run build
node packages/recon/dist/cli.js scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor
```

After npm publication, the package is configured to expose `recon` from `@nxlv-ai/lovable-recon`:

```bash
npx @nxlv-ai/lovable-recon scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor
```

CI callers can fail a job when findings meet a severity threshold:

```bash
recon scan --mode evidence --evidence corpus/central-genial.evidence.json --fail-on high
```

You can attach deterministic project intent without invoking AI judgment:

```bash
recon scan --mode demo --intent ./ROADMAP.md
```

## Scan a real project

### Read-only database mode

```bash
npm install
export SUPABASE_DB_URL=postgresql://readonly:...@db.<ref>.supabase.co:5432/postgres
node packages/recon/src/cli.ts scan --mode db --project my-app --out ./my-app_USAGE_REPORT.md
```

`db` mode runs the audit query library inside a `READ ONLY` transaction with a statement timeout. It never writes. Queries that need restricted Supabase schemas such as `cron.*` degrade to warnings when unavailable.

### Static repo mode

```bash
node packages/recon/src/cli.ts scan --mode static --repo ./my-lovable-app --out ./my-app_STATIC_REPORT.md
```

`static` mode reads `supabase/config.toml`, SQL migrations, and source files. It never runs the app. It feeds client-amplification, RLS, AI model, and credential-shape evidence into the same rule engine.

### Project index mode

Single project:

```bash
node packages/recon/src/cli.ts scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor --out ./opportunity-monitor_INDEX_REPORT.md
```

Whole portfolio:

```bash
node packages/recon/src/cli.ts scan --mode index --index usage-reports/lovable_projects_index.json --out ./PORTFOLIO_REPORT.md
```

Imported audit actions from the index are shown in a separate report section and are not counted in the waste score.

### Evidence mode

```bash
node packages/recon/src/cli.ts scan --mode evidence --evidence corpus/central-genial.evidence.json --out ./central-genial_EVIDENCE_REPORT.md
```

Use evidence mode when you have a reviewed `ProjectEvidence` JSON file. Evidence is the preferred boundary for browser exporters, future Lovable usage APIs, and offline portfolio review.

## Clean plans

```bash
recon clean --mode demo
recon clean --mode evidence --evidence corpus/central-genial.evidence.json --json
```

`recon clean` is dry-run by default. It builds an auditable plan from confirmed findings only.

Important cleanup rules:

- Hypotheses are skipped.
- Imported audit actions are context, not executable input.
- Review-required remediations are listed but not applied.
- Corpus and portfolio fan-out are intentionally refused for cleanup.
- `--apply` is gated by `RemediationAction.applySafe`; current real remediations remain review-required.

## Modes

| Mode | Source | Status |
|---|---|---|
| `demo` | Bundled `central-genial` fixture | Full |
| `db` | Read-only Supabase/Postgres connection | Core runtime signals |
| `static` | Local repo: `supabase/`, migrations, and source scan | Source signals |
| `index` | `usage-reports/lovable_projects_index.json` | Single project and portfolio |
| `evidence` | One `ProjectEvidence` JSON file | Rich offline evidence |
| `corpus` | Directory of `*.evidence.json` files | Evidence portfolio report |
| `portfolio` | Directory of `*.evidence.json` files | Alias for evidence fan-out |

## Architecture

```text
packages/core           @nxlv-ai/lovable-core           evidence model, engine, score, report, query library, collectors
packages/profile-cost   @nxlv-ai/lovable-profile-cost   POL-1..9 cost/runtime policy profile
packages/benchmarks     @nxlv-ai/lovable-benchmarks     portfolio ranking, percentiles, cross-project reports
packages/recon          @nxlv-ai/lovable-recon          CLI: recon scan + dry-run recon clean
```

Pipeline:

```text
collect -> detect -> score -> evaluate -> report
```

The browser extension contract, when implemented, is deliberately evidence-only: export `ProjectEvidence` from the browser, then run Recon locally. It must not replay browser tokens, proxy credentials, or run cleanup from the browser. See [`docs/EXTENSION_CONTRACT.md`](./docs/EXTENSION_CONTRACT.md).

## Relationship to Lovable Portfolio Audit

Recon and [Lovable Portfolio Audit](https://github.com/lucioamor/lovable-portfolio-audit) are sibling tools:

- **Lovable Portfolio Audit** asks: "Is my Lovable project exposing secrets, PII, broken RLS, source maps, or access-control gaps?"
- **Lovable Project Recon** asks: "Is my Lovable project wasting runtime, credits, AI spend, logs, cron invocations, or background compute?"

Use both when you are preparing a Lovable app for serious use. Audit hardens the security posture. Recon hardens the cost and operations posture. Both are maintained by [Lucio Amorim](https://linkedin.com/in/lucioamorim), Lovable Ambassador, and both are part of the same practical NXLV toolchain for Lovable builders.

## Helpful browser extensions for Lovable builders

Recon is a CLI, not a browser extension. Still, if you build heavily in Lovable, these two Chrome extensions pair well with the workflow:

- [**Lovable Chat Exporter**](https://chromewebstore.google.com/detail/lovable-chat-exporter/chlmjjkedmpcalhamnndjoaocciipkea) exports Lovable project chat history as Markdown, HTML, or JSON. This is useful for keeping project context, handoff notes, and audit trails outside the Lovable UI.
- [**Yappable for Lovable**](https://chromewebstore.google.com/detail/yappable-for-lovable-voic/iabgldjgbafikinnomfaepmegeacpcab) adds a voice mode that reads Lovable responses aloud, summarizes what changed, and calls out what to double-check next.

They are not required to run Recon. They are simply useful quality-of-life tools for builders who spend a lot of time in Lovable.

## Principles

1. **Read-only first** - scans collect facts before proposing action.
2. **Evidence over vibes** - reports distinguish confirmed findings, imported actions, and hypotheses.
3. **No secret values** - credential-shaped evidence is stored as shape metadata, never raw secrets.
4. **Review before cleanup** - cleanup plans are auditable and gated.
5. **Portfolio-aware** - the tool ranks across projects because the best next action is often not in the loudest project.
6. **Honest about savings** - Recon estimates runtime waste; it does not pretend to replace Lovable billing data.

## Scope

This tool is for auditing projects you own or are authorized to operate. It is not designed for inspecting other people's Lovable projects, bypassing permissions, or applying cleanup without review.

Recon does not currently call Lovable's private APIs directly. It consumes local evidence, read-only database metadata, source files, structured index files, or reviewed `ProjectEvidence` JSON.

## Authorship and maintenance

This project was created by [Lucio Amorim](https://linkedin.com/in/lucioamorim), Lovable Ambassador.

When reusing, redistributing, or citing this work, keep the attribution credits and include a link to this repository.

## License

Licensed under [**Apache 2.0**](./LICENSE).

In plain terms: **use it freely** - including commercially - but if you reproduce it, redistribute it, or fold any part of it into a product of your own, you **must credit [Lucio Amorim](https://linkedin.com/in/lucioamorim) as a contributor**, link back to his LinkedIn, and link to the license.

Suggested attribution line:

> Includes work by Lucio Amorim (Lovable Ambassador) - https://linkedin.com/in/lucioamorim - licensed under Apache 2.0.
