# The Lovable Application Landscape

### A quantitative and qualitative technical synthesis of 20 project usage audits

**Consolidated:** 2026-06-30
**Source corpus:** 20 per-project usage/credit-burn audit reports (`*_USAGE_REPORT.md`)
**Distinct projects covered:** 18 (Go Do It appears twice as `Go_Do_It` and `godoit`; `desafio-genial` is a CTA/link audit rather than a backend audit)
**Original audience:** Lovable HQ engineering — daily-credit-burn triage
**This document:** collapses those 20 audits into one cross-project picture of *how apps built on Lovable are actually structured*, what they cost, and the failure modes they share. Every project's individual numbers are preserved in **Part II — Per-Project Appendix**.

> **Reading guide.** Part I generalizes: the canonical stack, the quantitative distributions, the architectural patterns, the recurring anti-patterns, the security posture, and the real cost model. Part II is the loss-preventing archive — one compact card per report with its specific metrics and findings. Numbers are point-in-time snapshots from each audit (all dated 2026-06-29/30).

---

## Part I — Synthesis

## 1. Corpus at a glance

Every report answers the same question — *"what in this project drives daily Lovable credit consumption?"* — against a live Supabase/Lovable Cloud backend, using the same evidence toolkit (`pg_stat_statements`, `pg_stat_user_tables`, `cron.job`, `pg_policies`, `ai_gateway_logs`, `db_health`, source `rg`). That shared method makes them directly comparable.

| Project | Frontend stack | DB size | Public tables | pg_cron (active jobs) | Edge functions | Storage | Dominant cost driver |
|---|---|---:|---:|---|---:|---|---|
| **lovable-for-schools** | React + Vite | **687 MB** | 11 | 2 (one `* * * * *`) | 10 | HTML-in-Postgres | Idle 1-min cron; 246,763 no-op invocations; `cron_logs` 74 MB |
| **ibuiltthis** | Vite + React | 132 MB | ~30 | 6 | **64** | assets 581 MB | Realtime WAL decode (1.7 M calls) + `pg_net` cron fan-out |
| **Opportunity Monitor** | TanStack Start | 126 MB | 15 | pg_cron (count unreadable) | 22 | none | `job_snapshots` 96 MB (76 % of DB) + 8-fn AI fan-out cron |
| **GenialPrev Classic** | Vite + React | 95.4 MB | 18 | installed, **0 active** | 9 | 0 buckets | Build/agent credits (runtime is idle & healthy) |
| **yapp-to** | React | 88 MB | 25 | 2 | 18 | 2 buckets, 35 MB | Unmetered ElevenLabs TTS + linear storage growth |
| **central-genial** | Vite + React + Shadcn | small (cron log 121 MB) | 27 | **5** (one `* * * * *`) | 25 | — | `telegram-poll` every minute → 1,440 EF calls/day, 150,747 runs |
| **IesBrazil Pipeline** | TanStack Start (server fns) | ~23 MB | ~16 | none installed | 1 | none | Client-driven polling (4 s dock / 2 s per-batch) + unbounded `db_admin_log` |
| **ambassador-os** | React | 22 MB | 21 | 2 (hourly) | 10 | unused | Hourly cron + uncapped Slack webhook; `max_cost_usd = NULL` |
| **Whos Local** | TanStack Start | 18 MB | 12 | 3 (2 → dead host) | 1 | avatars 1.3 MB | `signup_completed` write storm + stale-client 404 storm |
| **Lovable Cup** | TanStack Start / CF Worker | 13.7 MB (WAL 96 MB) | ~13 | 1 (→ preview host) | 1 | 0 objects | `staleTime:0` + 8 s poll + 99 % demo-seed served on every read |
| **Lucio Amorim** (`lucio.nxlv.ai`) | TanStack Start / CF | 12 MB | 10 | none | 0 | 0 objects | SSR loader fan-out (6 SELECTs/nav, no HTTP cache) |
| **nxlv** (`Lucio Amorim`) | TanStack Start / CF | 12 MB | 7 | none | 5 | 0 objects | Build-mode editor (runtime confirmed clean) |
| **Go Do It / godoit** | TanStack Start / CF Worker | ~3 MB | 30 | **9** | 0 (server routes) | none | Reconcile cron token spike + `embed-queue` 720 no-ops/day |
| **Websummit Rio** (Gente Legal) | React | — | ~20 | none | server fns | avatars 16 MB | Trigger fan-out (200 notifs/onboarding) + wide Realtime |
| **Smart Deals** | React | — | 13 + 4 views | pg_cron + pg_net | 16 | — | Always-on Telegram poll + idle scheduled fns on a dead account |
| **The Monday Test** | TanStack Start / CF | tiny (5 rows) | 1 | none | 1 | 0 | Re-generation loop on a persisted error row |
| **buildable** | — | — | — | — | — | — | Ledger analysis (1.53 M tokens, single model) — not a burn case |
| **hackathons** | React 18 + Vite 5 | — | multi-tenant | — | AI fns present | 68 MB | Healthy product-usage report — no runaway |
| **desafio-genial** | Vite + React | — | — | — | — | — | Outlier: public-page / checkout-CTA audit, not a backend audit |

**Immediate read of the table.** Database *size* is almost never the cost driver — the largest DB (687 MB) is dominated by a runaway log table, and most projects sit at 10–130 MB. What actually burns credits clusters into a handful of repeating shapes: scheduled jobs that never stop, client/Realtime request amplification, unbounded log tables, and (above all) Build-mode editor activity. Sections 6–9 formalize this.

---

## 2. The canonical Lovable stack

Across all projects a single, recognizable architecture recurs, with a clear generational split.

