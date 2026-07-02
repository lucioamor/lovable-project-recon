# Recon - `@nxlv-ai/lovable-recon`

**Runtime-waste recon + cleanup for Lovable Cloud portfolios.** Recon scans a Lovable project
(or a whole portfolio) for _runtime without intention_: orphan crons, logs with no retention,
uncapped AI, idle-but-burning projects, and cost-surface RLS. It scores the waste and proposes
review-gated cleanup.

Sibling of [`lovable-audit`](https://github.com/lucioamor/lovable-portfolio-audit) (security),
built on a shared `@nxlv-ai/lovable-core`. Both consume the same evidence model; recon carries
the cost profile (POL-1..9 from the remediation backlog).

> **Repo note.** This tree currently lives inside the Register working folder only because that is
> the visible directory. It is a separate product and should be extracted to
> `nxlv-ai/lovable-recon`. It is not part of Register.

---

## Quickstart (zero-install demo)

Requires **Node >= 22.6** (native TypeScript type-stripping). No `npm install` needed for the demo:

```bash
cd lovable-recon
node packages/recon/src/cli.ts scan --mode demo --out ./central-genial_USAGE_REPORT.md
```

This reproduces a real audit (central-genial) end-to-end: collect -> detect -> score -> report.
Open the generated `central-genial_USAGE_REPORT.md`.

## Packaged CLI

For local development:

```bash
npm install
npm run build
node packages/recon/dist/cli.js scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor
```

The published package exposes `bin.recon` from `dist/cli.js`, so consumers do not need Node's
TypeScript loader:

```bash
npx @nxlv-ai/lovable-recon scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor
```

CI callers can fail a job when findings meet a severity threshold:

```bash
recon scan --mode evidence --evidence corpus/central-genial.evidence.json --fail-on high
```

You can attach deterministic project context without invoking any AI judgment:

```bash
recon scan --mode demo --intent ./ROADMAP.md
```

## Scan a real project (`db` mode, read-only)

```bash
npm install
export SUPABASE_DB_URL=postgresql://readonly:...@db.<ref>.supabase.co:5432/postgres
node packages/recon/src/cli.ts scan --mode db --project my-app --out ./my-app_USAGE_REPORT.md
```

`db` mode runs the audit query library inside a `READ ONLY` transaction with a statement timeout.
It never writes. Queries that need HQ-only schemas (`cron.*`) degrade to warnings.

## Scan a checked-out repo (`static` mode)

```bash
node packages/recon/src/cli.ts scan --mode static --repo ./my-lovable-app --out ./my-app_STATIC_REPORT.md
```

`static` mode reads `supabase/config.toml`, SQL migrations, and source files. It never runs the
app. It feeds client-amplification, RLS, AI model, and credential-shape evidence into the same
rule engine.

## Scan the structured project index (`index` mode)

Single project:

```bash
node packages/recon/src/cli.ts scan --mode index --index usage-reports/lovable_projects_index.json --project opportunity-monitor --out ./opportunity-monitor_INDEX_REPORT.md
```

Whole portfolio:

```bash
node packages/recon/src/cli.ts scan --mode index --index usage-reports/lovable_projects_index.json --out ./PORTFOLIO_REPORT.md
```

Imported audit actions from the index are shown in a separate report section and are not counted
in the waste-score.

## Modes

| Mode | Source | Status |
|---|---|---|
| `demo` | bundled central-genial fixture | full |
| `db` | read-only Supabase/Postgres connection | core runtime signals |
| `static` | local repo (`supabase/`, source scan) | source signals |
| `index` | `usage-reports/lovable_projects_index.json` | single project + portfolio |
| `portfolio` | authorized token / extension, many projects | stub |

## Architecture

```text
packages/core           @nxlv-ai/lovable-core           evidence model, engine, score, report, query library, collectors
packages/profile-cost   @nxlv-ai/lovable-profile-cost   POL-1..9 as rules
packages/benchmarks     @nxlv-ai/lovable-benchmarks     portfolio ranking, percentiles, cross-project report
packages/recon          @nxlv-ai/lovable-recon          CLI: recon scan -> later recon clean
```

Pipeline: `collect -> detect -> score -> evaluate -> report` (read-only). The `clean` verb
(remediation apply) is a later milestone and is review-gated by design.

## What recon is honest about

The corpus shows most Lovable credit burn is Build-mode editor + flat Cloud baseline; runtime
anti-patterns are usually small per project. Recon does not promise miracle savings. It finds
spikes, orphan crons, and the idle-project baseline, then gives portfolio-level consolidation
advice.

## Authorship and maintenance

This project was created by [Lucio Amorim](https://linkedin.com/in/lucioamorim), Lovable Ambassador.

When reusing, redistributing, or citing this work, keep the attribution credits and include a link
to this repository.

## License

UNLICENSED - (c) nxlv.ai
