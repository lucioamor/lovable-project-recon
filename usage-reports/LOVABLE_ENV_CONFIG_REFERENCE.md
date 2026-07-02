# Lovable Apps — Environment, Configuration & Code Reference

### The concrete "other side" of the landscape: identifiers, secrets, config flags, extensions, model IDs, verbatim code/SQL, and the audit query library

**Consolidated:** 2026-06-30
**Companion to:** `LOVABLE_TECHNICAL_LANDSCAPE.md` (that file = analysis; this file = artifacts)
**Source corpus:** the same 20 `*_USAGE_REPORT.md` audits
**Scope:** examples, snippets and specs only — minimal prose. Every item is tagged with its source project.

> **Coverage is uneven by design.** Some reports document env/secrets/config explicitly (Smart Deals, Go Do It, Opportunity Monitor, ambassador-os, central-genial, nxlv, yapp-to); others barely mention them (buildable, hackathons, desafio-genial, Websummit Rio). Cells that a report never stated are marked `— (not documented)` rather than guessed.
>
> **Security note.** Where a source report pasted a full anon JWT verbatim (central-genial, lovable-for-schools), this file reproduces only the **shape** (`Bearer eyJhbGciOi…⟨anon JWT, redacted⟩`). The full tokens remain in the original reports and were flagged for rotation there.

---

## 1. Project & environment identifiers

| Project | Supabase ref / project ID | Published host | Frontend stack |
|---|---|---|---|
| GenialPrev Classic | `gqcjalnzfboqibbzlbdr` | — | Vite + React |
| Go Do It / godoit | `omvmvhhyaikegkktlrct` | `https://godoit.lovable.app` | TanStack Start / CF Worker |
| IesBrazil Pipeline | `schema_versions` v14 (ref n/d) | — | TanStack Start (server fns) |
| Lovable Cup | `17d9ac09-1017-488c-b8f4-d072e398dac6` | `lovablecup.com` (+ preview `project--17d9ac09-…lovable.app`) | TanStack Start / CF Worker |
| Lucio Amorim (`lucio.nxlv.ai`) | `vrglpslgfxakkpzzkjvl` | `lucio.nxlv.ai` | TanStack Start / CF |
| nxlv (`Lucio Amorim`) | `xefkdotgotpmrheboayg` · proj `f0bb6f3f-8326-41df-880c-a53b03a4a3bf` | — | TanStack Start / CF |
| Opportunity Monitor | `qjptopcdxcjtrmmxkkcn` | — | TanStack Start |
| Smart Deals | `6d5c7cdc-8513-42b5-9d27-cc879a9d1afd` | — | React |
| The Monday Test | `vqbgnsmqhslovstmimoc` · proj `4acd0bf1-5ffc-4c6d-a704-095a3b1dcc6c` | share links `/resultado/$id` | TanStack Start / CF |
| Websummit Rio (Gente Legal) | — (not documented) | — | React |
| Whos Local | `auivdtjkovyfoseuczkx` | `https://whos-local.lovable.app` | TanStack Start |
| ambassador-os | `qnpkncoumgqipianvxdn` · proj `376ba085-7806-47c6-bbf5-3e784109dc81` | — | React |
| buildable | — (not documented) | — | — |
| central-genial | `ezdckbupdqjrfmoetbjc` · proj `6112a362-5c90-450a-b608-f1f324f4c40a` | — | Vite + React + Shadcn |
| desafio-genial | `desafiogenial-react` (repo) | `app.previdenciagenial.com.br` (checkout) | Vite + React |
| hackathons | — (not documented) | `lovablehackathons.com.br` | React 18 + Vite 5 |
| ibuiltthis | `ewbssctgqysiokropuos` | — | Vite + React |
| lovable-for-schools | `qltdmdkamnyymqjjbtlw` · proj `fa6aee98-ab01-44d6-bc25-bb3969874e9b` | — | React + Vite |
| yapp-to | `7184605c-3941-4251-b518-6b29610bd5c8` | — | React |

---

## 2. Secrets / environment variables

### 2.1 Platform-standard (appear or are implied across the corpus)

| Var | Meaning | Notes |
|---|---|---|
| `LOVABLE_API_KEY` | Auth to Lovable AI Gateway | Universal for any AI/TTS call |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role DB access (bypasses RLS) | Used by cron/edge fns; **never** in client bundle |
| `SUPABASE_URL` | Backend URL | |
| `VITE_SUPABASE_URL` | Frontend backend URL | Vite `.env` (public) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key | Vite `.env` (public) — nxlv |
| `VITE_SUPABASE_PROJECT_ID` | Project id | Vite `.env` (public) — nxlv |

