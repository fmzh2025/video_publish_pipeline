import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export async function downloadArtifactZip({
  owner,
  repo,
  artifactId,
  token,
  outputPath,
  fetchImpl = fetch,
  curlBin = "curl",
  connectTimeoutSeconds = "30",
  maxTimeSeconds = "7200",
  progressIntervalMs = 5000,
  onProgress
}) {
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to download artifact");
  }
  if (!artifactId) {
    throw new Error("artifact_id is required to download artifact");
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`;
  const downloadUrl = await resolveArtifactDownloadUrl({ url, token, fetchImpl });
  const partPath = `${outputPath}.part`;
  const headerPath = `${outputPath}.headers`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.rmSync(partPath, { force: true });
  fs.rmSync(headerPath, { force: true });

  await runCurlDownload({
    curlBin,
    downloadUrl,
    outputPath: partPath,
    headerPath,
    connectTimeoutSeconds,
    maxTimeSeconds,
    progressIntervalMs,
    onProgress
  });

  const bytes = fs.statSync(partPath).size;
  fs.renameSync(partPath, outputPath);
  fs.rmSync(headerPath, { force: true });

  return {
    path: outputPath,
    bytes,
    url,
    downloadUrl
  };
}

async function resolveArtifactDownloadUrl({ url, token, fetchImpl }) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "video-publish-pipeline"
    },
    redirect: "manual"
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    if (!location) {
      throw new Error("failed to resolve GitHub artifact download URL: missing redirect location");
    }
    return location;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `failed to resolve GitHub artifact download URL: ${response.status} ${response.statusText} ${body}`.trim()
    );
  }

  throw new Error("GitHub artifact download did not return a redirect URL");
}

function runCurlDownload({
  curlBin,
  downloadUrl,
  outputPath,
  headerPath,
  connectTimeoutSeconds,
  maxTimeSeconds,
  progressIntervalMs,
  onProgress,
  spawnImpl = spawn
}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let lastBytes = 0;
    let lastAt = start;
    let lastProgress = null;

    const report = () => {
      const downloadedBytes = fileSize(outputPath);
      const now = Date.now();
      const elapsedMs = now - start;
      const deltaMs = now - lastAt;
      const deltaBytes = downloadedBytes - lastBytes;
      const totalBytes = readLatestContentLength(headerPath);
      lastBytes = downloadedBytes;
      lastAt = now;
      lastProgress = {
        partPath: outputPath,
        downloadedBytes,
        totalBytes,
        elapsedMs,
        speedBytesPerSecond:
          deltaMs > 0 && deltaBytes >= 0 ? Math.round((deltaBytes * 1000) / deltaMs) : 0
      };
      if (typeof onProgress === "function") {
        onProgress(lastProgress);
      }
    };

    const child = spawnImpl(
      curlBin,
      [
        "--fail",
        "--location",
        "--show-error",
        "--silent",
        "--connect-timeout",
        String(connectTimeoutSeconds),
        "--max-time",
        String(maxTimeSeconds),
        "--dump-header",
        headerPath,
        "--output",
        outputPath,
        "--write-out",
        "\n{\"http_code\":%{http_code},\"size_download\":%{size_download},\"time_total\":%{time_total},\"speed_download\":%{speed_download}}\n",
        downloadUrl
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env
      }
    );

    const interval = setInterval(report, Number(progressIntervalMs) || 5000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearInterval(interval);
      reject(error);
    });
    child.on("close", (code) => {
      clearInterval(interval);
      report();
      if (code === 0) {
        resolve({
          stdout,
          stderr,
          progress: lastProgress
        });
        return;
      }
      const error = new Error(`curl artifact download failed with exit code ${code}`);
      error.result = { code, stdout, stderr };
      reject(error);
    });
  });
}

function fileSize(file) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function readLatestContentLength(headerPath) {
  if (!fs.existsSync(headerPath)) return "";
  const headers = fs.readFileSync(headerPath, "utf8");
  const matches = [...headers.matchAll(/^content-length:\s*(\d+)\s*$/gim)];
  if (matches.length === 0) return "";
  return Number(matches[matches.length - 1][1]);
}
