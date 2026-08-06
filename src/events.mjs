export const WORKFLOW_COMPLETED_EVENT = "mpt.video.workflow.completed";

const REQUIRED_FIELDS = [
  "event_type",
  "request_id",
  "repository",
  "workflow",
  "run_id",
  "status",
  "conclusion",
  "video_subject",
  "created_at"
];

const REQUIRED_SUCCESS_FIELDS = ["artifact_id", "artifact_name"];

export class EventValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "EventValidationError";
    this.details = details;
  }
}

export function isSuccessfulWorkflowEvent(event) {
  return String(event?.conclusion || event?.status || "").toLowerCase() === "success";
}

export function normalizeRedisStreamFields(fields) {
  if (!Array.isArray(fields)) {
    return { ...fields };
  }

  if (fields.length % 2 !== 0) {
    throw new EventValidationError("invalid Redis stream fields", {
      reason: "field array length must be even"
    });
  }

  const event = {};
  for (let i = 0; i < fields.length; i += 2) {
    event[String(fields[i])] = fields[i + 1] == null ? "" : String(fields[i + 1]);
  }
  return event;
}

export function normalizeWorkflowCompletedEvent(rawEvent) {
  const event = normalizeRedisStreamFields(rawEvent);
  return Object.fromEntries(
    Object.entries(event).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
}

export function validateWorkflowCompletedEvent(rawEvent) {
  const event = normalizeWorkflowCompletedEvent(rawEvent);
  const missing = REQUIRED_FIELDS.filter((field) => !String(event[field] || "").trim());
  if (missing.length > 0) {
    throw new EventValidationError("invalid workflow completed event", {
      reason: "missing_required_fields",
      fields: missing
    });
  }

  if (event.event_type !== WORKFLOW_COMPLETED_EVENT) {
    throw new EventValidationError("invalid workflow completed event", {
      reason: "unsupported_event_type",
      event_type: event.event_type
    });
  }

  if (isSuccessfulWorkflowEvent(event)) {
    const missingSuccessFields = REQUIRED_SUCCESS_FIELDS.filter(
      (field) => !String(event[field] || "").trim()
    );
    if (missingSuccessFields.length > 0) {
      throw new EventValidationError("invalid successful workflow event", {
        reason: "missing_success_fields",
        fields: missingSuccessFields
      });
    }
  }

  return event;
}

export function parseRepository(repository) {
  const [owner, repo, ...rest] = String(repository || "").split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new EventValidationError("invalid repository", {
      repository
    });
  }
  return { owner, repo };
}