**Backend — universal.** Every project is **Lovable Cloud = Supabase** underneath: managed Postgres (versions seen: 15, 17.6), Supabase Auth (GoTrue), Storage, Realtime, and Deno Edge Functions. RBAC is implemented identically everywhere via a `user_roles` table plus a `SECURITY DEFINER` `has_role(auth.uid(), app_role)` helper referenced from RLS policies — this is *the* platform idiom and appears in essentially every report. The `pg_stat_statements`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `plpgsql` extension set is the default baseline; `pg_cron` + `pg_net` are added whenever scheduling is needed.

**Frontend — two generations.**

- **Modern generation (majority): TanStack Start v1 on Cloudflare Workers (SSR).** ~9 projects (Go Do It, Lovable Cup, Lucio Amorim/`nxlv`, Opportunity Monitor, The Monday Test, Whos Local, IesBrazil, and others) use TanStack Start with Vite, SSR on a Cloudflare Worker, data access through **TanStack `createServerFn` / `/api/public/*` server routes** rather than Supabase Edge Functions. In this generation, "edge functions" in the Supabase sense are often **zero** — the server logic lives in the Worker. Scheduling is `pg_cron` → `pg_net.http_post` against the app's own public `/api/public/*-cron` URL.
- **Classic generation: Vite + React (+ shadcn/ui) SPA + Supabase Edge Functions.** (GenialPrev, central-genial, ibuiltthis, Smart Deals, Websummit Rio, hackathons, ambassador-os, yapp-to.) Here business logic lives in **Deno Edge Functions** (counts from 1 to 64), invoked from the client or from cron via `net.http_post` to `/functions/v1/*`.

**AI — universal gateway.** LLM/image/TTS calls route through the **Lovable AI Gateway** (`https://ai.gateway.lovable.dev/v1/...`) authenticated by `LOVABLE_API_KEY`. The model of choice is overwhelmingly **Google Gemini** — `gemini-2.5-flash` and `gemini-3-flash-preview` for cheap/high-volume work, `gemini-2.5-pro` / `gemini-3.1-pro-preview` for heavy synthesis, `text-embedding-3-small` for vectors. ElevenLabs (TTS) and Firecrawl (scraping) appear as external providers mediated by edge functions.

**The mental model:** *SPA/SSR frontend → server function or edge function → Supabase Data API (PostgREST) → Postgres*, with `pg_cron`+`pg_net` for time, the AI Gateway for intelligence, and Storage for blobs. Every audit is ultimately a study of where that pipeline loops, fans out, or never turns off.

---

## 3. Quantitative landscape

### 3.1 Database size distribution

| Band | Projects | Note |
|---|---|---|
| < 15 MB | Go Do It (~3), Lucio Amorim (12), nxlv (12), Lovable Cup (13.7), The Monday Test (tiny) | Genuinely small apps; DB is *never* the cost |
| 15–30 MB | Whos Local (18), ambassador-os (22), IesBrazil (~23) | Typical operational size |
| 80–135 MB | yapp-to (88), GenialPrev (95), Opportunity Monitor (126), ibuiltthis (132) | Size driven by **one** table (snapshots/assets/logs), not broad growth |
| > 600 MB | lovable-for-schools (687) | 74 MB of it is a runaway `cron_logs` table |

The consistent finding across the corpus: **a single table dominates each larger DB** — `job_snapshots` is 76 % of Opportunity Monitor; `cron_logs` + `snapshot_rows` dominate lovable-for-schools; `cron.job_run_details` alone is 121 MB in central-genial; `share-cards` is 59 % of ibuiltthis storage. Growth is almost always an **unbounded log or raw-payload table with no retention policy**, never healthy data-model growth.

### 3.2 Scheduling (pg_cron) footprint

| Project | Active jobs | Most aggressive schedule | Confirmed daily invocations | Useful work |
|---|---:|---|---:|---|
| central-genial | 5 | `* * * * *` (telegram poll) | 1,440 | ~0 (1 telegram msg, 0 users) |
| lovable-for-schools | 2 | `* * * * *` (milestones) | 1,728 total | **0** (past a hard-coded deadline) |
| Go Do It / godoit | 9 | `*/2 * * * *` (embed queue) | 720 + 96 + 96 | ~0 (queue structurally empty) |
| ibuiltthis | 6 | `*/5 * * * *` (consent poll) | ~9,428/month | mostly no-op |
| ambassador-os | 2 | `0 * * * *` (hourly) | 48 | no-op (`{"processed":0}`) |
| Whos Local | 3 | `0 * * * *` | 24 (failing DNS) | 0 (dead host) |
| Smart Deals | ≥1 | (unreadable) telegram poll | continuous | 0 (idle since Apr 10) |
| Lovable Cup | 1 | `0 6 * * *` | 1 | ~0 (batch already empty) |
| GenialPrev, IesBrazil, Lucio Amorim, nxlv, The Monday Test, Websummit Rio | 0 | — | 0 | — |

**The single most common runaway shape in the corpus is a `pg_cron` job that fires forever against an empty queue, a paused account, a dead host, or a past deadline** — burning edge/Worker invocations and writing cron-history rows with zero productive output. It appears in at least 7 of the 18 projects.

### 3.3 Edge-function / server-logic footprint

Edge-function counts split cleanly by generation: TanStack-Start projects trend toward **0–1 Supabase edge functions** (logic is in Worker server routes), while classic Vite+React projects carry the heavy inventories — **ibuiltthis 64, central-genial 25, Opportunity Monitor 22, yapp-to 18, Smart Deals 16, ambassador-os 10, lovable-for-schools 10, GenialPrev 9**. High counts correlate with feature sprawl beyond the original spec (central-genial: "25 vs ~7–8 in original spec"; and 17 tables added beyond its 10-table spec).

### 3.4 AI Gateway activity vs. the 7-day-retention blind spot

