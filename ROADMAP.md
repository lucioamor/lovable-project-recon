# Recon Roadmap

_Cost/runtime/waste recon + cleanup for Lovable Cloud portfolios. Sibling of `lovable-audit`._

**Last updated:** 2026-07-02  
**Working state:** Plano V2 implemented through F6 contract-first plus safe clean planning.

## Current Product Surface

- `recon scan --mode demo` runs from bundled `ProjectEvidence`.
- `recon scan --mode db` reads Supabase/Postgres in read-only mode.
- `recon scan --mode static --repo <path>` scans source and Supabase files without running the app.
- `recon scan --mode index --index usage-reports/lovable_projects_index.json [--project <id>]` scans one project or the full structured index portfolio.
- `recon scan --mode evidence --evidence corpus/<id>.evidence.json` ingests canonical offline evidence.
- `recon scan --mode corpus|portfolio --dir corpus` runs the evidence portfolio runner.
- `recon clean` builds a dry-run cleanup plan from confirmed findings only. `--apply` is refused unless a remediation is `applySafe`; current remediations are review-required.

## Implemented

| Area | Status | Evidence |
|---|---|---|
| Core pipeline | Done | `runRecon`, rule engine, score, Markdown report |
| F0 existing signals | Done | DB maps host/status/table stats/idle signals; POL-6 consumes static secret shapes; POL-7/POL-8 have real first-pass rules |
| F1 index mode | Done | `collectIndex`, imported actions section, evidence date stamping |
| F2 benchmarks/portfolio | Done | `@nxlv-ai/lovable-benchmarks`, `runIndexPortfolio`, `runEvidencePortfolio`, `PORTFOLIO_REPORT.md` |
| F3 evidence corpus | Partial/content-complete seed | `ProjectEvidence` schema/validator, `collectEvidence`, 19 corpus JSON files, `corpus:seed` |
| F4 npx packaging | Done | `dist` builds, package `exports/files/bin`, packaged CLI e2e, release-please/OIDC workflow |
| F5 rule depth/evaluate interface | Done for deterministic interface | POL-7/POL-8 first-pass logic, `--intent <file>` attached to results |
| F6 extension contract | Done contract-first | `docs/EXTENSION_CONTRACT.md`; extension remains a future JSON exporter, not a bridge |
| Clean planning/apply contract | Done safe-gated | `recon clean` dry-run/gated plan plus `applyCleanPlan` executor/verify contract; current real remediations remain review-required (`applySafe: false`) |

## Remaining Work

- Enrich seed corpus files by hand against the heterogeneous usage reports where more detail is needed. The current corpus is index-derived except the central-genial hand-reviewed fixture.
- Add structured, policy-specific clean executors only after a remediation is proven safe enough to mark `applySafe: true`; the core apply/verify contract is already in place.
- Add rollback/incident notes for future mutating executors where applicable.
- Build the browser extension exporter only if external demand appears; it should emit `ProjectEvidence` and never replay browser tokens to the CLI.
- Optional future work: `profile-security` on the same core, SaaS/cockpit surface, official Lovable usage API producer if available.

## Verification

Primary gate:

```bash
npm run ci
```

Current expected gate includes build, typecheck, lint, format check, packaged CLI e2e, corpus/evidence tests, clean-plan tests, and portfolio runner tests.
