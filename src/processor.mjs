import fs from "node:fs";
import path from "node:path";
import {
  isSuccessfulWorkflowEvent,
  parseRepository,
  validateWorkflowCompletedEvent
} from "./events.mjs";
import { extractArtifactZip, findFinalVideo } from "./artifact.mjs";
import { downloadArtifactZip } from "./githubArtifactDownloader.mjs";
import {
  prepareAutoPublishResource,
  runToutiaoPublish
} from "./autoPublishAdapter.mjs";
import { LocalStateStore, sanitizeFilePart } from "./stateStore.mjs";

export async function handleWorkflowCompletedEvent(rawEvent, options = {}) {
  const event = validateWorkflowCompletedEvent(rawEvent);
  const config = options.config;
  if (!config) throw new Error("processor config is required");

  const stateStore =
    options.stateStore ||
    new LocalStateStore({ logsDir: config.logsDir, workdir: config.workdir });

  await stateStore.update(event.request_id, {
    status: "received",
    event
  });

  if (!isSuccessfulWorkflowEvent(event)) {
    return stateStore.update(event.request_id, {
      status: "workflow_failed",
      conclusion: event.conclusion
    });
  }

  const requestDir = path.join(config.workdir, sanitizeFilePart(event.request_id));
  fs.mkdirSync(requestDir, { recursive: true });

  const { owner, repo } = parseRepository(event.repository);
  const artifactZip = path.join(requestDir, "artifact.zip");
  await stateStore.update(event.request_id, {
    status: "downloading",
    artifact_id: event.artifact_id,
    artifact_zip: artifactZip,
    artifact_part: `${artifactZip}.part`,
    downloaded_bytes: 0,
    download_total_bytes: "",
    download_failed: false
  });

  let progressUpdate = Promise.resolve();
  const updateDownloadProgress = (progress) => {
    progressUpdate = progressUpdate
      .then(() =>
        stateStore.update(event.request_id, {
          status: "downloading",
          artifact_id: event.artifact_id,
          artifact_zip: artifactZip,
          artifact_part: progress.partPath || `${artifactZip}.part`,
          downloaded_bytes: progress.downloadedBytes ?? 0,
          download_total_bytes: progress.totalBytes || "",
          download_speed_bytes_per_second: progress.speedBytesPerSecond || 0,
          download_elapsed_ms: progress.elapsedMs || 0,
          download_failed: false
        })
      )
      .catch(() => {});
    return progressUpdate;
  };

  let downloadResult;
  try {
    downloadResult = await (options.downloadArtifactZip || downloadArtifactZip)({
      owner,
      repo,
      artifactId: event.artifact_id,
      token: config.githubToken,
      outputPath: artifactZip,
      curlBin: config.artifactCurlBin,
      connectTimeoutSeconds: config.artifactDownloadConnectTimeoutSeconds,
      maxTimeSeconds: config.artifactDownloadMaxTimeSeconds,
      progressIntervalMs: config.artifactDownloadProgressIntervalMs,
      onProgress: updateDownloadProgress
    });
    await progressUpdate;
  } catch (error) {
    await progressUpdate;
    return stateStore.update(event.request_id, {
      status: "download_failed",
      download_failed: true,
      artifact_id: event.artifact_id,
      artifact_zip: artifactZip,
      artifact_part: `${artifactZip}.part`,
      error: error.message,
      error_result: error.result || undefined
    });
  }

  await stateStore.update(event.request_id, {
    status: "downloaded",
    artifact_zip: artifactZip,
    artifact_bytes: downloadResult.bytes,
    downloaded_bytes: downloadResult.bytes,
    download_total_bytes: downloadResult.bytes,
    download_failed: false
  });

  const extractDir = path.join(requestDir, "artifact");
  await stateStore.update(event.request_id, { status: "extracting" });
  await (options.extractArtifactZip || extractArtifactZip)({
    zipPath: artifactZip,
    outputDir: extractDir
  });

  const finalVideo = (options.findFinalVideo || findFinalVideo)(extractDir);
  await stateStore.update(event.request_id, {
    status: "extracted",
    final_video: finalVideo
  });

  const resource = (options.prepareAutoPublishResource || prepareAutoPublishResource)({
    autoPublishDir: config.autoPublishDir,
    event,
    finalVideoPath: finalVideo
  });

  await stateStore.update(event.request_id, {
    status: "publishing",
    toutiao_title: resource.title,
    auto_publish_resource_dir: resource.resourceDir
  });

  let publishResult;
  try {
    publishResult = await (options.runToutiaoPublish || runToutiaoPublish)({
      config,
      resource
    });
  } catch (error) {
    return stateStore.update(event.request_id, {
      status: "publish_failed",
      toutiao_status: "failed",
      auto_publish_resource_dir: resource.resourceDir,
      auto_publish_stdout: error.result?.stdout || "",
      auto_publish_stderr: error.result?.stderr || "",
      error: error.message,
      error_result: error.result || undefined
    });
  }
  const parsed = publishResult.parsed || {};
  const status =
    parsed.status === "submitted"
      ? "published"
      : parsed.status === "submitted_unverified"
        ? "publish_unverified"
        : "failed";

  return stateStore.update(event.request_id, {
    status,
    toutiao_status: parsed.status || "",
    toutiao_archive_dir: parsed.archiveDir || "",
    toutiao_page_url: parsed.pageUrl || "",
    toutiao_manage_url: parsed.manageUrl || "",
    auto_publish_stdout: publishResult.stdout || "",
    auto_publish_stderr: publishResult.stderr || ""
  });
}
