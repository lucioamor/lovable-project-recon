# Lovable Backend — Remediation & Policy Backlog

### Evidence-to-policy bridge for authoring technical backend standards

**Consolidated:** 2026-06-30
**Third companion to:** `LOVABLE_TECHNICAL_LANDSCAPE.md` (analysis) and `LOVABLE_ENV_CONFIG_REFERENCE.md` (artifacts)
**Purpose:** input for an LLM/engineer whose job is to **write technical backend policies** — remediation rules, correction standards, and system-improvement guidelines — for apps built on Lovable Cloud (Supabase). This file turns the 20 audits into a normative, traceable policy base.

---

## 0. Handoff brief (read first)

**What you (the consuming model) are being asked to do.** Author enforceable backend policies from the recurring, evidence-backed conditions below. Each policy domain in Part A already states a candidate standard, its evidence, its risk, and how to verify compliance. Your job is to ratify, tune thresholds, and phrase them as your organization's standard — not to re-derive them.

**The three source documents and how they relate.**

| File | Role | Use it for |
|---|---|---|
| `LOVABLE_TECHNICAL_LANDSCAPE.md` | Analysis / narrative | Why a pattern matters, the cost model, the taxonomy (categories A–F) |
| `LOVABLE_ENV_CONFIG_REFERENCE.md` | Artifacts / specs | Exact snippets, config flags, model IDs, the audit query library |
| **this file** | Policy base / backlog | The normative rules + per-project prioritized actions |

**Confidence convention — enforce only what is Confirmed.** Every claim in the source audits is tagged **Confirmed** (reproducible from DB state or source code) or **Hypothesis** (needs HQ/billing-log correlation). Policy rule of thumb: write a *mandatory* standard (`MUST`) only from Confirmed evidence; downgrade Hypothesis-only items to `SHOULD verify` or a diagnostic step. Do not promote a hypothesis to a hard rule.

**Guardrails to encode into any remediation policy.**
- **Read-only by default.** The audits were observation-only (no INSERT/UPDATE/DDL). Remediation policy should prescribe the migration/standard, then require review before mutating production.
- **Never widen a credential's blast radius in policy text.** Do not instruct pasting secrets, service-role keys, or full anon JWTs into docs, cron commands, or client bundles. Prescribe Vault + rotation instead.
- **Some evidence is HQ-only.** `cron.job` / `cron.job_run_details` and workspace billing (`credits--get_credit_balance`) are often unreadable from the app role; policies that depend on them must name the privileged reader.
- **Cost attribution caveat.** AI Gateway logs have short retention (frequently 0 over 7 days despite real spend). Never conclude "no AI usage" from an empty gateway window — require a project-side ledger.

**Scales used below.**
- **Severity:** Critical (security exposure or uncapped cost) · High (confirmed steady/large burn) · Medium (real waste, bounded) · Low (hygiene).
- **Effort:** XS (single config/SQL) · S (one file) · M (multi-file / migration) · L (architectural).
- **Status:** Confirmed · Hypothesis.

**Corpus:** 20 audits / 18 distinct projects (Go Do It audited twice; desafio-genial is a CTA audit, minimal backend signal).

---

## Part A — Policy domains

Nine domains, each derived from a recurring, cross-project condition. Format per domain: **Standard** (normative) → **Evidence** (who/how many, Confirmed/Hypothesis) → **Risk** → **Verify** (how to check compliance) → **Ship** (concrete defaults).

---

### POL-1 — Scheduled-job (cron) hygiene
**Severity: High · Effort: S–M**

**Standard.**
- A `pg_cron` job **MUST NOT** run more frequently than every 15 min unless it is proven work-bearing on each tick; sub-15-min pollers **MUST** be converted to event-driven (`AFTER INSERT` trigger → `pg_net.http_post`) or gated by a "queue non-empty / user-active" sentinel.
- Every scheduled job **MUST** have an idle/paused/deadline short-circuit *at the scheduler level* (unschedule), not only inside the handler — a handler that "returns early" still bills an invocation and writes history rows.
- Cron targets **MUST** point at the stable production host, never a preview (`project--<uuid>.lovable.app`) or an unresolvable host (`*.lovable-project.com`).
- Health **MUST** be judged from `net._http_response`, not `cron.job_run_details.status` (which only confirms the POST was *issued*).

