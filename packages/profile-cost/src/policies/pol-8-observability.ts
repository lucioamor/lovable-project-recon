import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const LEDGER_RX = /(usage_ledger|ai_usage|llm_usage|event_log|pipeline_logs|usage_logs)/i;

// POL-8 — Cost observability & attribution. If AI is configured but there is no usage ledger
// table, cost cannot be attributed retroactively (the gateway 7-day log gives false zeros).
export const pol8Observability: Rule = {
  id: "POL-8",
  policy: "Cost observability & attribution",
  evaluate(ctx: RuleContext): Finding[] {
    const ai = ctx.resourceById("ai_config");
    if (!ai) return [];
    const hasLedger = ctx.resourcesByKind("table").some((t) => LEDGER_RX.test(t.name));
    if (hasLedger) return [];

    return [
      {
        id: "POL-8:no-ledger",
        policy: "POL-8",
        driverCat: null,
        title: "AI configured but no usage ledger table found",
        severity: "medium",
        confidence: "hypothesis",
        resourceId: ai.id,
        rationale:
          "Without a per-call ledger (tokens/model/provider/outcome) written by every AI/TTS/STT call site, " +
          "spend cannot be attributed — and the AI Gateway request log has short retention, so an empty 7-day " +
          "window is 'blind', not 'zero'.",
        evidence: [{ source: "sql", detail: "no table matching usage_ledger/ai_usage/event_log in public schema" }],
        remediation: [
          {
            kind: "manual",
            title: "Add a usage ledger + a logAiUsage() wrapper",
            body: "Create a usage_ledger table and call logAiUsage(provider,kind,model,tokens,outcome) at EVERY call site. Attribute cost via credits--get_credit_balance grouped by billable_item/project.",
            applySafe: false,
          },
        ],
      },
    ];
  },
};
