#!/usr/bin/env node
import { createCallbackServer } from "../callbackServer.mjs";
import { loadConfig } from "../config.mjs";
import { handleWorkflowCompletedEvent } from "../processor.mjs";

const config = loadConfig();
const server = createCallbackServer({
  config,
  handler: (event) => handleWorkflowCompletedEvent(event, { config })
});

server.listen(config.callbackPort, config.callbackHost, () => {
  console.log(
    JSON.stringify({
      ok: true,
      status: "listening",
      host: config.callbackHost,
      port: config.callbackPort,
      path: config.callbackPath
    })
  );
});
