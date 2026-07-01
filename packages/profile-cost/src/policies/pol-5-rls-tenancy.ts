import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

// POL-5 — RLS & tenancy baseline. A cost surface AND a security exposure:
// an unpaginated SELECT under USING(true) returns the whole table on every poll.
export const pol5RlsTenancy: Rule = {
  id: "POL-5",
  policy: "RLS & tenancy baseline",
  evaluate(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];
    for (const p of ctx.resourcesByKind("rls_policy")) {
      const qual = normalize(p.attrs["qual"]);
      const cmd = String(p.attrs["cmd"] ?? "").toUpperCase();
      const roles = normalize(p.attrs["roles"]);
      const table = String(p.attrs["table"] ?? p.name);

      const tautology = qual === "true" || /(\w+)\s*=\s*\1/.test(qual); // true, id = id
      const anonWrite = /anon|public/.test(roles) && /INSERT|UPDATE|DELETE/.test(cmd);
      if (!tautology && !anonWrite) continue;

      const kind = tautology && /SELECT/.test(cmd)
        ? "open read (whole table on every poll)"
        : anonWrite
          ? "unrate-limited anon write surface"
          : "tautology policy";

      findings.push({
        id: `POL-5:${p.name}`,
        policy: "POL-5",
        driverCat: tautology ? "B" : null,
        title: `${kind} on \`${table}\``,
        severity: "high",
        confidence: "confirmed",
        resourceId: p.id,
        rationale:
          `Policy \`${p.name}\` (${cmd}) uses \`${qual || "?"}\` for roles \`${roles}\`. This is simultaneously a ` +
          `security exposure and a cost surface: broad reads return whole tables under polling; open anon INSERT is a ` +
          `write-amplification / spam vector. Single-tenant tolerances become unsafe the moment the app goes multi-tenant.`,
        evidence: [{ source: "sql", detail: `${table}.${p.name}: ${cmd} roles=${roles} qual=${qual}`, snippet: "SELECT tablename,policyname,cmd,roles,qual FROM pg_policies WHERE schemaname='public';" }],
        remediation: [
          {
            kind: "manual",
            title: "Scope by owner/tenant + rate-limit anon writes",
            body: "Replace USING(true)/tautology with auth.uid()/tenant or has_role() predicates. Rate-limit (per-IP/captcha/RPC) any anon INSERT; never expose infra tables (cron_logs, system_config).",
            applySafe: false,
          },
        ],
      });
    }
    return findings;
  },
};

function normalize(v: unknown): string {
  if (Array.isArray(v)) return v.join(",").toLowerCase();
  return String(v ?? "").toLowerCase().trim();
}
