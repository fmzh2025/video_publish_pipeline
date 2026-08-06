import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { handleWorkflowCompletedEvent } from "../src/processor.mjs";
import { makeTempDir, sampleEvent, testConfig, writeZip } from "./helpers.mjs";

test("processor downloads artifact, extracts final-1.mp4, prepares resource, and publishes", async () => {
  const root = makeTempDir();
  const config = testConfig(root);
  let publishCalled = false;

  const result = await handleWorkflowCompletedEvent(sampleEvent(), {
    config,
    downloadArtifactZip: async ({ outputPath }) => {
      writeZip(outputPath, [
        {
          name: "storage/tasks/abc/final-1.mp4",
          data: "video"
        }
      ]);
      return { path: outputPath, bytes: fs.statSync(outputPath).size };
    },
    runToutiaoPublish: async ({ resource }) => {
      publishCalled = true;
      assert.equal(fs.readFileSync(resource.videoFile, "utf8"), "video");
      return {
        code: 0,
        stdout: JSON.stringify({
          ok: true,
          status: "submitted",
          archiveDir: "/archive",
          pageUrl: "https://example.com/video"
        }),
        stderr: "",
        parsed: {
          ok: true,
          status: "submitted",
          archiveDir: "/archive",
          pageUrl: "https://example.com/video"
        }
      };
    }
  });

  assert.equal(publishCalled, true);
  assert.equal(result.status, "published");
  assert.equal(result.toutiao_status, "submitted");
  assert.equal(result.toutiao_page_url, "https://example.com/video");
  assert.ok(fs.existsSync(path.join(config.workdir, "req-test-001.status.json")));
});

test("processor stops on failed workflow events", async () => {
  const root = makeTempDir();
  const config = testConfig(root);
  const result = await handleWorkflowCompletedEvent(
    sampleEvent({
      status: "failure",
      conclusion: "failure",
      artifact_id: "",
      artifact_name: ""
    }),
    {
      config,
      downloadArtifactZip: async () => {
        throw new Error("should not download");
      }
    }
  );

  assert.equal(result.status, "workflow_failed");
});

test("processor records download progress and download failures", async () => {
  const root = makeTempDir();
  const config = testConfig(root);
  const result = await handleWorkflowCompletedEvent(sampleEvent(), {
    config,
    downloadArtifactZip: async ({ onProgress }) => {
      onProgress({
        partPath: path.join(config.workdir, "req-test-001", "artifact.zip.part"),
        downloadedBytes: 512,
        totalBytes: 1024,
        speedBytesPerSecond: 128,
        elapsedMs: 4000
      });
      throw new Error("network timeout");
    }
  });

  assert.equal(result.status, "download_failed");
  assert.equal(result.download_failed, true);
  assert.equal(result.downloaded_bytes, 512);
  assert.equal(result.download_total_bytes, 1024);
  assert.equal(result.error, "network timeout");
});

test("processor records publish failures", async () => {
  const root = makeTempDir();
  const config = testConfig(root);
  const result = await handleWorkflowCompletedEvent(sampleEvent(), {
    config,
    downloadArtifactZip: async ({ outputPath }) => {
      writeZip(outputPath, [
        {
          name: "storage/tasks/abc/final-1.mp4",
          data: "video"
        }
      ]);
      return { path: outputPath, bytes: fs.statSync(outputPath).size };
    },
    runToutiaoPublish: async () => {
      const error = new Error("publish command failed");
      error.result = {
        code: 1,
        stdout: "stdout",
        stderr: "stderr"
      };
      throw error;
    }
  });

  assert.equal(result.status, "publish_failed");
  assert.equal(result.toutiao_status, "failed");
  assert.equal(result.auto_publish_stdout, "stdout");
  assert.equal(result.auto_publish_stderr, "stderr");
});

test("processor does not mark unverified Toutiao submissions as published", async () => {
  const root = makeTempDir();
  const config = testConfig(root);
  const result = await handleWorkflowCompletedEvent(sampleEvent(), {
    config,
    downloadArtifactZip: async ({ outputPath }) => {
      writeZip(outputPath, [
        {
          name: "storage/tasks/abc/final-1.mp4",
          data: "video"
        }
      ]);
      return { path: outputPath, bytes: fs.statSync(outputPath).size };
    },
    runToutiaoPublish: async () => ({
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        status: "submitted_unverified",
        archiveDir: "/archive",
        pageUrl: "https://mp.toutiao.com/profile_v4/content/video"
      }),
      stderr: "",
      parsed: {
        ok: true,
        status: "submitted_unverified",
        archiveDir: "/archive",
        pageUrl: "https://mp.toutiao.com/profile_v4/content/video"
      }
    })
  });

  assert.equal(result.status, "publish_unverified");
  assert.equal(result.toutiao_status, "submitted_unverified");
});
