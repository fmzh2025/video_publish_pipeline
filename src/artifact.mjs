import fs from "node:fs";
import path from "node:path";
import { extractZip } from "./zip.mjs";

export function extractArtifactZip({ zipPath, outputDir }) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return extractZip(zipPath, outputDir);
}

export function findFinalVideo(extractDir) {
  const matches = [];
  walk(extractDir, (file) => {
    const normalized = file.replaceAll(path.sep, "/");
    if (/\/storage\/tasks\/.*\/final-1\.mp4$/.test(normalized)) {
      matches.push(file);
    }
  });

  matches.sort();
  if (matches.length === 0) {
    throw new Error("final-1.mp4 not found in artifact");
  }
  return matches[0];
}

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
    } else if (entry.isFile()) {
      visit(fullPath);
    }
  }
}
