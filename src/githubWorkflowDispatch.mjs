import crypto from "node:crypto";

export function buildWorkflowDispatchInputs(input = {}) {
  const requestId = input.request_id || crypto.randomUUID();
  return {
    request_id: requestId,
    video_subject: input.video_subject || "",
    video_script: input.video_script || "",
    llm_provider: input.llm_provider || "moonshot",
    video_source: input.video_source || "pexels",
    video_materials: input.video_materials || "",
    video_terms: input.video_terms || "",
    video_language: input.video_language || "zh-CN",
    video_aspect: input.video_aspect || "9:16",
    video_count: String(input.video_count || "1"),
    voice_name: input.voice_name || "zh-CN-XiaoxiaoNeural-Female",
    bgm_type: input.bgm_type || "random",
    subtitle_enabled:
      typeof input.subtitle_enabled === "boolean" ? input.subtitle_enabled : true,
    stop_at: input.stop_at || "video"
  };
}

export async function dispatchWorkflow({
  owner,
  repo,
  workflow,
  ref,
  token,
  inputs,
  fetchImpl = fetch
}) {
  if (!token) throw new Error("GITHUB_TOKEN is required to dispatch workflow");
  if (!inputs?.video_subject && !inputs?.video_script) {
    throw new Error("video_subject or video_script is required");
  }

  const dispatchInputs = buildWorkflowDispatchInputs(inputs);
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(
    workflow
  )}/dispatches`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "video-publish-pipeline"
    },
    body: JSON.stringify({
      ref,
      inputs: dispatchInputs
    })
  });

  if (response.status !== 204) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `failed to dispatch workflow: ${response.status} ${response.statusText} ${body}`.trim()
    );
  }

  return {
    ok: true,
    status: "dispatched",
    request_id: dispatchInputs.request_id,
    repository: `${owner}/${repo}`,
    workflow,
    ref,
    inputs: dispatchInputs
  };
}
