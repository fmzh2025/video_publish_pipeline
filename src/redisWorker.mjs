import {
  pollUpstashStreamOnce,
  xackUpstashStream
} from "./redisRest.mjs";

export async function runRedisWorkerOnce({
  config,
  handler,
  fetchImpl = fetch,
  count = 1
}) {
  const entries = await pollUpstashStreamOnce({
    restUrl: config.upstashRedisRestUrl,
    token: config.upstashRedisRestToken,
    streamKey: config.streamKey,
    group: config.consumerGroup,
    consumer: config.consumerName,
    count,
    fetchImpl
  });

  const results = [];
  for (const entry of entries) {
    const result = await handler(entry.event);
    await xackUpstashStream({
      restUrl: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
      streamKey: entry.streamKey || config.streamKey,
      group: config.consumerGroup,
      id: entry.id,
      fetchImpl
    });
    results.push({ id: entry.id, result });
  }
  return results;
}
