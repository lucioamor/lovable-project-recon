import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

const BROKEN_MODEL_RX = /(gemini-3\.1-(flash-lite|pro-preview)\b|preview)/i;

// POL-4 — AI cost governance. Driver category E (uncapped AI). Severity Critical when uncapped.
export const pol4AiCost: Rule = {
  id: "POL-4",
  policy: "AI cost governance",
  evaluate(ctx: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const ai = ctx.resourceById("ai_config");
    if (!ai) return findings; // no AI configured -> nothing to govern

    const maxCost = ai.attrs["maxCostUsd"];
    if (maxCost === null || maxCost === undefined) {
      findings.push({
        id: "POL-4:no-cap",
        policy: "POL-4",
        driverCat: "E",
        title: "AI has no cost ceiling (`ai_config.max_cost_usd = NULL`)",
        severity: "critical",
        confidence: "confirmed",
        resourceId: ai.id,
        rationale:
          "With no per-day token/USD cap and no circuit breaker, the only thing between '0 tokens' and " +
          "'hundreds of thousands of tokens/day' is often a single boolean guard. One guard regression = 30–50× spend.",
        evidence: [{ source: "sql", detail: "ai_config.max_cost_usd is NULL", snippet: "SELECT provider, model, max_cost_usd FROM ai_config;" }],
        remediation: [
          {
            kind: "sql_migration",
            title: "Set a hard AI budget ceiling",
            body: "UPDATE ai_config SET max_cost_usd = 5.00;  -- tune per project\n-- then enforce assertUnderDailyCap(userId) before every gateway call.",
            applySafe: false,
          },
        ],
      });
    }

    const model = typeof ai.attrs["model"] === "string" ? (ai.attrs["model"] as string) : "";
    if (model && BROKEN_MODEL_RX.test(model)) {
      findings.push({
        id: "POL-4:broken-model",
        policy: "POL-4",
        driverCat: "E",
        title: `Unpinned/broken model id \`${model}\``,
        severity: "high",
        confidence: "hypothesis",
        resourceId: ai.id,
        rationale:
          "Preview/alias model IDs rot. A failing model call still bills — a broken ID is a live cost, not a no-op.",
        evidence: [{ source: "sql", detail: `ai_config.model = ${model}` }],
        remediation: [
          { kind: "manual", title: "Pin to a catalog model id", body: "Replace the preview/alias id with a stable catalog model across all call sites.", applySafe: false },
        ],
      });
    }
    return findings;
  },
};
