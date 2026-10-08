import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const LEDGER_RX = /(usage_ledger|ai_usage|llm_usage|ai_usage_logs|event_log|pipeline_logs|usage_logs)/i;

// POL-8: Cost observability & attribution.
export const pol8Observability: Rule = {
  id: "POL-8",
  policy: "Cost observability & attribution",
  evaluate(ctx: RuleContext): Finding[] {
    const ai = ctx.resourceById("ai_config");
    const staticAiSites = ctx.raw<{ modelIds?: Array<{ file: string; model: string }> }>("static")?.modelIds ?? [];
    if (!ai && staticAiSites.length === 0) return [];

    const hasLedger = ctx.resourcesByKind("table").some((t) => LEDGER_RX.test(t.name));
    if (hasLedger) return [];

    const source = staticAiSites.length ? "rg" : "sql";
    const detail = staticAiSites.length ? `${staticAiSites.length} AI model call-site(s) seen in source, but no usage ledger table found` : "AI configured but no usage ledger table found";

    return [
      {
        id: "POL-8:no-ledger",
        policy: "POL-8",
        driverCat: null,
        title: staticAiSites.length ? "AI call sites found but no usage ledger table found" : "AI configured but no usage ledger table found",
        severity: "medium",
        confidence: "hypothesis",
        resourceId: ai?.id ?? "project",
        rationale:
          "Without a per-call ledger (tokens/model/provider/outcome) written by every AI/TTS/STT call site, " +
          "spend cannot be attributed, and the AI Gateway request log has short retention, so an empty 7-day window is blind, not zero.",
        evidence: [{ source, detail }, ...(staticAiSites.length ? [{ source: "rg" as const, detail: `example model ${staticAiSites[0]!.model} at ${staticAiSites[0]!.file}` }] : [])],
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
