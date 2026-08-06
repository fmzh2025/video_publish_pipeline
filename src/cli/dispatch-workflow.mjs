#!/usr/bin/env node
import fs from "node:fs";
import { loadConfig } from "../config.mjs";
import { dispatchWorkflow } from "../githubWorkflowDispatch.mjs";

const args = parseArgs(process.argv.slice(2));
const config = loadConfig();
const input = args.input
  ? JSON.parse(fs.readFileSync(args.input, "utf8"))
  : JSON.parse(await readStdin());

const result = await dispatchWorkflow({
  owner: config.githubOwner,
  repo: config.githubRepo,
  workflow: config.githubWorkflow,
  ref: config.githubRef,
  token: config.githubToken,
  inputs: input
});

console.log(JSON.stringify(result, null, 2));

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input") {
      parsed.input = argv[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let body = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      body += chunk;
    });
    process.stdin.on("end", () => resolve(body));
    process.stdin.on("error", reject);
  });
}