A near-universal artifact: **`list_ai_gateway_requests` returns 0 for the last 7 days in almost every project** (GenialPrev, Lovable Cup, Lucio Amorim, Opportunity Monitor, The Monday Test, ambassador-os, Whos Local, nxlv, Smart Deals both windows, buildable/hackathons via `ai_usage_logs`). This is **not** zero usage — it is a **short gateway-log retention window** colliding with genuinely bursty, admin-triggered AI usage. The corpus repeatedly shows real historical AI spend (buildable: 1.53 M tokens; ambassador-os: 715,757 tokens in `pipeline_logs`; Go Do It: a 458 K-token day) that is invisible to the 7-day gateway view. **Takeaway: the gateway log is unreliable for cost attribution; projects that built their own ledger table (`event_log`, `usage_ledger`, `pipeline_logs`) could actually answer the question.**

---

## 4. Data-layer patterns

**RLS is on everywhere, but the *quality* of policies is bimodal.** Every project enables RLS on public tables. Two postures recur:

- **Tight & correct:** `auth.uid() = user_id` row scoping + `has_role(auth.uid(),'admin')` for admin paths (Go Do It, nxlv, yapp-to workspace scoping, GenialPrev). This is the intended pattern.
- **Open `USING (true)` / tautology:** operational tables exposed `FOR SELECT TO authenticated USING (true)` (IesBrazil on every table, Opportunity Monitor on `job_snapshots` = 96 MB of raw HTML readable by any signed-in user), tautologies like `USING (id = id)` and anon `UPDATE ... USING (user_id IS NULL)` (The Monday Test), and open anon `INSERT` surfaces with no rate limit (`analytics_events`, `hub_analytics`, `questions`, `email_submissions`, `nxlv_contacts`). These are simultaneously a **security exposure and a cost surface** — an unpaginated `SELECT *` under `USING (true)` returns the whole table on every poll.