### 2.2 Per-project secrets (as explicitly listed by each report)

| Project | Project-specific secrets |
|---|---|
| Go Do It / godoit | `OPS_CRON_SECRET`, `VOICEMONKEY_TOKEN`, `NVIDIA_API_KEY` **(dead — no call site, flagged for cleanup)** |
| Opportunity Monitor | `FIRECRAWL_API_KEY`, `CRON_SECRET` |
| Smart Deals | `DEAL_API_KEY` (public-facing), `TELEGRAM_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_MAIL_API_KEY`, `GOOGLE_CALENDAR_API_KEY`, `SLACK_API_KEY`, `RP_SERVICE_ROLE_KEY` + `RP_SUPABASE_URL` (cross-project → "Relationship Pulse") |
| Whos Local | `SOCIAL_HOOK_SECRET` (`x-hook-secret`); anon JWT embedded in cron command |
| ambassador-os | anon JWT embedded in cron; `LOVABLE_API_KEY` via `ai_config.api_key_secret_name` |
| central-genial | anon JWT embedded in all 5 cron commands (60-year expiry) |
| lovable-for-schools | anon JWT embedded in cron command |
| GenialPrev | `LIVE_REMINDERS_PAUSED` (defaults `'true'`) |
| The Monday Test | (stale) `ANTHROPIC_API_KEY` referenced by an old deploy; current uses gateway |
| yapp-to | ElevenLabs key (external TTS), STT provider key |
| others | — (not documented) |

### 2.3 Frontend `.env` shape (verbatim, nxlv — representative)

```
VITE_SUPABASE_URL=…
VITE_SUPABASE_PUBLISHABLE_KEY=…      # anon publishable key (safe for client)
VITE_SUPABASE_PROJECT_ID=…
```

---

## 3. Hosts & endpoints

| Purpose | Value / pattern | Seen in |
|---|---|---|
| AI Gateway (chat) | `https://ai.gateway.lovable.dev/v1/chat/completions` | ambassador-os, The Monday Test, Smart Deals, godoit |
| Connector gateway | `https://connector-gateway.lovable.dev/<service>` (e.g. `/telegram`) | central-genial (Telegram), GenialPrev (Google Sheets) |
| Cron target — TanStack gen | `POST https://<host>.lovable.app/api/public/*-cron` (gated by `x-cron-secret`) | Go Do It, Lovable Cup, Whos Local hooks |
| Cron target — classic gen | `POST https://<ref>.supabase.co/functions/v1/<fn>` (gated by `Authorization: Bearer <anon JWT>`) | ambassador-os, central-genial, ibuiltthis, lovable-for-schools |
| Public cached route | `/api/public/upcoming.json` — `Cache-Control: public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400` | Lucio Amorim |
| Preview vs prod host trap | `project--<uuid>.lovable.app` (preview) ≠ stable prod host — cron should never point at preview | Lovable Cup |
| Dead host trap | `*.lovable-project.com` does **not** resolve (should be `*.lovable.app`) | Whos Local |

---

## 4. Postgres extensions matrix

**Baseline everywhere:** `plpgsql`, `pg_stat_statements`, `pgcrypto`, `uuid-ossp`, `supabase_vault`.
**Variable additions below** (✓ = installed; blank/✗ = absent or explicitly not installed):

| Project | pg_cron | pg_net | pgvector | Version notes |
|---|:--:|:--:|:--:|---|
| Go Do It / godoit | ✓ | ✓ | ✓ | pgvector 768-dim (Go_Do_It) / 1536-dim `text-embedding-3-small`, HNSW (godoit) |
| Opportunity Monitor | ✓ | ✓ | | app role lacks `USAGE` on `cron` schema |
| Smart Deals | ✓ | ✓ | | `pg_cron 1.6.4`, `pg_net 0.20.0`, `supabase_vault 0.3.1` |
| Whos Local | ✓ | ✓ | | `pg_cron 1.6.4`, `pg_net 0.20.0` |
| ambassador-os | ✓ | ✓ | | PG 17.6 |
| central-genial | ✓ | ✓ | | |
| lovable-for-schools | ✓ | ✓ (`net`) | | |
| ibuiltthis | ✓ | ✓ | | PG 15 |
| yapp-to | ✓ | ✓ (implied) | | |
| GenialPrev | ✓ (installed, **unused**) | ✓ (installed, **unused**) | | 0 cron jobs |
| IesBrazil Pipeline | ✗ | ✗ | | also no `pgmq` |
| Lucio Amorim | ✗ | ✗ | | |
| nxlv | ✗ | ✗ | | |
| The Monday Test | ✗ (`cron.job` relation does not exist) | ✗ | | |
| Websummit Rio | ✗ | ✗ | | seed engine referenced but not running |

