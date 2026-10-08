import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const JWT_IN_COMMAND_RX = /bearer\s+eyJ[A-Za-z0-9_-]+/i;

// POL-6: Secrets & auth-surface management. Reports credential shapes, never values.
export const pol6Secrets: Rule = {
  id: "POL-6",
  policy: "Secrets & auth-surface management",
  evaluate(ctx: RuleContext): Finding[] {
    const offenders = ctx.resourcesByKind("cron_job").filter((j) => JWT_IN_COMMAND_RX.test(String(j.attrs["command"] ?? "")));
    const staticSignals = ctx.raw<{ secretSignals?: Array<{ file?: string; kind?: string }> }>("static")?.secretSignals ?? [];
    const first = offenders[0];
    const firstStatic = staticSignals[0];
    if (!first && !firstStatic) return [];

    let maxExpiry = 0;
    for (const j of offenders) {
      const y = j.attrs["jwtExpiryYears"];
      if (typeof y === "number" && y > maxExpiry) maxExpiry = y;
    }
    const longLived = maxExpiry >= 5;
    const names = offenders.map((j) => "`" + j.name + "`").join(", ");
    const expiryNote = longLived ? " (" + maxExpiry + "-yr expiry)" : "";
    const cronTitle = offenders.length ? "Anon JWT hard-coded in " + offenders.length + " cron command(s)" + expiryNote : "";
    const staticTitle = staticSignals.length ? staticSignals.length + " in-source credential shape(s)" : "";

    return [
      {
        id: "POL-6:credential-shapes",
        policy: "POL-6",
        driverCat: null,
        title: cronTitle && staticTitle ? `${cronTitle}; ${staticTitle}` : cronTitle || staticTitle,
        severity: "critical",
        confidence: "confirmed",
        resourceId: first?.id ?? "project",
        rationale:
          (offenders.length ? "A JWT embedded in `cron.job.command` is a credential-at-rest readable by anyone with `cron`/DB access. Affected: " + names + ". " : "") +
          (staticSignals.length ? "Source scan found credential shapes in app code (values redacted): " + summarizeStaticSignals(staticSignals) + ". " : "") +
          (longLived ? "A " + maxExpiry + "-year expiry makes rotation urgent. " : "") +
          "Move to Vault-resolved secrets or the documented `apikey` pattern.",
        evidence: [
          ...(offenders.length
            ? [{ source: "sql" as const, detail: offenders.length + " job(s) embed Authorization Bearer eyJ (redacted)", snippet: 'headers := \'{"Authorization":"Bearer eyJ<redacted>"}\'' }]
            : []),
          ...(staticSignals.length ? [{ source: "rg" as const, detail: staticSignals.length + " source credential shape(s) detected: " + summarizeStaticSignals(staticSignals) }] : []),
        ],
        remediation: [
          {
            kind: "manual",
            title: "Vault the cron auth + rotate the anon key",
            body: "Resolve the token from Vault inside each job (or use the apikey pattern); then rotate the exposed anon key. Never paste tokens into cron.job.command.",
            applySafe: false,
          },
        ],
      },
    ];
  },
};

function summarizeStaticSignals(signals: Array<{ file?: string; kind?: string }>): string {
  return signals
    .slice(0, 5)
    .map((s) => `${s.kind ?? "credential"} at ${s.file ?? "unknown file"}`)
    .join(", ");
}
