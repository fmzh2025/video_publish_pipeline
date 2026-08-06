import { normalizeRedisStreamFields, validateWorkflowCompletedEvent } from "./events.mjs";

export async function upstashPipeline({
  restUrl,
  token,
  commands,
  fetchImpl = fetch
}) {
  if (!restUrl) throw new Error("UPSTASH_REDIS_REST_URL is required");
  if (!token) throw new Error("UPSTASH_REDIS_REST_TOKEN is required");

  const response = await fetchImpl(`${restUrl.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Upstash REST request failed: ${response.status} ${body}`.trim());
  }
  return response.json();
}

export async function xaddWorkflowCompletedEvent({
  restUrl,
  token,
  streamKey,
  event,
  fetchImpl = fetch
}) {
  const validated = validateWorkflowCompletedEvent(event);
  const command = ["XADD", streamKey, "*"];
  for (const [key, value] of Object.entries(validated)) {
    command.push(key, value == null ? "" : String(value));
  }
  return upstashPipeline({
    restUrl,
    token,
    commands: [command],
    fetchImpl
  });
}

export function parseXreadgroupResponse(response) {
  const result = Array.isArray(response)
    ? response[0]?.result ?? response[0]
    : response?.result ?? response;

  if (!Array.isArray(result)) return [];
  const events = [];
  for (const stream of result) {
    const streamKey = stream?.[0];
    const entries = stream?.[1] || [];
    for (const entry of entries) {
      events.push({
        streamKey,
        id: entry[0],
        event: normalizeRedisStreamFields(entry[1])
      });
    }
  }
  return events;
}

export async function pollUpstashStreamOnce({
  restUrl,
  token,
  streamKey,
  group,
  consumer,
  count = 1,
  fetchImpl = fetch
}) {
  const response = await upstashPipeline({
    restUrl,
    token,
    commands: [
      ["XREADGROUP", "GROUP", group, consumer, "COUNT", String(count), "STREAMS", streamKey, ">"]
    ],
    fetchImpl
  });
  return parseXreadgroupResponse(response);
}

export async function xackUpstashStream({
  restUrl,
  token,
  streamKey,
  group,
  id,
  fetchImpl = fetch
}) {
  return upstashPipeline({
    restUrl,
    token,
    commands: [["XACK", streamKey, group, id]],
    fetchImpl
  });
}