---

## 5. AI model-ID catalog

### 5.1 Valid / in-use (Lovable AI Gateway, Google Gemini family)

| Model ID | Tier | Used by |
|---|---|---|
| `google/gemini-2.5-flash` | cheap/high-volume | Go Do It (dominant), yapp-to, buildable window |
| `google/gemini-3-flash-preview` | cheap/high-volume | ambassador-os, Websummit Rio, Whos Local, buildable ledger |
| `google/gemini-2.5-flash-lite` | cheapest | catalog family (Opportunity Monitor target) |
| `google/gemini-2.5-pro` | heavy synthesis | The Monday Test (fallback), yapp-to `generate-form`/heavy insights |
| `google/gemini-3.1-flash-lite-preview` | cheap | Websummit Rio chat/help-widget |
| `text-embedding-3-small` | embeddings | Go Do It (1536-dim), godoit, workspace embeddings |
| ElevenLabs voices | TTS (external) | yapp-to (`elevenlabs-tts`), hackathons |
| Gemini 3.1 Flash Image / 3.1 Pro | image / feedback | hackathons (`generate-team-cover`, `generate-project-feedback`) |

### 5.2 Broken / churning preview IDs (latent cost — every call 400s but still bills)

| Bad model ID | Where | Problem |
|---|---|---|
| `google/gemini-3.1-flash-lite` | Opportunity Monitor — hard-coded in **7 edge fns** + `scripts-run-match.ts` | Not in catalog → 400, falls back to heuristics; gateway call still billed |
| `google/gemini-3.1-pro-preview` | The Monday Test — fallback chain `[gemini-3.1-pro-preview, gemini-2.5-pro]` | Preview alias may 404 → pays failed attempt + the pricier `2.5-pro` |

### 5.3 `ai_config` spec (verbatim, ambassador-os)

```sql
SELECT * FROM ai_config;
→ provider:              lovable
  gateway_url:           https://ai.gateway.lovable.dev/v1/chat/completions
  model:                 google/gemini-3-flash-preview
  api_key_secret_name:   LOVABLE_API_KEY
  max_cost_usd:          NULL      -- ⚠ no hard budget ceiling
```

### 5.4 Model pricing map (verbatim, yapp-to — client-side estimate, USD / 1M tokens)

```
google/gemini-2.5-pro     in 1.25  / out 10.00
google/gemini-2.5-flash   in 0.30  / out  2.50
ElevenLabs / STT          not in PRICING map (uncounted)
```

---

## 6. Configuration flags

### 6.1 Router / React-Query (TanStack generation)

| Flag | Bad value seen | Recommended | Source |
|---|---|---|---|
| `staleTime` (per query) | `0` (default, ~28/30 call sites) | `60_000` | Lovable Cup, Lucio Amorim |
| `defaultPreloadStaleTime` (`src/router.tsx`) | `0` → hover-preload refetches | `≥ 30_000` | Lovable Cup, Lucio Amorim, nxlv |
| `refetchInterval` | `4000` / `2000` / `8000` | visibility-gated / longer | IesBrazil, Lovable Cup |
| `refetchIntervalInBackground` | `true` (runs in hidden tabs) | `false` | IesBrazil |
| `gcTime` | default | `5 * 60_000` | Lovable Cup rec |

### 6.2 Edge-function `verify_jwt` overrides (`supabase/config.toml`)

| Project | Function | `verify_jwt` | Gate instead |
|---|---|---|---|
| Smart Deals | `deal-api` | `false` | manual `x-api-key` vs `DEAL_API_KEY` |
| Lucio Amorim | `render-markdown` | `false` | in-fn validation only |
| Lucio Amorim | `send-diagnostic-notification` | `false` | in-fn validation only |
| nxlv | `render-markdown`, `send-diagnostic-notification` | `false` | in-fn validation |
| Lovable Cup | `seed-demo-data` | `true` | + `assertAdmin` |
| The Monday Test | `generate-report` | (invokable w/ id) | none (client decides) |
| yapp-to | `sign-link` `sign` action | (no auth) | ⚠ anyone can mint JWTs |

### 6.3 AI budget / guard flags

