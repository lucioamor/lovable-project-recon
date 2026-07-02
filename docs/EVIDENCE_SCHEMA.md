# ProjectEvidence Schema

`ProjectEvidence` is the canonical offline evidence contract for Recon.

It is intentionally close to the normalized core model: producers collect facts, store them as
resources and observations, and Recon rules decide findings and score. Imported audit actions are
kept as context and are not scored.

## Version

Current schema version: `1`.

Every file must be named `<project-id>.evidence.json` when stored in `corpus/`.

## Shape

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "central-genial",
    "name": "central-genial",
    "supabaseRef": "ezdckbupdqjrfmoetbjc",
    "stack": "Vite + React + Shadcn",
    "evidenceGenerated": "2026-06-30",
    "evidenceSource": "central-genial_USAGE_REPORT.md"
  },
  "resources": [
    {
      "id": "project",
      "kind": "project",
      "name": "central-genial",
      "attrs": {
        "idleDays": 101,
        "tables": 27,
        "edgeFns": 25
      }
    }
  ],
  "observations": [
    {
      "resourceId": "project",
      "metric": "last_activity_days",
      "value": 101,
      "measuredAt": "2026-06-30T00:00:00.000Z"
    }
  ],
  "importedActions": [
    {
      "rank": 1,
      "policy": "POL-1",
      "severity": "High",
      "status": "Confirmed",
      "effort": "XS",
      "action": "cron.unschedule('poll-telegram-updates')"
    }
  ],
  "raw": {
    "sourceReport": "central-genial_USAGE_REPORT.md"
  },
  "warnings": []
}
```

## Rules

- `schemaVersion` is required and must be `1`.
- `project.name` and `project.evidenceGenerated` are required; `evidenceGenerated` must be
  `YYYY-MM-DD`.
- `project.id`, when present, should match the corpus filename and is used as the stable
  portfolio key.
- `resources[]` must use the core `Resource` shape: `id`, known `kind`, `name`, `attrs`.
  Resource ids must be unique.
- `observations[]` must use the core `Observation` shape: `resourceId`, `metric`, `value`,
  `measuredAt`; `resourceId` must reference an existing resource and `measuredAt` must parse
  as an ISO date/time.
- `importedActions[]` are provenance from the original audit and must not be converted into
  findings.
- Secrets must be shape-only. Never store credential values, bearer tokens, service-role keys, or
  full headers.
- Evidence older than 30 days is still ingested, but the collector emits a staleness warning.

## Producers

Current producers:

- hand-reviewed corpus files in `corpus/*.evidence.json`
- index-derived seed corpus files generated with `npm run corpus:seed`

Planned producers:

- enrichment/review of the index-derived seed corpus against heterogeneous usage reports
- browser extension export
- future official Lovable usage API export if available
