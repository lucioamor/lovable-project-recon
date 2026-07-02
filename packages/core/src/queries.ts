// The audit query library — reusable, read-only, across any Lovable/Supabase project.
// Verbatim from LOVABLE_ENV_CONFIG_REFERENCE.md §9. The `db` collector runs these inside
// a READ ONLY transaction. Queries needing HQ-only schemas (cron.*) may fail with
// insufficient privilege and degrade to warnings.

export interface AuditQuery {
  name: string;
  /** which schema/privilege it needs, for graceful degradation */
  needs: "public" | "cron" | "net" | "extension";
  sql: string;
}

export const AUDIT_QUERIES: AuditQuery[] = [
  {
    name: "tables",
    needs: "public",
    sql: `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
  },
  {
    name: "extensions",
    needs: "extension",
    sql: `SELECT extname, extversion FROM pg_extension`,
  },
  {
    name: "table_stats",
    needs: "public",
    sql: `SELECT schemaname, relname, n_live_tup, n_tup_ins, n_tup_upd, n_tup_del
          FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 30`,
  },
  {
    name: "table_sizes",
    needs: "public",
    sql: `SELECT c.relname AS relname, pg_total_relation_size(c.oid) AS total_bytes
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind='r'
          ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 30`,
  },
  {
    name: "triggers",
    needs: "public",
    sql: `SELECT n.nspname AS schemaname,
                 c.relname AS table_name,
                 t.tgname AS trigger_name,
                 pg_get_triggerdef(t.oid) AS trigger_def,
                 pg_get_functiondef(t.tgfoid) AS function_def
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
          ORDER BY c.relname, t.tgname`,
  },
  {
    name: "cron_jobs",
    needs: "cron",
    sql: `SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid`,
  },
  {
    name: "cron_run_details",
    needs: "cron",
    sql: `SELECT jobid, status, return_message, start_time
          FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50`,
  },
  {
    name: "http_responses",
    needs: "net",
    sql: `SELECT id, status_code, error_msg, created
          FROM net._http_response ORDER BY created DESC LIMIT 20`,
  },
  {
    name: "rls_policies",
    needs: "public",
    sql: `SELECT tablename, policyname, cmd, roles, qual::text AS qual
          FROM pg_policies WHERE schemaname='public'`,
  },
  {
    name: "ai_config",
    needs: "public",
    sql: `SELECT * FROM ai_config`,
  },
];
