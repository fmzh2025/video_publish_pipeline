import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { runEveningPreflight } from "../src/preflight.mjs";
import { makeTempDir, testConfig } from "./helpers.mjs";

test("preflight validates the Home runtime, GitHub, callback, and auto_publish", async () => {
  const root = makeTempDir();
  const config = {
    ...testConfig(root),
    pipelineRoot: path.join(root, "app"),
    githubOwner: "fmzh2025",
    githubRepo: "MoneyPrinterTurbo",
    githubWorkflow: "generate-video.yml",
    callbackUrl: "https://callback.example.test/api/callback",
    callbackToken: "callback-token"
  };

  writeFile(path.join(config.pipelineRoot, "package.json"), "{}");
  writeFile(path.join(config.pipelineRoot, "src", "cli", "dispatch-workflow.mjs"), "");
  writeFile(path.join(config.autoPublishDir, "package.json"), "{}");
  writeFile(
    path.join(config.autoPublishDir, "scripts", "toutiao_publish_video.mjs"),
    ""
  );
  fs.mkdirSync(
    path.join(config.autoPublishDir, ".browser-data", "toutiao", "Default"),
    { recursive: true }
  );
  fs.mkdirSync(path.join(config.autoPublishDir, "resources"), { recursive: true });
  fs.mkdirSync(config.workdir, { recursive: true });

  const fetchImpl = async (url) => {
    if (String(url).startsWith("https://api.github.com/")) {
      return new Response(
        JSON.stringify({
          id: 123456,
          state: "active",
          path: ".github/workflows/generate-video.yml"
        }),
        {
        status: 200,
        headers: { "github-authentication-token-expiration": "2026-09-01 00:00:00 UTC" }
        }
      );
    }
    return new Response(JSON.stringify({ ok: false, error: "invalid_event" }), {
      status: 400
    });
  };

  const result = await runEveningPreflight({
    config,
    fetchImpl,
    minimumFreeBytes: 0
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.checks.map((item) => [item.name, item.ok]),
    [
      ["runtime_app", true],
      ["github_workflow", true],
      ["public_callback", true],
      ["auto_publish", true],
      ["system_disk", true]
    ]
  );
});

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
