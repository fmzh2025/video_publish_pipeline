import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  buildToutiaoPublishCommand,
  parseLastJsonObject,
  prepareAutoPublishResource
} from "../src/autoPublishAdapter.mjs";
import { makeTempDir, sampleEvent, testConfig } from "./helpers.mjs";

test("prepares auto_publish resource directory and command", () => {
  const root = makeTempDir();
  const config = testConfig(root);
  const finalVideoPath = path.join(root, "final-1.mp4");
  fs.writeFileSync(finalVideoPath, "video");

  const resource = prepareAutoPublishResource({
    autoPublishDir: config.autoPublishDir,
    event: sampleEvent(),
    finalVideoPath,
    date: new Date("2026-08-05T12:34:56+08:00")
  });

  assert.equal(fs.readFileSync(resource.videoFile, "utf8"), "video");
  assert.equal(
    fs.readFileSync(resource.descriptionFile, "utf8").trim(),
    "人工智能如何改变普通人的日常生活"
  );
  assert.equal(JSON.parse(fs.readFileSync(resource.metadataFile, "utf8")).request_id, "req-test-001");

  const command = buildToutiaoPublishCommand({ config, resource });
  assert.equal(command.command, "npm");
  assert.equal(command.cwd, config.autoPublishDir);
  assert.ok(command.args.includes("--publish"));
  assert.equal(command.args.includes("--cover-file"), false);

  const coverFile = path.join(resource.resourceDir, "cover.jpg");
  fs.writeFileSync(coverFile, "cover");
  const commandWithCover = buildToutiaoPublishCommand({ config, resource });
  const coverArgIndex = commandWithCover.args.indexOf("--cover-file");
  assert.notEqual(coverArgIndex, -1);
  assert.equal(commandWithCover.args[coverArgIndex + 1], coverFile);
});

test("parses the last JSON object from command output", () => {
  const parsed = parseLastJsonObject(
    'log line\n{"status":"ignored"}\nmore\n{"ok":true,"status":"submitted","nested":{"a":1}}\n'
  );
  assert.deepEqual(parsed, {
    ok: true,
    status: "submitted",
    nested: { a: 1 }
  });
});
