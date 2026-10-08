import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

interface StaticSignals {
  staleTimeSignals?: Array<{ file: string; snippet: string }>;
  backgroundPolling?: Array<{ file: string; intervalMs: number }>;
  authStateSignals?: Array<{ file: string; snippet: string }>;
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
        rationale: "Cost here scales with open-tab-hours, not user actions — the defining 'idle app still burning' " + "driver on the TanStack generation.",
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

    // Background polling: a timer that keeps firing while the tab is hidden bills for
    // wall-clock time no user is watching. `refetchIntervalInBackground:true` (intervalMs 0
    // = flag present) is the clearest offender; a bare short refetchInterval is a weaker signal.
    for (const bp of s.backgroundPolling ?? []) {
      const flagged = bp.intervalMs === 0;
      findings.push({
        id: `POL-3:bgpoll:${bp.file}`,
        policy: "POL-3",
        driverCat: "B",
        title: flagged ? `\`refetchIntervalInBackground:true\` in ${bp.file}` : `background \`refetchInterval:${bp.intervalMs}ms\` in ${bp.file}`,
        severity: flagged ? "medium" : "low",
        confidence: flagged ? "confirmed" : "hypothesis",
        resourceId: "project",
        rationale: "A query that refetches while the tab is backgrounded burns runtime for wall-clock time no user is watching — cost decoupled from usage.",
        evidence: [{ source: "rg", detail: bp.file }],
        remediation: [
          {
            kind: "manual",
            title: "Pause polling when the tab is hidden",
            body: "Set refetchIntervalInBackground:false; gate any refetchInterval on document.visibilityState === 'visible'.",
            applySafe: false,
          },
        ],
      });
    }

    // onAuthStateChange fan-out: a handler that re-fetches on every auth event (and can
    // re-fire on token refresh) is a known amplification source. Reported as hypothesis —
    // static can't prove the handler is heavy, only that the wiring exists.
    for (const a of s.authStateSignals ?? []) {
      findings.push({
        id: `POL-3:authstate:${a.file}`,
        policy: "POL-3",
        driverCat: "B",
        title: `\`onAuthStateChange\` handler in ${a.file}`,
        severity: "low",
        confidence: "hypothesis",
        resourceId: "project",
        rationale: "onAuthStateChange fires on sign-in, sign-out AND silent token refresh. If the handler re-queries or subscribes, cost multiplies per session refresh rather than per user action.",
        evidence: [{ source: "rg", detail: a.file, snippet: a.snippet }],
        remediation: [
          {
            kind: "manual",
            title: "Keep the auth callback cheap",
            body: "Only set session state synchronously inside onAuthStateChange; defer any Supabase calls with setTimeout(0) and dedupe on event type to avoid refetch storms on TOKEN_REFRESHED.",
            applySafe: false,
          },
        ],
      });
    }
    return findings;
  },
};
