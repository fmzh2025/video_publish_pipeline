#!/usr/bin/env node
import fs from "node:fs";
import { loadConfig } from "../config.mjs";
import { handleWorkflowCompletedEvent } from "../processor.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node src/cli/process-event.mjs <event.json>");
  process.exit(2);
}

const config = loadConfig();
const payload = JSON.parse(fs.readFileSync(file, "utf8"));
const event = payload.event || payload;
const result = await handleWorkflowCompletedEvent(event, { config });
console.log(JSON.stringify(result, null, 2));
