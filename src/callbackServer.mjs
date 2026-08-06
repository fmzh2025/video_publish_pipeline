import http from "node:http";
import { validateWorkflowCompletedEvent, EventValidationError } from "./events.mjs";
import { InMemoryJobQueue } from "./jobQueue.mjs";

export function createCallbackServer({ config, handler, jobQueue } = {}) {
  if (!config) throw new Error("callback server config is required");
  const queue =
    jobQueue ||
    new InMemoryJobQueue({
      handler
    });

  const server = http.createServer(async (request, response) => {
    const result = await handleCallbackRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: () => readRequestBody(request),
      config,
      queue
    });
    sendJson(response, result.statusCode, result.body);
  });

  server.jobQueue = queue;
  return server;
}

export async function handleCallbackRequest({
  method,
  url,
  headers,
  body,
  config,
  queue
}) {
  try {
    if (method !== "POST" || String(url || "").split("?")[0] !== config.callbackPath) {
      return { statusCode: 404, body: { ok: false, error: "not_found" } };
    }

    const authorization = headers.authorization || headers.Authorization || "";
    const expected = `Bearer ${config.callbackToken}`;
    if (!config.callbackToken || authorization !== expected) {
      return { statusCode: 401, body: { ok: false, error: "unauthorized" } };
    }

    const rawBody = typeof body === "function" ? await body() : body;
    const event = validateWorkflowCompletedEvent(JSON.parse(rawBody));
    queue.enqueue(event);
    return {
      statusCode: 202,
      body: {
        ok: true,
        status: "accepted",
        request_id: event.request_id
      }
    };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof EventValidationError) {
      return {
        statusCode: 400,
        body: {
          ok: false,
          error: "invalid_event",
          message: error.message,
          details: error.details || undefined
        }
      };
    }

    return {
      statusCode: 500,
      body: {
        ok: false,
        error: "internal_error"
      }
    };
  }
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function readRequestBody(request, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        reject(new Error("request body too large"));
        request.destroy();
        return;
      }
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
