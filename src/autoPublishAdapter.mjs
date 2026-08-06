import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function slugifyTitle(title) {
  return (
    String(title || "")
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "toutiao-video"
  );
}

export function timestampForDirectory(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function prepareAutoPublishResource({
  autoPublishDir,
  event,
  finalVideoPath,
  date = new Date()
}) {
  const title = event.video_subject;
  const dirName = `${timestampForDirectory(date)}_${slugifyTitle(title)}`;
  const resourceDir = path.join(autoPublishDir, "resources", dirName);
  fs.mkdirSync(resourceDir, { recursive: true });

  const videoFile = path.join(resourceDir, "video.mp4");
  const descriptionFile = path.join(resourceDir, "description.txt");
  const metadataFile = path.join(resourceDir, "metadata.json");
  const sourceFile = path.join(resourceDir, "source.json");

  fs.copyFileSync(finalVideoPath, videoFile);
  fs.writeFileSync(descriptionFile, `${title}\n`);
  fs.writeFileSync(sourceFile, JSON.stringify(event, null, 2));
  fs.writeFileSync(
    metadataFile,
    JSON.stringify(
      {
        platform: "toutiao",
        content_type: "video",
        workflow: "mpt_github_action_video",
        request_id: event.request_id,
        title,
        video_file: videoFile,
        description_file: descriptionFile,
        github_repository: event.repository,
        github_run_id: event.run_id,
        github_run_url: event.run_url,
        artifact_id: event.artifact_id,
        artifact_name: event.artifact_name,
        status: "created",
        created_at: new Date().toISOString()
      },
      null,
      2
    )
  );

  return {
    resourceDir,
    videoFile,
    descriptionFile,
    metadataFile,
    sourceFile,
    title
  };
}

function findCoverFile(resource) {
  if (resource.coverFile && fs.existsSync(resource.coverFile)) return resource.coverFile;

  const candidates = ["cover.jpg", "cover.jpeg", "cover.png", "cover.webp"].map((file) =>
    path.join(resource.resourceDir, file)
  );
  return candidates.find((file) => fs.existsSync(file)) || null;
}

export function buildToutiaoPublishCommand({ config, resource }) {
  const args = [
    "run",
    "toutiao:video",
    "--",
    "--title",
    resource.title,
    "--video-file",
    resource.videoFile,
    "--description-file",
    resource.descriptionFile,
    "--waitLogin",
    String(config.toutiaoWaitLoginMs),
    "--uploadTimeout",
    String(config.toutiaoUploadTimeoutMs),
    "--processTimeout",
    String(config.toutiaoProcessTimeoutMs),
    "--keepOpen",
    String(config.toutiaoKeepOpen)
  ];

  const coverFile = findCoverFile(resource);
  if (coverFile) {
    args.push("--cover-file", coverFile);
  }

  if (config.toutiaoPublish !== false) {
    args.push("--publish");
  }

  return {
    command: "npm",
    args,
    cwd: config.autoPublishDir
  };
}

export async function runToutiaoPublish({ config, resource, runner = runCommand }) {
  const command = buildToutiaoPublishCommand({ config, resource });
  const result = await runner(command);
  const parsed = parseLastJsonObject(result.stdout);
  return {
    ...result,
    command,
    parsed
  };
}

export function runCommand({ command, args, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) {
        resolve(result);
      } else {
        const error = new Error(`command failed: ${command} ${args.join(" ")}`);
        error.result = result;
        reject(error);
      }
    });
  });
}

export function parseLastJsonObject(output) {
  const candidates = extractBalancedJsonObjects(String(output || ""));
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(candidates[index]);
    } catch {
      // Continue looking for an earlier JSON object.
    }
  }
  return null;
}

function extractBalancedJsonObjects(text) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return objects;
}