| Flag | Value | Project |
|---|---|---|
| `ai_config.max_cost_usd` | `NULL` (no ceiling) | ambassador-os |
| `runReconciliation` daily token cap | none (only `shouldBypassReconcile` bool) | Go Do It / godoit |
| `system_config.paused` | the only kill switch | Go Do It |
| `LIVE_REMINDERS_PAUSED` | `'true'` (fn returns early) | GenialPrev |
| `SCRAPING_DEADLINE` | `2026-02-01` hard-coded (all runs skip since) | lovable-for-schools |

### 6.4 Consolidated cron schedule table (all confirmed jobs)

| Project | Job name | Schedule | Per-day | State |
|---|---|---|---:|---|
| central-genial | `poll-telegram-updates` | `* * * * *` | 1,440 | ⚠ 150,747 runs, 0 users |
| central-genial | `monthly-social-kit-generation` | `0 8 1 * *` | ~0.03 | ok |
| central-genial | `morning-summary-daily` | `0 11 * * *` | 1 | returns early |
| central-genial | `stale-lead-alert-daily` | `0 12 * * *` | 1 | returns early |
| central-genial | `update-reminder-daily` | `0 13 * * *` | 1 | returns early |
| lovable-for-schools | `process-incremental-milestones` | `* * * * *` | 1,440 | ⚠ no-op |
| lovable-for-schools | `run-due-targets-every-5min` | `*/5 * * * *` | 288 | ⚠ 100% skipped (deadline) |
| Go Do It | `embed-queue-2min` | `*/2 * * * *` | 720 | ⚠ empty queue |
| Go Do It | `do-it-reconcile-15min` | `*/15 * * * *` | 96 | ⚠ token spike risk |
| Go Do It | `ops-alerts-push-15min` | `*/15 * * * *` | 96 | 24/7, no window filter |
| Go Do It | `do-it-daily-review` | `5 3 * * *` | 1 | ok |
| Go Do It | `inbox-decay-daily` | `0 3 * * *` | 1 | ok |
| Go Do It | `pattern-detection-daily` | `15 3 * * *` | 1 | ok |
| Go Do It | `golden-cases-weekly` | `30 3 * * 0` | 0.14 | ok |
| Go Do It | `weekly-review-sunday` | `5 3 * * 0` | 0.14 | ok |
| Go Do It | `review-batch-weekly` | `0 6 * * 1` | 0.14 | ok |
| ibuiltthis | `process-consent-replies` | `*/5 * * * *` | 288 | mostly no-op |
| ibuiltthis | `twitter-poster-hourly` | `0 * * * *` | 24 | ok |
| ibuiltthis | `cron-event-lifecycle-daily` | `0 2 * * *` | 1 | ok |
| ibuiltthis | `cron-creator-sync-daily` | `0 4 * * *` | 1 | `{"limit":20}` |
| ibuiltthis | `validate-event-urls-weekly` | `0 3 * * 0` | 0.14 | ok |
| ibuiltthis | `compute-builder-analytics-weekly` | `0 6 * * 1` | 0.14 | ok |
| ambassador-os | `hourly-signal-extraction` | `0 * * * *` | 24 | no-op (`processed:0`) |
| ambassador-os | `hourly-churn-update` | `30 * * * *` | 24 | ≤0.32 s |
| Whos Local | `sync-slack-users-daily` | `0 6 * * *` | 1 | ⚠ dead host |
| Whos Local | `sync-community-events-hourly` | `0 * * * *` | 24 | ⚠ dead host |
| Whos Local | `sync-slack-avatars-daily` | `0 3 * * *` | 1 | ok host |
| Lovable Cup | `check-social-posts-daily` | `0 6 * * *` | 1 | ⚠ → preview host |
| yapp-to | `process-scheduled-messages` | (pg_cron) | — | drains `outbound_messages` |
| yapp-to | `purge-orphan-uploads` | (daily) | 1 | 30-day orphan sweep |

---

## 7. Canonical code patterns (verbatim)

### 7.1 Client polling anti-patterns

**Always-on background dock poll** — IesBrazil, `src/components/BatchTracker.tsx`:

