# central-genial — Recon Usage Report

**Waste-score:** 83/100 · Clean up now — 1 critical, 3 high finding(s).  
_ref `ezdckbupdqjrfmoetbjc` · Vite + React + Shadcn · mode `demo` · evidence 2026-06-30 · scanned <DATE>_

---

## Capability matrix

| Capability | State |
|---|---|
| Lovable Cloud (DB) | ✅ active |
| Lovable AI | ✗ not configured |
| Tables (public) | 27 |
| Cron jobs | 5 |
| Edge functions | 25 |
| Storage buckets | 0 |
| Realtime | ✗ off |
| RLS policies seen | 1 |

## Findings

| # | Policy | Severity | Conf. | Finding | Est. saved |
|--:|---|---|---|---|---|
| 1 | POL-6 | 🔴 Critical | confirmed | Anon JWT hard-coded in 5 cron command(s) (60-yr expiry) | — |
| 2 | POL-1 | 🟠 High | confirmed | Perpetual cron `poll-telegram-updates` | ~1440 inv/day |
| 3 | POL-2 | 🟠 High | confirmed | Unbounded log/raw table `cron.job_run_details` (121 MB, 78% of DB) | 121 MB |
| 4 | POL-5 | 🟠 High | confirmed | unrate-limited anon write surface on `analytics_events` | — |
| 5 | POL-9 | 🟡 Medium | confirmed | Idle 101 days, still burning (5 active cron job(s)) | — |

### 1. [POL-6] Anon JWT hard-coded in 5 cron command(s) (60-yr expiry)

🔴 Critical · confidence **confirmed**

A JWT embedded in `cron.job.command` is a credential-at-rest readable by anyone with `cron`/DB access. Affected: `poll-telegram-updates`, `monthly-social-kit-generation`, `morning-summary-daily`, `stale-lead-alert-daily`, `update-reminder-daily`. A 60-year expiry makes rotation urgent. Move to Vault-resolved secrets or the documented `apikey` pattern.

**Evidence**
- _(sql)_ 5 job(s) embed Authorization Bearer eyJ (redacted)

  ```
  headers := '{"Authorization":"Bearer eyJ<redacted>"}'
  ```

**Remediation**
- Vault the cron auth + rotate the anon key  _(manual, review required)_

  ```
  Resolve the token from Vault inside each job (or use the apikey pattern); then rotate the exposed anon key. Never paste tokens into cron.job.command.
  ```

### 2. [POL-1] Perpetual cron `poll-telegram-updates`

🟠 High · confidence **confirmed** · driver `A` · est. saved **~1440 inv/day**

This job fires ~1440×/day (finer than `*/15`) with no proven work per tick, and targets an unresolvable host (DNS fails). Scheduled work that runs regardless of state is "runtime without intention" — it bills edge/Worker invocations and writes cron-history rows indefinitely, fully decoupled from real usage. Health must be judged from `net._http_response`, not `cron.job_run_details.status`.

**Evidence**
- _(sql)_ schedule `* * * * *`, active=true

  ```
  SELECT jobname,schedule,active FROM cron.job;
  ```
- _(sql)_ 150747 cumulative runs recorded in cron.job_run_details
- _(sql)_ net._http_response indicates host status dead

**Remediation**
- Unschedule (or gate) `poll-telegram-updates`  _(sql_migration, review required)_

  ```sql
  -- verify: SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='poll-telegram-updates';
  SELECT cron.unschedule('poll-telegram-updates');
  -- or, if still needed: repoint to */15 and add a "queue non-empty / user-active" sentinel.
  ```

### 3. [POL-2] Unbounded log/raw table `cron.job_run_details` (121 MB, 78% of DB)

🟠 High · confidence **confirmed** · driver `C` · est. saved **121 MB**

`cron.job_run_details` is an append-only log/raw table with no retention policy. Growth here is never healthy data-model growth — it is storage + backup bloat and per-insert index overhead. Almost every larger Lovable DB is dominated by exactly one table like this.

**Evidence**
- _(sql)_ 121 MB, 78% of public schema

  ```
  SELECT relname, pg_total_relation_size(c.oid) FROM pg_class c ... ORDER BY 2 DESC;
  ```

**Remediation**
- Add retention to `cron.job_run_details`  _(sql_migration, review required)_

  ```sql
  -- keep a bounded window (tune interval); schedule as a daily job
  DELETE FROM cron.job_run_details WHERE created_at < now() - interval '30 days';
  VACUUM ANALYZE cron.job_run_details;
  -- if this is raw HTML/blobs: move payloads to Storage with a file_size_limit instead.
  ```

### 4. [POL-5] unrate-limited anon write surface on `analytics_events`

🟠 High · confidence **confirmed** · driver `B`

Policy `analytics_events - Anyone can insert` (INSERT) uses `true` for roles `anon`. This is simultaneously a security exposure and a cost surface: broad reads return whole tables under polling; open anon INSERT is a write-amplification / spam vector. Single-tenant tolerances become unsafe the moment the app goes multi-tenant.

**Evidence**
- _(sql)_ analytics_events.analytics_events - Anyone can insert: INSERT roles=anon qual=true

  ```
  SELECT tablename,policyname,cmd,roles,qual FROM pg_policies WHERE schemaname='public';
  ```

**Remediation**
- Scope by owner/tenant + rate-limit anon writes  _(manual, review required)_

  ```
  Replace USING(true)/tautology with auth.uid()/tenant or has_role() predicates. Rate-limit (per-IP/captcha/RPC) any anon INSERT; never expose infra tables (cron_logs, system_config).
  ```

### 5. [POL-9] Idle 101 days, still burning (5 active cron job(s))

🟡 Medium · confidence **confirmed** · driver `A`

No real user activity for 101 days, yet 5 active cron job(s) keep consuming compute. Runtime cost here is decoupled from usage — this is the portfolio-wide silent baseline (the 2nd-largest credit line after Build-mode). Scheduled/background work should auto-pause past 30 idle days.

**Evidence**
- _(sql)_ last activity ~101d ago; 5 active cron(s)

**Remediation**
- Auto-pause idle work + flag the Cloud instance  _(manual, review required)_

  ```
  Add an 'idle > 30d -> auto-unschedule scheduled work' rule; consider pausing/consolidating the Cloud instance to drop the per-instance baseline.
  ```

## Imported audit actions

_Context from the source audit. These actions are not counted in the waste-score._

| Rank | Policy | Severity | Status | Effort | Action |
|--:|---|---|---|---|---|
| 1 | POL-1 | High | Confirmed | XS | cron.unschedule('poll-telegram-updates') (-1440/day) |
| 2 | POL-2 | High | Confirmed | XS | Purge cron.job_run_details (-121MB) + add retention |
| 3 | POL-6 | Critical | Confirmed | S | Rotate anon key / Vault cron auth (60-yr expiry) |
| 4 | POL-9 | Medium | Confirmed | S | Auto-pause scheduled work after 30 idle days |

## Waste-score breakdown

| Policy | Findings | Points |
|---|--:|--:|
| POL-6 | 1 | 40 |
| POL-1 | 1 | 20 |
| POL-2 | 1 | 20 |
| POL-5 | 1 | 20 |
| POL-9 | 1 | 8 |

## Collector warnings

- demo mode - embedded ProjectEvidence fixture from the central-genial audit; not a live scan

---

_Generated by `recon scan` (read-only). Remediation is proposed, never applied — `recon clean --apply` (future) will require `confirmed` findings + review._
