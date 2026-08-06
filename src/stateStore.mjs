import fs from "node:fs";
import path from "node:path";

export class LocalStateStore {
  constructor({ logsDir, workdir }) {
    this.logsDir = logsDir;
    this.workdir = workdir;
  }

  async update(requestId, patch) {
    const safeRequestId = sanitizeFilePart(requestId || "unknown");
    fs.mkdirSync(this.logsDir, { recursive: true });
    fs.mkdirSync(this.workdir, { recursive: true });

    const statusPath = path.join(this.workdir, `${safeRequestId}.status.json`);
    const existing = readJsonIfExists(statusPath);
    const next = {
      ...existing,
      ...patch,
      request_id: requestId,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(statusPath, JSON.stringify(next, null, 2));

    const logPath = path.join(this.logsDir, `${safeRequestId}.log`);
    fs.appendFileSync(logPath, `${JSON.stringify(next)}\n`);
    return next;
  }
}

export function sanitizeFilePart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 128);
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