**Evidence (Confirmed unless noted).** Perpetual/near-idle crons in ≥8 projects: central-genial `poll-telegram-updates` `* * * * *` = 1,440/day, 150,747 runs, 1 telegram msg / 0 users; lovable-for-schools two jobs = 1,728/day, **246,763 invocations, 0 useful work, past a hard-coded 2026-02-01 deadline**; Go Do It `embed-queue-2min` = 720/day against an empty queue; ibuiltthis `process-consent-replies` `*/5` ≈ 8,640/mo mostly no-op; ambassador-os hourly `{"processed":0}`; Whos Local hourly → dead host (DNS fail 24×/day); Lovable Cup daily → preview host. Idle-but-firing is the corpus's single most common runaway shape.

**Risk.** Edge/Worker invocations + cron-history writes billed indefinitely with zero output; decoupled from usage, so it surprises operators. Latent spike when a "dead" cron is naively re-pointed (Whos Local: ~15–22k writes/day the moment the URL is fixed without also fixing delete-all).

**Verify.** `SELECT jobid,jobname,schedule,active FROM cron.job;` (HQ) → flag any schedule finer than `*/15`; `SELECT status_code,error_msg,created FROM net._http_response ORDER BY created DESC` → flag NULL/4xx; diff `max(activity_ts)` per project vs. active jobs.

**Ship.** Default minimum interval `*/15`; event-driven template for embed/enrich queues; a scheduler-level "auto-unschedule if `max(activity) > 30 days`" job; cron target must be an env-injected prod host constant.

---

### POL-2 — Log & raw-payload retention
**Severity: High · Effort: XS–S**

**Standard.**
- Every append-only log/telemetry/audit table **MUST** have a retention policy (`DELETE … WHERE created_at < now() - interval 'N days'`) or partitioning. No exceptions for `*_log`, `cron_logs`, `cron.job_run_details`, `notifications`, `*_events`, `*_attempts`.
- Raw payloads (HTML, blobs, media) **MUST NOT** be stored in Postgres `text`/`jsonb` columns; they belong in Storage with a `file_size_limit` and a TTL/cleanup job. Snapshot tables **MUST** keep only latest + last-changed per key.
- Generated media (AI cards, thumbnails) **MUST** be format-optimized (WebP) and size-capped, with orphan cleanup scheduled.

**Evidence (Confirmed).** One table dominates every larger DB: Opportunity Monitor `job_snapshots` = 7,440 rows / **96 MB = 76 % of DB** (raw HTML, no TTL); lovable-for-schools `cron_logs` = **74 MB / 246,763 rows** (no retention) + `snapshots.source_html` ≈ 23 MB raw HTML in heap; central-genial `cron.job_run_details` = **121 MB**; IesBrazil `db_admin_log` = 11,584 rows, largest table, no purge; Websummit Rio `notifications` = 4,234 rows (96.7 % unread, no TTL); ibuiltthis `share-cards` = **344 MB (59 %)** of a 581 MB bucket, un-deduped PNG, no size limit.

**Risk.** Storage + backup growth; index-update overhead per insert; WAL; slow log scans surfaced under open RLS.

**Verify.** Largest-table query (§9 of reference) → if the top table is a log/raw table, fail; check each log table for a retention job; check buckets for `file_size_limit`.

**Ship.** Standard 30-day retention for logs, 7-day for cron history; `file_size_limit` (e.g. 2 MB assets / 10 MB uploads); nightly orphan-media sweep; "no raw HTML in Postgres" lint.

---

### POL-3 — Client & Realtime fetch defaults
**Severity: High · Effort: S–M**

**Standard.**
- The per-request `QueryClient` **MUST** set `staleTime ≥ 60_000` and `gcTime` defaults; `defaultPreloadStaleTime` **MUST** be ≥ 30_000 (hover-preload must reuse cache).
- `refetchIntervalInBackground` **MUST** be `false`; any `refetchInterval`/`setInterval` polling **MUST** pause on `document.hidden` and **MUST NOT** be finer than the product genuinely needs (no 2–8 s profile/status polls — use Realtime or a manual refresh).
- There **MUST** be exactly one `onAuthStateChange` subscriber per app; invalidations **MUST** be key-scoped, never a blanket `queryClient.invalidateQueries()`.
- Realtime publications **MUST** be minimal and per-row filtered; subscribers **MUST** apply incremental payload updates, not a full loader refetch on `event: "*"`. Log/operational tables **MUST NOT** be in `supabase_realtime`.
- Public SSR loaders **MUST** carry an HTTP cache header (`Cache-Control: s-maxage=…`).

