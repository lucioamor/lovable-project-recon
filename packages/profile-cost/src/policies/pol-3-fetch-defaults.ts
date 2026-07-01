import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

interface StaticSignals {
  staleTimeSignals?: Array<{ file: string; snippet: string }>;
  backgroundPolling?: Array<{ file: string; intervalMs: number }>;
}

// POL-3 — Client & Realtime fetch defaults. Driver category B (client/Realtime amplification).
// Static-gated: needs `static` mode evidence (source `rg`). No-op under db/demo.
export const pol3FetchDefaults: Rule = {
  id: "POL-3",
  policy: "Client & Realtime fetch defaults",
  evaluate(ctx: RuleContext): Finding[] {
    const s = ctx.raw<StaticSignals>("static");
    if (!s) return [];
    const findings: Finding[] = [];

    for (const hit of s.staleTimeSignals ?? []) {
      findings.push({
        id: `POL-3:staleTime:${hit.file}`,
        policy: "POL-3",
        driverCat: "B",
        title: `\`staleTime:0\` / hover-preload in ${hit.file}`,
        severity: "medium",
        confidence: "confirmed",
        resourceId: "project",
        rationale:
          "Cost here scales with open-tab-hours, not user actions — the defining 'idle app still burning' " +
          "driver on the TanStack generation.",
        evidence: [{ source: "rg", detail: hit.file, snippet: hit.snippet }],
        remediation: [
          {
            kind: "manual",
            title: "Set QueryClient caps",
            body: "defaultOptions.queries.staleTime = 60_000; defaultPreloadStaleTime >= 30_000; refetchIntervalInBackground = false; pause polling on document.hidden.",
            applySafe: false,
          },
        ],
      });
    }
    return findings;
  },
};
