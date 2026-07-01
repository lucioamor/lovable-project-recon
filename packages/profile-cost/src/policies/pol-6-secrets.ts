import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const JWT_IN_COMMAND_RX = /Bearer\s+eyJ[A-Za-z0-9_-]+/;

// POL-6 — Secrets & auth-surface management. Reports the SHAPE of a leaked credential, never the value.
export const pol6Secrets: Rule = {
  id: "POL-6",
  policy: "Secrets & auth-surface management",
  evaluate(ctx: RuleContext): Finding[] {
    // One leaked credential per project, even when embedded in many jobs — aggregate,
    // don't emit N identical criticals.
    const offenders = ctx
      .resourcesByKind("cron_job")
      .filter((j) => JWT_IN_COMMAND_RX.test(String(j.attrs["command"] ?? "")));
    const first = offenders[0];
    if (!first) return [];

    let maxExpiry = 0;
    for (const j of offenders) {
      const y = j.attrs["jwtExpiryYears"];
      if (typeof y === "number" && y > maxExpiry) maxExpiry = y;
    }
    const longLived = maxExpiry >= 5;
    const names = offenders.map((j) => "`" + j.name + "`").join(", ");
    const expiryNote = longLived ? " (" + maxExpiry + "-yr expiry)" : "";

    return [
      {
        id: "POL-6:cron-anon-jwt",
        policy: "POL-6",
        driverCat: null,
        title: "Anon JWT hard-coded in " + offenders.length + " cron command(s)" + expiryNote,
        severity: "critical",
        confidence: "confirmed",
        resourceId: first.id,
        rationale:
          "A JWT embedded in `cron.job.command` is a credential-at-rest readable by anyone with `cron`/DB access. " +
          "Affected: " + names + ". " +
          (longLived ? "A " + maxExpiry + "-year expiry makes rotation urgent. " : "") +
          "Move to Vault-resolved secrets or the documented `apikey` pattern.",
        evidence: [
          // shape only — never reproduce the token
          { source: "sql", detail: offenders.length + " job(s) embed Authorization Bearer eyJ (redacted)", snippet: "headers := '{\"Authorization\":\"Bearer eyJ<redacted>\"}'" },
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
