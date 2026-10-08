import type { Collected, CollectOptions } from "./types.ts";
import { evidenceToCollected } from "./evidence.ts";
import { SAMPLE_03_DEMO_EVIDENCE } from "./demo-evidence.ts";

// Embedded ProjectEvidence fixture built from the hand-reviewed sample-03 corpus seed.
// Keeping it inside src makes `recon scan --mode demo` work from the published dist package.
export async function collectDemo(_opts: CollectOptions): Promise<Collected> {
  const collected = evidenceToCollected(SAMPLE_03_DEMO_EVIDENCE, "embedded:sample-03.evidence.json");

  return {
    ...collected,
    project: {
      ...collected.project,
      mode: "demo",
    },
    raw: {
      ...collected.raw,
      demo: {
        source: "embedded ProjectEvidence fixture",
        projectId: SAMPLE_03_DEMO_EVIDENCE.project.id,
      },
    },
    warnings: ["demo mode - embedded ProjectEvidence fixture from the sample-03 audit; not a live scan"],
  };
}
