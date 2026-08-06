import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkflowDispatchInputs,
  dispatchWorkflow
} from "../src/githubWorkflowDispatch.mjs";
import {
  parseXreadgroupResponse,
  xaddWorkflowCompletedEvent
} from "../src/redisRest.mjs";
import { sampleEvent } from "./helpers.mjs";

test("builds dispatch inputs with request_id and defaults", () => {
  const inputs = buildWorkflowDispatchInputs({
    request_id: "req-1",
    video_subject: "主题"
  });
  assert.equal(inputs.request_id, "req-1");
  assert.equal(inputs.video_subject, "主题");
  assert.equal(inputs.llm_provider, "moonshot");
  assert.equal(inputs.subtitle_enabled, true);
});

test("dispatches GitHub workflow", async () => {
  let captured;
  const result = await dispatchWorkflow({
    owner: "fmzh2025",
    repo: "MoneyPrinterTurbo",
    workflow: "generate-video.yml",
    ref: "main",
    token: "token",
    inputs: {
      request_id: "req-1",
      video_subject: "主题"
    },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(null, { status: 204 });
    }
  });

  assert.equal(result.status, "dispatched");
  assert.equal(result.request_id, "req-1");
  assert.match(captured.url, /actions\/workflows\/generate-video\.yml\/dispatches$/);
  assert.equal(JSON.parse(captured.options.body).inputs.video_subject, "主题");
});

test("serializes workflow event to Upstash XADD pipeline command", async () => {
  let body;
  await xaddWorkflowCompletedEvent({
    restUrl: "https://upstash.example",
    token: "token",
    streamKey: "mpt:video:events",
    event: sampleEvent(),
    fetchImpl: async (url, options) => {
      body = JSON.parse(options.body);
      return new Response(JSON.stringify([{ result: "1-0" }]), { status: 200 });
    }
  });

  assert.equal(body[0][0], "XADD");
  assert.equal(body[0][1], "mpt:video:events");
  assert.ok(body[0].includes("request_id"));
  assert.ok(body[0].includes("req-test-001"));
});

test("parses XREADGROUP responses", () => {
  const entries = parseXreadgroupResponse([
    {
      result: [
        [
          "mpt:video:events",
          [["1-0", ["event_type", "mpt.video.workflow.completed", "request_id", "req-1"]]]
        ]
      ]
    }
  ]);

  assert.deepEqual(entries, [
    {
      streamKey: "mpt:video:events",
      id: "1-0",
      event: {
        event_type: "mpt.video.workflow.completed",
        request_id: "req-1"
      }
    }
  ]);
});
