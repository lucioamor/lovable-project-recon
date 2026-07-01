import type { Finding, Rule, RuleContext } from "@nxlv-ai/lovable-core";

// POL-7 — Write-amplification & trigger discipline. Driver category D.
// M0 documented stub: full detection needs trigger bodies (`pg_get_triggerdef`) and
// `pg_stat_user_tables` where n_tup_upd >> n_tup_ins. Wired in a later milestone.
export const pol7WriteAmplification: Rule = {
  id: "POL-7",
  policy: "Write-amplification & trigger discipline",
  evaluate(_ctx: RuleContext): Finding[] {
    return [];
  },
};
