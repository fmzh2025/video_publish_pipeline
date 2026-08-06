#!/usr/bin/env node
import { loadConfig } from "../config.mjs";
import { runEveningPreflight } from "../preflight.mjs";

const result = await runEveningPreflight({ config: loadConfig() });
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