```ts
useQuery({
  queryKey: ["recent-batches"],
  queryFn: () => listRecentBatches(),
  refetchInterval: 4000,                     // 4 s
  refetchIntervalInBackground: true,         // runs in hidden tabs
  staleTime: 1000,
});

// per tracked batch id (top 5):
useQueries({ queries: trackedIds.map((id) => ({
  queryKey: ["firecrawl-batch", id],
  queryFn: () => fetchSummary({ data: { batch_id: id } }),
  refetchInterval: (q) =>
    q.state.data?.batch && TERMINAL_BATCH.has(q.state.data.batch.status) ? false : 2000,
  refetchIntervalInBackground: true,
}))});
// TERMINAL_BATCH omits 'cancelling' → one stuck batch polled every 2 s for ~11 days
```

**Profile poll every 8 s until active** — Lovable Cup, `src/routes/_authenticated/submeter.tsx:43`:

```ts
refetchInterval: (q) => ((q.state.data as any)?.builder_status === "active" ? false : 8000)
// staging tab left open = 10,800 server-fn calls / 24 h
```

**Regeneration loop on a persisted error row** — The Monday Test, `src/routes/resultado.$id.tsx`:

```tsx
const cached = useMemo<ReportSections | null>(() => {
  const rj = record.reportJson as Record<string, unknown> | null;
  if (rj && typeof rj.executive_verdict === "string" && rj.executive_verdict.length > 0) {
    return rj as unknown as ReportSections;
  }
  return null;              // any row whose report_json lacks executive_verdict = "uncached"
}, [record.reportJson]);

useEffect(() => {
  if (cached) return;        // the only gate
  const { data, error } = await supabase.functions.invoke("generate-report", { body: payload });
}, [cached, record]);
// error envelopes lack executive_verdict → every visit re-invokes the LLM
```

### 7.2 The fix snippets

```ts
// Global React-Query caps (Lovable Cup rec, src/router.tsx)
defaultOptions: { queries: { staleTime: 60_000, gcTime: 5 * 60_000 } }
// + raise defaultPreloadStaleTime from 0 to >= 30_000
```

```ts
// HTTP edge cache on SSR loader response (Lucio Amorim rec, getHomeBundle)
Cache-Control: public, s-maxage=300, stale-while-revalidate=600   // ~50× fewer Data-API hits
```

```ts
// Stop the regeneration loop (The Monday Test rec)
const hasAttempt = rj && (rj.executive_verdict || rj.error);
if (hasAttempt) return;      // treat any non-empty report_json as a hard stop; show "Retry"
```

### 7.3 `pg_cron` + `pg_net` job command shape (+ the anon-JWT anti-pattern)

```sql
-- ambassador-os, cron.job (anon JWT hard-coded in the header — redacted here)
SELECT net.http_post(
  url     := 'https://<ref>.supabase.co/functions/v1/extract-field-signals',
  headers := '{"Authorization": "Bearer eyJhbGciOi…⟨anon JWT, redacted⟩", "Content-Type":"application/json"}',
  body    := '{"batch_size": 500}'
);
```

```sql
-- central-genial remediation (kills the every-minute telegram poll + reclaims 121 MB)
SELECT cron.unschedule('poll-telegram-updates');
DELETE FROM cron.job_run_details WHERE jobid = 2;

-- lovable-for-schools remediation
SELECT cron.unschedule('run-due-targets-every-5min');
SELECT cron.unschedule('process-incremental-milestones');
DELETE FROM cron_logs WHERE started_at < NOW() - INTERVAL '7 days';
VACUUM ANALYZE cron_logs;
```

> **Diagnostic trap (Whos Local):** `cron.job_run_details.status = 'succeeded'` means pg_cron *issued* the `net.http_post`, **not** that the HTTP call worked. DNS/401 failures appear only in `net._http_response`:
> ```
> status_code | error_msg                  | created
> NULL        | Couldn't resolve host name | 16:00:00   (× 24/day, dead host)
> ```

### 7.4 Trigger fan-out (verbatim SQL) — Websummit Rio `on_new_member_notify`

```sql
IF NEW.onboarded IS NOT TRUE OR (OLD.onboarded IS TRUE) THEN RETURN NEW; END IF;
IF NEW.is_seed THEN RETURN NEW; END IF;

INSERT INTO public.notifications(user_id, type, title, body, data)
SELECT p.id, 'new_member', '👋 New member joined', ...
FROM public.profiles p
WHERE p.id <> NEW.id AND p.onboarded = true AND p.is_seed = false
ORDER BY p.updated_at DESC
LIMIT 100;
-- second INSERT: 'match_quality' (also LIMIT 100)
-- ⇒ up to 200 notification rows PER onboarding completion (2,543 in one day)
```

**Destructive replace-all** — Whos Local, `src/routes/hooks/sync-events.ts:104-122`:

