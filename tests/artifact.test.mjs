import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { extractArtifactZip, findFinalVideo } from "../src/artifact.mjs";
import { extractZip } from "../src/zip.mjs";
import { makeTempDir, writeZip } from "./helpers.mjs";

test("extracts artifact zip and finds storage/tasks final-1.mp4", () => {
  const root = makeTempDir();
  const zipPath = path.join(root, "artifact.zip");
  const outputDir = path.join(root, "artifact");
  writeZip(zipPath, [
    {
      name: "storage/tasks/task-1/final-2.mp4",
      data: "wrong"
    },
    {
      name: "storage/tasks/task-1/final-1.mp4",
      data: "video"
    }
  ]);

  extractArtifactZip({ zipPath, outputDir });
  const finalVideo = findFinalVideo(outputDir);
  assert.equal(finalVideo, path.join(outputDir, "storage/tasks/task-1/final-1.mp4"));
  assert.equal(fs.readFileSync(finalVideo, "utf8"), "video");
});

test("rejects unsafe zip entry paths", () => {
  const root = makeTempDir();
  const zipPath = path.join(root, "unsafe.zip");
  writeZip(zipPath, [{ name: "../escape.txt", data: "bad", method: 0 }]);

  assert.throws(() => extractZip(zipPath, path.join(root, "out")), /unsafe ZIP entry path/);
});
