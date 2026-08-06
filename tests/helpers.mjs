import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

export function makeTempDir(prefix = "video-publish-pipeline-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function sampleEvent(overrides = {}) {
  return {
    event_type: "mpt.video.workflow.completed",
    request_id: "req-test-001",
    repository: "fmzh2025/MoneyPrinterTurbo",
    workflow: "generate-video.yml",
    run_id: "123456789",
    run_attempt: "1",
    run_url: "https://github.com/fmzh2025/MoneyPrinterTurbo/actions/runs/123456789",
    status: "success",
    conclusion: "success",
    artifact_id: "123456",
    artifact_name: "generated-video-123456789",
    artifact_digest:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    head_sha: "0000000000000000000000000000000000000000",
    video_subject: "人工智能如何改变普通人的日常生活",
    video_count: "1",
    video_aspect: "9:16",
    created_at: "2026-08-05T00:00:00Z",
    ...overrides
  };
}

export function writeZip(file, entries) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, createZip(entries));
}

export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || "");
    const method = entry.method ?? 8;
    const compressed = method === 0 ? raw : zlib.deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralBuffer, eocd]);
}

export function testConfig(root) {
  return {
    githubToken: "github-token",
    workdir: path.join(root, "workdir"),
    logsDir: path.join(root, "logs"),
    autoPublishDir: path.join(root, "auto_publish"),
    toutiaoPublish: true,
    toutiaoWaitLoginMs: "300000",
    toutiaoUploadTimeoutMs: "1800000",
    toutiaoProcessTimeoutMs: "1800000",
    toutiaoKeepOpen: "false"
  };
}
