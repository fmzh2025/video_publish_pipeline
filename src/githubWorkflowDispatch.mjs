import crypto from "node:crypto";

const MAX_WORKFLOW_DISPATCH_INPUTS = 10;

export function buildWorkflowDispatchInputs(input = {}) {
  const requestId = input.request_id || crypto.randomUUID();
  const inputs = {
    request_id: requestId,
    video_subject: input.video_subject || ""
  };

  setStringInput(inputs, "video_script", input.video_script);
  setStringInput(inputs, "video_terms", normalizeVideoTerms(input.video_terms));
  setStringInputIfChanged(inputs, "llm_provider", input.llm_provider, "moonshot");
  setStringInputIfChanged(inputs, "video_source", input.video_source, "pexels");
  setStringInput(inputs, "video_materials", input.video_materials);
  setStringInput(inputs, "video_language", input.video_language);
  setStringInputIfChanged(inputs, "video_aspect", input.video_aspect, "9:16");
  setStringInputIfChanged(inputs, "video_count", String(input.video_count || ""), "1");
  setStringInputIfChanged(
    inputs,
    "voice_name",
    input.voice_name,
    "zh-CN-XiaoxiaoNeural-Female"
  );
  setStringInputIfChanged(inputs, "bgm_type", input.bgm_type, "random");
  setBooleanInputIfChanged(inputs, "subtitle_enabled", input.subtitle_enabled, true);
  setStringInputIfChanged(inputs, "stop_at", input.stop_at, "video");
  setBooleanInputIfChanged(
    inputs,
    "match_materials_to_script",
    input.match_materials_to_script,
    false
  );

  const inputCount = Object.keys(inputs).length;
  if (inputCount > MAX_WORKFLOW_DISPATCH_INPUTS) {
    throw new Error(
      `workflow_dispatch inputs exceed GitHub limit: ${inputCount}/${MAX_WORKFLOW_DISPATCH_INPUTS}`
    );
  }

  return inputs;
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

function normalizeVideoTerms(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(",");
  }
  return value || "";
}

function setStringInput(inputs, key, value) {
  const normalized = String(value || "").trim();
  if (normalized) inputs[key] = normalized;
}

function setStringInputIfChanged(inputs, key, value, defaultValue) {
  const normalized = String(value || "").trim();
  if (normalized && normalized !== defaultValue) inputs[key] = normalized;
}

function setBooleanInputIfChanged(inputs, key, value, defaultValue) {
  if (typeof value !== "boolean") return;
  if (value !== defaultValue) inputs[key] = value;
}
