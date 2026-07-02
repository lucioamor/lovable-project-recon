import type { ImportedAction, Observation, ProjectMeta, Resource } from "./model.ts";

export const PROJECT_EVIDENCE_SCHEMA_VERSION = 1;

export interface ProjectEvidence {
  schemaVersion: 1;
  project: Omit<ProjectMeta, "mode" | "scannedAt"> & {
    id?: string;
    evidenceGenerated: string;
    evidenceSource?: string;
  };
  resources: Resource[];
  observations: Observation[];
  importedActions?: ImportedAction[];
  raw?: Record<string, unknown>;
  warnings?: string[];
}

export function validateProjectEvidence(value: unknown): { ok: true; evidence: ProjectEvidence } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ["evidence must be a JSON object"] };

  if (value["schemaVersion"] !== PROJECT_EVIDENCE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${PROJECT_EVIDENCE_SCHEMA_VERSION}`);

  const project = value["project"];
  if (!isRecord(project)) {
    errors.push("project must be an object");
  } else {
    if (!isString(project["name"])) errors.push("project.name must be a string");
    if (!isString(project["evidenceGenerated"])) errors.push("project.evidenceGenerated must be a YYYY-MM-DD string");
    if (project["supabaseRef"] !== undefined && !isString(project["supabaseRef"])) errors.push("project.supabaseRef must be a string when present");
    if (project["stack"] !== undefined && !isString(project["stack"])) errors.push("project.stack must be a string when present");
  }

  const resources = value["resources"];
  if (!Array.isArray(resources)) {
    errors.push("resources must be an array");
  } else {
    resources.forEach((resource, i) => {
      if (!isRecord(resource)) {
        errors.push(`resources[${i}] must be an object`);
        return;
      }
      if (!isString(resource["id"])) errors.push(`resources[${i}].id must be a string`);
      if (!isString(resource["kind"])) errors.push(`resources[${i}].kind must be a string`);
      if (!isString(resource["name"])) errors.push(`resources[${i}].name must be a string`);
      if (!isRecord(resource["attrs"])) errors.push(`resources[${i}].attrs must be an object`);
    });
  }

  const observations = value["observations"];
  if (!Array.isArray(observations)) {
    errors.push("observations must be an array");
  } else {
    observations.forEach((observation, i) => {
      if (!isRecord(observation)) {
        errors.push(`observations[${i}] must be an object`);
        return;
      }
      if (!isString(observation["resourceId"])) errors.push(`observations[${i}].resourceId must be a string`);
      if (!isString(observation["metric"])) errors.push(`observations[${i}].metric must be a string`);
      if (!isString(observation["measuredAt"])) errors.push(`observations[${i}].measuredAt must be an ISO string`);
      if (!("value" in observation)) errors.push(`observations[${i}].value is required`);
    });
  }

  const importedActions = value["importedActions"];
  if (importedActions !== undefined && !Array.isArray(importedActions)) errors.push("importedActions must be an array when present");

  if (value["raw"] !== undefined && !isRecord(value["raw"])) errors.push("raw must be an object when present");
  if (value["warnings"] !== undefined && !Array.isArray(value["warnings"])) errors.push("warnings must be an array when present");

  return errors.length ? { ok: false, errors } : { ok: true, evidence: value as unknown as ProjectEvidence };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
