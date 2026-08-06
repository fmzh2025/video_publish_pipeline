import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { makeTempDir } from "./helpers.mjs";

test("deploy-home-runtime creates a self-contained app copy and removes stale source files", () => {
  const root = makeTempDir();
  const source = path.join(root, "source");
  const target = path.join(root, "target");
  fs.mkdirSync(path.join(source, "src", "cli"), { recursive: true });
  fs.mkdirSync(path.join(target, "src"), { recursive: true });
  fs.writeFileSync(path.join(source, "package.json"), '{"type":"module"}');
  fs.writeFileSync(path.join(source, "src", "cli", "callback-server.mjs"), "export {};");
  fs.writeFileSync(path.join(target, "src", "stale.mjs"), "stale");

  execFileSync("/bin/bash", [
    path.resolve("scripts/deploy-home-runtime.sh"),
    source,
    target
  ]);

  assert.equal(fs.existsSync(path.join(target, "src", "stale.mjs")), false);
  assert.equal(
    fs.readFileSync(path.join(target, "src", "cli", "callback-server.mjs"), "utf8"),
    "export {};"
  );
  assert.equal(fs.readFileSync(path.join(target, "package.json"), "utf8"), '{"type":"module"}');
});
