import type { Mode, Observation, ProjectMeta, Resource } from "../model.ts";

export interface Collected {
  project: ProjectMeta;
  resources: Resource[];
  observations: Observation[];
  /** raw query/scan results by name, for rules that want the unmapped payload */
  raw: Record<string, unknown>;
  warnings: string[];
}

export interface CollectOptions {
  projectName?: string;
  dbUrl?: string;
  repoPath?: string;
  token?: string;
}

export interface Collector {
  mode: Mode;
  collect(opts: CollectOptions): Promise<Collected>;
}
