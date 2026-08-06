import fs from "node:fs";
import path from "node:path";

const DEFAULT_MINIMUM_FREE_BYTES = 2 * 1024 * 1024 * 1024;

export async function runEveningPreflight({
  config,
  fetchImpl = fetch,
  minimumFreeBytes = DEFAULT_MINIMUM_FREE_BYTES
}) {
  if (!config) throw new Error("preflight config is required");

  const checks = [];
  const check = async (name, operation) => {
    try {
      const details = (await operation()) || {};
      checks.push({ name, ok: true, ...details });
    } catch (error) {
      checks.push({ name, ok: false, error: error.message });
    }
  };

  await check("runtime_app", () => {
    requireReadableFile(path.join(config.pipelineRoot, "package.json"));
    requireReadableFile(path.join(config.pipelineRoot, "src", "cli", "dispatch-workflow.mjs"));
    return { path: config.pipelineRoot };
  });

  await check("github_workflow", async () => {
    if (!config.githubToken) throw new Error("GITHUB_TOKEN is missing");
    const url = `https://api.github.com/repos/${config.githubOwner}/${config.githubRepo}/actions/workflows/${encodeURIComponent(config.githubWorkflow)}`;
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${config.githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "video-publish-pipeline-preflight"
      }
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub workflow check failed: ${response.status} ${body}`.trim());
    }
    const workflow = await response.json();
    if (workflow.state !== "active") {
      throw new Error(`GitHub workflow is not active: ${workflow.state || "unknown"}`);
    }
    return {
      status: response.status,
      workflow_id: workflow.id || "",
      workflow_state: workflow.state,
      workflow_path: workflow.path || "",
      token_expiration: response.headers.get("github-authentication-token-expiration") || ""
    };
  });

  await check("public_callback", async () => {
    if (!config.callbackUrl) throw new Error("MPT_CALLBACK_URL is missing");
    if (!config.callbackToken) throw new Error("MPT_CALLBACK_TOKEN is missing");
    const response = await fetchImpl(config.callbackUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.callbackToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    });
    if (response.status !== 400) {
      const body = await response.text().catch(() => "");
      throw new Error(`callback check expected 400, got ${response.status} ${body}`.trim());
    }
    return { status: response.status, url: config.callbackUrl };
  });

  await check("auto_publish", () => {
    requireReadableFile(path.join(config.autoPublishDir, "package.json"));
    requireReadableFile(
      path.join(config.autoPublishDir, "scripts", "toutiao_publish_video.mjs")
    );
    requireReadableDirectory(
      path.join(config.autoPublishDir, ".browser-data", "toutiao", "Default")
    );
    requireWritableDirectory(path.join(config.autoPublishDir, "resources"));
    return { path: config.autoPublishDir };
  });

  await check("system_disk", () => {
    const stats = fs.statfsSync(config.workdir);
    const availableBytes = stats.bavail * stats.bsize;
    if (availableBytes < minimumFreeBytes) {
      throw new Error(`system disk free space is too low: ${availableBytes} bytes`);
    }
    return { available_bytes: availableBytes };
  });

  return {
    ok: checks.every((item) => item.ok),
    checked_at: new Date().toISOString(),
    checks
  };
}

function requireReadableFile(file) {
  fs.accessSync(file, fs.constants.R_OK);
  if (!fs.statSync(file).isFile()) throw new Error(`not a file: ${file}`);
}

function requireReadableDirectory(dir) {
  fs.accessSync(dir, fs.constants.R_OK);
  if (!fs.statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`);
}

function requireWritableDirectory(dir) {
  fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
  if (!fs.statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`);
}