```ts
await supabase.from("community_event_organizers").delete().in("event_id", eventIdsTouched.slice(...));
// then re-insert every organizer row  → ~15–22 k writes/day once the cron URL is fixed
```

### 7.5 RLS policy specs (good → bad)

```sql
-- ✅ Correct row scoping (Go Do It, nxlv, yapp-to)
USING (auth.uid() = user_id)
USING (has_role(auth.uid(), 'admin'))

-- ⚠ Open read: whole table on every poll (IesBrazil, Opportunity Monitor job_snapshots = 96 MB)
POLICY "Authenticated users can view leads" FOR SELECT TO authenticated USING (true);

-- ⚠ Tautology: exposes ALL rows to anon (The Monday Test)
diagnostics_anon_select_by_id     SELECT anon  USING (id = id)
diagnostics_anon_update_unowned   UPDATE anon  USING (user_id IS NULL)   -- anyone can wipe a row

-- ⚠ Open anon INSERT, no rate limit (analytics_events, hub_analytics, questions,
--   email_submissions, nxlv_contacts, cron_logs, system_config)
POLICY "Anyone can insert hub_analytics" FOR INSERT  WITH CHECK <nil>

-- ⚠ "Admins can insert…" with NULL qualifier and no WITH CHECK → any authenticated insert (ambassador-os)
```

### 7.6 Edge-function secret leak (verbatim) — Opportunity Monitor `reveal-service-key`

```ts
// supabase/functions/reveal-service-key/index.ts  — banner: "DELETE THIS FUNCTION immediately"
return new Response(JSON.stringify({
  SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
}))
// gated only by x-cron-secret → delete + rotate SERVICE_ROLE_KEY & CRON_SECRET now
```

### 7.7 Long-poll edge function shape — central-genial `telegram-poll`

```
MAX_RUNTIME_MS = 55_000            // blocks up to 55 s PER invocation (not a light ping)
MIN_REMAINING_MS = 5_000
timeout = min(50, floor(remainingMs/1000) - 5)   // getUpdates long-poll ≈ 45 s
// while(true) loop; if no updates → continue immediately; cron fires every 60 s
// ⇒ EF is nearly continuously executing; uses SERVICE_ROLE_KEY; routes via connector-gateway.lovable.dev/telegram
```

### 7.8 Deadline / guard shape — lovable-for-schools `run-due-targets`

```typescript
const SCRAPING_DEADLINE = new Date('2026-02-01T00:00:00Z');
if (now >= SCRAPING_DEADLINE) {
  // logs 'skipped', returns early — but STILL writes 2 cron_logs rows per call
}
// cron never disabled → 288 skipped invocations/day for 149+ days
```

### 7.9 Retention / remediation SQL (reusable)

```sql
-- Generic log retention (IesBrazil, central-genial, Opportunity Monitor, ibuiltthis, Websummit Rio)
DELETE FROM db_admin_log            WHERE created_at < now() - interval '30 days';
DELETE FROM cron.job_run_details    WHERE end_time  < now() - interval '7 days';
DELETE FROM notifications           WHERE created_at < now() - interval '30 days' AND read_at IS NOT NULL;

-- Snapshot retention (Opportunity Monitor): keep latest + last-changed per job_id, drop rest
-- Heal a stuck error row (The Monday Test)
UPDATE diagnostics SET report_json = NULL WHERE id = 'f20a2f87-53db-4f45-a7b9-26c630654e1d';

-- Revoke over-broad EXECUTE on SECURITY DEFINER fns (Lucio Amorim linter fix)
REVOKE EXECUTE ON FUNCTION public.get_db_table_stats(), public.get_db_size_summary()
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_table_stats(), public.get_db_size_summary() TO service_role;
```

### 7.10 RBAC helper (the universal pattern)

```sql
-- user_roles table + SECURITY DEFINER has_role(), referenced from RLS everywhere
public.has_role(uuid, app_role)   -- SECURITY DEFINER, STABLE, search_path=public
-- app_role enum e.g. ('admin', …); avoids recursive-RLS by never selecting the guarded table inside its own policy
```

### 7.11 Realtime subscription shape (expensive form) — Websummit Rio

```
supabase_realtime publication: profiles, sparks, reactions, side_events,
                               wall_posts, wall_post_reactions, notifications   (7 high-churn tables)
client subscriptions: 11 channels on event: "*"  → each calls load() (full loader refetch)
// ibuiltthis publishes 3 log tables → realtime.list_changes = 1.7 M calls / 7.9 M ms (#1 workload)
```