**Evidence (Confirmed).** `staleTime:0` + hover-preload: Lovable Cup — one `app_settings` key hit **2,694×**; Lucio Amorim — ~8,400 SELECTs from 6-query bundles, no HTTP cache. Background polling: IesBrazil 4 s dock + 2 s per-batch `refetchIntervalInBackground:true` (a stuck batch polled every 2 s for 11 days); Lovable Cup 8 s profile poll = 10,800 calls/tab/day; Websummit Rio + GenialPrev 30–60 s always-mounted pollers (GenialPrev also fires 13 parallel count queries per admin mount). Auth fan-out: Lovable Cup 4 subscribers, Lucio Amorim 4, each unkeyed `invalidateQueries()`. Realtime: ibuiltthis `realtime.list_changes` = **1.7 M calls / 7.9 M ms (#1 workload, ~6×)** from 3 log tables in the publication; Websummit Rio 7-table publication + 11 wildcard subscriptions each doing full `load()`.

**Risk.** Cost scales with open-tab-hours, not user actions — the defining "why is an idle app burning credits" driver on the TanStack generation.

**Verify.** `rg "staleTime|defaultPreloadStaleTime|refetchIntervalInBackground|setInterval|onAuthStateChange|supabase.channel" src/`; `pg_stat_statements` top-N for a trivial query with thousands of calls; check `supabase_realtime` publication membership.

**Ship.** A shared `QueryClient` factory with the caps baked in; a lint against `refetchIntervalInBackground:true` and bare `invalidateQueries()`; a "Realtime publication allowlist" review gate.

---

### POL-4 — AI cost governance
**Severity: Critical · Effort: S–M**

**Standard.**
- Every AI/LLM/TTS/STT entry point **MUST** enforce a cost ceiling *before* the provider call: a per-user/per-day token (or USD) cap with a circuit breaker that logs a `cost_cap_hit` event and aborts. `ai_config.max_cost_usd` **MUST** be non-NULL.
- Model IDs **MUST** be pinned to catalog entries; preview/alias IDs **MUST NOT** be hard-coded across functions. A failing model call still bills — so a broken ID is a live cost, not a no-op.
- Fan-out **MUST** be bounded: no cron tick may invoke an unbounded set of AI functions; per-item batch loops **MUST** have explicit caps and rate limits.
- Client code **MUST NOT** be the sole guard against regeneration; edge functions **MUST** be idempotent (check for an existing result/error envelope before re-calling).

**Evidence (Confirmed unless noted).** No ceilings: Go Do It — the only guard is one boolean; on 2026-06-26 it failed all day → **458,231 tokens vs 0 on 13 other days**, no circuit breaker; ambassador-os — `ai_config.max_cost_usd = NULL`. Broken IDs: Opportunity Monitor — `google/gemini-3.1-flash-lite` hard-coded in **7 functions**, every call 400s but bills; The Monday Test — `gemini-3.1-pro-preview` fallback pays failed attempt + pricier `2.5-pro`. Unbounded fan-out: Opportunity Monitor `auto-backfill` = up to **219 Gemini calls/tick**; recalc-matches N×M per user. Client-driven regeneration loop: The Monday Test re-invokes `generate-report` on every visit to any error-state row. Bursty spend: buildable 88 % of 1.53 M tokens in 2 days; `estimated_cost_usd` NULL for all 158 rows.

**Risk.** A single guard regression = 30–50× spend; broken IDs bill failed calls; regeneration loops are unbounded per pageview.

**Verify.** `SELECT * FROM ai_config` (max_cost_usd non-NULL?); `rg "gemini-3.1-|preview"` for unpinned IDs; confirm every AI call site writes a ledger row; check for a daily-token guard before each provider call.

**Ship.** A mandatory `assertUnderDailyCap(userId)` wrapper before any gateway call; a pinned-model constant; an idempotency check template for generate-style functions.

---

### POL-5 — RLS & tenancy baseline
**Severity: Critical · Effort: S–M**

**Standard.**
- Operational/data tables **MUST NOT** use `USING (true)` for `authenticated` or any tautology (`id = id`); reads **MUST** be scoped by `auth.uid()`/tenant or role. Anon `UPDATE` on unowned rows **MUST NOT** exist.
- Anon/`public` `INSERT` surfaces (analytics, contact, waitlist, questions) **MUST** be rate-limited (per-IP / captcha / RPC with server validation) and **MUST NOT** exist on infrastructure tables (`cron_logs`, `system_config`).
- `SECURITY DEFINER` functions **MUST** revoke `EXECUTE` from `anon`/`authenticated` unless intentionally public; internal admin-gate is not a substitute for the grant.
- PII columns **MUST NOT** be readable via broad `SELECT` policies; AI output rendered from anonymous input **MUST NOT** use `dangerouslySetInnerHTML`.

**Evidence (Confirmed).** `USING (true)` on all operational tables: IesBrazil; Opportunity Monitor `job_snapshots` (96 MB raw HTML readable by any authed user). Tautology + anon UPDATE: The Monday Test (`id = id`; anon can wipe any row → forces regeneration; exposes PII `nome/email/empresa/cargo/linkedin`). Public write on infra: lovable-for-schools `system_config`/`cron_logs` UPDATE open to `{public}`. `<nil>`-qualifier admin INSERTs + anon `hub_analytics` (ambassador-os). Open anon INSERT, no rate limit: Whos Local `analytics_events`/`activity_log`, central-genial `analytics_events`/`feature_flags:true`, ibuiltthis `analytics_events`, Lucio Amorim `email_submissions`, nxlv `nxlv_contacts`/`nxlv_diagnostic_requests`. Linter EXECUTE exposure: Lovable Cup (6 fns), Lucio Amorim (2 fns). PII/XSS: yapp-to `form_links.recipient_email` public, `FormAnalytics` `dangerouslySetInnerHTML`. Present in **10+ projects**.

**Risk.** Simultaneously a security exposure *and* a cost surface — an unpaginated `SELECT *` under `USING(true)` returns the whole table on every poll; open anon INSERT is a write-amp/spam vector. Single-tenant tolerances become unsafe the moment an app goes multi-tenant.

**Verify.** `SELECT tablename,policyname,cmd,roles,qual::text FROM pg_policies WHERE schemaname='public'` → flag `qual=true`/`id = id`/`<nil>` on write; `supabase--linter` for SECURITY DEFINER + always-true findings.

**Ship.** An RLS baseline template (row/tenant predicates + `has_role` admin paths); a "no anon INSERT without rate-limit" gate; a linter-clean requirement (0 always-true/EXECUTE findings) before deploy.

---

### POL-6 — Secrets & auth-surface management
**Severity: Critical · Effort: XS–S**

**Standard.**
- Cron commands **MUST NOT** embed anon or any JWT in `cron.job.command`; use Vault-resolved secrets or the documented `apikey` pattern. Tokens with multi-decade expiries **MUST NOT** be issued.
- No function may return service-role keys/secrets over HTTP; debug/`reveal-*` functions **MUST** be deleted and the exposed keys rotated.
- Public functions (`verify_jwt = false`) **MUST** enforce an explicit auth/signature check *and* a rate limit; signing endpoints **MUST NOT** be unauthenticated.
- Dead secrets **MUST** be removed.

**Evidence (Confirmed).** Anon JWT hard-coded in `cron.job.command`: central-genial (all 5 jobs, **60-year expiry to 2086**), lovable-for-schools, ambassador-os, Whos Local. Service-role over HTTP: Opportunity Monitor `reveal-service-key` (its own banner: "DELETE THIS FUNCTION immediately"), gated only by `x-cron-secret`. `verify_jwt=false` without rate limit: Smart Deals `deal-api`, Lucio Amorim `render-markdown`/`send-diagnostic-notification`, nxlv (same), yapp-to `sign-link` (anyone can mint JWTs). Dead secret: Go Do It `NVIDIA_API_KEY`.

**Risk.** Credential-at-rest readable by anyone with `cron`/DB access; anonymous invocation of privileged paths; unauthenticated JWT minting.

**Verify.** Inspect `cron.job.command` for `Bearer eyJ…`; list edge fns for `reveal|debug|dump`; `supabase/config.toml` for `verify_jwt=false` + confirm in-fn gate + rate limit.

**Ship.** Vault-injection template for cron auth; a CI check that fails on `eyJ` in migrations/cron; delete-and-rotate runbook; mandatory rate-limit middleware for public functions.

---

### POL-7 — Write-amplification & trigger discipline
**Severity: Medium · Effort: M**

**Standard.**
- A single user action **MUST NOT** trigger unbounded row fan-out; notification/aggregate fan-out **MUST** be capped and **SHOULD** be moved to a digest/queue job.
- Progress/counter updates **MUST** be batched (every N items or T seconds), not written per iteration.
- Set reconciliation **MUST** use `upsert` keyed on a natural key, never delete-all + re-insert.

**Evidence (Confirmed).** Websummit Rio `on_new_member_notify` writes **up to 200 notification rows per onboarding** (2,543 in one day), each re-amplified through Realtime; `recompute_builder_badges` = 6 INSERTs per submission/profile write (Lovable Cup). Opportunity Monitor: `monitoring_runs` updated **~80×/scan** (per-iteration progress), `job_locations` delete-all+reinsert (9,656 ins / 8,000 del on 3,327 rows), `jobs` rewritten ~5×. Whos Local `sync-events` delete-all organizers (~15–22k writes/day latent).

**Risk.** WAL growth on small DBs; Realtime replication multiplication; rollback churn.

**Verify.** `pg_stat_user_tables` where `n_tup_upd ≫ n_tup_ins` or high `n_tup_del` on a small live set; read trigger bodies via `pg_get_triggerdef`.

**Ship.** A "fan-out cap + digest" pattern for notifications; batched-progress helper; upsert-not-replace lint for sync handlers.

---

### POL-8 — Cost observability & attribution
**Severity: High · Effort: S**

**Standard.**
- Every project **MUST** maintain its own usage ledger (per-call `tokens`, `model`, `provider`, `kind`, `outcome`, `trigger`) written by **every** AI/TTS/STT call site — partial instrumentation is non-compliant.
- Cost attribution **MUST** use `credits--get_credit_balance` grouped by `billable_item`/`user`/`project`; the AI Gateway request log **MUST NOT** be treated as authoritative (short retention → false zeros).
- Dashboards **MUST NOT** surface a cost column that is never populated (`estimated_cost_usd NULL`).

**Evidence (Confirmed).** Empty/partial ledgers: yapp-to `ai_usage_logs` 0 rows (3 of ~6 fns log; TTS entirely uncounted), ibuiltthis `llm_usage_logs` 0 rows, buildable `estimated_cost_usd` NULL for 158/158. Gateway false-zero: 7-day window = 0 in ≈10 projects despite real historical spend (ambassador-os 715,757 tokens in `pipeline_logs`; Smart Deals 140 credits used vs 0 gateway rows). Positive model: nxlv's workspace billing breakdown proved **Build-mode = 62.3 %** of spend, runtime AI < 0.4 % — only visible via `credits--` grouping.

**Risk.** Impossible to separate Build-mode editor spend (the real #1) from runtime; teams chase the wrong driver.

**Verify.** Confirm every AI call site writes the ledger; confirm a `credits--get_credit_balance` grouped report exists; check for NULL cost columns surfaced in UI.

**Ship.** A `logAiUsage(provider,kind,model,tokens,outcome)` wrapper mandatory at every call site; a standard billing-attribution query; drop-or-populate rule for cost columns.

---

### POL-9 — Idle-project lifecycle
**Severity: Medium · Effort: S**

**Standard.**
- Scheduled/background work **MUST** auto-pause when a project shows no real user activity for > N days (default 30), re-enabling on activity. The per-instance Cloud "pico" baseline is unavoidable while Cloud is on, so idle projects **SHOULD** be flagged for Cloud pause/consolidation.
- "Idle in the app-level tables" **MUST NOT** be read as "not billing" — cron/`pg_net`/Realtime can bill while `monitoring_runs` looks frozen.

**Evidence (Confirmed).** Long idle yet still firing: Smart Deals idle since 2026-04-10 (~81 d) with always-on Telegram poll; Opportunity Monitor frozen since 2026-06-18; central-genial 101 d idle, 1,440 EF calls/day continue; lovable-for-schools 149 d past deadline; ibuiltthis no pipeline runs in 100+ d yet Realtime/cron overhead persists. Runtime-clean-but-baseline: GenialPrev, Lucio Amorim, nxlv (burn is Build-mode + pico baseline, not the app).

**Risk.** Portfolio-wide silent baseline across many idle Cloud projects (~19 in one workspace) — the second-largest credit line after Build-mode.

**Verify.** `max(activity_ts)` per project vs. active cron/Realtime; `credits--get_usage_breakdown` for pico baseline per instance.

**Ship.** An "idle > 30 d → auto-pause scheduled work" platform rule; a periodic idle-project report for Cloud consolidation.

---

## Part B — Per-project prioritized action index

Deduplicated top actions, each mapped to the policy it satisfies. Ordered by severity. `Sev` = Critical/High/Medium/Low · `Eff` = XS/S/M/L · `St` = Confirmed/Hypothesis.

| Project | # | Top action | Sev | Eff | St | Policy |
|---|--:|---|---|---|---|---|
| **Opportunity Monitor** | 1 | Delete `reveal-service-key`, rotate `SERVICE_ROLE_KEY`+`CRON_SECRET` | Critical | XS | C | POL-6 |
| | 2 | Fix broken model id in 7 fns → catalog model; redeploy | High | S | C | POL-4 |
| | 3 | Add retention/TTL to `job_snapshots` (keep latest+changed) | High | S | C | POL-2 |
| | 4 | Batch `monitoring_runs` progress; upsert `job_locations` | Medium | M | C | POL-7 |
| | 5 | Tighten `job_snapshots` RLS to service_role | High | S | C | POL-5 |
| **The Monday Test** | 1 | Stop regeneration: treat any non-empty `report_json` (incl. error) as hard stop + Retry | High | S | C | POL-4 |
| | 2 | Idempotency/lock in `generate-report` edge fn | High | S | C | POL-4 |
| | 3 | Drop anon tautology SELECT (`id=id`) + anon UPDATE policies (PII) | Critical | XS | C | POL-5 |
| | 4 | Pin model; remove `gemini-3.1-pro-preview` | Medium | XS | C | POL-4 |
| **lovable-for-schools** | 1 | `cron.unschedule` both jobs (−1,728 EF + −3,456 DB/day) | High | XS | C | POL-1 |
| | 2 | Truncate/partition `cron_logs` (−74 MB) | High | XS | C | POL-2 |
| | 3 | Move `snapshots.source_html` to Storage | Medium | M | C | POL-2 |
| | 4 | Lock `system_config`/`cron_logs` RLS to `{authenticated}` | Critical | S | C | POL-5 |
| | 5 | Vault the anon JWT in cron | High | XS | C | POL-6 |
| **central-genial** | 1 | `cron.unschedule('poll-telegram-updates')` (−1,440/day) | High | XS | C | POL-1 |
| | 2 | Purge `cron.job_run_details` (−121 MB) + add retention | High | XS | C | POL-2 |
| | 3 | Rotate anon key / move cron auth to Vault (60-yr expiry) | Critical | S | C | POL-6 |
| | 4 | Pause daily jobs until PRO users exist | Medium | XS | C | POL-9 |
| **ambassador-os** | 1 | Set `ai_config.max_cost_usd` ceiling | Critical | XS | C | POL-4 |
| | 2 | Throttle/condition `hourly-signal-extraction` (sentinel) | High | S | C | POL-1 |
| | 3 | Add `WITH CHECK` to "Admins can insert…" + gate anon `hub_analytics` | High | S | C | POL-5 |
| | 4 | Vault cron JWT; watchdog for zombie `ingestion_jobs` | Medium | S | C | POL-6 |
| **Go Do It / godoit** | 1 | Daily token ceiling + circuit breaker in `runReconciliation` (kills ~85 % waste) | High | S | C | POL-4 |
| | 2 | `embed-queue-2min` → `*/15` or event-driven (−660/day) | High | XS | C | POL-1 |
| | 3 | Window-guard `ops-alerts-push`; unit-test bypass logic | Medium | S | C | POL-1 |
| | 4 | Delete dead `NVIDIA_API_KEY` | Low | XS | C | POL-6 |
| **Websummit Rio** | 1 | Digest/disable `on_new_member_notify` (200 rows/onboarding) | High | M | C | POL-7 |
| | 2 | Narrow `supabase_realtime` to per-user `notifications`; drop `profiles` | High | M | C | POL-3 |
| | 3 | Payload-driven incremental updates (kill wildcard `load()`) | High | M | C | POL-3 |
| | 4 | Notifications retention job | Medium | XS | C | POL-2 |
| **ibuiltthis** | 1 | Drop `batch_operations`+`generation_logs` from publication (poll instead) | High | S | C | POL-3 |
| | 2 | `process-consent-replies` `*/5`→`*/30` or Slack webhook | Medium | XS | C | POL-1 |
| | 3 | PNG→WebP + `file_size_limit` on `assets`; orphan sweep | Medium | M | C | POL-2 |
| | 4 | Fix `logLlmUsage` instrumentation (0 rows) | High | S | C | POL-8 |
| **IesBrazil Pipeline** | 1 | Mark `cancelling` terminal + 10-min janitor; `refetchIntervalInBackground:false` | High | S | C | POL-3 |
| | 2 | Retention on `db_admin_log` + `LIMIT`/pagination on log reads | High | S | C | POL-2 |
| | 3 | Replace `USING(true)` with role/tenant predicates | High | M | C | POL-5 |
| **Whos Local** | 1 | Guard `signup_completed` (fire once on real signup) | High | S | C | POL-3 |
| | 2 | Fix cron host **and** dedup `sync-events` in one patch | High | M | C | POL-1/7 |
| | 3 | Retire stale `ambassadors*` clients (2,055 wasted 404s) | Medium | S | H | POL-3 |
| | 4 | Vault cron tokens; tighten `activity_log`/`avatars` | High | S | C | POL-5/6 |
| **Lovable Cup** | 1 | Global `staleTime:60s` + `defaultPreloadStaleTime≥30s` | High | XS | C | POL-3 |
| | 2 | Replace 8 s `/submeter` poll with Realtime/button (−10,800/day) | High | S | C | POL-3 |
| | 3 | One auth subscriber + keyed invalidation; repoint cron off preview | Medium | S | C | POL-3/1 |
| | 4 | Filter `is_demo=false`; audit 6 exposed SECURITY DEFINER fns | Medium | S | C | POL-5 |
| **Smart Deals** | 1 | Pull `cron.job` HQ-side; auto-pause scheduled fns (idle 81 d) | High | S | H | POL-1/9 |
| | 2 | Reconcile 140 credits vs 0 gateway logs; build ledger | High | S | C | POL-8 |
| | 3 | Rate-limit `deal-api` (`verify_jwt=false`) | Medium | S | C | POL-6 |
| **yapp-to** | 1 | Instrument every LLM/TTS/STT call site (`ai_usage_logs` 0 rows) | High | S | C | POL-8 |
| | 2 | `file_size_limit` + ownership checks on both public buckets | High | S | C | POL-2/5 |
| | 3 | Fix `form_links` PII policy; remove `dangerouslySetInnerHTML` | High | S | C | POL-5 |
| **Lucio Amorim** | 1 | `Cache-Control: s-maxage=300` on `getHomeBundle` (~50× fewer hits) | Medium | S | C | POL-3 |
| | 2 | Raise `defaultPreloadStaleTime`; dedup 4 auth listeners | Medium | XS | C | POL-3 |
| | 3 | Rate-limit `email_submissions`; revoke EXECUTE on 2 fns | Medium | S | C | POL-5 |
| **GenialPrev Classic** | 1 | Confirm burn via `credits--get_credit_balance` by `billable_item` | Low | XS | H | POL-8 |
| | 2 | Collapse 13-count admin mount into one RPC + `staleTime` | Low | S | C | POL-3 |
| **nxlv** | 1 | Investigate Build-mode editor sessions (runtime confirmed clean) | Low | XS | C | POL-8 |
| **buildable** | 1 | Populate `estimated_cost_usd` or drop the dead column | Low | S | C | POL-8 |
| **hackathons** | 1 | Monitor AI cost when batch cover-gen fires; add funnel events | Low | S | H | POL-4/8 |
| **desafio-genial** | 1 | Validate HTTP members-area URL (`genialprev.curseduca.pro`) | Low | XS | C | — (CTA audit) |

---

## Part C — Normalized status index (parse-friendly)

One record per project. `Driver cat.` uses the landscape taxonomy: **A** perpetual cron · **B** client/Realtime amplification · **C** unbounded logs · **D** trigger/write fan-out · **E** uncapped AI · **F** Build-mode. `Idle` = no real user activity for weeks+. `Primary confirmed` = the top driver is Confirmed (not Hypothesis). Pipe-delimited for easy parsing.

```
project              | severity | driver_cats | idle | primary_confirmed | policies                | top_action
---------------------|----------|-------------|------|-------------------|-------------------------|-----------------------------------------
opportunity-monitor  | Critical | C,E,D       | yes  | yes               | POL-2,4,5,6,7           | delete reveal-service-key + rotate; fix model id
the-monday-test      | High*    | E,B         | no   | yes               | POL-4,5,3               | stop regeneration loop; drop tautology RLS
lovable-for-schools  | High     | A,C         | yes  | yes               | POL-1,2,5,6             | unschedule both crons; truncate cron_logs
central-genial       | High     | A,C         | yes  | yes               | POL-1,2,6,9             | unschedule telegram poll; purge job_run_details
go-do-it / godoit    | High     | A,E         | part | yes               | POL-1,4                 | daily token ceiling; embed-queue -> */15
ambassador-os        | High     | A           | yes  | yes               | POL-1,4,5,6             | set max_cost_usd; throttle hourly cron
websummit-rio        | High     | D,B,C       | no   | yes               | POL-7,3,2               | digest new_member trigger; narrow realtime
ibuiltthis           | High     | B,A,C       | yes  | yes               | POL-3,1,2,8             | drop log tables from realtime publication
iesbrazil-pipeline   | High     | B,C         | no   | yes               | POL-3,2,5               | mark cancelling terminal; log retention
whos-local           | High     | B,A,D       | no   | yes               | POL-1,3,6,7             | guard signup_completed; fix host+dedup
lovable-cup          | High     | B,D         | no   | yes               | POL-3,1,5,7             | global staleTime; kill 8s poll
smart-deals          | High     | A,E         | yes  | part(H)           | POL-1,8,5,9             | pull cron.job HQ-side; auto-pause idle
yapp-to              | High     | E,C         | no   | yes               | POL-8,4,2,5,6           | instrument TTS/LLM; bucket size limits
lucio-amorim         | Medium   | B           | part | yes               | POL-3,5,8               | Cache-Control on getHomeBundle
genialprev-classic   | Low(rt)  | F,B         | rt   | yes               | POL-8,3                 | attribute burn to Build via credits--
nxlv                 | Low(rt)  | F           | rt   | yes               | POL-8,9                 | investigate editor sessions (runtime clean)
buildable            | Low      | (analysis)  | -    | -                 | POL-8                   | populate/drop estimated_cost_usd
hackathons           | Low      | (healthy)   | no   | -                 | POL-4,8 (watch)         | monitor AI on batch cover-gen
desafio-genial       | Low/NA   | (CTA audit) | -    | -                 | -                       | validate HTTP members-area URL
```
\* The Monday Test is High for cost (regeneration loop) and **Critical for data exposure** (anon PII via tautology RLS). `rt` = runtime-clean; burn is Build-mode + Cloud baseline, not the deployed app.

**Portfolio rollup for policy prioritization:**

| Policy | Projects affected (Confirmed) | Suggested platform priority |
|---|---:|---|
| POL-5 RLS & tenancy baseline | 10+ | P0 — broadest, security + cost |
| POL-1 Cron hygiene | 8 | P0 — most common runaway |
| POL-2 Log/raw retention | 7 | P0 — pairs with POL-1 |
| POL-3 Fetch/Realtime defaults | 7 | P1 — default-config fix, high leverage |
| POL-4 AI cost governance | 6 | P0 — Critical (uncapped) |
| POL-6 Secrets & auth surface | 7 | P0 — Critical (credentials) |
| POL-8 Cost observability | ~all | P1 — prerequisite to attribute anything |
| POL-9 Idle lifecycle | 6 | P1 — 2nd-largest baseline line |
| POL-7 Write-amplification | 4 | P2 — bounded, but WAL/Realtime multiplier |

---

*End of backlog. To author a policy set: start from Part A (normative text + evidence), size scope with the portfolio rollup, and use Part B/C to enumerate the concrete per-project instances each policy must cover. Every figure is traceable to its `*_USAGE_REPORT.md`; enforce `MUST` only on Confirmed evidence.*

