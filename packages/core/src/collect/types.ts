import type { ImportedAction, Mode, Observation, ProjectIntent, ProjectMeta, Resource } from "../model.ts";

export interface Collected {
  project: ProjectMeta;
  resources: Resource[];
  observations: Observation[];
  /** raw query/scan results by name, for rules that want the unmapped payload */
  raw: Record<string, unknown>;
  warnings: string[];
  importedActions?: ImportedAction[];
  intent?: ProjectIntent;
  /** false when the collector is a stub / did not really evaluate the project (e.g. static M1). */
  assessed?: boolean;
}

export interface CollectOptions {
  projectName?: string;
  dbUrl?: string;
  repoPath?: string;
  token?: string;
  indexPath?: string;
  evidencePath?: string;
  projectId?: string;
  dir?: string;
  intent?: ProjectIntent;
}

export interface Collector {
  mode: Mode;
  collect(opts: CollectOptions): Promise<Collected>;
}