**Triggers split into "harmless" and "fan-out."** The overwhelming majority are `updated_at` housekeeping and audit-row writers (IesBrazil's 22 triggers, etc.) — not cost drivers. The dangerous minority are **notification/aggregate fan-out triggers**: Websummit Rio's `on_new_member_notify` writes **up to 200 notification rows per onboarding completion** (2,543 in a single day), each amplified again through Realtime; Lovable Cup's `recompute_builder_badges` fires 6 `INSERT`s on every submission/profile write. Several projects deliberately run **zero** triggers (Opportunity Monitor, ambassador-os, nxlv, lovable-for-schools).

**`SECURITY DEFINER` functions are the RBAC backbone but a linter magnet.** `has_role` is universal and correct. The recurring linter finding is `SECURITY DEFINER` functions left `EXECUTE`-able by `anon`/`authenticated` (Lovable Cup: 6 exposed; Lucio Amorim: `get_db_table_stats`/`get_db_size_summary`) — safe when they gate internally, but flagged.

**pgvector where memory/search exists.** Go Do It (768-dim), godoit (1536-dim `text-embedding-3-small`, HNSW) use pgvector with hybrid RRF/BM25 search RPCs; row counts are tiny (31) so index pressure is nil.

---

## 5. Compute & scheduling patterns

**Scheduling is always `pg_cron` → `pg_net.http_post` → a public HTTP route.** Both the TanStack (`/api/public/*-cron`) and classic (`/functions/v1/*`) generations use this. A subtle, corpus-wide diagnostic trap is documented most clearly in Whos Local: **`cron.job_run_details.status = 'succeeded'` only means pg_cron issued the `net.http_post`, not that the HTTP call worked** — DNS failures and 401s surface only in `net._http_response`. Several audits warn that a project can look "idle" in `monitoring_runs` while still billing invocations because the cron fires but the target 401s/NXDOMAINs.

**Client-side request amplification is the second major cost family** (rivalling cron), and it has a consistent signature:

- **`staleTime: 0` + hover-preload** (`defaultPreloadStaleTime: 0`) → every TanStack Router `Link` hover refetches (Lovable Cup: one key/value setting hit **2,694 times**; Lucio Amorim: ~8,400 SELECTs from 6-query home bundles with no HTTP cache).
- **`refetchInterval` / `setInterval` polling that ignores tab visibility** — `refetchIntervalInBackground: true` (IesBrazil's 4 s dock poll runs in hidden tabs; a single stuck `cancelling` batch polled every 2 s for 11 days), 8 s profile polls (Lovable Cup: 10,800 calls/tab/day), and 30–60 s "always-mounted" component pollers (Websummit Rio, GenialPrev).
- **Multiple un-deduplicated `onAuthStateChange` subscribers** firing global `queryClient.invalidateQueries()` with no key filter (Lovable Cup 4, Lucio Amorim 4) — one auth event refetches the entire cache.

**Realtime, where used, is used in its most expensive shape.** ibuiltthis's `realtime.list_changes` WAL decoder is its **#1 workload at 1.7 M calls / 7.9 M ms — ~6× the next query**, driven by putting three high-write log tables in the `supabase_realtime` publication. Websummit Rio publishes 7 high-churn tables and subscribes 11 client channels on `event: "*"` that each trigger a **full loader refetch** rather than an incremental patch. The consistent anti-pattern: *broad publication + wildcard subscription + full reload on every event.*

**The "idle-but-burning" phenomenon is the corpus's signature.** Project after project has had **zero real user activity for weeks or months** (Smart Deals idle since Apr 10; Opportunity Monitor frozen since Jun 18; central-genial 101 days idle; lovable-for-schools past a Feb 1 deadline; ibuiltthis no pipeline runs in 100+ days) — yet cron jobs, pollers, and Realtime decoders keep consuming compute. **Runtime cost on these projects is decoupled from usage**, which is exactly why it surprises operators.

---

## 6. AI / LLM usage patterns

**One gateway, one model family.** All AI flows through the Lovable AI Gateway on Gemini (Flash for volume, Pro for synthesis) + `text-embedding-3-small`. No project uses third-party model keys for core flows (a stray unused `NVIDIA_API_KEY` in Go Do It is the only exception, flagged for cleanup).

**Broken/churning model IDs are a live latent cost.** Preview aliases rot: Opportunity Monitor hard-codes the **non-existent `google/gemini-3.1-flash-lite` across 7 edge functions** (every call 400s, then falls back — but the failed call still bills); The Monday Test's fallback chain `[gemini-3.1-pro-preview, gemini-2.5-pro]` pays for a failed first attempt plus the more expensive second model. Pinning to catalog models is a repeated recommendation.

**No cost ceilings.** `ai_config.max_cost_usd = NULL` (ambassador-os); no per-day token cap in the reconcile loop (Go Do It) — where a single guard regression on 2026-06-26 produced **458,231 tokens in one day vs. 0 on all 13 other days in the window**. The corpus lesson: **the only thing between "0 tokens" and "700 K tokens/day" is often one boolean guard, with no circuit breaker behind it.**

**AI usage is bursty and admin-triggered, not continuous.** buildable's entire 1.53 M-token spend is two batch days (May 29–30 = 88 % of tokens); ibuiltthis's storage skew traces to a 306-share-card burst over two February days. Steady daily burn is almost always *infrastructure* (cron/Realtime/polling), while AI is *spiky*.

**Instrumentation is the weak link.** Half the projects can't quantify their own AI spend: `ai_usage_logs` exists but has **0 rows** because only some call sites write to it (yapp-to: 3 of ~6 functions log; TTS entirely unmetered; `estimated_cost_usd` NULL for all 158 rows in buildable; `llm_usage_logs` empty in ibuiltthis). Projects that *did* build a real ledger (`event_log`, `usage_ledger`, `pipeline_logs`) are the only ones that can attribute cost retroactively.

---

## 7. The credit-burn taxonomy

Every driver in the corpus collapses into six repeating categories. This is the qualitative heart of the landscape.

**A. Perpetual scheduled work (most common).** A `pg_cron` job that never stops regardless of state: firing every 1–2 minutes (central-genial 1,440/day, lovable-for-schools 1,440/day, Go Do It 720/day), against an empty queue, a paused user, a dead host, or a past deadline. *Signature:* high `net.http_post` count in `pg_stat_statements`; `cron.job_run_details` bloat; `{"processed":0}` responses.

**B. Client & Realtime request amplification.** `staleTime:0` + hover-preload, background-running `refetchInterval`, un-deduplicated auth subscribers, and wildcard Realtime subscriptions that full-reload. *Signature:* one trivial query with thousands of calls; WAL decoder as top query; cost scales with *open-tab-hours*, not actions.

**C. Unbounded log / raw-payload tables.** `db_admin_log`, `cron_logs`, `cron.job_run_details`, `job_snapshots` (raw HTML), `snapshots.source_html`, `notifications`, `share-cards/*.png` — no TTL, no retention, no rotation. *Signature:* one table = most of the DB/storage; `n_live_tup` on a log table exceeds all data tables combined.

**D. Trigger / write fan-out.** One user action writing N rows: 200 notifications per onboarding (Websummit Rio), 6 aggregate INSERTs per write (Lovable Cup), ~80 progress-`UPDATE`s per scan and delete-all+reinsert location churn (Opportunity Monitor, Whos Local's `sync-events`). *Signature:* `n_tup_upd` ≫ `n_tup_ins`; WAL growth on a small DB.

**E. Uncapped AI fan-out.** A cron tick that calls 8 AI-using functions in sequence (Opportunity Monitor's `auto-backfill` — up to 219 Gemini calls/tick), N×M per-user match generation, or a client re-generation loop on a persisted error row (The Monday Test). *Signature:* token spikes with no ceiling; parallel `Promise.allSettled` gateway calls with no rate limit.

**F. Build-mode / agent editor activity (the real #1, see §9).** Not a runtime defect at all — the credits are spent *authoring* the app in Lovable's editor, not running it.

Most projects exhibit **two or three categories at once**; the audits rank them per project. A useful generalization: **A + C almost always co-occur** (a perpetual job feeds an unbounded log), and **B is the default state of any TanStack project that never tuned `staleTime`.**

---

## 8. Security posture

The audits are burn-focused but surface a remarkably consistent security profile worth consolidating, because several findings are *also* cost surfaces.

**Anon JWT hard-coded in `cron.job.command`.** The most widespread security finding — the project's anon JWT is embedded in plaintext in the `Authorization: Bearer …` header stored in `cron.job`, readable by anyone with `cron` schema access (central-genial, with a **60-year** expiry to 2086; lovable-for-schools; ambassador-os; Whos Local). Recommendation everywhere: move to Vault-resolved secrets or the `apikey` pattern.

**Open write surfaces without rate limiting.** Anon/`public`-role `INSERT` policies with no captcha or throttle on `analytics_events`, `hub_analytics`, `questions`, `email_submissions`, `nxlv_contacts`, `nxlv_diagnostic_requests`, and `cron_logs`/`system_config` `UPDATE` open to `public` in lovable-for-schools (anyone could flip `cron_enabled` or the scraping deadline).

**Leaked service-role paths.** Opportunity Monitor still ships a `reveal-service-key` edge function (its own banner says "DELETE THIS FUNCTION immediately") returning `SUPABASE_SERVICE_ROLE_KEY` over HTTP behind a single shared secret — flagged **critical**, rotate + delete.

**PII exposure via broad reads.** `USING (true)` SELECTs expose member names/cities (Whos Local `activity_log`), diagnostic PII (The Monday Test tautology policy), and `recipient_email` (yapp-to `form_links`). `dangerouslySetInnerHTML` on AI output over anonymous input is an XSS vector (yapp-to `FormAnalytics`).

**`verify_jwt = false` public functions** (Smart Deals `deal-api`, Lucio Amorim `render-markdown`/`send-diagnostic-notification`, yapp-to `sign-link`) are legitimate but uniformly lack function-layer rate limiting.

The through-line: **single-tenant tolerances (open reads, blanket policies) have been shipped to production and would be unsafe the moment these apps go multi-tenant.**

---

## 9. The real cost model — where credits actually go

The most valuable quantitative artifact in the corpus is the **`nxlv` report's workspace-wide billing breakdown**, because it moves from per-project speculation to an actual credit ledger:

| Billable item | Credits (7 days) | Share |
|---|---:|---:|
| **Build-mode messages** | 311.30 | **62.3 %** |
| Cloud compute (Postgres baseline, all projects) | 122.79 | 24.6 % |
| Omni messages | 63.64 | 12.7 % |
| AI Gateway (Gemini 2.5 Flash in+out) | 1.04 | 0.21 % |
| Cloud functions (all edge invocations, all projects) | 0.74 | 0.15 % |
| Cloud egress / storage / realtime / embeddings | < 0.3 combined | < 0.1 % |
| **Workspace total** | **499.79** | 100 % |

This reframes every other report. **~87 % of workspace credits are Build-mode + Omni editor activity and flat Cloud compute baseline; runtime AI Gateway + edge functions together are under 0.4 %.** For the specific project, ~92 of 98 weekly credits were Build-mode messages, not the deployed app.

Reconciled against the rest of the corpus, the cost model generalizes to three tiers:

1. **Dominant — Build/agent editor spend.** Large multi-file refactors, plan-mode messages, and heavy skills (GenialPrev's Remotion video pipeline with 15+ compositions and Drive uploads; wireframe/humanize/video-creator runs). This is *operator behavior*, scales with edit scope, and is where the surprise usually lives (GenialPrev, nxlv, Lucio Amorim all conclude "runtime is clean, look at the editor").
2. **Structural baseline — Cloud compute "pico."** A per-project Postgres instance baseline (~6 credits/week/project amortized; ~19 Cloud projects in this workspace). Unavoidable while Cloud is on, and it is why *idle* projects still cost money.
3. **Variable runtime — the anti-patterns of §7.** Real but usually small per project, spiking when a guard fails (the 458 K-token day) or when a latent runaway is "fixed" wrong (Whos Local's dead-host cron would jump to ~15–22 K writes/day the moment the URL is corrected without also fixing the delete-all pattern).

**The single most important platform insight:** operators reading a "daily credit burn" alarm instinctively suspect their running app, but the evidence says the burn is *first* editor activity, *second* the flat per-instance Cloud baseline across many idle projects, and only *third* the runtime code — and even then it's infrastructure plumbing (cron/Realtime/polling) far more than AI inference.

---

## 10. Cross-cutting recommendations

Synthesized from the remediation sections of all reports, deduplicated and ranked by how often they recur and how much they save:

1. **Gate or delete perpetual crons.** Convert every-1–2-minute pollers to `*/15`+ or, better, event-driven (`AFTER INSERT` trigger → `pg_net`); disable jobs on paused/idle accounts; auto-pause scheduled functions when `max(activity) > 30 days` old. (Applies to central-genial, lovable-for-schools, Go Do It, ibuiltthis, ambassador-os, Smart Deals.)
2. **Add retention to every log/raw table.** `DELETE … WHERE created_at < now() - interval '30 days'` on `db_admin_log`, `cron_logs`, `cron.job_run_details`, `notifications`, `job_snapshots`, plus WebP/downsize + TTL for generated media. (IesBrazil, lovable-for-schools, central-genial, Opportunity Monitor, Websummit Rio, ibuiltthis.)
3. **Fix the client request layer.** Global `staleTime: 60_000`, `defaultPreloadStaleTime ≥ 30s`, `refetchIntervalInBackground: false`, pause polling on `document.hidden`, collapse `onAuthStateChange` to one subscriber with keyed invalidation. (Lovable Cup, Lucio Amorim, IesBrazil, GenialPrev.)
4. **Narrow Realtime.** Publish only what the UI needs, per-row filters, incremental payload updates instead of full loader reloads; drop log tables from `supabase_realtime`. (ibuiltthis, Websummit Rio, Smart Deals.)
5. **Add AI cost ceilings + instrumentation.** A hard per-day token cap / circuit breaker before every gateway call; set `ai_config.max_cost_usd`; write **every** LLM/TTS/STT call to a usage ledger; pin catalog model IDs. (Go Do It, ambassador-os, Opportunity Monitor, The Monday Test, yapp-to, buildable.)
6. **Tighten RLS & secrets.** Replace `USING (true)` with role/tenant predicates, rate-limit anon INSERT surfaces, move cron bearer tokens to Vault, delete `reveal-service-key` and rotate keys. (Opportunity Monitor, The Monday Test, lovable-for-schools, Whos Local, central-genial.)
7. **Instrument build-mode attribution.** Because Build-mode dominates, the highest-leverage *observability* fix is `credits--get_credit_balance` grouped by `billable_item`/`user`/`project` — the only way to separate editor spend from runtime spend. (nxlv, GenialPrev.)

---

## Part II — Per-Project Appendix

One card per source report, preserving each project's distinctive numbers and findings. Ordered roughly by backend footprint. Cards marked ⚠ are the clearest runaway cases; ✅ are confirmed-clean-at-runtime; ◆ are non-burn reports (product/link audits).

### lovable-for-schools ⚠ — *Real-time Tracker*
Ref `qltdmdkamnyymqjjbtlw` · React+Vite · **DB 687 MB**. Two `pg_cron` jobs still active and useless: `process-incremental-milestones` at `* * * * *` (**1,440/day**, always "No pending snapshots") and `run-due-targets` at `*/5` (**288/day**, 100 % `skipped` — past a hard-coded `SCRAPING_DEADLINE = 2026-02-01`, now 149 days stale). **246,763 cumulative invocations** since Feb; `cron_logs` = **74 MB / 246,763 rows** with no retention (4 indexes updated per insert). `snapshots.source_html` stores raw HTML in Postgres (~23 MB). RLS holes: INSERT/UPDATE granted to `{public}` on `cron_logs`, `school_milestones`, and **`system_config`** (anyone could flip `cron_enabled`/deadline); anon JWT in cron command. *Fix:* `cron.unschedule` both jobs (kills 1,728 EF + 3,456 DB writes/day), truncate `cron_logs`, move HTML to Storage, lock RLS to `{authenticated}`.

### ibuiltthis ⚠
Ref `ewbssctgqysiokropuos` · Vite/React + Supabase PG15 · **DB 132 MB · 64 edge functions · 86 auth users · 6 cron jobs**. #1 workload is the **Realtime WAL decoder `realtime.list_changes`: 1,717,705 calls / 7,914,412 ms (~6× the next query)** — caused by 3 high-write log tables (`generation_logs`, `notifications`, `batch_operations`) in the `supabase_realtime` publication. #2 is `net.http_post` cron fan-out: **43,729 calls**, led by `process-consent-replies` at `*/5` (8,640/mo). Storage: `share-cards` = **344 MB (59 %)** of a 581 MB bucket, un-deduped PNGs from a 306-card burst over 2 days in Feb. 18 `batch_operations` stuck `running` since Feb. `llm_usage_logs` empty (instrumentation gap). No pipeline runs in 100+ days → burn is **infrastructure, not AI**. *Fix:* drop `batch_operations`+`generation_logs` from publication (poll instead); consent poll → `*/30` or Slack webhook; PNG→WebP + size limit.

### Opportunity Monitor ⚠
Ref `qjptopcdxcjtrmmxkkcn` · TanStack Start · **DB 126 MB · 22 edge functions**. `job_snapshots` = **7,440 rows / 96 MB (76 % of DB)**, raw HTML per scan, no TTL, and readable by any authenticated user (`USING (true)`). `auto-backfill` cron sequentially calls **8 AI-using edge functions/tick (worst case ~219 Gemini calls)**; `recalc-matches` is N×M per user (≤50 jobs × 1 Gemini call). **Broken model id `google/gemini-3.1-flash-lite` hard-coded in 7 functions** → every call 400s but still bills. **`reveal-service-key` edge function still deployed** (returns `SERVICE_ROLE_KEY` over HTTP — critical). `monitoring_runs`: 96 ok vs **97 failed** lifetime; OpenAI source stuck at cursor 291/717 since Jun 18. `monitoring_runs` updated ~80×/scan. Backend idle since 2026-06-18. *Fix:* delete `reveal-service-key`+rotate; fix model id; snapshot retention; batch progress updates; upsert locations.

### GenialPrev Classic ✅
Ref `gqcjalnzfboqibbzlbdr` · Vite/React · **DB 95.4 MB · 18 tables · 9 edge functions**. Runtime **small and stable**: 5/60 connections, 0 cron jobs (`pg_cron` installed, unused), AI Gateway 0/7d, 0 storage buckets, no Realtime. Top DB writer is the external `manychat-contact-webhook` (757 INSERTs in window; idempotent on `manychat_id`). Only real inefficiencies: `useAdminStats` fires **13 parallel `count:exact` queries per admin mount** (no cache), and 20 s ranking/leaderboard polls. **Conclusion: burn is Build/agent** — large refactors + a Remotion video pipeline (15+ compositions, render scripts, Drive uploads) + plan-mode messages. *Fix:* collapse the 13 counts into one RPC + React Query `staleTime`; check `credits--get_credit_balance` by `billable_item`.

### yapp-to ⚠ (observability)
Ref `7184605c-…` · React · **DB 88 MB · 25 tables · 18 edge functions**. Multi-tenant by `workspace_id` (`is_workspace_member()`/`has_role()`). Cost model is **unmeasured, not runaway**: `ai_usage_logs` has **0 rows** despite instrumentation — only 3 of ~6 LLM functions log; **ElevenLabs TTS is entirely uncounted** and is likely the dominant external spend; `interpret-voice-answer` fires on every voice answer with no logging. `tts_cache` (keyed by workspace/voice/hash/lang) empty because no publish job has run. Storage: 2 **public** buckets, **no `file_size_limit`**, anon INSERT without path/ownership checks; voice answers double-store audio + transcript. 2 crons (`process-scheduled-messages`, `purge-orphan-uploads`). *Fix:* instrument every LLM/TTS/STT call site; bucket size limits + ownership checks; archive completed-session media.

### central-genial ⚠
Ref `ezdckbupdqjrfmoetbjc` · Vite/React/Shadcn · **1 auth user, idle since 2026-03-21 (101 days)** · **27 tables · 25 edge functions**. **Primary cause: `poll-telegram-updates` cron at `* * * * *` = 1,440 EF calls/day, 150,747 total runs (~104 days).** The `telegram-poll` function is a `while(true)` long-poll blocking up to **55 s per invocation** (not a light ping) using the service-role key. `cron.job_run_details` = **121 MB** (150,747 rows for job 2), no TTL. 5 crons total; anon JWT hard-coded in all commands with a **60-year expiry (2086)**. Feature sprawl: 17 tables + ~15 edge functions beyond the 10-table/~8-fn spec (WhatsApp, Yapp, transcribe-audio). *Fix:* `cron.unschedule('poll-telegram-updates')` (−1,440/day), purge cron history (−121 MB), rotate anon key, pause daily jobs until PRO users exist.

### IesBrazil Pipeline ⚠
Schema v14 · TanStack Start (server functions) · **DB ~23 MB**. No `pg_cron`/`pg_net` — **all scheduling is client browser polling**. Global `BatchTrackerProvider` mounted at the authenticated layout polls `recent-batches` every **4 s in background** (`refetchIntervalInBackground:true`) + each tracked batch every **2 s**; `TERMINAL_BATCH` omits `'cancelling'`, so **one undismissed batch from Jun 19 has been polled every 2 s for ~11 days across every open tab**. 14+ additional 30–60 s background pollers → ~25 scheduled queries/min per idle user. `db_admin_log` = **11,584 rows / 2.9 MB, largest table in DB, no retention**. RLS `USING (true)` for `authenticated` on every operational table → full-table reads per poll. LLM negligible (11 calls, ~$0.0014). 1 edge fn (`db-admin`) + Firecrawl relay (146 scrapes, ~30 MB, 66 % NULL enrichment). *Fix:* mark `cancelling` terminal + 10-min janitor; `refetchIntervalInBackground:false`; log retention; `LIMIT`+pagination.

### ambassador-os ⚠
Ref `qnpkncoumgqipianvxdn` · Supabase PG17.6 · **DB 22 MB · 21 tables · 10 edge functions · 2 cron jobs**. `hourly-signal-extraction` calls `extract-field-signals` **48/day (336/7d), forever** (though that function is deterministic regex — no AI per run); `hourly-churn-update` runs `update_churn_status()` 24/day. Anon JWT hard-coded in cron. **5 zombie `ingestion_jobs` stuck `running`** (oldest Feb 22, no watchdog). 724 `imported_messages` permanently `pending` (re-scanned each tick). **`ai_config.max_cost_usd = NULL`** — no AI budget cap; historical AI = 715,757 tokens across 468 `pipeline_logs` (admin-driven, idle since Apr 8). Every "Admins can insert…" policy lacks a `WITH CHECK`; anon INSERT open on `hub_analytics`/`questions`. No user triggers. *Fix:* set `max_cost_usd`; throttle/condition the hourly cron; Vault the JWT; add `WITH CHECK`; job watchdog.

### Whos Local ⚠
Ref `auivdtjkovyfoseuczkx` · TanStack Start · **DB 18 MB · 12 tables**. Two of three crons point at a **dead host `*.lovable-project.com`** → fail DNS 24×/day (visible only in `net._http_response`, while `cron.job_run_details` misleadingly says `succeeded`). **`signup_completed` fires on every `SIGNED_IN`** (page load/tab focus) not first signup → 369 rows vs 32 real users (one user: **263**). Stale clients still query renamed `ambassadors*` tables → **2,055 wasted PostgREST 404-calls**. **Latent bomb:** `sync-events` uses delete-all+reinsert on organizers — fixing the dead URL without fixing this jumps to **~15–22 K writes/day**. Anon JWT in cron; `activity_log`/`avatars` over-broad reads. 1 edge fn (`match-insight`, user-triggered, low). *Fix:* guard `signup_completed`; retire stale clients; fix URL **and** dedup in one patch; Vault tokens.

### Lovable Cup ⚠
Ref `17d9ac09-…` · TanStack Start / CF Worker · **DB 13.7 MB, WAL 96 MB (~7×)**. **99.5 % of `submissions` and 99 % of `profiles` are demo-seed** rows (from `seed-demo-data`), served on every public read (no `is_demo=false` filter). `staleTime:0` everywhere (`defaultPreloadStaleTime:0`) + hover-preload → `app_settings.sticker_bg` lookup hit **2,694 times**. `/submeter` polls the profile every **8 s** → **10,800 calls/user/day**. **4 `onAuthStateChange` subscribers** each firing unkeyed `invalidateQueries()`. Cron points at the **preview host** not production. Linter: 11 warnings (6 anon/auth-executable SECURITY DEFINER fns). `recompute_builder_badges` = 6 INSERTs/write. AI Gateway 0/7d, 0 storage objects. *Fix:* global `staleTime:60s`; replace 8 s poll with Realtime/button; one auth subscriber; filter demo rows; repoint cron.

### Lucio Amorim ✅ (`lucio.nxlv.ai`)
Ref `vrglpslgfxakkpzzkjvl` · TanStack Start / CF · **DB 12 MB · 10 tables**. **No AI, no edge functions, no cron, no `pg_cron`, 0 storage objects, no Realtime.** Primary (small) cost is **SSR loader fan-out**: `getHomeBundle` fires **6 PostgREST SELECTs on every navigation** that misses cache (~1,700 calls each × 6 = ~8,400 total), no HTTP cache header, and `defaultPreloadStaleTime:0` re-fires on hover. Only `/api/public/upcoming.json` is CDN-cached (24 h). Anomaly: **73,653 rolled-back transactions** since boot (no deadlocks — likely RLS/PostgREST `BEGIN…ROLLBACK` on read paths). 4 un-deduped auth listeners. *Fix:* `Cache-Control: s-maxage=300` on `getHomeBundle`; raise `defaultPreloadStaleTime`; if workspace burn is high it is **not** this project — check siblings.

### nxlv ✅ (`Lucio Amorim`)
Ref `xefkdotgotpmrheboayg` · TanStack Start / CF · **DB 12 MB · 7 rows total · 5 edge functions**. **Runtime confirmed clean:** no triggers, no cron (`pg_cron` not installed), 0 storage objects, no Realtime (`Cloud realtime` = 0.00039 cr), no polling, AI Gateway 0/7d, slowest query 37.76 ms. **Carries the workspace billing breakdown** (see §9): Build-mode = **62.3 %** of 499.79 workspace credits; this project billed 98 cr/7d of which ~**92 are Build-mode editor messages**, ~6 the Cloud pico baseline. Flags: 2 anon-INSERT forms + 2 `verify_jwt=false` fns (no rate limit), unexploited. **Verdict: investigate editor sessions, not the deployed stack.**

### Go Do It / godoit ⚠ (two reports, one project)
Ref `omvmvhhyaikegkktlrct` · TanStack Start / CF Worker + Supabase · **DB ~3 MB · 30 tables · 9 cron jobs · 0 Supabase edge fns** (logic in `/api/public/*-cron` server routes). **`embed-queue-2min` fires 720/day against a structurally empty queue** (31/31 `thought_units` already `embedded`) — pure idle tax. **`do-it-reconcile-15min`**: the `shouldBypassReconcile` guard is the *only* cost protection — on **2026-06-26 it failed all day → 458,231 Gemini-2.5-Flash tokens (96 calls)** vs **0 tokens on all 13 other days**; no circuit breaker. `ops-alerts-push-15min` runs 24/7 with no op-window filter (96/day). pgvector hybrid search (768/1536-dim). Service-role key used by all crons. Unused `NVIDIA_API_KEY`. *Fix:* daily token ceiling in `runReconciliation` (kills ~85 % of waste); embed-queue → `*/15` or event-driven; window-guard ops-alerts; unit-test the bypass logic.

### Websummit Rio ⚠ (*Gente Legal*)
Companion app · React · audited 2026-06-29. **`on_new_member_notify` trigger writes up to 200 notification rows per onboarding completion** (100 `new_member` + 100 `match_quality`) → **2,543 notifications in one day** (Jun 12); table now **4,234 rows, 96.7 % unread, no retention**. **Wide Realtime:** `supabase_realtime` publishes 7 high-churn tables; 11 client subscriptions on `event:"*"` each trigger a **full loader reload** (not incremental). Algo matchmaker fires **Gemini-3-Flash per match in parallel** (`Promise.allSettled`, no cache, ~106 calls); `AlgoMatchRunner` mounted in `__root.tsx` runs a full candidate scan on every cold tab. Always-mounted 30–60 s pollers (`NotificationBell`, `ChatWidget`, `RitualBanner`, `/report` at 30 s = 2,880/day/tab). No `pg_cron`. Storage `avatars` 11 obj/16 MB. *Fix:* digest the trigger; narrow publication to per-user `notifications`; payload-driven updates; notification retention.

### Smart Deals ⚠
Ref `6d5c7cdc-…` · B2B deal-intelligence console · **functionally idle since 2026-04-10 (~81 days)** · 13 tables + 4 views · 16 edge functions · `pg_cron`+`pg_net`. Prime suspects all **scheduled on a dead account**: always-on `telegram-poll` long-poll, `sync-external-sources` (cross-project bridge to "Relationship Pulse" via `RP_SERVICE_ROLE_KEY`), and `telegram-digest`. **Cost-reconciliation anomaly: 140 credits used but AI Gateway logs show 0 requests** for both June and the Mar–Apr active window, while the DB proves ≥130 LLM calls (triple-LLM pipeline: preprocess→pass1→pass2, 3–5 calls/import). `deal-api` is `verify_jwt=false` (manual `x-api-key`). Realtime on `raw_inputs` with no filter + `SELECT *` on every change. *Fix:* pull `cron.job` HQ-side; auto-pause scheduled fns when `max(imported_at) > 30 days`; reconcile billing vs gateway logs.

### The Monday Test ⚠
Ref `vqbgnsmqhslovstmimoc` · TanStack Start / CF · **1 table (`diagnostics`, 5 rows), fully anonymous**. Single defect: a client `useEffect` re-invokes `generate-report` **on every page view of any row whose `report_json` lacks `executive_verdict`** — and the function persists *error envelopes* (which also lack the key), so failures loop forever. **1 of 5 rows is in this state** (`f20a2f87…`, stuck on a stale `claude-opus-4-5 401` error), re-calling `gemini-3.1-pro-preview`→`gemini-2.5-pro` on every visit. RLS: anon SELECT tautology `USING (id = id)` (exposes all rows + PII) and anon UPDATE `USING (user_id IS NULL)` (anyone can wipe a row → forces regeneration). No cron, no storage, no Realtime, no polling. *Fix:* treat any non-empty `report_json` (incl. errors) as a stop + "Retry" button; idempotency/lock in the function; heal the row; drop the tautology policies; pin models.

### buildable ◆ (ledger analysis)
Source `public.usage_ledger`, window May 18–Jun 20. **158 ledger rows, single model `google/gemini-3-flash-preview`, 1,529,370 total tokens** (1.31 M prompt / 223 K completion), **Firecrawl 2.52 M chars**. **Two batch days (May 29–30, ~70 jobs each) = 88 % of all token spend**; June essentially idle (2 calls in 20 days). Latency p50 9.8 s / p99 17.3 s. Instrumentation gaps: `estimated_cost_usd` NULL for all 158 rows; `enrichment_ms`/`perplexity_used` all zero; 6 analyses (164−158) have no ledger row. Not a burn case — a clean demonstration that **AI spend is bursty and needs a populated cost ledger**.

### hackathons ◆ (product usage)
`lovablehackathons.com.br` · multi-tenant (by `event_id` in JWT + RLS) · React 18 + Vite 5 + Deno edge fns. Healthy: **8 events, 221 users, 36 submissions, 856 telemetry events** over 4 months; three event modes (team/individual/lecture) validated. **AI cost US$0.00 in period** (`ai_usage_logs` 0 rows) — cover/feedback generation (Gemini 3.1 Flash Image / 3.1 Pro) runs on demand, no batch fired. Storage **57 files / 68 MB** across 5 buckets, RLS hardened by `event_id`/`team_id` in June. Integrations: Gmail + Google Maps connectors, IBT Brasil bidirectional sync. No runaway — included for its clean multi-tenant architecture reference.

### desafio-genial ◆ (CTA/link audit — outlier)
`desafiogenial-react` · **Not a backend/credit audit** — a public-page and checkout-CTA verification. 5 pages, **18 CTAs (17 OK, 1 attention)**. Single source of truth `src/config/checkoutLinks.ts` with a host allowlist (`app.previdenciagenial.com.br`, `wa.me`, `genialprev.curseduca.pro`); UTMs propagated via `useCheckoutWithUtm`. One flagged item: the members-area URL is HTTP (not HTTPS) and needs validation. Good practice reference: centralized links, allowlist, `noindex` audit page. Included for completeness; contributes no backend metrics to Part I.

---

*End of consolidated landscape. Source reports retained unchanged in the same folder; every figure above is traceable to its originating `*_USAGE_REPORT.md`.*

