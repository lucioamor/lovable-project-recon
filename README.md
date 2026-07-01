# Recon — `@nxlv-ai/lovable-recon`

**Runtime-waste recon + cleanup for Lovable Cloud portfolios.** Recon scans a Lovable
project (or a whole portfolio) for _runtime without intention_ — orphan crons, logs with
no retention, uncapped AI, idle-but-burning projects, cost-surface RLS — scores the waste,
and proposes a review-gated cleanup.

Sibling of [`lovable-audit`](https://github.com/lucioamor/lovable-portfolio-audit) (security),
built on a shared `@nxlv-ai/lovable-core`. Both consume the same evidence model; recon carries
the **cost** profile (POL-1..9 from the remediation backlog).

> **Repo note.** This tree currently lives inside the Register working folder only because
> that is the visible directory. It is a **separate product** and should be extracted to
> `nxlv-ai/lovable-recon`. It is not part of Register (see `../LOVABLE_CLEANUP_ARCHITECTURE.md`).

---

## Quickstart (zero-install demo)

Requires **Node ≥ 22.6** (native TypeScript type-stripping). No `npm install` needed for the demo:

```bash
cd lovable-recon
node packages/recon/src/cli.ts scan --mode demo --out ./central-genial_USAGE_REPORT.md
```

This reproduces a real audit (central-genial) end-to-end: collect → detect → score → report.
Open the generated `central-genial_USAGE_REPORT.md`.

## Scan a real project (`db` mode, read-only)

```bash
npm install                     # installs pg + dev types
export SUPABASE_DB_URL=postgresql://readonly:...@db.<ref>.supabase.co:5432/postgres
node packages/recon/src/cli.ts scan --mode db --project my-app --out ./my-app_USAGE_REPORT.md
```

`db` mode runs the audit query library inside a `READ ONLY` transaction with a statement
timeout. It never writes. Queries that need HQ-only schemas (`cron.*`) degrade to warnings.

## Modes

| Mode        | Source                                   | Status (M0) |
|-------------|------------------------------------------|-------------|
| `demo`      | bundled central-genial fixture           | ✅ full |
| `db`        | read-only Supabase/Postgres connection   | ✅ core signals |
| `static`    | local repo (`supabase/`, source `rg`)    | 🚧 stub |
| `portfolio` | authorized token / extension, many projects | 🚧 stub |

## Architecture

```
packages/core           @nxlv-ai/lovable-core   evidence model · engine · score · report · query library · collectors
packages/profile-cost   @nxlv-ai/lovable-profile-cost   POL-1..9 as rules
packages/recon          @nxlv-ai/lovable-recon   CLI: `recon scan` → (later) `recon clean`
```

Pipeline: `collect → detect → score → evaluate → report` (read-only). The `clean` verb
(remediation apply) is a later milestone and is **review-gated** by design.

## What recon is honest about

The corpus shows ~87% of Lovable credit burn is Build-mode editor + flat Cloud baseline;
runtime anti-patterns are usually small _per project_. So recon does not promise miracle
savings — it finds **spikes, orphan crons, and the idle-project baseline**, and gives
portfolio-level consolidation advice. That is where the surprise actually lives.

## License

UNLICENSED · © nxlv.ai
