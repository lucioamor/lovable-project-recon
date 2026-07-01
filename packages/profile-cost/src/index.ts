import type { Rule } from "@nxlv-ai/lovable-core";
import { pol1CronHygiene } from "./policies/pol-1-cron-hygiene.ts";
import { pol2LogRetention } from "./policies/pol-2-log-retention.ts";
import { pol3FetchDefaults } from "./policies/pol-3-fetch-defaults.ts";
import { pol4AiCost } from "./policies/pol-4-ai-cost.ts";
import { pol5RlsTenancy } from "./policies/pol-5-rls-tenancy.ts";
import { pol6Secrets } from "./policies/pol-6-secrets.ts";
import { pol7WriteAmplification } from "./policies/pol-7-write-amplification.ts";
import { pol8Observability } from "./policies/pol-8-observability.ts";
import { pol9IdleLifecycle } from "./policies/pol-9-idle-lifecycle.ts";

/** The cost/runtime profile — POL-1..9 from the remediation backlog. */
export const costRules: Rule[] = [
  pol1CronHygiene,
  pol2LogRetention,
  pol3FetchDefaults,
  pol4AiCost,
  pol5RlsTenancy,
  pol6Secrets,
  pol7WriteAmplification,
  pol8Observability,
  pol9IdleLifecycle,
];

export {
  pol1CronHygiene,
  pol2LogRetention,
  pol3FetchDefaults,
  pol4AiCost,
  pol5RlsTenancy,
  pol6Secrets,
  pol7WriteAmplification,
  pol8Observability,
  pol9IdleLifecycle,
};
