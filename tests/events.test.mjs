import assert from "node:assert/strict";
import test from "node:test";
import {
  EventValidationError,
  isSuccessfulWorkflowEvent,
  normalizeRedisStreamFields,
  parseRepository,
  validateWorkflowCompletedEvent
} from "../src/events.mjs";
import { sampleEvent } from "./helpers.mjs";

test("validates a successful workflow completed event", () => {
  const event = validateWorkflowCompletedEvent(sampleEvent());
  assert.equal(event.event_type, "mpt.video.workflow.completed");
  assert.equal(event.request_id, "req-test-001");
  assert.equal(isSuccessfulWorkflowEvent(event), true);
});

test("accepts failed workflow events without artifact fields", () => {
  const event = validateWorkflowCompletedEvent(
    sampleEvent({
      status: "failure",
      conclusion: "failure",
      artifact_id: "",
      artifact_name: ""
    })
  );
  assert.equal(isSuccessfulWorkflowEvent(event), false);
});

test("rejects successful workflow events without artifact_id", () => {
  assert.throws(
    () => validateWorkflowCompletedEvent(sampleEvent({ artifact_id: "" })),
    EventValidationError
  );
});

test("normalizes Redis stream field arrays", () => {
  const event = normalizeRedisStreamFields([
    "event_type",
    "mpt.video.workflow.completed",
    "request_id",
    "req-1"
  ]);
  assert.deepEqual(event, {
    event_type: "mpt.video.workflow.completed",
    request_id: "req-1"
  });
});

test("parses owner and repo", () => {
  assert.deepEqual(parseRepository("fmzh2025/MoneyPrinterTurbo"), {
    owner: "fmzh2025",
    repo: "MoneyPrinterTurbo"
  });
});