### 7.12 Token-ledger query (the pattern that actually enables cost attribution) — godoit `event_log`

```sql
SELECT date_trunc('day', created_at)::date AS day,
       (metadata->>'trigger') AS trigger,
       SUM(tokens_estimated) AS tokens, COUNT(*) AS events
FROM event_log
WHERE event_type = 'tokens_consumed'
  AND created_at > now() - interval '14 days'
GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC;
-- reveals the 2026-06-26 spike: 458,231 tokens / 96 calls vs 0 on all other days
```

---

## 8. Storage bucket specs

| Project | Bucket | Objects | Size | Public | size limit | Path convention |
|---|---|---:|---:|:--:|:--:|---|
| ibuiltthis | `assets` (share-cards/events/creators/…) | 807 | **581 MB** (share-cards 344 MB / 59 %) | — | **none** | `share-cards/*.png` (un-deduped) |
| ibuiltthis | `email-assets` | — | 54 KB | — | — | |
| hackathons | submissions / event-photos / assets / qa-attachments / avatars | 57 | 68 MB | mixed | RLS by `event_id` | scoped path |
| yapp-to | `audio-recordings` | 167 | 31 MB | **yes** | **none** | `audio-recordings/{form_id}/{session_id}/{question_id}/…` |
| yapp-to | `form-uploads` | 55 | 4.5 MB | **yes** | **none** | `form-uploads/{form_id}/{session_id}/{question_id}/…` |
| Websummit Rio | `avatars` | 11 | 16 MB | — | — | |
| Whos Local | `avatars` | 226 | 1.3 MB | private | — | |
| lovable-for-schools | (none — raw HTML stored in Postgres `snapshots.source_html`) | — | ~23 MB in heap | — | — | anti-pattern |
| GenialPrev / Lovable Cup / Lucio Amorim / nxlv / The Monday Test / Opportunity Monitor / Go Do It | 0 buckets or 0 objects | 0 | 0 | — | — | |

---

## 9. Audit query library (reusable across any Lovable/Supabase project)

The reports converge on a standard read-only toolkit. Copy-paste set:

```sql
-- Inventory
SELECT table_name FROM information_schema.tables WHERE table_schema='public';
SELECT extname, extversion FROM pg_extension;
SELECT count(*) FROM information_schema.routines WHERE routine_schema='public';

-- Sizes & row counts
SELECT schemaname, relname, n_live_tup, n_tup_ins, n_tup_upd, n_tup_del
  FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 30;
SELECT relname, pg_size_pretty(pg_total_relation_size(c.oid))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r'
  ORDER BY pg_total_relation_size(c.oid) DESC;

-- Scheduling (needs cron-schema access; often HQ-only)
SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;
SELECT jobname, status, return_message, start_time
  FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;
SELECT id, status_code, error_msg, created           -- the REAL HTTP outcome
  FROM net._http_response ORDER BY created DESC LIMIT 20;

-- RLS / triggers / functions
SELECT tablename, policyname, cmd, roles, qual::text FROM pg_policies WHERE schemaname='public';
SELECT tgname, tgrelid::regclass, pg_get_triggerdef(oid) FROM pg_trigger
  WHERE NOT tgisinternal AND tgrelid::regclass::text LIKE 'public.%';

-- Cost / AI
SELECT * FROM ai_config;                             -- provider, model, max_cost_usd
-- ai_gateway_logs--list_ai_gateway_requests (last 7d)   ⚠ short retention → often 0
-- credits--get_credit_balance GROUP BY billable_item, user, project   ← the ground truth

-- Health
-- supabase--db_health : size, WAL, connections, memory, restarts, rolled-back txns
-- supabase--slow_queries : pg_stat_statements top-N (calls, total_ms, mean_ms)
-- supabase--linter : SECURITY DEFINER exposure, extension-in-public, RLS-always-true
```

Source `rg` sweeps used to find client-side burn:

```bash
rg -n "setInterval|refetchInterval|refetchIntervalInBackground|setTimeout.*[0-9]{3,}" src/
rg -n "supabase.functions.invoke|supabase.channel|onAuthStateChange" src/
rg -n "staleTime|defaultPreloadStaleTime" src/
rg -n "aiChat|aiEmbed|generateText|gemini" src/ supabase/functions/
```

---

## 10. Edge / server-function inventories (per project, verbatim where listed)

