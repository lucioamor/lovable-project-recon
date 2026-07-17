# `.local/` — your data, never committed

Everything in this directory is ignored by git except this README. It is the home for
anything produced by running Recon against real projects.

```
.local/
  evidence/   collected ProjectEvidence and raw probe output
  reports/    generated reports
  handoff/    working notes, session handoffs
```

Nothing here is required to build or test the tool. Delete it freely.

## Why it exists

This repository is public. Live evidence is not.

Evidence collected from a real Lovable or Supabase project can contain project refs, anon
JWTs, `x-cron-secret` values, and full `cron.job` command bodies — pg_cron stores HTTP
headers inline, so any credential a cron job sends is sitting in the evidence you just
collected. Committing that publishes it, and `git rm` afterwards does not unpublish it:
the value stays in the history and must be rotated.

The curated fixtures under `corpus/` are safe to track because they were reviewed before
being committed. **Freshly collected evidence has not been reviewed.** Treat it as secret
material until you have looked at it.

## Rules

- Do not move files out of here to make them trackable. Redact first, review, then commit.
- Do not add a negation to `.gitignore` for anything under here.
- If a secret does land in a commit, rotate the credential. Rewriting history is not enough.

Private planning notes that are not Recon output go in `local-notes/`, which is also
ignored.
