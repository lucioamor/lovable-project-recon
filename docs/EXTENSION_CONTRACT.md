# Extension Contract

The browser extension is a `ProjectEvidence` producer. It does not run rules, score findings, call
the local CLI, or proxy credentials outside the browser.

## Security Boundary

- Token and Lovable browser session data never leave the browser.
- The extension must not send tokens, cookies, Authorization headers, service-role keys, or raw
  request headers to Recon.
- Evidence export requires an explicit user action for each project or selected portfolio.
- Values that look like credentials are redacted at source. Export only shape metadata such as
  `jwt-literal`, `service-role-ref`, `authorization-header-present`, or `secret-name`.
- The output is a downloaded JSON file, not a network POST to a local process.

## v0 User Flow

1. User opens a Lovable project in the browser.
2. Extension content script reads visible/project-local metadata and allowed browser-side API
   responses.
3. User clicks **Export evidence**.
4. Extension downloads `<project-id>.evidence.json`.
5. User runs:

```bash
recon scan --mode evidence --evidence <project-id>.evidence.json
```

For portfolios, the extension may export multiple files into a directory. Recon consumes them with:

```bash
recon scan --mode portfolio --dir ./corpus
```

## Output Format

The extension must emit `ProjectEvidence` schema version `1` as documented in
[`EVIDENCE_SCHEMA.md`](./EVIDENCE_SCHEMA.md).

Required fields:

- `schemaVersion`
- `project.name`
- `project.evidenceGenerated`
- `resources`
- `observations`

Recommended fields:

- `project.id`
- `project.supabaseRef`
- `project.stack`
- `project.evidenceSource`
- `importedActions`
- `raw.extension`
- `warnings`

## Evidence Rules

- Confirmed evidence must come from directly observed UI/API/source facts.
- Hypotheses may be exported as raw context or imported actions, but they must not be converted
  into rule findings by the extension.
- Imported actions are provenance only. Core rules and score own findings.
- Timestamps must use ISO strings.
- Offline evidence older than 30 days is still accepted by Recon, but reports include staleness
  warnings.

## Non-Goals For v0

- No native messaging host.
- No local CLI bridge.
- No service worker that replays authenticated requests outside the active browser context.
- No automatic cleanup actions.
- No mutation of Lovable, Supabase, or project state.

## Compatibility

Any future official Lovable usage API should become another `ProjectEvidence` producer. If that
API covers usage, credits, and project inventory, it should replace extension scraping rather than
expanding it.
