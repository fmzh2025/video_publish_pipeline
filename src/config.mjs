import os from "node:os";
import path from "node:path";

const DEFAULT_PIPELINE_ROOT = path.resolve(
  process.cwd().endsWith("video_publish_pipeline") ? process.cwd() : "video_publish_pipeline"
);

export function loadConfig(env = process.env) {
  const pipelineRoot = env.PIPELINE_ROOT || DEFAULT_PIPELINE_ROOT;
  return {
    githubOwner: env.GITHUB_OWNER || "fmzh2025",
    githubRepo: env.GITHUB_REPO || "MoneyPrinterTurbo",
    githubWorkflow: env.GITHUB_WORKFLOW || "generate-video.yml",
    githubRef: env.GITHUB_REF || "main",
    githubToken: env.GITHUB_TOKEN || "",

    notifyChannel: env.MPT_NOTIFY_CHANNEL || "callback",
    callbackHost: env.MPT_CALLBACK_HOST || "0.0.0.0",
    callbackPort: Number(env.MPT_CALLBACK_PORT || 32199),
    callbackPath: env.MPT_CALLBACK_PATH || "/api/mpt/video/workflow-callback",
    callbackToken: env.MPT_CALLBACK_TOKEN || "",
    callbackUrl: env.MPT_CALLBACK_URL || "",

    upstashRedisUrl: env.UPSTASH_REDIS_URL || "",
    upstashRedisToken: env.UPSTASH_REDIS_TOKEN || "",
    upstashRedisRestUrl: env.UPSTASH_REDIS_REST_URL || "",
    upstashRedisRestToken: env.UPSTASH_REDIS_REST_TOKEN || "",
    streamKey: env.MPT_STREAM_KEY || "mpt:video:events",
    consumerGroup: env.MPT_CONSUMER_GROUP || "mpt-video-workers",
    consumerName: env.MPT_CONSUMER_NAME || `${os.hostname()}-${process.pid}`,

    pipelineRoot,
    workdir: env.WORKDIR || path.join(pipelineRoot, "workdir"),
    logsDir: env.LOGS_DIR || path.join(pipelineRoot, "logs"),
    autoPublishDir:
      env.AUTO_PUBLISH_DIR || "/Users/fumingzhen/project/auto_publish",

    artifactCurlBin: env.ARTIFACT_CURL_BIN || "curl",
    artifactDownloadConnectTimeoutSeconds:
      env.ARTIFACT_DOWNLOAD_CONNECT_TIMEOUT_SECONDS || "30",
    artifactDownloadMaxTimeSeconds: env.ARTIFACT_DOWNLOAD_MAX_TIME_SECONDS || "7200",
    artifactDownloadProgressIntervalMs:
      env.ARTIFACT_DOWNLOAD_PROGRESS_INTERVAL_MS || "5000",

    toutiaoPublish: env.TOUTIAO_PUBLISH !== "false",
    toutiaoWaitLoginMs: env.TOUTIAO_WAIT_LOGIN_MS || "300000",
    toutiaoUploadTimeoutMs: env.TOUTIAO_UPLOAD_TIMEOUT_MS || "1800000",
    toutiaoProcessTimeoutMs: env.TOUTIAO_PROCESS_TIMEOUT_MS || "1800000",
    toutiaoKeepOpen: env.TOUTIAO_KEEP_OPEN || "false"
  };
}

export function requireConfigValue(config, key, label = key) {
  if (!String(config[key] || "").trim()) {
    throw new Error(`missing required config: ${label}`);
  }
  return config[key];
}
