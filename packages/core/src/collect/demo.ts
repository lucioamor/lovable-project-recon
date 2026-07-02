import type { Collected, CollectOptions } from "./types.ts";
import { evidenceToCollected } from "./evidence.ts";
import { CENTRAL_GENIAL_DEMO_EVIDENCE } from "./demo-evidence.ts";

// Embedded ProjectEvidence fixture built from the hand-reviewed central-genial corpus seed.
// Keeping it inside src makes `recon scan --mode demo` work from the published dist package.
export async function collectDemo(_opts: CollectOptions): Promise<Collected> {
  const collected = evidenceToCollected(CENTRAL_GENIAL_DEMO_EVIDENCE, "embedded:central-genial.evidence.json");

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
        projectId: CENTRAL_GENIAL_DEMO_EVIDENCE.project.id,
      },
    },
    warnings: ["demo mode - embedded ProjectEvidence fixture from the central-genial audit; not a live scan"],
  };
}
