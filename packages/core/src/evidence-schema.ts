import type { ImportedAction, Observation, ProjectMeta, Resource, ResourceKind } from "./model.ts";

export const PROJECT_EVIDENCE_SCHEMA_VERSION = 1;

const RESOURCE_KINDS = new Set<ResourceKind>(["project", "cloud", "db", "table", "cron_job", "edge_fn", "bucket", "realtime", "ai_config", "rls_policy", "secret", "trigger"]);

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
    if (project["id"] !== undefined && !isString(project["id"])) errors.push("project.id must be a string when present");
    if (!isString(project["name"])) errors.push("project.name must be a string");
    if (!isDateOnly(project["evidenceGenerated"])) errors.push("project.evidenceGenerated must be a YYYY-MM-DD string");
    if (project["evidenceSource"] !== undefined && !isString(project["evidenceSource"])) errors.push("project.evidenceSource must be a string when present");
    if (project["supabaseRef"] !== undefined && !isString(project["supabaseRef"])) errors.push("project.supabaseRef must be a string when present");
    if (project["stack"] !== undefined && !isString(project["stack"])) errors.push("project.stack must be a string when present");
  }

  const resourceIds = new Set<string>();
  const resources = value["resources"];
  if (!Array.isArray(resources)) {
    errors.push("resources must be an array");
  } else {
    resources.forEach((resource, i) => {
      if (!isRecord(resource)) {
        errors.push(`resources[${i}] must be an object`);
        return;
      }
      const id = resource["id"];
      const kind = resource["kind"];
      if (!isString(id)) errors.push(`resources[${i}].id must be a string`);
      else if (resourceIds.has(id)) errors.push(`resources[${i}].id duplicates ${id}`);
      else resourceIds.add(id);
      if (!isString(kind)) errors.push(`resources[${i}].kind must be a string`);
      else if (!RESOURCE_KINDS.has(kind as ResourceKind)) errors.push(`resources[${i}].kind must be a known ResourceKind`);
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
      const resourceId = observation["resourceId"];
      if (!isString(resourceId)) errors.push(`observations[${i}].resourceId must be a string`);
      else if (!resourceIds.has(resourceId)) errors.push(`observations[${i}].resourceId must reference a resource id`);
      if (!isString(observation["metric"])) errors.push(`observations[${i}].metric must be a string`);
      if (!isIsoDateTime(observation["measuredAt"])) errors.push(`observations[${i}].measuredAt must be an ISO string`);
      if (!("value" in observation)) errors.push(`observations[${i}].value is required`);
    });
  }

  const importedActions = value["importedActions"];
  if (importedActions !== undefined) {
    if (!Array.isArray(importedActions)) {
      errors.push("importedActions must be an array when present");
    } else {
      importedActions.forEach((action, i) => validateImportedAction(action, i, errors));
    }
  }

  if (value["raw"] !== undefined && !isRecord(value["raw"])) errors.push("raw must be an object when present");
  if (value["warnings"] !== undefined) {
    if (!Array.isArray(value["warnings"])) errors.push("warnings must be an array when present");
    else
      value["warnings"].forEach((warning, i) => {
        if (!isString(warning)) errors.push(`warnings[${i}] must be a string`);
      });
  }

  return errors.length ? { ok: false, errors } : { ok: true, evidence: value as unknown as ProjectEvidence };
}

function validateImportedAction(value: unknown, i: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`importedActions[${i}] must be an object`);
    return;
  }
  if (value["rank"] !== undefined && !isFiniteNumber(value["rank"])) errors.push(`importedActions[${i}].rank must be a number when present`);
  if (!isString(value["action"])) errors.push(`importedActions[${i}].action must be a string`);
  for (const key of ["severity", "effort", "status", "policy", "source"]) {
    if (value[key] !== undefined && !isString(value[key])) errors.push(`importedActions[${i}].${key} must be a string when present`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDateOnly(value: unknown): value is string {
  return isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function isIsoDateTime(value: unknown): value is string {
  return isString(value) && Number.isFinite(Date.parse(value));
}