**ibuiltthis — 64 functions**, categorized: AI/LLM (`ai-creative-brief`, `ai-generate-share-cards`, `enrich-creator-social`, `faq-chat`, `generate-project-video`, `seo-optimize`, …), Media/Storage (`batch-generate-thumbnails`, `cleanup-storage`, `generate-screenshot`, `mirror-slack-avatar`, …), Slack (`ingest-slack`, `slack-events`, `slack-interactivity`, `slack-backfill*`), Cron-targeted (6, see §6.4), Public reads (`events-ical`, `events-rss`, `sitemap`, `public-api`), Email/consent (`process-consent-reply`, `send-consent-dm`, `auth-email-hook`).

**central-genial — 25 functions:** `check-subscription`, `create-checkout`, `customer-portal`, `generate-content`, `landing-form-submit`, `landing-page`, `link-na-bio`, `manage-assistants`, `monthly-social-kit`, `morning-summary`, `notify-new-lead`, `roi-notification`, `seed-demo-data`, `send-telegram`, `send-whatsapp`, `stale-lead-alert`, `stripe-webhook`, `telegram-poll`, `test-integration`, `transcribe-audio`, `update-reminder`, `weekly-financial-summary`, `whatsapp-webhook`, `yapp-dispatch`, `yapp-webhook-receiver`.

**Opportunity Monitor — 22 functions:** `backfill-content/-highlights/-keywords/-published-at/-salary`, `calculate-matches`, `compare-jobs-ai`, `compile-profile-digest`, `detect-repeated-boilerplate`, `fix-manual-job-titles`, `generate-highlights/-job-brief/-prep-insights`, `import-job-by-url`, `infer-seniority`, `normalize-locations`, `reclassify-sections`, `reveal-service-key` ⚠, `run-detail-refresh`, `run-index-scan`, `sync-currency-rates`, `test-source-connection`.

**yapp-to — 18 functions** (AI/TTS/logging flags in report): `analyze-responses`✅log, `summarize-response`✅log, `parse-questions`✅log, `generate-form`❌, `interpret-voice-answer`❌, `retry-transcription`❌, `elevenlabs-tts`❌⚠, `list-elevenlabs-voices`, `process-publish-job`❌, `api-sessions`, `complete-response`, `send-message`, `send-webhook`, `webhook-dispatcher`, `sign-link`, `otp`, `process-scheduled-messages`(cron), `purge-orphan-uploads`(cron).

**Smart Deals — 16 functions:** `classify-input`, `commit-classification`, `consolidate-merge`, `deal-api`⚠(`verify_jwt=false`), `elevenlabs-transcribe`, `execute-merge`, `fetch-contact-activity`, `ingest-raw-input`, `preprocess-input`, `reverse-merge`, `suggest-event-dedup`, `suggest-merges`, `sync-external-sources`, `telegram-digest`, `telegram-notify`, `telegram-poll`.

**ambassador-os — 10 functions:** `check-trail-replies`, `classify-messages`, `classify-replies`, `cluster-messages`, `drip-onboarding`, `extract-field-signals`(cron, deterministic), `generate-canonical-answer`, `notify-slack-question`, `slack-api`, `slack-events`(public webhook).

**lovable-for-schools — 10 functions:** `run-due-targets`(cron), `process-incremental-milestones`(cron), `run-snapshot`, `generate-competition-events`, `generate-daily-pulse`, `generate-report`, `generate-school-milestones`, `geocode-schools`, `cleanup-duplicate-milestones`, `reprocess-snapshots`.

**GenialPrev — 9 functions:** `manychat-contact-webhook`, `manychat-contact-reimport`, `evaluate-challenge`, `evaluate-checklist`, `dispatch-live-reminders`(paused), `send-campaign-blast`, `sync-live-registrations-to-sheet`, `check-quiz-answer`, `_shared/*`.

**nxlv — 5 functions:** `generate-report-pdf`, `render-markdown`(`verify_jwt=false`), `send-contact-notification`, `send-diagnostic-notification`(`verify_jwt=false`), `send-gmail`.

**Single-function projects:** IesBrazil (`db-admin`), Lovable Cup (`seed-demo-data`), The Monday Test (`generate-report`), Whos Local (`match-insight`). **Zero Supabase edge fns (logic in Worker server routes):** Go Do It / godoit, Lucio Amorim.

**hackathons — AI functions:** `generate-team-cover`, `generate-all-team-covers`, `generate-project-cover`, `generate-project-feedback`.

---

*End of reference. Pairs with `LOVABLE_TECHNICAL_LANDSCAPE.md`; all snippets traceable to their originating `*_USAGE_REPORT.md`.*

