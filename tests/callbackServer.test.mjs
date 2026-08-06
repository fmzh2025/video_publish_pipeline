import assert from "node:assert/strict";
import test from "node:test";
import { handleCallbackRequest } from "../src/callbackServer.mjs";
import { InMemoryJobQueue } from "../src/jobQueue.mjs";
import { sampleEvent } from "./helpers.mjs";

test("callback server validates token and enqueues valid events", async () => {
  const received = [];
  const config = {
    callbackPath: "/api/mpt/video/workflow-callback",
    callbackToken: "secret"
  };
  const queue = new InMemoryJobQueue({
    handler: async (event) => {
      received.push(event);
    }
  });

  const unauthorized = await handleCallbackRequest({
    method: "POST",
    url: config.callbackPath,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sampleEvent()),
    config,
    queue
  });
  assert.equal(unauthorized.statusCode, 401);

  const invalid = await handleCallbackRequest({
    method: "POST",
    url: config.callbackPath,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer secret"
    },
    body: JSON.stringify({ event_type: "bad" }),
    config,
    queue
  });
  assert.equal(invalid.statusCode, 400);

  const accepted = await handleCallbackRequest({
    method: "POST",
    url: config.callbackPath,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer secret"
    },
    body: JSON.stringify(sampleEvent()),
    config,
    queue
  });
  assert.equal(accepted.statusCode, 202);
  assert.equal(accepted.body.status, "accepted");

  await queue.waitForIdle();
  assert.equal(received.length, 1);
  assert.equal(received[0].request_id, "req-test-001");
});
