import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.mjs";

test("uses 32199 as the default callback port", () => {
  const config = loadConfig({});
  assert.equal(config.callbackHost, "0.0.0.0");
  assert.equal(config.callbackPort, 32199);
  assert.equal(config.callbackPath, "/api/mpt/video/workflow-callback");
});
